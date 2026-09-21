# -*- coding: utf-8 -*-
"""R88-A 主补丁：assets/xt-aiusage.js

目标：用量统计页「按模型单独列出 + A 口径（剩余可用量 remaining）」。

现状（Read 后的结论）：
  - 服务端区块 renderServer() 已经「逐模型」渲染（buildServerRows 按模型 id 一行），
    但排序走 sortRows（今日次数 / 最近时间），主指标用 used（「已用 X%」），无「预计耗尽时间」。
  - 「按模型统计」区块 renderModels(sum) 是「本机口径聚合」，主指标是 Token 占比，
    完全没有配额 / 已用 / 剩余 / 预计耗尽四项，且与另一处「按模型累计（服务端）」职责重叠。
  - 模型配额四项指标（freeQuota / used / remaining / estRemainingRuns）**只在服务端账本里**，
    本机账本没有配额概念。

本次改造：
  1. renderModels 改为「本机口径 → 合并服务端配额」的逐模型总表：每模型一行（不聚合），
     含 资源配额 / 已使用量 / 剩余可用量 / 预计耗尽时间 四项；并如实展示 modelId 原始值。
  2. A 口径落地：新增 sortRowsByRemaining（剩余少的排前）+ remainingBucket（区间算作纯函数）+
     排序/筛选 chip 的 DOM 重建 + el 缓存三项；默认排序 = remaining，默认筛选 = all。
  3. renderServer 去掉「按模型累计（服务端）」重复列表，改为「额度口径说明」如实提示。
  4. buildLocalRows 不再丢弃本机记录的原始 model（落 sourceModel），供「未匹配到配额表」时如实展示。
  5. 新增 displayNameOf / badgeStatus 的纯展示辅助（危险高亮用红，符合中文金融「红=警示」直觉）。

行尾纪律：纯 LF 二进制读写；写前断言行尾，写后复读复验。
"""
import os
import sys

PATH = r"D:\下载的文件\学习工作台\assets\xt-aiusage.js"

REPLACEMENTS = []  # (label, old, new)


def add(label, old, new):
    REPLACEMENTS.append((label, old, new))


# ---------------------------------------------------------------------------
# 1) state：新增配额的排序 / 筛选两项状态（默认均为 remaining 口径）
# ---------------------------------------------------------------------------
add(
    "state-quota",
    '  var state = {\n'
    '    range: "all",      // today | 7d | 30d | all\n'
    '    sortBy: "tokens",  // tokens | count | in | out | name | time\n'
    '    limit: DETAIL_STEP,\n'
    '    clearArmed: false,\n'
    '    mounted: false\n'
    '  };',
    '  var state = {\n'
    '    range: "all",              // today | 7d | 30d | all\n'
    '    sortBy: "tokens",          // tokens | count | in | out | name | time（本机「按能力」区块用）\n'
    '    quotaSort: "remaining",    // R88-A A 口径：remaining | remainingDesc | used | quota | name\n'
    '    quotaFilter: "all",        // R88-A A 口径：all | low | exhausted | unknown\n'
    '    limit: DETAIL_STEP,\n'
    '    clearArmed: false,\n'
    '    mounted: false\n'
    '  };',
)

# ---------------------------------------------------------------------------
# 2) 新增：配额排序 / 区间筛选 纯函数（插在 sortRows 之后）
# ---------------------------------------------------------------------------
add(
    "quota-sort-and-filter",
    '    var out = [];\n'
    '    for (var k = 0; k < deco.length; k++) out.push(deco[k].r);\n'
    '    return out;\n'
    '  }\n'
    '\n'
    '  function serverStatusText(st) {',
    '    var out = [];\n'
    '    for (var k = 0; k < deco.length; k++) out.push(deco[k].r);\n'
    '    return out;\n'
    '  }\n'
    '\n'
    '  // ---------- R88-A：A 口径（剩余可用量 remaining）排序 / 筛选纯函数 ----------\n'
    '  // 说明：本机账本没有「配额」概念，配额四项指标只来自服务端账本（buildServerRows）。\n'
    '  //       remaining 取不到（NaN）的模型统一归为「未知额度」，永远排在最后，不参与高亮。\n'
    '  function remOfRow(r) {\n'
    '    var v = r ? Number(r.remaining) : NaN;\n'
    '    return isFinite(v) ? v : NaN;\n'
    '  }\n'
    '\n'
    '  // A 口径排序（排序 / 高亮 / 筛选一律以 remaining 为准，不用 used 当主指标）：\n'
    '  //   remaining  —— 剩余少 → 多（默认；让用户先看到「快用完」的，符合危险优先直觉）\n'
    '  //   remainingDesc —— 剩余多 → 少\n'
    '  //   used —— 已用多 → 少（次要指标，仅在用户显式切换时使用）\n'
    '  //   quota —— 配额大 → 小；name —— 模型名升序\n'
    '  // 末尾一律按名称升序 + 原序稳定，保证多次渲染顺序不跳动。\n'
    '  function sortRowsByRemaining(rows, by) {\n'
    '    var mode = by || "remaining";\n'
    '    var deco = [];\n'
    '    for (var i = 0; i < rows.length; i++) deco.push({ r: rows[i], i: i });\n'
    '    deco.sort(function (a, b) {\n'
    '      var ra = a.r || {}, rb = b.r || {};\n'
    '      var va = remOfRow(ra), vb = remOfRow(rb);\n'
    '      var aOk = isFinite(va), bOk = isFinite(vb);\n'
    '      if (aOk !== bOk) return aOk ? -1 : 1;   // 额度未知的排最后\n'
    '      if (aOk && bOk && va !== vb) {\n'
    '        if (mode === "remainingDesc") return vb - va;\n'
    '        return va - vb;\n'
    '      }\n'
    '      if (mode === "used") {\n'
    '        var ua = Number(ra.used) || 0, ub = Number(rb.used) || 0;\n'
    '        if (ub !== ua) return ub - ua;\n'
    '      } else if (mode === "quota") {\n'
    '        var qa = Number(ra.freeQuota) || 0, qb = Number(rb.freeQuota) || 0;\n'
    '        if (qb !== qa) return qb - qa;\n'
    '      }\n'
    '      var an = String(ra.name == null ? "" : ra.name);\n'
    '      var bn = String(rb.name == null ? "" : rb.name);\n'
    '      if (an < bn) return -1;\n'
    '      if (an > bn) return 1;\n'
    '      return a.i - b.i;\n'
    '    });\n'
    '    var out = [];\n'
    '    for (var k = 0; k < deco.length; k++) out.push(deco[k].r);\n'
    '    return out;\n'
    '  }\n'
    '\n'
    '  // A 口径筛选桶（纯函数，便于单测）：\n'
    '  //   额度未知（remaining 取不到）→ "unknown"\n'
    '  //   剩余 = 0 → "exhausted"；剩余 / 配额 ≤ 10% → "low"；否则 "ok"\n'
    '  //   注意：这里「危险」判定用固定 10% 阈值（与 deriveStatus 的 20%「额度偏低」不同档），\n'
    '  //        是 R88-A 的筛选口径，不改动 deriveStatus / statusLabel 的既有语义。\n'
    '  function remainingBucket(r) {\n'
    '    var rem = remOfRow(r);\n'
    '    if (!isFinite(rem)) return "unknown";\n'
    '    if (rem <= 0) return "exhausted";\n'
    '    var q = Number(r && r.freeQuota);\n'
    '    if (isFinite(q) && q > 0) return (rem / q) <= 0.1 ? "low" : "ok";\n'
    '    return "low";   // 剩余有值但配额未知：只能如实标「偏低」，不编造配额\n'
    '  }\n'
    '\n'
    '  function statusLabel(st) {',
)

