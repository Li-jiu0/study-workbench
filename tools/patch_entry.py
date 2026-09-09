# -*- coding: utf-8 -*-
import io
p = r'D:\下载的文件\学习工作台\android\java\com\study\workbench\MainActivity.java'
with io.open(p, encoding='utf-8') as f:
    src = f.read()
old = '// 经典 file:// 加载：入口页(asset 根目录的学习工作台.html；未登录会自动跳 登录.html)\n        // 中文文件名用 Uri.encode 保证 Android WebView 能正确定位到 asset 文件。\n        web.setWebViewClient(new WebViewClient());\n        web.loadUrl("file:///android_asset/" + Uri.encode("学习工作台.html"));'
new = '// 经典 file:// 加载：入口页(asset 根目录的 学途.html 学习中枢；未登录会自动跳 登录.html)\n        // 旧版首页 学习工作台.html 仍可从学途「我的」页进入。\n        // 中文文件名用 Uri.encode 保证 Android WebView 能正确定位到 asset 文件。\n        web.setWebViewClient(new WebViewClient());\n        web.loadUrl("file:///android_asset/" + Uri.encode("学途.html"));'
assert old in src, 'entry not found'
src = src.replace(old, new, 1)
with io.open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print('OK: MainActivity entry -> 学途.html')
