import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
export async function productionAuth() {
  const file=resolve('.runtime/operator-settings.json');
  const values=JSON.parse(await readFile(file,'utf8'));
  const {stdout}=await promisify(execFile)(resolve('.cache/native/OperatorSettings.exe'),['--read',file],{windowsHide:true,timeout:5000});
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(stdout))throw new Error('Credencial local indisponível.');
  const origin=new URL(values.server).origin;
  if(origin!=='https://voadesk.onrender.com')throw new Error('Destino de produção inesperado; configuração preservada.');
  return {origin,token:stdout};
}
