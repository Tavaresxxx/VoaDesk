import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {DeviceRegistry} from '../src/pairing/devices.mjs';
import {SessionHub} from '../src/pairing/sessions.mjs';
import {QualityPolicy,diagnose} from '../src/video/quality.mjs';
import {StatsSampler} from '../src/video/stats.mjs';
async function setup(t){const dir=await mkdtemp(join(tmpdir(),'voadesk-session-'));t.after(()=>rm(dir,{recursive:true,force:true}));const devices=new DeviceRegistry({file:join(dir,'devices.json')}),client=devices.register({deviceId:randomBytes(16).toString('hex'),secret:randomBytes(32).toString('base64url')});return {devices,client};}
test('somente o cliente vinculado concede acesso; tickets são de uso único e visualizar bloqueia entrada',async t=>{
 const {devices,client}=await setup(t),hub=new SessionHub(devices),request=hub.request(client.code),s=hub.technician(request.token);
 assert.throws(()=>hub.decide('wrong',s.id,'control'),/DENIED/);assert.throws(()=>hub.input(s,{type:'text',text:'x'}),/DENIED/);
 const decision=hub.decide(client.token,s.id,'view'),browser=hub.redeem(decision.ticket);
 assert.throws(()=>hub.redeem(decision.ticket),/DENIED/);assert.equal(hub.browser(browser).permission,'view');
 assert.throws(()=>hub.input(s,{type:'text',text:'x'}),/VIEW_ONLY/);
 hub.input(s,{type:'guide',x:.5,y:.2});assert.equal(hub.commands(client.token).commands[0].type,'guide');
 hub.decide(client.token,s.id,'control');hub.input(s,{type:'keyDown',code:'ControlLeft'});assert.equal(hub.commands(client.token).commands.length,1);
 hub.decide(client.token,s.id,'view');assert.equal(s.commands.length,0);assert.throws(()=>hub.input(s,{type:'keyDown',code:'KeyC'}),/VIEW_ONLY/);
 hub.end(s,'stopped');assert.equal(s.permission,'none');assert.throws(()=>hub.browser(browser),/DENIED/);assert.equal(hub.commands(client.token).commands.length,0);
});
test('negação, participantes diferentes, expiração e desconexão encerram a autorização',async t=>{
 const {devices,client}=await setup(t);let now=0;const hub=new SessionHub(devices,{now:()=>now});
 const r=hub.request(client.code);assert.throws(()=>hub.technician('other'),/DENIED/);assert.throws(()=>hub.request(client.code),/BUSY/);
 hub.decide(client.token,r.id,'deny');assert.equal(hub.current.state,'ended');
 const next=hub.request(client.code);hub.decide(client.token,next.id,'control');now=12001;hub.sweep();assert.equal(hub.current.reason,'connection-lost');assert.equal(hub.current.permission,'none');
 const pending=hub.request(client.code);now+=60001;hub.sweep();assert.equal(hub.current.state,'ended');assert.throws(()=>hub.decide(client.token,pending.id,'view'),/DENIED/);
});
test('fila coalesce movimentos, preserva teclas e falha fechada quando cheia',async t=>{
 const {devices,client}=await setup(t),hub=new SessionHub(devices),r=hub.request(client.code);hub.decide(client.token,r.id,'control');const s=hub.current;
 for(let i=0;i<300;i++)hub.input(s,{type:'move',x:.3,y:.2});assert.equal(s.commands.length,1);
 hub.input(s,{type:'release'});assert.deepEqual(s.commands.at(-1),{type:'release'});assert.equal(hub.commands(client.token).commands.length,2);
 for(let i=0;i<128;i++)hub.input(s,{type:'keyDown',code:'KeyA'});
 assert.throws(()=>hub.input(s,{type:'keyUp',code:'KeyA'}),/OVERFLOW/);assert.equal(s.state,'ended');assert.equal(s.commands.length,0);
});
test('adaptação tem histerese, mantém preferência e respeita modo manual',()=>{
 let now=0;const p=new QualityPolicy({now:()=>now,preference:'quality'});for(let i=0;i<2;i++)assert.equal(p.sample({lossPercent:8}),null);assert.match(p.sample({lossPercent:8}),/Ajustamos/);
 assert.equal(p.level,1);assert.equal(p.encoding(2160).scaleResolutionDownBy,1);
 for(let i=0;i<10;i++)assert.equal(p.sample({lossPercent:8}),null);
 now=21000;assert.ok(p.sample({lossPercent:8}));assert.equal(p.level,2);
 now=52000;for(let i=0;i<14;i++)assert.equal(p.sample({lossPercent:0,rttMs:20}),null);assert.match(p.sample({lossPercent:0,rttMs:20}),/recuperando/);
 p.choose('smooth',false);for(let i=0;i<30;i++)assert.equal(p.sample({lossPercent:90}),null);assert.equal(p.level,0);assert.equal(p.preference,'smooth');
});
test('diagnóstico diferencia indícios e não inventa internet, CPU ou GPU sem métricas',()=>{
 assert.equal(diagnose({})[0].kind,'unknown');assert.equal(diagnose({lossPercent:10},true)[0].text.includes('internet'),false);
 assert.deepEqual(diagnose({qualityLimitation:'cpu',decodeMs:60,route:'relay'}).map(x=>x.kind),['client','technician','relay']);
});
test('estatísticas do receptor usam deltas próprios, buffer e reinício de contadores',()=>{
 const sampler=new StatsSampler(),report=n=>new Map([['in',{id:'in',type:'inbound-rtp',kind:'video',timestamp:n*1000,framesDecoded:n*30,totalDecodeTime:n*.3,jitterBufferDelay:n*.6,jitterBufferEmittedCount:n*30,packetsReceived:n*100,packetsLost:n*5,framesDropped:n*3,freezeCount:n}]]);
 sampler.sample(report(1));const s=sampler.sample(report(2));assert.equal(s.decodeMs,10);assert.equal(s.jitterBufferMs,20);assert.equal(s.freezesInInterval,1);assert.ok(s.lossPercent>4);assert.equal(s.visualLatencyMs,null);assert.equal(s.powerEfficientDecoder,null);
 assert.equal(sampler.sample(report(0)).decodeMs,null);
});
