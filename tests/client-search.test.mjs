import test from 'node:test';
import assert from 'node:assert/strict';
import {searchClients,createClientSearch} from '../src/ui/client-search.mjs';
const entries = [
  {id: '1', name: 'São José — Recepção', code: '2345ABCD6789EFGH'},
  {id: '2', name: 'Oficina Ação', code: 'ABCD2345EFGH6789'},
  {id: '3', name: 'São José', code: '6789EFGH2345ABCD'},
  {id: '4', name: '<img src=x onerror=alert(1)>', code: '3333333333333333'}
];
const ids = query => searchClients(entries, query).map(item => item.id);
test('busca encontra nomes sem acentos, Unicode decomposto e termos em campos distintos', () => {
  assert.deepEqual(ids('SAO JOSE'), ['3', '1']);
  assert.deepEqual(ids('ac\u0327a\u0303o'), ['2']);
  assert.deepEqual(ids('recepcao 2345'), ['1']);
  assert.deepEqual(ids('  jose  '), ['1', '3']);
  assert.deepEqual(ids('não existe'), []);
});
test('busca reconhece código parcial ou agrupado sem confundir separadores com consulta vazia', () => {
  assert.deepEqual(ids('2345-abcd 6789-efgh'), ['1']);
  assert.deepEqual(ids('abcd'), ['2', '1', '3']);
  assert.deepEqual(ids('3333 3333 3333 3333'), ['4']);
  assert.deepEqual(ids('---'), []);
  assert.deepEqual(ids(''), ['1', '2', '3', '4']);
});
test('ranking é estável, não altera agenda e trata texto parecido com HTML literalmente', () => {
  const before = JSON.stringify(entries);
  assert.deepEqual(ids('são josé'), ['3', '1']);
  assert.deepEqual(ids('<img'), ['4']);
  const result = searchClients(entries, ''); result.reverse();
  assert.equal(JSON.stringify(entries), before);
});

test('índice separa nome e código, explica a correspondência e conta todos os resultados antes do limite', () => {
  const index=createClientSearch(entries);
  assert.deepEqual(index.search('2345',{field:'name'}).items,[]);
  assert.deepEqual(index.search('jose',{field:'code'}).items,[]);
  assert.equal(index.search('recepcao').matches[0].matchedBy,'name');
  assert.equal(index.search('2345-abcd 6789-efgh').matches[0].matchedBy,'code');
  assert.equal(index.search('recepcao 2345').matches[0].matchedBy,'both');
  const limited=index.search('abcd',{limit:1});
  assert.equal(limited.total,3);assert.equal(limited.items.length,1);assert.equal(limited.items[0].id,'2');
  assert.equal(index.search('abcd',{limit:0}).items.length,0);
  assert.throws(()=>index.search('',{field:'unknown'}),TypeError);
});

test('consultas reutilizam snapshot de mil contatos e uma nova agenda exige reconstrução explícita', () => {
  let reads=0;
  const source=Array.from({length:1000},(_,i)=>({id:String(i),get name(){reads++;return 'Cliente '+i;},get code(){reads++;return '2345ABCD'+String(i).padStart(8,'2');}}));
  const index=createClientSearch(source),initialReads=reads;
  assert.equal(initialReads,2000);
  for(let i=0;i<30;i++)assert.equal(index.search('cliente',{limit:6}).total,1000);
  assert.equal(reads,initialReads);
  const agenda=[{id:'a',name:'Nome original',code:'2345ABCD6789EFGH'}],snapshot=createClientSearch(agenda);
  agenda[0].name='Nome novo';
  assert.equal(snapshot.search('original').items[0].name,'Nome original');
  assert.equal(snapshot.search('novo').total,0);
  assert.equal(createClientSearch(agenda).search('novo').total,1);
});
