/**
 * Budil v4.8.30 concrete navigation label verification.
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

console.log('== v4.8.30 navigation labels ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.11.14'), 'header version should be v4.8.30');
assert(indexHtml.includes('Budil v4.11.14'), 'sidebar version should be v4.8.30');
assert(indexHtml.includes('js/app.js?v=4.11.14'), 'app.js cache buster should be v4.8.30');

assert(indexHtml.includes('\u53d7\u4ed8\u30fb\u4e88\u5b9a\u78ba\u8a8d'), 'calendar registration nav should exist');
assert(indexHtml.includes('\u4e88\u5b9a\u53d6\u308a\u8fbc\u307f'), 'schedule import nav should exist');
assert(!indexHtml.includes('nav-label">\u904e\u53bb\u58f2\u4e0a\u5fa9\u5143'), 'past sales recovery nav should be hidden');
assert(indexHtml.includes('\u6708\u6b21\u7de0\u3081'), 'monthly close nav should exist');
assert(indexHtml.includes('\u5229\u76ca\u7ba1\u7406'), 'profit nav should exist');
assert(indexHtml.includes('\u96c6\u5ba2\u30c1\u30a7\u30c3\u30af'), 'analytics nav should exist');
assert(indexHtml.includes('\u96c6\u5ba2\u65bd\u7b56\u30e1\u30e2'), 'strategy memo nav should exist');
assert(indexHtml.includes('\u6539\u5584\u30ea\u30b9\u30c8'), 'improvement list label should exist');
assert(indexHtml.includes('\u7d4c\u55b6\u30e1\u30e2'), 'business memo label should exist');

assert(!indexHtml.includes('nav-label">\u53d7\u4ed8\u30fb\u4e88\u7d04'), 'reception should not be a separate nav item');
assert(!indexHtml.includes('nav-label">\u4f5c\u696d\u4e88\u5b9a'), 'work order should not be a separate nav item');
assert(!indexHtml.includes('nav-label">\u78ba\u8a8d\u5c65\u6b74'), 'history should not be an independent nav item');
assert(!indexHtml.includes('nav-label">\u9700\u8981\u30ec\u30fc\u30c0\u30fc'), 'radar should not be a top-level nav item');
assert(!indexHtml.includes('nav-label">\u9700\u8981\u30d4\u30c3\u30af\u30a2\u30c3\u30d7'), 'pickup should not be a top-level nav item');
assert(!indexHtml.includes('nav-label">\u9700\u8981\u30ea\u30b5\u30fc\u30c1'), 'demand search should not be a top-level nav item');
assert(!indexHtml.includes('nav-label">\u5916\u90e8\u78ba\u8a8d'), 'external check should not be nav label');
assert(!indexHtml.includes('nav-label">\u65bd\u7b56\u30e1\u30e2'), 'old strategy memo nav should be gone');
assert(!indexHtml.includes('nav-label">\u5229\u76ca\u30b5\u30de\u30ea\u30fc'), 'profit summary nav should be gone');
assert(!indexHtml.includes('nav-label">\u6708\u6b21\u5b9f\u7e3e</span>'), 'old monthly results nav should be gone');
assert(!indexHtml.includes('\u5916\u90e8\u78ba\u8a8d\u30d7\u30ed\u30f3\u30d7\u30c8'), 'external check prompt should not appear in UI');
assert(!indexHtml.match(/nav-label">[^<]*\u5019\u88dc/), 'nav should not expose candidate labels');

assert(indexHtml.includes('view-calendar-registration'), 'merged calendar registration view should exist');
assert(indexHtml.includes('\u53d7\u4ed8\u5165\u529b'), 'reception input section should exist');
assert(indexHtml.includes('緊急手入力'), 'emergency manual work order section should exist');

assert(appJs.includes('calendar-registration'), 'app should support calendar-registration view');
assert(appJs.includes('showImprovementListAddedNotice'), 'improvement list save notice should exist');
assert(appJs.includes('\u6539\u5584\u30ea\u30b9\u30c8\u306b\u8ffd\u52a0\u3057\u307e\u3057\u305f'), 'save notice text should mention improvement list');
assert(appJs.includes('\u6bce\u65e5\u3084\u308b\u3053\u3068\u3078'), 'save notice should link to daily tasks');
assert(appJs.includes('\u6539\u5584\u30ea\u30b9\u30c8\u306f\u307e\u3060\u3042\u308a\u307e\u305b\u3093'), 'empty improvement list copy should exist');
assert(appJs.includes('EMPTY_DAILY_TASKS_COPY'), 'empty daily tasks copy constant should exist');
assert(appJs.includes('\u6bce\u65e5\u3084\u308b\u3053\u3068\u306f\u307e\u3060\u3042\u308a\u307e\u305b\u3093'), 'empty daily tasks copy should exist');
assert(appJs.includes('\u4f5c\u696d\u4e88\u5b9a\u306f\u307e\u3060\u3042\u308a\u307e\u305b\u3093'), 'empty work order copy should exist');
assert(appJs.includes('PAST_RECOVERY_UI_ENABLED = false'), 'past recovery UI should be disabled');
assert(indexHtml.includes('\u4e88\u5b9a\u53d6\u308a\u8fbc\u307f'), 'schedule import view title should exist');
assert(appJs.includes('STRATEGY_MEMO_VIEWS'), 'strategy memo nav mapping should exist');
assert(appJs.includes('\u6539\u5584\u30ea\u30b9\u30c8\u306b\u8ffd\u52a0'), 'add button should say add to improvement list');
assert(appJs.includes('\u30b5\u30a4\u30c8\u78ba\u8a8d\u8a18\u9332'), 'app should use site check record label');

assert(executiveBrain.includes("label: '\u96c6\u5ba2\u7ba1\u7406'"), 'executive quick button should use marketing group');
assert(executiveBrain.includes("label: '\u96c6\u5ba2\u7ba1\u7406'"), 'executive secondary should use marketing group');

assert(!appJs.match(/\u884c\u52d5\u5019\u88dc\u306b\u8ffd\u52a0/), 'UI should not use action candidate add');
assert(!appJs.match(/\u4eca\u65e5\u3084\u308b\u3053\u3068\u5019\u88dc/), 'UI should not use daily task candidate in app.js');
assert(!appJs.includes('\u5916\u90e8\u78ba\u8a8d\u30d7\u30ed\u30f3\u30d7\u30c8'), 'app should not show external check prompt label');

console.log('All v4.8.30 navigation label checks passed.');
