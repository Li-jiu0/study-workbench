# -*- coding: utf-8 -*-
"""2026-09-13d 部署：批次五上线（词库分片 + 资源引用补 ?v= + 全站版本 20260913d）

前端(web/)：
  32 个 HTML 页面（版本 bump 后统一 20260913d；5 个不加载 app.js 的页面维持 a）
  + assets/ 下全部 JS/CSS
  + assets/data/*.json  —— **按目录 glob 自动纳入**（8 个词库分片 + 2 个索引 + 其余数据），
                            旧单文件 vocab-cet4-ext.json 一旦被删除即自动不再打包
  + assets/emoji/manifest.js
  + 根目录 data/mock-papers.js（mock_exam 三页引用）

本批 **server/ 零改动** → 不部署任何 server 文件、不重启 study-workbench 服务
（Nginx 直接读静态目录，tar 解压即生效）。

与 0913c 的差异（逐条，其余安全机制完全一致）：
  1. STAMP / 包名 / 远端包名 / DB 备份名 → 20260913d；
  2. 数据清单 = glob `assets/data/*.json`（原样延续 0913c 的目录枚举方式，显式化并加“分片存在性”自检），
     不再依赖任何写死的旧文件名清单；
  3. 新增 `--dry-run`：只枚举清单 / 计数 / 字节，**不取凭据、不连服务器、不 pscp、不落 tar.gz**；
  4. 凭据读取改为**惰性**（仅真正部署时执行），使 --dry-run 绝不触碰凭据；
  5. **显式排除** `assets/data/vocab-ext-fields-patch.json`（字段补产的中间产物，无引用，不随包上线）；
     干跑清单会单独打印「已排除：…」一行；
  6. 正式部署**前置守卫**：若旧单文件 `vocab-cet4-ext.json` 仍存在则直接停止（应由词库线先删除）；
     干跑清单会明确打印它当前是否仍在包内。

安全机制（与 0913c 一致，全部保留）：
  - 逐文件 MD5 **全量**比对（非抽查）；
  - md5sum 输出解析反转成 `{name: hash}`（勿写 `dict(...)`，会变成 `{hash: name}` → 全部误报 MISMATCH）；
  - SERVER_FILES = []（本批 server 仍零改动）；
  - 中文文件名安全：**只上传单个 ASCII 命名的 tar 包**（`deploy_20260913d.tar.gz`），
    由服务器端 `tar xzf` 落盘，**规避 pscp 的 GBK→UTF-8 中文名错乱**（即 SOP 的“ASCII 中转”要求）。

排除清单：`*.bak-*` / `mock-exam.js.removed` / `*.tar.gz` / `tools/_artifacts/`
（前者由扩展名判定天然排除；`_artifacts/` 不在收集范围）。

用法：
  python tools/deploy_update_20260913d.py --dry-run    # 只列清单，不联网/不部署
  python tools/deploy_update_20260913d.py              # 真正部署（需 SW_HOST/SW_PASS）
"""
import tarfile
import os
import subprocess
import hashlib
import re
import time
import sys
import io

