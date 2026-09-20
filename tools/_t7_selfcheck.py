# -*- coding: utf-8 -*-
"""任务七 自检：配对校验 / 禁用语法 / 原生弹窗 / 顶层全局冲突 / 换行符"""
import io, os, re

ROOT = r"D:\下载的文件\学习工作台"
OUT = r"C:\Users\ATM\_t7_selfcheck_out.txt"

rep = []


def log(s=""):
    rep.append(s)


def read(p):
    with io.open(p, "r", encoding="utf-8", newline="") as f:
        return f.read()


TARGETS = ["关于.html", "学习工作台.html"]

log("=== 0. 换行符 ===")
for t in TARGETS + ["assets/app.js"]:
    s = read(os.path.join(ROOT, t))
    crlf = s.count("\r\n")
    lf_only = s.count("\n") - crlf
    log("  %-22s CRLF=%d  裸LF=%d  -> %s" % (t, crlf, lf_only, "OK(全CRLF)" if lf_only == 0 else "!! 有裸LF"))

log("")
log("=== 1. HTML 配对校验（剔除 script/style 后） ===")
for t in TARGETS:
    s = read(os.path.join(ROOT, t))
    body = re.sub(r"<script[\s\S]*?</script>", "", s, flags=re.I)
    body = re.sub(r"<style[\s\S]*?</style>", "", body, flags=re.I)
    c_open = len(re.findall(r"<!--", body))
    c_close = len(re.findall(r"-->", body))
    d_open = len(re.findall(r"<div\b", body))
    d_close = len(re.findall(r"</div>", body))
    log("  %s : '<!--'=%d '-->'=%d | '<div'=%d '</div>'=%d  -> %s"
        % (t, c_open, c_close, d_open, d_close, "OK" if (c_open == c_close and d_open == d_close) else "!! 不配对"))

log("")
log("=== 2. 禁用语法（老 WebView 致命） ===")
BAN = [
    ("可选链 ?.", r"\?\."),
    ("空值合并 ??", r"\?\?"),
    (".replaceAll(", r"\.replaceAll\s*\("),
    ("Object.fromEntries", r"Object\.fromEntries"),
    (".at(", r"\.at\s*\("),
    ("正则后行断言 (?<=", r"\(\?<="),
    ("正则后行断言 (?<!", r"\(\?<!"),
]
FILES = ["assets/app.js", "关于.html", "学习工作台.html"]
for f in FILES:
    s = read(os.path.join(ROOT, f))
    if f.endswith(".html"):
        # 只看内联 script
        parts = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>", s, flags=re.I)
        s = "\n".join(parts)
    hits = []
    for name, pat in BAN:
        n = len(re.findall(pat, s))
        if n:
            hits.append("%s x%d" % (name, n))
    log("  %-22s -> %s" % (f, ("命中: " + ", ".join(hits)) if hits else "0 命中 OK"))

log("")
log("=== 3. 原生 alert/confirm/prompt ===")
for f in FILES:
    s = read(os.path.join(ROOT, f))
    if f.endswith(".html"):
        parts = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>", s, flags=re.I)
        s = "\n".join(parts)
    n = len(re.findall(r"(?<![A-Za-z0-9_.$])(alert|confirm|prompt)\s*\(", s))
    log("  %-22s -> %d" % (f, n))

log("")
log("=== 4. 新增全局名是否与其它 assets/*.js 冲突 ===")
NEW_NAMES = ["AI_PARTNER_ID_ALIAS", "XT_AI_MODEL_KEY", "XT_AI_HISTORY_KEY",
             "xtHomeChatId", "getSharedAiModelId", "setSharedAiModelId", "xtAiBuiltinModels",
             "getSharedAiModelName", "syncHomeChatToShared", "loadHomeChatFromShared",
             "removeHomeChatFromShared", "aiPartnerIconHtml", "aiBaseReady", "aiStreamCapable",
             "aiStatusText", "ensureAiModelPicker", "renderAiModelList", "aiModelRow",
             "openAiModelPicker", "closeAiModelPicker", "selectAiModel", "ensureAiCardCss",
             "ensureAiQuickBar", "openFullAiPage", "normalizeAiPartnerId", "migrateAiPartnerId",
             "aiDispatchReply", "buildAiBaseMessages", "fetchAssistantReply", "aiDegradeReply",
             "copyAiText", "regenerateAiLast", "showAboutDialog"]
