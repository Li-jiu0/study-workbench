# -*- coding: utf-8 -*-
"""生成一组「故意写坏」的夹具，用来反向验证 wave_check 能抓到问题。
夹具只落在 tools/qa/_selftest/ 下，不碰任何业务文件。"""
import os, io

D = os.path.join(r"D:\下载的文件\学习工作台", "tools", "qa", "_selftest")
os.makedirs(D, exist_ok=True)

bad_js = """// 故意写坏的 JS，仅用于反向验证 wave_check
var tips = "你要??吗";            // 字符串里的 ?? —— 不应误报
var re = /a\\?\\.b/;              // 正则里的 ?. —— 不应误报
/* 文档注释 ** 星号 ** —— 不应误报 */
var n = 2**3;                     // 指数 —— 应报
var a = obj?.b;                   // 可选链 —— 应报
var c = d ?? e;                   // 空值合并 —— 应报
var f = "x".replaceAll("x","y");  // replaceAll —— 应报
var g = Object.fromEntries(p);    // fromEntries —— 应报
var h = arr.at(-1);               // .at( —— 应报
var i = /(?<=a)b/;                // 后行断言 —— 应报
var j = {...obj};                 // 对象展开 —— 应报
var {k, ...rest} = obj;           // 对象剩余 —— 应报
try { q(); } catch { }            // 可选 catch 绑定 —— 应报
await fetch("/api");              // 顶层 await —— 应报
showConfirm("自定义弹窗");         // 自定义前缀 —— 不应误报
window.xtToast.alert("合规");      // 合规 —— 不应误报
window.alert("原生弹窗");          // 原生 —— 应报
"""

bad_html = """<!DOCTYPE html>
<html>
<head><title>bad</title></head>
<body>
<div class="wrap">
  <div><span id="s1">hi</span></div>
  <script src="assets/app.js?v=20260916L"class="x"></script>
  <script>
    var n = 2**3;
    var a = obj?.b;
    var c = d ?? e;
    alert("原生弹窗");
  </script>
  <button onclick="confirm('确定?')">go</button>
</div>
</body>
</html>
"""

good_html = """<!DOCTYPE html>
<html>
<head><title>good</title></head>
<body>
<div class="wrap">
  <span id="s1">hi</span>
  <script src="assets/app.js?v=20260916L" class="x"></script>
  <script>
    var t = "你要??吗";
    var u = /a\\?\\.b/;
    function f(){ return 1; }
  </script>
</div>
</body>
</html>
"""

with io.open(os.path.join(D, "_bad.js"), "w", encoding="utf-8", newline="\n") as fh:
    fh.write(bad_js)
with io.open(os.path.join(D, "_bad.html"), "w", encoding="utf-8", newline="\n") as fh:
    fh.write(bad_html.replace("<title>bad</title>", "<title>bad</title>\n<div>"))  # 故意多一个开标签
with io.open(os.path.join(D, "_good.html"), "w", encoding="utf-8", newline="\r\n") as fh:
    fh.write(good_html)

print("FIXTURE OK", D)