# ---------------------------------------------------------------------------
# 2b) 删除旧的 statusLabel（避免重复定义），保留新的主定义（在 remainingBucket 之后）
# ---------------------------------------------------------------------------
add(
    "drop-old-statusLabel",
    '  function statusLabel(st) {\n'
    '    if (st === "ok") return "可用";\n'
    '    if (st === "low") return "额度偏低";\n'
    '    if (st === "exhausted") return "额度耗尽";\n'
    '    return "额度未知";\n'
    '  }\n'
    '\n'
    '  function fmtOrDash(v) {',
    '  function fmtOrDash(v) {',
)

# ---------------------------------------------------------------------------
# 2c) statusLabel 新主定义 + 危险高亮辅助（data-risk）
# ---------------------------------------------------------------------------
add(
    "statusLabel-and-risk",
    '  function statusLabel(st) {',
    '  // 状态中文名（服务端口径：ok / low / exhausted / unknown）\n'
    '  function statusLabel(st) {\n'
    '    if (st === "ok") return "可用";\n'
    '    if (st === "low") return "额度偏低";\n'
    '    if (st === "exhausted") return "额度耗尽";\n'
    '    return "额度未知";\n'
    '  }\n'
    '\n'
    '  // R88-A 危险高亮（A 口径：只按 remaining 判定，不用 used）\n'
    '  //   exhausted —— 剩余 = 0（红，最危险）\n'
    '  //   low       —— 剩余 / 配额 ≤ 10%（橙，快耗尽）\n'
    '  //   其余（含额度未知）—— 不套警示色，如实展示\n'
    '  function riskOfRow(r) {\n'
    '    var b = remainingBucket(r);\n'
    '    if (b === "exhausted") return "exhausted";\n'
    '    if (b === "low") return "low";\n'
    '    return "";\n'
    '  }\n'
    '\n'
    '  function riskLabelOf(b) {\n'
    '    if (b === "exhausted") return "已耗尽";\n'
    '    if (b === "low") return "快耗尽";\n'
    '    return "";\n'
    '  }\n'
    '\n'
    '  // 原 statusLabel 定义位置（R88-A 已上移并扩展，此处仅保留占位锚点不再重复定义）\n'
    '  function _statusLabelAnchor(st) {',
)

# ---------------------------------------------------------------------------
# 3) buildLocalRows：保留原始模型名（未匹配到配额表时如实展示，不伪造）
# ---------------------------------------------------------------------------
add(
    "buildLocalRows",
    '      var key = mid || name;\n'
    '      var row = map[key];\n'
    '      if (!row) { row = { key: key, name: name, todayCalls: 0, lastTs: 0, calls: 0, total: 0, fail: 0 }; map[key] = row; }\n'
    '      var ts = Number(it.ts) || 0;\n'
    '      row.calls += 1;',
    '      var key = mid || name;\n'
    '      var row = map[key];\n'
    '      if (!row) {\n'
    '        // R88-A：多留一个 sourceModel（账本里记录的原始模型名），\n'
    '        // 万一某条记录匹配不到服务端配额表，展示层可如实回退到它，不伪造模型名。\n'
    '        row = {\n'
    '          key: key, name: name, todayCalls: 0, lastTs: 0, calls: 0, total: 0, fail: 0,\n'
    '          sourceModel: String(it.model == null ? "" : it.model)\n'
    '        };\n'
    '        map[key] = row;\n'
    '      }\n'
    '      var ts = Number(it.ts) || 0;\n'
    '      row.calls += 1;',
)

