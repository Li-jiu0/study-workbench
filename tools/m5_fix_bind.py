# -*- coding: utf-8 -*-
"""
R88-M5 patch fix · 修复 m5Bind 中共享 var q 的闭包 bug
（var q 被后续赋值覆盖 → change 处理器读到错误的元素，导致 时间/标签/自定义 筛选全部失效）
改为每个处理器用局部 const 元素绑定。保留既有 DOM id / 行为。
"""
import os

BASE = r"D:\下载的文件\学习工作台"
JS = os.path.join(BASE, "assets", "xt-profile.js")


def load(p):
    with open(p, "rb") as f:
        return f.read()


def save(p, b):
    with open(p, "wb") as f:
        f.write(b)


def check_eol(b, label):
    crlf = b.count(b"\r\n"); lf = b.count(b"\n")
    assert lf - crlf == 0, label + " loneLF=" + str(lf - crlf)
    assert b.count(b"\r") - crlf == 0, label + " loneCR=" + str(b.count(b"\r") - crlf)


def B(s):
    return s.encode("utf-8")


def replace_once(b, anchor, repl, label):
    cnt = b.count(anchor)
    assert cnt == 1, label + " anchor count=" + str(cnt)
    return b.replace(anchor, repl, 1)


NL = "\r\n"

js = load(JS)
before = len(js)
check_eol(js, "before")

OLD = (
    "  function m5Bind(root) {" + NL +
    "    if (!root) { return; }" + NL +
    "    var q;" + NL +
    "    // 搜索框（输入防抖 200ms）" + NL +
    "    var kw = root.querySelector('#xtpM5Kw');" + NL +
    "    if (kw) {" + NL +
    "      var t = null;" + NL +
    "      kw.addEventListener('input', function () {" + NL +
    "        if (t) { clearTimeout(t); }" + NL +
    "        t = setTimeout(function () {" + NL +
    "          M5.kw = String(kw.value || '');" + NL +
    "          m5Reset();" + NL +
    "          m5Repaint();" + NL +
    "          var nk = $('xtpM5Kw'); if (nk && nk.focus && nk.setSelectionRange) { try { nk.focus(); nk.setSelectionRange(nk.value.length, nk.value.length); } catch (e) { } }" + NL +
    "        }, 200);" + NL +
    "      });" + NL +
    "    }" + NL +
    "    q = root.querySelector('#xtpM5Clear');" + NL +
    "    if (q) { q.addEventListener('click', function () { M5.kw = ''; m5Reset(); m5Repaint(); }); }" + NL +
    "    q = root.querySelector('#xtpM5Range');" + NL +
    "    if (q) { q.addEventListener('change', function () { M5.range = q.value || 'all'; m5Reset(); m5Repaint(); }); }" + NL +
    "    q = root.querySelector('#xtpM5Tag');" + NL +
    "    if (q) { q.addEventListener('change', function () { M5.tag = q.value || ''; m5Reset(); m5Repaint(); }); }" + NL +
    "    q = root.querySelector('#xtpM5From');" + NL +
    "    if (q) { q.addEventListener('change', function () { M5.from = q.value || ''; m5Reset(); m5Repaint(); }); }" + NL +
    "    q = root.querySelector('#xtpM5To');" + NL +
    "    if (q) { q.addEventListener('change', function () { M5.to = q.value || ''; m5Reset(); m5Repaint(); }); }" + NL +
    "    q = root.querySelector('#xtpM5Fav');" + NL +
    "    if (q) { q.addEventListener('click', function () { M5.favOnly = !M5.favOnly; m5Reset(); m5Repaint(); }); }" + NL +
    "    q = root.querySelector('#xtpM5SelBtn');" + NL +
    "    if (q) { q.addEventListener('click', function () { M5.selMode = !M5.selMode; M5.sel = {}; m5Repaint(); }); }" + NL +
    "    q = root.querySelector('#xtpM5SelAll');" + NL +
    "    if (q) { q.addEventListener('click', function () {" + NL +
    "      if (m5AllSelected()) { M5.sel = {}; }" + NL +
    "      else { var list = m5Filtered(), i; for (i = 0; i < list.length; i++) { M5.sel[list[i].id] = true; } }" + NL +
    "      m5Repaint();" + NL +
    "    }); }" + NL +
    "    q = root.querySelector('#xtpM5DelSel');" + NL +
    "    if (q) { q.addEventListener('click', m5DelSelected); }" + NL +
    "    q = root.querySelector('#xtpM5ClearAll');" + NL +
    "    if (q) { q.addEventListener('click', m5ClearAll); }" + NL +
    "    q = root.querySelector('#xtpM5Export');" + NL +
    "    if (q) { q.addEventListener('click', m5Export); }" + NL +
    "    q = root.querySelector('#xtpM5Backup');" + NL +
    "    if (q) { q.addEventListener('click', m5Backup); }" + NL +
    "    q = root.querySelector('#xtpM5Restore');" + NL +
    "    if (q) { q.addEventListener('click', m5Restore); }" + NL +
    "    // 列表内：多选框 / 收藏 / 标签 / 删除" + NL +
    "    var boxes = root.querySelectorAll('.xtpM5Cb'), i;" + NL +
    "    for (i = 0; i < boxes.length; i++) {" + NL +
    "      boxes[i].addEventListener('change', function (ev) {" + NL +
    "        var id = ev.target.getAttribute('data-id');" + NL +
    "        if (ev.target.checked) { M5.sel[id] = true; } else { delete M5.sel[id]; }" + NL +
    "        m5Repaint();" + NL +
    "      });" + NL +
    "    }" + NL +
    "    var favs = root.querySelectorAll('.xtpM5Fav'), j;" + NL +
    "    for (j = 0; j < favs.length; j++) {" + NL +
    "      favs[j].addEventListener('click', function (ev) {" + NL +
    "        ev.stopPropagation();" + NL +
    "        m5ToggleFav(ev.currentTarget.getAttribute('data-id'));" + NL +
    "      });" + NL +
    "    }" + NL +
    "    var tagbs = root.querySelectorAll('.xtpM5Tag'), m;" + NL +
    "    for (m = 0; m < tagbs.length; m++) {" + NL +
    "      tagbs[m].addEventListener('click', function (ev) {" + NL +
    "        ev.stopPropagation();" + NL +
    "        m5EditTags(ev.currentTarget.getAttribute('data-id'));" + NL +
    "      });" + NL +
    "    }" + NL +
    "    var dels = root.querySelectorAll('.xtpM5Del'), p;" + NL +
    "    for (p = 0; p < dels.length; p++) {" + NL +
    "      dels[p].addEventListener('click', function (ev) {" + NL +
    "        ev.stopPropagation();" + NL +
    "        m5DelOne(ev.currentTarget.getAttribute('data-id'));" + NL +
    "      });" + NL +
    "    }" + NL +
    "  }"
)

