
const fs = require('fs');
const src = fs.readFileSync('assets/voiceplayer.js', 'utf8');

// 1) 抽取 SCENE_GROUPS 定义
const gm = src.match(/var SCENE_GROUPS\s*=\s*(\[[\s\S]*?\]);/);
console.log('SCENE_GROUPS found:', !!gm);
if (gm) {
  try { const g = eval(gm[1]); console.log('  groups =', g.map(x=>x.k).join(',')); }
  catch(e){ console.log('  eval err', e.message); }
}

// 2) 检查 S 初始化里的收放字段
const i1 = src.indexOf('catsOpen');
const around = src.substring(i1-300, i1+300);
console.log('\n=== S 初始化附近 ===');
console.log(around.replace(/\r/g,''));
