/* R93-4 debug2: standalone eval of videoUrlSplit + renderMarkdown from real file */
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/下载的文件/学习工作台';
const src = fs.readFileSync(path.join(ROOT, 'assets/ai-page.js'), 'utf8');
const OUT = [];

function grabFn(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) { return null; }
  let i = src.indexOf('{', start), depth = 0, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return src.slice(start, end);
}
const esc = grabFn('escHtml');
const split = grabFn('videoUrlSplit');
const inline = grabFn('inlineMd');
const rend = grabFn('renderMarkdown');
OUT.push('grabbed: esc=' + !!esc + ' split=' + !!split + ' inline=' + !!inline + ' rend=' + !!rend);
OUT.push('=== renderMarkdown source ===');
OUT.push(rend);
OUT.push('=== videoUrlSplit source ===');
OUT.push(split);

const factory = new Function(esc + '\n' + split + '\n' + inline + '\n' + rend + '\n' +
  'return { split: videoUrlSplit, render: renderMarkdown };');
const api = factory();

const OLD_URL = 'https://ark-content-generation.tos-cn-beijing.volces.com/old-999.mp4?X-Tos-Expires=123';
const line = '🎬 视频已生成（链接约 24 小时内有效，请及时观看 / 保存）：' + OLD_URL;
OUT.push('--- videoUrlSplit(line) ---');
OUT.push(JSON.stringify(api.split(line)));
OUT.push('--- renderMarkdown(line) ---');
OUT.push(api.render(line));
OUT.push('--- renderMarkdown(bare URL) ---');
OUT.push(api.render(OLD_URL));
fs.writeFileSync(path.join(ROOT, 'tools/qa/_r93d_dbg2.txt'), OUT.join('\n'), 'utf8');
