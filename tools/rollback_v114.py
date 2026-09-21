# -*- coding: utf-8 -*-
"""回滚到 v1.14：入口/登录跳转/版本号/Manifest 全部恢复。
app.js 数据层函数和 学途.html 保留但不再被访问，不影响旧页面。"""
import io, glob

# 1) MainActivity 入口
p = r'D:\下载的文件\学习工作台\android\java\com\study\workbench\MainActivity.java'
with io.open(p, encoding='utf-8') as f:
    src = f.read()
old = 'web.loadUrl("file:///android_asset/" + Uri.encode("学途.html"));'
new = 'web.loadUrl("file:///android_asset/" + Uri.encode("学习工作台.html"));'
assert old in src
src = src.replace(old, new, 1)
# 注释也回滚
src = src.replace(
    '// 经典 file:// 加载：入口页(asset 根目录的 学途.html 学习中枢；未登录会自动跳 登录.html)\n        // 旧版首页 学习工作台.html 仍可从学途「我的」页进入。',
    '// 经典 file:// 加载：入口页(asset 根目录的学习工作台.html；未登录会自动跳 登录.html)'
)
with io.open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print('OK: MainActivity entry -> 学习工作台.html')

# 2) 登录.html 跳转
p2 = r'D:\下载的文件\学习工作台\登录.html'
with io.open(p2, encoding='utf-8') as f:
    h = f.read()
h = h.replace("location.href = '学途.html'", "location.href = '学习工作台.html'")
with io.open(p2, 'w', encoding='utf-8') as f:
    f.write(h)
print('OK: login redirect -> 学习工作台.html')

# 3) 19 个 HTML 版本号 t -> s
cnt = 0
for f in glob.glob(r'D:\下载的文件\学习工作台\*.html'):
    with io.open(f, encoding='utf-8') as fh:
        s = fh.read()
    ns = s.replace('assets/app.js?v=20260913t', 'assets/app.js?v=20260913s')
    if ns != s:
        with io.open(f, 'w', encoding='utf-8') as fh:
            fh.write(ns)
        cnt += 1
print('OK: HTML version bumps back to 20260913s:', cnt)

# 4) Manifest
p3 = r'D:\下载的文件\学习工作台\android\AndroidManifest.xml'
with io.open(p3, encoding='utf-8') as f:
    m = f.read()
m = m.replace('android:versionCode="16"', 'android:versionCode="15"')
m = m.replace('android:versionName="1.15"', 'android:versionName="1.14"')
with io.open(p3, 'w', encoding='utf-8') as f:
    f.write(m)
print('OK: Manifest -> versionCode 15 / versionName 1.14')
