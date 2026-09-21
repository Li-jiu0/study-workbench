# -*- coding: utf-8 -*-
"""重建 T02 改动前的 ai-service.js（反向套用 9 处编辑），写回备份文件。
用已知改前大小 140942 字节做校验。"""
import os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = r"D:\下载的文件\学习工作台"
cur = os.path.join(ROOT, "assets", "ai-service.js")
bak = os.path.join(ROOT, "assets", "ai-service.js.bak-pre-r87-20260918")
EXPECT = 140942

pairs = []

# P1 constants kind map
pairs.append((
'''  var XT_KIND_BY_TYPE = {
    imagegen: "imagegen",
    audio: "asr",
    embedding: "embed",
    rerank: "rerank",
    image: "vision",
    translate: "text",     // 【R87/T02 新增】翻译走文本 token 口径
    video: "video",        // 【R87/T02 新增】
    "3d": "model3d"        // 【R87/T02 新增】type 保持 '3d'，kind 记 'model3d'
  };''',
'''  var XT_KIND_BY_TYPE = {
    imagegen: "imagegen",
    audio: "asr",
    embedding: "embed",
    rerank: "rerank",
    image: "vision"
  };'''))

# P2 non-chat + kind list
pairs.append((
'''  var XT_NON_CHAT_TYPES = ["imagegen", "audio", "embedding", "rerank", "video", "3d"]; // 【R87/T02 新增 video/3d】
  // 账本 kind 白名单（老记录没有 kind 字段 -> 读取侧按 text 兜底）
  var XT_KIND_LIST = ["text", "vision", "imagegen", "asr", "embed", "rerank", "video", "model3d"]; // 【R87/T02 新增 video/model3d】''',
'''  var XT_NON_CHAT_TYPES = ["imagegen", "audio", "embedding", "rerank"];
  // 账本 kind 白名单（老记录没有 kind 字段 -> 读取侧按 text 兜底）
  var XT_KIND_LIST = ["text", "vision", "imagegen", "asr", "embed", "rerank"];'''))

# P3 header comment + function head + not_found
pairs.append((
'''  // R66 N2：aiHealthCheck 支持可选第二参数 cfgOverride（临时配置）。签名一字不改。
  //   window.aiHealthCheck(modelId, cfgOverride) -> Promise<{ok:boolean, ms:number, err:string|null, kind:string}>
  //   cfgOverride（可选）: { apiUrl, apiKey, apiFormat, extraHeaders, modelId }
  // - 传 cfgOverride 时：用临时配置构造请求（apiUrl/apiKey/apiFormat/extraHeaders 覆盖；
  //   cfgOverride.modelId 覆盖实际请求的模型 id），不读也不写 ai_model_settings.overrides、
  //   不修改任何已存配置、结果不落盘（由调用方决定）。
  // - 不传时：行为与改造前完全一致（走 overrides 合并后的模型配置）。
  // - 保持：maxTokens=1、绝不触发 recordCall / 不计入限频；err 值域
  //   （http_XXX / cors / network / timeout / empty）并新增 no_endpoint / no_key /
  //   unsupported_probe（R87/T02：该能力未实现自动探测，不再误报 http_400）。
  //   R83：连通性检测超时统一 5 秒（文档 §四），超时即判不可用并降级，不长时间等待；
  //   图片生成模型改走 images/generations 专用检测，超时 60s（实测约 35s）。
  //   R87 / T02：按模型能力分派探测——xtResolveCapability 找到接管能力后：
  //     有 cap.probe(function) -> 走专用探针；无 probe 的文本族能力（vision/translate）
  //     回落文本探测；无 probe 的非对话能力（asr/embed/rerank/video/model3d）返回
  //     unsupported_probe。隐藏第三实参 batchScan===true（由 aiHealthCheckBatch 传入）
  //     时，成本极高的 video/model3d 探针一律跳过（不烧额度），单模型检测照常提交。
  function aiHealthCheckImpl(modelId, cfgOverride) {
    // 第三实参（隐藏）：批量扫描标记。对外声明的签名保持 (modelId, cfgOverride) 不变。
    var batchScan = (arguments.length > 2 && arguments[2] === true);
    return new Promise(function (resolve) {
      var startedAt = Date.now();
      var ov = (cfgOverride && typeof cfgOverride === "object") ? cfgOverride : null;
      var raw = findModel(modelId);
      if (!raw && !ov) {
        resolve({ ok: false, ms: 0, err: "not_found", kind: "" });
        return;
      }''',
'''  // R66 N2：aiHealthCheck 支持可选第二参数 cfgOverride（临时配置）。签名一字不改。
  //   window.aiHealthCheck(modelId, cfgOverride) -> Promise<{ok:boolean, ms:number, err:string|null}>
  //   cfgOverride（可选）: { apiUrl, apiKey, apiFormat, extraHeaders, modelId }
  // - 传 cfgOverride 时：用临时配置构造请求（apiUrl/apiKey/apiFormat/extraHeaders 覆盖；
  //   cfgOverride.modelId 覆盖实际请求的模型 id），不读也不写 ai_model_settings.overrides、
  //   不修改任何已存配置、结果不落盘（由调用方决定）。
  // - 不传时：行为与改造前完全一致（走 overrides 合并后的模型配置）。
  // - 保持：maxTokens=1、12s 超时、绝不触发 recordCall / 不计入限频；err 值域不变
  //   （http_XXX / cors / network / timeout / empty）并新增两个值：no_endpoint / no_key。
  //   R83：连通性检测超时统一 5 秒（文档 §四），超时即判不可用并降级，不长时间等待；
  //   图片生成模型改走 images/generations 专用检测，超时 60s（实测约 35s）。
  function aiHealthCheckImpl(modelId, cfgOverride) {
    return new Promise(function (resolve) {
      var startedAt = Date.now();
      var ov = (cfgOverride && typeof cfgOverride === "object") ? cfgOverride : null;
      var raw = findModel(modelId);
      if (!raw && !ov) {
        resolve({ ok: false, ms: 0, err: "not_found" });
        return;
      }'''))

