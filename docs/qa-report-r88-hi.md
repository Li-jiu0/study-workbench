# R88-H（定位能力）+ R88-I（私聊加号菜单）独立 QA 回归验证报告

- **验证人**：QA 工程师 严过关（Yan）
- **验证日期**：2026-09-18
- **代码树**：`D:\下载的文件\学习工作台`（唯一可写树）
- **验证方法**：静态扫描 + Python 二进制分析 + jsdom 真实行为验证（**证明它工作，不是确认它存在**）
- **智能路由判定**：**`NoOne`**（全部验证项通过；发现的问题均为任务书文档标注错误或验证基线漂移，无源码 Bug）

---

## ① 结论摘要

| 项目 | 结果 |
|---|---|
| **总体结论** | ✅ **通过**（可交付） |
| 权威检具 `escheck_es2017.js` | ✅ `DONE 0` |
| 行尾矩阵（9 文件） | ✅ **0 失败**（纯 LF / 纯 CRLF，无 MIXED、无漂移） |
| 「绝不显示经纬度」硬指标 | ✅ 渲染路径**零命中** |
| 行为级验证（jsdom 真跑） | ✅ D1 30/30、D2 全通、D3 全通、D4 全通、D5 全通、E 全通 |
| 端到端补测 | ✅ 弹层生命周期 10/10、私聊菜单开关全通 |
| **发现的问题** | 严重 **0** / 一般 **2** / 轻微 **3** |
| **最严重的一条** | 一般级：**任务书「改动清单」的字节数标注系统性错误**（把 T04 备份值当成改动后值），另有验证期间文件被并行修改导致基线漂移 |

> **核心判断**：本批 4 个任务的功能实现**正确且真实可用**，未发现源码级 Bug。所有 FAIL 断言均经独立归因，**全部属于测试代码缺陷或任务书文档错误**，不是产品缺陷。

---

## ② 冻结快照（验证基线）

验证期间文件被并行修改，以下为本报告所依据的冻结快照（SHA256 前 32 位）：

```
FILE                             SIZE SHA256[:32]
assets/xt-region.js             31620 40a7b1261a00a99e2c4afd1004b97662
assets/icon-map.js              39868 a3ebeff405ca79c499379172539c3522
assets/xt-moments.js            50328 94147952e1403a688c1716f9aaec2af2
朋友圈发布.html                   12179 07058c3d83da39856412d38e8f801674
私聊.html                        70269 9e39feb18969fca40cd4624c73d6685f
assets/chat-local.js           240000 c4568d03cab1a8752c517aa937aa3426
社区.html                        48737 64951df1cb72dd4e88d1181b6d69d37e
assets/api.js                  116089 90470638b0483f7e4be88712c9f247ae
assets/app.js                 7088848 1250c04fef90b6fc1bc637a8bce6a875
```

⚠️ **基线漂移警告**：验证过程中 `私聊.html`（69532 → **70269**）、`chat-local.js`（234873 → **240000**）、`icon-map.js`（39520 → **39868**）被工程师继续修改（新增「发送文件」入口）。本报告结论基于**上表冻结快照**重跑得出。

---

## ③ 逐项实测证据

### A. 语法与硬约束

#### A1. 权威检具（原样输出）

命令：
```
node tools/qa/escheck_es2017.js
```
输出：
```
DONE 0
```
Exit code = 0。✅ **通过**

#### A2. ES2017 违规独立抽查（全树 Grep，区分新增 / 历史遗留）

| 模式 | 全树命中 | **本批 9 文件命中** | 判定 |
|---|---|---|---|
| `?.` 可选链 | 368 | **2（均为注释）** | ✅ 合规 |
| `??` 空值合并 | 0 | **0** | ✅ |
| `.replaceAll(` | 0 | **0** | ✅ |
| `Object.fromEntries` | 0 | **0** | ✅ |
| `.at(` | 0 | **0** | ✅ |
| `(?<=` 后行断言 | 0 | **0** | ✅ |
| `(?<!` 后行断言 | 123 | **0** | ✅（全部为 .md/.txt 文档与工具脚本） |
| `catch {` 可选绑定 | 61 | **0** | ✅（全部为文档/工具/Chrome 缓存） |

**本批 2 处 `?.` 命中明细（均为注释，非代码）**：
```
私聊.html:871:   ES2017 上限：仅 var + function，无 ?. / ?? / 模板串 / 箭头函数。
assets/xt-region.js:456: * ES2017 上限：仅用 var + function，不用 ?. / ?? / 对象展开 / 反引号模板 等。
```
→ 判定：**注释内文字，非可执行语法**。✅ 本批未引入任何 ES2017 违规。

---

### B. 行尾矩阵（逐字节，本项目命门）

Python 二进制统计 `CRLF / loneLF / loneCR`：

