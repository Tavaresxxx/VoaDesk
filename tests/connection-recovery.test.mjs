import test from 'node:test';
import assert from 'node:assert/strict';
import {watchConnection} from '../src/video/peer.mjs';
function fixture(){
 const pc=new EventTarget(),events=[],timers=new Map();let id=0;
 const dispose=watchConnection(pc,{onPause:()=>events.push('paused'),onResume:()=>events.push('resumed'),onEnd:r=>events.push(r),setTimer:fn=>{timers.set(++id,fn);return id;},clearTimer:id=>timers.delete(id)});
 return {events,timers,dispose,state(value){pc.connectionState=value;pc.dispatchEvent(new Event('connectionstatechange'));},expire(){for(const fn of [...timers.values()])fn();timers.clear();}};
}
test('temporary media disconnect recovers without ending or extending the deadline',()=>{
 const f=fixture();f.state('connected');f.state('disconnected');f.state('disconnected');assert.equal(f.timers.size,1);f.state('connected');f.expire();assert.deepEqual(f.events,['paused','resumed']);f.dispose();
});
test('persistent media disconnect ends within its bounded grace period',()=>{
 const f=fixture();f.state('disconnected');f.expire();assert.deepEqual(f.events,['paused','media-timeout']);f.dispose();
});
test('terminal transport failure is reported and disposal cancels recovery callbacks',()=>{
 const f=fixture();f.state('disconnected');f.state('failed');assert.deepEqual(f.events,['paused','media-failed']);assert.equal(f.timers.size,0);f.dispose();f.state('closed');assert.equal(f.events.length,2);
 const g=fixture();g.state('disconnected');g.dispose();g.expire();assert.deepEqual(g.events,['paused']);
});
