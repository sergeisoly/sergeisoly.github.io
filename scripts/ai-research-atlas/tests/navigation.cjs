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
    const link = page.locator(`[data-ev-reveal="${id}"],[data-ev-card="${id}"],[data-ev="${id}"]`).first();
    assert(await link.count(), `No event link found for ${id}`);
    await link.evaluate((e) => { for (let p = e.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true; });
    await link.click();
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
    await page.locator('.pane [data-act="locate"]').click();
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
    const n = Number(await page.locator('.search-results').getAttribute('data-global-total'));
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
  await check('Profiles replace the text dump and preserve organisation sources', async () => {
    await load();
    assert(await page.locator('.people-text').count() === 0, 'Complete researcher dump still exists');
    await page.locator('#atlas-org-search').fill('zxqnonexistent'); assert(await page.locator('#atlas-profile-select').isDisabled(), 'Profile search did not filter');
    await page.locator('#atlas-org-search').fill('MIRI'); assert(await page.locator('#atlas-profile-select option').count() > 0, 'Organisation aliases are not searchable');
    await page.locator('#atlas-org-search').fill('Pivotal'); await page.locator('#atlas-profile-select').selectOption('org:org-pivotal'); await page.locator('[data-act="open-profile-choice"]').click();
    const profile = page.locator('.profile-panel');
    assert((await profile.locator('.profile-kind').textContent()).includes('2021'), 'Documented activity year is missing');
    assert((await profile.locator('.date-context').textContent()).includes('Founding date not established'), 'Activity is presented as verified founding');
    assert(await profile.locator('.profile-sources a[href^="https:"]').count() === 2, 'Organisation sources are silently hidden');
  });
  await check('Era browsing links map, complete event list and selected card', async () => {
    await page.setViewportSize({ width: 1280, height: 900 }); await load();
    await page.locator('[data-era="0"]').focus(); await page.keyboard.press('Enter');
    assert(await page.locator('[data-era="0"]').evaluate((e) => e === document.activeElement), 'Era rerender lost keyboard focus');
    assert(await page.locator('.era-selected').count() === 1, 'Chosen era has no map highlight');
    assert(await selected(), 'Era did not select a compatible reading card');
    const expected = await page.evaluate(() => { const end = Number(TIMELINE_DATA.eras[1].start.slice(0, 4)); return TIMELINE_DATA.events.filter((e) => Number(e.date_sort.slice(0, 4)) < end).length; });
    assert(Number(await page.locator('.search-results').getAttribute('data-total')) === expected, 'Era browser omitted detail events');
    assert(await page.locator('.search-results li').count() <= 4, 'Event list pushes the card too far down');
    assert(await page.locator('[data-atlas="index"] .idx').count() === 0, 'A distant duplicate event index remains');
    const boxes = await page.evaluate(() => { const m = document.querySelector('.chart-column').getBoundingClientRect(), r = document.querySelector('.reader-column').getBoundingClientRect(); return { beside: r.left >= m.right, aligned: Math.abs(r.top - m.top) < 2 }; });
    assert(boxes.beside && boxes.aligned, 'Desktop reading and map are disconnected');
  });
  await check('Era browsing preserves a route and reports an empty intersection', async () => {
    await load(); await page.locator('[data-route="thread-reward-not-enough"]').first().click();
    await page.locator('#atlas-search').fill('tampering');
    await page.locator('[data-era="0"]').click();
    assert((await page.locator('.context').textContent()).includes('Route:'), 'Era silently cleared active route');
    assert(await page.locator('#atlas-search').inputValue() === 'tampering', 'Era silently cleared search');
    assert(Number(await page.locator('.search-results').getAttribute('data-total')) === 0, 'Expected empty early era inside modern route');
    assert((await page.locator('.search-results').textContent()).includes('No events'), 'Empty era has no explanation');
    await page.goBack(); assert((await page.locator('.context').textContent()).includes('Route:'), 'Back lost active route');
    assert(await page.locator('[data-era="all"]').getAttribute('aria-pressed') === 'true', 'Back did not restore era context');
  });
  await check('Affiliations preview, pin existing facts, and dismiss with focus restored', async () => {
    await load(); const bar = page.locator('.people-chart [data-affiliation]').first();
    const name = await bar.getAttribute('aria-label'); await bar.hover();
    assert(await page.locator('.tip').isVisible(), 'Affiliation preview is unavailable');
    assert((await page.locator('.tip').textContent()).includes(name.split(' at ')[0]), 'Preview omits whose affiliation this is');
    await bar.focus(); await page.keyboard.press('Enter');
    assert(await page.locator('.people-profile-dock .profile-panel h3').count() === 1, 'Affiliation did not open a nearby profile');
    assert(await page.locator('.profile-affiliations li.current').count() === 1, 'Clicked affiliation is not identified');
    assert((await page.locator('.profile-affiliations').textContent()).includes('present'), 'Profile omits existing affiliation dates');
    await page.keyboard.press('Escape');
    assert(await bar.evaluate((e) => e === document.activeElement), 'Dismissal did not return focus to the affiliation');
    assert(await page.locator('.profile-panel .profile-close').count() === 0, 'Escape did not dismiss profile');
  });
  await check('Inline profiles preserve selected event and restore through history', async () => {
    await load('#safety-2023-ai-control'); const before = await selected();
    const name = page.locator('.pane .people [data-profile]').first(); const label = await name.textContent();
    await name.click();
    assert(await selected() === before, 'Opening a profile changed the selected event');
    assert(await page.locator('.profile-dock .profile-panel h3').textContent() === label, 'Profile jumped away from the event card');
    assert(await page.locator('.profile-dock .profile-related a').count() > 0, 'Inline profile has no existing related work');
    const url = page.url(); await page.locator('[data-act="close-profile"]').click();
    await page.goBack(); assert(page.url() === url, 'Back lost profile URL');
    assert(await page.locator('.profile-dock .profile-panel h3').textContent() === label, 'Back lost profile or dock');
    assert(await selected() === before, 'Back lost selected event under profile');
    await page.goForward(); assert(await page.locator('.profile-dock').isHidden(), 'Forward did not restore dismissed profile');
  });
  await check('Desktop profile selection preserves affiliation row position', async () => {
    await page.setViewportSize({ width: 1440, height: 900 }); await load();
    const name = page.locator('.people-chart text[data-profile="person:paul-christiano"]');
    await name.evaluate((e) => { const r = e.getBoundingClientRect(); scrollBy(0, r.top - 450); });
    const before = await name.boundingBox(); await name.click(); const after = await name.boundingBox();
    assert(Math.abs(after.y - before.y) < 2, 'Opening a desktop profile jumps the affiliation row');
    assert(await page.locator('.profile-panel').evaluate((e) => e.getBoundingClientRect().height <= innerHeight - 30), 'Desktop inspector is taller than viewport');
    assert(await page.locator('.profile-panel h3').evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom < innerHeight; }), 'Profile heading is offscreen');
    assert(await page.locator('.profile-close').evaluate((e) => { const r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); }), 'Fixed page chrome covers the profile close control');
    await page.locator('[data-act="close-profile"]').click();
    assert(Math.abs((await name.boundingBox()).y - before.y) < 2, 'Closing profile jumps the affiliation row');
    const outsideLabel = page.locator('.people-chart [data-profile="person:paul-christiano"] .lb').filter({ hasText: 'OpenAI Foundation' });
    await outsideLabel.click();
    assert((await page.locator('.profile-affiliations li.current').textContent()).includes('OpenAI Foundation'), 'Outside affiliation label is inert');
  });
  await check('Long inline profiles replace the article and return to its selection', async () => {
    await load('#safety-2017-deep-rl-human-prefs');
    const name = page.locator('.pane .people [data-profile="person:paul-christiano"]'); await name.click();
    assert(await page.locator('.pane-host').isHidden(), 'Full article remains stacked beneath inline profile');
    assert((await page.locator('.profile-return').textContent()).includes('Deep Reinforcement Learning from Human Preferences'), 'Compact return row loses selected event');
    await page.locator('.profile-return').click();
    assert(await page.locator('.pane-host').isVisible(), 'Returning did not restore the reading card');
    assert(await selected() === 'safety-2017-deep-rl-human-prefs', 'Returning changed the selected event');
    await name.click(); await page.locator('.search-results a').first().click();
    assert(await page.locator('.profile-dock').isHidden(), 'Explicit event selection retained inline profile');
    assert(await page.locator('.pane-host').isVisible(), 'Explicit event selection did not expose the card');
  });
  await check('Direct profile links and uncatalogued authors use existing work only', async () => {
    await load('#person-stuart-russell');
    assert(await page.locator('.profile-panel h3').textContent() === 'Stuart Russell', 'Profile deep link failed');
    assert(await page.locator('.profile-panel h3').evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), 'Direct profile link leaves its heading offscreen');
    await load('#lm-2017-transformer'); await page.locator('.pane .people [data-profile]').first().click();
    assert(await page.locator('.profile-related a').count() > 0, 'Author fallback has no event references');
    assert(await page.locator('.profile-affiliations li').count() === 0, 'Fallback invented affiliations');
    assert(await page.locator('.profile-head .eyebrow').textContent() === 'Person', 'Fallback assigns an unsupported profession');
    await page.locator('#atlas-org-search').fill('Ashish Vaswani');
    assert((await page.locator('#atlas-profile-select option').textContent()).includes('Ashish Vaswani'), 'Finder omits an inline fallback author');
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
  await check('Touch readers can move between map, card and a nearby profile', async () => {
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const mobile = await mobileContext.newPage(); mobile.on('pageerror', (e) => errors.push(e.message));
    await mobile.goto(base + '#safety-2023-ai-control');
    await mobile.locator('.navigator').scrollIntoViewIfNeeded(); await mobile.locator('.card-chip').tap();
    assert(await mobile.locator('.pane h3').evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 44 && r.bottom < innerHeight; }), 'Read control did not expose the selected card');
    await mobile.locator('.pane .people [data-profile]').first().tap();
    assert(await mobile.locator('.profile-dock .profile-panel h3').count() === 1, 'Touch did not open a nearby profile');
    assert(await mobile.locator('.profile-close').evaluate((e) => e.getBoundingClientRect().top >= 44), 'Sticky mobile switch obstructs the close control');
    await mobile.locator('[data-act="close-profile"]').tap();
    assert(await mobile.locator('.node.sel').getAttribute('data-event-id') === 'safety-2023-ai-control', 'Profile dismissal lost selected event');
    await mobile.locator('.workspace-switch [data-act="locate"]').tap();
    assert(await mobile.locator('.map').evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }), 'Map control did not return to the timeline');
    assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Touch workflow caused page overflow');
    await mobileContext.close();
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
