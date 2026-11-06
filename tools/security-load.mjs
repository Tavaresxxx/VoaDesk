import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir, cpus, totalmem } from 'node:os';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { createPairingService } from '../src/pairing/service.mjs';
import { createHost } from '../src/host/server.mjs';
import { DeviceRegistry } from '../src/pairing/devices.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
if (process.argv.includes('--worker')) {
  const dir = await mkdtemp(join(tmpdir(), 'voadesk-load-'));
  const devices = new DeviceRegistry({ file: join(dir, 'devices.json') });
  const client = devices.register({ deviceId: randomBytes(16).toString('hex'), secret: randomBytes(32).toString('base64url') });
  const service = await createPairingService({ devices });
  const host = await createHost({ dataDir: join(dir, 'host'), idleTimeout: 0, environment: {} });
  const boot = await fetch(host.bootstrapUrl, { redirect: 'manual' });
  const delay = monitorEventLoopDelay({ resolution: 20 }); delay.enable();
  let lastCpu = process.cpuUsage(), lastTime = performance.now();
  const timer = setInterval(() => {
    const cpu = process.cpuUsage(), time = performance.now();
    process.send({ type: 'metric', rssMiB: process.memoryUsage().rss / 2 ** 20, heapMiB: process.memoryUsage().heapUsed / 2 ** 20, eventLoopP99Ms: delay.percentile(99) / 1e6, cpuOneCorePercent: ((cpu.user - lastCpu.user) + (cpu.system - lastCpu.system)) / ((time - lastTime) * 10) });
    lastCpu = cpu; lastTime = time; delay.reset();
  }, 1000);
  process.on('message', async message => {
    if (message.type !== 'stop') return;
    clearInterval(timer); delay.disable(); await host.close(); await service.close();
    assert.equal(dirname(dir), tmpdir().replace(/[\\/]$/, ''));
    await rm(dir, { recursive: true, force: true }); process.disconnect();
  });
  process.send({ type: 'ready', origin: service.origin, hostOrigin: host.origin, cookie: boot.headers.get('set-cookie').split(';')[0], clientToken: client.token });
} else {
  // No target URL accepted: this harness can only load its own disposable loopback servers.
  const child = fork(fileURLToPath(import.meta.url), ['--worker'], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const metrics = []; let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('message', m => { if (m.type === 'metric') metrics.push(m); });
  const ready = await new Promise((resolveReady, reject) => {
    child.on('message', m => { if (m.type === 'ready') resolveReady(m); });
    child.once('exit', code => reject(new Error('Worker exited: ' + code)));
  });
  const evidence = { date: new Date().toISOString(), scope: 'disposable-localhost-http-only', hardware: { cpu: cpus()[0].model, logicalCpus: cpus().length, memoryGiB: Math.round(totalmem() / 2 ** 30), node: process.versions.node }, stages: [], realVideoOrInputValidated: false, externalNetworkValidated: false };
  const percentile = (values, p) => values.length ? values[Math.min(values.length - 1, Math.floor(values.length * p))] : null;
  async function stage(name, origin, path, concurrency, durationMs, headers = {}) {
    const agent = new http.Agent({ keepAlive: true, maxSockets: concurrency });
    const started = performance.now(), latencies = [], statuses = {}, errors = {};
    async function once() {
      const start = performance.now();
      await new Promise(resolveRequest => {
        const req = http.get(origin + path, { agent, headers }, res => {
          res.resume(); res.on('end', () => { statuses[res.statusCode] = (statuses[res.statusCode] ?? 0) + 1; latencies.push(performance.now() - start); resolveRequest(); });
          res.on('error', e => { errors[e.code ?? 'RESPONSE_ERROR'] = (errors[e.code ?? 'RESPONSE_ERROR'] ?? 0) + 1; resolveRequest(); });
        });
        req.setTimeout(2500, () => req.destroy(Object.assign(new Error('deadline'), { code: 'TIMEOUT' })));
        req.on('error', e => { errors[e.code ?? 'ERROR'] = (errors[e.code ?? 'ERROR'] ?? 0) + 1; resolveRequest(); });
      });
    }
    const metricStart = metrics.length;
    await Promise.all(Array.from({ length: concurrency }, async () => { while (performance.now() - started < durationMs) await once(); }));
    agent.destroy();
    const elapsedMs = performance.now() - started, count = Object.values(statuses).reduce((a, b) => a + b, 0);
    latencies.sort((a, b) => a - b);
    const samples = metrics.slice(metricStart);
    const result = { name, concurrency, durationMs: Math.round(elapsedMs), responses: count, responsesPerSecond: Math.round(count * 1000 / elapsedMs), statuses, errors, latencyP50Ms: percentile(latencies, .5), latencyP95Ms: percentile(latencies, .95), latencyP99Ms: percentile(latencies, .99), peakRssMiB: Math.max(0, ...samples.map(x => x.rssMiB)), eventLoopP99MaxMs: Math.max(0, ...samples.map(x => x.eventLoopP99Ms)) };
    evidence.stages.push(result); console.log(JSON.stringify(result)); return result;
  }
  const healthy = result => { assert.deepEqual(result.errors, {}); assert.equal(Object.keys(result.statuses).join(), '200'); };
  try {
    await sleep(1100);
    for (const n of [1, 8, 32, 128, 384, 640]) {
      const result=await stage('health-ramp', ready.origin, '/health', n, 3000);
      if(n<=384)healthy(result);
      else { assert.equal(Object.keys(result.statuses).join(),'200');assert.ok(Object.keys(result.errors).every(k=>k==='ECONNRESET')); }
    }
    healthy(await stage('host-authenticated', ready.hostOrigin, '/api/environment', 16, 3000, { Cookie: ready.cookie }));
    await stage('host-over-capacity', ready.hostOrigin, '/api/environment', 48, 3000, { Cookie: ready.cookie });
    const flood = await stage('session-rate-limit', ready.origin, '/v3/client/commands', 32, 3000, { Authorization: 'Bearer ' + ready.clientToken });
    assert.ok(flood.statuses[429] > 0);assert.equal(flood.statuses[200],1200);assert.deepEqual(flood.errors,{});
    healthy(await stage('health-soak', ready.origin, '/health', 32, 30000));
    const recovery = await stage('recovery', ready.origin, '/health', 8, 2000);
    assert.deepEqual(recovery.errors, {}); assert.equal(Object.keys(recovery.statuses).join(), '200');
    // 128 valid but incomplete uploads must close on the body deadline.
    let timeouts = 0;
    const slowStart = performance.now();
    const uploads=Promise.all(Array.from({ length: 128 }, () => new Promise((resolveSocket, reject) => {
      const socket = net.connect(new URL(ready.origin).port, '127.0.0.1'); let data = '';
      const deadline = setTimeout(() => { socket.destroy(); reject(new Error('Slow upload survived')); }, 8000);
      socket.on('connect', () => socket.write(`POST /v3/client/decision HTTP/1.1\r\nHost: ${new URL(ready.origin).host}\r\nAuthorization: Bearer ${ready.clientToken}\r\nContent-Length: 1000\r\n\r\n{`));
      socket.on('data', c => { data += c; }); socket.on('error', reject);
      socket.on('close', () => { clearTimeout(deadline); if (/^HTTP\/1.1 408/.test(data)) timeouts++; resolveSocket(); });
    })));
    const [,during]=await Promise.all([uploads,stage('health-during-slow-uploads',ready.origin,'/health',8,5500)]);healthy(during);
    evidence.slowUploads = { concurrent: 128, timeouts, elapsedMs: Math.round(performance.now() - slowStart) }; assert.equal(timeouts, 128);
    const final = await stage('after-slow-uploads', ready.origin, '/health', 8, 2000);
    healthy(final);
    evidence.metrics = metrics;
    evidence.result = 'passed';
  } catch (error) { evidence.result = 'failed'; evidence.failure = error.message; process.exitCode = 1; }
  finally {
    const exited = new Promise(r => child.once('exit', r));
    child.send({ type: 'stop' });
    const killer = setTimeout(() => child.kill(), 5000); await exited; clearTimeout(killer);
    if (stderr) evidence.workerError = stderr;
    const out = resolve('artifacts/security-local'); await mkdir(out, { recursive: true });
    const filename = join(out, 'load-' + evidence.date.replace(/[:.]/g, '-') + '.json');
    await writeFile(filename, JSON.stringify(evidence, null, 2)); console.log(JSON.stringify({ result: evidence.result, report: filename, slowUploads: evidence.slowUploads }));
  }
}
