const jsdom = require('C:\\Users\\ATM\\node_modules\\jsdom');
const { JSDOM } = jsdom;
const dom = new JSDOM('<!DOCTYPE html><body></body>', { url:'http://127.0.0.1:9999/个人资料.html?user=2002', runScripts:'dangerously' });
const w = dom.window;
const cap = { href: w.location.href, replaceCalls: 0 };

const hrefDesc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(w.location), 'href');
console.log('href proto descriptor configurable=', hrefDesc && hrefDesc.configurable);

let okSetter = false, e1='';
try {
  Object.defineProperty(w.location, 'href', {
    configurable: true,
    get(){ return cap.href; },
    set(v){ cap.href = v; }
  });
  okSetter = true;
} catch(e){ e1 = e.message; }
console.log('defineProperty(location.href) ->', okSetter, e1);

let okReplace = false, e2='';
try { w.location.replace = function(v){ cap.replaceCalls++; cap.href = v; }; okReplace = true; } catch(e){ e2 = e.message; }
console.log('override location.replace ->', okReplace, e2);

if (okSetter) {
  try {
    const s = w.document.createElement('script');
    s.textContent = "location.href='个人资料.html?user=2002'; location.replace('个人资料.html');";
    w.document.body.appendChild(s);
    console.log('after script cap.href=', cap.href, 'replaceCalls=', cap.replaceCalls);
  } catch(e){ console.log('script error:', e.message); }
}
