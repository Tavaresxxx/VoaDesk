import {createPairingService} from '../src/pairing/service.mjs';
import {DeviceRegistry} from '../src/pairing/devices.mjs';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createPrivateKey,sign} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const dir=await mkdtemp(join(tmpdir(),'voadesk-update-ui-')),out=resolve('artifacts/support-local');await mkdir(out,{recursive:true});await mkdir(join(dir,'updates'));
const key=createPrivateKey(await readFile(resolve('.runtime/update-signing-key.pem')));
const payload=Buffer.from(JSON.stringify({version:'0.4.2',sha256:'a'.repeat(64),size:2048,expires:new Date(Date.now()+86400000).toISOString()}));
await writeFile(join(dir,'updates/manifest.json'),JSON.stringify({payload:payload.toString('base64'),signature:sign('RSA-SHA256',payload,key).toString('base64')}));
const service=await createPairingService({devices:new DeviceRegistry({file:join(dir,'devices.json')}),updateDirectory:join(dir,'updates')});
try{const result=await promisify(execFile)(resolve('.cache/native/UpdateUiSmoke.exe'),[service.origin+'/',join(out,'cliente-atualizacao.png'),join(dir,'identity')],{windowsHide:true,timeout:20000});const evidence={date:new Date().toISOString(),fixtureOnly:true,...JSON.parse(result.stdout.trim())};await writeFile(join(out,'update-ui.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));}catch(e){console.log(JSON.stringify({result:'failed',detail:e.stdout?.trim()||e.code}));process.exitCode=1;}finally{await service.close();await rm(dir,{recursive:true,force:true});}
