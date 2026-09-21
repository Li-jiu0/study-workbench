# -*- coding: utf-8 -*-
"""
批5 / L3 安卓线 —— javac 编译校验脚本（不改动、不产出 APK）
================================================================
只复刻 android/build_apk.py:201-222 的 javac 那一段：
  · 同一套 JDK（jdk_tool("javac") → C:\\Users\\ATM\\android-build\\jdk\\jdk-17.0.20.1+1\\bin\\javac.exe）
  · 同一 bootclasspath（sdk\\platforms\\android-35\\android.jar）
  · 完全相同的参数（-encoding UTF-8 -source 8 -target 8 -d <classes> @srcs.txt）
  · 同一套 src 收集方式：先把源码 copytree 进 ASCII 临时目录（build_apk.py 的 JAVA_SRC/JAVA_OUT
    同样是 ASCII 临时目录 —— 这是中文路径下 @argfile 能被 javac 正确解码的关键），再 walk 取全部 *.java。

【刻意不做的事】：不跑 aapt2 / d8 / merge / zipalign / 签名（build_apk.py 的步骤 3-4、6-10），
因此绝不产出任何 APK。仅生成 javac 需要的 R.java（aapt2 link 产物的 R.java 对本项目只引用到
R.drawable.ic_launcher，这里用等价的最小 R.java 桩放入 ASCII 临时目录，保证 javac 段可独立复现）。

输出：javac exit code、.class 数量（A/B 对照：剔除新服务 vs 含新服务）。
"""
import os
import sys
import shutil
import tempfile
import subprocess

# ---- 与 build_apk.py 完全一致的路径常量 ----
BUILD = r"C:\Users\ATM\android-build"
JDK = os.path.join(BUILD, "jdk", "jdk-17.0.20.1+1")
JDK_BIN = os.path.join(JDK, "bin")
SDK = os.path.join(BUILD, "sdk")
ANDROID_JAR = os.path.join(SDK, "platforms", "android-35", "android.jar")

ROOT = r"D:\下载的文件\学习工作台"
JAVA_SRC_REAL = os.path.join(ROOT, "android", "java")
REL_NEW_SERVICE = os.path.join("com", "study", "workbench", "LocationShareService.java")

# 最小 R.java 桩（等价 aapt2 link 产物中对本项目唯一被引用到的 R.drawable.ic_launcher）
R_JAVA = """package com.study.workbench;
public final class R {
    private R() {}
    public static final class drawable {
        private drawable() {}
        public static final int ic_launcher = 0x7f010001;
    }
}
"""


def jdk_tool(name):
    return os.path.join(JDK_BIN, name + (".exe" if not name.endswith(".exe") else ""))


def run_javac(use_real_service, tag):
    """复刻 build_apk.py：源码先 copytree 到 ASCII 临时目录，再 walk 收集 *.java 编译。
    use_real_service=False 时，用最小 stub 顶替 LocationShareService.java（MainActivity 已引用其
    EXTRA_SHARE_ID / .class，故不能用「剔除文件」做基线，必须用可编译的 stub 顶替）。"""
    out = tempfile.mkdtemp(prefix="l3javac_%s_" % tag)          # ASCII 临时目录
    java_src_ascii = os.path.join(out, "javasrc")               # ← 对应 build_apk.py 的 JAVA_SRC
    java_out_ascii = os.path.join(out, "java")                  # ← 对应 build_apk.py 的 JAVA_OUT
    classes = os.path.join(out, "classes")
    shutil.copytree(JAVA_SRC_REAL, java_src_ascii)              # 整树复制（含 .bak，随后按后缀过滤）
    os.makedirs(os.path.join(java_out_ascii, "com", "study", "workbench"), exist_ok=True)
    with open(os.path.join(java_out_ascii, "com", "study", "workbench", "R.java"), "w", encoding="utf-8") as fh:
        fh.write(R_JAVA)
    os.makedirs(classes, exist_ok=True)

    if not use_real_service:
        # 用最小 stub 顶替新服务（只提供 MainActivity 引用的符号），得到「无真实新服务」的基线
        stub_path = os.path.join(java_src_ascii, REL_NEW_SERVICE)
        with open(stub_path, "w", encoding="utf-8") as fh:
            fh.write("package com.study.workbench;\n"
                     "public class LocationShareService {\n"
                     "    public static final String EXTRA_SHARE_ID = \"xt_locshare_id\";\n"
                     "}\n")

    srcs = []
    for base in (java_out_ascii, java_src_ascii):
        for root_dir, _, files in os.walk(base):
            for f in files:
                if not f.endswith(".java"):
                    continue
                srcs.append(os.path.join(root_dir, f))

    src_list = os.path.join(out, "srcs.txt")
    with open(src_list, "w", encoding="utf-8") as fh:
        fh.write("\n".join(srcs))

    env = os.environ.copy()
    env["JAVA_HOME"] = JDK
    env["PATH"] = os.path.join(JDK, "bin") + os.pathsep + env.get("PATH", "")

    cmd = [jdk_tool("javac"), "-encoding", "UTF-8", "-source", "8", "-target", "8",
           "-bootclasspath", ANDROID_JAR, "-d", classes, "@" + src_list]
    print("  $ javac -encoding UTF-8 -source 8 -target 8 -bootclasspath <android-35.jar> -d classes @srcs.txt")
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", env=env)
    n_class = 0
    for _, _, files in os.walk(classes):
        n_class += sum(1 for f in files if f.endswith(".class"))
    print("  javac exit = %d | .java(src) = %d | .class = %d" % (r.returncode, len(srcs), n_class))
    if r.stdout.strip():
        print("  --- stdout ---\n" + r.stdout.strip()[:4000])
    if r.stderr.strip():
        print("  --- stderr ---\n" + r.stderr.strip()[:4000])
    shutil.rmtree(out, ignore_errors=True)
    return r.returncode, len(srcs), n_class


def main():
    print("JDK         =", JDK, os.path.isdir(JDK))
    print("android.jar =", ANDROID_JAR, os.path.isfile(ANDROID_JAR))
    print("源码根      =", JAVA_SRC_REAL)
    print("新服务存在  =", os.path.isfile(os.path.join(JAVA_SRC_REAL, REL_NEW_SERVICE)))

    print("\n[A] 基线（LocationShareService.java 用最小 stub 顶替，仅供计数对照）")
    a = run_javac(False, "A")
    print("\n[B] 含新服务（全部真实 *.java）")
    b = run_javac(True, "B")

    print("\n==== 结论 ====")
    print("A 基线 .class = %d (exit %d)" % (a[2], a[0]))
    print("B 全部 .class = %d (exit %d)  ← 本批交付" % (b[2], b[0]))
    print("增量 = %d（新服务自身 + 匿名内部类）" % (b[2] - a[2]))
    # 门禁原文：javac exit=0 且 .class 数 ≥ 上一轮 47 + 1（新服务）
    ok = (b[0] == 0) and (b[2] >= 48)
    print("门禁「javac exit=0 且 .class ≥ 47+1=48」:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
