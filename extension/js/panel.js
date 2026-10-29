(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var rules = window.AIFlowRules;
  var cs = window.AIFlowCEP;
  var nodeRequire = window.cep_node ? window.cep_node.require : (typeof require === 'function' ? require : null);
  var backend, service, fs, path, fileURL, bridgePath;
  var models = [], attachment = null, target = null, currentProject = null, running = false, timer = null;
  var stateNames = {submitting:'Отправка…',unknown:'Статус отправки неизвестен',pending:'В очереди',in_progress:'Генерация',completed:'Готово',failed:'Генерация не удалась',cancelled:'Отменено',expired:'Истекло',rejected:'Не отправлено'};
  function status(text, kind) { $('status').textContent = text; $('status').className = 'status ' + (kind || ''); }
  function money(value) { return '$' + Number(value).toFixed(value > 0 && value < 0.01 ? 4 : 2); }
  function uiError(error) { status(error && error.message ? error.message : 'Операция не выполнена.', 'error'); }
  function setupUpdates(root) {
    var client,download=null,checking=false;
    try{var updater=nodeRequire(path.join(root,'js','updater.js'));client=new updater.Client(root);}catch(_){$('updateStatus').textContent='Проверка обновлений временно недоступна.';return;}
    async function check(manual){
      if(checking)return;checking=true;
      try{
        var result=await client.check();
        if(!result.available){if(manual)$('updateStatus').textContent='Установлена последняя версия AI Flow.';return;}
        $('updateBanner').hidden=false;$('updateTitle').textContent='AI Flow '+result.manifest.version;
        $('updateMessage').textContent='Загружаем проверенное обновление…';$('installUpdate').disabled=true;
        download=await client.download(result);$('installUpdate').disabled=false;
        $('updateMessage').textContent='Обновление скачано. Установщик попросит закрыть After Effects. Проекты и API-ключ сохраняются.';
      }catch(_){if(manual)$('updateStatus').textContent='Сервер обновлений недоступен или подпись не прошла проверку. Установленная версия продолжает работать.';}
      finally{checking=false;}
    }
    $('checkUpdates').addEventListener('click',function(){check(true);});
    $('installUpdate').addEventListener('click',function(){if(running){$('updateMessage').textContent='Дождитесь завершения генерации перед обновлением.';return;}try{client.install(download);}catch(_){$('updateMessage').textContent='Не удалось запустить установщик. Скачайте его с сайта AI Flow.';}});
    check(false);
  }
  function host(method, data) {
    return new Promise(function (resolve, reject) {
      if (!cs) return reject(new Error('Откройте AI Flow через меню расширений After Effects.'));
      var deadline = setTimeout(function () { reject(new Error('AE пока не ответил панели. Остановите предпросмотр и попробуйте снова.')); }, 15000);
      var encoded = encodeURIComponent(JSON.stringify(data || {}));
      var expression = '(function(){try{$.evalFile(new File(' + JSON.stringify(bridgePath) + '));return AIFlow.dispatch(' + JSON.stringify(method) + ',' + JSON.stringify(encoded) + ');}catch(e){return \'{"ok":false,"code":"AE_ERROR"}\';}})()';
      cs.evalScript(expression, function (reply) {
        clearTimeout(deadline);
        try {
          var result = JSON.parse(reply);
          if (!result.ok) {
            var messages = {SAVE_PROJECT:'Сначала сохраните проект AE.',OPEN_COMP:'Откройте композицию.',SELECT_ONE:'Выберите только один слой.',SELECT_LAYER:'Выделите слой в композиции.',NO_SOURCE:'У слоя нет исходника. Используйте «Кадр композиции».',PROJECT_CHANGED:'Сейчас открыт другой проект. Видео сохранено; откройте исходный проект и нажмите «Вставить в AE».',FILE_MISSING:'Файл результата не найден на диске.',COMP_MISSING:'Исходная композиция удалена. Видео сохранено на диске.',AE_ERROR:'AE не выполнил операцию. Проверьте разрешение скриптам записывать файлы и доступность слоя.'};
            return reject(new Error(messages[result.code] || 'AE не выполнил операцию.'));
          }
          resolve(result.data);
        } catch (_) { reject(new Error('Нет ответа от AE. Перезапустите панель и проверьте разрешения скриптов.')); }
      });
    });
  }
  function settings() {
    return {prompt:$('prompt').value,duration:$('duration').value,resolution:$('resolution').value,aspect_ratio:$('aspectRatio').value,
      size:$('size').value,seed:$('seed').value,generate_audio:$('audio').checked};
  }
  function selectedModel() { return models.filter(function (m) { return m.id === $('model').value; })[0]; }
  function estimate() {
    var model = selectedModel(), options = settings(), automatic = rules.estimate(model, options, !!attachment);
    if (automatic) return automatic;
    var rate = $('manualRate').value;
    if (rate !== '' && isFinite(Number(rate)) && Number(rate) >= 0 && Number(options.duration) > 0) return {usd:Number(rate)*Number(options.duration),sku:'manual'};
    return null;
  }
  function updateEstimate() {
    var result = estimate(), options = settings();
    $('estimate').textContent = result ? '≈ ' + money(result.usd) : '—';
    $('estimateCorner').textContent = result ? '≈ ' + money(result.usd) : '—';
    $('priceNote').textContent = result ? (result.sku === 'manual' ? 'По вашей ставке' : 'По тарифу модели; итог после запуска') : 'Тариф не определён. Можно указать $/сек';
    $('resolution').disabled = !!options.size; $('aspectRatio').disabled = !!options.size;
    var dims = rules.dimensions(options), warning = '';
    if (target && target.forceNew) warning = 'Результат будет добавлен новым слоем, Scale 100%.';
    else if (target && dims && (dims.width !== target.width || dims.height !== target.height)) warning = 'Размер модели ' + dims.width + ' × ' + dims.height + (dims.exact ? '' : ' (ориентировочно)') + ' отличается от исходника ' + target.width + ' × ' + target.height + '. Добавим новым слоем без масштабирования. Итоговый размер проверим после импорта.';
    else if (target) warning = 'После загрузки проверим размер: совпадает → заменим источник; отличается → новый слой, Scale 100%.';
    $('sizeWarning').textContent = warning; $('sizeWarning').hidden = !warning;
  }
  function fillSelect(id, values, placeholder) {
    var element = $(id), previous = element.value;
    element.textContent = '';
    var first = document.createElement('option'); first.value = ''; first.textContent = placeholder; element.appendChild(first);
    values.forEach(function (value) { var option=document.createElement('option'); option.value=String(value); option.textContent=String(value)+(id==='duration'?' сек':''); element.appendChild(option); });
    if (values.map(String).indexOf(previous) !== -1) element.value = previous;
    else if (values.length && id !== 'size') element.value = String(values[0]);
  }
  function modelChanged() {
    var model = selectedModel() || {};
    fillSelect('duration',rules.values(model,'supported_durations'),'Авто');
    fillSelect('resolution',rules.values(model,'supported_resolutions'),'Авто');
    fillSelect('aspectRatio',rules.values(model,'supported_aspect_ratios'),'Авто');
    fillSelect('size',rules.values(model,'supported_sizes'),'По параметрам');
    $('audio').disabled = !model.generate_audio; if (!model.generate_audio) $('audio').checked=false;
    $('manualRate').value = '';
    updateEstimate();
  }
  async function keyStatus() {
    var info = await service.call('KeyStatus');
    $('keyStatus').textContent = info.saved ? 'Ключ сохранён на этом компьютере.' : 'Ключ пока не сохранён.';
    if (!info.saved) $('settingsPanel').hidden = false;
    return info.saved;
  }
  async function loadModels() {
    $('loadModels').disabled=true;
    try {
      status('Загружаем модели OpenRouter…','working');
      var result=await service.call('Models'), previous=$('model').value;
      models=result.models.filter(function(m){return m.id && m.supported_durations && m.supported_durations.length;});
      models.sort(function(a,b){return (a.name||a.id).localeCompare(b.name||b.id);});
      $('model').textContent='';
      models.forEach(function(m){var option=document.createElement('option');option.value=m.id;option.textContent=m.name||m.id;$('model').appendChild(option);});
      if (models.some(function(m){return m.id===previous;})) $('model').value=previous;
      modelChanged(); status(models.length ? 'Каталог обновлён: '+models.length+' моделей.' : 'В каталоге нет подходящих моделей генерации видео.');
    } catch(error){uiError(error);} finally{$('loadModels').disabled=false;}
  }
  function showTarget(value) {
    target=value;currentProject=value.projectPath;
    $('destination').textContent=value.compName+' → '+(value.layerName||'новый слой')+' · '+value.width+' × '+value.height;
    $('destination').title=value.projectPath;
    updateEstimate(); renderHistory(currentProject);
  }
  function setAttachment(file, destination, kind) {
    var info=backend.image(file);
    attachment={path:file,kind:kind};showTarget(destination);
    $('preview').src=fileURL(file).href;$('attachmentName').textContent=info.name;
    $('attachmentKind').textContent=kind==='composition-frame'?'Кадр композиции · новый слой':kind==='source-frame'?'Кадр исходника · без эффектов слоя':kind==='source'?'Исходник выбранного слоя':'Прикреплённое изображение';
    $('emptyAttachment').hidden=true;$('attachmentView').hidden=false;$('clearAttachment').hidden=false;
  }
  async function attachFile(file) {
    if(running)return;
    busy(true);$('generate').textContent='Готовим материал…';
    try {var context=await host('context');setAttachment(file,context,'file');status('Изображение прикреплено.');}catch(error){uiError(error);}finally{busy(false);}
  }
  async function takeFromAE(mode) {
    if(running)return;
    busy(true);$('generate').textContent='Готовим материал…';
    try {
      var context=await host('context'), dirs=backend.directories(context.projectPath);
      var output=path.join(dirs.inputs,'frame-'+Date.now()+'.png');
      status('Берём материал из AE…','working');
      var result=await host(mode,{outputPath:output});
      try {await backend.waitForImage(result.path);} finally {if(result.temporaryCompId)await host('cleanup',{temporaryCompId:result.temporaryCompId});}
      setAttachment(result.path,result.target,result.kind);status('Материал получен из AE.');
    }catch(error){uiError(error);}finally{busy(false);}
  }
  function renderHistory(projectPath) {
    if(!projectPath)return;
    var ledger;
    try {ledger=backend.readLedger(projectPath);}catch(error){uiError(error);return;}
    if(currentProject!==projectPath)return;
    var total=backend.totals(ledger);$('total').textContent=money(total.usd);$('unsettled').textContent=total.unknown?'Стоимость уточняется: '+total.unknown:'';
    $('history').textContent='';
    if(!ledger.jobs.length){var empty=document.createElement('div');empty.className='empty-history';empty.textContent='Здесь появятся ваши генерации';$('history').appendChild(empty);return;}
    ledger.jobs.slice().reverse().forEach(function(job){
      var row=document.createElement('div');row.className='job';
      var top=document.createElement('div');top.className='job-top';
      var name=document.createElement('span');name.className='job-name';name.textContent=job.model;
      var cost=document.createElement('span');cost.textContent=typeof job.cost==='number'?money(job.cost):'уточняется';top.appendChild(name);top.appendChild(cost);row.appendChild(top);
      var meta=document.createElement('div');meta.className='job-meta';
      var state=document.createElement('span');state.className='job-state';state.textContent=(job.imported?'Вставлено в AE':stateNames[job.state]||job.state);
      var date=document.createElement('span');date.textContent=new Date(job.createdAt).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});meta.appendChild(state);meta.appendChild(date);row.appendChild(meta);
      var actions=document.createElement('div');actions.className='job-actions';
      function action(text,fn){var button=document.createElement('button');button.textContent=text;button.disabled=running;button.addEventListener('click',fn);actions.appendChild(button);}
      if(job.jobId)action(job.state==='completed'?'Проверить / скачать':'Проверить',function(){checkJob(projectPath,job.localId);});
      if(job.file && fs.existsSync(job.file))action('Вставить в AE',function(){applyJob(projectPath,job).catch(uiError);});
      if(!job.jobId && (job.state==='unknown'||job.state==='submitting')){var info=document.createElement('span');info.className='hint';info.textContent='ID не получен. Проверьте Activity в OpenRouter перед повторной отправкой.';actions.appendChild(info);}
      row.appendChild(actions);$('history').appendChild(row);
    });
  }
  function busy(value) {
    running=value;
    ['generate','fromLayer','fromComposition','chooseFile','clearAttachment','loadModels','saveKey','deleteKey','model','duration','resolution','aspectRatio','size','seed','audio','manualRate','prompt'].forEach(function(id){$(id).disabled=value;});
    $('generate').textContent=value?'◌ Задание выполняется…':'✦ Сгенерировать';
    if(!value){$('audio').disabled=!(selectedModel()||{}).generate_audio;updateEstimate();}
    if(currentProject)renderHistory(currentProject);
  }
  async function applyJob(projectPath,job) {
    var result=await host('import',{path:job.file,target:job.target,jobId:job.jobId||job.localId});
    backend.updateJob(projectPath,job.localId,{imported:true,placement:result.mode});renderHistory(projectPath);
    if(result.mode==='replace')status('Готово: источник слоя заменён, настройки сохранены. Длительность видео: '+Number(result.duration).toFixed(1)+' сек.','success');
    else if(result.mode==='already')status('Результат уже присутствует в композиции.','success');
    else status('Готово: новый слой '+result.width+' × '+result.height+', Scale 100%.'+(result.dimensionMismatch?' Размер отличается от исходника.':'')+(result.targetChanged?' Исходный слой был изменён.':''),'success');
    return result;
  }
  async function pollOnce(projectPath,localId,autoImport) {
    var job=backend.readLedger(projectPath).jobs.filter(function(j){return j.localId===localId;})[0];
    if(!job||!job.jobId)throw new Error('У задания пока нет ID OpenRouter.');
    var response=await service.call('Poll',{jobId:job.jobId});
    var updates={state:response.state};
    if(typeof response.cost==='number')updates.cost=response.cost;
    job=backend.updateJob(projectPath,localId,updates);renderHistory(projectPath);
    if(response.state==='completed'){
      if(!job.file||!fs.existsSync(job.file)){
        status('Видео готово. Скачиваем…','working');
        var file=path.join(backend.directories(projectPath).outputs,job.localId+'.mp4');
        // A completed download may exist after a crash before its ledger update.
        if(!fs.existsSync(file))await service.call('Download',{jobId:job.jobId,destination:file});
        job=backend.updateJob(projectPath,localId,{file:file});renderHistory(projectPath);
      }
      if(autoImport && !job.imported)await applyJob(projectPath,job);
      else status('Видео сохранено в папке проекта.','success');
      return true;
    }
    if(['failed','cancelled','expired'].indexOf(response.state)!==-1){status(stateNames[response.state]+'. Расход учтён, если OpenRouter вернул стоимость.','error');return true;}
    status((stateNames[response.state]||'Ожидание')+' · следующая проверка через 20 секунд','working');return false;
  }
  async function monitor(projectPath,localId,count) {
    try{
      var done=await pollOnce(projectPath,localId,true);
      if(done){busy(false);return;}
      if(count>=90){busy(false);status('Генерация ещё идёт. Проверку можно продолжить кнопкой в истории.');return;}
      timer=setTimeout(function(){monitor(projectPath,localId,count+1);},20000);
    }catch(error){busy(false);uiError(error);}
  }
  async function checkJob(projectPath,localId) {
    if(running)return;busy(true);
    await monitor(projectPath,localId,0);
  }
  async function generate() {
    if(running)return;
    var job,projectPath,submitted=false;
    try {
      var model=selectedModel(),options=settings();
      var imageData=attachment?backend.image(attachment.path).uri:null;
      var request=rules.payload(model,options,imageData);
      var now=await host('context');
      var destination=attachment?target:now;
      if(destination.projectPath!==now.projectPath)throw new Error('Материал выбран в другом проекте. Выберите его заново.');
      projectPath=destination.projectPath;showTarget(destination);
      var saved=await service.call('KeyStatus');if(!saved.saved)throw new Error('Сначала сохраните ключ OpenRouter в настройках.');
      busy(true);status('Отправляем запрос в OpenRouter…','working');
      job=backend.addJob(projectPath,destination,model,options,estimate());
      submitted=true;
      var response=await service.call('Submit',{payload:request});
      var updates={jobId:response.id,state:response.state};if(typeof response.cost==='number')updates.cost=response.cost;
      job=backend.updateJob(projectPath,job.localId,updates);renderHistory(projectPath);
      await monitor(projectPath,job.localId,0);
    } catch(error){
      if(job && !job.jobId)backend.updateJob(projectPath,job.localId,{state:submitted?'unknown':'rejected'});
      busy(false);uiError(error);
    }
  }
  async function refreshHistory() {
    try{var info=await host('context');if(!attachment)showTarget(info);else{currentProject=info.projectPath;renderHistory(currentProject);}}catch(error){uiError(error);}
  }
  function wire() {
    $('settingsToggle').addEventListener('click',function(){$('settingsPanel').hidden=!$('settingsPanel').hidden;});
    $('saveKey').addEventListener('click',async function(){
      try{var key=$('apiKey').value.trim();$('apiKey').value='';await service.call('SetKey',{key:key});key=null;await keyStatus();status('Ключ сохранён. Загружаем каталог…');await loadModels();}catch(error){uiError(error);}
    });
    $('deleteKey').addEventListener('click',async function(){try{await service.call('DeleteKey');await keyStatus();status('Ключ удалён.');}catch(error){uiError(error);}});
    $('loadModels').addEventListener('click',loadModels);$('model').addEventListener('change',modelChanged);
    ['duration','resolution','aspectRatio','size','seed','audio','manualRate'].forEach(function(id){$(id).addEventListener('input',updateEstimate);});
    $('prompt').addEventListener('input',function(){$('promptCount').textContent=$('prompt').value.length;});
    $('fromLayer').addEventListener('click',function(){takeFromAE('source');});$('fromComposition').addEventListener('click',function(){takeFromAE('capture');});
    $('chooseFile').addEventListener('click',function(){
      if(running)return;
      if(window.cep && window.cep.fs && window.cep.fs.showOpenDialog){
        try{
          var chosen=window.cep.fs.showOpenDialog(false,false,'Прикрепить изображение','',['png','jpg','jpeg','webp']);
          if(chosen.err){status('Не удалось открыть выбор файла. Попробуйте перетаскивание из Проводника.','error');return;}
          if(chosen.data && chosen.data[0])attachFile(chosen.data[0]);
        }catch(_){status('Не удалось открыть выбор файла. Попробуйте перетаскивание из Проводника.','error');}
      }else $('fileInput').click();
    });
    $('fileInput').addEventListener('change',function(event){var file=event.target.files[0];if(file&&file.path)attachFile(file.path);else if(file)status('AE не передал путь. Попробуйте перетащить файл из Проводника.','error');event.target.value='';});
    $('clearAttachment').addEventListener('click',function(){attachment=null;target=null;$('preview').removeAttribute('src');$('emptyAttachment').hidden=false;$('attachmentView').hidden=true;$('clearAttachment').hidden=true;refreshHistory();});
    $('dropzone').addEventListener('dragover',function(event){event.preventDefault();if(!running)$('dropzone').classList.add('dragging');});
    $('dropzone').addEventListener('dragleave',function(){$('dropzone').classList.remove('dragging');});
    document.addEventListener('dragover',function(event){event.preventDefault();});
    document.addEventListener('drop',function(event){
      event.preventDefault();$('dropzone').classList.remove('dragging');
      var file=event.dataTransfer.files[0];if(file&&file.path){attachFile(file.path);return;}
      var uri=event.dataTransfer.getData('text/uri-list').split(/\r?\n/).filter(function(line){return /^file:/i.test(line);})[0];
      if(uri){try{attachFile(nodeRequire('url').fileURLToPath(uri));}catch(_){status('Не удалось получить путь. Используйте «Прикрепить файл».','error');}}
      else if(file)status('AE не передал путь. Используйте «Прикрепить файл».','error');
    });
    $('dropzone').addEventListener('keydown',function(event){if(event.key==='Enter')$('chooseFile').click();});
    $('generate').addEventListener('click',generate);$('refreshHistory').addEventListener('click',refreshHistory);
  }
  async function init() {
    if(!cs||!nodeRequire){status('Панель запускается внутри After Effects: Окно → Расширения → AI Flow.','error');return;}
    try{
      fs=nodeRequire('fs');path=nodeRequire('path');fileURL=nodeRequire('url').pathToFileURL;
      var extensionRoot=cs.getExtensionPath();
      bridgePath=path.join(extensionRoot,'jsx','host.jsx').replace(/\\/g,'/');
      backend=nodeRequire(path.join(extensionRoot,'js','backend.js'));service=new backend.Backend(extensionRoot);
      setupUpdates(extensionRoot);
      wire();await keyStatus();
      await loadModels();
      try{var context=await host('context');showTarget(context);}catch(_){}
    }catch(_){status('Не удалось запустить панель. Проверьте установку и перезапустите AE.','error');}
  }
  init();
}());