ROOT = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-8d0a1649"
CRED = r"D:\下载的文件\学习工作台\upload_v23.ps1"
STAMP = "20260913f"
TAR_PATH = os.path.join(ROOT, "tools", f"deploy_{STAMP}.tar.gz")
PLINK = os.path.join(ROOT, "tools", "plink.exe")
PSCP = os.path.join(ROOT, "tools", "pscp.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
REMOTE_ROOT = "/opt/study-workbench"
MANIFEST_PATH = os.path.join(ROOT, "tools", "qa", "_deploy_0913d_manifest.txt")

# server/ 本批零改动 → 空列表
SERVER_FILES = []

ASSET_EXTS = {".js", ".css"}
MOCK_REL = "data/mock-papers.js"
# 期望存在的 8 个词库分片（存在性自检用；缺任一即如实标注“待生成”）
EXPECTED_SHARDS = [
    "vocab-cet4-ext-a-c.json", "vocab-cet4-ext-d-f.json", "vocab-cet4-ext-g-i.json",
    "vocab-cet4-ext-j-l.json", "vocab-cet4-ext-m-o.json", "vocab-cet4-ext-p-r.json",
    "vocab-cet4-ext-s-u.json", "vocab-cet4-ext-v-z.json",
]
VOCAB_INDEX = "vocab-cet4-ext-index.json"
OLD_VOCAB = "vocab-cet4-ext.json"
# 显式排除：字段补产的中间产物（root/collocation 补字段用，不被任何页面/脚本引用，
# 最终由 team-lead 合并进词库分片）——绝不随包上线，避免远端多一个死文件。
EXCLUDE_DATA_JSON = {"vocab-ext-fields-patch.json"}


# ---------------- 工具函数 ----------------
def md5(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def run(cmd, timeout=420, decode=True):
    r = subprocess.run(cmd, capture_output=True, timeout=timeout)
    out = r.stdout.decode("utf-8", "replace") if decode else r.stdout
    err = r.stderr.decode("utf-8", "replace") if decode else r.stderr
    return r.returncode, out, err


def load_credentials():
    """惰性读取凭据：仅在真正部署时调用；--dry-run 永不触发。"""
    host = os.environ.get("SW_HOST", "")
    pwd = os.environ.get("SW_PASS", "")
    if not host or not pwd:
        s = open(CRED, encoding="utf-8", errors="replace").read()
        m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
        if not m:
            raise SystemExit("请设置 SW_HOST / SW_PASS 或检查凭据文件")
        pwd, host = m.group(1), m.group(2)
    return host, pwd


def plink(remote, host, pwd, timeout=420):
    return run([PLINK, "-pw", pwd, "-batch", "-hostkey", HOSTKEY, f"root@{host}", remote], timeout)


# ---------------- 清单收集 ----------------
def collect():
    """按目录 glob 收集待部署文件（自动容纳词库分片等新增/删除）。"""
    pages = sorted(f for f in os.listdir(ROOT) if f.endswith(".html"))
    assets_dir = os.path.join(ROOT, "assets")
    assets = sorted(f for f in os.listdir(assets_dir)
                    if os.path.splitext(f)[1].lower() in ASSET_EXTS)
    data_dir = os.path.join(assets_dir, "data")
    # glob assets/data/*.json（.bak-* 因扩展名非 .json 天然排除）
    all_json = sorted(f for f in os.listdir(data_dir) if f.endswith(".json"))
    # 显式排除清单（中间产物不随包上线）
    excluded_json = [f for f in all_json if f in EXCLUDE_DATA_JSON]
    datajson = [f for f in all_json if f not in EXCLUDE_DATA_JSON]
    emoji_dir = os.path.join(assets_dir, "emoji")
    emoji = sorted(os.listdir(emoji_dir)) if os.path.isdir(emoji_dir) else []
    mock_abs = os.path.join(ROOT, MOCK_REL.replace("/", os.sep))
    if not os.path.isfile(mock_abs):
        raise SystemExit("缺少 data/mock-papers.js")
    return {
        "pages": pages, "assets": assets, "datajson": datajson,
        "excluded_json": excluded_json,
        "emoji": emoji, "mock_abs": mock_abs, "data_dir": data_dir,
        "assets_dir": assets_dir, "emoji_dir": emoji_dir,
    }


def iter_entries(L):
    """产出 (arcname, abs_path) 序列，供打包与清单共用。"""
    for f in L["pages"]:
        yield "web/" + f, os.path.join(ROOT, f)
    for f in L["assets"]:
        yield "web/assets/" + f, os.path.join(L["assets_dir"], f)
    for f in L["datajson"]:
        yield "web/assets/data/" + f, os.path.join(L["data_dir"], f)
    for f in L["emoji"]:
        yield "web/assets/emoji/" + f, os.path.join(L["emoji_dir"], f)
    yield "web/" + MOCK_REL, L["mock_abs"]


def build_manifest(L):
    entries = list(iter_entries(L))
    src_bytes = sum(os.path.getsize(abs_p) for _, abs_p in entries)
    # 内存打包求 gz 体积（不落盘）
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for arc, abs_p in entries:
            tar.add(abs_p, arcname=arc)
    packed = buf.tell()

    lines = []
    lines.append("# 20260913d 部署清单（--dry-run，本地，未联网）")
    lines.append("STAMP: " + STAMP)
    lines.append("ROOT : " + ROOT)
    lines.append("REMOTE_ROOT: " + REMOTE_ROOT)
    lines.append("")
    lines.append("--- 计数 ---")
    lines.append("HTML 页面            : %d" % len(L["pages"]))
    lines.append("assets JS/CSS        : %d" % len(L["assets"]))
    lines.append("assets/data JSON     : %d" % len(L["datajson"]))
    lines.append("assets/emoji         : %d" % len(L["emoji"]))
    lines.append("data/mock-papers.js  : 1")
    lines.append("合计                  : %d" % len(entries))
    lines.append("")
    lines.append("--- 字节 ---")
    lines.append("源文件总字节          : %d" % src_bytes)
    lines.append("内存打包(gz)字节      : %d" % packed)
    lines.append("")
    lines.append("--- 词库分片存在性自检 ---")
    for name in EXPECTED_SHARDS:
        p = os.path.join(L["data_dir"], name)
        lines.append("  %s : %s" % (name, "存在" if os.path.isfile(p) else "**待生成**"))
    idx_p = os.path.join(L["data_dir"], VOCAB_INDEX)
    lines.append("  %s : %s" % (VOCAB_INDEX, "存在" if os.path.isfile(idx_p) else "**待生成**"))
    old_p = os.path.join(L["data_dir"], OLD_VOCAB)
    if os.path.isfile(old_p):
        lines.append("  旧单文件 %s : **仍在包内**（%d 字节）—— 正式部署前应由词库线删除；"
                     "若部署时仍存在，脚本会停止并报错" % (OLD_VOCAB, os.path.getsize(old_p)))
    else:
        lines.append("  旧单文件 %s : 不在包内（已删除）" % OLD_VOCAB)
    lines.append("")
    lines.append("--- 显式排除 ---")
    if L["excluded_json"]:
        for name in L["excluded_json"]:
            lines.append("  已排除：%s" % name)
    else:
        lines.append("  （无）")
    lines.append("")
    lines.append("--- 清单明细（arcname）---")
    for arc, abs_p in entries:
        lines.append("%9d  %s" % (os.path.getsize(abs_p), arc))
    return "\n".join(lines) + "\n"


# ---------------- 主流程 ----------------
def main():
    dry = "--dry-run" in sys.argv[1:]
    L = collect()

    if dry:
        text = build_manifest(L)
        os.makedirs(os.path.dirname(MANIFEST_PATH), exist_ok=True)
        with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
            f.write(text)
        print(text)
        print("[dry-run] 清单已写 -> " + MANIFEST_PATH)
        return

    # ===== 以下为真正部署（需凭据），--dry-run 不会到达这里 =====
    # 前置守卫：旧单文件仍存在 → 停止（词库线应先「确认无引用后删除」）
    old_p = os.path.join(L["data_dir"], OLD_VOCAB)
    if os.path.isfile(old_p):
        raise SystemExit("停止：旧单文件 vocab-cet4-ext.json 仍存在，请先由词库线删除后再部署。")

    host, pwd = load_credentials()

    total_files = len(L["pages"]) + len(L["assets"]) + len(L["datajson"]) + len(L["emoji"]) + 1
    print(f"[0] 页面 {len(L['pages'])} + assets(js/css) {len(L['assets'])} + data.json {len(L['datajson'])} "
          f"+ emoji {len(L['emoji'])} + mock-papers 1 = {total_files} 个文件")

    # ---------- 1. 打包 ----------
    if os.path.exists(TAR_PATH):
        os.remove(TAR_PATH)
    with tarfile.open(TAR_PATH, "w:gz") as tar:
        for arc, abs_p in iter_entries(L):
            tar.add(abs_p, arcname=arc)
    print(f"[1] 打包完成 {os.path.getsize(TAR_PATH)} bytes -> {os.path.basename(TAR_PATH)}")

    # ---------- 2. 上传（幂等）----------
    tar_md5 = md5(TAR_PATH)
    if os.environ.get("SW_SKIP_UPLOAD") == "1":
        print("[2] SW_SKIP_UPLOAD=1，跳过上传")
    else:
        rc, out, _ = plink(f"md5sum {REMOTE_ROOT}/deploy_{STAMP}.tar.gz 2>/dev/null", host, pwd)
        remote_tar_md5 = (out.split()[0] if out.strip() and len(out.split()[0]) == 32 else "")
        if remote_tar_md5 == tar_md5:
            print("[2] 远端已有同 MD5 包，跳过上传")
        else:
            ok_up = False
            for attempt in range(1, 4):
                rc, out, err = run([PSCP, "-pw", pwd, "-batch", "-hostkey", HOSTKEY, TAR_PATH,
                                    f"root@{host}:{REMOTE_ROOT}/"], timeout=300)
                rc2, out2, _ = plink(f"md5sum {REMOTE_ROOT}/deploy_{STAMP}.tar.gz 2>/dev/null", host, pwd)
                got = (out2.split()[0] if out2.strip() and len(out2.split()[0]) == 32 else "")
                print(f"[2] 上传第 {attempt} 次 rc={rc} 远端MD5={got[:10] or 'NONE'}")
                if got == tar_md5:
                    ok_up = True
                    break
                time.sleep(3)
            if not ok_up:
                raise SystemExit(f"上传失败（3 次）: {(err or '')[-400:]}")

    # ---------- 3. 备份 DB + 解压 + 全量 MD5 ----------
    verify_rel = [arc for arc, _ in iter_entries(L)]
    remote = (
        f"cd {REMOTE_ROOT} || exit 1\n"
        f"mkdir -p backups\n"
        f"cp -a server/data.db backups/data.db.before-{STAMP} 2>/dev/null && echo DB-BACKUP-OK || echo DB-BACKUP-SKIP\n"
        f"tar xzf deploy_{STAMP}.tar.gz -C {REMOTE_ROOT}/ || exit 1\n"
        f"echo '---MD5-BEGIN---'\n"
        f"cd {REMOTE_ROOT}/web && find . -maxdepth 3 -type f "
        f"\\( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.json' \\) -print0 | xargs -0 md5sum\n"
        f"echo '---MD5-END---'\n"
        f"rm -f {REMOTE_ROOT}/deploy_{STAMP}.tar.gz\n"
    )
    rc, out, err = plink(remote, host, pwd)
    if rc != 0 or "---MD5-BEGIN---" not in out:
        print(f"[3][DEBUG] stderr={err[-300:]!r}")
        raise SystemExit(f"远端解压/校验失败 rc={rc}\n{out[-800:]}\n{err[-400:]}")
    block = out.split("---MD5-BEGIN---")[1].split("---MD5-END---")[0]
    remote_map = {}
    for line in block.strip().splitlines():
        parts = line.split(maxsplit=1)
        if len(parts) == 2:
            # 注意：反转成 {name: hash}（勿用 dict(...)，否则键值颠倒 → 全部误报 MISMATCH）
            remote_map[parts[1].strip().lstrip("./")] = parts[0]
    print(f"[3] 远端 MD5 {len(remote_map)} 条；DB 备份: {'OK' if 'DB-BACKUP-OK' in out else 'SKIP'}")

    def to_local(rel):
        r = rel[len("web/"):] if rel.startswith("web/") else rel
        return os.path.join(ROOT, r.replace("/", os.sep))

    bad = []
    for rel in verify_rel:
        key = rel[len("web/"):] if rel.startswith("web/") else rel
        local = md5(to_local(rel))
        rm = remote_map.get(key)
        if rm != local:
            bad.append((rel, local[:10], (rm or "MISSING")[:10]))
    print(f"[3] 全量 MD5 校验: {len(verify_rel) - len(bad)}/{len(verify_rel)} 一致")
    for rel, l, r_ in bad[:20]:
        print(f"     BAD {rel} local={l} remote={r_}")
    if bad:
        raise SystemExit("存在 MD5 不一致，请人工复核（未重启服务）")

    # ---------- 4. 校验四件套（本批不重启）----------
    remote2 = (
        "echo SERVICE:$(systemctl is-active study-workbench)\n"
        "echo SITE:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/)\n"
        "echo HEALTH:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/health)\n"
        "echo NRESTARTS:$(systemctl show -p NRestarts --value study-workbench)\n"
        "cd /opt/study-workbench/server && python3 -c \"\n"
        "import sqlite3\n"
        "c = sqlite3.connect('data.db')\n"
        "print('USERS:', c.execute('select count(*) from users').fetchone()[0])\n"
        "\"\n"
    )
    rc, out2, err2 = plink(remote2, host, pwd)
    print(f"[4] 校验四件套 rc={rc}")
    print(out2)
    if err2.strip():
        print("STDERR:", err2[-400:])


if __name__ == "__main__":
    main()
