/* R164-c 真机尺寸实测：用真 Chrome 布局引擎，按真机视口量 .vp-ctl 是否均匀铺满。
 * 覆盖两个视口：390x844（主流手机）、360x640（小屏）。
 * 断言：
 *   ① .vp-ctl.offsetWidth 铺满 .vp-stage 内容区（≥ 内容宽 − 4）；
 *   ② 按钮数 = 5（上一句/慢速/播放/中文/下一句）；
 *   ③ 五个按钮同一行（垂直中心一致 → 未换行）；
 *   ④ 间隙无重叠（≥4px）且左/右组组内首尾间隙一致；
 *   ⑤ .vp-ctl 无横向溢出（scrollWidth ≤ clientWidth）；
 *   ⑥ 「慢速」按钮单行高（非两行竖排）；
 *   ⑦ R164-c：播放按钮水平中心 vs 控制条中心偏差 ≤ 3px（三栏 flex:1 布局精确居中）。
 * 只读页面；登录门控按 _r162_file_check.js 同法绕过。
 */
const { chromium } = require('../verifier/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = 'D:/下载的文件/学习工作台';
const OUT = path.join(__dirname, '_r164_ctl_layout_out.txt');
const URL_FILE = 'file:///' + encodeURI(ROOT.replace(/\\/g, '/')) + '/英语.html';
const VIEWPORTS = [
  { name: '390x844', w: 390, h: 844 },
  { name: '360x640', w: 360, h: 640 },
];

const lines = [];
function log(s) { lines.push(s); }

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--disable-gpu', '--no-first-run', '--allow-file-access-from-files'],
  });
  let allOk = true;

  for (let vi = 0; vi < VIEWPORTS.length; vi++) {
    const vp = VIEWPORTS[vi];
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('study_workbench_auth', JSON.stringify({ account: 'pwtest', loginAt: Date.now() }));
        localStorage.setItem('study_workbench_token', 'pw_verify_token_r164');
        localStorage.setItem('study_workbench_refresh', 'pw_verify_refresh_r164');
        localStorage.setItem('study_workbench_user', JSON.stringify({ id: 1, username: 'pwtest', nickname: 'pwtest' }));
      } catch (e) {}
    });
    const ME = { id: 1, username: 'pwtest', nickname: 'pwtest', account: 'pwtest' };
    await ctx.route('**/api/**', async r => {
      const u = r.request().url();
      let body;
      if (u.indexOf('/api/auth/refresh') !== -1) body = { ok: true, data: { token: 'pw_verify_token_r164', refreshToken: 'pw_verify_refresh_r164' } };
      else if (u.indexOf('/api/auth/me') !== -1) body = Object.assign({ ok: true, data: ME }, ME);
      else body = { ok: true, data: {}, items: [], list: [], total: 0, unread: 0 };
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });

    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
    await page.goto(URL_FILE, { waitUntil: 'load' });
    await page.waitForTimeout(3200);

    log('===== viewport ' + vp.name + ' =====');
    const probe = await page.evaluate(() => ({
      href: String(location.href).slice(-30),
      hasTrain: typeof window.openVoiceTrain,
      scripts: document.querySelectorAll('script[src*="voiceplayer"]').length,
    }));
    log('probe: ' + JSON.stringify(probe));
    if (probe.hasTrain !== 'function') {
      log('FATAL: openVoiceTrain 未加载（可能被门控弹回登录页，href=' + probe.href + '）');
      allOk = false;
      await ctx.close();
      continue;
    }

    const m = await page.evaluate(() => {
      window.openVoiceTrain('listen');
      const ctl = document.querySelector('#vpMask .vp-ctl');
      const stage = document.querySelector('#vpMask .vp-stage');
      const card = document.querySelector('#vpMask .vp-card');
      if (!ctl || !stage) return { missing: true };
      const cs = getComputedStyle(stage);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const btns = Array.prototype.slice.call(document.querySelectorAll('#vpMask .vp-ctl .vp-cbtn, #vpMask .vp-ctl .vp-sw'));
      const rects = btns.map(function (b) {
        const r = b.getBoundingClientRect();
        return { l: Math.round(r.left), rt: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), t: Math.round(r.top), txt: (b.textContent || '').trim(), ow: b.offsetWidth, sw: b.scrollWidth, cw: b.clientWidth };
      });
      const tops = rects.map(function (r) { return r.t; });
      const bottoms = rects.map(function (r) { return r.t + r.h; });
      const centers = rects.map(function (r) { return Math.round((r.t + r.h / 2) * 10) / 10; });
      const gaps = [];
      for (let i = 1; i < rects.length; i++) gaps.push(rects[i].l - rects[i - 1].rt);
      const slow = rects.filter(function (r) { return r.txt === '慢速'; })[0] || null;
      // 单行判定：所有按钮的垂直区间有公共重叠（最高 top ≤ 最低 bottom）→ 同一行，未换行。
      // 注：align-items:center 会让「高度不同」的按钮 top 不同，所以用「垂直中心一致 + 单行重叠」判定，而非 top 全等。
      const sameRow = Math.max.apply(null, tops) <= Math.min.apply(null, bottoms);
      const centerSpread = (Math.max.apply(null, centers) - Math.min.apply(null, centers));
      // R164-c：播放按钮水平居中 —— 播放中心 vs 控制条中心偏差
      const play = document.querySelector('#vpMask .vp-ctl .vp-play');
      const pr = play.getBoundingClientRect(), cr = ctl.getBoundingClientRect();
      const playCenter = pr.left + pr.width / 2;
      const ctlCenter = cr.left + cr.width / 2;
      const playDev = Math.abs(playCenter - ctlCenter);
      const csPlay = getComputedStyle(play);
      const gL = document.querySelector('#vpMask .vp-ctl-l');
      const csL = gL ? getComputedStyle(gL) : null;
      const flexDiag = {
        playBasis: csPlay.flexBasis, playGrow: csPlay.flexGrow,
        lBasis: csL ? csL.flexBasis : 'NA', lGrow: csL ? csL.flexGrow : 'NA',
        lW: gL ? gL.offsetWidth : -1,
      };
      return {
        stageClientWidth: stage.clientWidth,
        stagePadX: Math.round(padX),
        stageContentWidth: Math.round(stage.clientWidth - padX),
        cardWidth: card ? Math.round(card.getBoundingClientRect().width) : -1,
        ctlOffsetWidth: ctl.offsetWidth,
        ctlClientWidth: ctl.clientWidth,
        ctlScrollWidth: ctl.scrollWidth,
        ctlRectW: Math.round(ctl.getBoundingClientRect().width),
        btnCount: btns.length,
        tops: tops,
        bottoms: bottoms,
        centers: centers,
        sameRow: sameRow,
        centerSpread: Math.round(centerSpread * 10) / 10,
        gaps: gaps,
        gapSpread: gaps.length > 1 ? (Math.max.apply(null, gaps) - Math.min.apply(null, gaps)) : -1,
        slowH: slow ? slow.h : -1,
        slowText: slow ? slow.txt : 'MISSING',
        statCount: document.querySelectorAll('#vpMask .vp-stat').length,
        btnRects: rects,
        playCenter: Math.round(playCenter * 10) / 10,
        ctlCenter: Math.round(ctlCenter * 10) / 10,
        playDev: Math.round(playDev * 10) / 10,
        flexDiag: flexDiag,
      };
    });

    if (m.missing) { log('FATAL: 面板元素缺失（.vp-ctl/.vp-stage 取不到）'); allOk = false; await ctx.close(); continue; }

    const filled = m.ctlOffsetWidth >= m.stageContentWidth - 4;
    const noOverflow = m.ctlScrollWidth <= m.ctlClientWidth;
    const sameRow = m.sameRow === true && m.centerSpread <= 3;
    const okCount = m.btnCount === 5;
    const gapEven = m.gaps.every(function (g) { return g >= 4; }) && m.gaps.length >= 4 && m.gaps[0] === m.gaps[m.gaps.length - 1];
    const slowOneLine = m.slowH > 0 && m.slowH < 45;
    const playCentered = m.playDev <= 3;   // R164-c：播放按钮水平居中偏差 ≤ 3px
    const statGone = m.statCount === 0;    // R165：本组进度 / 今日统计卡片已下线
    const btnNoOverflow = m.btnRects.every(function (r) { return r.sw <= r.cw + 1; });   // R165：弹性按钮内容不溢出

    log('stage.clientWidth = ' + m.stageClientWidth + '（含左右 padding ' + m.stagePadX + '）→ stage 内容宽 = ' + m.stageContentWidth);
    log('vp-ctl offsetWidth = ' + m.ctlOffsetWidth + ' ; clientWidth = ' + m.ctlClientWidth + ' ; scrollWidth = ' + m.ctlScrollWidth + ' ; rectW = ' + m.ctlRectW);
    log('vp-card 宽 = ' + m.cardWidth + '（对照：控制条应与卡片同宽）');
    log('按钮数 = ' + m.btnCount + '（期望 5）');
    log('五个按钮 top = ' + JSON.stringify(m.tops) + ' ; bottom = ' + JSON.stringify(m.bottoms));
    log('五个按钮垂直中心 = ' + JSON.stringify(m.centers) + ' → 中心极差 = ' + m.centerSpread + 'px（align-items:center 下不同高度按钮 top 本就不同）');
    log('相邻间隙(px) = ' + JSON.stringify(m.gaps) + ' → 极差 = ' + m.gapSpread);
    log('慢速按钮高度 = ' + m.slowH + 'px（单行 ≈39，两行 ≈54）text="' + m.slowText + '"');
    log('按钮矩形 = ' + JSON.stringify(m.btnRects));
    log('R164-c 播放中心 = ' + m.playCenter + ' ; 控制条中心 = ' + m.ctlCenter + ' ; 偏差 = ' + m.playDev + 'px');
    log('R165 五个按钮 offsetWidth = ' + JSON.stringify(m.btnRects.map(function (r) { return r.ow; })) + '（弹性：随视口缩放，非写死）');
    log('R165 各按钮 scrollWidth/clientWidth = ' + JSON.stringify(m.btnRects.map(function (r) { return r.sw + '/' + r.cw; })));
    log('R165 flex 诊断 = ' + JSON.stringify(m.flexDiag));
    log('CHECK 铺满(offsetWidth ≥ stage 内容宽−4): ' + filled + '  [' + m.ctlOffsetWidth + ' ≥ ' + (m.stageContentWidth - 4) + ']');
    log('CHECK 无横向溢出(scrollWidth ≤ clientWidth): ' + noOverflow);
    log('CHECK 不换行(单行重叠 且 垂直中心极差 ≤ 3px): ' + sameRow + '  [sameRow=' + m.sameRow + ', 中心极差=' + m.centerSpread + ']');
    log('CHECK 按钮数 = 5: ' + okCount);
    log('CHECK 间隙(无重叠 ≥4px 且 组内首尾一致): ' + gapEven + '  [gaps=' + JSON.stringify(m.gaps) + '；三栏布局跨组间距必然不等，否则播放无法居中]');
    log('CHECK 慢速单行高(<45px): ' + slowOneLine);
    log('CHECK 播放按钮水平居中(偏差 ≤ 3px): ' + playCentered + '  [偏差=' + m.playDev + 'px]');
    log('CHECK R165 精听模式无 .vp-stat 卡片（本组进度/今日统计已删）: ' + statGone + '  [count=' + m.statCount + ']');
    log('CHECK R165 弹性按钮内容不溢出(scrollWidth ≤ clientWidth+1): ' + btnNoOverflow);
    log('pageErrors: ' + JSON.stringify(errs));

    if (!(filled && noOverflow && sameRow && okCount && gapEven && slowOneLine && playCentered && statGone && btnNoOverflow)) allOk = false;

    await page.screenshot({ path: path.join(__dirname, '_r164_ctl_' + vp.w + '.png') });
    await ctx.close();
  }

  // ===== R164-c：AI 助教「问 AI」tab 真机行为（stub callAI，不真请求）=====
  log('');
  log('===== R164-c 「问 AI」tab 行为（真机，stub window.callAI）=====');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('study_workbench_auth', JSON.stringify({ account: 'pwtest', loginAt: Date.now() }));
        localStorage.setItem('study_workbench_token', 'pw_verify_token_r164');
        localStorage.setItem('study_workbench_refresh', 'pw_verify_refresh_r164');
      } catch (e) {}
    });
    await ctx.route('**/api/**', async r => {
      const u = r.request().url();
      let body = { ok: true, data: {}, items: [], list: [], total: 0, unread: 0 };
      if (u.indexOf('/api/auth/refresh') !== -1) body = { ok: true, data: { token: 'pw_verify_token_r164', refreshToken: 'pw_verify_refresh_r164' } };
      else if (u.indexOf('/api/auth/me') !== -1) body = { ok: true, data: { id: 1, username: 'pwtest' }, id: 1, username: 'pwtest' };
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const page = await ctx.newPage();
    const aerrs = [];
    page.on('pageerror', e => aerrs.push(String(e).slice(0, 300)));
    await page.goto(URL_FILE, { waitUntil: 'load' });
    await page.waitForTimeout(3000);
    const hasTrain = await page.evaluate(() => typeof window.openVoiceTrain);
    if (hasTrain !== 'function') {
      log('FATAL: openVoiceTrain 未加载，问 AI 检查跳过'); allOk = false;
    } else {
      // stub callAI 为「永不 resolve」→ 点击 chip 后应停在 busy 态
      await page.evaluate(() => {
        window.__askResolve = null;
        window.callAI = function () { return new Promise(function (res) { window.__askResolve = res; }); };
        window.openVoiceTrain('listen');
        window.openVoiceTrain.__ai();          // 展开 AI 助教
        window.openVoiceTrain.__aiTab('ask');  // 切到「问 AI」
      });
      const a1 = await page.evaluate(() => ({
        tabs: Array.prototype.slice.call(document.querySelectorAll('#vpMask .vp-aitabs .t')).map(function (x) { return x.textContent; }),
        hasInput: !!document.querySelector('#vpAskQ'),
        chipCount: document.querySelectorAll('#vpMask .vp-askc').length,
      }));
      const askTabOk = a1.tabs.indexOf('问 AI') !== -1 && a1.hasInput && a1.chipCount === 3;
      log('问 AI tab 列表 = ' + JSON.stringify(a1.tabs) + ' ; 输入框=' + a1.hasInput + ' ; chips=' + a1.chipCount);
      log('CHECK 「问 AI」tab 出现 + 输入框 + 3 个快捷 chips: ' + askTabOk);

      await page.evaluate(() => { var c = document.querySelectorAll('#vpMask .vp-askc'); if (c.length) { c[0].click(); } });
      const a2 = await page.evaluate(() => ({
        busy: ((document.querySelector('#vpMask .vp-askr') || {}).textContent || ''),
      }));
      const busyOk = a2.busy.indexOf('AI 思考中') !== -1;
      log('点击 chip 后回显区 = "' + a2.busy + '"');
      log('CHECK 点击 chip → 进入 busy 态（AI 思考中…）: ' + busyOk);

      await page.evaluate(() => { if (window.__askResolve) { window.__askResolve({ text: '这是测试回复' }); } });
      await page.waitForTimeout(150);
      const a3 = await page.evaluate(() => ((document.querySelector('#vpMask .vp-askr') || {}).textContent || ''));
      const replyOk = a3.indexOf('这是测试回复') !== -1;
      log('resolve 后回显区 = "' + a3 + '"');
      log('CHECK resolve 后回填 AI 回复: ' + replyOk);
      log('pageErrors: ' + JSON.stringify(aerrs));
      if (!(askTabOk && busyOk && replyOk)) allOk = false;
    }
    await page.screenshot({ path: path.join(__dirname, '_r164_ask_390.png') });
    await ctx.close();
  }

  await browser.close();
  log('');
  log('RESULT: ' + (allOk ? 'R164_CTL_LAYOUT_PASS' : 'R164_CTL_LAYOUT_FAIL'));
  fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
  console.log('WROTE ' + OUT + ' : ' + (allOk ? 'PASS' : 'FAIL'));
  process.exit(allOk ? 0 : 1);
})().catch(e => {
  lines.push('FATAL ' + String(e));
  try { fs.writeFileSync(OUT, lines.join('\n'), 'utf8'); } catch (e2) {}
  console.error('FATAL', e);
  process.exit(1);
});
