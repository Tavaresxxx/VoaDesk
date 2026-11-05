import { pathToFileURL } from 'node:url';
import { createHost } from '../src/host/server.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(pathToFileURL(process.env.FAROL_PLAYWRIGHT).href);
const dataDir = await mkdtemp(join(tmpdir(), 'farol-diag-'));
const host = await createHost({ dataDir, idleTimeout: 0 });
const browser = await chromium.launch({ executablePath: process.env.FAROL_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true, args: process.env.FAROL_DIAG_NO_MDNS === '1' ? ['--disable-features=WebRtcHideLocalIpsWithMdns'] : [] });
try {
  const page = await browser.newPage(); await page.goto(host.bootstrapUrl);
  const result = await page.evaluate(async () => {
    const { LocalVideoSession } = await import('/video/pipeline.mjs');
    const { createPattern } = await import('/video/pattern.mjs');
    const video = document.createElement('video'); video.muted = true; document.body.append(video);
    const states = [];
    const s = new LocalVideoSession(video, { onState: (state, detail) => states.push({ state, detail }) });
    await s.start({ kind: 'pattern', source: createPattern });
    await new Promise(r => setTimeout(r, 5000));
    const peers = await Promise.all([s.tx, s.rx].filter(Boolean).map(async pc => ({ state: pc.connectionState, ice: pc.iceConnectionState, gathering: pc.iceGatheringState, candidates: pc.localDescription.sdp.split('\n').filter(line => line.startsWith('a=candidate:')).map(line => { const parts = line.split(' '); return { protocol: parts[2], mdns: parts[4].endsWith('.local'), port: Number(parts[5]) }; }), remoteCandidateCount: pc.remoteDescription.sdp.split('\n').filter(line => line.startsWith('a=candidate:')).length, stats: [...(await pc.getStats()).values()].filter(s => ['candidate-pair', 'local-candidate', 'remote-candidate', 'transport'].includes(s.type)).map(s => ({ type: s.type, state: s.state, candidateType: s.candidateType, protocol: s.protocol, dtlsState: s.dtlsState, packetsSent: s.packetsSent, packetsReceived: s.packetsReceived })) })));
    const result = { states, peers, last: s.samples.items.at(-1), video: { readyState: video.readyState, width: video.videoWidth }, track: s.track?.readyState };
    s.stop(); return result;
  }); console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); await host.close(); await rm(dataDir, { force: true, recursive: true }); }
