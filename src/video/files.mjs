// At most four chunks are in flight. Disk operations retain channel order.
export const CHUNK_SIZE=16384;
export const FILE_WINDOW=4;
function encodePacket(data){
  const chunk=data.value?.chunk;
  if(!(chunk instanceof Uint8Array))return JSON.stringify(data);
  if(chunk.byteLength>CHUNK_SIZE)throw new Error('Bloco excedido.');
  const header=new TextEncoder().encode(JSON.stringify({...data,value:{...data.value,chunk:undefined},binary:true}));
  if(header.byteLength>4096)throw new Error('Cabeçalho excedido.');
  const frame=new Uint8Array(4+header.byteLength+chunk.byteLength);
  new DataView(frame.buffer).setUint32(0,header.byteLength);frame.set(header,4);frame.set(chunk,4+header.byteLength);return frame;
}
function decodePacket(value){
  if(typeof value==='string'){if(value.length>100000)throw new Error();const result=JSON.parse(value);if(result.binary)throw new Error();return result;}
  const bytes=value instanceof ArrayBuffer?new Uint8Array(value):ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):null;
  if(!bytes||bytes.byteLength<4||bytes.byteLength>CHUNK_SIZE+4100)throw new Error();
  const length=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0);
  if(length<1||length>4096||length+4>bytes.byteLength)throw new Error();
  const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(4,4+length)));
  if(data.binary!==true||!data.value||typeof data.value!=='object'||bytes.byteLength-4-length>CHUNK_SIZE)throw new Error();
  data.value.chunk=bytes.slice(4+length);return data;
}
export function fileInfo(value){
  if(!value||typeof value.name!=='string'||!value.name||value.name.length>255||/[\\/:\x00-\x1f]/.test(value.name)||!Number.isSafeInteger(value.size)||value.size<0)throw new Error('Arquivo inválido.');
  return value;
}
export function toBase64(buffer){let text='';for(const byte of new Uint8Array(buffer))text+=String.fromCharCode(byte);return btoa(text);}
export function fromBase64(text){if(typeof text!=='string'||text.length>CHUNK_SIZE*4/3+4)throw new Error('Bloco inválido.');const result=Uint8Array.from(atob(text),c=>c.charCodeAt(0));if(result.length>CHUNK_SIZE)throw new Error('Bloco excedido.');return result;}
export function fileRpc(channel,handler=async()=>{throw new Error('Operação indisponível.');}){
  channel.binaryType='arraybuffer';
  let sequence=0,closed=false,queue=Promise.resolve();const pending=new Map();
  const send=data=>{if(closed||channel.readyState!=='open')throw new Error('Canal de arquivos indisponível.');const payload=encodePacket(data),length=typeof payload==='string'?new TextEncoder().encode(payload).length:payload.byteLength;if(length>60000)throw new Error('Resposta de arquivos excedida. Abra uma subpasta.');if(channel.bufferedAmount+length>262144)throw new Error('Canal de arquivos ocupado.');channel.send(payload);};
  const close=()=>{if(closed)return;closed=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Transferência interrompida.'));}pending.clear();channel.removeEventListener('message',message);channel.removeEventListener('close',close);};
  const message=event=>{
    let data;try{data=decodePacket(event.data);if(!data||!Number.isSafeInteger(data.id)||data.id<1)throw new Error();}catch{close();channel.close();return;}
    if(data.reply){const p=pending.get(data.id);if(!p)return;pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(new Error(data.error)):p.resolve(data.value);return;}
    if(typeof data.action!=='string'){close();return;}
    // Only a bounded number of requests may await disk IO.
    if(++message.queued>8){close();channel.close();return;}
    queue=queue.then(async()=>{try{if(!closed)send({id:data.id,reply:true,value:await handler(data.action,data.value)});}catch(e){if(!closed)send({id:data.id,reply:true,error:e.message||'Falha na operação de arquivo.'});}finally{message.queued--;}}).catch(close);
  };message.queued=0;
  channel.addEventListener('message',message);channel.addEventListener('close',close);
  return {close,call(action,value={}){return new Promise((resolve,reject)=>{if(pending.size>=8){reject(new Error('Operação em andamento.'));return;}const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Tempo da transferência esgotado.'));},30000);pending.set(id,{resolve,reject,timer});try{send({id,action,value});}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}});}};
}
export async function copyChunks({size,read,write,cancelled=()=>false,progress=()=>{},window=1}){
  if(!Number.isSafeInteger(size)||size<0)throw new Error('Tamanho inválido.');let offset=0;
  if(!Number.isInteger(window)||window<1||window>FILE_WINDOW)throw new Error('Janela inválida.');
  if(window>1){
    // Wait for every operation in a batch before cleanup/cancel can touch a file.
    const settle=async tasks=>{const results=await Promise.allSettled(tasks);const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;return results.map(r=>r.value);};
    while(offset<size){
      if(cancelled())throw new Error('Transferência cancelada.');
      const tasks=[];let next=offset;
      while(next<size&&tasks.length<window){const at=next,length=Math.min(CHUNK_SIZE,size-at);tasks.push(Promise.resolve().then(()=>read(at,length)).then(value=>{const bytes=new Uint8Array(value);if(bytes.length!==length)throw new Error('Arquivo incompleto ou bloco inválido.');return bytes;}));next+=length;}
      const chunks=await settle(tasks);
      if(cancelled())throw new Error('Transferência cancelada.');
      await settle(chunks.map(data=>Promise.resolve().then(()=>{if(cancelled())throw new Error('Transferência cancelada.');return write(data);})));offset=next;progress(offset,size);
    }
    if(cancelled())throw new Error('Transferência cancelada.');return offset;
  }
  while(offset<size){if(cancelled())throw new Error('Transferência cancelada.');const data=new Uint8Array(await read(offset,Math.min(CHUNK_SIZE,size-offset)));if(data.length<1||data.length>CHUNK_SIZE||offset+data.length>size)throw new Error('Arquivo incompleto ou bloco inválido.');await write(data);offset+=data.length;progress(offset,size);}
  if(cancelled())throw new Error('Transferência cancelada.');return offset;
}
