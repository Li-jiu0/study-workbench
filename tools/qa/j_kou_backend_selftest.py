# -*- coding: utf-8 -*-
"""kou-backend 自测脚本（20260913j）：POST /api/feedback + GET /api/feedback。

本地起 uvicorn 后运行本脚本；结果写入 tools/qa/j_kou_backend.log（UTF-8）。
用法：python j_kou_backend_selftest.py
"""
import json
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8765"
ADMIN_KEY = "xj20260913j-f7a3c921b6d84e05"
LOG_PATH = r"D:\下载的文件\学习工作台\tools\qa\j_kou_backend.log"

lines = []
passed = 0
failed = 0


def log(msg: str) -> None:
    print(msg)
    lines.append(msg)


def request(method: str, path: str, body: dict | None = None,
            headers: dict | None = None) -> tuple[int, dict | str]:
    """发起 HTTP 请求，返回 (status, 解析后的 body)。"""
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Content-Type": "application/json",
                                          **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, raw
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8")
        try:
            return err.code, json.loads(raw)
        except json.JSONDecodeError:
            return err.code, raw


def check(name: str, ok: bool, detail: str = "") -> None:
    global passed, failed
    tag = "PASS" if ok else "FAIL"
    if ok:
        passed += 1
    else:
        failed += 1
    log(f"[{tag}] {name}" + (f"  -> {detail}" if detail else ""))


def wait_server(seconds: int = 30) -> bool:
    """等待服务就绪。"""
    deadline = time.time() + seconds
    while time.time() < deadline:
        try:
            status, _ = request("GET", "/api/health")
            if status == 200:
                return True
        except (urllib.error.URLError, ConnectionError, OSError):
            time.sleep(1)
    return False


def main() -> None:
    log(f"== kou-backend selftest {time.strftime('%Y-%m-%d %H:%M:%S')} ==")
    log(f"target: {BASE}")
    if not wait_server():
        log("[FAIL] server not reachable in 30s")
        write_log()
        raise SystemExit(1)
    check("health", True, "GET /api/health 200")

    # 1. 正常提交
    st, body = request("POST", "/api/feedback",
                       {"nickname": "自测同学", "type": "suggestion",
                        "content": "这是一条 kou-backend 自测反馈，验证 POST 落盘。"})
    check("POST valid -> 200 {ok:true}",
          st == 200 and isinstance(body, dict) and body.get("ok") is True,
          f"status={st} body={body}")

    # 2. 非法 type -> 422
    st, body = request("POST", "/api/feedback",
                       {"nickname": "自测同学", "type": "hack",
                        "content": "type 非法应被 422 拒绝"})
    check("POST invalid type -> 422", st == 422, f"status={st}")

    # 3. 昵称超长(21字) -> 422
    st, body = request("POST", "/api/feedback",
                       {"nickname": "一二三四五六七八九十一二三四五六七八九十1",
                        "type": "bug", "content": "昵称超长应被 422 拒绝"})
    check("POST nickname>20 -> 422", st == 422, f"status={st}")

    # 4. 正文超长(2001字) -> 422
    st, body = request("POST", "/api/feedback",
                       {"nickname": "自测同学", "type": "bug", "content": "字" * 2001})
    check("POST content>2000 -> 422", st == 422, f"status={st}")

    # 5. GET 无密钥 -> 401
    st, body = request("GET", "/api/feedback")
    check("GET no key -> 401", st == 401, f"status={st}")

    # 6. GET 错误密钥 -> 401
    st, body = request("GET", "/api/feedback", headers={"X-Admin-Key": "wrong-key"})
    check("GET wrong key -> 401", st == 401, f"status={st}")

    # 7. GET 正确密钥 -> 200 且能读到刚提交的记录
    st, body = request("GET", "/api/feedback", headers={"X-Admin-Key": ADMIN_KEY})
    items = body.get("items", []) if isinstance(body, dict) else []
    found = any(it.get("nickname") == "自测同学" and it.get("type") == "suggestion"
                for it in items)
    check("GET correct key -> 200 with record",
          st == 200 and isinstance(body, dict) and body.get("count", 0) >= 1 and found,
          f"status={st} count={body.get('count') if isinstance(body, dict) else '?'}")

    log(f"== summary: {passed} passed, {failed} failed ==")
    write_log()
    raise SystemExit(0 if failed == 0 else 1)


def write_log() -> None:
    with open(LOG_PATH, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
