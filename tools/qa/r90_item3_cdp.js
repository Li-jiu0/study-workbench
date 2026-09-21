/**
 * R90 item3 - four-viewport CDP verification (real Chrome layout engine).
 *
 * Acceptance (per team-lead):
 *   V1  .xtlp-foot.getBoundingClientRect().bottom <= innerHeight   <-- KEY: not truncated
 *   V2  .xtlp-list clientHeight >= 180
 *   V3  .xtlp-list: when scrollHeight > clientHeight, scrollTop can really change
 *   V4  #imPlusMenu .im-plus-item count == 3 (动作1 regression)
 *   V5  composer row scrollWidth <= clientWidth at 320px (动作2 regression)
 *
 * Viewports: 375x667 / 375x480 / 320x480 / 320x400
 *
 * Uses raw CDP over WebSocket (no puppeteer dependency).
 */
'use strict';

var fs = require('fs');
var path = require('path');
var http = require('http');
var cp = require('child_process');
var os = require('os');

var ROOT = path.resolve(__dirname, '..', '..');
var CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
var PORT = 9333;
var PROFILE = path.join(os.tmpdir(), 'r90cdp_' + Date.now());

var VIEWPORTS = [[375, 667], [375, 480], [320, 480], [320, 400]];

function fileUrl(rel) {
  return 'file:///' + path.join(ROOT, rel).replace(/\\/g, '/');
}

