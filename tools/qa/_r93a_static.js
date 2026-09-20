const fs = require('fs');
const ROOT = 'D:/下载的文件/学习工作台';
const out = [];
function w(s){ out.push(s); }
function read(rel){ return fs.readFileSync(ROOT + '/' + rel, 'utf8'); }
function eolInfo(rel){
  const b = fs.readFileSync(ROOT + '/' + rel);
  const crlf = (b.toString('binary').match(/\r\n/g) || []).length;
  const total = (b.toString('binary').match(/\n/g) || []).length;
  return { crlf, loneLF: total - crlf, bytes: b.length };
}
function ctx(code, pat, before, after, max){
  const re = typeof pat === 'string' ? new RegExp(pat, 'g') : pat;
  const lines = code.split('\n');
  let n = 0;
  re.lastIndex = 0;
  let m;
  const res = [];
  while ((m = re.exec(code)) && n < (max||20)) {
    const pos = m.index;
    const ln = code.slice(0, pos).split('\n').length;
    const startL = Math.max(0, ln - 1 - before);
    const endL = Math.min(lines.length, ln + after);
    res.push('--- L' + ln + ' (match="' + m[0] + '") ---');
    for (let i = startL; i < endL; i++) res.push('  L' + (i+1) + ': ' + lines[i].slice(0,200));
    n++;
  }
  return res;
}

w('===== 行尾 =====');
for (const rel of ['assets/ai-page.js','assets/ai-service.js','AI.html']) {
  const e = eolInfo(rel);
  w(rel + ' bytes=' + e.bytes + ' CRLF=' + e.crlf + ' loneLF=' + e.loneLF + (rel==='AI.html'?' (CRLF预期)':''));
}

const page = read('assets/ai-page.js');
const svc = read('assets/ai-service.js');
const html = read('AI.html');

w('');
w('===== A线 R92-A 路由分派 命中核验 (ai-page.js) =====');
const pageToks = ['routeCapabilityModel','predictFuncType','callAI','xtRunCapability','cap\\.run','videoUrlSplit','renderMarkdown','ai-md-video','preload="metadata"','escHtml'];
for (const t of pageToks) {
  const c = (page.match(new RegExp(t,'g'))||[]).length;
  w('  ai-page.js /' + t + '/ = ' + c);
}
w('');
w('===== A线 R92-A (ai-service.js) =====');
for (const t of ['xtRunCapability','cap\\.run','AI_SERVICE','window\\.xtRunCapability','async']) {
  const c = (svc.match(new RegExp(t,'g'))||[]).length;
  w('  ai-service.js /' + t + '/ = ' + c);
}

w('');
w('===== AI.html 版本号 ai-page.js?v= =====');
const vm = html.match(/ai-page\.js\?v=([0-9a-z]+)/g) || [];
w('  ' + JSON.stringify(vm));

w('');
w('===== 上下文: routeCapabilityModel (ai-page.js) =====');
w(ctx(page, 'routeCapabilityModel', 2, 6, 6).join('\n'));
w('');
w('===== 上下文: xtRunCapability (ai-page.js) =====');
w(ctx(page, 'xtRunCapability', 2, 4, 8).join('\n'));
w('');
w('===== 上下文: videoUrlSplit (ai-page.js) =====');
w(ctx(page, 'videoUrlSplit', 2, 12, 4).join('\n'));
w('');
w('===== 上下文: ai-md-video / renderMarkdown 视频分支 (ai-page.js) =====');
w(ctx(page, 'ai-md-video', 3, 10, 6).join('\n'));
w('');
w('===== 上下文: xtRunCapability 定义 (ai-service.js) =====');
w(ctx(svc, 'xtRunCapability\\s*=', 3, 14, 4).join('\n'));
w('');
w('===== 上下文: cap.run 分发 (ai-service.js) =====');
w(ctx(svc, 'cap\\.run', 3, 10, 6).join('\n'));
w('');
w('===== 上下文: window 导出 xtRunCapability (ai-service.js) =====');
w(ctx(svc, 'window\\.[A-Za-z_]*xtRunCapability', 1, 3, 4).join('\n'));
w(ctx(svc, 'AI_SERVICE\\s*=', 1, 4, 3).join('\n'));

fs.writeFileSync('C:/Users/ATM/_r93a_static_out.txt', out.join('\n'), 'utf8');
