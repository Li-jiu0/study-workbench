/* assets/ai-settings.js — R67 线1 模型设置页交互逻辑（R66 密钥安全/检测/记忆 + R67 服务商分组表单/删重复入口）
 * ---------------------------------------------------------------------------
 * 依赖（全部 typeof 守卫，缺失时页内降级，绝不崩）：
 *   - window.AI_CONFIG（assets/ai-config.js）：providers / builtinModels /
 *     FUNC_TYPES / modelDetails（modelDetails.stars / .speed 由线3补充，本文件兜底）/
 *     providerGroups（R67 服务商分组：添加模型表单下拉数据源，一字不改只读消费）
 *   - window.aiGetModelSettings / window.aiSaveModelSettings（线2 ai-service.js
 *     新增）：ai_model_settings 整块读写；缺失时本页直接读写同名 localStorage 键
 *   - window.aiHealthCheck(modelId[, tmpCfg])（线2/线3 提供）：Promise<{ok,ms,err}>；
 *     第二参数 {apiUrl, apiKey, apiFormat, extraHeaders, modelId} 为可选「临时配置」，
 *     本文件对其做 typeof / 参数兼容守卫，缺失时退化为「先保存再检测」等价路径；
 *     aiHealthCheck 整体缺失时健康检查静默跳过
 *   - toast：window.xtToast -> window.showToast -> 页内兜底 #setToast
 *   - 确认框：window.uiConfirm（app.js，Promise<boolean>）-> 页内自建轻量确认框
 *     （禁用原生 alert/confirm/prompt）
 * 键契约：
 *   - ai_model_settings：{ disabled, order, overrides, catModels, categories,
 *     health, stars }（结构见 R64 任务书 C1）
 *   - ai_custom_models：自定义模型数组（C4 schema）
 *   - ai_selected_model：当前使用模型 id（写它即完成「选中同步」）
 *   - ai_memory：记忆（JSON 字符串数组，单条 ≤200 字，最多 50 条 FIFO；R65 契约）
 * 语法约束（老 WebView 上限 ES2017）：不用可选链 / 空值合并 / 对象展开 /
 *   replaceAll / fromEntries / 数组 at / 正则后行断言 / 指数运算符 /
 *   顶层 await / 可选 catch 绑定（catch 一律带参数）。
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */
  var LS_KEY = 'ai_model_settings';          // 本页设置：一个键存整块 JSON（C1）
  var SEL_MODEL_KEY = 'ai_selected_model';   // 当前使用模型（C6，与 ai-page.js 共用）
  var CUSTOM_KEY = 'ai_custom_models';       // 自定义模型数组（C4）
  var MEMORY_KEY = 'ai_memory';              // 记忆：JSON 字符串数组（R65 契约）
  var MEMORY_ITEM_MAX = 200;                 // 单条记忆最大字数
  var MEMORY_MAX = 50;                       // 记忆条数上限（FIFO）
  var MAX_RETRY = 3;                         // AI_CONFIG 未就绪时的最大重试次数
  var RETRY_DELAY = 300;                     // 重试间隔（ms）
  var HEALTH_TTL = 30 * 60 * 1000;           // 健康检查缓存有效期：30 分钟
  var HEALTH_STEP = 6500;                    // 后台队列节流：约 6.5 秒测一个
  var HEALTH_BOOT_DELAY = 1500;              // 页面加载后延迟启动，避免抢首屏
  var DATA_VERSION = 'R67 · v20260916';      // 数据版本（关于 Tab 展示）
  var PG_CUSTOM_KEY = 'custom';              // R67 服务商分组：「自定义/兼容接口」组 key

  /* ---------------- R67 图标库：统一内联 SVG（stroke=currentColor，与页头返回按钮同风格；替换 emoji 混用） ---------------- */
  function svgWrap(inner, size) {
    var s = size || 14;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s +
      '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' +
      ' aria-hidden="true" focusable="false">' + inner + '</svg>';
  }

  var STAR_PATH = 'M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9Z';
  var ICONS = {
    edit: svgWrap('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
    del: svgWrap('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>'),
    up: svgWrap('<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>'),
    down: svgWrap('<path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/>'),
    x: svgWrap('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>'),
    grip: svgWrap('<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/>' +
      '<circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>', 15),
    starOn: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none"' +
      ' aria-hidden="true" focusable="false"><path d="' + STAR_PATH + '"/></svg>',
    starOff: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"' +
      ' stroke-width="1.8" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="' + STAR_PATH + '"/></svg>',
    check: svgWrap('<path d="M20 6 9 17l-5-5"/>', 12),
    cross: svgWrap('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>', 12),
    hourglass: svgWrap('<path d="M6 3h12"/><path d="M6 21h12"/><path d="M8 3v3.5L12 12l4-5.5V3"/>' +
      '<path d="M8 21v-3.5L12 12l4 5.5V21"/>', 12),
    lock: svgWrap('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', 13)
  };

  // 能力标签 -> 展示名（8 类原始标签）
  var TYPE_LABELS = {
    general: '文本', reasoning: '推理', math: '数学', image: '识图',
    translate: '翻译', longtext: '长文本', creative: '创作', interview: '面试'
  };
  var ALL_TYPE_KEYS = ['general', 'reasoning', 'math', 'image', 'translate', 'longtext', 'creative', 'interview'];

  // R72-15：原始能力标签 -> 3 个内置能力分类（C5 映射；translate 停用后并入 general）
  var CAT_OF_TYPE = {
    general: 'general', longtext: 'general', creative: 'general', interview: 'general', translate: 'general',
    math: 'reasoning', reasoning: 'reasoning',
    image: 'vision'
  };

  // R72-15：内置能力分类收敛为 3 类（文本 / 识图 / 推理），停用「翻译」分类。
  // 注意：vision 的 key 不能改名（ai-service.js 硬编码依赖），仅 label 改「识图」。
  var BUILTIN_CATS = [
    { key: 'general', label: '文本' },
    { key: 'vision', label: '识图' },
    { key: 'reasoning', label: '推理' }
  ];

  // 健康检查错误码 -> 用户可读文案（err==='cors' 如实区分，不误导）
  var ERR_TEXT = {
    network: '网络异常',
    cors: '跨域受限（浏览器直连）',
    timeout: '超时',
    empty: '空响应'
  };

  // Tab 映射：name -> 面板 id / 按钮 id（5 个平级 Tab）
  var TAB_PANELS = {
    models: 'setPanelModels', func: 'setPanelFunc', intro: 'setPanelIntro',
    add: 'setPanelAdd', about: 'setPanelAbout'
  };
  var TAB_BUTTONS = {
    models: 'setTabModels', func: 'setTabFunc', intro: 'setTabIntro',
    add: 'setTabAdd', about: 'setTabAbout'
  };

  /* ---------------- 运行时状态 ---------------- */
  var settings = null;        // ai_model_settings 内存态
  var storageWarned = false;  // 存储告警只提示一次
  var editTarget = { kind: '', id: '' }; // Tab4 编辑目标（''=新增自定义）
  var formTypes = {};         // Tab4 能力标签多选暂存
  var formStars = 0;          // Tab4 星级暂存（0=未评）
  var dragId = '';            // DnD 当前拖拽的模型 id
  var healthTimer = 0;        // 健康检查队列定时器
  var batchRunning = false;   // 批量检测队列是否运行中（用于暂停后台队列，守限频）
  var formAdvOpen = false;    // R67：「高级设置」是否展开（折叠时提交一律按 openai）

  /* ---------------- 基础工具 ---------------- */
  function $(id) { return document.getElementById(id); }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function isArray(v) {
    return Object.prototype.toString.call(v) === '[object Array]';
  }

  function esc(s) {
    if (s === null || typeof s === 'undefined') return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fieldVal(id) { var el = $(id); return el ? String(el.value || '') : ''; }

  function setVal(id, v) { var el = $(id); if (el) { el.value = (v === null || typeof v === 'undefined') ? '' : String(v); } }

  function on(id, ev, fn) {
    var el = $(id);
    if (el && el.addEventListener) { el.addEventListener(ev, fn); }
  }

  /* 向上查找带指定属性的祖先（不依赖 Element.closest，兼容老内核） */
  function closestAttr(el, attr, root) {
    while (el && el !== root) {
      if (el.getAttribute && el.getAttribute(attr) !== null) { return el; }
      el = el.parentNode;
    }
    return null;
  }

  function warnStorage() {
    if (storageWarned) { return; }
    storageWarned = true;
    toast('warning', '本机存储不可用，设置仅在本次打开中生效');
  }

  /* toast 三选一：xtToast -> showToast -> 页内兜底 #setToast */
  function toast(kind, msg) {
    var text = (msg === null || typeof msg === 'undefined') ? '' : String(msg);
    try {
      if (typeof window.xtToast === 'function') { window.xtToast(kind, text); return; }
    } catch (e) { /* 忽略 */ }
    try {
      if (typeof window.showToast === 'function') { window.showToast(text); return; }
    } catch (e2) { /* 忽略 */ }
    var el = $('setToast');
    if (el) {
      el.textContent = text;
      el.style.display = 'block';
      if (el.__xtTimer) { clearTimeout(el.__xtTimer); }
      el.__xtTimer = setTimeout(function () { el.style.display = 'none'; }, 1800);
    }
  }

  /* 页内自建轻量确认框（uiConfirm 缺失时的兜底；禁原生 confirm） */
  function localConfirm(msg, okText) {
    return new Promise(function (resolve) {
      var old = $('setConfirmMask');
      if (old && old.parentNode) { old.parentNode.removeChild(old); }
      var mask = document.createElement('div');
      mask.id = 'setConfirmMask';
      mask.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:900;' +
        'background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:24px;';
      var box = document.createElement('div');
      box.style.cssText = 'max-width:320px;width:100%;background:var(--ai-card,#fff);' +
        'border-radius:14px;padding:18px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.2);';
      var p = document.createElement('div');
      p.style.cssText = 'font-size:14px;line-height:1.6;color:var(--ai-text,#1f2329);' +
        'white-space:pre-wrap;margin-bottom:14px;text-align:left;';
      p.textContent = msg;
      var btns = document.createElement('div');
      btns.style.cssText = 'display:flex;gap:10px;justify-content:center;';
      function mkBtn(txt, primary) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = txt;
        b.style.cssText = 'min-height:38px;padding:0 18px;border-radius:10px;cursor:pointer;' +
          'font-size:13.5px;font-weight:600;border:1px solid ' +
          (primary ? 'var(--ai-orange,#ff8c00)' : 'var(--ai-border,#e7e9ee)') + ';' +
          'background:' + (primary ? 'var(--ai-orange,#ff8c00)' : 'transparent') + ';' +
          'color:' + (primary ? '#fff' : 'var(--ai-sub,#5a6068)') + ';';
        return b;
      }
      var okBtn = mkBtn(okText || '确定', true);
      var noBtn = mkBtn('取消', false);
      function close(v) {
        if (mask.parentNode) { mask.parentNode.removeChild(mask); }
        resolve(v);
      }
      okBtn.onclick = function () { close(true); };
      noBtn.onclick = function () { close(false); };
      btns.appendChild(okBtn);
      btns.appendChild(noBtn);
      box.appendChild(p);
      box.appendChild(btns);
      mask.appendChild(box);
      document.body.appendChild(mask);
    });
  }

  /* 统一确认入口：uiConfirm 优先，缺失时页内兜底；始终返回 Promise<boolean> */
  function pageConfirm(msg, okText) {
    if (typeof window.uiConfirm === 'function') {
      try {
        var r = window.uiConfirm(msg, okText || '确定');
        if (r && typeof r.then === 'function') { return r; }
      } catch (e) { /* 降级 */ }
    }
    return localConfirm(msg, okText);
  }

  /* 页内轻量信息弹窗（连通性检测结果反馈；非确认、单按钮） */
  function showInfoModal(title, body, ok) {
    var old = $('setInfoMask');
    if (old && old.parentNode) { old.parentNode.removeChild(old); }
    var mask = document.createElement('div');
    mask.id = 'setInfoMask';
    mask.className = 'xt-modal-mask';
    var box = document.createElement('div');
    box.className = 'xt-modal-box';
    var h = document.createElement('div');
    h.className = 'xt-modal-title ' + (ok ? 'ok' : 'bad');
    h.textContent = title;
    var p = document.createElement('div');
    p.className = 'xt-modal-body';
    p.textContent = body;
    var btns = document.createElement('div');
    btns.className = 'xt-modal-btns';
    var okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'xt-set-btn primary';
    okBtn.textContent = '知道了';
    okBtn.onclick = function () { if (mask.parentNode) { mask.parentNode.removeChild(mask); } };
    btns.appendChild(okBtn);
    box.appendChild(h);
    box.appendChild(p);
    box.appendChild(btns);
    mask.appendChild(box);
    document.body.appendChild(mask);
    mask.onclick = function (e) {
      if (e.target === mask && mask.parentNode) { mask.parentNode.removeChild(mask); }
    };
  }

  /* ---------------- 设置存储（C1 契约，线2 helper 优先，缺失降级直读写） ---------------- */
  function defaultSettings() {
    return { disabled: {}, order: [], overrides: {}, catModels: {}, categories: [], health: {}, stars: {} };
  }

  /* disabled 兼容旧版数组与新版 id->true 映射 */
  function normIdMap(v) {
    var out = {};
    var i, k;
    if (isArray(v)) {
      for (i = 0; i < v.length; i++) { if (typeof v[i] === 'string') { out[v[i]] = true; } }
    } else if (v && typeof v === 'object') {
      for (k in v) { if (hasOwn(v, k) && v[k]) { out[k] = true; } }
    }
    return out;
  }

  function normalizeSettings(obj) {
    var s = defaultSettings();
    if (!obj || typeof obj !== 'object') { return s; }
    var i, j, k;
    s.disabled = normIdMap(obj.disabled);
    if (isArray(obj.order)) {
      for (i = 0; i < obj.order.length; i++) {
        if (typeof obj.order[i] === 'string') { s.order.push(obj.order[i]); }
      }
    }
    if (obj.overrides && typeof obj.overrides === 'object') {
      for (k in obj.overrides) {
        if (hasOwn(obj.overrides, k) && obj.overrides[k] && typeof obj.overrides[k] === 'object') {
          s.overrides[k] = obj.overrides[k];
        }
      }
    }
    if (obj.catModels && typeof obj.catModels === 'object') {
      for (k in obj.catModels) {
        if (hasOwn(obj.catModels, k) && isArray(obj.catModels[k])) {
          var arr = [];
          for (j = 0; j < obj.catModels[k].length; j++) {
            if (typeof obj.catModels[k][j] === 'string') { arr.push(obj.catModels[k][j]); }
          }
          s.catModels[k] = arr;
        }
      }
    }
    if (isArray(obj.categories)) {
      for (i = 0; i < obj.categories.length; i++) {
        var c = obj.categories[i];
        if (c && typeof c === 'object' && typeof c.key === 'string') {
          s.categories.push({
            key: c.key,
            label: (typeof c.label === 'string' && c.label) ? c.label : c.key,
            funcType: (typeof c.funcType === 'string' && c.funcType) ? c.funcType : c.key
          });
        }
      }
    }
    if (obj.health && typeof obj.health === 'object') {
      for (k in obj.health) {
        if (hasOwn(obj.health, k) && obj.health[k] && typeof obj.health[k] === 'object') {
          s.health[k] = obj.health[k];
        }
      }
    }
    if (obj.stars && typeof obj.stars === 'object') {
      for (k in obj.stars) {
        if (hasOwn(obj.stars, k)) {
          var n = parseInt(obj.stars[k], 10);
          if (n >= 1 && n <= 5) { s.stars[k] = n; }
        }
      }
    }
    // R72-15 存量数据清洗（幂等）：停用「翻译」分类 -> 清 catModels.translate，
    // 并过滤掉用户自建里 key 为 translate 的分类项（不误伤其它自定义分类）。
    if (s.catModels && hasOwn(s.catModels, 'translate')) { delete s.catModels.translate; }
    if (isArray(s.categories)) {
      var keptCats = [];
      for (var ci = 0; ci < s.categories.length; ci++) {
        if (s.categories[ci] && s.categories[ci].key === 'translate') { continue; }
        keptCats.push(s.categories[ci]);
      }
      s.categories = keptCats;
    }
    return s;
  }

  function readSettings() {
    if (typeof window.aiGetModelSettings === 'function') {
      try { return normalizeSettings(window.aiGetModelSettings()); } catch (e) { /* 降级 */ }
    }
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw === null || raw === '') { return defaultSettings(); }
      return normalizeSettings(JSON.parse(raw));
    } catch (e2) {
      warnStorage();
      return defaultSettings();
    }
  }

  function getSettings() {
    if (!settings) { settings = readSettings(); }
    return settings;
  }

  function saveSettings() {
    var s = getSettings();
    if (typeof window.aiSaveModelSettings === 'function') {
      try { window.aiSaveModelSettings(s); return; } catch (e) { /* 降级 */ }
    }
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e2) { warnStorage(); }
  }

  /* ---------------- 自定义模型（C4，ai_custom_models 既有键直读直写） ---------------- */
  function readCustomModels() {
    try {
      var raw = localStorage.getItem(CUSTOM_KEY);
      if (!raw) { return []; }
      var arr = JSON.parse(raw);
      if (!isArray(arr)) { return []; }
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] && typeof arr[i] === 'object' && typeof arr[i].id === 'string') { out.push(arr[i]); }
      }
      return out;
    } catch (e) {
      return [];
    }
  }

  /* 按 C4 schema 清洗后写回（不夹带内部字段） */
  function sanitizeCustom(m) {
    return {
      id: String(m.id || ''),
      name: String(m.name || m.id || ''),
      provider: String(m.provider || ''),
      apiUrl: String(m.apiUrl || ''),
      apiKey: String(m.apiKey || ''),
      apiFormat: String(m.apiFormat || 'openai'),
      extraHeaders: (m.extraHeaders && typeof m.extraHeaders === 'object') ? m.extraHeaders : {},
      types: isArray(m.types) ? m.types : [],
      stars: (typeof m.stars === 'number') ? m.stars : 0,
      rate: String(m.rate || ''),
      temperature: (typeof m.temperature === 'number') ? m.temperature : null,
      maxTokens: (typeof m.maxTokens === 'number') ? m.maxTokens : null,
      fallback: String(m.fallback || ''),
      desc: String(m.desc || ''),
      speed: String(m.speed || ''),
      needVPN: m.needVPN === true
    };
  }

  function writeCustomModels(arr) {
    var out = [];
    for (var i = 0; i < arr.length; i++) { out.push(sanitizeCustom(arr[i])); }
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(out)); } catch (e) { warnStorage(); }
  }

  /* ---------------- 记忆管理（ai_memory，R65 契约：字符串数组，≤200 字，≤50 条 FIFO） ---------------- */
  function readMemory() {
    try {
      var raw = localStorage.getItem(MEMORY_KEY);
      if (!raw) { return []; }
      var arr = JSON.parse(raw);
      if (!isArray(arr)) { return []; }
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        if (typeof arr[i] === 'string' && arr[i]) { out.push(arr[i]); }
      }
      if (out.length > MEMORY_MAX) { out = out.slice(out.length - MEMORY_MAX); }
      return out;
    } catch (e) {
      return [];
    }
  }

  function writeMemory(list) {
    try { localStorage.setItem(MEMORY_KEY, JSON.stringify(list)); } catch (e) { warnStorage(); }
  }

  function renderMemory() {
    var host = $('setMemList');
    var cnt = $('setMemCount');
    var list = readMemory();
    if (cnt) { cnt.textContent = String(list.length); }
    if (!host) { return; }
    if (!list.length) {
      host.innerHTML = '<div class="xt-set-empty" style="padding:18px 0;">暂无记忆。在 AI 对话页把有用的回答「存入记忆」后会出现在这里。</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      html += '<div class="xt-mem-item">' +
        '<span class="xt-mem-txt" title="' + esc(list[i]) + '">' + esc(list[i]) + '</span>' +
        '<button type="button" class="xt-ico-btn del" data-mem-del="' + i + '" title="删除">' + ICONS.del + '</button>' +
        '</div>';
    }
    host.innerHTML = html;
  }

  function deleteMemoryItem(idx) {
    var list = readMemory();
    var out = [];
    for (var i = 0; i < list.length; i++) { if (i !== idx) { out.push(list[i]); } }
    writeMemory(out);
    renderMemory();
  }

  function clearMemoryAll() {
    pageConfirm('确定清空全部记忆吗？此操作不可撤销。', '清空').then(function (ok) {
      if (!ok) { return; }
      writeMemory([]);
      renderMemory();
      toast('success', '已清空全部记忆');
    });
  }

  /* ---------------- 配置与模型访问（只读 AI_CONFIG） ---------------- */
  function cfg() { return window.AI_CONFIG || null; }

  function builtinModels() {
    var c = cfg();
    return (c && isArray(c.builtinModels)) ? c.builtinModels : [];
  }

  function providers() {
    var c = cfg();
    return (c && c.providers) ? c.providers : {};
  }

  function funcTypes() {
    var c = cfg();
    return (c && c.FUNC_TYPES) ? c.FUNC_TYPES : {};
  }

  function modelDetails() {
    var c = cfg();
    return (c && c.modelDetails) ? c.modelDetails : {};
  }

  function providerKeys() {
    var p = providers();
    var keys = [];
    var k;
    for (k in p) { if (hasOwn(p, k)) { keys.push(k); } }
    return keys;
  }

  function providerLabel(key) {
    var p = providers();
    if (p[key] && p[key].name) { return p[key].name; }
    if (key === '__other__') { return '其他平台'; }
    return key || '未知平台';
  }

  /* ---------------- R67 服务商分组（AI_CONFIG.providerGroups，只读消费） ---------------- */
  function providerGroups() {
    var c = cfg();
    return (c && isArray(c.providerGroups)) ? c.providerGroups : [];
  }

  function findGroup(key) {
    if (!key) { return null; }
    var gs = providerGroups();
    for (var i = 0; i < gs.length; i++) {
      if (gs[i] && gs[i].key === key) { return gs[i]; }
    }
    return null;
  }

  /* 编辑模型 -> 定位所属服务商分组：内置按 provider；自定义按 apiUrl+模型 ID 匹配，否则 custom */
  function groupForModel(model, custom) {
    if (!model) { return PG_CUSTOM_KEY; }
    if (!custom) {
      var g0 = findGroup(String(model.provider || ''));
      return g0 ? g0.key : PG_CUSTOM_KEY;
    }
    var gs = providerGroups();
    for (var i = 0; i < gs.length; i++) {
      var g = gs[i];
      if (!g || g.key === PG_CUSTOM_KEY || !g.apiUrl) { continue; }
      if (String(model.apiUrl || '') !== String(g.apiUrl)) { continue; }
      if (isArray(g.models)) {
        for (var j = 0; j < g.models.length; j++) {
          if (g.models[j] && g.models[j].id === model.id) { return g.key; }
        }
      }
    }
    return PG_CUSTOM_KEY;
  }

  /* 内置 + 自定义 全量模型列表 */
  function allModelsList() {
    var out = builtinModels().slice();
    return out.concat(readCustomModels());
  }

  function findAnyModel(id) {
    if (!id) { return null; }
    var all = allModelsList();
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) { return all[i]; }
    }
    return null;
  }

  function isCustomId(id) {
    if (!id) { return false; }
    var cs = readCustomModels();
    for (var i = 0; i < cs.length; i++) {
      if (cs[i].id === id) { return true; }
    }
    return false;
  }

  function isNeedVPN(model) {
    if (!model) { return false; }
    if (model.needVPN === true) { return true; }
    var p = providers();
    if (model.provider && p[model.provider] && p[model.provider].needVPN === true) { return true; }
    return false;
  }

  function typeKeysOf(model) {
    return (model && isArray(model.types)) ? model.types : [];
  }

  /* ---------------- 生效值（用户手改 > 覆盖配置 > 自定义字段 > modelDetails） ---------------- */
  function overrideOf(id) {
    var o = getSettings().overrides;
    return (o && o[id]) ? o[id] : null;
  }

  function detailOf(model) {
    var d = modelDetails();
    if (!model) { return null; }
    if (model.id && d[model.id]) { return d[model.id]; }
    if (model.model && d[model.model]) { return d[model.model]; }
    return null;
  }

  /* 星级转数字：支持 1-5 数字；兼容历史存量「星级字符串」按连续星形字符计数（解析逻辑，非渲染图标） */
  function starNum(v) {
    if (typeof v === 'number' && v >= 1) { return Math.min(5, Math.round(v)); }
    if (typeof v === 'string' && v) {
      var n = parseInt(v, 10);
      if (n >= 1 && n <= 5) { return n; }
      var count = 0;
      for (var i = 0; i < v.length; i++) {
        if (v.charAt(i) === '\u2605') { count++; } /* R67注：历史存量数据解析，非图标；渲染层星级已全 SVG */
      }
      if (count >= 1) { return Math.min(5, count); }
    }
    return 0;
  }

  function effStars(id, model) {
    var s = getSettings().stars;
    if (s && typeof s[id] === 'number' && s[id] >= 1) { return s[id]; }
    var o = overrideOf(id);
    if (o) { var n1 = starNum(o.stars); if (n1) { return n1; } }
    if (model && model.stars) { var n2 = starNum(model.stars); if (n2) { return n2; } }
    var d = model ? detailOf(model) : null;
    if (d && d.stars) { var n3 = starNum(d.stars); if (n3) { return n3; } }
    return 0;
  }

  function effSpeed(id, model) {
    var o = overrideOf(id);
    if (o && o.speed) { return String(o.speed); }
    if (model && model.speed) { return String(model.speed); }
    var d = model ? detailOf(model) : null;
    if (d && d.speed) { return String(d.speed); }
    return '待检测';
  }

  function effDesc(id, model) {
    var o = overrideOf(id);
    if (o && o.desc) { return String(o.desc); }
    if (model && model.desc) { return String(model.desc); }
    var d = model ? detailOf(model) : null;
    if (d) {
      if (d.desc) { return String(d.desc); }
      if (d.advantage) { return String(d.advantage); }
    }
    return '';
  }

  function displayName(id, model) {
    var o = overrideOf(id);
    if (o && o.name) { return String(o.name); }
    if (model) {
      if (model.name) { return String(model.name); }
      if (model.model) { return String(model.model); }
    }
    return id || '';
  }

  function rateChipOf(id, model) {
    var o = overrideOf(id);
    var rate = (o && o.rate) ? o.rate : (model ? model.rate : '');
    if (!rate) { return ''; }
    return '<span class="xt-set-chip rate">' + esc(rate) + '</span>';
  }

  /* ---------------- 健康检查（C2 契约） ---------------- */
  function healthOf(id) {
    var h = getSettings().health;
    if (h && h[id] && typeof h[id] === 'object') { return h[id]; }
    return null;
  }

  function healthFresh(id) {
    var h = healthOf(id);
    if (!h || typeof h.at !== 'number') { return false; }
    return (new Date().getTime() - h.at) < HEALTH_TTL;
  }

  function errText(err) {
    if (!err) { return '不可用'; }
    if (err === 'network' || err === 'cors' || err === 'timeout' || err === 'empty') { return ERR_TEXT[err]; }
    if (String(err).indexOf('http_') === 0) { return 'HTTP ' + String(err).slice(5); }
    return String(err);
  }

  /* 错误码 -> 失败原因映射（如实展示，绝不谎报为网络问题） */
  function healthReason(err) {
    var s = String(err === null || typeof err === 'undefined' ? '' : err);
    if (s === 'http_401' || s === 'http_403') { return '密钥无效或无权限'; }
    if (s === 'http_404') { return 'API 端点地址错误'; }
    if (s === 'http_429') { return '请求过于频繁（限流）'; }
    if (s.indexOf('http_') === 0) {
      var code = parseInt(s.slice(5), 10);
      if (code >= 500 && code <= 599) { return '服务端错误（' + code + '）'; }
      if (isNaN(code)) { return s; }
      return 'HTTP ' + code;
    }
    if (s === 'cors') { return '跨域受限（浏览器直连被拦截）'; }
    if (s === 'network') { return '网络不可达'; }
    if (s === 'timeout') { return '请求超时，无响应'; }
    if (s === 'empty') { return '接口无有效响应'; }
    if (s === 'not_found') { return '未找到该模型配置'; }
    if (s === 'no_endpoint') { return '未配置接口地址'; }
    if (s === 'no_key') { return '未配置密钥'; }
    return s || '未知错误';
  }

  /* R81：该模型所属平台是否需要代理（AI_CONFIG.providers[x].needProxy） */
  function needProxyModel(id) {
    var m = findAnyModel(id);
    var cfg = (typeof window !== 'undefined' && window.AI_CONFIG) ? window.AI_CONFIG : null;
    if (m && m.provider && cfg && cfg.providers && cfg.providers[m.provider]) {
      return cfg.providers[m.provider].needProxy === true || cfg.providers[m.provider].needVPN === true;
    }
    return false;
  }

  /* R83：平台显示名（用于「X 需要梯子访问」文案，不写死 Gemini） */
  function providerNameOf(id) {
    var m = findAnyModel(id);
    var cfg = (typeof window !== 'undefined' && window.AI_CONFIG) ? window.AI_CONFIG : null;
    if (m && m.provider && cfg && cfg.providers && cfg.providers[m.provider] &&
        cfg.providers[m.provider].name) {
      return cfg.providers[m.provider].name;
    }
    return (m && m.provider) ? String(m.provider) : '该平台';
  }

  /* R81：auto 模式探测离线的海外平台（与 ai-service isProviderOffline 同一套判定） */
  function offshoreOffline(id) {
    if (!needProxyModel(id)) { return false; }
    var m = findAnyModel(id);
    if (!m || !m.provider) { return false; }
    try {
      if (window.AI_SERVICE && typeof window.AI_SERVICE.isProviderOffline === 'function') {
        return window.AI_SERVICE.isProviderOffline(m.provider) === true;
      }
    } catch (e) { /* 探测不可用时按未离线处理 */ }
    return false;
  }

  /* R81：图片生成模型（检测走 images/generations，最长 60s） */
  function isImageGenId(id) {
    var m = findAnyModel(id);
    return !!(m && m.types && isArray(m.types) && m.types.indexOf('imagegen') >= 0);
  }

  /* R81：失败文案分场景——需代理网络类 / Key 失效 / 模型 ID 无效 / 其他 */
  function healthReasonEx(id, err) {
    var s = String(err === null || typeof err === 'undefined' ? '' : err);
    if (s === 'http_429') { return '当前模型额度已用完/被限流，已自动降级'; }
    if (s === 'network' || s === 'cors' || s === 'timeout' || s === 'empty') {
      if (needProxyModel(id)) {
        return providerNameOf(id) + ' 需要梯子访问，请检查网络或切换到国内模型';
      }
      if (s === 'timeout' || s === 'empty') { return '请求超时，无响应'; }
      return '网络不可达';
    }
    if (s === 'http_401' || s === 'http_403') { return 'Key 无效/过期'; }
    if (s === 'http_404') { return '模型 ID 无效'; }
    return healthReason(err);
  }

  /* 三态：'none' 待检测 / 'ok' 正常 / 'fail' 失败 */
  function healthStateOf(id) {
    var h = healthOf(id);
    if (!h) { return 'none'; }
    return h.ok ? 'ok' : 'fail';
  }

  /* 健康徽章内部片段（dot + 三态文案；R67 图标 SVG 化） */
  function healthBadgeInner(id) {
    var st = healthStateOf(id);
    if (st === 'ok') {
      return '<span class="xt-h-dot ok"></span><span class="xt-h-txt ok">' + ICONS.check + ' 正常</span>';
    }
    if (st === 'fail') {
      if (offshoreOffline(id)) {
        return '<span class="xt-h-dot fail"></span><span class="xt-h-txt bad">' + ICONS.cross +
          ' 离线·自动降级国内链</span>';
      }
      return '<span class="xt-h-dot fail"></span><span class="xt-h-txt bad">' + ICONS.cross + ' 失败</span>';
    }
    return '<span class="xt-h-dot"></span><span class="xt-h-txt">' + ICONS.hourglass + ' 待检测</span>';
  }

  function healthTitleOf(id) {
    var st = healthStateOf(id);
    if (st === 'ok') {
      var h = healthOf(id);
      var ms = (h && typeof h.ms === 'number') ? h.ms : 0;
      return '点击重新检测（上次正常，' + ms + 'ms）';
    }
    if (st === 'fail') {
      var h2 = healthOf(id);
      return '点击重新检测（上次失败：' + healthReasonEx(id, h2 ? h2.err : '') + '）';
    }
    return '点击测试接口连通性';
  }

  /* 可点击的健康状态按钮（三态；data-health 委托处理） */
  function healthBoxHtml(id) {
    return '<span class="xt-h-box"><button type="button" class="xt-health-btn" data-health="' +
      esc(id) + '" title="' + esc(healthTitleOf(id)) + '">' + healthBadgeInner(id) + '</button></span>';
  }

  /* 只更新对应行的健康按钮文案与置灰态，不整页重渲染 */
  function updateHealthDot(id) {
    var host = $('setModelList');
    if (!host || !host.querySelectorAll) { return; }
    var rows = host.querySelectorAll('[data-model-id]');
    var h = healthOf(id);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute('data-model-id') !== id) { continue; }
      var btn = rows[i].querySelector('[data-health]');
      if (btn) {
        btn.innerHTML = healthBadgeInner(id);
        btn.setAttribute('title', healthTitleOf(id));
      }
      setRowUnavail(rows[i], !!(h && h.ok === false));
    }
  }

  function setRowUnavail(row, unavail) {
    var cls = String(row.className || '');
    var had = cls.indexOf('unavail') !== -1;
    if (unavail && !had) { row.className = cls + ' unavail'; }
    else if (!unavail && had) { row.className = cls.replace(/(\s|^)unavail(\s|$)/g, ' '); }
  }

  /* 健康结果落库（at=Date.now()），供 30 分钟缓存判定 */
  function recordHealth(id, r) {
    var rec = {
      ok: !!(r && r.ok),
      ms: (r && typeof r.ms === 'number') ? r.ms : 0,
      err: (r && r.err) ? String(r.err) : null,
      at: new Date().getTime()
    };
    getSettings().health[id] = rec;
    saveSettings();
    updateHealthDot(id);
    renderAbout();
  }

  function pendingHealthIds() {
    var all = allModelsList();
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var id = all[i].id;
      if (!healthFresh(id)) { out.push(id); }
    }
    return out;
  }

  /* 后台队列：约 6.5 秒测一个，仅测「未测或缓存超 30 分钟」的模型。
     批量检测运行期间暂停本队列，避免与批量队列叠加超出 10 次/分钟限频。 */
  function pumpHealth() {
    if (batchRunning) { healthTimer = setTimeout(pumpHealth, HEALTH_STEP); return; }
    if (typeof window.aiHealthCheck !== 'function') { return; }
    var ids = pendingHealthIds();
    if (!ids.length) { return; }
    var id = ids[0];
    var p;
    try { p = window.aiHealthCheck(id); } catch (e) { p = null; }
    if (p && typeof p.then === 'function') {
      p.then(function (r) {
        recordHealth(id, r);
      }, function () { /* 本次失败不入缓存，下一轮再测 */ });
    }
    healthTimer = setTimeout(pumpHealth, HEALTH_STEP);
  }

  function startHealthQueue() {
    if (healthTimer) { clearTimeout(healthTimer); healthTimer = 0; }
    healthTimer = setTimeout(pumpHealth, HEALTH_BOOT_DELAY);
  }

  /* 单行检测：写 health + 弹窗反馈 */
  function runHealthCheck(id) {
    if (!id) { return; }
    if (typeof window.aiHealthCheck !== 'function') { toast('warning', '当前环境不支持连通性检测'); return; }
    setTesting(id, true);
    var p;
    try { p = window.aiHealthCheck(id); } catch (e) { p = null; }
    if (!p || typeof p.then !== 'function') { setTesting(id, false); toast('warning', '检测接口未就绪'); return; }
    p.then(function (r) {
      setTesting(id, false);
      recordHealth(id, r);
      showHealthResult(id, r);
    }, function () {
      var r2 = { ok: false, ms: 0, err: 'network' };
      setTesting(id, false);
      recordHealth(id, r2);
      showHealthResult(id, r2);
    });
  }

  function healthMsg(id, r) {
    var ok = !!(r && r.ok);
    if (ok) {
      var ms = (r && typeof r.ms === 'number') ? r.ms : 0;
      return '检测成功，接口可用\n耗时 ' + (ms / 1000).toFixed(1) + 's';
    }
    return '检测失败\n原因：' + healthReasonEx(id, r ? r.err : '');
  }

  function showHealthResult(id, r) {
    var m = findAnyModel(id);
    var name = displayName(id, m) || id;
    showInfoModal('连通性检测 · ' + name, healthMsg(id, r), !!(r && r.ok));
  }

  /* 行内「检测中…」态切换（按钮禁用 + 文案） */
  function setTesting(id, flag) {
    var host = $('setModelList');
    if (host && host.querySelectorAll) {
      var btns = host.querySelectorAll('[data-test]');
      var i;
      for (i = 0; i < btns.length; i++) {
        if (btns[i].getAttribute('data-test') === id) {
          btns[i].disabled = !!flag;
          btns[i].textContent = flag ? (isImageGenId(id) ? '检测中(60s)' : '检测中…') : '检测';
        }
      }
      var hb = host.querySelectorAll('[data-health]');
      for (i = 0; i < hb.length; i++) {
        if (hb[i].getAttribute('data-health') === id) { hb[i].disabled = !!flag; }
      }
    }
  }

  /* R72-12：批量检测并发化（worker pool，并发上限 BATCH_CONCURRENCY=3）。
     健康检查底层 aiHealthCheckImpl 直调 requestModel、不经 callAI、不 recordCall，
     本就不受 10 次/分钟限频约束；原串行实现的「6.5s/个」只是为对上游温和。
     故改为 3 路并发：提速约 3 倍，同时对上游仍温和。
     HEALTH_STEP 常量保留（后台队列 pumpHealth 仍在用），此处不再作为主节流。 */
  var BATCH_CONCURRENCY = 3;   // 批量检测并发上限（同一时刻最多 3 个在飞）
  function batchHealthCheck() {
    if (batchRunning) { return; }
    if (typeof window.aiHealthCheck !== 'function') { toast('warning', '当前环境不支持连通性检测'); return; }
    var all = allModelsList();
    var ids = [];
    for (var i = 0; i < all.length; i++) { ids.push(all[i].id); }
    if (!ids.length) { toast('warning', '没有可检测的模型'); return; }

    batchRunning = true;
    var btn = $('setBatchHealth');
    var done = 0;
    var good = 0;
    var bad = 0;
    var cursor = 0;                                       // 共享取号游标（单线程，取号即自增，天然安全）
    var lanes = Math.min(BATCH_CONCURRENCY, ids.length);  // 实际并发路数

    function setProgress() {
      if (btn) {
        btn.disabled = true;
        var t = $('setBatchHealthTxt');
        if (t) { t.textContent = '检测中 ' + done + '/' + ids.length; }
      }
    }
    function finishAll() {
      batchRunning = false;
      if (btn) {
        btn.disabled = false;
        var t2 = $('setBatchHealthTxt');
        if (t2) { t2.textContent = '批量检测'; }
      }
      toast('success', '批量检测完成：正常 ' + good + ' / 失败 ' + bad);
    }
    function after(id, r) {
      setTesting(id, false);
      recordHealth(id, r);
      if (r && r.ok) { good++; } else { bad++; }
      done++;
      setProgress();
      // 并发下必须用 done===ids.length 判定收尾（旧的 idx>=ids.length 会提前结束）
      if (done === ids.length) { finishAll(); }
    }
    function one(id) {
      setTesting(id, true);
      var p;
      try { p = window.aiHealthCheck(id); } catch (e) { p = null; }
      if (p && typeof p.then === 'function') {
        return p.then(function (r) { after(id, r); }, function () { after(id, { ok: false, ms: 0, err: 'network' }); });
      }
      after(id, { ok: false, ms: 0, err: 'network' });
      return null;
    }
    /* 每个 worker 顺序取号执行；一个完成后再取下一个（保证同时在飞 <= lanes） */
    function worker() {
      if (cursor >= ids.length) { return null; }
      var id = ids[cursor];
      cursor++;
      var p = one(id);
      if (p && typeof p.then === 'function') {
        return p.then(worker, worker);
      }
      return worker();
    }
    setProgress();
    var w;
    for (w = 0; w < lanes; w++) { worker(); }
  }

  /* 重新检测全部：清空 health 全部条目后启动批量队列 */
  function redetectAll() {
    getSettings().health = {};
    saveSettings();
    renderModels();
    renderAbout();
    toast('success', '已清空检测记录，开始重新检测');
    batchHealthCheck();
  }

  /* ---------------- 选中模型（C6：写 ai_selected_model 即同步 AI 页） ---------------- */
  function getSelectedModelId() {
    try {
      var v = localStorage.getItem(SEL_MODEL_KEY);
      return v === null ? '' : v;
    } catch (e) {
      return '';
    }
  }

  function selectModel(id) {
    if (!id) { return; }
    try { localStorage.setItem(SEL_MODEL_KEY, id); } catch (e) { warnStorage(); return; }
    var m = findAnyModel(id);
    toast('success', '已设为当前模型：' + displayName(id, m));
    renderModels();
  }

  /* ---------------- 排序（settings.order） ---------------- */
  function orderedModels() {
    var all = allModelsList();
    var ord = getSettings().order;
    var res = [];
    var used = {};
    var i, j;
    for (i = 0; i < ord.length; i++) {
      if (used[ord[i]]) { continue; }
      for (j = 0; j < all.length; j++) {
        if (all[j].id === ord[i]) { res.push(all[j]); used[ord[i]] = true; break; }
      }
    }
    for (var k = 0; k < all.length; k++) {
      if (!used[all[k].id]) { res.push(all[k]); used[all[k].id] = true; }
    }
    return res;
  }

  function fullOrderIds() {
    var list = orderedModels();
    var r = [];
    for (var i = 0; i < list.length; i++) { r.push(list[i].id); }
    return r;
  }

  /* 上移/下移按钮兜底（老 WebView 触摸 DnD 不可靠） */
  function moveModel(id, dir) {
    if (!id) { return; }
    var ids = fullOrderIds();
    var i = ids.indexOf(id);
    var j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) { return; }
    var tmp = ids[i];
    ids[i] = ids[j];
    ids[j] = tmp;
    getSettings().order = ids;
    saveSettings();
    renderModels();
    toast('success', '已保存排序');
  }

  /* 桌面 HTML5 DnD：把 srcId 移动到 dstId 的位置 */
  function reorder(srcId, dstId) {
    if (!srcId || !dstId || srcId === dstId) { return; }
    var ids = fullOrderIds();
    var src = -1;
    var i;
    for (i = 0; i < ids.length; i++) { if (ids[i] === srcId) { src = i; break; } }
    if (src < 0) { return; }
    ids.splice(src, 1);
    var dst = ids.indexOf(dstId);
    if (dst < 0) { ids.push(srcId); }
    else { ids.splice(dst, 0, srcId); }
    getSettings().order = ids;
    saveSettings();
    renderModels();
    toast('success', '已保存排序');
  }

  /* ---------------- 公共 HTML 片段 ---------------- */
  /* R83：平台级 needProxy（如 openrouter）也属需梯子，与 needVPN 一并标记 */
  function providerNeedProxy(model) {
    if (!model || !model.provider) { return false; }
    var pp = providers();
    return !!(pp[model.provider] && pp[model.provider].needProxy === true);
  }
  function vpnBadge(model) {
    if (!isNeedVPN(model) && !providerNeedProxy(model)) { return ''; }
    return '<span class="xt-set-badge-vpn">需梯子</span>';
  }

  /* R72-15：列表/说明卡片的类型 chip 隐藏「翻译」（该分类已停用）；
     能力标签本身（TYPE_LABELS / ALL_TYPE_KEYS / 表单多选）保持不变，避免存量数据丢失。 */
  var CHIP_HIDDEN_TYPE = { translate: true };
  function typeChipsOf(model) {
    var t = typeKeysOf(model);
    var out = '';
    for (var i = 0; i < t.length; i++) {
      if (CHIP_HIDDEN_TYPE[t[i]]) { continue; }
      out += '<span class="xt-set-chip type">' + esc(TYPE_LABELS[t[i]] || t[i]) + '</span>';
    }
    if (!out) { out = '<span>未标注类型</span>'; }
    return out;
  }

  /* 可点击星级（1-5），data-star 委托处理 */
  function starsHtmlOf(id, n) {
    var h = '<span class="xt-stars" data-star="' + esc(id) + '" title="点击修改星级">';
    for (var i = 1; i <= 5; i++) {
      h += '<span class="' + (i <= n ? 'on' : '') + '" data-star-n="' + i + '">' +
        (i <= n ? ICONS.starOn : ICONS.starOff) + '</span>';
    }
    h += '</span>';
    return h;
  }

  function speedText(id, model) {
    var sp = effSpeed(id, model);
    var h = healthOf(id);
    if (h && h.ok && typeof h.ms === 'number') { return sp + ' · 实测' + h.ms + 'ms'; }
    return sp;
  }

  /* R73-2：模型列表速率展示。桌面端输出与 speedText 完全一致；
     移动端（≤640px）通过 .xt-speed-tag{display:none} 隐藏「· 实测」/「待检测」字词，仅保留实测数值。 */
  function speedHtml(id, model) {
    var sp = effSpeed(id, model);
    var h = healthOf(id);
    if (h && h.ok && typeof h.ms === 'number') {
      return '<span class="xt-speed-tag">' + esc(sp) + ' · 实测</span>' + h.ms + 'ms';
    }
    if (sp !== '待检测') { return esc(sp); }
    return '<span class="xt-speed-tag">' + esc(sp) + '</span>';
  }

  /* ---------------- Tab 切换 ---------------- */
  function switchTab(name) {
    if (!hasOwn(TAB_PANELS, name)) { name = 'models'; }
    var key;
    for (key in TAB_PANELS) {
      if (!hasOwn(TAB_PANELS, key)) { continue; }
      var panel = $(TAB_PANELS[key]);
      var btn = $(TAB_BUTTONS[key]);
      if (panel) { panel.className = (key === name) ? 'xt-set-panel active' : 'xt-set-panel'; }
      if (btn) { btn.className = (key === name) ? 'xt-set-tab active' : 'xt-set-tab'; }
    }
    if (name === 'models') { renderModels(); }
    else if (name === 'func') { renderFuncTypes(); }
    else if (name === 'intro') { renderIntro(); }
    else if (name === 'add') { openAddTab(); }
    else { renderAbout(); }
  }

  function applyHash() {
    var h = String(location.hash || '').replace('#', '');
    if (hasOwn(TAB_PANELS, h)) { switchTab(h); }
    else { switchTab('models'); }
  }

  /* ---------------- Tab 1：模型列表 ---------------- */
  function isDisabled(id) {
    var d = getSettings().disabled;
    return !!(d && d[id]);
  }

  function matchModel(model, id, kw) {
    if (!kw) { return true; }
    var o = overrideOf(id);
    var hay = (displayName(id, model) + ' ' + (model.model || '') + ' ' + id + ' ' +
      providerLabel(model.provider) + ' ' + (o && o.apiUrl ? o.apiUrl : '')).toLowerCase();
    return hay.indexOf(kw) !== -1;
  }

  function modelRowHtml(model, selId) {
    var id = model.id;
    var off = isDisabled(id);
    var used = (selId && selId === id);
    var custom = isCustomId(id);
    var h = healthOf(id);
    var unavail = !!(h && h.ok === false);
    var cls = 'xt-set-row' + (used ? ' cur' : '') + (off ? ' off' : '') + (unavail ? ' unavail' : '');
    var html = '';
    html += '<div class="' + cls + '" data-model-id="' + esc(id) + '" draggable="true">';
    html += '<span class="xt-drag-handle" data-handle="1" title="拖拽排序">' + ICONS.grip + '</span>';
    html += '<div class="xt-set-row-main">';
    html += '<div class="xt-set-row-name">' + esc(displayName(id, model));
    if (custom) { html += ' <span class="xt-set-chip">自定义</span>'; }
    html += rateChipOf(id, model) + vpnBadge(model);
    if (used) { html += ' <span class="xt-set-used">当前使用</span>'; }
    html += '</div>';
    html += '<div class="xt-set-row-sub">' +
      '<span class="xt-speed">' + speedHtml(id, model) + '</span>' + healthBoxHtml(id) + '</div>';
    html += '</div>';
    html += '<div class="xt-set-row-right">';
    html += starsHtmlOf(id, effStars(id, model));
    html += '<span class="xt-set-switch' + (off ? '' : ' on') + '" data-toggle="' + esc(id) +
      '" role="switch" aria-checked="' + (off ? 'false' : 'true') + '"><span class="xt-set-knob"></span></span>';
    html += '<button type="button" class="xt-ico-btn" data-test="' + esc(id) + '" title="检测接口连通性">检测</button>';
    if (custom) {
      html += '<button type="button" class="xt-ico-btn del" data-del="' + esc(id) + '" title="删除">' + ICONS.del + '</button>';
    }
    html += '<button type="button" class="xt-ico-btn" data-up="' + esc(id) + '" title="上移">' + ICONS.up + '</button>';
    html += '<button type="button" class="xt-ico-btn" data-down="' + esc(id) + '" title="下移">' + ICONS.down + '</button>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  function renderModels() {
    var host = $('setModelList');
    if (!host) { return; }
    var list = orderedModels();
    if (!list.length) {
      host.innerHTML = '<div class="xt-set-empty">暂无模型配置<br><br>在上方「添加模型」标签页可新增自定义模型</div>';
      return;
    }
    var kw = fieldVal('setModelSearch').toLowerCase().trim();
    var selId = getSelectedModelId();
    var html = '';
    var shown = 0;
    for (var i = 0; i < list.length; i++) {
      if (!matchModel(list[i], list[i].id, kw)) { continue; }
      html += modelRowHtml(list[i], selId);
      shown++;
    }
    if (!shown) { host.innerHTML = '<div class="xt-set-empty">没有匹配的模型</div>'; return; }
    host.innerHTML = html;
  }

  function toggleModel(id) {
    if (!id) { return; }
    var s = getSettings();
    var m = findAnyModel(id);
    var name = displayName(id, m);
    if (s.disabled[id]) {
      delete s.disabled[id];
      toast('success', '已启用 ' + name);
    } else {
      s.disabled[id] = true;
      toast('warning', '已停用 ' + name);
    }
    saveSettings();
    renderModels();
  }

  function enableAll() {
    getSettings().disabled = {};
    saveSettings();
    renderModels();
    toast('success', '已启用全部模型');
  }

  function disableAll() {
    var list = allModelsList();
    var d = {};
    for (var i = 0; i < list.length; i++) { d[list[i].id] = true; }
    getSettings().disabled = d;
    saveSettings();
    renderModels();
    toast('warning', '已停用全部模型');
  }

  /* 恢复默认：清空 disabled / order / overrides / stars，不动 ai_custom_models */
  function restoreDefaults() {
    pageConfirm('确定恢复默认排序和设置吗？\n\n将清空：启用状态、排序、内置模型覆盖配置、星级（自定义模型不受影响）。', '恢复默认').then(function (ok) {
      if (!ok) { return; }
      var s = getSettings();
      s.disabled = {};
      s.order = [];
      s.overrides = {};
      s.stars = {};
      saveSettings();
      renderModels();
      renderAbout();
      renderSortPreview();
      toast('success', '已恢复默认设置');
    });
  }

  /* ---------------- R72-14：恢复默认 -> 弹窗（排序 / 映射到 AI 页下拉） ---------------- */
  /* 「可用模型」= 未停用（enabled）的模型，按当前展示顺序排列 */
  function availableIds() {
    var list = orderedModels();
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (!isDisabled(list[i].id)) { out.push(list[i].id); }
    }
    return out;
  }

  /* 速率 -> 粗排等级（快 1 / 中 2 / 慢 3 / 待检测 4） */
  function speedRank(id, model) {
    var sp = String(effSpeed(id, model) || '');
    if (sp.indexOf('快') !== -1) { return 1; }
    if (sp.indexOf('中') !== -1) { return 2; }
    if (sp.indexOf('慢') !== -1) { return 3; }
    return 4;
  }

  function healthOk(id) {
    var h = healthOf(id);
    return !!(h && h.ok === true);
  }

  function healthMs(id) {
    var h = healthOf(id);
    if (h && h.ok && typeof h.ms === 'number' && h.ms > 0) { return h.ms; }
    return 999999;
  }

  /* (1) 按可用模型排序：健康正常在前（按实测 ms 升序），未测/失败在后（按 ms 升序） */
  function sortByAvailability() {
    var ids = availableIds();
    ids.sort(function (a, b) {
      var oa = healthOk(a) ? 0 : 1;
      var ob = healthOk(b) ? 0 : 1;
      if (oa !== ob) { return oa - ob; }
      return healthMs(a) - healthMs(b);
    });
    getSettings().order = ids;
    saveSettings();
    renderModels();
    renderSortPreview();
    toast('success', '已按可用模型排序（' + ids.length + ' 个）');
  }

  /* (2) 按速率排序：快 > 中 > 慢 > 待检测；同档按健康实测 ms 升序 */
  function sortBySpeed() {
    var ids = availableIds();
    ids.sort(function (a, b) {
      var ra = speedRank(a, findAnyModel(a));
      var rb = speedRank(b, findAnyModel(b));
      if (ra !== rb) { return ra - rb; }
      return healthMs(a) - healthMs(b);
    });
    getSettings().order = ids;
    saveSettings();
    renderModels();
    renderSortPreview();
    toast('success', '已按速率排序（' + ids.length + ' 个）');
  }

  /* (3) 映射到 AI 页模型下拉：写 ai_model_settings.order + overrides[id].name，
        并对「健康可用」的模型清掉 disabled（让其在 AI 页下拉出现）。
        注意：只改 overrides[id].name 子字段，apiUrl/apiKey/apiFormat 等原样保留。 */
  function mapToAiList() {
    var s = getSettings();
    var ids = availableIds();
    var all = fullOrderIds();
    var mapped = [];
    var i, id, m, nm, ov;
    // order：可用模型按当前排序在前，其余（被停用的）保留在尾部，顺序不丢
    for (i = 0; i < ids.length; i++) { mapped.push(ids[i]); }
    for (i = 0; i < all.length; i++) { if (mapped.indexOf(all[i]) === -1) { mapped.push(all[i]); } }
    s.order = mapped;
    for (i = 0; i < mapped.length; i++) {
      id = mapped[i];
      m = findAnyModel(id);
      nm = displayName(id, m);
      if (nm) {
        ov = s.overrides[id];
        if (ov && typeof ov === 'object') {
          ov.name = nm;                                  // 仅写 name 子字段，其余字段原样保留
        } else {
          s.overrides[id] = { name: nm };
        }
      }
      if (healthOk(id)) { delete s.disabled[id]; }        // 健康可用的模型确保出现在下拉
    }
    saveSettings();
    renderModels();
    renderSortPreview();
    toast('success', '已映射到 AI 页模型下拉（' + ids.length + ' 个名称与顺序）');
  }

  /* 排序预览（只读）：显示当前顺序、启用态与健康态 */
  function sortPreviewItemHtml(id, idx) {
    var m = findAnyModel(id);
    var name = displayName(id, m);
    var off = isDisabled(id);
    var badge = healthOk(id) ? '正常' : (healthOf(id) ? '失败' : '待检测');
    var h = '<div class="xt-sort-item' + (off ? ' off' : '') + '">';
    h += '<span class="xt-sort-idx">' + (idx + 1) + '</span>';
    h += '<span class="xt-sort-name">' + esc(name) + '</span>';
    h += '<span class="xt-sort-tag">' + (off ? '已停用' : '已启用') + '</span>';
    h += '<span class="xt-sort-tag">' + esc(badge) + '</span>';
    h += '</div>';
    return h;
  }

  function renderSortPreview() {
    var host = $('setSortPreview');
    if (!host) { return; }
    var ids = fullOrderIds();
    if (!ids.length) { host.innerHTML = '<div class="xt-set-empty" style="padding:16px 0;">暂无模型</div>'; return; }
    var html = '';
    for (var i = 0; i < ids.length; i++) { html += sortPreviewItemHtml(ids[i], i); }
    host.innerHTML = html;
  }

  function openSortModal() {
    var mask = $('setSortModal');
    if (!mask) { restoreDefaults(); return; }   // 兜底：无弹窗 DOM 时退回原确认流程
    renderSortPreview();
    mask.style.display = 'flex';
  }

  function closeSortModal() {
    var mask = $('setSortModal');
    if (mask) { mask.style.display = 'none'; }
  }

  /* 弹窗交互（事件委托，无内联 onclick，与设置页既有写法一致） */
  function bindSortModalEvents() {
    var mask = $('setSortModal');
    if (!mask || !mask.addEventListener) { return; }
    mask.addEventListener('click', function (e) {
      if (e.target === mask) { closeSortModal(); return; }   // 点遮罩关闭
      var el = closestAttr(e.target, 'data-sort-act', mask);
      if (!el) { return; }
      var act = el.getAttribute('data-sort-act');
      if (act === 'avail') { sortByAvailability(); }
      else if (act === 'speed') { sortBySpeed(); }
      else if (act === 'map') { mapToAiList(); }
      else if (act === 'reset') { restoreDefaults(); }
      else if (act === 'close') { closeSortModal(); }
    });
  }

  /* 删除自定义模型（内置模型只能禁用，不提供删除） */
  function confirmDeleteModel(id) {
    if (!id || !isCustomId(id)) { return; }
    var m = findAnyModel(id);
    pageConfirm('确定删除自定义模型「' + displayName(id, m) + '」吗？\n\n删除后不可恢复。', '删除').then(function (ok) {
      if (!ok) { return; }
      deleteCustomModel(id);
    });
  }

  function deleteCustomModel(id) {
    var arr = readCustomModels();
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id !== id) { out.push(arr[i]); }
    }
    writeCustomModels(out);
    var s = getSettings();
    delete s.disabled[id];
    delete s.stars[id];
    delete s.health[id];
    delete s.overrides[id];
    var ord = [];
    for (var j = 0; j < s.order.length; j++) { if (s.order[j] !== id) { ord.push(s.order[j]); } }
    s.order = ord;
    for (var k in s.catModels) {
      if (!hasOwn(s.catModels, k)) { continue; }
      var ids = [];
      for (var t = 0; t < s.catModels[k].length; t++) { if (s.catModels[k][t] !== id) { ids.push(s.catModels[k][t]); } }
      s.catModels[k] = ids;
    }
    if (getSelectedModelId() === id) {
      try { localStorage.setItem(SEL_MODEL_KEY, ''); } catch (e) { /* 忽略 */ }
    }
    saveSettings();
    renderModels();
    renderFuncTypes();
    renderIntro();
    renderAbout();
    toast('success', '已删除');
  }

  /* 自定义模型改 id 时迁移所有引用 */
  function migrateRefs(oldId, newId) {
    var s = getSettings();
    var i;
    for (i = 0; i < s.order.length; i++) { if (s.order[i] === oldId) { s.order[i] = newId; } }
    if (s.disabled[oldId]) { delete s.disabled[oldId]; s.disabled[newId] = true; }
    if (typeof s.stars[oldId] === 'number') { var sv = s.stars[oldId]; delete s.stars[oldId]; s.stars[newId] = sv; }
    if (s.health[oldId]) { var hv = s.health[oldId]; delete s.health[oldId]; s.health[newId] = hv; }
    if (s.overrides[oldId]) { var ov = s.overrides[oldId]; delete s.overrides[oldId]; s.overrides[newId] = ov; }
    for (var k in s.catModels) {
      if (!hasOwn(s.catModels, k)) { continue; }
      for (var t = 0; t < s.catModels[k].length; t++) { if (s.catModels[k][t] === oldId) { s.catModels[k][t] = newId; } }
    }
    if (getSelectedModelId() === oldId) {
      try { localStorage.setItem(SEL_MODEL_KEY, newId); } catch (e) { /* 忽略 */ }
    }
    saveSettings();
  }

  /* 新增/编辑保存后高亮闪一下新行 */
  function flashRow(id) {
    var host = $('setModelList');
    if (!host || !host.querySelectorAll) { return; }
    var rows = host.querySelectorAll('[data-model-id]');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute('data-model-id') === id) {
        rows[i].className = String(rows[i].className || '') + ' flash';
        try { if (rows[i].scrollIntoView) { rows[i].scrollIntoView(); } } catch (e) { /* 忽略 */ }
      }
    }
  }

  /* ---------------- Tab 2：功能分类（只按能力分类，无场景字样） ---------------- */
  function allCategories() {
    var out = [];
    var i;
    for (i = 0; i < BUILTIN_CATS.length; i++) {
      out.push({ key: BUILTIN_CATS[i].key, label: BUILTIN_CATS[i].label, custom: false });
    }
    var cs = getSettings().categories;
    for (var j = 0; j < cs.length; j++) {
      out.push({ key: cs[j].key, label: cs[j].label, custom: true });
    }
    return out;
  }

  /* 该分类下的候选模型（内置分类按能力映射筛选；自定义分类=全部模型） */
  function modelsOfCategory(key) {
    var all = allModelsList();
    var isBuiltin = false;
    var i, j;
    for (i = 0; i < BUILTIN_CATS.length; i++) {
      if (BUILTIN_CATS[i].key === key) { isBuiltin = true; break; }
    }
    if (!isBuiltin) { return all.slice(); }
    var out = [];
    for (i = 0; i < all.length; i++) {
      var t = typeKeysOf(all[i]);
      for (j = 0; j < t.length; j++) {
        if (CAT_OF_TYPE[t[j]] === key) { out.push(all[i]); break; }
      }
    }
    return out;
  }

  /* 优先级链 ids：用户配置过（catModels 有键，可为空数组）则完全以用户为准；
      否则内置分类回退到 FUNC_TYPES 的 primary + fallback */
  function chainIdsOf(key) {
    var cm = getSettings().catModels;
    if (cm && hasOwn(cm, key)) { return isArray(cm[key]) ? cm[key].slice() : []; }
    var ft = funcTypes()[key];
    var out = [];
    if (ft) {
      if (ft.primary && findAnyModel(ft.primary)) { out.push(ft.primary); }
      if (isArray(ft.fallback)) {
        for (var i = 0; i < ft.fallback.length; i++) {
          if (ft.fallback[i] && findAnyModel(ft.fallback[i]) && out.indexOf(ft.fallback[i]) === -1) {
            out.push(ft.fallback[i]);
          }
        }
      }
    }
    return out;
  }

  function chainModelsOf(key) {
    var ids = chainIdsOf(key);
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var m = findAnyModel(ids[i]);
      if (m) { out.push(m); }
    }
    return out;
  }

  function saveChain(key, ids) {
    var s = getSettings();
    s.catModels[key] = ids;
    saveSettings();
    renderFuncTypes();
    toast('success', '已保存');
  }

  /* 链内上移/下移/移除 */
  function chainOp(key, id, op) {
    var ids = chainIdsOf(key);
    var i = ids.indexOf(id);
    if (i < 0) { return; }
    if (op === 'up' && i > 0) { ids.splice(i, 1); ids.splice(i - 1, 0, id); }
    else if (op === 'down' && i < ids.length - 1) { ids.splice(i, 1); ids.splice(i + 1, 0, id); }
    else if (op === 'rm') { ids.splice(i, 1); }
    else { return; }
    saveChain(key, ids);
  }

  function addModelToCat(key, id) {
    if (!id) { return; }
    var ids = chainIdsOf(key);
    if (ids.indexOf(id) !== -1) { return; }
    ids.push(id);
    saveChain(key, ids);
  }

  function catCardHtml(cat) {
    var key = cat.key;
    var chain = chainModelsOf(key);
    var pool = modelsOfCategory(key);
    var inChain = {};
    var i;
    for (i = 0; i < chain.length; i++) { inChain[chain[i].id] = true; }
    var html = '<div class="xt-set-card" data-cat="' + esc(key) + '">';
    html += '<div class="xt-set-card-h"><div class="xt-set-card-t">' + esc(cat.label) + '</div>' +
      '<div class="xt-set-card-key">' + esc(key) + '</div></div>';
    html += '<div class="xt-set-card-desc">该类模型按以下优先级依次尝试</div>';
    html += '<div class="xt-chain">';
    for (i = 0; i < chain.length; i++) {
      var mid = chain[i].id;
      html += '<div class="xt-chain-item">';
      html += '<span class="xt-chain-num">' + (i + 1) + '</span>';
      html += '<span class="xt-chain-name">' + esc(displayName(mid, chain[i])) + '</span>';
      html += '<button type="button" class="xt-ico-btn" data-cat-up="' + esc(key) + '|' + esc(mid) + '" title="上移">' + ICONS.up + '</button>';
      html += '<button type="button" class="xt-ico-btn" data-cat-down="' + esc(key) + '|' + esc(mid) + '" title="下移">' + ICONS.down + '</button>';
      html += '<button type="button" class="xt-ico-btn del" data-cat-rm="' + esc(key) + '|' + esc(mid) + '" title="移出">' + ICONS.x + '</button>';
      html += '</div>';
    }
    if (!chain.length) {
      html += '<div class="xt-set-empty" style="padding:14px 0;">尚未选择模型，点击下方模型标签添加</div>';
    }
    html += '</div>';
    html += '<div class="xt-set-field"><div class="xt-set-field-label">该类模型（点击加入优先级链）</div>';
    html += '<div class="xt-cat-pool">';
    var poolShown = 0;
    for (i = 0; i < pool.length; i++) {
      if (inChain[pool[i].id]) { continue; }
      html += '<button type="button" class="xt-cat-addchip" data-cat-addchip="' + esc(key) + '|' + esc(pool[i].id) + '">＋ ' +
        esc(displayName(pool[i].id, pool[i])) + '</button>';
      poolShown++;
    }
    if (!poolShown) { html += '<span style="font-size:12px;color:var(--ai-muted);">该类模型已全部加入</span>'; }
    html += '</div></div>';
    if (cat.custom) {
      html += '<div class="xt-set-field" style="display:flex;flex-wrap:wrap;gap:8px;">';
      html += '<button type="button" class="xt-ico-btn" data-cat-moveup="' + esc(key) + '">分类上移</button>';
      html += '<button type="button" class="xt-ico-btn" data-cat-movedown="' + esc(key) + '">分类下移</button>';
      html += '<button type="button" class="xt-ico-btn del" data-cat-del="' + esc(key) + '">删除分类</button>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function renderFuncTypes() {
    var host = $('setFuncList');
    if (!host) { return; }
    var cats = allCategories();
    var html = '';
    for (var i = 0; i < cats.length; i++) { html += catCardHtml(cats[i]); }
    html += '<div class="xt-set-note">内置 3 类按能力划分：文本 / 识图 / 推理；「代码」等更多分类可自行新建，新建分类即新的功能路由槽。</div>';
    host.innerHTML = html;
  }

  function delCategory(key) {
    var s = getSettings();
    var label = key;
    var i;
    for (i = 0; i < s.categories.length; i++) {
      if (s.categories[i].key === key) { label = s.categories[i].label; break; }
    }
    pageConfirm('确定删除分类「' + label + '」吗？\n\n该分类下的模型优先级配置将一并删除（模型本身不受影响）。', '删除').then(function (ok) {
      if (!ok) { return; }
      var st = getSettings();
      var out = [];
      for (var j = 0; j < st.categories.length; j++) {
        if (st.categories[j].key !== key) { out.push(st.categories[j]); }
      }
      st.categories = out;
      if (st.catModels && hasOwn(st.catModels, key)) { delete st.catModels[key]; }
      saveSettings();
      renderFuncTypes();
      toast('success', '已删除分类「' + label + '」');
    });
  }

  function moveCategory(key, dir) {
    var s = getSettings();
    var idx = -1;
    var i;
    for (i = 0; i < s.categories.length; i++) {
      if (s.categories[i].key === key) { idx = i; break; }
    }
    if (idx < 0) { return; }
    var j = idx + dir;
    if (j < 0 || j >= s.categories.length) { return; }
    var tmp = s.categories[idx];
    s.categories[idx] = s.categories[j];
    s.categories[j] = tmp;
    saveSettings();
    renderFuncTypes();
    toast('success', '已保存分类排序');
  }

  function toggleAddTypeRow() {
    var row = $('setAddTypeRow');
    if (!row) { return; }
    var visible = (row.style.display === 'flex');
    row.style.display = visible ? 'none' : 'flex';
    if (!visible) {
      var inp = $('setNewTypeName');
      if (inp && inp.focus) { inp.focus(); }
    }
  }

  function hideAddTypeRow() {
    var row = $('setAddTypeRow');
    if (row) { row.style.display = 'none'; }
    var inp = $('setNewTypeName');
    if (inp) { inp.value = ''; }
  }

  /* 新建分类：key 即新 funcType 路由槽，写 settings.categories + catModels */
  function addCustomType() {
    var name = fieldVal('setNewTypeName').trim();
    if (!name) { toast('warning', '请输入分类名称'); return; }
    var s = getSettings();
    var i;
    for (i = 0; i < s.categories.length; i++) {
      if (s.categories[i].label === name || s.categories[i].key === name) {
        toast('warning', '该分类已存在');
        return;
      }
    }
    var key = 'custom_' + new Date().getTime().toString(36);
    s.categories.push({ key: key, label: name, funcType: key });
    if (!hasOwn(s.catModels, key)) { s.catModels[key] = []; }
    saveSettings();
    hideAddTypeRow();
    renderFuncTypes();
    toast('success', '已添加分类「' + name + '」');
  }

  /* ---------------- Tab 3：模型说明 ---------------- */
  function matchIntro(id, model, kw) {
    if (!kw) { return true; }
    var d = detailOf(model);
    var hay = (displayName(id, model) + ' ' + id + ' ' + (model.model || '') + ' ' +
      providerLabel(model.provider) + ' ' + (d && d.platform ? d.platform : '')).toLowerCase();
    return hay.indexOf(kw) !== -1;
  }

  function introCardHtml(model) {
    var id = model.id;
    var d = detailOf(model);
    var platform = (d && d.platform) ? d.platform : providerLabel(model.provider);
    var html = '<div class="xt-set-intro-card" data-intro-id="' + esc(id) + '">';
    html += '<div class="xt-set-intro-h">';
    html += '<div><div class="xt-set-intro-name">' + esc(displayName(id, model)) + '</div>';
    html += '<div class="xt-set-intro-meta"><span class="xt-set-chip">' + esc(platform) + '</span>' +
      typeChipsOf(model) + '</div></div>';
    html += '<div class="xt-set-intro-badges">' + rateChipOf(id, model) + vpnBadge(model) + healthBoxHtml(id) + '</div>';
    html += '</div>';
    html += '<div class="xt-set-intro-line"><span class="xt-set-intro-k">星级</span>' +
      '<span class="xt-set-intro-v">' + starsHtmlOf(id, effStars(id, model)) +
      '<span class="xt-star-note">（可自行调整）</span></span></div>';
    html += '<div class="xt-set-intro-line"><span class="xt-set-intro-k">速度</span>' +
      '<span class="xt-set-intro-v">' + esc(speedText(id, model)) + '</span></div>';
    var desc = effDesc(id, model);
    html += '<div class="xt-set-intro-line"><span class="xt-set-intro-k">说明</span>' +
      '<span class="xt-set-intro-v">' + esc(desc || '暂无说明') + '</span></div>';
    html += '<div class="xt-set-intro-id">' + esc(model.model || id) + '</div>';
    html += '</div>';
    return html;
  }

  function renderIntro() {
    var host = $('setIntroList');
    if (!host) { return; }
    var list = allModelsList();
    if (!list.length) { host.innerHTML = '<div class="xt-set-empty">暂无可介绍的模型</div>'; return; }
    var kw = fieldVal('setIntroSearch').toLowerCase().trim();
    var html = '';
    var shown = 0;
    for (var i = 0; i < list.length; i++) {
      if (kw && !matchIntro(list[i].id, list[i], kw)) { continue; }
      html += introCardHtml(list[i]);
      shown++;
    }
    if (!shown) { host.innerHTML = '<div class="xt-set-empty">没有匹配的模型</div>'; return; }
    host.innerHTML = html;
  }

  /* ---------------- 星级修改（Tab1 行内 / Tab3 卡片通用） ---------------- */
  function setStar(id, n) {
    if (!id || !(n >= 1 && n <= 5)) { return; }
    var s = getSettings();
    if (typeof s.stars[id] === 'number' && s.stars[id] === n) {
      delete s.stars[id]; // 再点同一星 = 恢复默认
    } else {
      s.stars[id] = n;
    }
    saveSettings();
    renderModels();
    renderIntro();
    toast('success', '已保存星级');
  }

  /* ---------------- Tab 4：添加 / 编辑模型 ---------------- */
  function numOrNull(v) {
    var t = String(v || '').trim();
    if (!t) { return null; }
    var n = parseFloat(t);
    if (isNaN(n)) { return null; }
    return n;
  }

  function intOrNull(v) {
    var n = numOrNull(v);
    if (n === null) { return null; }
    return Math.round(n);
  }

  /* 额外请求头 textarea 解析：每行一个 "Key: Value" */
  function parseHeaders(text) {
    var out = {};
    var lines = String(text || '').split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) { continue; }
      var idx = line.indexOf(':');
      if (idx <= 0) { continue; }
      var k = line.slice(0, idx).trim();
      var v = line.slice(idx + 1).trim();
      if (k) { out[k] = v; }
    }
    return out;
  }

  function headersToText(obj) {
    if (!obj || typeof obj !== 'object') { return ''; }
    var lines = [];
    for (var k in obj) {
      if (hasOwn(obj, k) && obj[k]) { lines.push(k + ': ' + obj[k]); }
    }
    return lines.join('\n');
  }

  function renderFormTypes() {
    var host = $('setFmTypes');
    if (!host) { return; }
    var html = '';
    for (var i = 0; i < ALL_TYPE_KEYS.length; i++) {
      var k = ALL_TYPE_KEYS[i];
      html += '<button type="button" class="xt-type-check' + (formTypes[k] ? ' on' : '') +
        '" data-type-check="' + esc(k) + '">' + esc(TYPE_LABELS[k]) + '</button>';
    }
    host.innerHTML = html;
  }

  function renderFormStars() {
    var host = $('setFmStars');
    if (!host) { return; }
    var html = '';
    for (var i = 1; i <= 5; i++) {
      html += '<button type="button" class="' + (i <= formStars ? 'on' : '') +
        '" data-form-star="' + i + '" title="' + i + ' 星">' +
        (i <= formStars ? ICONS.starOn : ICONS.starOff) + '</button>';
    }
    host.innerHTML = html;
  }

  function populateFallback(excludeId) {
    var sel = $('setFmFallback');
    if (!sel) { return; }
    var html = '<option value="">（无）</option>';
    var list = allModelsList();
    for (var i = 0; i < list.length; i++) {
      if (excludeId && list[i].id === excludeId) { continue; }
      html += '<option value="' + esc(list[i].id) + '">' + esc(displayName(list[i].id, list[i])) + '</option>';
    }
    sel.innerHTML = html;
  }

  /* R67 服务商下拉：三层分组（已接入内置 Key / 主流厂商需自备 Key / 手动填写）。
     原生 select 自带限高内部滚动与选中高亮，样式与项目既有下拉（.xt-set-select）对齐。 */
  function buildProviderOptions() {
    var sel = $('setFmProvider');
    if (!sel) { return; }
    var gs = providerGroups();
    var html = '<option value="">（选择服务商）</option>';
    var bHtml = '';
    var kHtml = '';
    var cHtml = '';
    for (var i = 0; i < gs.length; i++) {
      var g = gs[i];
      if (!g || !g.key) { continue; }
      var lab = String(g.label || g.key);
      if (g.key === PG_CUSTOM_KEY) {
        cHtml += '<option value="' + esc(g.key) + '">' + esc(lab) + '</option>';
      } else if (g.builtin === true) {
        bHtml += '<option value="' + esc(g.key) + '">' + esc(lab) + '</option>';
      } else {
        kHtml += '<option value="' + esc(g.key) + '">' + esc(lab) + '（需自备 Key）</option>';
      }
    }
    if (bHtml) { html += '<optgroup label="已接入 · 内置 Key 可直接用">' + bHtml + '</optgroup>'; }
    if (kHtml) { html += '<optgroup label="主流厂商 · 需自备 Key">' + kHtml + '</optgroup>'; }
    if (cHtml) { html += '<optgroup label="手动填写">' + cHtml + '</optgroup>'; }
    sel.innerHTML = html;
  }

  /* needKey 组的 note 标注（含 Claude 协议不兼容提示）；无 note 时隐藏 */
  function renderProviderNote(g) {
    var el = $('setFmProviderNote');
    if (!el) { return; }
    var txt = (g && g.note) ? String(g.note) : '';
    if (!txt && g && g.needKey === true) { txt = '需自备 Key，端点未经本项目实测'; }
    if (txt) {
      el.textContent = txt;
      el.style.display = 'block';
    } else {
      el.textContent = '';
      el.style.display = 'none';
    }
  }

  /* 模型 ID 字段形态：已知服务商（有候选模型）-> 下拉；自定义/无候选 -> 文本输入 */
  function setupModelIdField(g) {
    var sel = $('setFmModelIdSel');
    var inp = $('setFmModelId');
    if (!sel || !inp) { return; }
    var useSel = !!(g && isArray(g.models) && g.models.length);
    if (useSel) {
      var cur = fieldVal('setFmModelId').trim();
      var html = '<option value="">（选择模型）</option>';
      var found = false;
      for (var i = 0; i < g.models.length; i++) {
        var mm = g.models[i];
        if (!mm || !mm.id) { continue; }
        var lab = (mm.name ? mm.name : mm.id) + '（' + mm.id + '）';
        html += '<option value="' + esc(mm.id) + '">' + esc(lab) + '</option>';
        if (cur === mm.id) { found = true; }
      }
      sel.innerHTML = html;
      setVal('setFmModelIdSel', found ? cur : '');
      if (!found) { setVal('setFmModelId', ''); }
      sel.style.display = '';
      inp.style.display = 'none';
    } else {
      sel.style.display = 'none';
      sel.innerHTML = '';
      inp.style.display = '';
    }
  }

  /* 切服务商 -> 回填端点（apiUrl 为空则清空不冒充）/ 切换模型 ID 形态 / 非 openai 协议组自动展开高级设置 */
  function onProviderChange() {
    var key = fieldVal('setFmProvider');
    var g = key ? findGroup(key) : null;
    renderProviderNote(g);
    setVal('setFmUrl', g ? String(g.apiUrl || '') : '');
    setVal('setFmModelId', '');
    setVal('setFmModelIdSel', '');
    setupModelIdField(g);
    if (g && g.apiFormat && String(g.apiFormat) !== 'openai') {
      setVal('setFmFormat', String(g.apiFormat));
      setAdvOpen(true);
    } else {
      setVal('setFmFormat', 'openai');
    }
  }

  /* 切模型 ID（下拉）-> 同步隐藏输入框 + 自动预填名称与能力标签 */
  function onModelIdSelChange() {
    var id = fieldVal('setFmModelIdSel');
    setVal('setFmModelId', id);
    var g = findGroup(fieldVal('setFmProvider'));
    if (!g || !isArray(g.models)) { return; }
    for (var i = 0; i < g.models.length; i++) {
      var mm = g.models[i];
      if (mm && mm.id === id) {
        if (mm.name) { setVal('setFmName', String(mm.name)); }
        formTypes = {};
        var t = isArray(mm.types) ? mm.types : [];
        for (var j = 0; j < t.length; j++) { formTypes[t[j]] = true; }
        renderFormTypes();
        break;
      }
    }
  }

  /* 「高级设置」折叠：折叠状态下提交一律按 openai（R67 决策 2，保住 Gemini/自定义协议入口） */
  function toggleAdv() {
    formAdvOpen = !formAdvOpen;
    var box = $('setFmAdv');
    var btn = $('setFmAdvToggle');
    if (box) { box.style.display = formAdvOpen ? 'block' : 'none'; }
    if (btn) { btn.className = formAdvOpen ? 'xt-adv-toggle open' : 'xt-adv-toggle'; }
  }

  function setAdvOpen(open) {
    if (!!open !== formAdvOpen) { toggleAdv(); }
  }

  /* Key 状态行：明文永不回填；此函数只展示「是否已有密钥」的语义 */
  function keyOverrideExists(id) {
    var o = overrideOf(id);
    return !!(o && typeof o.apiKey === 'string' && o.apiKey);
  }

  function renderKeyState() {
    var host = $('setFmKeyState');
    if (!host) { return; }
    var kind = editTarget.kind;
    var text = '';
    var showClear = false;
    var lockFlag = false;
    if (kind === 'builtin') {
      if (keyOverrideExists(editTarget.id)) {
        text = '已自定义密钥（留空保持不变）';
        showClear = true;
      } else {
        text = '已使用平台内置密钥';
        lockFlag = true;
      }
    } else if (kind === 'custom') {
      var m = findAnyModel(editTarget.id);
      if (m && m.apiKey) { text = '已保存密钥（留空保持不变）'; }
      else { text = '尚未设置密钥（留空保存后仍为空）'; }
    } else {
      text = '新模型：填写后保存（留空则暂不保存密钥）';
    }
    var html = '<span class="xt-key-state-txt">' + (lockFlag ? ICONS.lock + ' ' : '') + esc(text) + '</span>';
    if (showClear) {
      html += '<button type="button" class="xt-key-clear" id="setFmKeyClear">清除密钥覆盖</button>';
    }
    host.innerHTML = html;
    if (showClear) {
      var b = $('setFmKeyClear');
      if (b && b.addEventListener) { b.addEventListener('click', clearKeyOverride); }
    }
  }

  /* 清除内置模型的密钥覆盖（二次确认） */
  function clearKeyOverride() {
    if (editTarget.kind !== 'builtin' || !editTarget.id) { return; }
    var id = editTarget.id;
    pageConfirm('确定清除该内置模型的密钥覆盖，恢复使用平台内置密钥吗？', '清除').then(function (ok) {
      if (!ok) { return; }
      var o = overrideOf(id);
      if (o && typeof o === 'object') { delete o.apiKey; }
      saveSettings();
      renderKeyState();
      toast('success', '已恢复使用平台内置密钥');
    });
  }

  function resetForm() {
    editTarget = { kind: '', id: '' };
    formTypes = {};
    formStars = 0;
    setVal('setFmProvider', '');
    renderProviderNote(null);
    setVal('setFmName', '');
    setVal('setFmFormat', 'openai');
    setAdvOpen(false);
    setVal('setFmUrl', '');
    setVal('setFmKey', '');
    setVal('setFmModelId', '');
    setVal('setFmModelIdSel', '');
    setupModelIdField(null);
    setVal('setFmHeaders', '');
    setVal('setFmTemp', '');
    setVal('setFmMax', '');
    setVal('setFmRate', '');
    setVal('setFmDesc', '');
    var keyEl = $('setFmKey');
    if (keyEl) { keyEl.type = 'password'; }
    var idRow = $('setFmIdRow');
    if (idRow) { idRow.style.display = ''; }
    var title = $('setFmTitle');
    if (title) { title.textContent = '添加模型'; }
    var note = $('setFmEditNote');
    if (note) { note.style.display = 'none'; note.textContent = ''; }
    populateFallback('');
    renderFormTypes();
    renderFormStars();
    renderKeyState();
  }

  /* 打开 Tab4：非编辑状态下重置为「新增」；编辑中途切走再切回保留表单 */
  function openAddTab() {
    if (!editTarget.kind && !editTarget.id) { resetForm(); }
    else { renderKeyState(); }
  }

  function startEdit(id) {
    var model = findAnyModel(id);
    if (!model) { toast('warning', '模型不存在'); return; }
    var custom = isCustomId(id);
    editTarget = { kind: custom ? 'custom' : 'builtin', id: id };
    var gKey = groupForModel(model, custom);
    var g = findGroup(gKey);
    setVal('setFmProvider', g ? gKey : '');
    renderProviderNote(g);
    var o = overrideOf(id);
    var p = providers()[model.provider];
    var fmt = 'openai';
    if (custom && model.apiFormat) { fmt = String(model.apiFormat); }
    else if (!custom && p && p.apiFormat) { fmt = String(p.apiFormat); }
    if (o && o.apiFormat) { fmt = String(o.apiFormat); }
    var url = custom ? (model.apiUrl || '') : ((o && o.apiUrl) ? o.apiUrl : (p ? p.apiUrl : ''));
    // 安全：明文 Key 一律不回填（内置与自定义皆然）
    var headers = (custom ? model.extraHeaders : (o ? o.extraHeaders : null));
    var types = typeKeysOf(model);
    var temp = (o && typeof o.temperature === 'number') ? o.temperature :
      (typeof model.temperature === 'number' ? model.temperature : null);
    var maxT = (o && typeof o.maxTokens === 'number') ? o.maxTokens :
      (typeof model.maxTokens === 'number' ? model.maxTokens : null);
    var rate = (o && o.rate) ? o.rate : (model.rate || '');
    var fb = (o && o.fallback) ? o.fallback : (model.fallback || '');
    formTypes = {};
    for (var i = 0; i < types.length; i++) { formTypes[types[i]] = true; }
    formStars = effStars(id, model);
    setVal('setFmName', displayName(id, model));
    setVal('setFmFormat', fmt);
    setAdvOpen(fmt !== 'openai');
    setVal('setFmUrl', url || '');
    setVal('setFmKey', '');
    setVal('setFmModelId', id);
    setupModelIdField(g);
    setVal('setFmHeaders', headersToText(headers));
    setVal('setFmTemp', temp === null ? '' : String(temp));
    setVal('setFmMax', maxT === null ? '' : String(maxT));
    setVal('setFmRate', rate || '');
    setVal('setFmDesc', effDesc(id, model));
    var keyEl = $('setFmKey');
    if (keyEl) { keyEl.type = 'password'; }
    var idRow = $('setFmIdRow');
    if (idRow) { idRow.style.display = custom ? '' : 'none'; }
    var title = $('setFmTitle');
    if (title) { title.textContent = '编辑模型：' + displayName(id, model); }
    var note = $('setFmEditNote');
    if (note) {
      note.style.display = 'block';
      note.textContent = custom ?
        '自定义模型：保存后直接更新该模型配置。' :
        '内置模型：保存后以覆盖方式生效（名称 / 端点 / Key / 参数等），不影响其他设备。Key 出于安全不回填，留空即表示保持不变。';
    }
    populateFallback(id);
    renderFormTypes();
    renderFormStars();
    renderKeyState();
    switchTab('add');
  }

  function saveForm() {
    var name = fieldVal('setFmName').trim();
    var url = fieldVal('setFmUrl').trim();
    var key = fieldVal('setFmKey').trim();
    var fmt = formAdvOpen ? (fieldVal('setFmFormat') || 'openai') : 'openai';
    var mid = fieldVal('setFmModelId').trim();
    var headers = parseHeaders(fieldVal('setFmHeaders'));
    var types = [];
    var i;
    for (i = 0; i < ALL_TYPE_KEYS.length; i++) {
      if (formTypes[ALL_TYPE_KEYS[i]]) { types.push(ALL_TYPE_KEYS[i]); }
    }
    var temp = numOrNull(fieldVal('setFmTemp'));
    var maxT = intOrNull(fieldVal('setFmMax'));
    var rate = fieldVal('setFmRate').trim();
    var fb = fieldVal('setFmFallback');
    var desc = fieldVal('setFmDesc').trim();
    if (!name) { toast('warning', '请填写模型名称'); return false; }
    if (!url) { toast('warning', '请填写 API 端点'); return false; }

    var focusId = '';
    if (editTarget.kind === 'builtin') {
      /* 内置模型：写 overrides[id] 覆盖项。Key 语义「空 = 保持原值」。 */
      var old = overrideOf(editTarget.id) || {};
      var o = {};
      o.name = name;
      o.apiUrl = url;
      if (key) { o.apiKey = key; }
      else if (old.apiKey) { o.apiKey = old.apiKey; }
      o.apiFormat = fmt;
      if (headers) { o.extraHeaders = headers; }
      if (formStars) { o.stars = formStars; }
      if (rate) { o.rate = rate; }
      if (temp !== null) { o.temperature = temp; }
      if (maxT !== null) { o.maxTokens = maxT; }
      if (fb) { o.fallback = fb; }
      if (desc) { o.desc = desc; }
      if (old && old.speed) { o.speed = old.speed; }
      getSettings().overrides[editTarget.id] = o;
      saveSettings();
      focusId = editTarget.id;
      toast('success', '已保存');
    } else {
      /* 新增自定义 / 编辑自定义：写 ai_custom_models。Key 语义「空 = 保持原值」。 */
      if (!mid) { toast('warning', '请填写模型 ID'); return false; }
      var arr = readCustomModels();
      for (i = 0; i < arr.length; i++) {
        if (arr[i].id === mid && arr[i].id !== editTarget.id) {
          toast('warning', '模型 ID 已存在：' + mid);
          return false;
        }
      }
      var prevKey = '';
      if (editTarget.kind === 'custom') {
        var cur = findAnyModel(editTarget.id);
        if (cur && cur.apiKey) { prevKey = cur.apiKey; }
      }
      var finalKey = key ? key : prevKey;
      var entry = {
        id: mid,
        name: name,
        provider: 'custom',
        apiUrl: url,
        apiKey: finalKey,
        apiFormat: fmt,
        extraHeaders: headers,
        types: types,
        stars: formStars,
        rate: rate,
        temperature: temp,
        maxTokens: maxT,
        fallback: fb,
        desc: desc,
        speed: '',
        needVPN: false
      };
      if (editTarget.kind === 'custom') {
        var oldSpeed = '';
        var oldVpn = false;
        for (i = 0; i < arr.length; i++) {
          if (arr[i].id === editTarget.id) {
            oldSpeed = arr[i].speed || '';
            oldVpn = arr[i].needVPN === true;
            arr[i] = entry;
            break;
          }
        }
        entry.speed = oldSpeed;
        entry.needVPN = oldVpn;
        if (mid !== editTarget.id) { migrateRefs(editTarget.id, mid); }
      } else {
        arr.push(entry);
      }
      writeCustomModels(arr);
      focusId = mid;
      if (!finalKey) { toast('warning', '已保存，但未填写 API Key，可能无法调用'); }
      else { toast('success', '已保存'); }
    }
    resetForm();
    switchTab('models');
    flashRow(focusId);
    return true;
  }

  /* Tab4【测试连接】：用表单当前未保存值调 aiHealthCheck(id, tmpCfg)。
     第二参数契约由线3提供；本函数做 typeof/长度守卫，缺失时退化为「先保存再检测」。 */
  function testFormConnection() {
    var url = fieldVal('setFmUrl').trim();
    var key = fieldVal('setFmKey').trim();
    var fmt = formAdvOpen ? (fieldVal('setFmFormat') || 'openai') : 'openai';
    var headers = parseHeaders(fieldVal('setFmHeaders'));
    var mid = fieldVal('setFmModelId').trim();
    if (!url) { toast('warning', '请先填写 API 端点'); return; }
    var fn = window.aiHealthCheck;
    if (typeof fn !== 'function') { toast('warning', '当前环境不支持连通性检测'); return; }
    var checkId = mid || editTarget.id;
    if (!checkId) { toast('warning', '请先填写模型 ID'); return; }

    if (fn.length >= 2) {
      var tmpCfg = {
        apiUrl: url,
        apiKey: key,
        apiFormat: fmt,
        extraHeaders: headers,
        modelId: mid || undefined
      };
      var p;
      try { p = fn(checkId, tmpCfg); } catch (e) { p = null; }
      if (p && typeof p.then === 'function') {
        p.then(function (r) {
          var ok = !!(r && r.ok);
          showInfoModal('检测连接', healthMsg(checkId, r) + '\n\n（使用表单当前未保存值检测）', ok);
        }, function () {
          showInfoModal('检测连接', '检测失败\n原因：网络不可达\n\n（使用表单当前未保存值检测）', false);
        });
        return;
      }
      // 返回值异常 -> 落退化路径
      toast('warning', '检测接口暂不支持临时配置，改为先保存再检测');
    } else {
      toast('warning', '检测接口为旧版本，改为先保存再检测');
    }
    saveFormThenTest();
  }

  /* 退化路径：先保存表单，再用保存后的模型配置检测 */
  function saveFormThenTest() {
    var wantId = fieldVal('setFmModelId').trim() || editTarget.id;
    var saved = saveForm();
    if (!saved) { return; }
    if (typeof window.aiHealthCheck !== 'function') { toast('warning', '当前环境不支持连通性检测'); return; }
    var p;
    try { p = window.aiHealthCheck(wantId); } catch (e) { p = null; }
    if (p && typeof p.then === 'function') {
      p.then(function (r) {
        recordHealth(wantId, r);
        showInfoModal('检测连接', healthMsg(wantId, r) + '\n\n（已先保存模型，再行检测）', !!(r && r.ok));
      }, function () {
        var r2 = { ok: false, ms: 0, err: 'network' };
        recordHealth(wantId, r2);
        showInfoModal('检测连接', healthMsg(wantId, r2) + '\n\n（已先保存模型，再行检测）', false);
      });
    }
  }

  /* ---------------- Tab 5：关于 ---------------- */
  function aboutItem(num, label) {
    return '<div class="xt-about-item"><div class="xt-about-num">' + num + '</div>' +
      '<div class="xt-about-label">' + esc(label) + '</div></div>';
  }

  function renderAbout() {
    var host = $('setAboutList');
    if (!host) { return; }
    var all = allModelsList();
    var s = getSettings();
    var enabled = 0;
    var custom = 0;
    var bad = 0;
    var i;
    for (i = 0; i < all.length; i++) {
      var id = all[i].id;
      if (!s.disabled[id]) { enabled++; }
      if (isCustomId(id)) { custom++; }
      var h = s.health[id];
      if (h && h.ok === false) { bad++; }
    }
    var html = '<div class="xt-about-grid">';
    html += aboutItem(all.length, '模型总数');
    html += aboutItem(enabled, '已启用');
    html += aboutItem(custom, '自定义模型');
    html += aboutItem(bad, '健康检查不可用');
    html += '</div>';
    html += '<div class="xt-about-ver">';
    html += '<div>数据版本：<b>' + esc(DATA_VERSION) + '</b></div>';
    html += '<div style="margin-top:6px;">页面加载后在后台自动检测模型可用性（约每 6.5 秒一个，结果缓存 30 分钟）。' +
      '显示「跨域受限（浏览器直连）」的模型为浏览器直连被接口跨域策略拦截，属正常现象，应用内调用不受影响。</div>';
    html += '</div>';
    host.innerHTML = html;
    renderMemory();
    renderProxySection();
  }

  /* ---------------- R77：海外平台代理访问设置（openrouter / gemini） ---------------- */
  var PROXY_LS_KEY = 'ai_proxy_settings';
  var PROXY_STATUS_KEY = 'ai_proxy_status';
  var PROXY_LABEL = { openrouter: 'OpenRouter', gemini: 'Google Gemini' };

  function getProxyCfg() {
    var def = { mode: 'auto', relayUrl: '' };
    try {
      var raw = localStorage.getItem(PROXY_LS_KEY);
      if (raw) {
        var v = JSON.parse(raw);
        if (v && typeof v === 'object') {
          if (v.mode === 'auto' || v.mode === 'relay' || v.mode === 'direct') { def.mode = v.mode; }
          if (typeof v.relayUrl === 'string') { def.relayUrl = v.relayUrl; }
        }
      }
    } catch (e) { /* 损坏 JSON 用默认值 */ }
    return def;
  }

  function saveProxyCfg(mode, relayUrl) {
    try {
      localStorage.setItem(PROXY_LS_KEY, JSON.stringify({ mode: mode, relayUrl: relayUrl }));
      return true;
    } catch (e) {
      warnStorage();
      return false;
    }
  }

  function proxyProviderNames() {
    var cfg = (typeof window !== 'undefined' && window.AI_CONFIG) ? window.AI_CONFIG : null;
    var out = [];
    if (cfg && cfg.providers) {
      for (var k in cfg.providers) {
        if (hasOwn(cfg.providers, k) && cfg.providers[k] && cfg.providers[k].needProxy === true) { out.push(k); }
      }
    }
    return out;
  }

  function proxyStatusEntry(name) {
    try {
      var raw = localStorage.getItem(PROXY_STATUS_KEY);
      if (!raw) { return null; }
      var v = JSON.parse(raw);
      if (v && typeof v === 'object' && v[name]) { return v[name]; }
    } catch (e) { /* 忽略损坏 JSON */ }
    return null;
  }

  function proxyStatusLabel(name) {
    var e = proxyStatusEntry(name);
    if (!e || typeof e !== 'object') { return '<span style="color:var(--ai-sub,#5a6068);">未检测</span>'; }
    if (e.ok === true) { return '<span style="color:#2e9e5b;">可达（' + (e.ms || 0) + 'ms）</span>'; }
    return '<span style="color:#d64545;font-weight:600;">不可达（离线，自动降级国内链）</span>';
  }

  function proxyStatusRowsHtml() {
    var names = proxyProviderNames();
    var html = '';
    for (var i = 0; i < names.length; i++) {
      html += '<div>' + esc(PROXY_LABEL[names[i]] || names[i]) + '：' + proxyStatusLabel(names[i]) + '</div>';
    }
    return html || '<div style="color:var(--ai-sub,#5a6068);">无需要代理的平台</div>';
  }

  /* 「关于」面板内注入代理设置区（每次 renderAbout 重建，事件随节点重绑） */
  function renderProxySection() {
    var host = $('setAboutList');
    if (!host) { return; }
    var cfg = getProxyCfg();
    var box = document.createElement('div');
    box.id = 'setProxyBox';
    box.style.cssText = 'margin-top:18px;padding:14px;border:1px solid var(--ai-border,#e7e9ee);' +
      'border-radius:12px;text-align:left;';
    var html = '';
    html += '<div style="font-size:14px;font-weight:700;margin-bottom:8px;">海外平台代理访问</div>';
    html += '<div style="font-size:12.5px;color:var(--ai-sub,#5a6068);line-height:1.6;margin-bottom:10px;">' +
      'OpenRouter / Gemini 需自备网络。auto=自动探测，不可达平台离线、调用自动降级国内链；' +
      'relay=请求改走自建中转；direct=始终直连。' +
      '中转约定：中转地址前缀 + encodeURIComponent(目标完整URL)，body/headers 原样透传。</div>';
    html += '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">' +
      '<label style="font-size:13px;">模式</label>' +
      '<select id="setProxyMode" style="min-height:34px;border-radius:8px;border:1px solid var(--ai-border,#e7e9ee);padding:0 8px;background:var(--ai-card,#fff);color:var(--ai-text,#1f2329);">' +
      '<option value="auto"' + (cfg.mode === 'auto' ? ' selected' : '') + '>auto 自动探测降级</option>' +
      '<option value="relay"' + (cfg.mode === 'relay' ? ' selected' : '') + '>relay 自定义中转</option>' +
      '<option value="direct"' + (cfg.mode === 'direct' ? ' selected' : '') + '>direct 始终直连</option>' +
      '</select></div>';
    html += '<input id="setProxyRelay" type="text" placeholder="中转地址前缀，如 https://your-worker.workers.dev/?url=" value="' + esc(cfg.relayUrl) + '"' +
      ' style="width:100%;box-sizing:border-box;min-height:36px;border-radius:8px;border:1px solid var(--ai-border,#e7e9ee);padding:0 10px;background:var(--ai-card,#fff);color:var(--ai-text,#1f2329);margin-bottom:10px;">';
    html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">' +
      '<button type="button" id="setProxySave" style="min-height:36px;padding:0 16px;border-radius:9px;cursor:pointer;font-size:13px;font-weight:600;border:1px solid var(--ai-orange,#ff8c00);background:var(--ai-orange,#ff8c00);color:#fff;">保存</button>' +
      '<button type="button" id="setProxyTest" style="min-height:36px;padding:0 16px;border-radius:9px;cursor:pointer;font-size:13px;font-weight:600;border:1px solid var(--ai-border,#e7e9ee);background:transparent;color:var(--ai-text,#1f2329);">测试连通性</button></div>';
    html += '<div id="setProxyStatus" style="font-size:12.5px;line-height:1.7;">' + proxyStatusRowsHtml() + '</div>';
    box.innerHTML = html;
    host.appendChild(box);
    on('setProxySave', 'click', function () {
      var modeEl = $('setProxyMode');
      var relayEl = $('setProxyRelay');
      var mode = modeEl ? String(modeEl.value || 'auto') : 'auto';
      var relayUrl = relayEl ? String(relayEl.value || '').trim() : '';
      if (mode === 'relay' && !relayUrl) {
        toast('warning', 'relay 模式需填写中转地址');
        return;
      }
      if (saveProxyCfg(mode, relayUrl)) { toast('success', '代理设置已保存'); }
    });
    on('setProxyTest', 'click', function () {
      var stEl = $('setProxyStatus');
      if (stEl) { stEl.textContent = '探测中…（最长 8 秒）'; }
      if (window.AI_SERVICE && typeof window.AI_SERVICE.probeProxyPlatforms === 'function') {
        window.AI_SERVICE.probeProxyPlatforms().then(function () { renderProxyStatusOnly(); },
          function () { renderProxyStatusOnly(); });
      } else {
        renderProxyStatusOnly();
      }
    });
  }

  function renderProxyStatusOnly() {
    var stEl = $('setProxyStatus');
    if (!stEl) { return; }
    stEl.innerHTML = proxyStatusRowsHtml();
  }

  /* ---------------- 全量渲染 ---------------- */
  function renderAll() {
    renderModels();
    renderFuncTypes();
    renderIntro();
    renderAbout();
  }

  /* ---------------- 事件绑定（全部事件委托，禁止行内大段 JS） ---------------- */
  function bindTabs() {
    on('setTabModels', 'click', function () { switchTab('models'); });
    on('setTabFunc', 'click', function () { switchTab('func'); });
    on('setTabIntro', 'click', function () { switchTab('intro'); });
    on('setTabAdd', 'click', function () { switchTab('add'); });
    on('setTabAbout', 'click', function () { switchTab('about'); });
  }

  function onModelListClick(e) {
    var host = $('setModelList');
    if (!host) { return; }
    var t = e.target;
    var el;
    el = closestAttr(t, 'data-health', host);
    if (el) { runHealthCheck(el.getAttribute('data-health')); return; }
    el = closestAttr(t, 'data-test', host);
    if (el) { runHealthCheck(el.getAttribute('data-test')); return; }
    el = closestAttr(t, 'data-toggle', host);
    if (el) { toggleModel(el.getAttribute('data-toggle')); return; }
    el = closestAttr(t, 'data-edit', host);
    if (el) { startEdit(el.getAttribute('data-edit')); return; }
    el = closestAttr(t, 'data-del', host);
    if (el) { confirmDeleteModel(el.getAttribute('data-del')); return; }
    el = closestAttr(t, 'data-up', host);
    if (el) { moveModel(el.getAttribute('data-up'), -1); return; }
    el = closestAttr(t, 'data-down', host);
    if (el) { moveModel(el.getAttribute('data-down'), 1); return; }
    el = closestAttr(t, 'data-star', host);
    if (el) {
      var n = (t && t.getAttribute) ? t.getAttribute('data-star-n') : null;
      if (n) { setStar(el.getAttribute('data-star'), parseInt(n, 10)); }
      return;
    }
    if (closestAttr(t, 'data-handle', host)) { return; }
    el = closestAttr(t, 'data-model-id', host);
    if (el) { selectModel(el.getAttribute('data-model-id')); }
  }

  /* 桌面 HTML5 DnD（移动端用上移/下移按钮兜底） */
  function bindModelDnd() {
    var host = $('setModelList');
    if (!host || !host.addEventListener) { return; }
    host.addEventListener('dragstart', function (e) {
      var row = closestAttr(e.target, 'data-model-id', host);
      if (!row || !e.dataTransfer) { return; }
      dragId = row.getAttribute('data-model-id');
      try {
        e.dataTransfer.setData('text/plain', dragId);
        e.dataTransfer.effectAllowed = 'move';
      } catch (err) { /* 老内核 setData 失败不阻断 */ }
      row.className = String(row.className || '') + ' dragging';
    });
    host.addEventListener('dragover', function (e) {
      if (!dragId) { return; }
      if (e.preventDefault) { e.preventDefault(); }
      var row = closestAttr(e.target, 'data-model-id', host);
      clearDropMarks(host);
      if (row && row.getAttribute('data-model-id') !== dragId) {
        row.className = String(row.className || '') + ' dropover';
      }
    });
    host.addEventListener('drop', function (e) {
      if (!dragId) { return; }
      if (e.preventDefault) { e.preventDefault(); }
      var row = closestAttr(e.target, 'data-model-id', host);
      if (row) { reorder(dragId, row.getAttribute('data-model-id')); }
      dragId = '';
    });
    host.addEventListener('dragend', function () {
      dragId = '';
      clearDropMarks(host);
      renderModels();
    });
  }

  function clearDropMarks(host) {
    if (!host || !host.querySelectorAll) { return; }
    var rows = host.querySelectorAll('.dropover');
    for (var i = 0; i < rows.length; i++) {
      rows[i].className = String(rows[i].className || '').replace(/(\s|^)dropover(\s|$)/g, ' ');
    }
  }

  function bindModelEvents() {
    on('setModelSearch', 'input', function () { renderModels(); });
    on('setEnableAll', 'click', function () { enableAll(); });
    on('setDisableAll', 'click', function () { disableAll(); });
    on('setRestoreDefault', 'click', function () { openSortModal(); });
    on('setBatchHealth', 'click', function () { batchHealthCheck(); });
    var host = $('setModelList');
    if (host && host.addEventListener) {
      host.addEventListener('click', onModelListClick);
    }
    bindModelDnd();
  }

  function onFuncListClick(e) {
    var host = $('setFuncList');
    if (!host) { return; }
    var t = e.target;
    var el;
    el = closestAttr(t, 'data-cat-up', host);
    if (el) { var p1 = splitPipe(el.getAttribute('data-cat-up')); if (p1) { chainOp(p1[0], p1[1], 'up'); } return; }
    el = closestAttr(t, 'data-cat-down', host);
    if (el) { var p2 = splitPipe(el.getAttribute('data-cat-down')); if (p2) { chainOp(p2[0], p2[1], 'down'); } return; }
    el = closestAttr(t, 'data-cat-rm', host);
    if (el) { var p3 = splitPipe(el.getAttribute('data-cat-rm')); if (p3) { chainOp(p3[0], p3[1], 'rm'); } return; }
    el = closestAttr(t, 'data-cat-addchip', host);
    if (el) { var p4 = splitPipe(el.getAttribute('data-cat-addchip')); if (p4) { addModelToCat(p4[0], p4[1]); } return; }
    el = closestAttr(t, 'data-cat-del', host);
    if (el) { delCategory(el.getAttribute('data-cat-del')); return; }
    el = closestAttr(t, 'data-cat-moveup', host);
    if (el) { moveCategory(el.getAttribute('data-cat-moveup'), -1); return; }
    el = closestAttr(t, 'data-cat-movedown', host);
    if (el) { moveCategory(el.getAttribute('data-cat-movedown'), 1); return; }
  }

  /* 拆 "key|modelId"（key 含 custom_ 前缀，不含竖线，可安全拆分） */
  function splitPipe(v) {
    if (!v) { return null; }
    var idx = v.indexOf('|');
    if (idx < 0) { return null; }
    return [v.slice(0, idx), v.slice(idx + 1)];
  }

  function bindFuncEvents() {
    var host = $('setFuncList');
    if (host && host.addEventListener) {
      host.addEventListener('click', onFuncListClick);
    }
    on('setAddTypeBtn', 'click', function () { toggleAddTypeRow(); });
    on('setNewTypeOk', 'click', function () { addCustomType(); });
    on('setNewTypeCancel', 'click', function () { hideAddTypeRow(); });
    on('setNewTypeName', 'keydown', function (e) {
      if (e.keyCode === 13) { addCustomType(); }
    });
  }

  function bindIntroEvents() {
    on('setIntroSearch', 'input', function () { renderIntro(); });
    var host = $('setIntroList');
    if (host && host.addEventListener) {
      host.addEventListener('click', function (e) {
        var hb = closestAttr(e.target, 'data-health', host);
        if (hb) { runHealthCheck(hb.getAttribute('data-health')); return; }
        var el = closestAttr(e.target, 'data-star', host);
        if (el) {
          var n = (e.target && e.target.getAttribute) ? e.target.getAttribute('data-star-n') : null;
          if (n) { setStar(el.getAttribute('data-star'), parseInt(n, 10)); }
        }
      });
    }
  }

  function bindFormEvents() {
    var types = $('setFmTypes');
    if (types && types.addEventListener) {
      types.addEventListener('click', function (e) {
        var el = closestAttr(e.target, 'data-type-check', types);
        if (!el) { return; }
        var k = el.getAttribute('data-type-check');
        if (formTypes[k]) { delete formTypes[k]; } else { formTypes[k] = true; }
        renderFormTypes();
      });
    }
    var stars = $('setFmStars');
    if (stars && stars.addEventListener) {
      stars.addEventListener('click', function (e) {
        var el = closestAttr(e.target, 'data-form-star', stars);
        if (!el) { return; }
        formStars = parseInt(el.getAttribute('data-form-star'), 10) || 0;
        renderFormStars();
      });
    }
    // R67：服务商下拉 / 模型 ID 下拉联动 / 高级设置折叠
    on('setFmProvider', 'change', function () { onProviderChange(); });
    on('setFmModelIdSel', 'change', function () { onModelIdSelChange(); });
    on('setFmAdvToggle', 'click', function () { toggleAdv(); });
    // Key 眼睛按钮：password <-> text
    on('setFmKeyEye', 'click', function () {
      var el = $('setFmKey');
      if (!el) { return; }
      el.type = (el.type === 'password') ? 'text' : 'password';
    });
    on('setFmSave', 'click', function () { saveForm(); });
    on('setFmTest', 'click', function () { testFormConnection(); });
    on('setFmCancel', 'click', function () { resetForm(); switchTab('models'); });
  }

  function bindAboutEvents() {
    on('setMemClear', 'click', function () { clearMemoryAll(); });
    on('setRedetectAll', 'click', function () { redetectAll(); });
    var host = $('setMemList');
    if (host && host.addEventListener) {
      host.addEventListener('click', function (e) {
        var el = closestAttr(e.target, 'data-mem-del', host);
        if (!el) { return; }
        var idx = parseInt(el.getAttribute('data-mem-del'), 10);
        if (!isNaN(idx)) { deleteMemoryItem(idx); }
      });
    }
  }

  /* ---------------- 配置就绪检测 & 启动 ---------------- */
  function cfgReady() {
    var c = cfg();
    return !!(c && isArray(c.builtinModels));
  }

  function renderConfigError() {
    var box = $('setConfigError');
    if (box) {
      box.innerHTML = '<div class="xt-set-error">配置加载失败，请刷新重试</div>';
      box.style.display = 'block';
    }
  }

  function initPage() {
    var box = $('setConfigError');
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
    buildProviderOptions();
    renderAll();
    applyHash();
    startHealthQueue();
    if (typeof window.xtAiSettings !== 'undefined' && window.xtAiSettings) {
      window.xtAiSettings.refresh = renderAll;
    }
  }

  function waitConfig(attempt) {
    if (cfgReady()) { initPage(); return; }
    if (attempt >= MAX_RETRY) { renderConfigError(); return; }
    setTimeout(function () { waitConfig(attempt + 1); }, RETRY_DELAY);
  }

  function boot() {
    bindTabs();
    bindModelEvents();
    bindFuncEvents();
    bindIntroEvents();
    bindFormEvents();
    bindAboutEvents();
    bindSortModalEvents();
    applyHash();   // 先落默认 Tab / hash 直达，避免视觉空白
    waitConfig(0);
  }

  /* 对外最小口子（带守卫，避免重复声明污染全局） */
  if (typeof window.xtAiSettings === 'undefined') {
    window.xtAiSettings = {
      LS_KEY: LS_KEY,
      getState: getSettings,
      refresh: renderAll,
      switchTab: switchTab
    };
  }

  // defer 脚本：DOMContentLoaded 可能已过，双保险
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
