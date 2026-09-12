# 学习工作台 · 安卓 APK 打包脚本（PowerShell 版）
# 对应 build-apk.sh，用于无 Git Bash 环境
$ErrorActionPreference = "Stop"

# ---- 工具链路径 ----
$BUILD = "C:\Users\ATM\android-build"
$JDK = "$BUILD\jdk\jdk-17.0.20.1+1"
$SDK = "$BUILD\sdk"
$BT = "$SDK\build-tools\34.0.0"
$ANDROID_JAR = "$SDK\platforms\android-35\android.jar"

$ROOT = "D:\下载的文件\学习工作台"
$OUT = Join-Path $env:TEMP ("apkbuild_" + [System.Guid]::NewGuid().ToString("N").Substring(0,8))
$STAGE = "$OUT\stage"
$RES = "$OUT\res"
$MANIFEST = "$OUT\AndroidManifest.xml"
$JAVA_SRC = "$OUT\javasrc"
$JAVA_OUT = "$OUT\java"
$CLASSES = "$OUT\classes"
$DEX_OUT = "$OUT\dex"
$KEPT = "$ROOT\android\workbench.keystore"
$FINAL_APK = "$ROOT\学习工作台-安卓App.apk"
$SIGNED = "$OUT\app-signed.apk"

Write-Host "工作目录: $OUT"
New-Item -ItemType Directory -Force -Path "$STAGE\assets", $RES, $JAVA_OUT, $CLASSES, $DEX_OUT | Out-Null

# ---- 1) 整理站点文件（剔除 api.js 引用） ----
Set-Location $ROOT
$htmlFiles = Get-ChildItem -Filter "*.html"
foreach ($f in $htmlFiles) {
    $content = Get-Content $f.FullName -Raw -Encoding UTF8
    $content = $content -replace '(?m)^.*<script src="assets/api\.js.*$', ''
    [System.IO.File]::WriteAllText("$STAGE\$($f.Name)", $content, [System.Text.UTF8Encoding]::new($false))
}
Copy-Item -Path "$ROOT\assets\*" -Destination "$STAGE\assets\" -Recurse -Force
Write-Host "站点文件已就绪（$($htmlFiles.Count) 个 html + assets/）"

# ---- 1a) APK 资源白名单（项目铁律「代码修好 ≠ 包里有」）：缺失即中止打包 ----
# 批次五（2026-09-12）新增 icon-map.js / subpage-router.js：
#   · icon-map.js 缺失       → 全站侧栏图标渲染空白（data-icon 找不到字典）
#   · subpage-router.js 缺失 → 设置/个人中心所有 [data-subpage] 默认隐藏，分组卡全程不可点
# 二者都是「静默失效」，只有在 APK 内才暴露，因此必须在打包期硬断言。
$REQUIRED_ASSETS = @(
    'icon-map.js',            # 批次五新增
    'subpage-router.js',      # 批次五新增
    'common.css', 'polish.css', 'app.js', 'config.js', 'chat-local.js',
    'qbank.js', 'study-stats.js', 'voiceplayer.js', 'mini.js', 'importer.js',
    'quest.js', 'hotnews.js', 'group-discussion.js', 'i-partner.js',
    'topic-express.js', 'mini-cet.js', 'mini-comm.js', 'mini-exam.js',
    'mini-interview.js', 'mini-ppt.js',
    'emoji/manifest.js'       # 子目录资源，早期 cp 不带 -r 会静默漏掉
)
$missingAssets = @()
foreach ($a in $REQUIRED_ASSETS) {
    $p = Join-Path "$STAGE\assets" ($a -replace '/', '\')
    if (-not (Test-Path $p -PathType Leaf)) { $missingAssets += $a }
}
if ($missingAssets.Count -gt 0) {
    throw "APK 资源白名单缺失（stage/assets/）：$($missingAssets -join ', ')"
}
Write-Host "APK 资源白名单校验通过（$($REQUIRED_ASSETS.Count) 项，含批次五 icon-map.js / subpage-router.js）"

# ---- 2) 复制工程文件到 ASCII 目录 ----
Copy-Item -Path "$ROOT\android\res\*" -Destination $RES -Recurse -Force
Copy-Item -Path "$ROOT\android\AndroidManifest.xml" -Destination $MANIFEST -Force
Copy-Item -Path "$ROOT\android\java\*" -Destination $JAVA_SRC -Recurse -Force
Write-Host "工程文件已复制到 ASCII 临时目录"

# ---- 3) aapt2 compile 资源 ----
$AAPT2 = "$BT\aapt2.exe"
& $AAPT2 compile --dir $RES -o "$OUT\res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed" }
Write-Host "aapt2 compile 完成"

