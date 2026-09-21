# -*- coding: utf-8 -*-
"""v1.13 前端接入原生语音能力：
1) netSpeak：App 内优先走原生 AndroidTTS.netTts（MediaPlayer 播放），失败回退原生 TTS/提示
2) 语音识别：App 内优先走原生 AndroidTTS.startRecognition（系统 SpeechRecognizer）
3) stopRecognition：App 内走原生 cancel
"""
import io

path = r'D:\下载的文件\学习工作台\assets\app.js'
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

# ---------- 1) netSpeak 开头：App 内优先原生 netTts ----------
old_head = """function netSpeak(text, lang, rate, onEnd) {
  try {
    const t = String(text == null ? '' : text).trim();
    if (!t) { if (onEnd) onEnd(); return false; }
    const piece = t.slice(0, 150); // 有道接口对超长文本不稳定，截断"""
new_head = """function netSpeak(text, lang, rate, onEnd) {
  try {
    const t = String(text == null ? '' : text).trim();
    if (!t) { if (onEnd) onEnd(); return false; }
    // App 内：优先原生网络 TTS（MainActivity 用 MediaPlayer 播放，绕开 WebView Audio 的限制）
    if (isNativeApp() && window.AndroidTTS && typeof window.AndroidTTS.netTts === 'function') {
      const _lang0 = lang || 'en-US';
      const _rate0 = Number(rate) > 0 ? Number(rate) : 0.9;
      const id = 'nt' + (++_netTtsSeq);
      _netTtsCbs[id] = { text: t, lang: _lang0, rate: _rate0, onEnd: onEnd };
      let ok = false;
      try { ok = !!window.AndroidTTS.netTts(t, _lang0, _rate0, id); } catch (e) { ok = false; }
      if (ok) return true;
      delete _netTtsCbs[id]; // 原生桥异常：继续走下方 JS Audio 路径
    }
    const piece = t.slice(0, 150); // 有道接口对超长文本不稳定，截断"""
assert old_head in src, 'netSpeak head not found'
src = src.replace(old_head, new_head, 1)

# ---------- 2) netSpeak 结尾后：注册原生播放回调 ----------
old_tail = """    const p = a.play();
    if (p && typeof p.catch === 'function') p.catch(function () { finish(false); });
    return true; // 已受理（异步播放，成败走 finish）
  } catch (e) { if (onEnd) onEnd(); return false; }
}"""
new_tail = old_tail + """

/* 原生网络 TTS 回调（MainActivity netTts 桥触发） */
let _netTtsCbs = {};
window.__netTtsDone = function (id) {
  const rec = _netTtsCbs[id];
  if (!rec) return;
  delete _netTtsCbs[id];
  if (rec.onEnd) rec.onEnd();
};
window.__netTtsError = function (id, msg) {
  const rec = _netTtsCbs[id];
  if (!rec) return;
  delete _netTtsCbs[id];
  // 网络 TTS 失败：回退一次原生 TTS，仍失败则明确提示
  if (typeof nativeSpeak === 'function' && isNativeApp()) {
    if (nativeSpeak(rec.text, rec.lang, rec.rate, rec.onEnd)) return;
  }
  showToast('语音不可用：' + (msg || '请检查网络连接'));
  if (rec.onEnd) rec.onEnd();
};"""
assert old_tail in src, 'netSpeak tail not found'
src = src.replace(old_tail, new_tail, 1)

# ---------- 3) startEnglishRecognition 加原生分支 ----------
old_en = """function startEnglishRecognition(onResult, onEnd, onError) {
  if (!initSpeechRecognition()) {
    showToast('当前浏览器不支持语音识别，请使用Chrome浏览器');
    if (onError) onError();
    return false;
  }
  speechRecognition.lang = 'en-US';"""
