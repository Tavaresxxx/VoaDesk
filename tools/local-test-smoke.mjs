import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHost} from '../src/host/server.mjs';

const data = await mkdtemp(join(tmpdir(), 'voadesk-local-test-'));
const out = resolve('artifacts/local-test'); await mkdir(out, {recursive: true});
const host = await createHost({dataDir: data, idleTimeout: 0, environment: {}});
const evidence = {date: new Date().toISOString(), scope: 'localhost, simulated desktop via WebRTC', realWindowsControlValidated: false, crossComputerValidated: false, deployed: false};
const {chromium} = await import(pathToFileURL(resolve(process.env.FAROL_PLAYWRIGHT || '.cache/security-tools/node_modules/playwright/index.mjs')).href);
let browser, page;
const errors = [], sessionCalls = [];
try {
  browser = await chromium.launch({executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--autoplay-policy=no-user-gesture-required']});
  page = await browser.newPage({viewport: {width: 1440, height: 960}});
  await page.addInitScript(() => {
    window.qaPeers = []; window.qaTracks = [];
    const OriginalPeer = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends OriginalPeer {
      constructor(config) {super(config); window.qaPeers.push(this);}
      addTrack(track, ...streams) {window.qaTracks.push(track); return super.addTrack(track, ...streams);}
    };
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {if (new URL(request.url()).pathname.startsWith('/api/session/')) sessionCalls.push(request.url());});
  await page.goto(host.bootstrapUrl);
  // With no operator or pairing service, only the local test can connect.
  await page.waitForFunction(() => document.getElementById('connection-state').textContent === 'Serviço não configurado');
  for (const width of [1440, 760, 390, 320]) {
    await page.setViewportSize({width, height: 960});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'overflow at ' + width);
  }
  await page.setViewportSize({width: 1440, height: 960});
  await page.screenshot({path: join(out, 'inicio.png'), fullPage: true});
  const start = async () => {
    await page.locator('#start-local-test').click();
    await page.waitForFunction(() => document.getElementById('remote-video').videoWidth === 1280 && !document.getElementById('session-media').hidden && !document.getElementById('session-monitor').disabled, null, {timeout: 30000});
    await page.waitForFunction(() => document.getElementById('diagnostic-details').textContent.includes('video/H264'));
    assert.equal(await page.locator('#session-status').textContent(), 'Conectado à tela de testes');
    assert.equal(await page.locator('#local-test-notice').isVisible(), true);
    assert.equal(await page.locator('#session-files').isVisible(), false);
    assert.equal(await page.locator('#task-manager').isVisible(), false);
  };
  const coordinates = async (x, y) => page.locator('#remote-video').evaluate((video, p) => {
    const r = video.getBoundingClientRect(), ratio = video.videoWidth / video.videoHeight;
    const width = Math.min(r.width, r.height * ratio), height = width / ratio;
    return {x: r.x + (r.width - width) / 2 + p.x / 1280 * width, y: r.y + (r.height - height) / 2 + p.y / 720 * height};
  }, {x, y});
  const click = async (x, y) => {const p = await coordinates(x, y); await page.mouse.click(p.x, p.y);};
  const move = async (x, y) => {const p = await coordinates(x, y); await page.mouse.move(p.x, p.y);};
  const notice = text => page.waitForFunction(text => document.getElementById('quality-notice').textContent.includes(text), text);
  const crop = async (x, y, w, h) => page.locator('#remote-video').evaluate((video, r) => {
    const canvas = document.createElement('canvas'); canvas.width = r.w; canvas.height = r.h;
    canvas.getContext('2d').drawImage(video, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h); return canvas.toDataURL();
  }, {x, y, w, h});
  await start();
  const counterBefore = await crop(1136, 164, 65, 35);
  await click(820, 234); await notice('contador atualizado');
  // Wait for feedback to traverse both data and media paths, then compare decoded video pixels.
  await page.waitForTimeout(500);
  assert.notEqual(await crop(1136, 164, 65, 35), counterBefore);
  await click(160, 265); await page.keyboard.insertText(' Ação local ç 🛫'); await notice('Texto recebido');
  await page.keyboard.press('Backspace'); await notice('Tecla recebida');
  await page.keyboard.press('Enter'); await page.keyboard.insertText('Nova linha'); await notice('Texto recebido');
  await page.keyboard.press('Escape');
  assert.notEqual(await page.evaluate(() => document.activeElement.id), 'remote-keyboard');
  await move(170, 170); await page.mouse.down(); await move(200, 195); await page.mouse.up(); await notice('Janela movida');
  await move(800, 450); await page.mouse.down(); await move(900, 500); await move(1060, 480); await page.mouse.up(); await notice('Traço recebido');
  await move(220, 300); await page.mouse.wheel(0, 180); await notice('Rolagem recebida');
  await page.waitForTimeout(500); await page.screenshot({path: join(out, 'tela-interativa.png')});
  await page.locator('#session-zoom').selectOption('150');
  assert.equal(await page.locator('#remote-video').evaluate(video => video.style.width), '1920px');
  await page.locator('#session-zoom').selectOption('fit');
  await page.locator('#reset-local-test').click(); await notice('começar');
  await page.waitForTimeout(500); await page.screenshot({path: join(out, 'teste-reiniciado.png')});
  await page.setViewportSize({width: 390, height: 844});
  assert.equal(await page.locator('#end-session').isVisible(), true);
  assert.equal(await page.locator('#reset-local-test').isVisible(), true);
  await page.screenshot({path: join(out, 'tela-mobile.png')});
  await page.locator('#end-session').click(); await page.waitForFunction(() => document.getElementById('session-panel').hidden);
  assert.equal(await page.locator('#remote-video').evaluate(video => video.srcObject), null);
  assert.equal(await page.evaluate(() => window.qaPeers.every(pc => pc.connectionState === 'closed') && window.qaTracks.every(track => track.readyState === 'ended')), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'start-local-test');
  await page.setViewportSize({width: 1440, height: 960});
  await start(); await page.locator('#end-session').click(); await page.waitForFunction(() => document.getElementById('session-panel').hidden);
  // Cancel immediately while the offer is being prepared, then prove another connection succeeds.
  await page.locator('#start-local-test').click(); await page.locator('#end-session').click();
  await page.waitForFunction(() => document.getElementById('session-panel').hidden, null, {timeout: 20000});
  await start(); await page.evaluate(() => window.dispatchEvent(new Event('voadesk:closing')));
  await page.waitForFunction(() => document.getElementById('session-panel').hidden);
  assert.equal(await page.evaluate(() => window.qaPeers.every(pc => pc.connectionState === 'closed') && window.qaTracks.every(track => track.readyState === 'ended')), true);
  assert.deepEqual(sessionCalls, []); assert.deepEqual(errors, []);
  assert.deepEqual(await readdir(data), []);
  // Authenticated assets inherit the host's existing cookie and CSP protection.
  for (const path of ['/local-test.mjs', '/test-desktop.mjs']) assert.equal((await fetch(host.origin + path)).status, 401);
  Object.assign(evidence, {result: 'passed', codec: 'video/H264', decodedVideoChanges: true, mouseAndKeyboard: true, dragDrawScroll: true, zoom: true, reset: true, cancelAndReconnect: true, hostCloseRevokes: true, sessionServerCalls: 0, localDataFilesCreated: 0, viewports: [1440, 760, 390, 320]});
} catch (error) {
  evidence.result = 'failed'; evidence.failure = error.stack; evidence.pageErrors = errors;
  if (page) {evidence.ui = await page.locator('body').innerText().catch(() => ''); await page.screenshot({path: join(out, 'failure.png')}).catch(() => {});}
  process.exitCode = 1;
} finally {
  await browser?.close(); await host.close(); await rm(data, {recursive: true, force: true});
  await writeFile(join(out, 'report.json'), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence, null, 2));
}
