"""Build a reproducible Vegas Campaign co-op movie from the unmodified resource pack."""
import copy
import json
import os
import pathlib
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent.parent
WORK = ROOT / 'mod-work'
VENDOR = ROOT.parent / 'Gold MinerClassic Edition/mod-tools/vendor'
JAVA = pathlib.Path(os.environ.get('VEGAS_JAVA') or next((VENDOR / 'java').rglob('java.exe'),None) or shutil.which('java') or 'java')
FFDEC = pathlib.Path(os.environ.get('FFDEC_JAR') or VENDOR / 'ffdec/ffdec.jar')

def ffdec(*args):
    r = subprocess.run([str(JAVA),'-Djava.awt.headless=true','-jar',str(FFDEC),*map(str,args)],capture_output=True,encoding='utf8',errors='replace')
    (WORK/'build.log').open('a',encoding='utf8').write(r.stdout+r.stderr)
    if r.returncode or re.search(r'(?m)^(FAIL|Error:|SEVERE:)',r.stdout+r.stderr):
        raise RuntimeError((r.stdout+r.stderr)[-4000:])

def main():
    src = WORK/'vegas-scripts/scripts'
    dst = WORK/'edits/scripts'
    def write(rel,s):
        p=dst/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s,encoding='utf8')
    root_source=(src/'frame_1/DoAction_2.as').read_text(encoding='utf8')
    # SWF 6 converted undefined numeric bonuses to zero; SWF 8 produces NaN.
    # Initialize a genuinely new campaign, while preserving purchases on level entry.
    root_source=root_source.replace('function startGameStory()\n{','function startGameStory()\n{\n   resetBonuses();')
    root_source=root_source.replace('function startGameGoldRush()\n{','function startGameGoldRush()\n{\n   resetBonuses();')
    root_source=root_source.replace('_root.timerMov.time = 60 + eval("/:extraTime");','var timeBonus = Number(_root.extraTime);\n   if(isNaN(timeBonus)) timeBonus = 0;\n   _root.timerMov.time = 60 + timeBonus;')
    assert root_source.count('gmtOrigStartLevel();') == 1
    root_source=root_source.replace('gmtOrigStartLevel();','gmtOrigStartLevel();\n   gmSetupCampaignLevel();')
    # Every native campaign mining scene calls startLevel(), including the boat.
    campaign_frames=sorted(int(p.parent.name[6:]) for p in src.glob('frame_*/DoAction.as')
                           if 'startLevel();' in p.read_text(encoding='utf8'))
    assert len(campaign_frames) == 55 and min(campaign_frames) == 342 and max(campaign_frames) == 407
    extra=(ROOT/'mod-tools/vegas-coop.as').read_text(encoding='utf8')
    extra+='\n_root.gmCampaignFrames = new Object();\n'+''.join(f'_root.gmCampaignFrames[{f}] = true;\n' for f in campaign_frames)
    extra+='\nflash.external.ExternalInterface.call("eval",'+json.dumps((ROOT/'mod-tools/vegas-panel.js').read_text(encoding='utf8'),ensure_ascii=True)+');\n'
    for sid,n in ((2863,1),(3335,2)):
        p=next((src/f'DefineSprite_{sid}/frame_2').rglob('*enterFrame*.as'))
        hit=p.read_text(encoding='utf8'); hit=hit[hit.index('{')+1:hit.rfind('}')]
        hit=hit.replace('_parent','mc._parent').replace('this.hitTest','mc.hitTest')
        # T remains on its type frame after capture; its inner T switches to 2.
        hit=hit.replace('and mc._parent.busy == 0)', 'and mc._parent.busy == 0 and eval("_root.T" + x + ".T._currentframe") != 2)')
        hit=hit.replace('and mc._parent.busy2 == 0)', 'and mc._parent.busy2 == 0 and eval("_root.T" + x + ".T._currentframe") != 2)')
        extra+=f'\nfunction gmHit{n}(mc) {{ var x; var NTemp; if(mc == undefined) return;\n'+hit+'\n}\n'
        write(p.relative_to(src),f'onClipEvent(enterFrame){{ _root.gmHit{n}(this); }}')
    write('frame_1/DoAction_2.as',root_source+'\n'+extra)
    # The shell remaps WASD to arrows. Campaign uses physical keys exclusively,
    # so a synthetic arrow must not also activate the original Flash buttons.
    for button,filename in ((2814,'BUTTONCONDACTION on(keyPress Down).as'),(2828,'BUTTONCONDACTION on(keyPress Up).as')):
        p=src/f'DefineButton2_{button}'/filename
        s=p.read_text(encoding='utf8')
        s=s.replace('if(_root.pauseMov.pauseVar != 1)','if(!_root.gmCampaign() and _root.pauseMov.pauseVar != 1)')
        s=s.replace('if(eval("/:stick") >= 1 and _root.pauseMov.pauseVar != 1)','if(!_root.gmCampaign() and eval("/:stick") >= 1 and _root.pauseMov.pauseVar != 1)')
        write(p.relative_to(src),s)
    # Outbound claws also contain old Left/Right "recall early" buttons.
    # Shell-remapped A/D would activate these even though cart movement already
    # ignores synthetic keys. Physical recall is routed per player by gmPhysicalKey;
    # disable only these legacy global recall buttons in campaign co-op.
    for direction in ('Left','Right'):
        p=src/f'DefineButton2_2827/BUTTONCONDACTION on(keyPress {direction}).as'
        s=p.read_text(encoding='utf8')
        body=s[s.index('{')+1:s.rfind('}')]
        write(p.relative_to(src),f'on(keyPress "<{direction}>"){{ if(!_root.gmCampaign()){{'+body+'}}')
    p=src/'DefineButton2_2694/BUTTONCONDACTION on(release).as'
    s=p.read_text(encoding='utf8')
    body=s[s.index('{')+1:s.rfind('}')]
    write(p.relative_to(src),'on(release){ if(_root.gmCampaign()){ _root.gmDynamite(playerN == 2 ? 2 : 1); } else {'+body+'}}')
    # Campaign emits the projectile directly, so the old animation release
    # callbacks must not spawn a second one for the same piece of cargo.
    for p in src.glob('DefineSprite_*/frame_*/DoAction.as'):
        s=p.read_text(encoding='utf8')
        if '_parent._parent.C.cl.d.gotoAndStop(2);' in s:
            write(p.relative_to(src),'if(!_root.gmCampaign()){'+s+'}')
    p=next((src/'DefineSprite_2825/frame_2').rglob('*enterFrame*.as'))
    s=p.read_text(encoding='utf8')
    s=s.replace('if(_parent._parent.claw._currentframe == 79)',
                'if(_root.gmCampaign()){\n         _parent._parent.gmBombPending = false;\n         if(_root.pauseMov.pauseVar != 1) _parent._parent.play();\n      }\n      if(_parent._parent.claw._currentframe == 79)')
    write(p.relative_to(src),s)
    for p in (src/'DefineSprite_3345').rglob('*.as'):
        s=p.read_text(encoding='utf8')
        new=s
        for name in ('score','stick'):
            new=new.replace(f'"/:{name}2"',f'(_root.gameMode != 3 ? "/:{name}" : "/:{name}2")')
        if new!=s:write(p.relative_to(src),new)
    # Remove the native global mouse handlers and movement; the controller owns input.
    for sid in (2863,3335):
        for p in (src/f'DefineSprite_{sid}/frame_1').rglob('*.as'):
            if 'mouseDown' in p.name or 'enterFrame' in p.name:
                event='mouseDown' if 'mouseDown' in p.name else 'enterFrame'
                original=p.read_text(encoding='utf8')
                body=original[original.index('{')+1:original.rfind('}')]
                condition='!_root.gmCampaign()' if sid==2863 else '_root.gameMode == 3'
                write(p.relative_to(src),f'onClipEvent({event}){{ if({condition}){{'+body+'}}')
    # Add native strength to both players without overwriting purchased bonuses.
    count=0
    for sid in (2863,3335):
        for p in (src/f'DefineSprite_{sid}').rglob('*enterFrame*.as'):
            s=p.read_text(encoding='utf8')
            if 'minerStrength' not in s: continue
            s=re.sub(r'eval\("/:strength2?"\) == 1',lambda m:'('+m[0]+' or (_root.gmFastReturn and _root.gmCampaign()))',s)
            s=re.sub(r'eval\("/:strength2?"\) != 1',lambda m:'('+m[0]+' and !(_root.gmFastReturn and _root.gmCampaign()))',s)
            s=s.replace('if(_root.pauseMov.pauseVar != 1)','if(_root.pauseMov.pauseVar != 1 and !_parent.gmBombPending)')
            write(p.relative_to(src),s);count+=1
    p=src/'DefineSprite_1826/frame_19/DoAction.as'
    s=p.read_text(encoding='utf8').replace('if(eval("/:busy") == 1)', 'if((!_root.gmCampaign() and eval("/:busy") == 1) or (_root.gmCampaign() and (_root.cartMov.C.cl._currentframe > 1 or _root.cartMov2.C.cl._currentframe > 1 or _root.bonus._currentframe > 1 or _root.bonus2._currentframe > 1)))')
    write(p.relative_to(src),s)
    # Restore the first scene's original action; initialization now runs centrally.
    p=src/'frame_342/DoAction.as'
    write(p.relative_to(src),p.read_text(encoding='utf8'))
    ffdec('-importScript',WORK/'vegas/gmvegas_main.swf',WORK/'compiled.swf',dst.parent)
    ffdec('-swf2xml',WORK/'compiled.swf',WORK/'compiled.xml')
    tree=ET.parse(WORK/'compiled.xml');root=tree.getroot();tags=root.find('tags')
    # ExternalInterface requires SWF 8. Repair known legacy case-insensitive names.
    root.set('version','8')
    aliases={b'uNLockArea\0':b'unLockArea\0',b'un6\0':b'uN6\0',b'Player1\0':b'player1\0',b'Player2\0':b'player2\0',b'subString\0':b'substring\0',b'htmltext\0':b'htmlText\0',b'highLight_mc\0':b'highlight_mc\0'}
    for node in root.iter():
        if node.get('actionBytes'):
            data=bytes.fromhex(node.get('actionBytes'))
            for old,new in aliases.items():data=data.replace(old,new)
            node.set('actionBytes',data.hex())
    frames={};frame=1
    for x in list(tags):
        frames.setdefault(frame,[]).append(x)
        if x.get('type')=='ShowFrameTag':frame+=1
    # Move later symbol definitions before their campaign use, retaining dependency order.
    pivot=next(x for x in frames[342] if x.get('name')=='cartMov')
    late=[x for f,xs in frames.items() if f>342 for x in xs if x.get('type','').startswith('Define')]
    for x in late:tags.remove(x)
    idx=list(tags).index(pivot)
    for x in late:tags.insert(idx,x);idx+=1
    for name,depth in (('cartMov2',174),('bonus2',810)):
        orig=next(x for x in frames[487] if x.get('name')==name)
        node=copy.deepcopy(orig);node.set('depth',str(depth));node.set('ratio','341')
        tags.insert(list(tags).index(pivot)+1,node)
        # Match the primary cart's full campaign display span. Removing at 343
        # removes the partner on L1-2 and all later scenes reconstructed from it.
        remove=ET.Element('item',{'type':'RemoveObject2Tag','depth':str(depth),'forceWriteAsLong':'false'})
        tags.insert(list(tags).index(frames[429][0]),remove)
    (WORK/'campaign-frames.json').write_text(json.dumps(campaign_frames),encoding='utf8')
    tree.write(WORK/'coop.xml',encoding='utf8',xml_declaration=True)
    ffdec('-xml2swf',WORK/'coop.xml',WORK/'gmvegas-coop.swf')
    print(f'Built campaign co-op; {count} native return-speed handlers updated.')

if __name__=='__main__':main()
