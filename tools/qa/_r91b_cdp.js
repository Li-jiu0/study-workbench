/**
 * R91-B CDP verification: plus-menu vs bottom-nav stacking on 私聊.html.
 *
 * Fix under test (#imPlusCss in 私聊.html):
 *   .im-plus-mask  z-index 60  -> 210
 *   .im-plus-menu  z-index 61  -> 211
 *   .im-loc-sheet  z-index 80  -> 215
 * Baseline: .bottom-nav z-index = 200 (assets/common.css L1289, locked file).
 *
 * Acceptance per viewport (375x667 / 375x480 / 320x480 / 320x400):
 *   V1 nav visible (display block) and navZ === 200
 *   V2 maskZ === 210 and menuZ === 211 (both > navZ)
 *   V3 item4 (定位) rect: h > 0 and bottom <= viewport height (not clipped)
 *   V4 elementFromPoint at item4 center resolves inside #imPlusMenu
 *      (i.e. NOT intercepted by .bottom-nav)  <-- KEY anti-overlap proof
 *   V5 .im-loc-sheet stylesheet rule z-index === 215
 *
 * Raw CDP over WebSocket (no puppeteer), same infra as r90_item3_cdp.js.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var http = require('http');
var cp = require('child_process');
var os = require('os');

var ROOT = path.resolve(__dirname, '..', '..');
var CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
var PORT = 9337;
var PROFILE = path.join(os.tmpdir(), 'r91bcdp_' + Date.now());

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
    var pending = {};
    sock.on('data', function (chunk) {
      buf = Buffer.concat([buf, chunk]);
      if (!handshaken) {
        var idx = buf.indexOf('\r\n\r\n');
        if (idx < 0) return;
        handshaken = true;
        buf = buf.slice(idx + 4);
        resolve(api);
      }
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
            r(obj.result !== undefined ? obj.result : obj);
          }
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

/* In-page measurement: open a conversation (id=1 学习搭子·小星) if needed,
   then open plus menu, wait for transition, measure everything. */
