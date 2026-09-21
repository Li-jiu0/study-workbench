# -*- coding: utf-8 -*-
# R67 线1补丁：ai-settings.html + assets/ai-settings.js
# 规则：二进制读 -> 精确替换（count 必须等于预期） -> 二进制写，保持 LF 行尾。
import os
import shutil
import sys

BASE = r'D:\下载的文件\学习工作台'
HTML = os.path.join(BASE, 'ai-settings.html')
JS = os.path.join(BASE, 'assets', 'ai-settings.js')


def S(s):
    """归一化行尾为 LF（防止本 .py 文件自身被 CRLF 污染补丁串）。"""
    return s.replace('\r\n', '\n')


# ---------------- 备份（二进制复制，保持行尾） ----------------
for src in (HTML, JS):
    dst = src + '.bak-pre-r67-20260916'
    if os.path.exists(dst):
        print('BACKUP_SKIP(已存在):', dst)
    else:
        shutil.copyfile(src, dst)
        print('BACKUP_OK:', dst)


def patch(path, pairs):
    with open(path, 'rb') as f:
        raw = f.read()
    for i, item in enumerate(pairs):
        old, new, expect = item[0], item[1], (item[2] if len(item) > 2 else 1)
        ob = S(old).encode('utf-8')
        nb = S(new).encode('utf-8')
        n = raw.count(ob)
        if n != expect:
            print('PATCH_FAIL %s pair#%d found=%d expect=%d' % (os.path.basename(path), i, n, expect))
            print('  OLD head: %r' % S(old)[:100])
            sys.exit(1)
        raw = raw.replace(ob, nb)
    with open(path, 'wb') as f:
        f.write(raw)
    print('PATCH_OK:', path)


# =====================================================================
# ai-settings.html
# =====================================================================
HTML_PAIRS = []

# H1: B组 —— 删除模型列表「＋ 添加自定义模型」按钮（整行）
HTML_PAIRS.append((
    '        <button class="xt-set-btn primary" id="setAddCustom">＋ 添加自定义模型</button>\n',
    ''
))

# H2: CSS —— 新增 R67 服务商标注 & 高级设置折叠样式（插在「底部说明条」注释前）
HTML_PAIRS.append((
    '/* —— 底部说明条 —— */',
    '''/* —— R67：服务商分组下拉标注 & 高级设置折叠 —— */
.xt-form-note{
  margin-top:6px;font-size:12px;line-height:1.6;color:var(--xt-warn-text);background:var(--xt-warn-bg);
  border:1px solid var(--xt-warn-border);border-radius:8px;padding:6px 10px;word-break:break-word;
}
.xt-adv-toggle{
  display:inline-flex;align-items:center;gap:4px;min-height:34px;padding:0 12px;margin-top:2px;
  border:1px dashed var(--ai-border);border-radius:10px;background:var(--ai-card);
  color:var(--ai-sub);font-size:12.5px;font-weight:600;cursor:pointer;transition:all .15s;
}
.xt-adv-toggle:hover{border-color:var(--ai-orange);color:var(--ai-orange);}

/* —— 底部说明条 —— */'''
))

