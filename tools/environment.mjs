import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { probeEnvironment } from '../src/host/server.mjs';
const environment = await probeEnvironment();
if (process.env.FAROL_PLAYWRIGHT) {
  const { chromium } = await import(pathToFileURL(resolve(process.env.FAROL_PLAYWRIGHT)).href);
  const browser = await chromium.launch({ executablePath: process.env.FAROL_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
  try {
    const cdp = await browser.newBrowserCDPSession();
    const info = await cdp.send('SystemInfo.getInfo');
    environment.browser = browser.version();
    environment.gpu = info.gpu.devices.map(gpu => ({ vendor: gpu.vendorString, device: gpu.deviceString, driverVendor: gpu.driverVendor, driverVersion: gpu.driverVersion, vendorId: gpu.vendorId, deviceId: gpu.deviceId }));
    environment.gpuFeatureStatus = Object.fromEntries(Object.entries(info.gpu.featureStatus ?? {}).filter(([key]) => /video|gpu_compositing/i.test(key)));
  } catch (error) { environment.gpuQuery = error.message; }
  finally { await browser.close(); }
}
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/environment.json', JSON.stringify(environment, null, 2));
console.log(JSON.stringify(environment, null, 2));