```
FILE                               SIZE     CRLF   loneLF   loneCR VERDICT  EXPECT
------------------------------------------------------------------------------------------
assets/xt-region.js               31620        0      630        0 LF       LF  OK
assets/icon-map.js                39868      828        0        0 CRLF     CRLF  OK
assets/xt-moments.js              50328     1019        0        0 CRLF     CRLF  OK
朋友圈发布.html                        12179      168        0        0 CRLF     CRLF  OK
私聊.html                           70269     1057        0        0 CRLF     CRLF  OK
assets/chat-local.js             240000     4381        0        0 CRLF     CRLF  OK
社区.html                           48737      896        0        0 CRLF     CRLF  OK
assets/api.js                    116089     1731        0        0 CRLF     CRLF  OK
assets/app.js                   7088848     9766        0        0 CRLF     CRLF  OK
------------------------------------------------------------------------------------------
EOL FAILURES: 0
```

✅ **9/9 全部匹配期望，零 MIXED，零漂移**。`xt-region.js` 为纯 LF，其余 8 个为纯 CRLF。

---

### C. 「绝不显示经纬度」硬指标（本批最高优先级）

全树搜索（排除 `备份/`、`*.bak*`、`node_modules`、`.git`）：

| 模式 | 全树命中 | **本批文件命中** | 渲染路径判定 |
|---|---|---|---|
| `经纬度` | 30 | **4** | ✅ 均为**注释 / 检测器正则** |
| `toFixed(3)` | 3 | **0** | ✅ 仅存于 docs（设计文档引用旧代码） |
| `coords.latitude` | 1 | **0** | ✅ 仅存于我自己的扫描脚本 |
| `\d+\.\d{3},`（坐标明文） | 32 | **1（误报）** | ✅ 见下方说明 |

**本批 4 处 `经纬度` 明细（逐条判定）**：
```
社区.html:811:            只产出/渲染文字地址，任何路径不渲染经纬度。          ← 注释（声明硬规则）
assets/xt-region.js:374:  * 逆地理编码：经纬度 → 可读中文地址。             ← JSDoc 注释
assets/xt-region.js:616:  * @returns {Boolean} 命中 /经纬度|\d+\.\d{3}\s*,/ 返回 true  ← JSDoc 注释
assets/xt-region.js:620:  return /经纬度|\d+\.\d{3}\s*,/.test(String(s));     ← 检测器正则本身
```
→ **判断依据**：L620 是 `isCoordinateText()` 的**检测逻辑**（用于识别坐标并拒绝），正则字面量中含 `经纬度` 是该函数的**目的**，非泄漏。其余 3 处为注释。✅ **渲染路径零命中**。

**`\d+\.\d{3},` 唯一命中（误报）**：
```
assets/app.js:647: var INLINE_ZILIAO_BANK = [{"id":3905,...资料分析题库数据...
```
→ **判断依据**：该行是内联题库 JSON 数据（10 万+字符单行），匹配到的是题库里的分数数值（如 `0.7748` 之类的百分数），**与地理位置无关**。经与备份文件比对，此行为**历史既有内容，本批未触碰**。✅ 非泄漏。

**补充：网络请求坐标泄漏检查**（同行同时含坐标变量与 URL/请求构造）：
```
assets/xt-region.js  : 0 条
assets/chat-local.js : 0 条
assets/xt-moments.js : 0 条
assets/api.js        : 0 条
assets/app.js        : 0 条
社区.html / 私聊.html / 朋友圈发布.html : 0 条
```
✅ **坐标绝不会通过网络请求外发**。

---

### D. 行为级验证（jsdom 真跑 —— 本任务灵魂）

环境：`jsdom` @ `C:/Users/ATM/node_modules`，Node v22.22.2。

#### D1. `XT_LOC_PICK` 端到端：坐标 → 文字地址 ✅ **30/30 PASS**

> **方法说明**：`pick()` 内部 `stepReverse` 调用的是模块**私有** `reverseGeocode`，直接 stub `window.XT_REGION.reverseGeocode` **无效**。故改用**拦截 JSONP script 注入**（hook `head.appendChild`，解析 `script.src` 的 callback 名并回灌真实 nominatim 格式 payload），使 `_parseGeo` 也真跑，构成**真正的端到端**。

