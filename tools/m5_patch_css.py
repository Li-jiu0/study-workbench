# -*- coding: utf-8 -*-
"""R88-M5 patch · CSS：追加 AI 对话记录管理样式到 assets/xt-profile.css 末尾（CRLF）。"""
import os

BASE = r"D:\下载的文件\学习工作台"
CSS = os.path.join(BASE, "assets", "xt-profile.css")


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


NL = "\r\n"

css = load(CSS)
before = len(css)
check_eol(css, "before")
assert before == 33569, "unexpected size " + str(before)

M5_CSS = r"""
/* ============================================================ R88-M5
   个人资料页「AI 对话记录管理」：工具条 / 列表卡 / 多选 / 标签 / 动作条。
   仅本页；固定值，禁用 clamp/min/max。 */
.xtp-m5-tools { padding: 10px 12px 2px; }
.xtp-m5-search {
  display: flex; align-items: center; gap: 6px;
  border: 1px solid var(--xtp-line); border-radius: 8px;
  padding: 8px 10px; background: var(--xtp-card);
}
.xtp-m5-search > input {
  flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  color: var(--xtp-text); font-size: 14px; line-height: 1.4;
}
.xtp-m5-sclear {
  flex: none; width: 20px; height: 20px; line-height: 18px; text-align: center;
  border: none; border-radius: 50%; background: var(--xtp-chip); color: var(--xtp-sub);
  font-size: 14px; cursor: pointer; padding: 0;
}
.xtp-m5-filters { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.xtp-m5-select {
  border: 1px solid var(--xtp-line); border-radius: 8px; background: var(--xtp-card);
  color: var(--xtp-text); font-size: 12px; line-height: 1.2; padding: 7px 8px; max-width: 48%;
}
.xtp-m5-toggle {
  display: inline-flex; align-items: center; gap: 4px;
  border: 1px solid var(--xtp-line); border-radius: 8px; background: transparent;
  color: var(--xtp-sub); font-size: 12px; line-height: 1; padding: 8px 10px;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
.xtp-m5-toggle.on { background: var(--xtp-brand-8); border-color: var(--xtp-brand); color: var(--xtp-brand-ink); }
.xtp-m5-custom { display: flex; align-items: center; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
.xtp-m5-custom label { font-size: 12px; color: var(--xtp-sub); display: inline-flex; align-items: center; gap: 4px; }
.xtp-m5-custom input[type="date"] {
  border: 1px solid var(--xtp-line); border-radius: 8px; background: var(--xtp-card);
  color: var(--xtp-text); font-size: 12px; padding: 6px 8px;
}
.xtp-m5-actions, .xtp-m5-batch {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 14px 12px 18px;
}
.xtp-m5-batch { justify-content: space-between; }
.xtp-m5-abtn {
  display: inline-flex; align-items: center; gap: 4px;
  flex: 1; justify-content: center; min-height: 38px; padding: 0 12px;
  border: 1px solid var(--xtp-line); border-radius: 8px; background: transparent;
  color: var(--xtp-text); font-size: 13px; cursor: pointer;
  -webkit-tap-highlight-color: transparent; white-space: nowrap;
}
.xtp-m5-abtn:active { background: var(--xtp-press); }
.xtp-m5-abtn.danger { color: var(--xtp-danger); border-color: var(--xtp-danger); }
.xtp-m5-abtn[disabled] { opacity: .45; pointer-events: none; }
.xtp-m5-selcnt { font-size: 13px; color: var(--xtp-sub); white-space: nowrap; }
.xtp-m5-batch .xtp-m5-abtn { flex: none; }
.xtp-m5-card { display: flex; align-items: flex-start; gap: 8px; }
.xtp-m5-body { flex: 1; min-width: 0; }
.xtp-m5-check { flex: none; display: inline-flex; align-items: center; padding-top: 2px; }
.xtp-m5-check input { width: 18px; height: 18px; }
.xtp-m5-cnt {
  margin-left: 8px; font-size: 11px; line-height: 1.4; color: var(--xtp-aux);
  padding: 1px 6px; border-radius: 999px; background: var(--xtp-chip);
}
.xtp-m5-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.xtp-m5-tag {
  font-size: 11px; line-height: 1.3; padding: 2px 8px; border-radius: 999px;
  background: var(--xtp-brand-8); color: var(--xtp-brand-ink);
}
.xtp-m5-ops { flex: none; display: flex; flex-direction: column; gap: 4px; }
.xtp-m5-icon {
  width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: 8px; background: transparent; color: var(--xtp-sub);
  cursor: pointer; -webkit-tap-highlight-color: transparent; padding: 0;
}
.xtp-m5-icon:active { background: var(--xtp-press); }
.xtp-m5-icon.on { color: #E8A33D; }
.xtp-m5-icon.danger { color: var(--xtp-danger); }
"""

# 转 CRLF
M5_CSS_CRLF = M5_CSS.replace("\r\n", "\n").replace("\n", NL)

# 追加到文件末尾（保留原末行换行）
css2 = css + B(M5_CSS_CRLF)
check_eol(css2, "after")
save(CSS, css2)
print("CSS appended bytes " + str(before) + " -> " + str(len(css2)))
