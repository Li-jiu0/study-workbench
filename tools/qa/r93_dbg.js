
const fs=require('fs');const path=require('path');const {JSDOM}=require('jsdom');
const ROOT='D:/下载的文件/学习工作台';
let html=fs.readFileSync(path.join(ROOT,'ai-settings.html'),'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g,'');
const dom=new JSDOM(html,{url:'http://localhost/ai-settings.html',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;
w.fetch=function(){return new Promise(function(){});};w.alert=function(){};w.confirm=function(){return false;};
w.eval(fs.readFileSync(path.join(ROOT,'assets/ai-config.js'),'utf8'));
w.eval(fs.readFileSync(path.join(ROOT,'assets/ai-settings.js'),'utf8'));
setTimeout(function(){
  const doc=w.document;const OUT=[];
  try{
    w.xtAiSettings.switchTab('models');
    doc.getElementById('setRestoreDefault').click();
    const sel=doc.getElementById('setSortCatInner');
    sel.value='proxy';
    doc.querySelector('[data-sort-act="cat"]').click();
    OUT.push('after cat: '+JSON.stringify(w.xtAiSettings.getState().lastSort));
    const cb=doc.querySelector('[data-sort-act="catclear"]');
    OUT.push('catclear exists='+!!cb);
    if(cb){cb.click();}
    OUT.push('after clear: '+JSON.stringify(w.xtAiSettings.getState().lastSort));
  }catch(e){OUT.push('EXC '+(e&&e.stack||e));}
  fs.writeFileSync(path.join(ROOT,'tools/qa/_r93_dbg.txt'),OUT.join('\n'),'utf8');
},400);
