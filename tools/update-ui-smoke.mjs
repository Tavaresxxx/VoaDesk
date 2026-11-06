import {createPairingService} from '../src/pairing/service.mjs';
import {DeviceRegistry} from '../src/pairing/devices.mjs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const dir=await mkdtemp(join(tmpdir(),'voadesk-update-ui-')),out=resolve('artifacts/support-local');await mkdir(out,{recursive:true});await mkdir(join(dir,'updates'));
// This fixture never reads the operational signing key or changes the shipped public key.
const {privateKey:key,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk=publicKey.export({format:'jwk'}),publicXml='<RSAKeyValue><Modulus>'+Buffer.from(jwk.n,'base64url').toString('base64')+'</Modulus><Exponent>'+Buffer.from(jwk.e,'base64url').toString('base64')+'</Exponent></RSAKeyValue>';
const fixture=join(dir,'build');await mkdir(fixture);await writeFile(join(fixture,'public.xml'),publicXml);await writeFile(join(fixture,'endpoint.txt'),'http://127.0.0.1/');
const payload=Buffer.from(JSON.stringify({version:'0.5.1',sha256:'a'.repeat(64),size:2048,expires:new Date(Date.now()+86400000).toISOString()}));
await writeFile(join(dir,'updates/manifest.json'),JSON.stringify({payload:payload.toString('base64'),signature:sign('RSA-SHA256',payload,key).toString('base64')}));
const service=await createPairingService({devices:new DeviceRegistry({file:join(dir,'devices.json')}),updateDirectory:join(dir,'updates')});
try{
 const compiler=join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),run=promisify(execFile);
 await run(compiler,['/nologo','/target:winexe','/main:ClientWindow','/platform:x64','/optimize+',...['System.Windows.Forms.dll','System.Drawing.dll','System.Net.Http.dll','System.Web.Extensions.dll','System.Security.dll'].map(n=>'/reference:'+n),
  '/resource:'+resolve('src/assets/voadesk.ico')+',VoaDesk.Icon','/resource:'+resolve('src/assets/logo.png')+',VoaDesk.Logo','/resource:'+resolve('src/assets/symbol.png')+',VoaDesk.Symbol','/resource:'+join(fixture,'endpoint.txt')+',VoaDesk.Server','/resource:'+join(fixture,'public.xml')+',VoaDesk.UpdateKey','/resource:'+resolve('.cache/native/VoaDeskUpdate.exe')+',VoaDesk.Updater','/out:'+join(fixture,'VoaDeskCliente.exe'),...['ClientApp.cs','RemoteInput.cs','ClientUpdate.cs','DisplayProbe.cs','ProductVersion.cs','Theme.cs'].map(n=>resolve('native',n))],{windowsHide:true});
 await run(compiler,['/nologo','/target:exe','/platform:x64','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:'+join(fixture,'VoaDeskCliente.exe'),'/out:'+join(fixture,'UpdateUiSmoke.exe'),resolve('native/UpdateUiSmoke.cs')],{windowsHide:true});
 const result=await run(join(fixture,'UpdateUiSmoke.exe'),[service.origin+'/',join(out,'cliente-atualizacao.png'),join(dir,'identity')],{windowsHide:true,timeout:20000});const evidence={date:new Date().toISOString(),fixtureOnly:true,operationalSigningKeyUsed:false,...JSON.parse(result.stdout.trim())};await writeFile(join(out,'update-ui.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}catch(e){console.log(JSON.stringify({result:'failed',detail:e.stdout?.trim()||e.code}));process.exitCode=1;}finally{await service.close();assert.equal(dirname(dir),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