# H3: C组 —— 表单重构：服务商下拉 + 端点 + 模型 ID(下拉/输入) + 名称 + Key + 高级设置折叠(API格式)
HTML_PAIRS.append((
    '''      <div class="xt-form-row">
        <label class="xt-form-label" for="setFmName">模型名称 *</label>
        <input class="xt-set-input" id="setFmName" type="text" list="setFmNameList" placeholder="选择预设或手输，如：我的私有模型">
        <datalist id="setFmNameList"></datalist>
      </div>
      <div class="xt-form-row">
        <label class="xt-form-label" for="setFmFormat">API 格式</label>
        <select class="xt-set-select" id="setFmFormat">
          <option value="openai">OpenAI 兼容</option>
          <option value="gemini">Gemini</option>
          <option value="custom">自定义（OpenAI 兼容 + 自定义请求头）</option>
        </select>
      </div>
      <div class="xt-form-row">
        <label class="xt-form-label" for="setFmUrl">API 端点 *</label>
        <input class="xt-set-input" id="setFmUrl" type="text" placeholder="https://api.example.com/v1/chat/completions">
      </div>
      <div class="xt-form-row">
        <label class="xt-form-label" for="setFmKey">API Key</label>
        <div class="xt-key-wrap">
          <input class="xt-set-input" id="setFmKey" type="password" placeholder="sk-..." autocomplete="off">
          <button type="button" class="xt-key-eye" id="setFmKeyEye" title="显示 / 隐藏密钥" aria-label="显示或隐藏密钥">👁</button>
        </div>
        <div class="xt-key-state" id="setFmKeyState"></div>
      </div>
      <div class="xt-form-row" id="setFmIdRow">
        <label class="xt-form-label" for="setFmModelId">模型 ID *</label>
        <input class="xt-set-input" id="setFmModelId" type="text" placeholder="如：gpt-4o-mini / gemini-2.0-flash">
      </div>''',
    '''      <div class="xt-form-row">
        <label class="xt-form-label" for="setFmProvider">服务商 *</label>
        <select class="xt-set-select" id="setFmProvider">
          <option value="">（选择服务商）</option>
        </select>
        <div class="xt-form-note" id="setFmProviderNote" style="display:none;"></div>
      </div>
      <div class="xt-form-row">
        <label class="xt-form-label" for="setFmUrl">API 端点 *</label>
        <input class="xt-set-input" id="setFmUrl" type="text" placeholder="https://api.example.com/v1/chat/completions">
      </div>
      <div class="xt-form-row" id="setFmIdRow">
        <label class="xt-form-label" for="setFmModelId">模型 ID *</label>
        <select class="xt-set-select" id="setFmModelIdSel" style="display:none;"></select>
        <input class="xt-set-input" id="setFmModelId" type="text" placeholder="如：gpt-4o-mini / gemini-2.0-flash">
      </div>
      <div class="xt-form-row">
        <label class="xt-form-label" for="setFmName">模型名称 *</label>
        <input class="xt-set-input" id="setFmName" type="text" placeholder="如：我的私有模型（选择模型后自动填）">
      </div>
      <div class="xt-form-row">
        <label class="xt-form-label" for="setFmKey">API Key</label>
        <div class="xt-key-wrap">
          <input class="xt-set-input" id="setFmKey" type="password" placeholder="sk-..." autocomplete="off">
          <button type="button" class="xt-key-eye" id="setFmKeyEye" title="显示 / 隐藏密钥" aria-label="显示或隐藏密钥">👁</button>
        </div>
        <div class="xt-key-state" id="setFmKeyState"></div>
      </div>
      <button type="button" class="xt-adv-toggle" id="setFmAdvToggle">高级设置 ▾</button>
      <div id="setFmAdv" style="display:none;">
        <div class="xt-form-row" style="margin-top:12px;">
          <label class="xt-form-label" for="setFmFormat">API 格式（默认按 OpenAI 兼容提交）</label>
          <select class="xt-set-select" id="setFmFormat">
            <option value="openai">OpenAI 兼容</option>
            <option value="gemini">Gemini</option>
            <option value="custom">自定义（OpenAI 兼容 + 自定义请求头）</option>
          </select>
        </div>
      </div>'''
))

# H4: C组 —— 「测试连接」按钮更名「检测连接」（保留 id=setFmTest）
HTML_PAIRS.append((
    '        <button class="xt-set-btn" id="setFmTest" style="flex:1;">测试连接</button>',
    '        <button class="xt-set-btn" id="setFmTest" style="flex:1;">检测连接</button>'
))

# =====================================================================
# assets/ai-settings.js
# =====================================================================
JS_PAIRS = []

# J1: 文件头注释更新
JS_PAIRS.append((
    '/* assets/ai-settings.js — R66 线1 模型设置页交互逻辑（密钥安全 + 检测按钮化 + 记忆管理）',
    '/* assets/ai-settings.js — R67 线1 模型设置页交互逻辑（R66 密钥安全/检测/记忆 + R67 服务商分组表单/删重复入口）'
))

