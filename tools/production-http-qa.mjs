import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { productionAuth } from './production-auth.mjs';
const {origin,token}=await productionAuth();
const evidence={date:new Date().toISOString(),origin,scope:'external-production-https',checks:[],crossComputerValidated:false};
const clients=[];let sessionToken;
const api=async(path,payload,bearer,headers={})=>{
  const start=performance.now();const res=await fetch(origin+path,{method:payload===undefined?'GET':'POST',headers:{...(bearer?{Authorization:'Bearer '+bearer}:{}),...headers},...(payload===undefined?{}:{body:typeof payload==='string'?payload:JSON.stringify(payload)}),redirect:'manual',signal:AbortSignal.timeout(30000)});
  const text=await res.text();let data;try{data=JSON.parse(text);}catch{}
  return {status:res.status,headers:res.headers,data,elapsedMs:performance.now()-start};
};
const check=(name,value)=>{assert.ok(value,name);evidence.checks.push({name,result:'passed'});};
try{
  const health=await api('/health');check('HTTPS responde 200 e versão 0.5.0',health.status===200&&health.data.version==='0.5.0');
  check('Sinalização LAN habilitada e armazenamento declarado',health.data.sessionsEnabled&&health.data.deviceStorage==='derived-memory'&&health.data.serverHistoryPersistent===false);
  evidence.release=health.data.release;evidence.healthLatencyMs=health.elapsedMs;
  check('Origem de navegador externa recusada',(await api('/v2/clients',{},undefined,{Origin:'https://evil.invalid'})).status===403);
  check('Operador sem credencial recusado',(await api('/v3/operator/request',{code:'2222222222222222'})).status===403);
  const id={deviceId:randomBytes(16).toString('hex'),secret:randomBytes(32).toString('base64url')};
  const created=await api('/v2/clients',id);check('Identidade temporária registrada',created.status===201);clients.push(created.data.token);
  const repeated=await api('/v2/clients',id);check('Reconexão preserva código e troca token',repeated.status===201&&repeated.data.code===created.data.code&&repeated.data.token!==created.data.token);clients.push(repeated.data.token);
  check('Token anterior fica offline',(await api('/v2/clients/status',undefined,created.data.token)).data.state==='offline');
  const client=repeated.data;
  check('Verificação sem operador recusada',(await api('/v2/codes/verify',{code:client.code})).status===401);
  check('Operador identifica presença',(await api('/v2/codes/verify',{code:client.code},token)).status===200);
  const requested=await api('/v3/operator/request',{code:client.code},token);check('Atendimento aguarda consentimento',requested.status===201&&requested.data.state==='pending'&&requested.data.permission==='none');sessionToken=requested.data.token;
  check('Troca de papéis recusada',(await api('/v3/client/decision',{id:requested.data.id,permission:'control'},sessionToken)).status===403);
  check('Sinalização antes de consentimento recusada',(await api('/v3/operator/signal',{type:'answer',sdp:'invalid'},sessionToken)).status===403);
  const approved=await api('/v3/client/decision',{id:requested.data.id,permission:'view'},client.token);check('Somente o cliente aprova visualização',approved.status===200&&approved.data.state==='approved');
  const boot=await api('/support/bootstrap?ticket='+approved.data.ticket);check('Cookie de captura Secure, HttpOnly e Strict',boot.status===303&&/HttpOnly; SameSite=Strict/.test(boot.headers.get('set-cookie'))&&/; Secure/.test(boot.headers.get('set-cookie')));
  const cookie=boot.headers.get('set-cookie').split(';')[0];const capture={Cookie:cookie,Origin:origin,'X-VoaDesk':'1'};
  check('Ticket não pode ser reutilizado',(await api('/support/bootstrap?ticket='+approved.data.ticket)).status===403);
  check('Captura sem cookie recusada',(await api('/support/state')).status===403);
  check('Origem forjada da captura recusada',(await api('/support/input',{type:'release'},undefined,{...capture,Origin:'https://evil.invalid'})).status===403);
  check('Modo visualizar recusa entrada',(await api('/support/input',{type:'text',text:'fixture',permissionRevision:1},undefined,capture)).status===400);
  check('JSON inválido recusado',(await api('/v3/operator/state','null',sessionToken)).status===400);
  check('Corpo excessivo recusado',(await api('/v3/operator/state','x'.repeat(2049),sessionToken)).status===413);
  await api('/v3/client/decision',{id:requested.data.id,permission:'control'},client.token);
  check('Comando de permissão anterior recusado',(await api('/support/input',{type:'keyDown',code:'KeyA',permissionRevision:1},undefined,capture)).status===400);
  await api('/v2/clients/revoke',{},client.token);
  check('Revogar presença encerra sessão e controle',(await api('/v3/operator/state',{},sessionToken)).data.permission==='none');
  check('Cookie revogado deixa de acessar captura',(await api('/support/state',undefined,undefined,{Cookie:cookie})).status===403);
  for(const path of ['/.env','/.git/config','/.runtime/operator-settings.json','/native/ClientApp.cs'])check('Arquivo interno indisponível: '+path,(await api(path)).status===404);
  check('Health continua respondendo após os testes',(await api('/health')).status===200);
  evidence.result='passed';
}catch(error){evidence.result='failed';evidence.failure=error.message;process.exitCode=1;}
finally{
  if(sessionToken)await api('/v3/operator/end',{},sessionToken).catch(()=>{});
  for(const client of clients)await api('/v2/clients/revoke',{},client).catch(()=>{});
  await mkdir(resolve('artifacts/production-qa'),{recursive:true});await writeFile(resolve('artifacts/production-qa/http.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}
