const fs = require('fs');
const ROOT = 'D:/下载的文件/学习工作台';
const out = [];
function w(s){ out.push(s); }
function read(rel){ try { return fs.readFileSync(ROOT + '/' + rel, 'utf8'); } catch(e){ return null; } }
function eol(rel){
  const b = fs.readFileSync(ROOT + '/' + rel);
  const crlf = (b.toString('binary').match(/\r\n/g)||[]).length;
  const lf = (b.toString('binary').match(/\n/g)||[]).length;
  return { bytes: b.length, crlf, loneLF: lf - crlf };
}
for (const rel of ['assets/ai-settings.js','assets/ai-config.js','assets/ai-page.js','ai-settings.html','AI.html']) {
  if (fs.existsSync(ROOT + '/' + rel)) { const e = eol(rel); w(rel + ' bytes=' + e.bytes + ' CRLF=' + e.crlf + ' loneLF=' + e.loneLF); }
  else w(rel + ' MISSING');
}
const svc = read('assets/ai-settings.js');
w('');
w('===== ai-settings.js 是否存在 + 行数 =====');
if (svc) {
  w('lines=' + svc.split('\n').length);
  // 模型列表渲染线索
  for (const t of ['modelList','renderModel','ai-settings','toggle','switch','audio','localStorage','persist']) {
    w('  /'+t+'/ = ' + (svc.match(new RegExp(t,'g'))||[]).length);
  }
  w('');
  w('===== ai-settings.js audio 上下文 =====');
  const re = /audio/gi;
  let m, n=0;
  while ((m = re.exec(svc)) && n < 12) {
    const pos = m.index; const ln = svc.slice(0,pos).split('\n').length;
    const lines = svc.split('\n');
    w('  L'+ln+': '+lines[ln-1].slice(0,160));
    n++;
  }
} else w('ai-settings.js 不存在');

const page = read('assets/ai-page.js');
w('');
w('===== ai-page.js 中 audio / input.audio 现状 =====');
for (const t of ['input\\.audio','\\.audio','audio===true','audio:true','localStorage.setItem\\("ai_audio','modelAudio','audioOn']) {
  w('  /'+t+'/ = ' + (page.match(new RegExp(t,'g'))||[]).length);
}
const re2 = /audio/gi;
let m2, n2=0;
while ((m2 = re2.exec(page)) && n2 < 15) {
  const pos = m2.index; const ln = page.slice(0,pos).split('\n').length;
  const lines = page.split('\n');
  w('  L'+ln+': '+lines[ln-1].slice(0,170));
  n2++;
}
fs.writeFileSync('C:/Users/ATM/_r93_prepare_out.txt', out.join('\n'), 'utf8');
