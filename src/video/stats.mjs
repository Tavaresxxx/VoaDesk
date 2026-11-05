const finite = value => Number.isFinite(value) ? value : null;
export class StatsSampler {
  previous = null;
  sample(report, presentation = {}) {
    const all = [...report.values()];
    const out = all.find(s => s.type === 'outbound-rtp' && s.kind === 'video');
    const input = all.find(s => s.type === 'media-source' && s.kind === 'video');
    const incoming = all.find(s => s.type === 'inbound-rtp' && s.kind === 'video');
    const transport = all.find(s => s.type === 'transport' && s.selectedCandidatePairId);
    const pair = all.find(s => s.id === transport?.selectedCandidatePairId) ?? all.find(s => s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded');
    const codec = all.find(s => s.id === out?.codecId);
    const local = all.find(s => s.id === pair?.localCandidateId);
    const remote = all.find(s => s.id === pair?.remoteCandidateId);
    const prev = this.previous;
    const dt = prev && out ? (out.timestamp - prev.out.timestamp) / 1000 : 0;
    const delta = (s, old, field) => s && old && Number.isFinite(s[field]) && Number.isFinite(old[field]) ? Math.max(0, s[field] - old[field]) : null;
    const rate = (s, old, field) => { const change = delta(s, old, field); return dt > 0 && change !== null ? finite(change / dt) : null; };
    const perFrame = (s, old, time, frames) => {
      const count = delta(s, old, frames);
      const seconds = delta(s, old, time);
      return count > 0 && seconds !== null ? seconds * 1000 / count : null;
    };
    const r = {
      timestamp: new Date().toISOString(), width: out?.frameWidth ?? null, height: out?.frameHeight ?? null,
      capturedFps: finite(input?.framesPerSecond), encodedFps: out?.framesPerSecond ?? rate(out, prev?.out, 'framesEncoded'),
      decodedFps: incoming?.framesPerSecond ?? rate(incoming, prev?.incoming, 'framesDecoded'),
      presentedFps: finite(presentation.fps), presentationCallbacks: presentation.total ?? null,
      bitrateMbps: rate(out, prev?.out, 'bytesSent') == null ? null : rate(out, prev?.out, 'bytesSent') * 8 / 1e6,
      rttMs: pair?.currentRoundTripTime == null ? null : pair.currentRoundTripTime * 1000,
      jitterMs: incoming?.jitter == null ? null : incoming.jitter * 1000,
      packetsLost: incoming?.packetsLost ?? null, packetsReceived: incoming?.packetsReceived ?? null,
      encodeMs: perFrame(out, prev?.out, 'totalEncodeTime', 'framesEncoded'),
      decodeMs: perFrame(incoming, prev?.incoming, 'totalDecodeTime', 'framesDecoded'),
      decodedFrames: incoming?.framesDecoded ?? null, encodedFrames: out?.framesEncoded ?? null,
      droppedFrames: incoming?.framesDropped ?? null,
      codec: codec?.mimeType ?? null, codecParameters: codec?.sdpFmtpLine ?? null,
      encoder: out?.encoderImplementation ?? 'não exposto', decoder: incoming?.decoderImplementation ?? 'não exposto',
      powerEfficientEncoder: out?.powerEfficientEncoder ?? null, powerEfficientDecoder: incoming?.powerEfficientDecoder ?? null,
      route: pair ? ((local?.candidateType === 'relay' || remote?.candidateType === 'relay') ? 'relay' : 'local-direct') : 'unknown',
      qualityLimitation: out?.qualityLimitationReason ?? null,
      visualLatencyMs: null
    };
    if (out) this.previous = { out, incoming };
    return r;
  }
}
export class BoundedSamples {
  constructor(limit = 1800) { this.limit = limit; this.items = []; }
  add(item) { if (this.items.length === this.limit) this.items.shift(); this.items.push(item); }
}
