# -*- coding: utf-8 -*-
import io, os

p = r'D:\下载的文件\学习工作台\assets\hotnews.js'
with io.open(p, encoding='utf-8') as f:
    src = f.read()

# 找到 SOURCES 数组并替换为只有 60秒读懂世界一个源（最稳定）
old_sources_start = "  var SOURCES = ["
old_sources_end = "  ];"

start_idx = src.find(old_sources_start)
end_idx = src.find(old_sources_end, start_idx)

if start_idx < 0 or end_idx < 0:
    print('ERROR: 找不到 SOURCES 数组')
else:
    new_sources = """  var SOURCES = [
    // 唯一数据源：60秒读懂世界（每天 60 条新闻，稳定可用，支持 CORS）
    {
      name: '60秒读懂世界',
      fetch: async function () {
        var res = await nativeFetch('https://60s-api.viki.moe/v2/60s');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var text = await res.text();
        var data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error('JSON解析失败，原始返回前200字: ' + text.substring(0, 200));
        }
        var items = [];
        // 兼容多种返回格式
        var newsArr = null;
        if (data && data.data && Array.isArray(data.data.news)) newsArr = data.data.news;
        else if (data && Array.isArray(data.news)) newsArr = data.news;
        else if (data && Array.isArray(data.data)) newsArr = data.data;
        else if (data && Array.isArray(data.result)) newsArr = data.result;
        else if (Array.isArray(data)) newsArr = data;

        if (newsArr && newsArr.length) {
          newsArr.forEach(function (n) {
            // 元素可能是字符串，也可能是对象
            var t = (typeof n === 'string') ? n : (n && (n.title || n.news || n.content || n.text || '')) || '';
            if (t && t.trim()) items.push({ title: t.trim(), hot: '', url: '' });
          });
        }

        if (!items.length) {
          throw new Error('解析失败，未提取到新闻。返回结构: ' + JSON.stringify(data).substring(0, 200));
        }
        return { ok: true, items: items.slice(0, 60), source: '60秒读懂世界' };
      }
    }
  ];"""

    src = src[:start_idx] + new_sources + src[end_idx + len(old_sources_end):]
    print('FIXED: 简化为只有 60秒读懂世界一个源，加详细调试信息')

with io.open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print()
print('DONE: hotnews.js saved')
