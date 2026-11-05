export const PROFILES = Object.freeze({
  quality: Object.freeze({ label: 'Qualidade', bitrate: 16000000, fps: 30, maxHeight: null, hint: 'detail', degradation: 'maintain-resolution' }),
  balanced: Object.freeze({ label: 'Equilibrado', bitrate: 8000000, fps: 60, maxHeight: null, hint: 'detail', degradation: 'balanced' }),
  smooth: Object.freeze({ label: 'Fluidez', bitrate: 5000000, fps: 60, maxHeight: 1080, hint: 'motion', degradation: 'maintain-framerate' })
});
export function profileFor(key) {
  if (!Object.hasOwn(PROFILES, key)) throw new TypeError('Perfil desconhecido.');
  return PROFILES[key];
}
export function encodingFor(key, height) {
  const p = profileFor(key);
  return { maxBitrate: p.bitrate, maxFramerate: p.fps, scaleResolutionDownBy: p.maxHeight && height > p.maxHeight ? height / p.maxHeight : 1, priority: 'low', networkPriority: 'low' };
}
export function h264Codecs(capabilities) {
  const codecs = (capabilities?.codecs ?? []).filter(c => c.mimeType?.toLowerCase() === 'video/h264' && /(?:^|;)\s*packetization-mode=1(?:;|$)/i.test(c.sdpFmtpLine ?? ''));
  // Prefer constrained baseline without rewriting SDP or codec parameters.
  return codecs.sort((a, b) => Number(/profile-level-id=42/i.test(b.sdpFmtpLine)) - Number(/profile-level-id=42/i.test(a.sdpFmtpLine)));
}
export function canCaptureScreen(environment) {
  return environment?.color?.status === 'sdr' && environment.color.displays?.length > 0;
}
