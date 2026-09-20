"""邮件发送封装（R73 邮箱绑定）：仅使用 Python 标准库 smtplib + email。

设计要点：
- 不引入任何第三方依赖（requirements.txt 不变）；
- SMTP 配置全部来自 config.py（读 server/.env），代码内不内置任何默认凭据；
- 未配置（缺 SMTP_HOST / SMTP_USER / SMTP_PASS）→ 抛 EmailNotConfigured，
  由路由层转成 503「邮件服务未配置，请联系管理员」，绝不静默假成功；
- 发送异常 → 抛 EmailSendError，由路由层转成 502「验证码发送失败，请稍后重试」；
- 端口 465 走隐式 SSL（SMTP_SSL）；其余端口走明文 + STARTTLS（SMTP_TLS 为真时）。
"""
import smtplib
from email.header import Header
from email.mime.text import MIMEText
from email.utils import formataddr

from config import (SMTP_FROM, SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_TLS,
                    SMTP_USER, smtp_configured)

# 连接 / 发送超时（秒），避免 SMTP 不可达时把请求线程挂死。
_SMTP_TIMEOUT = 10


class EmailNotConfigured(Exception):
    """SMTP 未配置（缺 host / user / pass 之一）。"""


class EmailSendError(Exception):
    """SMTP 发送过程异常（连接 / 认证 / 投递失败）。"""


def _build_message(to_email: str, code: str, purpose: str) -> MIMEText:
    """构造纯文本验证码邮件。purpose 仅用于文案（bind=绑定 / reset=找回）。"""
    action = "找回账号" if purpose == "reset" else "绑定邮箱"
    subject = "【星途】%s验证码" % action
    body = (
        "您好：\n\n"
        "您正在为星途账号进行「%s」操作，验证码如下：\n\n"
        "    %s\n\n"
        "验证码 10 分钟内有效，请勿泄露给他人。若非本人操作，请忽略本邮件。\n\n"
        "—— 星途学习工作台"
    ) % (action, code)
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = Header(subject, "utf-8")
    msg["From"] = formataddr((str(Header("星途", "utf-8")), SMTP_FROM))
    msg["To"] = to_email
    return msg


def send_code_email(to_email: str, code: str, purpose: str = "bind") -> None:
    """发送验证码邮件。

    Args:
        to_email: 收件邮箱（schema 层已规范化为小写去空格）。
        code: 6 位数字验证码明文（仅用于本次投递，不落库）。
        purpose: bind / reset，仅影响邮件文案。

    Raises:
        EmailNotConfigured: SMTP 未配置。
        EmailSendError: 发送失败（网络 / 认证 / 投递异常）。
    """
    if not smtp_configured():
        raise EmailNotConfigured("SMTP 未配置")
    msg = _build_message(to_email, code, purpose)
    try:
        if int(SMTP_PORT) == 465:
            # 465：隐式 SSL（SMTPS），连接即加密
            server = smtplib.SMTP_SSL(SMTP_HOST, int(SMTP_PORT), timeout=_SMTP_TIMEOUT)
        else:
            # 25 / 587 等：先明文连接，再按 SMTP_TLS 升级 STARTTLS
            server = smtplib.SMTP(SMTP_HOST, int(SMTP_PORT), timeout=_SMTP_TIMEOUT)
            server.ehlo()
            if SMTP_TLS:
                server.starttls()
                server.ehlo()
        try:
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_FROM, [to_email], msg.as_string())
        finally:
            try:
                server.quit()
            except Exception:
                pass
    except EmailNotConfigured:
        raise
    except Exception as exc:  # noqa: BLE001 —— 统一转领域异常，交由路由层映射 502
        raise EmailSendError(str(exc)) from exc
