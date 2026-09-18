const fs = require('fs');
const crypto = require('crypto');
const files = [
  'D:/下载的文件/学习工作台/assets/xt-profile.js',
  'D:/下载的文件/学习工作台/assets/xt-profile.css'
];
const out = [];
for (const p of files) {
  const buf = fs.readFileSync(p);
  const md5 = crypto.createHash('md5').update(buf).digest('hex');
  const str = buf.toString('latin1');
  let crlf = 0, loneLF = 0, loneCR = 0;
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) === 10) {
      if (i > 0 && str.charCodeAt(i - 1) === 13) crlf++;
      else loneLF++;
    } else if (str.charCodeAt(i) === 13) {
      if (i + 1 >= str.length || str.charCodeAt(i + 1) !== 10) loneCR++;
    }
  }
  out.push(p);
  out.push('  size=' + buf.length);
  out.push('  md5=' + md5);
  out.push('  crlf=' + crlf + '  loneLF=' + loneLF + '  loneCR=' + loneCR);
}
fs.writeFileSync('D:/下载的文件/学习工作台/_r98_qa_fingerprint.txt', out.join('\n'), 'utf8');
