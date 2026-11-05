import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { PairingRegistry } from './registry.mjs';
const equal = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export async function createPairingService({ port = 0, host = '127.0.0.1', operatorToken = randomBytes(32).toString('base64url'), registry = new PairingRegistry(), trustProxy = false } = {}) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(operatorToken)) throw new Error('VOADESK_OPERATOR_TOKEN deve ter de 32 a 128 caracteres seguros.');
  const reply = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' }); res.end(JSON.stringify(value)); };
  const server = http.createServer(async (req, res) => {
    try {
      const path = req.url.split('?')[0];
      if (path === '/health' && req.method === 'GET') return reply(res, 200, { service: 'voadesk-pairing', version: '0.2.0', scope: 'pairing-only', ready: true });
      // Native clients and the local desktop proxy only; no browser/CORS access.
      if (req.headers.origin) return reply(res, 403, { error: 'ORIGIN_DENIED' });
      const ip = trustProxy ? String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress).split(',').at(-1).trim() : req.socket.remoteAddress;
      const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
      if (path === '/v1/clients/status' && req.method === 'GET') {
        if (!bearer || !registry.allow(`poll:${ip}`, 240, 60000)) return reply(res, 429, { error: 'RATE_LIMIT' });
        return reply(res, 200, registry.status(bearer));
      }
      if (req.method !== 'POST' || !['/v1/clients', '/v1/clients/revoke', '/v1/codes/verify'].includes(path)) return reply(res, 404, { error: 'NOT_FOUND' });
      if (!registry.allow(`request:${ip}`, 180, 60000)) return reply(res, 429, { error: 'RATE_LIMIT' });
      let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 2048) return reply(res, 413, { error: 'BODY_TOO_LARGE' }); }
      const payload = body ? JSON.parse(body) : {};
      if (path === '/v1/clients') {
        if (!registry.allow(`register:${ip}`, 12, 60000)) return reply(res, 429, { error: 'RATE_LIMIT' });
        return reply(res, 201, registry.register());
      }
      if (path === '/v1/clients/revoke') { if (!bearer) return reply(res, 401, { error: 'UNAUTHORIZED' }); registry.revoke(bearer); return reply(res, 200, { revoked: true }); }
      if (!equal(bearer, operatorToken)) return reply(res, 401, { error: 'UNAUTHORIZED' });
      if (!registry.allow(`verify:${ip}`, 8, 60000)) return reply(res, 429, { error: 'RATE_LIMIT' });
      return registry.verify(payload.code) ? reply(res, 200, { verified: true, scope: 'pairing-only', message: 'Cliente identificado. O vídeo remoto ainda não está disponível nesta prévia.' }) : reply(res, 404, { error: 'INVALID_OR_EXPIRED', message: 'Código inválido, expirado ou já utilizado. Solicite um novo código ao cliente.' });
    } catch (error) { if (!res.headersSent) reply(res, error.message === 'CAPACITY' ? 503 : 400, { error: error.message === 'CAPACITY' ? 'UNAVAILABLE' : 'INVALID_REQUEST' }); else res.end(); }
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000; server.maxConnections = 512;
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, host, ok); });
  const cleanup = setInterval(() => registry.sweep(), 30000); cleanup.unref();
  server.on('close', () => clearInterval(cleanup));
  return { server, operatorToken, origin: `http://127.0.0.1:${server.address().port}`, close: () => { clearInterval(cleanup); server.closeAllConnections(); return new Promise(r => server.close(r)); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const operatorToken = process.env.VOADESK_OPERATOR_TOKEN;
  if (!operatorToken) throw new Error('Configure VOADESK_OPERATOR_TOKEN no servidor. Nunca incorpore essa credencial ao cliente.');
  const service = await createPairingService({ port: Number(process.env.PORT ?? 47832), host: process.env.VOADESK_BIND ?? '0.0.0.0', operatorToken, trustProxy: process.env.VOADESK_TRUST_PROXY === 'true' });
  console.log('VoaDesk: serviço de códigos pronto; mídia e comandos remotos não habilitados.');
  const shutdown = async () => { await service.close(); process.exit(0); }; process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
}