# P4 no_endpoint / no_key
pairs.append((
'''      if (!eff.apiUrl) { resolve({ ok: false, ms: 0, err: "no_endpoint", kind: "" }); return; }
      if (!eff.apiKey) { resolve({ ok: false, ms: 0, err: "no_key", kind: "" }); return; }''',
'''      if (!eff.apiUrl) { resolve({ ok: false, ms: 0, err: "no_endpoint" }); return; }
      if (!eff.apiKey) { resolve({ ok: false, ms: 0, err: "no_key" }); return; }'''))

# P5 image finish
pairs.append((
'''            finish({ ok: !!out, ms: Date.now() - startedAt, err: out ? null : "empty", kind: "imagegen" });
          }, function (eImg) {
            if (iTimer) clearTimeout(iTimer);
            finish({ ok: false, ms: Date.now() - startedAt, err: classifyHealthErr(eImg), kind: "imagegen" });''',
'''            finish({ ok: !!out, ms: Date.now() - startedAt, err: out ? null : "empty" });
          }, function (eImg) {
            if (iTimer) clearTimeout(iTimer);
            finish({ ok: false, ms: Date.now() - startedAt, err: classifyHealthErr(eImg) });'''))

# P6 dispatch insertion
pairs.append((
'''          });
        return;
      }

      // ---------- R87 / T02：能力分派（生图分支之后、文本兜底之前） ----------
      // 复用 xtResolveCapability 解析该模型对应的能力：
      //   1) cap 且 typeof cap.probe === 'function'                     -> 走 cap.probe(ctx) 专用探针；
      //   2) cap 无 probe 且为文本族（vision / translate / text）        -> 回落文本探测（零回归）；
      //   3) cap 无 probe 且为非对话能力（asr/embed/rerank/video/model3d） -> unsupported_probe；
      //   4) 无 cap（纯文本模型，含注册表缺失）                          -> 回落文本探测（行为不变）。
      // 探针绝不触发 recordCall / 不进 10 次/分钟限频（与既有健康检查同层）。
      var capInfo = xtResolveCapability(ping);
      var capObj = (capInfo && capInfo.cap) ? capInfo.cap : null;
      var capKind = (capInfo && capInfo.kind) ? String(capInfo.kind) : "";
      if (capObj && typeof capObj.probe === "function") {
        // 成本保护：video / model3d 单次约 10 万 / 3 万 tokens，绝不进「检测全部」自动批量；
        // 用户手动单模型检测（不经 aiHealthCheckBatch）仍允许提交探针。
        if (batchScan && (capKind === "video" || capKind === "model3d")) {
          finish({ ok: false, ms: 0, err: "unsupported_probe", kind: capKind });
          return;
        }
        var cfgP = getConfig();
        var provP = (ping && ping.provider && cfgP && cfgP.providers) ? cfgP.providers[ping.provider] : null;
        var pTimeout = (typeof capObj.probeTimeout === "number" && capObj.probeTimeout > 0)
          ? capObj.probeTimeout
          : ((typeof capObj.timeout === "number" && capObj.timeout > 0) ? capObj.timeout : XT_CAP_TIMEOUT_DEFAULT);
        var probeRes = null;
        try {
          probeRes = capObj.probe({ modelCfg: ping, provider: provP, timeout: pTimeout });
        } catch (eProbe) {
          finish({ ok: false, ms: Date.now() - startedAt, err: classifyHealthErr(eProbe), kind: capKind });
          return;
        }
        // 契约（设计 §3.3）：probe 返回 Promise<{ok, err, detail?}>；非 Promise 视为空结果
        if (!probeRes || typeof probeRes.then !== "function") {
          finish({ ok: false, ms: Date.now() - startedAt, err: "empty", kind: capKind });
          return;
        }
        probeRes.then(function (pr) {
          var ok = !!(pr && pr.ok);
          var perr = ok ? null : ((pr && pr.err) ? String(pr.err) : "empty");
          finish({ ok: ok, ms: Date.now() - startedAt, err: perr, kind: capKind });
        }, function (eProbe2) {
          finish({ ok: false, ms: Date.now() - startedAt, err: classifyHealthErr(eProbe2), kind: capKind });
        });
        return;
      }
      if (capObj) {
        // 有 cap 无 probe：vision / translate 本就是「文本族」（其探针即文本 chat）；
        // 其余非对话能力没有专用探测，返回 unsupported_probe（不再把「用错接口的 400」呈现为模型不可用）。
        if (capKind !== "vision" && capKind !== "translate" && capKind !== "text") {
          finish({ ok: false, ms: 0, err: "unsupported_probe", kind: capKind });
          return;
        }
      }
      // 文本兜底（纯文本模型 / vision / translate / 注册表缺失）：kind 如实记录
      var textKind = capKind ? capKind : "text";

      // 总超时（R73n：needProxy 平台 15s，其余 5s）：复用 raceTimeout（老 WebView 兼容）；有 AbortController 时再加一层硬中止
      var ctrl = null;''',
'''          });
        return;
      }

      // 总超时（R73n：needProxy 平台 15s，其余 5s）：复用 raceTimeout（老 WebView 兼容）；有 AbortController 时再加一层硬中止
      var ctrl = null;'''))

