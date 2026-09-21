# -*- coding: utf-8 -*-
"""R88-M2 编辑4：xt-update.js 增加「更多页入口」版本号写回（LF）。"""
import os
os.chdir(r"D:/下载的文件/学习工作台")
p = "assets/xt-update.js"
b = open(p, "rb").read()
orig = len(b)

def enc(s):
    return s.encode("utf-8")

def rep(b, old, new, n=1):
    assert b.count(old) == n, "count=%d expected %d for %r" % (b.count(old), n, old[:80])
    return b.replace(old, new)

LF = "\n"

# 在 boot() 的设置页分支后，加入「更多页入口」分支
old = enc(
    '      // 否则若在设置页，走自动检测（12 小时节流）' + LF +
    '      if ($(\'xtUpdateDesc\')) {' + LF +
    '        bootSettings();' + LF +
    '      }' + LF +
    '    } catch (e) {' + LF +
    '      bootFail(e);' + LF +
    '    }' + LF +
    '  }' + LF
)
new = enc(
    '      // 否则若在设置页，走自动检测（12 小时节流）' + LF +
    '      if ($(\'xtUpdateDesc\')) {' + LF +
    '        bootSettings();' + LF +
    '        return;' + LF +
    '      }' + LF +
    '      // 否则若在「更多」页，写回入口的版本号（R88-G / R88-M2）' + LF +
    '      if ($(\'xtMoreUpdateVer\')) {' + LF +
    '        bootMoreEntry();' + LF +
    '      }' + LF +
    '    } catch (e) {' + LF +
    '      bootFail(e);' + LF +
    '    }' + LF +
    '  }' + LF + LF +
    '  /** 「更多」页检测更新入口：至少写回当前版本号，不让入口显示占位符。 */' + LF +
    '  function bootMoreEntry() {' + LF +
    '    var el = $(\'xtMoreUpdateVer\');' + LF +
    '    if (!el) { return; }' + LF +
    '    el.textContent = \'当前版本 v\' + CURRENT_VERSION + \' · 查看是否有新版本\';' + LF +
    '  }' + LF
)
b = rep(b, old, new)

open(p, "wb").write(b)
nb = open(p, "rb").read()
print("bytes %d -> %d (delta %d)" % (orig, len(nb), len(nb) - orig))
print("CR=%d LF=%d CRLF=%d" % (nb.count(b"\r"), nb.count(b"\n"), nb.count(b"\r\n")))
print("bootMoreEntry:", b"bootMoreEntry" in nb)
print("backslash-u leftovers:", nb.count(b"\\u"))
