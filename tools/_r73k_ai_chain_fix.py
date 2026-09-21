# -*- coding: utf-8 -*-
# R73k：AI 链路修复包
#  A. vision/autoRoute 首选改 glm-4v-flash（4.6v 限流中）
#  B. seedream fallback 去掉文本模型（null）
#  C. 删硅基 provider + 平台卡 + 自检要求
#  D. ai-service.js 中转错误标记识别（⚠️【中转错误】→ 抛错落直连链）
import ast, io, os, shutil, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = r'D:\下载的文件\学习工作台\assets'

def patch(path, edits, label, guard=3000):
    size0 = os.path.getsize(path)
    assert size0 > guard, '%s 异常(%dB)' % (label, size0)
    shutil.copyfile(path, path + '.bak-pre-r73k')
    with open(path, 'rb') as f:
        t = f.read().decode('utf-8').replace('\r\n', '\n')
    for old, new in edits:
        n = t.count(old)
        assert n >= 1, '%s 锚点未命中: %s' % (label, old[:60])
        t = t.replace(old, new)
    data = t.replace('\n', '\r\n').encode('utf-8')
    with open(path, 'wb') as f:
        f.write(data)
    assert os.path.getsize(path) > size0 * 0.8, '%s 写后体积异常' % label
    print('%s: %d 处替换, %d -> %d B' % (label, len(edits), size0, os.path.getsize(path)))

# ---------- 1) ai-config.js ----------
p = os.path.join(ROOT, 'ai-config.js')
edits = [
    # A. vision 首选 + 自动路由图片识图
    ('autoRoute: {\n    image: "glm-4.6v-flash",',
     'autoRoute: {\n    image: "glm-4v-flash",'),
    ('vision: {\n      desc: "视觉识图",\n      primary: "glm-4.6v-flash",\n      fallback: ["glm-4v-flash"],',
     'vision: {\n      desc: "视觉识图",\n      primary: "glm-4v-flash",\n      fallback: ["glm-4.6v-flash"],'),
    # B. seedream fallback -> null（3 处，逐条带上下文保证精准）
    ('id: "ark-seedream-4-0415",\n      name: "Seedream-4.0",\n      provider: "arkimage",\n      model: "doubao-seedream-4-0-20260415",\n      types: ["imagegen"],\n      tag: "免费",\n      rate: "1x",\n      temperature: 0.7,\n      maxTokens: 1000,\n      fallback: "ark-v4-flash"',
     'id: "ark-seedream-4-0415",\n      name: "Seedream-4.0",\n      provider: "arkimage",\n      model: "doubao-seedream-4-0-20260415",\n      types: ["imagegen"],\n      tag: "免费",\n      rate: "1x",\n      temperature: 0.7,\n      maxTokens: 1000,\n      fallback: null'),
    ('id: "ark-seedream-4-0828",\n      name: "Seedream-4.0-Fast",\n      provider: "arkimage",\n      model: "doubao-seedream-4-0-250828",\n      types: ["imagegen"],\n      tag: "免费",\n      rate: "1x",\n      temperature: 0.7,\n      maxTokens: 1000,\n      fallback: "ark-v4-flash"',
     'id: "ark-seedream-4-0828",\n      name: "Seedream-4.0-Fast",\n      provider: "arkimage",\n      model: "doubao-seedream-4-0-250828",\n      types: ["imagegen"],\n      tag: "免费",\n      rate: "1x",\n      temperature: 0.7,\n      maxTokens: 1000,\n      fallback: null'),
    ('id: "ark-seedream-5-pro",\n      name: "Seedream-5-Pro",\n      provider: "arkimage",\n      model: "doubao-seedream-5-0-pro-260628",\n      types: ["imagegen"],\n      tag: "免费",\n      rate: "1x",\n      temperature: 0.7,\n      maxTokens: 1000,\n      fallback: "ark-v4-flash"',
     'id: "ark-seedream-5-pro",\n      name: "Seedream-5-Pro",\n      provider: "arkimage",\n      model: "doubao-seedream-5-0-pro-260628",\n      types: ["imagegen"],\n      tag: "免费",\n      rate: "1x",\n      temperature: 0.7,\n      maxTokens: 1000,\n      fallback: null'),
    # C1. 删硅基 provider 块
    ('    siliconflow: {\n      name: "硅基流动",\n      apiUrl: "https://api.siliconflow.cn/v1/chat/completions",\n      apiKey: "***REMOVED-BY-R2C***"\n    },\n',
     '    // R73k：硅基流动 provider 已移除（欠费 402 且前端 models 为空，保留只会误导排查）\n'),
    # C2. 删平台卡
    ('    {\n      key: "siliconflow",\n      label: "硅基流动",\n      builtin: true,\n      apiUrl: "https://api.siliconflow.cn/v1/chat/completions",\n      apiFormat: "openai",\n      needKey: false,\n      note: "",\n      models: [],\n    },\n',
     ''),
    # C3. 自检不再要求 siliconflow
    ('  // 1) providers：对象，且 zhipu / siliconflow 均有非空 apiUrl + apiKey',
     '  // 1) providers：对象，且 zhipu 有非空 apiUrl + apiKey（R73k：硅基已移除，不再要求）'),
    ('  } else if (!providerOk(providers, "zhipu") || !providerOk(providers, "siliconflow")) {',
     '  } else if (!providerOk(providers, "zhipu")) {'),
    # 注释更新
    ('  // 硅基流动全部模型 402 欠费已清空，provider 配置保留，待换 key 后恢复；seedream 图片模型走 arkimage（images/generations），调用链路待评估。',
     '  // R73k：硅基流动已整体移除（provider/平台卡/自检）；seedream 图片模型走 arkimage（images/generations），失败不再降级文本模型。'),
]
patch(p, edits, 'ai-config.js')

