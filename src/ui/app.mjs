import { LocalVideoSession } from '/video/pipeline.mjs';
import { canCaptureScreen } from '/video/profiles.mjs';
import { createPattern } from '/video/pattern.mjs';

const $ = id => document.getElementById(id);
let environment;
let currentStats;
let historyPromise = Promise.resolve();
const active = () => ['starting', 'active', 'interrupted'].includes(session.state);
const format = (value, suffix = '', digits = 1) => value == null || !Number.isFinite(value) ? 'não exposto' : `${value.toFixed(digits)}${suffix}`;
const post = (url, body, keepalive = false) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Farol-Request': '1' }, body: JSON.stringify(body), keepalive });

function updateStart() { $('start').disabled = active() || !$('consent').checked || !environment || ($('source').value === 'screen' && !canCaptureScreen(environment)); }
function sourceHelp() {
  $('source-help').textContent = $('source').value === 'pattern' ? 'Textos pequenos, cores e movimento. Não captura sua tela.' : canCaptureScreen(environment) ? 'Escolha um único monitor no seletor. Tudo que estiver visível nele será capturado apenas neste computador.' : 'Captura bloqueada: SDR não confirmado em todos os monitores ativos. HDR/WCG e estado de cor desconhecido ainda não são suportados. Reabra após mudar a configuração.';
  updateStart();
}
const states = { idle: 'Aguardando início', starting: 'Preparando vídeo…', active: 'Ensaio local ativo', interrupted: 'Conexão local interrompida', ended: 'Ensaio encerrado' };
const session = new LocalVideoSession($('video'), {
  onState(state, detail) {
    $('status').textContent = states[state];
    $('status-dot').classList.toggle('live', state === 'active');
    $('stop').disabled = !active(); $('source').disabled = active(); $('consent').disabled = active();
    $('profile').disabled = state === 'starting' || state === 'interrupted';
    $('message').textContent = detail;
    $('message').classList.toggle('error', Boolean(session.lastError));
    $('video').hidden = !active(); $('placeholder').hidden = active();
    if (state === 'ended') { $('consent').checked = false; $('export').disabled = session.samples.items.length === 0; }
    updateStart();
  },
  onStats(stats) {
    currentStats = stats;
    $('resolution').textContent = stats.width ? `${stats.width} × ${stats.height}` : '—';
    $('fps').textContent = format(stats.encodedFps, '', 0);
    $('bitrate').textContent = format(stats.bitrateMbps, ' Mbps');
    $('rtt').textContent = format(stats.rttMs, ' ms');
    $('export').disabled = false;
    renderDiagnostics(stats);
  },
  onEnd(record) {
    // Serialize writes; only metadata projected by server is persisted.
    historyPromise = historyPromise.catch(() => {}).then(async () => {
      const response = await post('/api/history', record, true);
      if (!response.ok) throw new Error('Não foi possível registrar o histórico.');
      await renderHistory();
    }).catch(error => { $('message').textContent += ` ${error.message}`; });
  }
});

