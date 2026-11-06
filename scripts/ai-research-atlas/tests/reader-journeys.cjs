/* Reader-reported regressions. Uses the same installed Chrome/Playwright as the other suites. */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
let pw;
for (const name of [process.env.PLAYWRIGHT_MODULE, 'playwright', '@playwright/test'].filter(Boolean)) {
  try { pw = require(name); break; } catch (_) {}
}
if (!pw) throw new Error('Set PLAYWRIGHT_MODULE to an installed Playwright.');
const base = (process.env.ATLAS_URL || pathToFileURL(path.resolve(__dirname, '../site/index.html')).href).replace(/#.*$/, '');
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const results = [], errors = [];
(async () => {
  const browser = await pw.chromium.launch({ headless: true, ...(fs.existsSync(chrome) ? { executablePath: chrome } : {}) });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(6000); page.on('pageerror', e => errors.push(e.message));
  const check = async (name, f) => { try { await f(); results.push({ name, pass: true }); } catch(e) { results.push({ name, pass: false, error: e.message }); } };
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const load = async (hash = '') => { await page.goto(base + hash); await page.waitForSelector('.node'); };
  const readable = async (p, selector, includeMapSwitch = false) => {
    await p.waitForFunction(({selector, includeMapSwitch}) => {
      const el = document.querySelector(selector); if (!el) return false;
      const rect = el.getBoundingClientRect();
      const blockers = ['#quarto-header', ...(includeMapSwitch ? ['.workspace-switch'] : [])].map(s => document.querySelector(s)).filter(e => e && e.offsetHeight).map(e => e.getBoundingClientRect());
      const covered = blockers.some(b => b.bottom > 0 && b.top < innerHeight && rect.top < b.bottom && rect.bottom > b.top && rect.left < b.right && rect.right > b.left);
      return rect.top >= 0 && rect.bottom <= innerHeight && !covered;
    }, {selector, includeMapSwitch});
  };
  const eventHead = async p => { await readable(p, '.pane .head .meta', true); await readable(p, '.pane .head h3', true); };
  await check('Fresh event bookmark reveals complete event metadata and title', async () => {
    await load('#safety-2023-ai-control'); await eventHead(page);
    assert(await page.locator('.node.sel').getAttribute('data-event-id') === 'safety-2023-ai-control', 'Bookmark selected the wrong work');
  });
  await check('Route catalogue event opens below fixed navbar', async () => {
    await load(); await page.locator('[data-route-show="thread-human-feedback"]').click();
    await page.locator('.route-body [data-ev-reveal]').first().click(); await eventHead(page);
    assert(await page.locator('.pane h3').evaluate(e => e === document.activeElement), 'Reading focus did not move to the title');
  });
  await check('Profile related-event navigation and return reveal the event head', async () => {
    await load('#safety-2023-ai-control'); await page.locator('.pane .people [data-profile]').first().click();
    await page.locator('[data-act="return-event"]').click(); await eventHead(page);
    await page.locator('.pane .people [data-profile]').first().click();
    await page.locator('#atlas-profile .profile-related [data-ev-card]').first().click(); await eventHead(page);
  });
  await check('Reset view restores the original time window as well as filters', async () => {
    await load(); const left = await page.locator('.map-scroll').evaluate(e => e.scrollLeft); const years = await page.locator('.window-years').textContent();
    await page.locator('.pane-empty [data-ev="safety-2023-ai-control"]').click();
    assert(Math.abs(await page.locator('.map-scroll').evaluate(e => e.scrollLeft) - left) > 10, 'Fixture did not pan away from the default');
    await page.locator('#atlas-search').fill('reward hacking'); await page.locator('[data-act="clear"]').first().click();
    assert(Math.abs(await page.locator('.map-scroll').evaluate(e => e.scrollLeft) - left) <= 1, 'Reset left the timeline panned away');
    assert(await page.locator('.window-years').textContent() === years, 'Reset range label is stale');
    assert(await page.locator('#atlas-search').inputValue() === '' && await page.locator('.node.sel').count() === 0, 'Reset retained query or selection');
  });
  await check('Late desktop question reveals the beginning of its answer', async () => {
    await load(); const choice = page.locator('[data-route-show]').last();
    const question = await choice.locator('.q').textContent();
    await choice.scrollIntoViewIfNeeded(); await choice.click(); await readable(page, '.route-body h3');
    assert(await page.locator('.route-body h3').textContent() === question, 'Late route changed the wrong body');
  });
  await check('Stacked question selector immediately reveals its chosen answer', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await load();
    for (const id of ['thread-human-feedback', 'thread-interpretability']) {
      await page.locator(`[data-route-show="${id}"]`).click(); await readable(page, '.route-body h3');
      const question = await page.locator(`[data-route-show="${id}"] .q`).textContent();
      assert(await page.locator('.route-body h3').textContent() === question, 'Wrong question body was revealed');
    }
    await page.setViewportSize({ width: 1280, height: 800 });
  });
  await check('Mobile bookmark and Read switch reveal the head below both sticky bars', async () => {
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    const p = await mobile.newPage(); p.on('pageerror', e => errors.push(e.message));
    try {
      await p.goto(base + '#safety-2023-ai-control'); await p.waitForSelector('.node'); await eventHead(p);
      await p.locator('.workspace-switch [data-act="locate"]').tap(); await p.locator('.card-chip').tap(); await eventHead(p);
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Reader overflows phone width');
      await p.mouse.wheel(0, 650); await p.waitForTimeout(350);
      assert(await p.locator('.workspace-switch').evaluate(e => {
        const header = document.getElementById('quarto-header');
        const bottom = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
        return Math.abs(e.getBoundingClientRect().top - bottom) < 2;
      }), 'Reading switch floats below a hidden navbar');

    } finally { await mobile.close(); }
  });
  await check('Wide mobile diagram advertises panning and keeps its caption still', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await load('#safety-2017-deep-rl-human-prefs');
    const viewport = page.locator('.diagram-viewport');
    await viewport.scrollIntoViewIfNeeded();
    assert(await viewport.evaluate(e => e.scrollWidth > e.clientWidth), 'Fixture no longer has a wide diagram');
    assert(await page.locator('.diagram-pan-hint').isVisible(), 'Wide figure has no visible pan cue');
    const caption = page.locator('figure.diagram figcaption'); const before = await caption.boundingBox();
    await viewport.evaluate(e => { e.scrollLeft = e.scrollWidth; });
    assert(await viewport.evaluate(e => e.scrollLeft) > 0, 'Wide figure cannot pan');
    const after = await caption.boundingBox(); assert(Math.abs(after.x - before.x) < 1, 'Panning moves the figure caption');
    assert(after.x >= 0 && after.x + after.width <= 390, 'Caption overflows phone width');
    await page.locator('#atlas-quiz').click();
    assert(await viewport.isHidden(), 'Quiz exposes the figure viewport');
    await page.locator('[data-reveal$="-diagram"]').click();
    assert(await page.locator('.diagram-pan-hint').isVisible(), 'Revealed wide diagram lost its cue');
    await page.setViewportSize({ width: 1280, height: 800 });
  });
  await check('Distant connection labels appear on inspection without cluttering the map', async () => {
    await load('#safety-2016-concrete-problems');
    const edge = page.locator('.connection-hit').filter({ has: page.locator('.stub-label') }).first();
    const label = edge.locator('.stub-label');
    await page.mouse.move(0, 0);
    assert(await label.isHidden(), 'Remote connection label crowds the default map');
    await edge.focus(); assert(await label.isVisible(), 'Keyboard inspection does not identify remote work');
    await page.keyboard.press('Enter'); assert(await page.locator('.connection-detail').isVisible(), 'Remote connection cannot be opened');
    assert(await label.isVisible(), 'Pinned remote connection lost its label');
  });
  results.push({ name: 'No JavaScript errors', pass: errors.length === 0, ...(errors.length ? { error: errors.join('; ') } : {}) });
  console.log(JSON.stringify({ url: base, passed: results.filter(r => r.pass).length, total: results.length, results, errors }, null, 2));
  await browser.close(); if (results.some(r => !r.pass)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
