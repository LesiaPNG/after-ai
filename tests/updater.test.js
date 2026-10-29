'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const updater=require('../extension/js/updater');
function sign(m,key){const b=Buffer.from(JSON.stringify(m));return Buffer.from(JSON.stringify({payload:b.toString('base64'),signature:crypto.sign(null,b,key).toString('base64')}));}
const bytes=Buffer.from('synthetic-installer-not-executable');
function manifest(){return {schemaVersion:1,product:'studio.aiflow.ae',channel:'experimental',version:'0.0.2',installer:{file:'AI-Flow-0.0.2-Setup.exe',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),size:bytes.length}};}
test('signed update rejects modified manifests, foreign products and downgrades',()=>{
 const k=crypto.generateKeyPairSync('ed25519'),other=crypto.generateKeyPairSync('ed25519');
 const good=sign(manifest(),k.privateKey);assert.equal(updater.verifyEnvelope(good,k.publicKey).version,'0.0.2');
 assert.throws(()=>updater.verifyEnvelope(good,other.publicKey),{code:'UPDATE_SIGNATURE'});
 const corrupt=JSON.parse(good);corrupt.payload=Buffer.from(JSON.stringify({...manifest(),version:'9.0.0'})).toString('base64');assert.throws(()=>updater.verifyEnvelope(Buffer.from(JSON.stringify(corrupt)),k.publicKey));
 assert.throws(()=>updater.verifyEnvelope(sign({...manifest(),product:'other-app'},k.privateKey),k.publicKey));
 assert.equal(updater.newer('0.0.2','0.0.1'),true);assert.equal(updater.newer('0.0.1','0.0.2'),false);assert.equal(updater.newer('0.0.1','0.0.1'),false);
});
test('checks and downloads independently of provider credentials; corrupt installer never stages',async()=>{
 const k=crypto.generateKeyPairSync('ed25519'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'ai-flow-update-fixture-'));let corrupt=false;
 const server=http.createServer((req,res)=>{if(req.url==='/updates/experimental.json')res.end(sign(manifest(),k.privateKey));else res.end(corrupt?Buffer.from('bad'):bytes);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  fs.writeFileSync(path.join(directory,'release.json'),JSON.stringify({version:'0.0.1',manifestUrl:'http://127.0.0.1:'+server.address().port+'/updates/experimental.json'}));fs.writeFileSync(path.join(directory,'update-public-key.pem'),k.publicKey.export({type:'spki',format:'pem'}));
  const client=new updater.Client(directory,{cacheRoot:path.join(directory,'cache')}),update=await client.check();assert.equal(update.available,true);
  const download=await client.download(update);assert.deepEqual(fs.readFileSync(download.file),bytes);
  corrupt=true;await assert.rejects(client.download(update),{code:'UPDATE_CHECKSUM'});
 }finally{await new Promise(r=>server.close(r));if(!path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Invalid test cleanup path');fs.rmSync(directory,{recursive:true,force:true});}
});
