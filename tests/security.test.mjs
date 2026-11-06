import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createPairingService } from '../src/pairing/service.mjs';
import { createHost } from '../src/host/server.mjs';
import { DeviceRegistry } from '../src/pairing/devices.mjs';
import { SessionHub } from '../src/pairing/sessions.mjs';
import { readJson, RequestError } from '../src/http-guards.mjs';

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'voadesk-security-'));
  const devices = new DeviceRegistry({ file: join(dir, 'devices.json') });
  const service = await createPairingService({ devices });
  const host = await createHost({ dataDir: join(dir, 'host'), idleTimeout: 0, environment: {} });
  t.after(async () => { await host.close(); await service.close(); assert.equal(dirname(dir), tmpdir().replace(/[\\/]$/, '')); await rm(dir, { recursive: true, force: true }); });
  const identity = { deviceId: randomBytes(16).toString('hex'), secret: randomBytes(32).toString('base64url') };
  const client = devices.register(identity);
  const post = async (path, payload, token, extra = {}) => {
    const response = await fetch(service.origin + path, { method: 'POST', headers: { Authorization: 'Bearer ' + token, ...extra }, body: typeof payload === 'string' ? payload : JSON.stringify(payload) });
    await response.text(); return response.status;
  };
  return { devices, service, host, identity, client, post };
}

