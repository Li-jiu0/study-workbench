'use strict';
var fs=require('fs'),path=require('path'),http=require('http'),cp=require('child_process'),os=require('os'),crypto=require('crypto'),net=require('net');
var ROOT=path.resolve(__dirname,'..','..'),PORT=9335,PROFILE=path.join(os.tmpdir(),'r90dbg2_'+Date.now());
function fu(r){return 'file:///'+path.join(ROOT,r).replace(/\\/g,'/');}
function get(u){return new Promise(function(res,rej){http.get(u,function(r){var d='';r.on('data',function(c){d+=c;});r.on('end',function(){res(d);});}).on('error',rej);});}
function sl(ms){return new Promise(function(r){setTimeout(r,ms);});}
function conn(wsUrl){return new Promise(function(resolve,reject){
  var m=wsUrl.match(/^ws:\/\/([^/:]+):(\d+)(\/.*)$/);var host=m[1],port=parseInt(m[2],10),p=m[3];
  var key=crypto.randomBytes(16).toString('base64');
  var sock=net.connect(port,host,function(){sock.write('GET '+p+' HTTP/1.1\r\nHost: '+host+':'+port+'\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: '+key+'\r\nSec-WebSocket-Version: 13\r\n\r\n');});
  var buf=Buffer.alloc(0),hs=false,handlers=[];
  sock.on('data',function(chunk){buf=Buffer.concat([buf,chunk]);
    if(!hs){var i=buf.indexOf('\r\n\r\n');if(i<0)return;hs=true;buf=buf.slice(i+4);resolve(api);}
    while(buf.length>=2){var b0=buf[0],b1=buf[1],len=b1&0x7f,off=2;
      if(len===126){if(buf.length<4)break;len=buf.readUInt16BE(2);off=4;}else if(len===127){if(buf.length<10)break;len=Number(buf.readBigUInt64BE(2));off=10;}
      if(buf.length<off+len)break;var pl=buf.slice(off,off+len);buf=buf.slice(off+len);
      if((b0&0x0f)===1){var h=handlers.shift();if(h){try{h(JSON.parse(pl.toString('utf8')));}catch(e){h(null);}}}else if((b0&0x0f)===9){/*ping*/}}});
  sock.on('error',reject);var idc=1;
  var api={call:function(method,params){var id=idc++;var pl=Buffer.from(JSON.stringify({id:id,method:method,params:params||{}}),'utf8');
    var mask=crypto.randomBytes(4),hdr;
    if(pl.length<126)hdr=Buffer.from([0x81,0x80|pl.length]);
    else if(pl.length<65536){hdr=Buffer.alloc(4);hdr[0]=0x81;hdr[1]=0x80|126;hdr.writeUInt16BE(pl.length,2);}
    else{hdr=Buffer.alloc(10);hdr[0]=0x81;hdr[1]=0x80|127;hdr.writeBigUInt64BE(BigInt(pl.length),2);}
    var mk=Buffer.alloc(pl.length);for(var i=0;i<pl.length;i++)mk[i]=pl[i]^mask[i%4];
    return new Promise(function(res){handlers.push(res);sock.write(Buffer.concat([hdr,mask,mk]));});},close:function(){try{sock.end();}catch(e){}}};
});}
async function main(){
  // Serve project root over HTTP so localStorage is same-origin and seedable
  // (file:// origin seeding across navigations is not reliable in CDP).
  var httpSrv = require('http').createServer(function(req,res){
    try{
      var u = decodeURIComponent(req.url.split('?')[0]);
      var fp = path.join(ROOT, u.replace(/^\//,''));
      if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('404'); return; }
      var ext = path.extname(fp).toLowerCase();
      var ct = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
                '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'}[ext] || 'application/octet-stream';
      res.writeHead(200, {'Content-Type': ct});
      res.end(fs.readFileSync(fp));
    }catch(e){ res.writeHead(500); res.end('500'); }
  });
  await new Promise(function(r){ httpSrv.listen(0, '127.0.0.1', r); });
  var SRV_PORT = httpSrv.address().port;
  console.log('SRV_PORT', SRV_PORT);

  fs.mkdirSync(PROFILE,{recursive:true});
  var exe='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  var child=cp.spawn(exe,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port='+PORT,'--user-data-dir='+PROFILE,'--window-size=375,667','about:blank'],{stdio:'ignore'});
  var lst=null;
  for(var i=0;i<60;i++){try{lst=await get('http://127.0.0.1:'+PORT+'/json/list');if(lst&&lst.indexOf('webSocketDebuggerUrl')>=0)break;}catch(e){}await sl(250);}
  var tgt=JSON.parse(lst).find(function(t){return t.type==='page';});
  var ws=await conn(tgt.webSocketDebuggerUrl);
  await ws.call('Page.enable');await ws.call('Runtime.enable');
  await ws.call('Page.addScriptToEvaluateOnNewDocument',{source:
    "try{localStorage.setItem('study_workbench_auth',JSON.stringify({account:'qa',loginAt:Date.now()}));" +
    "localStorage.setItem('study_workbench_token','t');localStorage.setItem('study_workbench_uid','1');" +
    "localStorage.setItem('study_workbench_user',JSON.stringify({nickname:'QA'}));}catch(e){}" +
    "window.__XT_PROD__=true;"
  });
  var url='http://127.0.0.1:'+SRV_PORT+'/%E7%A7%81%E8%81%8A.html';
  console.log('NAV', url);
  var nav=await ws.call('Page.navigate',{url:url});
  console.log('NAV_RESULT', JSON.stringify(nav));
  await sl(3000);
  var probes=['location.href','document.readyState','document.title',
    'typeof window.XT_LOC_PICK',
    'document.querySelectorAll("#imPlusMenu .im-plus-item").length',
    '!!document.querySelector("#imLocBtn")',
    'document.querySelector("#imLocBtn") ? document.querySelector("#imLocBtn").getAttribute("onclick") : "NO"',
    'typeof window.XT_REGION',
    'document.body ? document.body.getAttribute("class") : "nobody"',
    'window.innerWidth+"x"+window.innerHeight'];
  for(var k=0;k<probes.length;k++){
    var r=await ws.call('Runtime.evaluate',{expression:probes[k],returnByValue:true});
    console.log(probes[k],'=>',JSON.stringify(r&&r.result&&(r.result.value!==undefined?r.result.value:r.result)));
  }
  ws.close();try{child.kill();}catch(e){}
  try{fs.rmSync(PROFILE,{recursive:true,force:true});}catch(e){}
}
main().catch(function(e){console.log('ERR',e&&e.stack||e);process.exit(3);});
