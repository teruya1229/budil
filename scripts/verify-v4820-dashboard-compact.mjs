/**
 * Budil v4.8.26 dashboard external check compact + label fixes verification.
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
const css = load('css/style.css');

console.log('== v4.8.26 dashboard compact ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.8.26'), 'header version should be v4.8.26');
assert(indexHtml.includes('Budil v4.8.26'), 'sidebar version should be v4.8.26');
assert(indexHtml.includes('js/app.js?v=4.8.26'), 'app.js cache buster should be v4.8.26');

assert(indexHtml.includes('\u6642\u9593\u304c\u3042\u308b\u6642\u306e\u6b21\u306e\u4e00\u624b'), 'improvement sublead should exist');
assert(indexHtml.includes('\u6539\u5584\u30ea\u30b9\u30c8\u304b\u3089\u3001\u4eca\u65e5\u3084\u308b\u5206\u3060\u3051\u78ba\u8a8d\u3057\u307e\u3059'), 'improvement hint should exist');
assert(indexHtml.includes('\u6bce\u65e5\u3084\u308b\u3053\u3068\uff08\u30bf\u30b9\u30af\uff09'), 'backup scope should use daily tasks label');
assert(!indexHtml.includes('\u4eca\u65e5\u3084\u308b\u3053\u3068\uff08\u30bf\u30b9\u30af\uff09'), 'backup scope should not use old daily tasks label');

assert(appJs.includes('external-check-dash-brief'), 'dash external check brief block should exist');
assert(appJs.includes('external-check-dash-summary-line'), 'dash external check summary lines should exist');
assert(appJs.includes('\u4fdd\u5b58\u6e08\u307f\uff1a'), 'saved count summary should exist');
assert(appJs.includes('\u672a\u78ba\u8a8d\uff1a'), 'unconfirmed count summary should exist');
assert(appJs.includes('external-check-dash-details'), 'external check details wrapper should exist');
assert(appJs.includes('\u5916\u90e8\u78ba\u8a8d\u306e\u8a73\u7d30\u3092\u958b\u304f'), 'external check details summary should exist');
assert(appJs.includes('renderDashExternalCheckDetailsBody'), 'external check details body renderer should exist');
assert(!appJs.match(/renderDashExternalCheck\(\)[\s\S]{0,800}renderExternalCheckSummaryBlock\(latest, true\)/), 'dash external check should not inline full compact summary');

assert(indexHtml.includes('daily-revenue-quick-form'), 'daily revenue quick form should remain');
assert(indexHtml.includes('daily-upcoming-schedule'), 'daily upcoming schedule should remain');
assert(css.includes('daily-improvement-sublead'), 'improvement sublead styles should exist');
assert(css.includes('external-check-dash-details'), 'external check dash details styles should exist');

console.log('All v4.8.26 dashboard compact checks passed.');
