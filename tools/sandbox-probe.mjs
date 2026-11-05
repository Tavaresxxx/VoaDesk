import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
const { chromium }=await import(pathToFileURL(resolve(process.env.FAROL_PLAYWRIGHT)).href);
const evidence={date:new Date().toISOString(),scope:'browser-test-environment',requestedChromiumSandbox:true};
let browser;
let timer;
try {await Promise.race([(async()=>{browser=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true,chromiumSandbox:true,timeout:12000});const page=await browser.newPage();await page.goto('about:blank');evidence.result='started';evidence.version=browser.version();})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('SandboxUnavailable')),14000);})]);}
catch(error){evidence.result='unavailable-in-executor';evidence.errorType=error.name;}
finally{clearTimeout(timer);if(browser)await Promise.race([browser.close().catch(()=>{}),new Promise(r=>setTimeout(r,1000))]);await mkdir('artifacts/voadesk',{recursive:true});await writeFile('artifacts/voadesk/sandbox-probe.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));}
