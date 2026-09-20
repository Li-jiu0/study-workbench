/* 诊断：私聊.html 脚本是否执行 */
(function () {
  return {
    vw: innerWidth, vh: innerHeight,
    href: location.href,
    imPlusCss: !!document.querySelector('#imPlusCss'),
    imTogglePlusMenu: typeof window.imTogglePlusMenu,
    imOpenPlusMenu: typeof window.imOpenPlusMenu,
    imClosePlusMenu: typeof window.imClosePlusMenu,
    xtToast: typeof window.XT_TOAST,
    scripts: Array.prototype.map.call(document.querySelectorAll('script[src]'), function (s) { return s.getAttribute('src'); }),
    loadedScripts: Array.prototype.map.call(document.querySelectorAll('script[src]'), function (s) { return { src: s.getAttribute('src'), ran: !!s.__ran }; }),
    headChildren: Array.prototype.map.call(document.head.children, function (n) { return n.tagName + (n.id ? '#' + n.id : '') + (n.tagName === 'SCRIPT' ? '(' + (n.getAttribute('src') || 'inline') + ')' : ''); }).slice(0, 60),
    bodyClass: document.body ? document.body.className : null,
    docHeight: document.documentElement.scrollHeight
  };
})();
