import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createPairingService} from '../src/pairing/service.mjs';
import {DeviceRegistry} from '../src/pairing/devices.mjs';
test('API HTTP vincula papéis, cookie de captura, origem e ticket de uso único',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'voadesk-http-session-'));const svc=await createPairingService({devices:new DeviceRegistry({file:join(dir,'devices.json')})});t.after(async()=>{await svc.close();await rm(dir,{recursive:true,force:true});});
 const post=async(route,body,token)=>{const r=await fetch(svc.origin+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const client=(await post('/v2/clients',{deviceId:randomBytes(16).toString('hex'),secret:randomBytes(32).toString('base64url')})).body;
 assert.equal((await post('/v3/operator/request',{code:client.code})).status,403);
 const request=await post('/v3/operator/request',{code:client.code},svc.operatorToken);assert.equal(request.status,201);
 assert.equal((await post('/v3/client/decision',{id:request.body.id,permission:'view'},request.body.token)).status,403);
 const decision=(await post('/v3/client/decision',{id:request.body.id,permission:'view'},client.token)).body;
 const ticketUrl=svc.origin+'/support/bootstrap?ticket='+decision.ticket;
 const boot=await fetch(ticketUrl,{redirect:'manual'});assert.equal(boot.status,303);const cookie=boot.headers.get('set-cookie').split(';')[0];assert.match(boot.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
 assert.equal((await fetch(ticketUrl,{redirect:'manual'})).status,403);
 assert.equal((await fetch(svc.origin+'/support/state')).status,403);
 assert.equal((await fetch(svc.origin+'/support/state',{headers:{Cookie:cookie}})).status,200);
 for(const path of ['/support/theme.css','/support/capture.css','/support/logo.svg','/support/symbol.svg']){
  assert.equal((await fetch(svc.origin+path)).status,403);
  const asset=await fetch(svc.origin+path,{headers:{Cookie:cookie}});assert.equal(asset.status,200);
  assert.match(asset.headers.get('content-type'),path.endsWith('.svg')?/image\/svg\+xml/:/text\/css/);
  assert.ok((await asset.text()).length>100);
 }
 assert.equal((await fetch(svc.origin+'/support/input',{method:'POST',headers:{Cookie:cookie},body:'{}'})).status,403);
 assert.equal((await fetch(svc.origin+'/support/input',{method:'POST',headers:{Cookie:cookie,Origin:svc.origin,'X-VoaDesk':'1'},body:JSON.stringify({type:'text',text:'not-authorized'})})).status,400);
 await post('/v3/operator/end',{},request.body.token);
 assert.equal((await fetch(svc.origin+'/support/state',{headers:{Cookie:cookie}})).status,403);
 assert.equal((await post('/v3/operator/state',{},request.body.token)).body.permission,'none');
 for(let i=0;i<7;i++)await post('/v3/operator/request',{code:'2222222222222222'},svc.operatorToken);
 assert.equal((await post('/v3/operator/request',{code:client.code},svc.operatorToken)).status,429);
});
