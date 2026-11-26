'use strict';
// Compare tracked files and decompressed release literals to the user's local
// original key values in memory. Never print those values.
const fs=require('fs'),path=require('path'),zlib=require('zlib'),cp=require('child_process');
const root=path.resolve(__dirname,'..');
if(process.argv.length!==4)throw Error('Usage: node mod-tools/audit_publication.cjs LOCAL_PACK_MODULE PAYLOAD_GZ');
const p=require(path.resolve(process.argv[2]));
const secrets=[];
for(const value of [p.PACK_SECRET,p.SHELL_SECRET]){
 const b=Buffer.isBuffer(value)?value:Buffer.from(value);
 secrets.push(b,Buffer.from(b.toString('hex')),Buffer.from(b.toString('base64')));
}
function audit(name,data){for(const s of secrets)if(s.length>=16&&data.includes(s))throw Error('Original embedded key found in '+name);}
const files=cp.execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
for(const name of files){
 if(/\.(swf|pack|asar|exe|dll|sav|gz|zip)$/i.test(name))throw Error('Unexpected game or generated binary: '+name);
 audit(name,fs.readFileSync(path.join(root,name)));
}
audit('decompressed release literals',zlib.gunzipSync(fs.readFileSync(path.resolve(process.argv[3]))));
console.log('Publication audit passed:',files.length,'tracked files and release literals; no original embedded key values found.');
