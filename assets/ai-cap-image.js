/* =============================================================
 * 能力模块：生图（text-to-image / image-edit）
 * -------------------------------------------------------------
 * 端点：POST /v1/images/generations
 * 实测结论（2026-09-18）：
 *   - 响应体里「没有 usage 字段」，生图是按张计费，不是按 token
 *   - 张数取 data[] 长度（images[] 与 data[] 同时存在且一致，优先 data）
 *   - 返回的图片是 S3 预签名公网地址，X-Amz-Expires=3600，「1 小时后失效」，
 *     所以历史记录不能只存 URL（由调用方负责落库/转存）
 *   - image_size 与 size 两种参数名平台都接受，这里统一用 image_size
 * 约束：ES2017，不弹 alert/confirm/prompt
 * ============================================================= */
(function (global) {
  'use strict';
  var R = global.XT_AI_CAPS;
  var DEFAULT_SIZE = '1024x1024';

  var CAP = {
    key: 'imagegen',
    label: '生图',
    types: ['imagegen'],
    urlField: 'imageUrl',
    // 兜底顺序很关键：provider 上有 imageUrl 就用它（硅基）；
    // 没有则退到 imageApiUrl；再没有才用 apiUrl（arkimage 这条 provider 的 apiUrl
    // 本身就是 images/generations 端点，这样老的生图链路不用改也能继续用）。
    legacyKeys: ['imageApiUrl', 'apiUrl'],
    defaultUrl: 'https://api.siliconflow.cn/v1/images/generations',
    timeout: 60000,
    // 图片编辑：当前免费清单里没有 edit 模型，结构先留好，available 标 false
    modes: [
      { id: 't2i', label: '文生图', available: true, needImage: false },
      { id: 'edit', label: '图片编辑', available: false, needImage: true }
    ],
    defaultMode: 't2i',

    build: function (ctx) {
      var input = ctx.input || {};
      var mode = input.mode || 't2i';
      var size = input.size || (ctx.modelCfg && ctx.modelCfg.imageSize) || DEFAULT_SIZE;
      var body = { model: ctx.modelCfg.model, prompt: String(input.prompt || '') };
      if (mode === 'edit') {
        body.image = input.imageDataUrl || '';
        body.image_size = size;
      } else {
        body.image_size = size;
        body.batch_size = Number(input.batch) || 1;
      }
      return {
        url: R.endpoint(CAP, ctx.provider),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        meta: { mode: mode, size: size }
      };
    },

    parse: function (json, ctx) {
      var meta = (ctx && ctx.meta) || {};
      var arr = null;
      if (json && json.data && json.data.length) arr = json.data;
      else if (json && json.images && json.images.length) arr = json.images;
      if (!arr) return { ok: false, err: R.errText(json, '生图响应里没有图片地址') };

      var urls = [];
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] && arr[i].url) urls.push(String(arr[i].url));
      }
      if (!urls.length) return { ok: false, err: R.errText(json, '生图响应里没有图片地址') };

      return {
        ok: true,
        result: { urls: urls, size: meta.size || DEFAULT_SIZE, mode: meta.mode || 't2i' },
        usage: R.usage({
          kind: 'imagegen',
          n: urls.length,                 // 张数来自响应体 data[] 长度，不是写死的 1
          size: meta.size || DEFAULT_SIZE
        })
      };
    }
  };

  // 说明（T01/R87）：本模块【不提供 cap.probe】。
  // 原因：ai-service.js 的健康检查已内置生图专用分支（isImageGenModel → images/generations
  //       最小 prompt，超时 60s），cap 侧再实现一套会与它漂移，故此处刻意不重复。
  // 若将来该分支被移除，再在此补 probe（打 images/generations 最小 prompt）。
  R.register(CAP);
})(window);
