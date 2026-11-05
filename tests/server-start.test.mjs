import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { resolve } from 'node:path';

test('entrada usada por yarn start inicia apenas o serviço público no modo pairing', async t => {
  const reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(r => reservation.close(r));
  const key = randomBytes(32).toString('base64url');
  const child = spawn(process.execPath, [resolve('src/start.mjs'), '--open'], { windowsHide: true, env: { ...process.env, PORT: String(port), VOADESK_MODE: 'pairing', VOADESK_OPERATOR_TOKEN: key, VOADESK_BIND: '127.0.0.1' } });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
  t.after(async () => { if (child.exitCode == null) { const ended = once(child, 'close'); child.kill(); await ended; } });
  const origin = `http://127.0.0.1:${port}`;
  let health;
  for (let i = 0; i < 50; i++) {
    if (child.exitCode != null) break;
    try { health = await fetch(origin + '/health'); if (health.ok) break; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  assert.equal(health?.status, 200, 'Servidor deve iniciar sem tentar abrir Edge.');
  assert.equal((await health.json()).service, 'voadesk-pairing');
  const client = await (await fetch(origin + '/v1/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
  const verified = await fetch(origin + '/v1/codes/verify', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: client.code }) });
  assert.equal(verified.status, 200);
  assert.equal((await fetch(origin + '/api/environment')).status, 404, 'O renderer/host desktop não deve ser exposto pelo serviço público.');
  assert.equal(stdout.includes(client.code) || stderr.includes(key), false, 'Logs não devem conter segredos.');
});
