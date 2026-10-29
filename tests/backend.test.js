'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const backend=require('../extension/js/backend');
const testRoot=path.resolve(__dirname,'../test-output');fs.mkdirSync(testRoot,{recursive:true});
function cleanup(dir){if(!path.resolve(dir).startsWith(testRoot+path.sep))throw new Error('Invalid test cleanup path');fs.rmSync(dir,{recursive:true,force:true});}
test('spend is recorded before download and each provider job counted once',()=>{
  const dir=fs.mkdtempSync(path.join(testRoot,'ledger-'));const project=path.join(dir,'test.aep');
  try{
    const first=backend.addJob(project,{compId:1,layerId:2},{id:'fake/video'},{duration:8},{usd:1});
    backend.updateJob(project,first.localId,{jobId:'synthetic-1',state:'completed',cost:1.12});
    const second=backend.addJob(project,{compId:1},{id:'fake/video'},{duration:4},null);
    backend.updateJob(project,second.localId,{jobId:'synthetic-1',state:'completed',cost:1.12});
    const third=backend.addJob(project,{compId:1},{id:'fake/video'},{duration:4},null);
    const totals=backend.totals(backend.readLedger(project));assert.equal(totals.usd,1.12);assert.equal(totals.unknown,1);
    backend.updateJob(project,third.localId,{jobId:'synthetic-3',state:'failed',cost:.2});
    assert.equal(backend.totals(backend.readLedger(project)).usd,1.32);
  }finally{cleanup(dir);}
});
test('corrupt ledger is not overwritten',()=>{
  const dir=fs.mkdtempSync(path.join(testRoot,'corrupt-'));const project=path.join(dir,'test.aep');
  try{const file=backend.directories(project).ledger;fs.writeFileSync(file,'corrupt fixture');assert.throws(()=>backend.addJob(project,{},{id:'fake'},{duration:4},null));assert.equal(fs.readFileSync(file,'utf8'),'corrupt fixture');}
  finally{cleanup(dir);}
});
test('non-image and disguised files are rejected before their content is sent',()=>{
  assert.throws(()=>backend.image('do-not-open.env'));
  const dir=fs.mkdtempSync(path.join(testRoot,'image-'));
  try{const file=path.join(dir,'bad.png');fs.writeFileSync(file,'synthetic invalid image');assert.throws(()=>backend.image(file));}
  finally{cleanup(dir);}
});
