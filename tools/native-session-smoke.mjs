import {createPairingService} from '../src/pairing/service.mjs';
import {DeviceRegistry} from '../src/pairing/devices.mjs';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const dir=await mkdtemp(join(tmpdir(),'voadesk-native-session-')),out=resolve('artifacts/support-local');await mkdir(out,{recursive:true});
const service=await createPairingService({devices:new DeviceRegistry({file:join(dir,'devices.json')}),operatorName:'Técnico de teste local'});
try{const {stdout}=await promisify(execFile)(resolve('.cache/native/SupportClientSmoke.exe'),[service.origin+'/',join(out,'cliente-autorizacao.png'),join(dir,'identity')],{windowsHide:true,timeout:30000,env:{...process.env,VOADESK_TEST_OPERATOR_TOKEN:service.operatorToken}});const evidence={date:new Date().toISOString(),...JSON.parse(stdout.trim())};await writeFile(join(out,'native-session.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));}catch(e){console.log(JSON.stringify({result:'failed',detail:e.stdout?.trim()||e.code}));process.exitCode=1;}finally{await service.close();await rm(dir,{recursive:true,force:true});}
