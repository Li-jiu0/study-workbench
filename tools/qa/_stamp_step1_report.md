# R88-STAMP 第一步审计报告（只读，未改任何文件）

阈值：本批 = 2026-09-18 18:47 之后落盘；统一新戳建议 = `20260918d`
扫描：项目真实页面 48 个（已排除 `.tmp_eng/`、`_bak-pre-*`、`.qa/`、`备份/`、`android/`、`server/`、`web/`、`docs/`、`deliverables/`、`tools/`）

## 一、本批改动文件清单（实测 mtime + 体积 + 行尾）

| 文件 | mtime | 体积 | 行尾 | 与 lead 对照 |
|---|---|---|---|---|
| AI模拟面试.html | 09-18 18:50:13 | 88574 | CRLF 2051 | ✅一致 |
| 私聊.html | 09-18 18:50:23 | 71537 | CRLF 1068 | ✅一致 |
| 设置.html | 09-18 18:50:31 | 164991 | CRLF 2522 | ✅一致 |
| assets/common.css | 09-18 18:51:23 | 127605 | CRLF 2915 | ✅一致 |
| assets/xt-profile.css | 09-18 18:52:04 | 39053 | CRLF 1224 | ✅一致 |
| 更多.html | 09-18 18:52:22 | 18875 | CRLF 319 | ✅一致 |
| assets/xt-update.js | 09-18 18:52:53 | 38340 | **LF 1094** | ✅一致 |
| assets/xt-moments.js | 09-18 18:53:14 | 54595 | CRLF 1107 | ✅一致 |
| 朋友圈发布.html | 09-18 18:53:14 | 12521 | CRLF 169 | ✅一致 |
| assets/xt-profile.js | 09-18 18:54:21 | 138548 | CRLF 2750 | ✅一致 |
| assets/ai-service.js | 09-18 18:54:47 | 148942 | **LF 3279** | ✅一致 |
| assets/ai-settings.js | 09-18 18:55:25 | 134478 | **LF 3298** | ✅一致 |
| ai-settings.html | 09-18 18:55:41 | 44729 | **LF 839** | ✅一致 |
| assets/ai-page.js | 09-18 18:56:36 | 133571 | **LF 2459** | ✅一致 |

### ⚠️ 与 lead 清单不符 / 需订正
1. **`assets/icon-map.js` 不在本批**：实测 mtime = **09-18 18:18:09**（早于 18:47）。lead 把它列在「18:47 后」块里 —— 记错了，它属「需判定」档，判定为**非本批**。
2. **`assets/xt-aiusage.js` = 18:17:20、`assets/xt-region.js` = 18:09:12、`assets/chat-local.js` = 18:19:12、`assets/api.js` = 18:13:00、`assets/app.js` = 18:13:00、`社区.html` = 18:12:45** —— 全部早于 18:47，判定为**非本批**（见第三节）。
3. lead 体积数字**全部核对无误**（仅 `icon-map.js` 归属批次错）。

## 二、资源 × 页码 × 当前戳 完整对照表（仅真实页面）

> 关键结论：**lead 所说的「8 种 / 9 种散乱戳」是被备份目录（`.tmp_eng/backup_a8/`、`_bak-pre-b5-subst/`）虚高的**。真实页面里绝大多数资源只有 **1 种**戳。真实散乱仅出现在 `个人资料.html`（单页用 20260917/20260917b）与 `blog_wechat.html`（无戳）。

### 本批改动资源（建议刷 20260918d）
| 资源 | 当前戳 → 页数 | 合计页 |
|---|---|---|
| `common.css` | `20260917b` → 46 | 46 |
| `xt-profile.css` | `20260917b` → 1（个人资料.html） | 1 |
| `xt-update.js` | `20260918c` → 3（更新/更多/设置） | 3 |
| `xt-moments.js` | `20260917b` → 3（动态空间/我的动态/朋友圈发布） | 3 |
| `xt-profile.js` | `20260917b` → 1（个人资料.html） | 1 |
| `ai-service.js` | `20260918c` → 36 ; `20260918b` → 1（blog_wechat.html） | 37 |
| `ai-settings.js` | `20260918c` → 1（ai-settings.html） | 1 |
| `ai-page.js` | `20260918c` → 1（AI.html） | 1 |

