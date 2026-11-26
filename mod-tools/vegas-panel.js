(() => {
  'use strict';
  if(document.querySelector('#gm-mod'))return;
  const key='vegas-campaign-coop-v1';
  let settings={mouse:true,out:false,back:false};
  try { settings={...settings,...JSON.parse(localStorage.getItem(key)||'{}')}; } catch {}
  const style=document.createElement('style');
  style.textContent=`#gm-mod{position:fixed;right:12px;top:12px;z-index:2147483647;font:14px "Microsoft YaHei",sans-serif;color:#f9ecd1;user-select:none}#gm-mod button{background:#382617;color:#ffdc8a;border:1px solid #a98044;border-radius:7px;padding:8px 14px;cursor:pointer;font:inherit;float:right}#gm-mod fieldset{clear:both;background:rgba(28,21,15,.96);border:1px solid #a98044;border-radius:9px;padding:14px 16px;min-width:218px;margin-top:6px;box-shadow:0 6px 24px #0008}#gm-mod label{display:block;margin:9px 0;cursor:pointer}#gm-mod input{accent-color:#e9b64e;margin-right:9px}#gm-mod small{display:block;color:#d0b990;font-size:12px;line-height:1.8}#gm-mod [hidden]{display:none}`;
  document.head.append(style);
  const panel=document.createElement('section');panel.id='gm-mod';
  panel.innerHTML='<button type="button" aria-expanded="false">修改工具 ▾</button><fieldset hidden><label><input type="checkbox" data-key="mouse">鼠标定向抓取</label><label><input type="checkbox" data-key="out">快速出钩</label><label><input type="checkbox" data-key="back">加速回收（超级力量）</label><small>剧情战役／战役无尽双人<br>金额与炸药共享<br>WASD：左键玩家 · S 出钩 / W 炸药<br>方向键：右键玩家 · ↓ 出钩 / ↑ 炸药<br>A / D、← / →：移动／自己的钩子提前回收<br>加速开关同时作用于两人</small><small id="gm-mod-status">等待游戏加载…</small></fieldset>';
  document.body.append(panel);
  const button=panel.querySelector('button'),body=panel.querySelector('fieldset');
  button.onclick=()=>{body.hidden=!body.hidden;button.setAttribute('aria-expanded',String(!body.hidden));};
  function apply(){
    window.dispatchEvent(new MessageEvent('message',{data:{type:'gmvegas-in',t:'clickfire',on:false}}));
    const p=document.querySelector('ruffle-player');
    try {if(p?.ruffle().callExternalInterface('gmSetModifiers',settings.mouse,settings.out,settings.back)===true){
      panel.querySelector('#gm-mod-status').textContent='已启用 · 剧情战役／战役无尽';return true;
    }} catch {}
    return false;
  }
  for(const el of panel.querySelectorAll('input')){
    el.checked=!!settings[el.dataset.key];
    el.onchange=()=>{settings[el.dataset.key]=el.checked;try{localStorage.setItem(key,JSON.stringify(settings));}catch{}apply();};
  }
  setInterval(apply,1000);
  // The original shell forwards WASD as synthetic arrows. Only trusted physical
  // keys belong to the two-player controls; forwarded keys remain separate.
  const keyCodes={KeyA:65,KeyD:68,KeyW:87,KeyS:83,ArrowLeft:37,ArrowRight:39,ArrowUp:38,ArrowDown:40};
  function physicalKey(event){
    if(!event.isTrusted||panel.contains(event.target)||!keyCodes[event.code])return;
    try{if(document.querySelector('ruffle-player')?.ruffle().callExternalInterface('gmPhysicalKey',keyCodes[event.code],event.type==='keydown')===true){event.preventDefault();event.stopImmediatePropagation();}}catch{}
  }
  window.addEventListener('keydown',physicalKey,true);
  window.addEventListener('keyup',physicalKey,true);
  function release(){try{document.querySelector('ruffle-player')?.ruffle().callExternalInterface('gmReleaseKeys');}catch{}}
  window.addEventListener('blur',release);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
  function resetNativeInput(){
    window.dispatchEvent(new MessageEvent('message',{data:{type:'gmvegas-in',t:'keyblock',codes:[]}}));
    window.dispatchEvent(new MessageEvent('message',{data:{type:'gmvegas-in',t:'clickfire',on:false}}));
  }
  // Keep the native capture listener from swallowing physical arrows first.
  window.addEventListener('message',event=>{
    const d=event.data;
    if(d?.type==='gmvegas-in'&&((d.t==='keyblock'&&d.codes?.length)||(d.t==='clickfire'&&d.on)))resetNativeInput();
  });
  resetNativeInput();
  // Install before the original page's global pointer handlers.
  window.addEventListener('pointerdown',event=>{
    if(panel.contains(event.target)){event.stopImmediatePropagation();return;}
    if(event.button!==0&&event.button!==2)return;
    const p=document.querySelector('ruffle-player');
    if(!p||!event.composedPath().includes(p))return;
    const r=p.getBoundingClientRect(),s=Math.min(r.width/800,r.height/600);
    const x=(event.clientX-r.left-(r.width-800*s)/2)/s,y=(event.clientY-r.top-(r.height-600*s)/2)/s;
    if(x<0||x>=800||y<0||y>=600)return;
    try{if(p.ruffle().callExternalInterface('gmMouseAim',event.button,x,y)===true){event.preventDefault();event.stopImmediatePropagation();p.focus();}}catch{}
  },true);
  window.addEventListener('contextmenu',e=>{if(e.composedPath().some(x=>x?.tagName==='RUFFLE-PLAYER')){e.preventDefault();e.stopImmediatePropagation();}},true);
  for(const type of ['pointerup','mousedown','mouseup','click','keydown','keyup'])panel.addEventListener(type,e=>e.stopPropagation());
})();
