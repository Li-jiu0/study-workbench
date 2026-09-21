# -*- coding: utf-8 -*-
# R73c 阶段二-1：后端差异预检（下载服务器版 -> 三层比对）
import os, re, subprocess, sys, io, hashlib
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = r'D:\下载的文件\学习工作台'
src = open(os.path.join(ROOT, 'upload_v23.ps1'), encoding='utf-8').read()
m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
PASS, HOST = m.group(1), m.group(2)
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HK = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
TMP = r'C:\Users\ATM\AppData\Local\Temp\r73c_pre'
os.makedirs(TMP, exist_ok=True)

FILES = ['server/config.py', 'server/database.py', 'server/rate_limit.py',
         'server/routers/admin.py', 'server/routers/auth.py', 'server/routers/moments.py',
         'server/schemas.py', 'server/mailer.py']

# 1) 下载服务器版（ASCII 临时名，避免中文/编码坑——本批全 ASCII 路径，直接下）
for f in FILES:
    dst = os.path.join(TMP, f.replace('/', '__') + '.srv')
    r = subprocess.run([PSCP, '-pw', PASS, '-batch', '-hostkey', HK,
                        'root@%s:/opt/study-workbench/%s' % (HOST, f), dst],
                       capture_output=True, timeout=60)
    print('%-28s %s' % (f, 'DOWN %dB' % os.path.getsize(dst) if os.path.exists(dst) else 'MISSING(server无此文件)'))

# 2) 三层比对
def norm_lines(t):
    out = []
    for ln in t.splitlines():
        s = ln.strip()
        if s and not s.startswith('#'):
            out.append(s)
    return set(out)

def defs(t):
    return set(re.findall(r'^(?:class|def|async def)\s+(\w+)', t, re.M)) | \
           set(re.findall(r'@router\.(get|post|put|delete|patch)\("([^"]+)"', t))

for f in FILES:
    local_p = os.path.join(ROOT, f)
    srv_p = os.path.join(TMP, f.replace('/', '__') + '.srv')
    if not os.path.exists(local_p):
        print('!! 本地缺', f); continue
    if not os.path.exists(srv_p):
        print('== %s : 服务器无此文件 -> 将全新上传' % f); continue
    lt = open(local_p, 'rb').read().decode('utf-8', 'replace')
    st = open(srv_p, 'rb').read().decode('utf-8', 'replace')
    if hashlib.md5(lt.encode()).hexdigest() == hashlib.md5(st.encode()).hexdigest():
        print('== %s : 完全一致' % f); continue
    d_l, d_s = defs(lt), defs(st)
    only_local = d_l - d_s; only_srv = d_s - d_l
    n_l, n_s = norm_lines(lt), norm_lines(st)
    code_only_local = len(n_l - n_s); code_only_srv = len(n_s - n_l)
    def fmt(s):
        strs = sorted(x for x in s if isinstance(x, str))
        tups = sorted(x for x in s if isinstance(x, tuple))
        return strs + ['%s %s' % t for t in tups]
    print('== %s : 定义 仅本地=%s 仅服务器=%s | 实质行 仅本地=%d 仅服务器=%d | 本地%dB 服务器%dB' % (
        f, fmt(only_local) if only_local else '-', fmt(only_srv) if only_srv else '-',
        code_only_local, code_only_srv, len(lt.encode()), len(st.encode())))
    if only_srv:
        print('   ⚠️ 服务器有本地没有的定义，覆盖前必须合并！')
