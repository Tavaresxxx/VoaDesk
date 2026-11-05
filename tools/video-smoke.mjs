// Integration evidence. Uses a local Playwright install supplied explicitly; no network/install.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHost } from '../src/host/server.mjs';

const playwrightPath = process.env.FAROL_PLAYWRIGHT;
if (!playwrightPath) throw new Error('Defina FAROL_PLAYWRIGHT para o caminho absoluto de playwright/index.mjs. Consulte docs/validation.md.');
const { chromium } = await import(pathToFileURL(resolve(playwrightPath)).href);
const dataDir = await mkdtemp(join(tmpdir(), 'farol-video-'));
const host = await createHost({ dataDir, idleTimeout: 0 });
const errors = [];
const artifacts = resolve(process.env.FAROL_ARTIFACT_DIR ?? 'artifacts'); await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.FAROL_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: process.env.FAROL_HEADED !== '1', args: ['--disable-extensions', '--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, acceptDownloads: true });
const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
const evidence = { date: new Date().toISOString(), test: 'synthetic-sdr-h264-local-loopback', headless: process.env.FAROL_HEADED !== '1', browser: browser.version(), assertions: [], profiles: [], errors };
async function exportReport() {
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export').click();
  const stream = await (await downloadPromise).createReadStream(); let body = ''; for await (const chunk of stream) body += chunk;
  return JSON.parse(body);
}
try {
  await page.goto(host.bootstrapUrl);
  await page.waitForFunction(() => !document.getElementById('environment').textContent.includes('Consultando'));
  assert.equal(await page.locator('#start').isDisabled(), true);
  await page.locator('#consent').check();
  await page.locator('#start').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'Ensaio local ativo', null, { timeout: 25000 });
  await page.waitForTimeout(5500);
  evidence.assertions.push('Consentimento obrigatório; fonte sintética percorreu encode/decode/apresentação.');
  for (const profile of ['quality', 'smooth', 'balanced']) {
    await page.locator('#profile').selectOption(profile);
    await page.waitForTimeout(5500);
    const report = await exportReport(); const last = report.samples.at(-1);
    assert.equal(last.codec.toLowerCase(), 'video/h264'); assert.ok(last.encodedFrames > 0); assert.ok(last.decodedFrames > 0); assert.ok(last.presentationCallbacks > 0);
    evidence.profiles.push({ profile, sample: last });
    if (profile === 'quality') {
      const framePng = await page.locator('#video').evaluate(video => { const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext('2d').drawImage(video, 0, 0); return canvas.toDataURL('image/png').split(',')[1]; });
      await writeFile(join(artifacts, 'synthetic-quality-1080.png'), Buffer.from(framePng, 'base64'));
    }
  }
  await page.locator('#diagnostic-toggle').click();
  await page.screenshot({ path: join(artifacts, 'video-synthetic.png'), fullPage: true });
  await page.locator('#one').click(); assert.equal(await page.locator('#one').getAttribute('aria-pressed'), 'true');
  const physical = await page.locator('#video').evaluate(v => ({ outputWidth: v.getBoundingClientRect().width * devicePixelRatio, videoWidth: v.videoWidth }));
  assert.ok(Math.abs(physical.outputWidth - physical.videoWidth) < 1);
  await page.locator('#fit').click();
  await page.locator('#fullscreen').click();
  await page.waitForFunction(() => document.fullscreenElement?.id === 'viewer');
  assert.ok(await page.locator('#stop').isVisible());
  await page.evaluate(() => document.exitFullscreen());
  evidence.assertions.push('Tela cheia mantém botão Encerrar acessível.');
  const soak = Number(process.env.FAROL_SOAK_SECONDS ?? 0);
  if (soak > 0) {
    evidence.soak = { requestedSeconds: soak, started: new Date().toISOString(), points: [] };
    const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
    for (let elapsed = 0; elapsed < soak; elapsed += 30) {
      await page.waitForTimeout(Math.min(30, soak - elapsed) * 1000);
      const metrics = await cdp.send('Performance.getMetrics');
      evidence.soak.points.push({ elapsedSeconds: Math.min(elapsed + 30, soak), metrics: metrics.metrics.filter(m => ['JSHeapUsedSize', 'JSHeapTotalSize', 'Documents', 'Nodes'].includes(m.name)) });
      console.log(`Ensaio sintético: ${Math.min(elapsed + 30, soak)} / ${soak}s`);
    }
    evidence.soak.ended = new Date().toISOString();
  }
  const report = await exportReport();
  await writeFile(join(artifacts, 'video-local-raw.json'), JSON.stringify(report, null, 2));
  await page.locator('#stop').click();
  await page.waitForFunction(() => document.getElementById('history').textContent.includes('Encerrado por você'));
  assert.equal(await page.locator('#video').evaluate(v => v.srcObject), null);
  assert.equal(await page.locator('#start').isDisabled(), true);
  evidence.assertions.push('Escala 1:1 respeitou pixels físicos; stop removeu stream; histórico persistido; consentimento renovado.');
  // Actual session class cancellation race: a late capture must be stopped, never attached.
  const race = await page.evaluate(async () => {
    const { LocalVideoSession } = await import('/video/pipeline.mjs');
    const { createPattern } = await import('/video/pattern.mjs');
    const video = document.createElement('video');
    const acquired = createPattern(); let resolveSource;
    const s = new LocalVideoSession(video);
    const started = s.start({ source: () => new Promise(r => { resolveSource = r; }), kind: 'pattern' });
    s.stop(); resolveSource(acquired); await started;
    return { state: s.state, tracks: acquired.stream.getTracks().map(t => t.readyState), attached: video.srcObject !== null, peers: Boolean(s.tx || s.rx) };
  });
  assert.deepEqual(race, { state: 'ended', tracks: ['ended'], attached: false, peers: false });
  evidence.assertions.push('Captura atrasada após cancelamento foi liberada sem abrir peers.');
  // Restart guards against resources/state leaking across sessions.
  for (let i = 0; i < 2; i++) {
    await page.locator('#consent').check(); await page.locator('#start').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'Ensaio local ativo', null, { timeout: 25000 });
    await page.locator('#stop').click();
  }
  evidence.assertions.push('Duas reinicializações adicionais concluídas.');
  await page.locator('#consent').check(); await page.locator('#start').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'Ensaio local ativo', null, { timeout: 25000 });
  await host.close();
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'Ensaio encerrado', null, { timeout: 8000 });
  assert.equal(await page.locator('#video').evaluate(v => v.srcObject), null);
  evidence.assertions.push('Queda do host local encerrou vídeo em até 8 segundos e liberou stream.');
  assert.deepEqual(errors, []);
  evidence.result = 'passed';
} catch (error) {
  evidence.result = 'failed'; evidence.failure = error.stack;
  await page.screenshot({ path: join(artifacts, 'video-failure.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(join(artifacts, 'video-smoke.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ result: evidence.result, browser: evidence.browser, failure: evidence.failure, profiles: evidence.profiles.map(p => ({ profile: p.profile, codec: p.sample.codec, encodedFps: p.sample.encodedFps, decodedFps: p.sample.decodedFps, encoder: p.sample.encoder })) }, null, 2));
  await browser.close(); await host.close(); await rm(dataDir, { recursive: true, force: true });
}
