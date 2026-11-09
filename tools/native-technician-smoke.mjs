import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createInterface} from 'node:readline';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
const dir=await mkdtemp(join(tmpdir(),'voadesk-native-window-')),out=resolve('artifacts/native-technician');await mkdir(out,{recursive:true});
const evidence={date:new Date().toISOString(),scope:'real WinForms/WebView2, localhost, synthetic capture and input collector',crossComputerValidated:false,realDesktopCaptureValidated:false,osInputInjected:false,deployValidated:false};
let shell,bridge,browser,capture;const events=[],errors=[];let nextId=0;const pending=new Map();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitExit(child,label,timeoutMs=15000){
 if(child.exitCode!==null){assert.equal(child.exitCode,0,label);return;}
 await new Promise((ok,fail)=>{const timeout=setTimeout(()=>{child.removeListener('exit',done);fail(new Error(label+' não encerrou no prazo.'));},timeoutMs);function done(code){clearTimeout(timeout);code===0?ok():fail(new Error(label+' encerrou com código '+code));}child.once('exit',done);});
}
function startShell(){return new Promise((ok,fail)=>{shell=spawn(resolve('.cache/native/TechnicianFixture.exe'),[process.env.VOADESK_QA_APP_ROOT||resolve('.'),join(dir,'data')],{windowsHide:true,stdio:['pipe','pipe','pipe']});const timeout=setTimeout(()=>fail(new Error('A janela não iniciou em 30 s.')),30000);shell.once('error',fail);createInterface({input:shell.stdout}).on('line',line=>{let data;try{data=JSON.parse(line);}catch{return;}if(data.kind==='ready'){clearTimeout(timeout);ok(data);}else if(data.kind==='failed'){clearTimeout(timeout);fail(new Error(data.message));}else if(data.id){const task=pending.get(data.id);if(task){clearTimeout(task.timeout);pending.delete(data.id);data.error?task.fail(new Error(data.error)):task.ok(data.value);}}});shell.once('exit',()=>{for(const task of pending.values()){clearTimeout(task.timeout);task.fail(new Error('A janela foi encerrada.'));}pending.clear();});});}
function rpc(action,values={}){return new Promise((ok,fail)=>{const id=++nextId,timeout=setTimeout(()=>{pending.delete(id);fail(new Error('Timeout em '+action));},process.argv.includes('--pickers')?180000:20000);pending.set(id,{ok,fail,timeout});shell.stdin.write(JSON.stringify({id,action,...values})+'\n');});}
const evaluate=(script,gesture=false)=>rpc('eval',{script,gesture}),cdp=(method,parameters={})=>rpc('cdp',{method,parameters});
async function wait(script,timeout=15000){const until=Date.now()+timeout;while(Date.now()<until){if(await evaluate(script))return;await sleep(100);}throw new Error('Condição não chegou: '+script);}
async function api(origin,path,value,token){const r=await fetch(origin+path,{method:value===null?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(value===null?{}:{body:JSON.stringify(value)})});assert.ok(r.ok,path+' HTTP '+r.status);return r.json();}
async function request(code){await evaluate(`document.getElementById('access-code').value=${JSON.stringify(code)};document.getElementById('access-form').requestSubmit();true`,true);await wait(`document.getElementById('waiting-title').textContent==='Aguardando o cliente aceitar'`);}
try{
 const ready=await startShell();evidence.runtime=ready.version;await wait(`!document.getElementById('verify-code').disabled`);assert.equal((await rpc('state')).hostRunning,true);assert.equal((await rpc('state')).nodeWindow,0);if(process.env.VOADESK_QA_APP_ROOT){assert.equal(resolve((await rpc('state')).hostExecutable),resolve(process.env.VOADESK_QA_APP_ROOT,'runtime/node.exe'));evidence.portableNodeValidated=true;}
 const before=await rpc('state');await promisify(execFile)(resolve('dist/VoaDeskTecnico.exe'),[],{windowsHide:true,timeout:10000});await sleep(200);assert.equal((await rpc('state')).reveals,before.reveals+1);evidence.secondInstanceRevealedExistingWindow=true;
 assert.equal(await evaluate(`typeof window.showSaveFilePicker`),'function');evidence.savePickerApiAvailable=true;
 // The self-test must also work inside the shipped WebView2, then release the regular session UI.
 await evaluate(`document.getElementById('start-local-test').click();true`,true);
 await wait(`document.getElementById('remote-video').videoWidth===1280&&!document.getElementById('session-media').hidden&&!document.getElementById('session-monitor').disabled`,30000);
 await wait(`document.getElementById('diagnostic-details').textContent.includes('video/H264')`);
 assert.equal(await evaluate(`document.getElementById('session-status').textContent`),'Conectado à tela de testes');
 const testPoint=await evaluate(`(()=>{const video=document.getElementById('remote-video'),r=video.getBoundingClientRect(),w=Math.min(r.width,r.height*1280/720),h=w*720/1280;return {x:r.x+(r.width-w)/2+160/1280*w,y:r.y+(r.height-h)/2+265/720*h};})()`);
 await cdp('Input.dispatchMouseEvent',{type:'mousePressed',...testPoint,button:'left',clickCount:1});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',...testPoint,button:'left',clickCount:1});await cdp('Input.insertText',{text:' Teste WebView2 ação ç'});
 await wait(`document.getElementById('quality-notice').textContent.includes('Texto recebido')`);
 await rpc('screenshot',{path:join(out,'tela-testes-local.png')});
 await evaluate(`document.getElementById('reset-local-test').click();true`,true);await wait(`document.getElementById('quality-notice').textContent.includes('começar')`);
 await evaluate(`document.getElementById('end-session').click();true`,true);await wait(`document.getElementById('session-panel').hidden`);
 assert.equal(await evaluate(`document.getElementById('remote-video').srcObject===null&&document.activeElement.id==='start-local-test'`),true);evidence.localSelfTestH264AndInputInWebView2=true;
 const deviceId=randomBytes(16).toString('hex'),secret=randomBytes(32).toString('base64url'),client=await api(ready.pairingOrigin,'/v2/clients',{deviceId,secret});
 await evaluate(`fetch('/api/saved-clients',{method:'POST',headers:{'X-Farol-Request':'1','Content-Type':'application/json'},body:JSON.stringify({name:'Cliente QA local',code:${JSON.stringify(client.code)}})}).then(r=>r.status)`);
 await evaluate(`location.reload();true`);await wait(`!document.getElementById('verify-code').disabled`);await evaluate(`document.querySelector('.nav-item[data-page="clients"]').click();document.getElementById('client-search').value='QA local';document.getElementById('client-search').dispatchEvent(new Event('input'));true`);await wait(`document.querySelectorAll('.client-item').length===1`);await evaluate(`document.querySelector('.client-item').click();true`);assert.equal((await evaluate(`document.getElementById('access-code').value`)).replaceAll(' ',''),client.code.replaceAll(' ',''));evidence.savedClientSearchAndSelection=true;
 await evaluate(`document.getElementById('access-code').value='cliente qa';document.getElementById('access-code').dispatchEvent(new Event('input'));document.getElementById('access-code').focus();true`);
 await wait(`document.querySelectorAll('#access-results [role=option]').length===1&&document.getElementById('access-code').getAttribute('aria-expanded')==='true'`);
 await evaluate(`document.getElementById('access-search-field').value='code';document.getElementById('access-search-field').dispatchEvent(new Event('change'));true`);
 await wait(`document.querySelectorAll('#access-results [role=option]').length===0&&!document.getElementById('access-search-empty').hidden`);
 await evaluate(`document.getElementById('access-search-field').value='name';document.getElementById('access-search-field').dispatchEvent(new Event('change'));true`);
 await wait(`document.querySelectorAll('#access-results [role=option]').length===1`);evidence.savedClientFieldFilterInWebView2=true;
 await rpc('screenshot',{path:join(out,'busca-clientes.png')});
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await wait(`document.activeElement.id==='verify-code'&&document.getElementById('access-code').getAttribute('aria-expanded')==='false'`);
 assert.equal((await evaluate(`document.getElementById('access-code').value`)).replaceAll(' ',''),client.code.replaceAll(' ',''));assert.equal(await evaluate(`document.getElementById('session-panel').hidden`),true);evidence.savedClientSearchAndKeyboardInWebView2=true;
 await evaluate(`document.getElementById('access-search-field').value='all';true`);
 await request(client.code);let state=await api(ready.pairingOrigin,'/v3/client/state',null,client.token);await api(ready.pairingOrigin,'/v3/client/decision',{id:state.id,permission:'deny'},client.token);await wait(`document.getElementById('session-panel').hidden`);evidence.denialReturnedHome=true;
 await request(client.code);state=await api(ready.pairingOrigin,'/v3/client/state',null,client.token);assert.equal(state.permission,'none');const decision=await api(ready.pairingOrigin,'/v3/client/decision',{id:state.id,permission:'control'},client.token);
 const bridgeReady=new Promise((ok,fail)=>{bridge=spawn(resolve('.cache/native/DesktopBridgeFixture.exe'),[ready.pairingOrigin+'/'],{windowsHide:true,env:{...process.env,VOADESK_FIXTURE_CLIENT:client.token,VOADESK_FIXTURE_TICKET:decision.ticket}});const deadline=setTimeout(()=>fail(new Error('Ponte sintética não abriu.')),10000);createInterface({input:bridge.stdout}).on('line',line=>{try{const data=JSON.parse(line);if(data.kind==='ready'){clearTimeout(deadline);ok(data.url);}else if(data.kind==='input')events.push(data);}catch{}});});
 const {chromium}=await import(pathToFileURL(resolve(process.env.FAROL_PLAYWRIGHT||'.cache/security-tools/node_modules/playwright/index.mjs')).href);browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-features=WebRtcHideLocalIpsWithMdns','--autoplay-policy=no-user-gesture-required']});capture=await browser.newPage();capture.on('pageerror',e=>errors.push(e.message));await capture.goto(await bridgeReady);
 await wait(`document.getElementById('remote-video').videoWidth===1280`,30000);await wait(`document.getElementById('diagnostic-details').textContent.includes('video/H264')`);evidence.h264DecodedInWebView2=true;
 evidence.presentedFpsSynthetic=await evaluate(`new Promise(resolve=>{
   const video=document.getElementById('remote-video');
   video.requestVideoFrameCallback((started,first)=>{
     function sample(now,frame){
       if(now-started<2000){video.requestVideoFrameCallback(sample);return;}
       resolve((frame.presentedFrames-first.presentedFrames)*1000/(now-started));
     }
     video.requestVideoFrameCallback(sample);
   });
 })`);
 evidence.frameFetchMs=await capture.evaluate(()=>{
   const frames=performance.getEntriesByType('resource').filter(entry=>new URL(entry.name).pathname==='/support/native/frame').slice(-30);
   return frames.reduce((total,frame)=>total+frame.duration,0)/frames.length;
 });
 evidence.videoDiagnostics=await evaluate(`document.getElementById('diagnostic-details').innerText`);
 // Fullscreen is entered via a user-gesture equivalent in this isolated in-process QA driver.
 if(!(await rpc('state')).full)await evaluate(`document.getElementById('full-session').click();true`,true);await sleep(200);assert.equal((await rpc('state')).full,true);evidence.nativeFullscreen=true;
 await wait(`!document.getElementById('session-monitor').disabled`);const monitors=await evaluate(`document.getElementById('session-monitor').options.length`);for(let i=0;i<monitors;i++){await evaluate(`document.getElementById('session-monitor').selectedIndex=${i};document.getElementById('session-monitor').dispatchEvent(new Event('change'));true`);await wait(`!document.getElementById('session-monitor').disabled`);await wait(`document.getElementById('quality-notice').textContent.includes('Monitor conectado')`);}evidence.monitorsSelected=monitors;
 await evaluate(`document.getElementById('remote-keyboard').focus();true`);await cdp('Input.insertText',{text:'Ação ç'});await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17});for(let at=0;at<30&&!events.some(e=>e.type===1&&e.flags===4&&e.scan===231);at++)await sleep(100);assert.ok(events.some(e=>e.type===1&&e.flags===4&&e.scan===231));evidence.unicodeToNativeCollector=true;
 await evaluate(`document.getElementById('session-zoom').value='150';document.getElementById('session-zoom').dispatchEvent(new Event('change'));true`);assert.equal(await evaluate(`document.getElementById('remote-video').style.width`),'1920px');await evaluate(`document.getElementById('session-zoom').value='fit';document.getElementById('session-zoom').dispatchEvent(new Event('change'));true`);
 const folder=join(dir,'client');await mkdir(folder);const content=Buffer.alloc(196641,97);await writeFile(join(folder,'receive.bin'),content);
 await evaluate(`document.getElementById('session-files').click();true`);await wait(`document.getElementById('files-status').textContent.includes('itens carregados')`);await evaluate(`document.getElementById('files-path').value=${JSON.stringify(folder)};document.getElementById('files-open').click();true`);await wait(`document.getElementById('files-list').textContent.includes('receive.bin')`);
 if(process.argv.includes('--pickers')){
  const realReceived=join(dir,'received-real.bin'),realUpload=join(dir,'upload-real.bin');await writeFile(realUpload,Buffer.alloc(70001,79));
  console.log(JSON.stringify({phase:'real-save-dialog',saveAs:realReceived}));await evaluate(`Array.from(document.querySelectorAll('#files-list button')).find(b=>b.textContent.includes('receive.bin')).click();true`,true);await wait(`document.getElementById('files-status').textContent.startsWith('Arquivo recebido:')`,180000);assert.deepEqual(await readFile(realReceived),content);evidence.realSaveDialogValidated=true;
  console.log(JSON.stringify({phase:'real-open-dialog',openFile:realUpload}));await evaluate(`document.getElementById('files-upload').click();true`,true);await wait(`document.getElementById('files-status').textContent.startsWith('Arquivo enviado para')`,180000);assert.deepEqual(await readFile(join(folder,'upload-real.bin')),await readFile(realUpload));evidence.realOpenDialogValidated=true;
 }
 // Additional automated writer coverage uses the isolated browser profile, without mocking its IO.
 await evaluate(`(async()=>{window.qaFile=await (await navigator.storage.getDirectory()).getFileHandle('received.bin',{create:true});window.showSaveFilePicker=async()=>window.qaFile;return true;})()`);
 await evaluate(`Array.from(document.querySelectorAll('#files-list button')).find(b=>b.textContent.includes('receive.bin')).click();true`,true);await wait(`document.getElementById('files-status').textContent.startsWith('Arquivo recebido:')`,30000);
 const hash=await evaluate(`(async()=>{const bytes=await (await window.qaFile.getFile()).arrayBuffer();return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');})()`);assert.equal(hash,createHash('sha256').update(content).digest('hex'));evidence.receivedFileHashMatches=true;
 const upload=join(dir,'upload.bin');await writeFile(upload,Buffer.alloc(262177,92));const document=await cdp('DOM.getDocument'),input=await cdp('DOM.querySelector',{nodeId:document.root.nodeId,selector:'#files-input'});await cdp('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[upload]});await wait(`document.getElementById('files-status').textContent.startsWith('Arquivo enviado para')`,30000);assert.deepEqual(await readFile(join(folder,'upload.bin')),await readFile(upload));evidence.sentFileHashMatches=true;
 const saved=await readFile(join(dir,'data','saved-clients.json'));await rpc('screenshot',{path:join(out,'webview2-session.png')});
 // Closing while a transfer is in progress must revoke the session and remove client partials.
 const large=join(dir,'closing-transfer.bin');await writeFile(large,Buffer.alloc(8*1024*1024,31));await cdp('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[large]});await wait(`document.getElementById('files-status').textContent.includes('closing-transfer.bin ·')`);await rpc('close').catch(()=>{});await Promise.all([waitExit(shell,'Janela de teste'),waitExit(bridge,'Ponte de teste')]);evidence.closeTransferFiles=await readdir(folder);assert.equal(evidence.closeTransferFiles.some(f=>f.endsWith('.partial')||f==='closing-transfer.bin'),false);assert.throws(()=>process.kill(ready.pid,0));evidence.closeDuringTransferCleanedOwnedProcessAndPartial=true;
 assert.ok(events.some(e=>e.type===1&&e.scan===29&&(e.flags&2)));assert.deepEqual(errors,[]);
 const reopened=await startShell();await wait(`!document.getElementById('verify-code').disabled`);assert.deepEqual(await readFile(join(dir,'data','saved-clients.json')),saved);const resumed=await api(reopened.pairingOrigin,'/v2/clients',{deviceId,secret});assert.equal(resumed.code,client.code);evidence.reopenPreservedAgendaAndDeviceCode=true;
 await rpc('stop-host');await sleep(200);assert.equal((await rpc('state').catch(()=>({ready:false}))).ready,false);await rpc('close').catch(()=>{});
 Object.assign(evidence,{result:'passed',nodeConsoleHidden:true,zoom:true,keyboardReleaseObserved:true,realSaveDialogValidated:evidence.realSaveDialogValidated??false,realOpenDialogValidated:evidence.realOpenDialogValidated??false});
}catch(e){evidence.result='failed';evidence.failure=e.stack;process.exitCode=1;try{evidence.nativeState=await rpc('state');evidence.inputEvents=events.slice(-12);evidence.ui=await evaluate(`document.body.innerText.slice(-5000)`);await rpc('screenshot',{path:join(out,'failure.png')});}catch{}}
finally{if(shell&&shell.exitCode==null){await rpc('close').catch(()=>{});await sleep(500);}shell?.kill();bridge?.kill();await browser?.close();await rm(dir,{recursive:true,force:true});await writeFile(join(out,process.argv.includes('--pickers')?'report-pickers.json':'report.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));}
