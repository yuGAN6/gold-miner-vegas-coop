const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert/strict');
const {spawn} = require('child_process');
const root = path.resolve(__dirname, '..');
const testMode=Number(process.env.VEGAS_TEST_MODE||1);
const results = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = http.createServer((req, res) => {
  let name = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if(req.url.startsWith('/native/')){
    const relative=new URL(req.url,'http://localhost').pathname.slice(8);
    if(relative==='index.html')name=path.join(root,'mod-work/app/vegas-page.html');
    else if(relative==='vegas-page.js')name=path.join(root,'mod-work/app/vegas-page.js');
    else if(relative==='gmvegas_main.swf')name=path.join(root,'mod-work/test.swf');
    else name=path.join(root,'mod-work/vegas',relative.startsWith('data/')?'GoldMinerVegas/'+relative.slice(5):relative);
  }
  if (!name.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  const types = {'.js':'text/javascript','.html':'text/html','.wasm':'application/wasm','.swf':'application/x-shockwave-flash'};
  res.setHeader('Content-Type', types[path.extname(name)] || 'application/octet-stream');
  if(req.url.endsWith('game-page.js?isolation-legacy=1')){
    // Enable the original mouse-to-key option without changing its handlers.
    const source=fs.readFileSync(name,'utf8');
    assert.ok(source.includes('let t6=0x0,t7=![];'));
    res.end(source.replace('let t6=0x0,t7=![];','let t6=0x0,t7=!![];'));
    return;
  }
  fs.createReadStream(name).on('error', () => res.writeHead(404).end()).pipe(res);
});
let browser, socket, sequence = 0;
const pending = new Map();
async function cdp(method, params = {}) {
  if(!socket || socket.readyState!==WebSocket.OPEN) throw Error('Browser connection is not open');
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer=setTimeout(() => {pending.delete(id);reject(Error('CDP timed out: '+method));},15000);
    pending.set(id, {resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
    socket.send(JSON.stringify({id, method, params}));
  });
}
async function js(expression) {
  const result = await cdp('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true});
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function openBrowser(width,height) {
  browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
    '--user-data-dir=' + path.join(root, 'mod-work/mouse-test-profile-'+process.pid+'-'+Date.now()), 'about:blank'
  ], {stdio:['ignore','ignore','pipe'],windowsHide:true});
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Edge startup timed out')), 15000);
    browser.stderr.on('data', data => {
      const match = data.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(new URL(match[1])); }
    });
    browser.once('exit', code => { clearTimeout(timer); reject(Error('Edge exited: '+code)); });
  });
  const pages = await fetch(`http://${endpoint.host}/json/list`).then(r => r.json());
  socket = new WebSocket(pages.find(page => page.type === 'page' && page.url==='about:blank').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open',resolve,{once:true}));
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if(message.method==='Runtime.exceptionThrown')console.log('BROWSER ERROR',JSON.stringify(message.params));
    const request = pending.get(message.id);
    if (request) {
      pending.delete(message.id);
      if (message.error) request.reject(Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    }
  });
  socket.addEventListener('close', () => {
    for(const request of pending.values()) request.reject(Error('Browser connection closed'));
    pending.clear();
  });
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
}
async function closeBrowser() {
  if(socket?.readyState===WebSocket.OPEN) await cdp('Browser.close').catch(()=>{});
  if(socket)socket.close();
  socket=null;
  if(browser)browser.kill();
  browser=null;
}
async function call(name,...args){if(name==='gmTest'&&(args[0]==='start'||args[0]==='enterFrame'))args[2]=testMode;return js(`document.querySelector('ruffle-player').ruffle().callExternalInterface(${JSON.stringify(name)},${args.map(x=>JSON.stringify(x)).join(',')})`);}
async function sample(n=1){return (await call('gmTest','sample',n)).split('|').map(Number);}
async function until(fn,label,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await wait(50);}throw Error('Timed out: '+label);}
async function key(code,keyCode,down){await cdp('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:code.startsWith('Key')?code.slice(3).toLowerCase():code,windowsVirtualKeyCode:keyCode,nativeVirtualKeyCode:keyCode});}
async function settings(out,back){await js(`(()=>{for(const [k,v] of Object.entries({mouse:true,out:${out},back:${back}})){const e=document.querySelector('#gm-mod input[data-key='+k+']');e.checked=v;e.dispatchEvent(new Event('change',{bubbles:true}));}})()`);}
async function mouse(button,x,y){const pt=await js(`(()=>{const r=document.querySelector('ruffle-player').getBoundingClientRect(),s=Math.min(r.width/800,r.height/600);return {x:r.left+(r.width-800*s)/2+${x}*s,y:r.top+(r.height-600*s)/2+${y}*s}})()`);await cdp('Input.dispatchMouseEvent',{type:'mousePressed',...pt,button,clickCount:1});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',...pt,button,clickCount:1});}
(async()=>{
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    await openBrowser(1000,750);
    await cdp('Runtime.enable');
    await cdp('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/native/index.html`});
    await until(async()=>{try{return await call('gmTest','loaded',1)>=512;}catch{return false;}},'movie loaded');
    await until(async()=>await js("document.querySelector('#gm-mod-status')?.textContent.startsWith('Ready')"),'English modifier panel connects');
    assert.equal(await js("document.querySelector('#gm-mod button').textContent"),'Mod Tools ▾');
    await settings(true,false);
    await js("document.querySelector('#gm-mod button').click();history.replaceState(null,'','?lang=zh');window.dispatchEvent(new PopStateEvent('popstate'))");
    assert.equal(await js("document.querySelector('#gm-mod button').textContent"),'修改工具 ▾');
    assert.equal(await js("document.querySelector('#gm-mod [data-text=mouse]').textContent"),'鼠标定向抓取');
    assert.equal(await js("document.querySelector('#gm-mod-status').textContent"),'已启用 · 剧情战役／战役无尽');
    assert.deepEqual(await js("Array.from(document.querySelectorAll('#gm-mod input')).map(x=>x.checked)"),[true,true,false],'language change preserves switches');
    assert.equal(await js("document.querySelector('#gm-mod fieldset').hidden"),false,'language change preserves expanded panel');
    for(const language of ['en','fr','ja','de','unsupported']){
      await js(`history.replaceState(null,'','?lang=${language}');window.dispatchEvent(new PopStateEvent('popstate'))`);
      assert.equal(await js("document.querySelector('#gm-mod button').textContent"),'Mod Tools ▾',`${language} uses English`);
      assert.equal(await js("document.querySelector('#gm-mod [data-text=back]').textContent"),'Fast return (super strength)');
    }
    await js("history.replaceState(null,'','?lang=zh-CN')");
    await until(async()=>await js("document.querySelector('#gm-mod button').textContent==='修改工具 ▾'"),'language polling follows selected Chinese locale');
    await cdp('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/native/index.html?lang=zh`});
    await until(async()=>{try{return await call('gmTest','loaded',1)>=512;}catch{return false;}},'Chinese language entry loads movie');
    assert.equal(await js("document.querySelector('#gm-mod button').textContent"),'修改工具 ▾','fresh Chinese game entry uses Chinese');
    assert.deepEqual(await js("Array.from(document.querySelectorAll('#gm-mod input')).map(x=>x.checked)"),[true,true,false],'switches persist across language reload');
    await settings(false,false);
    console.log('LANGUAGE OK: EN, ZH, ENGLISH FALLBACK, SETTINGS PRESERVED');
    if(process.env.VEGAS_REPRO==='1'){
      await call('gmTest','start',1);await wait(300);await settings(false,false);
      await js("document.querySelector('ruffle-player').focus()");
      await call('gmMouseAim',2,600,500);await wait(120);
      console.log('PRIMARY BEFORE WASD RELAY',await sample(1));
      await key('KeyA',65,true);
      await js("window.dispatchEvent(new MessageEvent('message',{data:{type:'gmvegas-in',t:'key',code:'ArrowLeft',down:true,key:'ArrowLeft'}}))");
      await wait(120);
      console.log('PRIMARY AFTER WASD RELAY',await sample(1));
      return;
    }
    assert.equal(await call('gmTest','newStory',1),'0','new story initializes native bonuses');
    assert.equal(await call('gmTest','newEndless',1),'0','new endless game initializes native bonuses');
    await wait(250);
    await call('gmTest','start',1);
    await wait(180);
    assert.equal(await call('gmTest','mode',1),testMode,'test runs in the requested native mode');
    assert.equal(await call('gmTest','firstEntry',1),'60','undefined initial time bonus defaults to zero');
    assert.equal(await call('gmTest','timeBonus',1),'75','purchased time bonus is preserved');
    await call('gmTest','start',1);
    await wait(600);
    console.log('START',await sample(1),await sample(2),await call('gmTest','probe',1));
    assert.equal((await sample(2))[4],1,'second claw idle');
    assert.equal(await js("document.querySelectorAll('#gm-mod').length"),1,'panel injected from SWF in stock page');
    assert.equal(await call('gmMouseAim',0,650,450),true);
    assert.equal(await call('gmMouseAim',0,350,450),false,'duplicate shot ignored');
    await wait(150);
    console.log('SHOT',await sample(1),await sample(2));
    assert.equal((await sample(1))[4],1,'primary stays idle');
    assert.ok((await sample(2))[4]>1,'second launches');
    await until(async()=>(await sample(2))[4]===1,'second returns',15000);
    await call('gmTest','bonus',2,125);
    await until(async()=>(await sample())[8]===125,'shared score');
    console.log('SHARED SCORE OK');
    await call('gmTest','start',1);await wait(500);
    console.log('TARGET',await call('gmTest','target',1,280));
    await settings(true,true);
    assert.equal(await call('gmMouseAim',0,280,450),true);
    await until(async()=>(await sample())[8]>0,'second catches and cashes target',15000);
    console.log('TARGET CAPTURE',await sample(2));
    await until(async()=>(await sample(2))[4]===1,'ready after target');
    await call('gmTest','start',1);await wait(300);await settings(false,false);
    await js("document.querySelector('ruffle-player').focus()");
    const x=(await sample(2))[1];
    const firstX=(await sample(1))[1];
    await js("window.dispatchEvent(new MessageEvent('message',{data:{type:'gmvegas-in',t:'keyblock',codes:['ArrowLeft','ArrowRight','ArrowDown','ArrowUp']}}))");
    await key('KeyA',65,true);
    await js("window.dispatchEvent(new MessageEvent('message',{data:{type:'gmvegas-in',t:'key',code:'ArrowLeft',down:true,key:'ArrowLeft'}}))");
    await wait(250);await key('KeyA',65,false);
    await js("window.dispatchEvent(new MessageEvent('message',{data:{type:'gmvegas-in',t:'key',code:'ArrowLeft',down:false,key:'ArrowLeft'}}))");
    assert.ok((await sample(2))[1]<x,'A moves second cart');
    assert.equal((await sample(1))[1],firstX,'remapped WASD arrow does not move first cart');
    const secondX=(await sample(2))[1];
    await key('ArrowRight',39,true);await wait(200);await key('ArrowRight',39,false);
    assert.ok((await sample(1))[1]>firstX,'physical arrow moves first cart');
    assert.equal((await sample(2))[1],secondX,'physical arrow leaves second cart alone');
    await key('KeyS',83,true);await key('KeyS',83,false);await wait(150);
    assert.ok((await sample(2))[4]>1,'S launches second');
    assert.equal((await sample(1))[4],1,'S leaves first idle');
    await key('ArrowDown',40,true);await key('ArrowDown',40,false);await wait(150);
    assert.ok((await sample(1))[4]>1,'Down launches first');
    await wait(1500);
    assert.equal((await sample(1))[0],342,'ordinary operations do not end the level');
    const countdown=Number(await call('gmTest','timer',1));
    assert.ok(Number.isFinite(countdown)&&countdown>50,'countdown remains numeric after input');
    console.log('KEYBOARD OK');
    for(const fastOut of [false,true]){
      for(const [physical,virtual,keyCode] of [['KeyA','ArrowLeft',65],['KeyD','ArrowRight',68]]){
        await call('gmTest','start',1);await wait(180);await settings(fastOut,false);
        await js("document.querySelector('ruffle-player').focus()");
        assert.equal(await call('gmMouseAim',2,600,500),true);
        await wait(100);
        const before=await sample(1),partnerX=(await sample(2))[1];
        assert.ok(before[4]>=2&&before[4]<47,'primary outbound before simultaneous movement');
        await key(physical,keyCode,true);
        await js(`window.dispatchEvent(new MessageEvent('message',{data:{type:'gmvegas-in',t:'key',code:'${virtual}',down:true,key:'${virtual}'}}))`);
        await wait(120);
        const after=await sample(1),partner=await sample(2);
        assert.ok(after[4]>before[4]&&after[4]<49,`${physical} must not recall primary claw (fast=${fastOut}): ${before[4]} -> ${after[4]}`);
        assert.ok(Math.abs(after[5]-before[5])<0.01,'simultaneous movement preserves primary shot direction');
        assert.equal(after[1],before[1],'primary cart stays at its shot origin');
        assert.ok(physical==='KeyA'?partner[1]<partnerX:partner[1]>partnerX,'partner still moves while primary fires');
        await key(physical,keyCode,false);
        await js(`window.dispatchEvent(new MessageEvent('message',{data:{type:'gmvegas-in',t:'key',code:'${virtual}',down:false,key:'${virtual}'}}))`);
      }
    }
    console.log('SIMULTANEOUS MOVEMENT AND SHOTS OK: A/D, NORMAL/FAST HOOK');
    for(const [player,physical,keyCode,virtual] of [[2,'KeyA',65,'ArrowLeft'],[2,'KeyD',68,'ArrowRight'],[1,'ArrowLeft',37,'ArrowLeft'],[1,'ArrowRight',39,'ArrowRight']]){
      await call('gmTest','start',1);await wait(180);await settings(false,false);
      await js("document.querySelector('ruffle-player').focus()");
      await call('gmMouseAim',0,200,500);await call('gmMouseAim',2,600,500);await wait(120);
      const other=player===1?2:1,beforeOther=await sample(other);
      assert.ok((await sample(player))[4]>=2&&(await sample(player))[4]<47,'own claw outbound before recall');
      await key(physical,keyCode,true);
      await js(`window.dispatchEvent(new MessageEvent('message',{data:{type:'gmvegas-in',t:'key',code:'${virtual}',down:true,key:'${virtual}'}}))`);
      await wait(80);
      const own=await sample(player),afterOther=await sample(other);
      assert.ok(own[4]===1||own[4]>=49,`${physical} recalls own claw`);
      assert.ok(afterOther[4]>beforeOther[4]&&afterOther[4]<49,`${physical} leaves other claw outbound`);
      assert.ok(Math.abs(afterOther[5]-beforeOther[5])<0.01,'other claw keeps its direction during own recall');
      await key(physical,keyCode,false);
      await js(`window.dispatchEvent(new MessageEvent('message',{data:{type:'gmvegas-in',t:'key',code:'${virtual}',down:false,key:'${virtual}'}}))`);
    }
    console.log('INDEPENDENT EARLY RECALL OK: A/D AND LEFT/RIGHT');
    await call('gmTest','start',1);await wait(300);
    await mouse('left',200,450);await wait(150);
    assert.ok((await sample(2))[4]>1,'native left click launches second');
    assert.equal((await sample(1))[4],1,'native left click leaves first idle');
    await mouse('right',600,450);await wait(150);
    assert.ok((await sample(1))[4]>1,'native right click launches first');
    console.log('NATIVE MOUSE OK');
    // Bombs must affect cargo, including with accelerated return, rather than
    // merely decrementing the shared inventory while a throw animation vanishes.
    for(const back of [false,true]){
      for(const player of [1,2]){
        await call('gmTest','start',1);await wait(180);await settings(false,back);
        await call('gmTest','bombPrepare',player);
        await js("document.querySelector('ruffle-player').focus()");
        await key(player===2?'KeyW':'ArrowUp',player===2?87:38,true);
        await key(player===2?'KeyW':'ArrowUp',player===2?87:38,false);
        await until(async()=>{
          const p=(await call('gmTest','bombProbe',player)).split('|');
          return p[1]==='0'||(await sample(player))[4]===1;
        },`player ${player} bomb destroys cargo with fast return=${back}`,5000);
        await until(async()=>(await sample(player))[4]===1,`player ${player} returns after bomb`,5000);
        assert.equal((await call('gmTest','bombProbe',player)).split('|')[0],'4','one shared bomb consumed');
        assert.equal((await sample())[8],0,'bombed cargo awards no money');
      }
    }
    await call('gmTest','start',1);await wait(180);await settings(false,true);
    await call('gmTest','bombPrepare',2);
    const icon=(await call('gmTest','bombIconPoint',2)).split('|').map(Number);
    await mouse('left',...icon);
    await until(async()=>(await sample(2))[4]===1,'second-player bomb button destroys its cargo',5000);
    assert.equal((await call('gmTest','bombProbe',2)).split('|')[0],'4','second-player icon consumes one bomb');
    assert.equal((await sample())[8],0,'second-player icon bombs its own cargo');
    console.log('BOMBS OK: W, UP, SECOND-PLAYER BUTTON, FAST RETURN');
    await call('gmTest','start',1);await wait(180);
    await call('gmTest','enterFrame',368);await wait(180);await call('gmTest','float',1);
    await js("document.querySelector('ruffle-player').focus()");
    const floatA=(await sample(1))[1],floatB=(await sample(2))[1];
    await key('KeyA',65,true);await wait(200);await key('KeyA',65,false);
    assert.ok((await sample(2))[1]<floatB,'A moves second player swimming ring');
    assert.equal((await sample(1))[1],floatA,'second swimming ring movement is independent');
    const movedB=(await sample(2))[1];
    await key('ArrowRight',39,true);await wait(200);await key('ArrowRight',39,false);
    assert.ok((await sample(1))[1]>floatA,'arrow moves first player swimming ring');
    assert.equal((await sample(2))[1],movedB,'first swimming ring movement is independent');
    console.log('SWIMMING RINGS OK');
    await call('gmTest','start',1);await wait(300);await settings(false,false);
    await call('gmTest','return',2);const slow0=(await sample(2))[4];await wait(250);const slow=(await sample(2))[4]-slow0;
    await settings(false,true);await call('gmTest','return',2);const fast0=(await sample(2))[4];await wait(250);const fast=(await sample(2))[4]-fast0;
    assert.ok(fast>slow*3,`return speed ${slow}/${fast}`);
    console.log('RETURN SPEED',slow,fast);
    await call('gmTest','start',1);await wait(300);await settings(false,false);
    await call('gmMouseAim',0,280,500);await wait(250);const slowOut=(await sample(2))[4];
    await call('gmTest','start',1);await wait(300);await settings(true,false);
    await call('gmMouseAim',0,280,500);await wait(250);const fastOut=(await sample(2))[4];
    assert.ok(fastOut>slowOut*1.7,`outgoing speed ${slowOut}/${fastOut}`);
    console.log('OUTGOING SPEED',slowOut,fastOut);
    await call('gmTest','start',1);await wait(300);await settings(false,false);
    await call('gmTest','return',2);await call('gmTest','time',1,0);await wait(1600);
    assert.equal((await sample())[0],342,'timer waits for second claw');
    await settings(false,true);
    await until(async()=>(await sample())[0]!==342,'timer finishes after second payout',10000);
    if(testMode===2)assert.equal(await call('gmTest','progress',1),1,'native endless completion counter advances after shared payout');
    assert.equal(await call('gmMouseAim',0,200,400),false,'non-campaign screen ignores aim');
    console.log('TIMER AND SCENE OK',await call('gmTest','probe',1));
    // Exercise every mining frame through the same shop-to-level reconstruction
    // that used to remove the partner after the first layout.
    const campaignFrames=JSON.parse(fs.readFileSync(path.join(root,'mod-work/campaign-frames.json'),'utf8'));
    await call('gmTest','start',1);await wait(200);
    await call('gmTest','goto',1,343);await wait(200);
    assert.equal((await sample())[0],343,'L1-2 reached directly from L1-1');
    assert.equal(await call('gmMouseAim',0,200,450),true,'L1-2 partner can launch');
    for(const frame of campaignFrames){
      assert.equal(await call('gmTest','enterFrame',frame),true,`campaign frame ${frame}`);
      await wait(160);
      const a=await sample(1),b=await sample(2);
      assert.equal(a[0],frame,`frame ${frame} stays in level`);
      assert.equal(b[4],1,`frame ${frame}: second claw is present and idle`);
      assert.ok(Number.isFinite(a[1])&&Number.isFinite(b[1]),`frame ${frame}: both carts positioned`);
      assert.equal(await call('gmMouseAim',0,200,450),true,`frame ${frame}: left mouse works`);
      assert.equal(await call('gmMouseAim',2,600,450),true,`frame ${frame}: right mouse works`);
      if(frame===343||frame===368||frame===390)console.log('WORLD ENTRY OK',frame);
    }
    console.log('ALL CAMPAIGN SCENES OK',campaignFrames.length);
    await call('gmTest','start',1);await wait(300);
    await js("history.replaceState(null,'','?lang=en');window.dispatchEvent(new PopStateEvent('popstate'));document.querySelector('#gm-mod button').click()");
    const snap=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,testMode===2?'mod-work/preview-endless.png':'mod-work/preview.png'),Buffer.from(snap.data,'base64'));
    fs.writeFileSync(path.join(root,testMode===2?'mod-work/test-results-endless.json':'mod-work/test-results.json'),JSON.stringify({passed:true,mode:testMode,checks:['Chinese and English modifier labels follow game language; other locales use English; switches and expansion persist','new-story bonus initialization','undefined time bonus gives 60 seconds','purchased time bonus gives 75 seconds','SWF-injected panel in stock Vegas page','independent mouse aiming and busy lock','second-player shared score','accelerated capture','WASD and arrow keyboard controls','shell-remapped WASD arrows do not move first player','physical arrows do not move second player','input does not end level or corrupt countdown','A/D movement plus shell-forwarded arrows preserve other player outbound shot at normal and fast speeds','A/D and Left/Right independently recall only the corresponding claw','native left/right clicks','W and Up destroy cargo and consume exactly one shared bomb','bomb effect survives accelerated return','second-player bomb icon targets its own cargo','both swimming rings move independently','return speed toggle','outgoing speed toggle','timer waits for second payout','scene exit disables aim','direct first-to-second layout transition preserves co-op','all 55 campaign mining frames retain both players and mouse controls'],campaignFrames,slow,fast,slowOut,fastOut,countdown},null,2));
  }catch(e){console.error(e);process.exitCode=1;}
  finally{await closeBrowser();server.close();}
})();
