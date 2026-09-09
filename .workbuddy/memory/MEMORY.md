# 项目长期约定 · 学习工作台

## 性质与演进
中文备考/求职工具站（四级词汇、行测、央国企笔试、高情商表达、面试礼仪、PPT、错题本、学习博客）。演进：单文件 → 多页面纯前端（file:// + localStorage）→ 本地登录/个人中心/全局搜索/AI三模式 → FastAPI+SQLite 多人博客/私信版（server/）→ Android WebView APK。
- 前端 **file:// 可直开**，原生 JS 无 CDN（防断网）；多人功能需先启动 server/（http://localhost:8000），api.js 自动探测，无后端则降级本地。
- 用户强要求：扩展必三件套（DOM容器+CSS+空函数并标【后续扩展点】）；不写死、不删原功能、保留 DOM；**AI/API 密钥绝不进前端 JS**，生产走后端中转。

## 文件职责
- **页面**：学习工作台(首页hub)/四级备考/央国企笔试/高情商表达/商务礼仪面试/PPT训练 = 模块页(.content 内)；行测刷题/错题本/四级词汇/商务礼仪/面试题库/PPT版式库/PPT案例拆解/场景话术库/万能金句库/学习博客/设置/个人中心 = 资料库页(.main 兄弟)；私聊.html=在线私信；登录.html **不引 app.js**（防门禁循环）。
- **assets**：common.css 变量+全量样式；polish.css 润色层(可整体移除，定 --g2 模块渐变)；app.js 本地逻辑+登录门禁(≈360KB)；api.js 多人覆盖层(须在 app.js **之后**加载，用户/博客/通知/AI/私信走后端)；chat.js 私信；qbank.js 自定义题库(键 study_workbench_custom)；importer.js 导入向导(docx/txt/csv→qbank)；mini.js+mini-*.js 小题库播放器；voiceplayer.js 四级听说全屏。
- **server/**：FastAPI v2 + SQLite data.db。routers: auth/users/notes/social/friends/chat/ai/uploads/migrate + ws.py(WebSocket) + rate_limit.py。表：users(bio/gender/birthday/city)/notes(软删 deleted_at)/likes/favorites/comments/notifications/friend_requests/friends(存 a<b 单向)/user_blocks/messages(kind text|image,read_at)/ai_usage/ai_logs。旧库自动 ALTER 加列无损升级。启动：`cd server && pip install -r requirements.txt && copy .env.example .env && python -m uvicorn main:app --host 0.0.0.0 --port 8000`。
- **tools**：split.js 单文件→多页(**勿轻易重跑，会覆盖手改生成页**)；inject-v2.js / inject-api.js 幂等批量注入。

## localStorage 键位
业务 `study_workbench_data`；独立：theme / settings / ai_chat / board / ai_fab_pos / users / auth(会话标记) / token / refresh(JWT, api.js) / ai_model / ai_config(旧版废弃) / study_workbench_custom(qbank) / mini_stats。file:// 同源全页共享。

## 布局/导航白屏坑（第六轮，最高危）
- 两类页：模块页在 .content 内；**资料库/中心页是 .content 的兄弟**，navigateTo() 须把空 .content `display:none`，否则顶部大空白且无法滚动；`.main > .page` 要 flex + overflow-y:auto。
- navigateTo() 重写 body.className 会清掉 dark 类 → 主题态用全局变量 isDarkMode。
- 跨模块跳转一律 `navigateTo(page)`（自动查 PAGE_FILES 跳 .html）；定位子视图用 `模块.html#hash`，目标 init 读 hash；**同页只改 hash 不重触发 init，须直接调函数**。
- 大文件手改先备份；改完校验 div 平衡 + `node --check` + 浏览器实测。

## CSS 插入大坑（第五轮 38min）
Edit 的 old_string 含 `</style>` 时，new_string **必须重新带上 `</style>`**，否则 HTML parser 把其后全部当 CSS raw-text → 白屏、script 全丢。改完 grep 核对 `<style` 与 `</style>` 数。`</script>/</body>` 同理。

## Android APK（第八轮起）
- 产物 `学习工作台-安卓App.apk`（包 com.study.workbench，minSdk21/targetSdk33）；源码 android/；keystore 密码 workbench123。站点改动后 `bash android/build-apk.sh` 重打。
- 大坑：aapt2 不认中文路径/资产名（须 ASCII 临时目录）；targetSdk≥30 要求 resources.arsc **STORED+4字节对齐**（merge_apk.py 已强制），对齐判定**只用 `zipalign -c 4`**（Python 算偏移会误判）；验证 `apksigner verify`。
- **WebView 加载（v1.4 定论）**：纯静态 asset 单机 App 只能用 `file:///android_asset/` + **干净 WebViewClient（勿自定义 shouldInterceptRequest）** + `Uri.encode(中文入口名)` 加载，配 setJavaScriptEnabled/DomStorageEnabled/AllowFileAccessFromFileURLs/Universal/MixedContentMode。**自定义 shouldInterceptRequest 或 androidx WebViewAssetLoader(虚拟 https) 在新版 Chromium 上会导致裸 HTML/无样式/闪退**，勿再引入。asset 布局=html 放 asset 根、css/js 放 asset 根下 assets/ 子目录，页面相对引用 `assets/xxx` 自动对上。
- Chrome file:// 按路径缓存、忽略 ?v=、跨重启持久 → 坏版本换新文件名（仅影响本地开发，不影响 APK）。

## 权威文档（先查再改）
根目录：`运行说明.md`（多人版启动/接口清单/迁移）、`增量修改说明.md`（登录/个人中心/搜索/AI/博客）、`安卓App安装说明.md`。9/9 下午又新增私信好友/题库管理/语音/润色等，尚无文档。
