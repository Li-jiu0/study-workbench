# -*- coding: utf-8 -*-
# R67 线1 图标升级补丁：设置页全部 emoji 图标 -> 统一内联 SVG（保 DOM id 与行为不变）
# 规则：二进制读 -> 精确替换（count 必须等于预期） -> 二进制写，保持 LF 行尾。
import os
import shutil
import sys

BASE = r'D:\下载的文件\学习工作台'
HTML = os.path.join(BASE, 'ai-settings.html')
JS = os.path.join(BASE, 'assets', 'ai-settings.js')


def S(s):
    return s.replace('\r\n', '\n')


for src in (HTML, JS):
    dst = src + '.bak-pre-icon-20260916'
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


SVG_ATTRS = ('viewBox="0 0 24 24" width="%d" height="%d" fill="none" stroke="currentColor" '
             'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"')


def svg(inner, size):
    a = SVG_ATTRS % (size, size)
    return '<svg ' + a + '>' + inner + '</svg>'


SVG_PLUG = svg('<path d="M12 22v-4"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M6 8h12v2a6 6 0 0 1-12 0Z"/>', 14)
SVG_EYE = svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>', 16)
SVG_CHEVRON = svg('<path d="M6 9l6 6 6-6"/>', 12)
SVG_REFRESH = svg('<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>', 14)
SVG_CHIP = svg('<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M4 9h3"/><path d="M4 15h3"/>'
               '<path d="M17 9h3"/><path d="M17 15h3"/><path d="M9 4v3"/><path d="M15 4v3"/>'
               '<path d="M9 17v3"/><path d="M15 17v3"/>', 14)

# =====================================================================
# ai-settings.html
# =====================================================================
HTML_PAIRS = []

# H1: 批量检测按钮 -> 插头 SVG + 文本 span（JS 只更新 span，保 id=setBatchHealth）
HTML_PAIRS.append((
    '        <button class="xt-set-btn" id="setBatchHealth">🔌 批量检测</button>',
    '        <button class="xt-set-btn" id="setBatchHealth">' + SVG_PLUG +
    '<span id="setBatchHealthTxt">批量检测</span></button>'
))

# H2: Key 眼睛按钮 -> 眼睛 SVG
HTML_PAIRS.append((
    '          <button type="button" class="xt-key-eye" id="setFmKeyEye" title="显示 / 隐藏密钥" aria-label="显示或隐藏密钥">👁</button>',
    '          <button type="button" class="xt-key-eye" id="setFmKeyEye" title="显示 / 隐藏密钥" aria-label="显示或隐藏密钥">' +
    SVG_EYE + '</button>'
))

# H3: 高级设置折叠钮 -> 文本 span + 旋转箭头 SVG（开合状态由 .open 类旋转表达）
HTML_PAIRS.append((
    '      <button type="button" class="xt-adv-toggle" id="setFmAdvToggle">高级设置 ▾</button>',
    '      <button type="button" class="xt-adv-toggle" id="setFmAdvToggle"><span>高级设置</span>' +
    '<svg class="xt-adv-arrow" ' + SVG_ATTRS % (12, 12) + '><path d="M6 9l6 6 6-6"/></svg></button>'
))

# H4: 重新检测全部模型 -> 刷新 SVG
HTML_PAIRS.append((
    '        <button class="xt-set-btn" id="setRedetectAll">🔄 重新检测全部模型</button>',
    '        <button class="xt-set-btn" id="setRedetectAll">' + SVG_REFRESH + '<span>重新检测全部模型</span></button>'
))

# H5: 记忆管理标题 -> 记忆芯片 SVG
HTML_PAIRS.append((
    '        <div class="xt-about-block-t">🧠 记忆管理</div>',
    '        <div class="xt-about-block-t">' + SVG_CHIP + '记忆管理</div>'
))

# H6: CSS —— SVG 对齐与箭头旋转
HTML_PAIRS.append((
    '.xt-adv-toggle:hover{border-color:var(--ai-orange);color:var(--ai-orange);}',
    '''.xt-adv-toggle:hover{border-color:var(--ai-orange);color:var(--ai-orange);}

/* —— R67：内联 SVG 图标（统一替换 emoji，对齐与折叠箭头旋转） —— */
.xt-set-btn svg{vertical-align:-2px;margin-right:3px;}
.xt-ico-btn svg{display:block;}
.xt-drag-handle svg{display:block;}
.xt-stars span{display:inline-flex;align-items:center;}
.xt-stars svg{display:block;}
.xt-star-pick button{display:inline-flex;align-items:center;justify-content:center;}
.xt-h-txt svg{vertical-align:-2px;margin-right:2px;}
.xt-key-state-txt svg{vertical-align:-2px;margin-right:2px;}
.xt-about-block-t svg{vertical-align:-2px;margin-right:4px;}
.xt-key-eye{display:inline-flex;align-items:center;justify-content:center;}
.xt-adv-toggle .xt-adv-arrow{transition:transform .15s;}
.xt-adv-toggle.open .xt-adv-arrow{transform:rotate(180deg);}'''
))

