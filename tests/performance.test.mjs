import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { InputQueue } from '../src/video/input-queue.mjs';
import { iceConfiguration } from '../src/pairing/ice-config.mjs';
import { QualityPolicy } from '../src/video/quality.mjs';
import { SessionHub } from '../src/pairing/sessions.mjs';

test('um milhão de movimentos mantém uma posição, prioriza teclas e invalida movimento anterior ao clique', () => {
  let now=0;const q=new InputQueue(64,()=>now);
  for(let i=0;i<1000000;i++)q.push({type:'move',x:i});
  assert.equal(q.length,1);assert.equal(q.replaced,999999);
  q.push({type:'keyDown',code:'KeyA'});now=20;
  assert.deepEqual(q.take(1),[{type:'keyDown',code:'KeyA'}]);assert.equal(q.maxWaitMs,20);
  q.push({type:'down',x:.5,y:.5});assert.deepEqual(q.take(),[{type:'down',x:.5,y:.5}]);
  q.push({type:'move'});q.push({type:'release'});assert.deepEqual(q.take(),[{type:'release'}]);
});
test('eventos confiáveis mantêm ordem e overflow falha sem perder a fila silenciosamente',()=>{
  const q=new InputQueue(2);q.push({type:'keyDown'});q.push({type:'keyUp'});
  assert.throws(()=>q.push({type:'down'}),/excedida/);
  assert.deepEqual(q.take().map(e=>e.type),['keyDown','keyUp']);q.push({type:'move'});q.clear();assert.equal(q.length,0);
});
test('TURN usa HMAC expirável por sessão e nunca publica o segredo do servidor',()=>{
  const secret='s'.repeat(48),config=iceConfiguration({VOADESK_ICE_URLS:JSON.stringify(['stun:localhost:3478','turn:localhost:3478?transport=udp']),VOADESK_TURN_SECRET:secret},()=>100000);
  const a=config('session-a'),b=config('session-b'),server=a.iceServers[1];
  assert.equal(server.username,'32500:session-a');assert.notEqual(server.credential,b.iceServers[1].credential);
  assert.equal(server.credential,createHmac('sha1',secret).update(server.username).digest('base64'));
  assert.equal(JSON.stringify(a).includes(secret),false);assert.deepEqual(iceConfiguration({})('a'),{iceServers:[],iceTransportPolicy:'all'});
});
test('configuração ICE rejeita protocolos, URLs com credenciais e TURN sem segredo',()=>{
  for(const urls of [['https://invalid'],['turn:user:pass@host'],['stun:host/path'],['stun:host\r\n'],['stun:host:99999'],['stun:host:abc'],['stun:[::badbad]'],['stun:host?transport=udp']])assert.throws(()=>iceConfiguration({VOADESK_ICE_URLS:JSON.stringify(urls)}),/INVALID/);
  assert.throws(()=>iceConfiguration({VOADESK_ICE_URLS:'["turn:localhost"]'}),/SECRET_REQUIRED/);
  assert.throws(()=>iceConfiguration({VOADESK_ICE_POLICY:'relay'}),/INVALID/);
});
test('lentidão da ponte local participa da adaptação sem oscilar a cada amostra',()=>{
  const q=new QualityPolicy({now:()=>0});assert.equal(q.sample({captureBridgeMs:75}),null);assert.equal(q.sample({captureBridgeMs:75}),null);assert.ok(q.sample({captureBridgeMs:75}));assert.equal(q.level,1);
});
test('configuração de conectividade não aparece antes do consentimento nem após encerramento',()=>{
  const hub=new SessionHub(null),s={id:'session',state:'pending',rtc:{iceServers:[{urls:['turn:localhost'],credential:'temporary'}]}};
  assert.equal(hub.public(s).rtc,undefined);s.state='approved';assert.deepEqual(hub.public(s).rtc,s.rtc);s.state='ended';assert.equal(hub.public(s).rtc,undefined);
});