test('segurança: Host forjado, origem externa e credencial inválida são recusados antes do corpo', async t => {
  const { service, post, client } = await setup(t);
  const status = await new Promise((resolve, reject) => {
    const req = http.get(service.origin + '/v3/client/state', { headers: { Host: 'evil.test', Authorization: 'Bearer ' + client.token } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
  });
  assert.equal(status, 403);
  assert.equal(await post('/v3/operator/state', 'x'.repeat(120000), 'wrong'), 403);
  assert.equal(await post('/v3/operator/request', { code: client.code }, service.operatorToken, { Origin: 'https://evil.test' }), 403);
  assert.equal(service.sessions.current, null);
  assert.equal((await fetch(service.origin + '/v3/client/commands', { headers: { Authorization: 'Bearer wrong' } })).status, 403);
});

test('segurança: JSON inválido e corpo excessivo retornam 400/413 sem derrubar serviço', async t => {
  const { service, post, client } = await setup(t);
  const request = service.sessions.request(client.code);
  for (const value of ['null', '[]', 'true', '"text"', '{']) assert.equal(await post('/v3/operator/state', value, request.token), 400);
  assert.equal(await post('/v3/operator/state', 'x'.repeat(2049), request.token), 413);
  assert.equal(await post('/v3/operator/signal', 'x'.repeat(110001), request.token), 413);
  assert.equal((await fetch(service.origin + '/health')).status, 200);
});

test('segurança: fragmentos UTF-8 preservam texto e chunked não contorna limite', async t => {
  const { service, client } = await setup(t);
  const request = service.sessions.request(client.code);
  const decision = service.sessions.decide(client.token, request.id, 'control');
  const boot = await fetch(service.origin + '/support/bootstrap?ticket=' + decision.ticket, { redirect: 'manual' });
  const cookie = boot.headers.get('set-cookie').split(';')[0];
  const send = chunks => new Promise((resolve, reject) => {
    const req = http.request(service.origin + '/support/input', { method: 'POST', headers: { Cookie: cookie, Origin: service.origin, 'X-VoaDesk': '1' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    (async () => { for (const chunk of chunks) { req.write(chunk); await new Promise(r => setTimeout(r, 3)); } req.end(); })().catch(reject);
  });
  const bytes = Buffer.from(JSON.stringify({ type: 'text', text: 'Ação', permissionRevision: service.sessions.current.permissionRevision }));
  const index = bytes.indexOf(Buffer.from('ç')) + 1;
  assert.equal(await send([bytes.subarray(0, index), bytes.subarray(index)]), 200);
  assert.equal(service.sessions.commands(client.token).commands[0].text, 'Ação');
  assert.equal(await send([Buffer.alloc(1024, 32), Buffer.alloc(1025, 32)]), 413);
});

test('segurança: upload lento é encerrado no prazo absoluto mesmo enviando bytes', async t => {
  const { service, client } = await setup(t);
  const started = Date.now();
  const response = await new Promise((resolve, reject) => {
    const socket = net.connect(new URL(service.origin).port, '127.0.0.1');
    let data = '';
    const trickle = setInterval(() => socket.write(' '), 100);
    const deadline = setTimeout(() => { socket.destroy(); reject(new Error('Upload não foi interrompido')); }, 8000);
    socket.on('connect', () => socket.write(`POST /v3/client/decision HTTP/1.1\r\nHost: ${new URL(service.origin).host}\r\nAuthorization: Bearer ${client.token}\r\nContent-Length: 1000\r\n\r\n{`));
    socket.on('data', chunk => { data += chunk; });
    socket.on('error', reject);
    socket.on('close', () => { clearInterval(trickle); clearTimeout(deadline); resolve(data); });
  });
  assert.match(response, /^HTTP\/1.1 408/);
  assert.ok(Date.now() - started < 7500);
  assert.equal((await fetch(service.origin + '/health')).status, 200);
});

test('segurança: comando atrasado não atravessa revogação seguida de nova concessão', async t => {
  const { service, client } = await setup(t);
  const r = service.sessions.request(client.code);
  const decision = service.sessions.decide(client.token, r.id, 'control');
  const boot = await fetch(service.origin + '/support/bootstrap?ticket=' + decision.ticket, { redirect: 'manual' });
  const headers = { Cookie: boot.headers.get('set-cookie').split(';')[0], Origin: service.origin, 'X-VoaDesk': '1' };
  const payload = JSON.stringify({ type: 'keyDown', code: 'KeyA', permissionRevision: service.sessions.current.permissionRevision });
  const status = await new Promise((resolve, reject) => {
    const req = http.request(service.origin + '/support/input', { method: 'POST', headers }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);req.write(payload.slice(0, -1));
    setTimeout(() => {
      service.sessions.decide(client.token, r.id, 'view');
      service.sessions.decide(client.token, r.id, 'control');
      req.end('}');
    }, 30);
  });
  assert.equal(status, 400);
  assert.deepEqual(service.sessions.commands(client.token).commands, []);
  const fresh = await fetch(service.origin + '/support/input', { method: 'POST', headers, body: JSON.stringify({ type: 'keyDown', code: 'KeyA', permissionRevision: service.sessions.current.permissionRevision }) });
  assert.equal(fresh.status, 200);
});

test('segurança: revogação e rotação da presença invalidam controle e tickets antigos', async t => {
  const { devices, service, client, identity, post } = await setup(t);
  let r = service.sessions.request(client.code);
  let d = service.sessions.decide(client.token, r.id, 'control');
  service.sessions.input(service.sessions.current, { type: 'keyDown', code: 'ControlLeft' });
  assert.equal(await post('/v2/clients/revoke', {}, client.token), 200);
  assert.equal(service.sessions.current.permission, 'none');
  assert.equal(service.sessions.current.commands.length, 0);
  assert.throws(() => service.sessions.redeem(d.ticket), /DENIED/);
  const resumed = devices.register(identity);
  r = service.sessions.request(resumed.code);
  d = service.sessions.decide(resumed.token, r.id, 'control');
  devices.register(identity);
  service.sessions.sweep();
  assert.equal(service.sessions.current.state, 'ended');
  assert.throws(() => service.sessions.redeem(d.ticket), /DENIED/);
});

test('segurança: orientação não ultrapassa limite de fila e encerra controle sob overflow', async t => {
  const { devices, client } = await setup(t);
  const hub = new SessionHub(devices), r = hub.request(client.code);
  hub.decide(client.token, r.id, 'control');
  for (let i = 0; i < 128; i++) hub.input(hub.current, { type: 'keyDown', code: 'KeyA' });
  assert.throws(() => hub.input(hub.current, { type: 'guide', x: 0.5, y: 0.5 }), /OVERFLOW/);
  assert.equal(hub.current.permission, 'none');
  assert.deepEqual(hub.current.commands, []);
});

test('segurança: lotes preservam ordem, recusam revisão antiga e limpam entradas em lote inválido',async t=>{
  const{service,client}=await setup(t);const request=service.sessions.request(client.code),decision=service.sessions.decide(client.token,request.id,'control');
  const boot=await fetch(service.origin+'/support/bootstrap?ticket='+decision.ticket,{redirect:'manual'});
  const headers={Cookie:boot.headers.get('set-cookie').split(';')[0],Origin:service.origin,'X-VoaDesk':'1'};
  const send=events=>fetch(service.origin+'/support/input',{method:'POST',headers,body:JSON.stringify({events})});
  const event=(type,extra={})=>({type,permissionRevision:1,...extra});
  assert.equal((await send([event('keyDown',{code:'ControlLeft'}),event('keyUp',{code:'ControlLeft'}),event('release')])).status,200);
  assert.deepEqual(service.sessions.commands(client.token).commands.map(x=>x.type),['keyDown','keyUp','release']);
  assert.equal((await send([event('keyDown',{code:'KeyA'}),{type:'keyUp',code:'KeyA',permissionRevision:0}])).status,400);
  assert.deepEqual(service.sessions.commands(client.token).commands,[]);
  assert.equal((await send(Array.from({length:9},()=>event('release')))).status,400);
  assert.equal((await send([event('keyDown',{code:'KeyA'}),event('execute-shell')])).status,400);
  assert.equal(service.sessions.current.permission,'none');assert.deepEqual(service.sessions.current.commands,[]);
});

test('segurança: flood autenticado retorna 429 e preserva health e outro participante', async t => {
  const { service, client, post } = await setup(t);
  const r = service.sessions.request(client.code);
  for (let i = 0; i < 1200; i++) assert.equal(await post('/v3/operator/state', {}, r.token), 200);
  assert.equal(await post('/v3/operator/state', {}, r.token), 429);
  assert.equal((await fetch(service.origin + '/health')).status, 200);
  assert.equal((await fetch(service.origin + '/v3/client/commands', { headers: { Authorization: 'Bearer ' + client.token } })).status, 200);
  assert.equal(await post('/v3/operator/end', {}, r.token), 200);
  assert.equal(service.sessions.current.permission, 'none');
});

test('segurança: cliente mantém revogação disponível mesmo com sua cota esgotada', async t => {
  const { service, client, post } = await setup(t);
  const r = service.sessions.request(client.code);
  service.sessions.decide(client.token, r.id, 'control');
  for (let i = 0; i < 1200; i++) {
    const response = await fetch(service.origin + '/v3/client/commands', { headers: { Authorization: 'Bearer ' + client.token } });
    await response.text(); assert.equal(response.status, 200);
  }
  assert.equal((await fetch(service.origin + '/v3/client/commands', { headers: { Authorization: 'Bearer ' + client.token } })).status, 429);
  assert.equal(await post('/v3/client/decision', { id: r.id, permission: 'end' }, client.token), 200);
  assert.equal(service.sessions.current.permission, 'none');
});

test('segurança: upload abortado libera leitores sem erro não tratado', async t => {
  let parsed;
  const done = new Promise(resolve => { parsed = resolve; });
  const server = http.createServer(async (req, res) => {
    try { await readJson(req, res, 2048); parsed(false); }
    catch (error) { parsed(error instanceof RequestError); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => { server.closeAllConnections(); server.close(r); }));
  const socket = net.connect(server.address().port, '127.0.0.1');
  await new Promise(r => socket.once('connect', r));
  socket.write('POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1000\r\n\r\n{');
  await new Promise(r => setTimeout(r, 20)); socket.destroy();
  assert.equal(await done, true);
});

test('segurança: painel rejeita traversal e JSON inválido sem persistir conteúdo', async t => {
  const { host } = await setup(t);
  const boot = await fetch(host.bootstrapUrl, { redirect: 'manual' });
  const headers = { Cookie: boot.headers.get('set-cookie').split(';')[0], Origin: host.origin, 'X-Farol-Request': '1' };
  for (const body of ['null', '[]', '{}', '{']) assert.equal((await fetch(host.origin + '/api/history', { method: 'POST', headers, body })).status, 400);
  assert.equal((await fetch(host.origin + '/api/history', { method: 'POST', headers, body: ' '.repeat(2049) })).status, 413);
  for (const path of ['/.runtime/history.json', '/%2e%2e/native/ClientApp.cs', '/.env', '/.git/config']) assert.equal((await fetch(host.origin + path, { headers })).status, 404);
  assert.deepEqual(await (await fetch(host.origin + '/api/history', { headers })).json(), []);
});
