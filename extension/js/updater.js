/* Copyright 2026 Ачкасова Олеся. SPDX-License-Identifier: GPL-3.0-only */
'use strict';
var fs=require('fs'),path=require('path'),crypto=require('crypto'),http=require('http'),https=require('https');
var URL=require('url').URL;
function fail(code){var e=new Error(code);e.code=code;return e;}
function version(value){if(!/^\d+\.\d+\.\d+$/.test(value))throw fail('UPDATE_VERSION');return value.split('.').map(Number);}
function newer(a,b){a=version(a);b=version(b);for(var i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;}
function address(value){var u;try{u=new URL(value);}catch(_){throw fail('UPDATE_ADDRESS');}if(!/^https?:$/.test(u.protocol)||u.username||u.password)throw fail('UPDATE_ADDRESS');return u;}
function fetchBytes(url,limit){return new Promise(function(resolve,reject){
 var u=address(url),transport=u.protocol==='https:'?https:http;
 var request=transport.get(u,function(response){
  if(response.statusCode!==200){response.resume();return reject(fail('UPDATE_NETWORK'));}
  var chunks=[],bytes=0;response.on('data',function(c){bytes+=c.length;if(bytes>limit){request.destroy();reject(fail('UPDATE_SIZE'));}else chunks.push(c);});
  response.on('end',function(){resolve(Buffer.concat(chunks));});response.on('error',function(){reject(fail('UPDATE_NETWORK'));});
 });request.setTimeout(12000,function(){request.destroy();reject(fail('UPDATE_NETWORK'));});request.on('error',function(){reject(fail('UPDATE_NETWORK'));});
});}
function verifyEnvelope(bytes,publicKey){
 try{var e=JSON.parse(bytes.toString('utf8'));if(typeof e.payload!=='string'||typeof e.signature!=='string')throw 0;
  var payload=Buffer.from(e.payload,'base64');if(payload.length>65536||!crypto.verify(null,payload,publicKey,Buffer.from(e.signature,'base64')))throw 0;
  var m=JSON.parse(payload.toString('utf8'));version(m.version);
  if(m.schemaVersion!==1||m.product!=='studio.aiflow.ae'||m.channel!=='experimental'||!m.installer||!/^After-Ai-\d+\.\d+\.\d+-Setup\.exe$/.test(m.installer.file)||!/^[a-f0-9]{64}$/.test(m.installer.sha256)||!Number.isSafeInteger(m.installer.size)||m.installer.size<1||m.installer.size>15*1024*1024)throw 0;
  return m;
 }catch(_){throw fail('UPDATE_SIGNATURE');}
}
function Client(root,options){this.root=root;this.options=options||{};this.config=JSON.parse(fs.readFileSync(path.join(root,'release.json'),'utf8'));this.key=fs.readFileSync(path.join(root,'update-public-key.pem'),'utf8');}
Client.prototype.check=async function(){
 if(!this.config.manifestUrl)throw fail('UPDATE_ADDRESS');
 var url=this.config.manifestUrl;
 // A public, non-secret pointer lets the owner change Anfa's external address
 // without forcing existing users to reinstall the panel.
 if(this.config.discoveryUrl){try{var pointer=JSON.parse((await fetchBytes(this.config.discoveryUrl,4096)).toString('utf8'));if(typeof pointer.manifestUrl==='string')url=address(pointer.manifestUrl).href;}catch(_){/* Use the current signed release while the public server is unavailable. */}}
 var m=verifyEnvelope(await fetchBytes(url,100000),this.key);
 if(!newer(m.version,this.config.version))return {available:false,version:this.config.version};
 var installerUrl=new URL('../downloads/'+encodeURIComponent(m.installer.file),address(url)).href;
 return {available:true,manifest:m,url:installerUrl};
};
Client.prototype.download=async function(update){
 if(!update||!update.available)throw fail('UPDATE_VERSION');
 var m=update.manifest,bytes=await fetchBytes(update.url,m.installer.size);
 if(bytes.length!==m.installer.size||crypto.createHash('sha256').update(bytes).digest('hex')!==m.installer.sha256)throw fail('UPDATE_CHECKSUM');
 var directory=this.options.cacheRoot||path.join(process.env.LOCALAPPDATA,'AIFlowAE','updates');fs.mkdirSync(directory,{recursive:true});
 var destination=path.join(directory,m.installer.file),pending=destination+'.pending';fs.writeFileSync(pending,bytes);fs.renameSync(pending,destination);
 return {file:destination,sha256:m.installer.sha256,version:m.version};
};
Client.prototype.install=function(download){
 if(!download||!/^After-Ai-\d+\.\d+\.\d+-Setup\.exe$/.test(path.basename(download.file)))throw fail('UPDATE_VERSION');
 if(crypto.createHash('sha256').update(fs.readFileSync(download.file)).digest('hex')!==download.sha256)throw fail('UPDATE_CHECKSUM');
 var child=require('child_process').spawn(download.file,[],{detached:true,stdio:'ignore',windowsHide:false});child.on('error',function(){});child.unref();
};
module.exports={Client:Client,newer:newer,verifyEnvelope:verifyEnvelope,fetchBytes:fetchBytes};
