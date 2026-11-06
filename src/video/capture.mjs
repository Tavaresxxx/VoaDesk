import { peer,prefer,gather,applyQuality } from './shared.mjs';
import { StatsSampler } from './stats.mjs';
import { QualityPolicy } from './quality.mjs';
const $=id=>document.getElementById(id),post=(route,value)=>fetch('/support/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-VoaDesk':'1'},body:JSON.stringify(value)});
let pc,stream,sender,control,closed=false,selecting=false,applied=false,lastStats={},busy=false,qualityQueue=Promise.resolve(),inputSending=false;const pendingInput=[],policy=new QualityPolicy(),sampler=new StatsSampler();
async function flushInput(){
  if(inputSending||closed)return;inputSending=true;
  try{while(pendingInput.length&&!closed){const events=pendingInput.splice(0,8),r=await post('input',{events});if(!r.ok&&r.status!==400)throw new Error();}}
  catch{await stop();}finally{inputSending=false;}
}
function queueInput(data){
  if(closed)return;
  if(data.type==='move'&&pendingInput.at(-1)?.type==='move')pendingInput.pop();
  if(pendingInput.length>=64)throw new Error('Fila de entrada excedida.');
  pendingInput.push(data);void flushInput();
}
const adjust=()=>qualityQueue=qualityQueue.catch(()=>{}).then(()=>applyQuality(sender,stream.getVideoTracks()[0],policy));
async function stop(notify=true,reason='Sua tela não está sendo compartilhada.'){if(closed)return;closed=true;clearInterval(timer);stream?.getTracks().forEach(t=>t.stop());pc?.close();$('share').disabled=$('end').disabled=true;$('capture-title').textContent='Tudo encerrado.';$('status').textContent='Atendimento encerrado. '+reason;document.body.dataset.state='ended';if(notify)await post('end',{}).catch(()=>{});}
$('end').onclick=()=>void stop();
$('share').onclick=async()=>{
  if(selecting||closed)return;selecting=true;$('share').disabled=true;document.body.dataset.state='connecting';$('capture-title').textContent='Escolha o que compartilhar.';$('status').textContent='Selecione a tela na janela do navegador para continuar.';
  try {
    // Called directly from the explicit click; never bypass the browser selector.
    stream=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'monitor',frameRate:{ideal:60,max:60}},audio:false,selfBrowserSurface:'exclude',surfaceSwitching:'exclude'});
    if(closed){stream.getTracks().forEach(t=>t.stop());return;}
    const track=stream.getVideoTracks()[0];if(track.getSettings().displaySurface!=='monitor')throw new Error('Selecione um monitor inteiro.');
    track.onended=()=>void stop();
    pc=peer();sender=pc.addTransceiver(track,{direction:'sendonly',streams:[stream]}).sender;prefer(pc.getTransceivers()[0],true);
    const wire=e=>{
      if(e.channel.label==='control')control=e.channel;
      e.channel.onmessage=async event=>{
        try {const data=JSON.parse(event.data);
          if(data.type==='quality'){policy.choose(data.preference,data.automatic);await adjust();return;}
          if(data.type==='feedback'){const text=policy.sample({...lastStats,...data.stats});if(text){await adjust();control?.send(JSON.stringify({type:'qualityNotice',text,level:policy.level}));}return;}
          queueInput(data);
        }catch{await stop();}
      };
    };
    wire({channel:pc.createDataChannel('control',{ordered:true})});
    wire({channel:pc.createDataChannel('pointer',{ordered:false,maxRetransmits:0})});
    pc.onconnectionstatechange=()=>{if(['failed','disconnected','closed'].includes(pc.connectionState))void stop();};
    await applyQuality(sender,track,policy);await pc.setLocalDescription(await pc.createOffer());await gather(pc);
    if(closed)return;const r=await post('signal',pc.localDescription);if(!r.ok)throw new Error('Autorização encerrada.');
    $('status').textContent='Conectando ao técnico…';
  }catch(error){await stop(true,error.name==='NotAllowedError'?'A escolha da tela foi cancelada. Solicite um novo atendimento para tentar novamente.':(error.message||'Não foi possível compartilhar. Solicite um novo atendimento.'));}finally{selecting=false;}
};
const timer=setInterval(async()=>{
  if(closed||busy)return;busy=true;
  try{
    const response=await fetch('/support/state');if(!response.ok)throw new Error();
    const state=await response.json();if(!['approved','active'].includes(state.state))throw new Error();
    if(!pc&&!selecting){$('capture-title').textContent='Você escolhe o que mostrar.';$('status').textContent=state.operatorName+' · '+(state.permission==='control'?'controle autorizado':'somente visualização')+'. Escolha sua tela para começar.';$('share').disabled=false;document.body.dataset.state='ready';}
    if(pc&&state.answer&&!applied){applied=true;await pc.setRemoteDescription(state.answer);}
    if(pc?.connectionState==='connected'){
      $('capture-title').textContent='Sua tela está compartilhada.';document.body.dataset.state='active';
      $('status').textContent='Tela compartilhada · '+state.operatorName+' · '+(state.permission==='control'?'controle autorizado':'somente visualização');
      lastStats=sampler.sample(await pc.getStats());await post('stats',lastStats);
    }
  }catch{await stop(false);}finally{busy=false;}
},1000);
window.addEventListener('pagehide',()=>{stream?.getTracks().forEach(t=>t.stop());pc?.close();void post('end',{});});
