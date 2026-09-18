'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), cp = require('child_process'), os = require('os');
var crypto = require('crypto'), net = require('net');
var ROOT = path.resolve(__dirname, '..', '..');
var PORT = 9334;
var PROFILE = path.join(os.tmpdir(), 'r90dbg_' + Date.now());

function fileUrl(rel) { return 'file:///' + path.join(ROOT, rel).replace(/\\/g, '/'); }
function httpGet(u) { return new Promise(function (res, rej) { http.get(u, function (r) { var d=''; r.on('data',function(c){d+=c;}); r.on('end',function(){res(d);}); }).on('error', rej); }); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function wsConnect(wsUrl) {
  return new Promise(function (resolve, reject) {
    var m = wsUrl.match(/^ws:\/\/([^/:]+):(\d+)(\/.*)$/);
    var host = m[1], port = parseInt(m[2],10), p = m[3];
    var key = crypto.randomBytes(16).toString('base64');
    var sock = net.connect(port, host, function () {
      sock.write('GET ' + p + ' HTTP/1.1\r\nHost: ' + host + ':' + port + '\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
    });
    var buf = Buffer.alloc(0), hs = false, handlers = [];
    sock.on('data', function (chunk) {
      buf = Buffer.concat([buf, chunk]);
      if (!hs) { var idx = buf.indexOf('\r\n\r\n'); if (idx < 0) return; hs = true; buf = buf.slice(idx+4); resolve(api); }
      while (buf.length >= 2) {
        var b0 = buf[0], b1 = buf[1], len = b1 & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) break;
        var payload = buf.slice(off, off+len); buf = buf.slice(off+len);
        if ((b0 & 0x0f) === 1) { var h = handlers.shift(); if (h) { try { h(JSON.parse(payload.toString('utf8'))); } catch (e) { h(null); } } }
      }
    });
    sock.on('error', reject);
    var idc = 1;
    var api = {
      call: function (method, params) {
        var id = idc++;
        var payload = Buffer.from(JSON.stringify({ id: id, method: method, params: params || {} }), 'utf8');
        var mask = crypto.randomBytes(4), header;
        if (payload.length < 126) { header = Buffer.from([0x81, 0x80 | payload.length]); }
        else if (payload.length < 65536) { header = Buffer.alloc(4); header[0]=0x81; header[1]=0x80|126; header.writeUInt16BE(payload.length,2); }
        else { header = Buffer.alloc(10); header[0]=0x81; header[1]=0x80|127; header.writeBigUInt64BE(BigInt(payload.length),2); }
        var masked = Buffer.alloc(payload.length);
        for (var i=0;i<payload.length;i++) masked[i] = payload[i] ^ mask[i%4];
        return new Promise(function (res) { handlers.push(res); sock.write(Buffer.concat([header, mask, masked])); });
      },
      close: function () { try { sock.end(); } catch (e) {} }
    };
  });
}
function cands() {
  var out = [];
  [process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA,'Google','Chrome','Application','chrome.exe') : null,
   'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].forEach(function(b){ if (b && fs.existsSync(b)) out.push(b); });
  return out;
}
async function main() {
  var exe = cands()[0];
  fs.mkdirSync(PROFILE, { recursive: true });
  var child = cp.spawn(exe, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port='+PORT,'--user-data-dir='+PROFILE,'--allow-file-access-from-files','about:blank'], { stdio: 'ignore' });
  var listRaw = null;
  for (var i=0;i<60;i++){ try { listRaw = await httpGet('http://127.0.0.1:'+PORT+'/json/list'); if (listRaw && listRaw.indexOf('webSocketDebuggerUrl')>=0) break; } catch(e){} await sleep(250); }
  var list = JSON.parse(listRaw); var target = list.find(function(t){return t.type==='page';}) || list[0];
  var ws = await wsConnect(target.webSocketDebuggerUrl);
  await ws.call('Page.enable'); await ws.call('Runtime.enable');
  // collect console
  var logs = [];
  await ws.call('Log.enable').catch(function(){});
  await ws.call('Page.navigate', { url: fileUrl('私聊.html') });
  await sleep(2500);
  var probes = [
    'document.readyState',
    'typeof window.XT_LOC_PICK',
    'window.XT_LOC_PICK ? typeof window.XT_LOC_PICK.openPicker : "n/a"',
    'document.querySelectorAll("#imPlusMenu .im-plus-item").length',
    '!!document.querySelector("#imLocBtn")',
    'document.querySelector("#imLocBtn") && document.querySelector("#imLocBtn").getAttribute("onclick")',
    'document.querySelectorAll("script").length',
    '(window.XT_REGION?1:0)',
    'location.href'
  ];
  for (var k=0;k<probes.length;k++){
    var r = await ws.call('Runtime.evaluate', { expression: probes[k], returnByValue: true });
    console.log(probes[k], '=>', JSON.stringify(r && r.result && (r.result.value !== undefined ? r.result.value : r.result)));
  }
  ws.close(); try { child.kill(); } catch(e){}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
}
main().catch(function(e){ console.log('ERR', e && e.stack || e); process.exit(3); });
