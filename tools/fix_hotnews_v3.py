# -*- coding: utf-8 -*-
import io, os

p = r'D:\下载的文件\学习工作台\assets\hotnews.js'
with io.open(p, encoding='utf-8') as f:
    src = f.read()

# 替换整个 SOURCES 数组，修复 60秒读懂世界的字符串数组解析，加更多稳定源
old_sources_start = "  var SOURCES = ["
old_sources_end = "  ];"

# 找到 SOURCES 数组的起止位置
start_idx = src.find(old_sources_start)
end_idx = src.find(old_sources_end, start_idx)

if start_idx < 0 or end_idx < 0:
    print('ERROR: 找不到 SOURCES 数组')
else:
    new_sources = """  var SOURCES = [
    // 源1：60秒读懂世界（每天 60 条新闻，最稳定，支持 CORS）
    {
      name: '60秒读懂世界',
      fetch: async function () {
        var res = await nativeFetch('https://60s-api.viki.moe/v2/60s');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        var items = [];
        // 兼容多种返回格式：data.data.news / data.news / data.data
        var newsArr = null;
        if (data.data && Array.isArray(data.data.news)) newsArr = data.data.news;
        else if (Array.isArray(data.news)) newsArr = data.news;
        else if (Array.isArray(data.data)) newsArr = data.data;
        else if (Array.isArray(data.result)) newsArr = data.result;
        if (newsArr) {
          newsArr.forEach(function (n) {
            // 关键修复：元素可能是字符串，也可能是对象
            var t = (typeof n === 'string') ? n : (n.title || n.news || n.content || n.text || '');
            if (t) items.push({ title: t, hot: '', url: '' });
          });
        }
        if (!items.length) throw new Error('解析失败，返回格式: ' + JSON.stringify(data).substring(0, 150));
        return { ok: true, items: items.slice(0, 60), source: '60秒读懂世界' };
      }
    },
    // 源2：每日热榜（聚合多个平台热榜）
    {
      name: '每日热榜',
      fetch: async function () {
        var res = await nativeFetch('https://api.oioweb.cn/api/common/HotList');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        var items = [];
        var list = data.data || data.result || data.list || [];
        if (Array.isArray(list)) {
          list.forEach(function (n) {
            var t = (typeof n === 'string') ? n : (n.title || n.name || n.word || '');
            if (t) items.push({ title: t, hot: n.hot || n.heat || '', url: n.url || n.link || '' });
          });
        }
        if (!items.length) throw new Error('解析失败');
        return { ok: true, items: items.slice(0, 30), source: '每日热榜' };
      }
    },
    // 源3：知乎热榜（镜像 API）
    {
      name: '知乎热榜',
      fetch: async function () {
        var res = await nativeFetch('https://api.zhihu.com/topstory/hot-list?limit=30');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        var items = [];
        var list = data.data || [];
        if (Array.isArray(list)) {
          list.forEach(function (n) {
            var t = (n.target && n.target.title) || n.title || '';
            if (t) items.push({ title: t, hot: (n.target && n.target.heat) || '', url: (n.target && n.target.url) || '' });
          });
        }
        if (!items.length) throw new Error('解析失败');
        return { ok: true, items: items.slice(0, 30), source: '知乎热榜' };
      }
    }
  ];"""

    src = src[:start_idx] + new_sources + src[end_idx + len(old_sources_end):]
    print('FIXED: 替换 SOURCES 数组，修复字符串数组解析，加 3 个稳定源')

with io.open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print()
print('DONE: hotnews.js saved')
