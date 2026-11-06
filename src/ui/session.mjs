import {peer,prefer,gather,position} from '/video/peer.mjs';
import {StatsSampler} from '/video/stats.mjs';
import {diagnose} from '/video/quality.mjs';
const $=id=>document.getElementById(id),post=async(action,payload={})=>{const r=await fetch('/api/session/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Farol-Request':'1'},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok)throw new Error(data.message||'Sessão indisponível.');return data;};
let pc,channel,pointer,session,busy=false,ended=true,answering=false,guiding=false,last={},frames=0,frameAt=performance.now(),fps=null,sampler=new StatsSampler();
const tell=text=>$('session-status').textContent=text;
const send=(data,fast=false)=>{const c=fast?pointer:channel;if(c?.readyState!=='open')return;if(c.bufferedAmount>16384){void end();return;}c.send(JSON.stringify({...data,permissionRevision:session?.permissionRevision}));};
function quality(){send({type:'quality',preference:$('session-profile').value,automatic:$('auto-quality').checked});}
function release(){send({type:'release'});}
async function end(notify=true){if(ended)return;ended=true;release();pc?.close();pc=null;channel=pointer=null;$('remote-video').srcObject=null;tell('Atendimento encerrado');$('permission-status').textContent='Permissões revogadas';if(notify)await post('end').catch(()=>{});}
$('request-session').onclick=async()=>{
  $('request-session').disabled=true;
  try{session=await post('request',{code:$('access-code').value});ended=false;$('session-panel').hidden=false;tell('Aguardando autorização do cliente');$('permission-status').textContent='O cliente escolherá visualizar ou controlar.';$('session-panel').scrollIntoView({behavior:'smooth',block:'start'});}
  catch(e){$('access-message').textContent=e.message;}
  finally{$('request-session').disabled=false;}
};
$('end-session').onclick=()=>void end();$('session-profile').onchange=quality;$('auto-quality').onchange=quality;
$('guide-mode').onclick=()=>{release();guiding=!guiding;$('guide-mode').setAttribute('aria-pressed',String(guiding));$('guide-mode').textContent=guiding?'Orientação ativa':'Orientar cliente';};
$('full-session').onclick=()=>{if(document.fullscreenElement)void document.exitFullscreen();else void $('session-panel').requestFullscreen();};
$('remote-video').onpointerdown=e=>{if(ended)return;const p=position(e,$('remote-video'));if(!p)return;e.preventDefault();if(guiding){send({type:'guide',...p});return;}if(session?.permission!=='control')return;$('remote-keyboard').focus({preventScroll:true});$('remote-video').setPointerCapture(e.pointerId);send({type:'down',button:e.button,...p});};
$('remote-video').onpointerup=e=>{const p=position(e,$('remote-video'));if(!guiding&&p&&session?.permission==='control')send({type:'up',button:e.button,...p});else release();};
$('remote-video').onpointercancel=release;
let lastMove=0;$('remote-video').onpointermove=e=>{if(guiding||session?.permission!=='control'||performance.now()-lastMove<16)return;const p=position(e,$('remote-video'));if(p){lastMove=performance.now();send({type:'move',...p},true);}};
$('remote-video').oncontextmenu=e=>e.preventDefault();
$('remote-video').addEventListener('wheel',e=>{if(session?.permission!=='control'||guiding)return;e.preventDefault();const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?$('remote-video').clientHeight:1);send({type:'wheel',delta:Math.max(-1200,Math.min(1200,-pixels*1.2))});},{passive:false});
const keyboard=$('remote-keyboard'),held=new Set();let composing=false;
keyboard.oncompositionstart=()=>{composing=true;};keyboard.oncompositionend=e=>{composing=false;if(session?.permission==='control'&&e.data)send({type:'text',text:e.data.slice(0,64)});keyboard.value='';};
keyboard.onbeforeinput=e=>{if(composing||e.isComposing)return;e.preventDefault();if(session?.permission==='control'&&e.data&&!['insertCompositionText','insertFromComposition'].includes(e.inputType))send({type:'text',text:e.data.slice(0,64)});keyboard.value='';};
keyboard.onkeydown=e=>{
  if(e.key==='Escape'){e.preventDefault();release();keyboard.blur();return;}
  if(ended||guiding||session?.permission!=='control')return;
  if(e.isComposing||composing||e.key==='Dead')return;
  if(e.key==='AltGraph'){release();held.clear();return;}
  const physical=e.key.length!==1||((e.ctrlKey||e.altKey||e.metaKey)&&!e.getModifierState('AltGraph'));
  if(physical){e.preventDefault();if(!held.has(e.code)){held.add(e.code);send({type:'keyDown',code:e.code});}}
};
keyboard.onkeyup=e=>{if(held.delete(e.code)){e.preventDefault();send({type:'keyUp',code:e.code});}};
keyboard.onblur=()=>{held.clear();release();};window.addEventListener('blur',()=>{held.clear();release();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){held.clear();release();}});
window.addEventListener('pagehide',()=>{release();void end();});
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
  if(ended||busy)return;busy=true;
  try{
    session=await post('state');if(session.state==='ended'){await end(false);tell(session.reason==='denied'?'Cliente recusou o atendimento.':'Atendimento encerrado');return;}
    $('permission-status').textContent=session.permission==='control'?'Controle autorizado pelo cliente':session.permission==='view'?'Somente visualização':'Aguardando autorização';
    if(session.offer&&!pc&&!answering){answering=true;pc=peer();pc.ontrack=e=>{$('remote-video').srcObject=new MediaStream([e.track]);void $('remote-video').play();};
      pc.ondatachannel=e=>{if(e.channel.label==='control'){channel=e.channel;channel.onopen=quality;channel.onmessage=event=>{const d=JSON.parse(event.data);if(d.type==='qualityNotice')$('quality-notice').textContent=d.text;};}else pointer=e.channel;};
      pc.onconnectionstatechange=()=>{if(pc?.connectionState==='connected')tell('Atendimento ativo');if(pc&&['failed','disconnected'].includes(pc.connectionState))void end();};
      await pc.setRemoteDescription(session.offer);prefer(pc.getTransceivers()[0],false);await pc.setLocalDescription(await pc.createAnswer());await gather(pc);if(ended)return;await post('signal',pc.localDescription);answering=false;
    }
    if(pc?.connectionState==='connected'){last={...(session.stats??{}),...sampler.sample(await pc.getStats(),{fps,total:frames})};for(const k of ['encodedFps','capturedFps','encodeMs','encoder','powerEfficientEncoder','qualityLimitation'])if(session.stats?.[k]!=null)last[k]=session.stats[k];send({type:'feedback',stats:{rttMs:last.rttMs,jitterMs:last.jitterMs,lossPercent:last.lossPercent,decodeMs:last.decodeMs}});showDiagnostics();}
  }catch{await end(false);tell('Conexão interrompida. Permissões revogadas.');}finally{busy=false;}
},1000);
