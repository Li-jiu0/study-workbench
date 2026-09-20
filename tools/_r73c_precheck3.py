# -*- coding: utf-8 -*-
# R73c 阶段二-3：本地侧对应能力核查
import os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = r'D:\下载的文件\学习工作台'
TMP = r'C:\Users\ATM\AppData\Local\Temp\r73c_pre'

def sig(path):
    return open(path, 'rb').read().decode('utf-8', 'replace')

# 1) rate_limit：本地是否有 xff 逻辑
lt = sig(os.path.join(ROOT, 'server', 'rate_limit.py'))
print('local rate_limit: xff.split=', 'xff.split' in lt, '| _last_valid_ip=', '_last_valid_ip' in lt, '| request.client.host=', 'request.client.host' in lt)

# 2) moments：本地是否有 hasMore/nextBefore/_visibility_allows/_moment_visible
lt = sig(os.path.join(ROOT, 'server', 'routers', 'moments.py'))
for k in ['hasMore', 'nextBefore', '_visibility_allows', '_moment_visible', 'and_', 'or_']:
    print('local moments: %-22s = %d' % (k, lt.count(k)))

# 3) admin：本地独有 20 行
lt = sig(os.path.join(ROOT, 'server', 'routers', 'admin.py'))
st = sig(os.path.join(TMP, 'server__routers__admin.py.srv'))
def norm(t):
    return [ln.strip() for ln in t.splitlines() if ln.strip() and not ln.strip().startswith('#')]
lset, sset = set(norm(lt)), set(norm(st))
only_local = [ln for ln in norm(lt) if ln not in sset]
print('===== admin.py 仅本地 %d 行 =====' % len(only_local))
for ln in only_local[:40]:
    print('   |', ln[:150])
