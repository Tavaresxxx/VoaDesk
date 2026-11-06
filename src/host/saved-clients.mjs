import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { normalizeCode } from '../pairing/registry.mjs';
import { validDeviceCode } from '../pairing/devices.mjs';
export class SavedClients {
  constructor(file) {
    this.file = file; this.items = [];
    if (existsSync(file)) {
      const loaded = JSON.parse(readFileSync(file, 'utf8'));
      if (!Array.isArray(loaded) || loaded.length > 1000) throw new Error('INVALID_SAVED_CLIENTS');
      const codes = new Set();
      this.items = loaded.map(item => { const clean = this.validate(item); if (codes.has(clean.code)) throw new Error('INVALID_SAVED_CLIENTS'); codes.add(clean.code); return { id: String(item.id), ...clean }; });
    }
  }
  validate(item) {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    const code = normalizeCode(item?.code);
    if (!name || name.length > 80 || /[\u0000-\u001f]/.test(name) || !validDeviceCode(code)) throw new Error('INVALID_CLIENT');
    return { name, code };
  }
  add(payload) {
    const clean = this.validate(payload);
    if (this.items.some(item => item.code === clean.code)) throw new Error('DUPLICATE_CLIENT');
    if (this.items.length >= 1000) throw new Error('CLIENT_CAPACITY');
    const item = { id: randomBytes(12).toString('hex'), ...clean }, next = [...this.items, item];
    writeFileSync(this.file + '.tmp', JSON.stringify(next, null, 2), { mode: 0o600 }); renameSync(this.file + '.tmp', this.file); this.items = next;
    return item;
  }
}