# =====================================================================
# assets/ai-settings.js
# =====================================================================
JS_PAIRS = []

# J1: 图标库（svgWrap 函数 + ICONS 映射，插在常量区）
JS_PAIRS.append((
    "  var PG_CUSTOM_KEY = 'custom';              // R67 服务商分组：「自定义/兼容接口」组 key",
    '''  var PG_CUSTOM_KEY = 'custom';              // R67 服务商分组：「自定义/兼容接口」组 key

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
  };'''
))

# J2: 健康徽章三态 -> SVG
JS_PAIRS.append((
    '''  /* 健康徽章内部片段（dot + 三态文案） */
  function healthBadgeInner(id) {
    var st = healthStateOf(id);
    if (st === 'ok') {
      return '<span class="xt-h-dot ok"></span><span class="xt-h-txt ok">✅ 正常</span>';
    }
    if (st === 'fail') {
      return '<span class="xt-h-dot fail"></span><span class="xt-h-txt bad">❌ 失败</span>';
    }
    return '<span class="xt-h-dot"></span><span class="xt-h-txt">⏳ 待检测</span>';
  }''',
    '''  /* 健康徽章内部片段（dot + 三态文案；R67 图标 SVG 化） */
  function healthBadgeInner(id) {
    var st = healthStateOf(id);
    if (st === 'ok') {
      return '<span class="xt-h-dot ok"></span><span class="xt-h-txt ok">' + ICONS.check + ' 正常</span>';
    }
    if (st === 'fail') {
      return '<span class="xt-h-dot fail"></span><span class="xt-h-txt bad">' + ICONS.cross + ' 失败</span>';
    }
    return '<span class="xt-h-dot"></span><span class="xt-h-txt">' + ICONS.hourglass + ' 待检测</span>';
  }'''
))

# J3: 检测结果弹窗文案去 emoji 前缀（标题已有 ok/bad 配色）
JS_PAIRS.append((
    r'''      return '✅ 检测成功，接口可用\n耗时 ' + (ms / 1000).toFixed(1) + 's';
    }
    return '❌ 检测失败\n原因：' + healthReason(r ? r.err : '');''',
    r'''      return '检测成功，接口可用\n耗时 ' + (ms / 1000).toFixed(1) + 's';
    }
    return '检测失败\n原因：' + healthReason(r ? r.err : '');'''
))

# J4: 批量检测进度文案只更新 span（保按钮内 SVG 不被 textContent 抹掉）
JS_PAIRS.append((
    '''    function setProgress() {
      if (btn) {
        btn.disabled = true;
        btn.textContent = '检测中 ' + done + '/' + ids.length;
      }
    }
    function finishAll() {
      batchRunning = false;
      if (btn) { btn.disabled = false; btn.textContent = '🔌 批量检测'; }
      toast('success', '批量检测完成：正常 ' + good + ' / 失败 ' + bad);
    }''',
    '''    function setProgress() {
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
    }'''
))

# J5: 模型行图标（拖拽手柄 / 编辑 / 删除 / 上移 / 下移）
JS_PAIRS.append((
    "    html += '<span class=\"xt-drag-handle\" data-handle=\"1\" title=\"拖拽排序\">⠿</span>';",
    "    html += '<span class=\"xt-drag-handle\" data-handle=\"1\" title=\"拖拽排序\">' + ICONS.grip + '</span>';"
))
JS_PAIRS.append((
    "    html += '<button type=\"button\" class=\"xt-ico-btn\" data-edit=\"' + esc(id) + '\" title=\"编辑\">✏️</button>';",
    "    html += '<button type=\"button\" class=\"xt-ico-btn\" data-edit=\"' + esc(id) + '\" title=\"编辑\">' + ICONS.edit + '</button>';"
))
JS_PAIRS.append((
    "      html += '<button type=\"button\" class=\"xt-ico-btn del\" data-del=\"' + esc(id) + '\" title=\"删除\">🗑️</button>';",
    "      html += '<button type=\"button\" class=\"xt-ico-btn del\" data-del=\"' + esc(id) + '\" title=\"删除\">' + ICONS.del + '</button>';"
))
JS_PAIRS.append((
    '''    html += '<button type="button" class="xt-ico-btn" data-up="' + esc(id) + '" title="上移">↑</button>';
    html += '<button type="button" class="xt-ico-btn" data-down="' + esc(id) + '" title="下移">↓</button>';''',
    '''    html += '<button type="button" class="xt-ico-btn" data-up="' + esc(id) + '" title="上移">' + ICONS.up + '</button>';
    html += '<button type="button" class="xt-ico-btn" data-down="' + esc(id) + '" title="下移">' + ICONS.down + '</button>';'''
))

# J6: 模型列表星级（点亮=实心 / 未点=描边）
JS_PAIRS.append((
    '''      h += '<span class="' + (i <= n ? 'on' : '') + '" data-star-n="' + i + '">★</span>';''',
    '''      h += '<span class="' + (i <= n ? 'on' : '') + '" data-star-n="' + i + '">' +
        (i <= n ? ICONS.starOn : ICONS.starOff) + '</span>';'''
))