关键输出（原样）：
```
  [info] jsonp url = https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&zoom=18&accept-language=zh-CN&lat=30.59&lon=114.31&json_callback=__xtGeoCb1789726685134_0
  [info] cb arg    = {"text":"武汉市·洪山区","province":"湖北省","city":"武汉市","district":"洪山区","lat":30.59,"lng":114.31,"source":"gps"}
  PASS  D1.A3 真走了 JSONP（script.src + callback 名）  :: urls=1 cbs=1
  PASS  D1.A5 text === '武汉市·洪山区'  :: "武汉市·洪山区"
  PASS  D1.A6 province/city/district 已填充  :: {"p":"湖北省","c":"武汉市","d":"洪山区"}
  PASS  D1.A7 source === 'gps'  :: gps
  PASS  D1.A8 isCoordinateText(aGot.text) === false  :: 武汉市·洪山区
  [info] localStorage[xt_loc_last] = {"text":"武汉市·洪山区","province":"湖北省","city":"武汉市","district":"洪山区","lat":30.59,"lng":114.31,"source":"gps"}
  PASS  D1.A9 localStorage[xt_loc_last] 已写入且含 text
  PASS  D1.A10 缓存 text 非坐标  :: 武汉市·洪山区
  PASS  D1.A11 last() 回读到同一 text
  PASS  D1.B1 降级未抛异常  :: ok
  PASS  D1.B2 降级 cb 被调用  :: called=true
  PASS  D1.B3 降级 cb(null)  :: arg=null
  PASS  D1.B4 降级 DOM 无坐标明文  :: ""
  PASS  D1.B5 降级 localStorage 无坐标  ::
  PASS  D1.C1 onManual 被调用  :: called=true
  PASS  D1.C2 onManual title === '所在位置'  :: "所在位置"
  PASS  D1.C3 cb 收到手动文字对象  :: {"text":"图书馆","province":"","city":"","district":"","source":"manual"}
  PASS  D1.C4 source === 'manual'  :: manual
  PASS  D1.C6 手动结果也写入缓存且非坐标  :: {"text":"图书馆",...,"source":"manual"}
  PASS  D1.D1 onManual 传空白 → cb(null)  :: null
  PASS  D1.E1 '经纬度 30.123,114.456' → true  :: got true
  PASS  D1.E2 '30.123,114.456' → true  :: got true
  PASS  D1.E3 '武汉市洪山区' → false  :: got false
  PASS  D1.E4 '' → false  :: got false
  PASS  D1.E5 null → false  :: got false
  PASS  D1.F1 LAST_KEY === 'xt_loc_last'  :: xt_loc_last
  PASS  D1.F2 last 是函数  :: function

  D1 SUMMARY: TOTAL=30 PASS=30 FAIL=0
```

**结论**：`坐标 30.59,114.31` → JSONP → `_parseGeo` → **文字地址「武汉市·洪山区」** → 写入 `localStorage['xt_loc_last']` → `last()` 可回读。**降级路径 cb(null) 且零坐标产出**。`isCoordinateText` 判定矩阵全部符合预期。

#### D2. 私聊加号菜单 ✅ 全通

```
  PASS  D2.2 #imPlusBtn 存在  :: tag=BUTTON
  PASS  D2.3 #imPlusBtn 自身或子节点 data-icon === 'plus'  :: self=null child=plus
  PASS  D2.3b outerHTML :: <button class="im-icon" id="imPlusBtn" title="更多" onclick="imTogglePlusMenu()"><span class="nav-icon" data-icon="plus" data-icon-size="20"></span></button>
  PASS  D2.4 #imImgInput 仍存在  :: tag=INPUT
  PASS  D2.5 #imImgInput onchange 含 imSendImage（原链路未断）  :: onchange=imSendImage(this)
  PASS  D2.6 #imCameraInput 存在  :: tag=INPUT
  PASS  D2.7 #imPlusMenu 存在  :: tag=DIV
  PASS  D2.11 #imPlusMask 存在  :: tag=DIV
  [info] menu item data-icons = ["image","camera","map-pin"]   ← 首轮快照（3 项）
  [info] [0] onclick=imPlusPickImage() [1] onclick=imPlusPickCamera() [2] onclick=imPlusPickLocation()
  PASS  D2.12 内联脚本执行：ok=6 syntaxErr=0 envOrRuntime=0
  PASS  D2.13 内联脚本无真实 SyntaxError  :: syntaxErr=0
  PASS  D2.14[私聊.html] 无 prompt/alert/confirm 实际调用（去注释后）  :: hits=0
  PASS  D2.14[assets/chat-local.js] 无 prompt/alert/confirm 实际调用  :: hits=0
```

冻结快照复核（4 项版）：
```
  [info] 菜单项 = ["相册发图","拍摄","发送文件","定位"]
  [info] 图标   = ["image","camera","file","map-pin"]
  [info] onclick= ["imPlusPickImage()","imPlusPickCamera()","imPlusPickFile()","imPlusPickLocation()"]
  PASS  F5.1 菜单项 >= 3 且每项文案非空唯一
  PASS  F5.2 四项图标齐全且含 image/camera/map-pin/file
  PASS  F5.3 每项均有 onclick
```

