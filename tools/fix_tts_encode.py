# -*- coding: utf-8 -*-
import io, os

p = r'D:\下载的文件\学习工作台\android\java\com\study\workbench\MainActivity.java'
with io.open(p, encoding='utf-8') as f:
    src = f.read()

old = """                        java.io.File audio = null;
                        // 多 TTS 接口降级：有道美式 → 百度翻译 → 有道英式
                        String[][] sources = {
                            {"https://dict.youdao.com/dictvoice?audio=" + java.net.URLEncoder.encode(t, "UTF-8") + "&type=2", "https://dict.youdao.com/"},
                            {"https://fanyi.baidu.com/gettts?lan=en&text=" + java.net.URLEncoder.encode(t, "UTF-8") + "&spd=3&source=web", "https://fanyi.baidu.com/"},
                            {"https://dict.youdao.com/dictvoice?audio=" + java.net.URLEncoder.encode(t, "UTF-8") + "&type=1", "https://dict.youdao.com/"}
                        };"""

new = """                        java.io.File audio = null;
                        // 先编码文本（URLEncoder.encode 抛出受检异常，必须在 try 内）
                        final String enc;
                        try { enc = java.net.URLEncoder.encode(t, "UTF-8"); }
                        catch (java.io.UnsupportedEncodingException e) { notifyNetTtsError(uid, "编码失败"); return; }
                        // 多 TTS 接口降级：有道美式 → 百度翻译 → 有道英式
                        String[][] sources = {
                            {"https://dict.youdao.com/dictvoice?audio=" + enc + "&type=2", "https://dict.youdao.com/"},
                            {"https://fanyi.baidu.com/gettts?lan=en&text=" + enc + "&spd=3&source=web", "https://fanyi.baidu.com/"},
                            {"https://dict.youdao.com/dictvoice?audio=" + enc + "&type=1", "https://dict.youdao.com/"}
                        };"""

if old in src:
    src = src.replace(old, new, 1)
    print('FIXED: URLEncoder.encode 移到 try 内')
else:
    print('SKIP: pattern not found')

with io.open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print('DONE')
