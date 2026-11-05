import test from 'node:test';
import assert from 'node:assert/strict';
import { StatsSampler, BoundedSamples } from '../src/video/stats.mjs';
import { encodingFor, h264Codecs, canCaptureScreen } from '../src/video/profiles.mjs';

test('H.264 exige pacote modo 1, sem fallback VP8 ou H264 modo 0', () => {
  const codecs = h264Codecs({ codecs: [{ mimeType: 'video/VP8' }, { mimeType: 'video/H264', sdpFmtpLine: 'packetization-mode=0' }, { mimeType: 'video/H264', sdpFmtpLine: 'profile-level-id=64001f;packetization-mode=1' }, { mimeType: 'video/H264', sdpFmtpLine: 'packetization-mode=1;profile-level-id=42e01f' }] });
  assert.equal(codecs.length, 2); assert.match(codecs[0].sdpFmtpLine, /42e01f/);
  assert.deepEqual(h264Codecs(null), []);
});
test('perfil preserva resolução original ou limita fluidez sem distorção', () => {
  assert.equal(encodingFor('quality', 2160).scaleResolutionDownBy, 1);
  assert.equal(encodingFor('smooth', 2160).scaleResolutionDownBy, 2);
  assert.equal(encodingFor('smooth', 720).scaleResolutionDownBy, 1);
  assert.throws(() => encodingFor('__proto__', 1080), TypeError);
});
test('captura real exige SDR confirmado, nunca presume HDR desconhecido', () => {
  assert.equal(canCaptureScreen({ color: { status: 'sdr', displays: [{}] } }), true);
  assert.equal(canCaptureScreen({ color: { status: 'sdr', displays: [{}, {}] } }), true);
  for (const color of [{ status: 'sdr', displays: [] }, { status: 'unknown', displays: [{}] }, { status: 'unsupported-color', displays: [{}] }]) assert.equal(canCaptureScreen({ color }), false);
});
test('estatísticas usam diferenças de intervalo e não confundem RTT com latência visual', () => {
  const sampler = new StatsSampler();
  const report = (time, frames, bytes, encTime, decTime) => new Map([
    ['out', { id: 'out', type: 'outbound-rtp', kind: 'video', timestamp: time, framesEncoded: frames, bytesSent: bytes, totalEncodeTime: encTime, codecId: 'codec' }],
    ['in', { id: 'in', type: 'inbound-rtp', kind: 'video', timestamp: time, framesDecoded: frames, totalDecodeTime: decTime, jitter: .003, framesDropped: 2 }],
    ['codec', { id: 'codec', type: 'codec', mimeType: 'video/H264' }],
    ['pair', { id: 'pair', type: 'candidate-pair', nominated: true, state: 'succeeded', currentRoundTripTime: .03 }]
  ]);
  const first = sampler.sample(report(1000, 10, 1000, .05, .02));
  assert.equal(first.bitrateMbps, null); assert.equal(first.encodeMs, null);
  const second = sampler.sample(report(2000, 40, 1001000, .2, .08));
  assert.equal(second.bitrateMbps, 8); assert.ok(Math.abs(second.encodeMs - 5) < .001); assert.equal(second.decodeMs, 2);
  assert.equal(second.rttMs, 30); assert.equal(second.visualLatencyMs, null); assert.equal(second.jitterMs, 3);
  assert.equal(second.powerEfficientEncoder, null); assert.equal(second.presentedFps, null);
  assert.equal(sampler.sample(new Map()).bitrateMbps, null);
});
test('buffer de diagnóstico é limitado para sessões longas', () => {
  const samples = new BoundedSamples(1800);
  for (let i = 0; i < 7200; i++) samples.add(i);
  assert.equal(samples.items.length, 1800); assert.equal(samples.items[0], 5400);
});