# ---------------------------------------------------------------------------
# 4) 新增 renderQuotaModels：逐模型（不聚合）展示四项配额指标 + A 口径排序/筛选/高亮
#    插在 renderModels 之前；同时把旧 renderModels 改为委托（保持全局函数名与调用点不变）
# ---------------------------------------------------------------------------
add(
    "renderQuotaModels",
    '  // ---------- 渲染：按模型汇总 ----------\n'
    '  function renderModels(sum) {\n'
    '    if (!el.modelList) return;\n'
    '    if (!sum.rows || !sum.rows.length) {\n'
    '      el.modelList.innerHTML = \'<div class="xt-us-inline-empty">该时间范围内暂无用量记录</div>\';\n'
    '      return;\n'
    '    }\n'
    '    var html = "";\n'
    '    for (var i = 0; i < sum.rows.length; i++) {\n'
    '      var r = sum.rows[i];\n'
    '      var pct = (Number(r.ratio) || 0) * 100;\n'
    '      var pctTxt = (pct >= 10) ? pct.toFixed(0) : pct.toFixed(1);\n'
    '      var failTxt = (Number(r.fail) || 0) > 0\n'
    '        ? \'<span class="xt-us-warn">失败 \' + fmtNum(r.fail) + "</span>" : "";\n'
    '      html += \'<div class="xt-us-model">\' +\n'
    '          \'<div class="xt-us-model-h">\' +\n'
    '            \'<div class="xt-us-model-name">\' + esc(r.model) + "</div>" +\n'
    '            \'<div class="xt-us-model-tok">\' + fmtNum(r.total) + " tokens</div>" +\n'
    '          "</div>" +\n'
    '          \'<div class="xt-us-bar"><i style="width:\' + pctTxt + \'%"></i></div>\' +\n'
    '          \'<div class="xt-us-model-meta">\' +\n'
    '            "<span>调用 " + fmtNum(r.count) + " 次</span>" +\n'
    '            "<span>输入 " + fmtNum(r.inTok) + "</span>" +\n'
    '            "<span>输出 " + fmtNum(r.outTok) + "</span>" +\n'
    '            "<span>占比 " + pctTxt + "%</span>" +\n'
    '            failTxt +\n'
    '          "</div>" +\n'
    '        "</div>";\n'
    '    }\n'
    '    el.modelList.innerHTML = html;\n'
    '  }\n',
    '  // ---------- R88-A：按模型单独列出（逐模型一行，不聚合）+ A 口径四项指标 ----------\n'
    '  // 布局原则：= §1「展示即真可用」——数据取不到一律如实写「—」/「暂无数据」，\n'
    '  //          不显示假 0、不显示占位符、不显示「即将上线」。\n'
    '  //\n'
    '  // 每一项的含义（配额四项只来自服务端账本）：\n'
    '  //   资源配额 freeQuota —— 该模型配额上限（账本 free 字段，quotaType 标注类型）\n'
    '  //   已使用量 used      —— 账号级累计消耗\n'
    '  //   剩余可用量 remaining —— 主指标（A 口径）：排序 / 高亮 / 筛选全看它\n'
    '  //   预计耗尽时间       —— 服务端 estRemainingRuns（按日均消耗推算的可用次数）；\n'
    '  //                        服务端未提供时如实写「— 服务端未提供预估」，不自行编造。\n'
    '\n'
    '  // 展示名：有配额行用服务端 displayNameOf(id)（覆盖 > 内置 > 回退 id）；\n'
    '  // 未匹配到配额表时，回退到本机记录的原始模型名，再回退「未知模型」。绝不伪造。\n'
    '  function quotaRowName(localRow, serverRow, id) {\n'
    '    if (serverRow && serverRow.name) return String(serverRow.name);\n'
    '    if (localRow && localRow.name) return String(localRow.name);\n'
    '    if (localRow && localRow.sourceModel) return String(localRow.sourceModel);\n'
    '    var n = displayNameOf(id);\n'
    '    return n ? n : "未知模型";\n'
    '  }\n'
    '\n'
    '  // 用量行（本机 × 服务端）合并成统一行：本地字段 + 服务端配额字段（无服务端配额则留空）\n'
    '  function quotaRowOf(localRow, serverRow, id) {\n'
    '    var r = { key: id, id: id, name: quotaRowName(localRow, serverRow, id) };\n'
    '    if (localRow) {\n'
    '      r.localCalls = Number(localRow.calls) || 0;\n'
    '      r.localTotal = Number(localRow.total) || 0;\n'
    '      r.todayCalls = Number(localRow.todayCalls) || 0;\n'
    '      r.lastTs = Number(localRow.lastTs) || 0;\n'
    '    }\n'
    '    if (serverRow) {\n'
    '      r.calls = Number(serverRow.calls) || 0;\n'
    '      r.used = Number(serverRow.used) || 0;\n'
    '      r.freeQuota = Number(serverRow.freeQuota) || 0;\n'
    '      r.quotaType = serverRow.quotaType || "";\n'
    '      r.remaining = isFinite(Number(serverRow.remaining)) ? Number(serverRow.remaining) : NaN;\n'
    '      r.percent = Number(serverRow.percent);\n'
    '      r.status = serverRow.status || "";\n'
    '      r.estRemainingRuns = serverRow.estRemainingRuns;\n'
    '      r.estRemainingRunsTxt = serverRow.estRemainingRunsTxt || "";\n'
    '      r.estBaselineTs = Number(serverRow.estBaselineTs) || 0;\n'
    '      r.estAvgPerDay = serverRow.estAvgPerDay;\n'
    '      r.estDays = Number(serverRow.estDays);\n'
    '      r.hasQuota = true;\n'
    '    } else {\n'
    '      r.hasQuota = false;\n'
    '    }\n'
    '    return r;\n'
    '  }\n'
    '\n'
    '  // 构建「逐模型」总表并应用 A 口径（筛选 → 排序）\n'
    '  function buildQuotaRows(localRows, serverRows) {\n'
    '    var map = {};\n'
    '    var order = [];\n'
    '    var i, k, row;\n'
    '    for (i = 0; i < serverRows.length; i++) {\n'
    '      row = serverRows[i];\n'
    '      k = String(row.id);\n'
    '      if (!Object.prototype.hasOwnProperty.call(map, k)) {\n'
    '        map[k] = { id: k, serverRow: row, localRow: null };\n'
    '        order.push(k);\n'
    '      } else {\n'
    '        map[k].serverRow = row;\n'
    '      }\n'
    '    }\n'
    '    for (i = 0; i < localRows.length; i++) {\n'
    '      row = localRows[i];\n'
    '      k = String(row.key);\n'
    '      if (!Object.prototype.hasOwnProperty.call(map, k)) {\n'
    '        map[k] = { id: k, serverRow: null, localRow: row };\n'
    '        order.push(k);\n'
    '      } else if (!map[k].localRow) {\n'
    '        map[k].localRow = row;\n'
    '      }\n'
    '    }\n'
    '    var rows = [];\n'
    '    for (i = 0; i < order.length; i++) {\n'
    '      var entry = map[order[i]];\n'
    '      rows.push(quotaRowOf(entry.localRow, entry.serverRow, entry.id));\n'
    '    }\n'
    '    // A 口径筛选：默认 all 不改动集合\n'
    '    if (state.quotaFilter && state.quotaFilter !== "all") {\n'
    '      var kept = [];\n'
    '      for (i = 0; i < rows.length; i++) {\n'
    '        if (remainingBucket(rows[i]) === state.quotaFilter) kept.push(rows[i]);\n'
    '      }\n'
    '      rows = kept;\n'
    '    }\n'
    '    // A 口径排序：以 remaining 为准（默认升序，快耗尽的排最前）\n'
    '    return sortRowsByRemaining(rows, state.quotaSort);\n'
    '  }\n'
    '\n'
    '  // 剩余可用量主指标（A 口径）：无配额行如实写「无配额数据」，不显示假 0\n'
    '  function quotaRemainingCell(r) {\n'
    '    if (!r.hasQuota) return \'<span class="xt-us-muted">无配额数据</span>\';\n'
    '    if (!isFinite(Number(r.remaining))) return \'<span class="xt-us-muted">—</span>\';\n'
    '    var risk = riskOfRow(r);\n'
    '    var danger = (risk === "exhausted" || risk === "low");\n'
    '    return \'<span class="xt-us-metric-val\' + (danger ? " danger" : "") + \'">\' +\n'
    '      fmtNum(r.remaining) + "</span>";\n'
    '  }\n'
    '\n'
    '  // 预计耗尽时间（A 口径第四项）：把「还够调用 N 次 + 日均消耗」如实拼成人话\n'
    '  function quotaDepleteCell(r) {\n'
    '    if (!r.hasQuota) return \'<span class="xt-us-muted">无配额数据</span>\';\n'
    '    if (riskOfRow(r) === "exhausted") return \'<span class="xt-us-metric-val danger">已耗尽</span>\';\n'
    '    var hasRuns = isFinite(Number(r.estRemainingRuns));\n'
    '    var hasDays = isFinite(Number(r.estDays));\n'
    '    if (!hasRuns && !hasDays) {\n'
    '      return \'<span class="xt-us-muted">— 服务端未提供预估</span>\';\n'
    '    }\n'
    '    var parts = [];\n'
    '    if (hasRuns) parts.push("还够 " + fmtNum(Math.round(Number(r.estRemainingRuns))) + " 次调用");\n'
    '    if (hasDays) parts.push("约 " + fmtDays(Number(r.estDays)) + " 后耗尽");\n'
    '    return \'<span class="xt-us-metric-val">\' + esc(parts.join(" · ")) + "</span>";\n'
    '  }\n'
    '\n'
    '  function quotaBarPct(r) {\n'
    '    if (!r.hasQuota) return 0;\n'
    '    return clampPct(r.percent, r.used, r.freeQuota);\n'
    '  }\n'
    '\n'
    '  function quotaCardHtml(r) {\n'
    '    var risk = riskOfRow(r);\n'
    '    var pct = quotaBarPct(r);\n'
    '    var pctTxt = (pct >= 10) ? pct.toFixed(0) : pct.toFixed(1);\n'
    '\n'
    '    var riskBig = "";\n'
    '    if (risk === "exhausted") riskBig = \'<span class="xt-us-risk danger">已耗尽</span>\';\n'
    '    else if (risk === "low") riskBig = \'<span class="xt-us-risk warn">快耗尽 · 剩余不足 10%</span>\';\n'
    '\n'
    '    var idTxt = \'<span class="xt-us-raw-id">modelId: \' + esc(r.id) + "</span>";\n'
    '\n'
    '    var quotaTxt;\n'
    '    var usedTxt;\n'
    '    if (r.hasQuota) {\n'
    '      quotaTxt = fmtNum(r.freeQuota) + (r.quotaType ? \' <span class="xt-us-muted">(\' + esc(r.quotaType) + ")</span>" : "");\n'
    '      usedTxt = fmtNum(r.used);\n'
    '    } else {\n'
    '      quotaTxt = \'<span class="xt-us-muted">无配额数据</span>\';\n'
    '      usedTxt = \'<span class="xt-us-muted">无配额数据</span>\';\n'
    '    }\n'
    '\n'
    '    var localTxt = "<span>本机调用 " + fmtNum(r.localCalls || 0) + " 次</span>" +\n'
    '      "<span>本机 Token " + fmtNum(r.localTotal || 0) + "</span>";\n'
    '    var serverTxt = "";\n'
    '    if (r.hasQuota) {\n'
    '      serverTxt = "<span>服务端调用 " + fmtNum(r.calls || 0) + " 次</span>" +\n'
    '        "<span>已用 " + pctTxt + "%</span>";\n'
    '      if (r.status) serverTxt += \'<span>状态 \' + esc(statusLabel(r.status)) + "</span>";\n'
    '      if (r.estBaselineTs) {\n'
    '        serverTxt += "<span>预估基准 " + esc(fmtTime(r.estBaselineTs)) + "</span>";\n'
    '      }\n'
    '    }\n'
    '\n'
    '    return \'<div class="xt-us-model\' + (risk === "exhausted" ? " danger" : (risk === "low" ? " warn" : "")) + \'"\' +\n'
    '        \' data-risk="\' + esc(risk) + \'">\' +\n'
    '        \'<div class="xt-us-model-h">\' +\n'
    '          \'<div class="xt-us-model-name">\' + esc(r.name) + riskBig + "</div>" +\n'
    '          \'<div class="xt-us-model-tok">剩余 \' + quotaRemainingCell(r) + "</div>" +\n'
    '        "</div>" +\n'
    '        \'<div class="xt-us-model-id">\' + idTxt + "</div>" +\n'
    '        \'<div class="xt-us-bar"><i style="width:\' + pctTxt + \'%"></i></div>\' +\n'
    '        \'<div class="xt-us-metric\'>\' +\n'
    '          \'<div class="xt-us-metric-item"><span class="xt-us-metric-label">资源配额</span>\' +\n'
    '            \'<span class="xt-us-metric-val">\' + quotaTxt + "</span></div>" +\n'
    '          \'<div class="xt-us-metric-item"><span class="xt-us-metric-label">已使用量</span>\' +\n'
    '            \'<span class="xt-us-metric-val">\' + usedTxt + "</span></div>" +\n'
    '          \'<div class="xt-us-metric-item"><span class="xt-us-metric-label">剩余可用量</span>\' +\n'
    '            quotaRemainingCell(r) + "</div>" +\n'
    '          \'<div class="xt-us-metric-item"><span class="xt-us-metric-label">预计耗尽时间</span>\' +\n'
    '            quotaDepleteCell(r) + "</div>" +\n'
    '        "</div>" +\n'
    '        \'<div class="xt-us-model-meta">\' + localTxt + serverTxt + "</div>" +\n'
    '      "</div>";\n'
    '  }\n'
    '\n'
    '  // 逐模型（不聚合）渲染总表；el.modelList 不存在时静默跳过（保持原行为）\n'
    '  function renderQuotaModels(localRows, serverRows) {\n'
    '    if (!el.modelList) return;\n'
    '    var all = buildQuotaRows(localRows, serverRows);\n'
    '    if (!all.length) {\n'
    '      var tip = (state.quotaFilter && state.quotaFilter !== "all")\n'
    '        ? "按当前筛选条件没有匹配的模型（可切回「全部」查看）"\n'
    '        : "暂无数据：还没有任何模型用量记录";\n'
    '      el.modelList.innerHTML = \'<div class="xt-us-inline-empty">\' + esc(tip) + "</div>";\n'
    '      return;\n'
    '    }\n'
    '    var html = "";\n'
    '    for (var i = 0; i < all.length; i++) html += quotaCardHtml(all[i]);\n'
    '    el.modelList.innerHTML = html;\n'
    '  }\n'
    '\n'
    '  // 兼容旧调用点（renderAll 里仍调 renderModels(sum)）：改为在总表下补一行「本机口径」摘要，\n'
    '  // 模型逐条列表由 renderQuotaModels 负责，避免重复渲染同一批模型。\n'
    '  // 函数名 / 签名保持不变（对外契约不动）。\n'
    '  function renderModels(sum) {\n'
    '    if (!el.modelList) return;\n'
    '    if (!sum || !sum.rows || !sum.rows.length) return;   // 空态由 renderQuotaModels 统一给\n'
    '    var existing = el.modelList.innerHTML;\n'
    '    var note = \'<div class="xt-us-hint" style="margin-top:6px;">本机口径合计：\' +\n'
    '      fmtNum(sum.total) + " tokens · 调用 " + fmtNum(sum.calls) + " 次（逐模型明细见上方各行）</div>";\n'
    '    if (existing.indexOf("xt-us-hint") === -1) {\n'
    '      el.modelList.innerHTML = existing + note;\n'
    '    }\n'
    '  }\n'
)

