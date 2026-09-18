# -*- coding: utf-8 -*-
"""r86j —— 文案替换：好友 -> 通讯录 / 加好友 -> 添加好友（幂等，二进制保 CRLF）

规则 A：侧边栏 nav-item（onclick 含 gotoChat()）—— title 与可见标签
规则 B：所有「加好友」->「添加好友」（负向断言排除已有的「添加好友」）
规则 C：底部导航 / 更多面板 / 工具面板中 gotoChat 可见标签「好友」->「通讯录」

用法： python r86j_replace.py --dry     （只预览）
       python r86j_replace.py --apply   （落盘）
"""
import os
import re
import sys

ROOT = r"D:\下载的文件\学习工作台"
LOG = os.path.join(ROOT, "tools", "r86j_changes.txt")

NEW_TITLE = "通讯录 · 添加好友（需在线模式）"

# ---- 规则 A：nav-item（含 gotoChat）--------------------------------------
NAV_ITEM_RE = re.compile(
    r'(<div\s+class="nav-item"[^>]*onclick="gotoChat\(\)"[^>]*>)'   # 1 开标签
    r'(.{0,500}?)'                                                   # 2 中间（图标等）
    r'(<span[^>]*>\s*)好友(\s*</span>)',                              # 3/4 可见标签
    re.S,
)
TITLE_RE = re.compile(r'title="[^"]*"')

# ---- 规则 B：加好友 -> 添加好友（排除「添加好友」）------------------------
ADD_FRIEND_RE = re.compile(r"(?<!添)加好友")

# ---- 规则 C：工具面板里 gotoChat 的可见标签 -------------------------------
# 形如 <button class="st-quick-it" ... onclick="gotoChat()" ...>…</span>好友私信</button>
QUICK_TOOL_RE = re.compile(
    r'(<button[^>]*class="st-quick-it"[^>]*onclick="gotoChat\(\)"[^>]*>.*?)'
    r'好友私信'
    r'(</button>)',
    re.S,
)


def decode(raw: bytes) -> str:
    return raw.decode("utf-8")


def encode(text: str) -> bytes:
    return text.encode("utf-8")


def apply_rule_a(text: str, name: str, log: list) -> str:
    def _fix(m: re.Match) -> str:
        tag, mid, s1, s2 = m.group(1), m.group(2), m.group(3), m.group(4)
        new_tag, n_title = TITLE_RE.subn('title="%s"' % NEW_TITLE, tag)
        old_title = TITLE_RE.search(tag)
        old_title = old_title.group(0) if old_title else "(无 title)"
        log.append((name, "A", "侧栏 nav-item", old_title + " / <span>好友</span>",
                    'title="%s" / <span>通讯录</span>' % NEW_TITLE))
        return new_tag + mid + s1 + "通讯录" + s2

    return NAV_ITEM_RE.sub(_fix, text)


def apply_rule_b(text: str, name: str, log: list) -> str:
    def _fix(m: re.Match) -> str:
        log.append((name, "B", "加好友", m.group(0), "添加好友"))
        return "添加好友"

    return ADD_FRIEND_RE.sub(_fix, text)


def apply_rule_c(text: str, name: str, log: list) -> str:
    def _fix(m: re.Match) -> str:
        log.append((name, "C", "工具面板 gotoChat 标签", "好友私信", "通讯录私信"))
        return m.group(1) + "通讯录私信" + m.group(2)

    return QUICK_TOOL_RE.sub(_fix, text)


def main() -> int:
    apply = "--apply" in sys.argv
    htmls = sorted(
        f for f in os.listdir(ROOT)
        if f.lower().endswith(".html") and os.path.isfile(os.path.join(ROOT, f))
    )

    log = []
    per_file = {}
    for name in htmls:
        path = os.path.join(ROOT, name)
        with open(path, "rb") as fh:
            raw = fh.read()
        text = decode(raw)
        before = text

        text = apply_rule_a(text, name, log)
        text = apply_rule_b(text, name, log)
        text = apply_rule_c(text, name, log)

        if text == before:
            continue
        per_file[name] = len(log) - sum(per_file.values()) if False else None

        new_raw = encode(text)
        # 断言：除替换片段外字节完全一致（CRLF / BOM 不受影响）
        assert new_raw.count(b"\r\n") == raw.count(b"\r\n"), "CRLF 数量变化! " + name
        if apply:
            with open(path, "wb") as fh:
                fh.write(new_raw)

    # 统计每文件改动数
    counts = {}
    for name, rule, _kind, _o, _n in log:
        counts[name] = counts.get(name, 0) + 1
    for name in per_file:
        per_file[name] = counts.get(name, 0)

    lines = []
    lines.append("MODE = %s" % ("APPLY" if apply else "DRY-RUN"))
    lines.append("改动文件数 = %d ；改动总数 = %d" % (len(per_file), len(log)))
    lines.append("")
    for name in sorted(per_file, key=lambda x: (-per_file[x], x)):
        lines.append("  %-22s %d 处" % (name, per_file[name]))
    lines.append("")
    lines.append("### 逐条明细")
    for name, rule, kind, old, new in log:
        o = old if len(old) <= 90 else old[:90] + "…"
        lines.append("  [规则%s] %-22s %-22s %s  ->  %s" % (rule, name, kind, o, new))

    with open(LOG, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    print("\n".join(lines[:40]))
    print("...\nWROTE", LOG)
    return 0


if __name__ == "__main__":
    sys.exit(main())
