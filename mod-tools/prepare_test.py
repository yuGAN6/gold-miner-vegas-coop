from build_vegas import *

src=WORK/'edits/scripts/frame_1/DoAction_2.as'
p=WORK/'test-edits/scripts/frame_1/DoAction_2.as'
p.parent.mkdir(parents=True,exist_ok=True)
p.write_text(src.read_text(encoding='utf8')+'\n'+(ROOT/'mod-tools/vegas-debug.as').read_text(encoding='utf8'),encoding='utf8')
ffdec('-importScript',WORK/'gmvegas-coop.swf',WORK/'test.swf',WORK/'test-edits')
