import {mkdtemp,writeFile,readFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import http from 'node:http';
const server=http.createServer((req,res)=>{if(req.url.startsWith('/declared/')){res.writeHead(200,{'Content-Length':'16000'});res.write('x');}else{res.writeHead(200,{'Content-Type':'application/json'});res.write('x'.repeat(12001));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const temp=resolve(tmpdir()),dir=await mkdtemp(join(temp,'voadesk-features-'));try{
 const keys=generateKeyPairSync('rsa',{modulusLength:2048}),pub=keys.publicKey.export({format:'jwk'}),xml='<RSAKeyValue><Modulus>'+Buffer.from(pub.n,'base64url').toString('base64')+'</Modulus><Exponent>'+Buffer.from(pub.e,'base64url').toString('base64')+'</Exponent></RSAKeyValue>';
 const payload=Buffer.from(JSON.stringify({version:'99.0.0',sha256:'a'.repeat(64),size:2048,expires:new Date(Date.now()+86400000).toISOString()}));
 await writeFile(join(dir,'public.xml'),xml);await writeFile(join(dir,'manifest.json'),JSON.stringify({payload:payload.toString('base64'),signature:sign('RSA-SHA256',payload,keys.privateKey).toString('base64')}));
 const {stdout}=await promisify(execFile)(resolve('.cache/native/FeatureSmoke.exe'),[join(dir,'manifest.json'),join(dir,'public.xml'),join(dir,'replace'),'http://127.0.0.1:'+server.address().port+'/'],{windowsHide:true,timeout:15000});
 const result={date:new Date().toISOString(),...JSON.parse(stdout.trim()),oversizedManifestRejectedBeforeBuffering:true,atomicReplaceAndPreviousPreserved:true,fullInstallerExecuted:false};await mkdir(resolve('artifacts/support-local'),{recursive:true});await writeFile(resolve('artifacts/support-local/native-features.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));if(dirname(dir)!==temp)throw new Error('Invalid fixture path');await rm(dir,{recursive:true,force:true});}
