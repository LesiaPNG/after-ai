'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../extension/js/rules');
test('CEP mixed context receives the rules even when CommonJS module exists',()=>{
  const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
  const context={window:{},module:{exports:{}}};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../extension/js/rules.js'),'utf8'),context);
  assert.equal(typeof context.window.AIFlowRules.estimate,'function');
  assert.equal(context.window.AIFlowRules,context.module.exports);
});
const model = {id:'test/video',supported_durations:[4,8],supported_resolutions:['720p','1080p'],supported_aspect_ratios:['16:9','9:16'],supported_sizes:['1280x720'],supported_frame_images:['first_frame'],generate_audio:true,pricing_skus:{'per-video-second':'0.1','per-video-second-1080p':'0.2','per-video-second-audio':'0.15'}};
const settings = {prompt:'A moving paper boat',duration:'8',resolution:'720p',aspect_ratio:'16:9',size:'',seed:'',generate_audio:false};
test('request uses first frame schema, selected capabilities, and no empty fields',()=>{
  const p=rules.payload(model,settings,'data:image/png;base64,AAAA');
  assert.equal(p.frame_images[0].frame_type,'first_frame');assert.equal(p.frame_images[0].image_url.url,'data:image/png;base64,AAAA');assert.equal(p.duration,8);assert.equal(p.generate_audio,false);assert.ok(!('seed' in p));
});
test('text-to-video has no image payload',()=>assert.ok(!('frame_images' in rules.payload(model,settings,null))));
test('unsupported duration or image is blocked before a paid submission',()=>{
  assert.throws(()=>rules.payload(model,{...settings,duration:'12'},null));
  assert.throws(()=>rules.payload({...model,supported_frame_images:[]},settings,'data:image/png;base64,AAAA'));
});
test('exact model size replaces resolution/aspect fields',()=>{
  const p=rules.payload(model,{...settings,size:'1280x720'},null);assert.equal(p.size,'1280x720');assert.ok(!('resolution' in p));assert.ok(!('aspect_ratio' in p));
});
test('estimate multiplies known per-second SKU, respects resolution/audio',()=>{
  assert.equal(rules.estimate(model,settings).usd,.8);
  assert.equal(rules.estimate(model,{...settings,resolution:'1080p'}).usd,1.6);
  assert.equal(rules.estimate(model,{...settings,generate_audio:true}).usd,1.2);
});
test('unknown SKU units never become an invented dollar amount',()=>{
  assert.equal(rules.estimate({...model,pricing_skus:{generate:'.50'}},settings),null);
  assert.equal(rules.estimate({...model,pricing_skus:{'per-video-second':'.1'}},{...settings,generate_audio:true}),null);
});
test('pixel dimensions, pixel aspect, and capture mode control placement',()=>{
  const target={layerId:44,width:1920,height:1080,pixelAspect:1};
  assert.equal(rules.placement(target,{width:1920,height:1080,pixelAspect:1}),'replace');
  assert.equal(rules.placement(target,{width:1280,height:720,pixelAspect:1}),'new');
  assert.equal(rules.placement(target,{width:1920,height:1080,pixelAspect:1.33}),'new');
  assert.equal(rules.placement({...target,forceNew:true},{width:1920,height:1080}),'new');
});
test('portrait and landscape output sizes are estimated correctly',()=>{
  assert.deepEqual(rules.dimensions(settings),{width:1280,height:720,exact:false});
  assert.deepEqual(rules.dimensions({...settings,aspect_ratio:'9:16'}),{width:720,height:1280,exact:false});
});
test('live catalog cents are converted to dollars and input image charge is included',()=>{
  const grok={pricing_skus:{cents_per_image_input:'1',cents_per_video_output_second_720p:'3'}};
  assert.equal(rules.estimate(grok,settings,true).usd,.25);
  assert.equal(rules.estimate(grok,settings,false).usd,.24);
});
test('live catalog audio and text/image tariffs select the matching rate',()=>{
  const veo={pricing_skus:{duration_seconds_with_audio:'.12',duration_seconds_without_audio:'.10',duration_seconds_with_audio_720p:'.10',duration_seconds_without_audio_720p:'.08'}};
  assert.equal(rules.estimate(veo,settings).usd,.64);
  assert.equal(rules.estimate(veo,{...settings,generate_audio:true}).usd,.8);
  const wan={pricing_skus:{text_to_video_duration_seconds_720p:'.08',image_to_video_duration_seconds_720p:'.10'}};
  assert.equal(rules.estimate(wan,settings,false).usd,.64);
  assert.equal(rules.estimate(wan,settings,true).usd,.8);
});
