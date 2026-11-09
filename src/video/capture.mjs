import {peer,prefer,gather,applyQuality} from './shared.mjs';
import {InputQueue} from './input-queue.mjs';
import {StatsSampler} from './stats.mjs';
import {QualityPolicy} from './quality.mjs';
import {fileRpc,fileInfo,toBase64,fromBase64} from './files.mjs';
const $=id=>document.getElementById(id);
async function post(route,value={}){const r=await fetch('/support/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-VoaDesk':'1'},body:JSON.stringify(value)}),data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.message||'Operação indisponível ou atendimento encerrado.');return data;}
async function nativeGet(route){const r=await fetch('/support/native/'+route);if(!r.ok)throw new Error('Atualize e abra o aplicativo VoaDeskCliente para compartilhar todos os monitores.');return r.json();}
let pc,stream,sender,control,files,closed=false,starting=false,applied=false,lastStats={},busy=false,qualityQueue=Promise.resolve(),inputSending=false,native,frameTimer,frameRequest,switching=false;
const maxCaptureFps=60;
const captureStats={};
let inputBarrier=0,reliableSequence=0;
const canvas=document.createElement('canvas'),context=canvas.getContext('2d',{alpha:false}),pendingInput=new InputQueue(),policy=new QualityPolicy(),sampler=new StatsSampler();
const notice=text=>{if(control?.readyState==='open')control.send(JSON.stringify({type:'qualityNotice',text}));};
const monitors=()=>{if(control?.readyState==='open')control.send(JSON.stringify({type:'monitors',...native}));};
async function frame(){
 const started=performance.now();
 const monitor=native.monitors.find(m=>m.id===native.selected);
 const encoding=policy.encoding(monitor?.height);
 const height=Math.max(180,Math.round((monitor?.height||1080)/encoding.scaleResolutionDownBy));
 const r=await fetch('/support/native/frame?'+encodeURIComponent(native.selected)+'&maxHeight='+height);
 for(const name of ['captureMs','jpegEncodeMs']){const raw=r.headers.get('X-VoaDesk-'+name);captureStats[name]=raw===null?null:Number(raw);} 
 if(!r.ok)throw new Error('Não foi possível capturar a imagem do monitor.');
 const bitmap=await createImageBitmap(await r.blob());
 captureStats.captureBridgeMs=performance.now()-started;
 const renderStart=performance.now();
 try{
  if(closed||switching)return;
  if(canvas.width!==bitmap.width||canvas.height!==bitmap.height){canvas.width=bitmap.width;canvas.height=bitmap.height;}
  context.drawImage(bitmap,0,0);
  captureStats.canvasRenderMs=performance.now()-renderStart;
  stream?.getVideoTracks()[0].requestFrame();
 }finally{bitmap.close();}
}
async function captureNextFrame(){
 if(closed||switching)return;
 const started=performance.now();
 frameRequest=frame();
 try{await frameRequest;}catch(e){await stop(true,e.message);return;}finally{frameRequest=null;}
 if(closed||switching)return;
 const fps=Math.min(maxCaptureFps,policy.encoding(canvas.height).maxFramerate);
 frameTimer=setTimeout(captureNextFrame,Math.max(0,1000/fps-(performance.now()-started)));
}
async function flushInput(){if(inputSending||closed)return;inputSending=true;try{while(pendingInput.length&&!closed){const events=pendingInput.take(8);await post('input',{events});if(control?.readyState==='open')for(const e of events)if(Number.isSafeInteger(e.inputId))control.send(JSON.stringify({type:'inputAck',inputId:e.inputId}));}}catch{await stop();}finally{inputSending=false;}}
function queueInput(data){if(closed||switching)return;if(Number.isSafeInteger(data.inputId)){if(data.type==='move'&&data.inputId<inputBarrier)return;if(['down','up','release'].includes(data.type))inputBarrier=Math.max(inputBarrier,data.inputId);}pendingInput.push(data);void flushInput();}
const adjust=()=>qualityQueue=qualityQueue.catch(()=>{}).then(()=>applyQuality(sender,stream.getVideoTracks()[0],policy));
async function stop(notify=true,reason='Sua tela não está sendo compartilhada.'){
 if(closed)return;closed=true;clearInterval(timer);clearTimeout(frameTimer);pendingInput.clear();files?.close();stream?.getTracks().forEach(t=>t.stop());pc?.close();$('share').disabled=$('end').disabled=true;$('capture-title').textContent='Tudo encerrado.';$('status').textContent='Atendimento encerrado. '+reason;document.body.dataset.state='ended';
 if(notify){await post('end').catch(()=>{});await post('native/stop').catch(()=>{});}
}
$('end').onclick=()=>void stop();$('share').hidden=true;
async function fileOperation(action,value){
 if(closed)throw new Error('Atendimento encerrado.');
 if(['list','open-read','open-write','finish','cancel'].includes(action)){if(action==='open-write')fileInfo(value);return post('native/'+action,value);}
 if(action==='read'){const r=await fetch('/support/native/read',{method:'POST',headers:{'Content-Type':'application/json','X-VoaDesk':'1'},body:JSON.stringify(value)});if(!r.ok)throw new Error('Falha ao ler o arquivo.');return {chunk:toBase64(await r.arrayBuffer())};}
 if(action==='write'){const bytes=fromBase64(value.chunk),r=await fetch('/support/native/write?'+encodeURIComponent(value.id),{method:'POST',headers:{'X-VoaDesk':'1'},body:bytes});if(!r.ok)throw new Error('Falha ao gravar o arquivo.');return {ok:true};}
 throw new Error('Operação de arquivo desconhecida.');
}
async function start(rtc){
 if(starting||closed||pc)return;starting=true;
 try{
  native=await nativeGet('state');Object.assign(native,await post('native/select',{id:native.selected}));await frame();if(closed)return;
  stream=canvas.captureStream(0);pc=peer(rtc);sender=pc.addTransceiver(stream.getVideoTracks()[0],{direction:'sendonly',streams:[stream]}).sender;prefer(pc.getTransceivers()[0],true);
  control=pc.createDataChannel('control',{ordered:true});control.onopen=monitors;
  const receive=async (event,pointerOnly=false)=>{let type;try{if(typeof event.data!=='string'||event.data.length>8192)throw new Error('Comando inv\u00e1lido.');const data=JSON.parse(event.data);if(!data||typeof data!=='object')throw new Error('Comando inv\u00e1lido.');type=data.type;if(pointerOnly&&type!=='move')return;if(!pointerOnly&&Number.isSafeInteger(data.inputId)){if(data.inputId<=reliableSequence)return;reliableSequence=data.inputId;}
   if(data.type==='quality'){policy.choose(data.preference,data.automatic);await adjust();return;}
   if(data.type==='feedback'){const feedback={};for(const k of ['rttMs','jitterMs','lossPercent','decodeMs'])if(Number.isFinite(data.stats?.[k])&&data.stats[k]>=0)feedback[k]=data.stats[k];const text=policy.sample({...lastStats,...feedback});if(text){await adjust();notice(text);}return;}
   if(data.type==='monitor'){
    if(switching)return;switching=true;clearTimeout(frameTimer);pendingInput.clear();
    try{await frameRequest;if(closed)return;await post('input',{type:'release'});const result=await post('native/select',{id:data.id});native.selected=result.selected;native.generation=result.generation;}
    finally{switching=false;void captureNextFrame();}
    monitors();return;
   }
   if(data.type==='shortcut'){await post('native/shortcut',{action:data.action});return;}

   queueInput(data);
  }catch(e){notice(e.message);if(!['monitor','shortcut'].includes(type))await stop();else monitors();}};
  control.onmessage=event=>receive(event);pc.createDataChannel('pointer',{ordered:false,maxRetransmits:0}).onmessage=event=>receive(event,true);
  files=fileRpc(pc.createDataChannel('files',{ordered:true}),fileOperation);
  pc.onconnectionstatechange=()=>{if(['failed','disconnected','closed'].includes(pc.connectionState))void stop();};
  void captureNextFrame();
  await adjust();await pc.setLocalDescription(await pc.createOffer());await gather(pc);if(closed)return;await post('signal',pc.localDescription);
  $('status').textContent='Conectando ao técnico…';document.body.dataset.state='connecting';
 }catch(e){await stop(true,e.message);}finally{starting=false;}
}
const timer=setInterval(async()=>{
 if(closed||busy)return;busy=true;
 try{const r=await fetch('/support/state');if(!r.ok)throw new Error();const state=await r.json();if(!['approved','active'].includes(state.state)||state.permission!=='control')throw new Error();
  if(!pc&&!starting)await start(state.rtc);if(pc&&state.answer&&!applied){applied=true;await pc.setRemoteDescription(state.answer);}
  if(pc?.connectionState==='connected'){$('capture-title').textContent='Atendimento conectado.';$('status').textContent=state.operatorName+' pode controlar, trocar de monitor e transferir arquivos. Você pode encerrar a qualquer momento.';document.body.dataset.state='active';lastStats={...sampler.sample(await pc.getStats()),...captureStats,inputQueueMs:pendingInput.maxWaitMs,pointerReplaced:pendingInput.replaced};await post('stats',lastStats);}
 }catch{await stop(false);}finally{busy=false;}
},1000);
window.addEventListener('pagehide',()=>{stream?.getTracks().forEach(t=>t.stop());pc?.close();void post('end').catch(()=>{});void post('native/stop').catch(()=>{});});