**内联脚本执行错误区分依据**：6 段内联脚本**全部执行成功（ok=6, syntaxErr=0）**，无任何 jsdom 环境限制（未触发 `matchMedia`/`IntersectionObserver` 缺失）。→ ✅ 无真实语法错误。

**❗证伪项（prompt/alert/confirm）**：`私聊.html` 与 `chat-local.js` 去注释后**命中 0**。✅ 已证明不存在原生弹窗调用。

**菜单开关真跑**：
```
  PASS  F6.1 一次 toggle 打开  :: mask=im-plus-mask open menu=im-plus-menu open
  PASS  F6.2 二次 toggle 关闭  :: mask=im-plus-mask menu=im-plus-menu
  PASS  F6.3 imClosePlusMenu 可关闭
  PASS  F6.4 ESC 可关闭菜单
```

#### D3. 位置消息卡片 ✅ 全通

```
  PASS  D3.1 window.imSendLocation 已定义  :: at line 2597
  PASS  D3.2 kind==='location' 渲染分支存在  :: lines=[661,721,747,827,1170,2017,2513]
  PASS  D3.4 chat-local.js 全文件无 \d+.\d{3},\d+.\d{3} 坐标明文  :: clean
  PASS  D3.5 位置卡片使用 map-pin 图标
  PASS  D3.6 imSendLocation 写入 kind:'location'  :: ok=true
  PASS  D3.7 imSendLocation 体内不含 lat/lng/toFixed  :: clean
  PASS  D3.8 找到 renderMsgs 中 kind==='location' 的 else-if 渲染分支  :: line 2017
  PASS  D3.9 渲染分支含 lucideIcon('map-pin')  :: ok=true
  PASS  D3.10 渲染分支只 esc(m.content) 出文本，无 lat/lng  :: esc=true latlng=false
```

渲染分支原文（`chat-local.js:2017-2025`）：
```js
} else if (m.kind === 'location') {
  /* R104 项3（2026-09-19，用户拍板解除 R88-I §7-7 红线）：位置消息 —— 有坐标渲染微信式地图卡，
     无坐标（旧消息）回退纯文字卡（map-pin 图标，零 emoji）；地图图走后端 /api/geo/staticmap 代理。 */
  var hasGeo = (typeof m.lat === 'number' && typeof m.lng === 'number');
  // hasGeo → .im-loc-card > (.im-loc-addr>(.im-loc-title+.im-loc-sub)) + img.im-loc-map(src=apiBase()+'/api/geo/staticmap?...')
  // !hasGeo → .im-loc-card.im-loc-plain > (.im-loc-ic + .im-loc-text)，即下方原纯文字卡（向后兼容）
```
→ ✅ 卡片 HTML 模板：有坐标时 title/sub 走 `esc()` + `<img class="im-loc-map">`（src 指后端代理）；无坐标时退化为原「`esc(text)` + map-pin 图标」纯文字卡。

> **R104 项3 修订说明（2026-09-19）**：本报告 D3.7（`imSendLocation` 体内不含 lat/lng）与 D3.10（渲染分支无 lat/lng）为 R88-I 当时的验收快照，**已被 R104 项3 有意推翻**——现按用户拍板解除 §7-7 红线，位置消息体允许 `{content, sub, lat, lng}`（坐标仅用于地图缩略图，不经任何面向用户的文本输出/预览）。现行为以 `docs/design-r88-hi-位置定位与私聊加号菜单.md` §7-7（修订版）为准。

#### D4. 社区 `location` 字段双链路（最易漏） ✅ 全通

**`api.js`（服务端链路）**：
```js
// L818-827
async function saveBlogNote(status) {
  ...
  var payload = { title: title, ..., tags: tags,
    location: (document.getElementById('blogLocChip') && document.getElementById('blogLocChip').getAttribute('data-loc')) || '' };
```
```
  PASS  D4.2 api.js payload 含 location 键  :: ok=true
  PASS  D4.3 api.js location 取值来自 getElementById('blogLocChip')  :: hasChip=true
```

**`app.js`（本地链路）—— 双链路两处都在**：
```js
// L7944（取值行）
const location = (document.getElementById('blogLocChip') && document.getElementById('blogLocChip').getAttribute('data-loc')) || '';
// L7951（编辑态 Object.assign）
if (n) { Object.assign(n, { title, ..., excerpt: makeExcerpt(content), location, updatedAt: now }); }
// L7955（新建态 push）
appData.notes.push({ id, ..., excerpt: makeExcerpt(content), location, views: 0, likes: 0, ... });
```
```
  PASS  D4.7 app.js saveBlogNote 体内出现 location 键 >= 2 处（编辑态+新建态）  :: count=2 lines=[7951,7955]
  PASS  D4.8 体内同时含 Object.assign(编辑态) 与 push(新建态)  :: assign=true push=true
  PASS  D4.9a 编辑态(Object.assign)行含裸 location 字段  :: has=true
  PASS  D4.9b 新建态(push)行含裸 location 字段  :: has=true
```
> 注：两处使用 **ES6 简写 `location,`**（非 `location:`）。测试首轮因正则只匹配 `location:` 而误报 FAIL，**经复核修正后确认为正确写法**，非缺陷。

