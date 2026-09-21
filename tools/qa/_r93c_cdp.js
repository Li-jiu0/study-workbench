/**
 * R93-C CDP verification: error-state circle icon is the APP brand icon
 * (book-open), not alert-triangle; latest-state circle keeps check-circle.
 *
 * Assertions:
 *   C1 error state reached (backend absent -> 404)
 *   C2 .xt-up-icon-bad contains svg, width=26
 *   C3 svg innerHTML === LUCIDE_ICONS['book-open'] rendered inner  <-- KEY
 *   C4 brand block .xt-up-brand-icon svg intact
 *   C5 (stub same version) latest state: .xt-up-icon-ok svg === LUCIDE_ICONS['check-circle']
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
var PORT = 9341;
var PROFILE = path.join(os.tmpdir(), 'r93ccdp_' + Date.now());

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

/* In-page: probe circle icons and compare svg inner against icon-map templates. */
var probeFn = function () {
  function svgInner(sel) {
    var el = document.querySelector(sel);
    if (!el) return null;
    var svg = el.querySelector('svg');
    if (!svg) return { svg: false };
    return { svg: true, w: svg.getAttribute('width'), inner: svg.innerHTML };
  }
  function tmplInner(name) {
    var raw = (window.LUCIDE_ICONS && window.LUCIDE_ICONS[name]) || '';
    if (!raw) return null;
    // normalize through the DOM serializer so `/>` self-closing tags compare equal
    var box = document.createElement('div');
    box.innerHTML = raw;
    var svg = box.querySelector('svg');
    return svg ? svg.innerHTML : null;
  }
  return {
    title: (document.querySelector('#xtUpdateRoot .xt-up-title') || {}).textContent || null,
    bad: svgInner('.xt-up-icon-bad'),
    ok: svgInner('.xt-up-icon-ok'),
    brand: svgInner('.xt-up-brand-icon'),
    bookOpenTmpl: tmplInner('book-open'),
    checkCircleTmpl: tmplInner('check-circle'),
    alertTmpl: tmplInner('alert-triangle')
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
    source: "try{localStorage.setItem('study_workbench_auth', JSON.stringify({account:'qa_r93c',loginAt:Date.now()}));" +
            "localStorage.setItem('study_workbench_token','qa_r93c_token');" +
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

  console.log('=== R93-C CDP circle-icon verification (更新.html, real Chrome) ===');

  // Phase 1: error state
  var P1 = await probe();
  console.log('--- Phase 1: error state (backend absent) ---');
  ok('C1 error state reached (检测失败)', P1 && P1.title === '检测失败', 'title=' + (P1 && P1.title));
  ok('C2 .xt-up-icon-bad has svg width=26', !!(P1 && P1.bad && P1.bad.svg && P1.bad.w === '26'),
     'w=' + (P1 && P1.bad && P1.bad.w));
  ok('C3 circle svg === book-open template (APP icon)',
     !!(P1 && P1.bad && P1.bad.inner && P1.bad.inner === P1.bookOpenTmpl),
     (P1 && P1.bad && P1.bad.inner === P1.bookOpenTmpl) ? 'matched' :
       'inner=' + JSON.stringify(P1 && P1.bad && P1.bad.inner && P1.bad.inner.slice(0, 80)));
  ok('C3b circle svg is NOT alert-triangle',
     !!(P1 && P1.bad && P1.bad.inner && P1.bad.inner !== P1.alertTmpl));
  ok('C4 brand block svg intact', !!(P1 && P1.brand && P1.brand.svg),
     'w=' + (P1 && P1.brand && P1.brand.w));

  // Phase 2: latest state (same version stub)
  var r2 = await ws.call('Runtime.evaluate', {
    expression: '(' + stubAndRecheckFn.toString() + ')(' +
      JSON.stringify('{"version":"1.24","versionCode":24,"apkUrl":"https://example.com/x.apk","notes":["n"],"publishedAt":"2026-09-19","forced":false}') + ')',
    returnByValue: true
  });
  await sleep(700);
  var P2 = await probe();
  console.log('--- Phase 2: latest state (stub v1.24) ---');
  ok('C5a recheck ran', r2 && r2.result && r2.result.value === 'recheck-called', String(r2 && r2.result && r2.result.value));
  ok('C5b latest circle svg === check-circle (untouched)',
     !!(P2 && P2.ok && P2.ok.svg && P2.ok.inner === P2.checkCircleTmpl),
     'title=' + (P2 && P2.title));
  ok('C5c brand block svg intact', !!(P2 && P2.brand && P2.brand.svg));

  console.log('SUMMARY pass=' + pass + ' fail=' + fail);
  console.log(fail === 0 ? 'R93C_CDP_PASS' : 'R93C_CDP_FAIL');

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
