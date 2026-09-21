# 批次 20260913j 作战简报（全员必读）

## 公共约定（铁律，违者打回）

1. **项目根 = `D:\下载的文件\学习工作台`**。你的一切 Read/Edit/Write 必须用这个绝对路径下的文件。你默认的工作目录可能是另一份副本（worktree），**严禁在那里改文件**——改了等于白干还会造成双副本漂移。
2. 每次编辑前必须 **Read 盘上最新版**，只做**精确 Edit**，严禁整文件重写/脚本整文件回写（历史事故：并行覆盖）。
3. **禁止 git 操作**；**禁止改任何 `?v=` 版本戳**（主理人统一 bump 到 20260913j）。
4. **不删任何功能**，除非你的任务书明确写了要删；删除类任务要连带清理数据/函数引用并验证不破坏其他模块。
5. **assets/icon-map.js 只有 kou-appjs 能改**；其他成员只读。需要新图标时：优先用已注册的语义最近图标；确实没有合适的，在汇报里列「需注册：emoji→建议图标名」，由 kou-appjs 统一注册。
6. **图标替换写法**（照抄现有写法）：
   - `title-icon`/`sgc-icon`/`stat-icon` 等：`<span class="title-icon" data-icon="名称"></span>`（原 emoji 删掉，data-icon 挂上）
   - `bn-icon`/`bm-icon`：`<div class="bn-icon"><span class="nav-icon" data-icon="名称" data-icon-size="20"></span></div>`
   - app.js 里 JS 渲染的：拼接字符串里用同样的 data-icon span 结构
   - **硬约束：新注册图标禁止 mask/filter/symbol/use 写法**
