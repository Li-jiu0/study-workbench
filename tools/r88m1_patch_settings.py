# -*- coding: utf-8 -*-
"""R88-M1 补丁 E（前端 assets/ai-settings.js）：需求1 R88-C 按功能分类联动过滤。

现状：setSortCatInner 只改排序键（sortByCategory 把选中分类的模型排最前，其余随后），
      列表内容不变 -> 不满足「只展示匹配模型、隐藏其他」。

升级（本次）：
  1) 新增 modelInCategory(id, catKey) 判定：任一 type 经 CAT_OF_TYPE 映到 catKey 即匹配。
  2) 新增 activeCatFilter()：读 settings.lastSort.catKey 作为「当前筛选分类」。
  3) renderModels()：在渲染期跳过「不匹配当前筛选分类」的模型（视图层过滤，绝不删数据）。
  4) sortByCategory(catKey)：切分类后列表实时刷新（已 renderModels，天然生效）+ 文案更新。
  5) 新增 clearCatFilter()：清除筛选恢复全部（数据一直在，立即恢复）。
  6) 叠加关系：与 R87「不可用自动隐藏」(hideUnavailable/health) 取【交集】——
     renderModels 先按分类过滤，再按既有不可用/停用规则渲染（互不覆盖）；
     AI 页侧由 ai-page.js 的 isHiddenByCategory 在健康过滤之后二次过滤（交集）。
  7) 弹窗 UI：新增「仅显示该分类模型」提示条 + 「清除分类筛选」按钮（data-sort-act="catclear"）。

行尾 LF（逐字节实测）。
"""
import sys

P = r"D:\下载的文件\学习工作台\assets\ai-settings.js"


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

# --- 1) 新增判据 + 当前筛选读取 + 清除（插在 catKeyOfModel 之前）---
t = rep(
    t,
    "  /* R87：模型 -> 首个可映射的内置分类 key（无则空串） */\n"
    "  function catKeyOfModel(id) {",
    "  /* R88-M1（R88-C）：模型是否属于某功能分类——任一 type 经 CAT_OF_TYPE 映到该分类即匹配。\n"
    "     自定义分类（不在 CAT_OF_TYPE 值域内）视为「无能力映射」，一律不匹配，避免误隐藏。 */\n"
    "  function modelInCategory(id, catKey) {\n"
    "    if (!catKey) { return true; }                    // 未选分类 -> 全部匹配\n"
    "    var m = findAnyModel(id);\n"
    "    if (!m) { return false; }\n"
    "    var t = typeKeysOf(m);\n"
    "    for (var i = 0; i < t.length; i++) {\n"
    "      if (CAT_OF_TYPE[t[i]] === catKey) { return true; }\n"
    "    }\n"
    "    return false;\n"
    "  }\n"
    "\n"
    "  /* R88-M1：当前生效的分类筛选（来自排序弹窗选择，持久化在 lastSort.catKey）。\n"
    "     空串 = 不筛选（全部显示）。只读，不改数据。 */\n"
    "  function activeCatFilter() {\n"
    "    return normLastSort(getSettings().lastSort).catKey || '';\n"
    "  }\n"
    "\n"
    "  /* R88-M1：清除分类筛选（恢复显示全部；数据从未删除，立即恢复） */\n"
    "  function clearCatFilter() {\n"
    "    saveLastSort(getSettings().lastSort && getSettings().lastSort.mode || '', '', '');\n"
    "    renderModels();\n"
    "    renderSortPreview();\n"
    "    restoreSortUI();\n"
    "    toast('success', '已清除分类筛选，显示全部模型');\n"
    "  }\n"
    "\n"
    "  /* R87：模型 -> 首个可映射的内置分类 key（无则空串） */\n"
    "  function catKeyOfModel(id) {",
    "helpers",
)

