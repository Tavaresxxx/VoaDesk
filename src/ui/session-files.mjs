import {fileRpc,fileInfo,copyChunks,toBase64,fromBase64} from '/video/files.mjs';
const $=id=>document.getElementById(id),status=text=>$('files-status').textContent=text;
let rpc=null,path='',parent=null,transfer=null,epoch=0;
function lock(yes){for(const button of $('files-panel').querySelectorAll('button,input'))button.disabled=yes;$('files-cancel').disabled=!yes;$('files-close').disabled=false;}
function progress(done,size){status(`${transfer?.name??'Arquivo'} · ${size?Math.floor(done/size*100):100}% · ${(done/1048576).toFixed(1)} / ${(size/1048576).toFixed(1)} MB`);}
async function browse(next='',offset=0){
 if(!rpc||transfer)return;const current=++epoch,active=rpc,draft=$('files-path').value;status('Abrindo pasta…');
 try{const listing=await active.call('list',{path:next,offset});if(current!==epoch||rpc!==active)return;path=listing.path;parent=listing.parent;if($('files-path').value===draft)$('files-path').value=path;$('files-up').disabled=parent==null;
  const entries=[...listing.entries].sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name));
  const rows=entries.map(item=>{const row=document.createElement('li'),button=document.createElement('button');button.type='button';button.textContent=(item.directory?'▸ ':'↓ ')+item.name;button.title=item.directory?'Abrir pasta':'Copiar para este computador';button.onclick=()=>item.directory?void browse(item.path):void download(item);row.append(button);return row;});
  $('files-more')?.remove();if(offset)$('files-list').append(...rows);else $('files-list').replaceChildren(...rows);
  if(listing.hasMore){const more=document.createElement('li'),button=document.createElement('button');more.id='files-more';button.type='button';button.textContent='Carregar mais arquivos';button.onclick=()=>void browse(listing.path,listing.nextOffset);more.append(button);$('files-list').append(more);}
  status($('files-list').children.length-(listing.hasMore?1:0)+' itens carregados. Clique em um arquivo para recebê-lo.');
 }catch(e){if(current===epoch)status(e.message);}
}
async function download(item){
 if(transfer||!rpc)return;const active=rpc,current=epoch;let writer,id;transfer={name:item.name,cancelled:false};const task=transfer;lock(true);
 try{
  fileInfo(item);if(!window.showSaveFilePicker)throw new Error('O seletor de salvamento está indisponível. Atualize o Microsoft Edge WebView2 Runtime e reabra o VoaDesk.');
  // Save picker must run directly in the click gesture, before any network await.
  const handle=await window.showSaveFilePicker({suggestedName:item.name});if(task.cancelled||rpc!==active||epoch!==current)throw new Error('Transferência cancelada.');
  writer=await handle.createWritable();const info=fileInfo(await active.call('open-read',{path:item.path}));id=info.id;
  await copyChunks({size:info.size,cancelled:()=>task.cancelled||rpc!==active,read:async()=>fromBase64((await active.call('read',{id})).chunk),write:bytes=>writer.write(bytes),progress});
  await active.call('finish',{id});id=null;await writer.close();writer=null;status('Arquivo recebido: '+item.name);
 }catch(e){status(e.name==='AbortError'?'Transferência cancelada.':e.message);}
 finally{if(id)await active.call('cancel',{id}).catch(()=>{});await writer?.abort().catch(()=>{});if(transfer===task){transfer=null;lock(false);}}
}
async function upload(file){
 if(transfer||!rpc||!file)return;const active=rpc;let id;transfer={name:file.name,cancelled:false};const task=transfer;lock(true);
 try{
  fileInfo(file);const opened=await active.call('open-write',{name:file.name,size:file.size,directory:path});id=opened.id;
  await copyChunks({size:file.size,cancelled:()=>task.cancelled||rpc!==active,read:(offset,length)=>file.slice(offset,offset+length).arrayBuffer(),write:bytes=>active.call('write',{id,chunk:toBase64(bytes)}),progress});
  await active.call('finish',{id});id=null;status('Arquivo enviado para '+opened.path);
 }catch(e){status(e.message);}finally{if(id)await active.call('cancel',{id}).catch(()=>{});if(transfer===task){transfer=null;lock(false);}}
}
export function attachFiles(channel){rpc?.close();rpc=fileRpc(channel);$('session-files').disabled=false;}
export function closeFiles(){epoch++;if(transfer)transfer.cancelled=true;rpc?.close();rpc=null;path='';parent=null;$('files-list').replaceChildren();$('files-panel').hidden=true;$('session-files').disabled=true;}
$('session-files').onclick=()=>{$('files-panel').hidden=!$('files-panel').hidden;if(!$('files-panel').hidden&&!transfer)void browse(path);};
$('files-close').onclick=()=>{$('files-panel').hidden=true;};
$('files-up').onclick=()=>void browse(parent??'');
$('files-open').onclick=()=>void browse($('files-path').value);
$('files-upload').onclick=()=>{if(!transfer)$('files-input').click();};
$('files-input').onchange=()=>{const file=$('files-input').files[0];$('files-input').value='';void upload(file);};
$('files-cancel').onclick=()=>{if(transfer){transfer.cancelled=true;status('Cancelando transferência…');}};
