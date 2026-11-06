import '/session.mjs';
const $ = id => document.getElementById(id);
const normalize = value => value.toUpperCase().replace(/[ -]/g, '');
const valid = value => /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{16}$/.test(normalize(value));
const formatCode = value => normalize(value).match(/.{1,4}/g)?.join(' ') ?? '';
const post = (url, value) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Farol-Request': '1' }, body: JSON.stringify(value) });
let clients = [], available = false;
function message(id, text, type = '') { $(id).textContent = text; $(id).className = 'message ' + type; }
for (const id of ['access-code', 'client-code']) {
  $(id).addEventListener('input', () => { $(id).setCustomValidity(''); if ($(id).value.length <= 19) $(id).value = formatCode($(id).value); });
}
function renderClients() {
  $('saved-status').textContent = clients.length ? '' : 'Seus clientes frequentes ficam aqui. Clique em + para adicionar o primeiro.';
  $('saved-status').hidden = clients.length > 0;
  $('saved-clients').replaceChildren(...clients.map(item => {
    const li = document.createElement('li'), button = document.createElement('button'), avatar = document.createElement('span'), text = document.createElement('span'), name = document.createElement('strong'), code = document.createElement('small');
    button.type = 'button'; button.className = 'client-item'; button.setAttribute('aria-pressed', 'false');
    avatar.className = 'client-avatar'; avatar.textContent = item.name.slice(0, 1).toLocaleUpperCase('pt-BR');
    text.className = 'client-text'; name.textContent = item.name; code.textContent = formatCode(item.code); text.append(name, code); button.append(avatar, text); li.append(button);
    button.addEventListener('click', () => {
      document.querySelectorAll('.client-item').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      $('access-code').value = formatCode(item.code); $('access-code').setCustomValidity(''); $('access-code').focus();
      message('access-message', 'Cliente selecionado: ' + item.name + '. Clique em Verificar código.');
    });
    return li;
  }));
}
async function loadClients() {
  try { const response = await fetch('/api/saved-clients'); if (!response.ok) throw new Error(); clients = await response.json(); renderClients(); }
  catch { $('saved-status').hidden = false; $('saved-status').textContent = 'Não foi possível carregar seus clientes. Feche e reabra o aplicativo.'; }
}
function closeDialog() { if (!$('save-client').disabled) $('client-dialog').close(); }
$('add-client').addEventListener('click', () => { $('client-form').reset(); message('client-message', ''); $('client-dialog').showModal(); $('client-name').focus(); });
$('close-dialog').addEventListener('click', closeDialog); $('cancel-client').addEventListener('click', closeDialog);
$('client-dialog').addEventListener('cancel', e => { if ($('save-client').disabled) e.preventDefault(); });
$('client-dialog').addEventListener('close', () => $('add-client').focus());
$('client-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!valid($('client-code').value)) { message('client-message', 'Informe os 16 caracteres do código do cliente.', 'error'); $('client-code').focus(); return; }
  const name = $('client-name').value.trim(); if (!name) { message('client-message', 'Informe o nome do cliente.', 'error'); $('client-name').focus(); return; }
  $('save-client').disabled = true;
  try {
    const response = await post('/api/saved-clients', { name, code: normalize($('client-code').value) }), result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Não foi possível salvar. Tente novamente.');
    clients.push(result); renderClients(); $('client-dialog').close();
  } catch (error) { message('client-message', error.message || 'Serviço local indisponível.', 'error'); }
  finally { $('save-client').disabled = false; }
});
$('access-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!available || $('verify-code').disabled) return;
  if (!valid($('access-code').value)) { message('access-message', 'Informe os 16 caracteres do código exibido no cliente.', 'error'); $('access-code').focus(); return; }
  $('verify-code').disabled = true; message('access-message', 'Verificando cliente…');
  try {
    const response = await post('/api/pairing/verify', { code: normalize($('access-code').value) }), result = await response.json();
    message('access-message', result.message || 'Não foi possível verificar o cliente.', response.ok && result.verified ? 'success' : 'error');
  } catch { message('access-message', 'Serviço indisponível. Feche e reabra o aplicativo.', 'error'); }
  finally { $('verify-code').disabled = !available; }
});
const heartbeat = setInterval(async () => {
  try { const response = await post('/api/heartbeat', {}); if (!response.ok) throw new Error(); }
  catch { clearInterval(heartbeat); available = false; $('verify-code').disabled = true; $('connection-state').textContent = 'Serviço local encerrado'; message('access-message', 'Feche e reabra o VoaDesk para continuar.', 'error'); }
}, 5000);
window.addEventListener('pagehide', () => clearInterval(heartbeat));
async function init() {
  $('access-code').focus();
  await loadClients();
  try {
    const response = await fetch('/api/pairing/config'); if (!response.ok) throw new Error();
    const config = await response.json(); available = config.available; $('verify-code').disabled = !available;
    $('connection-state').textContent = available ? (config.remote ? 'Serviço online conectado' : 'Serviço local conectado') : 'Serviço não configurado';
    message('access-message', available ? 'Pronto para identificar o cliente.' : 'Serviço de códigos não configurado.');
  } catch { message('access-message', 'Serviço local indisponível. Reabra o VoaDesk.', 'error'); }
}
void init();
