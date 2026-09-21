// 桩 XHR，捕获 translate.probe 实际使用的 URL（不发真实请求）
global.window = {};
var captured = [];
global.XMLHttpRequest = function () {
  this.open = function (m, u) { captured.push({ method: m, url: u }); };
  this.setRequestHeader = function () {};
  this.send = function () {};
  this.abort = function () {};
};
require('../assets/ai-cap-registry.js');
require('../assets/ai-cap-translate.js');

var cap = window.XT_AI_CAPS.get('translate');
var out = [];

// case A: siliconflow（无 responsesUrl）+ sf-hunyuan-mt-7b
var provSF = {
  apiUrl: "https://api.siliconflow.cn/v1/chat/completions",
  apiKey: "sk-test",
  imageUrl: "https://api.siliconflow.cn/v1/images/generations",
  audioUrl: "https://api.siliconflow.cn/v1/audio/transcriptions",
  embedUrl: "https://api.siliconflow.cn/v1/embeddings",
  rerankUrl: "https://api.siliconflow.cn/v1/rerank"
};
var mcSF = { id: "sf-hunyuan-mt-7b", model: "tencent/Hunyuan-MT-7B", provider: "siliconflow", types: ["general", "translate"] };
cap.probe({ modelCfg: mcSF, provider: provSF, timeout: 5000 });
out.push("CASE A (siliconflow, 无 responsesUrl, sf-hunyuan-mt-7b) => " + (captured.length ? captured[captured.length - 1].method + " " + captured[captured.length - 1].url : "NONE"));

// case B: 显式配置 responsesUrl 的 provider
var provARK = { apiUrl: "https://ark.cn-beijing.volces.com/api/v3/chat/completions", apiKey: "ark-x", responsesUrl: "https://ark.cn-beijing.volces.com/api/v3/responses" };
var mcARK = { id: "ark-mt", model: "doubao-seed-translation-250915", provider: "ark2", types: ["translate"] };
cap.probe({ modelCfg: mcARK, provider: provARK, timeout: 5000 });
out.push("CASE B (provider 配了 responsesUrl, 专用翻译模型) => " + (captured.length ? captured[captured.length - 1].method + " " + captured[captured.length - 1].url : "NONE"));

require('fs').writeFileSync('tools/_r87_translate_probe_result.txt', out.join("\n") + "\n");
process.exit(0);