new_en = """function startEnglishRecognition(onResult, onEnd, onError) {
  // App 内：原生 SpeechRecognizer（WebView 无 Web Speech API）
  if (isNativeApp() && window.AndroidTTS && typeof window.AndroidTTS.startRecognition === 'function') {
    return nativeStartRecognition('en-US', onResult, onEnd, onError);
  }
  if (!initSpeechRecognition()) {
    showToast('当前浏览器不支持语音识别，请使用Chrome浏览器');
    if (onError) onError();
    return false;
  }
  speechRecognition.lang = 'en-US';"""
assert old_en in src, 'startEnglishRecognition head not found'
src = src.replace(old_en, new_en, 1)

# ---------- 4) startChineseRecognition 加原生分支 ----------
old_zh = """function startChineseRecognition(onResult, onEnd, onError) {
  if (!initSpeechRecognition()) {
    showToast('当前浏览器不支持语音识别，请使用Chrome浏览器');
    if (onError) onError();
    return false;
  }
  speechRecognition.lang = 'zh-CN';"""
new_zh = """function startChineseRecognition(onResult, onEnd, onError) {
  // App 内：原生 SpeechRecognizer
  if (isNativeApp() && window.AndroidTTS && typeof window.AndroidTTS.startRecognition === 'function') {
    return nativeStartRecognition('zh-CN', onResult, onEnd, onError);
  }
  if (!initSpeechRecognition()) {
    showToast('当前浏览器不支持语音识别，请使用Chrome浏览器');
    if (onError) onError();
    return false;
  }
  speechRecognition.lang = 'zh-CN';"""
assert old_zh in src, 'startChineseRecognition head not found'
src = src.replace(old_zh, new_zh, 1)

# ---------- 5) 原生识别封装 + 回调（插在 startChineseRecognition 之后、stopRecognition 之前） ----------
old_stop = """// 停止语音识别
function stopRecognition() {"""
new_stop = """// 原生语音识别（App 内）封装 + 回调注册
let _recSeq = 0;
let _recCbs = {};
function nativeStartRecognition(lang, onResult, onEnd, onError) {
  const id = 'rec' + (++_recSeq);
  _recCbs[id] = { onResult: onResult, onEnd: onEnd, onError: onError };
  let ok = false;
  try { ok = !!window.AndroidTTS.startRecognition(lang, id); } catch (e) { ok = false; }
  if (ok) return true;
  delete _recCbs[id];
  showToast('请先允许麦克风权限，再点一次跟读');
  if (onError) onError();
  return false;
}
window.__recResult = function (id, text) {
  const rec = _recCbs[id];
  if (!rec) return;
  delete _recCbs[id];
  if (rec.onResult) rec.onResult(text);
  if (rec.onEnd) rec.onEnd(text);
};
window.__recError = function (id, code) {
  const rec = _recCbs[id];
  if (!rec) return;
  delete _recCbs[id];
  if (code === 'not_allowed') showToast('请先允许麦克风权限，再点一次跟读');
  else if (code === 'no_speech') showToast('没有检测到语音，请大声说');
  else if (code === 'no_match') showToast('没有听清，请再说一遍');
  else if (code === 'unavailable') showToast('本机未安装语音识别服务，请到系统设置安装/启用语音助手');
  else showToast('语音识别失败，请重试');
  if (rec.onError) rec.onError(code);
};

// 停止语音识别
function stopRecognition() {"""
assert old_stop in src, 'stopRecognition anchor not found'
src = src.replace(old_stop, new_stop, 1)

# ---------- 6) stopRecognition 实现：App 内走原生 ----------
old_stop2 = """function stopRecognition() {
  if (speechRecognition && isRecognizing) {
    speechRecognition.stop();
  }
}"""
new_stop2 = """function stopRecognition() {
  if (isNativeApp() && window.AndroidTTS && typeof window.AndroidTTS.stopRecognition === 'function') {
    try { window.AndroidTTS.stopRecognition(); } catch (e) { }
    return;
  }
  if (speechRecognition && isRecognizing) {
    speechRecognition.stop();
  }
}"""
assert old_stop2 in src, 'stopRecognition body not found'
src = src.replace(old_stop2, new_stop2, 1)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print('OK: app.js patched, size =', len(src))
