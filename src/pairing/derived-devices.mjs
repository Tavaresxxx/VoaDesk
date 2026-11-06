import { createHmac } from 'node:crypto';
import { DeviceRegistry } from './devices.mjs';
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

// No disk/database durability is claimed: only presence is retained in memory.
// The same private device identity and server key derive the same public locator.
export class DerivedDeviceRegistry extends DeviceRegistry {
  constructor({ key, ...options } = {}) {
    if (typeof key !== 'string' || key.length < 32) throw new Error('DERIVATION_KEY_REQUIRED');
    const derive = (domain, value) => createHmac('sha256', key).update('voadesk-' + domain + '-v1\0').update(value).digest();
    super({ ...options, file: null, memoryOnly: true, codeFactory: payload => [...derive('locator', payload.deviceId).subarray(0, 16)].map(byte => alphabet[byte & 31]).join('') });
    this.derive = derive;
    this.storage = 'derived-memory';
  }
  register(payload) {
    if (!payload || !/^[a-f0-9]{32}$/.test(payload.deviceId) || !/^[A-Za-z0-9_-]{43}$/.test(payload.secret)) throw new Error('INVALID_IDENTITY');
    const deviceId = this.derive('identity', payload.deviceId + '\0' + payload.secret).subarray(0, 16).toString('hex');
    return { ...super.register({ deviceId, secret: payload.secret }), storage: this.storage, serverHistoryPersistent: false };
  }
  sweep() {
    super.sweep();
    // Offline identities need no database row: their locator can be recomputed.
    for (const [id, device] of this.devices) if (!this.active.has(id)) { this.devices.delete(id); this.codes.delete(device.code); }
  }
}
