import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DeviceRegistry} from '../src/pairing/devices.mjs';
import {createPairingService} from '../src/pairing/service.mjs';
import {SessionHub} from '../src/pairing/sessions.mjs';
import {CHUNK_SIZE,copyChunks,fileRpc} from '../src/video/files.mjs';
import {TimingWindow,PresentationMeter,DiagnosticHistory} from '../src/video/stats.mjs';
import {QualityPolicy} from '../src/video/quality.mjs';
import {watchConnection} from '../src/video/peer.mjs';

async function setup(t){const dir=await mkdtemp(join(tmpdir(),'voadesk-stream-'));t.after(()=>rm(dir,{recursive:true,force:true}));const devices=new DeviceRegistry({file:join(dir,'devices.json')}),register=()=>devices.register({deviceId:randomBytes(16).toString('hex'),secret:randomBytes(32).toString('base64url')});return {devices,register};}

test('atendimentos isolam clientes, tokens, tickets e limite por instância do técnico',async t=>{
  const {devices,register}=await setup(t),a=register(),b=register(),hub=new SessionHub(devices);
  const first=hub.request(a.code,'seat-a'),second=hub.request(b.code,'seat-b');
  assert.throws(()=>hub.request(b.code,'seat-c'),/BUSY/);
  assert.throws(()=>hub.request(a.code,'seat-b'),/BUSY/);
  const da=hub.decide(a.token,first.id,'control'),db=hub.decide(b.token,second.id,'control');
  assert.throws(()=>hub.decide(a.token,second.id,'end'),/DENIED/);
  hub.end(hub.technician(first.token),'stopped');
  assert.throws(()=>hub.redeem(da.ticket),/DENIED/);
  const browser=hub.redeem(db.ticket),s=hub.browser(browser);
  assert.equal(s.id,second.id);assert.equal(hub.commands(a.token).state,'ended');
  hub.input(s,{type:'text',text:'synthetic'});assert.equal(hub.commands(b.token).commands.length,1);
  assert.equal(hub.commands(a.token).commands.length,0);
  devices.revoke(a.token);hub.sweep();assert.equal(hub.technician(second.token).state,'approved');
});

test('renegociação exige revisões atuais e não reabre autorização encerrada',async t=>{
  const {devices,register}=await setup(t),a=register(),hub=new SessionHub(devices),r=hub.request(a.code);
  hub.decide(a.token,r.id,'control');const s=hub.technician(r.token);
  hub.signal(s,'capture',{type:'offer',sdp:'o1',revision:1});hub.signal(s,'tech',{type:'answer',sdp:'a1',revision:1});
  hub.signal(s,'capture',{type:'offer',sdp:'o2',revision:2});assert.equal(s.answer,null);
  assert.throws(()=>hub.signal(s,'tech',{type:'answer',sdp:'late',revision:1}),/INVALID/);
  assert.throws(()=>hub.signal(s,'capture',{type:'offer',sdp:'skip',revision:4}),/INVALID/);
  hub.signal(s,'tech',{type:'answer',sdp:'a2',revision:2});assert.equal(s.signalRevision,2);
  hub.end(s,'stopped');assert.throws(()=>hub.signal(s,'capture',{type:'offer',sdp:'o3',revision:3}),/DENIED/);
});

test('fluxo HTTP publica consentimento e revogação sem consultar a cada comando',async t=>{
  const {devices,register}=await setup(t),client=register(),service=await createPairingService({devices});
  t.after(()=>service.close());const auth={Authorization:'Bearer '+client.token};
  assert.equal((await fetch(service.origin+'/v3/client/events')).status,403);
  const response=await fetch(service.origin+'/v3/client/events',{headers:auth});assert.match(response.headers.get('content-type'),/event-stream/);
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  t.after(()=>reader.cancel().catch(()=>{}));
  const next=async predicate=>{
    const deadline=Date.now()+2500;
    while(Date.now()<deadline){let index=buffer.indexOf('\n\n');if(index<0){const result=await reader.read();assert.equal(result.done,false);buffer+=decoder.decode(result.value,{stream:true});continue;}
      const event=buffer.slice(0,index);buffer=buffer.slice(index+2);const data=JSON.parse(event.slice(6));if(predicate(data))return data;
    }assert.fail('Estado não recebido');
  };
  assert.equal((await next(s=>s.state==='idle')).permission,'none');
  assert.equal((await fetch(service.origin+'/v3/client/events',{headers:auth})).status,409);
  const r=service.sessions.request(client.code);assert.equal((await next(s=>s.state==='pending')).id,r.id);
  service.sessions.decide(client.token,r.id,'control');assert.equal((await next(s=>s.state==='approved')).permission,'control');
  service.sessions.end(service.sessions.technician(r.token),'stopped');assert.equal((await next(s=>s.state==='ended')).permission,'none');
  devices.revoke(client.token);service.sessions.sweep();
  // The next heartbeat closes a revoked identity's persistent connection.
  let done=false;for(let i=0;i<3&&!done;i++)done=(await reader.read()).done;assert.equal(done,true);
});

