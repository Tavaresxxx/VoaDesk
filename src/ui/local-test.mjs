import {peer, prefer, gather} from '../video/peer.mjs';
import {TestDesktop, drawDesktop, WIDTH, HEIGHT} from './test-desktop.mjs';

// Both peers live in this window. No signaling service, client identity or OS bridge is used.
export function createLocalTest() {
  const desktop = new TestDesktop(), canvas = document.createElement('canvas');
  canvas.width = WIDTH; canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d', {alpha: false});
  let stream, pc, timer, closed = false, state = 'approved', offer;
  const snapshot = () => ({state, permission: 'control', permissionRevision: 1, offer});
  function close() {
    closed = true; state = 'ended'; clearInterval(timer);
    stream?.getTracks().forEach(track => track.stop()); pc?.close(); desktop.input({type: 'release'});
    canvas.width = canvas.height = 0;
  }
  return {
    async start() {
      try {
        drawDesktop(ctx, desktop);
        stream = canvas.captureStream(20); pc = peer();
        const track = stream.getVideoTracks()[0]; track.contentHint = 'detail';
        pc.addTrack(track, stream); prefer(pc.getTransceivers()[0], true);
        const control = pc.createDataChannel('control');
        const pointer = pc.createDataChannel('pointer', {ordered: false, maxRetransmits: 0});
        const send = value => { if (control.readyState === 'open') control.send(JSON.stringify(value)); };
        control.onopen = () => {
          state = 'active';
          send({type: 'monitors', selected: 'test', generation: 1, monitors: [{id: 'test', label: 'Tela de testes local', width: WIDTH, height: HEIGHT}]});
        };
        const input = event => {
          if (closed) return;
          let data; try { data = JSON.parse(event.data); } catch { return; }
          if (!data || data.monitorId !== 'test' || data.monitorGeneration !== 1 || data.permissionRevision !== 1) return;
          desktop.input(data);
          if (!['move', 'release', 'feedback', 'quality'].includes(data.type)) send({type: 'qualityNotice', text: desktop.lastAction});
        };
        control.onmessage = pointer.onmessage = input;
        timer = setInterval(() => drawDesktop(ctx, desktop), 50);
        await pc.setLocalDescription(await pc.createOffer()); await gather(pc);
        if (closed) throw new Error('Teste cancelado.');
        offer = pc.localDescription.toJSON(); return snapshot();
      } catch (error) { close(); throw error; }
    },
    async post(action, payload) {
      if (action === 'end') { close(); return {}; }
      if (closed) throw new Error('Tela de testes encerrada.');
      if (action === 'state') return snapshot();
      if (action === 'signal') { await pc.setRemoteDescription(payload); return {}; }
      throw new Error('Ação de teste indisponível.');
    },
    close
  };
}