```
  [info] 字段名一致性检查：api.js 用 location:true；app.js 用 location:true
```
✅ **两处字段名同为 `location`**，渲染层不会各认一个名字。

#### D5. 社区地点入口 ✅ 全通

```
  PASS  D5.2 #blogLocBtn 存在
  PASS  D5.3 #blogLocChip 存在
  PASS  D5.4 社区.html 引入 xt-region.js  :: ..."assets/xt-region.js?v=20260918a"...
  PASS  D5.5 社区.html 定义 blogPickLoc  :: indexOf=17713
```
链路：`blogPickLoc()` → `window.XT_LOC_PICK.pick()` → 写 `#blogLocChip` 的 `data-loc` → `blogRenderLocChip()` 渲染。手动兜底复用 `uiPrompt`（禁原生 prompt）。✅

#### D6. 端到端补测（真跑，非静态）

**私聊「定位」菜单项全链路**（`私聊.html:977-1000`）：
```js
window.imPlusPickLocation = function () {
  imClosePlusMenu();
  if (typeof window.imPickLocation === 'function') { window.imPickLocation(); return; }
  onLoc('所在位置');
};
function onLoc(fallbackTitle) {
  if (!window.XT_LOC_PICK || typeof window.XT_LOC_PICK.pick !== 'function') {
    imShowLocInput(fallbackTitle || '所在位置', '如：图书馆 / 自习室', function (v) {
      var t = (v || '').replace(/^\s+|\s+$/g, '');
      if (t && typeof window.imSendLocation === 'function') window.imSendLocation(t);
    });
    return;
  }
  var opts = { fallbackTitle: fallbackTitle || '所在位置',
    onManual: function (title, placeholder, cb) { imShowLocInput(title, placeholder, cb); } };
  window.XT_LOC_PICK.pick(opts, function (r) {
    if (r && r.text && typeof window.imSendLocation === 'function') window.imSendLocation(r.text);
  });
}
```
✅ 链路完整：`imPlusPickLocation` → `onLoc` → `XT_LOC_PICK.pick` → `imSendLocation(text)`。

**手动输入弹层生命周期（真实交互真跑）**：✅ **10/10 PASS**
```
  PASS  G1 imShowLocInput 创建了弹层  :: count=1
  PASS  G1b 弹层是唯一实例（无重复创建）  :: count=1
  PASS  G2 确定后回调收到文字  :: ["图书馆"]
  PASS  G3 确定后弹层已销毁  :: count=0
  PASS  G4 取消后回调收到空串  :: [""]
  PASS  G5 取消后弹层已销毁  :: count=0
  PASS  G6 点遮罩后回调空串且弹层销毁  :: [""] count=0
  PASS  G7 ESC 后回调空串且弹层销毁  :: [""] count=0
  PASS  G8 重复提交只回调一次（幂等）  :: calls=1 ["A"]
  PASS  G9 并发创建时无异常且两个实例共存（信息性）  :: count=2

  SHEET SUMMARY: TOTAL=10 PASS=10 FAIL=0
```
且真实交互链路验证：
```
  PASS  F8.1 降级未抛异常  :: ok
  [info] 弹层标题 = 所在位置
  PASS  F8.2 弹层标题为「所在位置」
  [info] 手动输入后 captured2 = ["自习室A区"]
  PASS  F8.3 手动文字经 imSendLocation 发送
  PASS  F8.4 手动文字非坐标  :: 自习室A区
```
→ ✅ **确证「失败 → 手动输入 → 文字地址发送」这条降级链真实可用，且全程零坐标**。

---

### E. 静态一致性 ✅ 全通

**E1. 三处位置入口文案统一**：
```
  [info] xtmLocBtn 行 = <span ...data-icon="map-pin"...> 位置</span>          ← 朋友圈「位置」入口
  [info] xtmAtBtn 行  = <span ...data-icon="navigation"...> 所在位置</span>   ← 朋友圈「所在位置」入口
  PASS  E.1[朋友圈] 含「所在位置」文案  :: count=4
  PASS  E.1[社区] 含「所在位置」文案  :: count=5
  PASS  E.1[私聊] 含「所在位置」文案  :: count=5
```
✅ 三端（朋友圈 / 社区 / 私聊）**均含「所在位置」统一文案**。

