import test from 'node:test';
import assert from 'node:assert/strict';
import { PairingRegistry } from '../src/pairing/registry.mjs';
import { createPairingService } from '../src/pairing/service.mjs';
import { probePairingService } from '../src/pairing/probe.mjs';
test('código é temporário, de uso único e vinculado ao token do cliente', () => {
  let now = 1000000; const registry = new PairingRegistry({ now: () => now });
  const a = registry.register(), b = registry.register();
  assert.notEqual(a.code, b.code); assert.notEqual(a.token, b.token); assert.match(a.code, /^[A-Z2-9]{4} [A-Z2-9]{4} [A-Z2-9]{4}$/);
  assert.equal(registry.status(a.token).state, 'waiting');
  assert.equal(registry.verify(a.code.toLowerCase()), true); assert.equal(registry.verify(a.code), false);
  assert.equal(registry.status(a.token).state, 'verified'); assert.equal(registry.status(b.token).state, 'waiting');
  registry.revoke(b.token); assert.equal(registry.verify(b.code), false);
  const c = registry.register(); now += 300001; assert.equal(registry.verify(c.code), false); assert.equal(registry.status(c.token).state, 'expired');
});
test('tentativas são limitadas e o período libera nova tentativa', () => {
  let now = 0; const registry = new PairingRegistry({ now: () => now });
  for (let i=0;i<8;i++) assert.equal(registry.allow('operator',8,60000),true);
  assert.equal(registry.allow('operator',8,60000),false); now=60001; assert.equal(registry.allow('operator',8,60000),true);
});
test('serviço permite cliente nativo, exige operador e rejeita reutilização', async t => {
  const service = await createPairingService(); t.after(() => service.close());
  const post = (path, body={}, token) => fetch(service.origin+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
  assert.equal((await fetch(service.origin+'/health')).status,200);
  assert.equal((await fetch(service.origin+'/v1/clients',{method:'POST',headers:{Origin:'https://attacker.example'}})).status,403);
  const response = await post('/v1/clients'); assert.equal(response.status,201); const client=await response.json();
  assert.equal((await post('/v1/codes/verify',{code:client.code})).status,401);
  assert.equal((await post('/v1/codes/verify',{code:client.code},service.operatorToken)).status,200);
  assert.equal((await post('/v1/codes/verify',{code:client.code},service.operatorToken)).status,404);
  const state=await (await fetch(service.origin+'/v1/clients/status',{headers:{Authorization:`Bearer ${client.token}`}})).json(); assert.equal(state.state,'verified');
  assert.equal((await post('/v1/clients/revoke',{},client.token)).status,200);
  assert.equal((await (await fetch(service.origin+'/v1/clients/status',{headers:{Authorization:`Bearer ${client.token}`}})).json()).state,'expired');
});
test('autoteste exercita HTTP e não retorna códigos ou credenciais', async t => {
  const service = await createPairingService(); t.after(() => service.close());
  const result = await probePairingService(service.origin, service.operatorToken);
  assert.equal(result.result, 'passed'); assert.equal(result.statuses.verification, 200); assert.equal(result.statuses.replayRejected, 404); assert.equal(result.statuses.revokedCodeRejected, 404);
  assert.equal(JSON.stringify(result).includes(service.operatorToken), false); assert.equal(result.externalHttpsValidated, false);
});
