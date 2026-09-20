# 批次 20260913K 作战简报（全员必读）

## 公共约定（铁律，违反即返工）
1. **所有读写必须用主项目绝对路径** `D:\下载的文件\学习工作台\...`。严禁写 worktree（C:\Users\ATM\WorkBuddy\Worktrees\...）。收工前自查落盘位置。
2. **只精确 Edit，禁止脚本整文件回写**；每次 Edit 前必须重新 Read 盘上最新版（多线并行，文件可能刚被改过）。
3. **icon-map.js 只有 kou-k-appjs 可以改**；其他线需要新图标→引用 lucide 通用名并记入「需注册」清单汇报，不得自行改。
4. data-icon 写法：`<span class="nav-icon" data-icon="名字" data-icon-size="16"></span>`（尺寸按现场）。只引用 icon-map.js 已注册名（现 70 个）或已在「需注册」清单中由 appjs 承诺注册的名字。
5. **不动 git、不部署、不改版本戳 ?v=**（主理人收尾统一 bump）。不动 server。
6. 内容红线：文案自撰；用户内容（头像/昵称/正文 emoji）一律不动。
7. 改完自验：JS 文件 `node --check`；HTML 用 node 静态断言（见各任务）；日志写 `tools/qa/k_<你的名字>.log`（ASCII 文件名，输出重定向进文件再 Read）。
8. 汇报格式：`IS_PASS: YES/NO` + 改动文件清单 + 断言结果 + 需注册图标/遗留问题。
9. 遇到与简报冲突的盘上现状：以盘上最新代码为准，缩窄范围完成，冲突处写进汇报。
10. 顶部导航（每页 header）与侧栏 logo 的 K6 项归各页所属线顺手做（themeToggle 🌙→sun/moon data-icon、搜索框 placeholder「🔍 」前缀去掉或改纯文字「搜索发贴 / 模块…」）。

## K6 图标对照（各线通用）
🔔→bell｜💬→message-square｜🌙→moon（暗态）/sun（亮态）｜🔍（placeholder 去 emoji）｜🧠→brain｜📌→pin（无注册则报）｜✏️→pencil｜🗑️→trash（无注册则报）｜🔊→volume-2｜👆→pointer? 无则 hand/index（报）｜✅→check-circle? 用 check｜🚫→x 或 ban｜💾→save｜🔌→plug? 无则 cable/zap（报）｜🗑️→trash｜📊→chart-bar｜🧹→eraser?（报）｜↺→rotate-ccw｜📦→package/inbox｜☀️→sun｜🖥️→monitor｜📤→upload/share（报选）｜📥→download/inbox

## 任务分派表（11 线，文件零重叠）

### 1. kou-k-appjs（assets/app.js + assets/icon-map.js 唯一写者）
- ①icon-map.js：按需注册缺口图标（sun/moon/bell/search/pin/trash/download/save/eraser/rotate-ccw/monitor/check/ban/message-square 等先查已注册再补），node --check。
- ②K6：renderCountdowns（~1184-1214）✏️🗑️📌→data-icon；主题切换 app.js 位（1893/1908/6835/6848）🌙☀️→sun/moon 图标（toast 文案 emoji 一并清理或保留正文语义，仅去图标位）。
- ③K5-本地贴：renderBlogDetail（5447-5460）评论渲染改造——头像位兜底（name 空/单字符正常显示，调查「头像显示不出来」根因并修）、评论支持 replyTo 嵌套渲染（子楼层缩进）、评论>5 条时折叠（显示前 3 条+「展开全部 N 条」按钮，点击展开/收起）。
- ④K7：renderBlogMineTabs（5415-5426）改「列表菜单→页面」模式：#blogMineTabs 容器渲染竖排列表菜单（全/已发布/草稿/归档/收藏+计数），点击项→视图区显示「分类标题+返回+文章列表」（blogMineType 复用）。markup+行为+必要 inline style 全在你手上。
- ⑤K9：renderBlogFilters（5394-5405）美化重设计：分类筛选收进与搜索框同一行的自定义下拉（当前分类显示在按钮上，展开列出全部/五分类），保留 blogCatFilter/blogTagFilter 逻辑与 renderBlogList 联动。用户拍板方向=美化保留功能。
- ⑥K11：renderProfilePage（5800-5985）图标升级：5849✏️/5856🔥/5860⏱/5864🧮/5868🎯/5875📅/5893⏱/5902💡/5910🏅/5947-5967 六卡 emoji；5916 徽章 b.icon 保留（内容型）。
- ⑦K13：renderAiProviderPanel（6280-6313）🎨标题/四头像选项按钮（data-val 的 emoji 值是功能数据**不能动**，只换按钮显示为 data-icon）/💾🔌🗑️📊 四按钮（6309-6312）/🔌toast(6403)。
- ⑧K15-appjs 侧：给「发贴统计」pp-card（~5925）加 id="ppStatsCard"。
- 自验：node --check app.js + icon-map.js；断言上述行号区 emoji 清零（除徽章/正文）；grep 确认无重复 id。

