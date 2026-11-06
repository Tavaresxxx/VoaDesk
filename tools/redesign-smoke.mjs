import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createHost} from '../src/host/server.mjs';
import {createPairingService} from '../src/pairing/service.mjs';
import {DeviceRegistry} from '../src/pairing/devices.mjs';
const data=await mkdtemp(join(tmpdir(),'voadesk-design-')),out=resolve('artifacts/redesign-local');await mkdir(out,{recursive:true});
const service=await createPairingService({devices:new DeviceRegistry({file:join(data,'devices.json')}),operatorName:'Técnico de demonstração'});
let opens=0;
const host=await createHost({dataDir:join(data,'host'),idleTimeout:0,environment:{},pairing:{url:service.origin,token:service.operatorToken},launchClient:async url=>{assert.equal(url,service.origin);opens++;}});
const evidence={date:new Date().toISOString(),scope:'localhost-only',crossComputerValidated:false,osCaptureValidated:false,accessibility:[],viewports:[]};
const {chromium}=await import(pathToFileURL(resolve(process.env.FAROL_PLAYWRIGHT||'.cache/security-tools/node_modules/playwright/index.mjs')));
const axeSource=await readFile(resolve(process.env.VOADESK_AXE||'.cache/design-qa/node_modules/axe-core/axe.min.js'),'utf8');
let browser,keepAlive;
const audit=async(page,name)=>{
 await page.evaluate(axeSource);
 const violations=await page.evaluate(async()=>{const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}));});
 evidence.accessibility.push({name,violations});assert.deepEqual(violations,[],name+' tem falhas de acessibilidade');
};
try{
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:960},colorScheme:'dark'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(host.bootstrapUrl);await page.waitForFunction(()=>!document.getElementById('verify-code').disabled);
 assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor),'rgb(255, 255, 255)');
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'verify-code');await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'access-code');
 await page.locator('#open-receiver').click();await page.waitForFunction(()=>document.getElementById('receiver-message').textContent.includes('janela VoaDesk'));assert.equal(opens,1);
 await audit(page,'início');
 for(const width of [1440,1024,760,390,320]){
  await page.setViewportSize({width,height:960});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'overflow em '+width);
  const clear=await page.evaluate(()=>{const art=document.querySelector('.brand-space').getBoundingClientRect();return [...document.querySelectorAll('.welcome h1,.welcome p,.welcome .eyebrow,.intentions input,.intentions button')].every(el=>{const r=el.getBoundingClientRect();return r.right<=art.left||r.left>=art.right||r.bottom<=art.top||r.top>=art.bottom;});});assert.equal(clear,true,'marca-dagua fora do conteúdo');
  await page.screenshot({path:join(out,'inicio-'+width+'.png'),fullPage:true});evidence.viewports.push(width);
 }
 await page.setViewportSize({width:1440,height:960});
 await page.locator('#access-code').fill('ABC');await page.locator('#verify-code').click();assert.equal(await page.locator('#access-code').getAttribute('aria-invalid'),'true');await audit(page,'erro no código');
 await page.locator('.nav-item[data-page=clients]').click();await audit(page,'clientes vazios');
 await page.locator('#add-client').click();await audit(page,'diálogo salvar cliente');await page.screenshot({path:join(out,'salvar-cliente.png')});await page.keyboard.press('Escape');
 await page.locator('#add-client').click();await page.locator('#client-name').fill('Equipe de teste');await page.locator('#client-code').fill('3333 3333 3333 3333');await page.locator('#save-client').click();await page.waitForFunction(()=>!document.getElementById('client-dialog').open);
 await audit(page,'clientes salvos');await page.screenshot({path:join(out,'clientes.png'),mask:[page.locator('.client-text small')]});
 await page.locator('#client-search').fill('não encontrado');assert.equal(await page.locator('.client-item').count(),0);assert.equal(await page.locator('#saved-status').isVisible(),true);
 await page.locator('#client-search').fill('equipe');assert.equal(await page.locator('.client-item').count(),1);await page.locator('#client-search').fill('');evidence.clientSearchValidated=true;
 await page.locator('.nav-item[data-page=help]').click();await audit(page,'ajuda e diagnóstico');await page.screenshot({path:join(out,'ajuda.png'),fullPage:true});
 await page.locator('.nav-item[data-page=home]').click();
 const client=await(await fetch(service.origin+'/v2/clients',{method:'POST',body:JSON.stringify({deviceId:randomBytes(16).toString('hex'),secret:randomBytes(32).toString('base64url')})})).json();
 keepAlive=setInterval(()=>void fetch(service.origin+'/v3/client/commands',{headers:{Authorization:'Bearer '+client.token}}).catch(()=>{}),1000);
 await page.locator('#access-code').fill(client.code);await page.locator('#verify-code').click();await page.waitForFunction(()=>document.getElementById('waiting-title').textContent==='Aguardando o cliente aceitar');
 await audit(page,'espera por consentimento');await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.waiting-symbol').evaluate(el=>getComputedStyle(el,'::after').animationName),'none');
 await page.screenshot({path:join(out,'espera.png')});
 const pending=service.sessions.current;
 const accepted=await(await fetch(service.origin+'/v3/client/decision',{method:'POST',headers:{Authorization:'Bearer '+client.token},body:JSON.stringify({id:pending.id,permission:'control'})})).json();
 const capture=await browser.newPage({viewport:{width:800,height:700},colorScheme:'dark'});capture.on('pageerror',e=>errors.push(e.message));
 await capture.addInitScript(()=>{navigator.mediaDevices.getDisplayMedia=async()=>{throw new DOMException('Cancelled','NotAllowedError');};});
 await capture.goto(service.origin+'/support/bootstrap?ticket='+accepted.ticket);await capture.waitForFunction(()=>!document.getElementById('share').disabled);assert.equal(await capture.locator('#share').isVisible(),true);
 assert.equal(await capture.locator('.capture-header img').evaluate(img=>img.complete&&img.naturalWidth>0),true);await audit(capture,'compatibilidade do cliente legado');await capture.screenshot({path:join(out,'escolher-tela.png'),fullPage:true});
 await capture.setViewportSize({width:320,height:780});assert.equal(await capture.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await capture.screenshot({path:join(out,'escolher-tela-mobile.png'),fullPage:true});
 await capture.locator('#share').click();await capture.waitForFunction(()=>document.body.dataset.state==='ended');assert.match(await capture.locator('#status').textContent(),/cancelada/);await audit(capture,'compartilhamento legado cancelado');
 await page.waitForFunction(()=>document.getElementById('session-panel').hidden);
 await page.route('**/api/pairing/config',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({available:false,remote:false,receiverAvailable:false,version:'0.5.0'})}));
 await page.reload();await page.waitForFunction(()=>document.getElementById('connection-state').textContent==='Serviço não configurado');assert.equal(await page.locator('#verify-code').isDisabled(),true);await audit(page,'serviço indisponível');
 assert.deepEqual(errors,[]);evidence.receiverLaunchValidated=true;evidence.keyboardValidated=true;evidence.reducedMotionValidated=true;evidence.watermarkSeparatedFromContent=true;evidence.legacyCaptureCancellationValidated=true;evidence.result='passed';
}catch(error){evidence.result='failed';evidence.failure=error.message;process.exitCode=1;}
finally{clearInterval(keepAlive);await browser?.close();await host.close();await service.close();assert.equal(dirname(data),resolve(tmpdir()));await rm(data,{recursive:true,force:true});await writeFile(join(out,'report.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));}
