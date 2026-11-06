import test from 'node:test';
import assert from 'node:assert/strict';
import {CHUNK_SIZE,copyChunks,fileInfo,toBase64,fromBase64,fileRpc} from '../src/video/files.mjs';
test('transferência por blocos mantém tamanho, Unicode e memória limitada',async()=>{
 const source=new Uint8Array(CHUNK_SIZE*9+71).map((_,i)=>i%251),received=[];
 const count=await copyChunks({size:source.length,read:(at,size)=>source.slice(at,at+size),write:data=>received.push(...fromBase64(toBase64(data)))});
 assert.equal(count,source.length);assert.deepEqual(new Uint8Array(received),source);assert.equal(fileInfo({name:'ação.zip',size:12*1024**3}).size,12*1024**3);
 for(const size of [-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>fileInfo({name:'x',size}));assert.throws(()=>fileInfo({name:'../x',size:1}));
});
test('arquivo vazio, leitura truncada, bloco excessivo e cancelamento',async()=>{
 let writes=0;await copyChunks({size:0,read:()=>assert.fail(),write:()=>writes++});assert.equal(writes,0);
 await assert.rejects(copyChunks({size:1,read:()=>new Uint8Array(),write:()=>{}}),/incompleto/);
 await assert.rejects(copyChunks({size:CHUNK_SIZE*2,read:()=>new Uint8Array(CHUNK_SIZE+1),write:()=>{}}),/inválido/);
 await assert.rejects(copyChunks({size:2,read:()=>new Uint8Array(2),write:()=>{},cancelled:()=>true}),/cancelada/);
});
class Channel extends EventTarget {readyState='open';bufferedAmount=0;send(data){queueMicrotask(()=>this.other.dispatchEvent(new MessageEvent('message',{data})));}close(){this.readyState='closed';this.dispatchEvent(new Event('close'));}}
test('canal de arquivos confirma blocos em ordem, propaga erro e encerra requisições pendentes',async()=>{
 const a=new Channel(),b=new Channel();a.other=b;b.other=a;const server=fileRpc(b,async(action,value)=>{if(action==='error')throw new Error('Disco cheio');if(action==='hold')return new Promise(()=>{});return value;}),client=fileRpc(a);
 assert.deepEqual(await client.call('write',{offset:123}),{offset:123});await assert.rejects(client.call('error'),/Disco cheio/);const pending=client.call('hold');client.close();await assert.rejects(pending,/interrompida/);server.close();
});
