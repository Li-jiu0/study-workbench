r"""密码强度校验冒烟测试（P0-B T01）。

不依赖后端进程，直接调用 schemas.check_password_strength / pydantic 校验器：
    python scripts/smoke_password_strength.py

规则唯一表述：
  1) 正则：至少 8 位，且同时包含字母和数字（^(?=.*[A-Za-z])(?=.*\d).{8,64}$）
  2) denylist：test123456 / password / qwerty / qwerty123 / 12345678 /
     11111111 / abc12345 / admin123 / iloveyou / 123456789（大小写不敏感）
两条任意一条不通过即拒。
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # 兼容 GBK 控制台
except Exception:
    pass

from schemas import (  # noqa: E402
    ChangePasswordIn,
    RegisterIn,
    check_password_strength,
)

PASS = 0
FAIL = 0


def check(name, ok, extra=""):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  OK  {name}" + (f"  {extra}" if extra else ""))
    else:
        FAIL += 1
        print(f"  FAIL  {name}  {extra}")


def rejects(pw):
    """纯函数层应拒绝该密码。"""
    try:
        check_password_strength(pw)
        return False
    except ValueError:
        return True


def register_rejects(pw):
    """RegisterIn schema 层应拒绝该密码（pydantic ValidationError）。"""
    from pydantic import ValidationError

    try:
        RegisterIn(username="tester", password=pw, nickname="test")
        return False
    except ValidationError:
        return True


def change_rejects(pw):
    """ChangePasswordIn schema 层应拒绝该密码（pydantic ValidationError）。"""
    from pydantic import ValidationError

    try:
        ChangePasswordIn(oldPassword="whatever1", newPassword=pw)
        return False
    except ValidationError:
        return True


print("== check_password_strength（纯函数） ==")
check("拒绝 123456（纯数字）", rejects("123456"))
check("拒绝 test（纯字母且过短）", rejects("test"))
check("拒绝 12ab（过短）", rejects("12ab"))
check("拒绝 12345678（8 位纯数字）", rejects("12345678"))
check("拒绝 abcdefgh（8 位纯字母）", rejects("abcdefgh"))
check("通过 a1b2c3d4（8 位混合）", not rejects("a1b2c3d4"))
check("拒绝 Abc12345（命中 denylist abc12345 大小写不敏感）", rejects("Abc12345"))
check("拒绝 65 位密码（超长）", rejects("a1" * 33))

print("== denylist（P0-B T01 黑名单，命中即拒） ==")
for weak in [
    "test123456", "password", "qwerty", "qwerty123",
    "12345678", "11111111", "abc12345", "admin123",
    "iloveyou", "123456789",
]:
    check(f"拒绝 denylist 命中：{weak}", rejects(weak))

# 大小写不敏感
for weak in ["TEST123456", "Password", "QWERTY123", "Iloveyou"]:
    check(f"拒绝 denylist 命中（大小写不敏感）：{weak}", rejects(weak))

# 不在 denylist 的相似密码应通过
check("通过 strongpwd1（非 denylist）", not rejects("strongpwd1"))
check("通过 Test123456!X（非 denylist）", not rejects("Test123456!X"))

print("== RegisterIn（注册入口） ==")
check("schema 拒绝 123456", register_rejects("123456"))
check("schema 拒绝 test", register_rejects("test"))
check("schema 拒绝 abc123（过短）", register_rejects("abc123"))
check("schema 通过 a1b2c3d4", not register_rejects("a1b2c3d4"))
check("schema 拒绝 test123456（denylist）", register_rejects("test123456"))
check("schema 拒绝 password（denylist）", register_rejects("password"))

print("== ChangePasswordIn（修改密码入口） ==")
check("schema 拒绝 123456", change_rejects("123456"))
check("schema 拒绝 test", change_rejects("test"))
check("schema 通过 a1b2c3d4", not change_rejects("a1b2c3d4"))
check("schema 拒绝 test123456（denylist）", change_rejects("test123456"))
check("schema 拒绝 qwerty123（denylist）", change_rejects("qwerty123"))

print(f"\n结果：PASS={PASS} FAIL={FAIL}")
sys.exit(0 if FAIL == 0 else 1)