NEW_LINES = [
    "  function m5Bind(root) {",
    "    if (!root) { return; }",
    "    // ⚠️ 事件处理器一律用局部 const el 捕获元素，绝不复用共享 var（否则闭包读到最后一个赋值元素）。",
    "    // 搜索框（输入防抖 200ms）",
    "    var kwEl = root.querySelector('#xtpM5Kw');",
    "    if (kwEl) {",
    "      var kwT = null;",
    "      kwEl.addEventListener('input', function () {",
    "        if (kwT) { clearTimeout(kwT); }",
    "        kwT = setTimeout(function () {",
    "          M5.kw = String(kwEl.value || '');",
    "          m5Reset();",
    "          m5Repaint();",
    "          var nk = $('xtpM5Kw');",
    "          if (nk && nk.focus && nk.setSelectionRange) {",
    "            try { nk.focus(); nk.setSelectionRange(nk.value.length, nk.value.length); } catch (e) { /* 忽略 */ }",
    "          }",
    "        }, 200);",
    "      });",
    "    }",
    "    var clearEl = root.querySelector('#xtpM5Clear');",
    "    if (clearEl) { clearEl.addEventListener('click', function () { M5.kw = ''; m5Reset(); m5Repaint(); }); }",
    "    var rangeEl = root.querySelector('#xtpM5Range');",
    "    if (rangeEl) { rangeEl.addEventListener('change', function () { M5.range = rangeEl.value || 'all'; m5Reset(); m5Repaint(); }); }",
    "    var tagEl = root.querySelector('#xtpM5Tag');",
    "    if (tagEl) { tagEl.addEventListener('change', function () { M5.tag = tagEl.value || ''; m5Reset(); m5Repaint(); }); }",
    "    var fromEl = root.querySelector('#xtpM5From');",
    "    if (fromEl) { fromEl.addEventListener('change', function () { M5.from = fromEl.value || ''; m5Reset(); m5Repaint(); }); }",
    "    var toEl = root.querySelector('#xtpM5To');",
    "    if (toEl) { toEl.addEventListener('change', function () { M5.to = toEl.value || ''; m5Reset(); m5Repaint(); }); }",
    "    var favEl = root.querySelector('#xtpM5Fav');",
    "    if (favEl) { favEl.addEventListener('click', function () { M5.favOnly = !M5.favOnly; m5Reset(); m5Repaint(); }); }",
    "    var selBtnEl = root.querySelector('#xtpM5SelBtn');",
    "    if (selBtnEl) { selBtnEl.addEventListener('click', function () { M5.selMode = !M5.selMode; M5.sel = {}; m5Repaint(); }); }",
    "    var selAllEl = root.querySelector('#xtpM5SelAll');",
    "    if (selAllEl) { selAllEl.addEventListener('click', function () {",
    "      if (m5AllSelected()) { M5.sel = {}; }",
    "      else { var list = m5Filtered(), i; for (i = 0; i < list.length; i++) { M5.sel[list[i].id] = true; } }",
    "      m5Repaint();",
    "    }); }",
    "    var delSelEl = root.querySelector('#xtpM5DelSel');",
    "    if (delSelEl) { delSelEl.addEventListener('click', m5DelSelected); }",
    "    var clearAllEl = root.querySelector('#xtpM5ClearAll');",
    "    if (clearAllEl) { clearAllEl.addEventListener('click', m5ClearAll); }",
    "    var exportEl = root.querySelector('#xtpM5Export');",
    "    if (exportEl) { exportEl.addEventListener('click', m5Export); }",
    "    var backupEl = root.querySelector('#xtpM5Backup');",
    "    if (backupEl) { backupEl.addEventListener('click', m5Backup); }",
    "    var restoreEl = root.querySelector('#xtpM5Restore');",
    "    if (restoreEl) { restoreEl.addEventListener('click', m5Restore); }",
    "    // 列表内：多选框 / 收藏 / 标签 / 删除（用 currentTarget/闭包元素，避免共享变量）",
    "    var boxes = root.querySelectorAll('.xtpM5Cb'), i;",
    "    for (i = 0; i < boxes.length; i++) {",
    "      boxes[i].addEventListener('change', function (ev) {",
    "        var id = ev.target.getAttribute('data-id');",
    "        if (ev.target.checked) { M5.sel[id] = true; } else { delete M5.sel[id]; }",
    "        m5Repaint();",
    "      });",
    "    }",
    "    var favs = root.querySelectorAll('.xtpM5Fav'), j;",
    "    for (j = 0; j < favs.length; j++) {",
    "      favs[j].addEventListener('click', function (ev) {",
    "        ev.stopPropagation();",
    "        m5ToggleFav(ev.currentTarget.getAttribute('data-id'));",
    "      });",
    "    }",
    "    var tagbs = root.querySelectorAll('.xtpM5Tag'), m;",
    "    for (m = 0; m < tagbs.length; m++) {",
    "      tagbs[m].addEventListener('click', function (ev) {",
    "        ev.stopPropagation();",
    "        m5EditTags(ev.currentTarget.getAttribute('data-id'));",
    "      });",
    "    }",
    "    var dels = root.querySelectorAll('.xtpM5Del'), p;",
    "    for (p = 0; p < dels.length; p++) {",
    "      dels[p].addEventListener('click', function (ev) {",
    "        ev.stopPropagation();",
    "        m5DelOne(ev.currentTarget.getAttribute('data-id'));",
    "      });",
    "    }",
    "  }",
]
NEW = B(NL.join(NEW_LINES))

js = replace_once(js, B(OLD), NEW, "m5Bind-fix")
check_eol(js, "after")
save(JS, js)
print("m5Bind fixed  bytes " + str(before) + " -> " + str(len(js)))
