# 星途全项目 Bug 排查报告 (v132, 只读)

- 时间: 2026-09-20T06:33:53.094555
- 范围: 根目录全部 HTML + assets/*.js (排除 .bak/.backup)
- 原则: 只查不修, 未改动任何业务文件
- 扫描文件: 71 个 JS, 50 个 HTML

## 汇总

| 等级 | 数量 | 含义 |
|------|------|------|
| P0 | 0 | 白屏/整文件报废(老WebView) |
| P1 | 95 | 功能坏/死链/解引用崩溃 |
| P2 | 1059 | 体验/隐患 |


## P1 级发现

| 位置 | 说明 | 建议修法 |
|------|------|----------|
| `AI模拟面试.html:751(var) / assets/app.js:4888(const)` | 全局名「INTERVIEW_QUESTIONS」在 2 个文件重复声明 [RISK] | 改为 window.INTERVIEW_QUESTIONS 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `AI模拟面试.html:854(var) / assets/app.js:2832(let)` | 全局名「toastTimer」在 2 个文件重复声明 [RISK] | 改为 window.toastTimer 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/app.js:338(const) / 登录.html:283(var)` | 全局名「AUTH_KEY」在 2 个文件重复声明 [RISK] | 改为 window.AUTH_KEY 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/app.js:339(const) / 登录.html:284(var)` | 全局名「USERS_KEY」在 2 个文件重复声明 [RISK] | 改为 window.USERS_KEY 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `blog_wechat.html:387` | onclick 调用疑似未定义函数: openQuest (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `mock_exam.html:237` | onclick 调用疑似未定义函数: switchMockTab (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `mock_exam.html:327` | 死链/缺失跳转目标: mock_exam_run.html?paper= (a.href) | 补全目标页或修正路径 |
| `mock_exam.html:330` | 死链/缺失跳转目标: mock_exam_result.html?paper= (a.href) | 补全目标页或修正路径 |
| `mock_exam.html:331` | 死链/缺失跳转目标: mock_exam_run.html?paper= (a.href) | 补全目标页或修正路径 |
| `mock_exam.html:334` | 死链/缺失跳转目标: mock_exam_run.html?paper= (a.href) | 补全目标页或修正路径 |
| `个人中心.html:287` | onclick 调用疑似未定义函数: xtOpenRegionPicker (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `个人中心.html:315` | onclick 调用疑似未定义函数: peAddTag (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `个人中心.html:693` | onclick 调用疑似未定义函数: peToggleTag (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `好友申请.html:112` | onclick 调用疑似未定义函数: afOpenChat (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `好友申请.html:141` | onclick 调用疑似未定义函数: actRequest (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `好友申请.html:55` | onclick 调用疑似未定义函数: doSearch (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `好友申请.html:96` | getElementById 结果未判空直接解引用: var kw = (document.getElementById('q').value || '').trim(); | 先判空 if(el) 再操作, 防元素缺失抛 TypeError |
| `学习工作台.html:202` | onclick 调用疑似未定义函数: closeXtTaskModal (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `学习工作台.html:203` | onclick 调用疑似未定义函数: saveXtTask (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `学习工作台.html:752` | onclick 调用疑似未定义函数: openXtTaskModal (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `学途.html:273` | onclick 调用疑似未定义函数: xtTask (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `学途.html:297` | onclick 调用疑似未定义函数: xtContinue (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `学途.html:303` | onclick 调用疑似未定义函数: xtListen (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `学途.html:339` | onclick 调用疑似未定义函数: xtDelSubject (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `学途.html:356` | onclick 调用疑似未定义函数: openVoiceTrain (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `学途.html:364` | onclick 调用疑似未定义函数: xtAddSubject (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `学途.html:405` | onclick 调用疑似未定义函数: xtPickReason (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `学途.html:467` | onclick 调用疑似未定义函数: xtNoteFilter (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `学途.html:533` | onclick 调用疑似未定义函数: xtSetGoal (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `学途.html:534` | onclick 调用疑似未定义函数: xtDelGoal (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `学途.html:557` | onclick 调用疑似未定义函数: xtAddGoal (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `我的文件.html:158` | onclick 调用疑似未定义函数: xtFilesAdd (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `我的文件.html:293` | onclick 调用疑似未定义函数: xtFolioCloseAdd (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `我的文件.html:324` | onclick 调用疑似未定义函数: xtFolioSave (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `我的文件.html:332` | onclick 调用疑似未定义函数: xtFolioCloseView (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `我的文件.html:337` | onclick 调用疑似未定义函数: xtFolioNav (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `我的文件.html:347` | onclick 调用疑似未定义函数: xtFolioToggleFav (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `申论刷题.html:1681` | getElementById 结果未判空直接解引用: document.getElementById('slSheetOv').classList.remove('on'); break; | 先判空 if(el) 再操作, 防元素缺失抛 TypeError |
| `登录.html:437` | getElementById 结果未判空直接解引用: var v = document.getElementById('loginPass').value; | 先判空 if(el) 再操作, 防元素缺失抛 TypeError |
| `登录.html:447` | getElementById 结果未判空直接解引用: document.getElementById('sTxt').textContent = names[s] || ''; | 先判空 if(el) 再操作, 防元素缺失抛 TypeError |
| `登录.html:451` | getElementById 结果未判空直接解引用: var p = document.getElementById('loginPass').value; | 先判空 if(el) 再操作, 防元素缺失抛 TypeError |
| `登录.html:452` | getElementById 结果未判空直接解引用: var c = document.getElementById('loginConfirm').value; | 先判空 if(el) 再操作, 防元素缺失抛 TypeError |
| `登录.html:457` | getElementById 结果未判空直接解引用: function markInput(id, bad) { document.getElementById(id).classList.toggle('bad', !!bad); } | 先判空 if(el) 再操作, 防元素缺失抛 TypeError |
| `登录.html:460` | getElementById 结果未判空直接解引用: document.getElementById('loginAccount').addEventListener('keydown', function (e) { if (e.key === 'Enter') document.getEl | 先判空 if(el) 再操作, 防元素缺失抛 TypeError |
| `登录.html:461` | getElementById 结果未判空直接解引用: document.getElementById('loginPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitLogin(); }) | 先判空 if(el) 再操作, 防元素缺失抛 TypeError |
| `登录.html:462` | getElementById 结果未判空直接解引用: document.getElementById('loginConfirm').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitLogin(); | 先判空 if(el) 再操作, 防元素缺失抛 TypeError |
| `社区.html:226` | onclick 调用疑似未定义函数: edRestoreDraft (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `社区.html:227` | onclick 调用疑似未定义函数: edDiscardDraft (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `社区.html:233` | onclick 调用疑似未定义函数: edInsertTemplate (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `社区.html:318` | onclick 调用疑似未定义函数: blogPickLoc (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `社区.html:319` | onclick 调用疑似未定义函数: blogClearLoc (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `私聊.html:167` | onclick 调用疑似未定义函数: imDoSearch (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `私聊.html:172` | onclick 调用疑似未定义函数: imSwitchTab (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `私聊.html:185` | onclick 调用疑似未定义函数: xtOpenAdminChat (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `私聊.html:199` | onclick 调用疑似未定义函数: imBackList (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `私聊.html:203` | onclick 调用疑似未定义函数: imOpenGroupSettings (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `私聊.html:220` | onclick 调用疑似未定义函数: imToggleEmoji (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `私聊.html:229` | onclick 调用疑似未定义函数: imTogglePlusMenu (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `私聊.html:246` | onclick 调用疑似未定义函数: imPlusPickImage (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `私聊.html:247` | onclick 调用疑似未定义函数: imPlusPickCamera (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `私聊.html:248` | onclick 调用疑似未定义函数: imPlusPickFile (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `私聊.html:249` | onclick 调用疑似未定义函数: imPlusPickLocation (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `私聊.html:251` | onclick 调用疑似未定义函数: imPlusPickVoice (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `私聊.html:254` | onclick 调用疑似未定义函数: imPlusPickLiveLoc (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `私聊.html:256` | onclick 调用疑似未定义函数: imSendText (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `私聊.html:276` | onclick 调用疑似未定义函数: imCloseGroupSettings (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `私聊.html:295` | onclick 调用疑似未定义函数: acClose (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `私聊.html:300` | onclick 调用疑似未定义函数: acSend (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `私聊.html:389` | onclick 调用疑似未定义函数: imCloseGroupCreator (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `管理员.html:155` | onclick 调用疑似未定义函数: admSwitchTab (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `管理员.html:159` | onclick 调用疑似未定义函数: admRefresh (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `英语.html:163` | onclick 调用疑似未定义函数: openCetQuizView (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `英语.html:173` | 死链/缺失跳转目标: mock_exam.html?cat=cet-mock (location.href) | 补全目标页或修正路径 |
| `英语.html:382` | onclick 调用疑似未定义函数: closeCetQuizView (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `行测.html:126` | onclick 调用疑似未定义函数: encodeURI (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `行测.html:146` | 死链/缺失跳转目标: mock_exam.html?cat=exam-mock (location.href) | 补全目标页或修正路径 |
| `行测刷题.html:141` | onclick 调用疑似未定义函数: openQBank (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `表达.html:227` | onclick 调用疑似未定义函数: openGqCasesView (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `表达.html:232` | onclick 调用疑似未定义函数: openGqIpartnerView (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `表达.html:324` | onclick 调用疑似未定义函数: closeGqCasesView (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `表达.html:334` | onclick 调用疑似未定义函数: closeGqIpartnerView (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `表达.html:340` | onclick 调用疑似未定义函数: switchGqIpTab (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `设置.html:540` | onclick 调用疑似未定义函数: fbToggleFaq (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `设置.html:590` | onclick 调用疑似未定义函数: fbSubmit (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `设置.html:607` | onclick 调用疑似未定义函数: cfPickType (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `设置.html:618` | onclick 调用疑似未定义函数: cfSubmit (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `错题本.html:142` | onclick 调用疑似未定义函数: xtWbAnalyzeModule (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `面测.html:122` | onclick 调用疑似未定义函数: ivQuizNext (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `面测.html:123` | onclick 调用疑似未定义函数: ivQuizSubmit (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `面测.html:124` | onclick 调用疑似未定义函数: ivQuizShowTip (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `面测.html:131` | onclick 调用疑似未定义函数: ivEndInterview (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `面测.html:137` | onclick 调用疑似未定义函数: ivAiSend (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `面测.html:148` | onclick 调用疑似未定义函数: ivPrepAfterEnter (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `面测.html:159` | onclick 调用疑似未定义函数: ivGroupEnter (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |
| `面测.html:304` | onclick 调用疑似未定义函数: ivGroupTab (跨文件未找到定义) | 确认函数已定义或在对应页面引入脚本 |

## P2 级发现

| 位置 | 说明 | 建议修法 |
|------|------|----------|
| `AI.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `AI.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `AI.html:607` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `AI.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `AI.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `AI.html:974` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `AI.html:975` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `AI.html:976` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `AI.html:977` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `AI.html:978` | 引用的本地资源不存在: assets/quest.js?v=20260916O | 补文件或修正引用路径 |
| `AI.html:979` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `AI.html:980` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `AI.html:981` | 引用的本地资源不存在: assets/study-stats.js?v=20260916O | 补文件或修正引用路径 |
| `AI.html:982` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `AI.html:983` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `AI.html:984` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `AI.html:985` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `AI.html:986` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `AI.html:987` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `AI.html:988` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `AI.html:989` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `AI.html:990` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `AI.html:991` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `AI.html:992` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `AI.html:993` | 引用的本地资源不存在: assets/ai-page.js?v=20260920c | 补文件或修正引用路径 |
| `AI模拟面试.html:1937(function) / PPT素材库.html:629(function) / mock_exam.html:533(function) / mock_exam_result.html:330(function) / mock_exam_run.html:882(function) / 四级经验分享.html:607(function)` | 全局名「goBack」在 6 个文件重复声明 [WARN] | 改为 window.goBack 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `AI模拟面试.html:2063` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `AI模拟面试.html:2064` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `AI模拟面试.html:2065` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `AI模拟面试.html:2066` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `AI模拟面试.html:2067` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `AI模拟面试.html:2068` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `AI模拟面试.html:2069` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `AI模拟面试.html:2070` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `AI模拟面试.html:2071` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `AI模拟面试.html:2072` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `AI模拟面试.html:2073` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `AI模拟面试.html:591` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `AI模拟面试.html:7` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `AI模拟面试.html:724` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `AI模拟面试.html:725` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `PPT案例拆解.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `PPT案例拆解.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `PPT案例拆解.html:12` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `PPT案例拆解.html:237` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `PPT案例拆解.html:238` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `PPT案例拆解.html:239` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `PPT案例拆解.html:240` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `PPT案例拆解.html:241` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `PPT案例拆解.html:242` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `PPT案例拆解.html:244` | 引用的本地资源不存在: assets/qbank.js?v=20260916O | 补文件或修正引用路径 |
| `PPT案例拆解.html:245` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `PPT案例拆解.html:246` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `PPT案例拆解.html:247` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `PPT案例拆解.html:248` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `PPT案例拆解.html:249` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `PPT案例拆解.html:250` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `PPT案例拆解.html:251` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `PPT案例拆解.html:252` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `PPT案例拆解.html:253` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `PPT案例拆解.html:254` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `PPT案例拆解.html:255` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `PPT案例拆解.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `PPT案例拆解.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `PPT版式库.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `PPT版式库.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `PPT版式库.html:12` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `PPT版式库.html:255` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `PPT版式库.html:256` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `PPT版式库.html:257` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `PPT版式库.html:258` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `PPT版式库.html:259` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `PPT版式库.html:260` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `PPT版式库.html:262` | 引用的本地资源不存在: assets/qbank.js?v=20260916O | 补文件或修正引用路径 |
| `PPT版式库.html:263` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `PPT版式库.html:264` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `PPT版式库.html:265` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `PPT版式库.html:266` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `PPT版式库.html:267` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `PPT版式库.html:268` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `PPT版式库.html:269` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `PPT版式库.html:270` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `PPT版式库.html:271` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `PPT版式库.html:272` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `PPT版式库.html:273` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `PPT版式库.html:279` | 引用的本地资源不存在: assets/data-ppt-templates.js?v=20260916O | 补文件或修正引用路径 |
| `PPT版式库.html:280` | 引用的本地资源不存在: assets/tpl-preview.js?v=20260916O | 补文件或修正引用路径 |
| `PPT版式库.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `PPT版式库.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `PPT素材库.html:395` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `PPT素材库.html:624` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `PPT素材库.html:625` | 引用的本地资源不存在: assets/icon-map.js?v=20260916O | 补文件或修正引用路径 |
| `ai-settings.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `ai-settings.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `ai-settings.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `ai-settings.html:850` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `ai-settings.html:851` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `ai-settings.html:852` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `ai-settings.html:853` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `ai-settings.html:854` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `ai-settings.html:855` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `ai-settings.html:856` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `ai-settings.html:860` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `ai-settings.html:861` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `ai-settings.html:862` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `ai-settings.html:863` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `ai-settings.html:864` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `ai-settings.html:865` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `ai-settings.html:866` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `ai-settings.html:867` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `ai-settings.html:868` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `ai-settings.html:869` | 引用的本地资源不存在: assets/ai-settings.js?v=20260920c | 补文件或修正引用路径 |
| `ai-settings.html:870` | 引用的本地资源不存在: assets/xt-aiusage.js?v=20260918f | 补文件或修正引用路径 |
| `ai-settings.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/admin-contact.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/admin.css | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/ai-cap-3d.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/ai-cap-audio.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/ai-cap-embed.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/ai-cap-image.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/ai-cap-registry.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/ai-cap-translate.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/ai-cap-video.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/ai-cap-vision.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/cet-read.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/cet-translate.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/comm-cases.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/company-lib.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/data-cet-read.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/data-cet-translate.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/data-comm-cases.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/data-exam-company.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/data-iv-after.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/data-iv-prep.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/data-ppt-templates.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/data/shenlun-inline.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/iv-after.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/iv-prep.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/mock-engine.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/mock-result.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/roleplay.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/tpl-preview.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/xt-aiusage.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/xt-content.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/xt-region.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/xt-update.js | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/赞助收款码.jpg | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets` | HTML 引用但不在 APK 白名单(防删盲点): assets/赞助收款码2.jpg | 若为核心运行时JS, 加入 REQUIRED_ASSETS |
| `assets/api.js:1085(function) / assets/app.js:8744(function)` | 全局名「quickSelectModel」在 2 个文件重复声明 [WARN] | 改为 window.quickSelectModel 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:1134(function) / assets/app.js:8926(function)` | 全局名「saveAiProviderForm」在 2 个文件重复声明 [WARN] | 改为 window.saveAiProviderForm 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:1139(function) / assets/app.js:8946(function)` | 全局名「testAiConnection」在 2 个文件重复声明 [WARN] | 改为 window.testAiConnection 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:1145(function) / assets/app.js:3135(function)` | 全局名「clearAiProviderConfig」在 2 个文件重复声明 [WARN] | 改为 window.clearAiProviderConfig 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:1281(implicit) / assets/app.js:3158(let)` | 全局名「aiChatHistory」在 2 个文件重复声明 [WARN] | 改为 window.aiChatHistory 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:129(function) / 登录.html:304(function)` | 全局名「apiTryRefresh」在 2 个文件重复声明 [WARN] | 改为 window.apiTryRefresh 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:251(function) / assets/app.js:8521(function)` | 全局名「updateProfileUI」在 2 个文件重复声明 [WARN] | 改为 window.updateProfileUI 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:261(function) / assets/app.js:8177(function)` | 全局名「renderProfilePage」在 2 个文件重复声明 [WARN] | 改为 window.renderProfilePage 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:401(function) / assets/app.js:8426(function)` | 全局名「editProfile」在 2 个文件重复声明 [WARN] | 改为 window.editProfile 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:409(function) / assets/app.js:8453(function)` | 全局名「renderPeAvatarPreview」在 2 个文件重复声明 [WARN] | 改为 window.renderPeAvatarPreview 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:415(function) / assets/app.js:8462(function)` | 全局名「onProfileAvatarFile」在 2 个文件重复声明 [WARN] | 改为 window.onProfileAvatarFile 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:429(function) / assets/app.js:8496(function)` | 全局名「resetProfileAvatar」在 2 个文件重复声明 [WARN] | 改为 window.resetProfileAvatar 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:435(function) / assets/app.js:8500(function)` | 全局名「saveProfileEditor」在 2 个文件重复声明 [WARN] | 改为 window.saveProfileEditor 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:446(function) / assets/app.js:8511(function)` | 全局名「closeProfileEditor」在 2 个文件重复声明 [WARN] | 改为 window.closeProfileEditor 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:451(function) / assets/app.js:505(function)` | 全局名「doLogout」在 2 个文件重复声明 [WARN] | 改为 window.doLogout 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:456(function) / assets/app.js:517(function)` | 全局名「closeLogoutConfirm」在 2 个文件重复声明 [WARN] | 改为 window.closeLogoutConfirm 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:459(function) / assets/app.js:520(function)` | 全局名「confirmLogout」在 2 个文件重复声明 [WARN] | 改为 window.confirmLogout 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:462(function) / assets/app.js:7565(function)` | 全局名「blogLocChipHtml」在 2 个文件重复声明 [WARN] | 改为 window.blogLocChipHtml 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:469(function) / assets/app.js:7571(function)` | 全局名「noteCardHtml」在 2 个文件重复声明 [WARN] | 改为 window.noteCardHtml 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:507(function) / assets/app.js:7672(function)` | 全局名「renderBlogList」在 2 个文件重复声明 [WARN] | 改为 window.renderBlogList 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:548(function) / assets/app.js:7729(function)` | 全局名「renderBlogMine」在 2 个文件重复声明 [WARN] | 改为 window.renderBlogMine 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:568(implicit) / assets/app.js:7473(let)` | 全局名「blogMineType」在 2 个文件重复声明 [WARN] | 改为 window.blogMineType 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:611(function) / assets/app.js:7742(function)` | 全局名「openBlogDetail」在 2 个文件重复声明 [WARN] | 改为 window.openBlogDetail 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:614(implicit) / assets/app.js:7476(let)` | 全局名「currentNoteId」在 2 个文件重复声明 [WARN] | 改为 window.currentNoteId 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:619(function) / assets/app.js:7822(function)` | 全局名「renderBlogDetail」在 2 个文件重复声明 [WARN] | 改为 window.renderBlogDetail 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:749(function) / assets/app.js:7874(function)` | 全局名「toggleNoteLike」在 2 个文件重复声明 [WARN] | 改为 window.toggleNoteLike 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:757(function) / assets/app.js:7879(function)` | 全局名「toggleNoteFavorite」在 2 个文件重复声明 [WARN] | 改为 window.toggleNoteFavorite 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:780(function) / assets/app.js:7886(function)` | 全局名「addBlogComment」在 2 个文件重复声明 [WARN] | 改为 window.addBlogComment 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:793(function) / assets/app.js:7894(function)` | 全局名「deleteBlogComment」在 2 个文件重复声明 [WARN] | 改为 window.deleteBlogComment 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:803(function) / assets/app.js:8055(function)` | 全局名「startEditNote」在 2 个文件重复声明 [WARN] | 改为 window.startEditNote 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:806(implicit) / assets/app.js:7477(let)` | 全局名「editingNoteId」在 2 个文件重复声明 [WARN] | 改为 window.editingNoteId 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:818(function) / assets/app.js:8011(function)` | 全局名「saveBlogNote」在 2 个文件重复声明 [WARN] | 改为 window.saveBlogNote 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:840(function) / assets/app.js:7930(function)` | 全局名「archiveNote」在 2 个文件重复声明 [WARN] | 改为 window.archiveNote 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:844(function) / assets/app.js:7931(function)` | 全局名「unarchiveNote」在 2 个文件重复声明 [WARN] | 改为 window.unarchiveNote 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:848(function) / assets/app.js:7932(function)` | 全局名「deleteNote」在 2 个文件重复声明 [WARN] | 改为 window.deleteNote 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:877(function) / assets/app.js:8141(function)` | 全局名「renderBlogStats」在 2 个文件重复声明 [WARN] | 改为 window.renderBlogStats 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:903(function) / assets/app.js:7903(function)` | 全局名「exportCurrentNoteMd」在 2 个文件重复声明 [WARN] | 改为 window.exportCurrentNoteMd 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:910(function) / assets/app.js:7910(function)` | 全局名「exportAllNotesMd」在 2 个文件重复声明 [WARN] | 改为 window.exportAllNotesMd 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:922(function) / assets/app.js:7995(function)` | 全局名「editorInsertImage」在 2 个文件重复声明 [WARN] | 改为 window.editorInsertImage 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:942(function) / assets/app.js:8591(function)` | 全局名「globalSearch」在 2 个文件重复声明 [WARN] | 改为 window.globalSearch 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:990(function) / assets/app.js:3700(function)` | 全局名「sendAiMsg」在 2 个文件重复声明 [WARN] | 改为 window.sendAiMsg 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/api.js:993(implicit) / assets/app.js:3159(let)` | 全局名「aiStreaming」在 2 个文件重复声明 [WARN] | 改为 window.aiStreaming 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/app.js:7076(let) / 四级词汇.html:308(implicit)` | 全局名「vocabCurrentIndex」在 2 个文件重复声明 [WARN] | 改为 window.vocabCurrentIndex 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `assets/app.js:7080(let) / 四级词汇.html:298(implicit)` | 全局名「vocabModeList」在 2 个文件重复声明 [WARN] | 改为 window.vocabModeList 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `blog_wechat.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `blog_wechat.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `blog_wechat.html:12` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `blog_wechat.html:365` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `blog_wechat.html:366` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `blog_wechat.html:367` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `blog_wechat.html:368` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `blog_wechat.html:369` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `blog_wechat.html:393` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `blog_wechat.html:394` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `blog_wechat.html:395` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `blog_wechat.html:396` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918d | 补文件或修正引用路径 |
| `blog_wechat.html:397` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `blog_wechat.html:398` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `blog_wechat.html:399` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `blog_wechat.html:400` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `blog_wechat.html:401` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `blog_wechat.html:402` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `blog_wechat.html:403` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `blog_wechat.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `blog_wechat.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `live-location.html:45` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `live-location.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `mock_exam.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `mock_exam.html:11` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `mock_exam.html:13` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `mock_exam.html:14` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `mock_exam.html:15` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `mock_exam.html:16` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `mock_exam.html:18` | 引用的本地资源不存在: assets/mock-engine.js?v=20260916O | 补文件或修正引用路径 |
| `mock_exam.html:20` | 引用的本地资源不存在: assets/mini-cet.js?v=20260916O | 补文件或修正引用路径 |
| `mock_exam.html:21` | 引用的本地资源不存在: assets/mini-exam.js?v=20260916O | 补文件或修正引用路径 |
| `mock_exam.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `mock_exam.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `mock_exam_result.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `mock_exam_result.html:11` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `mock_exam_result.html:13` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `mock_exam_result.html:14` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `mock_exam_result.html:15` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `mock_exam_result.html:16` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `mock_exam_result.html:18` | 引用的本地资源不存在: assets/mock-engine.js?v=20260916O | 补文件或修正引用路径 |
| `mock_exam_result.html:19` | 引用的本地资源不存在: assets/mock-result.js?v=20260916O | 补文件或修正引用路径 |
| `mock_exam_result.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `mock_exam_result.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `mock_exam_run.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `mock_exam_run.html:11` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `mock_exam_run.html:13` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `mock_exam_run.html:14` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `mock_exam_run.html:15` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `mock_exam_run.html:16` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `mock_exam_run.html:18` | 引用的本地资源不存在: assets/mock-engine.js?v=20260916O | 补文件或修正引用路径 |
| `mock_exam_run.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `mock_exam_run.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `万能金句库.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `万能金句库.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `万能金句库.html:12` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `万能金句库.html:249` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `万能金句库.html:250` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `万能金句库.html:251` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `万能金句库.html:252` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `万能金句库.html:253` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `万能金句库.html:254` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `万能金句库.html:256` | 引用的本地资源不存在: assets/qbank.js?v=20260916O | 补文件或修正引用路径 |
| `万能金句库.html:257` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `万能金句库.html:258` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `万能金句库.html:259` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `万能金句库.html:260` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `万能金句库.html:261` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `万能金句库.html:262` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `万能金句库.html:263` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `万能金句库.html:264` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `万能金句库.html:265` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `万能金句库.html:266` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `万能金句库.html:267` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `万能金句库.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `万能金句库.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `个人中心.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `个人中心.html:1091` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `个人中心.html:1092` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `个人中心.html:1093` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `个人中心.html:1094` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `个人中心.html:1095` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `个人中心.html:1096` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `个人中心.html:1097` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `个人中心.html:1098` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `个人中心.html:1099` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `个人中心.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `个人中心.html:1100` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `个人中心.html:1101` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `个人中心.html:510` | 引用的本地资源不存在: assets/xt-settings.js?v=20260916O | 补文件或修正引用路径 |
| `个人中心.html:511` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `个人中心.html:513` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `个人中心.html:514` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `个人中心.html:515` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `个人中心.html:516` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `个人中心.html:517` | 引用的本地资源不存在: assets/quest.js?v=20260916O | 补文件或修正引用路径 |
| `个人中心.html:518` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `个人中心.html:519` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `个人中心.html:520` | 引用的本地资源不存在: assets/subpage-router.js?v=20260917b | 补文件或修正引用路径 |
| `个人中心.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `个人中心.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `个人资料.html:19` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `个人资料.html:20` | 引用的本地资源不存在: assets/xt-profile.css?v=20260919b | 补文件或修正引用路径 |
| `个人资料.html:47` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `个人资料.html:48` | 引用的本地资源不存在: assets/config.js?v=20260917 | 补文件或修正引用路径 |
| `个人资料.html:52` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `个人资料.html:53` | 引用的本地资源不存在: assets/xt-settings.js?v=20260917 | 补文件或修正引用路径 |
| `个人资料.html:54` | 引用的本地资源不存在: assets/xt-profile.js?v=20260919b | 补文件或修正引用路径 |
| `企业定向库.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `企业定向库.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `企业定向库.html:126` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `企业定向库.html:349` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `企业定向库.html:350` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `企业定向库.html:351` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `企业定向库.html:352` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `企业定向库.html:353` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `企业定向库.html:354` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `企业定向库.html:355` | 引用的本地资源不存在: assets/mini-exam.js?v=20260916O | 补文件或修正引用路径 |
| `企业定向库.html:357` | 引用的本地资源不存在: assets/data-exam-company.js?v=20260916O | 补文件或修正引用路径 |
| `企业定向库.html:358` | 引用的本地资源不存在: assets/company-lib.js?v=20260916O | 补文件或修正引用路径 |
| `企业定向库.html:372` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `企业定向库.html:373` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `企业定向库.html:374` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `企业定向库.html:375` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `企业定向库.html:376` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `企业定向库.html:377` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `企业定向库.html:378` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `企业定向库.html:379` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `企业定向库.html:380` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `企业定向库.html:381` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `企业定向库.html:382` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `企业定向库.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `企业定向库.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `关于.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `关于.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `关于.html:12` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `关于.html:391` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `关于.html:392` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `关于.html:393` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `关于.html:394` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `关于.html:395` | 引用的本地资源不存在: assets/quest.js?v=20260916O | 补文件或修正引用路径 |
| `关于.html:396` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `关于.html:397` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `关于.html:398` | 引用的本地资源不存在: assets/study-stats.js?v=20260916O | 补文件或修正引用路径 |
| `关于.html:399` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `关于.html:400` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `关于.html:401` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `关于.html:402` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `关于.html:403` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `关于.html:404` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `关于.html:405` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `关于.html:406` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `关于.html:407` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `关于.html:408` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `关于.html:409` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `关于.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `关于.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `动态空间.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `动态空间.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `动态空间.html:12` | 引用的本地资源不存在: assets/xt-moments.css?v=20260919n | 补文件或修正引用路径 |
| `动态空间.html:179` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `动态空间.html:180` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `动态空间.html:181` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `动态空间.html:182` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `动态空间.html:183` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `动态空间.html:184` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `动态空间.html:185` | 引用的本地资源不存在: assets/xt-moments.js?v=20260918d | 补文件或修正引用路径 |
| `动态空间.html:192` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `动态空间.html:193` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `动态空间.html:194` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `动态空间.html:195` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `动态空间.html:196` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `动态空间.html:197` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `动态空间.html:198` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `动态空间.html:199` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `动态空间.html:200` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `动态空间.html:201` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `动态空间.html:202` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `动态空间.html:43` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `动态空间.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `动态空间.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `商务礼仪.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `商务礼仪.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `商务礼仪.html:12` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `商务礼仪.html:247` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `商务礼仪.html:248` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `商务礼仪.html:249` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `商务礼仪.html:250` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `商务礼仪.html:251` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `商务礼仪.html:252` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `商务礼仪.html:254` | 引用的本地资源不存在: assets/qbank.js?v=20260916O | 补文件或修正引用路径 |
| `商务礼仪.html:255` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `商务礼仪.html:256` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `商务礼仪.html:257` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `商务礼仪.html:258` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `商务礼仪.html:259` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `商务礼仪.html:260` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `商务礼仪.html:261` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `商务礼仪.html:262` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `商务礼仪.html:263` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `商务礼仪.html:264` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `商务礼仪.html:265` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `商务礼仪.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `商务礼仪.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `四级经验分享.html:226` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `四级经验分享.html:252` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `四级词汇.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `四级词汇.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `四级词汇.html:12` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `四级词汇.html:288` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `四级词汇.html:289` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `四级词汇.html:290` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `四级词汇.html:291` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `四级词汇.html:292` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `四级词汇.html:293` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `四级词汇.html:295` | 引用的本地资源不存在: assets/qbank.js?v=20260916O | 补文件或修正引用路径 |
| `四级词汇.html:314` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `四级词汇.html:315` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `四级词汇.html:316` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `四级词汇.html:317` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `四级词汇.html:318` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `四级词汇.html:319` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `四级词汇.html:320` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `四级词汇.html:321` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `四级词汇.html:322` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `四级词汇.html:323` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `四级词汇.html:324` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `四级词汇.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `四级词汇.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `地区选择.html:131` | 引用的本地资源不存在: assets/xt-region.js?v=20260919j | 补文件或修正引用路径 |
| `地区选择.html:132` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `地区选择.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `场景话术库.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `场景话术库.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `场景话术库.html:312` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `场景话术库.html:313` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `场景话术库.html:314` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `场景话术库.html:315` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `场景话术库.html:316` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `场景话术库.html:317` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `场景话术库.html:319` | 引用的本地资源不存在: assets/qbank.js?v=20260916O | 补文件或修正引用路径 |
| `场景话术库.html:343` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `场景话术库.html:344` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `场景话术库.html:345` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `场景话术库.html:346` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `场景话术库.html:347` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `场景话术库.html:348` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `场景话术库.html:349` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `场景话术库.html:350` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `场景话术库.html:351` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `场景话术库.html:352` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `场景话术库.html:353` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `场景话术库.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `场景话术库.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `场景话术库.html:92` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `好友申请.html:39` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `好友申请.html:68` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `好友申请.html:7` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `学习工作台.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `学习工作台.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `学习工作台.html:12` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `学习工作台.html:437` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `学习工作台.html:438` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `学习工作台.html:439` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `学习工作台.html:440` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `学习工作台.html:441` | 引用的本地资源不存在: assets/quest.js?v=20260916O | 补文件或修正引用路径 |
| `学习工作台.html:442` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `学习工作台.html:443` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `学习工作台.html:444` | 引用的本地资源不存在: assets/study-stats.js?v=20260916O | 补文件或修正引用路径 |
| `学习工作台.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `学习工作台.html:883` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `学习工作台.html:884` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `学习工作台.html:885` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `学习工作台.html:886` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `学习工作台.html:887` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `学习工作台.html:888` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `学习工作台.html:889` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `学习工作台.html:890` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `学习工作台.html:891` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `学习工作台.html:892` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `学习工作台.html:893` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `学习工作台.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `学习概括.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `学习概括.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `学习概括.html:12` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `学习概括.html:431` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `学习概括.html:432` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `学习概括.html:433` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `学习概括.html:434` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `学习概括.html:435` | 引用的本地资源不存在: assets/quest.js?v=20260916O | 补文件或修正引用路径 |
| `学习概括.html:436` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `学习概括.html:437` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `学习概括.html:438` | 引用的本地资源不存在: assets/study-stats.js?v=20260916O | 补文件或修正引用路径 |
| `学习概括.html:439` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `学习概括.html:440` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `学习概括.html:441` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `学习概括.html:442` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `学习概括.html:443` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `学习概括.html:444` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `学习概括.html:445` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `学习概括.html:446` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `学习概括.html:447` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `学习概括.html:448` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `学习概括.html:449` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `学习概括.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `学习概括.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `学途.html:142` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `学途.html:186` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `学途.html:187` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `学途.html:188` | 引用的本地资源不存在: assets/voiceplayer.js?v=20260920c | 补文件或修正引用路径 |
| `学途.html:189` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `学途.html:7` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `导入题库.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `导入题库.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `导入题库.html:272` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `导入题库.html:273` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `导入题库.html:274` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `导入题库.html:275` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `导入题库.html:276` | 引用的本地资源不存在: assets/quest.js?v=20260916O | 补文件或修正引用路径 |
| `导入题库.html:277` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `导入题库.html:278` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `导入题库.html:279` | 引用的本地资源不存在: assets/qbank.js?v=20260916O | 补文件或修正引用路径 |
| `导入题库.html:280` | 引用的本地资源不存在: assets/importer.js?v=20260917b | 补文件或修正引用路径 |
| `导入题库.html:281` | 引用的本地资源不存在: assets/study-stats.js?v=20260916O | 补文件或修正引用路径 |
| `导入题库.html:282` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `导入题库.html:283` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `导入题库.html:284` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `导入题库.html:285` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `导入题库.html:286` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `导入题库.html:287` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `导入题库.html:288` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `导入题库.html:289` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `导入题库.html:290` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `导入题库.html:291` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `导入题库.html:292` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `导入题库.html:40` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `导入题库.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `导入题库.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `工具.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `工具.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `工具.html:42` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `工具.html:440` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `工具.html:441` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `工具.html:442` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `工具.html:443` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `工具.html:444` | 引用的本地资源不存在: assets/quest.js?v=20260916O | 补文件或修正引用路径 |
| `工具.html:445` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `工具.html:446` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `工具.html:447` | 引用的本地资源不存在: assets/importer.js?v=20260917b | 补文件或修正引用路径 |
| `工具.html:448` | 引用的本地资源不存在: assets/study-stats.js?v=20260916O | 补文件或修正引用路径 |
| `工具.html:449` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `工具.html:450` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `工具.html:451` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `工具.html:452` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `工具.html:453` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `工具.html:454` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `工具.html:455` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `工具.html:456` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `工具.html:457` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `工具.html:458` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `工具.html:459` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `工具.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `工具.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `我的动态.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `我的动态.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `我的动态.html:12` | 引用的本地资源不存在: assets/xt-moments.css?v=20260919n | 补文件或修正引用路径 |
| `我的动态.html:13` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `我的动态.html:155` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `我的动态.html:156` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `我的动态.html:157` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `我的动态.html:158` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `我的动态.html:159` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `我的动态.html:160` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `我的动态.html:161` | 引用的本地资源不存在: assets/xt-moments.js?v=20260918d | 补文件或修正引用路径 |
| `我的动态.html:162` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `我的动态.html:163` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `我的动态.html:164` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `我的动态.html:165` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `我的动态.html:166` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `我的动态.html:167` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `我的动态.html:168` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `我的动态.html:169` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `我的动态.html:170` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `我的动态.html:171` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `我的动态.html:172` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `我的动态.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `我的动态.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `我的文件.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `我的文件.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `我的文件.html:355` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `我的文件.html:356` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `我的文件.html:357` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `我的文件.html:358` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `我的文件.html:359` | 引用的本地资源不存在: assets/quest.js?v=20260916O | 补文件或修正引用路径 |
| `我的文件.html:360` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `我的文件.html:361` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `我的文件.html:362` | 引用的本地资源不存在: assets/study-stats.js?v=20260916O | 补文件或修正引用路径 |
| `我的文件.html:363` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `我的文件.html:364` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `我的文件.html:365` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `我的文件.html:366` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `我的文件.html:367` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `我的文件.html:368` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `我的文件.html:369` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `我的文件.html:370` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `我的文件.html:371` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `我的文件.html:372` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `我的文件.html:373` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `我的文件.html:58` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `我的文件.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `我的文件.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `时政热点.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `时政热点.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `时政热点.html:131` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `时政热点.html:377` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `时政热点.html:378` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `时政热点.html:379` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `时政热点.html:380` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `时政热点.html:381` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `时政热点.html:382` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `时政热点.html:383` | 引用的本地资源不存在: assets/hotnews.js?v=20260916O | 补文件或修正引用路径 |
| `时政热点.html:404` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `时政热点.html:405` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `时政热点.html:406` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `时政热点.html:407` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `时政热点.html:408` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `时政热点.html:409` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `时政热点.html:410` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `时政热点.html:411` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `时政热点.html:412` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `时政热点.html:413` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `时政热点.html:414` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `时政热点.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `时政热点.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `更多.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `更多.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `更多.html:13` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `更多.html:297` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `更多.html:298` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `更多.html:299` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `更多.html:300` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `更多.html:301` | 引用的本地资源不存在: assets/quest.js?v=20260916O | 补文件或修正引用路径 |
| `更多.html:302` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `更多.html:303` | 引用的本地资源不存在: assets/xt-update.js?v=20260920d | 补文件或修正引用路径 |
| `更多.html:304` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `更多.html:305` | 引用的本地资源不存在: assets/admin.js?v=20260916O | 补文件或修正引用路径 |
| `更多.html:306` | 引用的本地资源不存在: assets/study-stats.js?v=20260916O | 补文件或修正引用路径 |
| `更多.html:307` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `更多.html:308` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `更多.html:309` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `更多.html:310` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `更多.html:311` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `更多.html:312` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `更多.html:313` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `更多.html:314` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `更多.html:315` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `更多.html:316` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `更多.html:317` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `更多.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `更多.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `更新.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `更新.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `更新.html:12` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `更新.html:379` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `更新.html:380` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `更新.html:381` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `更新.html:382` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `更新.html:383` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `更新.html:384` | 引用的本地资源不存在: assets/xt-update.js?v=20260920d | 补文件或修正引用路径 |
| `更新.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `更新.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `朋友圈发布.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `朋友圈发布.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `朋友圈发布.html:12` | 引用的本地资源不存在: assets/xt-moments.css?v=20260919n | 补文件或修正引用路径 |
| `朋友圈发布.html:13` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `朋友圈发布.html:149` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `朋友圈发布.html:150` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `朋友圈发布.html:151` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `朋友圈发布.html:152` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `朋友圈发布.html:153` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `朋友圈发布.html:154` | 引用的本地资源不存在: assets/xt-region.js?v=20260919j | 补文件或修正引用路径 |
| `朋友圈发布.html:155` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `朋友圈发布.html:156` | 引用的本地资源不存在: assets/xt-moments.js?v=20260918d | 补文件或修正引用路径 |
| `朋友圈发布.html:157` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `朋友圈发布.html:158` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `朋友圈发布.html:159` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `朋友圈发布.html:160` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `朋友圈发布.html:161` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `朋友圈发布.html:162` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `朋友圈发布.html:163` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `朋友圈发布.html:164` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `朋友圈发布.html:165` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `朋友圈发布.html:166` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `朋友圈发布.html:167` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `朋友圈发布.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `朋友圈发布.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `演示.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `演示.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `演示.html:22` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `演示.html:255` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `演示.html:256` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `演示.html:257` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `演示.html:258` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `演示.html:259` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `演示.html:260` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `演示.html:261` | 引用的本地资源不存在: assets/study-stats.js?v=20260916O | 补文件或修正引用路径 |
| `演示.html:262` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `演示.html:263` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `演示.html:264` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `演示.html:265` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `演示.html:266` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `演示.html:267` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `演示.html:268` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `演示.html:269` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `演示.html:270` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `演示.html:271` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `演示.html:272` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `演示.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `演示.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `申论刷题.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `申论刷题.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `申论刷题.html:144` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `申论刷题.html:1844` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `申论刷题.html:1845` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `申论刷题.html:1846` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `申论刷题.html:1847` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `申论刷题.html:1848` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `申论刷题.html:1849` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `申论刷题.html:1850` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `申论刷题.html:1851` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `申论刷题.html:1852` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `申论刷题.html:1853` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `申论刷题.html:1854` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `申论刷题.html:389` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `申论刷题.html:390` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `申论刷题.html:391` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `申论刷题.html:392` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `申论刷题.html:393` | 引用的本地资源不存在: assets/data/shenlun-inline.js?v=20260916O | 补文件或修正引用路径 |
| `申论刷题.html:394` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `申论刷题.html:395` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `申论刷题.html:396` | 引用的本地资源不存在: assets/qbank.js?v=20260916O | 补文件或修正引用路径 |
| `申论刷题.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `申论刷题.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `登录.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `登录.html:263` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `登录.html:264` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `登录.html:265` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `登录.html:266` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `登录.html:267` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `登录.html:414(function) / 设置.html:1496(function)` | 全局名「pwStrongEnough」在 2 个文件重复声明 [WARN] | 改为 window.pwStrongEnough 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `登录.html:423(function) / 设置.html:1505(function)` | 全局名「pwTooCommon」在 2 个文件重复声明 [WARN] | 改为 window.pwTooCommon 守卫或改名, 避免重复声明 SyntaxError 整文件白屏 |
| `登录.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `登录.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `社区.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `社区.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `社区.html:454` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `社区.html:455` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `社区.html:456` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `社区.html:457` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `社区.html:458` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `社区.html:459` | 引用的本地资源不存在: assets/xt-region.js?v=20260919j | 补文件或修正引用路径 |
| `社区.html:460` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `社区.html:794` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `社区.html:795` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `社区.html:796` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `社区.html:797` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `社区.html:798` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `社区.html:799` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `社区.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `社区.html:800` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `社区.html:801` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `社区.html:802` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `社区.html:803` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `社区.html:804` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `社区.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `社区.html:99` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `私聊.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `私聊.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `私聊.html:1317` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `私聊.html:1318` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `私聊.html:1319` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `私聊.html:1320` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `私聊.html:1321` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `私聊.html:1322` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `私聊.html:1323` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `私聊.html:1324` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `私聊.html:1325` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `私聊.html:1326` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `私聊.html:1327` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `私聊.html:134` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `私聊.html:445` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `私聊.html:446` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `私聊.html:447` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `私聊.html:448` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `私聊.html:449` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `私聊.html:451` | 引用的本地资源不存在: assets/xt-region.js?v=20260919j | 补文件或修正引用路径 |
| `私聊.html:452` | 引用的本地资源不存在: assets/emoji/manifest.js?v=20260916O | 补文件或修正引用路径 |
| `私聊.html:453` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `私聊.html:454` | 引用的本地资源不存在: assets/chat-local.js?v=20260920c | 补文件或修正引用路径 |
| `私聊.html:455` | 引用的本地资源不存在: assets/admin-contact.js?v=20260917b | 补文件或修正引用路径 |
| `私聊.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `私聊.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `管理员.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `管理员.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `管理员.html:12` | 引用的本地资源不存在: assets/admin.css?v=20260916O | 补文件或修正引用路径 |
| `管理员.html:13` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `管理员.html:298` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `管理员.html:299` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `管理员.html:300` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `管理员.html:301` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `管理员.html:302` | 引用的本地资源不存在: assets/quest.js?v=20260916O | 补文件或修正引用路径 |
| `管理员.html:303` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `管理员.html:304` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `管理员.html:305` | 引用的本地资源不存在: assets/admin.js?v=20260916O | 补文件或修正引用路径 |
| `管理员.html:306` | 引用的本地资源不存在: assets/study-stats.js?v=20260916O | 补文件或修正引用路径 |
| `管理员.html:307` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `管理员.html:308` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `管理员.html:309` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `管理员.html:310` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `管理员.html:311` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `管理员.html:312` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `管理员.html:313` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `管理员.html:314` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `管理员.html:315` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `管理员.html:316` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `管理员.html:317` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `管理员.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `管理员.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `英语.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `英语.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `英语.html:39` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `英语.html:456` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `英语.html:457` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `英语.html:458` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `英语.html:459` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `英语.html:460` | 引用的本地资源不存在: assets/voiceplayer.js?v=20260920c | 补文件或修正引用路径 |
| `英语.html:461` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `英语.html:462` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `英语.html:464` | 引用的本地资源不存在: assets/mini-cet.js?v=20260916O | 补文件或修正引用路径 |
| `英语.html:466` | 引用的本地资源不存在: assets/mini.js?v=20260916O | 补文件或修正引用路径 |
| `英语.html:467` | 引用的本地资源不存在: assets/study-stats.js?v=20260916O | 补文件或修正引用路径 |
| `英语.html:474` | 引用的本地资源不存在: assets/xt-content.js?v=20260916O | 补文件或修正引用路径 |
| `英语.html:475` | 引用的本地资源不存在: assets/data-cet-read.js?v=20260916O | 补文件或修正引用路径 |
| `英语.html:476` | 引用的本地资源不存在: assets/data-cet-translate.js?v=20260916O | 补文件或修正引用路径 |
| `英语.html:477` | 引用的本地资源不存在: assets/cet-read.js?v=20260916O | 补文件或修正引用路径 |
| `英语.html:478` | 引用的本地资源不存在: assets/cet-translate.js?v=20260916O | 补文件或修正引用路径 |
| `英语.html:735` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `英语.html:736` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `英语.html:737` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `英语.html:738` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `英语.html:739` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `英语.html:740` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `英语.html:741` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `英语.html:742` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `英语.html:743` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `英语.html:744` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `英语.html:745` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `英语.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `英语.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `行测.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `行测.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `行测.html:12` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `行测.html:355` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `行测.html:356` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `行测.html:357` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `行测.html:358` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `行测.html:359` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `行测.html:360` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `行测.html:362` | 引用的本地资源不存在: assets/mini-exam.js?v=20260916O | 补文件或修正引用路径 |
| `行测.html:364` | 引用的本地资源不存在: assets/mini.js?v=20260916O | 补文件或修正引用路径 |
| `行测.html:365` | 引用的本地资源不存在: assets/topic-express.js?v=20260916O | 补文件或修正引用路径 |
| `行测.html:367` | 引用的本地资源不存在: assets/qbank.js?v=20260916O | 补文件或修正引用路径 |
| `行测.html:368` | 引用的本地资源不存在: assets/hotnews.js?v=20260916O | 补文件或修正引用路径 |
| `行测.html:369` | 引用的本地资源不存在: assets/study-stats.js?v=20260916O | 补文件或修正引用路径 |
| `行测.html:379` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `行测.html:380` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `行测.html:381` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `行测.html:382` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `行测.html:383` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `行测.html:384` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `行测.html:385` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `行测.html:386` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `行测.html:387` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `行测.html:388` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `行测.html:389` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `行测.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `行测.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `行测刷题.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `行测刷题.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `行测刷题.html:12` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `行测刷题.html:285` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `行测刷题.html:286` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `行测刷题.html:287` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `行测刷题.html:288` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `行测刷题.html:289` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `行测刷题.html:290` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `行测刷题.html:291` | 引用的本地资源不存在: assets/qbank.js?v=20260916O | 补文件或修正引用路径 |
| `行测刷题.html:306` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `行测刷题.html:307` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `行测刷题.html:308` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `行测刷题.html:309` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `行测刷题.html:310` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `行测刷题.html:311` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `行测刷题.html:312` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `行测刷题.html:313` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `行测刷题.html:314` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `行测刷题.html:315` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `行测刷题.html:316` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `行测刷题.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `行测刷题.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `表达.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `表达.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `表达.html:123` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `表达.html:403` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `表达.html:404` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `表达.html:405` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `表达.html:406` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `表达.html:407` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `表达.html:408` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `表达.html:410` | 引用的本地资源不存在: assets/mini-comm.js?v=20260916O | 补文件或修正引用路径 |
| `表达.html:416` | 引用的本地资源不存在: assets/xt-content.js?v=20260916O | 补文件或修正引用路径 |
| `表达.html:417` | 引用的本地资源不存在: assets/data-comm-cases.js?v=20260916O | 补文件或修正引用路径 |
| `表达.html:418` | 引用的本地资源不存在: assets/comm-cases.js?v=20260916O | 补文件或修正引用路径 |
| `表达.html:419` | 引用的本地资源不存在: assets/mini.js?v=20260916O | 补文件或修正引用路径 |
| `表达.html:420` | 引用的本地资源不存在: assets/i-partner.js?v=20260916O | 补文件或修正引用路径 |
| `表达.html:421` | 引用的本地资源不存在: assets/roleplay.js?v=20260916O | 补文件或修正引用路径 |
| `表达.html:422` | 引用的本地资源不存在: assets/study-stats.js?v=20260916O | 补文件或修正引用路径 |
| `表达.html:553` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `表达.html:554` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `表达.html:555` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `表达.html:556` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `表达.html:557` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `表达.html:558` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `表达.html:559` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `表达.html:560` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `表达.html:561` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `表达.html:562` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `表达.html:563` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `表达.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `表达.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `设置.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `设置.html:1045` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `设置.html:1046` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `设置.html:1047` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `设置.html:1048` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `设置.html:1049` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `设置.html:1050` | 引用的本地资源不存在: assets/xt-update.js?v=20260920d | 补文件或修正引用路径 |
| `设置.html:1051` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `设置.html:1052` | 引用的本地资源不存在: assets/subpage-router.js?v=20260917b | 补文件或修正引用路径 |
| `设置.html:1053` | 引用的本地资源不存在: assets/qbank.js?v=20260916O | 补文件或修正引用路径 |
| `设置.html:1054` | 引用的本地资源不存在: assets/importer.js?v=20260917b | 补文件或修正引用路径 |
| `设置.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `设置.html:12` | 引用的本地资源不存在: assets/xt-settings.js?v=20260916O | 补文件或修正引用路径 |
| `设置.html:13` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `设置.html:2605` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `设置.html:2606` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `设置.html:2607` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `设置.html:2608` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `设置.html:2609` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `设置.html:2610` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `设置.html:2611` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `设置.html:2612` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `设置.html:2613` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `设置.html:2614` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `设置.html:2615` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `设置.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `设置.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `赞助.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `赞助.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `赞助.html:12` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `赞助.html:318` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `赞助.html:319` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `赞助.html:320` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `赞助.html:321` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `赞助.html:322` | 引用的本地资源不存在: assets/quest.js?v=20260916O | 补文件或修正引用路径 |
| `赞助.html:323` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `赞助.html:324` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `赞助.html:325` | 引用的本地资源不存在: assets/study-stats.js?v=20260916O | 补文件或修正引用路径 |
| `赞助.html:326` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `赞助.html:327` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `赞助.html:328` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `赞助.html:329` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `赞助.html:330` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `赞助.html:331` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `赞助.html:332` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `赞助.html:333` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `赞助.html:334` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `赞助.html:335` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `赞助.html:336` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `赞助.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `赞助.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `错题本.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `错题本.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `错题本.html:12` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `错题本.html:271` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `错题本.html:272` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `错题本.html:273` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `错题本.html:274` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `错题本.html:275` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `错题本.html:276` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `错题本.html:277` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `错题本.html:278` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `错题本.html:279` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `错题本.html:280` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `错题本.html:281` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `错题本.html:282` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `错题本.html:283` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `错题本.html:284` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `错题本.html:285` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `错题本.html:286` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `错题本.html:287` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `错题本.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `错题本.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `面测.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `面测.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `面测.html:12` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `面测.html:499` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `面测.html:500` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `面测.html:501` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `面测.html:502` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `面测.html:503` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `面测.html:504` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `面测.html:506` | 引用的本地资源不存在: assets/mini-interview.js?v=20260916O | 补文件或修正引用路径 |
| `面测.html:514` | 引用的本地资源不存在: assets/xt-content.js?v=20260916O | 补文件或修正引用路径 |
| `面测.html:515` | 引用的本地资源不存在: assets/data-iv-prep.js?v=20260916O | 补文件或修正引用路径 |
| `面测.html:516` | 引用的本地资源不存在: assets/iv-prep.js?v=20260916O | 补文件或修正引用路径 |
| `面测.html:517` | 引用的本地资源不存在: assets/data-iv-after.js?v=20260916O | 补文件或修正引用路径 |
| `面测.html:518` | 引用的本地资源不存在: assets/iv-after.js?v=20260916O | 补文件或修正引用路径 |
| `面测.html:519` | 引用的本地资源不存在: assets/mini.js?v=20260916O | 补文件或修正引用路径 |
| `面测.html:520` | 引用的本地资源不存在: assets/group-discussion.js?v=20260919d | 补文件或修正引用路径 |
| `面测.html:521` | 引用的本地资源不存在: assets/study-stats.js?v=20260916O | 补文件或修正引用路径 |
| `面测.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `面测.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |
| `面测.html:924` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `面测.html:925` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `面测.html:926` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `面测.html:927` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `面测.html:928` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `面测.html:929` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `面测.html:930` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `面测.html:931` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `面测.html:932` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `面测.html:933` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `面测.html:934` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `面试题库.html:10` | 引用的本地资源不存在: assets/states.css?v=20260916O | 补文件或修正引用路径 |
| `面试题库.html:11` | 引用的本地资源不存在: assets/polish.css?v=20260916O | 补文件或修正引用路径 |
| `面试题库.html:12` | 引用的本地资源不存在: assets/xt-polyfill.js?v=20260916O | 补文件或修正引用路径 |
| `面试题库.html:237` | 引用的本地资源不存在: assets/icon-map.js?v=20260919l | 补文件或修正引用路径 |
| `面试题库.html:238` | 引用的本地资源不存在: assets/xt-toast.js?v=20260916O | 补文件或修正引用路径 |
| `面试题库.html:239` | 引用的本地资源不存在: assets/error-boundary.js?v=20260916O | 补文件或修正引用路径 |
| `面试题库.html:240` | 引用的本地资源不存在: assets/app.js?v=20260920c | 补文件或修正引用路径 |
| `面试题库.html:241` | 引用的本地资源不存在: assets/config.js?v=20260916O | 补文件或修正引用路径 |
| `面试题库.html:242` | 引用的本地资源不存在: assets/api.js?v=20260917b | 补文件或修正引用路径 |
| `面试题库.html:244` | 引用的本地资源不存在: assets/qbank.js?v=20260916O | 补文件或修正引用路径 |
| `面试题库.html:245` | 引用的本地资源不存在: assets/ai-config.js?v=20260920c | 补文件或修正引用路径 |
| `面试题库.html:246` | 引用的本地资源不存在: assets/ai-presets.js?v=20260916O | 补文件或修正引用路径 |
| `面试题库.html:247` | 引用的本地资源不存在: assets/ai-service.js?v=20260920c | 补文件或修正引用路径 |
| `面试题库.html:248` | 引用的本地资源不存在: assets/ai-cap-registry.js?v=20260918c | 补文件或修正引用路径 |
| `面试题库.html:249` | 引用的本地资源不存在: assets/ai-cap-image.js?v=20260920c | 补文件或修正引用路径 |
| `面试题库.html:250` | 引用的本地资源不存在: assets/ai-cap-vision.js?v=20260920c | 补文件或修正引用路径 |
| `面试题库.html:251` | 引用的本地资源不存在: assets/ai-cap-audio.js?v=20260920c | 补文件或修正引用路径 |
| `面试题库.html:252` | 引用的本地资源不存在: assets/ai-cap-embed.js?v=20260920c | 补文件或修正引用路径 |
| `面试题库.html:253` | 引用的本地资源不存在: assets/ai-cap-translate.js?v=20260920c | 补文件或修正引用路径 |
| `面试题库.html:254` | 引用的本地资源不存在: assets/ai-cap-video.js?v=20260920c | 补文件或修正引用路径 |
| `面试题库.html:255` | 引用的本地资源不存在: assets/ai-cap-3d.js?v=20260920c | 补文件或修正引用路径 |
| `面试题库.html:8` | 引用的本地资源不存在: assets/common.css?v=20260920c | 补文件或修正引用路径 |
| `面试题库.html:9` | 引用的本地资源不存在: assets/page-head.css?v=20260916O | 补文件或修正引用路径 |

## 备注

- 闸6 (jsdom 控制台冒烟) 为可选项, 本次未执行(避免对并行施工的 3 位 UI 工程师造成干扰, 且需本地静态服务); 建议在波末稳定后用 page_check.js / multi_check.js 跑运行时体检。
- 禁用语法扫描已用多行感知剥离: 跨行 /* */ 块注释、行内 // 与单双引号字符串、模板字符串 `...`(插值外文本剥离, ${} 内代码保留)。块注释说明文字/示例(如禁用语法清单、`**` 加粗、`{...}` 示例)不再误报。若 `**` 仍有命中, 需人工 Read 确认是否真在可执行代码里的指数运算。
- 全局冲突闸基于 acorn AST 作用域分析(非正则启发), 隐式全局与函数局部已区分; FATAL=两文件均 let/const/class, RISK=let/const 配 var/function(看加载顺序), WARN=仅 var/function/implicit。