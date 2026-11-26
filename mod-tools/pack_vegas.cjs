'use strict';
// Decode/re-encode through the user's own locally extracted module. No decoder
// or embedded key is included in this repository.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');
if(process.argv.length!==4)throw Error('Usage: node mod-tools/pack_vegas.cjs ORIGINAL_PACK OUTPUT_PACK');
const pack=require(path.join(root,'mod-work/app/vegas-pack.js'));
const original=pack.open(fs.readFileSync(path.resolve(process.argv[2])));
const files=original.names().map(name=>({name,data:name==='gmvegas_main.swf'?fs.readFileSync(path.join(root,'mod-work/gmvegas-coop.swf')):original.read(name)}));
const output=pack.encode(files,{version:original.version,salt:original.salt});
const verify=pack.open(output);
for(const f of files)if(!verify.read(f.name).equals(f.data))throw Error('Verification failed: '+f.name);
const target=path.resolve(process.argv[3]);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,output);
console.log(JSON.stringify({file:target,bytes:output.length,sha256:crypto.createHash('sha256').update(output).digest('hex'),entries:files.length},null,2));
