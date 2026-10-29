'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../test-output');fs.mkdirSync(root,{recursive:true});
const script=path.resolve(__dirname,'../extension/worker/openrouter.ps1');
test('isolated Windows vault stores only synthetic test input; IPC never returns the key',()=>{
  const isolated=fs.mkdtempSync(path.join(root,'synthetic-vault-'));
  function call(action,input){
    const result=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Action',action,'-StorageRoot',isolated],{input:JSON.stringify(input||{}),encoding:'utf8',windowsHide:true,timeout:20000});
    assert.ok(!result.stdout.includes('synthetic-not-a-real-key'),'Worker must not echo input');
    return JSON.parse(result.stdout.replace(/^\uFEFF/,''));
  }
  try{
    assert.equal(call('KeyStatus').saved,false);
    assert.equal(call('Poll',{jobId:'synthetic-no-key'}).code,'NO_KEY');
    assert.equal(call('SetKey',{key:'sk-or-synthetic-not-a-real-key-000000000000'}).ok,true);
    assert.equal(call('KeyStatus').saved,true);
    assert.equal(call('Poll',{jobId:'../../keys'}).code,'INVALID_INPUT');
    assert.equal(call('DeleteKey').ok,true);
    assert.equal(call('KeyStatus').saved,false);
  }finally{if(!path.resolve(isolated).startsWith(root+path.sep))throw new Error('Invalid cleanup');fs.rmSync(isolated,{recursive:true,force:true});}
});
