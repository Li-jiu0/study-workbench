# -*- coding: utf-8 -*-
# 独立复核（只读，§5.0.4）：直连生产复核 行尾 / 新增符号 / 已删符号 / 带戳真实拉取 / 戳分布 / 探活
import os, io, re, subprocess

ROOT = r'D:\下载的文件\学习工作台'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
CRED = os.path.join(ROOT, 'upload_v23.ps1')
OUT = os.path.join(ROOT, 'tools', 'r72_deploy_verify_out.txt')
STAMP = '20260916S'

host = os.environ.get('SW_HOST', ''); pwd = os.environ.get('SW_PASS', '')
if not host or not pwd:
    s = io.open(CRED, encoding='utf-8', errors='replace').read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s) or \
        re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
    pwd, host = m.group(1), m.group(2)

py = "\n".join([
    "import os, io, re, hashlib",
    "W='/opt/study-workbench/web'",
    "hs=sorted([n for n in os.listdir(W) if n.lower().endswith('.html') and os.path.isfile(os.path.join(W,n))])",
    "print('PROD_HTML_COUNT=%d' % len(hs))",
    "# --- (1) 全站行尾 ---",
    "nonzero=[]",
    "for n in hs:",
    "    b=io.open(os.path.join(W,n),'rb').read()",
    "    lone=b.count(b'\\n')-b.count(b'\\r\\n')",
    "    if lone!=0: nonzero.append((n, lone))",
    "print('EOL_HTML_loneLF_nonzero=%d %s' % (len(nonzero), nonzero))",
    "def cnt(rel, tok):",
    "    p=os.path.join(W, rel)",
    "    if not os.path.exists(p): return -1",
    "    return io.open(p,'rb').read().count(tok.encode('utf-8'))",
    "# --- (2) 新增符号 ---",
    "for rel, tok in [",
    "    ('assets/importer.js','xtFilesRegister'),",
    "    ('我的文件.html','xtFilesRender'), ('我的文件.html','mfList'),",
    "    ('导入题库.html','openImporter'),",
    "    ('assets/chat-local.js','imOpenRemarkEditor'),",
    "    ('assets/api.js','apiGetChatConversations'),",
    "    ('assets/app.js','AndroidBridge.notify'),",
    "    ('assets/ai-service.js','allowPreset'),",
    "    ('assets/ai-settings.js','BATCH_CONCURRENCY'), ('assets/ai-settings.js','识图'),",
    "    ('登录.html','祝君一切安好'),",
    "]:",
    "    c=cnt(rel,tok)",
    "    print('NEWSYM %-24s %-22s = %d %s' % (rel, tok, c, 'OK' if c>=1 else '*** FAIL'))",
    "# --- (3) 已删符号 ---",
    "print('DELSYM 个人中心 xtFolioToggleFav = %d' % cnt('个人中心.html','xtFolioToggleFav'))",
    "print('DELSYM 更多 穿越英语 = %d' % cnt('更多.html','穿越英语'))",
    "tot_a=tot_b=0",
    "for n in hs:",
    "    t=io.open(os.path.join(W,n),'rb').read()",
    "    tot_a += t.count(b'data-page=\"ppt\"')",
    "    tot_b += t.count(b\"location.href='\\xe6\\xbc\\x94\\xe7\\xa4\\xba.html'\")",
    "print('DELSYM sitewide data-page=\"ppt\" = %d' % tot_a)",
    "print('DELSYM sitewide location.href little-demo = %d' % tot_b)",
    "# --- 戳分布 ---",
    "dist={}",
    "for n in hs:",
    "    t=io.open(os.path.join(W,n),'rb').read().decode('utf-8','ignore')",
    "    for m in re.finditer(r'\\?v=([0-9A-Za-z_]+)', t):",
    "        dist[m.group(1)]=dist.get(m.group(1),0)+1",
    "print('PROD_STAMP_DIST=' + repr(sorted(dist.items())))",
])
cmd = ("python3 - <<'PYEOF'\n" + py + "\nPYEOF\n"
       "echo '--- (4) 带戳真实拉取（curl）---'\n"
       "curl -s 'http://127.0.0.1/assets/app.js?v=" + STAMP + "' | grep -c 'AndroidBridge.notify'\n"
       "curl -s 'http://127.0.0.1/assets/importer.js?v=" + STAMP + "' | grep -c 'xtFilesRegister'\n"
       "echo '--- 探活 ---'\n"
       "curl -s -o /dev/null -w 'home=%{http_code}\\n' 'http://127.0.0.1/'\n"
       "curl -s -o /dev/null -w 'health=%{http_code}\\n' 'http://127.0.0.1:8000/api/health'\n"
       "echo '--- 临时 tar 是否残留 ---'\n"
       "ls -1 /tmp/frontend_r72_20260917.tar.gz 2>/dev/null && echo 'TAR_STILL_THERE' || echo 'TAR_GONE'\n")

r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@' + host, cmd],
                   capture_output=True, text=True, timeout=180, errors='replace')
res = ['RC=%d' % r.returncode, r.stdout or '', '[STDERR] ' + (r.stderr or '')]
with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(res))
print('VERIFY DONE rc=%d' % r.returncode)
