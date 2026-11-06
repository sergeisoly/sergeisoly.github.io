/* Reference-inspired reader and relationship regressions, additional to navigation.cjs.
   ATLAS_URL=http://127.0.0.1:8767/posts/ai-research-atlas/index.html node tests/reference-interactions.cjs
   Uses the same installed Playwright/Chrome lookup as navigation.cjs.
   ATLAS_SOURCE_DIR optionally serves source atlas.js/css over the generated page for pre-build QA. */
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
  if (process.env.ATLAS_SOURCE_DIR) await context.route(/\/atlas\.(js|css)(\?.*)?$/, (route) => {
    const ext = new URL(route.request().url()).pathname.endsWith('.css') ? 'css' : 'js';
    return route.fulfill({ path: path.join(process.env.ATLAS_SOURCE_DIR, `atlas.${ext}`), contentType: ext === 'css' ? 'text/css' : 'application/javascript' });
  });
  const page = await context.newPage(); page.setDefaultTimeout(7000);
  page.on('pageerror', (e) => errors.push(e.message));
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const check = async (name, run) => { try { await run(); results.push({ name, pass: true }); } catch (e) { results.push({ name, pass: false, error: e.message }); } };
  const load = async (hash = '') => { await page.goto(base + hash); await page.waitForSelector('.node'); };
  const selected = () => page.locator('.node.sel').getAttribute('data-event-id');
  const routeData = (id) => page.evaluate((id) => { const t = TIMELINE_DATA.threads.find((t) => t.id === id); return { ...t, events: t.event_ids.map((id) => TIMELINE_DATA.events.find((e) => e.id === id)) }; }, id);
  const activate = async (id) => { if (!await page.locator(`[data-route="${id}"]`).count()) await page.locator(`[data-route-show="${id}"]`).click(); await page.locator(`[data-route="${id}"]`).first().click(); await page.waitForSelector(`.route-stepper[data-route-id="${id}"]`); };
  const assertHeadingFocus = async () => assert(await page.locator('.pane h3').evaluate((e) => e === document.activeElement && e.getBoundingClientRect().top >= 0 && e.getBoundingClientRect().bottom <= innerHeight), 'Reader heading did not receive visible focus');
  const reciprocal = async () => page.evaluate(() => {
    const a = TIMELINE_DATA.events.find((e) => e.id === 'safety-1960-wiener');
    const b = TIMELINE_DATA.events.find((e) => e.id === 'safety-2019-human-compatible');
    return { a, b, out: `${a.id}:${a.links.findIndex((l) => l.to === b.id)}`, incoming: `${b.id}:${b.links.findIndex((l) => l.to === a.id)}` };
  });
  const row = (key) => page.locator(`[data-connection-row="${key}"]`);
  const hit = (key) => page.locator(`.connection-hit[data-connection="${key}"]`);
  const explain = (key) => row(key).locator('[data-explain-connection]');
  const activePair = async (key) => {
    assert(await row(key).evaluate((e) => e.classList.contains('connection-active')), `Connection row is not highlighted for ${key}`);
    assert(await hit(key).evaluate((e) => e.classList.contains('connection-active')), `Matching map relationship is not highlighted for ${key}`);
  };

  await check('Route opens its first reader and labels ordered destinations', async () => {
    await load(); const t = await routeData('thread-human-feedback'); await activate(t.id);
    assert(await selected() === t.event_ids[0], 'Route did not select its first event');
    const outside = page.locator('.connection-outside-route').first();
    assert(await outside.count() === 1 && await outside.isHidden(), 'Unrelated arcs clutter the active route');
    const outsideKey = await outside.getAttribute('data-connection');
    await row(outsideKey).hover();
    assert(await outside.isVisible(), 'Inspecting a connection does not reveal its outside-route arc');
    await page.locator('.route-stepper h3').hover();
    assert(await outside.isHidden(), 'Outside-route arc stays visible after inspection ends');

    assert((await page.locator('.route-position').textContent()).includes(`1 of ${t.event_ids.length}`), 'Initial route position is wrong');
    assert(await page.locator('[data-route-step="-1"]').isDisabled(), 'Previous is enabled at the first stop');
    assert((await page.locator('[data-route-step="1"]').textContent()).includes(t.events[1].label), 'Next omits its destination label');
    await page.locator(`.node[data-event-id="${t.event_ids[0]}"]`).click();
    assert(await page.locator('[data-era="all"]').getAttribute('aria-pressed') === 'true', 'Clicking a route node unexpectedly constrained its era');
    await page.locator('[data-route-step="1"]').focus(); await page.keyboard.press('Enter');
    assert(await selected() === t.event_ids[1], 'Next did not follow the route');
    assert(await page.locator('[data-route-step="1"]').evaluate((e) => e === document.activeElement && e.getBoundingClientRect().top >= 0 && e.getBoundingClientRect().bottom <= innerHeight), 'Keyboard route step lost visible focus for continued traversal');
    assert((await page.locator('[data-route-step="-1"]').textContent()).includes(t.events[0].label), 'Previous omits its destination label');
    assert(await page.locator(`.route-stops [data-route-stop="${t.event_ids[1]}"][aria-current="step"]`).count() === 1, 'Selected stop lacks aria-current');
  });
  await check('Route traversal follows editorial order across a backwards date jump', async () => {
    await load(); const t = await routeData('thread-scale'); await activate(t.id);
    for (let i = 1; i <= 5; i++) { await page.locator('[data-route-step="1"]').click(); assert(await selected() === t.event_ids[i], `Route deviated at stop ${i + 1}`); }
    assert(t.events[5].date_sort < t.events[4].date_sort, 'Fixture no longer tests nonchronological route order');
    assert((await page.locator('.route-position').textContent()).includes(`6 of ${t.event_ids.length}`), 'Route reader renumbered editorial stops');
  });
  await check('Filtering preserves original stop numbers and disables empty routes', async () => {
    await load(); const t = await routeData('thread-human-feedback'); await activate(t.id);
    await page.locator('#atlas-search').fill('InstructGPT');
    const usable = page.locator('.route-stops [data-route-stop]:not(:disabled)');
    assert(await usable.count() > 0, 'Known route search has no compatible stops');
    const ids = await usable.evaluateAll((es) => es.map((e) => e.dataset.routeStop));
    const firstIndex = t.event_ids.indexOf(ids[0]); assert(firstIndex > 0, 'Fixture no longer excludes the first stop');
    if (await page.locator('.node.sel').count() === 0) await usable.first().click();
    const currentIndex = t.event_ids.indexOf(await selected());
    assert((await page.locator('.route-position').textContent()).includes(`${currentIndex + 1} of ${t.event_ids.length}`), 'Filtered reader renumbered route');
    for (const id of ids) { const badge = page.locator(`.node[data-event-id="${id}"]`); assert(await badge.count() === 1, 'Available stop lacks its map node'); }
    await page.locator('#atlas-search').fill('zxqnonexistent');
    assert(await page.locator('.node.sel').count() === 0, 'Empty route retained an incompatible reader');
    assert(await page.locator('[data-route-step]:not(:disabled)').count() === 0, 'Empty route can still step');
    assert(await page.locator('.route-stops [data-route-stop]:not(:disabled)').count() === 0, 'Empty route has enabled stops');
    assert(/no .*step|no .*event|0 .*available/i.test(await page.locator('.route-stepper').textContent()), 'Empty route lacks an explanation');
    await page.locator('#atlas-search').fill('');
    assert(await page.locator('.route-stops [data-route-stop]:not(:disabled)').count() === t.event_ids.length, 'Clearing search failed to restore stops');
  });
  await check('Route leave and browser history retain the exact reader and route state', async () => {
    await load(); const t = await routeData('thread-scale'); await activate(t.id); await page.locator('[data-route-step="1"]').click();
    const id = await selected(); await page.locator('[data-act="leave-route"]').click();
    assert(await selected() === id, 'Leaving route changed the reader'); assert(await page.locator('.route-stepper').count() === 0, 'Leaving retained route controls');
    await page.goBack(); assert(await selected() === id, 'Back restored a different route stop'); assert(await page.locator('.route-stepper').count() === 1, 'Back lost the route');
    await page.goBack(); assert(await selected() === t.event_ids[0], 'Back lost initial route stop');
    await page.goForward(); assert(await selected() === id, 'Forward lost route progress');
  });
  await check('Opposite-direction relationships retain separate exact assertions and notes', async () => {
    await load('#safety-1960-wiener'); const f = await reciprocal();
    assert(!f.out.endsWith(':-1') && !f.incoming.endsWith(':-1'), 'Fixture no longer has reciprocal relationships');
    for (const [key, source, target] of [[f.out, f.a, f.b], [f.incoming, f.b, f.a]]) {
      assert(await row(key).count() === 1 && await hit(key).count() === 1, 'Reciprocal relationships were collapsed');
      await explain(key).click(); const detail = page.locator(`.connection-detail[data-connection="${key}"]`); const text = await detail.textContent();
      const link = source.links[Number(key.split(':').pop())];
      assert(text.includes(source.title) && text.includes(target.title), 'Explanation lost relationship endpoints');
      assert(text.indexOf(source.title) < text.indexOf(target.title), 'Explanation reversed source and target');
      const relationLabels = { builds_on: 'Builds on', responds_to: 'Responds to', enables: 'Enables', tests: 'Tests', critiques: 'Critiques', parallel: 'Parallel to' };
      assert(await detail.locator('.connection-record').first().locator('.connection-relation').textContent() === relationLabels[link.type], 'Explanation changed the original relation type');
      assert(!link.note || text.includes(link.note), 'Explanation altered or omitted its existing note');
      assert(await selected() === f.a.id, 'Explain unexpectedly navigated to the related event'); await activePair(key);
    }
    assert(await page.locator('.connection-detail').count() === 1, 'Multiple pinned explanations remain');
  });
  await check('Map focus and row hover share highlights; keyboard pin dismisses to its trigger', async () => {
    await load('#safety-1960-wiener'); const f = await reciprocal(), key = f.out;
    await page.mouse.move(0, 0); await hit(key).focus(); await activePair(key);
    assert(await page.locator('.node.connection-endpoint').count() === 2, 'Connection preview does not identify both endpoints');
    await page.keyboard.press('Enter'); assert(await page.locator('.connection-detail').isVisible(), 'Keyboard arc activation did not pin');
    assert(await page.locator('#atlas-connection-title').evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), 'Arc pin heading is outside viewport');
    await page.keyboard.press('Escape'); assert(await page.locator('.connection-detail').isHidden(), 'Escape retained the pinned relationship');
    assert(await hit(key).evaluate((e) => e === document.activeElement), 'Escape did not restore focus to the relationship');
    await explain(f.incoming).hover(); await activePair(f.incoming);
    await explain(f.incoming).focus(); await page.keyboard.press('Space');
    assert(await page.locator(`.connection-detail[data-connection="${f.incoming}"]`).isVisible(), 'Space did not pin row explanation');
    await page.locator('[data-act="close-connection"]').click();
    assert(await explain(f.incoming).evaluate((e) => e === document.activeElement), 'Close did not restore row trigger focus');
    await page.goBack(); assert(await page.locator('.connection-detail').getAttribute('data-connection') === f.incoming && await selected() === f.a.id, 'Back did not restore dismissed pin and reader');
    await page.goForward(); assert(await page.locator('.connection-detail').isHidden(), 'Forward did not restore pin dismissal');
  });
  await check('Explicit related-event navigation clears the old pin and preserves history', async () => {
    await load('#safety-1960-wiener'); const f = await reciprocal(); await explain(f.out).click();
    const detail = page.locator('.connection-detail'); const target = detail.locator(`[data-ev="${f.b.id}"]`);
    assert(await target.count() > 0, 'Pin lacks explicit related-event navigation'); await target.first().click();
    assert(await selected() === f.b.id, 'Explicit link selected wrong event'); await assertHeadingFocus();
    assert(await page.locator('.connection-detail').isHidden(), 'Old relationship pin leaked into another event');
    await page.goBack(); assert(await selected() === f.a.id, 'Back lost relationship source reader');
    assert(await page.locator('.connection-detail').isVisible(), 'Back lost pinned explanation'); assert(await page.locator('.connection-detail').getAttribute('data-connection') === f.out, 'Back restored unrelated pin');
    await page.goForward(); assert(await selected() === f.b.id, 'Forward lost related event'); assert(await page.locator('.connection-detail').isHidden(), 'Forward resurrected stale source pin');
  });
  await check('Filtering and reset remove stale pin and relationship highlights', async () => {
    await load('#safety-1960-wiener'); const f = await reciprocal(); await explain(f.out).click();
    await page.locator('#atlas-search').fill('zxqnonexistent');
    assert(await page.locator('.connection-detail').isHidden(), 'Filtering retained incompatible pin');
    assert(await page.locator('.connection-active').count() === 0, 'Filtering retained stale relationship highlight');
    await page.locator('[data-act="clear"]').first().click();
    assert(await page.locator('.node.sel,.connection-active').count() === 0 && await page.locator('.connection-detail').isHidden(), 'Reset retained selected relationship state');
  });
  await check('Figure follows the idea and quiz independently hides and reveals it', async () => {
    await load('#safety-2023-ai-control');
    assert(await page.locator('.qa > .diagram-answer').count() === 1, 'Figure is not inside the explanatory sequence');
    assert(await page.locator('.qa > .diagram-answer').evaluate((e) => e.previousElementSibling?.querySelector('[id$="-the-idea"]') && e.nextElementSibling?.querySelector('[id$="-what-changed"]')), 'Figure is not directly after The idea and before What changed');
    await page.locator('#atlas-quiz').click();
    assert(await page.locator('.diagram-answer .answer-content').isHidden(), 'Quiz exposes diagram');
    await page.locator('[data-reveal$="-the-idea"]').click(); assert(await page.locator('.diagram-answer .answer-content').isHidden(), 'Revealing idea also exposed diagram');
    const button = page.locator('[data-reveal$="-diagram"]'); await button.focus(); await page.keyboard.press('Space');
    assert(await page.locator('.diagram-answer .answer-content').isVisible(), 'Diagram keyboard reveal failed');
  });
  await check('Mobile route and pinned connection fit the page and support touch activation', async () => {
    const mobile = await context.browser().newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    if (process.env.ATLAS_SOURCE_DIR) await mobile.route(/\/atlas\.(js|css)(\?.*)?$/, (route) => { const ext = new URL(route.request().url()).pathname.endsWith('.css') ? 'css' : 'js'; return route.fulfill({ path: path.join(process.env.ATLAS_SOURCE_DIR, `atlas.${ext}`), contentType: ext === 'css' ? 'text/css' : 'application/javascript' }); });
    const p = await mobile.newPage(); p.setDefaultTimeout(7000); p.on('pageerror', (e) => errors.push(e.message));
    try {
      await p.goto(base); await p.waitForSelector('.node'); await p.locator('[data-route="thread-human-feedback"]').first().tap();
      assert(await p.locator('.route-stepper').isVisible(), 'Mobile route reader unavailable');
      await p.locator('[data-route-step="1"]').tap(); assert(await p.locator('.node.sel').getAttribute('data-event-id') === 'safety-2017-deep-rl-human-prefs', 'Touch route step failed');
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Route overflows mobile page');
      await p.locator('[data-route-show="gov-thread-institutional-field"]').tap(); await p.locator('[data-route="gov-thread-institutional-field"]').tap();
      await p.locator('.route-stop-list summary').tap(); await p.locator('.route-stop-list [data-route-stop]').last().tap();
      assert(await p.locator('.route-stops [aria-current="step"]').evaluate((e) => { const active = e.getBoundingClientRect(), rail = e.closest('.route-stops').getBoundingClientRect(); return active.left >= rail.left - 1 && active.right <= rail.right + 1; }), 'Long route failed to scroll active final stop into its rail');
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Long route overflows mobile page');
      await p.goto(base + '#safety-1960-wiener'); await p.waitForSelector('[data-explain-connection]');
      const button = p.locator('[data-explain-connection]').last(); await button.tap();
      assert(await p.locator('.connection-detail').isVisible(), 'Touch Explain failed to pin');
      assert(await p.locator('#atlas-connection-title').evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), 'Touch Explain leaves pinned heading outside viewport');
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Pinned relationship overflows mobile page');
      await p.locator('[data-act="close-connection"]').tap(); assert(await p.locator('.connection-detail').isHidden(), 'Touch close failed');
      if (process.env.ATLAS_SCREENSHOT_DIR) { fs.mkdirSync(process.env.ATLAS_SCREENSHOT_DIR, { recursive: true }); await p.screenshot({ path: path.join(process.env.ATLAS_SCREENSHOT_DIR, 'reference-mobile.png'), fullPage: true }); }
    } finally { await mobile.close(); }
  });
  assert(errors.length === 0, `Page errors: ${errors.join('; ')}`);
  console.log(JSON.stringify({ passed: results.filter((r) => r.pass).length, total: results.length, results, pageErrors: errors }, null, 2));
  await browser.close();
  if (results.some((r) => !r.pass)) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