# ---- 4) aapt2 link ----
& $AAPT2 link -I $ANDROID_JAR --manifest $MANIFEST --java $JAVA_OUT -o "$OUT\base.apk" "$OUT\res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 link failed" }
Write-Host "aapt2 link 完成 -> base.apk"

# ---- 5) javac 编译 Java ----
$env:JAVA_HOME = $JDK
$env:PATH = "$JDK\bin;$env:PATH"
$srcFiles = @()
$srcFiles += Get-ChildItem -Path $JAVA_OUT -Filter "*.java" -Recurse | ForEach-Object { $_.FullName }
$srcFiles += Get-ChildItem -Path $JAVA_SRC -Filter "*.java" -Recurse | ForEach-Object { $_.FullName }
$srcList = "$OUT\srcs.txt"
$srcFiles | Out-File -FilePath $srcList -Encoding ASCII

& javac -encoding UTF-8 -source 8 -target 8 -bootclasspath $ANDROID_JAR -d $CLASSES "@$srcList"
if ($LASTEXITCODE -ne 0) { throw "javac failed" }
Write-Host "javac 完成"

# ---- 6) d8 打包 dex ----
Push-Location $CLASSES
& jar cf "$OUT\classes.jar" .
Pop-Location
& "$BT\d8.bat" --release --min-api 21 --lib $ANDROID_JAR --output $DEX_OUT "$OUT\classes.jar"
if ($LASTEXITCODE -ne 0) { throw "d8 failed" }
Write-Host "d8 完成"

# ---- 7) Python merge_apk.py 合并 ----
$PY = "C:\Users\ATM\.workbuddy\binaries\python\versions\3.13.12\python.exe"
if (-not (Test-Path $PY)) { $PY = "python" }
& $PY "$ROOT\android\merge_apk.py" "$OUT\base.apk" "$DEX_OUT\classes.dex" $STAGE "$OUT\merged.apk"
if ($LASTEXITCODE -ne 0) { throw "merge_apk failed" }
Write-Host "合并 assets/dex 完成"

# ---- 8) zipalign 对齐 ----
& "$BT\zipalign.exe" -f 4 "$OUT\merged.apk" "$OUT\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }
Write-Host "zipalign 完成"

# ---- 9) 签名 ----
if (-not (Test-Path $KEPT)) {
    & keytool -genkeypair -v -keystore $KEPT -alias workbench -keyalg RSA -keysize 2048 -validity 10000 -storepass workbench123 -keypass workbench123 -dname "CN=Study Workbench, OU=Local, O=Personal, L=Local, ST=Local, C=CN"
    Write-Host "已生成签名密钥 $KEPT"
}
& "$BT\apksigner.bat" sign --ks $KEPT --ks-pass pass:workbench123 --out $SIGNED "$OUT\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "apksigner sign failed" }
& "$BT\apksigner.bat" verify --print-certs $SIGNED | Select-Object -First 3
Write-Host "签名验证完成"

# ---- 10) 复制回项目路径 ----
Copy-Item -Path $SIGNED -Destination $FINAL_APK -Force
Write-Host "APK 生成: $FINAL_APK"
Get-Item $FINAL_APK | Select-Object Name, Length, LastWriteTime
