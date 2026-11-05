import { createHash, randomBytes } from 'node:crypto';
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const digest = value => createHash('sha256').update(value).digest('hex');
export const normalizeCode = value => typeof value === 'string' ? value.toUpperCase().replace(/[ -]/g, '') : '';
export class PairingRegistry {
  constructor({ now = Date.now, ttlMs = 300000, capacity = 1000 } = {}) { this.now = now; this.ttlMs = ttlMs; this.capacity = capacity; this.clients = new Map(); this.codes = new Map(); this.limits = new Map(); }
  sweep() {
    for (const [key, item] of this.clients) if (item.expiresAt <= this.now()) { this.clients.delete(key); this.codes.delete(item.codeHash); }
    for (const [key, item] of this.limits) if (item.until <= this.now()) this.limits.delete(key);
  }
  allow(key, count, windowMs) {
    this.sweep(); let item = this.limits.get(key);
    if (!item) { if (this.limits.size >= 10000) return false; item = { count: 0, until: this.now() + windowMs }; this.limits.set(key, item); }
    return ++item.count <= count;
  }
  register() {
    this.sweep();
    if (this.clients.size >= this.capacity) throw new Error('CAPACITY');
    let code;
    // Cryptographic symbols; rejection sampling also handles future alphabet changes.
    do { code = ''; while (code.length < 12) { for (const byte of randomBytes(24)) { if (byte < alphabet.length * Math.floor(256 / alphabet.length)) code += alphabet[byte % alphabet.length]; if (code.length === 12) break; } } } while (this.codes.has(digest(code)));
    const token = randomBytes(32).toString('base64url'); const tokenHash = digest(token);
    const item = { id: randomBytes(16).toString('hex'), codeHash: digest(code), expiresAt: this.now() + this.ttlMs, state: 'waiting' };
    this.clients.set(tokenHash, item); this.codes.set(item.codeHash, tokenHash);
    return { code: code.match(/.{4}/g).join(' '), token, expiresAt: new Date(item.expiresAt).toISOString(), ttlSeconds: Math.floor(this.ttlMs / 1000) };
  }
  status(token) {
    this.sweep(); const item = typeof token === 'string' && token.length <= 128 ? this.clients.get(digest(token)) : null;
    return item ? { state: item.state, expiresAt: new Date(item.expiresAt).toISOString(), remainingSeconds: Math.max(0, Math.ceil((item.expiresAt - this.now()) / 1000)) } : { state: 'expired', remainingSeconds: 0 };
  }
  verify(code) {
    this.sweep(); const normalized = normalizeCode(code);
    if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/.test(normalized)) return false;
    const hash = digest(normalized), tokenHash = this.codes.get(hash), item = this.clients.get(tokenHash);
    if (!item || item.state !== 'waiting') return false;
    // Synchronous atomic consumption within a single server instance.
    item.state = 'verified'; this.codes.delete(hash);
    return true;
  }
  revoke(token) {
    if (typeof token !== 'string' || token.length > 128) return;
    const key = digest(token), item = this.clients.get(key);
    if (item) this.codes.delete(item.codeHash); this.clients.delete(key);
  }
}
