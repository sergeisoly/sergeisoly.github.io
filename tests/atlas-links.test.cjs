const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const project = path.join(__dirname, "../projects/ai-research-atlas");
const window = {};
vm.runInNewContext(fs.readFileSync(path.join(project, "data.js"), "utf8"), { window });
const atlas = window.TIMELINE_DATA;
const events = new Set(atlas.events.map(event => event.id));
const routes = new Set(atlas.threads.map(route => route.id));

test("readers can follow every route, card connection and profile event", () => {
  assert.equal(events.size, atlas.events.length, "duplicate event ID");
  assert.equal(routes.size, atlas.threads.length, "duplicate route ID");
  function checkTargets(from, ids) {
    for (const id of ids) assert.ok(events.has(id), `${from} points to missing event ${id}`);
  }
  for (const route of atlas.threads) {
    assert.ok(route.event_ids.length, `empty route ${route.id}`);
    checkTargets(route.id, route.event_ids);
  }
  for (const event of atlas.events) checkTargets(event.id, event.links.map(link => link.to));
  for (const profile of [...atlas.people, ...atlas.orgs]) {
    checkTargets(profile.name, profile.key_event_ids || []);
  }
});

test("opening questions work both as routes and as links to the static reading list", () => {
  const page = fs.readFileSync(path.join(project, "index.qmd"), "utf8");
  const questions = page.match(/<nav\b[^>]*class="atlas-start"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  const fallback = page.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1];
  assert.ok(questions && fallback, "missing introductory questions or static reading list");
  const links = Array.from(questions.matchAll(/<a\b[^>]+>/g), match => match[0]);
  assert.ok(links.length, "no opening questions");
  for (const link of links) {
    const id = link.match(/\bdata-route="([^"]+)"/)?.[1];
    assert.ok(routes.has(id), `missing route for ${link}`);
    assert.ok(link.includes(`href="#${id}"`), `bookmark disagrees with route ${id}`);
    assert.ok(fallback.includes(`id="${id}"`), `missing static reading list for ${id}`);
  }
});
