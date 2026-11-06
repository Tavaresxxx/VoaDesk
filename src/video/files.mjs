// Stop-and-wait chunks bound memory and SCTP buffering independently of total file size.
export const CHUNK_SIZE=16384;
export function fileInfo(value){
  if(!value||typeof value.name!=='string'||!value.name||value.name.length>255||/[\\/:\x00-\x1f]/.test(value.name)||!Number.isSafeInteger(value.size)||value.size<0)throw new Error('Arquivo inválido.');
  return value;
}
export function toBase64(buffer){let text='';for(const byte of new Uint8Array(buffer))text+=String.fromCharCode(byte);return btoa(text);}
export function fromBase64(text){if(typeof text!=='string'||text.length>CHUNK_SIZE*4/3+4)throw new Error('Bloco inválido.');const result=Uint8Array.from(atob(text),c=>c.charCodeAt(0));if(result.length>CHUNK_SIZE)throw new Error('Bloco excedido.');return result;}
export function fileRpc(channel,handler=async()=>{throw new Error('Operação indisponível.');}){
  let sequence=0,closed=false,queue=Promise.resolve();const pending=new Map();
  const send=data=>{if(closed||channel.readyState!=='open'||channel.bufferedAmount>262144)throw new Error('Canal de arquivos indisponível.');const payload=JSON.stringify(data);if(new TextEncoder().encode(payload).length>60000)throw new Error('Resposta de arquivos excedida. Abra uma subpasta.');channel.send(payload);};
  const close=()=>{if(closed)return;closed=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Transferência interrompida.'));}pending.clear();channel.removeEventListener('message',message);channel.removeEventListener('close',close);};
  const message=event=>{
    let data;try{if(typeof event.data!=='string'||event.data.length>100000)throw new Error();data=JSON.parse(event.data);if(!Number.isSafeInteger(data.id))throw new Error();}catch{close();channel.close();return;}
    if(data.reply){const p=pending.get(data.id);if(!p)return;pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(new Error(data.error)):p.resolve(data.value);return;}
    if(typeof data.action!=='string'){close();return;}
    // Only a bounded number of requests may await disk IO.
    if(++message.queued>8){close();channel.close();return;}
    queue=queue.then(async()=>{try{if(!closed)send({id:data.id,reply:true,value:await handler(data.action,data.value)});}catch(e){if(!closed)send({id:data.id,reply:true,error:e.message||'Falha na operação de arquivo.'});}finally{message.queued--;}}).catch(close);
  };message.queued=0;
  channel.addEventListener('message',message);channel.addEventListener('close',close);
  return {close,call(action,value={}){return new Promise((resolve,reject)=>{if(pending.size>=8){reject(new Error('Operação em andamento.'));return;}const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Tempo da transferência esgotado.'));},30000);pending.set(id,{resolve,reject,timer});try{send({id,action,value});}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}});}};
}
export async function copyChunks({size,read,write,cancelled=()=>false,progress=()=>{}}){
  if(!Number.isSafeInteger(size)||size<0)throw new Error('Tamanho inválido.');let offset=0;
  while(offset<size){if(cancelled())throw new Error('Transferência cancelada.');const data=new Uint8Array(await read(offset,Math.min(CHUNK_SIZE,size-offset)));if(data.length<1||data.length>CHUNK_SIZE||offset+data.length>size)throw new Error('Arquivo incompleto ou bloco inválido.');await write(data);offset+=data.length;progress(offset,size);}
  if(cancelled())throw new Error('Transferência cancelada.');return offset;
}