# P7 text finish + batch func
pairs.append((
'''      ).then(function (text) {
        if (text) finish({ ok: true, ms: Date.now() - startedAt, err: null, kind: textKind });
        else finish({ ok: false, ms: Date.now() - startedAt, err: "empty", kind: textKind });
      }, function (e) {
        finish({ ok: false, ms: Date.now() - startedAt, err: classifyHealthErr(e), kind: textKind });
      });
    });
  }

  // R87 / T02：批量扫描专用入口——成本极高的能力（video / model3d）探针不进「检测全部」自动批量。
  // 对外签名 (modelId, cfgOverride) 与 aiHealthCheck 完全一致；仅向 impl 注入隐藏的 batchScan 标记。
  function aiHealthCheckBatch(modelId, cfgOverride) {
    return aiHealthCheckImpl(modelId, cfgOverride, true);
  }''',
'''      ).then(function (text) {
        if (text) finish({ ok: true, ms: Date.now() - startedAt, err: null });
        else finish({ ok: false, ms: Date.now() - startedAt, err: "empty" });
      }, function (e) {
        finish({ ok: false, ms: Date.now() - startedAt, err: classifyHealthErr(e) });
      });
    });
  }'''))

# P8 AI_SERVICE healthCheckBatch
pairs.append((
'''    healthCheck: aiHealthCheckImpl,
    healthCheckBatch: aiHealthCheckBatch,''',
'''    healthCheck: aiHealthCheckImpl,'''))

# P9 window exposure
pairs.append((
'''    if (typeof window.aiHealthCheck !== "function") window.aiHealthCheck = aiHealthCheckImpl;
    // R87 / T02：批量扫描入口（video / model3d 探针不进「检测全部」）。守卫式挂载，避免全局名冲突。
    if (typeof window.aiHealthCheckBatch !== "function") window.aiHealthCheckBatch = aiHealthCheckBatch;''',
'''    if (typeof window.aiHealthCheck !== "function") window.aiHealthCheck = aiHealthCheckImpl;'''))

with open(cur, "rb") as f:
    data = f.read()

log = []
for i, (new, old) in enumerate(pairs, 1):
    nb = new.encode("utf-8")
    ob = old.encode("utf-8")
    cnt = data.count(nb)
    log.append("P%d: new_occurrences=%d (expect 1)" % (i, cnt))
    if cnt != 1:
        raise SystemExit("ABORT P%d occurrences=%d" % (i, cnt))
    data = data.replace(nb, ob)

with open(bak, "wb") as f:
    f.write(data)

log.append("reconstructed size = %d (expect %d)" % (len(data), EXPECT))
log.append("MATCH = %s" % (len(data) == EXPECT))
with open(os.path.join(ROOT, "tools", "_t02_rebuild_out.txt"), "w", encoding="utf-8") as fo:
    fo.write("\n".join(log))
print("done")
