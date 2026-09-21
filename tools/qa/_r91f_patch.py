# -*- coding: utf-8 -*-
"""R91-F：更新页状态卡（检测失败/成功等）圆圈内 data-icon 未被渲染修复。
根因：xt-update.js 用 innerHTML 动态注入 [data-icon] 节点，而 icon-map.js 的
autoRender 只在 DOMContentLoaded 跑一次，覆盖不到后注入节点。
改法：新增 paintIcons() helper（调 window.lucideAutoRender），在所有动态注入
data-icon 的 innerHTML 之后调用。字节级替换，行尾自适应（CRLF/LF 保持原样）。
"""
import io

P = r"D:\下载的文件\学习工作台\assets\xt-update.js"
LOG = r"D:\下载的文件\学习工作台\tools\qa\r91f_patch_log.txt"

with io.open(P, "rb") as f:
    data = f.read()

crlf = data.count(b"\r\n")
lf_total = data.count(b"\n")
pure_lf = lf_total - crlf
NL = b"\r\n" if crlf > pure_lf else b"\n"
with io.open(LOG, "w", encoding="utf-8") as f:
    f.write("R91-F patch log for assets/xt-update.js\n")
    f.write("file size before=%d  CRLF=%d  LF_total=%d  pure_LF=%d  => NL=%r\n"
            % (len(data), crlf, lf_total, pure_lf, NL))

def S(lines):
    """join with detected newline, return bytes"""
    return NL.join([l.encode("utf-8") for l in lines])

REPL = [
    # (label, old_lines, new_lines)
    ("helper: paintIcons() after rootId decl",
     ["  var rootId = 'xtUpdateRoot';"],
     ["  var rootId = 'xtUpdateRoot';",
      "",
      "  /* R91-F：状态卡圆圈 / 动作按钮均为运行时 innerHTML 动态注入，icon-map.js 的",
      "     自动渲染只在 DOMContentLoaded 跑一次，覆盖不到后注入的 [data-icon] 节点。",
      "     这里显式补一次渲染：与 更新.html 顶部品牌块（静态 HTML，首渲染已覆盖）",
      "     走同一条 data-icon -> lucideIcon 管线，配色/尺寸仍由既有 CSS 体系管理。 */",
      "  function paintIcons() {",
      "    if (typeof window.lucideAutoRender === 'function') {",
      "      try { window.lucideAutoRender(); } catch (e) {}",
      "    }",
      "  }"]),

    ("renderNew: paint after innerHTML",
     ["      '<div class=\"xt-up-guide\" id=\"xtUpGuide\" hidden></div>';",
      "  }"],
     ["      '<div class=\"xt-up-guide\" id=\"xtUpGuide\" hidden></div>';",
      "    paintIcons();",
      "  }"]),

    ("renderLatest: paint after innerHTML",
     ["          '<span class=\"nav-icon\" data-icon=\"rotate-ccw\" data-icon-size=\"14\"></span> 重新检测' +",
      "        '</button>' +",
      "      '</div>';",
      "  }"],
     ["          '<span class=\"nav-icon\" data-icon=\"rotate-ccw\" data-icon-size=\"14\"></span> 重新检测' +",
      "        '</button>' +",
      "      '</div>';",
      "    paintIcons();",
      "  }"]),

    ("renderStarting: paint after innerHTML",
     ["        '不是故障，也不会影响已保存的学习数据。</div>';",
      "  }"],
     ["        '不是故障，也不会影响已保存的学习数据。</div>';",
      "    paintIcons();",
      "  }"]),

    ("renderError: paint after innerHTML",
     ["      '<div class=\"xt-up-guide xt-up-guide-tip\">若多次失败，可稍后再试或前往「设置 → 检测更新」重新检测。</div>';",
      "  }"],
     ["      '<div class=\"xt-up-guide xt-up-guide-tip\">若多次失败，可稍后再试或前往「设置 → 检测更新」重新检测。</div>';",
      "    paintIcons();",
      "  }"]),

    ("applySettingsState new-btn",
     ["        btn.innerHTML = '<span class=\"nav-icon\" data-icon=\"download\" data-icon-size=\"14\"></span> 去更新';",
      "      }"],
     ["        btn.innerHTML = '<span class=\"nav-icon\" data-icon=\"download\" data-icon-size=\"14\"></span> 去更新';",
      "        paintIcons();",
      "      }"]),

    ("applySettingsState latest-btn",
     ["      desc.textContent = '已是「最新版本」· 当前 v' +",
      "        (state.data && state.data.version ? state.data.version : CURRENT_VERSION) +",
      "        '（无需更新）';",
      "      if (btn) {",
      "        btn.className = 'btn btn-outline';",
      "        btn.innerHTML = '<span class=\"nav-icon\" data-icon=\"download\" data-icon-size=\"14\"></span> 检测更新';",
      "      }"],
     ["      desc.textContent = '已是「最新版本」· 当前 v' +",
      "        (state.data && state.data.version ? state.data.version : CURRENT_VERSION) +",
      "        '（无需更新）';",
      "      if (btn) {",
      "        btn.className = 'btn btn-outline';",
      "        btn.innerHTML = '<span class=\"nav-icon\" data-icon=\"download\" data-icon-size=\"14\"></span> 检测更新';",
      "        paintIcons();",
      "      }"]),

    ("applySettingsState starting-btn",
     ["      desc.textContent = '当前版本 v' + CURRENT_VERSION + ' · 更新服务启动中，请稍候重试';",
      "      if (btn) {",
      "        btn.className = 'btn btn-outline';",
      "        btn.innerHTML = '<span class=\"nav-icon\" data-icon=\"download\" data-icon-size=\"14\"></span> 检测更新';",
      "      }"],
     ["      desc.textContent = '当前版本 v' + CURRENT_VERSION + ' · 更新服务启动中，请稍候重试';",
      "      if (btn) {",
      "        btn.className = 'btn btn-outline';",
      "        btn.innerHTML = '<span class=\"nav-icon\" data-icon=\"download\" data-icon-size=\"14\"></span> 检测更新';",
      "        paintIcons();",
      "      }"]),

    ("applySettingsState error-btn",
     ["      btn.innerHTML = '<span class=\"nav-icon\" data-icon=\"download\" data-icon-size=\"14\"></span> 重新检测';",
      "    }"],
     ["      btn.innerHTML = '<span class=\"nav-icon\" data-icon=\"download\" data-icon-size=\"14\"></span> 重新检测';",
      "      paintIcons();",
      "    }"]),

    ("startDownload btn",
     ["      btn.innerHTML = '<span class=\"nav-icon\" data-icon=\"download\" data-icon-size=\"14\"></span> 下载中…';",
      "    }"],
     ["      btn.innerHTML = '<span class=\"nav-icon\" data-icon=\"download\" data-icon-size=\"14\"></span> 下载中…';",
      "      paintIcons();",
      "    }"]),

    ("restoreBtn",
     ["    btn.innerHTML = '<span class=\"nav-icon\" data-icon=\"download\" data-icon-size=\"14\"></span> ' +",
      "      esc(label || '下载更新');",
      "  }"],
     ["    btn.innerHTML = '<span class=\"nav-icon\" data-icon=\"download\" data-icon-size=\"14\"></span> ' +",
      "      esc(label || '下载更新');",
      "    paintIcons();",
      "  }"]),
]

