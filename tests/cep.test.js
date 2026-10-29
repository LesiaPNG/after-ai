'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('independent CEP adapter resolves Windows extension paths and preserves evalScript callbacks',()=>{
 const window={__adobe_cep__:{getSystemPath:()=> 'file:///C:/Users/Test/AI%20Flow',evalScript:(s,cb)=>cb('result:'+s)}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../extension/js/cep.js'),'utf8'),{window});assert.equal(window.AIFlowCEP.getExtensionPath(),'C:/Users/Test/AI Flow');let result;window.AIFlowCEP.evalScript('ping',v=>result=v);assert.equal(result,'result:ping');
});