**E2. `XT_REGION` 既有导出完整性（T01 声称只追加不改）**：
```
  [info] window.XT_REGION 导出块长度 = 231
  PASS  E.2 XT_REGION 仍导出 provinces / citiesOf / districtsOf / textOf
  PASS  E.2 XT_REGION 仍导出 search / parseText / reverseGeocode / locate
```
✅ **8 个既有导出全部保留**，未破坏。

**E3. `xt-moments.js` 既有函数未被改坏**：
```
  PASS  E.3 xt-moments.js 仍含 inputSheet
  PASS  E.3 xt-moments.js 仍含 pickerSheet
  PASS  E.3 xt-moments.js 仍含 chooseVis
  PASS  E.3 xt-moments.js 仍含 pubSubmit
  PASS  E.4 xt-moments.js 无 经纬度 明文拼接  :: of=-1
  PASS  E.5 xt-moments.js 无 toFixed(3) 坐标
  PASS  E.6 xt-moments.js 引用 XT_LOC_PICK  :: idx=42167
```

**P0 修复点核验**（`xt-moments.js:875-896`）：
```js
var locSelf = $('xtmAtBtn');
if (locSelf) locSelf.onclick = function () {
  /* R88-H：一键定位走统一底座 XT_LOC_PICK（定位 → 逆地理编码 → 文字地址）；
     任一环节失败降级为本页既有的 inputSheet 手动输入。全程不产出坐标明文（硬规则）。 */
  var LP = window.XT_LOC_PICK;
  if (!LP || typeof LP.pick !== 'function') {
    toast('定位服务不可用，请手动填写');
    inputSheet('所在位置', '如：图书馆 / 自习室', P.location, function (v) { P.location = String(v || '').slice(0, 64); renderChosen(); });
    return;
  }
  toast('正在定位…');
  LP.pick({
    fallbackTitle: '所在位置',
    onManual: function (title, ph, cb) { inputSheet(title || '所在位置', ph || '如：图书馆 / 自习室', '', cb); }
  }, function (r) {
    if (r && r.text) { P.location = String(r.text).slice(0, 64); renderChosen(); toast('已记录当前位置'); }
  });
};
```
→ ✅ **原 `'经纬度 ' + lat.toFixed(3) + ',' + lng.toFixed(3)` 拼接已彻底删除**，改为 `XT_LOC_PICK.pick`。P0 违规修复**确认完成**。

**E7. 朋友圈位置入口去 emoji**：
```
  PASS  E.7 位置入口 xtmLocBtn 已去 emoji 且带 data-icon  :: emoji=false dataIcon=true
  PASS  E.7b 所在位置入口 xtmAtBtn 已去 emoji 且带 data-icon  :: emoji=false dataIcon=true
  PASS  E.8 朋友圈发布.html 含 data-icon
```

**E8. `icon-map.js` 新增三图标**：
```
  icon map-pin      命中 1   行 [778]
  icon navigation   命中 1   行 [782]
  icon camera       命中 1   行 [785]
```
✅ 三图标均已入库。

---

## ④ 发现的问题（分级）

### 🟠 一般（2 条）

#### P-1【文档】任务书「改动清单」字节数标注系统性错误
- **文件**：任务书（team-lead 下发的改动清单表）vs 实测
- **复现方式**：用工程师自己留下的 T04 备份 `tools/_bak_t04_*.{js,html}` 作基线比对
- **证据**：
  | 文件 | 任务书声称 after | 实测 after | 真实基线（T04 备份） | 真实增量 |
  |---|---|---|---|---|
  | `assets/icon-map.js` | 39520 | **39868** | 38244（git HEAD） | +1624 |
  | `社区.html` | 43479 | **48737** | **43479（=声称值，这是 before！）** | **+5258** |
  | `assets/api.js` | 115235 | **116089** | **115235（=声称值，这是 before！）** | **+854** |
  | `assets/app.js` | （未给） | 7088848 | 7073238（git HEAD） | +15610（含历史批次） |
- **判断依据**：`社区.html` 与 `api.js` 的「声称 after」**恰好等于 T04 自己的备份（改动前）大小** → 工程师把 before 值填进了 after 列。用 T04 备份做基线比对后，本批真实改动**精确且合理**：
  ```
  assets/app.js   bak=7087964  cur=7088848  delta=+884    （9 行，全为 location 相关）
  assets/api.js   bak=115235   cur=116089   delta=+854    （8 行，全为 location 相关）
  社区.html        bak=43479    cur=48737    delta=+5258   （79 行，全为位置入口/chip）
  ```
- **影响**：**不影响代码正确性**，但会导致「改动量核对」失真，且 `app.js` 名称面 +15610 与 git HEAD 对比时含**大量历史未提交改动**，易被误判为夹带。
- **建议**：任务书按 `git diff --numstat` 或工程师备份基线重算 after 值；`app.js` 若需精确审计，应先厘清历史未提交改动。