# J7: 表单星级选择
JS_PAIRS.append((
    '''      html += '<button type="button" class="' + (i <= formStars ? 'on' : '') +
        '" data-form-star="' + i + '" title="' + i + ' 星">★</button>';''',
    '''      html += '<button type="button" class="' + (i <= formStars ? 'on' : '') +
        '" data-form-star="' + i + '" title="' + i + ' 星">' +
        (i <= formStars ? ICONS.starOn : ICONS.starOff) + '</button>';'''
))

# J8: 记忆条目删除按钮
JS_PAIRS.append((
    "        '<button type=\"button\" class=\"xt-ico-btn del\" data-mem-del=\"' + i + '\" title=\"删除\">🗑️</button>' +",
    "        '<button type=\"button\" class=\"xt-ico-btn del\" data-mem-del=\"' + i + '\" title=\"删除\">' + ICONS.del + '</button>' +"
))

# J9: Key 状态行 -> 锁形 SVG + 文案（去 🔒 emoji）
JS_PAIRS.append((
    '''    if (kind === 'builtin') {
      if (keyOverrideExists(editTarget.id)) {
        text = '已自定义密钥（留空保持不变）';
        showClear = true;
      } else {
        text = '🔒 已使用平台内置密钥';
      }''',
    '''    var lockFlag = false;
    if (kind === 'builtin') {
      if (keyOverrideExists(editTarget.id)) {
        text = '已自定义密钥（留空保持不变）';
        showClear = true;
      } else {
        text = '已使用平台内置密钥';
        lockFlag = true;
      }'''
))
JS_PAIRS.append((
    "    var html = '<span class=\"xt-key-state-txt\">' + esc(text) + '</span>';",
    "    var html = '<span class=\"xt-key-state-txt\">' + (lockFlag ? ICONS.lock + ' ' : '') + esc(text) + '</span>';"
))

# J10: 功能分类链按钮（上移/下移/移出）
JS_PAIRS.append((
    '''      html += '<button type="button" class="xt-ico-btn" data-cat-up="' + esc(key) + '|' + esc(mid) + '" title="上移">↑</button>';
      html += '<button type="button" class="xt-ico-btn" data-cat-down="' + esc(key) + '|' + esc(mid) + '" title="下移">↓</button>';
      html += '<button type="button" class="xt-ico-btn del" data-cat-rm="' + esc(key) + '|' + esc(mid) + '" title="移出">✕</button>';''',
    '''      html += '<button type="button" class="xt-ico-btn" data-cat-up="' + esc(key) + '|' + esc(mid) + '" title="上移">' + ICONS.up + '</button>';
      html += '<button type="button" class="xt-ico-btn" data-cat-down="' + esc(key) + '|' + esc(mid) + '" title="下移">' + ICONS.down + '</button>';
      html += '<button type="button" class="xt-ico-btn del" data-cat-rm="' + esc(key) + '|' + esc(mid) + '" title="移出">' + ICONS.x + '</button>';'''
))

# J11: 高级设置折叠 -> 箭头旋转（去 ▴/▾ 文本切换）
JS_PAIRS.append((
    '''  function toggleAdv() {
    formAdvOpen = !formAdvOpen;
    var box = $('setFmAdv');
    var btn = $('setFmAdvToggle');
    if (box) { box.style.display = formAdvOpen ? 'block' : 'none'; }
    if (btn) { btn.textContent = formAdvOpen ? '高级设置 ▴' : '高级设置 ▾'; }
  }''',
    '''  function toggleAdv() {
    formAdvOpen = !formAdvOpen;
    var box = $('setFmAdv');
    var btn = $('setFmAdvToggle');
    if (box) { box.style.display = formAdvOpen ? 'block' : 'none'; }
    if (btn) { btn.className = formAdvOpen ? 'xt-adv-toggle open' : 'xt-adv-toggle'; }
  }'''
))

# J12: 检测连接失败弹窗文案去 emoji 前缀
JS_PAIRS.append((
    r"          showInfoModal('检测连接', '❌ 检测失败\n原因：网络不可达\n\n（使用表单当前未保存值检测）', false);",
    r"          showInfoModal('检测连接', '检测失败\n原因：网络不可达\n\n（使用表单当前未保存值检测）', false);"
))

# ---------------- 执行 ----------------
patch(HTML, HTML_PAIRS)
patch(JS, JS_PAIRS)

for p in (HTML, JS):
    with open(p, 'rb') as f:
        raw = f.read()
    crlf = raw.count(b'\r\n')
    cr = raw.count(b'\r')
    print('CHECK %s: CRLF=%d loneCR=%d lines=%d bytes=%d' % (os.path.basename(p), crlf, cr - crlf, raw.count(b'\n'), len(raw)))
    if crlf != 0 or (cr - crlf) != 0:
        print('EOL_FAIL', p)
        sys.exit(1)
print('ALL_PATCH_DONE')