# ---------------------------------------------------------------------------
# 5) buildServerRows：补 estRemainingRunsTxt / estBaselineTs / estAvgPerDay / estDays 解析
# ---------------------------------------------------------------------------
add(
    "buildServerRows",
    '        remaining: isFinite(rem) ? rem : NaN,\n'
    '        percent: clampPct(rec.percent, used, isFinite(fq) ? fq : 0),\n'
    '        status: deriveStatus(rec),\n'
    '        exhausted: rec.exhausted === true,\n'
    '        estRemainingRuns: numOr(rec.estRemainingRuns, NaN),\n'
    '        expireAt: rec.expireAt == null ? "" : String(rec.expireAt),\n'
    '        expired: rec.expired === true\n'
    '      });',
    '        remaining: isFinite(rem) ? rem : NaN,\n'
    '        percent: clampPct(rec.percent, used, isFinite(fq) ? fq : 0),\n'
    '        status: deriveStatus(rec),\n'
    '        exhausted: rec.exhausted === true,\n'
    '        // R88-A：预估耗尽相关字段按需读取，缺失一律 NaN / ""，展示层如实写「—」\n'
    '        estRemainingRuns: numOr(rec.estRemainingRuns, NaN),\n'
    '        estRemainingRunsTxt: rec.estRemainingRunsTxt == null ? "" : String(rec.estRemainingRunsTxt),\n'
    '        estBaselineTs: numOr(rec.estBaselineTs, 0),\n'
    '        estAvgPerDay: numOr(rec.estAvgPerDay, NaN),\n'
    '        estDays: numOr(rec.estDays, NaN),\n'
    '        expireAt: rec.expireAt == null ? "" : String(rec.expireAt),\n'
    '        expired: rec.expired === true\n'
    '      });',
)

