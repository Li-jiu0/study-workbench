// 故意写坏的 JS，仅用于反向验证 wave_check
var tips = "你要??吗";            // 字符串里的 ?? —— 不应误报
var re = /a\?\.b/;              // 正则里的 ?. —— 不应误报
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
