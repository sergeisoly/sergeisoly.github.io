/* Targeted browser regressions. No installs; use existing Playwright and Chrome.
   ATLAS_URL=http://127.0.0.1:8765 node tests/navigation.cjs
   Optional: PLAYWRIGHT_MODULE, CHROME_PATH, ATLAS_SCREENSHOT_DIR. */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
let playwright;
for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright', '@playwright/test'].filter(Boolean)) {
  try { playwright = require(candidate); break; } catch (_) { /* Try another installed module. */ }
}
if (!playwright) throw new Error('No installed Playwright found. Set PLAYWRIGHT_MODULE to an existing installation.');
const base = (process.env.ATLAS_URL || pathToFileURL(path.resolve(__dirname, '../site/index.html')).href).replace(/#.*$/, '');
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const results = [], errors = [];
(async () => {
  const browser = await playwright.chromium.launch({ headless: true, ...(fs.existsSync(chrome) ? { executablePath: chrome } : {}) });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(6000);
  page.on('pageerror', (e) => errors.push(e.message));
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const check = async (name, run) => { try { await run(); results.push({ name, pass: true }); } catch (e) { results.push({ name, pass: false, error: e.message }); } };
  const load = async (hash = '') => { await page.goto(base + hash); await page.waitForSelector('.node'); };
  const clickEvent = async (id) => {
    const detail = page.locator('[data-atlas="index"] details').filter({ has: page.locator(`[data-ev-reveal="${id}"]`) }).first();
    if (!(await detail.getAttribute('open') === '')) await detail.locator('summary').click();
    await detail.locator(`[data-ev-reveal="${id}"]`).click();
  };
  const selected = () => page.locator('.node.sel').getAttribute('data-event-id');
  await check('Initial arrow navigation and roving focus', async () => {
    await load(); const node = page.locator('.node[tabindex="0"]'); const before = await node.getAttribute('data-event-id'); await node.focus(); await page.keyboard.press('ArrowRight');
    assert(await selected() !== before, 'Right did not move from the initially focused node');
    assert(await page.locator('.node.sel').evaluate((e) => e === document.activeElement), 'Focus did not follow the selected node');
    assert(await page.locator('.node[tabindex="0"]').count() === 1, 'There must be exactly one tabbable node');
  });
  await check('Event deep link and date context', async () => {
    await load('#safety-2023-ai-control'); assert(await selected() === 'safety-2023-ai-control', 'Deep link selected wrong card');
    assert((await page.locator('.pane .date-context').textContent()).length > 0, 'Date context missing');
  });
  await check('Back and Forward restore event navigation', async () => {
    await load(); const h0 = await page.evaluate(() => history.length);
    await page.locator('[data-ev="safety-2023-ai-control"]').first().click(); await clickEvent('lm-2017-transformer');
    assert(await page.evaluate(() => history.length) === h0 + 2, 'Event navigation did not push history entries');
    await page.goBack(); assert(await selected() === 'safety-2023-ai-control', 'Back did not restore AI Control');
    await page.goForward(); assert(await selected() === 'lm-2017-transformer', 'Forward did not restore Transformer');
  });
  await check('Modified event link opens a working new tab', async () => {
    await load(); const popupPromise = context.waitForEvent('page');
    await page.locator('[data-ev="safety-2023-ai-control"]').first().click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
    const popup = await popupPromise; await popup.waitForSelector('.node.sel');
    assert(popup.url().endsWith('#safety-2023-ai-control'), 'New tab lost the event hash');
    assert(await page.locator('.node.sel').count() === 0, 'Modified link also selected in the original tab'); await popup.close();
  });
  await check('Keyboard connections keep focus in the replacement reading card', async () => {
    await load('#safety-2023-ai-control');
    const link = page.locator('.pane .conn a').first();
    const target = (await link.getAttribute('href')).slice(1);
    await link.scrollIntoViewIfNeeded(); await link.focus(); await page.keyboard.press('Enter');
    assert(await selected() === target, 'Connection opened the wrong event');
    assert(await page.locator('.pane h3').evaluate((e) => e === document.activeElement), 'Focus left the reading card');
    assert(await page.locator('.pane h3').evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), 'Focused heading is outside the viewport');
  });
  await check('Earlier and Later keep keyboard readers in the card', async () => {
    await load('#safety-2023-ai-control');
    for (const direction of ['-1', '1']) {
      const before = await selected(), button = page.locator(`[data-nav="${direction}"]`);
      await button.scrollIntoViewIfNeeded(); await button.focus(); await page.keyboard.press('Enter');
      assert(await selected() !== before, 'Earlier/Later did not change the selected event');
      assert(await page.locator('.pane h3').evaluate((e) => e === document.activeElement), 'Earlier/Later focused the offscreen map');
      assert(await page.locator('.pane h3').evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), 'Reading heading is outside the viewport');
    }
  });
  await check('Route enables all required lanes and reset clears stale selection', async () => {
    await load(); await page.locator('[data-lane="safety"]').click();
    await page.locator('[data-route="thread-reward-not-enough"]').first().click();
    const n = await page.evaluate(() => TIMELINE_DATA.threads.find((t) => t.id === 'thread-reward-not-enough').event_ids.length);
    assert(await page.locator('.badge').count() === n, 'Route silently omitted disabled-lane events');
    assert(await page.locator('#atlas-detail').inputValue() === '1', 'Route detail control does not reflect Every event');
    await clickEvent('safety-2019-reward-tampering'); await page.locator('[data-act="clear"]').click();
    assert(await page.locator('.node.sel').count() === 0, 'Reset retained the old selection');
    assert(await page.locator('.node:not(.dim)').count() > 0, 'Reset left the entire map dim');
    assert(await page.locator('.pane-empty').count() === 1, 'Reset retained the stale event card');
    assert(await page.locator('#atlas-detail').inputValue() === '2', 'Reset did not restore Main events');
  });
  await check('Search gives explicit results and composes with selection', async () => {
    await load('#safety-2023-ai-control'); await page.locator('#atlas-search').fill('zxqnonexistent');
    assert(await page.locator('#atlas-count').textContent() === 'No matches', 'Incorrect zero match count');
    assert(await page.locator('.node:not(.dim)').count() === 0, 'Selected or related nodes overrode the search');
    await page.locator('#atlas-search').fill('Christiano');
    assert(await page.locator('.search-results li').count() > 0, 'Expected explicit matching event results');
    assert(await page.locator('.search-results li .result-date').count() === await page.locator('.search-results li').count(), 'Results lack dates');
    await page.locator('.search-results a').first().click();
    assert(await page.locator('.pane h3').count() === 1, 'Search result did not open a card');
    const left = await page.locator('.map-scroll').evaluate((e) => e.scrollLeft);
    await page.locator('[data-act="locate"]').click();
    assert(Math.abs(await page.locator('.map-scroll').evaluate((e) => e.scrollLeft) - left) < 2, 'Returning from card reset the horizontal position');
  });
  await check('Search preserves spaces during ordinary sequential typing', async () => {
    await load(); const input = page.locator('#atlas-search'); await input.click(); await input.pressSequentially('human feedback');
    assert(await input.inputValue() === 'human feedback', 'Typing a space changed the raw query');
    assert(await page.locator('.search-results li').count() > 0, 'Multiword typed query did not return matching events');
  });
  await check('Search count agrees with results inside an active route', async () => {
    await load(); await page.locator('[data-route="thread-reward-not-enough"]').first().click();
    await page.locator('#atlas-search').fill('Transformer');
    const n = await page.locator('.search-results li').count();
    const expected = n ? `${n} match${n === 1 ? '' : 'es'}` : 'No matches';
    assert(await page.locator('#atlas-count').textContent() === expected, 'Search count ignored the active route scope');
    assert((await page.locator('.context').textContent()).includes('Route:'), 'Search unexpectedly cleared the active route');
  });
  await check('Selected connection view hides unrelated anchor labels', async () => {
    await load('#safety-2023-ai-control');
    assert(await page.locator('.node.dim text').count() === 0, 'Unrelated event labels remain underneath selected connections');
    assert(await page.locator('.node.sel text').count() === 1, 'Selected event label disappeared');
  });
  await check('Quiz hides text and diagrams semantically; keyboard reveal works', async () => {
    await load('#safety-2023-ai-control'); const idea = await page.locator('.qa .answer-content p').first().textContent(); await page.locator('#atlas-quiz').click();
    assert(await page.locator('.qa .answer-content').first().isHidden(), 'Answer paragraph is visually exposed');
    assert(await page.locator('.diagram-answer .answer-content').isHidden(), 'Diagram leaks a quiz answer');
    const cdp = await context.newCDPSession(page); const tree = await cdp.send('Accessibility.getFullAXTree'); await cdp.detach();
    assert(!tree.nodes.some((n) => !n.ignored && n.name && n.name.value.includes(idea.slice(0, 65))), 'Unrevealed answer remains exposed in accessibility tree');
    const reveal = page.locator('.reveal-button[aria-controls$="-the-idea"]'); await reveal.focus(); await page.keyboard.press('Space');
    assert(await reveal.getAttribute('aria-expanded') === 'true', 'Keyboard did not reveal the answer');
    assert(await page.locator('.qa .answer-content').first().isVisible(), 'Revealed paragraph is still hidden');
  });
  await check('Linear overview supports pointer and keyboard jumps', async () => {
    await load(); const overview = page.locator('.overview'); const box = await overview.boundingBox();
    const before = await page.locator('.map-scroll').evaluate((e) => e.scrollLeft);
    await overview.click({ position: { x: box.width * .1, y: box.height / 2 } });
    assert(await page.locator('.map-scroll').evaluate((e) => e.scrollLeft) < before, 'Overview click did not move towards earlier history');
    await page.locator('#atlas-year').focus(); await page.keyboard.press('End');
    assert(await page.locator('.map-scroll').evaluate((e) => e.scrollLeft) > before, 'Keyboard year jump did not move towards the end');
    assert(Number(await page.locator('.overview-window').getAttribute('width')) > 0, 'Overview viewport indicator missing');
  });
  await check('Institutions have text roles and searchable organisations', async () => {
    await load(); await page.locator('.people-text summary').click();
    const count = await page.evaluate(() => TIMELINE_DATA.people.length); assert(await page.locator('.people-text section').count() === count, 'Researcher text alternative is incomplete');
    await page.locator('#atlas-org-search').fill('zxqnonexistent'); assert(await page.locator('.org:not([hidden])').count() === 0, 'Organisation search did not filter');
    await page.locator('#atlas-org-search').fill('MIRI'); assert(await page.locator('.org:not([hidden])').count() > 0, 'Organisation aliases not searchable');
    await page.locator('#atlas-org-search').fill('Pivotal');
    const pivotal = page.locator('.org:not([hidden])').filter({ hasText: 'Pivotal Research' });
    assert((await pivotal.locator('.yr').textContent()).includes('2021'), 'Documented activity year is missing');
    assert((await pivotal.locator('.date-context').textContent()).includes('Founding date not established'), 'Activity is presented as a verified founding date');
    assert(await pivotal.locator('.acts a[href^="https:"]').count() === 2, 'Organisation sources are silently hidden');
  });
  await check('Compute envelope/provenance and mobile axes', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await load('#safety-2023-ai-control');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page overflows horizontally on mobile');
    assert(await page.locator('.map-labels .num span').evaluateAll((es) => es.length > 0 && es.every((e) => getComputedStyle(e).display !== 'none')), 'Mobile compute axis ticks are hidden');
    assert(await page.locator('.cmp-note').count() === 0, 'Local doubling-time fit remains');
    assert(await page.locator('.compute-method').textContent().then((t) => t.includes('eligible estimates') && t.includes('SHA-256')), 'Compute provenance is incomplete');
    if (process.env.ATLAS_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.ATLAS_SCREENSHOT_DIR, { recursive: true }); await page.locator('.navigator').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(process.env.ATLAS_SCREENSHOT_DIR, 'navigator-mobile.png') });
      await page.locator('.card-chip').click(); await page.screenshot({ path: path.join(process.env.ATLAS_SCREENSHOT_DIR, 'card-mobile.png') });
      await page.setViewportSize({ width: 1280, height: 900 }); await page.locator('.navigator').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(process.env.ATLAS_SCREENSHOT_DIR, 'navigator-desktop.png') });
    }
  });
  await check('Revised algorithm diagrams fit their viewboxes and mobile containers', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const id of ['rl-1992-q-learning', 'rl-2024-o1', 'rl-2024-rlvr', 'rl-2024-grpo']) {
      await load('#' + id);
      const figure = page.locator('figure.diagram'); await figure.waitFor();
      const overflow = await figure.locator('svg').evaluate((svg) => {
        const v = svg.viewBox.baseVal;
        return [...svg.querySelectorAll('text')].filter((e) => {
          const r = e.getBBox(); return r.x < v.x - 2 || r.y < v.y - 2 || r.x + r.width > v.x + v.width + 2 || r.y + r.height > v.y + v.height + 2;
        }).map((e) => e.textContent);
      });
      assert(overflow.length === 0, `${id}: text outside SVG: ${overflow.join('; ')}`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${id}: diagram causes page overflow`);
      if (process.env.ATLAS_SCREENSHOT_DIR) await figure.screenshot({ path: path.join(process.env.ATLAS_SCREENSHOT_DIR, id + '.png') });
    }
  });
  await check('Real-theme table of contents does not overlap the map', async () => {
    await page.setViewportSize({ width: 1280, height: 900 }); await load();
    if (await page.locator('#TOC').count()) {
      assert(await page.locator('#TOC').evaluate((e) => !e.closest('#quarto-margin-sidebar')), 'TOC still occupies the map margin');
      const map = await page.locator('.map').boundingBox(), toc = await page.locator('#TOC').boundingBox();
      assert(toc.y + toc.height <= map.y, 'TOC overlaps the map vertically');
    }
  });
  await check('No runtime page errors', async () => assert(errors.length === 0, errors.join('; ')));
  await browser.close(); console.log(JSON.stringify({ url: base, passed: results.filter((r) => r.pass).length, total: results.length, results, errors }, null, 2));
  if (results.some((r) => !r.pass)) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
