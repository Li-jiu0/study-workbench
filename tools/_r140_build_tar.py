# -*- coding: utf-8 -*-
"""R140 发版：把 web 侧本轮变更打成 tar.gz + 生成 md5 清单。

变更集（1.39 → 1.40 中「网页端仍需上传」的部分；R11/R11j/k/m 的内容早已上线）：
  web/关于.html            —— xt-update.js 戳 20260924a → 20260925a
  web/更新.html            —— 同上
  web/更多.html            —— 同上
  web/assets/xt-update.js  —— CURRENT_VERSION 1.39 → 1.40
  server/routers/version.json —— 1.40 / 41 / 星途-1.40.apk + notes/changelog

另外把构建好的 APK 复制为 web/static/apk/星途-1.40.apk（bump 脚本约定的产物路径）。
硬排除：*.apk 不进 tar（单独走 APK 上传通道）。
"""
import os, io, json, gzip, tarfile, shutil, hashlib

ROOT = r'D:\下载的文件\学习工作台'
assert os.path.isdir(os.path.join(ROOT, '.git')), 'ROOT/.git 不是目录 → 可能是 worktree，终止'
assert ROOT == r'D:\下载的文件\学习工作台', 'ROOT 字面量不匹配，终止'

MEMBERS = [
    ('web/关于.html', '关于.html'),
    ('web/更新.html', '更新.html'),
    ('web/更多.html', '更多.html'),
    ('web/assets/xt-update.js', 'assets/xt-update.js'),
    ('server/routers/version.json', 'server/routers/version.json'),
]

TAR = os.path.join(ROOT, 'tools', '_r140_deploy.tar.gz')
MANIFEST = os.path.join(ROOT, 'tools', '_r140_manifest.json')

md5 = {}
missing = []
for arc, src in MEMBERS:
    p = os.path.join(ROOT, src.replace('/', os.sep))
    if not os.path.isfile(p):
        missing.append(src)
        continue
    md5[arc] = hashlib.md5(open(p, 'rb').read()).hexdigest()
if missing:
    raise SystemExit('✖ 缺文件: %s' % missing)
assert not any(a.endswith(('.apk',)) for a in md5), '清单混入 APK'

# ---- 写 tar.gz（保持 arcname = web/... 以便远端直接 tar xzf 到项目根）----
with tarfile.open(TAR, 'w:gz') as tf:
    for arc, src in MEMBERS:
        p = os.path.join(ROOT, src.replace('/', os.sep))
        ti = tf.gettarinfo(p, arcname=arc)
        ti.mtime = 1758456000  # 固定 mtime，保证可复现
        ti.uid = ti.gid = 0
        ti.uname = ti.gname = 'root'
        with open(p, 'rb') as fh:
            tf.addfile(ti, fh)

# ---- APK 落 canonical 路径 ----
APK_SRC = os.path.join(ROOT, '星途-安卓App.apk')
APK_DST = os.path.join(ROOT, 'web', 'static', 'apk', '星途-1.40.apk')
os.makedirs(os.path.dirname(APK_DST), exist_ok=True)
shutil.copy2(APK_SRC, APK_DST)
apk_md5 = hashlib.md5(open(APK_DST, 'rb').read()).hexdigest()

json.dump({'md5': md5, 'apk': '星途-1.40.apk', 'apkMd5': apk_md5},
          io.open(MANIFEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

print('tar     =', TAR, os.path.getsize(TAR), 'bytes')
print('tar md5 =', hashlib.md5(open(TAR, 'rb').read()).hexdigest())
print('apk     =', APK_DST, os.path.getsize(APK_DST), 'bytes')
print('apk md5 =', apk_md5)
for k, v in sorted(md5.items()):
    print('  %-32s %s' % (k, v))
print('OK')
