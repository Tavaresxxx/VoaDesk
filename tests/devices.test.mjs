import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DeviceRegistry } from '../src/pairing/devices.mjs';
import { createPairingService } from '../src/pairing/service.mjs';
import { createHost } from '../src/host/server.mjs';
const identity = () => ({ deviceId: randomBytes(16).toString('hex'), secret: randomBytes(32).toString('base64url') });
async function fixture(t) { const dir = await mkdtemp(join(tmpdir(), 'voadesk-device-test-')); t.after(() => rm(dir, { recursive: true, force: true })); return { dir, file: join(dir, 'devices.json') }; }

test('identificador permanece após revogação, reabertura e reinício do registro', async t => {
  const { file } = await fixture(t), id = identity();
  let store = new DeviceRegistry({ file }); const first = store.register(id), second = store.register(identity());
  assert.notEqual(first.code, second.code); assert.equal(store.verify(first.code), 'identified');
  assert.equal(store.verify(first.code), 'identified'); // Public ID, never one-use permission.
  store.revoke(first.token); assert.equal(store.verify(first.code), 'offline');
  const reopened = store.register(id); assert.equal(reopened.code, first.code); assert.notEqual(reopened.token, first.token);
  assert.equal(store.status(first.token).state, 'offline');
  store = new DeviceRegistry({ file }); assert.equal(store.verify(first.code), 'offline');
  assert.equal(store.register(id).code, first.code);
  assert.equal((await readFile(file, 'utf8')).includes(id.secret), false);
});
test('identidade exige segredo; código sozinho não concede autenticação', async t => {
  const { file } = await fixture(t), id = identity(), store = new DeviceRegistry({ file }), first = store.register(id);
  assert.throws(() => store.register({ ...id, secret: identity().secret }), /IDENTITY_DENIED/);
  assert.throws(() => store.register({ deviceId: id.deviceId, secret: first.code }), /INVALID_IDENTITY/);
  assert.equal(store.status(first.code).state, 'offline'); assert.equal(store.status(first.token).state, 'waiting');
});
test('códigos offline ficam reservados e colisões são rejeitadas', async t => {
  const { file } = await fixture(t); let counter = 0;
  const store = new DeviceRegistry({ file, codeFactory: () => ++counter <= 2 ? '2222222222222222' : '3333333333333333' });
  const first = store.register(identity()); store.revoke(first.token);
  const second = store.register(identity()); assert.notEqual(first.code, second.code); assert.equal(counter, 3);
  const stuck = new DeviceRegistry({ file, codeFactory: () => '2222222222222222' }); assert.throws(() => stuck.register(identity()), /CAPACITY/);
});
test('presença expira sem perder código e consulta renova a concessão online', async t => {
  const { file } = await fixture(t); let now = 0;
  const id = identity(), store = new DeviceRegistry({ file, now: () => now, leaseMs: 100 });
  const first = store.register(id); now = 80; assert.equal(store.status(first.token).state, 'waiting');
  now = 150; assert.equal(store.verify(first.code), 'identified');
  now = 181; assert.equal(store.verify(first.code), 'offline'); assert.equal(store.register(id).code, first.code);
});
test('registro corrompido falha sem reatribuir códigos ou sobrescrever dados', async t => {
  const { file } = await fixture(t); await writeFile(file, '{"version":1,"devices":[{}]}');
  assert.throws(() => new DeviceRegistry({ file })); assert.equal(await readFile(file, 'utf8'), '{"version":1,"devices":[{}]}');
});
test('API persistente autentica operador, identifica repetidamente, revoga presença e limita tentativas', async t => {
  const { file } = await fixture(t), service = await createPairingService({ devices: new DeviceRegistry({ file }) }); t.after(() => service.close());
  const post = (url, body = {}, token) => fetch(service.origin + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  const id = identity(); const created = await post('/v2/clients', id); assert.equal(created.status, 201); const first = await created.json();
  assert.equal((await post('/v2/codes/verify', { code: first.code })).status, 401);
  for (let i = 0; i < 2; i++) assert.equal((await post('/v2/codes/verify', { code: first.code }, service.operatorToken)).status, 200);
  assert.equal((await post('/v2/clients', { ...id, secret: identity().secret })).status, 401);
  const poll = await fetch(service.origin + '/v2/clients/status', { headers: { Authorization: 'Bearer ' + first.token } }); assert.equal((await poll.json()).state, 'identified');
  await post('/v2/clients/revoke', {}, first.token);
  assert.equal((await post('/v2/codes/verify', { code: first.code }, service.operatorToken)).status, 404);
  assert.equal((await (await post('/v2/clients', id)).json()).code, first.code);
  for (let i = 0; i < 5; i++) await post('/v2/codes/verify', { code: '2222222222222222' }, service.operatorToken);
  assert.equal((await post('/v2/codes/verify', { code: first.code }, service.operatorToken)).status, 429);
});
test('servidor sem persistência recusa API de identificadores fixos', async t => {
  const service = await createPairingService(); t.after(() => service.close());
  assert.equal((await fetch(service.origin + '/v2/clients', { method: 'POST', body: JSON.stringify(identity()) })).status, 503);
});
test('clientes salvos persistem, validam entradas, rejeitam duplicidade e exigem origem', async t => {
  const { dir } = await fixture(t); let host = await createHost({ dataDir: dir, idleTimeout: 0, environment: {} });
  async function login() { const r = await fetch(host.bootstrapUrl, { redirect: 'manual' }); return { Cookie: r.headers.get('set-cookie').split(';')[0], Origin: host.origin, 'X-Farol-Request': '1' }; }
  let headers = await login();
  const payload = { name: '  Cliente de teste  ', code: '2222 2222 2222 2222', secret: 'must-not-persist' };
  const add = (body, h = headers) => fetch(host.origin + '/api/saved-clients', { method: 'POST', headers: h, body: JSON.stringify(body) });
  try {
    assert.equal((await add(payload, { Cookie: headers.Cookie })).status, 403);
    assert.equal((await add(payload)).status, 201); assert.equal((await add(payload)).status, 409);
    assert.equal((await add({ name: '', code: payload.code })).status, 400);
    assert.equal((await add({ name: 'A', code: 'short' })).status, 400);
    assert.equal((await readFile(join(dir, 'saved-clients.json'), 'utf8')).includes('must-not-persist'), false);
    await host.close(); host = await createHost({ dataDir: dir, idleTimeout: 0, environment: {} }); headers = await login();
    const list = await (await fetch(host.origin + '/api/saved-clients', { headers })).json();
    assert.equal(list.length, 1); assert.equal(list[0].name, 'Cliente de teste'); assert.equal(list[0].code, '2222222222222222');
    const html = await (await fetch(host.origin, { headers })).text(); assert.equal(html.includes('Laboratório'), false); assert.match(html, /id="add-client"/);
  } finally { await host.close(); }
});