### 非本批资源（保持原戳不动）
| 资源 | 当前戳 → 页数 |
|---|---|
| `config.js` | `20260916O`→42 ; `20260917`→1（个人资料.html） |
| `icon-map.js` | `20260916O`→45 ; `20260917`→1（个人资料.html） |
| `polish.css`/`states.css`/`xt-toast.js`/`page-head.css`/`error-boundary.js` | `20260916O` → 41（polish 37） |
| `xt-polyfill.js` | `20260916O` → 45 |
| `xt-moments.css` | `20260917b` → 3 |
| `app.js`/`api.js` | `20260917b` → 41 / 37 |
| `chat-local.js` | `20260917b` → 1 |
| `xt-region.js` | `20260918a` → 3 |
| `xt-aiusage.js` | `20260918c` → 1 |
| `ai-cap-registry/image/vision/audio/embed/translate/video/3d.js` | `20260918c` → 36（+ blog_wechat.html **无戳**） |
| `ai-config.js` | `20260918c`→36 ; `20260918b`→1（blog_wechat.html） |

## 三、建议刷 / 不刷

### ✅ 建议刷（本批改动，共 8 个资源 → 戳 20260918d）
`common.css`、`xt-profile.css`、`xt-update.js`、`xt-moments.js`、`xt-profile.js`、`ai-service.js`、`ai-settings.js`、`ai-page.js`

### ❌ 建议不刷（本批未改动，保持原戳）
- `ai-cap-*.js` ×8、`ai-config.js`（mtime 16:27–16:30，非本批）；`xt-aiusage.js`（18:17）；`xt-region.js`（18:09）；`app.js`/`api.js`（18:13）；`chat-local.js`（18:19）；`icon-map.js`（18:18）；`xt-moments.css`（09-17 23:07）；`config.js`/`polish.css`/`states.css`/`xt-toast.js`/`page-head.css`/`error-boundary.js`/`xt-polyfill.js`（09-14~09-16）
- **HTML 文件本身不在刷戳范围**：实测**无任何 `.html` 被 `?v=` 引用**（第 4 步已核）。

> ⚠️ **例外请示**：`ai-service.js` 与 `ai-config.js` 都出现在 `blog_wechat.html`，且该页对 8 个 `ai-cap-*.js` **完全无戳**。`ai-service.js` 属本批要刷，但 `ai-config.js`/`ai-cap-*.js` 非本批。若只刷 `ai-service.js` 的戳，`blog_wechat.html` 会出现「本批新戳 + 旧戳/无戳」混排。**请指示**：(a) 只按本批刷 `ai-service.js`；还是 (b) 连带把 `blog_wechat.html` 的 8 个 ai-cap + ai-config 补齐到 d（超出「本批」范围，但逻辑更干净）。

## 四、HTML 被 `?v=` 引用情况
**无**。全树扫描结果：没有任何 `<xxx.html?v=...>` 形式的引用。故 HTML 文件不刷。

## 五、每个文件的真实行尾（实测）
- **CRLF**：AI模拟面试.html、私聊.html、设置.html、common.css、xt-profile.css、更多.html、xt-moments.js、朋友圈发布.html、xt-profile.js、icon-map.js、chat-local.js、api.js、app.js、社区.html、ai-config.js（以及所有 ai-cap-*.js 命中的页面）
- **LF**：xt-update.js、ai-service.js、ai-settings.js、ai-settings.html、ai-page.js、xt-aiusage.js、xt-region.js
- 全部 `loneLF=0`（CRLF 文件）/ `CRLF=0`（LF 文件），无 MIXED。

## 六、假命中 / 其它引用方式
1. **假命中（注释文本）**：`动态空间.html` L16/L66 注释里提到 `assets/xt-moments.js`，非 `<script src>` —— 已排除，只算真实标签。
2. **无戳的真实标签引用（漏刷风险）**：`blog_wechat.html` 用 `<script src="assets/ai-cap-*.js">`（8 个，无 `?v=`）。这是**既存**问题，非本批引入。
3. **隐藏脚手架**：`.qa/live_chat.html` 引用 `common.css`/`chat-local.js`（无戳）—— 属 QA 临时文件，**不在项目发布页内，已排除**。
4. **引用方式**：全部为 `<script src>` / `<link href>` 两种；**未发现** `@import`、动态 `import()`、字符串拼接 URL 形式的资源引用。
5. **备份镜像（非页面，不刷）**：`.tmp_eng/backup_a8/*.html`（26 页）、`_bak-pre-b5-subst/演示.html` —— 这些是**导致 lead 看到「多戳散乱」的元凶**，已全部排除。

## 七、若获准执行，将改动
- **待编辑 HTML 文件数：46**（common.css 命中 46 页，为主）
- **待改资源引用条目数**：8 资源 × 各自页数（含 ai-service.js 的 37 页）＝约 **46(common) + 1 + 3 + 3 + 1 + 37 + 1 + 1 = 93 处**戳值替换（去重后按 (文件,资源) 计）
- 备份目录：`tools/_bak_stamp_r88d/<原文件名>.bak-stamp-r88d`
- 全部二进制读写，改后逐文件校验行尾零漂移。

**待 lead 确认第三节「例外请示」后即执行。**
