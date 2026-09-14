const fs = require('fs');
const { execSync } = require('child_process');
function run(cmd) { try { return execSync(cmd).toString(); } catch (e) { return 'ERR ' + e.message; } }
console.log('=== deploy scripts 20260914 ===');
try { console.log(fs.readdirSync('tools').filter(n => /deploy_update_2026091/.test(n)).join('\n')); } catch (e) {}
console.log('\n=== current version stamps in pages ===');
for (const f of ['学习工作台.html', '私聊.html', '设置.html', '四级备考.html']) {
  try {
    const s = fs.readFileSync(f, 'utf8');
    const m = Array.from(new Set(s.match(/\?v=(\d{8}[a-z]?)/g) || []));
    console.log(f + ' -> ' + (m.join(',') || '(none)'));
  } catch (e) { console.log(f + ' err'); }
}
console.log('\n=== chat-local / admin-contact refs ===');
console.log(run('git grep -l "chat-local.js" -- "*.html"').trim().split(/\r?\n/).join(' | '));
console.log(run('git grep -l "admin-contact.js" -- "*.html"').trim().split(/\r?\n/).join(' | '));
console.log('\n=== git status (modified tracked) ===');
console.log(run('git status --short').split(/\r?\n/).filter(l => /^ ?M/.test(l)).join('\n') || '(no modified)');
console.log('\n=== frontend check log present? ===');
try { console.log('log size=' + fs.statSync('tools/qa/_r44_frontend_check.log').size); } catch (e) { console.log('no log'); }
