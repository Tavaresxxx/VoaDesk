import { randomBytes, createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
const key = value => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
export class SessionHub {
  changes = new EventEmitter();
  changed() {
    if(this.changeQueued)return;this.changeQueued=true;
    queueMicrotask(()=>{this.changeQueued=false;this.changes.emit('state');});
  }
  constructor(devices, { now = Date.now, operatorName = 'Operador local', onEnd = () => {}, rtcConfiguration = () => ({iceServers:[]}) } = {}) { Object.assign(this, { devices, now, operatorName, onEnd, rtcConfiguration }); this.current = null;this.sessions=new Map();this.techSessions=new Map();this.browserSessions=new Map();this.deviceSessions=new Map();this.changes.setMaxListeners(128); this.tickets = new Map(); }
  owner(token) { return this.devices?.owner(token); }
  sweep() {
    this.devices?.sweep();
    for(const s of this.sessions.values()){
    if(s && s.state !== 'ended' && this.devices.active.get(s.deviceId) !== s.nativeKey) this.end(s, 'identity-revoked');
    if (s && s.state !== 'ended' && (this.now() > s.expires || (s.state==='approved'&&!s.browserKey&&this.now()>s.captureDeadline) || (s.state !== 'pending' && Object.values(s.alive).some(t => this.now() - t > 12000)))) this.end(s, 'connection-lost');
    }
    for(const [id,s] of this.sessions)if(s.state==='ended'&&this.now()-s.endedAt>600000)this.remove(s);
    for (const [k,t] of this.tickets) if (t.expires < this.now()) this.tickets.delete(k);
  }
  remove(s){this.sessions.delete(s.id);this.techSessions.delete(s.techKey);if(s.browserKey)this.browserSessions.delete(s.browserKey);if(this.deviceSessions.get(s.deviceId)===s.id)this.deviceSessions.delete(s.deviceId);}
  end(s, reason) { if(s.state==='ended')return; s.state='ended';s.endedAt=this.now(); s.reason=reason; s.permission='none'; s.permissionRevision++;s.commands=[]; s.offer=s.answer=null; for(const [k,t] of this.tickets)if(t.id===s.id)this.tickets.delete(k); this.changed(); this.onEnd({ start:s.start,end:new Date(this.now()).toISOString(),result:reason }); }
  request(code,operatorSeat='local') {
    this.sweep();
    if (this.devices.verify(code) !== 'identified') throw new Error('OFFLINE');
    const deviceId=this.devices.codes.get(code.toUpperCase().replace(/[ -]/g,'')), token=secret();
    if([...this.sessions.values()].some(s=>s.state!=='ended'&&(s.deviceId===deviceId||s.operatorSeat===operatorSeat)))throw new Error('BUSY');
    if(this.sessions.size>=128){for(const s of this.sessions.values())if(s.state==='ended')this.remove(s);if(this.sessions.size>=128)throw new Error('BUSY');}
    const id=secret();
    this.current={id,operatorSeat,signalRevision:0,rtc:this.rtcConfiguration(id),deviceId,nativeKey:this.devices.active.get(deviceId),techKey:key(token),browserKey:null,state:'pending',permission:'none',permissionRevision:0,operatorName:this.operatorName,start:new Date(this.now()).toISOString(),expires:this.now()+60000,alive:{tech:this.now(),native:this.now()},commands:[],offer:null,answer:null,stats:null,seq:0};
    this.sessions.set(id,this.current);this.techSessions.set(this.current.techKey,id);this.deviceSessions.set(deviceId,id);
    this.changed();return { token, ...this.public(this.current) };
  }
  public(s) { return { id:s.id,signalRevision:s.signalRevision,recovery:true,state:s.state,permission:s.permission,permissionRevision:s.permissionRevision,operatorName:s.operatorName,reason:s.reason??null,offer:s.offer,answer:s.answer,stats:s.stats,...(['approved','active'].includes(s.state)?{rtc:s.rtc}:{}) }; }
  client(token) { this.sweep(); const id=this.owner(token),s=this.sessions.get(this.deviceSessions.get(id)); if (!id || s?.deviceId!==id)return null; if(s.state!=='ended')s.alive.native=this.now();return s; }
  technician(token) { this.sweep(); const s=typeof token==='string'?this.sessions.get(this.techSessions.get(key(token))):null; if (!s || typeof token!=='string' || s.techKey!==key(token))throw new Error('DENIED'); if(s.state!=='ended')s.alive.tech=this.now();return s; }
  browser(token) { this.sweep(); const s=typeof token==='string'?this.sessions.get(this.browserSessions.get(key(token))):null; if (!s || !s.browserKey || typeof token!=='string' || s.browserKey!==key(token)||!['approved','active'].includes(s.state))throw new Error('DENIED');s.alive.capture=this.now();return s; }
  decide(token,id,permission) {
    const s=this.client(token); if(!s||s.id!==id||!['pending','approved','active'].includes(s.state))throw new Error('DENIED');
    if(permission==='deny'||permission==='end') { this.end(s,permission==='deny'?'denied':'stopped');return {state:'ended'}; }
    if(!['view','control'].includes(permission))throw new Error('INVALID');
    s.permissionRevision++;
    if(s.state!=='pending'){s.permission=permission;s.commands=[];this.changed();return {state:s.state};}
    s.permission=permission;s.state='approved';s.captureDeadline=this.now()+60000;s.expires=this.now()+8*60*60*1000;
    const ticket=secret();this.tickets.set(key(ticket),{id:s.id,expires:this.now()+60000});this.changed();return {state:s.state,ticket};
  }
  redeem(ticket) {this.sweep();const t=typeof ticket==='string'&&this.tickets.get(key(ticket)),s=t&&this.sessions.get(t.id);if(!t||t.expires<this.now()||!s||!['approved','active'].includes(s.state))throw new Error('DENIED');this.tickets.delete(key(ticket));const token=secret();s.browserKey=key(token);this.browserSessions.set(s.browserKey,s.id);s.alive.capture=this.now();return token;}
  signal(s,role,payload) {
    if(!['approved','active'].includes(s.state))throw new Error('DENIED');
    const field=role==='capture'?'offer':'answer', expected=role==='capture'?'offer':'answer';
    if(payload?.type!==expected||typeof payload.sdp!=='string'||payload.sdp.length>100000)throw new Error('INVALID');
    const revision=payload.revision??(s.signalRevision||1);
    if(!Number.isSafeInteger(revision)||revision<1)throw new Error('INVALID');
    if(role==='capture'){
      if(revision===s.signalRevision&&s.offer?.sdp===payload.sdp)return;
      if(revision!==s.signalRevision+1||(s.signalRevision>0&&!s.answer))throw new Error('INVALID');
      s.signalRevision=revision;s.answer=null;
    }else if(revision!==s.signalRevision||!s.offer)throw new Error('INVALID');
    s[field]={type:payload.type,sdp:payload.sdp};
  }
  input(s,event) {
    if(!['approved','active'].includes(s.state))throw new Error('DENIED');
    if(event?.type==='guide'){if(![event.x,event.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1))throw new Error('INVALID');s.commands=s.commands.filter(c=>c.type!=='guide');if(s.commands.length>=128){this.end(s,'input-overflow');throw new Error('OVERFLOW');}s.commands.push({type:'guide',x:event.x,y:event.y});this.changed();return;}
    if(event?.type==='release'){if(s.commands.length>=128){this.end(s,'input-overflow');return;}s.commands.push({type:'release'});this.changed();return;}
    if(s.permission!=='control')throw new Error('VIEW_ONLY');
    const types=['move','down','up','wheel','keyDown','keyUp','text'];
    if(!types.includes(event?.type))throw new Error('INVALID');
    const safe={type:event.type};
    if(['move','down','up'].includes(event.type)){if(![event.x,event.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1))throw new Error('INVALID');Object.assign(safe,{x:event.x,y:event.y,button:[0,1,2].includes(event.button)?event.button:0});}
    if(event.type==='wheel'){if(!Number.isFinite(event.delta)||Math.abs(event.delta)>1200)throw new Error('INVALID');safe.delta=event.delta;}
    if(event.type==='text'){if(typeof event.text!=='string'||event.text.length>64)throw new Error('INVALID');safe.text=event.text;}
    if(event.type.startsWith('key')){if(typeof event.code!=='string'||! /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2])|Enter|Tab|Escape|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Meta(Left|Right)|Space|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Backquote|Comma|Period|Slash|IntlBackslash|IntlRo|Numpad[0-9]|Numpad(Add|Subtract|Multiply|Divide|Decimal|Enter))$/.test(event.code))throw new Error('INVALID');safe.code=event.code;}
    if(event.type==='move'&&s.commands.at(-1)?.type==='move')s.commands.pop();
    if(s.commands.length>=128){this.end(s,'input-overflow');throw new Error('OVERFLOW');}
    s.commands.push(safe);this.changed();
  }
  commands(token) { const s=this.client(token); if(!s)return {state:'idle',permission:'none',commands:[]};const commands=s.commands;s.commands=[];return {...this.public(s),offer:undefined,answer:undefined,commands}; }
}