class Channel extends EventTarget {
  readyState='open';bufferedAmount=0;packets=[];
  send(data){this.packets.push(data);queueMicrotask(()=>this.other.dispatchEvent(new MessageEvent('message',{data})));}
  close(){this.readyState='closed';this.dispatchEvent(new Event('close'));}
}
test('arquivos binários usam quatro confirmações em voo e preservam bytes e ordem',async()=>{
  const a=new Channel(),b=new Channel();a.other=b;b.other=a;
  let outstanding=0,peak=0;const received=[];
  const client=fileRpc(a),server=fileRpc(b,async(action,value)=>{assert.equal(action,'write');assert.ok(value.chunk instanceof Uint8Array);await new Promise(r=>setTimeout(r,2));received.push(value.chunk);return {ok:true};});
  try{
    const source=new Uint8Array(CHUNK_SIZE*9+13).map((_,i)=>i%251);
    await copyChunks({size:source.length,window:4,read:(offset,length)=>source.slice(offset,offset+length),write:async bytes=>{peak=Math.max(peak,++outstanding);try{await client.call('write',{id:'fixture',chunk:bytes});}finally{outstanding--;}}});
    assert.equal(peak,4);assert.deepEqual(Buffer.concat(received.map(v=>Buffer.from(v))),Buffer.from(source));
    assert.ok(a.packets.every(p=>p instanceof Uint8Array));assert.ok(a.packets.every(p=>p.byteLength<CHUNK_SIZE+256));
  }finally{client.close();server.close();}
});
test('download antecipado preserva ordem mesmo com leituras resolvidas fora de ordem',async()=>{
  const output=[],source=new Uint8Array(CHUNK_SIZE*6).map((_,i)=>i%251);let count=0,peak=0;
  await copyChunks({size:source.length,window:4,read:async(at,length)=>{peak=Math.max(peak,++count);await new Promise(r=>setTimeout(r,12-(at/CHUNK_SIZE)%4));count--;return source.slice(at,at+length);},write:bytes=>output.push(Buffer.from(bytes))});
  assert.equal(peak,4);assert.deepEqual(Buffer.concat(output),Buffer.from(source));
});
test('cancelamento aguarda blocos pendentes antes de liberar o arquivo',async()=>{
  let cancelled=false,active=0,completed=0;
  const operation=copyChunks({size:CHUNK_SIZE*8,window:4,cancelled:()=>cancelled,read:()=>new Uint8Array(CHUNK_SIZE),write:async()=>{active++;await new Promise(r=>setTimeout(r,10));active--;completed++;cancelled=true;}});
  await assert.rejects(operation,/cancelada/);assert.equal(active,0);assert.equal(completed,4);
});
test('frames binários inválidos encerram o canal sem executar IO',async()=>{
  const a=new Channel(),b=new Channel();a.other=b;b.other=a;let invoked=false;const rpc=fileRpc(b,async()=>{invoked=true;});
  a.send(new Uint8Array([255,255,255,255]));await new Promise(r=>setImmediate(r));assert.equal(b.readyState,'closed');assert.equal(invoked,false);rpc.close();
});

