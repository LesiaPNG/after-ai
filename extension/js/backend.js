'use strict';
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var spawn = require('child_process').spawn;

function Backend(extensionRoot) { this.root = extensionRoot; this.busy = false; }
Backend.prototype.call = function (action, data) {
  var worker = path.join(this.root, 'worker', 'openrouter.ps1');
  return new Promise(function (resolve, reject) {
    var child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', worker, '-Action', action], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    var output = '', tooLarge = false;
    var timer = setTimeout(function () { child.kill(); reject(new Error('Время ожидания истекло. Для отправленного задания используйте «Проверить», не отправляйте его повторно.')); }, action === 'Download' ? 360000 : 150000);
    child.stdout.on('data', function (chunk) { if (output.length < 8 * 1024 * 1024) output += chunk.toString('utf8'); else { tooLarge = true; child.kill(); } });
    // Never forward child stderr: PowerShell and network errors may contain request data.
    child.stderr.on('data', function () {});
    child.stdin.on('error', function () {});
    child.on('error', function () { clearTimeout(timer); reject(new Error('Не удалось запустить локальный обработчик Windows.')); });
    child.on('close', function () {
      clearTimeout(timer);
      if (tooLarge) return reject(new Error('Ответ каталога слишком большой.'));
      try {
        var result = JSON.parse(output.replace(/^\uFEFF/, '').trim());
        if (!result.ok) return reject(new Error(message(result.code, result.status)));
        resolve(result);
      } catch (_) { reject(new Error('Локальный обработчик не вернул корректный ответ.')); }
    });
    child.stdin.end(JSON.stringify(data || {}));
  });
};
function message(code, status) {
  var messages = {
    NO_KEY: 'Введите и сохраните ключ OpenRouter в настройках.',
    KEY_STORAGE: 'Windows не смогла сохранить или открыть ключ. Введите его заново.',
    INVALID_KEY: 'Проверьте формат ключа OpenRouter.',
    INVALID_INPUT: 'Проверьте параметры и вложение.',
    NETWORK: 'Не удалось связаться с OpenRouter. Проверьте интернет; отправка автоматически не повторяется.',
    DOWNLOAD: 'Не удалось скачать видео. Нажмите «Проверить / скачать» в истории.',
    API: ({401:'OpenRouter отклонил ключ. Проверьте его в настройках.',402:'Недостаточно средств на OpenRouter.',403:'OpenRouter запретил запрос.',404:'API или задание недоступно (404).',413:'Вложение слишком большое.',429:'Лимит запросов OpenRouter. Повторите проверку позже.',400:'Модель отклонила параметры или изображение. Проверьте настройки и попробуйте PNG/JPG.',500:'Ошибка OpenRouter. Отправка автоматически не повторяется.',503:'OpenRouter временно недоступен.'})[status] || 'Запрос OpenRouter завершился ошибкой. Проверьте модель и настройки.'
  };
  return messages[code] || 'Операция не выполнена. Проверьте настройки.';
}
function directories(projectPath) {
  if (!projectPath || !/\.aepx?$/i.test(projectPath)) throw new Error('Сначала сохраните проект AE.');
  var root = path.join(path.dirname(projectPath), path.basename(projectPath, path.extname(projectPath)) + '.aiflow');
  var out = { root: root, inputs: path.join(root, 'inputs'), outputs: path.join(root, 'outputs'), ledger: path.join(root, 'ledger.json') };
  [out.root, out.inputs, out.outputs].forEach(function (p) { fs.mkdirSync(p, { recursive: true }); });
  return out;
}
function readLedger(projectPath) {
  var file = directories(projectPath).ledger;
  if (!fs.existsSync(file)) return { version: 1, jobs: [] };
  try {
    var value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (value.version !== 1 || !Array.isArray(value.jobs)) throw new Error();
    return value;
  } catch (_) { throw new Error('История проекта повреждена. Файл ledger.json сохранён без изменений.'); }
}
function saveLedger(projectPath, ledger) {
  var file = directories(projectPath).ledger, temp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(ledger, null, 2), { encoding: 'utf8', mode: 384 });
  fs.renameSync(temp, file);
}
function updateJob(projectPath, id, updates) {
  var ledger = readLedger(projectPath), job = ledger.jobs.filter(function (j) { return j.localId === id; })[0];
  if (!job) throw new Error('Задание не найдено в истории.');
  Object.keys(updates).forEach(function (key) { job[key] = updates[key]; });
  saveLedger(projectPath, ledger); return job;
}
function addJob(projectPath, target, model, settings, estimate) {
  var ledger = readLedger(projectPath);
  var job = { localId: crypto.randomBytes(10).toString('hex'), jobId: null, createdAt: new Date().toISOString(), state: 'submitting', model: model.id,
    duration: Number(settings.duration) || null, estimate: estimate ? estimate.usd : null, cost: null, target: target, file: null, imported: false };
  ledger.jobs.push(job); saveLedger(projectPath, ledger); return job;
}
function totals(ledger) {
  var seen = {}, sum = 0, unknown = 0;
  ledger.jobs.forEach(function (job) {
    var id = job.jobId || job.localId;
    if (seen[id]) return; seen[id] = true;
    if (typeof job.cost === 'number' && isFinite(job.cost) && job.cost >= 0) sum += job.cost;
    else if (job.state !== 'rejected') unknown++;
  });
  return { usd: sum, unknown: unknown };
}
function image(file) {
  var types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
  var mime = types[path.extname(file).toLowerCase()];
  if (!mime) throw new Error('MVP принимает PNG, JPG и WEBP. Для видео возьмите кадр из AE.');
  var stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 12 * 1024 * 1024) throw new Error('Изображение должно быть не больше 12 МБ.');
  var data = fs.readFileSync(file);
  var png = data.length >= 24 && data.slice(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  var jpeg = data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255;
  var webp = data.length >= 12 && data.toString('ascii',0,4) === 'RIFF' && data.toString('ascii',8,12) === 'WEBP';
  if (!(mime === 'image/png' && png || mime === 'image/jpeg' && jpeg || mime === 'image/webp' && webp)) throw new Error('Содержимое файла не соответствует формату изображения.');
  return { uri: 'data:' + mime + ';base64,' + data.toString('base64'), bytes: stat.size, name: path.basename(file) };
}
function waitForImage(file) {
  return new Promise(function (resolve, reject) {
    var started = Date.now(), lastSize = -1;
    function check() {
      try {
        var size = fs.statSync(file).size;
        if (size > 0 && size === lastSize) { image(file); resolve(); return; }
        lastSize = size;
      } catch (_) {}
      if (Date.now() - started > 15000) { reject(new Error('AE не создал готовый кадр. Проверьте разрешение на запись файлов.')); return; }
      setTimeout(check, 150);
    }
    check();
  });
}
module.exports = { Backend: Backend, directories: directories, readLedger: readLedger, saveLedger: saveLedger, addJob: addJob, updateJob: updateJob, totals: totals, image: image, waitForImage: waitForImage };
