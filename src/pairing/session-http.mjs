import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readJson, RequestError } from '../http-guards.mjs';
import { createHash } from 'node:crypto';
export function sessionRouter(hub, { root, isOperator, enabled, allow = () => true }) {
  const budget = token => { if(!allow('session:'+createHash('sha256').update(token).digest('hex')))throw new RequestError(429,'RATE_LIMIT'); };
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  return async(req,res,path,bearer)=>{
    if(!path.startsWith('/v3/')&&!path.startsWith('/support'))return false;
    if(!enabled){json(res,503,{message:'Sessões indisponíveis: origem HTTPS e registro de dispositivos são necessários.'});return true;}
    try {
      if(req.headers.host!==hub.host)throw new Error('DENIED');
      const origin=hub.origin??'http://'+hub.host;
      if(path==='/support/bootstrap'&&req.method==='GET'){
        if(req.headers.host!==hub.host)throw new Error('DENIED');
        const token=hub.redeem(new URL(req.url,origin).searchParams.get('ticket'));
        res.writeHead(303,{Location:'/support/','Set-Cookie':'voadesk_capture='+token+'; HttpOnly; SameSite=Strict; Path=/support'+(origin.startsWith('https:')?'; Secure':''),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();return true;
      }
      if(path.startsWith('/support')){
        if(req.headers.host!==hub.host)throw new Error('DENIED');
        const token=String(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('voadesk_capture='))?.slice(16);
        const s=hub.browser(token);
        if(path!=='/support/end')budget(token);
        if(req.method==='GET'&&['/support/','/support/capture.mjs','/support/shared.mjs','/support/quality.mjs','/support/stats.mjs','/support/profiles.mjs'].includes(path)){
          const names={'/support/':['capture.html','text/html'],'/support/capture.mjs':['capture.mjs','text/javascript'],'/support/shared.mjs':['peer.mjs','text/javascript'],'/support/quality.mjs':['quality.mjs','text/javascript'],'/support/stats.mjs':['stats.mjs','text/javascript'],'/support/profiles.mjs':['profiles.mjs','text/javascript']};
          const [name,type]=names[path];res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",'Referrer-Policy':'no-referrer'});res.end(readFileSync(join(root,'src/video',name)));return true;
        }
        if(req.method==='GET'&&path==='/support/state'){json(res,200,hub.public(s));return true;}
        if(req.method!=='POST'||req.headers.origin!==origin||req.headers['x-voadesk']!=='1')throw new Error('DENIED');
        const payload=await readJson(req, res, path==='/support/signal'?110000:2048);
        if(path==='/support/signal')hub.signal(s,'capture',payload);
        else if(path==='/support/end')hub.end(s,'stopped');
        else if(path==='/support/input'){if(payload.type!=='release'&&payload.permissionRevision!==s.permissionRevision)throw new Error('INVALID');hub.input(s,payload);}
        else if(path==='/support/stats'){s.stats={};for(const field of ['capturedFps','encodedFps','encodeMs','bitrateMbps','width','height','rttMs','qualityLimitation','encoder','powerEfficientEncoder']){const v=payload[field];if(typeof v==='number'&&Number.isFinite(v)||typeof v==='boolean'||typeof v==='string'&&v.length<100)s.stats[field]=v;}if(s.state==='approved')s.state='active';}
        else throw new Error('INVALID');
        json(res,200,{ok:true});return true;
      }
      if(req.headers.origin)throw new Error('DENIED');
      if(path==='/v3/operator/request'){if(!isOperator(bearer))throw new Error('DENIED');}
      else if(path.startsWith('/v3/client/')){if(!hub.owner(bearer))throw new Error('DENIED');}
      else hub.technician(bearer);
      if(!['/v3/client/decision','/v3/operator/end'].includes(path))budget(bearer);
      if(req.method==='GET'&&path==='/v3/client/state'){const s=hub.client(bearer);json(res,200,s?hub.public(s):{state:'idle'});return true;}
      if(req.method==='GET'&&path==='/v3/client/commands'){json(res,200,hub.commands(bearer));return true;}
      if(req.method!=='POST')throw new Error('INVALID');
      const payload=await readJson(req,res,path==='/v3/operator/signal'?110000:2048);
      if(path==='/v3/client/decision'&&!['end','deny'].includes(payload.permission))budget(bearer);
      if(path==='/v3/operator/request'){if(!isOperator(bearer))throw new Error('DENIED');json(res,201,hub.request(payload.code));return true;}
      if(path==='/v3/client/decision'){json(res,200,hub.decide(bearer,payload.id,payload.permission));return true;}
      const s=hub.technician(bearer);
      if(path==='/v3/operator/state')json(res,200,hub.public(s));
      else if(path==='/v3/operator/signal'){hub.signal(s,'tech',payload);json(res,200,{ok:true});}
      else if(path==='/v3/operator/end'){hub.end(s,'stopped');json(res,200,{ok:true});}
      else throw new Error('INVALID');
    }catch(error){json(res,error instanceof RequestError?error.status:error.message==='DENIED'?403:error.message==='BUSY'?409:400,{message:({DENIED:'Permissão inválida ou sessão encerrada.',BUSY:'Já existe um atendimento em andamento.',OFFLINE:'Cliente offline. Abra o aplicativo do cliente.'})[error.message]??'Não foi possível concluir a solicitação.'});}
    return true;
  };
}
