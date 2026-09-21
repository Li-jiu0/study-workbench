# -*- coding: utf-8 -*-
import os, io

p = r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-2d763cd8\.workbuddy\memory\2026-09-17.md'
os.makedirs(os.path.dirname(p), exist_ok=True)

entry = u"""
## R73 追加（夜）· 个人资料页 v2/v2.1 + 朋友圈封面

### 用户迭代指令（三轮）
1. **推倒重做个人资料页** → 微信/QQ 风格移动端设置页（顶部信息栏 64x64 圆头像/18px 昵称/ID：xxxxxx/灰底等级标签/右箭头；四组列表 学习·成果·工具·系统；角标 + 右侧小字；底 #f2f2f2 / 卡片白 8px 圆角左右 12px / 图标 28x28 #efefef 圆角方形 / 分割线 #e5e5e5 缩进 56px / 行高 50px / 组间 10px / 点击 #e5e5e5 + 0.1s）。
2. **删「模型设置」「设置」，加「我的朋友圈」** → 已定：我的朋友圈放**成果组**（与作品集并列，同为"本人产出物"）；跳真实页 `我的朋友圈.html`。
3. **个人信息编辑页增加 地区 / 手机号 / 邮箱 等**；**我的朋友圈封面支持用户自己上传图片背景**。

### 关键裁定（留档，别重复踩）
- **角标语义**：个人资料「错题本」角标 = **真·待复习数**，口径 = `app.js:5789 getReviewQuestions()` 的 `!mastered && nextReview <= today`。**任务十二 最初结论「无未复习状态源」是错的** —— 它只看 `wrongQuestions`（只增不减），漏了第二层 `examRecords` 间隔重复系统（`REVIEW_INTERVALS=[7,14,30,90]`，`recordExamQuestion` 在 `app.js:5758`/调用点 `:6829`）。**教训：断言"某数据不存在"前必须先查有没有派生/状态层。**
- **`学途.html` 自身缺陷（已核实）**：`:388` 算 `wrongQuestions.length`（总数），`:443` 却渲染成「N 道待复习」→ 标签配错算法。修法：文案改 `N 道错题 · M 道待复习`，M 用 `getReviewQuestions().length`，M=0 时只显示错题数。
- **作品集落点**：→ **`我的文件.html`**（`个人中心.html:167/:313` 注释明确作品集已整体迁走，`.xtf-` 随迁）。**我先前"在个人中心.html"的判断是 grep 命中注释导致的误判。教训：grep 命中要区分「代码」与「注释」。**
- **图标配色冲突**：用户给「#efefef 底 + 白色图标」互相矛盾（白图标在 #efefef 上不可见，对比度 ~1.07:1）。裁定：**保 #efefef 底，图标用中灰 #8b939c**，并抽成 `--xtp-ico-tile` / `--xtp-ico-fg` 两个 CSS 变量便于一键切换。
- **版本号**：真实= **v2.3**（`关于.html:170` 初值 + `:407` 内联 + `app.js:9166` 三处一致）；`xt-profile.js` 的 v2.3 兜底常量**不算造假**。另发现 `app.js:8277` 残留过期 `v2.2`，已派任务十七一行修。
- **邮箱双态规则（重要，防假数据）**：服务端已绑定 → 只读显示真实值 + 「已绑定」+ 点击跳 `设置.html` 改绑；未绑定 → 本地可编辑 + 「未验证」。**手机号必须标「仅本机保存·未验证」**（后端无手机号能力）。**空值一律显示「未填写」。**

### 个人资料页 v2.1 交付事实
- 三件：`个人资料.html`(2540B/53行) / `assets/xt-profile.js`(56302B/1181行) / `assets/xt-profile.css`(20437B/765行)，均纯 CRLF 无 BOM，`node --check` rc=0。
- 12 项列表（删两项后剩 11 行）：学习记录→学习概括.html｜错题本→错题本.html｜我的笔记→子视图｜我的收藏→子视图｜学习数据→子视图｜成就徽章→子视图｜作品集→我的文件.html｜我的朋友圈→我的朋友圈.html｜导入题库→导入题库.html｜AI对话记录→子视图｜关于→弹版本信息。**未新建任何 html 文件**（4–6 个子视图均为页内 position:fixed 推入层）。
- 用户ID：`study_workbench_auth` / `study_workbench_last_account` 派生 6 位 base36，两者皆无才生成一次并持久化（`xt_profile_uid_v2`）。
- 证据：CDP 320/360/412 纵横比值全过（行高 50、图标 28、分割线 56px/rgb(229,229,229)、浅底 rgb(242,242,242)、深底 rgb(20,22,26)）；jsdom 双夹具（空→0 角标/0 小字/无等级标签；有→角标 12/1/2/2、本周 3.2h、5/8）。

### 避让令（关键，防互相覆盖）
`个人资料.html` + `assets/xt-profile.{js,css}` → 任务十二独占；`我的朋友圈.html` + `assets/xt-moments.{js,css}` → 任务十独占。**任务八的 42 页适配必须避开这 6 件。**
另：`面测.html` 被任务八与任务十九同时需要 → **我压着任务十九的补丁不落盘**，等任务八明确放行（两边都是整文件读入→写回，同写必覆盖）。
"""

with io.open(p, 'a', encoding='utf-8', newline='') as f:
    f.write(entry)

raw = open(p, 'rb').read()
print('APPENDED. lines=%d CRLF=%d bare=%d size=%d' % (raw.count(b'\n'), raw.count(b'\r\n'), raw.count(b'\n') - raw.count(b'\r\n'), len(raw)))