# ---------- 2) ai-page.js（镜像表同步） ----------
p2 = os.path.join(ROOT, 'ai-page.js')
edits2 = [
    ("{ id: 'ark-seedream-4-0415', name: 'Seedream-4.0', provider: 'arkimage', model: 'doubao-seedream-4-0-20260415', types: ['imagegen'], tag: null, fallback: 'ark-v4-flash' },",
     "{ id: 'ark-seedream-4-0415', name: 'Seedream-4.0', provider: 'arkimage', model: 'doubao-seedream-4-0-20260415', types: ['imagegen'], tag: null, fallback: null },"),
    ("{ id: 'ark-seedream-4-0828', name: 'Seedream-4.0-Fast', provider: 'arkimage', model: 'doubao-seedream-4-0-250828', types: ['imagegen'], tag: null, fallback: 'ark-v4-flash' },",
     "{ id: 'ark-seedream-4-0828', name: 'Seedream-4.0-Fast', provider: 'arkimage', model: 'doubao-seedream-4-0-250828', types: ['imagegen'], tag: null, fallback: null },"),
    ("{ id: 'ark-seedream-5-pro', name: 'Seedream-5-Pro', provider: 'arkimage', model: 'doubao-seedream-5-0-pro-260628', types: ['imagegen'], tag: null, fallback: 'ark-v4-flash' }",
     "{ id: 'ark-seedream-5-pro', name: 'Seedream-5-Pro', provider: 'arkimage', model: 'doubao-seedream-5-0-pro-260628', types: ['imagegen'], tag: null, fallback: null }"),
]
patch(p2, edits2, 'ai-page.js')

# ---------- 3) ai-service.js 中转错误标记识别 ----------
p3 = os.path.join(ROOT, 'ai-service.js')
MARK = '⚠️【中转错误】'
edits3 = [
    # 流式：判定窗口内识别标记（在 HTML 判定后追加）
    ('''        if (!htmlChecked) {
          if (looksLikeHtml(full)) {
            throw makeError(nonJsonMessage(respStatus(resp), respCtype(resp), full), respStatus(resp), "NON_JSON");
          }
          if (full.length < GUARD_LEN) continue;
          htmlChecked = true;
        }''',
     '''        if (!htmlChecked) {
          if (looksLikeHtml(full)) {
            throw makeError(nonJsonMessage(respStatus(resp), respCtype(resp), full), respStatus(resp), "NON_JSON");
          }
          // R73k：中转上游故障标记（ai.py 对 402/401/429 等统一加前缀）→ 抛错走直连链，不当答案吐出
          if (full.indexOf("''' + MARK + '''") === 0) {
            throw makeError(full, 502, "RELAY_UPSTREAM");
          }
          if (full.length < GUARD_LEN) continue;
          htmlChecked = true;
        }'''),
    # 流式：窗口内收尾的短文本分支
    ('''      if (!htmlChecked) {
        // 响应体不足判定窗口：收尾时再判定一次；短文本正常吐出，HTML 则抛错
        if (looksLikeHtml(full)) {
          throw makeError(nonJsonMessage(respStatus(resp), respCtype(resp), full), respStatus(resp), "NON_JSON");
        }
        if (full) emit(full, full);
      }''',
     '''      if (!htmlChecked) {
        // 响应体不足判定窗口：收尾时再判定一次；短文本正常吐出，HTML 则抛错
        if (looksLikeHtml(full)) {
          throw makeError(nonJsonMessage(respStatus(resp), respCtype(resp), full), respStatus(resp), "NON_JSON");
        }
        if (full.indexOf("''' + MARK + '''") === 0) {
          throw makeError(full, 502, "RELAY_UPSTREAM");
        }
        if (full) emit(full, full);
      }'''),
    # 非流式整段读取
    ('''    // R72：整段读取到 HTML 错误页时同样不当作答案文本
    if (looksLikeHtml(text)) {
      throw makeError(nonJsonMessage(respStatus(resp), respCtype(resp), text), respStatus(resp), "NON_JSON");
    }
    if (text && emit) emit(text, text);''',
     '''    // R72：整段读取到 HTML 错误页时同样不当作答案文本
    if (looksLikeHtml(text)) {
      throw makeError(nonJsonMessage(respStatus(resp), respCtype(resp), text), respStatus(resp), "NON_JSON");
    }
    // R73k：中转上游故障标记 → 抛错走直连链
    if (text.indexOf("''' + MARK + '''") === 0) {
      throw makeError(text, 502, "RELAY_UPSTREAM");
    }
    if (text && emit) emit(text, text);'''),
]
patch(p3, edits3, 'ai-service.js')

# node --check
import subprocess
NODE = r'C:\Users\ATM\.workbuddy\binaries\node\versions\22.22.2-3\node.exe'
for f in ['ai-config.js', 'ai-page.js', 'ai-service.js']:
    r = subprocess.run([NODE, '--check', os.path.join(ROOT, f)], capture_output=True)
    print('node --check %s rc=%d %s' % (f, r.returncode, r.stderr.decode('utf-8', 'replace')[:200]))
