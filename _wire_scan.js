const fs = require('fs');
const path = require('path');
const ROOT = 'D:\\下载的文件\\学习工作台';
const out = [];
const files = fs.readdirSync(ROOT).filter(f => f.toLowerCase().endsWith('.html')).sort();
out.push('ROOT HTML COUNT: ' + files.length);
out.push(files.join('\n'));
for (const f of files) {
  const p = path.join(ROOT, f);
  const src = fs.readFileSync(p, 'utf8');
  const hasSvc = src.includes('assets/ai-service.js');
  const hasCfg = src.includes('assets/ai-config.js');
  const hasPre = src.includes('assets/ai-presets.js');
  const hasBody = src.includes('</body>');
  // last </script>
  const lastScript = src.lastIndexOf('</script>');
  const bodyIdx = src.indexOf('</body>');
  let tailSample = '';
  if (lastScript >= 0) {
    tailSample = src.slice(Math.max(0, lastScript - 200), Math.min(src.length, lastScript + 40));
  }
  out.push('=== ' + f + ' | svc=' + hasSvc + ' cfg=' + hasCfg + ' pre=' + hasPre + ' body=' + hasBody +
    ' lastScript=' + lastScript + ' bodyIdx=' + bodyIdx);
}
fs.writeFileSync(path.join(ROOT, '_wire_scan.txt'), out.join('\n'), 'utf8');
