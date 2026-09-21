# -*- coding: utf-8 -*-
"""
R88-M5 patch step2 · 接线
  1) chatBodyHtml() 的 4 处 chatLocalHtml(...) → m5PanelHtml()（本机管理区）
     并在前面加管理区小标题
  2) paintChat() 末尾调用 m5Bind(box) 绑定 M5 事件
二进制读写保 CRLF。
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
js_before = len(js)
check_eol(js, "before")

# --- 1) 4 处 chatLocalHtml 调用 → m5PanelHtml ---
pairs = [
    ("        chatLocalHtml('本机记录', '离线');",
     "        m5PanelHtml();"),
    ("        '</div>' + chatLocalHtml('本机记录', '离线兜底');",
     "        '</div>' + m5PanelHtml();"),
    ("        '</div>' + chatLocalHtml('本机记录', '离线兜底');",
     None),  # 占位（下面单独处理非唯一项）
]
# 注意：'离线兜底' 那行出现两次（err 分支 return 与 空分支 return），需分别用更大上下文替换
# err 分支：
anchor_err = B(
    "        '<button type=\"button\" class=\"xtp-retry-btn\" id=\"xtpChatRetry\">重试</button>' +" + NL +
    "        '</div>' + chatLocalHtml('本机记录', '离线兜底');"
)
repl_err = B(
    "        '<button type=\"button\" class=\"xtp-retry-btn\" id=\"xtpChatRetry\">重试</button>' +" + NL +
    "        '</div>' + m5PanelHtml();"
)
js = replace_once(js, anchor_err, repl_err, "err-branch")

# 空分支：
anchor_empty = B(
    "        '<div class=\"xtp-chat-state-d\">在 AI 问答页对话后会自动出现在这里</div></div>' +" + NL +
    "        chatLocalHtml('本机记录', '离线兜底');"
)
repl_empty = B(
    "        '<div class=\"xtp-chat-state-d\">在 AI 问答页对话后会自动出现在这里</div></div>' +" + NL +
    "        m5PanelHtml();"
)
js = replace_once(js, anchor_empty, repl_empty, "empty-branch")

# 有数据分支：
anchor_ok = B("    return chatServerHtml() + chatLocalHtml('本机记录', '离线兜底');")
repl_ok = B("    return chatServerHtml() + m5PanelHtml();")
js = replace_once(js, anchor_ok, repl_ok, "ok-branch")

# guest 分支：
anchor_guest = B(
    "        '<div class=\"xtp-chat-state-d\">在 AI 问答页的对话会在登录后同步到本页</div></div>' +" + NL +
    "        chatLocalHtml('本机记录', '离线');"
)
repl_guest = B(
    "        '<div class=\"xtp-chat-state-d\">在 AI 问答页的对话会在登录后同步到本页</div></div>' +" + NL +
    "        m5PanelHtml();"
)
js = replace_once(js, anchor_guest, repl_guest, "guest-branch")

# --- 2) paintChat 末尾绑定 M5 事件 ---
anchor_paint = B(
    "  function paintChat(box) {" + NL +
    "    box.innerHTML = chatBodyHtml();" + NL +
    "    var retry = box.querySelector('#xtpChatRetry');"
)
repl_paint = B(
    "  function paintChat(box) {" + NL +
    "    box.innerHTML = chatBodyHtml();" + NL +
    "    m5Bind(box);" + NL +
    "    var retry = box.querySelector('#xtpChatRetry');"
)
js = replace_once(js, anchor_paint, repl_paint, "paint-bind")

check_eol(js, "after")
save(JS, js)
print("STEP2 wire-up OK  bytes " + str(js_before) + " -> " + str(len(js)))
