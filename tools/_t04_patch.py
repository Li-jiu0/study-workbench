# -*- coding: utf-8 -*-
"""T04 patch: ai-page.js visibility filter + xt-aiusage.js server snapshot.
Binary read/write to preserve EOL (both files are LF)."""
import io, os, shutil, sys

ROOT = r"D:\下载的文件\学习工作台"
AP = os.path.join(ROOT, r"assets\ai-page.js")
XU = os.path.join(ROOT, r"assets\xt-aiusage.js")

def readb(p):
    with open(p, "rb") as f:
        return f.read()

def writeb(p, b):
    with open(p, "wb") as f:
        f.write(b)

def backup(p, tag):
    dst = p + tag
    if not os.path.exists(dst):
        shutil.copyfile(p, dst)
    return dst

log = []

# ============ backups ============
log.append("backup(ai-page): " + os.path.basename(backup(AP, ".bak-pre-r87-20260918")))
log.append("backup(xt-aiusage): " + os.path.basename(backup(XU, ".bak-pre-r87-20260918")))

# ============ patch helper ============
def patch(path, name, pairs):
    raw = readb(path)
    txt = raw.decode("utf-8")
    for i, (old, new) in enumerate(pairs):
        c = txt.count(old)
        if c != 1:
            log.append("!! ANCHOR %s#%d count=%d (expected 1) -- ABORT" % (name, i, c))
            raise SystemExit("anchor fail %s#%d count=%d" % (name, i, c))
        txt = txt.replace(old, new, 1)
        log.append("   %s#%d ok" % (name, i))
    out = txt.encode("utf-8")
    # EOL guard: newline count of \r\n must stay 0 (LF)
    if out.count(b"\r\n") != raw.count(b"\r\n"):
        log.append("!! EOL changed on %s" % name)
        raise SystemExit("eol changed " + name)
    writeb(path, out)
    log.append("%s written: %d -> %d bytes" % (name, len(raw), len(out)))

# ============================================================
# ai-page.js
# ============================================================
ap_pairs = []

ap_pairs.append((
'''  /* 过滤 disabled + 按 order 排序（order 在前者先排，未列入者按原顺序排后） */
  function applyListSettings(list) {
    var out = [];
    var i;
    for (i = 0; i < list.length; i++) { if (!isDisabledId(list[i].id)) out.push(list[i]); }''',
'''  /* ---------- R87/T04：不可用模型可见性（需求 4 后半） ----------
     语义铁律（§9.6）：无 health 记录 → 视为【可见】；仅当明确探测失败
     （health[id] 存在且 ok === false）且 hideUnavailable 为真时才隐藏。
     隐藏 = 渲染期过滤：不写 disabled、不写持久化、不删模型 → 天然可逆。 */
  function hideUnavailableOn() {
    return getModelSettings().hideUnavailable === true;
  }
  function isHiddenByHealth(id) {
    if (!id) return false;
    if (!hideUnavailableOn()) return false;
    var h = getModelSettings().health;
    if (!h || typeof h !== 'object') return false;
    var rec = h[id];
    if (!rec || typeof rec !== 'object') return false;   /* 无 health 记录 → 可见（不误伤未检测模型） */
    return rec.ok === false;                              /* 仅明确检测失败才隐藏 */
  }
  /* 健康状态变更 → 基于【当前】health / hideUnavailable 重算（不缓存快照，故可逆） */
  function onHealthChanged() {
    try { renderModelList(); } catch (e) { /* 列表未就绪：忽略 */ }
  }
  /* 过滤 disabled + 不可用（health） + 按 order 排序（order 在前者先排，未列入者按原顺序排后） */
  function applyListSettings(list) {
    var out = [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (!isDisabledId(list[i].id) && !isHiddenByHealth(list[i].id)) out.push(list[i]);
    }'''))

ap_pairs.append((
'''    bindEvents();
    ensureMicButton();      // R86：麦克风按钮（DOM 注入，AI.html 不动）''',
'''    bindEvents();
    doc.addEventListener('xt:health-changed', onHealthChanged);   // R87/T04：健康状态变更 → 模型列表重算（恢复可用自动回归）
    ensureMicButton();      // R86：麦克风按钮（DOM 注入，AI.html 不动）'''))

patch(AP, "ai-page.js", ap_pairs)

# ============================================================
# xt-aiusage.js
# ============================================================
xu_pairs = []