#### P-2【流程】验证期间源文件被并行修改，验证基线漂移
- **文件**：`私聊.html`、`assets/chat-local.js`、`assets/icon-map.js`
- **证据**（同一会话内两次测量）：
  ```
  私聊.html         69532  →  70269  (+737)
  chat-local.js    234873  → 240000  (+5127)
  icon-map.js       39520  →  39868  (+348)
  ```
- **复现方式**：连续两次运行 `tools/qa/r88hi_qa_eol.py`
- **内容**：新增「发送文件」入口（`#imFileInput` + `imPlusPickFile` + `window.imSendFile` @ `chat-local.js:2677`），使菜单从 **3 项变为 4 项**
- **影响**：使按任务书「3 项菜单」编写的断言失效（D2.8/D2.10 首轮 FAIL 即因此）；**不影响冻结快照版的功能正确性**（4 项均已验证 onclick 完整、图标齐全、`imSendFile` 已定义）。
- **建议**：QA 验证窗口内冻结代码树，或在任务书明确「验证期间禁止改文件」；本轮已用 SHA256 冻结快照复核。

### 🟡 轻微（3 条）

#### P-3【范围】朋友圈「朋友圈发布.html」仍有 3 处 emoji 未转 data-icon
- **文件**：`朋友圈发布.html`
- **行号与内容**：
  ```
  55: <span class="xtm-fn" id="xtmVisBtn" ...>👁 谁可以看</span>
  58: <span class="xtm-fn" id="xtmVidBtn" ...>🎬 视频</span>
  59: <span class="xtm-fn" id="xtmLinkBtn" ...>🔗 链接</span>
  ```
- **判定**：T03 改动清单仅声称处理 **L54（`xtmLocBtn`）与 L57（`xtmAtBtn`）** 两个位置入口，L55/58/59 **不在本批范围**。位置入口已 100% 去 emoji（E.7/E.7b PASS）。
- **影响**：无功能影响；仅全站「零 emoji」目标未在这 3 处达成。
- **建议**：若全站零 emoji 是硬指标，另开任务处理；本批不算缺陷。

#### P-4【巡检】全树存在历史遗留的后行断言 `(?<=` / `(?<!`（123 命中）
- **说明**：经逐条核查，**本批 9 个文件命中 0**；全部 123 命中位于 `.md` 文档、`.txt` 日志、`tools/` 脚本、`.tmp_eng/` Chrome 缓存中，**无一在渲染路径**。
- **唯一实质命中**：`assets/app.js.backup_20260914:3730/3737` 使用 `/(?<=[\.\!\?\;])\s+/` —— 但这是**备份文件**，不在加载路径。
- **建议**：无需处理；记录在案以防未来误当作本批问题。

#### P-5【工具】`assets/notify.js:33-34` 注释中列有禁用语法字面量
- **说明**：该文件注释提及 `?.` `??` `(?<=` 等作为「禁用清单」说明文字，被扫描器命中。
- **判定**：**注释文字，非可执行语法**（escheck `DONE 0` 已验证）。
- **建议**：无需处理。

---

## ⑤ 测试代码自身缺陷的归因记录（透明化）

本轮首测出现 15 项 FAIL，**全部经独立归因确认为测试代码缺陷**，非产品缺陷。记录如下以备复核：

| # | 失败断言 | 根因 | 修正方式 | 修正后 |
|---|---|---|---|---|
| 1 | D1.7/D1.9/D1.9b/D1.10c/D1.10d | 我 stub 了 `window.XT_REGION.reverseGeocode`，但 `pick` 内部 `stepReverse` 调用**模块私有** `reverseGeocode`，stub 无效 | 改为**拦截 JSONP script 注入**（hook `head.appendChild` 解析 callback 名回灌 payload），`_parseGeo` 也真跑 | ✅ 30/30 PASS |
| 2 | D3.6 `imSendLocation 体内含 map-pin` | `map-pin` 由**渲染层** `renderMsgs` 的 `lucideIcon('map-pin', 18)` 提供（L2020），不在 `imSendLocation`（L2597，职责为入队+落库）体内 | 拆为 D3.6（写 `kind:'location'`）+ D3.9（渲染分支含 `lucideIcon('map-pin')`） | ✅ PASS |
| 3 | D4.7 `location 键 >= 2 处` | 正则 `/location\s*:/` 只匹配显式键，漏了 **ES6 简写 `location,`** | 改正则为 `/(?:^|[{,]\s*)location\s*(?::|,|\})/` | ✅ count=2（L7951/L7955） |
| 4 | E.7 `朋友圈发布.html 无 emoji` | 断言过宽，把 T03 **范围外**的 L55/58/59 也算入 | 收窄为只断言 T03 声称的 L54/L57 | ✅ PASS |
| 5 | D2.8/D2.10 `3 个 .im-plus-item` | 断言写死 3，期间菜单已增至 **4 项**（基线漂移 P-2） | 改为 `>= 3` 且逐项校验 | ✅ PASS |
| 6 | E5.x/E6.x/E7.1 | 用 `vm.runInNewContext` 逐段执行内联脚本 → **闭包状态不共享**；且 `imShowLocInput`/`onLoc` 是闭包私有，替换 `window.` 无效 | 改用 `runScripts:'dangerously'` 在页面**真实上下文**执行 | ✅ 弹层 10/10 PASS |
| 7 | F8.5 `提交后弹层已移除` | 测试先用 `querySelector` 取到**首个残留**弹层并点击，掩盖了真实生命周期 | 写隔离脚本 `r88hi_qa_sheet.js` 精确验证 | ✅ 10/10 PASS |