test('métricas zeram FPS congelado, medem duração e mantêm percentis limitados',()=>{
  let now=0;const meter=new PresentationMeter(()=>now),timings=new TimingWindow(3);
  assert.equal(meter.sample().fps,null);meter.present(10);now=100;assert.equal(meter.sample().fps,10);
  now=1100;const frozen=meter.sample();assert.equal(frozen.fps,0);assert.equal(frozen.lastFrameAgeMs,1090);assert.equal(frozen.presentationFreezeCount,1);assert.equal(frozen.presentationFreezeMs,590);
  now=2100;assert.equal(meter.sample().presentationFreezeCount,1);meter.present(2200);now=2300;assert.equal(meter.sample().presentationFreezeCount,1);
  for(const n of [999,1,4,2])timings.add(n);assert.equal(timings.percentile(.5),2);assert.equal(timings.percentile(.95),4);
});
test('exportação contém somente métricas numéricas permitidas e tem limite de memória',()=>{
  const history=new DiagnosticHistory();for(let i=0;i<700;i++)history.add({width:1280,rttMs:i,sdp:'private',token:'private',text:'private',operatorName:'private',captureMs:'private'});
  const result=history.export();assert.equal(result.samples.length,600);assert.equal(result.samples[0].rttMs,100);assert.equal(JSON.stringify(result).includes('private'),false);
});
test('captura de 40ms não volta a 30/60FPS apenas por estar saudável a 20FPS',()=>{
  let now=0;const p=new QualityPolicy({now:()=>now});for(let i=0;i<3;i++)p.sample({captureBridgeMs:40});now=21000;for(let i=0;i<3;i++)p.sample({captureBridgeMs:40});assert.equal(p.encoding().maxFramerate,20);
  for(let i=0;i<90;i++){now+=1000;p.sample({captureBridgeMs:40,lossPercent:0});}assert.equal(p.encoding().maxFramerate,20);
  for(let i=0;i<20;i++){now+=1000;p.sample({captureBridgeMs:10,lossPercent:0});}assert.equal(p.encoding().maxFramerate,30);
});
test('apresentação usa contador do navegador e ignora intervalos com a página oculta',()=>{
  let now=0;const meter=new PresentationMeter(()=>now);meter.present(10,100);meter.present(100,110);now=1000;assert.equal(meter.sample().fps,11);
  meter.setActive(false,1000);now=10000;assert.equal(meter.sample().fps,null);meter.setActive(true,now);meter.present(10010,1000);now=10100;assert.equal(meter.sample().fps,10);
});
test('sinais de rede e CPU têm sequências independentes e FPS pode cair após bitrate já adaptado',()=>{
  let now=0;const p=new QualityPolicy({now:()=>now});for(let i=0;i<3;i++)p.sample({lossPercent:8});now=21000;for(let i=0;i<3;i++)p.sample({lossPercent:8});assert.equal(p.level,2);assert.equal(p.encoding(1080).maxFramerate,60);
  now=42000;for(let i=0;i<3;i++)p.sample({captureBridgeMs:40});assert.equal(p.encoding(1080).maxFramerate,30);
  const alternating=new QualityPolicy();for(let i=0;i<20;i++)alternating.sample(i%2?{qualityLimitation:'cpu'}:{lossPercent:8});assert.equal(alternating.level,0);
});
test('recuperação tenta uma vez por interrupção e mantém o prazo absoluto',async()=>{
  const pc=new EventTarget(),timers=new Map(),events=[];let id=0;
  const dispose=watchConnection(pc,{onPause:()=>events.push('pause'),onRecover:async()=>events.push('restart'),onEnd:r=>events.push(r),setTimer:(fn,ms)=>{const key=++id;timers.set(key,{fn:()=>{timers.delete(key);fn();},ms});return key;},clearTimer:id=>timers.delete(id)});
  const state=value=>{pc.connectionState=value;pc.dispatchEvent(new Event('connectionstatechange'));};
  state('failed');state('failed');assert.equal(timers.size,2);const attempt=[...timers.values()].find(t=>t.ms===1000),deadline=[...timers.values()].find(t=>t.ms===8000);
  attempt.fn();await new Promise(r=>setImmediate(r));state('disconnected');assert.deepEqual(events,['pause','restart']);deadline.fn();assert.equal(events.at(-1),'media-timeout');dispose();assert.equal(timers.size,0);
});
