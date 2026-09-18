const fs = require('fs');
const path = require('path');
const ROOT = 'D:\\下载的文件\\学习工作台';

const TARGETS = [
  '学习工作台.html', '行测刷题.html', '申论刷题.html', '四级备考.html', '四级词汇.html',
  '面试题库.html', 'AI模拟面试.html', '错题本.html', '个人中心.html', '动态.html',
  '工具.html', '更多.html', '设置.html', '时政热点.html', '高情商表达.html',
  '场景话术库.html', '万能金句库.html', '商务礼仪.html', '商务礼仪面试.html',
  'PPT训练.html', 'PPT版式库.html', 'PPT案例拆解.html', '企业定向库.html',
  '央国企笔试.html', '私聊.html', '学习博客.html', 'blog_wechat.html', '管理员.html'
];

const BLOCK = [
  '<script src="assets/ai-config.js"></script>',
  '<script src="assets/ai-presets.js"></script>',
  '<script src="assets/ai-service.js"></script>'
];

const out = [];
let ok = 0, skipped = [], failed = [];

for (const f of TARGETS) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { failed.push(f + ' :: FILE NOT FOUND'); continue; }
  const buf = fs.readFileSync(p);
  const hadBOM = buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
  let src = buf.toString('utf8');
  if (src.includes('assets/ai-service.js')) { skipped.push(f + ' :: already has ai-service.js'); continue; }
  if (src.includes('assets/ai-config.js')) { skipped.push(f + ' :: already has ai-config.js'); continue; }
  if (src.includes('assets/ai-presets.js')) { skipped.push(f + ' :: already has ai-presets.js'); continue; }

  const bodyTag = '</body>';
  const bodyCount = src.split(bodyTag).length - 1;
  const htmlTag = '</html>';
  let anchor, where;
  if (bodyCount >= 1) {
    anchor = bodyTag; where = 'before </body>';
  } else if (src.includes(htmlTag)) {
    anchor = htmlTag; where = 'before </html> (no </body>)';
  } else {
    failed.push(f + ' :: no </body> and no </html>'); continue;
  }

  const eol = src.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  // find last anchor index
  const idx = src.lastIndexOf(anchor);
  // guard: anchor must not be inside a script string -> ensure no unclosed <script after it ... simple check
  const before = src.slice(0, idx);
  const after = src.slice(idx);
  const openScript = (before.match(/<script\b/gi) || []).length;
  const closeScript = (before.match(/<\/script>/gi) || []).length;
  if (openScript !== closeScript) {
    failed.push(f + ' :: unbalanced script tags before anchor (' + openScript + '/' + closeScript + ')'); continue;
  }

  const insert = BLOCK.map(l => l).join(eol) + eol;
  let newSrc = src.slice(0, idx) + insert + src.slice(idx);
  // write back preserving BOM
  let outBuf = Buffer.from(newSrc, 'utf8');
  if (hadBOM) outBuf = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), outBuf]);
  fs.writeFileSync(p, outBuf);
  ok++;
  out.push('OK  ' + f + '  [' + where + ', bodyCount=' + bodyCount + ', eol=' + (eol === '\r\n' ? 'CRLF' : 'LF') + ', bom=' + hadBOM + ']');
}

out.unshift('MODIFIED=' + ok + '  SKIPPED=' + skipped.length + '  FAILED=' + failed.length);
if (skipped.length) out.push('-- SKIPPED --\n' + skipped.join('\n'));
if (failed.length) out.push('-- FAILED --\n' + failed.join('\n'));
fs.writeFileSync(path.join(ROOT, '_wire_apply.txt'), out.join('\n'), 'utf8');
