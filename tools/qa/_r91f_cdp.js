/**
 * R91-F CDP verification: status-card icons render on 更新.html (real Chrome).
 *
 * Fix under test (assets/xt-update.js): paintIcons() helper calling
 * window.lucideAutoRender() after every dynamic innerHTML that injects
 * [data-icon] nodes (renderNew/renderLatest/renderStarting/renderError +
 * applySettingsState x4 + startDownload + restoreBtn).
 *
 * Assertions:
 *   S1 error state (natural: no backend -> 404): .xt-up-icon-bad contains svg
 *   S2 latest state (fetch stub returns same version): .xt-up-icon-ok contains svg
 *   S3 new state (fetch stub returns higher version): action button contains svg
 *   S4 R89-C brand block regression: .xt-up-brand-icon svg present in all phases
 */
'use strict';

var fs = require('fs');
var path = require('path');
var http = require('http');
var cp = require('child_process');
var os = require('os');
var crypto = require('crypto');
var net = require('net');

var ROOT = path.resolve(__dirname, '..', '..');
var CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
var PORT = 9339;
var PROFILE = path.join(os.tmpdir(), 'r91fcdp_' + Date.now());

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

function findTarget(listRaw) {
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

/* ---- in-page helpers (serialized via toString) ---- */

var probeFn = function () {
  function info(sel) {
    var el = document.querySelector(sel);
    if (!el) return null;
    var svgs = el.querySelectorAll('svg');
    var r = el.getBoundingClientRect();
    return { svgCount: svgs.length, w: Math.round(r.width), h: Math.round(r.height),
             firstSvgW: svgs.length ? svgs[0].getAttribute('width') : null };
  }
  return {
    href: location.href.split('/').pop(),
    errorIcon: info('.xt-up-icon-bad'),
    okIcon: info('.xt-up-icon-ok'),
    actionBtnSvg: info('#xtUpdateRoot .xt-up-actions'),
    brandIcon: info('.xt-up-brand-icon'),
    stateTitle: (document.querySelector('#xtUpdateRoot .xt-up-title') || {}).textContent || null
  };
};

var stubAndRecheckFn = function (versionJson) {
  window.fetch = function () {
    return Promise.resolve({
      ok: true, status: 200,
      json: function () { return Promise.resolve(JSON.parse(versionJson)); }
    });
  };
  try { XTUpdate.recheck(); } catch (e) { return 'recheck-error:' + e.message; }
  return 'recheck-called';
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
    '--window-size=375,800', 'about:blank'
  ];
  var child = cp.spawn(exe, args, { stdio: 'ignore' });

  var listRaw = null;
  for (var i = 0; i < 60; i++) {
    try { listRaw = await httpGet('http://127.0.0.1:' + PORT + '/json/list'); if (listRaw && listRaw.indexOf('webSocketDebuggerUrl') >= 0) break; } catch (e) {}
    await sleep(250);
  }
  if (!listRaw) { console.log('CDP_NOT_UP'); try { child.kill(); } catch (e) {} try { srv.close(); } catch (e) {} process.exit(2); }

  var target = findTarget(listRaw);
  var ws = await wsConnect(target.webSocketDebuggerUrl);
  await ws.call('Page.enable');
  await ws.call('Runtime.enable');

  await ws.call('Page.addScriptToEvaluateOnNewDocument', {
    source: "try{localStorage.setItem('study_workbench_auth', JSON.stringify({account:'qa_r91f',loginAt:Date.now()}));" +
            "localStorage.setItem('study_workbench_token','qa_r91f_token');" +
            "localStorage.setItem('study_workbench_uid','1');" +
            "localStorage.setItem('study_workbench_user', JSON.stringify({nickname:'QA'}));}catch(e){}"
  });

  var PAGE = 'http://127.0.0.1:' + SRV_PORT + '/' + encodeURIComponent('更新.html');
  await ws.call('Page.navigate', { url: PAGE });
  await sleep(3500);

  var pass = 0, fail = 0;
  function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name + (detail ? '  :: ' + detail : '')); }
    else { fail++; console.log('  FAIL  ' + name + (detail ? '  :: ' + detail : '')); }
  }

  async function probe() {
    var r = await ws.call('Runtime.evaluate', { expression: '(' + probeFn.toString() + ')()', returnByValue: true });
    return (r && r.result && r.result.value) || null;
  }
  async function recheck(versionJson) {
    var expr = '(' + stubAndRecheckFn.toString() + ')(' + JSON.stringify(versionJson) + ')';
    var r = await ws.call('Runtime.evaluate', { expression: expr, returnByValue: true });
    return (r && r.result && r.result.value) || null;
  }

  console.log('=== R91-F CDP status-card icon verification (更新.html, real Chrome) ===');

  // ---- Phase 1: natural error state (no backend) ----
  var P1 = await probe();
  console.log('--- Phase 1: error state (backend absent) ---');
  ok('S1a page stayed on 更新.html', P1 && P1.href && P1.href.indexOf('%E6%9B%B4%E6%96%B0') >= 0, 'href=' + (P1 && P1.href));
  ok('S1b error state reached (检测失败)', P1 && P1.stateTitle === '检测失败', 'title=' + (P1 && P1.stateTitle));
  ok('S1c .xt-up-icon-bad contains rendered svg', !!(P1 && P1.errorIcon && P1.errorIcon.svgCount >= 1),
     JSON.stringify(P1 && P1.errorIcon));
  ok('S1d brand block svg intact (R89-C regression)', !!(P1 && P1.brandIcon && P1.brandIcon.svgCount >= 1),
     JSON.stringify(P1 && P1.brandIcon));

  // ---- Phase 2: latest state via fetch stub (same version) ----
  var r2 = await recheck('{"version":"1.24","versionCode":24,"apkUrl":"https://example.com/x.apk","notes":["n"],"publishedAt":"2026-09-19","forced":false}');
  await sleep(700);
  var P2 = await probe();
  console.log('--- Phase 2: latest state (stub v1.24) ---');
  ok('S2a recheck ran', r2 === 'recheck-called', String(r2));
  ok('S2b latest state reached (已是最新版本)', P2 && P2.stateTitle === '已是最新版本', 'title=' + (P2 && P2.stateTitle));
  ok('S2c .xt-up-icon-ok contains rendered svg', !!(P2 && P2.okIcon && P2.okIcon.svgCount >= 1),
     JSON.stringify(P2 && P2.okIcon));
  ok('S2d brand block svg intact', !!(P2 && P2.brandIcon && P2.brandIcon.svgCount >= 1));

  // ---- Phase 3: new state via fetch stub (higher version) ----
  var r3 = await recheck('{"version":"9.9.9","versionCode":999,"apkUrl":"https://example.com/x.apk","notes":["n"],"publishedAt":"2026-09-19","forced":false}');
  await sleep(700);
  var P3 = await probe();
  console.log('--- Phase 3: new state (stub v9.9.9) ---');
  ok('S3a recheck ran', r3 === 'recheck-called', String(r3));
  ok('S3b action button contains rendered svg', !!(P3 && P3.actionBtnSvg && P3.actionBtnSvg.svgCount >= 1),
     JSON.stringify(P3 && P3.actionBtnSvg));
  ok('S3c brand block svg intact', !!(P3 && P3.brandIcon && P3.brandIcon.svgCount >= 1));

  console.log('SUMMARY pass=' + pass + ' fail=' + fail);
  console.log(fail === 0 ? 'R91F_CDP_PASS' : 'R91F_CDP_FAIL');

  try { ws.close(); } catch (e) {}
  try { child.kill(); } catch (e) {}
  try { srv.close(); } catch (e) {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(function (e) {
  console.log('FATAL ' + (e && e.message ? e.message : String(e)));
  process.exit(3);
});
