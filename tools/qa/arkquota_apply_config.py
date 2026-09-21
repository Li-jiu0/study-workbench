"""一次性配置改动：.gitignore 精确放行两张配置表 + .env 追加 ADMIN_TOKEN。

二进制读 -> 替换 -> 二进制写，保留原文件行尾（server/.env 是 LF，.gitignore 需探测）。
"""
from pathlib import Path

ROOT = Path(r"D:\下载的文件\学习工作台")
GITIGNORE = ROOT / ".gitignore"
ENV = ROOT / "server" / ".env"

ADMIN_TOKEN = "<REDACTED-ADMIN-TOKEN>"

OLD_IGNORE = "server/data/\n"
NEW_IGNORE = (
    "server/data/*\n"
    "!server/data/model_quota.json\n"
    "!server/data/model_registry.json\n"
)


def read_text(path: Path) -> tuple:
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "utf-8", "gbk"):
        try:
            return raw.decode(enc), enc
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "ignore"), "utf-8(ignore)"


def write_text(path: Path, text: str) -> None:
    path.write_bytes(text.encode("utf-8"))


def patch_gitignore() -> None:
    text, enc = read_text(GITIGNORE)
    print(f"[INFO] .gitignore 编码={enc}")
    # 原文件是 CRLF：先归一成 \n 匹配，写完再整体转回 CRLF
    crlf = "\r\n" in text
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    count = text.count(OLD_IGNORE)
    if NEW_IGNORE in text:
        print("[SKIP] .gitignore 已改过")
        return
    if count != 1:
        print(f"[FAIL] 期望 1 处 'server/data/'，实际 {count} 处，需人工确认")
        return
    text = text.replace(OLD_IGNORE, NEW_IGNORE, 1)
    # 显式把运行时账本钉死在忽略名单里（理由写清楚，防止后人误提交）
    marker = "# 用量账本（运行时累计，服务器上的才是真实数据）\n"
    if "server/data/model_usage.json" not in text:
        anchor = NEW_IGNORE
        text = text.replace(
            anchor,
            anchor
            + "\n"
            + "# ===== 2026-09-18：服务端用量账本（多用户累计，绝不能随部署覆盖）=====\n"
            + "# model_usage.json 是运行时累计账本：服务器上的才是真实用量，\n"
            + "# 一旦入库，下次部署会把真实用量覆盖成 0 -> 所有人用量归零 -> 直接超量欠费。\n"
            + "# 注意：model_quota.json / model_registry.json 是配置，必须入库（见上方 ! 放行）。\n"
            + marker
            + "server/data/model_usage.json\n",
            1,
        )
    if crlf:
        text = text.replace("\n", "\r\n")
    write_text(GITIGNORE, text)
    print("[OK] .gitignore 已改：server/data/ -> server/data/* + 两张配置表 ! 放行 + 账本忽略")


def patch_env() -> None:
    text, enc = read_text(ENV)
    print(f"[INFO] .env 编码={enc} 行尾={'CRLF' if chr(13) + chr(10) in text else 'LF'}")
    if "ADMIN_TOKEN=" in text:
        print("[SKIP] .env 已有 ADMIN_TOKEN")
        return
    eol = "\r\n" if "\r\n" in text else "\n"
    if not text.endswith(("\n", "\r")):
        text += eol
    text += (
        eol
        + "# ---- 用量账本管理接口保护：POST /api/ai/usage/reset 需带 X-Admin-Token ----"
        + eol
        + f"ADMIN_TOKEN={ADMIN_TOKEN}"
        + eol
    )
    write_text(ENV, text)
    print(f"[OK] .env 已追加 ADMIN_TOKEN（前 4 位：{ADMIN_TOKEN[:4]}****）")


if __name__ == "__main__":
    patch_gitignore()
    patch_env()
