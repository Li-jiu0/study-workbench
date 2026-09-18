# -*- coding: utf-8 -*-
"""R93-1: ai-settings.js 功能分类增加「梯子」分组（纯渲染层，不改 ai-config.js）。
二进制安全编辑 + 计数校验 + 读回验证。任何 old 计数 != 预期 => ABORT 不写盘。"""
import sys, traceback

RES = []
def log(s):
    RES.append(s)

try:
    P = 'assets/ai-settings.js'
    raw = open(P, 'rb').read()
    orig_len = len(raw)
    crlf = raw.count(b'\r\n')
    lone_lf = raw.count(b'\n') - crlf
    lone_cr = raw.count(b'\r') - crlf
    log('BEFORE bytes=%d crlf=%d loneLF=%d loneCR=%d' % (orig_len, crlf, lone_lf, lone_cr))
    if crlf != 0 or lone_cr != 0:
        log('ABORT: not pure LF')
        raise SystemExit

    src = raw.decode('utf-8')

    def rep(old, new, expect, tag):
        n = src.count(old)
        log('%s old_count=%d expect=%d' % (tag, n, expect))
        if n != expect:
            log('ABORT at %s' % tag)
            raise SystemExit
        return src.replace(old, new)

    # ---------- E1: proxyModelsList 助手（插在 familyGroupsHtml 注释块前） ----------
    a1 = ("  /* R87：按 FAMILY_ORDER 分组渲染内置分类（6 组，空组不渲染）。\n"
          "     某组「既无候选模型、又无用户配置链」时整组标题与卡片都不渲染。 */\n"
          "  function familyGroupsHtml() {")
    e1 = ("  /* R93：需要梯子（海外代理）的模型清单——渲染层按 provider 推导，不改 ai-config.js。\n"
          "     needVPN（模型级或平台级）与 needProxy（平台级）任一命中即入组。 */\n"
          "  function proxyModelsList() {\n"
          "    var all = allModelsList();\n"
          "    var out = [];\n"
          "    for (var i = 0; i < all.length; i++) {\n"
          "      if (isNeedVPN(all[i]) || providerNeedProxy(all[i])) { out.push(all[i]); }\n"
          "    }\n"
          "    return out;\n"
          "  }\n"
          "\n"
          "  /* R87：按 FAMILY_ORDER 分组渲染内置分类（6 组，空组不渲染）。\n"
          "     某组「既无候选模型、又无用户配置链」时整组标题与卡片都不渲染。 */\n"
          "  function familyGroupsHtml() {")
    src = rep(a1, e1, 1, 'E1')

    # ---------- E2: familyGroupsHtml 尾部追加「梯子」组（空组不渲染） ----------
    a2 = ("      for (ci = 0; ci < famCats.length; ci++) {\n"
          "        html += catCardHtml({ key: famCats[ci].key, label: famCats[ci].label, custom: false });\n"
          "      }\n"
          "      html += '</div>';\n"
          "    }\n"
          "    return html;\n"
          "  }")
    e2 = ("      for (ci = 0; ci < famCats.length; ci++) {\n"
          "        html += catCardHtml({ key: famCats[ci].key, label: famCats[ci].label, custom: false });\n"
          "      }\n"
          "      html += '</div>';\n"
          "    }\n"
          "    /* R93：「梯子」组——归拢所有需科学上网（海外代理）才能用的模型。\n"
          "       与内置 6 族同层级渲染在功能分类 Tab；仅展示不参与路由，空组不渲染。 */\n"
          "    var proxyM = proxyModelsList();\n"
          "    if (proxyM.length) {\n"
          "      html += '<div class=\"xt-set-group\"><div class=\"xt-set-group-h\">梯子' +\n"
          "        '<span class=\"xt-set-group-count\">' + proxyM.length + '</span></div>';\n"
          "      html += '<div class=\"xt-set-card\">';\n"
          "      html += '<div class=\"xt-set-card-h\"><div class=\"xt-set-card-t\">需要梯子的模型</div>' +\n"
          "        '<div class=\"xt-set-card-key\">proxy</div></div>';\n"
          "      html += '<div class=\"xt-set-card-desc\">以下模型所属平台在境内需科学上网（海外代理）才能访问，按平台归拢展示</div>';\n"
          "      html += '<div class=\"xt-cat-pool\">';\n"
          "      for (var pi = 0; pi < proxyM.length; pi++) {\n"
          "        var pm = proxyM[pi];\n"
          "        html += '<span class=\"xt-cat-addchip\" style=\"cursor:default;\">' + esc(displayName(pm.id, pm)) +\n"
          "          ' · ' + esc(providerNameOf(pm.id)) + ' ' + vpnBadge(pm) + '</span>';\n"
          "      }\n"
          "      html += '</div></div></div>';\n"
          "    }\n"
          "    return html;\n"
          "  }")
    src = rep(a2, e2, 1, 'E2')

    # ---------- E3: modelInCategory 支持 catKey==='proxy'（排序弹窗筛选复用） ----------
    a3 = ("  function modelInCategory(id, catKey) {\n"
          "    if (!catKey) { return true; }                    // 未选分类 -> 全部匹配\n"
          "    var m = findAnyModel(id);\n"
          "    if (!m) { return false; }\n"
          "    var t = typeKeysOf(m);")
    e3 = ("  function modelInCategory(id, catKey) {\n"
          "    if (!catKey) { return true; }                    // 未选分类 -> 全部匹配\n"
          "    var m = findAnyModel(id);\n"
          "    if (!m) { return false; }\n"
          "    if (catKey === 'proxy') {                        // R93：梯子 = 平台需代理\n"
          "      return isNeedVPN(m) || providerNeedProxy(m);\n"
          "    }\n"
          "    var t = typeKeysOf(m);")
    src = rep(a3, e3, 1, 'E3')

    # ---------- E4: catLabelOf 支持 proxy -> 梯子 ----------
    a4 = ("  function catLabelOf(key) {\n"
          "    for (var i = 0; i < BUILTIN_CATS.length; i++) {")
    e4 = ("  function catLabelOf(key) {\n"
          "    if (key === 'proxy') { return '梯子'; }          // R93：梯子筛选显示名\n"
          "    for (var i = 0; i < BUILTIN_CATS.length; i++) {")
    src = rep(a4, e4, 1, 'E4')

    # ---------- E5: sortByCategory 在 catKey==='proxy' 时按需代理判定归组 ----------
    a5 = ("    var ids = availableIds();\n"
          "    ids.sort(function (a, b) {\n"
          "      var ca = catKeyOfModel(a);\n"
          "      var cb = catKeyOfModel(b);")
    e5 = ("    var ids = availableIds();\n"
          "    var useProxy = (catKey === 'proxy');             // R93：梯子排序按平台代理判定\n"
          "    ids.sort(function (a, b) {\n"
          "      var ca = useProxy ? (modelInCategory(a, 'proxy') ? 'proxy' : '') : catKeyOfModel(a);\n"
          "      var cb = useProxy ? (modelInCategory(b, 'proxy') ? 'proxy' : '') : catKeyOfModel(b);")
    src = rep(a5, e5, 1, 'E5')

    # ---------- E6: 排序弹窗分类下拉追加「梯子」optgroup（无梯子模型则不加） ----------
    a6 = ("      if (opts) {\n"
          "        html += '<optgroup label=\"' + esc(FAMILY_LABEL[fam] || fam) + '\">' + opts + '</optgroup>';\n"
          "      }\n"
          "    }\n"
          "    sel.innerHTML = html;")
    e6 = ("      if (opts) {\n"
          "        html += '<optgroup label=\"' + esc(FAMILY_LABEL[fam] || fam) + '\">' + opts + '</optgroup>';\n"
          "      }\n"
          "    }\n"
          "    /* R93：「梯子」筛选项——存在需代理模型时才追加，与功能分类 Tab 空组不渲染同口径 */\n"
          "    if (proxyModelsList().length) {\n"
          "      html += '<optgroup label=\"梯子\"><option value=\"proxy\">梯子（需科学上网）</option></optgroup>';\n"
          "    }\n"
          "    sel.innerHTML = html;")
    src = rep(a6, e6, 1, 'E6')

    # ---------- E7: 功能分类 Tab 底部说明文案提及梯子组 ----------
    a7 = ("    html += '<div class=\"xt-set-note\">内置 12 类按能力分组（文本 / 视觉 / 语音 / 检索 / 视频 / 3D），' +\n"
          "      '每组按声明顺序展示并各自维护优先级链；「作文批改」等更多分类可自行新建，新建分类即新的功能路由槽。</div>';")
    e7 = ("    html += '<div class=\"xt-set-note\">内置 12 类按能力分组（文本 / 视觉 / 语音 / 检索 / 视频 / 3D），' +\n"
          "      '每组按声明顺序展示并各自维护优先级链；「梯子」组归拢所有需科学上网的海外平台模型；' +\n"
          "      '「作文批改」等更多分类可自行新建，新建分类即新的功能路由槽。</div>';")
    src = rep(a7, e7, 1, 'E7')

    out = src.encode('utf-8')
    open(P, 'wb').write(out)

    # ---------- readback ----------
    rb = open(P, 'rb').read()
    crlf2 = rb.count(b'\r\n')
    lone_lf2 = rb.count(b'\n') - crlf2
    lone_cr2 = rb.count(b'\r') - crlf2
    log('AFTER bytes=%d (delta=%d) crlf=%d loneLF=%d loneCR=%d' %
        (len(rb), len(rb) - orig_len, crlf2, lone_lf2, lone_cr2))
    txt = rb.decode('utf-8')
    checks = [
        ('proxyModelsList def', txt.count('function proxyModelsList()') == 1),
        ('proxyModelsList calls', txt.count('proxyModelsList()') == 3),  # E2+E6 两处调用 + 无其他
        ('family proxy group', txt.count("xt-set-group-h\">梯子'") == 1),
        ('modelInCategory proxy', txt.count("catKey === 'proxy'") == 3),  # E3/E5 判定
        ('catLabelOf proxy', txt.count("return '梯子'; }          // R93") == 1),
        ('sortcat optgroup', txt.count('optgroup label="梯子"') == 1),
        ('note updated', txt.count('「梯子」组归拢所有需科学上网的海外平台模型') == 1),
        ('ES2017: no optional-chain ?.', txt.count('?.') == 0),
        ('ES2017: no ??', txt.count('??') == 0),
        ('ES2017: no replaceAll(', txt.count('.replaceAll(') == 0),
        ('ES2017: no .at(', txt.count('.at(') == 0),
        ('ES2017: no catch{', txt.count('catch{') == 0),
        ('ES2017: no backtick', txt.count('`') == 0),
    ]
    ok = True
    for name, v in checks:
        log('CHECK %s => %s' % (name, 'PASS' if v else 'FAIL'))
        if not v:
            ok = False
    log('RESULT=%s' % ('PASS' if ok else 'FAIL'))
except SystemExit:
    pass
except Exception:
    log('EXCEPTION:\n' + traceback.format_exc())

open('tools/qa/_r93_edit.txt', 'w', encoding='utf-8').write('\n'.join(RES))
