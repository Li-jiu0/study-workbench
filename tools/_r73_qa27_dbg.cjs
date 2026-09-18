const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('C:\\Users\\ATM\\node_modules\\jsdom');
const ROOT = 'D:\\下载的文件\\学习工作台';
const XT = fs.readFileSync(path.join(ROOT, 'assets/xt-profile.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const LEAK = { id: 2002, nickname: '小明', avatarUrl: '', motto: '南风知我意', bio: 'bio', city: '杭州', goal: '考公上岸', tags: ['a'], createdAt: '2026-01-02T03:04:05Z', isMe: false, isFriend: false, online: true, lastSeenAt: '2026-09-17T10:00:00Z', stats: { published: 3, likes: 12, comments: 1, views: 9 }, notes: [{}, {}], phone: '13800000000', email: 'leak@example.com', gender: '男', birthday: '2000-01-01', username: 'secret_user', privacy: { momentVisibility: 'all' }, token_version: 7, password_hash: '$2b$deadbeef' };
const html = '<!DOCTYPE html><html><body><div class="xtp-wrap"><div id="xtProfileRoot"></div></div><script>'
  + 'window.__cap={};window.__apiLog=[];window.isOnlineSession=function(){return false;};try{localStorage.setItem("study_workbench_token","FAKE");}catch(e){}'
  + 'window.api=function(p,o){window.__apiLog.push(p);if(p.indexOf("/api/moments/user/")===0)return Promise.resolve({items:[]});if(p.indexOf("/api/auth/me")===0)return Promise.resolve({});if(p.indexOf("/api/users/")===0)return Promise.resolve(' + JSON.stringify(LEAK) + ');return Promise.resolve({});};'
  + '</script><script>' + XT + '</script></body></html>';
const vc = new VirtualConsole();
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://127.0.0.1:9000/个人资料.html?user=2002', virtualConsole: vc, pretendToBeVisual: true });
setTimeout(() => {
  const el = dom.window.document.getElementById('xtProfileRoot');
  fs.writeFileSync(path.join(ROOT, 'tools', '_r73_qa27_ta_text.txt'), '=== TEXT ===\n' + el.textContent + '\n=== HTML ===\n' + el.innerHTML, 'utf8');
  const t = el.textContent;
  console.log('has 性别 tip:', t.indexOf('性别') >= 0);
  console.log('man count:', (t.match(/男/g) || []).length);
  console.log('genderWord count:', (t.match(/性别/g) || []).length);
  console.log('has >男< in html:', el.innerHTML.indexOf('>男<') >= 0);
  console.log('has 13800000000:', t.indexOf('13800000000') >= 0);
}, 250);
