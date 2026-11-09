import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createHost} from '../src/host/server.mjs';
import {createPairingService} from '../src/pairing/service.mjs';
import {DeviceRegistry} from '../src/pairing/devices.mjs';

const dir = await mkdtemp(join(tmpdir(), 'voadesk-search-')), out = resolve('artifacts/search-local');
await mkdir(out, {recursive: true});
const service = await createPairingService({devices: new DeviceRegistry({file: join(dir, 'devices.json')})});
const client = await (await fetch(service.origin + '/v2/clients', {method: 'POST', body: JSON.stringify({deviceId: randomBytes(16).toString('hex'), secret: randomBytes(32).toString('base64url')})})).json();
const entries = [
  {name: 'São José — Recepção', code: '2345ABCD6789EFGH'},
  {name: 'Oficina Ação', code: 'ABCD2345EFGH6789'},
  {name: 'São José', code: '6789EFGH2345ABCD'},
  {name: '<img src=x onerror=alert(1)>', code: '3333333333333333'},
  {name: 'Atendimento QA', code: client.code},
  ...Array.from({length: 8}, (_, i) => ({name: 'Unidade ' + i, code: String.fromCharCode(65 + i).repeat(16)}))
].map((item, i) => ({id: 'qa-' + i, ...item}));
const dataDir = join(dir, 'host'); await mkdir(dataDir);
const savedFile = join(dataDir, 'saved-clients.json'); await writeFile(savedFile, JSON.stringify(entries));
const before = await readFile(savedFile);
const host = await createHost({dataDir, idleTimeout: 0, environment: {}, pairing: {url: service.origin, token: service.operatorToken}});
const {chromium} = await import(pathToFileURL(resolve(process.env.FAROL_PLAYWRIGHT || '.cache/security-tools/node_modules/playwright/index.mjs')).href);
const axe = await readFile(resolve('.cache/design-qa/node_modules/axe-core/axe.min.js'), 'utf8');
const evidence = {date: new Date().toISOString(), scope: 'VoaDesk localhost with synthetic contacts', anydeskRuntimeObserved: false, crossComputerValidated: false, deployed: false};
let browser, page, keepAlive;
const errors = [], requests = [], network = [];
try {
  keepAlive = setInterval(() => void fetch(service.origin + '/v3/client/commands', {headers: {Authorization: 'Bearer ' + client.token}}).catch(() => {}), 1000);
  browser = await chromium.launch({executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true});
  page = await browser.newPage({viewport: {width: 1440, height: 960}});
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {network.push(request.url()); if (new URL(request.url()).pathname === '/api/session/request') requests.push(request.postDataJSON());});
  await page.goto(host.bootstrapUrl); await page.waitForFunction(() => !document.getElementById('verify-code').disabled);
  const input = page.locator('#access-code'), options = page.locator('#access-results [role=option]');
  await input.fill('SAO JOSE'); assert.equal(await options.count(), 2);
  assert.equal(await options.first().locator('strong').textContent(), 'São José');
  await page.evaluate(axe);
  const violations = await page.evaluate(async () => (await window.axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa']}})).violations.map(v => ({id: v.id, nodes: v.nodes.map(n => n.target)})));
  assert.deepEqual(violations, []); evidence.accessibility = violations;
  await page.screenshot({path: join(out, 'sugestoes-desktop.png'), fullPage: true});
  await input.press('ArrowDown'); assert.equal(await input.getAttribute('aria-activedescendant'), 'access-result-0');
  await input.press('ArrowDown'); assert.equal(await input.getAttribute('aria-activedescendant'), 'access-result-1');
  await input.press('ArrowUp'); await input.press('Enter');
  assert.equal((await input.inputValue()).replaceAll(' ', ''), '6789EFGH2345ABCD');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'verify-code');
  assert.equal(await input.getAttribute('aria-expanded'), 'false'); assert.equal(requests.length, 0);
  await input.fill('acao'); await input.focus(); await input.press('ArrowUp'); await input.press('Enter');
  assert.equal((await input.inputValue()).replaceAll(' ', ''), 'ABCD2345EFGH6789'); assert.equal(requests.length, 0);
  await input.fill('2345-abcd 6789-efgh'); await input.focus(); assert.equal(await options.count(), 1);
  await options.first().click(); assert.equal((await input.inputValue()).replaceAll(' ', ''), '2345ABCD6789EFGH');
  await input.fill('Unidade'); await input.focus(); assert.equal(await options.count(), 6);
  assert.match(await page.locator('.search-group').textContent(), /6 de 8/);
  await page.locator('#access-search-field').selectOption('name');
  await page.locator('#show-all-search').click();
  assert.equal(await page.locator('#client-search').inputValue(),'Unidade');
  assert.equal(await page.locator('.client-item').count(),8);
  assert.equal(await page.locator('#client-search-field').inputValue(),'name');
  assert.equal(requests.length,0);
  await page.locator('.nav-item[data-page=home]').click();
  await input.fill('2345');await page.locator('#access-search-field').selectOption('name');
  assert.equal(await options.count(),0);assert.equal(await page.locator('#access-search-empty').isVisible(),true);
  await page.locator('#access-search-field').selectOption('code');
  assert.equal(await options.count(),3);assert.match(await options.first().locator('.search-reason').textContent(),/código/);
  await page.locator('#access-search-field').selectOption('all');
  await input.fill('Unidade');await input.focus();
  await input.press('Escape'); assert.equal(await input.getAttribute('aria-expanded'), 'false');
  await input.press('ArrowDown'); assert.equal(await options.first().getAttribute('aria-selected'), 'true');
  await input.press('Tab'); assert.equal(await input.getAttribute('aria-expanded'), 'false');
  await input.fill('cliente inexistente'); await input.focus();
  assert.equal(await page.locator('#access-search-empty').isVisible(), true);
  await page.locator('#verify-code').click(); assert.equal(await input.getAttribute('aria-invalid'), 'true'); assert.equal(requests.length, 0);
  await input.fill('<img'); await input.focus(); assert.equal(await options.count(), 1);
  assert.equal(await page.locator('#access-results img').count(), 0); assert.equal(await options.first().locator('strong').textContent(), entries[3].name);
  await page.locator('#clear-access-search').click(); assert.equal(await input.inputValue(), '');
  assert.equal(await page.locator('#clear-access-search').isVisible(), false); assert.equal(await input.getAttribute('aria-invalid'), null);
  for (const width of [760, 390, 320]) {
    await page.setViewportSize({width, height: 960}); await input.fill('recepcao'); await input.focus();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const rect = await page.locator('#access-search-panel').boundingBox(); assert.ok(rect.x >= 0 && rect.x + rect.width <= width);
    await page.screenshot({path: join(out, 'sugestoes-' + width + '.png'), fullPage: true});
  }
  await page.setViewportSize({width: 1440, height: 960});
  await page.locator('.nav-item[data-page=clients]').click();
  await page.locator('#client-search').fill('recepcao'); assert.equal(await page.locator('.client-item').count(), 1);
  await page.locator('#client-search-field').selectOption('code');assert.equal(await page.locator('.client-item').count(),0);
  await page.locator('#client-search-field').selectOption('name');assert.equal(await page.locator('.client-item').count(),1);
  await page.locator('#client-search-field').selectOption('all');
  await page.locator('#client-search').fill('2345-abcd 6789-efgh'); assert.equal(await page.locator('.client-item').count(), 1);
  await page.locator('#client-search').fill('naoexiste'); assert.equal(await page.locator('#saved-status').isVisible(), true);
  assert.equal(requests.length, 0);
  await page.locator('.nav-item[data-page=home]').click();
  await input.fill('Atendimento QA'); await input.press('ArrowDown'); await input.press('Enter'); assert.equal(requests.length, 0);
  await page.locator('#verify-code').click();
  await page.waitForFunction(() => document.getElementById('waiting-title').textContent === 'Aguardando o cliente aceitar');
  assert.equal(requests.length, 1); assert.deepEqual(requests[0], {code: client.code.replaceAll(' ', '')});
  const state = await (await fetch(service.origin + '/v3/client/state', {headers: {Authorization: 'Bearer ' + client.token}})).json();
  assert.equal(state.permission, 'none');
  await fetch(service.origin + '/v3/client/decision', {method: 'POST', headers: {Authorization: 'Bearer ' + client.token}, body: JSON.stringify({id: state.id, permission: 'deny'})});
  await page.waitForFunction(() => document.getElementById('session-panel').hidden);
  // A failed agenda load must not be reported as a successful search with zero contacts.
  await page.route('**/api/saved-clients', route => route.fulfill({status: 503, contentType: 'application/json', body: '{}'}));
  await page.reload(); await page.waitForFunction(() => !document.getElementById('verify-code').disabled);
  await input.fill('recepcao'); await input.focus();
  assert.equal(await input.getAttribute('aria-expanded'), 'false');
  assert.match(await page.locator('#access-search-status').textContent(), /indisponíveis/);
  // A full code still goes through the existing explicit request flow.
  await input.fill(client.code); await page.locator('#verify-code').click();
  await page.waitForFunction(() => document.getElementById('waiting-title').textContent === 'Aguardando o cliente aceitar');
  assert.equal(requests.length, 2); await page.locator('#end-session').click();
  await page.waitForFunction(() => document.getElementById('session-panel').hidden);
  assert.deepEqual(await readFile(savedFile), before); assert.deepEqual(errors, []);
  assert.equal(network.every(url => new URL(url).origin === host.origin), true);
  assert.equal((await fetch(host.origin + '/client-search.mjs')).status, 401);
  Object.assign(evidence, {result: 'passed', accentAndCodeSearch: true, exactAndStableRanking: true, keyboardAndPointer: true, suggestionsLimitedTo: 6, allResultsReachable: true, fieldFiltersAndReasons: true, safeTextRendering: true, noSessionRequestDuringSearch: true, explicitConsentPreserved: true, loadFailureAndDirectCode: true, addressBookUnchanged: true, externalUiRequests: 0, viewports: [1440, 760, 390, 320]});
} catch (error) {
  evidence.result = 'failed'; evidence.failure = error.stack; evidence.pageErrors = errors; process.exitCode = 1;
  if (page) {evidence.ui = await page.locator('body').innerText().catch(() => ''); await page.screenshot({path: join(out, 'failure.png')}).catch(() => {});}
} finally {
  clearInterval(keepAlive); await browser?.close(); await host.close(); await service.close(); await rm(dir, {recursive: true, force: true});
  await writeFile(join(out, 'report.json'), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence, null, 2));
}