xu_pairs.append((
'''  // 账本在 localStorage 里的键（与 assets/ai-service.js 的 USAGE_KEY 保持一致，此处只读）
  var USAGE_KEY = "xt_ai_usage_v1";''',
'''  // 账本在 localStorage 里的键（与 assets/ai-service.js 的 USAGE_KEY 保持一致，此处只读）
  var USAGE_KEY = "xt_ai_usage_v1";

  // R87/T04：服务端用量接口（免登录）与鉴权探测键
  var SERVER_USAGE_PATH = "/api/ai/usage";
  var SERVER_TIMEOUT_MS = 8000;
  var SERVER_TTL_MS = 15000;                    // 同一会话内 15s 不重复打接口
  var AUTH_TOKEN_KEY = "study_workbench_token"; // assets/api.js 写入的登录态键
  var AUTH_FLAG_KEY = "study_workbench_auth";

  // 服务端快照状态机：idle | loading | ok | unauthorized | missing | error
  var serverState = {
    phase: "idle",
    http: 0,
    reason: "",
    data: null,
    at: 0,
    loading: false
  };'''))

xu_pairs.append((
'''    var cellHtml = "";
    for (var i = 0; i < cells.length; i++) {
      cellHtml += '<div class="xt-us-cell">' +
        '<div class="xt-us-cell-num" id="' + cells[i][0] + '">0</div>' +
        '<div class="xt-us-cell-label">' + cells[i][1] + '</div>' +
        "</div>";
    }

    return '<div class="xt-about-block" id="UsageBlock">' +''',
'''    var cellHtml = "";
    for (var i = 0; i < cells.length; i++) {
      cellHtml += '<div class="xt-us-cell">' +
        '<div class="xt-us-cell-num" id="' + cells[i][0] + '">0</div>' +
        '<div class="xt-us-cell-label">' + cells[i][1] + '</div>' +
        "</div>";
    }

    /* R87/T04：服务端累计口径概览格（初始占位 —，避免误导为 0） */
    var serverCells = [
      ["UsageServerModels", "涉及模型"],
      ["UsageServerUsed", "账号累计调用"],
      ["UsageServerToday", "本人今日"],
      ["UsageServerLimit", "今日上限"]
    ];
    var serverCellHtml = "";
    for (var si = 0; si < serverCells.length; si++) {
      serverCellHtml += '<div class="xt-us-cell">' +
        '<div class="xt-us-cell-num" id="' + serverCells[si][0] + '">—</div>' +
        '<div class="xt-us-cell-label">' + serverCells[si][1] + '</div>' +
        "</div>";
    }

    return '<div class="xt-about-block" id="UsageBlock">' +'''))

xu_pairs.append((
'''        '<div class="xt-us-overview">' + cellHtml + "</div>" +

        '<div class="xt-us-sublabel"><span>时间范围</span></div>' +''',
'''        '<div class="xt-us-overview">' + cellHtml + "</div>" +

        '<div id="UsageServerWrap" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--ai-border);">' +
          '<div class="xt-us-sublabel"><span>服务端累计</span><span class="xt-us-hint" id="UsageServerStatus">加载中…</span></div>' +
          '<div class="xt-us-warnbar" id="UsageServerNote" style="display:none;"></div>' +
          '<div class="xt-us-overview">' + serverCellHtml + "</div>" +
          '<div class="xt-us-sublabel"><span>按模型累计（服务端）</span><span class="xt-us-hint">账号级共享额度，非本机</span></div>' +
          '<div id="UsageServerList"></div>' +
        "</div>" +

        '<div id="UsageCompareWrap" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--ai-border);">' +
          '<div class="xt-us-sublabel"><span>双口径对照</span><span class="xt-us-hint">本机记录 × 服务端累计 · 按今日次数 / 最近时间 / 名称排序</span></div>' +
          '<div id="UsageCompareList"></div>' +
        "</div>" +

        '<div class="xt-us-sublabel"><span>时间范围</span></div>' +'''))

xu_pairs.append((
'''    el.exportCopy = byId("UsageExportCopy");
  }''',
'''    el.exportCopy = byId("UsageExportCopy");
    el.serverStatus = byId("UsageServerStatus");
    el.serverNote = byId("UsageServerNote");
    el.serverList = byId("UsageServerList");
    el.compareList = byId("UsageCompareList");
  }'''))