const diagnosticFields = s => [
  ['Fonte WebRTC (não sensor nativo)', format(s.capturedFps, ' FPS')], ['Codificação', format(s.encodedFps, ' FPS')], ['Decodificação', format(s.decodedFps, ' FPS')], ['Apresentação (compositor)', format(s.presentedFps, ' FPS')],
  ['Encode / quadro (intervalo)', format(s.encodeMs, ' ms')], ['Decode / quadro (intervalo)', format(s.decodeMs, ' ms')], ['Jitter RTP', format(s.jitterMs, ' ms')], ['Pacotes perdidos (acumulado)', s.packetsLost ?? 'não exposto'],
  ['Quadros descartados na recepção', s.droppedFrames ?? 'não exposto'], ['Codec efetivo', s.codec ?? 'aguardando'], ['Encoder', s.encoder], ['Decoder', s.decoder],
  ['Encoder energeticamente eficiente¹', s.powerEfficientEncoder == null ? 'não exposto' : s.powerEfficientEncoder ? 'sim' : 'não'], ['Decoder energeticamente eficiente¹', s.powerEfficientDecoder == null ? 'não exposto' : s.powerEfficientDecoder ? 'sim' : 'não'], ['Caminho', s.route === 'local-direct' ? 'direto local · mesmo processo' : s.route], ['Restrição do encoder', s.qualityLimitation ?? 'não exposto'],
  ['Latência ação → retorno visual', 'não medida'], ['Parâmetros H.264', s.codecParameters ?? 'aguardando'], ['Escala de apresentação', `${window.devicePixelRatio.toFixed(2)} pixels físicos/CSS`], ['Uso de memória total', 'coleta externa necessária']
];
function renderDiagnostics(s) {
  const nodes = diagnosticFields(s).map(([label, value]) => { const div = document.createElement('div'); const dt = document.createElement('dt'); const dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; div.append(dt, dd); return div; });
  $('diagnostic-grid').replaceChildren(...nodes);
}
async function renderHistory() {
  const response = await fetch('/api/history');
  if (!response.ok) throw new Error('Histórico local indisponível.');
  const list = await response.json();
  const results = { stopped: 'Encerrado por você', failed: 'Não concluído', 'source-ended': 'Fonte encerrada', 'connection-lost': 'Conexão interrompida', closed: 'Janela encerrada' };
  const rows = list.slice(-5).reverse().map(item => {
    const li = document.createElement('li'); const label = document.createElement('span'); const result = document.createElement('span');
    const duration = Math.max(0, Math.round((Date.parse(item.end) - Date.parse(item.start)) / 1000));
    label.textContent = `${new Date(item.start).toLocaleString('pt-BR')} · ${item.source === 'pattern' ? 'Cartela SDR' : 'Monitor'} · ${duration}s`;
    result.textContent = results[item.result] ?? 'Encerrado'; li.append(label, result); return li;
  });
  if (!rows.length) { const li = document.createElement('li'); li.textContent = 'Nenhum ensaio registrado.'; rows.push(li); }
  $('history').replaceChildren(...rows);
}
$('source').addEventListener('change', sourceHelp);
$('consent').addEventListener('change', updateStart);
$('start').addEventListener('click', () => {
  if ($('start').disabled) return;
  session.lastError = null; currentStats = null;
  for (const id of ['resolution', 'fps', 'bitrate', 'rtt']) $(id).textContent = '—';
  $('export').disabled = true;
  const kind = $('source').value;
  const source = kind === 'pattern' ? () => createPattern() : () => navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'monitor', width: { ideal: 7680 }, height: { ideal: 4320 }, frameRate: { ideal: 60, max: 60 } }, audio: false, selfBrowserSurface: 'exclude', surfaceSwitching: 'exclude' }).then(stream => {
    if (stream.getVideoTracks()[0]?.getSettings().displaySurface !== 'monitor') { stream.getTracks().forEach(t => t.stop()); throw new Error('Selecione uma tela inteira. Captura de janela/aba não faz parte deste ensaio.'); }
    return { stream, dispose() { stream.getTracks().forEach(t => t.stop()); } };
  });
  void session.start({ source, kind, profile: $('profile').value });
});
$('stop').addEventListener('click', () => { session.stop(); if (document.fullscreenElement) void document.exitFullscreen(); });
$('profile').addEventListener('change', async () => {
  if (!active()) return;
  $('profile').disabled = true;
  try { await session.setProfile($('profile').value); }
  catch { $('profile').value = session.profile; $('message').textContent = 'Este runtime não aplicou o perfil. A configuração anterior foi mantida.'; }
  finally { $('profile').disabled = false; }
});
function scale(one) {
  $('viewport').classList.toggle('one', one);
  $('one').classList.toggle('selected', one); $('one').setAttribute('aria-pressed', String(one));
  $('fit').classList.toggle('selected', !one); $('fit').setAttribute('aria-pressed', String(!one));
  // One transmitted pixel per physical output pixel, independent of Windows DPI.
  $('video').style.width = one ? `${$('video').videoWidth / window.devicePixelRatio}px` : '';
  $('video').style.height = one ? `${$('video').videoHeight / window.devicePixelRatio}px` : '';
}
$('fit').addEventListener('click', () => scale(false)); $('one').addEventListener('click', () => scale(true));
$('video').addEventListener('resize', () => scale($('viewport').classList.contains('one')));
window.addEventListener('resize', () => scale($('viewport').classList.contains('one')));
$('fullscreen').addEventListener('click', () => { $('viewer').requestFullscreen().catch(() => { $('message').textContent = 'Tela cheia indisponível nesta janela.'; }); });
// Exit from fullscreen is always available through Escape; stopping capture via browser stays effective.
$('diagnostic-toggle').addEventListener('click', () => { const open = $('diagnostic-body').hidden; $('diagnostic-body').hidden = !open; $('diagnostic-toggle').setAttribute('aria-expanded', String(open)); $('diagnostic-toggle').textContent = open ? 'Ocultar diagnóstico −' : 'Mostrar diagnóstico +'; });
$('export').addEventListener('click', () => {
  const report = { ...session.report(), environment, userAgent: navigator.userAgent, displayPixelRatio: window.devicePixelRatio, collectedAt: new Date().toISOString() };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `voadesk-metricas-${new Date().toISOString().replaceAll(':', '-')}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
const heartbeat = setInterval(() => { post('/api/heartbeat', {}).then(response => { if (!response.ok) throw new Error('Host indisponível.'); }).catch(() => { clearInterval(heartbeat); if (active()) session.stop('connection-lost'); $('message').textContent = 'Serviço local encerrado. Feche e reabra o VoaDesk.'; $('start').disabled = true; }); }, 5000);
window.addEventListener('pagehide', () => { session.stop('closed'); clearInterval(heartbeat); });
async function init() {
  try {
    const response = await fetch('/api/environment');
    if (!response.ok) throw new Error('Ambiente local indisponível. Reabra o VoaDesk.');
    environment = await response.json();
    $('environment').textContent = `${environment.platform} ${environment.release} ${environment.arch} · ${environment.cpu} · ${environment.memoryGiB} GiB · cor: ${environment.color.status}. ${environment.color.reason ?? ''} ¹ Indicação do runtime, não prova independente de GPU.`;
    sourceHelp(); await renderHistory();
  } catch (error) { $('message').textContent = error.message; }
}
void init();

// Code recognition is separate from video and never starts capture or input.
const verifyButton = $('verify-code');
const accessMessage = $('access-message');
fetch('/api/pairing/config').then(r => r.json()).then(config => {
  verifyButton.disabled = !config.available;
  accessMessage.textContent = config.available ? (config.remote ? 'Serviço online. Informe o código do VoaDesk Cliente.' : 'Serviço local. Abra o VoaDesk Cliente neste computador para testar.') : 'Serviço de códigos não configurado nesta execução.';
}).catch(() => { accessMessage.textContent = 'Não foi possível consultar o serviço de códigos.'; });
$('access-code').addEventListener('input', event => { const value = event.target.value.toUpperCase().replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, '').slice(0,12); event.target.value = value.match(/.{1,4}/g)?.join(' ') ?? ''; });
$('access-form').addEventListener('submit', async event => {
  event.preventDefault(); if (verifyButton.disabled) return;
  const code = $('access-code').value;
  if (code.replaceAll(' ', '').length !== 12) { accessMessage.textContent = 'Informe os 12 caracteres exibidos no cliente.'; return; }
  verifyButton.disabled = true; accessMessage.textContent = 'Verificando código…';
  try { const response = await post('/api/pairing/verify', { code }); const result = await response.json(); accessMessage.textContent = result.message; accessMessage.classList.toggle('error', !response.ok); if (response.ok) $('access-code').value = ''; }
  catch { accessMessage.textContent = 'Serviço indisponível. Aguarde e tente novamente.'; }
  finally { verifyButton.disabled = false; }
});
