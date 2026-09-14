# -*- coding: utf-8 -*-
"""20260914d 预埋：远端 server/.env **幂等追加** ADMIN_USERNAME=管理员。

背景：生产 .env 未写 ADMIN_USERNAME，账号名靠 config.py:20 的默认值回落。
写死这一行可避免日后默认值变更导致管理员账号漂移。

铁律遵守：
  - **严禁覆盖整个 .env**：读取原文 → 仅在末尾追加一行 → 原样写回；
  - 改前先 `cp -a` 备份为 .env.bak-20260914d；
  - 先 grep 判断：已存在则不追加（幂等），只报告现状；
  - 中文值经 plink 通道不可靠，故**用 base64 投递 python3 脚本**在远端以 UTF-8 落盘，
    全程不经过 shell 转义。

不重启服务（本批是纯前端批次，此行为预埋，下次重启才生效）。
"""
import base64
import os
import re
import subprocess

ROOT = os.environ.get("SW_ROOT", r"D:\下载的文件\学习工作台")
CRED = os.path.join(ROOT, "upload_v23.ps1")
PLINK = os.path.join(ROOT, "tools", "plink.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
OUT = os.path.join(ROOT, "tools", "qa", "_r44c_env_username_out.txt")

ENV_PATH = "/opt/study-workbench/server/.env"
ENV_KEY = "ADMIN_USERNAME"
ENV_VALUE = "管理员"

# 远端执行脚本（中文用 \uXXXX，避开 plink 通道编码问题）
REMOTE_PY = r'''
import hashlib
import re
import shutil

P = "/opt/study-workbench/server/.env"
BAK = P + ".bak-20260914d"
KEY = "ADMIN_USERNAME"
VAL = "\u7ba1\u7406\u5458"

def md5(p):
    with open(p, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()

before_md5 = md5(P)
with open(P, "r", encoding="utf-8") as f:
    text = f.read()
lines = text.splitlines()
before_lines = len(lines)
before_keys = [re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=", l).group(1)
               for l in lines if re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", l)]

hit = [l for l in lines if l.startswith(KEY + "=")]
print("BEFORE_LINES:" + str(before_lines))
print("BEFORE_KEYS:" + ",".join(before_keys))
print("BEFORE_MD5:" + before_md5)

shutil.copy2(P, BAK)
print("ENV_BACKUP:OK")

if hit:
    print("ENV_ACTION:" + ("EXISTS_SAME" if hit[0] == KEY + "=" + VAL else "EXISTS_DIFF"))
    print("ENV_EXISTING_VALUE:" + hit[0].split("=", 1)[1])
    new_text = text
else:
    tail = "\n" if (text and not text.endswith("\n")) else ""
    new_text = text + tail + KEY + "=" + VAL + "\n"
    with open(P, "w", encoding="utf-8", newline="") as f:
        f.write(new_text)
    print("ENV_ACTION:APPENDED")

# 回读校验
with open(P, "r", encoding="utf-8") as f:
    t2 = f.read()
l2 = t2.splitlines()
print("AFTER_LINES:" + str(len(l2)))
k2 = [re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=", l).group(1)
      for l in l2 if re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", l)]
print("AFTER_KEYS:" + ",".join(k2))
print("AFTER_MD5:" + md5(P))
h2 = [l for l in l2 if l.startswith(KEY + "=")]
print("AFTER_KEY_COUNT:" + str(len(h2)))
print("AFTER_VALUE_OK:" + ("1" if h2 and h2[0] == KEY + "=" + VAL else "0"))
print("AFTER_VALUE:" + (h2[0].split("=", 1)[1] if h2 else "NONE"))
# 原有键是否一个不少
lost = [k for k in before_keys if k not in k2]
print("LOST_KEYS:" + (",".join(lost) if lost else "NONE"))
print("ADDED_LINES:" + str(len(l2) - before_lines))
print("ENV_DONE:1")
'''

REMOTE = "echo " + base64.b64encode(REMOTE_PY.encode("utf-8")).decode("ascii") + " | base64 -d | python3 -\n"


def load_credentials():
    s = open(CRED, encoding="utf-8", errors="replace").read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
    if not m:
        raise SystemExit("无法解析凭据: " + CRED)
    return m.group(2), m.group(1)


def probe(tag, text):
    m = re.search(r"^" + re.escape(tag) + r":(.*)$", text, re.M)
    return m.group(1).strip() if m else ""


def main():
    host, pwd = load_credentials()
    r = subprocess.run([PLINK, "-pw", pwd, "-batch", "-hostkey", HOSTKEY,
                        "root@" + host, REMOTE],
                       capture_output=True, timeout=180)
    out = r.stdout.decode("utf-8", "replace")
    err = r.stderr.decode("utf-8", "replace")
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("rc=%s\n" % r.returncode)
        f.write(out)
        f.write("\n---STDERR---\n" + err)
    print("rc=%s -> %s" % (r.returncode, OUT))
    print(out)

    fatal = []
    action = probe("ENV_ACTION", out)
    if action not in ("APPENDED", "EXISTS_SAME"):
        fatal.append("ENV_ACTION=%s（期望 APPENDED 或 EXISTS_SAME）" % (action or "NONE"))
    if probe("ENV_BACKUP", out) != "OK":
        fatal.append(".env 备份失败")
    if probe("AFTER_KEY_COUNT", out) != "1":
        fatal.append("追加后 ^ADMIN_USERNAME= 行数=%s（期望 1，重复追加？）"
                     % (probe("AFTER_KEY_COUNT", out) or "NONE"))
    if probe("AFTER_VALUE_OK", out) != "1":
        fatal.append("回读值不等于「管理员」（AFTER_VALUE=%s），中文编码可能出错"
                     % (probe("AFTER_VALUE", out) or "NONE"))
    if probe("LOST_KEYS", out) not in ("NONE", ""):
        fatal.append("原有键丢失：%s（.env 被破坏！）" % probe("LOST_KEYS", out))
    if probe("ENV_DONE", out) != "1":
        fatal.append("远端脚本未跑完")
    added = probe("ADDED_LINES", out)
    if added not in ("0", "1"):
        fatal.append("文件行数变化 %s 行（期望 0 或 1，说明不是最小追加）" % added)

    print("=" * 56)
    print("ADMIN_USERNAME 预埋结果：action=%s，追加行数=%s，备份=%s"
          % (action, added, probe("ENV_BACKUP", out)))
    print("改动前 %s 行 / %s 个键 -> 改动后 %s 行 / %s 个键；丢失键=%s"
          % (probe("BEFORE_LINES", out), len(probe("BEFORE_KEYS", out).split(",")),
             probe("AFTER_LINES", out), len(probe("AFTER_KEYS", out).split(",")),
             probe("LOST_KEYS", out)))
    print("回读：%s=%s（UTF-8 正确=%s）"
          % (ENV_KEY, probe("AFTER_VALUE", out), probe("AFTER_VALUE_OK", out)))
    if fatal:
        print("FATAL：")
        for m in fatal:
            print("  - " + m)
        raise SystemExit("ADMIN_USERNAME 预埋失败")
    print("全部断言通过（未重启服务，属预埋，下次重启生效）")
    print("=" * 56)


if __name__ == "__main__":
    main()