7. **不动的**：正文/文案里的装饰 emoji（空态句、AI 回复正文、🔍 搜索框 placeholder 文本、🌙 主题按钮由 app.js 管的文案、用户头像 emoji 如🌳树枝）；`blog_wechat.html`（死草稿）整个不碰；`备份\` 目录不碰。
8. **验证一次即判定**：node/静态检查跑一次，结果写 `tools/qa/` 下 ASCII 文件名日志，不反复回跑。
9. 汇报 ≤300 字：改动文件+关键行为、脚本一行结论、需 kou-appjs 注册的图标清单（如有）。
10. 本机 bash 缺 coreutils（ls/tail 无），PowerShell 中文路径不可靠 → 用 Read/Edit/Grep/Write 文件工具 + node/python；长输出重定向 ASCII 名文件再 Read。

## 全批清单（12 条线，文件零重叠）

| 线 | 负责文件 | 任务 |
|---|---|---|
| kou-home | 学习工作台.html | 删顶栏「完成 x/5」stat-item（86 行）；全页 emoji 图标容器（logo-icon📚 等）→data-icon |
| kou-settings | 设置.html | 删唯一 module-hero「⚙️设置」（~10805，删后全面板都不显示）；图标升级 sgc-icon×6/title-icon×15/sq-ic×8/stat-icon×3/bn-icon×5/bm-icon×4；帮助与反馈面板新增「给创作者提优化建议」表单（昵称自动带+类型[优化建议/问题反馈/新功能]+正文，fetch POST /api/feedback {nickname,type,content}，失败 toast；后端接口由 kou-backend 并行开发）；「关于」文案按项目现状重写（先盘点全站模块，自撰，含版本 20260913j） |
| kou-blog | 学习博客.html | 删/改 ed-hero 英雄卡；字数/分钟阅读/草稿状态改合理化（实时小指示、不常驻 0 占位）；发布/存草稿/AI辅助/清空按钮条固定到实时预览卡下方；静态 emoji 容器（logo-icon/stat-icon 等）→data-icon |
| kou-cet | 四级备考.html | 删 module-hero；「阅读理解」「翻译专项」modal→页面内全屏视图（判分/解析功能不动，modal 结构在 21005-22468 区间）；bn-icon×5→data-icon；页内其余 emoji 容器清零 |
| kou-exam | 央国企笔试.html + 高情商表达.html | 央国企：删 module-hero；删「综合知识」菜单+面板（4326/6781，连带清理）；「话题表达训练」modal→页面（17116-18594）；bn-icon×5。高情商：删 module-hero；bn-icon×5。两页其余 emoji 容器清零 |
| kou-shangwu | 商务礼仪面试.html | 删 module-hero；「AI无领导小组讨论」modal→全屏页面（21407-22885），并把普通「无领导小组讨论」（4692/9530）内容合并进同一页面（两入口都指向合并页，页内分区/tab 呈现，功能不动）；bn-icon×5；页内 emoji 容器（含此前保留的 🤖💡）→data-icon |
| kou-ppt | PPT训练.html | 删 module-hero；删「数据可视化」(8459)「版式练习」(7889)「每周一练」(3951/9245) 三模块（连带清理）；bn-icon×5；页内 emoji 容器清零 |
| kou-ai | AI模拟面试.html | 准备页（setup-panel）布局重构：弱化整页渐变、对齐全站设计令牌、🎯/⚠️ 换 data-icon、chip 改分段样式；面试进行中（chat-container/timer）结构功能不动 |
| kou-chat | 私聊.html + tools/qa/qa_c1_0913h.js | 删「💬 好友」im-title（83 行，topbar-title「好友」保留）；「加好友」「群聊」modal→tab 页面视图（五 tab 顺序不变，onclick 改 imSwitchTab 切换，弹窗函数可保留但入口不再调用）；输入框 placeholder→「输入消息…」；🎤😊→data-icon；页内 emoji 容器清零；**同步更新 qa_c1_0913h.js 断言**匹配新 onclick |
| kou-misc | 工具.html + 个人中心.html | 工具：「导入题库」modal→全屏页面视图（9559-11037 区间，功能不动）；logo-icon🧰/stat-icon×2/bn-icon×5/bm-icon×6。个人中心：logo-icon×1/stat-icon×2/sgc-icon×5/title-icon×3/bn-icon×5/bm-icon×6 |
| kou-appjs | assets/app.js + assets/icon-map.js（独占写者） | ①icon-map.js 按需注册缺口图标（bot/map/eye/thumbs-up/smile/image/video/send 等，lucide 风格）；②HOME_DEF 6 项+🛣️标题→data-icon（renderHomeQuick 的 hq-ic 渲染改 data-icon span，编辑面板 chip 文案保留 ic 文本）；③博客统计六宫格（~5760 行）emoji→data-icon；④广场帖子卡分类 chip/公开徽章/统计行 emoji→data-icon（分类映射与功能中心一致：四级=book-open、央国企=pencil、高情商=message-square、商务礼仪=handshake、PPT=palette、广场/其他=globe）；⑤演示浮标 🤖→bot data-icon；⑥聊天正文 🤖 不动 |
| kou-chatjs | assets/chat-local.js | 🤖/演示浮标/AI 头像位 emoji→data-icon（bot 图标由 kou-appjs 保证注册，你直接用 data-icon="bot"）；对话气泡正文 emoji 不动 |
| kou-backend | server/（独占） | 新增 POST /api/feedback：接收 {nickname,type,content}，追加存服务器（data/feedback.json 或新表，自读 server 结构决定），返回 {ok:true}；提供创作者查看方式说明（SSH cat/导出脚本）；不动其他接口；写一份 server 改动说明交主理人（部署时需重启服务） |
| kou-scanner | tools/e1r_icon_check.js + tools/qa/（新建） | ①重写/升级全站图标扫描器：扫全部 HTML + assets/*.js（JS 渲染字符串也扫），容器类全集（title-icon/bn-icon/bm-icon/mpc-icon/hq-ic/sgc-icon/sq-ic/stat-icon/logo-icon/ed-hero-emoji/*ic*），输出全量清单（文件/行/容器/emoji）；②断言：icon 容器 emoji 残留=0（白名单：正文文案、placeholder、🌙 文案、用户头像）+ data-icon 引用 100% 已注册；③留档 ASCII 日志 |
