import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createConnection } from 'node:net';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createPairingService } from '../src/pairing/service.mjs';
import { DerivedDeviceRegistry } from '../src/pairing/derived-devices.mjs';

const service=await createPairingService({devices:new DerivedDeviceRegistry({key:randomBytes(32).toString('base64url')})});
let child;const evidence={scope:'localhost-synthetic-capture-no-os-input',checks:[]};
const check=name=>evidence.checks.push(name);
try{
 const client=service.sessions.devices.register({deviceId:randomBytes(16).toString('hex'),secret:randomBytes(32).toString('base64url')});
 const request=service.sessions.request(client.code),decision=service.sessions.decide(client.token,request.id,'control');
 const bootstrap=await new Promise((resolve,reject)=>{
  child=spawn('.cache/native/DesktopBridgeFixture.exe',[service.origin+'/'],{windowsHide:true,env:{...process.env,VOADESK_FIXTURE_CLIENT:client.token,VOADESK_FIXTURE_TICKET:decision.ticket}});
  const timer=setTimeout(()=>reject(Error('Fixture timeout')),10000);child.once('error',reject);
  createInterface({input:child.stdout}).on('line',line=>{try{const data=JSON.parse(line);if(data.kind==='ready'){clearTimeout(timer);resolve(data.url);}}catch{}});
 });
 const origin=new URL(bootstrap).origin,boot=await fetch(bootstrap,{redirect:'manual'}),cookie=boot.headers.get('set-cookie').split(';')[0];
 const headers={Cookie:cookie,Origin:origin,'X-VoaDesk':'1','Content-Type':'application/json'};
 const state=await(await fetch(origin+'/support/native/state',{headers})).json();
 const endpoint='/support/native/frame?'+encodeURIComponent(state.selected);
 const full=await fetch(origin+endpoint,{headers});assert.equal(full.status,200);const fullBytes=await full.arrayBuffer();
 const scaled=await fetch(origin+endpoint+'&maxHeight=180',{headers});assert.equal(scaled.status,200);assert.ok((await scaled.arrayBuffer()).byteLength<fullBytes.byteLength);assert.ok(Number.isFinite(Number(scaled.headers.get('X-VoaDesk-captureMs'))));check('scaled JPEG and capture timing');
 assert.equal((await fetch(origin+endpoint+'&maxHeight=-1',{headers})).status,403);check('invalid scaling rejected');
 function raw(parts){return new Promise((resolve,reject)=>{const socket=createConnection(new URL(origin).port,'127.0.0.1'),chunks=[];socket.setTimeout(10000,()=>socket.destroy(Error('timeout')));socket.on('data',chunk=>{chunks.push(chunk);const received=Buffer.concat(chunks),end=received.indexOf('\r\n\r\n'),length=end<0?null:/\r\nContent-Length: (\d+)\r\n/i.exec(received.subarray(0,end+4).toString());if(length&&received.length>=end+4+Number(length[1])){resolve(received.toString());socket.destroy();}});socket.on('error',reject);socket.on('end',()=>resolve(Buffer.concat(chunks).toString()));socket.on('connect',async()=>{for(const part of parts){if(socket.destroyed)break;socket.write(part);await new Promise(r=>setTimeout(r,2));}});});}
 const body=JSON.stringify({type:'release'}),head=`POST /support/input HTTP/1.1\r\nHost: ${new URL(origin).host}\r\nCookie: ${cookie}\r\nOrigin: ${origin}\r\nX-VoaDesk: 1\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
 for(const split of [1,head.length-3,head.length-1,head.length+2]){const request=head+body;assert.match(await raw([request.slice(0,split),request.slice(split)]),/^HTTP\/1.1 200/);}check('fragmented headers and prefetched body preserved');
 assert.match(await raw([head.replace('Content-Length:', 'Host: duplicate\r\nContent-Length:')+body]),/^HTTP\/1.1 403/);check('duplicate headers rejected');
 assert.match(await raw([head.replace('Content-Length:', 'Transfer-Encoding: chunked\r\nContent-Length:')+body]),/^HTTP\/1.1 403/);check('ambiguous body framing rejected');
 assert.equal((await fetch(origin+'/support/native/state')).status,403);check('cookie remains mandatory');
 evidence.result='passed';
}catch(error){evidence.result='failed';evidence.error=error.stack;process.exitCode=1;}
finally{child?.kill();await service.close();await mkdir('artifacts/performance',{recursive:true});await writeFile('artifacts/performance/native-transport.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));}