var measureFn = function (W, H) {
  return new Promise(function (res) {
    var btn = document.querySelector('#imPlusBtn');
    if (!btn) { res({ vw: W, vh: H, err: 'no-btn' }); return; }
    var m0 = document.querySelector('#imPlusMenu');
    // conversation view may be hidden (empty state) -> open chat with friend id=1
    var conv = document.querySelector('#imConv');
    var convVisible = !conv || (conv.offsetParent !== null || getComputedStyle(conv).display !== 'none');
    var proceed = function () {
      var m = document.querySelector('#imPlusMenu');
      var b = document.querySelector('#imPlusBtn');
      // normalize toggle state: close if open, then open fresh
      if (m && m.classList.contains('open')) {
        b.click();
        setTimeout(function () { document.querySelector('#imPlusBtn').click(); setTimeout(measureNow, 450); }, 300);
      } else {
        b.click();
        setTimeout(measureNow, 450);
      }
    };
    var measureNow = function () {
      var m = document.querySelector('#imPlusMenu');
      var mk = document.querySelector('#imPlusMask');
      var nav = document.querySelector('.bottom-nav');
      var items = document.querySelectorAll('#imPlusMenu .im-plus-item');
      var out = { vw: W, vh: H };
      function rect(el) {
        var r = el.getBoundingClientRect();
        return { t: Math.round(r.top * 10) / 10, b: Math.round(r.bottom * 10) / 10,
                 l: Math.round(r.left * 10) / 10, r: Math.round(r.right * 10) / 10,
                 w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
      }
      out.menuOpen = !!(m && m.classList.contains('open'));
      out.menuZ = m ? getComputedStyle(m).zIndex : null;
      out.maskZ = mk ? getComputedStyle(mk).zIndex : null;
      out.navDisplay = nav ? getComputedStyle(nav).display : null;
      out.navZ = nav ? getComputedStyle(nav).zIndex : null;
      out.navRect = nav ? rect(nav) : null;
      out.menuRect = m ? rect(m) : null;
      out.itemCount = items.length;
      if (items.length >= 4) {
        out.item4 = rect(items[3]);
        out.item4Text = (items[3].textContent || '').trim();
        var cx = (out.item4.l + out.item4.r) / 2;
        var cy = (out.item4.t + out.item4.b) / 2;
        var hit = document.elementFromPoint(cx, cy);
        out.hitDesc = hit ? (hit.tagName + '.' + (typeof hit.className === 'string' ? hit.className : '')) : null;
        out.hitInMenu = !!(hit && m.contains(hit));
      }
      // stylesheet rule check for .im-loc-sheet z-index
      var locZ = null;
      try {
        for (var i = 0; i < document.styleSheets.length; i++) {
          var rules = null;
          try { rules = document.styleSheets[i].cssRules; } catch (e) { continue; }
          if (!rules) continue;
          for (var j = 0; j < rules.length; j++) {
            if (rules[j].selectorText === '.im-loc-sheet') locZ = rules[j].style.zIndex;
          }
        }
      } catch (e) {}
      out.locSheetZ = locZ;
      res(out);
    };
    // kick off: open conversation first (empty state hides #imConv / composer)
    if (!convVisible && typeof window.imOpenChat === 'function') {
      try { window.imOpenChat(1); } catch (e) {}
      setTimeout(proceed, 700);
    } else {
      setTimeout(proceed, 50);
    }
  });
};

async function main() {
  var exe = candidates()[0] || CHROME;
  if (!fs.existsSync(exe)) { console.log('NO_CHROME at ' + exe); process.exit(2); }
  fs.mkdirSync(PROFILE, { recursive: true });

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

  await ws.call('Page.addScriptToEvaluateOnNewDocument', {
    source: "try{localStorage.setItem('study_workbench_auth', JSON.stringify({account:'qa_r91b',loginAt:Date.now()}));" +
            "localStorage.setItem('study_workbench_token','qa_r91b_token');" +
            "localStorage.setItem('study_workbench_uid','1');" +
            "localStorage.setItem('study_workbench_user', JSON.stringify({nickname:'QA'}));}catch(e){}" +
            "window.__XT_PROD__=true;"
  });

  var PAGE = 'http://127.0.0.1:' + SRV_PORT + '/' + encodeURIComponent('私聊.html');
  await ws.call('Page.navigate', { url: PAGE });
  await sleep(2500);

  var results = [];
  for (var v = 0; v < VIEWPORTS.length; v++) {
    var W = VIEWPORTS[v][0], H = VIEWPORTS[v][1];
    await ws.call('Emulation.setDeviceMetricsOverride', {
      width: W, height: H, deviceScaleFactor: 1, mobile: true
    });
    await sleep(250);
    var expr = '(' + measureFn.toString() + ')(' + W + ',' + H + ')';
    var r = await ws.call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    var val = (r && r.result && r.result.value) || null;
    if (val) results.push(val);
    else results.push({ vw: W, vh: H, error: (r && r.result && (r.result.description || r.result.type)) || 'no-value' });
  }

  // ---- assertions ----
  var pass = 0, fail = 0;
  function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name + (detail ? '  :: ' + detail : '')); }
    else { fail++; console.log('  FAIL  ' + name + (detail ? '  :: ' + detail : '')); }
  }
  console.log('=== R91-B CDP stacking verification (私聊.html vs .bottom-nav z=200) ===');
  for (var k = 0; k < results.length; k++) {
    var R = results[k];
    console.log('--- viewport ' + R.vw + 'x' + R.vh + ' ---');
    if (R.error) { ok('no-error', false, R.error); continue; }
    ok('V1 nav visible + z=200', R.navDisplay === 'block' && R.navZ === '200',
       'display=' + R.navDisplay + ' z=' + R.navZ);
    ok('V2a mask z=210', R.maskZ === '210', 'maskZ=' + R.maskZ);
    ok('V2b menu z=211 > nav', R.menuZ === '211' && parseInt(R.menuZ, 10) > parseInt(R.navZ, 10),
       'menuZ=' + R.menuZ);
    ok('V2c menuOpen', R.menuOpen === true, 'open=' + R.menuOpen);
    ok('V2d maskZ > navZ', parseInt(R.maskZ, 10) > parseInt(R.navZ, 10), 'mask=' + R.maskZ + ' nav=' + R.navZ);
    if (R.item4) {
      ok('V3 item4(定位) fully in viewport', R.item4.h > 0 && R.item4.b <= R.vh + 0.5,
         'text=' + R.item4Text + ' rect=' + JSON.stringify(R.item4));
      ok('V4 item4 hit-test inside menu (not covered by tabbar)',
         R.hitInMenu === true, 'hit=' + R.hitDesc);
      if (R.navRect) {
        ok('V5 item4 extends over tabbar zone (z-covered, visible)', R.item4.b > R.navRect.t,
           'item4.b=' + R.item4.b + ' nav.t=' + R.navRect.t);
      }
    } else {
      ok('item4 exists', false, 'itemCount=' + R.itemCount);
    }
    ok('V6 .im-loc-sheet z=215', R.locSheetZ === '215', 'locSheetZ=' + R.locSheetZ);
  }
  console.log('SUMMARY pass=' + pass + ' fail=' + fail);
  console.log(fail === 0 ? 'R91B_CDP_PASS' : 'R91B_CDP_FAIL');

  try { ws.close(); } catch (e) {}
  try { child.kill(); } catch (e) {}
  try { srv.close(); } catch (e) {}
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(function (e) {
  console.log('FATAL ' + (e && e.message ? e.message : String(e)));
  process.exit(3);
});
