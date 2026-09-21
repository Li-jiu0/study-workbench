#!/bin/bash
# ============================================================================
# 学习工作台 · 安卓 APK 打包脚本（Windows Git Bash）
# 依赖：已解压的 JDK17 + Android 组件（build-tools/34.0.0 + platforms/android-35/android.jar）
#       放在 C:\Users\ATM\android-build\
# 用法：bash android/build-apk.sh
# 产出：D:\网页\学习工作台\学习工作台-安卓App.apk  + 签名密钥 android/workbench.keystore
# 注意：aapt2 等原生工具无法处理中文路径，因此本脚本把工程文件复制到 ASCII 临时目录构建，
#       最后再用 msys cp 把成品 APK 复制回中文项目路径。所有原生工具用 cygpath -w 转 Windows 路径。
# ============================================================================
set -e

W() { cygpath -w "$1"; }

# ---- 工具链路径（按需修改） ----
BUILD="/c/Users/ATM/android-build"
JDK="$BUILD/jdk/jdk-17.0.20.1+1"
SDK="$BUILD/sdk"
BT="$SDK/build-tools/34.0.0"
ANDROID_JAR="$SDK/platforms/android-35/android.jar"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(mktemp -d)"
STAGE="$OUT/stage"            # 打包进 assets 的站点文件
RES="$OUT/res"                # 图标资源（ASCII）
MANIFEST="$OUT/AndroidManifest.xml"
JAVA_SRC="$OUT/javasrc"       # MainActivity.java（ASCII）
JAVA_OUT="$OUT/java"
CLASSES="$OUT/classes"
DEX_OUT="$OUT/dex"
KEPT="$ROOT/android/workbench.keystore"
FINAL_APK="$ROOT/学习工作台-安卓App.apk"
SIGNED="$OUT/app-signed.apk"   # 先在 ASCII 目录签名，最后 cp 回去

echo "工作目录: $OUT"
mkdir -p "$STAGE/assets" "$STAGE/data" "$RES" "$JAVA_OUT" "$CLASSES" "$DEX_OUT"

# ---- 1) 整理站点文件（剔除 server/tools/备份/参考图/API覆盖层等） ----
cd "$ROOT"
n=0
for f in *.html; do
  sed '/<script src="assets\/api\.js/d' "$f" > "$STAGE/$f"
  n=$((n+1))
done

# ---- APK 资源白名单（项目铁律「代码修好 ≠ 包里有」）：缺失即中止打包 ----
# 批次五（2026-09-12）新增 icon-map.js / subpage-router.js：
#   · icon-map.js 缺失     → 全站侧栏图标渲染空白（data-icon 找不到字典）
#   · subpage-router.js 缺失 → 设置/个人中心所有 [data-subpage] 默认隐藏，分组卡全程不可点
# 注：assets/ 必须「递归」复制——早期版本用 `cp -f assets/*` 会把 assets/emoji/ 等子目录
#     静默跳过（omitting directory 被 2>/dev/null 吞掉），导致 私聊.html 的表情面板失效。
cp -rf "$ROOT"/assets/. "$STAGE/assets/"
echo "✓ 站点文件已就绪（${n} 个 html + assets/，递归复制）"

# ---- 1a) 一级资源目录 data/（2026-09-12 新增）：同样必须递归复制 ----
# 真题模考三级独立页（mock_exam.html / mock_exam_run.html / mock_exam_result.html）
# 依赖 data/mock-papers.js（window.MOCK_PAPERS_DATA）。缺失时页面不报错、只显示空题库，
# 与 assets/emoji/ 漏拷属同一类「构建期静默失效」，因此必须递归复制 + 打包期硬断言。
cp -rf "$ROOT"/data/. "$STAGE/data/"
DATA_COUNT="$(find "$STAGE/data" -type f | wc -l | tr -d ' ')"
echo "✓ 一级资源目录 data/ 已递归复制（${DATA_COUNT} 个文件）"

REQUIRED_ASSETS="
icon-map.js
subpage-router.js
common.css
polish.css
app.js
config.js
chat-local.js
qbank.js
study-stats.js
voiceplayer.js
mini.js
importer.js
quest.js
hotnews.js
group-discussion.js
i-partner.js
topic-express.js
mini-cet.js
mini-comm.js
mini-exam.js
mini-interview.js
mini-ppt.js
emoji/manifest.js
"
REQ_COUNT=0
MISSING=""
for a in $REQUIRED_ASSETS; do
  REQ_COUNT=$((REQ_COUNT+1))
  [ -f "$STAGE/assets/$a" ] || MISSING="$MISSING $a"
done
if [ -n "$MISSING" ]; then
  echo "✖ APK 资源白名单缺失（stage/assets/）：$MISSING"
  exit 1
fi
echo "✓ APK 资源白名单校验通过（${REQ_COUNT} 项，含批次五 icon-map.js / subpage-router.js）"

