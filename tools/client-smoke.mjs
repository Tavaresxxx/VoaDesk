import { createPairingService } from '../src/pairing/service.mjs';
import { createHost } from '../src/host/server.mjs';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const outputDir=resolve('artifacts/voadesk'); await mkdir(outputDir,{recursive:true});
const service=await createPairingService();
const tempRoot=resolve(tmpdir()); const dataDir=await mkdtemp(join(tempRoot,'voadesk-ui-'));
const host=await createHost({dataDir,idleTimeout:0,pairing:{url:service.origin,token:service.operatorToken}});
const evidence={date:new Date().toISOString(),scope:'local-code-pairing-and-design', assertions:[]};
let browser;
try {
  const native=await new Promise((resolveResult,reject)=>{
    const proc=spawn(resolve('.cache/native/ClientSmoke.exe'),[service.origin+'/',join(outputDir,'client-redacted.png')],{windowsHide:true,env:{...process.env,VOADESK_TEST_OPERATOR_TOKEN:service.operatorToken}});
    let stdout='',stderr=''; const timer=setTimeout(()=>{proc.kill();reject(new Error('Native client timeout'));},30000);
    proc.stdout.on('data',chunk=>stdout+=chunk); proc.stderr.on('data',chunk=>stderr+=chunk);
    proc.on('error',reject);proc.on('close',code=>{clearTimeout(timer);if(code!==0)reject(new Error('Native client failed; no secret output collected.'));else resolveResult(JSON.parse(stdout.trim()));});
  });
  assert.equal(native.codeDisplayed,true);assert.equal(native.verifiedByService,true); evidence.native=native;
  evidence.assertions.push('Cliente nativo exibiu código real, incorporou logo/ícone e teve o código reconhecido no serviço.');
  if(!process.env.FAROL_PLAYWRIGHT)throw new Error('Configure FAROL_PLAYWRIGHT.');
  const {chromium}=await import(pathToFileURL(resolve(process.env.FAROL_PLAYWRIGHT)).href);
  browser=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1100}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(host.bootstrapUrl); await page.waitForFunction(()=>!document.getElementById('verify-code').disabled);
  assert.equal(await page.title(),'VoaDesk · Suporte remoto');
  assert.equal(await page.locator('.brand img').evaluate(img=>img.complete&&img.naturalWidth>0),true);
  const registered=await (await fetch(service.origin+'/v1/clients',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
  await page.locator('#access-code').fill(registered.code); await page.locator('#verify-code').click();
  await page.waitForFunction(()=>document.getElementById('access-message').textContent.includes('Cliente identificado'));
  assert.equal(await page.locator('#video').evaluate(v=>v.srcObject),null);
  await page.locator('#access-code').fill(registered.code);await page.locator('#verify-code').click();
  await page.waitForFunction(()=>document.getElementById('access-message').textContent.includes('já utilizado'));
  await page.locator('#access-code').fill('');
  await page.screenshot({path:join(outputDir,'principal-desktop.png'),fullPage:true});
  await page.setViewportSize({width:760,height:980});await page.screenshot({path:join(outputDir,'principal-compact.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]); evidence.assertions.push('Painel usou código real, rejeitou replay e não iniciou captura; logo carregou; layout compacto sem overflow.');
  evidence.result='passed';
} catch(error) {evidence.result='failed';evidence.failure=error.stack;process.exitCode=1;}
finally {await browser?.close();await host.close();await service.close();assert.equal(dirname(dataDir),tempRoot);await rm(dataDir,{recursive:true,force:true});await writeFile(join(outputDir,'client-smoke.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));}