### 2. kou-k-api（assets/api.js 唯一写者）
- ①K5-云贴（广场实际数据走这里）：openNoteDetail 评论渲染（~506-570）：头像显示 bug 修复（实查根因：bc-avatar 用 nickname 首字符，若 c.avatar/c.avatarImg 存在优先 <img>；空值兜底「？或首字符」）；replyTo 嵌套渲染（REPLY_TO_COMMENT 数据流已存在，渲染为子楼层缩进在被回复评论下方）；评论>5 条折叠（同 appjs 口径：前 3+展开按钮）。
- ②K6：notifyBell 🔔(951-956)→bell data-icon；chatEntry 💬(1015-1025)→message-square；toast/面板头文案 emoji 图标位（969/989/994）→data-icon 或去 emoji；统计六宫格 📝💾📁👍💬👁(199)与 💬获评论(268)→data-icon。
- 自验：node --check；断言上述位置 emoji=0（用户内容/正文案除外）。

### 3. kou-k-cet（四级备考.html + assets/voiceplayer.js）
- K1：openVoiceTrain 的 vp-mask 弹窗改**页面内全屏面板**（参照页内「阅读理解」改造后的面板交互：顶部返回栏+ESC+锁滚动）：🎧听力精听/🗣️口语跟读 双 tab 保留（情景式口语=口语跟读 tab）；四级备考.html 165-170「情景式口语」feature-card 删除（菜单并入听力训练），其 openVoiceTrain('speak') 入口改由听力训练面板内 tab 承接；布局重构：去绿渐变全屏底，对齐全站设计令牌（浅色卡面+主题色点缀）；场景 chip 行与播放器条重排更清爽；**内容丰富化**：SCENES（voiceplayer.js 13-60+）各场景台词每场景扩充到 ≥8 句（自撰，贴近场景真实对话，守版权红线）；全部 emoji 图标（🎧🗣️☕✈️🍽️🏨🛍️🧭📰⏮🔊🐢🙈💬🎤✕）→data-icon 或场景 chip 改纯文字+小图标。注意 app.js 1843/1850 有 vpMask ESC 联动（id 保持 vpMask 即可不断）。
- 页内 K6：themeToggle 🌙 + 搜索 placeholder。
- 自验：node --check voiceplayer.js；断言页内 openVoiceTrain 入口从面板进、情景式口语菜单项 0 命中、图标容器 emoji=0。

### 4. kou-k-gq（高情商表达.html）
- K2：①案例拆解库（入口~5765 字符处）弹窗→页面内全屏面板，内容版式重做（对齐页内其他面板风格）；②i人伙伴团（~6355）弹窗→页面+i人沟通专区菜单（~6071）删除，其内容并入伙伴团面板并重构布局；③角色扮演训练（~6703）布局显示重构。功能逻辑（数据/渲染）保留，只改呈现载体与版式；页内残留 emoji 图标容器清零。
- 页内 K6：themeToggle + 搜索 placeholder。
- 自验：三个入口均为面板视图；被删菜单名 0 命中；*ic* 容器 emoji=0。

### 5. kou-k-sw（商务礼仪面试.html）
- K3：①面试准备（~7168）/面试后（~9032）弹窗→页面内全屏面板，样式布局内容对齐「高频问题库」（~7477）的呈现风格；②确认「无领导小组讨论」普通菜单已删净（7988/8299 及 17524-18714 区残留复核），AI 无领导讨论为页面显示不得弹窗；若上批改造有残留/仍是弹窗，补齐为「无领导讨论（准备）+AI 实战」合并页面。
- 页内 K6：themeToggle + 搜索 placeholder；页内 emoji 容器清零。
- 自验：两入口面板化；无领导 0 弹窗；*ic* emoji=0。

### 6. kou-k-ppt（PPT训练.html）
- K4：设计基础（~5604）/实战模板库（~6693）/技巧提升（~6971）弹窗→页面内全屏面板，内容布局对齐「版式库」（~5880）风格。
- K12①：删除「学习路径」卡整块（42-49 pptpath-card：🗺头+三关步骤），连带清理 pptToggleStep 及进度持久化 JS（~214 区 T7 代码），不留死引用。
- 页内 K6：themeToggle + 搜索 placeholder；emoji 容器清零。
- 自验：三入口面板化且版式与版式库一致；学习路径 0 命中；*ic* emoji=0。

### 7. kou-k-vocab（四级词汇.html）
- K6⑦：📚学习新词(101)/🔄复习单词(102)/🔀随机(103)/🔊听发音(109)/👆点击卡片显示释义(113)/✅认识(139) →data-icon；themeToggle(90) 🌙→moon data-icon + app.js toggleTheme 联动的 textContent 逻辑不受影响（HTML 静态换即可，运行时由 appjs 线处理 JS 侧）；搜索 placeholder 去 🔍。
- 自验：页内图标容器 emoji=0；按钮 onclick 不变。

