const fs=require('fs');
const ROOT='D:/下载的文件/学习工作台';
const all=fs.readdirSync(ROOT);
const html=all.filter(n=>n.toLowerCase().endsWith('.html') && !n.includes('.bak'));
let out='';
for(const n of html){
  const b=Buffer.from(n,'utf8');
  out += n+' | hex '+b.toString('hex')+'\n';
}
out += '\nTOTAL html (non-bak): '+html.length+'\n';
fs.writeFileSync('D:/下载的文件/学习工作台/tools/_r73_qa23_ls_out.txt',out,'utf8');
