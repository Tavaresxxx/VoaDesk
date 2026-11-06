import { createPairingService } from '../src/pairing/service.mjs';
import { DeviceRegistry } from '../src/pairing/devices.mjs';
import { createHost } from '../src/host/server.mjs';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const outputDir=resolve('artifacts/voadesk'); await mkdir(outputDir,{recursive:true});
const tempRoot=resolve(tmpdir()), dataDir=await mkdtemp(join(tempRoot,'voadesk-ui-'));
const service=await createPairingService({devices:new DeviceRegistry({file:join(dataDir,'devices.json')})});
const host=await createHost({dataDir:join(dataDir,'host'),idleTimeout:0,pairing:{url:service.origin,token:service.operatorToken},environment:{}});
const evidence={date:new Date().toISOString(),scope:'local-stable-client-identification-and-ui',assertions:[],remoteVideoValidated:false,externalNetworkValidated:false};
let browser;
try {
  const native=await new Promise((ok,fail)=>{
    const proc=spawn(resolve('.cache/native/ClientSmoke.exe'),[service.origin+'/',join(outputDir,'client-redacted.png'),join(dataDir,'native-identity')],{windowsHide:true,env:{...process.env,VOADESK_TEST_OPERATOR_TOKEN:service.operatorToken}});
    let stdout='';const timer=setTimeout(()=>{proc.kill();fail(new Error('Native client timeout'));},30000);
    proc.stdout.on('data',chunk=>stdout+=chunk);proc.stderr.resume();proc.on('error',fail);
    proc.on('close',code=>{clearTimeout(timer);if(code!==0)fail(new Error('Native client failed; no secret output collected.'));else ok(JSON.parse(stdout.trim()));});
  });
  assert.equal(native.sameCodeAfterReopen,true);assert.equal(native.repeatIdentification,true);evidence.native=native;
  evidence.assertions.push('Cliente C# real exibiu o mesmo código após fechar e abrir; identificação repetida executada por HTTP; imagem sem código real.');
  if(!process.env.FAROL_PLAYWRIGHT)throw new Error('Configure FAROL_PLAYWRIGHT.');
  const {chromium}=await import(pathToFileURL(resolve(process.env.FAROL_PLAYWRIGHT)).href);
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1380,height:920}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(host.bootstrapUrl);await page.waitForFunction(()=>!document.getElementById('verify-code').disabled);
  assert.equal(await page.title(),'VoaDesk · Suporte remoto');
  const download=await page.request.get(host.origin+'/downloads/VoaDeskCliente.exe');assert.equal(download.status(),200);assert.match(download.headers()['content-disposition'],/VoaDeskCliente/);assert.ok((await download.body()).length>1024);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'access-code');
  assert.equal(await page.getByText('Laboratório de vídeo').count(),0);assert.equal(await page.locator('#remote-video').evaluate(v=>v.srcObject),null);assert.equal(await page.locator('#session-panel').isHidden(),true);
  assert.equal(await page.locator('.brand img').evaluate(img=>img.complete&&img.naturalWidth>0),true);
  await page.screenshot({path:join(outputDir,'principal-desktop.png'),fullPage:true});
  await page.locator('#add-client').click();await page.waitForFunction(()=>document.activeElement.id==='client-name');
  await page.screenshot({path:join(outputDir,'adicionar-cliente.png'),fullPage:true});
  await page.keyboard.press('Escape');assert.equal(await page.locator('#client-dialog').evaluate(d=>d.open),false);
  const registered=await (await fetch(service.origin+'/v2/clients',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId:randomBytes(16).toString('hex'),secret:randomBytes(32).toString('base64url')})})).json();
  await page.locator('#add-client').click();await page.locator('#client-name').fill('Cliente de demonstração');await page.locator('#client-code').fill(registered.code);await page.locator('#save-client').click();
  await page.waitForFunction(()=>!document.getElementById('client-dialog').open);
  await page.reload();await page.waitForFunction(()=>!document.getElementById('verify-code').disabled);
  assert.equal(await page.locator('.client-item').count(),1);
  await page.locator('.client-item').click();assert.equal(await page.locator('#access-code').inputValue(),registered.code);
  for(let i=0;i<2;i++){await page.locator('#verify-code').click();await page.waitForFunction(()=>document.getElementById('access-message').classList.contains('success'));await page.waitForFunction(()=>!document.getElementById('verify-code').disabled);}
  await fetch(service.origin+'/v2/clients/revoke',{method:'POST',headers:{Authorization:'Bearer '+registered.token},body:'{}'});
  await page.locator('#verify-code').click();await page.waitForFunction(()=>document.getElementById('access-message').textContent.includes('Cliente offline'));
  await page.locator('#add-client').click();await page.locator('#client-name').fill('Outro nome');await page.locator('#client-code').fill(registered.code);await page.locator('#save-client').click();
  await page.waitForFunction(()=>document.getElementById('client-message').textContent.includes('já está'));await page.locator('#cancel-client').click();
  await page.locator('#add-client').click();await page.locator('#client-name').fill('<img src=x onerror="window.__injected=true">');await page.locator('#client-code').fill('3333 3333 3333 3333');await page.locator('#save-client').click();await page.waitForFunction(()=>!document.getElementById('client-dialog').open);
  assert.equal(await page.locator('.client-item img').count(),0);assert.equal(await page.evaluate(()=>window.__injected),undefined);
  await page.locator('#access-code').fill('');
  for(const width of [760,390]){await page.setViewportSize({width,height:980});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:join(outputDir,'principal-'+width+'.png'),fullPage:true,mask:[page.locator('.client-text small')]});}
  assert.deepEqual(errors,[]);evidence.assertions.push('Campo focado na abertura; laboratório removido; modal com Escape; agenda persiste ao recarregar; seleção preenche código; duplicidade rejeitada; nomes exibidos como texto; identificação repetida e cliente offline testados; sem overflow em 390 e 760 pixels.');
  evidence.browser={engine:'Microsoft Edge headless',sandbox:'Playwright default for this executor; application security unchanged'};evidence.result='passed';
} catch(error){evidence.result='failed';evidence.failure=error.message;process.exitCode=1;}
finally{await browser?.close();await host.close();await service.close();assert.equal(dirname(dataDir),tempRoot);await rm(dataDir,{recursive:true,force:true});await writeFile(join(outputDir,'client-smoke.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));}