# J1b: 依赖注释补 providerGroups
JS_PAIRS.append((
    ''' *   - window.AI_CONFIG（assets/ai-config.js）：providers / builtinModels /
 *     FUNC_TYPES / modelDetails（modelDetails.stars / .speed 由线3补充，本文件兜底）''',
    ''' *   - window.AI_CONFIG（assets/ai-config.js）：providers / builtinModels /
 *     FUNC_TYPES / modelDetails（modelDetails.stars / .speed 由线3补充，本文件兜底）/
 *     providerGroups（R67 服务商分组：添加模型表单下拉数据源，一字不改只读消费）'''
))

# J2: 常量 —— 删 CUSTOM_OPTION，加 PG_CUSTOM_KEY；数据版本号更新
JS_PAIRS.append((
    '''  var DATA_VERSION = 'R66 · v20260916';      // 数据版本（关于 Tab 展示）
  var CUSTOM_OPTION = '【自定义】';          // 名称下拉的「自定义」占位项''',
    '''  var DATA_VERSION = 'R67 · v20260916';      // 数据版本（关于 Tab 展示）
  var PG_CUSTOM_KEY = 'custom';              // R67 服务商分组：「自定义/兼容接口」组 key'''
))

# J3: 运行时状态 —— 删名称下拉遗留态，加高级设置折叠态
JS_PAIRS.append((
    '''  var batchRunning = false;   // 批量检测队列是否运行中（用于暂停后台队列，守限频）
  var lastPresetId = '';      // 名称下拉上次回填的模型 ID（用于「不覆盖手填 ID」判定）
  var datalistMap = {};       // 名称下拉 label -> {provider, apiUrl, apiFormat, modelId, name}''',
    '''  var batchRunning = false;   // 批量检测队列是否运行中（用于暂停后台队列，守限频）
  var formAdvOpen = false;    // R67：「高级设置」是否展开（折叠时提交一律按 openai）'''
))

# J4: 缺陷修复 —— healthReason 补 no_endpoint / no_key 中文映射
JS_PAIRS.append((
    '''    if (s === 'not_found') { return '未找到该模型配置'; }
    return s || '未知错误';''',
    '''    if (s === 'not_found') { return '未找到该模型配置'; }
    if (s === 'no_endpoint') { return '未配置接口地址'; }
    if (s === 'no_key') { return '未配置密钥'; }
    return s || '未知错误';'''
))

# J5: B组 —— 空态文案不再指向已删按钮
JS_PAIRS.append((
    "      host.innerHTML = '<div class=\"xt-set-empty\">暂无模型配置<br><br>点击上方「＋ 添加自定义模型」新增</div>';",
    "      host.innerHTML = '<div class=\"xt-set-empty\">暂无模型配置<br><br>在上方「添加模型」标签页可新增自定义模型</div>';"
))

# J6: providerLabel 后新增 providerGroups 只读访问器
JS_PAIRS.append((
    '''  function providerLabel(key) {
    var p = providers();
    if (p[key] && p[key].name) { return p[key].name; }
    if (key === '__other__') { return '其他平台'; }
    return key || '未知平台';
  }''',
    '''  function providerLabel(key) {
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
  }'''
))

