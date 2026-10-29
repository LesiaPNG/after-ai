/* Copyright 2026 Ачкасова Олеся. SPDX-License-Identifier: GPL-3.0-only */
'use strict';
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(process.env.AIFLOW_PUBLIC_ROOT||path.join(__dirname,'../dist/site'));
const port=Number(process.env.AIFLOW_PORT||47683),host=process.env.AIFLOW_HOST||'0.0.0.0';
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');
const allowed=/^(index\.html|site\.css|LICENSE|COPYRIGHT|updates\/experimental\.json|downloads\/(After-Ai-\d+\.\d+\.\d+-Setup\.exe|SHA256SUMS))$/;
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.exe':'application/vnd.microsoft.portable-executable'};
const server=http.createServer((req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
 let name;try{name=decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\//,'')||'index.html';}catch(_){res.writeHead(400);return res.end();}
 if(name==='health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"product":"After Ai","status":"ok"}');}
 if(!allowed.test(name)){res.writeHead(404);return res.end('Not found');}
 const file=path.join(root,name);fs.stat(file,(err,stat)=>{
  if(err||!stat.isFile()){res.writeHead(404);return res.end('Not found');}
  res.writeHead(200,{'Content-Type':mime[path.extname(name)]||'text/plain; charset=utf-8','Content-Length':stat.size,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'self'; base-uri 'none'; frame-ancestors 'none'",'Cache-Control':name.endsWith('.exe')?'public, max-age=86400':'no-cache'});
  if(req.method==='HEAD')return res.end();const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
 });
});server.listen(port,host,()=>console.log('After Ai download site listening on port '+port));
