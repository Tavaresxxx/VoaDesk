import { encodingFor, profileFor } from './profiles.mjs';
export function diagnose(s = {}, local = false) {
  const findings=[];
  if((s.lossPercent??0)>3||(s.jitterMs??0)>35) findings.push({kind:'network',text:local?'O caminho local oscilou. Verifique a carga dos aplicativos.':'Há sinais de instabilidade na conexão; isso não identifica sozinho a origem na internet.'});
  if(s.qualityLimitation==='cpu'||(s.encodeMs??0)>1000/Math.max(15,s.encodedFps??30))findings.push({kind:'client',text:'O computador atendido pode estar com dificuldade para preparar a imagem.'});
  if((s.decodeMs??0)>1000/Math.max(15,s.decodedFps??30)||(s.dropPercent??0)>12)findings.push({kind:'technician',text:'O computador do técnico pode estar com dificuldade para processar a imagem.'});
  if(s.route==='relay')findings.push({kind:'relay',text:'A sessão usa uma conexão intermediária. Isso pode ser normal nesta rede.'});
  if(!findings.length)findings.push({kind:'unknown',text:s.codec?'Nenhum gargalo evidente nesta amostra.':'Ainda não há vídeo suficiente para avaliar rede e processamento.'});
  return findings;
}
export class QualityPolicy {
  constructor({preference='balanced',automatic=true,now=()=>performance.now()}={}) {Object.assign(this,{now});this.choose(preference,automatic);}
  choose(preference,automatic=this.automatic){profileFor(preference);this.preference=preference;this.automatic=automatic;this.level=0;this.networkLevel=0;this.processingLevel=0;this.networkBad=this.processingBad=0;this.average={};this.previousBuffer=null;this.bad=this.good=0;this.last=-Infinity;}
  sample(s) {
    if(!this.automatic)return null;
    const budget=1000/this.encoding().maxFramerate;
    for(const field of ['lossPercent','jitterMs','captureBridgeMs','encodeMs','decodeMs'])if(Number.isFinite(s[field])&&s[field]>=0)this.average[field]=this.average[field]===undefined?s[field]:.5*s[field]+.5*this.average[field];
    const exceeds=(field,limit)=>Number.isFinite(s[field])&&s[field]>limit&&this.average[field]>limit;
    const growingBuffer=Number.isFinite(s.jitterBufferMs)&&s.jitterBufferMs>100&&this.previousBuffer!==null&&s.jitterBufferMs-this.previousBuffer>20;
    this.previousBuffer=Number.isFinite(s.jitterBufferMs)?s.jitterBufferMs:null;
    const processing=exceeds('decodeMs',budget)||exceeds('captureBridgeMs',budget)||exceeds('encodeMs',budget)||s.qualityLimitation==='cpu';
    const network=exceeds('lossPercent',3)||exceeds('jitterMs',35)||growingBuffer||s.qualityLimitation==='bandwidth';
    const bad=network||processing;
    const known=['lossPercent','jitterMs','decodeMs','captureBridgeMs','encodeMs'].some(k=>Number.isFinite(s[k]));
    this.bad=bad?this.bad+1:0;this.good=known&&!bad?this.good+1:0;
    this.networkBad=network?this.networkBad+1:0;this.processingBad=processing?this.processingBad+1:0;
    if((this.networkBad>=3&&this.networkLevel<2||this.processingBad>=3&&this.processingLevel<2)&&this.now()-this.last>=20000){if(this.networkBad>=3)this.networkLevel=Math.min(2,this.networkLevel+1);if(this.processingBad>=3)this.processingLevel=Math.min(2,this.processingLevel+1);this.level=Math.max(this.networkLevel,this.processingLevel);this.last=this.now();this.bad=this.good=this.networkBad=this.processingBad=0;return 'A conexão ou o processamento oscilou. Ajustamos a imagem para manter o atendimento.';}
    const processingFields=['captureBridgeMs','encodeMs','decodeMs'].filter(k=>Number.isFinite(s[k]));
    const nextFps=this.processingLevel===2?Math.min(profileFor(this.preference).fps,30):profileFor(this.preference).fps;
    const canRecoverProcessing=this.processingLevel===0||processingFields.length>0&&processingFields.every(k=>s[k]<=1000/nextFps*.9&&this.average[k]<=1000/nextFps*.9);
    if(this.good>=15&&this.level>0&&canRecoverProcessing&&this.now()-this.last>=30000){this.level--;this.networkLevel=Math.min(this.networkLevel,this.level);this.processingLevel=Math.min(this.processingLevel,this.level);this.last=this.now();this.bad=this.good=this.networkBad=this.processingBad=0;return 'A conexão estabilizou. Estamos recuperando a nitidez da imagem.';}
    return null;
  }
  encoding(height){const p=encodingFor(this.preference,height);if(this.level){p.maxBitrate=Math.round(p.maxBitrate*(this.level===1?.65:.4));if(this.processingLevel)p.maxFramerate=Math.min(p.maxFramerate,this.processingLevel===1?30:20);if(this.preference!=='quality')p.scaleResolutionDownBy=Math.max(p.scaleResolutionDownBy,(height||1080)/(this.level===1?1080:720),1);}return p;}
}
