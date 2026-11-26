"""Extract the user's own installation into ignored local work files."""
import argparse
import hashlib
import os
from pathlib import Path
import subprocess
from asar_tool import extract

ROOT=Path(__file__).resolve().parent.parent
WORK=ROOT/'mod-work'
SOURCE_SHA='82fdc3a1fc61576ab86b571a9d7b8289da3c1a496121c298f7476ab04aed0b9a'

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--game-directory',required=True,type=Path)
    p.add_argument('--ffdec-jar',required=True,type=Path)
    p.add_argument('--java',default='java')
    a=p.parse_args()
    game=a.game_directory.resolve();WORK.mkdir(parents=True,exist_ok=True)
    candidates=[game/'resources/vegas'/n for n in ('vegas.pack.pre-campaign-coop','vegas.pack.goldminer-vegas-coop-original','vegas.pack')]
    source=next((f for f in candidates if f.is_file() and hashlib.sha256(f.read_bytes()).hexdigest()==SOURCE_SHA),None)
    if source is None:raise RuntimeError('The supported original Vegas pack was not found. Restore this game build first.')
    extract(game/'resources/app.asar',WORK/'app')
    unpack="""const fs=require('fs'),path=require('path'),p=require(process.argv[1]);
const o=p.open(fs.readFileSync(process.argv[2]));
for(const n of o.names()){const f=path.join(process.argv[3],n);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,o.read(n));}
"""
    subprocess.run(['node','-e',unpack,str(WORK/'app/vegas-pack.js'),str(source),str(WORK/'vegas')],check=True)
    os.environ['VEGAS_JAVA']=a.java;os.environ['FFDEC_JAR']=str(a.ffdec_jar.resolve())
    from build_vegas import ffdec
    ffdec('-export','script',WORK/'vegas-scripts',WORK/'vegas/gmvegas_main.swf')
    ffdec('-swf2xml',WORK/'vegas/gmvegas_main.swf',WORK/'vegas.xml')
    print('Prepared local inputs. Original game files were read only; mod-work is ignored by Git.')

if __name__=='__main__':main()
