/* eslint-disable */
/**
 * R90 QA：验证「jsdom 的 location.replace 到不存在资源 = no-op」这一测试环境限制，
 * 并用「存在的目标页」做 back 参数真实闭环对照。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = 'D:\\下载的文件\\学习工作台';
const regPageSrc = fs.readFileSync(path.join(ROOT, '地区选择.html'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
function startServer() {
  return new Promise(function (resolve) {
    const srv = http.createServer(function (req, res) {
      let rel = '';
      try { rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, ''); } catch (e) {}
      const fp = path.join(ROOT, rel);
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!DOCTYPE html><title>404</title>');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
      res.end(fs.readFileSync(fp));
    });
    srv.listen(0, '127.0.0.1', function () { resolve({ srv: srv, port: srv.address().port }); });
  });
}

const PROBE = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>target</title>
<script>window.__TARGET_HIT = 'inline-ran';document.title='TARGET-HIT';</script>
</head><body><div id="probe">ok</div></body></html>`;

async function main() {
  const s0 = await startServer();
  const ORIGIN = 'http://127.0.0.1:' + s0.port;
  // 关键页面：地区选择.html + 一个「确定存在且可加载」的探针目标页
  fs.writeFileSync(path.join(ROOT, 'tools', 'qa', '_r90_probe_target.html'), PROBE);

  const dec = s => { try { return decodeURIComponent(String(s)); } catch (e) { return String(s); } };
  const stubRegion = {
    provinces: function () { return []; }, citiesOf: function () { return []; }, districtsOf: function () { return []; },
    textOf: function () { return ''; }, search: function () { return []; }, locate: function (cb) { cb({ ok: false }); }
  };

  // ---------- 测 1：replace 到「不存在的 个人中心.html」 ----------
  let d1 = new JSDOM(regPageSrc, {
    url: ORIGIN + '/%E5%9C%B0%E5%8C%BA%E9%80%89%E6%8B%A9.html',
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    VirtualConsole: new VirtualConsole()
  });
  d1.window.XT_REGION = stubRegion;
  await sleep(1000);
  try { d1.window.XtrPage.goBack(); } catch (e) {}
  await sleep(700);
  console.log('测1（默认 back=个人中心.html，服务器上无此文件）:');
  console.log('   href  = ' + d1.window.location.href);
  console.log('   title = ' + d1.window.document.title);
  console.log('   结论  = ' + (dec(d1.window.location.href).indexOf('地区选择.html') >= 0
    ? '仍停在原页 → jsdom 对「404 目标」的 replace 是 no-op（测试环境限制）'
    : '发生了跳转'));

  // ---------- 测 2：replace 到「存在」的目标页 ----------
  let d2 = new JSDOM(regPageSrc, {
    url: ORIGIN + '/%E5%9C%B0%E5%8C%BA%E9%80%89%E6%8B%A9.html?back=' + encodeURIComponent('tools/qa/_r90_probe_target.html'),
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    VirtualConsole: new VirtualConsole()
  });
  d2.window.XT_REGION = stubRegion;
  await sleep(1000);
  try { d2.window.XtrPage.goBack(); } catch (e) {}
  await sleep(900);
  console.log('测2（back=tools/qa/_r90_probe_target.html，文件真实存在）:');
  console.log('   href  = ' + d2.window.location.href);
  console.log('   title = ' + d2.window.document.title);
  console.log('   __TARGET_HIT = ' + d2.window.__TARGET_HIT);
  console.log('   结论  = ' + (String(d2.window.document.title) === 'TARGET-HIT'
    ? 'goBack() 真把页面换成了 back 指向的文档 → back 参数闭环成立'
    : '未跳转'));

  // ---------- 测 3：对照——无 back 参数时仍停在地区选择页（404 → no-op） ----------
  let d3 = new JSDOM(regPageSrc, {
    url: ORIGIN + '/%E5%9C%B0%E5%8C%BA%E9%80%89%E6%8B%A9.html',
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    VirtualConsole: new VirtualConsole()
  });
  d3.window.XT_REGION = stubRegion;
  await sleep(1000);
  // 用 window.__testBack 观察 state.back（通过 goBack 行为反推）：把 个人中心.html 换成探针页后应跳
  console.log('测3（服务器对 个人中心.html 返回 404 的状态码确认）:');
  const r = await new Promise(function (res) {
    http.get(ORIGIN + '/' + encodeURIComponent('个人中心.html'), function (resp) { res(resp.statusCode); });
  });
  console.log('   GET 个人中心.html → HTTP ' + r);
  console.log('   结论  = ' + (r === 404 ? 'jsdom 26+ 要求目标 isOK() 才换文档；404 时 no-op，属测试环境限制' : '意外'));

  fs.unlinkSync(path.join(ROOT, 'tools', 'qa', '_r90_probe_target.html'));
  s0.srv.close();
  console.log('DONE');
}
main().catch(function (e) { console.log('ERR ' + (e && e.stack || e)); });
