# R44 后端根因侦查（只读）· kou-r44-server

## 结论速览
| Bug | 根因 | 性质 |
|---|---|---|
| D 管理员登录失败 | 生产库无 `is_admin` 管理员账号（seed 从未在生产执行） | 部署/数据问题 + 代码缺陷（密码不同步） |
| E 联系管理员失败 | 生产后端**没有** `/api/admin/contact` 路由 → 404 | 部署问题（server/ 未上线） |
| F 未找到管理员账户 | 同上，E 导致 `adminId=0`，前端拦截 | 部署问题（连带） |

**核心结论：生产后端代码早于 09-13 17:21（commit ead8ea1），整个「需求01 超级管理员」后端从未上线。
与手机端/PC 端无关，两端同源同因。**

## 一、/api/admin/contact（本地 server/routers/admin.py:107-131）
- 路由：`GET /api/admin/contact`，鉴权 `Depends(get_current_user)`（**只要求登录，不要求 is_admin**），未登录 401。
- 查管理员：`config.ADMIN_USERNAME`（默认"管理员"）精确匹配 `User.username`（:120-121）；
  不匹配则兜底取 `User.is_admin == True` 的最小 id（:124）；都没有 → 404「管理员账号不存在」（:126）。
- 返回字段（**仅三个**）：`{ "id", "username", "nickname" }`（:127-131）。
- 前端读取：assets/admin-contact.js:56 `d.id`（兼容 `d.userId`）、assets/chat-local.js:513 同。
  **字段名一致，无 mismatch。**

## 二、登录接口（server/routers/auth.py:59-64）
```python
@router.post("/login")
def login(body: LoginIn, db=Depends(get_db), _rl=Depends(rate_limit("auth"))):
    user = db.query(User).filter(User.username == body.username.strip()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(400, "账号或密码错误")
```
- 入参 `LoginIn{username, password}` 无长度/正则限制（schemas.py:52-54），中文账号不受影响。
- **无任何 is_admin / 黑名单 / 不可登录过滤** → 管理员不会被"挡住"，失败只可能是账号或密码本身。
- 返回：`{token, refreshToken, isAdmin, is_admin, user:{id,username,nickname,isAdmin,is_admin}}`（auth.py:19-35）。
- 注意：失败是 **400**（不是 401）。

## 三、管理员建号机制
- 入口：`server/main.py:33 admin.ensure_admin_user()`（模块导入时执行，即每次启动）。
- 实现：`server/routers/admin.py:49-95`。账号名 `config.ADMIN_USERNAME or "管理员"`（:59，config.py:20）。
- 密码来源：环境变量 `ADMIN_PASSWORD`（config.py:21）；**未设置时用内置默认 `_ADMIN_DEFAULT_PASSWORD = "Admin@2026"`（admin.py:44）**。
- 关键缺陷（admin.py:60-62, 85-87）：只有在**设置了 ADMIN_PASSWORD** 时才每次启动同步密码；
  未设置时（use_default）**仅首次创建写入，已存在则保持原密码不变** → 老账号的密码永远同步不成默认密码。
- 是 users 表普通一行 + `is_admin` 列（database.py:65），不是独立表。
- 前端**不写死**管理员账号（assets/admin.js 只读 is_admin 标记）。

本地库实测（tools/qa/_r44_admin_pwd_check.txt）：users 表 id=6 `管理员` is_admin=1，
其 password_hash 与 `xingtu2026` 校验通过（pbkdf2 离线比对），与 `Admin@2026` 不匹配 → 本地 seed/注册成功过。

## 四、can_message（server/database.py:360-371）
好友放行；**任一方 is_admin 亦放行**。管理员↔任意用户本就通行。
发消息失败环节：前端 admin-contact.js:137 `if (!S.adminId) toast('未找到管理员账户')` 直接拦截；
即使发出，peer_id=0 → can_message False → chat.py:93 403。

