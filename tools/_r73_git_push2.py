# -*- coding: utf-8 -*-
# R73b git 步骤4：代理探测 + 换端口重推
import socket, subprocess, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
REPO = r"D:\下载的文件\学习工作台"

def port_open(port):
    try:
        s = socket.create_connection(('127.0.0.1', port), timeout=2)
        s.close(); return True
    except OSError:
        return False

cands = [7897, 7890, 60765, 10809, 1080]
alive = [p for p in cands if port_open(p)]
print("open ports:", alive)

def run(args):
    p = subprocess.run(["git", "-C", REPO, "-c", "core.quotepath=false"] + args,
                       capture_output=True, timeout=280)
    return p.returncode, p.stdout.decode('utf-8','replace'), p.stderr.decode('utf-8','replace')

ok = False
for port in alive:
    print("--- try push via %d ---" % port)
    rc, out, err = run(["-c", "http.proxy=http://127.0.0.1:%d" % port,
                        "-c", "https.proxy=http://127.0.0.1:%d" % port,
                        "-c", "http.version=HTTP/1.1",
                        "push", "origin", "main"])
    print("push rc=%d" % rc)
    if err.strip(): print(err[-1000:])
    if rc == 0:
        ok = True
        break

if not ok:
    # 最后试直连（不走代理）
    print("--- try direct (no proxy) ---")
    rc, out, err = run(["-c", "http.version=HTTP/1.1", "push", "origin", "main"])
    print("direct push rc=%d" % rc)
    if err.strip(): print(err[-1000:])
    ok = rc == 0

print("FINAL:", "PUSH-OK" if ok else "PUSH-FAIL")
