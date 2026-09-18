# -*- coding: utf-8 -*-
"""R73 需求12 · 面测.html AI 面试官改直连 —— 字节级替换脚本（默认 DRY-RUN，不落盘）。

用法（放行后）：  python _r73_miance_patch.py --apply
   · 备份：面测.html.bak-pre-r73-20260917
   · 整块替换 L840 起 `function callIvAi(cb) {` 至 L882 `if (document.readyState ...` 之前
   · 保持原生 CRLF（该文件实测 CRLF=906 / LF-only=0）
   · 落盘后自检：CRLF=906、`postIvChat` 0 命中、`callAI('interview'` 命中、占位符「面试官：…」逻辑仍在

不做：改 .env / ai-config.js / 版本戳；不 git 操作。ES2017 上限。
"""
import io
import os
import shutil
import sys

ROOT = r"D:\下载的文件\学习工作台"
TARGET = os.path.join(ROOT, "面测.html")
BACKUP = os.path.join(ROOT, "面测.html.bak-pre-r73-20260917")
APPLY = "--apply" in sys.argv

CRLF = "\r\n"

NEW_BLOCK_LINES = [
    "  /* AI 面试官：改走统一底座 window.callAI('interview', \\u2026) 直连（与其余 AI 模块同口径）。",
    "     原实现走服务端 /api/ai/chat 中转，而 server/.env 的 AI Key 全空 \u2192 恒\u300cAI \u6682\u4e0d\u53ef\u7528\u300d\uff1b",
    "     改直连后本模块即可用。超时（15s 首字 / 15s 响应头 / 90s 总）由 assets/ai-service.js 内部保证；",
    "     本函数不额外加看门狗（底座在所有路径均会 settle，每次 await 都被 raceTimeout 包裹）。",
    "     老内核无 ReadableStream/TextDecoder 时不挂 onChunk，走整段返回（非流式）。",
    "     cb(reply) 契约不变，ivAiSend / ivEndInterview 无需改动。 */",
    "  function ivCanStream() {",
    "    try {",
    "      return typeof ReadableStream !== 'undefined' && typeof TextDecoder !== 'undefined' && typeof window.fetch === 'function';",
    "    } catch (e) { return false; }",
    "  }",
    "",
    "  function callIvAi(cb) {",
    "    if (typeof window.callAI !== 'function') {",
    "      cb('（AI 面试官暂不可用：AI 底座未就绪，请刷新页面后重试；题库与答题要点不受影响）');",
    "      return;",
    "    }",
    "    var out = $id('ivAiText');",
    "    var msgs = [];",
    "    var hist = IV_AI.history.slice(-16);",
    "    for (var i = 0; i < hist.length; i++) {",
    "      msgs.push({ role: hist[i].role, content: hist[i].content });",
    "    }",
    "    var streaming = ivCanStream();",
    "    var buf = '';",
    "    var settled = false;",
    "    function finish(reply) {",
    "      if (settled) return;",
    "      settled = true;",
    "      cb((reply && String(reply).length) ? String(reply) : '（AI 未返回内容，请稍后重试）');",
    "    }",
    "    var opts = {};",
    "    if (streaming) {",
    "      opts.onChunk = function (piece, full) {",
    "        if (settled) return;",
    "        if (full !== null && full !== undefined && full !== '') buf = String(full);",
    "        else buf += String(piece === null || piece === undefined ? '' : piece);",
    "        if (out && /\u9762\u8bd5\u5b98\uff1a\u2026$/.test(out.textContent)) {",
    "          out.textContent = out.textContent.replace(/\u9762\u8bd5\u5b98\uff1a\u2026$/, '\u9762\u8bd5\u5b98\uff1a' + buf);",
    "        }",
    "      };",
    "    }",
    "    var p = null;",
    "    try {",
    "      p = window.callAI('interview', msgs, opts);",
    "    } catch (e1) {",
    "      finish('（AI 面试官忙不过来，请稍后重试）');",
    "      return;",
    "    }",
    "    Promise.resolve(p).then(function (res) {",
    "      var text = (res && (res.text || res.content)) ? String(res.text || res.content) : buf;",
    "      if (res && res.degraded) text = '（' + text + '）';",
    "      finish(text);",
    "    }).catch(function () {",
    "      finish('（AI 面试官忙不过来，请稍后重试）');",
    "    });",
    "  }",
    "",
]
NEW_BLOCK = CRLF.join(NEW_BLOCK_LINES).encode("utf-8")

START = "  function callIvAi(cb) {".encode("utf-8")
END = "  if (document.readyState !== 'loading') boot();".encode("utf-8")


def main():
    with open(TARGET, "rb") as f:
        data = f.read()

    report = []
    crlf0 = data.count(b"\r\n")
    lf0 = data.count(b"\n")
    report.append("BEFORE: CRLF=%d LF-only=%d" % (crlf0, lf0 - crlf0))

    i = data.find(START)
    j = data.find(END)
    if i == -1 or j == -1 or not (i < j):
        print("ANCHOR-FAIL i=%d j=%d" % (i, j))
        sys.exit(2)
    region = data[i:j]
    for token in (b"function postIvChat(cb)", b"getReader", b"/api/ai/chat"):
        if token not in region:
            print("REGION-MISSING %r" % token)
            sys.exit(3)

    out = data[:i] + NEW_BLOCK + data[j:]

    if not APPLY:
        print("DRY-RUN ok：将替换 %d 字节 -> %d 字节" % (len(region), len(NEW_BLOCK)))
        print("anchors: i=%d j=%d" % (i, j))
        print("ASCII-preview(new tail): ..." + out[j - 40:j + 60].decode("utf-8", "ignore").replace("\r", "\\r").replace("\n", "\\n"))
        return

    if os.path.exists(BACKUP):
        print("BACKUP exists, skip overwrite: " + BACKUP)
    else:
        shutil.copyfile(TARGET, BACKUP)
        report.append("BACKUP -> " + os.path.basename(BACKUP))

    with open(TARGET, "wb") as f:
        f.write(out)

    with open(TARGET, "rb") as f:
        v = f.read()
    crlf1 = v.count(b"\r\n")
    lf1 = v.count(b"\n")
    report.append("AFTER : CRLF=%d LF-only=%d" % (crlf1, lf1 - crlf1))
    report.append("postIvChat count=%d (期望0)" % v.count(b"postIvChat"))
    report.append("callAI('interview' count=%d (期望>=1)" % v.count(b"callAI('interview'"))
    report.append("placeholder 面试官：… count=%d (期望>=2)" % v.count("面试官：…".encode("utf-8")))
    report.append("ivCanStream count=%d" % v.count(b"ivCanStream"))
    print("\n".join(report))


if __name__ == "__main__":
    main()
