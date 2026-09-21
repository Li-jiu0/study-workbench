# R39–R43 独立证伪回归报告（第二层 QA）

- 取样时间：2026-09-13 17:48 UTC（本地 2026-09-14 01:48）；脚本运行 17:53–17:57 UTC
- 验证对象：`assets/chat-local.js`、`assets/admin-contact.js`、`私聊.html`
- 对照基线：`assets/chat-local.js.bak-0914b`、`assets/admin-contact.js.bak-0914b`
- 版本戳确认：`私聊.html` 引用 `chat-local.js?v=20260914b`、`admin-contact.js?v=20260914b`；`.ac-entry`(L99)/`.ac-badge#acEntryBadge`(L101) DOM 与样式(L326-329) 均在位
- 结论：**全部 PASS（0 FAIL）**；发现 1 处**非阻断**瑕疵（见文末）

## 证据文件
| 文件 | 内容 |
|---|---|
| `tools/qa/_r3943_chat_regression.js` / `.txt` | R39/R40/R41/R42 jsdom 独立回归（10 PASS） |
| `tools/qa/_r3943_admin_contact.js` / `.txt` | R43 admin-contact 角标回归（5 PASS） |
| `tools/qa/_r3943_e2e_probe.py` / `.txt` | 真实接口 E2E 探针（127.0.0.1:8000） |
| `tools/qa/_r3943_chat_diff.txt` / `_r3943_admin_diff.txt` | 与 `.bak-0914b` 的逐行 diff |
| `tools/qa/_r3943_survey.txt` | 取样（文件 mtime / 版本戳） |

---

## R39 非好友来信动态会话
| 证伪点 | 判定 | 证据 |
|---|---|---|
| 动态创建会话（imEnsureServerChat） | PASS | chat_regression: id=10006/serverId=6/isServer=true，字段形状正确 |
| 持久化 `data.chats[k].isServer/serverId` | PASS | chat_regression + code L484-490 |
| 刷新后仍在（loadChats 回填、不重复） | PASS | 清空 S.chats → loadChats → 恰好 1 条；再 loadChats 仍 1 条 |
| 已读归零后仍保留行 | PASS | unread=0 落盘 → loadChats 行仍在 |
| getFriend 回退（会话行可点开） | PASS | getFriend(10006) 返回 isServer 对象 |
| **adminPeer「不建重复会话行」只对非管理员生效** | PASS | 直接触发 5s 轮询回调：非管理员+发信人=管理员(6)→**0 行**；非管理员+发信人=非管理员(7)→1 行；**管理员视角(S.isAdmin=true)+发信人=6→1 行** |
| 真实 E2E：管理员→用户 未读可见 | PASS | 管理员(6) POST /api/chat/7/messages →200；user7 GET /api/chat/unread → `{peerId:6,count:2,lastId:11}` |

## R40 管理员「全部用户」列表
| 证伪点 | 判定 | 证据 |
|---|---|---|
| isOnline===true 出「● 在线」绿点 | PASS | chat_regression `● 在线` 命中 |
| lastActive 不被 'YYYY-MM-DD HH:MM:SS' 打歪 | PASS | 实测 空串→「—」、非法串→「—」、未来时间→「刚刚」、刚刚(<1min)→「刚刚」、本地时间串不 NaN |
| 管理员行标 [管理员] 且不隐藏自己 | PASS | chat_regression 含 [管理员]；E2E admin/users total=9 且含 id=6 isAdmin=True |
| items 空数组 → 「全部用户 (0)」不报错 | PASS | imAdminUsersHtml([]) 命中 `全部用户 (0)` |
| /api/admin/users 403（普通用户）→ 降级 /api/friends、不白屏 | PASS | chat_regression：管理员先请求 /api/admin/users，403 后请求 /api/friends 并渲染「注册好友」；**真实 E2E**：uid7 → 403 `仅管理员可访问` |

## R41 imOpenChatWithUser
| 证伪点 | 判定 | 证据 |
|---|---|---|
| 从未聊过（S.chats 无、SERVER_FRIENDS 无）点击进会话 | PASS | opened=[10007]、S.chats 出现合成行、已持久化 |
| 昵称含 `' " < &` onclick 不破 | PASS | round-trip 复原 `a'b"c<d>&evil`，onclick 前缀与实参正确 |
| id 10000+uid 不与 AI 好友 id 冲突 | PASS | AI 好友 id 实测 {1,8,101..106}，max=106；10001.. >> 106；与服务器好友同 scheme，复用不新增 |
| 已存在会话重复点击不产生第二条 | PASS | 两次调用 S.chats 恒 1 条 |

## R42 账号与资料卡
| 证伪点 | 判定 | 证据 |
|---|---|---|
| `@username` 仅 username 非空出现 | PASS | imAdminUsersHtml 空 username 无 @（@ 计数恰 2）；资料卡空 username 无 @ |
| imShowUserProfile 403/异常 → 「资料加载失败」 | PASS | 403 → body 含「资料加载失败」；**真实 E2E**：uid7 请求 /api/admin/users/7 → 403 |
| 重复打开不叠加、关闭移除 DOM | PASS | 连开 2 次 modal 恒 1 个；close 后 0 个 |
| 普通好友行仍走 openUserHome（未被误改） | PASS | 非管理员 renderFriends 输出含 `openUserHome(`、不含 `imShowUserProfile(`；diff 确认改动只在 imAdminUsersHtml |

## R43 管理员入口角标（admin-contact.js）
| 证伪点 | 判定 | 证据 |
|---|---|---|
| 角标取自 unread 中 peerId===管理员id 的 count | PASS | poll 触发后角标显示「3」（E2E：admin/contact→id=6） |
| count=0 / null 必须隐藏 | PASS | 两种输入角标 display=none |
| >99 → 99+ | PASS | count=150 → 「99+」 |
| 打开面板后角标清零 | PASS | 打开前 5 → 打开（loadMsgs markRead + refreshEntryBadge）→ none |
| 5s 轮询 document.hidden 跳过（真条件） | PASS | hidden=true 时 poll 不产生任何请求；hidden=false 时请求恢复 |
| 管理员登录不漏会话行 | PASS | chat_regression：S.isAdmin=true 时 adminPeer 守卫不生效，正常建行 |

## 回归：普通用户↔好友私聊全链路未变
- `git diff .bak-0914b` 显示改动**仅限**：imAdminUsersHtml（管理员列表行）、新增 imCachedAdminId/imResolveAdminId/imStrArg/imOpenChatWithUser/imShowUserProfile、boot 增 `imResolveAdminId()`、未读轮询 `if(!chat)` → `if(!chat && !adminPeer)`、测试钩子。
- `renderRegFriends`（注册好友列表）、`renderChats`（会话列表）、`imOpenChat`、好友收发消息/已读 均**未改动**；未读轮询对普通好友发信人（chat 命中）行为等价。
- 结论：普通私聊链路与改动前一致。

## 非阻断瑕疵（不判 FAIL）
- `assets/chat-local.js` R40 降级分支错误信息误用 `res.status`：`res` 实为 `{ok,d}`（无 `status`），导致 `throw new Error('HTTP ' + res.status)` 记成 `HTTP undefined`（L~710，取样时 L686）。**仅 console.warn 文案瑕疵，降级行为（catch→renderRegFriends）正确、无白屏**。建议后续把 `res.status` 改为 `r.status` 或去掉。