# J7: 删除 R66 名称 datalist 预设四函数，替换为 R67 服务商分组表单逻辑
JS_PAIRS.append((
    '''  /* 名称下拉预设：遍历 providers，逐平台列内置模型；末尾附【自定义】。
     兼容两种结构：provider 自带 builtinModels 数组，或按 provider 字段从全局 builtinModels 过滤。 */
  function buildNamePresets() {
    var dl = $('setFmNameList');
    if (!dl) { return; }
    datalistMap = {};
    var p = providers();
    var keys = providerKeys();
    var models = builtinModels();
    var html = '';
    var i, j, k;
    for (i = 0; i < keys.length; i++) {
      var pk = keys[i];
      var plist = [];
      if (p[pk] && isArray(p[pk].builtinModels)) {
        plist = p[pk].builtinModels;
      } else {
        for (j = 0; j < models.length; j++) {
          if (models[j] && models[j].provider === pk) { plist.push(models[j]); }
        }
      }
      for (j = 0; j < plist.length; j++) {
        var mm = plist[j];
        var label = providerLabel(pk) + ' · ' + (mm.name || mm.id || '');
        if (hasOwn(datalistMap, label)) { continue; }
        datalistMap[label] = {
          provider: pk,
          apiUrl: (p[pk] && p[pk].apiUrl) ? String(p[pk].apiUrl) : '',
          apiFormat: (p[pk] && p[pk].apiFormat) ? String(p[pk].apiFormat) : 'openai',
          modelId: String(mm.id || ''),
          name: String(mm.name || mm.id || '')
        };
        html += '<option value="' + esc(label) + '"></option>';
      }
    }
    html += '<option value="' + esc(CUSTOM_OPTION) + '"></option>';
    dl.innerHTML = html;
  }

  /* 选中预设 -> 回填端点 / 格式 / 名称 / 模型 ID（ID 仅在为空或等于上次预设 ID 时回填，不覆盖手填） */
  function applyPreset(preset) {
    if (!preset) { return; }
    if (preset.apiUrl) { setVal('setFmUrl', preset.apiUrl); }
    setVal('setFmFormat', preset.apiFormat || 'openai');
    if (preset.name) { setVal('setFmName', preset.name); }
    var curId = fieldVal('setFmModelId').trim();
    if (!curId || curId === lastPresetId) { setVal('setFmModelId', preset.modelId); }
    lastPresetId = preset.modelId;
  }

  /* 选中【自定义】 -> 清空端点 / 模型 ID / Key（开放手填） */
  function applyCustomOption() {
    setVal('setFmUrl', '');
    setVal('setFmModelId', '');
    setVal('setFmKey', '');
    lastPresetId = '';
    renderKeyState();
  }

  function onNameInput() {
    var v = fieldVal('setFmName');
    if (v === CUSTOM_OPTION) { applyCustomOption(); return; }
    if (hasOwn(datalistMap, v)) { applyPreset(datalistMap[v]); }
  }''',
    '''  /* R67 服务商下拉：三层分组（已接入内置 Key / 主流厂商需自备 Key / 手动填写）。
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
    if (btn) { btn.textContent = formAdvOpen ? '高级设置 ▴' : '高级设置 ▾'; }
  }

  function setAdvOpen(open) {
    if (!!open !== formAdvOpen) { toggleAdv(); }
  }'''
))

# J8: resetForm —— 服务商/模型ID/高级设置复位
JS_PAIRS.append((
    '''  function resetForm() {
    editTarget = { kind: '', id: '' };
    formTypes = {};
    formStars = 0;
    lastPresetId = '';
    setVal('setFmName', '');
    setVal('setFmFormat', 'openai');
    setVal('setFmUrl', '');
    setVal('setFmKey', '');
    setVal('setFmModelId', '');
    setVal('setFmHeaders', '');''',
    '''  function resetForm() {
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
    setVal('setFmHeaders', '');'''
))

# J9: 删 startAdd（唯一调用方 setAddCustom 已删，不留死代码）
JS_PAIRS.append((
    '''  function startAdd() {
    resetForm();
    switchTab('add');
  }

  /* 打开 Tab4：非编辑状态下重置为「新增」；编辑中途切走再切回保留表单 */''',
    '''  /* 打开 Tab4：非编辑状态下重置为「新增」；编辑中途切走再切回保留表单 */'''
))

# J10a: startEdit 头部 —— 定位服务商分组并回填
JS_PAIRS.append((
    '''    var custom = isCustomId(id);
    editTarget = { kind: custom ? 'custom' : 'builtin', id: id };
    lastPresetId = '';
    var o = overrideOf(id);''',
    '''    var custom = isCustomId(id);
    editTarget = { kind: custom ? 'custom' : 'builtin', id: id };
    var gKey = groupForModel(model, custom);
    var g = findGroup(gKey);
    setVal('setFmProvider', g ? gKey : '');
    renderProviderNote(g);
    var o = overrideOf(id);'''
))

