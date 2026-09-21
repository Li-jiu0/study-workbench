# -*- coding: utf-8 -*-
"""修补 app.js：增加 isAndroidEnv 兜底，避免 WebView speechSynthesis 静默失败"""
import io

path = r'D:\下载的文件\学习工作台\assets\app.js'
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

# 1) 在 isNativeApp 函数后插入 isAndroidEnv
old1 = "function isNativeApp() {\n  return !!(window.AndroidTTS && typeof window.AndroidTTS.speak === 'function');\n}\n"
new1 = old1 + "/* Android WebView 环境兜底：原生桥意外缺失时给出明确提示，避免 speechSynthesis 静默失败 */\nfunction isAndroidEnv() {\n  return /Android/i.test(navigator.userAgent || '') || /Android/i.test(navigator.appVersion || '');\n}\n"
assert old1 in src, 'isNativeApp block not found'
src = src.replace(old1, new1, 1)

# 2) speakText: attemptSpeak 失败后，Android WebView 且无原生桥 -> 直接提示
old2 = "  if (attemptSpeak(text, _lang, _rate, onEnd)) return;  // Android App：走原生 TextToSpeech（含就绪等待）\n  if (!('speechSynthesis' in window)) {"
new2 = ("  if (attemptSpeak(text, _lang, _rate, onEnd)) return;  // Android App：走原生 TextToSpeech（含就绪等待）\n"
        "  if (isAndroidEnv() && !isNativeApp()) {\n"
        "    showToast('语音引擎未连接，请重启 App；如仍无效请检查系统\u201c文字转语音\u201d设置');\n"
        "    if (onEnd) onEnd();\n"
        "    return;\n"
        "  }\n"
        "  if (!('speechSynthesis' in window)) {")
assert old2 in src, 'speakText block not found'
src = src.replace(old2, new2, 1)

# 3) speakUtterance: 同样兜底
old3 = "  if (attemptSpeak(text, lang || 'en-US', Number(getSetting('voiceRate')) || 0.9)) return;  // Android App 原生 TTS(含就绪等待)\n  if (!('speechSynthesis' in window)) {"
new3 = ("  if (attemptSpeak(text, lang || 'en-US', Number(getSetting('voiceRate')) || 0.9)) return;  // Android App 原生 TTS(含就绪等待)\n"
        "  if (isAndroidEnv() && !isNativeApp()) {\n"
        "    showToast('语音引擎未连接，请重启 App；如仍无效请检查系统\u201c文字转语音\u201d设置');\n"
        "    return;\n"
        "  }\n"
        "  if (!('speechSynthesis' in window)) {")
assert old3 in src, 'speakUtterance block not found'
src = src.replace(old3, new3, 1)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print('OK: app.js patched, new size =', len(src))
