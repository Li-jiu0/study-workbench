# -*- coding: utf-8 -*-
"""R73n APK 验收：badging 版本 + 包内关键 JS 符号 + .bak 残留"""
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

svc = z.read('assets/ai-service.js').decode('utf-8', 'ignore')
st = z.read('assets/ai-settings.js').decode('utf-8', 'ignore')
cfg = z.read('assets/ai-config.js').decode('utf-8', 'ignore')
out.append('包内 ai-service.js HEALTH_TIMEOUT_PROXY: %d' % svc.count('HEALTH_TIMEOUT_PROXY'))
out.append('包内 ai-settings.js 新文案: %d' % st.count('平台可达但响应慢'))
out.append('包内 ai-config.js siliconflow 平台残留: %d' % cfg.count('"siliconflow"'))
home = z.read('学习工作台.html').decode('utf-8', 'ignore')
out.append('包内 学习工作台.html 新戳 20260918a: %d' % home.count('20260918a'))
out.append('APK size: %d bytes' % os.path.getsize(APK))
io.open(r'C:\Users\ATM\_r73n_apk_verify.txt', 'w', encoding='utf-8').write('\n'.join(out))
