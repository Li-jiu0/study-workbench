# -*- coding: utf-8 -*-
"""批5 · L1 后端验收 · 总控（隔离副本 → 3 个子进程相：API 全链 / staticmap 熔断 / 迁移幂等）。

假阳性防护：每个相位独立子进程（各自干净 sys.modules + 独立库/计数文件）。
产出 tools/qa/_r104e_L1_report.txt。
"""
import faulthandler
import io
import os
import py_compile
import shutil
import subprocess
import sys
import tempfile
import uuid

ROOT = r"D:\下载的文件\学习工作台"
SERVER = os.path.join(ROOT, "server")
VENV_PY = os.path.join(SERVER, ".venv", "Scripts", "python.exe")
QA = os.path.join(ROOT, "tools", "qa")
OUT = os.path.join(QA, "_r104e_L1_report.txt")
CHILD_API = os.path.join(QA, "_r104e_L1_child_api.py")
CHILD_CAP = os.path.join(QA, "_r104e_L1_child_cap.py")
CHILD_MIG = os.path.join(QA, "_r104e_L1_child_mig.py")

LOG = []


def log(s=""):
    LOG.append(str(s))
    try:
        io.open(OUT, "w", encoding="utf-8").write("\n".join(LOG))
    except Exception:
        pass


def make_copy():
    dst = tempfile.mkdtemp(prefix="r104eL1_")
    skip = {".venv", "__pycache__", "uploads", "backups", "data", "scripts"}
    for dp, dns, fns in os.walk(SERVER):
        dns[:] = [d for d in dns if d not in skip]
        rel = os.path.relpath(dp, SERVER)
        tgt = dst if rel == "." else os.path.join(dst, rel)
        os.makedirs(tgt, exist_ok=True)
        for f in fns:
            if f.endswith(".db") or "bak-" in f or f.endswith(".pyc"):
                continue
            shutil.copy2(os.path.join(dp, f), os.path.join(tgt, f))
    return dst


def run_child(path, env, outfile, tag):
    r = subprocess.run([VENV_PY, path], cwd=ROOT, env=env, capture_output=True, timeout=300)
    txt = io.open(outfile, encoding="utf-8").read() if os.path.exists(outfile) else ""
    log(txt or "(无输出)")
    if r.returncode != 0:
        log("!! %s rc=%d stderr:\n%s" % (tag, r.returncode,
                                        (r.stderr or b"").decode("utf-8", "replace")[:1500]))
    ok = ("PASS" in txt) and ("EXCEPTION:" not in txt) and r.returncode == 0
    log("%s rc=%d → %s" % (tag, r.returncode, "PASS" if ok else "FAIL"))
    log("")
    return ok


def main():
    faulthandler.dump_traceback_later(600, exit=True)
    os.makedirs(QA, exist_ok=True)
    log("=== 批5 · L1 后端验收报告 ===")
    log("工作树 baseline：本地 == 批5 前（R105 未部署）｜ venv=%s" % os.path.exists(VENV_PY))
    log("")

    # 门禁 13：py_compile 全部改动文件
    log("---- 门禁 13：py_compile 全部改动文件 ----")
    okc = True
    for rel in ("config.py", "routers/geo.py", "database.py", "routers/chat.py",
                "routers/groups.py", "ws.py", "schemas.py", "main.py", "routers/liveloc.py"):
        p = os.path.join(SERVER, rel)
        try:
            py_compile.compile(p, doraise=True)
            log("  OK   %s" % rel)
        except py_compile.PyCompileError as e:
            okc = False
            log("  FAIL %s\n%s" % (rel, e))
    log("  exit=0 判定：%s" % ("PASS" if okc else "FAIL"))
    log("")

    dst = make_copy()
    log("[隔离副本] %s" % dst)
    base_env = dict(os.environ)
    base_env["R104E_ISO_DIR"] = dst
    base_env["R104E_DB"] = "_r104e_%s.db" % uuid.uuid4().hex[:8]

    results = {}

    log("==== 相位① API 全链（门禁 1-9 / 12） ====")
    results["api"] = run_child(CHILD_API, base_env,
                               os.path.join(QA, "_r104e_L1_api_out.txt"), "child①")
    log("==== 相位② staticmap 每日熔断（门禁 10） ====")
    env2 = dict(base_env)
    env2["R104E_STATICMAP_CAP"] = "1"
    env2["R104E_DB"] = "_r104e_cap_%s.db" % uuid.uuid4().hex[:8]
    results["cap"] = run_child(CHILD_CAP, env2,
                               os.path.join(QA, "_r104e_L1_cap_out.txt"), "child②")
    log("==== 相位③ 迁移幂等（门禁 11） ====")
    env3 = dict(base_env)
    env3["R104E_DB"] = "_r104e_mig_%s.db" % uuid.uuid4().hex[:8]
    results["mig"] = run_child(CHILD_MIG, env3,
                               os.path.join(QA, "_r104e_L1_mig_out.txt"), "child③")

    log("==== 汇总 ====")
    overall = okc and all(results.values())
    log("门禁 13 py_compile            : %s" % ("PASS" if okc else "FAIL"))
    log("门禁 1-9/12 API 全链          : %s" % ("PASS" if results["api"] else "FAIL"))
    log("门禁 10 staticmap 熔断        : %s" % ("PASS" if results["cap"] else "FAIL"))
    log("门禁 11 迁移幂等              : %s" % ("PASS" if results["mig"] else "FAIL"))
    log("")
    log("OVERALL=%s" % ("PASS" if overall else "FAIL"))
    io.open(OUT, "w", encoding="utf-8").write("\n".join(LOG))
    return 0 if overall else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        import traceback
        log("EXCEPTION: " + traceback.format_exc())
        sys.exit(1)
