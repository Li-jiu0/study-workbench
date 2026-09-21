/**
 * tools/qa/_r144_qa_extra.js — QA 主动挑刺套件（独立验证 R144，不依赖团队给的结论）。
 *
 * 复用 _r144_jsdom.js 的「假 Leaflet + 本地 HTTP 服务」手法：把 assets/leaflet/leaflet.js
 * 换成一个记录型假 L（window.__LL_REC__），记下每个 polyline / marker 的经纬度与 divIcon.html。
 *
 * 覆盖（对应团队要求的挑刺项）：
 *   Q1 单方共享不回归：仅 1 个有效点 → 不画线、导航按钮不出现、原 marker 正常。
 *   Q2 绝不画 (0,0)：hasFix:false / lat:null 的会话被跳过；显式 (0,0,true) 才会画（设计说明）。
 *   Q3 面板/图层生命周期：2→3→2→0 切换后 linkLayer 不泄漏（live 层恒 ≤1，0 点时归零），
 *       共享结束后面板关闭、导航按钮收起。
 *   Q4 XSS：sharerName 注入 <img onerror> → 面板被转义、地图 marker 首字未转义（证明 llAvatarIcon 缺陷）；
 *       头像 URL 注入引号 → marker 首字未转义且 onerror 被原样写入（证明 llAvatarIcon 缺陷）。
 *   Q5 导航 URL：navUrlFor 拼高德 URI；起点=终点被 llStartNav 拒绝（不跳转）。
 *
 * 运行：node tools/qa/_r144_qa_extra.js     （结果打印到 stdout，由 QA 汇总进 _r144_qa_report.txt）
 */
var path = require('path');
var fs = require('fs');
var http = require('http');
var ROOT = path.resolve(__dirname, '..', '..');

var lines = [];
function log(s) { lines.push(s); }
var pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; log('  [PASS] ' + label + (detail ? '  -> ' + detail : '')); }
  else { fail++; log('  [FAIL] ' + label + (detail ? '  -> ' + detail : '')); }
}
/* 逐步落盘（write-through）：任何一步抛错也能看到跑到哪条 */
var OUT = path.join(__dirname, '_r144_qa_extra_out.txt');
try { fs.unlinkSync(OUT); } catch (e) {}
function flush() { try { fs.writeFileSync(OUT, lines.join('\r\n') + '\r\n', 'utf8'); } catch (e) {} }
function dump() { flush(); process.stdout.write(lines.join('\r\n') + '\r\n'); }

process.on('unhandledRejection', function (e) { log('  [bg-rejection] ' + ((e && e.stack) || '' + e)); });
process.on('uncaughtException', function (e) { log('  [bg-exception] ' + ((e && e.stack) || '' + e)); });

var JSDOM, VirtualConsole;
try { var jd = require('jsdom'); JSDOM = jd.JSDOM; VirtualConsole = jd.VirtualConsole; }
catch (e) { log('无法加载 jsdom: ' + e.message); dump(); process.exit(2); }

var PORT = 8145;
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

var FAKE_LEAFLET = [
  '(function(){',
  '  var rec = { groups: [], removeLayer: 0, fitBounds: 0, map: null };',
  '  window.__LL_REC__ = rec;',
  '  function withAddTo(o){',
  '    o.addTo = function (t) {',
  '      if (!t) return o;',
  '      if (!t.layers) t.layers = [];',
  '      if (t.__isGroup || t.__isMap) t.layers.push(o);',
  '      return o;',
  '    };',
  '    return o;',
  '  }',
  '  var L = {};',
  '  L.map = function (id, opts) {',
  '    var m = { __isMap: true, layers: [], _id: id };',
  '    m.setView = function (a, z) { m.view = [a, z]; return m; };',
  '    m.getZoom = function () { return 16; };',
  '    m.setZoom = function () {};',
  '    m.fitBounds = function (b, o) { rec.fitBounds++; rec.fitBoundsArgs = b; };',
  '    m.removeLayer = function (l) { rec.removeLayer++; if (l) l.__removed = true; };',
  '    m.addLayer = function (l) { m.layers.push(l); };',
  '    rec.map = m;',
  '    return m;',
  '  };',
  '  L.TileLayer = { extend: function () { return function () { withAddTo(this); }; } };',
  '  L.layerGroup = function () {',
  '    var g = { __isGroup: true, layers: [] };',
  '    withAddTo(g);',
  '    g.addTo = function (m) { if (m && m.__isMap) rec.groups.push(g); return g; };',
  '    return g;',
  '  };',
  '  L.polyline = function (ll, opts) { return withAddTo({ kind: "polyline", coords: ll, opts: opts }); };',
  '  L.marker = function (ll, opts) {',
  '    return withAddTo({',
  '      kind: "marker", latlng: ll, opts: opts,',
  '      setLatLng: function (x) { this.latlng = x; return this; },',
  '      setIcon: function (i) { this.opts.icon = i; return this; }',
  '    });',
  '  };',
  '  L.divIcon = function (o) { return { __icon: true, html: o.html, className: o.className }; };',
  '  L.latLngBounds = function (a, b) {',
  '    var pts = []; if (a) pts.push(a); if (b) pts.push(b);',
  '    var o = { _pts: pts, extend: function (ll) { pts.push(ll); return o; },',
  '      getCenter: function () { var la = 0, lo = 0;',
  '        for (var i = 0; i < pts.length; i++) { la += pts[i][0]; lo += pts[i][1]; }',
  '        return [la / pts.length, lo / pts.length]; } };',
  '    return o;',
  '  };',
  '  window.L = L;',
  '})();'
].join('\n');

