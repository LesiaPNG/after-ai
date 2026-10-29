(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  // CEP mixed context exposes CommonJS module AND window at the same time.
  if (typeof window !== 'undefined') window.AIFlowRules = api;
  else root.AIFlowRules = api;
}(this, function () {
  'use strict';
  function list(value) { return Array.isArray(value) ? value : []; }
  function values(model, field) { return list(model[field]).map(String); }
  function allowed(model, field, value) {
    var options = values(model, field);
    return !value || !options.length || options.indexOf(String(value)) !== -1;
  }
  function validate(model, settings, hasImage) {
    if (!model || !model.id) throw new Error('Выберите модель из каталога OpenRouter.');
    if (!settings.prompt || !settings.prompt.trim()) throw new Error('Напишите промт.');
    if (!allowed(model, 'supported_durations', settings.duration) ||
        !allowed(model, 'supported_resolutions', settings.resolution) ||
        !allowed(model, 'supported_aspect_ratios', settings.aspect_ratio) ||
        !allowed(model, 'supported_sizes', settings.size)) throw new Error('Параметры не поддерживаются выбранной моделью.');
    if (settings.duration && (!Number.isInteger(Number(settings.duration)) || Number(settings.duration) < 1)) throw new Error('Проверьте длительность.');
    if (settings.seed !== '' && settings.seed != null && (!Number.isSafeInteger(Number(settings.seed)) || Number(settings.seed) < 0)) throw new Error('Seed должен быть целым неотрицательным числом.');
    if (hasImage && list(model.supported_frame_images).indexOf('first_frame') === -1) throw new Error('Эта модель не заявляет поддержку начального кадра. Выберите другую модель или уберите вложение.');
  }
  function payload(model, settings, imageData) {
    validate(model, settings, !!imageData);
    var out = { model: model.id, prompt: settings.prompt.trim() };
    if (settings.duration) out.duration = Number(settings.duration);
    if (settings.size) out.size = settings.size;
    else {
      if (settings.resolution) out.resolution = settings.resolution;
      if (settings.aspect_ratio) out.aspect_ratio = settings.aspect_ratio;
    }
    if (model.generate_audio) out.generate_audio = !!settings.generate_audio;
    if (settings.seed !== '' && settings.seed != null) out.seed = Number(settings.seed);
    if (imageData) out.frame_images = [{ type: 'image_url', image_url: { url: imageData }, frame_type: 'first_frame' }];
    return out;
  }
  // An unknown SKU must remain unknown: never invent a price or its unit.
  function estimate(model, settings, hasImage) {
    var skus = model && model.pricing_skus || {}, duration = Number(settings.duration);
    if (!duration) return null;
    var resolution = String(settings.resolution || '').toLowerCase();
    if (settings.size) {
      var dims = settings.size.split('x').map(Number), shortSide = Math.min.apply(Math, dims);
      resolution = ({ 480: '480p', 720: '720p', 768: '768p', 1080: '1080p' })[shortSide] || '';
    }
    var keys = [], mode = hasImage ? 'image_to_video' : 'text_to_video';
    var sound = settings.generate_audio ? 'with_audio' : 'without_audio';
    if (resolution) keys.push('duration_seconds_' + sound + '_' + resolution);
    keys.push('duration_seconds_' + sound);
    if (resolution) keys.push(mode + '_duration_seconds_' + resolution);
    if (resolution) keys.push('duration_seconds_' + resolution);
    keys.push('duration_seconds');
    // The live catalog uses both dollars/second and cents/second SKUs.
    for (var current = 0; current < keys.length; current++) {
      if (Object.prototype.hasOwnProperty.call(skus, keys[current])) {
        var dollarRate = Number(skus[keys[current]]);
        if (isFinite(dollarRate) && dollarRate >= 0) {
          var imageCharge = hasImage ? Number(skus.reference_input_images || skus.reference_images || 0) : 0;
          return { usd: dollarRate * duration + imageCharge, sku: keys[current] };
        }
      }
    }
    var centKeys = [];
    if (resolution) centKeys.push('cents_per_video_output_second_' + resolution, 'cents_per_second_output_' + resolution);
    centKeys.push('cents_per_second_output');
    for (var cent = 0; cent < centKeys.length; cent++) {
      if (Object.prototype.hasOwnProperty.call(skus, centKeys[cent])) {
        var centRate = Number(skus[centKeys[cent]]);
        if (isFinite(centRate) && centRate >= 0) return { usd: (centRate * duration + (hasImage ? Number(skus.cents_per_image_input || 0) : 0)) / 100, sku: centKeys[cent] };
      }
    }
    keys = [];
    if (settings.generate_audio) {
      if (resolution) keys.push('per-video-second-' + resolution + '-audio', 'per-video-second-audio-' + resolution);
      keys.push('per-video-second-audio');
      // A plain SKU alone cannot establish that audio is included.
      if (!keys.some(function (key) { return Object.prototype.hasOwnProperty.call(skus, key); })) return null;
    } else {
      if (resolution) keys.push('per-video-second-' + resolution);
      keys.push('per-video-second');
    }
    for (var i = 0; i < keys.length; i++) {
      if (Object.prototype.hasOwnProperty.call(skus, keys[i])) {
        var rate = Number(skus[keys[i]]);
        if (isFinite(rate) && rate >= 0) return { usd: rate * duration, sku: keys[i] };
      }
    }
    return null;
  }
  function dimensions(settings) {
    if (settings.size && /^\d+x\d+$/.test(settings.size)) {
      var size = settings.size.split('x').map(Number); return { width: size[0], height: size[1], exact: true };
    }
    var match = /^(\d+)p$/.exec(settings.resolution || '');
    var ratio = /^(\d+):(\d+)$/.exec(settings.aspect_ratio || '');
    if (!match || !ratio) return null;
    var shortSide = Number(match[1]), a = Number(ratio[1]), b = Number(ratio[2]);
    return { width: Math.round(shortSide * a / Math.min(a, b)), height: Math.round(shortSide * b / Math.min(a, b)), exact: false };
  }
  function placement(target, footage) {
    var same = target && Number(target.width) === Number(footage.width) && Number(target.height) === Number(footage.height) &&
      Math.abs(Number(target.pixelAspect || 1) - Number(footage.pixelAspect || 1)) < 0.0001;
    return target && target.layerId && !target.forceNew && same ? 'replace' : 'new';
  }
  return { values: values, validate: validate, payload: payload, estimate: estimate, dimensions: dimensions, placement: placement };
}));
