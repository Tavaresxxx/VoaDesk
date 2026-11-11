import test from 'node:test';
import assert from 'node:assert/strict';
import {InputQueue} from '../src/video/input-queue.mjs';
import {QualityPolicy} from '../src/video/quality.mjs';
import {applyQuality} from '../src/video/peer.mjs';
import {encodingFor} from '../src/video/profiles.mjs';
test('movimentos atrasados e duplicados não substituem a posição mais recente, mesmo após envio',()=>{
 const q=new InputQueue();q.push({type:'move',inputId:20});q.push({type:'move',inputId:19});assert.equal(q.take()[0].inputId,20);q.push({type:'move',inputId:20});assert.equal(q.length,0);
 q.push({type:'down',inputId:25});q.push({type:'move',inputId:24});assert.deepEqual(q.take().map(e=>e.type),['down']);q.clear();q.push({type:'move',inputId:19});assert.equal(q.length,0);q.push({type:'move',inputId:26});assert.equal(q.take()[0].inputId,26);
});
test('RTT estável de 180ms não reduz qualidade; captura de 40ms excede orçamento de 60FPS',()=>{
 let now=0;const p=new QualityPolicy({now:()=>now});for(let i=0;i<90;i++){p.sample({rttMs:180,lossPercent:0,jitterMs:2});now+=1000;}assert.equal(p.level,0);
 for(let i=0;i<3;i++)p.sample({captureBridgeMs:40});assert.equal(p.level,1);assert.equal(p.encoding(2160).maxFramerate,30);
});
test('congestionamento reduz bitrate sem reduzir FPS apenas pelo sinal de rede',()=>{
 const p=new QualityPolicy();for(let i=0;i<3;i++)p.sample({lossPercent:8});assert.equal(p.level,1);assert.equal(p.encoding(1080).maxFramerate,60);assert.ok(p.encoding().maxBitrate<8000000);
});
test('canvas nativo já reduzido usa escala 1 no encoder, inclusive na transição de perfil',async()=>{
 const p=new QualityPolicy({preference:'smooth'});p.level=2;
 let params;const sender={getParameters:()=>({encodings:[{scaleResolutionDownBy:2}]}),setParameters:async value=>{params=value;}};
 const track={getSettings:()=>({height:1080}),applyConstraints:async()=>{}};
 await applyQuality(sender,track,p,{preScaled:true});assert.equal(params.encodings[0].scaleResolutionDownBy,1);
 await applyQuality(sender,track,p);assert.equal(params.encodings[0].scaleResolutionDownBy,1.5);
});
test('perfil econômico limita 2160p a 720p, 30FPS e 2.5Mbps',()=>{const e=encodingFor('economy',2160);assert.equal(e.scaleResolutionDownBy,3);assert.equal(e.maxFramerate,30);assert.equal(e.maxBitrate,2500000);});
