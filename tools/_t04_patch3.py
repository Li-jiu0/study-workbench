# -*- coding: utf-8 -*-
import os
ROOT = r"D:\下载的文件\学习工作台"
XU = os.path.join(ROOT, r"assets\xt-aiusage.js")

with open(XU, "rb") as f:
    raw = f.read()
txt = raw.decode("utf-8")

pairs = []

# 1) 常量：设置键（只读，用于取用户重命名覆盖）
pairs.append((
'''  var AUTH_FLAG_KEY = "study_workbench_auth";''',
'''  var AUTH_FLAG_KEY = "study_workbench_auth";
  var SETTINGS_LS_KEY = "ai_model_settings";    // 与 ai-settings.js 同键（只读：取 overrides[id].name 用户重命名）'''))

# 2) 新增 displayNameOf 三函数（插在 buildServerRows 之前）
pairs.append((
'''  // 服务端 models{id:{used,calls,failCalls,freeQuota,quotaType,remaining,percent,status,
  //   exhausted,estRemainingRuns,expireAt,expired}} → 规整行（兼容旧字段 used / limit / date）
  function buildServerRows(json) {''',
'''  // ---------- 模型显示名解析（只读，不写） ----------
  // 口径对齐 ai-settings.js 的 displayName()：用户重命名覆盖 > 内置名 > 回退 modelId。
  function settingsOverrides() {
    try {
      if (typeof window === "undefined" || !window.localStorage) return null;
      var raw = window.localStorage.getItem(SETTINGS_LS_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (o && typeof o === "object" && o.overrides && typeof o.overrides === "object") return o.overrides;
    } catch (e) { /* 坏数据：当作无覆盖 */ }
    return null;
  }
  function builtinNameOf(modelId) {
    try {
      var cfg = (typeof window !== "undefined") ? window.AI_CONFIG : null;
      var arr = (cfg && cfg.builtinModels) ? cfg.builtinModels : null;
      if (!arr || !arr.length) return "";
      for (var i = 0; i < arr.length; i++) {
        var m = arr[i];
        if (m && String(m.id) === String(modelId) && m.name) return String(m.name);
      }
    } catch (e) { /* AI_CONFIG 未就绪：回退 */ }
    return "";
  }
  // 取不到一律回退 modelId 原值（服务端可能有本地没有的旧模型 / 他人自定义模型；不报错、不丢行）
  function displayNameOf(modelId) {
    var id = String(modelId == null ? "" : modelId);
    if (!id) return id;
    var ov = settingsOverrides();
    if (ov && ov[id] && typeof ov[id] === "object" && ov[id].name) {
      var nm = String(ov[id].name);
      if (nm) return nm;
    }
    var bn = builtinNameOf(id);
    if (bn) return bn;
    return id;
  }

  // 服务端 models{id:{used,calls,failCalls,freeQuota,quotaType,remaining,percent,status,
  //   exhausted,estRemainingRuns,expireAt,expired}} → 规整行（兼容旧字段 used / limit / date）
  function buildServerRows(json) {'''))

# 3) buildServerRows：name 走 displayNameOf，保留 id
pairs.append((
'''      rows.push({
        key: String(id),
        name: String(id),
        todayCalls: calls,                                  // 服务端无「今日」拆分，以累计调用参与排序''',
'''      rows.push({
        key: String(id),
        id: String(id),
        name: displayNameOf(id),                            // 中文显示名（覆盖 > 内置 > 回退 id）
        todayCalls: calls,                                  // 服务端无「今日」拆分，以累计调用参与排序'''))

# 4) buildLocalRows：按 modelId 归并 + displayNameOf
pairs.append((
'''      var name = String(it.model == null ? (it.modelId == null ? "未知模型" : it.modelId) : it.model);
      if (!name) name = "未知模型";
      var row = map[name];
      if (!row) { row = { key: name, name: name, todayCalls: 0, lastTs: 0, calls: 0, total: 0, fail: 0 }; map[name] = row; }''',
'''      var mid = (it.modelId == null) ? "" : String(it.modelId);
      var name = mid ? displayNameOf(mid) : String(it.model == null ? "" : it.model);
      if (!name) name = "未知模型";
      var key = mid || name;
      var row = map[key];
      if (!row) { row = { key: key, name: name, todayCalls: 0, lastTs: 0, calls: 0, total: 0, fail: 0 }; map[key] = row; }'''))

# 5) renderCompare：按 key 合并（而非 name）+ 口径脚注
pairs.append((
'''    for (i = 0; i < localRows.length; i++) {
      r = localRows[i];
      map[r.name] = { name: r.name, todayCalls: r.todayCalls, lastTs: r.lastTs, localCalls: r.calls, localTotal: r.total };
    }
    for (i = 0; i < serverRows.length; i++) {
      r = serverRows[i];
      var row = map[r.name];
      if (!row) { row = { name: r.name, todayCalls: r.calls, lastTs: r.lastTs, localCalls: 0, localTotal: 0 }; map[r.name] = row; }''',
'''    for (i = 0; i < localRows.length; i++) {
      r = localRows[i];
      map[r.key] = { key: r.key, name: r.name, todayCalls: r.todayCalls, lastTs: r.lastTs, localCalls: r.calls, localTotal: r.total };
    }
    for (i = 0; i < serverRows.length; i++) {
      r = serverRows[i];
      var row = map[r.key];
      if (!row) { row = { key: r.key, name: r.name, todayCalls: r.calls, lastTs: r.lastTs, localCalls: 0, localTotal: 0 }; map[r.key] = row; }'''))

pairs.append((
'''    html += "</tbody></table></div>";
    cmp.innerHTML = html;''',
'''    html += "</tbody></table>" +
      '<div class="xt-us-hint" style="margin-top:6px;">对照说明：服务端口径为账号级累计值（无「今日」拆分），本机口径来自本机浏览器账本；两列口径不同，不能直接相减对账。</div>' +
      "</div>";
    cmp.innerHTML = html;'''))

for i, (old, new) in enumerate(pairs):
    c = txt.count(old)
    if c != 1:
        raise SystemExit("anchor %d count=%d" % (i, c))
    txt = txt.replace(old, new, 1)

out = txt.encode("utf-8")
if out.count(b"\r\n") != raw.count(b"\r\n"):
    raise SystemExit("EOL changed")
with open(XU, "wb") as f:
    f.write(out)
print("ok %d -> %d" % (len(raw), len(out)))