---

## ⑥ 未能验证项及原因

| 项 | 状态 | 原因 |
|---|---|---|
| 真实 GPS 定位（`navigator.geolocation`） | ⚠️ **未验证** | jsdom/Node 无真实 GPS 硬件；已在 `file://` 语义下用设计提供的 `testLat/testLng` 测试钩子替代（D1），**钩子链路已完整验证** |
| 真实网络逆地理编码（nominatim / 高德 / 腾讯） | ⚠️ **未验证** | 沙箱无外网；已用**真实 nominatim 响应格式 payload** 经 `_parseGeo` 全解析验证（D1.A3-A6）。真实 API 连通性属集成测试范畴 |
| 外部 `<script src>` 加载（`chat-local.js`/`app.js`/`icon-map.js` 在 `私聊.html` 中的真实加载） | ⚠️ **未验证** | jsdom 默认不加载外链资源；已通过**分别独立加载源码**验证各文件（D1 加载 `xt-region.js`、D3 静态解析 `chat-local.js`、D5 校验 `社区.html` script 标签） |
| `app.js:8678+` 的 AI 头像/面板宽度重构块（+~8000 B） | ⚠️ **不在本批范围** | 经 diff 归因，属**历史未提交改动**（AI 设置项修复/J 批次），**非 R88-H/I 引入**。本批仅涉及 `saveBlogNote` 的 9 行（L7490/L7517/L7763/L7944/L7951/L7955） |
| 真机 / 老 Android WebView 渲染 | ⚠️ **未验证** | 需 APK 真机环境；已用 `escheck_es2017.js DONE 0` 静态保证语法兼容 |

---

## ⑦ 附录：测试脚本清单

所有临时脚本位于 `D:\下载的文件\学习工作台\tools\qa\`，命名 `r88hi_qa_*.py|js`：

| 脚本 | 用途 |
|---|---|
| `r88hi_qa_eol.py` | 行尾矩阵（逐字节 CRLF/loneLF/loneCR） |
| `r88hi_qa_scan.py` | ES2017 违规 + 坐标泄漏全树扫描 |
| `r88hi_qa_behavior.js` | jsdom 行为验证 D1-D5 + E（60 断言） |
| `r88hi_qa_d1.js` | D1 独立端到端（JSONP 拦截） |
| `r88hi_qa_e2e.js` / `r88hi_qa_e2e2.js` | 私聊菜单端到端 |
| `r88hi_qa_sheet.js` | 手动输入弹层生命周期 |
| `r88hi_qa_baseline.py` | git HEAD 基线比对 |
| `r88hi_qa_bak.py` | T04 备份基线比对 + 网络坐标泄漏检查 |
| `r88hi_qa_extra.py` | 图标存在性 / 文件大小 / 上下文 |
| `escheck_es2017.js` | 项目既有权威检具（未修改） |

> 所有临时脚本与中间输出文件（`_*.txt` / `_*.json`）将在报告交付后清理。

---

## ⑧ 最终结论

**R88-H（定位能力）+ R88-I（私聊加号菜单）本批改动通过独立回归验证，可交付。**

- 硬约束（ES2017 `DONE 0`、行尾矩阵、无原生弹窗）**全部满足**
- 「绝不显示经纬度」硬指标在**渲染路径零命中**，且坐标不经网络外发
- 四条核心链路均**真跑验证**：`坐标→文字地址`（D1）、`私聊加号菜单`（D2）、`位置消息卡片`（D3）、`社区 location 双链路`（D4，编辑态+新建态**两处都在**）
- P0 违规修复点（朋友圈经纬度明文）**确认已彻底删除**
- 未发现源码级 Bug；**智能路由判定：`NoOne`**
- 需跟进的是 2 条**非代码问题**：任务书字节数标注错误（P-1）、验证期基线漂移（P-2）
