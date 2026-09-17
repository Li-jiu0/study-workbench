"""配置加载：从 server/.env 读取（不存在则用默认值）。"""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _get(key: str, default: str = "") -> str:
    return (os.getenv(key) or default).strip()


JWT_SECRET = _get("JWT_SECRET", "dev-insecure-secret-change-me")
JWT_EXPIRE_DAYS = int(_get("JWT_EXPIRE_DAYS", "7") or 7)  # 兼容旧配置，新版由下方两个时长控制
ACCESS_TOKEN_MINUTES = int(_get("ACCESS_TOKEN_MINUTES", "60") or 60)   # access 令牌时长（分钟）
REFRESH_TOKEN_DAYS = int(_get("REFRESH_TOKEN_DAYS", "30") or 30)        # refresh 令牌时长（天）

ADMIN_USERNAME = _get("ADMIN_USERNAME", "管理员")  # 管理员账号（需求01，中文；可环境变量覆盖）
ADMIN_PASSWORD = _get("ADMIN_PASSWORD")                 # 管理员密码：仅从环境变量读取，不落库不落文档

# ---- 请求限流（次/分钟，按 IP；单进程内存实现，多进程需换 Redis）----
RATE_AUTH_PER_MIN = int(_get("RATE_AUTH_PER_MIN", "10") or 10)          # 注册 / 登录
RATE_AI_PER_MIN = int(_get("RATE_AI_PER_MIN", "30") or 30)              # AI 流式对话
RATE_GLOBAL_PER_MIN = int(_get("RATE_GLOBAL_PER_MIN", "600") or 600)    # 兜底全局

# AI 单用户每日调用上限（默认 200 次/天）
AI_DAILY_LIMIT = int(_get("AI_DAILY_LIMIT", "200") or 200)
DATABASE_PATH = _get("DATABASE_PATH", "data.db")
DB_URL = f"sqlite:///{(BASE_DIR / DATABASE_PATH).as_posix()}"

UPLOAD_DIR = BASE_DIR / "uploads"
AVATAR_DIR = UPLOAD_DIR / "avatars"
IMAGE_DIR = UPLOAD_DIR / "images"
# 语音消息上传目录（A7）：/uploads 已静态挂载 UPLOAD_DIR，故 voice 作为其子目录无需再改 main 挂载，仅需 mkdir
VOICE_DIR = UPLOAD_DIR / "voice"

# 大模型服务商注册表：默认接口与模型，密钥从 .env 注入
# 前端只会拿到“已配置密钥”的服务商列表（名称+模型），拿不到任何密钥。
AI_PROVIDERS = {
    "deepseek": {
        "name": "DeepSeek 深度求索",
        "base_url": _get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/chat/completions"),
        "model": _get("DEEPSEEK_MODEL", "deepseek-chat"),
        "api_key": _get("DEEPSEEK_API_KEY"),
    },
    "qwen": {
        "name": "通义千问（阿里）",
        "base_url": _get("QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"),
        "model": _get("QW_MODEL", "qwen-plus"),
        "api_key": _get("QW_API_KEY"),
    },
    "kimi": {
        "name": "Kimi（月之暗面）",
        "base_url": _get("KIMI_BASE_URL", "https://api.moonshot.cn/v1/chat/completions"),
        "model": _get("KIMI_MODEL", "moonshot-v1-8k"),
        "api_key": _get("KIMI_API_KEY"),
    },
    "zhipu": {
        "name": "智谱 GLM",
        "base_url": _get("ZHIPU_BASE_URL", "https://open.bigmodel.cn/api/paas/v4/chat/completions"),
        "model": _get("ZHIPU_MODEL", "glm-4-flash"),
        "api_key": _get("ZHIPU_API_KEY"),
    },
    "siliconflow": {
        "name": "硅基流动",
        "base_url": _get("SILICONFLOW_BASE_URL", "https://api.siliconflow.cn/v1/chat/completions"),
        "model": _get("SILICONFLOW_MODEL", "Qwen/Qwen2.5-7B-Instruct"),
        "api_key": _get("SILICONFLOW_API_KEY"),
    },
    "openai": {
        "name": "OpenAI",
        "base_url": _get("OPENAI_BASE_URL", "https://api.openai.com/v1/chat/completions"),
        "model": _get("OPENAI_MODEL", "gpt-4o-mini"),
        "api_key": _get("OPENAI_API_KEY"),
    },
}


def configured_providers() -> dict:
    """返回已配置密钥的服务商 {id: cfg}。"""
    return {k: v for k, v in AI_PROVIDERS.items() if v["api_key"]}


# ---- 邮箱 SMTP 配置（R73 邮箱绑定：发送验证码）----
# 真实发信需要邮件服务授权码（如 QQ 邮箱 / 163 邮箱的 SMTP 授权码），
# 一律从 server/.env 注入，代码内不内置任何默认凭据。
# 未配置（缺 SMTP_HOST / SMTP_USER / SMTP_PASS 任一）时，send-code 接口返回 503，
# 绝不静默假成功（见 routers/auth.py send_email_code）。
SMTP_HOST = _get("SMTP_HOST")                 # SMTP 服务器，如 smtp.qq.com
SMTP_PORT = int(_get("SMTP_PORT", "465") or 465)
SMTP_USER = _get("SMTP_USER")                 # 发信邮箱账号
SMTP_PASS = _get("SMTP_PASS")                 # 邮箱 SMTP 授权码（非登录密码）
SMTP_FROM = _get("SMTP_FROM") or SMTP_USER    # 发件人地址，默认取 SMTP_USER
# SMTP_TLS 默认 true：具体分支在 mailer.py 按端口判断
# （端口 465 → 隐式 SSL / SMTP_SSL；其余端口 → 明文 + STARTTLS）。
SMTP_TLS = _get("SMTP_TLS", "true").lower() in ("1", "true", "yes", "on")


def smtp_configured() -> bool:
    """邮箱发送是否已配置（host / user / pass 三者齐全才算配置好）。"""
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASS)