# ---- 1b) APK 数据资源白名单（stage/data/）：真题模考数据契约，缺失即中止打包 ----
# data/mock-papers.js 缺失 → 模考三页静默空题库（用户只看到「暂无试卷」），
# 在真机里才会暴露，因此必须与 assets 白名单一样在打包期硬断言。
REQUIRED_DATA="
mock-papers.js
"
REQ_DATA_COUNT=0
DATA_MISSING=""
for a in $REQUIRED_DATA; do
  REQ_DATA_COUNT=$((REQ_DATA_COUNT+1))
  [ -f "$STAGE/data/$a" ] || DATA_MISSING="$DATA_MISSING data/$a"
done
if [ -n "$DATA_MISSING" ]; then
  echo "✖ APK 数据资源白名单缺失（stage/data/）：$DATA_MISSING"
  echo "  → 真题模考三页会静默空题库；请确认 data/ 已随包递归复制"
  exit 1
fi
echo "✓ APK 数据资源白名单校验通过（${REQ_DATA_COUNT} 项：data/mock-papers.js）"

# ---- 2) 把安卓工程文件复制到 ASCII 目录 ----
cp -rf "$ROOT/android/res/." "$RES/"
cp -f "$ROOT/android/AndroidManifest.xml" "$MANIFEST"
cp -rf "$ROOT/android/java/." "$JAVA_SRC/"
echo "✓ 工程文件已复制到 ASCII 临时目录"

# ---- 3) 编译资源（图标） ----
AAPT2="$BT/aapt2.exe"
"$AAPT2" compile --dir "$(W "$RES")" -o "$(W "$OUT/res.zip")"
echo "✓ aapt2 compile 完成"

# ---- 4) 链接生成未签名 APK + R.java（不内嵌 assets——中文文件名交给 Python zipfile 打进） ----
"$AAPT2" link \
  -I "$(W "$ANDROID_JAR")" \
  --manifest "$(W "$MANIFEST")" \
  --java "$(W "$JAVA_OUT")" \
  -o "$(W "$OUT/base.apk")" "$(W "$OUT/res.zip")"
echo "✓ aapt2 link 完成 -> base.apk"

# ---- 5) 编译 Java（MainActivity + 生成的 R）----
export JAVA_HOME="$(W "$JDK")"   # Windows 形式，vjavac/d8/keytool 等原生 .bat 需要
export PATH="$JDK/bin:$PATH"
find "$JAVA_OUT" -name '*.java' > "$OUT/srcs.txt"
find "$JAVA_SRC" -name '*.java' >> "$OUT/srcs.txt"
rm -f "$OUT/srcs_w.txt"
while IFS= read -r line; do cygpath -w "$line" >> "$OUT/srcs_w.txt"; done < "$OUT/srcs.txt"
javac -encoding UTF-8 -source 8 -target 8 -bootclasspath "$(W "$ANDROID_JAR")" \
  -d "$(W "$CLASSES")" @"$(W "$OUT/srcs_w.txt")"
echo "✓ javac 完成"

# ---- 6) dex 打包（应用类；MainActivity 用纯 framework API，无需 androidx） ----
( cd "$CLASSES" && jar cf "$(W "$OUT/classes.jar")" . )
"$BT/d8.bat" --release --min-api 21 --lib "$(W "$ANDROID_JAR")" --output "$(W "$DEX_OUT")" \
  "$(W "$OUT/classes.jar")"
echo "✓ d8 完成"

# ---- 7) 合并：base.apk + classes.dex + assets（Python zipfile，支持中文文件名） ----
PY="/c/Users/ATM/.workbuddy/binaries/python/versions/3.13.12/python"
[ -x "$PY" ] || PY=python
"$PY" "$(W "$ROOT/android/merge_apk.py")" "$(W "$OUT/base.apk")" "$(W "$DEX_OUT/classes.dex")" "$(W "$STAGE")" "$(W "$OUT/merged.apk")"
echo "✓ 合并 assets/dex 完成（含 assets/data/ 一级目录）"

# ---- 8) 对齐 ----
"$BT/zipalign.exe" -f 4 "$(W "$OUT/merged.apk")" "$(W "$OUT/aligned.apk")"
echo "✓ zipalign 完成"

# ---- 9) 签名（首次自动生成 keystore；后续复用） ----
if [ ! -f "$KEPT" ]; then
  keytool -genkeypair -v -keystore "$(W "$KEPT")" -alias workbench \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass workbench123 -keypass workbench123 \
    -dname "CN=Study Workbench, OU=Local, O=Personal, L=Local, ST=Local, C=CN" >/dev/null 2>&1
  echo "✓ 已生成签名密钥 $KEPT"
fi
"$BT/apksigner.bat" sign --ks "$(W "$KEPT")" --ks-pass pass:workbench123 \
  --out "$(W "$SIGNED")" "$(W "$OUT/aligned.apk")"
"$BT/apksigner.bat" verify --print-certs "$(W "$SIGNED")" | head -3

# ---- 10) 复制回中文项目路径 ----
cp -f "$SIGNED" "$FINAL_APK"
echo "✅ APK 生成: $FINAL_APK"
du -h "$FINAL_APK"
