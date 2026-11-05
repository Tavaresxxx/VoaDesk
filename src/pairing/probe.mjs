// HTTP-only diagnostic; returned data never includes access codes or credentials.
export async function probePairingService(origin, operatorToken) {
  const tokens = [];
  const report = { result: 'passed', scope: 'server-http-loopback', externalHttpsValidated: false, statuses: {} };
  const request = async (path, method = 'GET', body, token) => fetch(new URL(path, origin), { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000) });
  const expect = (actual, expected) => { if (actual !== expected) throw new Error('Falha no autoteste HTTP do serviço de códigos.'); };
  try {
    const health = await request('/health'); expect(health.status, 200); report.statuses.health = health.status;
    const response = await request('/v1/clients', 'POST', {}); expect(response.status, 201); const client = await response.json(); tokens.push(client.token); report.statuses.registration = response.status;
    const unauthorized = await request('/v1/codes/verify', 'POST', { code: client.code }); expect(unauthorized.status, 401); report.statuses.unauthenticatedOperator = unauthorized.status;
    const verified = await request('/v1/codes/verify', 'POST', { code: client.code }, operatorToken); expect(verified.status, 200); report.statuses.verification = verified.status;
    const status = await request('/v1/clients/status', 'GET', undefined, client.token); expect((await status.json()).state, 'verified'); report.clientStateObserved = true;
    const replay = await request('/v1/codes/verify', 'POST', { code: client.code }, operatorToken); expect(replay.status, 404); report.statuses.replayRejected = replay.status;
    const other = await request('/v1/clients', 'POST', {}); expect(other.status, 201); const revocable = await other.json(); tokens.push(revocable.token);
    const revoked = await request('/v1/clients/revoke', 'POST', {}, revocable.token); expect(revoked.status, 200); report.statuses.revocation = revoked.status;
    const after = await request('/v1/codes/verify', 'POST', { code: revocable.code }, operatorToken); expect(after.status, 404); report.statuses.revokedCodeRejected = after.status;
    return report;
  } finally {
    for (const token of tokens) await request('/v1/clients/revoke', 'POST', {}, token).catch(() => {});
  }
}
