# 星途 · 派活固定前言（每条子代理指令必须整段复制进 prompt）

```
你正在接手「星途」（原学习工作台）项目。这是一个**多页静态 HTML + assets/*.js 原生 JS** 的站点，
无框架、无 CDN、无打包、无构建步骤。页面跑在**安卓 APK 的老 WebView**里，内核约 Chrome 50~58。

【唯一可写代码树】
D:\下载的文件\学习工作台
⛔ 绝对不要碰 C:\Users\ATM\WorkBuddy\Worktrees\...（那是废弃副本，改了等于全部白干）
所有读写一律用 D:\ 绝对路径。

【铁律 · 违反会整页白屏，本项目已因此出过两次全站事故】
1. ES2017 上限。以下语法一律禁止：
   ?.   ??   .replaceAll(   Object.fromEntries   .at(   顶层 await
   正则后行断言 (?<= (?<!   对象展开 {...obj}   对象剩余解构 {a,...rest}
   指数 **   可选 catch 绑定 catch {}
   ⚠️ node --check 抓不到这些，必须用 Grep 逐项确认 0 命中。
   ⚠️ 两个已验证误报，别当 bug 改：
      · ** 出现在引号内是 markdown 字符串（如 '**一、核心考点**'），不是指数
      · ... 出现在 [ 之后是合法数组展开；只有出现在 { 之后才是禁用的对象展开
   允许：let/const、箭头函数、模板字符串、class、async/await（非顶层）、数组展开、Math.max(1, ...arr)
2. 禁止用 var/const/let 重复声明别的文件已存在的全局名 —— 浏览器会判该文件 SyntaxError 并整文件拒绝执行
   （这是历史上「AI 功能集体失效」的真凶）。新增全局一律写成：
   if (typeof window.xxx !== 'function') window.xxx = function () { ... };
3. 禁原生 alert/confirm/prompt，用页面内 toast（window.xtToast）或页面内区块。
4. 波内任务一律 **不 bump** 版本戳（?v=）。bump 是波末单点统一执行，会重写 39 个 HTML，是全局互斥锁。
5. 共享文件同一时刻只允许一条线改：assets/app.js（33 页）、assets/api.js（30 页）、assets/common.css（全站）。
   你只许改本任务书列出的独占文件，**越界即打回**。
6. 换行符必须保持（改混了会造成整文件 diff）：
   CRLF：全部根 HTML、assets/app.js、assets/api.js、assets/common.css、icon-map.js、ai-config.js、xt-content.js
   LF  ：assets/ai-service.js、assets/ai-page.js、assets/ppt-works.js、assets/notify.js
   改前先测：open(p,'rb').read().count(b'\r\n') 对比 .count(b'\n') - .count(b'\r\n')
7. 判「哪些文件被动过」只能用 mtime（本批开工时刻 = 2026-09-16 13:30），不要用 git
   （本仓库 HEAD 很旧，git status 会列出几十个更早批次改的文件，极具误导）。
8. 改文件前先备份（命名含 bak，部署脚本会自动跳过）；文件重命名用 os.rename，禁 git mv。
9. 不删现有功能、保留既有 DOM id 与全局函数名（外部页面可能引用）。
10. 数据质量红线：内容全部原创（不抄真题原文）；宁少而准，严禁臆造。

【本机环境坑 · 会让你白浪费大量时间】
- bash 缺 coreutils：ls / grep / head / tail / wc / dirname / env / rm 全部不存在。
  → 一律写 python 脚本文件再执行（不要用 python -c 单行，正则里的引号会被 shell 吃掉导致 SyntaxError），
    或用 Read/Grep/Glob 工具；命令一律写绝对路径。
- Windows 中文路径 + python 控制台：print 中文会 GBK 崩溃 → 结果一律写 UTF-8 文件，再用 Read 工具读。
- len(str) 是字符数不是字节数 —— 量字节用 len(open(p,'rb').read())。
- python = C:/Users/ATM/.workbuddy/binaries/python/versions/3.13.12/python.exe
- node   = C:/Users/ATM/.workbuddy/binaries/node/versions/22.22.2-3/node.exe
- 跑页面体检必须显式指定没被占用的 QA_PORT（8911~8920），逼脚本自启内置 Node 服务；
  否则它会复用你手工起的 python -m http.server，把所有 assets/*.js?v= 报成加载失败 ——
  看着像全站 js 崩了，其实是噪声。输出头必须显示「本脚本自启的本地静态服务」才可信。

【工作方式 · 用户明确要求，最高优先级】
命令/脚本**各跑一次即判定**，不要反复回跑、不要多轮回读自审。
发现问题直接给结论 + 建议，不要为了"再确认一下"多跑几轮。

【开工前先跑这把总闸（确认基线未被破坏）】
node "D:/下载的文件/学习工作台/tools/qa/escheck_es2017.js"     → 期望 DONE 0

【完工后必须做的自检清单】
- [ ] 改动过的 js 跑 node --check（rc=0）
- [ ] node tools/qa/escheck_es2017.js = DONE 0
- [ ] <!--/--> 配对相等、<div/</div> 配对相等、<script/</script> 配对相等
- [ ] 无上述禁用语法（node --check 抓不到，必须 Grep）
- [ ] 原生 alert(/confirm(/prompt( = 0
- [ ] 改过的文件换行符未被改混
- [ ] 未越界改动任何非独占文件（可用 mtime 自查）

【回报要求】
完成后必须用 SendMessage 给 team-lead 发送回报，内容包含：
① 任务编号 + 状态（DONE / PARTIAL / BLOCKED）
② 改动的文件清单（含路径 + 改动前后字节数 + mtime）
③ 自检清单逐项结果（PASS/FAIL）
④ 交付物说明（做了什么、验收口径怎么满足的）
⑤ 遗留问题 / 未做项 / 需要主理人裁决的点
不要调用 TaskList/TaskUpdate 等工具，直接干活。
```

---

## 附：本次 Wave 0-Plus 的 13 线独占文件矩阵（零重叠，已校验）

| 线 | 任务 | 独占文件 |
|---|---|---|
| A1 | 需求 D · ai-service.js 复核收尾 | `assets/ai-service.js` |
| A2 | 需求 C · AI 页输入框+模型按钮 | `AI.html`、`assets/ai-page.js` |
| A3 | N9-11 阅读理解布局 | `assets/cet-read.js` |
| A4 | N9-19 模拟面试重构 | `AI模拟面试.html`、`assets/iv-prep.js` |
| A5 | N9-14 PPT 训练（部分）复核 | `assets/ppt-tips.js` |
| A6 | C18 错题本 AI 分析 | `错题本.html` |
| A7 | N9-4 个人中心作品集 + B1 | `个人中心.html` |
| A8 | N9-22A 学习概括页 + N9-3 notify.js | `学习概括.html`、`assets/notify.js` |
| B1 | N9-18 听力精听改版 | `assets/voiceplayer.js`、`英语.html` |
| B2 | N9-12 PPT 版式库升级 | `PPT版式库.html`、`assets/data-ppt-templates.js`、`assets/tpl-preview.js` |
| B3 | C12 申论批改 | `申论刷题.html` |
| B4 | N9-15 我的文章布局 | `blog_wechat.html`、`assets/common.css` |
| B5 | N9-14 剩余部分 | `演示.html`、`assets/data-ppt-tips.js` |
| B6 | C8 · fetchAiReply 委托 callAI | `assets/app.js` |
