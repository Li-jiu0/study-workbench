# -*- coding: utf-8 -*-
"""R73n APK 验收 v2：自动定位 ai-service 路径前缀"""
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
svc_names = [n for n in names if 'ai-service' in n or 'ai-config' in n]
out.append('ai 相关条目: %s' % svc_names)
home_names = [n for n in names if '学习工作台' in n]
out.append('入口页条目: %s' % home_names)

if svc_names:
    prefix = svc_names[0].split('ai-service.js')[0]
    svc = z.read(prefix + 'ai-service.js').decode('utf-8', 'ignore')
    st = z.read(prefix + 'ai-settings.js').decode('utf-8', 'ignore')
    cfg = z.read(prefix + 'ai-config.js').decode('utf-8', 'ignore')
    out.append('包内 ai-service.js HEALTH_TIMEOUT_PROXY: %d' % svc.count('HEALTH_TIMEOUT_PROXY'))
    out.append('包内 ai-settings.js 新文案: %d' % st.count('平台可达但响应慢'))
    out.append('包内 ai-config.js siliconflow 平台残留: %d' % cfg.count('"siliconflow"'))
if home_names:
    home = z.read(home_names[0]).decode('utf-8', 'ignore')
    out.append('包内 入口页 新戳 20260918a: %d' % home.count('20260918a'))
out.append('APK size: %d bytes' % os.path.getsize(APK))
ok = (('HEALTH_TIMEOUT_PROXY' in '\n'.join(out)) and
      ('siliconflow 平台残留: 0' in '\n'.join(out)) and
      ('新戳 20260918a: ' in '\n'.join(out)) and ': 0' not in '\n'.join(out).split('新戳')[1][:40])
out.append('RESULT: ' + ('PASS' if ok else 'CHECK'))
io.open(r'C:\Users\ATM\_r73n_apk_verify2.txt', 'w', encoding='utf-8').write('\n'.join(out))
print(out[-1])