### 8. kou-k-settings（设置.html）
- K12②：FAQ 六行行首 emoji（484/488/492/496/500/504）→data-icon；「给创作者提优化建议」区块标题图标（~537）核查统一。
- K13①：默认可见范围选项 🌍公开/🔒私密（258-259）→纯文字「公开/私密」；默认分类 select 选项如带 emoji 同步去（注意 option 内不能放 span）。
- K16：数据管理 📥(436)/📤(445)/📥(454)/🗑️(465)；维护 🧹(681)/↺(690)/📦(699)+文案 1126「📦 」去 emoji；关于面板小节头 ✨/📚/🛠（828-835 区）；外观 ☀️🌙🖥️（155-157）；皮肤 chips 色点 emoji（160-172）改 CSS 色块（data-skin 逻辑不动）；全页 ✅开启/🚫关闭 theme-option 批量（218/219/228/229/354/355/396/397/407/408 等，全局扫）；🔔授权通知(418)；AI 面板 🧹(939)。
- 页内 K6：themeToggle(90) + 搜索 placeholder。
- 自验：断言上述行号区 emoji=0（正文文案除外）；onclick/data-skin/data-mode 全保留。

### 9. kou-k-personal（个人中心.html）
- K11-页内：renderProfileOverview 内联脚本图标（362-365 📖🧘🔊🔔 / 375 📒📖⚙️ / 380-381 ⏱🧮🎯🔥）→data-icon。
- K14：「我的学习偏好」卡改页内直设——四项偏好改可操作控件：每日新增 select、专注时长 select、朗读开关+语速、私信提醒开关；读写走全局 setSetting()/loadAllSettings()（app.js 既有，勿改 app.js）；改动即存+toast「已保存」；「去调整」链接保留。控件样式对齐设置页 setting-row/form-input 令牌（本页 <style> 内补齐所需类）。
- K15-html 侧：onSubpageChange（~672-684）改——posts 时 profileBox 移入 postsHost 后加 class="posts-mode"，profile 时移除；<style> 加 `.posts-mode .pp-card{display:none}` 与 `.posts-mode #ppStatsCard{display:block}`（id 由 kou-k-appjs 在 app.js 加，你按此契约先写）。back/面包屑不破坏。
- 页内 K6：themeToggle + 搜索 placeholder。
- 自验：断言偏好卡含 4 个可操作控件；posts-mode CSS 在位；*ic* emoji=0。

### 10. kou-k-blog（学习博客.html）
- K8：删 ed-head-bar（161-164）+ CSS（18-21）；页内图标 169↺/175🚀/176-180 五模板/198-199 选项去 emoji/204 封面 placeholder/236🖼/246✍️/247 placeholder「🚀 」/258💾/259🤖 →data-icon 或去 emoji（select option 内去 emoji）。
- K5/K7/K9 的 HTML 侧配合：评论区 bc-* 样式若嵌套/折叠需要（子楼层缩进、展开按钮样式）在本页 <style> 补类（.bc-reply/.bc-fold 等，命名与 appjs 约定：appjs 渲染 class="bc-item bc-reply"（嵌套子楼）与 class="bc-fold-btn"）；#blogMineTabs 与筛选下拉容器无需动 DOM 结构（appjs 全包）。
- 页内 K6：themeToggle + 搜索 placeholder。
- 自验：ed-head 0 命中；上述图标位 emoji=0；新增 CSS 类在位。

### 11. kou-k-misc（qbank.js + 未分配页 + study-stats.js + 扫描器）
- qbank.js:338 🧠→data-icon brain（按钮 textContent 改 innerHTML+span）。
- K17：assets/study-stats.js:276「📊 学习概况」→data-icon chart-bar（该 js 渲染五页共用卡）。
- 未分配页 topbar K6：学习工作台.html/更多/动态/错题本/登录/好友申请/学途/万能金句库/场景话术库/行测刷题/面试题库/商务礼仪/四级经验分享/央国企笔试/mock_exam*/PPT版式库/PPT案例拆解/PPT素材库——各页 themeToggle 🌙→moon data-icon + 搜索 placeholder 去 🔍（页面若有其他显眼 emoji 图标容器顺手清，正文不动）。
- 🍌 调查：grep 全库确认顶栏 🍌 来源（AI 伙伴自定义头像/用户内容则不动，系统注入则修），结论写日志。
- 扫描器：tools/qa/icon_audit_0913j.js 白名单收紧——🌙 主题按钮与 placeholder 不再豁免，跑一轮出 K 批前基线日志。
- 自验：node --check 各 js；断言整理进日志。

## 收尾（主理人做，各线勿动）
统一 bump ?v= → 扫描器严格模式 → 回归门 qa_batch_0913h_final.js --with-c1 → dry-run → 用户点头部署。
