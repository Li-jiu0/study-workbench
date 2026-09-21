# -*- coding: utf-8 -*-
"""R88-M1 补丁 D（前端 assets/ai-service.js）：真实模型名链路。

1) relayChat：请求体补 modelId（opt.modelId）；解析响应头 X-Ai-Model-Used 作为真实模型名。
2) callAI：中转记账改用「真实执行的模型名」；拿不到时如实回落，绝不编造。
行尾 LF（逐字节实测）。
"""
import sys

P = r"D:\下载的文件\学习工作台\assets\ai-service.js"


def read_text(path):
    b = open(path, "rb").read()
    if b.count(b"\r") != 0:
        print("FATAL: 非纯 LF")
        sys.exit(2)
    return b.decode("utf-8")


def write_text(path, text):
    open(path, "wb").write(text.encode("utf-8"))
    b = open(path, "rb").read()
    if b.count(b"\r") != 0:
        print("FATAL: 写回后出现 CR")
        sys.exit(4)
    return len(b)


def rep(text, old, new, label):
    c = text.count(old)
    if c != 1:
        print("FATAL: [%s] 锚点 %d 次" % (label, c))
        sys.exit(3)
    print("OK  [%s]" % label)
    return text.replace(old, new, 1)


t = read_text(P)

# --- 1) relayChat 请求体补 modelId ---
t = rep(
    t,
    "            body: JSON.stringify({\n"
    "              provider: p.id,\n"
    "              messages: messages,\n"
    "              temperature: temperature,\n"
    "              maxTokens: maxTokens\n"
    "            })",
    "            body: JSON.stringify({\n"
    "              provider: p.id,\n"
    "              messages: messages,\n"
    "              temperature: temperature,\n"
    "              maxTokens: maxTokens,\n"
    "              // R88-M1：带上用户选中的模型 id（ai-config.js 的 id），\n"
    "              // 服务端据此解析真实模型名——此前不带导致恒跑 .env 默认模型，\n"
    "              // 表现为「选哪个模型都用同一个」。无选中则不带该字段（保持旧契约）。\n"
    "              modelId: (opt.modelId ? String(opt.modelId) : undefined)\n"
    "            })",
    "relay-body-modelId",
)

# --- 2) relayChat 返回值带上服务端回传的真实模型名 ---
t = rep(
    t,
    "          return { text: full, providerId: p.id, providerName: p.name };",
    "          // R88-M1：读取服务端回传的「实际执行的模型名」（响应头 X-Ai-Model-Used）。\n"
    "          // 跨域（APK）时需服务端 expose_headers 暴露才读得到；读不到就保持空串，\n"
    "          // 由上层如实回落到本地可辨别的名字，绝不编造。\n"
    "          var usedModel = \"\";\n"
    "          try {\n"
    "            if (resp.headers && typeof resp.headers.get === \"function\") {\n"
    "              usedModel = String(resp.headers.get(\"X-Ai-Model-Used\") || \"\");\n"
    "            }\n"
    "          } catch (eH) { usedModel = \"\"; }\n"
    "          return { text: full, providerId: p.id, providerName: p.name, modelUsed: usedModel };",
    "relay-return-modelUsed",
)

# --- 3) callAI 中转记账：改记真实模型名 ---
t = rep(
    t,
    "          var relayStart = Date.now();\n"
    "          var relayed = await relayChat(provs, relayMsgs, tempR, maxTR, opts.onChunk, reqOpts);\n"
    "          xtUsageRecordAuto({\n"
    "            ts: relayStart,\n"
    "            model: (relayed && relayed.providerName) ? String(relayed.providerName) : \"服务端中转\",\n"
    "            modelId: (relayed && relayed.providerId) ? (\"relay:\" + relayed.providerId) : \"relay\",\n"
    "            modelKey: \"relay\",",
    "          var relayStart = Date.now();\n"
    "          // R88-M1：把用户选中的模型 id 透传给中转，服务端据此解析真实模型名\n"
    "          var relayOpts = {};\n"
    "          for (var rk in reqOpts) { if (Object.prototype.hasOwnProperty.call(reqOpts, rk)) relayOpts[rk] = reqOpts[rk]; }\n"
    "          if (selId) relayOpts.modelId = selId;\n"
    "          var relayed = await relayChat(provs, relayMsgs, tempR, maxTR, opts.onChunk, relayOpts);\n"
    "          // 用量明细要显示「实际调用的模型名」：采用服务端回传的真实模型名；\n"
    "          // 拿不到时用本地选中模型的真实模型串（ai-config 的 model 字段）兜底；\n"
    "          // 再拿不到才用可辨别的「平台名」+ 未知标记——始终不伪造『看起来正常』的假名。\n"
    "          var relayUsedModel = (relayed && relayed.modelUsed) ? String(relayed.modelUsed) : \"\";\n"
    "          if (!relayUsedModel && selModel && selModel.model) relayUsedModel = String(selModel.model);\n"
    "          if (!relayUsedModel) {\n"
    "            relayUsedModel = (relayed && relayed.providerName)\n"
    "              ? (String(relayed.providerName) + \"（模型名未知）\")\n"
    "              : \"服务端中转（模型名未知）\";\n"
    "          }\n"
    "          xtUsageRecordAuto({\n"
    "            ts: relayStart,\n"
    "            model: relayUsedModel,\n"
    "            modelId: (relayed && relayed.providerId) ? (\"relay:\" + relayed.providerId) : \"relay\",\n"
    "            modelKey: \"relay\",",
    "callAI-usage-record",
)

n = write_text(P, t)
print("    ai-service.js bytes=%d" % n)
print("PATCH-D(ai-service.js) done.")