# ---------------------------------------------------------------------------
# 6) renderServer：删除重复的「按模型累计（服务端）」列表，改为口径说明 + 缓存行供总表使用
# ---------------------------------------------------------------------------
add(
    "renderServer",
    '    var list = el.serverList;\n'
    '    var cmp = el.compareList;\n'
    '    if (st.phase !== "ok" || !st.data) {\n'
    '      setText("UsageServerModels", "—");\n'
    '      setText("UsageServerUsed", "—");\n'
    '      setText("UsageServerToday", "—");\n'
    '      setText("UsageServerLimit", "—");\n'
    '      if (list) list.innerHTML = \'<div class="xt-us-inline-empty">\' + esc(serverEmptyText(st)) + "</div>";\n'
    '      if (cmp) cmp.innerHTML = \'<div class="xt-us-inline-empty">服务端数据不可用，暂无法对照</div>\';\n'
    '      return;\n'
    '    }\n'
    '    var json = st.data;\n'
    '    var rows = sortRows(buildServerRows(json));\n'
    '    var sumUsed = 0;\n'
    '    for (var i = 0; i < rows.length; i++) sumUsed += Number(rows[i].used) || 0;\n'
    '    setText("UsageServerModels", fmtNum(rows.length));\n'
    '    setText("UsageServerUsed", fmtNum(sumUsed));\n'
    '    setText("UsageServerToday", fmtOrDash(json.used));\n'
    '    setText("UsageServerLimit", fmtOrDash(json.limit));\n'
    '    if (list) {\n'
    '      if (!rows.length) {\n'
    '        list.innerHTML = \'<div class="xt-us-inline-empty">\' + esc(serverEmptyText(st)) + "</div>";\n'
    '      } else {\n'
    '        var html = "";\n'
    '        for (var j = 0; j < rows.length; j++) {\n'
    '          var r = rows[j];\n'
    '          var pct = clampPct(r.percent, r.used, r.freeQuota);\n'
    '          var pctTxt = (pct >= 10) ? pct.toFixed(0) : pct.toFixed(1);\n'
    '          var remTxt = isFinite(r.remaining) ? fmtNum(r.remaining) : "—";\n'
    '          var qTxt = r.freeQuota ? fmtNum(r.freeQuota) : "—";\n'
    '          html += \'<div class="xt-us-model">\' +\n'
    '              \'<div class="xt-us-model-h">\' +\n'
    '                \'<div class="xt-us-model-name">\' + esc(r.name) +\n'
    '                  \' <span class="xt-us-tag">\' + esc(statusLabel(r.status)) + "</span></div>" +\n'
    '                \'<div class="xt-us-model-tok">\' + fmtNum(r.used) + " / " + qTxt + "</div>" +\n'
    '              "</div>" +\n'
    '              \'<div class="xt-us-bar"><i style="width:\' + pctTxt + \'%"></i></div>\' +\n'
    '              \'<div class="xt-us-model-meta">\' +\n'
    '                "<span>调用 " + fmtNum(r.calls) + " 次</span>" +\n'
    '                "<span>剩余 " + remTxt + "</span>" +\n'
    '                "<span>已用 " + pctTxt + "%</span>" +\n'
    '                (r.failCalls > 0 ? \'<span class="xt-us-warn">失败 \' + fmtNum(r.failCalls) + "</span>" : "") +\n'
    '              "</div>" +\n'
    '            "</div>";\n'
    '        }\n'
    '        list.innerHTML = html;\n'
    '      }\n'
    '    }\n'
    '    renderCompare(buildLocalRows(readLocalRecords()), rows);\n'
    '  }',
    '    var list = el.serverList;\n'
    '    var cmp = el.compareList;\n'
    '    if (st.phase !== "ok" || !st.data) {\n'
    '      setText("UsageServerModels", "—");\n'
    '      setText("UsageServerUsed", "—");\n'
    '      setText("UsageServerToday", "—");\n'
    '      setText("UsageServerLimit", "—");\n'
    '      serverRowsCache = [];\n'
    '      // R88-A：配额四项指标统一在「按模型单独列出」区块呈现，这里只如实说明口径，\n'
    '      // 不重复渲染第二份模型列表（避免一处改口径、另一处没跟上而互相矛盾）。\n'
    '      if (list) {\n'
    '        list.innerHTML = \'<div class="xt-us-inline-empty">\' + esc(serverEmptyText(st)) +\n'
    '          \'</div>\' +\n'
    '          \'<div class="xt-us-hint">配额口径说明：服务端未连接时，上方各行只能展示本机口径（调用次数 / Token），\' +\n'
    '          \'资源配额 / 已使用量 / 剩余可用量 / 预计耗尽时间均如实标注「无配额数据」。</div>\';\n'
    '      }\n'
    '      if (cmp) cmp.innerHTML = \'<div class="xt-us-inline-empty">服务端数据不可用，暂无法对照</div>\';\n'
    '      renderQuotaModels(buildLocalRows(readLocalRecords()), []);\n'
    '      return;\n'
    '    }\n'
    '    var json = st.data;\n'
    '    var rows = buildServerRows(json);\n'
    '    serverRowsCache = rows;\n'
    '    var sumUsed = 0;\n'
    '    for (var i = 0; i < rows.length; i++) sumUsed += Number(rows[i].used) || 0;\n'
    '    setText("UsageServerModels", fmtNum(rows.length));\n'
    '    setText("UsageServerUsed", fmtNum(sumUsed));\n'
    '    setText("UsageServerToday", fmtOrDash(json.used));\n'
    '    setText("UsageServerLimit", fmtOrDash(json.limit));\n'
    '    if (list) {\n'
    '      list.innerHTML = rows.length\n'
    '        ? \'<div class="xt-us-hint">已连接：共 \' + fmtNum(rows.length) +\n'
    '          " 个模型的配额/用量数据，已在「按模型单独列出」区块逐条展示（排序、高亮、筛选一律以「剩余可用量」为准，A 口径）。</div>"\n'
    '        : \'<div class="xt-us-inline-empty">\' + esc(serverEmptyText(st)) + "</div>";\n'
    '    }\n'
    '    renderCompare(buildLocalRows(readLocalRecords()), rows);\n'
    '    renderQuotaModels(buildLocalRows(readLocalRecords()), rows);\n'
    '  }',
)

