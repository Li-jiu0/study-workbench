// probe: jsdom availability + Object.defineProperty(location) capture
const jsdom = require('C:\\Users\\ATM\\node_modules\\jsdom');
console.log('jsdom loaded, version=', jsdom?.default?.prototype ? 'ok' : (typeof jsdom));

const { JSDOM } = jsdom;
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="x"></div></body></html>', {
  url: 'http://127.0.0.1:9999/个人资料.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true
});
const w = dom.window;
console.log('typeof window.location =', typeof w.location);
const desc = Object.getOwnPropertyDescriptor(w, 'location');
console.log('location descriptor:', JSON.stringify(desc && {configurable: desc.configurable, writable: desc.writable, hasGet: !!desc.get, hasSet: !!desc.set}));

// try replace location with capturing object
const cap = { href: '', assign: function(u){ this.href = u; }, replace: function(u){ this.href = u; }, toString(){ return this.href; } };
let defOk = false, err = '';
try {
  Object.defineProperty(w, 'location', { configurable: true, get(){ return cap; }, set(v){ cap.href = v; } });
  defOk = true;
} catch (e) { err = e.message; }
console.log('defineProperty(location) ->', defOk, err);

if (defOk) {
  // run a tiny script in window scope that assigns location.href
  try {
    const s = w.document.createElement('script');
    s.textContent = "location.href = '个人资料.html?user=2002';";
    w.document.body.appendChild(s);
    console.log('captured href =', cap.href);
  } catch (e) { console.log('assign error:', e.message); }
}

// test localStorage on http origin
try {
  w.localStorage.setItem('study_workbench_token', 'TESTTOKEN');
  console.log('localStorage http-origin OK, token=', w.localStorage.getItem('study_workbench_token'));
} catch (e) { console.log('localStorage FAIL:', e.message); }
