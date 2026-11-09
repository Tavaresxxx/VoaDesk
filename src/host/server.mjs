import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { readJson, RequestError } from '../http-guards.mjs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { DeviceRegistry } from '../pairing/devices.mjs';
import { SavedClients } from './saved-clients.mjs';
import { createPairingService } from '../pairing/service.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const assets = new Map([
  ['/', ['src/ui/index.html', 'text/html; charset=utf-8']],
  ['/app.css', ['src/ui/app.css', 'text/css']],
  ['/theme.css', ['src/ui/theme.css', 'text/css']],
  ['/app.mjs', ['src/ui/app.mjs', 'text/javascript']],
  ['/client-search.mjs', ['src/ui/client-search.mjs', 'text/javascript']],
  ['/logo.png', ['src/assets/logo.png', 'image/png']],
  ['/symbol.png', ['src/assets/symbol.png', 'image/png']],
  ['/voadesk.ico', ['src/assets/voadesk.ico', 'image/x-icon']],
  ['/session.mjs', ['src/ui/session.mjs', 'text/javascript']],
  ['/local-test.mjs', ['src/ui/local-test.mjs', 'text/javascript']],
  ['/test-desktop.mjs', ['src/ui/test-desktop.mjs', 'text/javascript']],
  ['/session-files.mjs', ['src/ui/session-files.mjs', 'text/javascript']],
  ['/video/files.mjs', ['src/video/files.mjs', 'text/javascript']],
  ['/video/quality.mjs', ['src/video/quality.mjs', 'text/javascript']],
  ['/video/peer.mjs', ['src/video/peer.mjs', 'text/javascript']],
  ['/video/pipeline.mjs', ['src/video/pipeline.mjs', 'text/javascript']],
  ['/video/profiles.mjs', ['src/video/profiles.mjs', 'text/javascript']],
  ['/video/stats.mjs', ['src/video/stats.mjs', 'text/javascript']],
  ['/video/pattern.mjs', ['src/video/pattern.mjs', 'text/javascript']]
]);
const csp = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
const equal = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function probeEnvironment() {
  let color = { status: 'unknown', reason: 'Consulta nativa indisponível. Execute tools/build.ps1.', displays: [] };
  const exe = join(root, 'dist/FarolProbe.exe');
  if (process.platform === 'win32' && existsSync(exe)) {
    try {
      const { stdout } = await promisify(execFile)(exe, [], { windowsHide: true, timeout: 5000 });
      color = JSON.parse(stdout);
    } catch { color.reason = 'Consulta nativa falhou; captura SDR não confirmada.'; }
  }
  return { platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model ?? 'unknown', logicalCpus: os.cpus().length, memoryGiB: Math.round(os.totalmem() / 2 ** 30), node: process.versions.node, color };
}

