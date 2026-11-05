import { profileFor, encodingFor, h264Codecs } from './profiles.mjs';
import { StatsSampler, BoundedSamples } from './stats.mjs';

function waitForIce(pc, signal) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('ICE local excedeu 10 segundos.')), 10000);
    const check = () => { if (pc.iceGatheringState === 'complete') done(); };
    const abort = () => done(new DOMException('Sessão cancelada.', 'AbortError'));
    function done(error) { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', check); signal.removeEventListener('abort', abort); error ? reject(error) : resolve(); }
    pc.addEventListener('icegatheringstatechange', check);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

export class LocalVideoSession {
  constructor(video, { onState = () => {}, onStats = () => {}, onEnd = () => {} } = {}) {
    this.video = video; this.onState = onState; this.onStats = onStats; this.onEnd = onEnd;
    this.state = 'idle'; this.samples = new BoundedSamples(); this.generation = 0; this.changeQueue = Promise.resolve();
  }
  emit(state, detail = '') { this.state = state; this.onState(state, detail); }
  async start({ source, kind, profile = 'balanced' }) {
    if (this.state !== 'idle' && this.state !== 'ended') throw new Error('Já existe uma sessão.');
    profileFor(profile);
    const generation = ++this.generation;
    this.startTime = new Date().toISOString(); this.kind = kind; this.profile = profile;
    this.abort = new AbortController(); this.sampler = new StatsSampler(); this.samples = new BoundedSamples();
    this.presentedTotal = 0; this.presentationBase = 0; this.presentationTime = performance.now(); this.presentedFps = null;
    this.emit('starting', 'Aguardando a fonte de imagem…');
    try {
      // Source callback executes before the first await to preserve transient activation.
      const acquired = await source();
      if (generation !== this.generation) { acquired.dispose?.(); acquired.stream.getTracks().forEach(t => t.stop()); return; }
      this.source = acquired; this.stream = acquired.stream;
      const track = this.stream.getVideoTracks()[0];
      if (!track) throw new Error('A fonte não forneceu vídeo.');
      this.track = track;
      track.addEventListener('ended', () => this.stop('source-ended'), { once: true });
      const codecs = h264Codecs(RTCRtpSender.getCapabilities('video'));
      const receivingCodecs = h264Codecs(RTCRtpReceiver.getCapabilities('video'));
      if (!codecs.length || !receivingCodecs.length) throw new Error('H.264 com packetization-mode=1 indisponível neste runtime.');
      this.tx = new RTCPeerConnection({ iceServers: [], bundlePolicy: 'max-bundle' });
      this.rx = new RTCPeerConnection({ iceServers: [], bundlePolicy: 'max-bundle' });
      const transceiver = this.tx.addTransceiver(track, { direction: 'sendonly', streams: [this.stream] });
      transceiver.setCodecPreferences(codecs);
      this.sender = transceiver.sender;
      this.rx.ontrack = event => { this.video.srcObject = new MediaStream([event.track]); this.video.play().catch(() => {}); };
      for (const pc of [this.tx, this.rx]) pc.onconnectionstatechange = () => {
        if (generation !== this.generation) return;
        if (pc.connectionState === 'failed') this.stop('connection-lost');
        if (pc.connectionState === 'disconnected') {
          this.emit('interrupted', 'Vídeo interrompido; encerramento em até 5 segundos.');
          this.disconnectTimer ??= setTimeout(() => this.stop('connection-lost'), 5000);
        }
        if (this.tx?.connectionState === 'connected' && this.rx?.connectionState === 'connected') {
          clearTimeout(this.disconnectTimer); this.disconnectTimer = null;
          if (this.presentedTotal) this.emit('active', 'Ensaio local ativo · somente visualização');
        }
      };
      await this.applyProfile(profile);
      const guard = () => { if (generation !== this.generation) throw new DOMException('Cancelado', 'AbortError'); };
      await this.tx.setLocalDescription(await this.tx.createOffer()); guard();
      await waitForIce(this.tx, this.abort.signal); guard();
      await this.rx.setRemoteDescription(this.tx.localDescription); guard();
      this.rx.getTransceivers()[0].setCodecPreferences(receivingCodecs);
      await this.rx.setLocalDescription(await this.rx.createAnswer()); guard();
      await waitForIce(this.rx, this.abort.signal); guard();
      await this.tx.setRemoteDescription(this.rx.localDescription); guard();
      this.watchPresentation(generation);
      const sample = async () => {
        if (generation !== this.generation) return;
        try {
          const [tx, rx] = await Promise.all([this.tx.getStats(), this.rx.getStats()]);
          if (generation !== this.generation) return;
          const combined = new Map(tx);
          for (const [id, value] of rx) if (value.type === 'inbound-rtp' && value.kind === 'video') combined.set(`rx-${id}`, value);
          const stat = this.sampler.sample(combined, { total: this.presentedTotal, fps: this.presentedFps });
          if (stat.codec && stat.codec.toLowerCase() !== 'video/h264') throw new Error('O codec negociado não é H.264.');
          this.samples.add(stat); this.onStats(stat);
        } catch (error) { if (generation === this.generation) { this.lastError = error.message; this.stop('failed'); } }
        if (generation === this.generation) this.sampleTimer = setTimeout(sample, 1000);
      };
      this.sampleTimer = setTimeout(sample, 1000);
      // Success requires actual decoded/presented output, not just signaling.
      this.firstFrameTimer = setTimeout(() => { if (!this.presentedTotal) { this.lastError = 'Nenhum quadro apresentado em 15 segundos.'; this.stop('failed'); } }, 15000);
    } catch (error) {
      if (generation !== this.generation) return;
      this.lastError = error.name === 'NotAllowedError' ? 'Captura cancelada ou recusada. Nenhuma tela está sendo compartilhada.' : error.message;
      this.stop('failed');
    }
  }
  async applyProfile(key) {
    const p = profileFor(key);
    if (!this.track || !this.sender) return;
    const track = this.track, sender = this.sender, oldHint = track.contentHint;
    track.contentHint = p.hint;
    // Capture at most 60, leaving profile FPS to sender so switching profiles is reversible.
    try {
      await track.applyConstraints({ frameRate: { ideal: 60, max: 60 } });
      const parameters = sender.getParameters();
      if (!parameters.encodings?.length) parameters.encodings = [{}];
      Object.assign(parameters.encodings[0], encodingFor(key, track.getSettings().height));
      parameters.degradationPreference = p.degradation;
      await sender.setParameters(parameters);
      this.profile = key;
    } catch (error) { track.contentHint = oldHint; throw error; }
  }
  setProfile(key) {
    profileFor(key);
    const generation = this.generation;
    const operation = this.changeQueue.catch(() => {}).then(async () => { if (generation === this.generation && this.sender) await this.applyProfile(key); });
    this.changeQueue = operation;
    return operation;
  }
  watchPresentation(generation) {
    if (!this.video.requestVideoFrameCallback) return;
    const frame = (now, metadata) => {
      if (generation !== this.generation) return;
      this.presentedTotal = metadata.presentedFrames;
      if (this.state === 'starting' && this.tx?.connectionState === 'connected' && this.rx?.connectionState === 'connected') this.emit('active', 'Ensaio local ativo · somente visualização');
      if (now - this.presentationTime >= 1000) {
        this.presentedFps = (this.presentedTotal - this.presentationBase) * 1000 / (now - this.presentationTime);
        this.presentationBase = this.presentedTotal; this.presentationTime = now;
      }
      this.frameCallback = this.video.requestVideoFrameCallback(frame);
    };
    this.frameCallback = this.video.requestVideoFrameCallback(frame);
  }
  stop(result = 'stopped') {
    if (this.state === 'idle' || this.state === 'ended') return;
    ++this.generation; this.abort?.abort();
    clearTimeout(this.sampleTimer); clearTimeout(this.firstFrameTimer); clearTimeout(this.disconnectTimer); this.disconnectTimer = null;
    if (this.frameCallback != null) this.video.cancelVideoFrameCallback?.(this.frameCallback);
    this.tx?.close(); this.rx?.close();
    this.stream?.getTracks().forEach(t => t.stop()); this.source?.dispose?.();
    this.video.pause(); this.video.srcObject = null;
    this.tx = this.rx = this.sender = this.track = this.stream = this.source = null;
    this.emit('ended', this.lastError || (result === 'source-ended' ? 'Compartilhamento encerrado na fonte.' : 'Ensaio encerrado. Captura liberada.'));
    this.onEnd({ source: this.kind, start: this.startTime, end: new Date().toISOString(), result });
  }
  report() {
    return { schema: 1, scope: 'single-process-local-loopback', profile: this.profile, source: this.kind, start: this.startTime, state: this.state, connection: [this.tx, this.rx].filter(Boolean).map(pc => ({ state: pc.connectionState, ice: pc.iceConnectionState, gathering: pc.iceGatheringState })), capture: this.track?.getSettings() ?? null, samples: this.samples.items, limitations: ['RTT não é latência visual.', 'Sem duas máquinas, STUN/TURN ou entrada remota.', 'Callbacks de vídeo não comprovam varredura física do monitor.', 'Eficiência energética não prova sozinha aceleração GPU.', 'Sem conteúdo de tela ou teclas no relatório.'] };
  }
}
