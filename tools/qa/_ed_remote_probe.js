const fs = require('fs');
(async () => {
  const out = [];
  const paths = ['/', '/社区.html', '/学习博客.html', '/英语.html', '/四级备考.html', '/演示.html', '/PPT训练.html', '/assets/app.js', '/assets/common.css'];
  for (const p of paths) {
    try {
      const r = await fetch('http://110.42.134.62' + encodeURI(p), { headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' } });
      const t = await r.text();
      out.push(p + '  status=' + r.status + '  bytes=' + t.length);
      if (p === '/') {
        out.push('   含"公考导师"=' + (t.indexOf('公考导师') >= 0) + '  含"GO_HOME_NEW"=' + (t.indexOf('社区.html') >= 0));
        const m = t.match(/\?v=(20\d{6}[A-Za-z]?)/);
        out.push('   首页版本戳 = ' + (m ? m[1] : '未取到'));
      }
      if (p === '/assets/app.js') {
        out.push('   app.js 含 学习博客.html=' + (t.indexOf('学习博客.html') >= 0) + '  含 社区.html=' + (t.indexOf('社区.html') >= 0));
        out.push('   app.js bytes=' + t.length);
      }
      if (p === '/assets/common.css') {
        out.push('   common.css 含 "min-width: 160px"=' + (t.indexOf('min-width: 160px') >= 0) + '  含 "min-width: 140px"=' + (t.indexOf('min-width: 140px') >= 0));
      }
    } catch (e) { out.push(p + '  FETCH_FAIL ' + e.message); }
  }
  fs.writeFileSync('C:\\Users\\ATM\\_ed_remote_probe.txt', out.join('\n'), 'utf8');
  console.log('DONE');
})();