# --- 2) renderModels：渲染期按当前分类筛选（与不可用隐藏取交集，互不覆盖）---
t = rep(
    t,
    "    var kw = fieldVal('setModelSearch').toLowerCase().trim();\n"
    "    var selId = getSelectedModelId();\n"
    "    var html = '';\n"
    "    var shown = 0;\n"
    "    for (var i = 0; i < list.length; i++) {\n"
    "      if (!matchModel(list[i], list[i].id, kw)) { continue; }\n"
    "      html += modelRowHtml(list[i], selId);\n"
    "      shown++;\n"
    "    }\n"
    "    if (!shown) { host.innerHTML = '<div class=\"xt-set-empty\">没有匹配的模型</div>'; return; }\n"
    "    host.innerHTML = html;\n"
    "  }",
    "    var kw = fieldVal('setModelSearch').toLowerCase().trim();\n"
    "    var selId = getSelectedModelId();\n"
    "    // R88-M1（R88-C）：按当前功能分类筛选——与「不可用自动隐藏」是【交集】关系：\n"
    "    //   先按分类跳过不匹配者（本条，由用户选择驱动），\n"
    "    //   行内仍照旧渲染停用/不可用态（R87 健康态，由健康检查驱动），两者互不覆盖。\n"
    "    //   纯渲染期过滤：不写 disabled、不删 catModels/overrides，切回立即恢复。\n"
    "    var catFilter = activeCatFilter();\n"
    "    var html = '';\n"
    "    var shown = 0;\n"
    "    var catHidden = 0;\n"
    "    for (var i = 0; i < list.length; i++) {\n"
    "      if (!matchModel(list[i], list[i].id, kw)) { continue; }\n"
    "      if (!modelInCategory(list[i].id, catFilter)) { catHidden++; continue; }\n"
    "      html += modelRowHtml(list[i], selId);\n"
    "      shown++;\n"
    "    }\n"
    "    var banner = catFilter\n"
    "      ? ('<div class=\"xt-set-catfilter\">仅显示「' + esc(catLabelOf(catFilter)) +\n"
    "         '」分类的模型（已按分类隐藏 ' + catHidden + ' 个；数据未删除，切换即恢复）' +\n"
    "         '<button type=\"button\" class=\"xt-set-btn\" data-sort-act=\"catclear\" style=\"margin-left:8px;\">显示全部</button></div>')\n"
    "      : '';\n"
    "    if (!shown) {\n"
    "      var emptyMsg = catFilter\n"
    "        ? ('「' + esc(catLabelOf(catFilter)) + '」分类下暂无匹配模型')\n"
    "        : '没有匹配的模型';\n"
    "      host.innerHTML = banner + '<div class=\"xt-set-empty\">' + emptyMsg + '</div>';\n"
    "      return;\n"
    "    }\n"
    "    host.innerHTML = banner + html;\n"
    "  }",
    "renderModels-filter",
)

# --- 3) sortByCategory：切分类后实时刷新 + 文案体现筛选 ---
t = rep(
    t,
    "    saveLastSort('cat', catKey || '', '');\n"
    "    renderModels();\n"
    "    renderSortPreview();\n"
    "    toast('success', '已按功能分类排序（' + catLabelOf(catKey) + '，' + ids.length + ' 个）');",
    "    saveLastSort('cat', catKey || '', '');\n"
    "    // R88-M1：切分类 -> 列表实时更新（renderModels 按 activeCatFilter 过滤）；\n"
    "    // 传入空串表示清除筛选，显示全部。\n"
    "    renderModels();\n"
    "    renderSortPreview();\n"
    "    toast('success', catKey\n"
    "      ? ('仅显示「' + catLabelOf(catKey) + '」分类的可用模型')\n"
    "      : ('已清除分类筛选，显示全部模型（' + ids.length + ' 个）'));",
    "sortByCategory-toast",
)

# --- 4) 弹窗事件：新增 catclear 分支 ---
t = rep(
    t,
    "      else if (act === 'map') { mapToAiList(); }\n"
    "      else if (act === 'reset') { restoreDefaults(); }",
    "      else if (act === 'map') { mapToAiList(); }\n"
    "      else if (act === 'catclear') { clearCatFilter(); }\n"
    "      else if (act === 'reset') { restoreDefaults(); }",
    "bind-catclear",
)

# --- 5) mapToAiList：映射到 AI 页时也尊重分类筛选（只映射匹配分类的可用模型）---
t = rep(
    t,
    "    var s = getSettings();\n"
    "    var ids = usableIds();                       // R87：只映射「检测可用」的模型\n"
    "    var all = fullOrderIds();\n"
    "    var mapped = [];\n"
    "    var i, id, m, nm, ov;",
    "    var s = getSettings();\n"
    "    var catFilter = activeCatFilter();\n"
    "    // R88-M1（R88-C）：映射到 AI 页时同样尊重分类筛选——只映射「匹配当前分类」且\n"
    "    // 「检测可用」的模型（分类与健康两条件取交集）；未选分类时等价于原行为。\n"
    "    var ids = [];\n"
    "    var allUsable = usableIds();\n"
    "    for (var u = 0; u < allUsable.length; u++) {\n"
    "      if (modelInCategory(allUsable[u], catFilter)) { ids.push(allUsable[u]); }\n"
    "    }\n"
    "    var all = fullOrderIds();\n"
    "    var mapped = [];\n"
    "    var i, id, m, nm, ov;",
    "mapToAiList-filter",
)

t = rep(
    t,
    "    toast('success', '已映射到 AI 页模型下拉（' + ids.length + ' 个检测可用模型的名称与顺序）');",
    "    toast('success', catFilter\n"
    "      ? ('已映射「' + catLabelOf(catFilter) + '」分类的 ' + ids.length + ' 个可用模型到 AI 页')\n"
    "      : ('已映射到 AI 页模型下拉（' + ids.length + ' 个检测可用模型的名称与顺序）'));",
    "mapToAiList-toast",
)

n = write_text(P, t)
print("    ai-settings.js bytes=%d" % n)
print("PATCH-E(ai-settings.js) done.")
