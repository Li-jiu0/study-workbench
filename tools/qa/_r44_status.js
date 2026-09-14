const fs = require('fs');
const { execSync } = require('child_process');
function run(cmd) { try { return execSync(cmd).toString(); } catch (e) { return 'ERR ' + e.message; } }
console.log('=== git status (short) ===');
console.log(run('git status --short').trim() || '(no changes)');
console.log('\n=== mtimes ===');
for (const f of ['assets/chat-local.js', 'assets/admin-contact.js', 'server/routers/admin.py', 'server/main.py', 'tools/deploy_update_20260914c.py']) {
  try {
    const st = fs.statSync(f);
    console.log(f + ' -> ' + st.mtime.toISOString() + '  size=' + st.size);
  } catch (e) { console.log(f + ' -> MISSING'); }
}
console.log('\n=== new qa logs ===');
try {
  const files = fs.readdirSync('tools/qa').filter(n => /r44|0914c/i.test(n));
  console.log(files.join('\n') || '(none)');
} catch (e) { console.log('readdir err'); }
