// One disposable pointer slot; reliable events retain their relative order.
export class InputQueue {
  constructor(limit = 64, now = () => performance.now()) {
    this.limit = limit; this.now = now; this.events = []; this.pointer = null;
    this.replaced = 0; this.maxWaitMs = 0;
  }
  push(event) {
    const entry = { event, at: this.now() };
    if (event.type === 'move') {
      if (this.pointer) this.replaced++;
      this.pointer = entry;
      return;
    }
    if (this.events.length >= this.limit) throw new Error('Fila de entrada excedida. Atendimento encerrado por segurança.');
    // A stale position must never move the cursor back after a click/release.
    if (['down', 'up', 'release'].includes(event.type)) this.pointer = null;
    this.events.push(entry);
  }
  take(max = 8) {
    const entries = this.events.splice(0, max);
    if (entries.length < max && this.pointer) { entries.push(this.pointer); this.pointer = null; }
    for (const entry of entries) this.maxWaitMs = Math.max(this.maxWaitMs, this.now() - entry.at);
    return entries.map(entry => entry.event);
  }
  clear() { this.events.length = 0; this.pointer = null; }
  get length() { return this.events.length + Number(Boolean(this.pointer)); }
}
