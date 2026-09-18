const fs = require('fs');
const path = require('path');
const ROOT = 'D:\\下载的文件\\学习工作台';
const out = [];

const SKIP_INTENTIONAL = {
  '登录.html': '登录页，刻意跳过',
  'mock_exam.html': '考试进行页，刻意跳过',
  'mock_exam_run.html': '考试进行页，刻意跳过',
  'mock_exam_result.html': '考试成绩页，刻意跳过'
};

const files = fs.readdirSync(ROOT).filter(f => f.toLowerCase().endsWith('.html')).sort();
const withSvc = [], without = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  (src.includes('assets/ai-service.js') ? withSvc : without).push(f);
}
out.push('[统计] 根目录 HTML 含 assets/ai-service.js 的文件数 = ' + withSvc.length + ' / 总 ' + files.length);
out.push('  含：' + withSvc.join(', '));
out.push('');
out.push('[未引入清单] 共 ' + without.length + ' 个：');
for (const f of without) {
  out.push('  - ' + f + ' :: ' + (SKIP_INTENTIONAL[f] || '未在任务清单内（不在指定 27+1 范围）'));
}
out.push('');

// 抽查
const SPOT = ['学习工作台.html', 'blog_wechat.html', '设置.html'];
for (const f of SPOT) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const re = /<script[^>]*assets\/ai-(config|presets|service)\.js[^>]*>/g;
  const hits = src.match(re) || [];
  const order = (src.match(/assets\/ai-(config|presets|service)\.js/g) || []).map(s => s.replace('assets/ai-', '').replace('.js', ''));
  const badAttr = hits.filter(h => /type\s*=\s*["']module|\bdefer\b|\basync\b/.test(h));
  const qv = hits.filter(h => /\?/.test(h));
  const bodyIdx = src.indexOf('</body>');
  const lastHitIdx = src.lastIndexOf('assets/ai-service.js');
  out.push('[抽查] ' + f);
  out.push('  命中 ' + hits.length + ' 个：' + hits.join(' | '));
  out.push('  顺序：' + order.join(' -> '));
  out.push('  重复引入：' + (hits.length === 3 ? '无' : '有(' + hits.length + ')'));
  out.push('  带?v=：' + (qv.length ? '有 -> ' + qv.join('|') : '无'));
  out.push('  带 module/defer/async：' + (badAttr.length ? '有 -> ' + badAttr.join('|') : '无'));
  out.push('  位于 </body> 前：' + (lastHitIdx < bodyIdx ? '是' : '否'));
  out.push('');
}

// 全量复检：所有被改页面不得有 module/defer/async/?v=
out.push('[全量复检] 新注入标签属性检查：');
let bad = 0;
for (const f of withSvc) {
  if (f === 'AI.html') continue;
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const hits = src.match(/<script[^>]*assets\/ai-(config|presets|service)\.js[^>]*>/g) || [];
  for (const h of hits) {
    if (/type\s*=\s*["']module|\bdefer\b|\basync\b|\?/.test(h)) { out.push('  !! ' + f + ' -> ' + h); bad++; }
  }
}
out.push('  异常标签数 = ' + bad);

fs.writeFileSync(path.join(ROOT, '_wire_verify.txt'), out.join('\n'), 'utf8');