# ---------------------------------------------------------------------------
# 7) 新增模块级缓存 serverRowsCache（供 renderAll 与 renderServer 共用一份服务端行）
# ---------------------------------------------------------------------------
add(
    "serverRowsCache",
    '  var clearTimer = null;\n'
    '  var statusTimer = null;\n'
    '  var renderTimer = null;',
    '  var clearTimer = null;\n'
    '  var statusTimer = null;\n'
    '  var renderTimer = null;\n'
    '  // R88-A：服务端配额行缓存（renderServer 写入，renderAll 在服务端尚未就绪时也要用它拼总表）\n'
    '  var serverRowsCache = [];',
)

# ---------------------------------------------------------------------------
# 8) renderAll：在渲染「按模型单独列出」区块前后，接入 A 口径数据流
# ---------------------------------------------------------------------------
add(
    "renderAll",
    '    var rows = [];\n'
    '    try { rows = s.filterByRange(records, state.range); } catch (e3) { rows = records; }\n'
    '    var kindRows = summarizeKinds(rows);\n'
    '    renderOverview(sum, kindTotals(kindRows));\n'
    '    renderModels(sum);\n'
    '    renderKinds(kindRows);\n'
    '    renderDetails(rows);\n'
    '  }',
    '    var rows = [];\n'
    '    try { rows = s.filterByRange(records, state.range); } catch (e3) { rows = records; }\n'
    '    var localRows = buildLocalRows(rows);\n'
    '    var kindRows = summarizeKinds(rows);\n'
    '    renderOverview(sum, kindTotals(kindRows));\n'
    '    // R88-A：逐模型（不聚合）+ A 口径（剩余可用量）总表；\n'
    '    // 服务端行用缓存（renderServer 已写入）；服务端未就绪时传空数组 → 各行如实标「无配额数据」。\n'
    '    renderQuotaModels(localRows, serverRowsCache);\n'
    '    renderModels(sum);\n'
    '    renderKinds(kindRows);\n'
    '    renderDetails(rows);\n'
    '  }',
)

