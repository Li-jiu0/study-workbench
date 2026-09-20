const jsdomPath = 'D:/下载的文件/学习工作台/tools/verifier/node_modules/jsdom';
try {
  const { JSDOM } = require(jsdomPath);
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="x">hi</div></body></html>');
  console.log('JSDOM_OK version_probe=' + (JSDOM.version || 'n/a'));
} catch (e) {
  console.log('JSDOM_FAIL ' + e.message);
}
