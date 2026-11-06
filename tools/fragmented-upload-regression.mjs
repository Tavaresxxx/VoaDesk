import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createPairingService} from '../src/pairing/service.mjs';
import {DeviceRegistry} from '../src/pairing/devices.mjs';
const dir=await mkdtemp(join(tmpdir(),'voadesk-fragmented-')),service=await createPairingService({devices:new DeviceRegistry({file:join(dir,'devices.json')})});
const client=service.sessions.devices.register({deviceId:randomBytes(16).toString('hex'),secret:randomBytes(32).toString('base64url')}),request=service.sessions.request(client.code),decision=service.sessions.decide(client.token,request.id,'control');
const boot=await fetch(service.origin+'/support/bootstrap?ticket='+decision.ticket,{redirect:'manual'}),headers={Cookie:boot.headers.get('set-cookie').split(';')[0],Origin:service.origin,'X-VoaDesk':'1'};
const result={scope:'localhost-fragmented-upload',iterations:0,failures:[],result:'passed'};let phase='initializing';
function send(chunks){return new Promise((ok,fail)=>{let responseStarted=false;const req=http.request(service.origin+'/support/input',{method:'POST',headers},res=>{responseStarted=true;res.resume();res.once('end',()=>ok(res.statusCode));res.once('error',fail);});req.once('error',e=>{e.diagnostic={phase,responseStarted,requestFinished:req.writableFinished};fail(e);});(async()=>{for(const chunk of chunks){req.write(chunk);await new Promise(r=>setTimeout(r,3));}req.end();})().catch(fail);});}
try{for(let i=0;i<300;i++){try{service.sessions.technician(request.token);const bytes=Buffer.from(JSON.stringify({type:'text',text:'Ação',permissionRevision:service.sessions.current.permissionRevision})),split=bytes.indexOf(Buffer.from('ç'))+1;phase="unicode";assert.equal(await send([bytes.subarray(0,split),bytes.subarray(split)]),200);assert.equal(service.sessions.commands(client.token).commands[0].text,'Ação');phase="oversized";assert.equal(await send([Buffer.alloc(1024,32),Buffer.alloc(1025,32)]),413);result.iterations++;}catch(e){result.failures.push({iteration:i,code:e.code??e.message,diagnostic:e.diagnostic});result.result='failed';process.exitCode=1;break;}}}
finally{await service.close();await rm(dir,{recursive:true,force:true});await mkdir(resolve('artifacts/native-technician'),{recursive:true});await writeFile(resolve('artifacts/native-technician/fragmented-upload.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
