'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
const playwright=require(process.env.AIFLOW_PLAYWRIGHT_MODULE||'playwright');
test('panel renders at AE widths, shows price/mismatch, and completes a synthetic API cycle',async()=>{
  const browser=await playwright.chromium.launch({executablePath:process.env.AIFLOW_TEST_BROWSER||undefined,headless:true});
  try{
    const page=await browser.newPage();await page.setViewportSize({width:380,height:1400});const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      window.__adobe_cep__={};window.SystemPath={EXTENSION:'extension'};
      window.cep={fs:{showOpenDialog:()=>({err:0,data:['C:/synthetic/artwork.png']})}};
      const target={projectPath:'C:/synthetic/test.aep',compId:42,compName:'Main composition',layerId:7,layerName:'Artwork',width:1000,height:1000,pixelAspect:1,sourceId:4,compTime:0,inPoint:0,outPoint:8};
      const ledger={version:1,jobs:[]};let submitted=null;
      window.__test={ledger:ledger,target:target,getSubmitted:()=>submitted};
      const fakeBackend={
        Backend:function(){this.call=async function(action,data){
          if(action==='KeyStatus')return {ok:true,saved:true};
          if(action==='Models')return {ok:true,models:[{id:'synthetic/video',name:'Video model · test',supported_durations:[8],supported_resolutions:['720p'],supported_aspect_ratios:['16:9'],supported_sizes:['1280x720'],supported_frame_images:['first_frame'],generate_audio:false,pricing_skus:{'per-video-second':'.1'}}]};
          if(action==='Submit'){submitted=data.payload;return {ok:true,id:'synthetic-job-1',state:'pending',cost:null};}
          if(action==='Poll')return {ok:true,id:'synthetic-job-1',state:'completed',cost:.8};
          if(action==='Download')return {ok:true,downloaded:true};
          return {ok:true};
        };},
        directories:()=>({inputs:'C:/synthetic/inputs',outputs:'C:/synthetic/outputs'}),readLedger:()=>ledger,
        image:()=>({uri:'data:image/png;base64,AAAA',bytes:3,name:'artwork.png'}),waitForImage:async()=>{},
        totals:l=>({usd:l.jobs.reduce((s,j)=>s+(j.cost||0),0),unknown:l.jobs.filter(j=>j.cost==null).length}),
        addJob:(p,t,m,s,e)=>{const j={localId:'local1',jobId:null,createdAt:new Date().toISOString(),state:'submitting',model:m.id,target:t,cost:null,file:null,imported:false};ledger.jobs.push(j);return j;},
        updateJob:(p,id,update)=>Object.assign(ledger.jobs.find(j=>j.localId===id),update)
      };
      window.cep_node={require:function(name){
        if(name.endsWith('updater.js'))return {Client:function(){this.check=async()=>({available:false});}};
        if(name==='path')return {join:(...parts)=>parts.join('/')};
        if(name==='fs')return {existsSync:()=>true};
        if(name==='url')return {pathToFileURL:()=>({href:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6xkAAAAASUVORK5CYII='})};
        return fakeBackend;
      }};
      window.__fakeCS=function(){};window.__fakeCS.prototype.getSystemPath=()=>'.';
      window.__fakeCS.prototype.evalScript=function(script,callback){
        const method=JSON.parse(script.match(/AIFlow.dispatch\(("[^"]+")/)[1]);
        if(method==='ping')callback(JSON.stringify({ok:true,data:{version:'26.3'}}));
        else if(method==='source')callback(JSON.stringify({ok:true,data:{target:target,path:'C:/synthetic/artwork.png',kind:'source'}}));
        else if(method==='import')callback(JSON.stringify({ok:true,data:{mode:'new',width:1280,height:720,dimensionMismatch:true,duration:8}}));
        else callback(JSON.stringify({ok:true,data:target}));
      };
    });
    await page.route('**/js/cep.js',route=>route.fulfill({contentType:'text/javascript',body:'window.AIFlowCEP={getExtensionPath:()=>".",evalScript:window.__fakeCS.prototype.evalScript};'}));
    await page.goto(require('node:url').pathToFileURL(path.resolve(__dirname,'../extension/index.html')).href);
    await page.waitForFunction(()=>document.querySelector('#model').value==='synthetic/video');
    await page.locator('#chooseFile').click();
    await page.waitForFunction(()=>document.querySelector('#attachmentKind').textContent==='Прикреплённое изображение');
    await page.locator('#fromLayer').click();
    await page.locator('#prompt').fill('Animate the paper artwork with a slow camera move.');
    assert.match(await page.locator('#estimate').innerText(),/0.80/);
    assert.match(await page.locator('#sizeWarning').innerText(),/новым слоем/);
    await page.screenshot({path:path.resolve(__dirname,'../test-output/panel-preview.png'),fullPage:true});
    for(const width of [300,380,600]){
      await page.setViewportSize({width:width,height:960});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Panel overflows at '+width);
    }
    await page.locator('#generate').click();
    await page.waitForFunction(()=>document.querySelector('#status').textContent.indexOf('Готово: новый слой')!==-1);
    assert.match(await page.locator('#total').innerText(),/0.80/);
    assert.equal(await page.evaluate(()=>window.__test.ledger.jobs[0].imported),true);
    assert.equal(await page.evaluate(()=>window.__test.getSubmitted().frame_images[0].frame_type),'first_frame');
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
