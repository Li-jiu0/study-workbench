# -*- coding: utf-8 -*-
# 主理人独立生产复核（只读）：不依赖部署脚本自述
import subprocess, os, re, hashlib, json

T = r'D:\下载的文件\学习工作台'
PLINK = os.path.join(T, 'tools', 'plink.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
out = []

# 凭据：只取不打印
src = open(os.path.join(T, 'upload_v23.ps1'), encoding='utf-8', errors='replace').read()
m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
assert m, 'credential regex failed'
PASS, HOST = m.group(1), m.group(2)
out.append('credential: OK (host=%s)' % HOST)

REMOTE = r'''cd /opt/study-workbench/web && python3 - <<'PYEOF'
import io, os, re, sqlite3, subprocess, collections, hashlib
print('--- service ---')
print('is_active=', subprocess.run(['systemctl','is-active','study-workbench'],capture_output=True,text=True).stdout.strip())
print('nrestarts=', subprocess.run(['systemctl','show','-p','NRestarts','--value','study-workbench'],capture_output=True,text=True).stdout.strip())
print('journal_errors=', subprocess.run("journalctl -u study-workbench --since -15min | grep -icE 'traceback|exception|500 internal'",shell=True,capture_output=True,text=True).stdout.strip())
print('--- stamps (web/*.html) ---')
cnt=collections.Counter()
pages=[f for f in os.listdir('.') if f.endswith('.html')]
for f in pages:
    b=io.open(f,'rb').read()
    for mm in re.finditer(rb'\?v=[0-9A-Za-z_\-\.]+', b):
        cnt[mm.group().decode()]+=1
print('html_total=', len(pages))
for k,v in sorted(cnt.items(), key=lambda x:-x[1]):
    print('   %-24s %d' % (k,v))
print('double_suffix=', sum(io.open(f,'rb').read().count(b'.js.js?v=') for f in pages))
print('--- endpoints (curl codes) ---')
for url,label in [('http://127.0.0.1/','root_html'),('http://127.0.0.1:8000/api/health','api_health'),
                  ('http://127.0.0.1:8000/api/chat/conversations','conversations_noauth'),
                  ('http://127.0.0.1:8000/api/friends','friends_noauth'),
                  ('http://127.0.0.1:8000/api/groups','groups_noauth')]:
    code=subprocess.run(['curl','-s','-o','/dev/null','-w','%{http_code}',url],capture_output=True,text=True).stdout.strip()
    print('   %-22s %s' % (label, code))
print('--- new pages ---')
import urllib.parse
for f in ['我的文件.html','导入题库.html','演示.html','个人中心.html','登录.html']:
    url='http://127.0.0.1/'+urllib.parse.quote(f)
    code=subprocess.run(['curl','-s','-o','/dev/null','-w','%{http_code}',url],capture_output=True,text=True).stdout.strip()
    body=subprocess.run(['curl','-s',url],capture_output=True).stdout
    print('   %-16s code=%s bytes=%d' % (f, code, len(body)))
print('--- db ---')
c=sqlite3.connect('/opt/study-workbench/server/data.db')
print('users=', c.execute('select count(*) from users').fetchone()[0])
print('friends=', c.execute('select count(*) from friends').fetchone()[0])
print('messages=', c.execute('select count(*) from messages').fetchone()[0])
row=c.execute("select count(*) from sqlite_master where type='table' and name='friend_remarks'").fetchone()[0]
print('friend_remarks_table=', row)
print('friend_remarks_rows=', c.execute('select count(*) from friend_remarks').fetchone()[0])
ddl=c.execute("select sql from sqlite_master where name='friend_remarks'").fetchone()[0]
print('ddl=', re.sub(r'\s+',' ',ddl))
print('r72_tmp_accounts=', c.execute("select count(*) from users where username like 'r72%'").fetchone()[0])
print('users_maxid=', c.execute('select max(id) from users').fetchone()[0])
print('--- server files md5 ---')
for f in ['database.py','schemas.py','routers/chat.py','routers/friends.py','routers/groups.py']:
    p='/opt/study-workbench/server/'+f
    print('   %-22s %s' % (f, hashlib.md5(io.open(p,'rb').read()).hexdigest()))
print('--- content probes (production bodies) ---')
def cnt(path, needle):
    b=io.open(path,'rb').read() if os.path.exists(path) else b''
    return b.count(needle.encode('utf-8'))
print('   chat_local_conversations=', cnt('assets/chat-local.js','/api/chat/conversations'))
print('   app_androidbridge=', cnt('assets/app.js','AndroidBridge.notify'))
print('   importer_register=', cnt('assets/importer.js','xtFilesRegister'))
print('   myfiles_xtFilesRender=', cnt('我的文件.html','xtFilesRender'))
print('   more_chuanyue=', cnt('更多.html','穿越英语'))
print('   profile_xtFolio=', cnt('个人中心.html','xtFolio'))
print('   login_wish=', cnt('登录.html','祝君一切安好'))
PYEOF'''

r = subprocess.run([PLINK, '-batch', '-ssh', 'root@' + HOST, '-pw', PASS, '-hostkey', HOSTKEY, REMOTE],
                   capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=300)
out.append('plink rc=%d' % r.returncode)
out.append((r.stdout or '').strip())
if (r.stderr or '').strip():
    out.append('--- stderr ---')
    out.append((r.stderr or '').strip()[:600])

# 本地 md5 对照
out.append('--- local md5 (对照) ---')
for rel in ['server/database.py', 'server/schemas.py', 'server/routers/chat.py', 'server/routers/friends.py', 'server/routers/groups.py']:
    raw = open(os.path.join(T, rel), 'rb').read()
    out.append('   %-24s %s' % (rel, hashlib.md5(raw).hexdigest()))

open(os.path.join(T, '_r72_lead_prod_verify.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('DONE')
