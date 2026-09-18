# -*- coding: utf-8 -*-
"""
T04 patch · 线 C · 社区发贴位置
F5  社区.html   ; F5c assets/api.js ; F5b assets/app.js
二进制读写保 CRLF；每步断言锚点唯一 + 复验行尾。
本脚本用 str + encode('utf-8') 构造替换文本（bytes 字面量不能含非 ASCII）。
"""
import os

BASE = r"D:\下载的文件\学习工作台"
H = os.path.join(BASE, "社区.html")
API = os.path.join(BASE, "assets", "api.js")
APP = os.path.join(BASE, "assets", "app.js")


def load(p):
    with open(p, "rb") as f:
        return f.read()


def save(p, b):
    with open(p, "wb") as f:
        f.write(b)


def check_eol(b, label):
    crlf = b.count(b"\r\n")
    lf = b.count(b"\n")
    lone_lf = lf - crlf
    lone_cr = b.count(b"\r") - crlf
    assert lone_lf == 0, label + " loneLF != 0"
    assert lone_cr == 0, label + " loneCR != 0"


def B(s):
    return s.encode("utf-8")


def replace_once(b, anchor, repl, label):
    cnt = b.count(anchor)
    assert cnt == 1, label + " anchor count=" + str(cnt)
    return b.replace(anchor, repl, 1)


NL = "\r\n"

# =====================================================================
# F5 · 社区.html
# =====================================================================
html = load(H)
before_bytes = len(html)
check_eol(html, "社区.html-before")
assert before_bytes == 43479, "社区.html unexpected size " + str(before_bytes)

# --- ① CSS ---
anchor_css = B(".bc-item .bc-text { word-break: break-word; overflow-wrap: break-word; }" + NL + "</style>")
css_lines = [
    ".bc-item .bc-text { word-break: break-word; overflow-wrap: break-word; }",
    "/* R88-H / T04：社区发贴「所在位置」入口 + 位置 chip（仅本页；只读文字地址，不涉坐标） */",
    ".blog-loc-bar { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }",
    ".blog-loc-btn { display: inline-flex; align-items: center; gap: 4px; background: none; border: 1px dashed var(--border); color: var(--text-secondary); cursor: pointer; font-size: 12px; padding: 6px 10px; border-radius: 8px; transition: color .15s, border-color .15s; }",
    ".blog-loc-btn:hover { color: var(--primary); border-color: var(--primary); }",
    ".blog-loc-chip { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--primary); background: color-mix(in srgb, var(--primary) 12%, transparent); border-radius: 999px; padding: 4px 10px; max-width: 240px; }",
    ".blog-loc-chip .blog-loc-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    ".blog-loc-chip .blog-loc-x { cursor: pointer; font-weight: 700; opacity: .7; }",
    ".blog-loc-chip .blog-loc-x:hover { opacity: 1; }",
    "</style>",
]
html = replace_once(html, anchor_css, B(NL.join(css_lines)), "社区.html-CSS")

# --- ② 功能栏按钮 + chip ---
anchor_bar = B(
    '                <button class="btn btn-outline" onclick="resetBlogEditor()"><span class="nav-icon" data-icon="rotate-ccw" data-icon-size="16"></span> 清空</button>' + NL +
    '                <div class="spacer"></div>'
)
bar_lines = [
    '                <button class="btn btn-outline" onclick="resetBlogEditor()"><span class="nav-icon" data-icon="rotate-ccw" data-icon-size="16"></span> 清空</button>',
    '                <span class="blog-loc-bar">',
    '                  <button type="button" class="blog-loc-btn" id="blogLocBtn" onclick="blogPickLoc()"><span class="nav-icon" data-icon="map-pin" data-icon-size="14"></span> 所在位置</button>',
    '                  <span class="blog-loc-chip" id="blogLocChip" data-loc="" style="display:none"><span class="nav-icon" data-icon="map-pin" data-icon-size="12"></span><span class="blog-loc-text" id="blogLocText"></span><span class="blog-loc-x" onclick="blogClearLoc()" title="清除位置">&times;</span></span>',
    '                </span>',
    '                <div class="spacer"></div>',
]
html = replace_once(html, anchor_bar, B(NL.join(bar_lines)), "社区.html-bar")

