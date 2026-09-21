const fs = require('fs');
const ROOT = 'D:/下载的文件/学习工作台';
const out = [];
function w(s){ out.push(s); }
function ctx(code, pat, before, after, max){
  const re = new RegExp(pat,'g'); const lines = code.split('\n'); let n=0,m,res=[];
  while((m=re.exec(code))&&n<(max||10)){
    const ln = code.slice(0,m.index).split('\n').length;
    res.push('--- L'+ln+' ---');
    for(let i=Math.max(0,ln-1-before);i<Math.min(lines.length,ln+after);i++) res.push('  L'+(i+1)+': '+lines[i].slice(0,200));
    n++;
  }
  return res.join('\n');
}
const page = fs.readFileSync(ROOT+'/assets/ai-page.js','utf8');
const settings = fs.readFileSync(ROOT+'/assets/ai-settings.js','utf8');
w('===== ai-page.js: AUDIO_MODELS_KEY 用法 =====');
w(ctx(page, 'AUDIO_MODELS_KEY', 2, 8, 8));
w('');
w('===== ai-page.js: input.audio 赋值上下文 =====');
w(ctx(page, 'input\\.audio', 3, 6, 6));
w('');
w('===== ai-page.js: .audio 全部上下文 =====');
w(ctx(page, '\\.audio', 3, 4, 10));
w('');
w('===== ai-settings.js: AUDIO_MODELS_KEY 用法 =====');
w(ctx(settings, 'AUDIO_MODELS_KEY', 3, 10, 8));
w('');
w('===== ai-settings.js: 音频/声音 开关渲染线索 =====');
w(ctx(settings, '声音|audio-toggle|ai-audio|带声音|sound', 3, 8, 10));
fs.writeFileSync('C:/Users/ATM/_r93_audio_struct_out.txt', out.join('\n'),'utf8');
