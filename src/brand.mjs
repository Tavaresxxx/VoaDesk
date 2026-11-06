import {readFileSync} from 'node:fs';
const encoded=readFileSync(new URL('../assets/Logo.png.base64',import.meta.url),'utf8').trim();
const png=Buffer.from(encoded,'base64'),width=png.readUInt32BE(16),height=png.readUInt32BE(20);
// The same exact artwork crops used by the Windows asset builder.
export function brandSvg(symbol=false){
  const x=Math.floor(width*.037),y=Math.floor(height*.205),w=Math.floor(width*(symbol ? .263 : .93)),h=Math.floor(height*.60);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}"><image width="${width}" height="${height}" href="data:image/png;base64,${encoded}"/></svg>`;
}
