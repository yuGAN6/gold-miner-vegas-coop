"""Export a minimal encrypted-entry delta; players use only Windows PowerShell."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import zipfile

def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--source',required=True,type=Path)
    ap.add_argument('--target',required=True,type=Path)
    ap.add_argument('--pack-module',required=True,type=Path)
    ap.add_argument('--output',required=True,type=Path)
    args=ap.parse_args()
    metadata=subprocess.check_output(['node','-e',
        "const fs=require('fs'),p=require(process.argv[1]);console.log(JSON.stringify(process.argv.slice(2).map(f=>p.open(fs.readFileSync(f)).table)));",
        str(args.pack_module.resolve()),str(args.source.resolve()),str(args.target.resolve())],text=True)
    old_table,new_table=json.loads(metadata)
    original=args.source.read_bytes();updated=args.target.read_bytes()
    old_start=len(original)-max(x['o']+x['s'] for x in old_table)
    new_start=len(updated)-max(x['o']+x['s'] for x in new_table)
    old={x['n']:x for x in old_table}
    operations=[];literals=bytearray()
    def emit(kind,data=None,offset=None,length=None):
        if data is not None:length=len(data)
        if not length:return
        if kind=='data':literals.extend(data)
        if operations and operations[-1]['kind']==kind and (kind=='data' or operations[-1]['offset']+operations[-1]['length']==offset):
            operations[-1]['length']+=length;return
        op={'kind':kind,'length':length}
        if offset is not None:op['offset']=offset
        operations.append(op)
    emit('data',updated[:new_start]);position=new_start;changed=[]
    for entry in sorted(new_table,key=lambda x:x['o']):
        start=new_start+entry['o'];end=start+entry['s']
        if start>position:emit('data',updated[position:start])
        prior=old[entry['n']];old_offset=old_start+prior['o']
        data=updated[start:end]
        if prior['s']==entry['s'] and original[old_offset:old_offset+prior['s']]==data:
            emit('copy',offset=old_offset,length=len(data))
        else:
            assert entry['n']=='gmvegas_main.swf',entry['n']
            changed.append(entry['n']);emit('data',data)
        position=end
    if position<len(updated):emit('data',updated[position:])
    assert changed==['gmvegas_main.swf']
    # Independently reconstruct every output byte before exporting.
    reconstructed=bytearray();literal_offset=0
    for op in operations:
        n=op['length']
        if op['kind']=='copy':reconstructed.extend(original[op['offset']:op['offset']+n])
        else:reconstructed.extend(literals[literal_offset:literal_offset+n]);literal_offset+=n
    assert reconstructed==updated and literal_offset==len(literals)
    name='GoldMiner-Vegas-Coop-v0.2.2';dest=args.output/name;dest.mkdir(parents=True,exist_ok=True)
    payload=dest/'payload.gz';payload.write_bytes(gzip.compress(bytes(literals),compresslevel=9,mtime=0))
    manifest={'format':'goldminer-vegas-delta-v1','modVersion':'0.2.2','game':'Gold Miner: Party Rush',
      'targetFile':'resources/vegas/vegas.pack',
      'source':{'size':len(original),'sha256':sha(args.source)},'target':{'size':len(updated),'sha256':sha(args.target)},
      'payload':{'sha256':sha(payload),'uncompressedSize':len(literals)},'modifiedEntries':changed,'operations':operations}
    (dest/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
    portable=Path(__file__).parent/'portable'
    for p in portable.iterdir():
        if p.suffix=='.ps1':(dest/p.name).write_text(p.read_text(encoding='utf-8-sig'),encoding='utf-8-sig')
        elif p.suffix=='.cmd':(dest/p.name).write_bytes(p.read_text(encoding='utf8').replace('\r\n','\n').replace('\n','\r\n').encode('utf8'))
        else:shutil.copy2(p,dest/p.name)
    archive=args.output/(name+'.zip')
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in sorted(dest.iterdir()):z.write(p,name+'/'+p.name)
    (args.output/(name+'.zip.sha256')).write_text(sha(archive)+'  '+archive.name+'\n',encoding='ascii')
    print(json.dumps({'archive':str(archive),'bytes':archive.stat().st_size,'literalBytes':len(literals),'operations':len(operations)},indent=2))

if __name__=='__main__':main()
