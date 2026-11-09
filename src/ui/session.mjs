import {peer,prefer,gather,position} from '/video/peer.mjs';
import {StatsSampler} from '/video/stats.mjs';
import {diagnose} from '/video/quality.mjs';
import {attachFiles,closeFiles} from '/session-files.mjs';
import {createLocalTest} from '/local-test.mjs';
let localTest=null;
const $=id=>document.getElementById(id),post=async(action,payload={})=>{if(localTest)return localTest.post(action,payload);const r=await fetch('/api/session/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Farol-Request':'1'},body:JSON.stringify(payload),keepalive:action==='end'});const data=await r.json();if(!r.ok)throw new Error(data.message||'Sessão indisponível.');return data;};
let pc,channel,pointer,session,busy=false,ended=true,answering=false,guiding=false,sessionEpoch=0,last={},frames=0,frameAt=performance.now(),fps=null,sampler=new StatsSampler();
let requesting=null,ending=null,needsEnd=false,cancelRequested=false;
let monitorId=null,monitorGeneration=null,monitorSwitching=false,monitorEpoch=0;
const zoom=()=>{const video=$('remote-video'),value=$('session-zoom').value;video.classList.toggle('native-size',value!=='fit');video.style.width=value==='fit'?'':Math.round(video.videoWidth*Number(value)/100)+'px';video.style.height=value==='fit'?'':Math.round(video.videoHeight*Number(value)/100)+'px';};
const fullscreen=()=>{if(!document.fullscreenElement)void $('session-panel').requestFullscreen().catch(()=>{$('quality-notice').textContent='Use Tela cheia na barra para ocultar as bordas da janela.';});};
function setMonitors(data){
  if(!Array.isArray(data.monitors)||!data.monitors.length)return;
  monitorId=data.selected;monitorGeneration=data.generation;const select=$('session-monitor');select.replaceChildren(...data.monitors.map(m=>{const option=document.createElement('option');option.value=m.id;option.textContent=m.label+' · '+m.width+'×'+m.height;return option;}));select.value=monitorId;select.disabled=false;
  const epoch=++monitorEpoch;
  if(monitorSwitching){let frames=0;const ready=()=>{if(ended||epoch!==monitorEpoch)return;if(++frames<2){$('remote-video').requestVideoFrameCallback?.(ready);return;}monitorSwitching=false;$('quality-notice').textContent='Monitor conectado. Clique na imagem para controlar.';zoom();};if($('remote-video').requestVideoFrameCallback)$('remote-video').requestVideoFrameCallback(ready);else setTimeout(()=>{frames=1;ready();},400);}
}
const diagnostics=$('check-connection').closest('.connection-panel'),diagnosticsHome=document.createComment('diagnostics-home');
diagnostics.before(diagnosticsHome);
const tell=text=>$('session-status').textContent=text;
function panel(visible){
  $('session-panel').hidden=!visible;document.body.classList.toggle('in-session',visible);
  if(visible){diagnostics.inert=false;$('session-diagnostics').append(diagnostics);$('session-diagnostics').hidden=true;$('session-diagnostic').setAttribute('aria-expanded','false');}else {diagnosticsHome.after(diagnostics);window.dispatchEvent(new Event('voadesk:home'));}
  for(const element of document.querySelectorAll('body > :not(main), main > :not(#session-panel)'))element.inert=visible;
  (visible?$('end-session'):$('access-code')).focus({preventScroll:true});
}
function waiting(title,description,loading=true){
  tell(title);$('waiting-title').textContent=title;$('waiting-description').textContent=description;
  $('session-waiting').hidden=false;$('session-waiting').classList.toggle('is-loading',loading);
  $('session-media').hidden=true;$('session-options').hidden=true;
}
function disposeMedia(){
  closeFiles();monitorEpoch++;monitorId=null;monitorGeneration=null;monitorSwitching=false;$('session-monitor').disabled=true;$('session-zoom').value='fit';zoom();
  ended=true;sessionEpoch++;answering=false;release();pc?.close();pc=null;channel=pointer=null;
  localTest?.close();
  $('remote-video').srcObject?.getTracks().forEach(track=>track.stop());$('remote-video').srcObject=null;
  held.clear();guiding=false;$('guide-mode').setAttribute('aria-pressed','false');$('guide-mode').textContent='Orientar cliente';
}
async function closePanel(message,type=''){
  const wasLocal=Boolean(localTest);localTest?.close();localTest=null;setTestControls(false);
  if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});
  panel(false);$('access-message').textContent=message;$('access-message').className='message '+type;
  if(wasLocal)$('start-local-test').focus({preventScroll:true});
}
function setTestControls(active){
  $('reset-local-test').hidden=$('local-test-notice').hidden=!active;
  for(const id of ['session-monitor','session-profile','auto-quality'])$(id).closest('label').hidden=active;
  for(const id of ['session-files','task-manager','secure-attention','guide-mode'])$(id).hidden=active;
  $('remote-video').setAttribute('aria-label',active?'Tela de testes simulada nesta máquina':'Tela compartilhada pelo cliente');
}
const send=(data,fast=false)=>{
  if(monitorSwitching&&['move','down','up','wheel','text','keyDown','keyUp','guide'].includes(data.type))return;
  const c=fast?pointer:channel;
  if(c?.readyState!=='open')return;
  // A newer pointer position can replace a lost move. Clicks and keys use the reliable channel.
  if(fast&&c.bufferedAmount>512)return;
  if(c.bufferedAmount>16384){if(!ended)void end();return;}
  c.send(JSON.stringify({...data,monitorId,monitorGeneration,permissionRevision:session?.permissionRevision}));
};
function quality(){send({type:'quality',preference:$('session-profile').value,automatic:$('auto-quality').checked});}
function release(){send({type:'release'});}
async function end(notify=true,message='Atendimento encerrado. Você pode iniciar uma nova conexão.'){
  if(ending)return ending;
  if(localTest)message='Teste local encerrado. As atividades foram descartadas.';
  cancelRequested=true;disposeMedia();$('end-session').disabled=true;
  waiting('Encerrando atendimento','Aguarde a confirmação do encerramento.');
  ending=(async()=>{
    try{
      await requesting?.catch(()=>{});
      if(notify&&needsEnd){await post('end');needsEnd=false;}
      if(!notify)needsEnd=false;
      $('permission-status').textContent='Permissões revogadas';await closePanel(message);
    }catch{
      waiting('Não foi possível confirmar o encerramento','A conexão local foi interrompida. Tente encerrar novamente para confirmar com o cliente.',false);
      $('permission-status').textContent='Confirmação de encerramento pendente';
    }finally{$('end-session').disabled=false;$('end-session').textContent=needsEnd?'Tentar encerrar':'Encerrar atendimento';ending=null;}
  })();return ending;
}
export const requestLocalTest=()=>requestSession(null,true);
export async function requestSession(code,test=false){
  if(requesting||ending||needsEnd||!ended)return;
  cancelRequested=false;session=null;sessionEpoch++;last={};sampler=new StatsSampler();fps=null;
  setTestControls(test);
  $('end-session').textContent=test?'Cancelar teste':'Cancelar solicitação';$('permission-status').textContent=test?'Somente a tela simulada nesta máquina':'Nenhum acesso autorizado';
  waiting(test?'Preparando sua tela de testes':'Verificando código',test?'Criando uma conexão de vídeo local e uma área interativa descartável.':'Localizando o cliente e enviando a solicitação de acesso.');panel(true);if(!test)fullscreen();
  requesting=(async()=>{if(test){localTest=createLocalTest();session=await localTest.start();}else session=await post('request',{code});needsEnd=true;})();
  try{
    await requesting;if(cancelRequested)return;
    ended=false;waiting(test?'Conectando nesta máquina':'Aguardando o cliente aceitar',test?'Preparando o vídeo da tela simulada.':'Peça ao cliente para permitir a conexão no aplicativo VoaDesk.');
    $('permission-status').textContent=test?'Somente a tela simulada nesta máquina':'Aguardando o cliente aceitar controle, monitores e arquivos.';
  }catch(e){if(!cancelRequested){disposeMedia();await closePanel(e.message,'error');}}
  finally{requesting=null;}
}
$('end-session').onclick=()=>void end();$('session-profile').onchange=quality;$('auto-quality').onchange=quality;
$('reset-local-test').onclick=()=>{release();held.clear();send({type:'testReset'});};
$('session-diagnostic').onclick=()=>{const expanded=$('session-diagnostics').hidden;$('session-diagnostics').hidden=!expanded;$('session-diagnostic').setAttribute('aria-expanded',String(expanded));if(expanded)$('check-connection').focus({preventScroll:true});};
$('guide-mode').onclick=()=>{release();guiding=!guiding;$('guide-mode').setAttribute('aria-pressed',String(guiding));$('guide-mode').textContent=guiding?'Orientação ativa':'Orientar cliente';};
$('full-session').onclick=()=>{if(document.fullscreenElement)void document.exitFullscreen();else void $('session-panel').requestFullscreen();};
$('session-zoom').onchange=zoom;$('remote-video').addEventListener('resize',zoom);
$('session-monitor').onchange=()=>{release();held.clear();monitorSwitching=true;$('session-monitor').disabled=true;$('quality-notice').textContent='Trocando de monitor…';send({type:'monitor',id:$('session-monitor').value});};
$('task-manager').onclick=()=>send({type:'shortcut',action:'task-manager'});
$('secure-attention').onclick=()=>{$('quality-notice').textContent='CTRL+ALT+DEL exige um serviço Windows ou aplicativo com UIAccess. Esta versão portátil não envia essa sequência. Use Gerenciador de Tarefas para gerenciar aplicativos.';};
$('remote-video').addEventListener('pointerdown',e=>{if(monitorSwitching){e.stopImmediatePropagation();e.preventDefault();}},true);
$('remote-video').onpointerdown=e=>{if(ended)return;const p=position(e,$('remote-video'));if(!p)return;e.preventDefault();if(guiding){send({type:'guide',...p});return;}if(session?.permission!=='control')return;$('remote-keyboard').focus({preventScroll:true});$('remote-video').setPointerCapture(e.pointerId);send({type:'down',button:e.button,...p});};
$('remote-video').onpointerup=e=>{const p=position(e,$('remote-video'));if(!guiding&&p&&session?.permission==='control')send({type:'up',button:e.button,...p});else release();};
$('remote-video').onpointercancel=release;
let lastMove=0;$('remote-video').onpointermove=e=>{if(guiding||session?.permission!=='control'||performance.now()-lastMove<16)return;const p=position(e,$('remote-video'));if(p){lastMove=performance.now();send({type:'move',...p},true);}};
$('remote-video').oncontextmenu=e=>e.preventDefault();
$('remote-video').addEventListener('wheel',e=>{if(session?.permission!=='control'||guiding)return;e.preventDefault();const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?$('remote-video').clientHeight:1);send({type:'wheel',delta:Math.max(-1200,Math.min(1200,-pixels*1.2))});},{passive:false});
const keyboard=$('remote-keyboard'),held=new Set();let composing=false;
keyboard.oncompositionstart=()=>{composing=true;};keyboard.oncompositionend=e=>{composing=false;if(session?.permission==='control'&&!guiding&&e.data)send({type:'text',text:e.data.slice(0,64)});keyboard.value='';};
keyboard.onbeforeinput=e=>{if(composing||e.isComposing)return;e.preventDefault();if(session?.permission==='control'&&!guiding&&e.data&&!['insertCompositionText','insertFromComposition'].includes(e.inputType))send({type:'text',text:e.data.slice(0,64)});keyboard.value='';};
keyboard.onkeydown=e=>{
  if(e.key==='Escape'){e.preventDefault();release();keyboard.blur();return;}
  if(ended||monitorSwitching||guiding||session?.permission!=='control')return;
  if(e.isComposing||composing||e.key==='Dead')return;
  if(e.key==='AltGraph'){release();held.clear();return;}
  const physical=e.key.length!==1||((e.ctrlKey||e.altKey||e.metaKey)&&!e.getModifierState('AltGraph'));
  if(physical){e.preventDefault();if(!held.has(e.code)){held.add(e.code);send({type:'keyDown',code:e.code});}}
};
keyboard.onkeyup=e=>{if(held.delete(e.code)){e.preventDefault();send({type:'keyUp',code:e.code});}};
keyboard.onblur=()=>{held.clear();release();};window.addEventListener('blur',()=>{held.clear();release();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){held.clear();release();}});
window.addEventListener('pagehide',()=>{release();void end();});
window.addEventListener('voadesk:closing',()=>{release();void end();});
$('remote-video').requestVideoFrameCallback?.(function count(now,meta){frames=meta.presentedFrames;if(now-frameAt>1000){fps=(frames-(count.old??0))*1000/(now-frameAt);count.old=frames;frameAt=now;}$('remote-video').requestVideoFrameCallback(count);});
function showDiagnostics(){
  $('diagnostic-summary').textContent=diagnose(last,true).map(f=>f.text).join(' ');
  const labels={width:'Largura',height:'Altura',capturedFps:'FPS da fonte',encodedFps:'FPS codificados',decodedFps:'FPS decodificados',presentedFps:'FPS apresentados',bitrateMbps:'Bitrate Mbps',rttMs:'RTT ms',jitterMs:'Jitter ms',lossPercent:'Perda %',encodeMs:'Codificação ms/quadro',decodeMs:'Decodificação ms/quadro',jitterBufferMs:'Espera no buffer ms',freezeCount:'Congelamentos acumulados',droppedFrames:'Quadros descartados',codec:'Codec',encoder:'Encoder',decoder:'Decoder',powerEfficientEncoder:'Encoder eficiente (não prova GPU)',powerEfficientDecoder:'Decoder eficiente (não prova GPU)',route:'Caminho',visualLatencyMs:'Latência visual completa'};
  $('diagnostic-details').replaceChildren(...Object.entries(labels).map(([key,label])=>{const wrap=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;const value=last[key];dd.textContent=value==null?'não disponível':typeof value==='number'?value.toFixed(2):String(value);wrap.append(dt,dd);return wrap;}));
}
$('check-connection').onclick=async()=>{
  if(last.codec){showDiagnostics();return;}
  $('check-connection').disabled=true;const times=[];
  try{for(let i=0;i<5;i++){const at=performance.now(),r=await fetch('/api/pairing/config');if(!r.ok)throw new Error();times.push(performance.now()-at);}
    $('diagnostic-summary').textContent='Serviço local respondendo. Sem sessão de vídeo, não é possível avaliar internet ou processamento de imagem.';
    const mean=times.reduce((a,b)=>a+b,0)/times.length;$('diagnostic-details').textContent='Consulta HTTP local: média '+mean.toFixed(1)+' ms; variação '+(Math.max(...times)-Math.min(...times)).toFixed(1)+' ms. Não é RTT de mídia nem latência visual.';
  }catch{$('diagnostic-summary').textContent='O serviço local não respondeu. Reabra o VoaDesk.';}finally{$('check-connection').disabled=false;}
};
setInterval(async()=>{
  if(ended||busy)return;busy=true;const epoch=sessionEpoch;
  try{
    const next=await post('state');if(ended||epoch!==sessionEpoch)return;session=next;if(session.state==='ended'){await end(false,session.reason==='denied'?'Cliente recusou o atendimento.':session.reason==='connection-lost'?'A solicitação expirou ou a conexão foi interrompida. Tente novamente.':'Atendimento encerrado pelo cliente.');return;}
    $('permission-status').textContent=localTest?'Teste local · comandos apenas na tela simulada':session.permission==='control'?'Controle autorizado pelo cliente':session.permission==='view'?'Somente visualização':'Aguardando autorização';
    if(['approved','active'].includes(session.state)&&!$('session-waiting').hidden)waiting(localTest?'Conectando nesta máquina':'Conectando ao cliente',localTest?'Preparando o vídeo da tela simulada.':'Autorização recebida. Preparando a captura dos monitores do cliente.');
    if(session.offer&&!pc&&!answering){answering=true;const connecting=peer();pc=connecting;const current=()=>!ended&&epoch===sessionEpoch&&pc===connecting;
      connecting.ontrack=e=>{if(!current()){e.track.stop();return;}$('remote-video').srcObject=new MediaStream([e.track]);void $('remote-video').play().catch(()=>{});};
      connecting.ondatachannel=e=>{if(!current()){e.channel.close();return;}if(e.channel.label==='control'){channel=e.channel;channel.onopen=quality;channel.onmessage=event=>{if(!current())return;const d=JSON.parse(event.data);if(d.type==='qualityNotice')$('quality-notice').textContent=d.text;if(d.type==='monitors')setMonitors(d);};}else if(e.channel.label==='files')attachFiles(e.channel);else if(e.channel.label==='pointer')pointer=e.channel;else e.channel.close();};
      connecting.onconnectionstatechange=()=>{if(!current())return;if(connecting.connectionState==='connected'){tell(localTest?'Conectado à tela de testes':'Atendimento ativo');$('session-waiting').hidden=true;$('session-media').hidden=false;$('session-options').hidden=false;$('end-session').textContent=localTest?'Sair do teste':'Encerrar atendimento';if(localTest)$('quality-notice').textContent='Clique na imagem para interagir. Suas atividades serão descartadas ao sair.';}if(['failed','disconnected'].includes(connecting.connectionState))void end();};
      await connecting.setRemoteDescription(session.offer);if(!current()){connecting.close();return;}prefer(connecting.getTransceivers()[0],false);await connecting.setLocalDescription(await connecting.createAnswer());await gather(connecting);if(!current()){connecting.close();return;}await post('signal',connecting.localDescription);if(current())answering=false;
    }
    if(pc?.connectionState==='connected'){const active=pc,report=await active.getStats();if(ended||epoch!==sessionEpoch||pc!==active)return;last={...(session.stats??{}),...sampler.sample(report,{fps,total:frames})};for(const k of ['encodedFps','capturedFps','encodeMs','encoder','powerEfficientEncoder','qualityLimitation'])if(session.stats?.[k]!=null)last[k]=session.stats[k];send({type:'feedback',stats:{rttMs:last.rttMs,jitterMs:last.jitterMs,lossPercent:last.lossPercent,decodeMs:last.decodeMs}});showDiagnostics();}
  }catch{if(epoch===sessionEpoch&&!ended)await end(true,'Conexão interrompida. Atendimento encerrado.');}finally{busy=false;}
},1000);
