import { h264Codecs, profileFor } from './profiles.mjs';
export async function gather(pc) {
  if(pc.iceGatheringState==='complete')return;
  await new Promise((ok,fail)=>{const timer=setTimeout(()=>done(new Error('Tempo de conexão excedido.')),10000);const check=()=>{if(pc.iceGatheringState==='complete')done();};function done(e){clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);e?fail(e):ok();}pc.addEventListener('icegatheringstatechange',check);check();});
}
export function peer(config={}){return new RTCPeerConnection({iceServers:config.iceServers??[],iceTransportPolicy:config.iceTransportPolicy??'all',bundlePolicy:'max-bundle'});}
export function prefer(transceiver,send){const c=h264Codecs((send?RTCRtpSender:RTCRtpReceiver).getCapabilities('video'));if(!c.length)throw new Error('H.264 indisponível neste Edge.');transceiver.setCodecPreferences(c);}
export async function applyQuality(sender,track,policy) {const p=profileFor(policy.preference);track.contentHint=p.hint;await track.applyConstraints({frameRate:{ideal:60,max:60}});const params=sender.getParameters();if(!params.encodings?.length)params.encodings=[{}];Object.assign(params.encodings[0],policy.encoding(track.getSettings().height));params.degradationPreference=p.degradation;await sender.setParameters(params);}
export function position(event,video){const rect=video.getBoundingClientRect(),ratio=video.videoWidth/video.videoHeight;if(!Number.isFinite(ratio)||!video.videoWidth)return null;const w=Math.min(rect.width,rect.height*ratio),h=w/ratio;const x=(event.clientX-rect.left-(rect.width-w)/2)/w,y=(event.clientY-rect.top-(rect.height-h)/2)/h;return x>=0&&x<=1&&y>=0&&y<=1?{x,y}:null;}