# J10b: startEdit 回填序列 —— 高级设置按格式自动展开 + 模型 ID 字段形态
JS_PAIRS.append((
    '''    setVal('setFmName', displayName(id, model));
    setVal('setFmFormat', fmt);
    setVal('setFmUrl', url || '');
    setVal('setFmKey', '');
    setVal('setFmModelId', id);
    setVal('setFmHeaders', headersToText(headers));''',
    '''    setVal('setFmName', displayName(id, model));
    setVal('setFmFormat', fmt);
    setAdvOpen(fmt !== 'openai');
    setVal('setFmUrl', url || '');
    setVal('setFmKey', '');
    setVal('setFmModelId', id);
    setupModelIdField(g);
    setVal('setFmHeaders', headersToText(headers));'''
))

# J12: saveForm —— 折叠态提交一律 openai
JS_PAIRS.append((
    '''    var key = fieldVal('setFmKey').trim();
    var fmt = fieldVal('setFmFormat') || 'openai';
    var mid = fieldVal('setFmModelId').trim();''',
    '''    var key = fieldVal('setFmKey').trim();
    var fmt = formAdvOpen ? (fieldVal('setFmFormat') || 'openai') : 'openai';
    var mid = fieldVal('setFmModelId').trim();'''
))

# J13: testFormConnection —— 检测连接同样按折叠态 openai
JS_PAIRS.append((
    '''    var key = fieldVal('setFmKey').trim();
    var fmt = fieldVal('setFmFormat') || 'openai';
    var headers = parseHeaders(fieldVal('setFmHeaders'));''',
    '''    var key = fieldVal('setFmKey').trim();
    var fmt = formAdvOpen ? (fieldVal('setFmFormat') || 'openai') : 'openai';
    var headers = parseHeaders(fieldVal('setFmHeaders'));'''
))

# J14: bindFormEvents —— 名称 datalist 绑定 -> 服务商/模型ID/高级设置绑定
JS_PAIRS.append((
    '''    // 名称下拉：可选可手输（datalist input 事件）
    on('setFmName', 'input', function () { onNameInput(); });
    on('setFmName', 'change', function () { onNameInput(); });''',
    '''    // R67：服务商下拉 / 模型 ID 下拉联动 / 高级设置折叠
    on('setFmProvider', 'change', function () { onProviderChange(); });
    on('setFmModelIdSel', 'change', function () { onModelIdSelChange(); });
    on('setFmAdvToggle', 'click', function () { toggleAdv(); });'''
))

# J15: bindModelEvents —— 删除已亡按钮的事件绑定
JS_PAIRS.append((
    '''    on('setDisableAll', 'click', function () { disableAll(); });
    on('setAddCustom', 'click', function () { startAdd(); });
    on('setRestoreDefault', 'click', function () { restoreDefaults(); });''',
    '''    on('setDisableAll', 'click', function () { disableAll(); });
    on('setRestoreDefault', 'click', function () { restoreDefaults(); });'''
))

# J16: initPage —— buildNamePresets -> buildProviderOptions
JS_PAIRS.append((
    '''    buildNamePresets();
    renderAll();''',
    '''    buildProviderOptions();
    renderAll();'''
))

# J17: 检测结果弹窗标题与按钮统一为「检测连接」（4 处）
JS_PAIRS.append((
    "showInfoModal('测试连接',",
    "showInfoModal('检测连接',",
    4
))

# ---------------- 执行 ----------------
patch(HTML, HTML_PAIRS)
patch(JS, JS_PAIRS)

# ---------------- 自检：行尾 + 行数 ----------------
for p in (HTML, JS):
    with open(p, 'rb') as f:
        raw = f.read()
    crlf = raw.count(b'\r\n')
    cr = raw.count(b'\r')
    lines = raw.count(b'\n')
    print('CHECK %s: CRLF=%d loneCR=%d lines=%d bytes=%d' % (os.path.basename(p), crlf, cr - crlf, lines, len(raw)))
    if crlf != 0 or (cr - crlf) != 0:
        print('EOL_FAIL', p)
        sys.exit(1)
print('ALL_PATCH_DONE')
