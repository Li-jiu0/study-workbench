const fs = require('fs');
const path = require('path');

const ROOT = 'D:/下载的文件/学习工作台';
const SKIP_DIRS = new Set(['备份', 'tools', '_w2t1_img', '.qa', '.git', 'node_modules']);
const SKIP_PAT = /\.bak-|\.backup-|pre-corrupt|-\d{8}|\.backup/;

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) { walk(p, out); continue; }
    if (!name.endsWith('.html')) continue;
    if (SKIP_PAT.test(name)) continue;
    out.push(p);
  }
}

const files = [];
walk(ROOT, files);
files.sort();

const lines = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  const hasSidebar = /<nav class="sidebar"/.test(src);
  const hasBottom = /class="bottom-nav"/.test(src);
  const hasToolTab = /onclick="location\.href='工具\.html'"/.test(src);
  const hasAiTab = /href='AI\.html'|href="AI\.html"/.test(src);
  // count bottom nav items in first bottom-nav block
  let bn = [];
  const mi = src.indexOf('class="bottom-nav"');
  if (mi >= 0) {
    const seg = src.slice(mi, mi + 2500);
    bn = (seg.match(/bottom-nav-item/g) || []);
  }
  let navCount = (src.match(/class="nav-item"/g) || []).length;
  lines.push(`${rel}\t sidebar=${hasSidebar?'Y':'N'} navItems=${navCount}\t bottom=${hasBottom?'Y':'N'} bnItems=${bn.length}\t 工具tab=${hasToolTab?'Y':'N'} AIref=${hasAiTab?'Y':'N'}`);
}
fs.writeFileSync('D:/下载的文件/学习工作台/tools/qa/_nav_scan.txt', lines.join('\n'), 'utf8');
console.log('done', files.length);
