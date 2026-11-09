const finite = value => Number.isFinite(value) ? value : null;
export class StatsSampler {
  previous = null;
  sample(report,presentation={}) {
    const all=[...report.values()],find=type=>all.find(s=>s.type===type&&s.kind==='video');
    const out=find('outbound-rtp'),incoming=find('inbound-rtp'),input=find('media-source');
    const transport=all.find(s=>s.type==='transport'&&s.selectedCandidatePairId);
    const pair=all.find(s=>s.id===transport?.selectedCandidatePairId)??all.find(s=>s.type==='candidate-pair'&&s.nominated&&s.state==='succeeded');
    const codec=all.find(s=>s.id===(out?.codecId??incoming?.codecId)),local=all.find(s=>s.id===pair?.localCandidateId),remote=all.find(s=>s.id===pair?.remoteCandidateId),prev=this.previous;
    const delta=(s,old,field)=>s&&old&&s.id===old.id&&Number.isFinite(s[field])&&Number.isFinite(old[field])&&s[field]>=old[field]?s[field]-old[field]:null;
    const rate=(s,old,f)=>{const d=delta(s,old,f),dt=s&&old?(s.timestamp-old.timestamp)/1000:0;return d!==null&&dt>0?d/dt:null;};
    const per=(s,old,time,frames)=>{const n=delta(s,old,frames),t=delta(s,old,time);return n>0&&t!==null?t*1000/n:null;};
    const lost=delta(incoming,prev?.incoming,'packetsLost'),received=delta(incoming,prev?.incoming,'packetsReceived'),dropped=delta(incoming,prev?.incoming,'framesDropped'),decoded=delta(incoming,prev?.incoming,'framesDecoded');
    const r={timestamp:new Date().toISOString(),width:out?.frameWidth??incoming?.frameWidth??null,height:out?.frameHeight??incoming?.frameHeight??null,
      capturedFps:finite(input?.framesPerSecond),encodedFps:finite(out?.framesPerSecond)??rate(out,prev?.out,'framesEncoded'),decodedFps:finite(incoming?.framesPerSecond)??rate(incoming,prev?.incoming,'framesDecoded'),
      presentedFps:finite(presentation.fps),presentationCallbacks:presentation.total??null,
      bitrateMbps:(rate(out,prev?.out,'bytesSent')??rate(incoming,prev?.incoming,'bytesReceived'))===null?null:(rate(out,prev?.out,'bytesSent')??rate(incoming,prev?.incoming,'bytesReceived'))*8/1e6,
      rttMs:pair?.currentRoundTripTime==null?null:pair.currentRoundTripTime*1000,jitterMs:incoming?.jitter==null?null:incoming.jitter*1000,
      packetsLost:incoming?.packetsLost??null,packetsReceived:incoming?.packetsReceived??null,lossPercent:lost!==null&&received!==null&&lost+received>0?100*lost/(lost+received):null,
      encodeMs:per(out,prev?.out,'totalEncodeTime','framesEncoded'),decodeMs:per(incoming,prev?.incoming,'totalDecodeTime','framesDecoded'),
      jitterBufferMs:per(incoming,prev?.incoming,'jitterBufferDelay','jitterBufferEmittedCount'),freezeCount:incoming?.freezeCount??null,freezesInInterval:delta(incoming,prev?.incoming,'freezeCount'),
      decodedFrames:incoming?.framesDecoded??null,encodedFrames:out?.framesEncoded??null,droppedFrames:incoming?.framesDropped??null,dropPercent:dropped!==null&&decoded!==null&&dropped+decoded>0?100*dropped/(dropped+decoded):null,
      codec:codec?.mimeType??null,codecParameters:codec?.sdpFmtpLine??null,encoder:out?.encoderImplementation??'não exposto',decoder:incoming?.decoderImplementation??'não exposto',powerEfficientEncoder:out?.powerEfficientEncoder??null,powerEfficientDecoder:incoming?.powerEfficientDecoder??null,
      route:pair?(local?.candidateType==='relay'||remote?.candidateType==='relay'?'relay':local?.candidateType==='srflx'||remote?.candidateType==='srflx'?'direct-nat':'local-direct'):'unknown',qualityLimitation:out?.qualityLimitationReason??null,visualLatencyMs:null};
    this.previous={out,incoming};return r;
  }
}
export class BoundedSamples { constructor(limit=1800){this.limit=limit;this.items=[];}add(item){if(this.items.length===this.limit)this.items.shift();this.items.push(item);} }
