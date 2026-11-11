import { h264Codecs, profileFor } from './profiles.mjs';
// Keep only technical events, never SDP, tokens, client IDs or input contents.
export function connectionEvent(stage, detail = '') {
  try { const key='voadesk-connection-events', events=JSON.parse(localStorage.getItem(key)||'[]');
    events.push({at:new Date().toISOString(),stage,detail:String(detail).slice(0,160)});
    localStorage.setItem(key,JSON.stringify(events.slice(-80)));
  } catch {}
}
export function watchConnection(pc,{onPause=()=>{},onResume=()=>{},onEnd=()=>{},onRecover=null,graceMs=8000,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  let timer=null,recoveryTimer=null,paused=false,disposed=false,attempted=false,episode=0;
  const cancel=()=>{if(timer!==null)clearTimer(timer);if(recoveryTimer!==null)clearTimer(recoveryTimer);timer=recoveryTimer=null;};
  const change=()=>{
    if(disposed)return;const state=pc.connectionState;connectionEvent('transport',state);
    if(state==='connected'){cancel();attempted=false;episode++;if(paused){paused=false;onResume();}return;}
    if(state==='disconnected'||state==='failed'&&onRecover){
      if(!paused){paused=true;onPause();}
      if(timer===null)timer=setTimer(()=>{timer=null;if(!disposed&&pc.connectionState!=='connected')onEnd('media-timeout');},graceMs);
      if(onRecover&&!attempted){attempted=true;const current=episode;recoveryTimer=setTimer(()=>{recoveryTimer=null;if(disposed||pc.connectionState==='connected')return;Promise.resolve().then(onRecover).catch(()=>{if(!disposed&&episode===current&&pc.connectionState!=='connected'){cancel();onEnd('media-recovery-failed');}});},1000);}
    }else if(state==='failed'||state==='closed'){cancel();onEnd('media-'+state);}
  };
  pc.addEventListener('connectionstatechange',change);
  return ()=>{disposed=true;cancel();pc.removeEventListener('connectionstatechange',change);};
}
export async function gather(pc) {
  if(pc.iceGatheringState==='complete')return;
  await new Promise((ok,fail)=>{const timer=setTimeout(()=>done(new Error('Tempo de conexão excedido.')),10000);const check=()=>{if(pc.iceGatheringState==='complete')done();};function done(e){clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);e?fail(e):ok();}pc.addEventListener('icegatheringstatechange',check);check();});
}
export function peer(config={}){return new RTCPeerConnection({iceServers:config.iceServers??[],iceTransportPolicy:config.iceTransportPolicy??'all',bundlePolicy:'max-bundle'});}
export function prefer(transceiver,send){const c=h264Codecs((send?RTCRtpSender:RTCRtpReceiver).getCapabilities('video'));if(!c.length)throw new Error('H.264 indisponível neste Edge.');transceiver.setCodecPreferences(c);}
export async function applyQuality(sender,track,policy,{preScaled=false}={}) {const p=profileFor(policy.preference);track.contentHint=p.hint;const encoding=policy.encoding(track.getSettings().height);if(preScaled)encoding.scaleResolutionDownBy=1;await track.applyConstraints({frameRate:{ideal:encoding.maxFramerate,max:encoding.maxFramerate}});const params=sender.getParameters();if(!params.encodings?.length)params.encodings=[{}];Object.assign(params.encodings[0],encoding);params.degradationPreference=p.degradation;await sender.setParameters(params);}
export function position(event,video){const rect=video.getBoundingClientRect(),ratio=video.videoWidth/video.videoHeight;if(!Number.isFinite(ratio)||!video.videoWidth)return null;const w=Math.min(rect.width,rect.height*ratio),h=w/ratio;const x=(event.clientX-rect.left-(rect.width-w)/2)/w,y=(event.clientY-rect.top-(rect.height-h)/2)/h;return x>=0&&x<=1&&y>=0&&y<=1?{x,y}:null;}
