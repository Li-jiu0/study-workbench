var http = require('http');
var fs = require('fs');
var path = require('path');

var ROOT = 'D:/下载的文件/学习工作台/_w2t1_img';

var server = http.createServer(function (req, res) {
  var url = req.url.split('?')[0];
  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }
  if (url === '/design.pdf') {
    var b = fs.readFileSync('C:/Users/ATM/Documents/模拟面试页面重构.pdf');
    res.writeHead(200, { 'Content-Type': 'application/pdf' });
    res.end(b);
    return;
  }
  if (url === '/pdf.min.js' || url === '/pdf.worker.min.js') {
    var f = path.join(ROOT, url.slice(1));
    if (fs.existsSync(f)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(fs.readFileSync(f));
      return;
    }
  }
  res.writeHead(404); res.end('nf');
});

var HTML = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;background:#888}canvas{display:block;margin:4px auto}</style></head><body>' +
  '<script src="/pdf.min.js"><\/script>' +
  '<script>' +
  'var q = new URLSearchParams(location.search);' +
  'var scale = parseFloat(q.get("s") || "1.2");' +
  'pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";' +
  'pdfjsLib.getDocument("/design.pdf").promise.then(function(pdf){' +
  '  var n = pdf.numPages; var i = 1;' +
  '  function next(){ if(i>n) { document.title="DONE"; return; }' +
  '    pdf.getPage(i).then(function(page){' +
  '      var vp = page.getViewport({scale: scale});' +
  '      var c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;' +
  '      document.body.appendChild(c);' +
  '      page.render({canvasContext: c.getContext("2d"), viewport: vp}).promise.then(function(){ i++; next(); });' +
  '    });' +
  '  } next();' +
  '}).catch(function(e){ document.body.textContent = "ERR " + e; });' +
  '<\/script></body></html>';

server.listen(8971, '127.0.0.1', function () {
  fs.writeFileSync(path.join(ROOT, '_server_up.txt'), 'up', 'utf8');
});