# ---------------------------------------------------------------------------
# 9) 空账本分支也要渲染出「暂无数据」（含配额区块），避免整块空白
# ---------------------------------------------------------------------------
add(
    "renderAll-empty-records",
    '    if (!records || !records.length) {\n'
    '      renderEmpty("还没有任何用量记录", "与模型对话后，这里会按模型统计调用次数与 Token 消耗");\n'
    '      return;\n'
    '    }',
    '    if (!records || !records.length) {\n'
    '      renderEmpty("还没有任何用量记录", "与模型对话后，这里会按模型统计调用次数与 Token 消耗");\n'
    '      // R88-A：本机还没记录时，仍按服务端账本逐模型列一遍（配额四项照常展示，不聚合）\n'
    '      renderQuotaModels([], serverRowsCache);\n'
    '      return;\n'
    '    }',
)

# ---------------------------------------------------------------------------
# 10) skeleton：新增「排序口径 / 筛选（按剩余可用量）」两组 chip + 区块文案
# ---------------------------------------------------------------------------
add(
    "skeleton-model-block",
    '        \'<div id="UsageModelWrap">\' +\n'
    '          \'<div class="xt-us-sublabel"><span>按模型统计</span><span class="xt-us-hint">占比 = 该模型合计 Token / 范围内总 Token</span></div>\' +\n'
    '          \'<div id="UsageModelList"></div>\' +\n'
    '        "</div>" +',
    '        \'<div id="UsageModelWrap">\' +\n'
    '          \'<div class="xt-us-sublabel"><span>按模型单独列出</span>\' +\n'
    '            \'<span class="xt-us-hint">逐模型一行，不聚合；排序 / 高亮 / 筛选一律以「剩余可用量」为准（A 口径）</span></div>\' +\n'
    '          \'<div class="xt-us-sublabel"><span>排序方式（剩余可用量口径）</span></div>\' +\n'
    '          \'<div class="xt-us-chips" id="UsageQuotaSortBar">\' +\n'
    '            \'<button type="button" class="xt-us-chip active" data-quota-sort="remaining">剩余可用量（少 → 多）</button>\' +\n'
    '            \'<button type="button" class="xt-us-chip" data-quota-sort="remainingDesc">剩余可用量（多 → 少）</button>\' +\n'
    '            \'<button type="button" class="xt-us-chip" data-quota-sort="used">已使用量（多 → 少）</button>\' +\n'
    '            \'<button type="button" class="xt-us-chip" data-quota-sort="quota">资源配额（大 → 小）</button>\' +\n'
    '            \'<button type="button" class="xt-us-chip" data-quota-sort="name">模型名称</button>\' +\n'
    '          "</div>" +\n'
    '          \'<div class="xt-us-sublabel"><span>筛选（按剩余可用量）</span></div>\' +\n'
    '          \'<div class="xt-us-chips" id="UsageQuotaFilterBar">\' +\n'
    '            \'<button type="button" class="xt-us-chip active" data-quota-filter="all">全部</button>\' +\n'
    '            \'<button type="button" class="xt-us-chip" data-quota-filter="exhausted">已耗尽</button>\' +\n'
    '            \'<button type="button" class="xt-us-chip" data-quota-filter="low">剩余不足 10%</button>\' +\n'
    '            \'<button type="button" class="xt-us-chip" data-quota-filter="unknown">额度未知</button>\' +\n'
    '          "</div>" +\n'
    '          \'<div id="UsageModelList"></div>\' +\n'
    '        "</div>" +',
)

