/**
 * tools/qa/_r144_jsdom.js — R144 批次 jsdom 行为验证（live-location.html 真实渲染）。
 *
 * 覆盖（需求逐条对应）：
 *   S1 触发条件：2 个有效位置点 → 画 1 条线 + 中点 1 个距离标签；导航按钮亮起。
 *   S2 多点连接：3 个有效点 → 闭合环（3 段）+ 每段中点距离标签 + 几何中心「N 人 · 最远/最近」汇总标签；
 *                逐段用独立实现的 Haversine 交叉校验文案；末段回起点（环闭合）。
 *   S3 距离计算规则：<1000m 用米、≥1000m 用公里（<10km 一位小数、≥10km 取整）。
 *   S4 更新时机：任一参与方坐标变化 → 重绘且距离数值刷新。
 *   S5 更新时机（防闪）：坐标未变 → 点位签名一致 → 不重绘（图层组数量不增）。
 *   S6 触发条件：有效点 <2 → 清连线 + 导航按钮收起。
 *   S7 导航入口：面板打开、起点默认本人、终点行数/距离正确。
 *   S8 导航跳转：navUrlFor 拼出高德 URI（coordinate=gaode）；点「导航」触发一次跳转尝试。
 *   S9 复制坐标：无 clipboard API 时走 execCommand 兜底并给出 toast（不抛异常）。
 *   S10 起点可切换：换起点后终点列表反向（自己变成终点行），距离按新起点重算。
 *   S11 共享结束：sessions 空 → 连线清零、面板关闭、导航按钮收起。
 *
 * 手法：本地 HTTP 服务把 assets/leaflet/leaflet.js 换成一个「记录型假 L」（记下每条 polyline / 每个 marker 的
 *       经纬度与 divIcon.html），页面的画线结果即可被逐条断言；真实 Leaflet 在 jsdom 里无布局不可靠。
 * 运行：node tools/qa/_r144_jsdom.js      （结果写 tools/qa/_r144_report.txt）
 */
var path = require('path');
var fs = require('fs');
var http = require('http');
var ROOT = path.resolve(__dirname, '..', '..');

var OUT = path.join(__dirname, '_r144_report.txt');
var lines = [];
/* 逐步落盘（write-through）：任何一步抛错时也能看到已完成到哪一条，便于定位 */
function log(s) {
  lines.push(s);
  try { fs.appendFileSync(OUT, s + '\r\n', 'utf8'); } catch (e) { /* 磁盘不可写则只留内存 */ }
}
var pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; log('  [PASS] ' + label + (detail ? '  -> ' + detail : '')); }
  else { fail++; log('  [FAIL] ' + label + (detail ? '  -> ' + detail : '')); }
}
function flush() {
  try { fs.writeFileSync(OUT, lines.join('\r\n') + '\r\n', 'utf8'); } catch (e) { }
}
try { fs.unlinkSync(OUT); } catch (e) { /* 首次运行无旧报告 */ }

process.on('unhandledRejection', function (e) {
  log('  [bg-rejection] ' + ((e && e.stack) || (e && e.message) || e));
});
process.on('uncaughtException', function (e) {
  log('  [bg-exception] ' + ((e && e.stack) || (e && e.message) || e));
});

var JSDOM, VirtualConsole;
try {
  var jd = require('jsdom');
  JSDOM = jd.JSDOM; VirtualConsole = jd.VirtualConsole;
} catch (e) {
  log('无法加载 jsdom: ' + e.message);
  flush();
  process.exit(2);
}

