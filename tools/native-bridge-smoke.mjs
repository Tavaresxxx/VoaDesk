import {createPairingService} from '../src/pairing/service.mjs';
import {DeviceRegistry} from '../src/pairing/devices.mjs';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {productionAuth} from './production-auth.mjs';
const production=process.argv.includes('--production');const auth=production?await productionAuth():null;
const dir=await mkdtemp(join(tmpdir(),'voadesk-native-session-')),out=resolve('artifacts/support-local');await mkdir(out,{recursive:true});
const service=production?{origin:auth.origin,operatorToken:auth.token,close:async()=>{}}:await createPairingService({devices:new DeviceRegistry({file:join(dir,'devices.json')}),operatorName:'Técnico de teste local'});
try{const {stdout}=await promisify(execFile)(resolve('.cache/native/NativeBridgeSmoke.exe'),[service.origin+'/',join(dir,'identity')],{windowsHide:true,timeout:30000,env:{...process.env,VOADESK_TEST_OPERATOR_TOKEN:service.operatorToken}});const evidence={date:new Date().toISOString(),scope:production?'production-https-native-sink':'local-http-native-sink',crossComputerValidated:false,...JSON.parse(stdout.trim())};const target=production?resolve('artifacts/production-qa'):out;await mkdir(target,{recursive:true});await writeFile(join(target,'native-bridge.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));}catch(e){console.log(JSON.stringify({result:'failed',detail:e.stdout?.trim()||e.code}));process.exitCode=1;}finally{await service.close();await rm(dir,{recursive:true,force:true});}