# ---------------------------------------------------------------------------
# 11) cache()：缓存新增两个 chip 容器（列表容器已存在，无需重复）
# ---------------------------------------------------------------------------
add(
    "cache",
    '    el.modelWrap = byId("UsageModelWrap");\n'
    '    el.modelList = byId("UsageModelList");',
    '    el.modelWrap = byId("UsageModelWrap");\n'
    '    el.modelList = byId("UsageModelList");\n'
    '    el.quotaSortBar = byId("UsageQuotaSortBar");\n'
    '    el.quotaFilterBar = byId("UsageQuotaFilterBar");',
)

# ---------------------------------------------------------------------------
# 12) bind()：接入新增两组 chip 的事件（排序 / 筛选各自只改 state 后重渲染）
# ---------------------------------------------------------------------------
add(
    "bind",
    '    bindChips("UsageSortBar", "data-sort", function (v) {\n'
    '      state.sortBy = v;\n'
    '      renderAll();\n'
    '    });',
    '    bindChips("UsageSortBar", "data-sort", function (v) {\n'
    '      state.sortBy = v;\n'
    '      renderAll();\n'
    '    });\n'
    '    // R88-A：A 口径排序 / 筛选（只影响「按模型单独列出」区块，与本机「按能力」区块互不干扰）\n'
    '    bindChips("UsageQuotaSortBar", "data-quota-sort", function (v) {\n'
    '      state.quotaSort = v;\n'
    '      renderAll();\n'
    '    });\n'
    '    bindChips("UsageQuotaFilterBar", "data-quota-filter", function (v) {\n'
    '      state.quotaFilter = v;\n'
    '      renderAll();\n'
    '    });',
)

# ---------------------------------------------------------------------------
# 13) rerenderQuotaBar：数据异步到达后，若无 renderAll 触发，单独重刷总表
#      —— 通过扩展 renderServer 尾部已实现；此处补充 loadServer 完成后的一处兜底刷新无需再加。
# ---------------------------------------------------------------------------


def main():
    with open(PATH, "rb") as f:
        raw = f.read()

    crlf = raw.count(b"\r\n")
    cr = raw.count(b"\r")
    if cr != 0:
        print("FATAL: 目标文件不是纯 LF（CR=%d, CRLF=%d），拒绝改动" % (cr, crlf))
        sys.exit(2)

    text = raw.decode("utf-8")

    for idx, (label, old, new) in enumerate(REPLACEMENTS, 1):
        cnt = text.count(old)
        if cnt != 1:
            print("FATAL: [%02d %s] 锚点出现 %d 次（要求恰好 1 次），拒绝改动" % (idx, label, cnt))
            sys.exit(3)
        text = text.replace(old, new, 1)
        print("OK  [%02d] %s" % (idx, label))

    out = text.encode("utf-8")
    with open(PATH, "wb") as f:
        f.write(out)

    # 复读复验
    with open(PATH, "rb") as f:
        check = f.read()
    c_crlf = check.count(b"\r\n")
    c_cr = check.count(b"\r")
    print()
    print("bytes: %d -> %d" % (len(raw), len(check)))
    print("LF: %d, CRLF: %d, CR: %d" % (check.count(b"\n"), c_crlf, c_cr))
    if c_cr != 0:
        print("FATAL: 写回后行尾被污染（出现 CR）")
        sys.exit(4)
    print("EOL = LF  ✔")

    # 关键改动生效自检
    must = [
        "function sortRowsByRemaining(",
        "function remainingBucket(",
        "function renderQuotaModels(",
        "function quotaCardHtml(",
        "serverRowsCache",
        "data-quota-sort",
        "data-quota-filter",
    ]
    for m in must:
        if m not in text:
            print("FATAL: 改动未生效，缺少片段: %s" % m)
            sys.exit(5)
    print("改动生效自检 ✔（%d 项）" % len(must))


if __name__ == "__main__":
    main()
