import {requestSession,requestLocalTest} from '/session.mjs';
import {createClientSearch} from '/client-search.mjs';
const $=id=>document.getElementById(id);
const normalize=value=>value.toUpperCase().replace(/[\s-]/g,'');
const valid=value=>/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{16}$/.test(normalize(value));
const formatCode=value=>normalize(value).match(/.{1,4}/g)?.join(' ')??'';
const post=(url,value)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Farol-Request':'1'},body:JSON.stringify(value)});
let clients=[],available=false;
let clientIndex=createClientSearch([]);
let suggestions=[],activeSuggestion=-1,clientsLoaded=false,selectedCode=null;
function message(id,text,type=''){$(id).textContent=text;$(id).className='message '+type;}
function showPage(name,focus=true){
  const pages={home:'Visão geral',clients:'Clientes salvos',help:'Ajuda e diagnóstico'};
  if(!pages[name])return;
  closeSearch();
  for(const key of Object.keys(pages))$(key+'-page').hidden=key!==name;
  for(const button of document.querySelectorAll('.nav-item')){
    if(button.dataset.page===name)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  }
  $('page-label').textContent=pages[name];
  if(focus)(name==='home'?$('access-code'):name==='clients'?$('client-search'):$('check-connection')).focus({preventScroll:true});
}
document.querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',()=>showPage(button.dataset.page)));
window.addEventListener('voadesk:home',()=>showPage('home',false));
$('start-local-test').onclick=async()=>{
  const button=$('start-local-test');button.disabled=true;$('local-test-message').hidden=true;
  try{await requestLocalTest();}
  catch{$('local-test-message').hidden=false;message('local-test-message','Não foi possível iniciar o teste local. Tente novamente.','error');}
  finally{button.disabled=false;}
};
for(const id of ['client-code']){
  $(id).addEventListener('input',()=>{$(id).setCustomValidity('');$(id).removeAttribute('aria-invalid');if($(id).value.length<=19)$(id).value=formatCode($(id).value);});
}
function closeSearch(){
  $('access-search-panel').hidden=true;$('access-code').setAttribute('aria-expanded','false');
  $('access-code').removeAttribute('aria-activedescendant');activeSuggestion=-1;
}
function selectClient(item){
  closeSearch();showPage('home',false);selectedCode=normalize(item.code);
  $('access-code').value=formatCode(item.code);$('access-code').setCustomValidity('');$('access-code').removeAttribute('aria-invalid');
  $('clear-access-search').hidden=false;
  message('access-message','Cliente selecionado: '+item.name+'. Solicite o acesso.');
  $('access-search-status').textContent='Cliente selecionado: '+item.name+'. Selecione Solicitar acesso para continuar.';
  (available?$('verify-code'):$('access-code')).focus({preventScroll:true});
}
function activateSuggestion(index){
  activeSuggestion=index;
  for(const [i,option] of [...$('access-results').children].entries())option.setAttribute('aria-selected',String(i===index));
  if(index<0)$('access-code').removeAttribute('aria-activedescendant');
  else{const option=$('access-results').children[index];$('access-code').setAttribute('aria-activedescendant',option.id);option.scrollIntoView({block:'nearest'});}
}
function renderSearch(){
  const query=$('access-code').value.trim();$('clear-access-search').hidden=!query;
  if(!query||selectedCode===normalize(query)){closeSearch();return;}
  if(!clientsLoaded){closeSearch();$('access-search-status').textContent='Clientes salvos indisponíveis. Você pode informar um código completo.';return;}
  const result=clientIndex.search(query,{field:$('access-search-field').value,limit:6});suggestions=result.items;activeSuggestion=-1;
  $('access-search-panel').querySelector('.search-group').textContent=result.total>6?`CLIENTES SALVOS · 6 de ${result.total}`:`CLIENTES SALVOS · ${result.total}`;
  $('show-all-search').hidden=result.total<=6;$('show-all-search').textContent=`Ver todos os ${result.total} resultados`;
  $('access-code').removeAttribute('aria-activedescendant');
  $('access-results').replaceChildren(...result.matches.map(({item,matchedBy},index)=>{
    const option=document.createElement('li'),name=document.createElement('strong'),code=document.createElement('small'),reason=document.createElement('span');
    option.id='access-result-'+index;option.role='option';option.setAttribute('aria-selected','false');
    name.textContent=item.name;code.textContent=formatCode(item.code);reason.className='search-reason';reason.textContent={name:'Encontrado pelo nome',code:'Encontrado pelo código',both:'Encontrado pelo nome e código'}[matchedBy];option.append(name,code,reason);
    option.addEventListener('pointerdown',e=>e.preventDefault());
    option.addEventListener('click',()=>selectClient(item));return option;
  }));
  $('access-search-empty').hidden=result.total>0;
  $('access-search-status').textContent=result.total?`${result.total} cliente${result.total===1?'':'s'} encontrado${result.total===1?'':'s'}.${result.total>6?' Mostrando os primeiros 6. Use Ver todos os resultados para abrir a lista completa.':''}`:'Nenhum cliente salvo encontrado neste filtro.';
  $('access-search-panel').hidden=false;$('access-code').setAttribute('aria-expanded','true');
}
$('access-code').addEventListener('input',()=>{
  selectedCode=null;$('access-code').setCustomValidity('');$('access-code').removeAttribute('aria-invalid');
  if(available)message('access-message','');
  renderSearch();
});
$('access-code').addEventListener('focus',renderSearch);
$('access-search-field').onchange=()=>{selectedCode=null;renderSearch();$('access-code').focus();};
$('show-all-search').onclick=()=>{
  const query=$('access-code').value,field=$('access-search-field').value;
  showPage('clients',false);$('client-search').value=query;$('client-search-field').value=field;renderClients();$('client-search').focus({preventScroll:true});
};
$('access-code').addEventListener('keydown',e=>{
  if(e.isComposing)return;
  if(e.key==='Escape'){e.preventDefault();closeSearch();return;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();if($('access-search-panel').hidden)renderSearch();if(!suggestions.length||$('access-search-panel').hidden)return;
    const index=activeSuggestion<0?(e.key==='ArrowDown'?0:suggestions.length-1):(activeSuggestion+(e.key==='ArrowDown'?1:-1)+suggestions.length)%suggestions.length;
    activateSuggestion(index);
  }else if(e.key==='Enter'&&!$('access-search-panel').hidden&&activeSuggestion>=0){e.preventDefault();selectClient(suggestions[activeSuggestion]);}
  else if(e.key==='Tab')closeSearch();
});
$('access-code').addEventListener('blur',e=>{if(e.relatedTarget!==$('verify-code')&&!e.relatedTarget?.closest('.access-search'))closeSearch();});
$('clear-access-search').onclick=()=>{selectedCode=null;$('access-code').value='';$('access-code').removeAttribute('aria-invalid');if(available)message('access-message','');$('access-search-status').textContent='Busca limpa.';closeSearch();$('clear-access-search').hidden=true;$('access-code').focus();};
document.addEventListener('click',e=>{if(!e.target.closest('.access-search'))closeSearch();});
function renderClients(){
  const filtered=clientIndex.search($('client-search').value,{field:$('client-search-field').value}).items;
  $('client-count').textContent=clients.length||'';
  $('saved-status').textContent=clients.length?'Nenhum cliente encontrado. Tente outro nome ou parte do código.':'Adicione seu primeiro cliente para encontrá-lo aqui na próxima vez.';
  $('client-search-status').textContent=filtered.length+' de '+clients.length+' clientes';
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
      selectClient(item);
    });
    return li;
  }));
}
$('client-search').addEventListener('input',renderClients);
$('client-search-field').onchange=renderClients;
async function loadClients(){
  try{const r=await fetch('/api/saved-clients');if(!r.ok)throw new Error();clients=await r.json();clientIndex=createClientSearch(clients);clientsLoaded=true;renderClients();if(document.activeElement===$('access-code'))renderSearch();}
  catch{clientsLoaded=false;$('saved-status').hidden=false;$('saved-status').textContent='Não foi possível carregar. Feche e reabra o VoaDesk.';}
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
    clients.push(result);clientIndex=createClientSearch(clients);$('client-search').value='';renderClients();$('client-dialog').close();
  }catch(error){message('client-message',error.message||'Serviço indisponível. Tente novamente.','error');}
  finally{$('save-client').disabled=false;}
});
$('access-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!available||$('verify-code').disabled)return;
  if(!valid($('access-code').value)){
    const matches=clientIndex.search($('access-code').value,{field:$('access-search-field').value}).items;
    if(matches.length===1){selectClient(matches[0]);return;}
    message('access-message',matches.length?'Selecione um cliente na lista ou informe o código completo.':'Confira os 16 caracteres do código. Você também pode buscar um cliente salvo.','error');$('access-code').setAttribute('aria-invalid','true');$('access-code').focus();renderSearch();return;
  }
  closeSearch();
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
