/**
 * Budil v4.8.26 marketing / site check record label verification.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = path => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

for (const file of ['app.js', 'analytics-brain.js', 'external-check-brain.js', 'storage.js', 'executive-brain.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const analyticsBrain = load('js/analytics-brain.js');
const storageJs = load('js/storage.js');
const actionBrain = load('js/action-brain.js');
const executiveBrain = load('js/executive-brain.js');

console.log('== v4.8.26 marketing/site check labels ==');

assert(indexHtml.includes('\u7d4c\u55b6\u8133\u307f\u305d v4.8.26'), 'header version should be v4.8.26');
assert(indexHtml.includes('Budil v4.8.26'), 'sidebar version should be v4.8.26');
assert(indexHtml.includes('js/app.js?v=4.8.26'), 'app.js cache buster should be v4.8.26');
assert(indexHtml.includes('\u96c6\u5ba2\u7ba1\u7406'), 'marketing group label should exist');
assert(indexHtml.includes('\u30b5\u30a4\u30c8\u78ba\u8a8d\u8a18\u9332'), 'site check record label should exist');
assert(indexHtml.includes('\u5916\u90e8\u30ec\u30dd\u30fc\u30c8\u53d6\u308a\u8fbc\u307f'), 'external report import label should exist');
assert(indexHtml.includes('\u30a2\u30af\u30bb\u30b9\u78ba\u8a8d\u7528\u306e\u6587\u3092\u30b3\u30d4\u30fc'), 'access check copy label should exist');
assert(indexHtml.includes('\u96c6\u5ba2\u65bd\u7b56\u30e1\u30e2'), 'strategy memo nav should exist');
assert(indexHtml.includes('\u6539\u5584\u30ea\u30b9\u30c8'), 'improvement list label should exist');
assert(executiveBrain.includes("label: '\u96c6\u5ba2\u7ba1\u7406'"), 'executive quick button should use marketing group');
assert(executiveBrain.includes("label: '\u30b5\u30a4\u30c8\u78ba\u8a8d\u8a18\u9332'"), 'executive secondary should use site check record');
assert(!executiveBrain.includes("label: '\u96c6\u5ba2\u30fb\u9700\u8981'"), 'executive quick button should not use the old label');
assert(!indexHtml.includes('\u30d6\u30e9\u30a6\u30b6\u30fc\u756a\u982d\u9023\u643a'), 'legacy browser integration label should not be visible');
assert(!indexHtml.includes('\u30d6\u30e9\u30a6\u30b6\u30fc\u756a\u982d\u30d7\u30ed\u30f3\u30d7\u30c8'), 'legacy browser prompt label should not be visible');
assert(!indexHtml.includes('\u5916\u90e8\u78ba\u8a8d\u30d7\u30ed\u30f3\u30d7\u30c8'), 'external check prompt label should not be visible');
assert(!indexHtml.includes('nav-label">\u5916\u90e8\u78ba\u8a8d'), 'external check should not be nav label');

assert(analyticsBrain.includes('\u5916\u90e8\u78ba\u8a8d/\u30a2\u30ca\u30ea\u30c6\u30a3\u30af\u30b9'), 'analytics source label should remain in brain');
assert(appJs.includes("p.source === '\u30d6\u30e9\u30a6\u30b6\u30fc\u756a\u982d/\u30a2\u30ca\u30ea\u30c6\u30a3\u30af\u30b9'"), 'old analytics source label should remain readable');
assert(appJs.includes("p.source === '\u5916\u90e8\u78ba\u8a8d/\u30a2\u30ca\u30ea\u30c6\u30a3\u30af\u30b9'"), 'analytics source label should be readable');
assert(storageJs.includes('budil_external_check_reports'), 'external check storage key should remain');
assert(actionBrain.includes('budil_action_candidates') || storageJs.includes('budil_action_candidates'), 'action candidate storage key should remain');
assert(storageJs.includes('budil_action_candidate_states'), 'action candidate state key should remain');
assert(!appJs.includes('localStorage.' + 'clear()'), 'app should not clear localStorage');
assert(!storageJs.includes('saveRevenueRecords(' + '[])'), 'storage should not save empty revenue records directly');

console.log('All v4.8.26 marketing/site check label checks passed.');
