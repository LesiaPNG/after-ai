/* Copyright 2026 LesiaPNG (Ачкасова Олеся). SPDX-License-Identifier: GPL-3.0-only */
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
process.on('uncaughtException',function(){console.error('Release build failed. Check the documented build prerequisites and signing-key contract.');process.exit(1);});
const root=path.resolve(__dirname,'..'),pkg=require('../package.json');
function arg(name,fallback){const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];}
const manifestUrl=arg('--manifest-url','https://raw.githubusercontent.com/LesiaPNG/after-ai/main/updates/experimental.json');
const discoveryUrl=arg('--discovery-url','https://raw.githubusercontent.com/LesiaPNG/after-ai/main/updates/location.json');
for(const value of [manifestUrl,discoveryUrl].filter(Boolean)){const u=new URL(value);if(!/^https?:$/.test(u.protocol)||u.username||u.password)throw Error('Invalid public update URL');}
const keyFile=arg('--signing-key',process.env.AIFLOW_SIGNING_KEY_FILE||path.join(process.env.LOCALAPPDATA,'AIFlowRelease','signing-private.pem'));
fs.mkdirSync(path.dirname(keyFile),{recursive:true});
if(!fs.existsSync(keyFile)){const keys=crypto.generateKeyPairSync('ed25519');fs.writeFileSync(keyFile,keys.privateKey.export({type:'pkcs8',format:'pem'}),{flag:'wx',mode:0o600});}
// Signing keys are consumed only inside this process; never returned or logged.
const privateKey=crypto.createPrivateKey(fs.readFileSync(keyFile)),publicKey=crypto.createPublicKey(privateKey).export({type:'spki',format:'pem'});
const publicFile=path.join(root,'extension','update-public-key.pem');
if(fs.existsSync(publicFile)&&fs.readFileSync(publicFile,'utf8')!==publicKey)throw Error('Signing key does not match the published update key');
fs.writeFileSync(publicFile,publicKey);
fs.writeFileSync(path.join(root,'extension','release.json'),JSON.stringify({product:'studio.aiflow.ae',version:pkg.version,channel:'experimental',manifestUrl,discoveryUrl},null,2)+'\n');
const release=path.join(root,'dist','releases',pkg.version),stage=path.join(root,'dist','.staging',String(Date.now())),payload=path.join(stage,'payload');
fs.mkdirSync(release,{recursive:true});fs.mkdirSync(payload,{recursive:true});
const files=['index.html','panel.css','CSXS/manifest.xml','js/cep.js','js/panel.js','js/rules.js','js/backend.js','js/updater.js','jsx/host.jsx','jsx/json2.jsx','worker/openrouter.ps1','release.json','update-public-key.pem','THIRD_PARTY.md'];
for(const rel of files){const target=path.join(payload,rel);fs.mkdirSync(path.dirname(target),{recursive:true});if(rel==='CSXS/manifest.xml'||rel==='index.html')fs.writeFileSync(target,fs.readFileSync(path.join(root,'extension',rel),'utf8').replace(/0\.0\.1/g,pkg.version));else fs.copyFileSync(path.join(root,'extension',rel),target);}
for(const rel of ['LICENSE','COPYRIGHT'])fs.copyFileSync(path.join(root,rel),path.join(payload,rel));
const zip=path.join(stage,'payload.zip');
function literal(value){return "'"+value.replace(/'/g,"''")+"'";}
function run(command,args){const result=cp.spawnSync(command,args,{encoding:'utf8',windowsHide:true});if(result.status!==0){process.stderr.write('Release build failed at '+path.basename(command)+'\n'+(result.stdout||'').slice(0,4000));process.exit(1);}}
run('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command','Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory('+literal(payload)+','+literal(zip)+')']);
const name='After-Ai-'+pkg.version+'-Setup.exe',installer=path.join(release,name),compiler=path.join(process.env.WINDIR,'Microsoft.NET','Framework64','v4.0.30319','csc.exe');
const setupSource=path.join(stage,'Setup.cs');fs.writeFileSync(setupSource,fs.readFileSync(path.join(root,'installer','Setup.cs'),'utf8').replace(/0\.0\.1/g,pkg.version));
run(compiler,['/nologo','/target:winexe','/platform:anycpu','/codepage:65001','/optimize+','/out:'+installer,'/resource:'+zip+',AIFlowPayload','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.IO.Compression.dll','/reference:System.IO.Compression.FileSystem.dll',setupSource]);
const bytes=fs.readFileSync(installer),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
const manifest={schemaVersion:1,product:'studio.aiflow.ae',channel:'experimental',version:pkg.version,author:pkg.author,releasedAt:new Date().toISOString(),installer:{file:name,sha256,size:bytes.length},notes:'Экспериментальная версия для своих, ещё не альфа.'};
const body=Buffer.from(JSON.stringify(manifest));const signed={payload:body.toString('base64'),signature:crypto.sign(null,body,privateKey).toString('base64')};
fs.writeFileSync(path.join(release,'experimental.json'),JSON.stringify(signed,null,2)+'\n');fs.writeFileSync(path.join(release,'SHA256SUMS'),sha256+'  '+name+'\n');
fs.mkdirSync(path.join(root,'updates'),{recursive:true});fs.copyFileSync(path.join(release,'experimental.json'),path.join(root,'updates','experimental.json'));
const site=path.join(root,'dist','site');fs.mkdirSync(path.join(site,'downloads'),{recursive:true});fs.mkdirSync(path.join(site,'updates'),{recursive:true});
for(const rel of ['index.html','site.css'])fs.writeFileSync(path.join(site,rel),fs.readFileSync(path.join(root,'site',rel),'utf8').replace(/0\.0\.1/g,pkg.version));
for(const rel of ['LICENSE','COPYRIGHT'])fs.copyFileSync(path.join(root,rel),path.join(site,rel));
fs.copyFileSync(installer,path.join(site,'downloads',name));fs.copyFileSync(path.join(release,'experimental.json'),path.join(site,'updates','experimental.json'));
fs.copyFileSync(path.join(release,'SHA256SUMS'),path.join(site,'downloads','SHA256SUMS'));
console.log(JSON.stringify({version:pkg.version,installer,bytes:bytes.length,sha256,site,manifestUrl,signedUpdates:true}));
