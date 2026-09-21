# -*- coding: utf-8 -*-
"""为 App 增加「网络 TTS」内置语音方案（有道词典发音接口，免费无 Key、国内可访问）。
不依赖系统 TTS 引擎 —— 解决红米/HyperOS 只有系统语音引擎且不响应的问题。
- netSpeak(): 有道 dictvoice 接口播放 mp3；rate 用 playbackRate 实现慢速；
  失败自动回退一次原生 TTS，仍失败则明确提示（不静默、不卡流程）。
- speakText / speakUtterance：App 内 网络 TTS 优先 → 原生 TTS 兜底。
"""
import io

# ---------- 1) app.js ----------
path = r'D:\下载的文件\学习工作台\assets\app.js'
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

# a) 在 nativeTtsStop 函数后插入 netSpeak
old_ns = """/* 停止原生朗读并清空回调 */
function nativeTtsStop() {
  try { if (isNativeApp()) window.AndroidTTS.stop(); } catch (e) {}
  window.__nativeTtsCbs = {};
}"""
new_ns = old_ns + """

/* ---------- 网络 TTS（有道词典发音接口）：App 内置语音方案，不依赖系统 TTS 引擎 ----------
 * 免费、无需 API Key、国内可访问；支持中/英文单词与句子（截断至 150 字符防超长报错）。
 * rate 通过 playbackRate 实现慢速（0.7=慢速）；失败自动回退一次原生 TTS，仍失败则明确提示。
 */
let _netTtsAudio = null;
let _netTtsSeq = 0;
function netSpeak(text, lang, rate, onEnd) {
  try {
    const t = String(text == null ? '' : text).trim();
    if (!t) { if (onEnd) onEnd(); return false; }
    const piece = t.slice(0, 150); // 有道接口对超长文本不稳定，截断
    const isZh = /zh|cn/i.test(String(lang || ''));
    const url = 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(piece) + '&type=' + (isZh ? 2 : 2);
    let a = new Audio();
    _netTtsSeq++;
    if (_netTtsAudio) { try { _netTtsAudio.pause(); _netTtsAudio = null; } catch (e) {} }
    _netTtsAudio = a;
    let settled = false;
    const finish = function (ok) {
      if (settled) return;
      settled = true;
      if (_netTtsAudio === a) _netTtsAudio = null;
      if (ok) { if (onEnd) onEnd(); return; }
      // 网络失败：尝试一次原生 TTS（引擎可用时兜底），仍失败则明确提示、不卡流程
      if (typeof nativeSpeak === 'function' && isNativeApp()) {
        if (nativeSpeak(text, lang || 'en-US', Number(rate) > 0 ? Number(rate) : 0.9, onEnd)) return;
      }
      showToast('语音不可用：请检查网络连接');
      if (onEnd) onEnd();
    };
    a.onended = function () { finish(true); };
    a.onerror = function () { finish(false); };
    a.src = url;
    a.load();
    if (rate && Number(rate) > 0 && Number(rate) !== 1) {
      try { a.playbackRate = Math.min(2, Math.max(0.3, Number(rate))); } catch (e) {}
    }
    const p = a.play();
    if (p && typeof p.catch === 'function') p.catch(function () { finish(false); });
    return true; // 已受理（异步播放，成败走 finish）
  } catch (e) { if (onEnd) onEnd(); return false; }
}"""
assert old_ns in src, 'nativeTtsStop block not found'
src = src.replace(old_ns, new_ns, 1)

# b) speakText：App 内网络 TTS 优先
old_st = """  const _lang = lang || getSetting('voiceLang') || 'en-US';
  const _rate = rate || Number(getSetting('voiceRate')) || 0.9;
  if (attemptSpeak(text, _lang, _rate, onEnd)) return;  // Android App：走原生 TextToSpeech（含就绪等待）
  if (isAndroidEnv() && !isNativeApp()) {"""
new_st = """  const _lang = lang || getSetting('voiceLang') || 'en-US';
  const _rate = rate || Number(getSetting('voiceRate')) || 0.9;
  // Android App：网络 TTS 优先（内置语音方案，不依赖系统引擎），失败自动回退原生
  if (isNativeApp()) {
    if (netSpeak(text, _lang, _rate, onEnd)) return;
    if (attemptSpeak(text, _lang, _rate, onEnd)) return;
    showToast('语音不可用：请检查网络，或到系统“文字转语音”设置启用引擎');
    if (onEnd) onEnd();
    return;
  }
  if (attemptSpeak(text, _lang, _rate, onEnd)) return;  // 非 App：原生 Web Speech（含就绪等待）
  if (isAndroidEnv() && !isNativeApp()) {"""
assert old_st in src, 'speakText block not found'
src = src.replace(old_st, new_st, 1)

# c) speakUtterance：App 内网络 TTS 优先
old_su = """function speakUtterance(text, lang) {
  if (attemptSpeak(text, lang || 'en-US', Number(getSetting('voiceRate')) || 0.9)) return;  // Android App 原生 TTS(含就绪等待)
  if (isAndroidEnv() && !isNativeApp()) {"""
new_su = """function speakUtterance(text, lang) {
  // Android App：网络 TTS 优先（内置语音方案），失败自动回退原生
  if (isNativeApp()) {
    if (netSpeak(text, lang || 'en-US', Number(getSetting('voiceRate')) || 0.9, null)) return;
    if (attemptSpeak(text, lang || 'en-US', Number(getSetting('voiceRate')) || 0.9)) return;
    showToast('语音不可用：请检查网络，或到系统“文字转语音”设置启用引擎');
    return;
  }
  if (attemptSpeak(text, lang || 'en-US', Number(getSetting('voiceRate')) || 0.9)) return;  // 非 App：原生 Web Speech
  if (isAndroidEnv() && !isNativeApp()) {"""
assert old_su in src, 'speakUtterance block not found'
src = src.replace(old_su, new_su, 1)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print('OK: app.js netSpeak patched, size =', len(src))

# ---------- 2) voiceplayer.js：慢速播放网络 TTS 优先 ----------
path2 = r'D:\下载的文件\学习工作台\assets\voiceplayer.js'
with io.open(path2, 'r', encoding='utf-8') as f:
    src2 = f.read()

old_vp = """    var it = SCENES[S.scene].lines[S.i];
    if (typeof nativeSpeak === 'function' && nativeSpeak(it.en, 'en-US', 0.7)) return;  // Android App 原生 TTS 慢速"""
new_vp = """    var it = SCENES[S.scene].lines[S.i];
    if (typeof netSpeak === 'function' && typeof isNativeApp === 'function' && isNativeApp() && netSpeak(it.en, 'en-US', 0.7, null)) return;  // App 内网络 TTS 慢速（playbackRate）
    if (typeof nativeSpeak === 'function' && nativeSpeak(it.en, 'en-US', 0.7)) return;  // Android App 原生 TTS 慢速"""
assert old_vp in src2, 'voiceplayer slow block not found'
src2 = src2.replace(old_vp, new_vp, 1)

with io.open(path2, 'w', encoding='utf-8') as f:
    f.write(src2)
print('OK: voiceplayer.js patched, size =', len(src2))