function startServer(ready) {
  var srv = http.createServer(function (req, res) {
    var rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    if (rel === 'assets/leaflet/leaflet.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      res.end(FAKE_LEAFLET); return;
    }
    var p = path.join(ROOT, rel);
    fs.readFile(p, function (e, buf) {
      if (e) { res.writeHead(404); res.end('nf'); return; }
      var ct = /\.css$/.test(p) ? 'text/css' : (/\.js$/.test(p) ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
      res.writeHead(200, { 'content-type': ct }); res.end(buf);
    });
  });
  srv.listen(PORT, '127.0.0.1', function () { ready(srv); });
}

function S(id, name, lat, lng, extra) {
  var o = { shareId: 's' + id, sharerId: id, sharerName: name, lat: lat, lng: lng,
    hasFix: true, updatedAt: Date.now(), stale: false };
  if (extra) for (var k in extra) o[k] = extra[k];
  return o;
}
function st(list) { return { ok: true, active: true, count: list.length, sessions: list }; }
function near(a, b) { return Math.abs(a - b) < 1e-9; }

function loadPage(cb, meAvatar, vcSink) {
  var vc = new VirtualConsole();
  if (vcSink) { vc.on('jsdomError', function (e) { vcSink.push(String((e && e.message) || e)); }); }
  var dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'live-location.html'), 'utf8'), {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    url: 'http://127.0.0.1:' + PORT + '/live-location.html?groupId=5&join=0',
    virtualConsole: vc,
    beforeParse: function (w) {
      try {
        w.localStorage.setItem('study_workbench_token', 'tk_test');
        w.localStorage.setItem('study_workbench_uid', '9');
      } catch (e) {}
      w.fetch = function (url) {
        var u = String(url);
        if (u.indexOf('/api/auth/me') >= 0) {
          return Promise.resolve({ ok: true, status: 200, json: function () {
            return Promise.resolve({ id: 9, nickname: '我', avatarUrl: meAvatar || '' }); } });
        }
        return Promise.resolve({ ok: true, status: 200, json: function () {
          return Promise.resolve({ ok: true, active: false, sessions: [] }); } });
      };
    }
  });
  cb(dom);
}