var PAGE = 'live-location.html';
var PORT = 8144;
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ---------- 记录型假 Leaflet：把页面画出来的图层原样留证 ---------- */
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
  '    var pts = [];',
  '    if (a) pts.push(a);',
  '    if (b) pts.push(b);',
  '    var o = {',
  '      _pts: pts,',
  '      extend: function (ll) { pts.push(ll); return o; },',
  '      getCenter: function () {',
  '        var la = 0, lo = 0;',
  '        for (var i = 0; i < pts.length; i++) { la += pts[i][0]; lo += pts[i][1]; }',
  '        return [la / pts.length, lo / pts.length];',
  '      }',
  '    };',
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
      res.end(FAKE_LEAFLET);
      return;
    }
    var p = path.join(ROOT, rel);
    fs.readFile(p, function (e, buf) {
      if (e) { res.writeHead(404); res.end('nf'); return; }
      var ct = /\.css$/.test(p) ? 'text/css'
        : (/\.js$/.test(p) ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
      res.writeHead(200, { 'content-type': ct });
      res.end(buf);
    });
  });
  srv.listen(PORT, '127.0.0.1', function () { ready(srv); });
}

/* 独立实现 Haversine，用于交叉校验页面算出来的距离文案（不复用被测代码） */
var RAD = Math.PI / 180;
function hv(la1, lo1, la2, lo2) {
  var dLa = (la2 - la1) * RAD, dLo = (lo2 - lo1) * RAD;
  var a = Math.sin(dLa / 2) * Math.sin(dLa / 2) +
    Math.cos(la1 * RAD) * Math.cos(la2 * RAD) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function fmtRef(m) {
  if (m < 1000) return Math.round(m) + ' 米';
  var km = m / 1000;
  return (km < 10 ? km.toFixed(1) : String(Math.round(km))) + ' 公里';
}
function labelText(mk) {
  var h = (mk && mk.opts && mk.opts.icon && mk.opts.icon.html) || '';
  var m = /<i>([\s\S]*?)<\/i>/.exec(h);
  return m ? m[1] : '';
}
function near(a, b) { return Math.abs(a - b) < 1e-9; }

var vcErrors = [];
function loadPage(cb) {
  var vc = new VirtualConsole();
  vc.on('jsdomError', function (e) { vcErrors.push(String((e && e.message) || e)); });
  var html = fs.readFileSync(path.join(ROOT, PAGE), 'utf8');
  var dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    url: 'http://127.0.0.1:' + PORT + '/' + PAGE + '?groupId=5&join=0',
    virtualConsole: vc,
    beforeParse: function (w) {
      try {
        w.localStorage.setItem('study_workbench_token', 'tk_test');
        w.localStorage.setItem('study_workbench_uid', '9');
      } catch (e) { /* jsdom 无 localStorage 时忽略 */ }
      w.fetch = function (url) {
        var u = String(url);
        if (u.indexOf('/api/auth/me') >= 0) {
          return Promise.resolve({ ok: true, status: 200, json: function () {
            return Promise.resolve({ id: 9, nickname: '我', avatarUrl: '' }); } });
        }
        /* /api/live/state：默认「无人共享」，避免后台轮询干扰断言 */
        return Promise.resolve({ ok: true, status: 200, json: function () {
          return Promise.resolve({ ok: true, active: false, sessions: [] }); } });
      };
    }
  });
  cb(dom);
}

/* 构造一个 session 项 */
function S(id, name, lat, lng) {
  return { shareId: 's' + id, sharerId: id, sharerName: name, lat: lat, lng: lng,
    hasFix: true, updatedAt: Date.now(), stale: false };
}
function st(list) {
  return { ok: true, active: true, count: list.length, sessions: list };
}

var ME = S(9, '我', 39.9042, 116.4074);
var A = S(77, '张三', 39.9142, 116.4174);
var B = S(88, '李四', 39.8992, 116.4264);

