# -*- coding: utf-8 -*-
# R73c SMTP 阶段一：本地 .env 追加 SMTP 段 + 真实发信测试
import io, sys, smtplib, socket
from email.header import Header
from email.mime.text import MIMEText
from email.utils import formataddr
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ENV = r"D:\下载的文件\学习工作台\server\.env"
SMTP_HOST = "smtp.qq.com"
SMTP_PORT = 465
SMTP_USER = "2903163626@qq.com"
SMTP_PASS = "sjkakkzfwvyfdecj"

# 1) .env 追加（先查重）
with io.open(ENV, 'rb') as f:
    raw = f.read()
if b'SMTP_HOST' in raw:
    print("SKIP: .env 已含 SMTP 段")
else:
    block = ("\n# ---- 邮箱 SMTP 配置（R73 邮箱绑定：发送验证码）----\n"
             "SMTP_HOST=smtp.qq.com\n"
             "SMTP_PORT=465\n"
             "SMTP_USER=%s\n"
             "SMTP_PASS=%s\n"
             "SMTP_FROM=%s\n" % (SMTP_USER, SMTP_PASS, SMTP_USER)).encode('utf-8')
    with io.open(ENV, 'wb') as f:
        f.write(raw + block)
    print(".env 追加 SMTP 段完成")

# 2) 真实发信测试（QQ SMTP_SSL 465）
msg = MIMEText("【星途】这是一封 SMTP 配置验证测试邮件。你的验证码是 882913，10 分钟内有效。"
               "（若非本人操作请忽略）", "plain", "utf-8")
msg["From"] = formataddr((str(Header("星途", "utf-8")), SMTP_USER))
msg["To"] = SMTP_USER
msg["Subject"] = Header("【星途】SMTP 配置验证 · 验证码 882913", "utf-8")
socket.setdefaulttimeout(15)
try:
    s = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=15)
    code, banner = s.login(SMTP_USER, SMTP_PASS)
    print("login:", code, banner.decode('utf-8', 'replace')[:60])
    s.sendmail(SMTP_USER, [SMTP_USER], msg.as_string())
    s.quit()
    print("SEND OK —— 测试邮件已发至 2903163626@qq.com，请查收（含验证码 882913）")
except Exception as e:
    print("SEND FAIL:", type(e).__name__, str(e)[:300])
