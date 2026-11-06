import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { PairingRegistry } from './registry.mjs';
import { SessionHub } from './sessions.mjs';
import { sessionRouter } from './session-http.mjs';
import { fileURLToPath } from 'node:url';
import { createReadStream, existsSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { readJson, RequestError } from '../http-guards.mjs';
import { dirname, join } from 'node:path';
import { DeviceRegistry } from './devices.mjs';
import { DerivedDeviceRegistry } from './derived-devices.mjs';
import { probePairingService } from './probe.mjs';
const equal = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export async function createPairingService({ port = 0, host = '127.0.0.1', operatorToken = randomBytes(32).toString('base64url'), registry = new PairingRegistry(), trustProxy = false, devices = null, operatorName = 'Operador local', updateDirectory = null, publicOrigin = null } = {}) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(operatorToken)) throw new Error('VOADESK_OPERATOR_TOKEN deve ter de 32 a 128 caracteres seguros.');
  if(publicOrigin){const u=new URL(publicOrigin);if(u.protocol!=='https:'||u.origin!==publicOrigin||u.username||u.password)throw new Error('PUBLIC_ORIGIN_INVALID');}
  const sessionsEnabled=Boolean(devices)&&(host==='127.0.0.1'||Boolean(publicOrigin));
  const reply = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' }); res.end(JSON.stringify(value)); };
  const sessions = new SessionHub(devices, { operatorName });
  const routeSession = sessionRouter(sessions, { root: resolve(dirname(fileURLToPath(import.meta.url)), '../..'), isOperator: token => equal(token, operatorToken), enabled: sessionsEnabled, allow: key => registry.allow(key, 1200, 10000) });
  const server = http.createServer(async (req, res) => {
    try {
      const path = req.url.split('?')[0];
      if(host === '127.0.0.1' && req.headers.host !== sessions.host && req.headers.host !== '127.0.0.1:'+server.address().port) return reply(res,403,{error:'HOST_DENIED'});
      if (path === '/health' && req.method === 'GET') return reply(res, 200, { service: 'voadesk-pairing', version: '0.5.0', scope: sessionsEnabled?'authorized-lan-session-preview':'pairing-only', ready: true, sessionsEnabled, deviceStorage:devices?.storage??(devices?'file':'none'), serverHistoryPersistent:Boolean(devices?.file), release:process.env.RENDER_GIT_COMMIT??null });
      const nativeBearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
      if (path === '/v3/operator/request') {
        if (!equal(nativeBearer,operatorToken)) return reply(res,403,{message:'Operador não autorizado.'});
        if (!registry.allow('session-request:'+req.socket.remoteAddress,8,60000)) return reply(res,429,{message:'Muitas solicitações. Aguarde um minuto.'});
      }
      if (await routeSession(req,res,path,nativeBearer)) return;
      if (host === '127.0.0.1' && ['/updates/manifest.json','/updates/client.exe'].includes(path) && req.method === 'GET') {
        const file=join(updateDirectory ?? join(resolve(dirname(fileURLToPath(import.meta.url)), '../..'), '.runtime/updates'), path.endsWith('.json')?'manifest.json':'client.exe');
        if(!existsSync(file)) return reply(res,404,{error:'NO_UPDATE'});
        res.writeHead(200,{'Content-Type':path.endsWith('.json')?'application/json':'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});await pipeline(createReadStream(file),res);return;
      }
      // Native clients and the local desktop proxy only; no browser/CORS access.
      if (req.headers.origin) return reply(res, 403, { error: 'ORIGIN_DENIED' });
      const ip = trustProxy ? String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress).split(',').at(-1).trim() : req.socket.remoteAddress;
      const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
      if (path.startsWith('/v2/')) {
        if (!devices) return reply(res, 503, { error: 'PERSISTENCE_REQUIRED', message: 'Registro de clientes fixos não configurado neste servidor.' });
        if (path === '/v2/clients/status' && req.method === 'GET') {
          if (!bearer) return reply(res, 401, { error: 'UNAUTHORIZED' });
          if (!registry.allow('poll2:' + ip, 240, 60000)) return reply(res, 429, { error: 'RATE_LIMIT' });
          return reply(res, 200, devices.status(bearer));
        }
        if (req.method !== 'POST' || !['/v2/clients', '/v2/clients/revoke', '/v2/codes/verify'].includes(path)) return reply(res, 404, { error: 'NOT_FOUND' });
        if (!registry.allow('request2:' + ip, 180, 60000)) return reply(res, 429, { error: 'RATE_LIMIT' });
        if(path === '/v2/codes/verify' && !equal(bearer,operatorToken)) return reply(res,401,{error:'UNAUTHORIZED'});
        if(path === '/v2/clients/revoke' && !bearer) return reply(res,401,{error:'UNAUTHORIZED'});
        const payload = await readJson(req,res,2048);
        if (path === '/v2/clients') {
          if (!registry.allow('register2:' + ip, 12, 60000)) return reply(res, 429, { error: 'RATE_LIMIT' });
          const registered=devices.register(payload);sessions.sweep();return reply(res, 201, registered);
        }
        if (path === '/v2/clients/revoke') { if (!bearer) return reply(res, 401, { error: 'UNAUTHORIZED' }); devices.revoke(bearer); sessions.sweep();return reply(res, 200, { revoked: true }); }
        if (!equal(bearer, operatorToken)) return reply(res, 401, { error: 'UNAUTHORIZED' });
        if (!registry.allow('verify2:' + ip, 8, 60000)) return reply(res, 429, { error: 'RATE_LIMIT', message: 'Muitas tentativas. Aguarde um minuto.' });
        const state = devices.verify(payload.code);
        if (state === 'identified') return reply(res, 200, { verified: true, scope: 'pairing-only', message: sessionsEnabled?'Cliente online identificado. Solicite atendimento e aguarde a autorização no cliente.':'Cliente online identificado. Sessões indisponíveis neste servidor.' });
        return reply(res, 404, { error: state === 'offline' ? 'CLIENT_OFFLINE' : 'INVALID_CODE', message: state === 'offline' ? 'Cliente offline. Peça para abrir o VoaDesk Cliente.' : 'Código não encontrado. Confira o código exibido no cliente.' });
      }
      if (path === '/v1/clients/status' && req.method === 'GET') {
        if (!bearer || !registry.allow(`poll:${ip}`, 240, 60000)) return reply(res, 429, { error: 'RATE_LIMIT' });
        return reply(res, 200, registry.status(bearer));
      }
      if (req.method !== 'POST' || !['/v1/clients', '/v1/clients/revoke', '/v1/codes/verify'].includes(path)) return reply(res, 404, { error: 'NOT_FOUND' });
      if (!registry.allow(`request:${ip}`, 180, 60000)) return reply(res, 429, { error: 'RATE_LIMIT' });
      if(path === '/v1/codes/verify' && !equal(bearer,operatorToken)) return reply(res,401,{error:'UNAUTHORIZED'});
      if(path === '/v1/clients/revoke' && !bearer) return reply(res,401,{error:'UNAUTHORIZED'});
      const payload = await readJson(req,res,2048);
      if (path === '/v1/clients') {
        if (!registry.allow(`register:${ip}`, 12, 60000)) return reply(res, 429, { error: 'RATE_LIMIT' });
        return reply(res, 201, registry.register());
      }
      if (path === '/v1/clients/revoke') { if (!bearer) return reply(res, 401, { error: 'UNAUTHORIZED' }); registry.revoke(bearer); return reply(res, 200, { revoked: true }); }
      if (!equal(bearer, operatorToken)) return reply(res, 401, { error: 'UNAUTHORIZED' });
      if (!registry.allow(`verify:${ip}`, 8, 60000)) return reply(res, 429, { error: 'RATE_LIMIT' });
      return registry.verify(payload.code) ? reply(res, 200, { verified: true, scope: 'pairing-only', message: 'Cliente identificado. O vídeo remoto ainda não está disponível nesta prévia.' }) : reply(res, 404, { error: 'INVALID_OR_EXPIRED', message: 'Código inválido, expirado ou já utilizado. Solicite um novo código ao cliente.' });
    } catch (error) { if (!res.headersSent) reply(res, error instanceof RequestError ? error.status : error.message === 'CAPACITY' ? 503 : error.message === 'IDENTITY_DENIED' ? 401 : 400, { error: error instanceof RequestError ? error.message : error.message === 'CAPACITY' ? 'UNAVAILABLE' : 'INVALID_REQUEST' }); else res.end(); }
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000; server.maxConnections = 512; server.maxRequestsPerSocket = 1000;
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, host, ok); });
  sessions.origin=publicOrigin??'http://127.0.0.1:'+server.address().port;
  sessions.host = new URL(sessions.origin).host;
  const cleanup = setInterval(() => { registry.sweep(); devices?.sweep(); sessions.sweep(); }, 1000); cleanup.unref();
  server.on('close', () => clearInterval(cleanup));
  return { server, operatorToken, sessions, origin: `http://127.0.0.1:${server.address().port}`, close: () => { clearInterval(cleanup); server.closeAllConnections(); return new Promise(r => server.close(r)); } };
}
export async function runPairingServiceFromEnvironment() {
  const operatorToken = process.env.VOADESK_OPERATOR_TOKEN;
  if (!operatorToken) throw new Error('Configure VOADESK_OPERATOR_TOKEN no servidor. Nunca incorpore essa credencial ao cliente.');
  const publicOrigin=process.env.VOADESK_PUBLIC_ORIGIN??process.env.RENDER_EXTERNAL_URL??null;
  const devices=process.env.VOADESK_DEVICE_STORE?new DeviceRegistry({file:resolve(process.env.VOADESK_DEVICE_STORE)}):publicOrigin?new DerivedDeviceRegistry({key:operatorToken}):null;
  const service = await createPairingService({ port: Number(process.env.PORT ?? 47832), host: process.env.VOADESK_BIND ?? '0.0.0.0', operatorToken, trustProxy: process.env.VOADESK_TRUST_PROXY === 'true', devices, publicOrigin, operatorName:publicOrigin?'Operador autorizado do VoaDesk':'Operador local' });
  if (process.env.VOADESK_STARTUP_SELF_TEST === 'true') {
    try { console.log('VoaDesk HTTP startup self-test: ' + JSON.stringify(await probePairingService(service.origin, operatorToken))); }
    catch { await service.close(); throw new Error('Autoteste HTTP do serviço falhou.'); }
  }
  console.log('VoaDesk: serviço pronto; '+(publicOrigin?'prévia de sessões LAN com autorização explícita.':'modo de pareamento.'));
  const shutdown = async () => { await service.close(); process.exit(0); }; process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
  return service;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await runPairingServiceFromEnvironment();
