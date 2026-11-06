import {requestSession} from '/session.mjs';
const $=id=>document.getElementById(id);
const normalize=value=>value.toUpperCase().replace(/[ -]/g,'');
const valid=value=>/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{16}$/.test(normalize(value));
const formatCode=value=>normalize(value).match(/.{1,4}/g)?.join(' ')??'';
const post=(url,value)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Farol-Request':'1'},body:JSON.stringify(value)});
let clients=[],available=false;
function message(id,text,type=''){$(id).textContent=text;$(id).className='message '+type;}
function showPage(name,focus=true){
  const pages={home:'Visão geral',clients:'Clientes salvos',help:'Ajuda e diagnóstico'};
  if(!pages[name])return;
  for(const key of Object.keys(pages))$(key+'-page').hidden=key!==name;
  for(const button of document.querySelectorAll('.nav-item')){
    if(button.dataset.page===name)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  }
  $('page-label').textContent=pages[name];
  if(focus)(name==='home'?$('access-code'):name==='clients'?$('client-search'):$('check-connection')).focus({preventScroll:true});
}
document.querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',()=>showPage(button.dataset.page)));
window.addEventListener('voadesk:home',()=>showPage('home',false));
for(const id of ['access-code','client-code']){
  $(id).addEventListener('input',()=>{$(id).setCustomValidity('');$(id).removeAttribute('aria-invalid');if($(id).value.length<=19)$(id).value=formatCode($(id).value);});
}
function renderClients(){
  const query=$('client-search').value.trim().toLocaleLowerCase('pt-BR');
  const filtered=clients.filter(item=>item.name.toLocaleLowerCase('pt-BR').includes(query));
  $('client-count').textContent=clients.length||'';
  $('saved-status').textContent=clients.length?'Nenhum cliente encontrado. Tente outro nome.':'Adicione seu primeiro cliente para encontrá-lo aqui na próxima vez.';
  $('saved-status').hidden=filtered.length>0;
  $('saved-clients').replaceChildren(...filtered.map(item=>{
    const li=document.createElement('li'),button=document.createElement('button'),avatar=document.createElement('span'),text=document.createElement('span'),name=document.createElement('strong'),code=document.createElement('small'),arrow=document.createElement('span');
    button.type='button';button.className='client-item';button.setAttribute('aria-pressed','false');
    avatar.className='client-avatar';avatar.textContent=item.name.slice(0,1).toLocaleUpperCase('pt-BR');
    text.className='client-text';name.textContent=item.name;code.textContent=formatCode(item.code);text.append(name,code);
    arrow.className='client-arrow';arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');
    button.append(avatar,text,arrow);li.append(button);
    button.addEventListener('click',()=>{
      document.querySelectorAll('.client-item').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      showPage('home',false);$('access-code').value=formatCode(item.code);$('access-code').setCustomValidity('');$('access-code').focus();
      message('access-message','Cliente selecionado: '+item.name+'. Solicite o acesso.');
    });
    return li;
  }));
}
$('client-search').addEventListener('input',renderClients);
async function loadClients(){
  try{const r=await fetch('/api/saved-clients');if(!r.ok)throw new Error();clients=await r.json();renderClients();}
  catch{$('saved-status').hidden=false;$('saved-status').textContent='Não foi possível carregar. Feche e reabra o VoaDesk.';}
}
function closeDialog(){if(!$('save-client').disabled)$('client-dialog').close();}
$('add-client').onclick=()=>{$('client-form').reset();message('client-message','');$('client-dialog').showModal();$('client-name').focus();};
$('close-dialog').onclick=closeDialog;$('cancel-client').onclick=closeDialog;
$('client-dialog').addEventListener('cancel',e=>{if($('save-client').disabled)e.preventDefault();});
$('client-dialog').addEventListener('close',()=>$('add-client').focus());
$('client-form').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!valid($('client-code').value)){message('client-message','Confira os 16 caracteres do código.','error');$('client-code').setAttribute('aria-invalid','true');$('client-code').focus();return;}
  const name=$('client-name').value.trim();if(!name){message('client-message','Informe o nome do cliente.','error');$('client-name').focus();return;}
  $('save-client').disabled=true;
  try{
    const r=await post('/api/saved-clients',{name,code:normalize($('client-code').value)}),result=await r.json();
    if(!r.ok)throw new Error(result.message||'Não foi possível salvar. Tente novamente.');
    clients.push(result);$('client-search').value='';renderClients();$('client-dialog').close();
  }catch(error){message('client-message',error.message||'Serviço indisponível. Tente novamente.','error');}
  finally{$('save-client').disabled=false;}
});
$('access-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!available||$('verify-code').disabled)return;
  if(!valid($('access-code').value)){message('access-message','Confira os 16 caracteres do código.','error');$('access-code').setAttribute('aria-invalid','true');$('access-code').focus();return;}
  $('verify-code').disabled=true;message('access-message','Enviando solicitação…');
  try{await requestSession(normalize($('access-code').value));}
  catch{message('access-message','Serviço indisponível. Feche e reabra o VoaDesk.','error');}
  finally{$('verify-code').disabled=!available;}
});
$('open-receiver').onclick=async()=>{
  $('open-receiver').disabled=true;message('receiver-message','Abrindo seu código…');
  try{
    const r=await post('/api/receiver/open',{}),data=await r.json();
    if(!r.ok)throw new Error(data.message||'Não foi possível abrir. Tente novamente.');
    message('receiver-message','Confira o código na janela VoaDesk Cliente.','success');
  }catch(e){message('receiver-message',e.message,'error');}
  finally{$('open-receiver').disabled=false;}
};
const heartbeat=setInterval(async()=>{
  try{const r=await post('/api/heartbeat',{});if(!r.ok)throw new Error();}
  catch{clearInterval(heartbeat);available=false;$('verify-code').disabled=$('open-receiver').disabled=true;$('connection-state').textContent='Serviço local encerrado';$('connection-state').dataset.state='offline';message('access-message','Feche e reabra o VoaDesk para continuar.','error');}
},5000);
window.addEventListener('pagehide',()=>clearInterval(heartbeat));
async function init(){
  $('access-code').focus();await loadClients();
  try{
    const r=await fetch('/api/pairing/config');if(!r.ok)throw new Error();const config=await r.json();
    available=config.available;$('verify-code').disabled=!available;$('open-receiver').disabled=!config.receiverAvailable;
    $('connection-state').textContent=available?(config.remote?'Serviço online configurado':'Serviço local disponível'):'Serviço não configurado';
    $('connection-state').dataset.state=available?'ready':'offline';
    document.querySelectorAll('[data-version]').forEach(el=>el.textContent=config.version);
    message('access-message',available?'':'Feche e reabra o VoaDesk para conferir a configuração.');
    if(!config.receiverAvailable)message('receiver-message','Baixe o aplicativo do cliente para receber acesso.');
  }catch{$('open-receiver').disabled=true;message('access-message','Serviço local indisponível. Reabra o VoaDesk.','error');}
}
void init();
