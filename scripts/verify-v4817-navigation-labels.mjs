/**
 * Budil v4.8.30 navigation and action flow label verification (v4817 successor).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = path => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

for (const file of ['app.js', 'executive-brain.js', 'storage.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const executiveBrain = load('js/executive-brain.js');

console.log('== v4.8.30 navigation labels (v4817 verify) ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.12.1'), 'header version should be v4.8.30');
assert(indexHtml.includes('Budil v4.12.1'), 'sidebar version should be v4.8.30');
assert(indexHtml.includes('js/app.js?v=4.12.1'), 'app.js cache buster should be v4.8.30');

assert(indexHtml.includes('\u96c6\u5ba2\u7ba1\u7406'), 'marketing group should exist');
assert(indexHtml.includes('\u30b5\u30a4\u30c8\u78ba\u8a8d\u8a18\u9332'), 'site check record UI should exist');
assert(indexHtml.includes('\u96c6\u5ba2\u65bd\u7b56\u30e1\u30e2'), 'strategy memo nav should exist');
assert(indexHtml.includes('\u6539\u5584\u30ea\u30b9\u30c8'), 'improvement list label should exist');
assert(indexHtml.includes('\u7d4c\u55b6\u30e1\u30e2'), 'business memo label should exist');
assert(indexHtml.includes('\u53d7\u4ed8\u30fb\u4e88\u5b9a\u78ba\u8a8d'), 'calendar entry should be schedule registration');
assert(indexHtml.includes('\u55b6\u696d\u7ba1\u7406'), 'sales group should exist');

assert(!indexHtml.includes('nav-label">\u9700\u8981\u30ec\u30fc\u30c0\u30fc'), 'radar should not be a top-level nav item');
assert(!indexHtml.includes('nav-label">\u9700\u8981\u30d4\u30c3\u30af\u30a2\u30c3\u30d7'), 'pickup should not be a top-level nav item');
assert(!indexHtml.includes('nav-label">\u9700\u8981\u30ea\u30b5\u30fc\u30c1'), 'demand search should not be a top-level nav item');
assert(!indexHtml.includes('\u5916\u90e8\u30c1\u30a7\u30c3\u30af\u5c65\u6b74'), 'old history label should be gone from nav');
assert(!indexHtml.includes('\u96c6\u5ba2\u30fb\u5916\u90e8\u30c1\u30a7\u30c3\u30af'), 'old marketing group label should be gone from nav');
assert(!indexHtml.includes('\u6539\u5584\u30a2\u30af\u30b7\u30e7\u30f3\u5019\u88dc'), 'old improvement candidate label should be gone');
assert(!indexHtml.includes('nav-label">\u78ba\u8a8d\u5c65\u6b74'), 'history should not be independent nav');

assert(appJs.includes('showImprovementListAddedNotice'), 'improvement list save notice should exist');
assert(appJs.includes('\u6539\u5584\u30ea\u30b9\u30c8\u306b\u8ffd\u52a0\u3057\u307e\u3057\u305f'), 'save notice text should mention improvement list');
assert(appJs.includes('\u6bce\u65e5\u3084\u308b\u3053\u3068\u3078'), 'save notice should link to daily tasks');
assert(appJs.includes('\u51fa\u3069\u3053\u308d\uff1a'), 'daily tasks should show origin label');
assert(appJs.includes('getDailyTaskOriginLabel'), 'origin label helper should exist');
assert(appJs.includes('STRATEGY_MEMO_VIEWS'), 'strategy memo nav mapping should exist');
assert(appJs.includes('\u6539\u5584\u30ea\u30b9\u30c8\u306b\u8ffd\u52a0'), 'add button should say add to improvement list');
assert(appJs.includes('\u6539\u5584\u30ea\u30b9\u30c8\u306f\u307e\u3060\u3042\u308a\u307e\u305b\u3093'), 'empty improvement list copy should exist');
assert(appJs.includes('EMPTY_DAILY_TASKS_COPY'), 'empty daily tasks copy constant should exist');
assert(appJs.includes('\u6bce\u65e5\u3084\u308b\u3053\u3068\u306f\u307e\u3060\u3042\u308a\u307e\u305b\u3093'), 'empty daily tasks copy should exist');
assert(appJs.includes('\u4f5c\u696d\u4e88\u5b9a\u306f\u307e\u3060\u3042\u308a\u307e\u305b\u3093'), 'empty work order copy should exist');

assert(executiveBrain.includes("label: '\u96c6\u5ba2\u7ba1\u7406'"), 'executive quick button should use marketing group');
assert(executiveBrain.includes("label: '\u96c6\u5ba2\u7ba1\u7406'"), 'executive secondary should use marketing group');

assert(!appJs.match(/\u884c\u52d5\u5019\u88dc\u306b\u8ffd\u52a0/), 'UI should not use action candidate add');
assert(!appJs.match(/\u4eca\u65e5\u3084\u308b\u3053\u3068\u5019\u88dc/), 'UI should not use daily task candidate in app.js');
assert(!indexHtml.match(/nav-label">[^<]*\u5019\u88dc/), 'nav should not expose candidate labels');

console.log('All v4.8.30 navigation label checks passed.');
