// 验证：defer 脚本执行时 document.readyState 的值，以及 DOMContentLoaded 时脚本是否都已执行
const { JSDOM } = require('jsdom');
const fs = require('fs');

const html = `<!DOCTYPE html><html><head>
<script defer>A_READYSTATE = document.readyState; window.__log = window.__log||[]; window.__log.push('A rs='+document.readyState);</script>
<script defer>B_READYSTATE = document.readyState; window.__log.push('B rs='+document.readyState);</script>
</head><body></body></html>`;

const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'file:///x/y.html' });
dom.window.addEventListener('DOMContentLoaded', () => {
  const w = dom.window;
  const out = {
    A: w.A_READYSTATE, B: w.B_READYSTATE, log: w.__log,
    atDCL: w.document.readyState
  };
  fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
  process.exit(0);
});
