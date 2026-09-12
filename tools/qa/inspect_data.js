'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const t = fs.readFileSync(path.join(ROOT, 'data', 'mock-papers.js'), 'utf8');

// 把 mock-papers.js 在沙箱执行，拿到真实数据对象
const vm = require('vm');
const sandbox = { window: {}, console, localStorage: { getItem: () => null, setItem: () => {} } };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(t, sandbox, { filename: 'mock-papers.js' });

const data = sandbox.MOCK_PAPERS_DATA;
console.log('顶层 keys:', Object.keys(data));
['cet4', 'exam'].forEach((cat) => {
  console.log('\n[' + cat + '] papers:');
  (data[cat].papers || []).forEach((p) => console.log('   id=' + p.id + '  title=' + (p.title || '')));
});
console.log('\nMOCK_CAT_ALIAS =', JSON.stringify(sandbox.window.MOCK_CAT_ALIAS));

// 交叉校验 findPaperCategory 的返回
const cats = ['cet4', 'exam'];
const reverse = {};
cats.forEach((cat) => (data[cat].papers || []).forEach((p) => { reverse[p.id] = cat; }));
console.log('\npaperId -> findPaperCategory(应返回):');
Object.keys(reverse).forEach((id) => console.log('   ' + id + ' -> ' + reverse[id]));