changed = 0
errors = []
for label, old_l, new_l in REPL:
    ob = S(old_l)
    nb = S(new_l)
    cnt = data.count(ob)
    if cnt != 1:
        errors.append("%s : old occurrence=%d (expect 1)" % (label, cnt))
        continue
    data = data.replace(ob, nb, 1)
    changed += 1
    with io.open(LOG, "a", encoding="utf-8") as f:
        f.write("[OK] %s\n" % label)

if errors:
    with io.open(LOG, "a", encoding="utf-8") as f:
        for e in errors:
            f.write("[ERROR] %s\n" % e)
        f.write("[ABORT] errors found; file NOT modified\n")
else:
    with io.open(P, "wb") as f:
        f.write(data)
    # verify
    with io.open(P, "rb") as f:
        chk = f.read()
    crlf2 = chk.count(b"\r\n")
    lf2 = chk.count(b"\n")
    n_paint = chk.count(b"paintIcons();")
    n_def = chk.count(b"function paintIcons()")
    with io.open(LOG, "a", encoding="utf-8") as f:
        f.write("file size after=%d  CRLF=%d  LF_total=%d  pure_LF=%d\n"
                % (len(chk), crlf2, lf2, lf2 - crlf2))
        f.write("[VERIFY] paintIcons(); call sites=%d (expect 10)\n" % n_paint)
        f.write("[VERIFY] function paintIcons() definitions=%d (expect 1)\n" % n_def)
        f.write("RESULT=%s\n" % ("PASS" if n_paint == 10 and n_def == 1 else "CHECK"))