export async function createHost({ port = 0, dataDir = join(root, '.runtime'), idleTimeout = 90000, environment, pairing = null, launchClient = null } = {}) {
  mkdirSync(dataDir, { recursive: true });
  const saved = new SavedClients(join(dataDir, 'saved-clients.json'));
  const historyFile = join(dataDir, 'history.json');
  let history = [];
  try { const loaded = JSON.parse(readFileSync(historyFile, 'utf8')); if (Array.isArray(loaded)) history = loaded.slice(-100); } catch { /* First launch or corrupt local history; do not interpret as code. */ }
  const token = randomBytes(32).toString('base64url');
  const cookie = randomBytes(32).toString('base64url');
  const bootstrapExpires = Date.now() + 120000;
  let sessionToken = null, pendingSessionRequest=null, shuttingDown=false, closing=null;
  let bootstrapped = false;
  let lastHeartbeat = Date.now();
  const env = environment ?? await probeEnvironment();
  const version=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
  const clientFile=join(root,'dist/VoaDeskCliente.exe');
  let origin;
  function response(res, status, body = '', type = 'text/plain; charset=utf-8', extra = {}) {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Resource-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', ...extra });
    res.end(body);
  }
  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers.host !== new URL(origin).host) return response(res, 403, 'Host inválido.');
      const url = new URL(req.url, origin);
      if (url.pathname === '/bootstrap' && req.method === 'GET') {
        if (bootstrapped || Date.now() > bootstrapExpires || !equal(url.searchParams.get('token'), token)) return response(res, 403, 'Abertura expirada. Reabra o VoaDesk.');
        bootstrapped = true;
        lastHeartbeat = Date.now();
        return response(res, 303, '', undefined, { Location: '/', 'Set-Cookie': `farol=${cookie}; HttpOnly; SameSite=Strict; Path=/` });
      }
      const cookies = String(req.headers.cookie ?? '').split(';').map(x => x.trim());
      if (!cookies.some(x => equal(x, `farol=${cookie}`))) return response(res, 401, 'Abra pelo aplicativo VoaDesk.');
      if (req.method === 'POST' && (req.headers.origin !== origin || req.headers['x-farol-request'] !== '1')) return response(res, 403, 'Origem inválida.');
      if (url.pathname === '/downloads/VoaDeskCliente.exe' && req.method === 'GET') {
        const file=join(root,'dist/VoaDeskCliente.exe');
        if(!existsSync(file))return response(res,404,'Compile o cliente Windows primeiro.');
        res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="VoaDeskCliente.exe"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        await pipeline(createReadStream(file),res);return;
      }
      if (url.pathname === '/api/heartbeat' && req.method === 'POST') {
        lastHeartbeat = Date.now();
        return response(res, 204);
      }
      if (url.pathname === '/api/environment' && req.method === 'GET') return response(res, 200, JSON.stringify(env), 'application/json');
      if(url.pathname==='/api/receiver/open'&&req.method==='POST'){
        await readJson(req,res,1024);
        if(!pairing||(!launchClient&&!existsSync(clientFile)))return response(res,503,JSON.stringify({message:'Baixe o aplicativo do cliente e tente novamente.'}),'application/json');
        try{
          if(launchClient)await launchClient(pairing.url);
          else await new Promise((ok,fail)=>{const child=spawn(clientFile,['--server',pairing.url],{cwd:root,stdio:'ignore',windowsHide:false,detached:true});child.once('error',fail);child.once('spawn',()=>{child.unref();ok();});});
          return response(res,200,JSON.stringify({opened:true}),'application/json');
        }catch{return response(res,503,JSON.stringify({message:'Não foi possível abrir o cliente. Baixe o aplicativo e tente novamente.'}),'application/json');}
      }
      if (url.pathname.startsWith('/api/session/')) {
        if(shuttingDown)return response(res,503,'{}','application/json');
        if (!pairing) return response(res, 503, '{}', 'application/json');
        const action=url.pathname.slice('/api/session/'.length);
        if(!['request','state','signal','end'].includes(action)||req.method!=='POST')return response(res,404);
        const payload=await readJson(req,res,action==='signal'?110000:2048);
        const auth=action==='request'?pairing.token:sessionToken;
        if(!auth)return response(res,403,'{}','application/json');
        const operation=(async()=>{const upstream=await fetch(new URL('/v3/operator/'+action,pairing.url),{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(5000)});
        const result=await upstream.json();
        if(action==='request'&&upstream.ok){sessionToken=result.token;delete result.token;}
        return response(res,upstream.status,JSON.stringify(result),'application/json');
        })().catch(()=>{if(!res.headersSent)response(res,503,JSON.stringify({message:'O servidor de atendimento está indisponível. Tente novamente.'}),'application/json');else res.end();});if(action==='request')pendingSessionRequest=operation;try{await operation;}finally{if(pendingSessionRequest===operation)pendingSessionRequest=null;}return;
      }
      if (url.pathname === '/api/pairing/config' && req.method === 'GET') return response(res, 200, JSON.stringify({ available: Boolean(pairing), scope: 'pairing-only', remote: pairing?.url?.startsWith('https:') ?? false,version,receiverAvailable:Boolean(pairing)&&(Boolean(launchClient)||existsSync(clientFile)) }), 'application/json');
      if (url.pathname === '/api/pairing/verify' && req.method === 'POST') {
        if (!pairing) return response(res, 503, JSON.stringify({ message: 'Serviço de códigos não configurado.' }), 'application/json');
        const payload = await readJson(req,res,1024);
        if (typeof payload.code !== 'string' || payload.code.length > 32) return response(res, 400, JSON.stringify({ message: 'Informe o código exibido no cliente.' }), 'application/json');
        const upstream = await fetch(new URL('/v2/codes/verify', pairing.url), { method: 'POST', headers: { Authorization: `Bearer ${pairing.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: payload.code }), signal: AbortSignal.timeout(15000) });
        const result = await upstream.json();
        return response(res, upstream.status, JSON.stringify({ verified: result.verified === true, message: result.message ?? (upstream.status === 429 ? 'Muitas tentativas. Aguarde um minuto.' : 'Serviço indisponível. Tente novamente.') }), 'application/json');
      }
      if (url.pathname === '/api/saved-clients' && req.method === 'GET') return response(res, 200, JSON.stringify(saved.items), 'application/json');
      if (url.pathname === '/api/saved-clients' && req.method === 'POST') {
        const payload = await readJson(req,res,2048);
        try { const item = saved.add(payload); return response(res, 201, JSON.stringify(item), 'application/json'); }
        catch (error) {
          const duplicate = error.message === 'DUPLICATE_CLIENT';
          return response(res, duplicate ? 409 : 400, JSON.stringify({ message: duplicate ? 'Este código já está nos seus clientes salvos.' : error.message === 'CLIENT_CAPACITY' ? 'Limite de clientes salvos atingido.' : 'Informe um nome com até 80 caracteres e o código de 16 caracteres.' }), 'application/json');
        }
      }
      if (url.pathname === '/api/history' && req.method === 'GET') return response(res, 200, JSON.stringify(history), 'application/json');
      if (url.pathname === '/api/history' && req.method === 'POST') {
        const item = await readJson(req,res,2048);
        if (!['screen', 'pattern'].includes(item.source) || !['stopped', 'failed', 'source-ended', 'connection-lost', 'closed'].includes(item.result) || !Number.isFinite(Date.parse(item.start)) || !Number.isFinite(Date.parse(item.end)) || Date.parse(item.end) < Date.parse(item.start)) return response(res, 400, 'Resumo inválido.');
        // Explicit projection: never persist arbitrary client payloads or media.
        history.push({ id: randomBytes(12).toString('hex'), source: item.source, result: item.result, start: new Date(item.start).toISOString(), end: new Date(item.end).toISOString() });
        history = history.slice(-100);
        writeFileSync(`${historyFile}.tmp`, JSON.stringify(history, null, 2));
        renameSync(`${historyFile}.tmp`, historyFile);
        return response(res, 201, '{}', 'application/json');
      }
      const asset = assets.get(url.pathname);
      if (asset && req.method === 'GET') return response(res, 200, readFileSync(join(root, asset[0])), asset[1]);
      return response(res, 404, 'Não encontrado.');
    } catch (error) { if (!res.headersSent) response(res, error instanceof RequestError ? error.status : 400, 'Solicitação inválida.'); else res.end(); }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.maxConnections = 24;
  server.maxRequestsPerSocket = 1000;
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ok); });
  origin = `http://127.0.0.1:${server.address().port}`;
  const timer = idleTimeout ? setInterval(() => { if (Date.now() - lastHeartbeat > idleTimeout) server.close(); }, 5000) : null;
  timer?.unref();
  server.on('close', () => clearInterval(timer));
  async function close(){if(closing)return closing;shuttingDown=true;closing=(async()=>{clearInterval(timer);await pendingSessionRequest?.catch(()=>{});if(sessionToken&&pairing)try{await fetch(new URL('/v3/operator/end',pairing.url),{method:'POST',headers:{Authorization:'Bearer '+sessionToken,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(5000)});}catch{/* Presence leases still expire; never restore consent. */}sessionToken=null;server.closeAllConnections();await new Promise(r=>server.close(r));})();return closing;}
  // nativeSession is private process IPC, never an HTTP response or a browser-visible URL.
  return { server, origin, bootstrapUrl: `${origin}/bootstrap?token=${token}`, nativeSession:{origin,cookie},close };
}

export async function runDesktopApp() {
  const native=process.argv.includes('--native-shell');
  if(process.argv.includes('--open')&&!native){const app=join(root,'dist/VoaDeskTecnico.exe');if(!existsSync(app))throw new Error('Compile ou extraia o aplicativo Windows completo do VoaDesk Técnico.');const child=spawn(app,process.argv.includes('--online')?['--online']:[],{cwd:root,stdio:'ignore',windowsHide:false,detached:true});child.unref();return null;}
  let embedded;
  let pairing;
  const remoteUrl = process.argv.includes('--online') ? process.env.VOADESK_PAIRING_URL : null;
  if(process.argv.includes('--online')&&!remoteUrl)throw new Error('Configure a credencial e o servidor do técnico antes de iniciar no modo online.');
  if (remoteUrl) {
    const url = new URL(remoteUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('VOADESK_PAIRING_URL deve ser um endereço HTTPS sem credenciais.');
    if (!process.env.VOADESK_OPERATOR_TOKEN) throw new Error('Configure a credencial do operador no computador do técnico.');
    pairing = { url: url.origin, token: process.env.VOADESK_OPERATOR_TOKEN };
  } else {
    const localPort=native&&process.env.VOADESK_TEST_DATA_DIR?Number(process.env.VOADESK_LOCAL_PAIRING_PORT??47832):47832;
    embedded = await createPairingService({ port: localPort, devices: new DeviceRegistry({ file: join(native&&process.env.VOADESK_TEST_DATA_DIR?process.env.VOADESK_TEST_DATA_DIR:join(root,'.runtime'), 'pairing-devices.json') }), operatorName: 'Operador local · ' + os.userInfo().username });
    pairing = { url: embedded.origin, token: embedded.operatorToken };
  }
  const host = await createHost({ pairing,...(native&&process.env.VOADESK_TEST_DATA_DIR?{dataDir:process.env.VOADESK_TEST_DATA_DIR}:{}),...(native?{idleTimeout:0}:{}) });
  host.server.on('close', () => { if (embedded) void embedded.close(); });
  if(native){
    // The owning Windows process alone reads stdout. No credential is printed to a console or put in arguments/URLs.
    if(!process.stdin.isTTY&&process.stdout.isTTY!==true){
      const shutdown=async()=>{await host.close();await embedded?.close();process.exit(0);};
      let command='';process.stdin.setEncoding('utf8');process.stdin.on('data',data=>{command+=data;if(command.length>1024||command.includes('\n')){if(command.trim()==='shutdown')void shutdown();else if(command.length>1024)void shutdown();command='';}});process.stdin.once('end',()=>void shutdown());
      process.stdout.write(JSON.stringify({type:'ready',...host.nativeSession,pairingOrigin:pairing.url})+'\n');
    }else{await host.close();throw new Error('O modo nativo requer o aplicativo Windows.');}
  } else {
    // Bootstrap credential is not printed. CLI requires --open; tests import createHost.
    console.log('VoaDesk local pronto. Use npm start para abrir a janela.');
  }
  return host;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await runDesktopApp();
