# -*- coding: utf-8 -*-
# R73c 阶段一服务端：远端 .env 原位追加 SMTP 段（不覆盖既有内容）
import re, subprocess, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# 从 upload_v23.ps1 正则提取凭据（不打印明文）
src = open(r"D:\下载的文件\学习工作台\upload_v23.ps1", encoding="utf-8").read()
m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
PASS, HOST = m.group(1), m.group(2)
HK = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
PLINK = r"D:\下载的文件\学习工作台\tools\plink.exe"

# 远端 python3 heredoc：读 .env -> 缺则追加 -> 回读验证（不回显密钥值）
remote_py = r'''
import io, os
p = "/opt/study-workbench/server/.env"
raw = io.open(p, "rb").read()
if b"SMTP_HOST" in raw:
    print("ALREADY-SET")
else:
    block = ("\n# ---- SMTP (R73 bind) ----\n"
             "SMTP_HOST=smtp.qq.com\n"
             "SMTP_PORT=465\n"
             "SMTP_USER=2903163626@qq.com\n"
             "SMTP_PASS=<REDACTED-SMTP-AUTHCODE>\n"
             "SMTP_FROM=2903163626@qq.com\n").encode()
    io.open(p, "wb").write(raw + block)
    print("APPENDED")
raw2 = io.open(p, "rb").read()
keys = [ln.split(b"=")[0].decode() for ln in raw2.splitlines() if b"=" in ln and not ln.strip().startswith(b"#")]
print("KEYS:", ",".join(k for k in keys if k.startswith("SMTP")))
print("TOTAL_BYTES:", len(raw2))
'''

cmd = [PLINK, "-batch", "-ssh", "root@" + HOST, "-pw", PASS, "-hostkey", HK,
       "python3 - <<'PYEOF'" + remote_py + "\nPYEOF"]
r = subprocess.run(cmd, capture_output=True, timeout=60)
out = r.stdout.decode('utf-8', 'replace')
err = r.stderr.decode('utf-8', 'replace')
print("rc=%d" % r.returncode)
print(out)
if err.strip(): print("ERR:", err[:400])