# --- ③ 引入 xt-region.js ---
anchor_script = B(
    '<script src="assets/config.js?v=20260916O" defer></script>' + NL +
    '<script src="assets/api.js?v=20260917b" defer></script>'
)
script_lines = [
    '<script src="assets/config.js?v=20260916O" defer></script>',
    '<script src="assets/xt-region.js?v=20260918a" defer></script>',
    '<script src="assets/api.js?v=20260917b" defer></script>',
]
html = replace_once(html, anchor_script, B(NL.join(script_lines)), "社区.html-script")

# --- ④ 页尾脚本 ---
anchor_tail = B('<script src="assets/ai-cap-3d.js?v=20260918c"></script>' + NL + "</body>")
tail_lines = [
    '<script src="assets/ai-cap-3d.js?v=20260918c"></script>',
    '<script>',
    '/* ===================================================================',
    '   R88-H / T04：社区发贴「所在位置」',
    '   -------------------------------------------------------------------',
    '   位置文字地址的唯一真源 = #blogLocChip 的 data-loc 属性（String）。',
    '   saveBlogNote（app.js 本地链路 / api.js 服务端链路）均从该节点读取同一值。',
    '   只产出/渲染文字地址，任何路径不渲染经纬度。',
    '   手动兜底复用 app.js 的 window.uiPrompt（禁原生 prompt）。',
    '   =================================================================== */',
    '(function () {',
    "  function toast(msg) { try { if (typeof showToast === 'function') showToast(msg); } catch (e) { } }",
    '',
    '  // 取当前 chip 上的文字地址（空串 = 未设位置）',
    '  function currentLoc() {',
    "    var chip = document.getElementById('blogLocChip');",
    "    if (!chip) return '';",
    "    return chip.getAttribute('data-loc') || '';",
    '  }',
    '',
    '  // 渲染 / 隐藏位置 chip（空值不渲染）',
    '  window.blogRenderLocChip = function () {',
    "    var chip = document.getElementById('blogLocChip');",
    '    if (!chip) return;',
    '    var txt = currentLoc();',
    "    var label = document.getElementById('blogLocText');",
    '    if (txt) {',
    "      chip.setAttribute('data-loc', txt);",
    '      if (label) label.textContent = txt;',
    "      chip.style.display = 'inline-flex';",
    '    } else {',
    "      chip.setAttribute('data-loc', '');",
    "      if (label) label.textContent = '';",
    "      chip.style.display = 'none';",
    '    }',
    '    if (window.lucideAutoRender) window.lucideAutoRender();',
    '  };',
    '',
    '  // 清除位置',
    '  window.blogClearLoc = function () {',
    "    var chip = document.getElementById('blogLocChip');",
    "    if (chip) chip.setAttribute('data-loc', '');",
    '    window.blogRenderLocChip();',
    '  };',
    '',
    '  // 手动输入兜底：复用 app.js 的 uiPrompt（异步，取消返回 null）',
    '  function manualInput(title, placeholder, cb) {',
    "    if (typeof window.uiPrompt !== 'function') { cb(''); return; }",
    "    var msg = placeholder ? (title + '（' + placeholder + '）') : title;",
    "    window.uiPrompt(msg, '').then(function (v) {",
    "      cb(v == null ? '' : String(v).trim());",
    "    }).catch(function () { cb(''); });",
    '  }',
    '',
    '  // 主入口：定位 → 逆编码 → 文字地址；失败降级手动输入',
    '  window.blogPickLoc = function () {',
    "    if (!window.XT_LOC_PICK || typeof window.XT_LOC_PICK.pick !== 'function') {",
    "      toast('定位失败，请手动填写');",
    "      manualInput('所在位置', '如：图书馆 / 自习室', function (text) {",
    "        var chip = document.getElementById('blogLocChip');",
    "        if (chip) chip.setAttribute('data-loc', text || '');",
    '        window.blogRenderLocChip();',
    '      });',
    '      return;',
    '    }',
    "    var btn = document.getElementById('blogLocBtn');",
    '    if (btn) btn.disabled = true;',
    "    toast('正在定位…');",
    '    window.XT_LOC_PICK.pick({',
    "      fallbackTitle: '所在位置',",
    '      allowManual: true,',
    '      onManual: manualInput',
    '    }, function (r) {',
    '      if (btn) btn.disabled = false;',
    "      var chip = document.getElementById('blogLocChip');",
    '      if (r && r.text) {',
    "        if (chip) chip.setAttribute('data-loc', r.text);",
    '        window.blogRenderLocChip();',
    '      } else {',
    "        if (chip) chip.setAttribute('data-loc', '');",
    '        window.blogRenderLocChip();',
    '      }',
    '    });',
    '  };',
    '',
    '  // 进入编辑器时按 data-loc 现有值渲染一次',
    '  function init() { window.blogRenderLocChip(); }',
    "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);",
    '  else init();',
    '})();',
    '</script>',
    '</body>',
]
html = replace_once(html, anchor_tail, B(NL.join(tail_lines)), "社区.html-tail")

