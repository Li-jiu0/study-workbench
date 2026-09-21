# -*- coding: utf-8 -*-
"""改进 attemptSpeak：增加重试次数和诊断信息"""
import io

path = r'D:\下载的文件\学习工作台\assets\app.js'
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

old = """function attemptSpeak(text, lang, rate, onEnd) {
  if (!isNativeApp()) return false;          // 非 App（普通浏览器/旧版）：交给调用方走 Web Speech
  if (nativeSpeak(text, lang, rate, onEnd)) return true;
  // 桥在但引擎可能还没就绪（v1.8 原生端带看门狗自动换引擎）：稍等后重试一次
  setTimeout(function () {
    if (nativeSpeak(text, lang, rate, onEnd)) return;
    const st = window.__nativeTtsInfo;
    if (st && st.ok === false) {
      // 之前明确失败过：用户可能刚在系统设置里修好 → 触发原生重新初始化，请用户再点一次
      try { if (window.AndroidTTS && window.AndroidTTS.reinit) window.AndroidTTS.reinit(); } catch (e) {}
      showToast('正在重新连接语音引擎，请再点一次 🔊');
    } else {
      showToast('语音引擎加载中，请再点一次 🔊');
    }
  }, 700);
  return true;
}"""

new = """function attemptSpeak(text, lang, rate, onEnd) {
  if (!isNativeApp()) return false;          // 非 App（普通浏览器/旧版）：交给调用方走 Web Speech
  if (nativeSpeak(text, lang, rate, onEnd)) return true;
  // 桥在但引擎可能还没就绪（原生端带看门狗自动换引擎，HyperOS 壳引擎可能需 4~8 秒）：
  // 多次重试，间隔递增，给引擎足够初始化时间；最终失败时显示原生诊断信息
  var ttsAttempts = 0;
  function ttsTryAgain(delay) {
    setTimeout(function () {
      ttsAttempts++;
      if (nativeSpeak(text, lang, rate, onEnd)) return;
      if (ttsAttempts < 3) { ttsTryAgain(1200); return; }  // 700ms+1200ms+1200ms ≈ 3.1s
      // 多次失败：读取原生端诊断信息，给用户明确指引
      var diag = '';
      try { if (window.AndroidTTS && typeof window.AndroidTTS.diag === 'function') diag = window.AndroidTTS.diag(); } catch (e) {}
      var st = window.__nativeTtsInfo;
      if (st && st.ok === false) {
        try { if (window.AndroidTTS && window.AndroidTTS.reinit) window.AndroidTTS.reinit(); } catch (e) {}
        showToast('语音引擎不可用（' + diag + '），已触发重连，请再点一次 🔊');
      } else {
        showToast('语音引擎加载中（' + diag + '），请稍候 2 秒再点一次 🔊');
      }
    }, delay);
  }
  ttsTryAgain(700);
  return true;
}"""

assert old in src, 'attemptSpeak block not found'
src = src.replace(old, new, 1)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print('OK: attemptSpeak improved')
