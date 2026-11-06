// Local release preparation only. Does not publish, install, or execute the package.
import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPrivateKey,createPublicKey,createHash,sign} from 'node:crypto';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8')),file=resolve(process.argv[2]??join(root,'dist/VoaDeskCliente.exe'));
const privateKey=createPrivateKey(await readFile(join(root,'.runtime/update-signing-key.pem')));
const pub=createPublicKey(privateKey).export({format:'jwk'}),xml=await readFile(join(root,'assets/update-public.xml'),'utf8');
if(!xml.includes(Buffer.from(pub.n,'base64url').toString('base64')))throw new Error('A chave não corresponde à chave pública incorporada no cliente.');
const bytes=await readFile(file);if(bytes[0]!==77||bytes[1]!==90||bytes.length>40000000)throw new Error('Executável inválido.');
// Build package.json, ProductVersion.cs and CurrentVersion together before preparing a release.
const source=await readFile(join(root,'native/ClientUpdate.cs'),'utf8'),versionSource=await readFile(join(root,'native/ProductVersion.cs'),'utf8');
if(!source.includes('CurrentVersion="'+pkg.version+'"')||!versionSource.includes('AssemblyFileVersion("'+pkg.version+'.0")'))throw new Error('Versões de build divergentes.');
const payload=Buffer.from(JSON.stringify({version:pkg.version,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),expires:new Date(Date.now()+7*86400000).toISOString()}));
const dir=join(root,'.runtime/updates');await mkdir(dir,{recursive:true});await copyFile(file,join(dir,'client.exe'));
await writeFile(join(dir,'manifest.json'),JSON.stringify({payload:payload.toString('base64'),signature:sign('RSA-SHA256',payload,privateKey).toString('base64')}));
console.log('Atualização local '+pkg.version+' preparada. Nenhum serviço publicado ou cliente atualizado.');
