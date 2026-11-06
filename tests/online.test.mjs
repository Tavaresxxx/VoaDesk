import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { DerivedDeviceRegistry } from '../src/pairing/derived-devices.mjs';
import { createPairingService } from '../src/pairing/service.mjs';
const key = () => randomBytes(32).toString('base64url');
const identity = () => ({ deviceId: randomBytes(16).toString('hex'), secret: key() });

test('registro derivado mantém código após reinício sem gravar identidade no disco', () => {
  const seed = key(), id = identity();
  const firstStore = new DerivedDeviceRegistry({ key: seed });
  const first = firstStore.register(id);
  assert.equal(firstStore.verify(first.code), 'identified');
  firstStore.revoke(first.token);
  assert.equal(firstStore.register(id).code, first.code);
  const restarted = new DerivedDeviceRegistry({ key: seed });
  assert.equal(restarted.register(id).code, first.code);
  assert.equal(restarted.file, null);
  assert.equal(first.serverHistoryPersistent, false);
  assert.notEqual(new DerivedDeviceRegistry({ key: key() }).register(id).code, first.code);
});

test('segredo incorreto e código público não substituem a presença da identidade correta', () => {
  const registry = new DerivedDeviceRegistry({ key: key() }), id = identity();
  const owner = registry.register(id);
  const other = registry.register({ ...id, secret: key() });
  assert.notEqual(owner.code, other.code);
  assert.equal(registry.status(owner.token).state, 'waiting');
  assert.equal(registry.owner(owner.code), undefined);
  assert.throws(() => registry.register({ ...id, secret: owner.code }), /INVALID_IDENTITY/);
});

test('presença derivada expira, libera capacidade e reconecta com o mesmo código', () => {
  let now = 0;
  const registry = new DerivedDeviceRegistry({ key: key(), now: () => now, leaseMs: 100, capacity: 1 });
  const id = identity(), first = registry.register(id);
  assert.throws(() => registry.register(identity()), /CAPACITY/);
  now = 101; registry.sweep(); assert.equal(registry.devices.size, 0);
  assert.equal(registry.register(id).code, first.code);
  assert.equal(registry.status(first.token).state, 'offline');
});

test('sessão HTTPS exige Host/origem exatos, cookie Secure e consentimento do cliente', async t => {
  const token = key(), publicOrigin = 'https://voadesk.example';
  const service = await createPairingService({ publicOrigin, devices: new DerivedDeviceRegistry({ key: token }), operatorToken: token });
  t.after(() => service.close());
  const call = (path, body, bearer, extra = {}) => new Promise((resolve, reject) => {
    const req = http.request(service.origin + path, { method: body === undefined ? 'GET' : 'POST', headers: { Host: 'voadesk.example', ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}), ...extra } }, res => {
      let text = ''; res.on('data', c => text += c); res.on('end', () => { let value; try { value = JSON.parse(text); } catch {} resolve({ status: res.statusCode, headers: res.headers, value }); });
    }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const client = (await call('/v2/clients', identity())).value;
  assert.equal((await call('/v3/operator/request', { code: client.code })).status, 403);
  const request = (await call('/v3/operator/request', { code: client.code }, token)).value;
  assert.equal((await call('/v3/client/decision', { id: request.id, permission: 'control' }, request.token)).status, 403);
  const decision = (await call('/v3/client/decision', { id: request.id, permission: 'control' }, client.token)).value;
  const boot = await call('/support/bootstrap?ticket=' + decision.ticket);
  assert.equal(boot.status, 303); assert.match(boot.headers['set-cookie'][0], /; Secure/);
  const Cookie = boot.headers['set-cookie'][0].split(';')[0];
  assert.equal((await call('/support/state', undefined, null, { Cookie, Host: 'evil.example' })).status, 403);
  assert.equal((await call('/support/input', { type: 'release' }, null, { Cookie, Origin: 'https://evil.example', 'X-VoaDesk': '1' })).status, 403);
  assert.equal((await call('/support/input', { type: 'text', text: 'teste', permissionRevision: 1 }, null, { Cookie, Origin: publicOrigin, 'X-VoaDesk': '1' })).status, 200);
  assert.equal((await call('/v3/client/commands', undefined, client.token)).value.commands[0].text, 'teste');
  await call('/v3/client/decision', { id: request.id, permission: 'end' }, client.token);
  assert.equal((await call('/support/state', undefined, null, { Cookie })).status, 403);
});

test('configuração pública rejeita HTTP, caminho, credenciais e origem ambígua', async () => {
  for (const publicOrigin of ['http://example.test', 'https://example.test/path', 'https://user:pass@example.test', 'https://example.test/']) await assert.rejects(createPairingService({ publicOrigin }), /PUBLIC_ORIGIN_INVALID/);
});
