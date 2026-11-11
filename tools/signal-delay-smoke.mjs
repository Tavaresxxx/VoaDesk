import http from 'node:http';
import {createPairingService} from '../src/pairing/service.mjs';
import {DeviceRegistry} from '../src/pairing/devices.mjs';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const dir=await mkdtemp(join(tmpdir(),'voadesk-drop-')),service=await createPairingService({devices:new DeviceRegistry({file:join(dir,'devices.json')})});
const delayMs=Number(process.argv[2]||1800);let armed=false,held=false,delays=0;
const proxy=http.createServer((req,res)=>{
 if(req.url==='/__test/arm-delay'){armed=true;res.end('ok');return;}
 if(req.url==='/__test/held'){res.end(String(held));return;}
 const headers={...req.headers,host:new URL(service.origin).host};if(headers.origin)headers.origin=service.origin;
 const upstream=http.request(service.origin+req.url,{method:req.method,headers},response=>{
  if(req.url==='/v3/client/events'){
   res.writeHead(response.statusCode,response.headers);res.flushHeaders();let paused=false,buffer=[];
   response.on('data',chunk=>{if(armed&&!paused){armed=false;held=paused=true;delays++;setTimeout(()=>{paused=false;held=false;if(!res.destroyed)for(const value of buffer)res.write(value);buffer=[];},delayMs);}if(paused)buffer.push(chunk);else if(!res.destroyed)res.write(chunk);});
   response.on('end',()=>res.end());res.on('close',()=>upstream.destroy());return;
  }
  if(req.url==='/v3/client/commands'&&armed){armed=false;held=true;delays++;let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>setTimeout(()=>{res.writeHead(response.statusCode,{'Content-Type':'application/json'});res.end(body);held=false;},delayMs));}
  else{res.writeHead(response.statusCode,response.headers);response.pipe(res);}
 });upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
});
await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
const result={scope:'real-ClientWindow-native-guard-with-delayed-local-signaling',osInputInjected:false};
try{const run=await promisify(execFile)(resolve('.cache/native/SignalDelaySmoke.exe'),[`http://127.0.0.1:${proxy.address().port}/`,join(dir,'identity')],{windowsHide:true,timeout:30000,env:{...process.env,VOADESK_TEST_OPERATOR_TOKEN:service.operatorToken,VOADESK_DROP_DELAY_MS:String(delayMs),VOADESK_DROP_EXPECT_FORBIDDEN:String(false)}});result.test=JSON.parse(run.stdout.trim());result.probe=JSON.parse(run.stderr.trim());result.delays=delays;if(result.probe.after!==200||delayMs>1200&&!result.probe.inputPaused)throw new Error('Recovery regression');result.result='passed';}
catch(error){result.result='failed-to-reproduce';result.stdout=error.stdout;result.stderr=error.stderr;result.error=error.message;process.exitCode=1;}
finally{proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));await service.close();await rm(dir,{recursive:true,force:true});await mkdir('artifacts/drop-validation',{recursive:true});await writeFile('artifacts/drop-validation/signal-delay-'+delayMs+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
