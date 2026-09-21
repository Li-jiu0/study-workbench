// A2 双端出图：真实 Chrome（playwright-core + executablePath），375px / 1280px
// 目标：
//   ① 空态输入框外观（验证 .ai-input-wrap 统一 768px、无跳变）
//   ② 侧栏「模型」点击链路：开抽屉 → 点「模型 · X」→ 抽屉+遮罩关闭 且 模型面板 open
//   ③ 侧栏按钮文案跟随选中模型
// 说明：本脚本自启本地静态服务（tools/qa/_qa_origin.js），输出头会显示来源。
const path = require('path');
const fs = require('fs');
const QA = require('./_qa_origin.js');
const { chromium } = require('D:\\下载的文件\\学习工作台\\_w2t1_img\\node_modules\\playwright-core');

const OUT = 'D:\\下载的文件\\学习工作台\\tools\\qa\\_a2_out';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function log(lines) {
  fs.writeFileSync(path.join(OUT, '_a2_shot_report.txt'), lines.join('\n'), 'utf8');
}

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const out = [];
  const src = await QA.resolve();
  out.push(QA.sourceBanner(src));
  out.push('CHROME = ' + CHROME + '  exists=' + fs.existsSync(CHROME));

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const results = [];
  try {
    // ---------- 1280px（桌面） ----------
    for (const vp of [{ w: 1280, h: 900, tag: '1280' }, { w: 375, h: 720, tag: '375' }]) {
      const ctx = await browser.newContext({
        viewport: { width: vp.w, height: vp.h },
        deviceScaleFactor: 2,
        isMobile: vp.w <= 480,
        hasTouch: vp.w <= 480
      });
      const page = await ctx.newPage();
      // app.js 会用 study_workbench_auth 做登录校验，未登录会 replace 到 登录.html；
      // 截图前先注入本地登录会话（仅本机 localStorage，纯前端渲染用）
      await page.addInitScript(() => {
        try {
          localStorage.setItem('study_workbench_auth', JSON.stringify({ account: 'qa', loginAt: Date.now() }));
          localStorage.setItem('study_workbench_last_account', 'qa');
        } catch (e) { /* ignore */ }
      });
      const errs = [];
      page.on('pageerror', e => errs.push('PAGEERR: ' + (e && e.message ? e.message : e)));
      page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE_ERR: ' + m.text().slice(0, 200)); });

      await page.goto(src.origin + '/AI.html', { waitUntil: 'load' });
      await page.waitForTimeout(2500);

      // ① 空态
      await page.screenshot({ path: path.join(OUT, 'a2_welcome_' + vp.tag + '.png'), fullPage: false });

      // 空态输入框宽度（对照对话态）
      const welcomeW = await page.evaluate(() => {
        const el = document.querySelector('#aiWelcomeInputSlot');
        return el ? Math.round(el.getBoundingClientRect().width) : -1;
      });

      // ② 侧栏「模型」链路
      // 先在模型面板里选一个非 auto 模型（模拟用户已选），验证侧栏文案跟随
      let sideLabel = '';
      let overlayAfter = null;
      let panelOpen = null;
      let drawerOpenBefore = null;
      const steps = [];

      // 打开抽屉（移动端才有 open 语义；桌面 toggleSidebar 走 collapsed）
      const menuBtn = await page.$('#aiMenuBtn');
      if (menuBtn) {
        await menuBtn.click();
        await page.waitForTimeout(400);
        drawerOpenBefore = await page.evaluate(() => {
          const h = document.querySelector('#aiHistory');
          return h ? h.classList.contains('open') : null;
        });
        await page.screenshot({ path: path.join(OUT, 'a2_drawer_' + vp.tag + '.png') });

        // 点侧栏「模型 · X」
        const infoBtn = await page.$('#aiModelInfoBtn');
        if (infoBtn) {
          await infoBtn.click();
          await page.waitForTimeout(500);
          overlayAfter = await page.evaluate(() => {
            const o = document.querySelector('#aiSidebarOverlay');
            const h = document.querySelector('#aiHistory');
            return {
              overlayOpen: o ? o.classList.contains('open') : null,
              drawerOpen: h ? h.classList.contains('open') : null,
              panelOpen: (function () { const p = document.querySelector('#aiModelPanel'); return p ? p.classList.contains('open') : null; })(),
              panelZ: (function () { const p = document.querySelector('#aiModelPanel'); return p ? getComputedStyle(p).zIndex : null; })()
            };
          });
          panelOpen = overlayAfter.panelOpen;
          sideLabel = await page.evaluate(() => {
            const b = document.querySelector('#aiModelInfoBtn .ai-foot-label');
            return b ? b.textContent : '';
          });
          steps.push('drawer_before_open=' + drawerOpenBefore);
          steps.push('after_click=' + JSON.stringify(overlayAfter));
          await page.screenshot({ path: path.join(OUT, 'a2_model_from_sidebar_' + vp.tag + '.png') });
        }
      }

      // ③ 「选择模型 → 侧栏文案跟随」：写入 localStorage 的选中模型后重载，
      //    updateModelLabel 在 init 时会据选中项推导文案（不写死「模型」）
      await page.evaluate(() => { try { localStorage.setItem('ai_selected_model', 'glm-4.7-flash'); } catch (e) { /* ignore */ } });
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(2000);
      const labelFollow = await page.evaluate(() => {
        const b = document.querySelector('#aiModelInfoBtn .ai-foot-label');
        const m = document.querySelector('#aiModelLabel');
        return { side: b ? b.textContent : '', inputLabel: m ? m.textContent : '' };
      });
      // 恢复默认选择，避免污染后续（本 pw 上下文独立 localStorage，其实无所谓）
      await page.evaluate(() => { try { localStorage.removeItem('ai_selected_model'); } catch (e) { /* ignore */ } });

      results.push({
        vp: vp.tag,
        welcomeWrapWidth: welcomeW,
        steps: steps,
        sideLabel: sideLabel,
        panelOpen: panelOpen,
        overlayAfter: overlayAfter,
        labelFollow: labelFollow,
        errs: errs.slice(0, 10)
      });

      await ctx.close();
    }
  } catch (e) {
    out.push('FATAL: ' + (e && e.stack ? e.stack : e));
  } finally {
    await browser.close();
    await QA.shutdown(src.server);
  }

  out.push('== 结果 ==');
  out.push(JSON.stringify(results, null, 2));
  log(out);
  console.log('DONE');
})();
