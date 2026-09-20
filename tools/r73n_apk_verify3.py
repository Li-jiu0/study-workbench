# -*- coding: utf-8 -*-
"""R73n APK 验收 v3：按 endswith 精确定位"""
import subprocess, zipfile, io, os

APK = r'D:\下载的文件\学习工作台\星途-安卓App.apk'
AAPT2 = r'C:\Users\ATM\android-build\sdk\build-tools\34.0.0\aapt2.exe'
out = []

r = subprocess.run([AAPT2, 'dump', 'badging', APK], capture_output=True)
for ln in r.stdout.decode('utf-8', 'ignore').splitlines():
    if ln.startswith('package:') or ln.startswith('application-label:'):
        out.append(ln[:160])

z = zipfile.ZipFile(APK)
names = z.namelist()
out.append('总条目: %d, bak 残留: %d' % (len(names), sum(1 for n in names if '.bak' in n.lower())))

def one(suffix):
    hits = [n for n in names if n.endswith(suffix)]
    return hits[0] if hits else None

svc_p = one('ai-service.js'); st_p = one('ai-settings.js'); cfg_p = one('ai-config.js')
home_p = one('学习工作台.html')
svc = z.read(svc_p).decode('utf-8', 'ignore') if svc_p else ''
st = z.read(st_p).decode('utf-8', 'ignore') if st_p else ''
cfg = z.read(cfg_p).decode('utf-8', 'ignore') if cfg_p else ''
home = z.read(home_p).decode('utf-8', 'ignore') if home_p else ''
out.append('svc=%s st=%s' % (svc_p, st_p))
out.append('包内 ai-service.js HEALTH_TIMEOUT_PROXY: %d' % svc.count('HEALTH_TIMEOUT_PROXY'))
out.append('包内 ai-settings.js 新文案: %d' % st.count('平台可达但响应慢'))
out.append('包内 ai-config.js siliconflow 平台残留: %d' % cfg.count('"siliconflow"'))
out.append('包内 入口页(%s) 新戳 20260918a: %d' % (home_p, home.count('20260918a')))
out.append('APK size: %d bytes' % os.path.getsize(APK))

ok = (svc.count('HEALTH_TIMEOUT_PROXY') >= 2 and st.count('平台可达但响应慢') == 1
      and cfg.count('"siliconflow"') == 0 and home.count('20260918a') >= 1)
out.append('RESULT: ' + ('PASS' if ok else 'FAIL'))
io.open(r'C:\Users\ATM\_r73n_apk_final.txt', 'w', encoding='utf-8').write('\n'.join(out))
print(out[-1])
