// R143 + R144 批次：对改动过的 HTML 内联脚本 + JS 资源 + version.json 做语法门槛（只解析不执行）。
// 运行：node tools/verifier/_r141_syntax.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = 'D:/下载的文件/学习工作台';
// R143/R144 改动涉及的全部页面 + 发版同步页
const HTML = ['私聊.html', '个人资料.html', '关于.html', '更多.html', '更新.html', '协议.html',
  'live-location.html', '个人中心.html', '数据管理.html', '日志.html', '动态空间.html',
  '我的动态.html', '朋友圈发布.html'];
const JS = ['assets/chat-local.js', 'assets/xt-profile.js', 'assets/xt-update.js', 'assets/xt-moments.css'];

let bad = 0, ok = 0;

function check(label, code) {
  try { new vm.Script(code, { filename: label }); ok++; }
  catch (e) { bad++; console.log('SYNTAX FAIL', label, '::', e.message); }
}

for (const rel of JS) {
  if (/\.css$/.test(rel)) continue;              // CSS 不走 JS 语法门禁
  check(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

for (const rel of HTML) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, i = 0, inline = 0;
  while ((m = re.exec(html)) !== null) {
    i++;
    const attrs = m[1] || '';
    if (/\bsrc\s*=/i.test(attrs)) continue;           // 外链脚本单独检
    const type = (/type\s*=\s*"([^"]*)"/i.exec(attrs) || [])[1] || '';
    if (type && !/javascript|module/i.test(type)) continue;
    inline++;
    check(rel + ' #inline' + i, m[2]);
  }
  console.log('  ' + rel + ' 内联脚本块 ' + inline + ' 个');
}

// version.json：JSON 合法 + 关键字段符合 1.41 口径
try {
  const raw = fs.readFileSync(path.join(ROOT, 'server/routers/version.json'), 'utf8');
  const v = JSON.parse(raw);
  const want = (v.version === '1.41' && v.versionCode === 42 &&
    v.apkFileName === '星途-1.41.apk' && Array.isArray(v.notes) && v.notes.length > 0 &&
    Array.isArray(v.changelog) && v.changelog[0] && v.changelog[0].version === 'v1.41' &&
    Array.isArray(v.changelog[0].notes) && v.changelog[0].notes.length > 0 &&
    v.changelog.length >= 2 && v.changelog[1].version === 'v1.40');
  if (want) { ok++; console.log('  version.json 1.41/42/星途-1.41.apk + changelog[0]=v1.41 OK'); }
  else { bad++; console.log('SYNTAX FAIL version.json 字段口径不符 ->', JSON.stringify({ version: v.version, versionCode: v.versionCode, apk: v.apkFileName, c0: v.changelog && v.changelog[0] && v.changelog[0].version })); }
} catch (e) { bad++; console.log('SYNTAX FAIL version.json 解析失败 ::', e.message); }

// xt-update.js：CURRENT_VERSION 必须是 1.41
try {
  const xu = fs.readFileSync(path.join(ROOT, 'assets/xt-update.js'), 'utf8');
  const mm = /CURRENT_VERSION\s*=\s*'([^']*)'/.exec(xu);
  if (mm && mm[1] === '1.41') { ok++; console.log('  xt-update.js CURRENT_VERSION=1.41 OK'); }
  else { bad++; console.log('SYNTAX FAIL xt-update.js CURRENT_VERSION=' + (mm ? mm[1] : '?')); }
} catch (e) { bad++; console.log('SYNTAX FAIL xt-update.js 读取失败 ::', e.message); }

console.log('OK=' + ok + ' FAIL=' + bad);
console.log(bad === 0 ? 'R143R144_SYNTAX_ALL_PASS' : 'R143R144_SYNTAX_HAS_FAIL');
process.exit(bad === 0 ? 0 : 1);
