# -*- coding: utf-8 -*-
import subprocess, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
REPO = r"D:\下载的文件\学习工作台"
def run(args, timeout=500):
    p = subprocess.run(["git", "-C", REPO, "-c", "core.quotepath=false"] + args,
                       capture_output=True, timeout=timeout)
    return p.returncode, p.stdout.decode('utf-8','replace'), p.stderr.decode('utf-8','replace')

rc, out, err = run(["add", "--", "android/build_apk.py", "android/AndroidManifest.xml"])
print("add rc=%d" % rc)
msg = "chore(APK): versionCode 21/1.20；白名单+6 R74-R85 资产；打包排除 .bak 备份文件"
rc, out, err = run(["commit", "-m", msg])
print("commit rc=%d %s" % (rc, (out or err).strip()[-200:]))
rc, out, err = run(["-c", "http.proxy=http://127.0.0.1:7897", "-c", "https.proxy=http://127.0.0.1:7897",
                    "-c", "http.version=HTTP/1.1", "push", "origin", "main"])
print("push rc=%d %s" % (rc, (err or out).strip().splitlines()[-1] if (err or out).strip() else ""))
rc, out, err = run(["-c", "http.proxy=http://127.0.0.1:7897", "-c", "https.proxy=http://127.0.0.1:7897", "ls-remote", "origin", "main"])
print("remote main:", out.split()[0] if out else "?")