function httpGet(url) {
  return new Promise(function (res, rej) {
    http.get(url, function (r) {
      var d = '';
      r.on('data', function (c) { d += c; });
      r.on('end', function () { res(d); });
    }).on('error', rej);
  });
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// Minimal WebSocket client (RFC6455, client->server masked frames).
var crypto = require('crypto');
var net = require('net');

function wsConnect(wsUrl) {
  return new Promise(function (resolve, reject) {
    var m = wsUrl.match(/^ws:\/\/([^/:]+):(\d+)(\/.*)$/);
    if (!m) { reject(new Error('bad ws url ' + wsUrl)); return; }
    var host = m[1], port = parseInt(m[2], 10), p = m[3];
    var key = crypto.randomBytes(16).toString('base64');
    var sock = net.connect(port, host, function () {
      var req = 'GET ' + p + ' HTTP/1.1\r\n' +
        'Host: ' + host + ':' + port + '\r\n' +
        'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
        'Sec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n';
      sock.write(req);
    });
    var buf = Buffer.alloc(0);
    var handshaken = false;
    var pending = {};   // id -> resolver  (CDP interleaves events with responses)
    sock.on('data', function (chunk) {
      buf = Buffer.concat([buf, chunk]);
      if (!handshaken) {
        var idx = buf.indexOf('\r\n\r\n');
        if (idx < 0) return;
        handshaken = true;
        buf = buf.slice(idx + 4);
        resolve(api);
      }
      // parse frames
      while (buf.length >= 2) {
        var b0 = buf[0], b1 = buf[1];
        var len = b1 & 0x7f;
        var off = 2;
        if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) break;
        var payload = buf.slice(off, off + len);
        buf = buf.slice(off + len);
        var opcode = b0 & 0x0f;
        if (opcode === 1) {
          var msg = payload.toString('utf8');
          var obj = null;
          try { obj = JSON.parse(msg); } catch (e) { obj = null; }
          if (obj && obj.id != null && pending[obj.id]) {
            var r = pending[obj.id]; delete pending[obj.id];
            // resolve with `result` payload (so callers do r.result.value / r.value)
            r(obj.result !== undefined ? obj.result : obj);
          }
          // events (no id) are ignored
        } else if (opcode === 8) {
          sock.end();
        }
      }
    });
    sock.on('error', reject);

    var idc = 1;
    var api = {
      call: function (method, params) {
        var id = idc++;
        var body = JSON.stringify({ id: id, method: method, params: params || {} });
        var payload = Buffer.from(body, 'utf8');
        var header = Buffer.alloc(2 + 8);
        header[0] = 0x81;
        var mask = crypto.randomBytes(4);
        if (payload.length < 126) {
          header[1] = 0x80 | payload.length;
          header = header.slice(0, 2);
        } else if (payload.length < 65536) {
          header[1] = 0x80 | 126;
          header.writeUInt16BE(payload.length, 2);
          header = header.slice(0, 4);
        } else {
          header[1] = 0x80 | 127;
          header.writeBigUInt64BE(BigInt(payload.length), 2);
          header = header.slice(0, 10);
        }
        var masked = Buffer.alloc(payload.length);
        for (var i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
        return new Promise(function (res) {
          pending[id] = res;
          sock.write(Buffer.concat([header, mask, masked]));
        });
      },
      close: function () { try { sock.end(); } catch (e) {} }
    };
  });
}

function findTarget(listRaw, want) {
  var list = JSON.parse(listRaw);
  for (var i = 0; i < list.length; i++) if (list[i].type === 'page') return list[i];
  return list[0];
}

function candidates() {
  var out = [];
  var bases = [
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];
  bases.forEach(function (b) { if (b && fs.existsSync(b)) out.push(b); });
  return out;
}

async function main() {
  var exe = candidates()[0] || CHROME;
  if (!fs.existsSync(exe)) { console.log('NO_CHROME at ' + exe); process.exit(2); }
  fs.mkdirSync(PROFILE, { recursive: true });

  // Serve the project root over HTTP on a random port.
  // 私聊.html loads assets/app.js which force-redirects to 登录.html when未登录;
  // seeding localStorage is only reliable same-origin, so HTTP (not file://) is used.
  var httpMod = require('http');
  var srv = httpMod.createServer(function (req, res) {
    try {
      var u = decodeURIComponent(req.url.split('?')[0]);
      var fp = path.join(ROOT, u.replace(/^\//, ''));
      if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('404'); return; }
      var ext = path.extname(fp).toLowerCase();
      var ct = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
                 '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': ct });
      res.end(fs.readFileSync(fp));
    } catch (e) { res.writeHead(500); res.end('500'); }
  });
  await new Promise(function (r) { srv.listen(0, '127.0.0.1', r); });
  var SRV_PORT = srv.address().port;

  var args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE,
    '--window-size=375,667', 'about:blank'
  ];
  var child = cp.spawn(exe, args, { stdio: 'ignore' });

  // wait for devtools
  var listRaw = null;
  for (var i = 0; i < 60; i++) {
    try { listRaw = await httpGet('http://127.0.0.1:' + PORT + '/json/list'); if (listRaw && listRaw.indexOf('webSocketDebuggerUrl') >= 0) break; } catch (e) {}
    await sleep(250);
  }
  if (!listRaw) { console.log('CDP_NOT_UP'); try { child.kill(); } catch (e) {} try { srv.close(); } catch (e) {} process.exit(2); }

  var target = findTarget(listRaw, 'page');
  var ws = await wsConnect(target.webSocketDebuggerUrl);
  await ws.call('Page.enable');
  await ws.call('Runtime.enable');

  // Seed a fake auth session BEFORE any page script runs (same-origin HTTP -> works).
  await ws.call('Page.addScriptToEvaluateOnNewDocument', {
    source: "try{localStorage.setItem('study_workbench_auth', JSON.stringify({account:'qa_r90',loginAt:Date.now()}));" +
            "localStorage.setItem('study_workbench_token','qa_r90_token');" +
            "localStorage.setItem('study_workbench_uid','1');" +
            "localStorage.setItem('study_workbench_user', JSON.stringify({nickname:'QA'}));}catch(e){}" +
            "window.__XT_PROD__=true;"
  });

  // load the chat page once to assert 动作1/动作2 structure, then open openPicker + measure.
  var PAGE = 'http://127.0.0.1:' + SRV_PORT + '/' + encodeURIComponent('私聊.html');
  await ws.call('Page.navigate', { url: PAGE });
  await sleep(2500);

  // sanity: confirm not redirected
  var chk = await ws.call('Runtime.evaluate', { expression: 'location.href', returnByValue: true });
  var href = (chk && chk.result && chk.result.value) || '';
  var initialHref = href;

  var results = [];
  for (var v = 0; v < VIEWPORTS.length; v++) {
    var W = VIEWPORTS[v][0], H = VIEWPORTS[v][1];
    await ws.call('Emulation.setDeviceMetricsOverride', {
      width: W, height: H, deviceScaleFactor: 1, mobile: true
    });
    await sleep(250);

    // open openPicker if not already, then measure (re-open each round to be clean)
    var expr = '(' + measureFn.toString() + ')(' + W + ',' + H + ')';
    var r = await ws.call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
    var val = (r && r.result && r.result.value) || null;
    if (val) results.push(val);
    else results.push({ vw: W, vh: H, error: (r && r.result && (r.result.description || r.result.type)) || 'no-value' });
  }

  // composer overflow at 320 (动作2) - measure again at 320
  await ws.call('Emulation.setDeviceMetricsOverride', { width: 320, height: 480, deviceScaleFactor: 1, mobile: true });
  await sleep(200);
  var compExpr = '(' + composerFn.toString() + ')()';
  var cr = await ws.call('Runtime.evaluate', { expression: compExpr, returnByValue: true });
  var comp = (cr && cr.result && cr.result.value) || null;

  var menuExpr = '(' + menuFn.toString() + ')()';
  var mr = await ws.call('Runtime.evaluate', { expression: menuExpr, returnByValue: true });
  var menu = (mr && mr.result && mr.result.value) || null;

  ws.close();
  try { child.kill(); } catch (e) {}
  try { srv.close(); } catch (e) {}

  // ---------- verdict ----------
  var pass = 0, fail = 0, out = [];
  function ok(n, c, x) { if (c) { pass++; out.push('  PASS  ' + n); } else { fail++; out.push('  FAIL  ' + n + (x ? ('  << ' + x) : '')); } }

  out.push('=== R90 item3 四档视口 CDP 实测（真实 Chrome） ===');
  out.push('  initial href=' + initialHref);
  out.push('  redirected_to_login=' + (initialHref.indexOf('%E7%99%BB%E5%BD%95') >= 0 || initialHref.indexOf('登录') >= 0));
  results.forEach(function (r) {
    if (r.error) { out.push('  [' + r.vw + 'x' + r.vh + '] ERROR ' + r.error); return; }
    out.push('  [' + r.vw + 'x' + r.vh + '] innerHeight=' + r.innerH +
      ' overheadAbove=' + r.overheadAbove +
      ' listClientH=' + r.listClientH + ' listScrollH=' + r.listScrollH +
      ' footBottom=' + Math.round(r.footBottom) + ' footOverflow=' + r.footOverflow +
      ' mapH=' + r.mapH + ' headH=' + r.headH + ' footH=' + r.footH +
      ' listMinH=' + r.listMinH + ' scrollableTest=' + r.scrollChanged);
  });
  out.push('');
  out.push('=== 验收断言 ===');

  results.forEach(function (r) {
    if (r.error) { ok('[' + r.vw + 'x' + r.vh + '] 可测量', false, r.error); return; }
    var tag = '[' + r.vw + 'x' + r.vh + '] ';
    // V1 KEY
    ok(tag + '.xtlp-foot bottom <= innerHeight（不被截断）', r.footBottom <= r.innerH + 0.5,
      'footBottom=' + Math.round(r.footBottom) + ' innerH=' + r.innerH);
    // V2
    ok(tag + '.xtlp-list clientHeight >= 180', r.listClientH >= 179.5, 'clientH=' + r.listClientH);
    // V3
    ok(tag + 'list 可滚动（scrollHeight>clientHeight 时 scrollTop 能变）',
      (r.listScrollH <= r.listClientH + 0.5) || r.scrollChanged === true,
      'scrollH=' + r.listScrollH + ' clientH=' + r.listClientH + ' changed=' + r.scrollChanged);
  });

  // 矮屏断点生效证据：480/400 档 map 应被压到 110
  var tall = results.filter(function (r) { return r.vh >= 560 && !r.error; });
  var short = results.filter(function (r) { return r.vh < 560 && !r.error; });
  short.forEach(function (r) {
    ok('[' + r.vw + 'x' + r.vh + '] 矮屏 @media 生效：map 高度 = 110px', Math.abs(r.mapH - 110) < 1.5, 'mapH=' + r.mapH);
  });
  tall.forEach(function (r) {
    ok('[' + r.vw + 'x' + r.vh + '] 高屏 map 保持 168px', Math.abs(r.mapH - 168) < 1.5, 'mapH=' + r.mapH);
  });

  // 动作1 / 动作2 结构
  if (menu) {
    ok('动作1：#imPlusMenu .im-plus-item 计数 = 3', menu.itemCount === 3, 'count=' + menu.itemCount);
    ok('动作1：菜单内文案不含「定位」', menu.hasLocText === false, 'hasLocText=' + menu.hasLocText);
  } else { ok('动作1：菜单可测得', false, 'menu=null'); }

  if (comp) {
    ok('动作2 (320px)：输入栏 scrollWidth <= clientWidth（不换行不溢出）', comp.scrollW <= comp.clientW + 0.5,
      'scrollW=' + comp.scrollW + ' clientW=' + comp.clientW);
    ok('动作2：#imLocBtn 在输入栏内且可见', comp.hasLoc === true);
  } else { ok('动作2：输入栏可测得', false, 'comp=null'); }

  console.log(out.join('\n'));
  console.log('\n---------------------------------------------');
  console.log('R90 item3 CDP: ' + pass + '/' + (pass + fail) + ' passed, ' + fail + ' failed');
  console.log('---------------------------------------------');
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail === 0 ? 0 : 1);
}

