import { encodingFor, profileFor } from './profiles.mjs';
export function diagnose(s = {}, local = false) {
  const findings=[];
  if((s.lossPercent??0)>3||(s.jitterMs??0)>35||(s.rttMs??0)>160) findings.push({kind:'network',text:local?'O caminho local oscilou. Verifique a carga dos aplicativos.':'Há sinais de instabilidade na conexão; isso não identifica sozinho a origem na internet.'});
  if(s.qualityLimitation==='cpu'||(s.encodeMs??0)>1000/Math.max(15,s.encodedFps??30))findings.push({kind:'client',text:'O computador atendido pode estar com dificuldade para preparar a imagem.'});
  if((s.decodeMs??0)>1000/Math.max(15,s.decodedFps??30)||(s.dropPercent??0)>12)findings.push({kind:'technician',text:'O computador do técnico pode estar com dificuldade para processar a imagem.'});
  if(s.route==='relay')findings.push({kind:'relay',text:'A sessão usa uma conexão intermediária. Isso pode ser normal nesta rede.'});
  if(!findings.length)findings.push({kind:'unknown',text:s.codec?'Nenhum gargalo evidente nesta amostra.':'Ainda não há vídeo suficiente para avaliar rede e processamento.'});
  return findings;
}
export class QualityPolicy {
  constructor({preference='balanced',automatic=true,now=()=>performance.now()}={}) {profileFor(preference);Object.assign(this,{preference,automatic,now});this.level=0;this.bad=0;this.good=0;this.last=-Infinity;}
  choose(preference,automatic=this.automatic){profileFor(preference);this.preference=preference;this.automatic=automatic;this.level=0;this.bad=this.good=0;this.last=-Infinity;}
  sample(s) {
    if(!this.automatic)return null;
    const bad=(s.lossPercent??0)>3||(s.jitterMs??0)>35||(s.rttMs??0)>160||(s.decodeMs??0)>35||(s.captureBridgeMs??0)>50||s.qualityLimitation==='cpu'||s.qualityLimitation==='bandwidth';
    const known=['lossPercent','jitterMs','rttMs','decodeMs'].some(k=>Number.isFinite(s[k]));
    this.bad=bad?this.bad+1:0;this.good=known&&!bad?this.good+1:0;
    if(this.bad>=3&&this.level<2&&this.now()-this.last>=20000){this.level++;this.last=this.now();this.bad=this.good=0;return 'A conexão ou o processamento oscilou. Ajustamos a imagem para manter o atendimento.';}
    if(this.good>=15&&this.level>0&&this.now()-this.last>=30000){this.level--;this.last=this.now();this.bad=this.good=0;return 'A conexão estabilizou. Estamos recuperando a nitidez da imagem.';}
    return null;
  }
  encoding(height){const p=encodingFor(this.preference,height);if(this.level){p.maxBitrate=Math.round(p.maxBitrate*(this.level===1?.65:.4));p.maxFramerate=Math.min(p.maxFramerate,this.level===1?30:20);if(this.preference!=='quality')p.scaleResolutionDownBy=Math.max(p.scaleResolutionDownBy,(height||1080)/(this.level===1?1080:720),1);}return p;}
}
