import {createHost} from '../src/host/server.mjs';
import {createPairingService} from '../src/pairing/service.mjs';
import {DeviceRegistry} from '../src/pairing/devices.mjs';
import {randomBytes} from 'node:crypto';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {productionAuth} from './production-auth.mjs';
const production=process.argv.includes('--production');
const data=await mkdtemp(join(tmpdir(),'voadesk-support-')),out=resolve('artifacts/support-local');await mkdir(out,{recursive:true});
const auth=production?await productionAuth():null;
const service=production?{origin:auth.origin,operatorToken:auth.token,close:async()=>{}}:await createPairingService({devices:new DeviceRegistry({file:join(data,'devices.json')}),operatorName:'Técnico de teste local'}),host=await createHost({dataDir:join(data,'host'),idleTimeout:0,environment:{},pairing:{url:service.origin,token:service.operatorToken}});
const api=async(route,body,token)=>{const r=await fetch(service.origin+route,{method:body===null?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===null?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};};
const client=(await api('/v2/clients',{deviceId:randomBytes(16).toString('hex'),secret:randomBytes(32).toString('base64url')})).data;
let browser,poll,releaseHeld;const events=[],evidence={date:new Date().toISOString(),source:'synthetic-canvas-1920x1080',scope:production?'production-https-two-pages-one-computer':'two-browser-pages-localhost',realDesktopCaptureValidated:false,realInputInjectionValidated:false,externalNetworkValidated:production,crossComputerValidated:false,assertions:[]};
const waitEvents=async predicate=>{const deadline=Date.now()+5000;while(!predicate()&&Date.now()<deadline)await new Promise(r=>setTimeout(r,30));assert.ok(predicate(),'Comandos esperados não chegaram no prazo de 5 s.');};
try {
 const {chromium}=await import(pathToFileURL(resolve(process.env.FAROL_PLAYWRIGHT)).href);
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-features=WebRtcHideLocalIpsWithMdns','--autoplay-policy=no-user-gesture-required']});
 const tech=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];tech.on('pageerror',e=>errors.push(e.message));
 await tech.goto(host.bootstrapUrl);await tech.waitForFunction(()=>!document.getElementById('verify-code').disabled);
 await tech.locator('#check-connection').click();await tech.waitForFunction(()=>document.getElementById('diagnostic-summary').textContent.includes('Serviço local respondendo'));
 await tech.locator('#access-code').fill(client.code);await tech.locator('#verify-code').click();
 await tech.waitForFunction(()=>!document.getElementById('session-panel').hidden);
 const pending=(await api('/v3/client/state',null,client.token)).data;assert.equal(pending.state,'pending');assert.equal(pending.operatorName,production?'Operador autorizado do VoaDesk':'Técnico de teste local');
 assert.equal((await api('/v3/client/decision',{id:pending.id,permission:'control'},'wrong')).status,403);
 const approved=(await api('/v3/client/decision',{id:pending.id,permission:'control'},client.token)).data;
 poll=setInterval(async()=>{const r=await api('/v3/client/commands',null,client.token);events.push(...(r.data.commands??[]));await api('/v2/clients/status',null,client.token);},300);
 const capture=await browser.newPage();capture.on('pageerror',e=>errors.push(e.message));
 await capture.addInitScript(()=>{
  navigator.mediaDevices.getDisplayMedia=async()=>{
   const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;const ctx=canvas.getContext('2d');let n=0;
   window.testPatternTimer=setInterval(()=>{ctx.fillStyle='#fff';ctx.fillRect(0,0,1920,1080);ctx.fillStyle='#005bff';ctx.fillRect((n++*8)%1800,100,120,70);ctx.font='20px Consolas';ctx.fillStyle='#111';ctx.fillText('Ação, João, café · 12345 · linhas e texto',60,300);},33);
   const stream=canvas.captureStream(30),track=stream.getVideoTracks()[0],original=track.getSettings.bind(track);track.getSettings=()=>({...original(),displaySurface:'monitor'});return stream;
  };
 });
 await capture.goto(service.origin+'/support/bootstrap?ticket='+approved.ticket);
 await capture.waitForFunction(()=>!document.getElementById('share').disabled);await capture.locator('#share').click();
 await tech.waitForFunction(()=>document.getElementById('remote-video').videoWidth===1920,null,{timeout:25000});
 await tech.waitForFunction(()=>document.getElementById('diagnostic-details').textContent.includes('video/H264'),null,{timeout:15000});
 await tech.locator('#session-profile').selectOption('quality');await tech.locator('#auto-quality').uncheck();
 await tech.locator('#remote-keyboard').focus();await tech.keyboard.insertText('Ação, café e ç.');await tech.keyboard.down('Control');await tech.keyboard.press('c');await tech.keyboard.up('Control');await tech.locator('#check-connection').click();
 await waitEvents(()=>events.some(e=>e.type==='text'&&e.text.includes('Ação'))&&events.some(e=>e.type==='keyDown'&&e.code==='ControlLeft')&&events.some(e=>e.type==='release'));
 if(production){
   await tech.locator('#remote-video').hover();const box=await tech.locator('#remote-video').boundingBox(),at=Date.now();
   for(let i=0;i<120;i++){await tech.mouse.move(box.x+box.width*.5+Math.sin(i/5)*25,box.y+box.height*.5+Math.cos(i/5)*25);await tech.waitForTimeout(20);}
   await waitEvents(()=>events.some(e=>e.type==='move'));
   const state=await tech.evaluate(async()=>{const r=await fetch('/api/session/state',{method:'POST',headers:{'X-Farol-Request':'1'},body:'{}'});return r.json();});assert.ok(['approved','active'].includes(state.state));
   evidence.pointerBurst={generatedMoves:120,elapsedMs:Date.now()-at,observedMoves:events.filter(e=>e.type==='move').length,sessionSurvived:true};
 }
 await tech.locator('#guide-mode').click();await tech.locator('#remote-video').click({position:{x:200,y:160}});await waitEvents(()=>events.some(e=>e.type==='guide'));
 await api('/v3/client/decision',{id:pending.id,permission:'view'},client.token);await tech.waitForFunction(()=>document.getElementById('permission-status').textContent==='Somente visualização');
 const before=events.filter(e=>e.type==='text').length;await tech.locator('#remote-keyboard').focus();await tech.keyboard.insertText('não transmitir');await tech.waitForTimeout(500);assert.equal(events.filter(e=>e.type==='text').length,before);
 await tech.screenshot({path:join(out,'atendimento-sintetico.png'),fullPage:true});
 const state=(await api('/v3/operator/state',{},undefined)).status; // Wrong role must never expose state.
 assert.equal(state,403);
 evidence.metrics=await tech.locator('#diagnostic-details').evaluate(dl=>Object.fromEntries([...dl.children].map(el=>[el.querySelector('dt').textContent,el.querySelector('dd').textContent])));evidence.hardware={cpu:(await import('node:os')).cpus()[0].model,memoryGiB:Math.round((await import('node:os')).totalmem()/2**30),browser:browser.version()};
 let observed;const held=new Promise(r=>observed=r),release=new Promise(r=>releaseHeld=r);let delayed=false;
 await tech.route('**/api/session/state',async route=>{const response=await route.fetch();if(!delayed){delayed=true;observed();await release;}await route.fulfill({response});});
 await Promise.race([held,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Estado de teste não interceptado.')),6000))]);
 await tech.locator('#end-session').click();releaseHeld();await tech.waitForFunction(()=>document.getElementById('remote-video').srcObject===null);await tech.waitForTimeout(1200);
 assert.equal(await tech.locator('#session-panel').isHidden(),true);
 assert.equal(await tech.locator('#remote-video').evaluate(v=>v.srcObject===null),true);evidence.staleStateAfterEndIgnored=true;
 await capture.waitForFunction(()=>document.getElementById('status').textContent.includes('encerrado'),null,{timeout:5000});
 const finalState=await tech.evaluate(async()=>{const r=await fetch('/api/session/state',{method:'POST',headers:{'X-Farol-Request':'1'},body:'{}'});return r.json();});assert.equal(finalState.permission,'none');assert.deepEqual(errors,[]);
 evidence.assertions=['Autorização vinculada ao cliente; participante incorreto recusado.','H.264 real entre páginas com codificação, decodificação e apresentação de fonte sintética 1080p.','Preferência manual, diagnóstico e indicação de controle executados.','Texto Unicode, combinação Ctrl+C e liberação percorreram DataChannel e fila local sem injetar no Windows.','Orientação temporária enviada; modo visualizar bloqueou texto.','Encerramento removeu vídeo e revogou permissão nas duas pontas.'];evidence.result='passed';
}catch(e){evidence.result='failed';evidence.failure=e.message;process.exitCode=1;}
finally{releaseHeld?.();clearInterval(poll);if(production)await api('/v2/clients/revoke',{},client.token).catch(()=>{});await browser?.close();await host.close();await service.close();await rm(data,{recursive:true,force:true});const file=production?resolve('artifacts/production-qa/support-smoke.json'):join(out,'support-smoke.json');await mkdir(production?resolve('artifacts/production-qa'):out,{recursive:true});await writeFile(file,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));}
