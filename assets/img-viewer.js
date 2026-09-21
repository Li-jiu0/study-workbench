/* ============================================================
 * img-viewer.js —— 全站共用图片查看器（单例 window.ImgViewer）+ xtSaveImage
 * ------------------------------------------------------------
 * 增量设计「需求 1 · 图片查看与保存」前端落点（2026-09-22）。
 * 在 chat-local.js 旧 _IV 单例（＋/－/滚轮/双击/拖动/Esc/背景/✕）基础上增强：
 *   1. 双指捏合缩放（0.5×–4×，双指中点锚定；两指并存时禁用单指拖动分支）
 *   2. 双击缩放（1×/2× 切换）与单指拖动平移
 *   3. 多图模式 openList：左右 ‹ › 按钮 + 单指横向滑动翻页（scale≤1 时）
 *   4. 加载中 spinner；onerror 失败态 + 重试（src 加时间戳防缓存）
 *   5. 工具条保存按钮 → xtSaveImage（原生桥 feature-detect，否则 fetch→blob→a[download]）
 *   6. Android 返回键：history.pushState + popstate 关闭（file:// 不可用时静默降级）
 * 样式随本脚本注入（<style id="iv-style">），类名前缀 iv-，不污染全局。
 * 兼容性约束：ES2017 语法（var/function，Promise 允许）；不用可选链/空值合并；
 *   不使用 alert/confirm/prompt（toast 自带轻量实现，优先复用 window.xtToast）；
 *   深浅色：查看器恒为深色沉浸底，工具条用半透明白字，两套主题下均成立。
 * API：
 *   ImgViewer.open({ src, name, saveUrl })        —— 单图（聊天等）
 *   ImgViewer.openList({ urls: [...], index: 0 }) —— 多图（朋友圈等，左右切换）
 *   xtSaveImage(url[, name]) -> Promise<{message}> —— 保存图片到相册/触发下载
 * ============================================================ */
