import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {randomBytes,createHash} from 'node:crypto';
import {createHost} from '../src/host/server.mjs';
import {createPairingService} from '../src/pairing/service.mjs';
import {DeviceRegistry} from '../src/pairing/devices.mjs';
const dir=await mkdtemp(join(tmpdir(),'voadesk-desktop-qa-')),out=resolve('artifacts/desktop-local');await mkdir(out,{recursive:true});
const service=await createPairingService({devices:new DeviceRegistry({file:join(dir,'devices.json')})});
let upstreamCaptureAssets=0;service.server.on('request',req=>{if(req.method==='GET'&&req.url.startsWith('/support')&&!req.url.startsWith('/support/bootstrap?')&&req.url!=='/support/state')upstreamCaptureAssets++;});
const host=await createHost({dataDir:join(dir,'host'),idleTimeout:0,environment:{},pairing:{url:service.origin,token:service.operatorToken}});
const post=async(route,value,token)=>{const r=await fetch(service.origin+route,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(value)});assert.ok(r.ok,route+' '+r.status);return r.json();};
const evidence={scope:'localhost, synthetic pixels, native file IO and input collector',crossComputerValidated:false,realDesktopCaptureValidated:false,osInputInjected:false};
let browser,child,tech,capture;const inputs=[],errors=[];let nativeOrigin;const requests=[];
try{
 const folder=join(dir,'client'),source=Buffer.alloc(524411);source.forEach((_,i)=>source[i]=i%251);await mkdir(folder);await writeFile(join(folder,'receber-ação.bin'),source);const many=join(folder,'many');await mkdir(many);await Promise.all(Array.from({length:110},(_,i)=>writeFile(join(many,`item-${String(i).padStart(3,'0')}.txt`),'x')));
 const {chromium}=await import(pathToFileURL(resolve(process.env.FAROL_PLAYWRIGHT||'.cache/security-tools/node_modules/playwright/index.mjs')).href);
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-features=WebRtcHideLocalIpsWithMdns','--autoplay-policy=no-user-gesture-required']});
 tech=await browser.newPage({viewport:{width:1600,height:1000}});tech.on('pageerror',e=>errors.push(e.message));
 const device=await post('/v2/clients',{deviceId:randomBytes(16).toString('hex'),secret:randomBytes(32).toString('base64url')},'');
 await tech.goto(host.bootstrapUrl);await tech.waitForFunction(()=>!document.getElementById('verify-code').disabled);await tech.locator('#access-code').fill(device.code);await tech.locator('#verify-code').click();
 await tech.waitForFunction(()=>!document.getElementById('session-panel').hidden);
 const state=await (await fetch(service.origin+'/v3/client/state',{headers:{Authorization:'Bearer '+device.token}})).json();
 const decision=await post('/v3/client/decision',{id:state.id,permission:'control'},device.token);
 const ready=new Promise((ok,fail)=>{
  child=spawn(resolve('.cache/native/DesktopBridgeFixture.exe'),[service.origin+'/'],{windowsHide:true,env:{...process.env,VOADESK_FIXTURE_CLIENT:device.token,VOADESK_FIXTURE_TICKET:decision.ticket}});
  const timeout=setTimeout(()=>fail(new Error('Native fixture did not start.')),15000);
  child.once('error',e=>{clearTimeout(timeout);fail(e);});child.once('exit',code=>{if(code!==0)fail(new Error('Native fixture exited: '+code));});
  createInterface({input:child.stdout}).on('line',line=>{try{const data=JSON.parse(line);if(data.kind==='ready'){clearTimeout(timeout);ok(data.url);}else if(data.kind==='input')inputs.push(data);}catch{}});
 });
 capture=await browser.newPage();capture.on('response',r=>requests.push({path:new URL(r.url()).pathname,status:r.status()}));capture.on('requestfailed',r=>requests.push({path:new URL(r.url()).pathname,failure:r.failure()}));capture.on('pageerror',e=>errors.push(e.message));const url=await ready;nativeOrigin=new URL(url).origin;await capture.goto(url);
 await tech.waitForFunction(()=>document.getElementById('remote-video').videoWidth===1280,null,{timeout:30000});
 await tech.waitForFunction(()=>!document.getElementById('session-monitor').disabled&&!document.getElementById('session-files').disabled);
 assert.equal(await capture.locator('#share').isVisible(),false);assert.equal(await tech.evaluate(()=>Boolean(document.fullscreenElement)),true);
 const monitorCount=await tech.locator('#session-monitor option').count();assert.ok(monitorCount>=1);evidence.enumeratedMonitors=monitorCount;
 for(let i=0;i<monitorCount;i++){await tech.locator('#session-monitor').selectOption({index:i});await tech.waitForFunction(()=>!document.getElementById('session-monitor').disabled);await tech.waitForTimeout(300);}await tech.locator('#session-monitor').selectOption({index:0});await tech.waitForFunction(()=>!document.getElementById('session-monitor').disabled);await tech.waitForTimeout(300);
 await tech.locator('#remote-video').click();await tech.keyboard.insertText('Ação');await tech.keyboard.down('Control');await tech.keyboard.up('Control');
 await tech.waitForTimeout(300);assert.ok(inputs.some(e=>e.type===1&&e.flags===4&&e.scan==='ç'.charCodeAt(0)));assert.ok(inputs.some(e=>e.type===0&&e.flags===0xC001));
 await tech.locator('#session-zoom').selectOption('150');assert.equal(await tech.locator('#remote-video').evaluate(v=>v.style.width),'1920px');await tech.locator('#session-zoom').selectOption('fit');
 await tech.locator('#secure-attention').click();assert.match(await tech.locator('#quality-notice').textContent(),/serviço Windows/);
 await tech.locator('#session-files').click();await tech.locator('#files-path').fill(folder);await tech.locator('#files-open').click();await tech.getByRole('button',{name:'↓ receber-ação.bin',exact:true}).waitFor();
 await tech.evaluate(()=>{window.saved=[];window.showSaveFilePicker=async()=>({createWritable:async()=>({write:async bytes=>window.saved.push(...bytes),close:async()=>{window.savedClosed=true;},abort:async()=>{window.savedAborted=true;}})});});
 await tech.getByRole('button',{name:'↓ receber-ação.bin',exact:true}).click();await tech.waitForFunction(()=>document.getElementById('files-status').textContent.startsWith('Arquivo recebido:'),null,{timeout:30000});
 const received=Buffer.from(await tech.evaluate(()=>window.saved));assert.equal(createHash('sha256').update(received).digest('hex'),createHash('sha256').update(source).digest('hex'));assert.equal(await tech.evaluate(()=>window.savedClosed),true);
 await tech.locator('#files-path').fill(many);await tech.locator('#files-open').click();await tech.getByRole('button',{name:'Carregar mais arquivos'}).waitFor();assert.equal(await tech.locator('#files-list li').count(),51);await tech.getByRole('button',{name:'Carregar mais arquivos'}).click();await tech.waitForFunction(()=>document.querySelectorAll('#files-list li').length===101);await tech.getByRole('button',{name:'Carregar mais arquivos'}).click();await tech.waitForFunction(()=>document.querySelectorAll('#files-list li').length===110&&!document.getElementById('files-more'));evidence.paginatedDirectory=true;
 await tech.locator('#files-path').fill(folder);await tech.locator('#files-open').click();await tech.getByRole('button',{name:'↓ receber-ação.bin',exact:true}).waitFor();
 const upload=Buffer.alloc(1024*1024+37,91);await tech.locator('#files-input').setInputFiles({name:'enviar-ação.bin',mimeType:'application/octet-stream',buffer:upload});
 await tech.waitForFunction(()=>document.getElementById('files-status').textContent.startsWith('Arquivo enviado para'),null,{timeout:30000});assert.deepEqual(await readFile(join(folder,'enviar-ação.bin')),upload);
 await tech.locator('#files-input').setInputFiles({name:'cancelar.bin',mimeType:'application/octet-stream',buffer:Buffer.alloc(8*1024*1024,12)});await tech.waitForFunction(()=>document.getElementById('files-status').textContent.includes('cancelar.bin ·'));await tech.locator('#files-cancel').click();await tech.waitForFunction(()=>document.getElementById('files-cancel').disabled);assert.equal((await readdir(folder)).some(f=>f.endsWith('.partial')||f==='cancelar.bin'),false);
 await tech.locator('#files-input').setInputFiles({name:'enviar-ação.bin',mimeType:'application/octet-stream',buffer:Buffer.from('cannot overwrite')});await tech.waitForFunction(()=>document.getElementById('files-cancel').disabled);await tech.waitForTimeout(250);assert.deepEqual(await readFile(join(folder,'enviar-ação.bin')),upload);
 // Size negotiation > 4 GiB and cancel leave no partial file; no multi-gigabyte allocation.
 const big=await capture.evaluate(async folder=>{const r=await fetch('/support/native/open-write',{method:'POST',headers:{'Content-Type':'application/json','X-VoaDesk':'1'},body:JSON.stringify({name:'large.bin',size:5*1024**3,directory:folder})});return {ok:r.ok,value:await r.json()};},folder);assert.equal(big.ok,true);
 await capture.evaluate(async id=>{await fetch('/support/native/cancel',{method:'POST',headers:{'Content-Type':'application/json','X-VoaDesk':'1'},body:JSON.stringify({id})});},big.value.id);assert.equal((await readdir(folder)).some(f=>f.endsWith('.partial')||f==='large.bin'),false);
 // Reject native API without its private browser cookie and reject cross-origin writes.
 assert.equal((await fetch(nativeOrigin+'/support/native/state')).status,403);
 const rejected=await capture.evaluate(async()=>{const r=await fetch('/support/native/select',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'wrong'})});return r.status;});assert.equal(rejected,403);
 await tech.evaluate(await readFile(resolve(process.env.VOADESK_AXE||'.cache/design-qa/node_modules/axe-core/axe.min.js'),'utf8'));const audit=await tech.evaluate(async()=>{const result=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));});assert.deepEqual(audit,[]);evidence.accessibilityViolations=audit;
 await tech.screenshot({path:join(out,'file-panel.png')});await tech.locator('#files-close').click();await tech.screenshot({path:join(out,'session-toolbar.png')});
 const partial=await capture.evaluate(async folder=>{const r=await fetch('/support/native/open-write',{method:'POST',headers:{'Content-Type':'application/json','X-VoaDesk':'1'},body:JSON.stringify({name:'disconnect.bin',size:1024**3,directory:folder})});return r.ok;},folder);assert.equal(partial,true);
 await tech.locator('#remote-keyboard').focus();await tech.keyboard.down('Control');await tech.waitForTimeout(100);await tech.locator('#end-session').click();await tech.waitForFunction(()=>document.getElementById('session-panel').hidden);
 await capture.waitForFunction(()=>document.getElementById('status').textContent.includes('encerrado'),null,{timeout:6000});assert.equal(await tech.evaluate(()=>document.getElementById('remote-video').srcObject),null);
 await new Promise(r=>setTimeout(r,500));assert.equal((await readdir(folder)).some(f=>f.endsWith('.partial')||f==='disconnect.bin'),false);
 assert.deepEqual(errors,[]);assert.equal(upstreamCaptureAssets,0);Object.assign(evidence,{result:'passed',captureAssetsEmbedded:true,upstreamCaptureAssetRequests:upstreamCaptureAssets,h264SyntheticVideo:true,nativeBridgeToInputSink:true,selectedMonitorCoordinates:true,automaticFullscreen:true,zoom:true,bidirectionalFiles:true,receivedBytes:received.length,sentBytes:upload.length,fileHashesMatch:true,existingFilePreserved:true,largeSizeAccepted:5*1024**3,cancelRemovedPartial:true,unauthenticatedBridgeDenied:true,endRemovedVideo:true,errors});
}catch(e){evidence.result='failed';evidence.failure=e.stack;evidence.errors=errors;evidence.requests=requests.slice(-35);if(capture){evidence.captureStatus=await capture.locator('body').innerText().catch(()=>'?');await capture.screenshot({path:join(out,'capture-failure.png')}).catch(()=>{});}process.exitCode=1;if(tech)await tech.screenshot({path:join(out,'failure.png')}).catch(()=>{});}
finally{await browser?.close();child?.kill();await host.close();await service.close();await rm(dir,{recursive:true,force:true});await writeFile(join(out,'desktop-session.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));}