## 五、生产实测（只读 HTTP 探测，tools/qa/_r44_remote_probe*.txt）
```
GET  http://110.42.134.62/api/health            -> 200
GET  http://110.42.134.62/api/auth/me           -> 401 (路由存在)
GET  http://110.42.134.62/api/chat/unread       -> 401 (路由存在)
POST http://110.42.134.62/api/auth/change-password -> 401 (路由存在, 09-11 ad62f01)
GET  http://110.42.134.62/api/admin/contact     -> 404 Not Found   ★
GET  http://110.42.134.62/api/admin/overview    -> 404 Not Found   ★
GET  http://110.42.134.62/api/admin/users       -> 404 Not Found   ★
GET  http://110.42.134.62/api/admin/feedback    -> 404 Not Found   ★
GET  http://110.42.134.62/api/admin/online      -> 404 Not Found   ★
GET  http://110.42.134.62/api/feedback/mine     -> 404 Not Found   ★(ead8ea1 09-13 17:21 新增)
POST http://110.42.134.62/api/auth/login {"username":"管理员","password":"xingtu2026"}
                                                -> 400 {"detail":"账号或密码错误"}  ★
```
版本定界：
- 有：`change-password`(09-11 16:38 ad62f01)、`groups`(2a056ce)、`chat/unread`
- 无：`feedback_public /mine`(09-13 17:21 ead8ea1)、`admin/*`(09-14 00:10 f803f4f、00:34 1a8e077)
→ **生产后端代码早于 09-13 17:21，至少落后 3 次含服务端改动的提交；重启/部署缺失。**

## 六、修复建议（需改处）
1. **部署**（必须，解决 E/F）：上传 `server/` 全量并重启后端进程；无需改前端。
   `routers/admin.py` 新增文件必须随 `main.py` 一起上线，且 main.py:51 `app.include_router(admin.router)` 生效。
2. **管理员账号**（解决 D）：部署后 `ensure_admin_user()` 会自动建号；但若生产库已有同名行且密码不符，
   因 admin.py:61-62/85-87 的 `use_default` 分支不会重置密码 → 仍登不上。
   建议二选一：
   a) 生产 `server/.env` 写 `ADMIN_PASSWORD=xingtu2026` + `ADMIN_USERNAME=管理员` 后重启（**不改代码**）；
   b) 改 admin.py:85 逻辑，去掉 `not use_default` 条件，让默认密码也强制同步（**改代码，admin.py:85**）。
3. 可选加固：登录失败目前返回 400（auth.py:63），前端若按 401 处理会不触发刷新，可保持一致但不紧急。

## 七、补充：部署必须是「整批」，不能只补 admin.py（与 kou-r44-live 取证对齐后修订）
> **状态：本节描述的是部署前的旧状态。生产已于 2026-09-14 02:36 完成全量部署并重启（PID 1120278），
> 下述风险均已消除，复核结论见第八节。本节保留作为过程记录。**
kou-r44-live 实证：生产 chat.py 仍是旧版（`is_friend` 而非 `can_message`），生产库 users 表**无 is_admin 列**；
md5 全量比对为 1 新增 + 18 更新（tools/qa/r44_server_diff.txt）。

### 只补 admin.py 的三重失败
1. **发消息 403**：chat.py:62/93 仍用 `is_friend` → 普通用户↔管理员互发被拒（kou-r44-live 实测 PROD=False）。
2. **管理员不隐形**：friends.py:235 / users.py:151,165 / moments.py:77 / social.py:157,166 的 is_admin 过滤都在新版里，旧版会把管理员暴露在搜索/好友/动态/留言（违反交接文档硬需求）。
3. **管理员登录了也进不去后台**：`is_admin` 双写来自 f803f4f 的 auth.py:26-33/95-96（git log -S"is_admin" 命中 f803f4f），生产 auth.py 旧版 → 登录与 /api/auth/me 都不返回 isAdmin → assets/admin.js:63/66 读不到标记 → 「管理后台」入口不显、管理员.html 走 403 分支。

### 混搭会直接打挂后端（ImportError，比 403 更严重）
- chat.py:11 / friends.py:13 / users.py:9 / moments.py:17 / admin.py:29 **都从 database.py 导入 `is_admin_user`**；ws.py:21 导入 `can_message` → 新版 router 配旧版 database.py = 启动即 ImportError。
- ws.py:22-25 还依赖 routers.chat / routers.friends / wsmanager → 这几个必须同批。
- auth.py 依赖 schemas.py（`privacy_of`）、rate_limit.py → 要上 auth.py 就得带上这两个。
- admin.py:31 `from routers import feedback_public`，并在 :295/338/351 用 `_load_all/_write_lock/_save_all` → 旧版 feedback_public.py 缺这些符号时 /api/admin/feedback 直接 500。