(function () {
  'use strict';
  if (window.ImgViewer) { return; } // 防重复注入（老缓存页面重复引脚本时直接复用）

  var MIN_SCALE = 0.5;
  var MAX_SCALE = 4;

  /* ------------------------------ 基础工具 ------------------------------ */

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /** data:/blob: 不加时间戳；其余拼 xtv= 参数防缓存（重试用） */
  function cacheBust(url) {
    if (!url || /^(data:|blob:)/i.test(url)) { return url; }
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'xtv=' + Date.now();
  }

  /** 从 URL 推导保存文件名（清洗非法字符，照原生桥 saveFile 同款规则） */
  function fileNameOf(url, name) {
    if (name) { return String(name); }
    var s = String(url || '');
    s = s.split('?')[0].split('#')[0];
    try { s = decodeURIComponent(s); } catch (e) { /* 乱码 URL 保持原样 */ }
    var seg = s.substring(s.lastIndexOf('/') + 1) || '';
    seg = seg.replace(/[\\/:*?"<>|]/g, '_');
    if (!seg) { seg = 'image.jpg'; }
    if (seg.indexOf('.') < 0) { seg += '.jpg'; }
    return seg;
  }

  /* ------------------------------ 轻量 toast ------------------------------
     优先复用全站 xtToast(state,msg)；缺失时自建一次性 iv-toast 节点，不用 alert。 */
  var _toastTimer = null;
  function toast(msg) {
    if (typeof window.xtToast === 'function') {
      try { window.xtToast('info', String(msg)); return; } catch (e) { /* 落到自建 */ }
    }
    var old = document.getElementById('ivToast');
    if (old && old.parentNode) { old.parentNode.removeChild(old); }
    var el = document.createElement('div');
    el.id = 'ivToast';
    el.className = 'iv-toast';
    el.textContent = String(msg === null || msg === undefined ? '' : msg);
    document.body.appendChild(el);
    if (_toastTimer) { clearTimeout(_toastTimer); }
    _toastTimer = setTimeout(function () {
      if (el.parentNode) { el.parentNode.removeChild(el); }
    }, 2200);
  }

  /* ------------------------------ 保存：xtSaveImage ------------------------------
     降级链（照增量设计 1.3）：
     ① window.AndroidBridge.saveImageToGallery 存在 → 原生下载写相册
        （同步返回 'ok' / '__ERROR__:...' / '__UNSUPPORTED__'，fetchUrl 同款约定）；
     ② 桥不存在（纯 Web / 旧 APK 缓存）→ fetch → blob → a[download] 触发浏览器下载。
     统一返回 Promise：resolve({message}) / reject(Error)，调用方只管 toast。 */
  function xtSaveImage(url, name) {
    return new Promise(function (resolve, reject) {
      if (!url || typeof url !== 'string') { reject(new Error('图片地址无效')); return; }
      var fname = fileNameOf(url, name);
      var bridge = window.AndroidBridge;
      if (bridge && typeof bridge.saveImageToGallery === 'function') {
        var r = null;
        try { r = bridge.saveImageToGallery(url, fname); }
        catch (e) {
          reject(new Error('保存失败：' + ((e && e.message) ? e.message : '原生桥调用异常')));
          return;
        }
        var rs = (r === null || r === undefined) ? '' : String(r);
        if (rs === '__UNSUPPORTED__') {
          reject(new Error('当前版本不支持保存到相册，请升级 App'));
          return;
        }
        if (rs.indexOf('__ERROR__:') === 0) {
          reject(new Error('保存失败：' + (rs.substring(9) || '未知错误')));
          return;
        }
        resolve({ message: '已保存到相册' });
        return;
      }
      /* 纯 Web / 旧 APK：浏览器下载降级 */
      if (typeof fetch !== 'function' || typeof URL === 'undefined' || !URL.createObjectURL) {
        reject(new Error('当前环境不支持保存图片'));
        return;
      }
      fetch(url, { cache: 'no-store' }).then(function (res) {
        if (!res || !res.ok) { throw new Error('HTTP ' + (res ? res.status : '请求失败')); }
        return res.blob();
      }).then(function (blob) {
        var objUrl = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = objUrl;
        a.download = fname;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          try { URL.revokeObjectURL(objUrl); } catch (e2) { /* 忽略 */ }
          if (a.parentNode) { a.parentNode.removeChild(a); }
        }, 4000);
        resolve({ message: '已开始下载' });
      }).catch(function (e) {
        reject(new Error('保存失败：' + ((e && e.message) ? e.message : '网络错误')));
      });
    });
  }
  window.xtSaveImage = xtSaveImage;

  /* ------------------------------ 样式注入 ------------------------------ */
  function ensureStyle() {
    if (document.getElementById('ivStyle')) { return; }
    var st = document.createElement('style');
    st.id = 'ivStyle';
    st.textContent =
      '.iv-ov{position:fixed;left:0;top:0;right:0;bottom:0;width:100%;height:100%;' +
      'background:rgba(0,0,0,.92);z-index:2147483000;display:none;touch-action:none;}' +
      '.iv-ov.iv-on{display:-webkit-box;display:flex;-webkit-box-align:center;align-items:center;' +
      '-webkit-box-pack:center;justify-content:center;}' +
      '.iv-img{max-width:96vw;max-height:88vh;user-select:none;-webkit-user-select:none;' +
      '-webkit-user-drag:none;will-change:transform;display:block;}' +
      '.iv-loading{position:absolute;left:0;top:0;right:0;bottom:0;display:-webkit-box;display:flex;' +
      '-webkit-box-align:center;align-items:center;-webkit-box-pack:center;justify-content:center;pointer-events:none;}' +
      '.iv-spinner{width:34px;height:34px;border:3px solid rgba(255,255,255,.25);border-top-color:#fff;' +
      'border-radius:50%;animation:iv-rot .8s linear infinite;}' +
      '@keyframes iv-rot{to{transform:rotate(360deg)}}' +
      '.iv-error{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;}' +
      '.iv-error-tx{color:#e5e7eb;font-size:14px;margin-bottom:12px;}' +
      '.iv-retry{background:transparent;border:1px solid rgba(255,255,255,.6);color:#fff;' +
      'border-radius:18px;padding:7px 26px;font-size:13px;cursor:pointer;}' +
      '.iv-retry:active{background:rgba(255,255,255,.15);}' +
      '.iv-tools{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);display:-webkit-box;' +
      'display:flex;gap:6px;background:rgba(24,26,28,.72);border-radius:24px;padding:8px 14px;z-index:3;}' +
      '.iv-btn{width:32px;height:32px;line-height:32px;text-align:center;color:#fff;font-size:17px;' +
      'cursor:pointer;position:relative;border-radius:50%;}' +
      '.iv-btn:active{background:rgba(255,255,255,.18);}' +
      '.iv-btn.iv-saving{color:transparent;}' +
      '.iv-btn.iv-saving::after{content:"";position:absolute;left:50%;top:50%;width:14px;height:14px;' +
      'margin:-8px 0 0 -8px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;' +
      'animation:iv-rot .8s linear infinite;}' +
      '.iv-nav{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);display:-webkit-box;' +
      'display:flex;-webkit-box-pack:justify;justify-content:space-between;padding:0 10px;pointer-events:none;z-index:2;}' +
      '.iv-nav-btn{width:40px;height:40px;line-height:38px;text-align:center;color:#fff;font-size:26px;' +
      'background:rgba(24,26,28,.55);border-radius:50%;pointer-events:auto;cursor:pointer;user-select:none;' +
      '-webkit-user-select:none;}' +
      '.iv-idx{position:absolute;left:50%;top:16px;transform:translateX(-50%);color:#fff;font-size:13px;' +
      'background:rgba(24,26,28,.55);border-radius:12px;padding:4px 12px;z-index:3;}' +
      '.iv-toast{position:fixed;left:50%;top:24px;transform:translateX(-50%);background:#2D3436;color:#fff;' +
      'padding:10px 18px;border-radius:10px;font-size:13px;line-height:1.5;z-index:2147483600;' +
      'max-width:86%;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.22);}' +
      '@media (prefers-color-scheme:light){.iv-tools,.iv-nav-btn,.iv-idx{background:rgba(24,26,28,.72);}}';
    document.head.appendChild(st);
  }

  /* ------------------------------ 单例构建 ------------------------------ */
  var V = null; // 单例状态

  function build() {
    if (V) { return; }
    ensureStyle();
    var ov = document.createElement('div');
    ov.className = 'iv-ov';
    ov.innerHTML =
      '<img class="iv-img" alt="图片预览" draggable="false">' +
      '<div class="iv-loading" style="display:none"><div class="iv-spinner"></div></div>' +
      '<div class="iv-error" style="display:none">' +
      '<div class="iv-error-tx">图片加载失败</div>' +
      '<button class="iv-retry" type="button">重试</button>' +
      '</div>' +
      '<div class="iv-nav" style="display:none">' +
      '<span class="iv-nav-btn" data-act="prev">‹</span>' +
      '<span class="iv-nav-btn" data-act="next">›</span>' +
      '</div>' +
      '<div class="iv-idx" style="display:none"></div>' +
      '<div class="iv-tools">' +
      '<span class="iv-btn" data-act="out">－</span>' +
      '<span class="iv-btn" data-act="in">＋</span>' +
      '<span class="iv-btn" data-act="save" title="保存">⬇</span>' +
      '<span class="iv-btn" data-act="close">✕</span>' +
      '</div>';
    var img = ov.querySelector('.iv-img');
    V = {
      ov: ov, img: img,
      loading: ov.querySelector('.iv-loading'),
      error: ov.querySelector('.iv-error'),
      nav: ov.querySelector('.iv-nav'),
      idxEl: ov.querySelector('.iv-idx'),
      tools: ov.querySelector('.iv-tools'),
      mode: 'single',          // 'single' | 'list'
      urls: [],                // 每页的保存/加载地址
      names: [],               // 可选的保存文件名（与 urls 对齐）
      idx: 0,
      scale: 1, tx: 0, ty: 0,
      opened: false,
      popPushed: false,        // 是否为本查看器 push 了历史记录
      closing: false,          // 关闭中标记，防 popstate/close 双触发
      // 拖动 / 捏合 / 翻页手势状态
      dragging: false, sx: 0, sy: 0,
      pinch: false, pinchD0: 0, pinchS0: 1, pinchMx: 0, pinchMy: 0, pinchTx: 0, pinchTy: 0,
      swipeActive: false, swipeX: 0, swipeY: 0
    };
    V.applyT = function () {
      img.style.transform = 'translate(' + V.tx + 'px,' + V.ty + 'px) scale(' + V.scale + ')';
    };
    V.setScale = function (next) {
      var s = clamp(next, MIN_SCALE, MAX_SCALE);
      if (s === V.scale) { return; }
      V.scale = s;
      if (s <= 1.001) { V.tx = 0; V.ty = 0; }
      V.applyT();
    };

    /* ---- 加载 / 失败重试 ---- */
    V.show = function (src, name) {
      V.current = src;
      V.currentName = name || '';
      V.error.style.display = 'none';
      V.loading.style.display = 'flex';
      img.style.visibility = 'hidden';
      img.onload = function () {
        V.loading.style.display = 'none';
        V.error.style.display = 'none';
        img.style.visibility = 'visible';
      };
      img.onerror = function () {
        V.loading.style.display = 'none';
        img.style.visibility = 'hidden';
        V.error.style.display = 'block';
      };
      img.setAttribute('src', src);
    };
    ov.querySelector('.iv-retry').addEventListener('click', function (e) {
      if (e && e.stopPropagation) { e.stopPropagation(); }
      if (V.current) { V.show(cacheBust(V.current), V.currentName); } // 时间戳防缓存
    });

    /* ---- 工具条：＋/－/保存/✕ ---- */
    V.tools.addEventListener('click', function (e) {
      if (e && e.stopPropagation) { e.stopPropagation(); }
      var t = e && e.target;
      var act = (t && t.getAttribute) ? t.getAttribute('data-act') : '';
      var btn = t && t.closest ? t.closest('.iv-btn') : null;
      if (btn && !act) { act = btn.getAttribute('data-act'); }
      if (act === 'in') { V.setScale(V.scale * 1.25); }
      else if (act === 'out') { V.setScale(V.scale / 1.25); }
      else if (act === 'close') { close(); }
      else if (act === 'save') { doSave(btn); }
    });

    /* ---- 保存按钮（转圈 + toast） ---- */
    function doSave(btn) {
      if (!btn || btn.getAttribute('data-saving') === '1') { return; } // 防连点
      var url = V.urls[V.idx] || V.current;
      if (!url) { toast('图片地址无效'); return; }
      var name = (V.names && V.names[V.idx]) || '';
      btn.setAttribute('data-saving', '1');
      btn.className = 'iv-btn iv-saving';
      xtSaveImage(url, name).then(function (ok) {
        toast((ok && ok.message) ? ok.message : '已保存到相册');
      }).catch(function (e) {
        toast((e && e.message) ? e.message : '保存失败');
      }).then(function () {
        btn.removeAttribute('data-saving');
        btn.className = 'iv-btn';
      });
    }

    /* ---- 点击背景关闭；点图片/工具条/错误区不关闭 ---- */
    ov.addEventListener('click', function (e) {
      if (e.target === ov) { close(); }
    });

    /* ---- 滚轮缩放（桌面） ---- */
    ov.addEventListener('wheel', function (e) {
      if (e && e.preventDefault) { e.preventDefault(); }
      V.setScale((e && e.deltaY > 0) ? V.scale / 1.15 : V.scale * 1.15);
    }, { passive: false });

    /* ---- 双击 1×/2×（桌面 + 移动均可触发） ---- */
    img.addEventListener('dblclick', function (e) {
      if (e && e.stopPropagation) { e.stopPropagation(); }
      V.setScale(V.scale > 1.001 ? 1 : 2);
    });

    /* ---- 鼠标拖动平移（桌面，仅放大后） ---- */
    img.addEventListener('mousedown', function (e) {
      if (V.scale <= 1.001) { return; }
      V.dragging = true; V.sx = e.clientX - V.tx; V.sy = e.clientY - V.ty;
      if (e && e.preventDefault) { e.preventDefault(); }
    });
    document.addEventListener('mousemove', function (e) {
      if (!V || !V.dragging) { return; }
      V.tx = e.clientX - V.sx; V.ty = e.clientY - V.sy; V.applyT();
    });
    document.addEventListener('mouseup', function () {
      if (V) { V.dragging = false; }
    });

    /* ---- 触摸：捏合缩放 + 单指拖动 + 横滑翻页 ---- */
    function dist2(t) {
      var dx = t[0].clientX - t[1].clientX;
      var dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    ov.addEventListener('touchstart', function (e) {
      var ts = (e && e.touches) ? e.touches : null;
      if (!ts || !ts.length) { return; }
      if (ts.length >= 2) {
        /* 双指捏合起点：记录指距 / 当前 scale / 双指中点 / 当前位移；禁用单指分支 */
        V.pinch = true; V.dragging = false; V.swipeActive = false;
        V.pinchD0 = dist2(ts) || 1;
        V.pinchS0 = V.scale;
        V.pinchMx = (ts[0].clientX + ts[1].clientX) / 2;
        V.pinchMy = (ts[0].clientY + ts[1].clientY) / 2;
        V.pinchTx = V.tx; V.pinchTy = V.ty;
        return;
      }
      if (V.pinch) { return; } // 捏合未结束（剩余一指）不进入单指分支
      var x = ts[0].clientX, y = ts[0].clientY;
      V.swipeActive = true; V.swipeX = x; V.swipeY = y;
      if (V.scale > 1.001) { V.dragging = true; V.sx = x - V.tx; V.sy = y - V.ty; }
    }, { passive: true });
    ov.addEventListener('touchmove', function (e) {
      var ts = (e && e.touches) ? e.touches : null;
      if (!ts || !ts.length) { return; }
      if (e && e.preventDefault) { e.preventDefault(); } // 查看器内禁页面滚动/回弹
      if (ts.length >= 2 && V.pinch) {
        /* 双指中点锚定：t' = m - (m0 - t0)·(s'/s0)，缩放同时跟随双指平移 */
        var d = dist2(ts) || 1;
        var s = clamp(V.pinchS0 * d / V.pinchD0, MIN_SCALE, MAX_SCALE);
        var mx = (ts[0].clientX + ts[1].clientX) / 2;
        var my = (ts[0].clientY + ts[1].clientY) / 2;
        var k = s / V.pinchS0;
        V.scale = s;
        V.tx = mx - (V.pinchMx - V.pinchTx) * k;
        V.ty = my - (V.pinchMy - V.pinchTy) * k;
        if (s <= 1.001) { V.tx = 0; V.ty = 0; }
        V.applyT();
        return;
      }
      if (ts.length === 1) {
        var x = ts[0].clientX, y = ts[0].clientY;
        if (V.dragging && V.scale > 1.001) {
          V.tx = x - V.sx; V.ty = y - V.sy; V.applyT();
        }
        /* scale≤1 时的单指移动不做事，松手时按位移判定翻页（touchend） */
      }
    }, { passive: false });
    ov.addEventListener('touchend', function (e) {
      var ts = (e && e.touches) ? e.touches : [];
      if (ts.length < 2 && V.pinch) {
        V.pinch = false; // 捏合结束；若还剩一指，本轮不恢复拖动，避免跳变
        V.dragging = false;
        if (ts.length === 1) {
          V.swipeActive = true; V.swipeX = ts[0].clientX; V.swipeY = ts[0].clientY;
        }
        return;
      }
      if (ts.length === 0) {
        V.dragging = false;
        /* 横滑翻页：仅多图模式且 scale≤1，水平位移 >50px 且明显大于竖直位移 */
        if (V.swipeActive && V.mode === 'list' && V.urls.length > 1 && V.scale <= 1.001) {
          var dx = (e.changedTouches && e.changedTouches.length)
            ? e.changedTouches[0].clientX - V.swipeX : 0;
          var dy = (e.changedTouches && e.changedTouches.length)
            ? e.changedTouches[0].clientY - V.swipeY : 0;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx < 0) { page(1); } else { page(-1); }
          }
        }
        V.swipeActive = false;
      }
    }, { passive: true });

    /* ---- 键盘：Esc 关闭，＋/－ 缩放，←/→ 翻页 ---- */
    document.addEventListener('keydown', function (e) {
      if (!V || !V.opened) { return; }
      var k = e && e.key;
      if (k === 'Escape' || k === 'Esc') { close(); }
      else if (k === '+' || k === '=') { V.setScale(V.scale * 1.25); }
      else if (k === '-') { V.setScale(V.scale / 1.25); }
      else if (V.mode === 'list' && k === 'ArrowRight') { page(1); }
      else if (V.mode === 'list' && k === 'ArrowLeft') { page(-1); }
    });

    /* ---- Android 返回键：popstate 关闭（pushState 不可用时静默降级） ---- */
    window.addEventListener('popstate', function () {
      if (V && V.opened && V.popPushed) {
        V.popPushed = false; // 返回键触发的关闭，不再 history.back() 收尾
        close();
      }
    });

    /* ---- 多图翻页按钮 ---- */
    V.nav.addEventListener('click', function (e) {
      if (e && e.stopPropagation) { e.stopPropagation(); }
      var t = e && e.target;
      var act = (t && t.getAttribute) ? t.getAttribute('data-act') : '';
      if (act === 'prev') { page(-1); }
      else if (act === 'next') { page(1); }
    });
  }

  /* ------------------------------ 翻页 / 开关 ------------------------------ */

  /** 多图翻页：dir=1 下一张 / -1 上一张，循环切换 */
  function page(dir) {
    if (!V || V.mode !== 'list' || V.urls.length < 2) { return; }
    V.idx = (V.idx + dir + V.urls.length) % V.urls.length;
    resetView();
    V.show(V.urls[V.idx], (V.names && V.names[V.idx]) || '');
    updateIdx();
  }

  function updateIdx() {
    if (V.mode !== 'list' || V.urls.length < 2) { return; }
    V.idxEl.textContent = (V.idx + 1) + ' / ' + V.urls.length;
  }

  function resetView() {
    V.scale = 1; V.tx = 0; V.ty = 0;
    V.dragging = false; V.pinch = false; V.swipeActive = false;
    V.applyT();
  }

  function showOverlay() {
    build();
    if (!V.ov.parentNode) { document.body.appendChild(V.ov); }
    V.ov.className = 'iv-ov iv-on';
    V.opened = true;
    V.closing = false;
    pushHistory();
  }

  /** Android 返回键关闭：open 时压入一条历史，返回键 popstate → close */
  function pushHistory() {
    try {
      if (!window.history || typeof window.history.pushState !== 'function') { return; }
      window.history.pushState({ xtViewer: 1 }, '');
      V.popPushed = true;
    } catch (e) { V.popPushed = false; } // file:// 老内核可能抛错：静默降级
  }

  /** 关闭查看器。fromPop=true 表示由 popstate 触发，不再回退历史（防栈残留由调用方区分） */
  function close() {
    if (!V || V.closing) { return; }
    V.closing = true;
    V.opened = false;
    V.ov.className = 'iv-ov';
    V.img.setAttribute('src', ''); // 释放大图
    if (V.popPushed) {
      V.popPushed = false;
      /* 栈顶若仍是自己压入的记录，back() 收尾防残留；失败静默 */
      try {
        if (window.history && window.history.state &&
          window.history.state && window.history.state.xtViewer) {
          window.history.back();
        }
      } catch (e) { /* 忽略 */ }
    }
  }

  /* ------------------------------ 对外 API ------------------------------ */

  /** 单图：open({ src, name, saveUrl }) —— saveUrl 仅作保存用地址（缺省用 src） */
  function open(opts) {
    opts = opts || {};
    var src = opts.src;
    if (!src || typeof src !== 'string') { return; }
    build();
    V.mode = 'single';
    V.urls = [opts.saveUrl || src];
    V.names = [opts.name || ''];
    V.idx = 0;
    V.nav.style.display = 'none';
    V.idxEl.style.display = 'none';
    resetView();
    V.show(src, opts.name || '');
    showOverlay();
  }

  /** 多图：openList({ urls: [...], index: 0 }) —— urls 为可直接加载的地址 */
  function openList(opts) {
    opts = opts || {};
    var urls = [];
    var i;
    for (i = 0; i < (opts.urls || []).length; i++) {
      var u = opts.urls[i];
      if (typeof u === 'string' && u) { urls.push(u); }
    }
    if (!urls.length) { return; }
    build();
    V.mode = 'list';
    V.urls = urls;
    V.names = [];
    V.idx = clamp(opts.index || 0, 0, urls.length - 1);
    var multi = urls.length > 1;
    V.nav.style.display = multi ? 'flex' : 'none';
    V.idxEl.style.display = multi ? 'block' : 'none';
    resetView();
    V.show(urls[V.idx], '');
    updateIdx();
    showOverlay();
  }

  window.ImgViewer = {
    open: open,
    openList: openList,
    close: close,
    saveImage: xtSaveImage
  };
})();