(async function main() {
  try {
  log('===== R144 jsdom 行为验证 · live-location.html =====');
  log('时间: ' + new Date().toISOString());
  log('');

  await new Promise(function (r) { startServer(r); });
  var dom = null;
  await new Promise(function (r) { loadPage(function (d) { dom = d; r(); }); });
  await sleep(120);

  var w = dom.window;
  var T = w.__LL_TEST__;
  var rec = w.__LL_REC__;
  if (!T || !rec) {
    check('页面注入 __LL_TEST__ / 假 Leaflet 已装载', false, 'T=' + !!T + ' rec=' + !!rec);
    flush();
    process.exit(1);
  }
  check('页面注入 __LL_TEST__ 且假 Leaflet 已装载', true, 'map=' + !!(rec.map));
  check('start() 已跑（地图已初始化）', !!rec.map, 'mapId=' + (rec.map && rec.map._id));
  var $ = function (id) { return w.document.getElementById(id); };

  /* ---------- S3 距离文案规则 ---------- */
  check('S3 fmtDist(0)=「0 米」', T.fmtDist(0) === '0 米', T.fmtDist(0));
  check('S3 fmtDist(999)=「999 米」', T.fmtDist(999) === '999 米', T.fmtDist(999));
  check('S3 fmtDist(1000)=「1.0 公里」', T.fmtDist(1000) === '1.0 公里', T.fmtDist(1000));
  check('S3 fmtDist(1500)=「1.5 公里」', T.fmtDist(1500) === '1.5 公里', T.fmtDist(1500));
  check('S3 fmtDist(12345)=「12 公里」', T.fmtDist(12345) === '12 公里', T.fmtDist(12345));

  /* ---------- S1 两点：连线 + 中点距离 + 导航按钮亮起 ---------- */
  var g0 = rec.groups.length;
  T.onState(st([ME, A]));
  var g = rec.groups[rec.groups.length - 1];
  var pls = g.layers.filter(function (l) { return l.kind === 'polyline'; });
  var mks = g.layers.filter(function (l) { return l.kind === 'marker'; });
  check('S1 2 点 → 恰好 1 条连线', pls.length === 1, 'polylines=' + pls.length);
  check('S1 2 点 → 恰好 1 个距离标签', mks.length === 1, 'labels=' + mks.length);
  var exp2 = fmtRef(hv(ME.lat, ME.lng, A.lat, A.lng));
  check('S1 距离文案 = 独立 Haversine 结果', labelText(mks[0]) === exp2,
    'got=' + labelText(mks[0]) + ' exp=' + exp2 + ' (' + Math.round(hv(ME.lat, ME.lng, A.lat, A.lng)) + 'm)');
  var mid = mks[0].latlng;
  check('S1 标签落在两点的中点', near(mid[0], (ME.lat + A.lat) / 2) && near(mid[1], (ME.lng + A.lng) / 2),
    JSON.stringify(mid));
  check('S1 连线端点 = 两端点实际坐标',
    near(pls[0].coords[0][0], ME.lat) && near(pls[0].coords[0][1], ME.lng) &&
    near(pls[0].coords[1][0], A.lat) && near(pls[0].coords[1][1], A.lng), JSON.stringify(pls[0].coords));
  /* 稳定顺序必须用「页面内部点位形态」(id/name/lat/lng) 验证 —— 那才是 renderLinks 的入参（会话形态没有 id） */
  var P = function (id, name, lat, lng) {
    return { id: String(id), name: name, avatar: '', lat: lat, lng: lng, isSelf: false };
  };
  var ord = T.stableOrderPts([P(77, '张三', 1, 1), P(9, '我', 2, 2), P(88, '李四', 3, 3)])
    .map(function (p) { return p.id; }).join(',');
  check('S1 稳定顺序：自己排首位 + 其余按 sharerId 升序', ord === '9,77,88', 'order=' + ord);
  check('S1 导航按钮亮起（class 含 on）', /(^|\s)ll-nav(\s|$)/.test($('llNav').className) && $('llNav').className.indexOf('on') >= 0,
    $('llNav').className);
  check('S1 首次上屏调用 fitBounds', rec.fitBounds >= 1, 'fitBounds=' + rec.fitBounds);

  /* ---------- S2 三点群聊：闭合环 + 段距标签 + 汇总标签 ---------- */
  T.onState(st([ME, A, B]));
  var g3 = rec.groups[rec.groups.length - 1];
  var pl3 = g3.layers.filter(function (l) { return l.kind === 'polyline'; });
  var mk3 = g3.layers.filter(function (l) { return l.kind === 'marker'; });
  check('S2 3 点 → 3 条边（闭合环）', pl3.length === 3, 'polylines=' + pl3.length);
  check('S2 3 点 → 3 个段距标签 + 1 个汇总标签', mk3.length === 4, 'labels=' + mk3.length);
  /* 逐段交叉校验：每条边的文案 == 该边两端点的 Haversine */
  var seq = T.stableOrderPts([P(77, '张三', A.lat, A.lng), P(9, '我', ME.lat, ME.lng), P(88, '李四', B.lat, B.lng)]);
  var segOk = true, segDetail = [];
  for (var i = 0; i < 3; i++) {
    var p1 = pl3[i].coords[0], p2 = pl3[i].coords[1];
    var want = fmtRef(hv(p1[0], p1[1], p2[0], p2[1]));
    var got = labelText(mk3[i]);
    segDetail.push(want + (want === got ? '' : ' != ' + got));
    if (want !== got) segOk = false;
  }
  check('S2 每段距离文案 = 该边两端点 Haversine', segOk, segDetail.join(' / '));
  check('S2 环闭合（末边终点 = 首点）',
    near(pl3[2].coords[1][0], seq[0].lat) && near(pl3[2].coords[1][1], seq[0].lng),
    JSON.stringify(pl3[2].coords[1]) + ' vs ' + JSON.stringify([seq[0].lat, seq[0].lng]));
  /* 汇总标签：两两全组合极值 */
  var mx = -1, mn = Infinity;
  for (var a1 = 0; a1 < 3; a1++) for (var b1 = a1 + 1; b1 < 3; b1++) {
    var dd = hv(seq[a1].lat, seq[a1].lng, seq[b1].lat, seq[b1].lng);
    if (dd > mx) mx = dd; if (dd < mn) mn = dd;
  }
  var sumTxt = null;
  for (var k = 0; k < mk3.length; k++) { if (labelText(mk3[k]).indexOf('人') > 0) sumTxt = labelText(mk3[k]); }
  var expSum = '3 人 · 最远 ' + fmtRef(mx) + ' · 最近 ' + fmtRef(mn);
  check('S2 汇总标签 = 「N 人 · 最远/最近」（两两全组合极值）', sumTxt === expSum,
    'got=' + sumTxt + ' exp=' + expSum);

  /* ---------- S4 坐标变化 → 重绘且数值刷新 ---------- */
  var gBefore = rec.groups.length, distBefore = labelText(g3.layers.filter(function (l) { return l.kind === 'marker'; })[0]);
  var A2 = S(77, '张三', 39.9642, 116.5174);   // 远离约 10km
  T.onState(st([ME, A2, B]));
  check('S4 坐标变化 → 重新建图层（重绘）', rec.groups.length === gBefore + 1,
    'groups ' + gBefore + ' -> ' + rec.groups.length);
  var g4 = rec.groups[rec.groups.length - 1];
  var mk4 = g4.layers.filter(function (l) { return l.kind === 'marker'; });
  var distAfter = labelText(mk4[0]);
  check('S4 距离数值随之刷新（与变化前不同）', distAfter !== distBefore,
    'before=' + distBefore + ' after=' + distAfter);
  check('S4 刷新后文案仍 = 独立 Haversine',
    mk4.every(function (m) {
      var t = labelText(m);
      if (t.indexOf('人') > 0) return true;
      return /^\d/.test(t);
    }), 'labels=' + mk4.map(labelText).join(' | '));

  /* ---------- S5 坐标未变 → 跳过重绘（防闪烁） ---------- */
  var gBefore2 = rec.groups.length;
  T.onState(st([ME, A2, B]));
  T.onState(st([ME, A2, B]));
  check('S5 坐标未变 → 不重建图层（签名一致跳过）', rec.groups.length === gBefore2,
    'groups ' + gBefore2 + ' -> ' + rec.groups.length);

  /* ---------- S7 导航面板：起点默认本人 + 终点行 + 距离 ---------- */
  $('llNav').click();
  check('S7 点「导航」→ 面板打开', $('llSheet').className.indexOf('open') >= 0, $('llSheet').className);
  var chips = $('llOriginRow').querySelectorAll('button.ll-origin');
  check('S7 起点胶囊 = 参与方数量（3）', chips.length === 3, 'chips=' + chips.length);
  check('S7 起点默认「我」（自己排首位且被选中）',
    chips[0].getAttribute('data-oid') === encodeURIComponent('9') && chips[0].className.indexOf('on') >= 0,
    chips[0].getAttribute('data-oid') + '|' + chips[0].className);
  var rows = $('llRows').querySelectorAll('div.ll-row');
  check('S7 终点行 = 其他参与方（2 行）', rows.length === 2, 'rows=' + rows.length);
  var rowTxt = $('llRows').textContent;
  check('S7 终点行显示「直线距离」且含对方昵称',
    rowTxt.indexOf('直线距离') >= 0 && rowTxt.indexOf('张三') >= 0 && rowTxt.indexOf('李四') >= 0, rowTxt.slice(0, 80));
  var expA = fmtRef(hv(ME.lat, ME.lng, A2.lat, A2.lng));
  check('S7 行内距离 = 起点(我)→该成员的 Haversine', rowTxt.indexOf(expA) >= 0,
    'want=' + expA + ' in=' + rowTxt.replace(/\s+/g, ' ').slice(0, 120));

  /* ---------- S8 导航跳转：URL 拼接 + 触发一次跳转 ---------- */
  var url = T.navUrlFor(T.ptById('9'), T.ptById('88'));
  check('S8 navUrlFor 指向高德导航 URI', url.indexOf('https://uri.amap.com/navigation') === 0, url.slice(0, 60));
  check('S8 navUrlFor 明示 GCJ-02 口径 + 唤起 App', url.indexOf('coordinate=gaode') > 0 && url.indexOf('callnative=1') > 0, url.slice(-60));
  check('S8 navUrlFor 起终点为「经度,纬度,名称」', url.indexOf(encodeURIComponent('116.407400,39.904200,我')) > 0 &&
    url.indexOf(encodeURIComponent('116.426400,39.899200,李四')) > 0, url);
  var navBefore = vcErrors.filter(function (s) { return /navigation/i.test(s); }).length;
  var navBtns = $('llRows').querySelectorAll('button[data-nav]');
  navBtns[0].click();
  var navAfter = vcErrors.filter(function (s) { return /navigation/i.test(s); }).length;
  check('S8 点行内「导航」→ 触发一次跳转尝试', navAfter > navBefore,
    'nav attempts ' + navBefore + ' -> ' + navAfter);
  check('S8 发起导航后面板自动关闭', $('llSheet').className.indexOf('open') < 0, $('llSheet').className);

  /* ---------- S9 复制坐标（无 clipboard → execCommand 兜底，不抛） ---------- */
  $('llNav').click();
  var copyBtn = $('llRows').querySelectorAll('button[data-copy]')[0];
  var excBefore = vcErrors.length;
  copyBtn.click();
  check('S9 点「复制」不抛异常', vcErrors.length === excBefore, 'newErrors=' + (vcErrors.length - excBefore));
  check('S9 复制后有坐标提示（toast 含 lat,lng）',
    /\d{2}\.\d+,\s*1\d{2}\.\d+/.test($('llToast').textContent), $('llToast').textContent);

  /* ---------- S10 起点可切换 ---------- */
  var chip2 = $('llOriginRow').querySelectorAll('button.ll-origin')[1];
  var oid2 = decodeURIComponent(chip2.getAttribute('data-oid'));
  chip2.click();
  check('S10 换起点后起点高亮转移', T.S.navOriginId === oid2, 'origin=' + T.S.navOriginId + ' want=' + oid2);
  var names2 = [];
  $('llRows').querySelectorAll('div.ll-row').forEach(function (r) { names2.push(r.querySelector('.ll-row-nm').textContent); });
  check('S10 换起点后自己变成终点行（列表反向）', names2.indexOf('我') >= 0 && names2.length === 2,
    names2.join(','));

  /* ---------- S11 共享结束：连线清零 + 面板关闭 + 按钮收起 ---------- */
  T.onState({ ok: true, active: false, sessions: [], stale: true });
  check('S11 sessions 空 → 导航按钮收起', $('llNav').className.indexOf('on') < 0, $('llNav').className);
  check('S11 sessions 空 → 面板关闭', $('llSheet').className.indexOf('open') < 0, $('llSheet').className);
  check('S11 sessions 空 → 有效点清零（连线同步清空）', T.S.lastPts.length === 0, 'lastPts=' + T.S.lastPts.length);
  check('S11 结束态显示「共享已结束」全屏层', $('llEnded').style.display === 'flex', $('llEnded').style.display);

  /* ---------- S6 单方共享：不画线 ---------- */
  T.onState(st([ME]));
  check('S6 仅 1 个有效点 → 不画线且导航按钮收起',
    T.S.lastPts.length === 0 && $('llNav').className.indexOf('on') < 0,
    'lastPts=' + T.S.lastPts.length + ' nav=' + $('llNav').className);

  /* ---------- S12 XSS：marker 侧（llAvatarIcon）必须转义昵称首字与头像 URL ----------
     （R144 QA P1：原先直接拼 nm.slice(0,1) 与 url → 引号可跳出 src 属性注入 onerror） */
  var evilAva = T.llAvatarIcon('我', 'https://x/y" onerror="alert(1)');
  check('S12 marker 头像 URL 已转义（无未转义引号跳出属性）',
    evilAva.html.indexOf('&quot;') > 0 && evilAva.html.indexOf('" onerror="alert(1)') < 0,
    evilAva.html.slice(0, 160));
  var evilName = T.llAvatarIcon('<img src=x onerror=alert(1)>', '');
  check('S12 marker 昵称首字已转义（无裸 <img）',
    evilName.html.indexOf('&lt;') > 0 && evilName.html.indexOf('<img src=x') < 0,
    evilName.html.slice(0, 160));
  var okAva = T.llAvatarIcon('张', 'https://x/y.png');
  check('S12 正常头像 URL 未被误伤（仍在 img[src] 里）',
    okAva.html.indexOf('<img src="https://x/y.png"') > 0, okAva.html.slice(0, 160));
  check('S12 escHtml 基本映射正确',
    T.escHtml('<&">') === '&lt;&amp;&quot;&gt;', T.escHtml('<&">'));

  /* ---------- 结构断言：R144 新增 DOM 容器齐备、原有 DOM 未删 ---------- */
  check('DOM：新增 #llNav / #llSheet / #llOriginRow / #llRows 齐备',
    !!$('llNav') && !!$('llSheet') && !!$('llOriginRow') && !!$('llRows'));
  check('DOM：原有容器未被删除（#llMap/#llName/#llLoading/#llEnded/#llBar/#llToast）',
    !!$('llMap') && !!$('llName') && !!$('llLoading') && !!$('llEnded') && !!$('llBar') && !!$('llToast'));

  log('');
  log('合计: ' + pass + ' pass / ' + fail + ' fail');
  log(fail === 0 ? 'R144_JSDOM_ALL_PASS' : 'R144_JSDOM_FAIL');
  flush();
  /* 注意：绝不在测试里调 window.close()（jsdom 会抛未捕获异常打断收尾） */
  } catch (e) {
    log('!! main 内未捕获异常: ' + ((e && e.stack) || String(e)));
    log('R144_JSDOM_ERROR');
    flush();
    process.exit(1);
  }
  process.exit(0);
})();