assets = [f for f in os.listdir(os.path.join(ROOT, "assets"))
          if f.endswith(".js") and "bak" not in f.lower() and "backup" not in f.lower()]
for nm in NEW_NAMES:
    where = []
    for a in assets:
        s = read(os.path.join(ROOT, "assets", a))
        if re.search(r"(?:^|[\s;{(=,])" + nm + r"\s*(?:=|\()", s):
            where.append(a)
        elif re.search(r"function\s+" + nm + r"\b", s):
            where.append(a)
        elif re.search(r"(?:var|let|const)\s+" + nm + r"\b", s):
            where.append(a)
    log("  %-24s -> %s" % (nm, ",".join(where) if where else "(未在任何 assets js 中声明)"))

log("")
log("=== 5. 关键改动落地确认 ===")
app = read(os.path.join(ROOT, "assets/app.js"))
home = read(os.path.join(ROOT, "学习工作台.html"))
about = read(os.path.join(ROOT, "关于.html"))
checks = [
    ("app.js AI_PARTNERS 首项 id=assistant", "id: 'assistant', name: '小助手', icon: 'sparkles'" in app),
    ("app.js 旧 id 兼容映射 gongkao->assistant", "gongkao: 'assistant'" in app),
    ("app.js 保留暖心学伴", "id: 'warm', name: '暖心学伴'" in app),
    ("app.js 主路径走 window.callAI", "await window.callAI('auto', buildAiBaseMessages(), opts)" in app),
    ("app.js 保留 demoStyle 兜底", "typeof p.demoStyle === 'function'" in app),
    ("app.js 保留 localAiReply 兜底", "localAiReply(text);          // 本地兜底" in app),
    ("app.js 卡片副标题不再有本地演示模式", "本地演示模式 · 历史已保存" not in app),
    ("app.js 共享模型 key = ai_selected_model", "'ai_selected_model'" in app),
    ("app.js 共享历史 key = ai_chat_history", "'ai_chat_history'" in app),
    ("app.js 流式能力守卫", "function aiStreamCapable()" in app),
    ("app.js showAbout 跳转独立页", "location.href = '关于.html';" in app),
    ("app.js 保留旧弹窗兜底 showAboutDialog", "window.showAboutDialog = showAboutDialog;" in app),
    ("首页 底部更多面板 关于 -> 跳转", "location.href='关于.html'" in home),
    ("首页 aiSubtitle 改为已接入 AI", "已接入 AI · 模型：自动（推荐）" in home),
    ("关于页 含版本号 v2.2", ">v2.2<" in about),
    ("关于页 保留 #countdownModal", 'id="countdownModal"' in about),
    ("关于页 保留 #toast", 'id="toast"' in about),
    ("关于页 保留 #aiFab", 'id="aiFab"' in about),
    ("关于页 保留 #aiPanel", 'id="aiPanel"' in about),
    ("关于页 保留 #morePanel", 'id="morePanel"' in about),
    ("关于页 保留 #toolsPanel", 'id="toolsPanel"' in about),
    ("关于页 保留 .more-overlay", 'class="more-overlay"' in about),
    ("关于页 底部导航顺序 首页→互动→我的→AI→更多",
     re.search(r"bn-label\">首页[\s\S]*?bn-label\">互动[\s\S]*?bn-label\">我的[\s\S]*?bn-label\">AI[\s\S]*?bn-label\">更多", about) is not None),
    ("关于页 无 showAbout 死链", "showAbout()" not in about),
]
for name, ok in checks:
    log("  [%s] %s" % ("OK " if ok else "FAIL", name))

with io.open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(rep))
print("DONE")
