import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

function validIceUrl(url) {
  if (typeof url !== 'string' || url.length > 512) return false;
  const match=/^(stun|stuns|turn|turns):([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[a-f0-9:]+\])(?::([0-9]{1,5}))?(?:\?transport=(udp|tcp))?$/i.exec(url);
  if (!match || match[3] && (Number(match[3]) < 1 || Number(match[3]) > 65535)) return false;
  if (match[2].startsWith('[') && isIP(match[2].slice(1,-1)) !== 6) return false;
  return !match[4] || /^turns?$/i.test(match[1]);
}

// The shared TURN secret stays on the signaling server. Only expiring
// credentials are returned to the two authorized participants.
export function iceConfiguration(env = process.env, now = Date.now) {
  let urls;
  try { urls = JSON.parse(env.VOADESK_ICE_URLS || '[]'); } catch { throw new Error('ICE_CONFIG_INVALID'); }
  if (!Array.isArray(urls) || urls.length > 8 || urls.some(url => !validIceUrl(url))) throw new Error('ICE_CONFIG_INVALID');
  const stun = urls.filter(url => /^stuns?:/i.test(url)), turn = urls.filter(url => /^turns?:/i.test(url));
  if (turn.length && (!env.VOADESK_TURN_SECRET || env.VOADESK_TURN_SECRET.length < 32)) throw new Error('TURN_SECRET_REQUIRED');
  const policy = env.VOADESK_ICE_POLICY || 'all';
  if (!['all', 'relay'].includes(policy) || policy === 'relay' && !turn.length) throw new Error('ICE_CONFIG_INVALID');
  return sessionId => {
    const iceServers = stun.length ? [{ urls: stun }] : [];
    if (turn.length) {
      const username = `${Math.floor(now() / 1000) + 9 * 3600}:${sessionId}`;
      iceServers.push({ urls: turn, username, credential: createHmac('sha1', env.VOADESK_TURN_SECRET).update(username).digest('base64') });
    }
    return { iceServers, iceTransportPolicy: policy };
  };
}
