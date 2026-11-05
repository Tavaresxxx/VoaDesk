import { createHost, openApp } from '../src/host/server.mjs';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const dataDir=resolve('.cache/window-smoke-'+Date.now());await mkdir(dataDir,{recursive:true});
const host=await createHost({dataDir,idleTimeout:0});const edge=openApp(host.bootstrapUrl,dataDir);
const evidence={date:new Date().toISOString(),scope:'own-application-window-properties'};
try {
  const result=await new Promise((ok,fail)=>{const p=spawn(resolve('.cache/native/WindowSmoke.exe'),[String(edge.pid)],{windowsHide:true});let stdout='';p.stdout.on('data',c=>stdout+=c);p.on('error',fail);p.on('close',code=>{if(code!==0){evidence.details=JSON.parse(stdout.trim());evidence.edgeExited=edge.exitCode;fail(new Error('Identidade da janela não confirmada.'));}else ok(JSON.parse(stdout.trim()));});});
  Object.assign(evidence,result);evidence.result='passed';
} catch(error) {evidence.result='not-confirmed';evidence.failure=error.message;process.exitCode=1;}
finally {await host.close();if(edge.exitCode==null)edge.kill();await mkdir('artifacts/voadesk',{recursive:true});await writeFile('artifacts/voadesk/window-smoke.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));}