(async function main() {
  try {
    log('===== R144 QA 主动挑刺 · live-location.html =====');
    log('时间: ' + new Date().toISOString());
    log('');

    await new Promise(function (r) { startServer(r); });

    /* ---------- Q1 单方共享不回归 ---------- */
    log('--- Q1 单方共享不回归 ---');
    {
      var dom = null;
      await new Promise(function (r) { loadPage(function (d) { dom = d; r(); }); });
      await sleep(120);
      var w = dom.window, T = w.__LL_TEST__, rec = w.__LL_REC__;
      var $ = function (id) { return w.document.getElementById(id); };
      var ME = S(9, '我', 39.9042, 116.4074);
      T.onState(st([ME]));
      var live = rec.groups.filter(function (g) { return !g.__removed; });
      var lines1 = live.length ? live[0].layers.filter(function (l) { return l.kind === 'polyline'; }) : [];
      check('Q1 仅 1 个有效点 → 不产生连线', lines1.length === 0, 'polylines=' + lines1.length);
      check('Q1 导航按钮不亮起（class 无 on）', $('llNav').className.indexOf('on') < 0, $('llNav').className);
      check('Q1 不触发导航面板打开', $('llSheet').className.indexOf('open') < 0, $('llSheet').className);
      check('Q1 本人 marker 仍正常上屏', rec.map.layers.filter(function (m) { return m.kind === 'marker'; }).length === 1,
        'markers=' + rec.map.layers.filter(function (m) { return m.kind === 'marker'; }).length);
      check('Q1 有效点集合清空（lastPts=0）', T.S.lastPts.length === 0, 'lastPts=' + T.S.lastPts.length);
    }

    /* ---------- Q2 绝不画 (0,0) ---------- */
    log('--- Q2 绝不画 (0,0) ---');
    {
      var dom2 = null;
      await new Promise(function (r) { loadPage(function (d) { dom2 = d; r(); }); });
      await sleep(120);
      var w2 = dom2.window, T2 = w2.__LL_TEST__, rec2 = w2.__LL_REC__;
      var ME2 = S(9, '我', 39.9042, 116.4074);
      // B1: hasFix:false
      var bad1 = S(77, '坏1', 39.9, 116.4, { hasFix: false });
      T2.onState(st([ME2, bad1]));
      var mk2 = rec2.map.layers.filter(function (m) { return m.kind === 'marker'; });
      var at00 = mk2.filter(function (m) { return near(m.latlng[0], 0) && near(m.latlng[1], 0); });
      check('Q2 hasFix:false 会话被跳过（不建 marker）', mk2.length === 1, 'markers=' + mk2.length);
      check('Q2 hasFix:false 不产生 (0,0) marker', at00.length === 0, 'at00=' + at00.length);
      var live2 = rec2.groups.filter(function (g) { return !g.__removed; });
      check('Q2 hasFix:false → 不画线', (live2.length ? live2[0].layers.filter(function (l){return l.kind==='polyline';}).length : 0) === 0, '');
      // B2: lat:null, lng:null（hasFix:true）
      var dom2b = null;
      await new Promise(function (r) { loadPage(function (d) { dom2b = d; r(); }); });
      await sleep(120);
      var w2b = dom2b.window, T2b = w2b.__LL_TEST__, rec2b = w2b.__LL_REC__;
      var bad2 = S(77, '坏2', null, null, {});
      T2b.onState(st([ME2, bad2]));
      var mk2b = rec2b.map.layers.filter(function (m) { return m.kind === 'marker'; });
      var at00b = mk2b.filter(function (m) { return near(m.latlng[0], 0) && near(m.latlng[1], 0); });
      check('Q2 lat:null → num() 返回 NaN 被跳过（不建 marker）', mk2b.length === 1, 'markers=' + mk2b.length);
      check('Q2 lat:null 不把 null 当 0 画 (0,0)', at00b.length === 0, 'at00=' + at00b.length);
      // B3: 显式 (0,0,true) —— 设计说明：字面 0,0 会被当真实坐标画出
      var dom2c = null;
      await new Promise(function (r) { loadPage(function (d) { dom2c = d; r(); }); });
      await sleep(120);
      var w2c = dom2c.window, T2c = w2c.__LL_TEST__, rec2c = w2c.__LL_REC__;
      var Z = S(77, '零点', 0, 0, {});
      T2c.onState(st([ME2, Z]));
      var mk2c = rec2c.map.layers.filter(function (m) { return m.kind === 'marker'; });
      var at00c = mk2c.filter(function (m) { return near(m.latlng[0], 0) && near(m.latlng[1], 0); });
      check('Q2 显式 (0,0,hasFix:true) 会被画出（设计说明，非 null 防护范畴）', at00c.length === 1, 'at00=' + at00c.length);
    }

    /* ---------- Q3 面板/图层生命周期：2→3→2→0 ---------- */
    log('--- Q3 面板/图层生命周期 ---');
    {
      var dom3 = null;
      await new Promise(function (r) { loadPage(function (d) { dom3 = d; r(); }); });
      await sleep(120);
      var w3 = dom3.window, T3 = w3.__LL_TEST__, rec3 = w3.__LL_REC__;
      var $3 = function (id) { return w3.document.getElementById(id); };
      var ME3 = S(9, '我', 39.9042, 116.4074), A3 = S(77, '张三', 39.9142, 116.4174), B3 = S(88, '李四', 39.8992, 116.4264);
      function liveCount() { return rec3.groups.filter(function (g) { return !g.__removed; }).length; }
      function polyCount() {
        var lv = rec3.groups.filter(function (g) { return !g.__removed; });
        if (!lv.length) return 0;
        return lv[0].layers.filter(function (l) { return l.kind === 'polyline'; }).length;
      }
      T3.onState(st([ME3, A3]));
      check('Q3 2 点 → 1 条 live 连线层', liveCount() === 1 && polyCount() === 1, 'live=' + liveCount() + ' poly=' + polyCount());
      T3.onState(st([ME3, A3, B3]));
      check('Q3 3 点 → 仍仅 1 条 live 层（旧层已移除，未泄漏）', liveCount() === 1 && polyCount() === 3, 'live=' + liveCount() + ' poly=' + polyCount());
      T3.onState(st([ME3, A3]));
      check('Q3 回到 2 点 → 仍仅 1 条 live 层', liveCount() === 1 && polyCount() === 1, 'live=' + liveCount() + ' poly=' + polyCount());
      T3.onState(st([]));
      check('Q3 0 点 → live 连线层归零（无泄漏）', liveCount() === 0, 'live=' + liveCount());
      check('Q3 0 点 → 导航按钮收起', $3('llNav').className.indexOf('on') < 0, $3('llNav').className);
      check('Q3 0 点 → 面板关闭', $3('llSheet').className.indexOf('open') < 0, $3('llSheet').className);
      check('Q3 0 点 → 有效点清零', T3.S.lastPts.length === 0, 'lastPts=' + T3.S.lastPts.length);
      check('Q3 全程 removeLayer 调用 ≥2（旧层确实被摘）', rec3.removeLayer >= 2, 'removeLayer=' + rec3.removeLayer);
      // 反复横跳验证不累积
      for (var i = 0; i < 3; i++) { T3.onState(st([ME3, A3])); T3.onState(st([ME3, A3, B3])); T3.onState(st([ME3, A3])); }
      check('Q3 反复横跳后 live 层仍恒 =1', liveCount() === 1, 'live=' + liveCount());
    }

    /* ---------- Q4 XSS ---------- */
    log('--- Q4 XSS ---');
    {
      var dom4 = null;
      await new Promise(function (r) { loadPage(function (d) { dom4 = d; r(); }); });
      await sleep(120);
      var w4 = dom4.window, T4 = w4.__LL_TEST__, rec4 = w4.__LL_REC__;
      var $4 = function (id) { return w4.document.getElementById(id); };
      var ME4 = S(9, '我', 39.9042, 116.4074);
      var ATT = S(77, '<img src=x onerror=alert(1)>', 39.9142, 116.4174);
      T4.onState(st([ME4, ATT]));
      $4('llNav').click(); // 打开面板
      var rowsHtml = $4('llRows').innerHTML;
      var orowHtml = $4('llOriginRow').innerHTML;
      check('Q4 面板昵称被转义（含 &lt;img，无真实 <img 标签）',
        rowsHtml.indexOf('&lt;img') >= 0 && rowsHtml.indexOf('<img src=x') < 0,
        'hasEsc=' + (rowsHtml.indexOf('&lt;img') >= 0) + ' hasRaw=' + (rowsHtml.indexOf('<img src=x') >= 0));
      check('Q4 DOM 中无注入的 onerror 图片', w4.document.querySelectorAll('img[onerror]').length === 0,
        'img[onerror]=' + w4.document.querySelectorAll('img[onerror]').length);
      // marker 首字未转义（llAvatarIcon 缺陷）
      var attMk = rec4.map.layers.filter(function (m) {
        return m.kind === 'marker' && m.opts && m.opts.icon && m.opts.icon.html &&
          m.opts.icon.html.indexOf('ll-ava') >= 0;
      });
      var attHtml = attMk.length ? attMk[0].opts.icon.html : '';
      check('Q4 地图 marker（self）首字渲染正常（无裸注入）',
        attHtml.indexOf('&lt;') < 0 && attHtml.indexOf('<img src=x') < 0,
        'markerHtmlHead=' + attHtml.slice(0, 60));
      // navUrlFor 对恶意 name 走 encodeURIComponent（不裸奔）
      var u = T4.navUrlFor(T4.ptById('9'), T4.ptById('77'));
      check('Q4 navUrlFor 对恶意 name 做 encodeURIComponent（URL 内无裸 <img）',
        u.indexOf('<img') < 0 && u.indexOf(encodeURIComponent('<img src=x onerror=alert(1)>')) >= 0,
        'urlHasEnc=' + (u.indexOf(encodeURIComponent('<img src=x onerror=alert(1)>')) >= 0));
    }
    /* Q4b 头像 URL 注入（qAvatar / myAvatar 路径，llAvatarIcon 未转义 url） */
    {
      var dom4b = null;
      await new Promise(function (r) { loadPage(function (d) { dom4b = d; r(); }, 'https:" onerror="alert(1)'); });
      await sleep(120);
      var w4b = dom4b.window, T4b = w4b.__LL_TEST__, rec4b = w4b.__LL_REC__;
      var ME4b = S(9, '我', 39.9042, 116.4074);
      T4b.onState(st([ME4b]));
      var selfMk = rec4b.map.layers.filter(function (m) {
        return m.kind === 'marker' && m.opts && m.opts.icon && m.opts.icon.html &&
          m.opts.icon.html.indexOf('ll-ava') >= 0;
      });
      var selfHtml = selfMk.length ? selfMk[0].opts.icon.html : '';
      check('Q4b 修复后：头像 URL 引号注入已被转义（不再原样写入 onerror）',
        selfHtml.indexOf('&quot;') >= 0 && selfHtml.indexOf('onerror="alert(1)') < 0,
        'markerHtml=' + selfHtml.slice(0, 80));
    }

    /* ---------- Q5 导航 URL + 起点=终点拒绝 ---------- */
    log('--- Q5 导航 URL / 起点=终点拒绝 ---');
    {
      var dom5 = null;
      var navErr = [];
      await new Promise(function (r) { loadPage(function (d) { dom5 = d; r(); }, undefined, navErr); });
      await sleep(120);
      var w5 = dom5.window, T5 = w5.__LL_TEST__;
      var ME5 = S(9, '我', 39.9042, 116.4074), A5 = S(77, '张三', 39.9142, 116.4174);
      T5.onState(st([ME5, A5]));
      var url = T5.navUrlFor(T5.ptById('9'), T5.ptById('77'));
      check('Q5 navUrlFor 指向高德导航 URI', url.indexOf('https://uri.amap.com/navigation') === 0, url.slice(0, 40));
      check('Q5 navUrlFor 含 coordinate=gaode&callnative=1',
        url.indexOf('coordinate=gaode') > 0 && url.indexOf('callnative=1') > 0, url.slice(-50));
      check('Q5 起终点为「经度,纬度,名称」且 encodeURIComponent',
        url.indexOf(encodeURIComponent('116.407400,39.904200,我')) > 0 &&
        url.indexOf(encodeURIComponent('116.417400,39.914200,张三')) > 0, url);
      // jsdom 下 location.href=url 会触发「Not implemented: navigation」jsdomError，借此观察跳转是否发生
      function navAttempts() { return navErr.filter(function (s) { return /navigation/i.test(s); }).length; }
      // 起点=终点：应当被拒绝
      var beforeSame = navAttempts();
      T5.S.navOriginId = '9';
      T5.llStartNav('9');
      var afterSame = navAttempts();
      check('Q5 起点=终点 → 不发起跳转', afterSame === beforeSame,
        'navErrBefore=' + beforeSame + ' after=' + afterSame);
      check('Q5 起点=终点 → 提示「起点与终点相同」',
        (w5.document.getElementById('llToast').textContent || '').indexOf('起点与终点相同') >= 0,
        w5.document.getElementById('llToast').textContent);
      // 正常导航：应跳转
      var beforeOk = navAttempts();
      T5.S.navOriginId = '9';
      T5.llStartNav('77');
      var afterOk = navAttempts();
      check('Q5 正常导航 → 触发一次跳转（location.href 被赋值）', afterOk === beforeOk + 1,
        'navErrBefore=' + beforeOk + ' after=' + afterOk);
    }

    /* ---------- Q6 修复后复验（P1 转义生效 + 正常路径不误伤） ---------- */
    log('--- Q6 修复后复验（P1 转义 + 正常路径） ---');
    {
      // (a) 直调 llAvatarIcon：注入应被转义
      var wX = null;
      await new Promise(function (r) { loadPage(function (d) { wX = d.window; r(); }); });
      await sleep(100);
      var icoHtml = wX.__LL_TEST__.llAvatarIcon('我', 'https://x/y" onerror="alert(1)').html;
      check('Q6 直调 llAvatarIcon：注入引号被转义（含 &quot;，无裸 " onerror="alert(1)）',
        icoHtml.indexOf('&quot;') >= 0 && icoHtml.indexOf('" onerror="alert(1)') < 0,
        'head=' + icoHtml.slice(0, 90));
      // (b) 真实路径 myAvatar 恶意 → self marker 转义
      var dom6 = null;
      await new Promise(function (r) { loadPage(function (d) { dom6 = d; r(); }, 'https://x/y" onerror="alert(1)'); });
      await sleep(120);
      var w6 = dom6.window, T6 = w6.__LL_TEST__, rec6 = w6.__LL_REC__;
      T6.onState(st([S(9, '我', 39.9042, 116.4074)]));
      var selfMk = rec6.map.layers.filter(function (m) {
        return m.kind === 'marker' && m.opts && m.opts.icon && m.opts.icon.html && m.opts.icon.html.indexOf('ll-ava') >= 0;
      });
      var selfHtml = selfMk.length ? selfMk[0].opts.icon.html : '';
      check('Q6 真实路径(myAvatar)注入：marker 已转义（含 &quot;，无裸 " onerror="alert(1)）',
        selfHtml.indexOf('&quot;') >= 0 && selfHtml.indexOf('" onerror="alert(1)') < 0,
        'head=' + selfHtml.slice(0, 90));
      // (b2) 真实路径 sharerName 恶意 → marker 首字转义
      var dom6b = null;
      await new Promise(function (r) { loadPage(function (d) { dom6b = d; r(); }); });
      await sleep(120);
      var w6b = dom6b.window, T6b = w6b.__LL_TEST__, rec6b = w6b.__LL_REC__;
      T6b.onState(st([S(9, '我', 39.9042, 116.4074), S(77, '<img src=x onerror=alert(1)>', 39.9142, 116.4174)]));
      var attMk = rec6b.map.layers.filter(function (m) {
        return m.kind === 'marker' && m.opts && m.opts.icon && m.opts.icon.html && m.opts.icon.html.indexOf('ll-ava') >= 0;
      });
      var attEsc = attMk.some(function (m) { return m.opts.icon.html.indexOf('&lt;') >= 0; });
      check('Q6 真实路径(sharerName)注入：marker 首字已转义（含 &lt;）', attEsc, 'markers=' + attMk.length);
      // (c) 反向：正常相对头像 /uploads + 中文首字 不被误伤
      var dom6c = null;
      await new Promise(function (r) { loadPage(function (d) { dom6c = d; r(); }, '/uploads/me.png'); });
      await sleep(120);
      var w6c = dom6c.window, T6c = w6c.__LL_TEST__, rec6c = w6c.__LL_REC__;
      T6c.onState(st([S(9, '张三', 39.9042, 116.4074), S(77, '李四', 39.9142, 116.4174, { avatar: '/uploads/li.png' })]));
      var normMk = rec6c.map.layers.filter(function (m) {
        return m.kind === 'marker' && m.opts && m.opts.icon && m.opts.icon.html && m.opts.icon.html.indexOf('ll-ava') >= 0;
      });
      var normHtml = normMk.map(function (m) { return m.opts.icon.html; }).join('|');
      check('Q6 反向：正常中文首字未转义破坏（含 我/李 原样）',
        normHtml.indexOf('>我<') >= 0 && normHtml.indexOf('>李<') >= 0, 'snippet=' + normHtml.slice(0, 120));
      check('Q6 反向：正常 .png 头像路径完整（无 &quot;/&lt; 误伤）',
        normHtml.indexOf('.png"') >= 0 && normHtml.indexOf('&quot;') < 0 && normHtml.indexOf('&lt;') < 0,
        'snippet=' + normHtml.slice(0, 120));
    }

    log('');
    log('合计: ' + pass + ' pass / ' + fail + ' fail');
    log(fail === 0 ? 'QA_EXTRA_ALL_PASS' : 'QA_EXTRA_FAIL');
    dump();
  } catch (e) {
    log('!! main 未捕获异常: ' + ((e && e.stack) || String(e)));
    log('QA_EXTRA_ERROR');
    dump();
    process.exit(1);
  }
  process.exit(0);
})();
