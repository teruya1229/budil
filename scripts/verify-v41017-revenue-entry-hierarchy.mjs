/**
 * Budil v4.10.20 — revenue entry hierarchy verification.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = (path) => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

for (const file of ['app.js', 'monthly-results-brain.js', 'storage.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

console.log('== v4.10.20 revenue entry hierarchy ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const monthlyBrain = load('js/monthly-results-brain.js');
const css = load('css/style.css');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

assert(indexHtml.includes('v4.10.28'), 'index.html should show v4.10.28');
assert(indexHtml.includes('js/app.js?v=4.10.28'), 'app.js cache buster should be v4.10.28');
assert(storageJs.includes("BUDIL_VERSION: 'v4.10.28'"), 'storage.js version should be v4.10.28');
assert(dataBackupJs.includes("APP_VERSION: 'v4.10.28'"), 'data-backup version should be v4.10.28');

const revenueViewStart = indexHtml.indexOf('id="view-revenue"');
const revenueViewEnd = indexHtml.indexOf('id="view-revenue-analysis"');
const revenueChunk = indexHtml.slice(revenueViewStart, revenueViewEnd);

assert(revenueChunk.includes('revenue-flow-hint'), 'revenue view should include flow hint');
assert(revenueChunk.includes('id="revenue-list-section"'), 'revenue list should exist');
assert(revenueChunk.includes('id="revenue-manual-input-details"'), 'manual input should be in details');
assert(
  revenueChunk.indexOf('id="revenue-list-section"') < revenueChunk.indexOf('id="revenue-manual-input-details"'),
  'revenue list should appear before manual input details'
);
assert(revenueChunk.includes('売上明細を手入力（例外）'), 'manual input summary should mark exception');
assert(!revenueChunk.includes('id="btn-revenue-new" class="btn btn-primary'), 'add button must not be primary');
assert(revenueChunk.includes('id="btn-revenue-new" class="btn btn-secondary'), 'add button should be secondary');

const dailyStart = indexHtml.indexOf('card-daily-action-tasks');
const dailyEnd = indexHtml.indexOf('card-external-check-collapse');
const dailyChunk = indexHtml.slice(dailyStart, dailyEnd);
assert(dailyChunk.includes('daily-section-revenue-exception'), 'daily quick input should be exception section');
assert(dailyChunk.includes('予定にない売上を手入力（例外）'), 'daily quick input summary should mark exception');

assert(appJs.includes('confirmRevenueSaveWithDuplicateCheck(revenuePayload'), 'work completion should use duplicate guard');
assert(appJs.includes('isWorkOrderRevenueLocked'), 'actualRevenueId lock should remain');
assert(appJs.includes('findMonthlyAdjustmentDuplicates'), 'monthly adjustment duplicate helper should exist');
assert(appJs.includes('月次調整明細として'), 'monthly adjustment confirm should explain adjustment');
assert(appJs.includes('confirmRevenueSaveWithDuplicateCheck(payload, \'\')'), 'monthly adjustment should use duplicate guard');
assert(appJs.includes('tryLinkDocumentToExistingRevenue'), 'invoice link guard should remain');
assert(appJs.includes('revenue-manual-input-details'), 'goToAddRevenue should open manual input details');
assert(appJs.includes("navigateToView('revenue', '#revenue-list-section')"), 'daily quick save should link to revenue list');
assert(!appJs.includes('localStorage.clear()'), 'localStorage.clear must not be used');

assert(monthlyBrain.includes('findMonthlyAdjustmentDuplicates'), 'monthly brain should expose adjustment duplicate helper');
assert(monthlyBrain.includes('MONTHLY_ADJUSTMENT_CUSTOMER'), 'monthly adjustment customer label should remain');

assert(css.includes('revenue-flow-hint'), 'css should style revenue flow hint');
assert(css.includes('card-revenue-manual-input'), 'css should style manual input details');

const forbiddenUiTerms = [
  '売上登録',
  '売上登録へ',
  '一括売上登録',
  '登録対象を売上登録',
  '作業後確定',
  '作業後売上確定',
  '作業完了後',
  '作業完了',
  '売上登録済み'
];
for (const term of forbiddenUiTerms) {
  assert(!indexHtml.includes(term), `index.html should not include ${term} in normal UI`);
}

console.log('== regression: v4.10.16 entry simplification ==');
execSync('node scripts/verify-v41016-entry-simplification.mjs', { cwd: root, stdio: 'inherit' });

assert(statusMd.includes('v4.10.20'), 'status.md should document v4.10.20');
assert(handoffMd.includes('v4.10.20'), 'handoff.md should document v4.10.20');
assert(decisionLog.includes('v4.10.20'), 'decision-log.md should record v4.10.20');

console.log('All v4.10.20 revenue entry hierarchy checks passed.');
