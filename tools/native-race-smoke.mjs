import http from 'node:http';
import assert from 'node:assert/strict';
import { createPairingService } from '../src/pairing/service.mjs';
import { DeviceRegistry } from '../src/pairing/devices.mjs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const dir = await mkdtemp(join(tmpdir(), 'voadesk-native-race-'));
const service = await createPairingService({ devices: new DeviceRegistry({ file: join(dir, 'devices.json') }) });
let armed = false, held = null, tested = false;
// Fault injection is confined to this ephemeral test proxy, never the product server.
const proxy = http.createServer((req, res) => {
  if (req.url === '/__test/arm') { armed = true; res.end('ok'); return; }
  if (req.url === '/__test/held') { res.end(String(Boolean(held))); return; }
  if (req.url === '/__test/release') {
    assert.ok(held); held.res.writeHead(200, { 'Content-Type': 'application/json' }); held.res.end(held.body); held = null; tested = true; res.end('ok'); return;
  }
  const headers = { ...req.headers, host: new URL(service.origin).host };
  if (headers.origin) headers.origin = service.origin;
  const upstream = http.request(service.origin + req.url, { method: req.method, headers }, response => {
    if (req.url === '/v3/client/commands') {
      let body = ''; response.on('data', c => { body += c; }); response.on('end', () => {
        if (armed) {
          armed = false; const state = JSON.parse(body); assert.equal(state.permission, 'control');
          state.commands = [{ type: 'keyDown', code: 'KeyZ' }]; held = { res, body: JSON.stringify(state) };
        } else { res.writeHead(response.statusCode, { 'Content-Type': 'application/json' }); res.end(body); }
      });
    } else { res.writeHead(response.statusCode, response.headers); response.pipe(res); }
  });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); }); req.pipe(upstream);
});
await new Promise(r => proxy.listen(0, '127.0.0.1', r));
const evidence = { date: new Date().toISOString(), scope: 'native-loopback-fault-injection', osInputInjected: false };
try {
  const { stdout } = await promisify(execFile)(resolve('.cache/native/NativeBridgeSmoke.exe'), [`http://127.0.0.1:${proxy.address().port}/`, join(dir, 'identity'), '--race'], { windowsHide: true, timeout: 30000, env: { ...process.env, VOADESK_TEST_OPERATOR_TOKEN: service.operatorToken } });
  Object.assign(evidence, JSON.parse(stdout.trim())); assert.equal(tested, true);
} catch (error) { evidence.result = 'failed'; evidence.failure = error.stdout?.trim() || error.message; process.exitCode = 1; }
finally {
  proxy.closeAllConnections(); await new Promise(r => proxy.close(r)); await service.close();
  assert.equal(dirname(dir), tmpdir().replace(/[\\/]$/, '')); await rm(dir, { recursive: true, force: true });
  await mkdir(resolve('artifacts/security-local'), { recursive: true });
  await writeFile(resolve('artifacts/security-local/native-race.json'), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence));
}
