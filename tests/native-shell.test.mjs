import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {once} from 'node:events';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {createHost} from '../src/host/server.mjs';
import {createPairingService} from '../src/pairing/service.mjs';
import {DeviceRegistry} from '../src/pairing/devices.mjs';
test('shell recebe autenticação só no pipe privado, preserva dados e encerra no EOF do dono',async t=>{
 const data=await mkdtemp(join(tmpdir(),'voadesk-shell-'));await writeFile(join(data,'history.json'),'[]');const original=await readFile(join(data,'history.json'));
 const child=spawn(process.execPath,[resolve('src/host/server.mjs'),'--native-shell'],{windowsHide:true,env:{...process.env,VOADESK_TEST_DATA_DIR:data,VOADESK_LOCAL_PAIRING_PORT:'0'}});let stderr='';child.stderr.on('data',d=>stderr+=d);t.after(async()=>{if(child.exitCode==null){child.kill();await once(child,'exit');}await rm(data,{recursive:true,force:true});});
 const ready=await new Promise((ok,fail)=>{const deadline=setTimeout(()=>fail(new Error('IPC sem resposta.')),10000);createInterface({input:child.stdout}).on('line',line=>{const message=JSON.parse(line);if(message.type==='ready'){clearTimeout(deadline);ok(message);}});child.once('error',fail);});
 assert.equal(new URL(ready.origin).hostname,'127.0.0.1');assert.equal(new URL(ready.origin).search,'');assert.equal((await fetch(ready.origin+'/')).status,401);const headers={Cookie:'farol='+ready.cookie};
 for(const route of ['/','/app.mjs','/api/pairing/config']){const body=await (await fetch(ready.origin+route,{headers})).text();assert.ok(!body.includes(ready.cookie));}
 assert.equal((await fetch(ready.origin+'/api/heartbeat',{method:'POST',headers:{...headers,Origin:'https://invalid.example','X-Farol-Request':'1'}})).status,403);
 const exited=once(child,'exit');child.stdin.end();assert.equal((await exited)[0],0);await assert.rejects(fetch(ready.origin));assert.deepEqual(await readFile(join(data,'history.json')),original);assert.ok(!stderr.includes(ready.cookie));
});
test('fechar durante solicitação aguarda o token privado e encerra o atendimento criado',async t=>{
 const data=await mkdtemp(join(tmpdir(),'voadesk-pending-close-')),devices=new DeviceRegistry({file:join(data,'devices.json')}),service=await createPairingService({devices});
 const client=devices.register({deviceId:randomBytes(16).toString('hex'),secret:randomBytes(32).toString('base64url')});let observed,release;const seen=new Promise(r=>observed=r),gate=new Promise(r=>release=r);
 const proxy=http.createServer(async(req,res)=>{const upstream=await fetch(service.origin+req.url,{method:'POST',headers:{Authorization:req.headers.authorization,'Content-Type':'application/json'},body:await new Promise(r=>{let s='';req.on('data',d=>s+=d);req.on('end',()=>r(s));})});const body=await upstream.text();if(req.url==='/v3/operator/request'){observed();await gate;}res.writeHead(upstream.status,{'Content-Type':'application/json'});res.end(body);});await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
 const host=await createHost({dataDir:join(data,'host'),idleTimeout:0,environment:{},pairing:{url:'http://127.0.0.1:'+proxy.address().port,token:service.operatorToken}});t.after(async()=>{release();await host.close();proxy.closeAllConnections();await new Promise(r=>proxy.close(r));await service.close();await rm(data,{recursive:true,force:true});});
 const boot=await fetch(host.bootstrapUrl,{redirect:'manual'}),headers={Cookie:boot.headers.get('set-cookie').split(';')[0],Origin:host.origin,'X-Farol-Request':'1','Content-Type':'application/json'};
 const request=fetch(host.origin+'/api/session/request',{method:'POST',headers,body:JSON.stringify({code:client.code})});await seen;let closed=false;const closing=host.close().then(()=>closed=true);await new Promise(r=>setTimeout(r,40));assert.equal(closed,false);release();const response=await request;await response.text();await closing;assert.equal(service.sessions.current.state,'ended');assert.equal(service.sessions.current.permission,'none');
});
test('servidor indisponível apresenta erro de atendimento sem detalhes internos',async t=>{
 const data=await mkdtemp(join(tmpdir(),'voadesk-offline-')),reservation=http.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));const host=await createHost({dataDir:data,idleTimeout:0,environment:{},pairing:{url:'http://127.0.0.1:'+port,token:'fixture-only'}});t.after(async()=>{await host.close();await rm(data,{recursive:true,force:true});});
 const boot=await fetch(host.bootstrapUrl,{redirect:'manual'}),r=await fetch(host.origin+'/api/session/request',{method:'POST',headers:{Cookie:boot.headers.get('set-cookie').split(';')[0],Origin:host.origin,'X-Farol-Request':'1','Content-Type':'application/json'},body:JSON.stringify({code:'2222222222222222'})});assert.equal(r.status,503);const message=(await r.json()).message;assert.match(message,/indisponível/);assert.doesNotMatch(message,/ECONN|fetch|JSON|token/);
});
