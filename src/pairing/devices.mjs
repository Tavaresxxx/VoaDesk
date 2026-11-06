import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { normalizeCode } from './registry.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const validDeviceCode = value => /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{16}$/.test(normalizeCode(value));
const randomCode = () => Array.from(randomBytes(16), byte => alphabet[byte & 31]).join('');
export class DeviceRegistry {
  constructor({ file, now = Date.now, leaseMs = 90000, capacity = 10000, codeFactory = randomCode, memoryOnly = false } = {}) {
    if (!file && !memoryOnly) throw new Error('DEVICE_STORE_REQUIRED');
    Object.assign(this, { file, now, leaseMs, capacity, codeFactory });
    this.devices = new Map(); this.codes = new Map(); this.presence = new Map(); this.active = new Map();
    if (file && existsSync(file)) {
      const stored = JSON.parse(readFileSync(file, 'utf8'));
      if (stored.version !== 1 || !Array.isArray(stored.devices) || stored.devices.length > capacity) throw new Error('INVALID_DEVICE_STORE');
      for (const d of stored.devices) {
        if (!/^[a-f0-9]{32}$/.test(d.id) || !/^[a-f0-9]{64}$/.test(d.secretHash) || !validDeviceCode(d.code) || d.code !== normalizeCode(d.code) || this.devices.has(d.id) || this.codes.has(d.code)) throw new Error('INVALID_DEVICE_STORE');
        const safe = { id: d.id, code: d.code, secretHash: d.secretHash };
        this.devices.set(d.id, safe); this.codes.set(d.code, d.id);
      }
    }
  }
  persist(next) {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = this.file + '.' + randomBytes(8).toString('hex') + '.tmp';
    writeFileSync(temp, JSON.stringify({ version: 1, devices: [...next.values()] }), { mode: 0o600, flag: 'wx' });
    renameSync(temp, this.file);
  }
  register(payload) {
    if (!payload || !/^[a-f0-9]{32}$/.test(payload.deviceId) || !/^[A-Za-z0-9_-]{43}$/.test(payload.secret)) throw new Error('INVALID_IDENTITY');
    this.sweep();
    const secretHash = hash(payload.secret); let device = this.devices.get(payload.deviceId);
    if (device && !timingSafeEqual(Buffer.from(device.secretHash, 'hex'), Buffer.from(secretHash, 'hex'))) throw new Error('IDENTITY_DENIED');
    if (!device) {
      if (this.devices.size >= this.capacity) throw new Error('CAPACITY');
      let code;
      for (let tries = 0; tries < 64; tries++) { const candidate = this.codeFactory(payload); if (validDeviceCode(candidate) && !this.codes.has(candidate)) { code = candidate; break; } }
      if (!code) throw new Error('CAPACITY');
      device = { id: payload.deviceId, code, secretHash };
      const next = new Map(this.devices); next.set(device.id, device); this.persist(next);
      this.devices = next; this.codes.set(code, device.id);
    }
    const old = this.active.get(device.id); if (old) this.presence.delete(old);
    const token = randomBytes(32).toString('base64url'), key = hash(token);
    this.active.set(device.id, key); this.presence.set(key, { id: device.id, expiresAt: this.now() + this.leaseMs, state: 'waiting' });
    return { code: device.code.match(/.{4}/g).join(' '), token, stable: true, leaseSeconds: Math.ceil(this.leaseMs / 1000), scope: 'pairing-only' };
  }
  sweep() {
    for (const [key, p] of this.presence) if (p.expiresAt <= this.now()) { this.presence.delete(key); if (this.active.get(p.id) === key) this.active.delete(p.id); }
  }
  owner(token) { this.sweep(); return typeof token === 'string' && token.length <= 128 ? this.presence.get(hash(token))?.id : null; }
  status(token) {
    this.sweep(); const p = typeof token === 'string' && token.length <= 128 ? this.presence.get(hash(token)) : null;
    if (!p) return { state: 'offline' };
    p.expiresAt = this.now() + this.leaseMs; return { state: p.state, leaseSeconds: Math.ceil(this.leaseMs / 1000) };
  }
  verify(code) {
    this.sweep(); const normalized = normalizeCode(code);
    if (!validDeviceCode(normalized)) return 'invalid';
    const id = this.codes.get(normalized); if (!id) return 'invalid';
    const p = this.presence.get(this.active.get(id)); if (!p) return 'offline';
    p.state = 'identified'; return 'identified';
  }
  revoke(token) {
    if (typeof token !== 'string' || token.length > 128) return;
    const key = hash(token), p = this.presence.get(key); if (!p) return;
    this.presence.delete(key); if (this.active.get(p.id) === key) this.active.delete(p.id);
  }
}
