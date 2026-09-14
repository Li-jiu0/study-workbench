const { execSync } = require('child_process');
function run(cmd) { try { return execSync(cmd).toString(); } catch (e) { return 'ERR ' + e.message; } }
console.log('=== recent 20 commits ===');
console.log(run('git log --pretty=format:"%h | %ad | %s" --date=format:"%m-%d %H:%M" -20'));
console.log('\n=== branch / upstream ===');
console.log(run('git status -sb').split(/\r?\n/).slice(0, 2).join('\n'));
console.log('\n=== worktree changes ===');
const st = run('git status --short').trim();
console.log(st ? st.split(/\r?\n/).slice(0, 20).join('\n') : 'worktree clean');
console.log('\n=== latest version stamp in pages ===');
const fs = require('fs');
for (const f of ['学习工作台.html', '设置.html', '四级备考.html', '工具.html']) {
  try {
    const s = fs.readFileSync(f, 'utf8');
    const m = s.match(/\?v=(\d{8}[a-z]?)/g) || [];
    const uniq = Array.from(new Set(m));
    console.log(f + ' -> ' + uniq.join(','));
  } catch (e) { console.log(f + ' -> read err'); }
}