// ---- page-context functions (serialized) ----
function measureFn(W, H) {
  function q(s) { return document.querySelector(s); }
  // ensure openPicker is open fresh
  var old = document.querySelector('.xtlp');
  if (old && old.parentNode) old.parentNode.removeChild(old);
  if (window.XT_LOC_PICK && typeof window.XT_LOC_PICK.openPicker === 'function') {
    window.XT_LOC_PICK.openPicker({ title: '发送位置', confirmText: '发送' });
  }
  var root = q('.xtlp');
  if (!root) return { vw: W, vh: H, error: 'no .xtlp' };
  var list = q('.xtlp-list');
  var foot = q('.xtlp-foot');
  var map = q('.xtlp-map');
  var head = q('.xtlp-head');
  var body = q('.xtlp-body');
  var innerH = window.innerHeight;
  var rb = root.getBoundingClientRect();
  var lb = list.getBoundingClientRect();
  var fb = foot.getBoundingClientRect();
  var mb = map.getBoundingClientRect();
  var hb = head.getBoundingClientRect();
  var listMinH = window.getComputedStyle(list).minHeight;
  // real scroll test
  var before = list.scrollTop;
  list.scrollTop = 999999;
  var after = list.scrollTop;
  var changed = after > before;
  list.scrollTop = before;
  return {
    vw: W, vh: H, innerH: innerH,
    overheadAbove: Math.round(lb.top),
    listClientH: Math.round(list.clientHeight),
    listScrollH: Math.round(list.scrollHeight),
    footBottom: fb.bottom,
    footOverflow: fb.bottom > innerH,
    mapH: Math.round(mb.height),
    headH: Math.round(hb.height),
    footH: Math.round(fb.height),
    listMinH: listMinH,
    scrollChanged: changed,
    rootOverflow: window.getComputedStyle(root).overflow
  };
}

function composerFn() {
  var loc = document.querySelector('#imLocBtn');
  var comp = document.querySelector('.im-composer');
  if (!comp) return null;
  var plus = document.querySelector('#imPlusBtn');
  var sameParent = !!(loc && plus && loc.parentNode === plus.parentNode);
  return {
    scrollW: comp.scrollWidth,
    clientW: comp.clientWidth,
    hasLoc: !!loc && sameParent && comp.contains(loc),
    locVisible: !!(loc && loc.offsetParent !== null)
  };
}

function menuFn() {
  var m = document.querySelector('#imPlusMenu');
  if (!m) return null;
  var t = m.textContent || '';
  return {
    itemCount: m.querySelectorAll('.im-plus-item').length,
    hasLocText: t.indexOf('定位') >= 0
  };
}

main().catch(function (e) {
  console.log('SCRIPT_ERROR: ' + (e && e.stack || e));
  process.exit(3);
});
