/**
 * Budil v4.10.1 expense input wording normalization verification.
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

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const profitBrain = load('js/profit-brain.js');
const executiveBrain = load('js/executive-brain.js');
const css = load('css/style.css');

for (const file of ['profit-brain.js', 'app.js', 'executive-brain.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

console.log('== v4.10.1 expense input wording ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.11.15'), 'header version should be v4.10.1');
assert(indexHtml.includes('Budil v4.11.15'), 'sidebar version should be v4.10.1');
assert(indexHtml.includes('js/app.js?v=4.11.15'), 'app.js cache buster should be v4.10.1');
assert(load('js/storage.js').includes("BUDIL_VERSION: 'v4.11.15'"), 'storage version should be v4.10.1');

assert(indexHtml.includes('\u7d4c\u8cbb\u5165\u529b'), 'profit view expense section should use \u7d4c\u8cbb\u5165\u529b');
assert(indexHtml.includes('profit-expense-form-section'), 'profit expense form section should exist');
assert(!indexHtml.includes('\u652f\u51fa\u767b\u9332'), 'index.html should not use \u652f\u51fa\u767b\u9332');
assert(!profitBrain.includes('\u652f\u51fa\u767b\u9332'), 'profit-brain should not use \u652f\u51fa\u767b\u9332');
assert(!appJs.includes('\u652f\u51fa\u767b\u9332'), 'app.js should not use \u652f\u51fa\u767b\u9332');
assert(!executiveBrain.includes('\u652f\u51fa\u767b\u9332'), 'executive-brain should not use \u652f\u51fa\u767b\u9332');

assert(profitBrain.includes('\u7d4c\u8cbb\u5165\u529b\uff1a\u4eca\u6708\u306e\u7d4c\u8cbb\u30921\u4ef6\u8a18\u9332'), 'profit hint should use \u7d4c\u8cbb\u5165\u529b');
assert(appJs.includes('経費入力で保存した支出明細'), 'profit diagnostics should describe expense input storage');
assert(appJs.includes('renderProfitOperationsDiagnostics'), 'profit operations diagnostics should remain');
assert(appJs.includes('renderRevenueFlowDiagnostics'), 'sales flow diagnostics should remain');
assert(indexHtml.includes('revenue-flow-diagnostics'), 'sales flow diagnostics block should remain');
assert(indexHtml.includes('今月の数字') || indexHtml.includes('利益状態'), 'executive summary heading should remain');

assert(css.includes('profit-operations-diagnostics-block'), 'profit diagnostics styles should exist');
assert(css.includes('@media (max-width: 390px)') || css.includes('overflow-x: hidden'), 'layout should avoid horizontal scroll');

console.log('All v4.10.1 expense input wording checks passed.');