### 建议
- **首选：server/ 全量同步（19 个文件）后重启**，不做部分部署；`data.db` / `uploads/` / `.env` 不动，生产独有的 check_users.py 等脚本保留。
- 若必须最小化，**最小可跑集 = config.py + database.py + main.py + routers/admin.py + routers/chat.py**；
  **强烈追加** routers/{friends,users,moments,social,feedback_public,auth,schemas,rate_limit,ws}.py + wsmanager.py。
- 无需手工改库：`database.py:437-441` 守卫式 `ALTER TABLE users ADD COLUMN is_admin`，由 `main.py:31 init_db()` 触发，且早于 `main.py:33 ensure_admin_user()`，顺序正确。
- ⚠️ **必须设置 ADMIN_PASSWORD**：生产库当前没有管理员行（login 实测 400），部署后 `ensure_admin_user()` 会**新建**账号；未设环境变量时密码取 `_ADMIN_DEFAULT_PASSWORD="Admin@2026"`（admin.py:44/61-62），
  与用户预期的 `xingtu2026` 不一致 → **Bug D 依旧复现**。部署前须在 `server/.env` 写 `ADMIN_USERNAME=管理员` + `ADMIN_PASSWORD=xingtu2026`。
- 验收口径（kou-r44-live 提供）：部署并重启后 `GET /api/admin/contact` 应返回 **401/403**（路由已注册），不再是 404。

## 八、部署后复核（2026-09-14 02:36 全量部署 + 重启，独立复测通过）
我（kou-r44-server）独立只读复测，与 kou-r44-live 结论一致：
```
GET /api/health          -> 200 {"ok":true,...}
GET /api/admin/contact   -> 401 {"detail":"未登录或令牌缺失"}   （部署前 404）
GET /api/admin/overview  -> 401
GET /api/admin/users     -> 401
GET /api/admin/online    -> 401
GET /api/admin/feedback  -> 401
GET /api/feedback/mine   -> 401   （此前"404"系路径模板比对假阳性）
GET /api/chat/unread     -> 401
```
判定：**401 = 路由已注册且鉴权生效**，正是部署验收口径；404 已消失 → Bug E/F 的服务端前置条件已具备。

kou-r44-live 提供的部署后实测（我未重复登录，避免多余调用）：
- `POST /api/auth/login {username:"管理员", password:<生产 .env>}` → 200，`isAdmin=true / is_admin=true`，`user.id=10`
- `GET /api/admin/contact` 带 token → 200 `{"id":10,"username":"管理员","nickname":"管理员"}`
- 生产库 `is_admin` 列已存在，管理员行 id=10 is_admin=1，ADMIN_COUNT=1，createdAt=2026-09-14 02:36（与重启时间吻合）
- 生产 auth.py 含 8 处 is_admin/isAdmin；database.py 含 `is_admin_user` / `can_message`；chat.py 两处门禁已改为 `can_message`
- 生产 `server/.env` 存在，`ADMIN_PASSWORD` 已设置且等于 xingtu2026（MD5 比对，非明文），`ADMIN_USERNAME` 未设置 → 回落默认「管理员」

### 三条 Bug 关闭状态
- **D 管理员登录失败**：已解决（生产建号成功 + 密码=环境变量值；登录 200）。
- **E 联系管理员失败**：服务端条件已具备（contact 401/200 正常），待前端在真机复验。
- **F 未找到管理员账户**：同上，adminId 可取到 10，待前端复验。

### 仍需留意（非阻塞）
1. `ADMIN_USERNAME` 未在生产 .env 显式设置，目前靠代码默认值「管理员」（config.py:20）。若日后改默认值或环境变量，账号名会漂移；建议补写一行固化。
2. `admin.py:85` 的 `not use_default` 分支仍在：一旦移除 .env 里的 `ADMIN_PASSWORD`，重启后**不会**把密码改回默认值，账号将保持 xingtu2026；反之若以后想轮换密码，必须改 .env 再重启。属设计行为，记录备查。
3. `server/routers/admin.py:44` 内置默认密码 `Admin@2026` 仍留在源码里（仅未设环境变量时生效），建议后续评估是否移除。

## 九、日志
- tools/qa/_r44_admin_pwd_check.txt（本地管理员密码离线校验）
- tools/qa/_r44_remote_probe.txt / 2 / 3 / 4 / 5（生产路由探测）
- tools/qa/_r44_git_*.txt（服务端提交时间线）
- tools/qa/_r44_msgs.txt（本地消息/好友快照）