check_eol(html, "社区.html-after")
save(H, html)
print("F5  社区.html       OK  bytes " + str(before_bytes) + " -> " + str(len(html)))

# =====================================================================
# F5c · assets/api.js
# =====================================================================
api = load(API)
api_before = len(api)
check_eol(api, "api.js-before")
anchor_payload = B("  var payload = { title: title, content: content, category: cat, privacy: privacy, status: status, cover: cover, tags: tags };")
payload_new = B("  var payload = { title: title, content: content, category: cat, privacy: privacy, status: status, cover: cover, tags: tags, location: (document.getElementById('blogLocChip') && document.getElementById('blogLocChip').getAttribute('data-loc')) || '' };")
api = replace_once(api, anchor_payload, payload_new, "api.js-payload")
check_eol(api, "api.js-after")
save(API, api)
print("F5c assets/api.js  OK  bytes " + str(api_before) + " -> " + str(len(api)))

# =====================================================================
# F5b · assets/app.js  （本地链路 saveBlogNote）
# =====================================================================
app = load(APP)
app_before = len(app)
check_eol(app, "app.js-before")

anchor_get = B("  const tags = document.getElementById('beTags').value.split(/[,\uff0c]/).map(s => s.trim()).filter(Boolean).slice(0, 6);")
get_new = B(
    "  const tags = document.getElementById('beTags').value.split(/[,\uff0c]/).map(s => s.trim()).filter(Boolean).slice(0, 6);" + NL +
    "  const location = (document.getElementById('blogLocChip') && document.getElementById('blogLocChip').getAttribute('data-loc')) || '';"
)
app = replace_once(app, anchor_get, get_new, "app.js-get")

anchor_edit = B("    if (n) { Object.assign(n, { title, category: cat, privacy, cover, tags, content, status, excerpt: makeExcerpt(content), updatedAt: now }); }")
edit_new = B("    if (n) { Object.assign(n, { title, category: cat, privacy, cover, tags, content, status, excerpt: makeExcerpt(content), location, updatedAt: now }); }")
app = replace_once(app, anchor_edit, edit_new, "app.js-edit")

anchor_new = B("    appData.notes.push({ id, title, category: cat, privacy, cover, tags, content, status, excerpt: makeExcerpt(content), views: 0, likes: 0, liked: false, comments: [], createdAt: now, updatedAt: now });")
new_new = B("    appData.notes.push({ id, title, category: cat, privacy, cover, tags, content, status, excerpt: makeExcerpt(content), location, views: 0, likes: 0, liked: false, comments: [], createdAt: now, updatedAt: now });")
app = replace_once(app, anchor_new, new_new, "app.js-new")

check_eol(app, "app.js-after")
save(APP, app)
print("F5b assets/app.js  OK  bytes " + str(app_before) + " -> " + str(len(app)))

print("ALL DONE")
