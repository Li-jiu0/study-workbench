# -*- coding: utf-8 -*-
"""QA Round2：起隔离后端 → 跑工程师 smoke_local_backend.py（应 79 项）→ 收尾清理。"""
import sys, os
sys.path.insert(0, r"C:/Users/ATM/.workbuddy/binaries/python/envs/xingtu-backend/Lib/site-packages")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location("edbc", os.path.join(os.path.dirname(os.path.abspath(__file__)), "ed_backend_contract.py"))
# 不能直接 import（会执行 main）；复制关键函数
import shutil, subprocess, time, secrets

PY = r"C:/Users/ATM/.workbuddy/binaries/python/versions/3.13.12/python.exe"
SITE = r"C:/Users/ATM/.workbuddy/binaries/python/envs/xingtu-backend/Lib/site-packages"
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(REPO, "server")
WORK = r"D:\cache\temp\qa_backend_iso_smoke"
PORT = 8899

if os.path.exists(WORK):
    shutil.rmtree(WORK, ignore_errors=True)
os.makedirs(WORK, exist_ok=True)
SKIP = {".venv", "uploads", "backups", "__pycache__", ".pytest_cache"}
for root, dirs, files in os.walk(SRC):
    dirs[:] = [d for d in dirs if d not in SKIP]
    rel = os.path.relpath(root, SRC)
    dst_root = os.path.join(WORK, rel) if rel != "." else WORK
    os.makedirs(dst_root, exist_ok=True)
    for f in files:
        if f in ("data.db", ".env", "data.db-journal", "data.db-wal", "data.db-shm"):
            continue
        shutil.copy2(os.path.join(root, f), os.path.join(dst_root, f))
with open(os.path.join(WORK, ".env"), "w", encoding="utf-8") as fh:
    fh.write("JWT_SECRET=qa-smoke-%s\nJWT_EXPIRE_DAYS=7\nDATABASE_PATH=qa_data.db\n" % secrets.token_hex(24))
    fh.write("RATE_AUTH_PER_MIN=1000\nRATE_GLOBAL_PER_MIN=1000\nRATE_AI_PER_MIN=1000\n")

env = dict(os.environ)
env["PYTHONPATH"] = SITE
for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
    env.pop(k, None)
proc = subprocess.Popen([PY, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(PORT)],
                        cwd=WORK, env=env,
                        stdout=open(os.path.join(WORK, "uvicorn.log"), "ab"), stderr=subprocess.STDOUT)
try:
    import httpx
    deadline = time.time() + 40
    up = False
    while time.time() < deadline:
        try:
            if httpx.get("http://127.0.0.1:%d/docs" % PORT, timeout=2, trust_env=False).status_code < 500:
                up = True; break
        except Exception:
            pass
        time.sleep(0.5)
    print("backend up:", up)
    if up:
        smoke_env = dict(env)
        smoke_env["SW_BASE"] = "http://127.0.0.1:%d" % PORT
        smoke_env["SW_DB"] = os.path.join(WORK, "qa_data.db")
        r = subprocess.run([PY, "scripts/smoke_local_backend.py"], cwd=WORK, env=smoke_env,
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
        out = (r.stdout or "") + "\n" + (r.stderr or "")
        with open(r"D:\cache\temp\qa_r2_smoke.txt", "w", encoding="utf-8", errors="replace") as fh:
            fh.write(out)
        print("smoke exit code:", r.returncode)
finally:
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except Exception:
        proc.kill()
    time.sleep(1)
    shutil.rmtree(WORK, ignore_errors=True)
    print("cleaned")