xu_pairs.append((
'''    show(el.empty, false);
    show(el.modelWrap, true);
    show(el.kindWrap, true);
    show(el.detailWrap, true);

    var s = store();''',
'''    show(el.empty, false);
    show(el.modelWrap, true);
    show(el.kindWrap, true);
    show(el.detailWrap, true);

    loadServer();   /* R87/T04：服务端累计口径（与本地口径独立渲染，任一为空都不互相覆盖） */

    var s = store();'''))

SERVER_BLOCK = '''  // ---------- R87/T04：服务端累计口径（GET /api/ai/usage，免登录） ----------
  function numOr(v, dft) {
    var n = Number(v);
    return isFinite(n) ? n : dft;
  }

  function apiBase() {
    try {
      if (typeof window !== "undefined" && typeof window.API_BASE === "string") return window.API_BASE;
    } catch (e) { /* ignore */ }
    return "";   // 缺失时退化为同源相对路径
  }

  function hasLoginToken() {
    try {
      if (typeof window === "undefined" || !window.localStorage) return false;
      if (window.localStorage.getItem(AUTH_TOKEN_KEY)) return true;
      return window.localStorage.getItem(AUTH_FLAG_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  // 超时保护：优先 AbortController（老内核缺失时走 Promise.race 兜底）
  function withTimeout(p, ms, ctrl) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        if (ctrl && typeof ctrl.abort === "function") {
          try { ctrl.abort(); } catch (e) { /* ignore */ }
        }
        reject(new Error("timeout"));
      }, ms);
      p.then(function (v) {
        if (done) return; done = true; clearTimeout(timer); resolve(v);
      }, function (e) {
        if (done) return; done = true; clearTimeout(timer); reject(e);
      });
    });
  }

  function readJsonSafe(res) {
    if (res && typeof res.json === "function") {
      try {
        var pr = res.json();
        if (pr && typeof pr.then === "function") return pr;
      } catch (e) { /* fallthrough */ }
    }
    return Promise.resolve(null);
  }

  // 打服务端用量接口，归纳为 { phase, http, reason, data }：
  //   ok           → 成功
  //   unauthorized → 401/403（现网旧后端即 401）
  //   missing      → 404（后端未提供该接口）
  //   error        → 网络失败 / 超时 / JSON 解析失败 / 其它非 2xx
  function serverSnapshot() {
    if (typeof fetch !== "function") {
      return Promise.resolve({ phase: "error", reason: "no-fetch" });
    }
    var url = apiBase() + SERVER_USAGE_PATH;
    var ctrl = null;
    var opts = { method: "GET", headers: { "Accept": "application/json" } };
    if (typeof AbortController !== "undefined") {
      try { ctrl = new AbortController(); opts.signal = ctrl.signal; } catch (e) { ctrl = null; }
    }
    return withTimeout(fetch(url, opts), SERVER_TIMEOUT_MS, ctrl).then(function (res) {
      var status = (res && typeof res.status === "number") ? res.status : 0;
      if (status === 401 || status === 403) return { phase: "unauthorized", http: status };
      if (status === 404) return { phase: "missing", http: 404 };
      if (status < 200 || status >= 300) return { phase: "error", http: status };
      return readJsonSafe(res).then(function (json) {
        if (!json || typeof json !== "object") return { phase: "error", http: status, reason: "bad-json" };
        return { phase: "ok", http: status, data: json };
      }, function () {
        return { phase: "error", http: status, reason: "bad-json" };
      });
    }, function () {
      return { phase: "error", reason: "network" };
    });
  }

  // percent 夹取（对接文档「坑 11」：超额时后端可能给 >100，如 300/200=150%）
  function clampPct(percent, used, freeQuota) {
    var p = Number(percent);
    if (!isFinite(p)) {
      var u = Number(used) || 0, q = Number(freeQuota) || 0;
      p = q > 0 ? (u / q) * 100 : 0;
    }
    if (!isFinite(p) || p < 0) p = 0;
    if (p > 100) p = 100;
    return p;
  }

  // status：ok（剩余>20%）/ low（剩余≤20%）/ exhausted（剩余=0）/ unknown（额度表里没有）
  function deriveStatus(rec) {
    if (rec && rec.status) return String(rec.status);
    if (rec && rec.exhausted === true) return "exhausted";
    var rem = Number(rec && rec.remaining), q = Number(rec && rec.freeQuota);
    if (!isFinite(rem) || !isFinite(q) || q <= 0) return "unknown";
    if (rem <= 0) return "exhausted";
    if (rem <= q * 0.2) return "low";
    return "ok";
  }

  function statusLabel(st) {
    if (st === "ok") return "可用";
    if (st === "low") return "额度偏低";
    if (st === "exhausted") return "额度耗尽";
    return "额度未知";
  }

  function fmtOrDash(v) {
    var n = Number(v);
    return isFinite(n) ? fmtNum(n) : "—";
  }

  // 服务端 models{id:{used,calls,failCalls,freeQuota,quotaType,remaining,percent,status,
  //   exhausted,estRemainingRuns,expireAt,expired}} → 规整行（兼容旧字段 used / limit / date）
  function buildServerRows(json) {
    var rows = [];
    var models = (json && typeof json.models === "object" && json.models) ? json.models : null;
    if (!models) return rows;
    for (var id in models) {
      if (!Object.prototype.hasOwnProperty.call(models, id)) continue;
      var rec = models[id] || {};
      var fq = numOr(rec.freeQuota, NaN);
      var rem = numOr(rec.remaining, NaN);
      var calls = numOr(rec.calls, 0);
      var used = numOr(rec.used, 0);
      rows.push({
        key: String(id),
        name: String(id),
        todayCalls: calls,                                  // 服务端无「今日」拆分，以累计调用参与排序
        lastTs: numOr(rec.at, numOr(rec.ts, 0)),
        calls: calls,
        used: used,
        failCalls: numOr(rec.failCalls, 0),
        freeQuota: isFinite(fq) ? fq : 0,
        quotaType: rec.quotaType ? String(rec.quotaType) : "",
        remaining: isFinite(rem) ? rem : NaN,
        percent: clampPct(rec.percent, used, isFinite(fq) ? fq : 0),
        status: deriveStatus(rec),
        exhausted: rec.exhausted === true,
        estRemainingRuns: numOr(rec.estRemainingRuns, NaN),
        expireAt: rec.expireAt == null ? "" : String(rec.expireAt),
        expired: rec.expired === true
      });
    }
    return rows;
  }

  // 本地账本 → 规整行（累计口径，含今日次数 / 最近时间）
  function buildLocalRows(records) {
    var map = {};
    var now = new Date();
    var dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    for (var i = 0; i < records.length; i++) {
      var it = records[i];
      if (!it || typeof it !== "object") continue;
      var name = String(it.model == null ? (it.modelId == null ? "未知模型" : it.modelId) : it.model);
      if (!name) name = "未知模型";
      var row = map[name];
      if (!row) { row = { key: name, name: name, todayCalls: 0, lastTs: 0, calls: 0, total: 0, fail: 0 }; map[name] = row; }
      var ts = Number(it.ts) || 0;
      row.calls += 1;
      row.total += (Math.round(Number(it.inTok) || 0) + Math.round(Number(it.outTok) || 0));
      if (it.ok === false) row.fail += 1;
      if (ts > row.lastTs) row.lastTs = ts;
      if (ts >= dayStart) row.todayCalls += 1;
    }
    var out = [];
    for (var k in map) { if (Object.prototype.hasOwnProperty.call(map, k)) out.push(map[k]); }
    return out;
  }

  // 统一排序：今日次数 ↓ → 最近时间 ↓ → 名称 ↑（三级 + 原序稳定）
  // 所有展示分支（本地 / 服务端 / 并列表）一律走这里，不许各写一套。
  function sortRows(rows) {
    var deco = [];
    for (var i = 0; i < rows.length; i++) deco.push({ r: rows[i], i: i });
    deco.sort(function (a, b) {
      var ra = a.r, rb = b.r;
      var at = Number(ra.todayCalls) || 0, bt = Number(rb.todayCalls) || 0;
      if (bt !== at) return bt - at;
      var al = Number(ra.lastTs) || 0, bl = Number(rb.lastTs) || 0;
      if (bl !== al) return bl - al;
      var an = String(ra.name == null ? "" : ra.name), bn = String(rb.name == null ? "" : rb.name);
      if (an < bn) return -1;
      if (an > bn) return 1;
      return a.i - b.i;   // 稳定：保持原相对顺序
    });
    var out = [];
    for (var k = 0; k < deco.length; k++) out.push(deco[k].r);
    return out;
  }

  function serverStatusText(st) {
    if (st.phase === "loading") return "加载中…";
    if (st.phase === "ok") return st.at ? ("更新于 " + fmtTime(st.at)) : "已连接";
    if (st.phase === "unauthorized") return "需新版后端";
    if (st.phase === "missing") return "接口未提供";
    if (st.phase === "error") return "暂不可用";
    return "未连接";
  }

  // 降级分支表（§6 T04 / G4）
  function serverNoteText(st) {
    if (st.phase === "unauthorized") return "服务端用量需新版后端（当前接口返回 " + (st.http || 401) + "）；此处展示本机口径。";
    if (st.phase === "missing") return "后端未提供用量接口（HTTP 404）；此处展示本机口径。";
    if (st.phase === "error") {
      if (st.reason === "no-fetch") return "当前环境不支持 fetch；服务端用量暂不可用。";
      if (st.reason === "bad-json") return "服务端返回内容无法解析；服务端用量暂不可用。";
      return "网络异常或超时；服务端用量暂不可用。";
    }
    return "";
  }

  // 空态文案：区分「0 是因为游客未登录」与「0 是因为真的没有用量」
  function serverEmptyText(st) {
    if (st.phase === "ok") {
      if (!hasLoginToken()) return "游客模式：服务端不记录个人今日用量（登录后可查看账号级累计）";
      return "服务端暂无用量记录（已登录，账号级累计为 0）";
    }
    if (st.phase === "unauthorized") return "服务端用量需新版后端，暂无法展示";
    if (st.phase === "missing") return "后端未提供用量接口";
    return "服务端用量暂不可用";
  }

  function readLocalRecords() {
    var s = store();
    if (!s || typeof s.list !== "function") return [];
    try { return s.list() || []; } catch (e) { return []; }
  }

  // 双口径并列表：本机记录 × 服务端累计（也走 sortRows 统一排序）
  function renderCompare(localRows, serverRows) {
    var cmp = el.compareList;
    if (!cmp) return;
    var map = {};
    var i, r;
    for (i = 0; i < localRows.length; i++) {
      r = localRows[i];
      map[r.name] = { name: r.name, todayCalls: r.todayCalls, lastTs: r.lastTs, localCalls: r.calls, localTotal: r.total };
    }
    for (i = 0; i < serverRows.length; i++) {
      r = serverRows[i];
      var row = map[r.name];
      if (!row) { row = { name: r.name, todayCalls: r.calls, lastTs: r.lastTs, localCalls: 0, localTotal: 0 }; map[r.name] = row; }
      row.serverUsed = r.used;
      row.serverCalls = r.calls;
      row.remaining = r.remaining;
      row.percent = r.percent;
      row.status = r.status;
      row.todayCalls = Math.max(Number(row.todayCalls) || 0, Number(r.calls) || 0);
      row.lastTs = Math.max(Number(row.lastTs) || 0, Number(r.lastTs) || 0);
    }
    var rows = [];
    for (var k in map) { if (Object.prototype.hasOwnProperty.call(map, k)) rows.push(map[k]); }
    rows = sortRows(rows);
    if (!rows.length) {
      cmp.innerHTML = '<div class="xt-us-inline-empty">暂无可对照的模型记录</div>';
      return;
    }
    var html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;line-height:1.6;">' +
      '<thead><tr style="color:#999;">' +
        '<th style="text-align:left;padding:6px 8px;font-weight:500;">模型</th>' +
        '<th style="text-align:right;padding:6px 8px;font-weight:500;">本机调用</th>' +
        '<th style="text-align:right;padding:6px 8px;font-weight:500;">本机 Token</th>' +
        '<th style="text-align:right;padding:6px 8px;font-weight:500;">服务端累计</th>' +
        '<th style="text-align:right;padding:6px 8px;font-weight:500;">剩余</th>' +
        '<th style="text-align:left;padding:6px 8px;font-weight:500;">状态</th>' +
      "</tr></thead><tbody>";
    for (var t = 0; t < rows.length; t++) {
      var rr = rows[t];
      var remTxt = isFinite(rr.remaining) ? fmtNum(rr.remaining) : "—";
      html += '<tr style="border-top:1px solid var(--ai-border);">' +
        '<td style="padding:6px 8px;">' + esc(rr.name) + "</td>" +
        '<td style="padding:6px 8px;text-align:right;">' + fmtNum(rr.localCalls || 0) + "</td>" +
        '<td style="padding:6px 8px;text-align:right;">' + fmtNum(rr.localTotal || 0) + "</td>" +
        '<td style="padding:6px 8px;text-align:right;">' + (isFinite(rr.serverUsed) ? fmtNum(rr.serverUsed) : "—") + "</td>" +
        '<td style="padding:6px 8px;text-align:right;">' + remTxt + "</td>" +
        '<td style="padding:6px 8px;">' + esc(rr.status ? statusLabel(rr.status) : "—") + "</td>" +
        "</tr>";
    }
    html += "</tbody></table></div>";
    cmp.innerHTML = html;
  }

  // 挂载后渲染服务端区块（四态区分）
  function renderServer() {
    var st = serverState;
    setText("UsageServerStatus", serverStatusText(st));
    var noteEl = byId("UsageServerNote");
    var note = serverNoteText(st);
    if (noteEl) {
      if (note) { noteEl.textContent = note; noteEl.style.display = ""; }
      else { noteEl.textContent = ""; noteEl.style.display = "none"; }
    }
    var list = el.serverList;
    var cmp = el.compareList;
    if (st.phase !== "ok" || !st.data) {
      setText("UsageServerModels", "—");
      setText("UsageServerUsed", "—");
      setText("UsageServerToday", "—");
      setText("UsageServerLimit", "—");
      if (list) list.innerHTML = '<div class="xt-us-inline-empty">' + esc(serverEmptyText(st)) + "</div>";
      if (cmp) cmp.innerHTML = '<div class="xt-us-inline-empty">服务端数据不可用，暂无法对照</div>';
      return;
    }
    var json = st.data;
    var rows = sortRows(buildServerRows(json));
    var sumUsed = 0;
    for (var i = 0; i < rows.length; i++) sumUsed += Number(rows[i].used) || 0;
    setText("UsageServerModels", fmtNum(rows.length));
    setText("UsageServerUsed", fmtNum(sumUsed));
    setText("UsageServerToday", fmtOrDash(json.used));
    setText("UsageServerLimit", fmtOrDash(json.limit));
    if (list) {
      if (!rows.length) {
        list.innerHTML = '<div class="xt-us-inline-empty">' + esc(serverEmptyText(st)) + "</div>";
      } else {
        var html = "";
        for (var j = 0; j < rows.length; j++) {
          var r = rows[j];
          var pct = clampPct(r.percent, r.used, r.freeQuota);
          var pctTxt = (pct >= 10) ? pct.toFixed(0) : pct.toFixed(1);
          var remTxt = isFinite(r.remaining) ? fmtNum(r.remaining) : "—";
          var qTxt = r.freeQuota ? fmtNum(r.freeQuota) : "—";
          html += '<div class="xt-us-model">' +
              '<div class="xt-us-model-h">' +
                '<div class="xt-us-model-name">' + esc(r.name) +
                  ' <span class="xt-us-tag">' + esc(statusLabel(r.status)) + "</span></div>" +
                '<div class="xt-us-model-tok">' + fmtNum(r.used) + " / " + qTxt + "</div>" +
              "</div>" +
              '<div class="xt-us-bar"><i style="width:' + pctTxt + '%"></i></div>' +
              '<div class="xt-us-model-meta">' +
                "<span>调用 " + fmtNum(r.calls) + " 次</span>" +
                "<span>剩余 " + remTxt + "</span>" +
                "<span>已用 " + pctTxt + "%</span>" +
                (r.failCalls > 0 ? '<span class="xt-us-warn">失败 ' + fmtNum(r.failCalls) + "</span>" : "") +
              "</div>" +
            "</div>";
        }
        list.innerHTML = html;
      }
    }
    renderCompare(buildLocalRows(readLocalRecords()), rows);
  }

  // 拉服务端快照（带 TTL + 单飞保护），完成后渲染
  function loadServer() {
    if (serverState.loading) return;
    var now = Date.now();
    if (serverState.at && (now - serverState.at) < SERVER_TTL_MS) { renderServer(); return; }
    serverState.loading = true;
    serverState.phase = "loading";
    renderServer();
    serverSnapshot().then(function (res) {
      serverState.loading = false;
      serverState.phase = (res && res.phase) ? res.phase : "error";
      serverState.http = (res && res.http) || 0;
      serverState.reason = (res && res.reason) || "";
      serverState.data = (res && res.data) || null;
      serverState.at = Date.now();
      renderServer();
    }, function () {
      serverState.loading = false;
      serverState.phase = "error";
      serverState.reason = "network";
      serverState.at = Date.now();
      renderServer();
    });
  }

'''

xu_pairs.append((
'''  // ---------- 挂载点 ----------
  function skeleton() {''',
SERVER_BLOCK + '''  // ---------- 挂载点 ----------
  function skeleton() {'''))

patch(XU, "xt-aiusage.js", xu_pairs)

with io.open(os.path.join(ROOT, r"tools\_t04_patch_log.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(log))
print("DONE")
