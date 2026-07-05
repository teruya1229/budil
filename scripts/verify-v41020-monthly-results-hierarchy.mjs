/**
 * Budil v4.10.20 — monthly results hierarchy verification.
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

for (const file of ['app.js', 'storage.js', 'data-backup.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}
execSync(`node --check "${join(root, 'js', 'monthly-results-brain.js')}"`, { stdio: 'inherit' });

console.log('== v4.10.20 monthly results hierarchy ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const monthlyBrain = load('js/monthly-results-brain.js');
const css = load('css/style.css');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

assert(indexHtml.includes('v4.10.37'), 'index.html should show v4.10.37');
assert(indexHtml.includes('js/app.js?v=4.10.37'), 'app.js cache buster should be v4.10.37');
assert(storageJs.includes("BUDIL_VERSION: 'v4.10.37'"), 'storage.js version should be v4.10.37');
assert(dataBackupJs.includes("APP_VERSION: 'v4.10.37'"), 'data-backup version should be v4.10.37');

const monthlyViewStart = indexHtml.indexOf('id="view-monthly-results"');
const monthlyViewEnd = indexHtml.indexOf('<!-- フォロー -->', monthlyViewStart) || indexHtml.indexOf('section id="view-follow', monthlyViewStart);
const monthlyViewChunk = indexHtml.slice(monthlyViewStart, monthlyViewEnd > monthlyViewStart ? monthlyViewEnd : monthlyViewStart + 5000);

assert(monthlyViewChunk.includes('照合'), 'monthly-results view should mention 照合 (reconciliation)');
assert(monthlyViewChunk.includes('過去月'), 'monthly-results view should mention 過去月');
assert(monthlyViewChunk.includes('monthly-results-purpose-note'), 'monthly-results purpose note should exist');
assert(monthlyViewChunk.includes('通常の売上'), 'monthly-results view should clarify normal sales flow');
assert(monthlyViewChunk.includes('売上確定待ち'), 'monthly-results view should reference 売上確定待ち as normal flow');

const navChunk = indexHtml.slice(0, indexHtml.indexOf('</nav>') + 10);
assert(!navChunk.includes('月次実績入力</span>'), 'nav label should not say 月次実績入力 (should be 月次実績・照合 or similar)');
assert(navChunk.includes('data-view="monthly-results"'), 'monthly-results nav button should remain');

assert(monthlyViewChunk.includes('売上明細との整合チェック'), '整合チェック card should remain');
assert(monthlyViewChunk.includes('自動同期はしません'), 'no-auto-sync note should remain');

assert(appJs.includes('reconciliation-adjustment-details'), 'diff action should be wrapped in details element');
assert(appJs.includes('通常の作業売上ではありません'), 'adjustment action must state it is not normal sales');
assert(appJs.includes('月次調整'), 'adjustment must be labeled as 月次調整 in action text');
assert(appJs.includes('findMonthlyAdjustmentDuplicates'), 'duplicate check function must exist');
assert(appJs.includes('同月・同額の月次調整明細が既にあります'), 'duplicate warning must exist');
assert(appJs.includes('月次実績と売上明細の差額調整'), 'adjustment must reference its reconciliation purpose');

assert(monthlyBrain.includes('MONTHLY_ADJUSTMENT_CUSTOMER'), 'monthly brain should define adjustment customer');
assert(monthlyBrain.includes('MONTHLY_ADJUSTMENT_SERVICE'), 'monthly brain should define adjustment service');
assert(monthlyBrain.includes('MONTHLY_ADJUSTMENT_SOURCE'), 'monthly brain should define adjustment source');
assert(monthlyBrain.includes('isMonthlyAdjustmentRecord'), 'isMonthlyAdjustmentRecord should exist');
assert(monthlyBrain.includes('buildMonthlyAdjustmentPayload'), 'buildMonthlyAdjustmentPayload should exist');
assert(monthlyBrain.includes('findMonthlyAdjustmentDuplicates'), 'findMonthlyAdjustmentDuplicates should exist');
assert(monthlyBrain.includes('AGGREGATION_SOURCE_NOTE'), 'AGGREGATION_SOURCE_NOTE should exist (monthly-result priority note)');
assert(monthlyBrain.includes('budil_revenue_records'), 'monthly brain should reference revenue records separately');

assert(!appJs.includes('autoMergeMonthlyResult'), 'auto-merge must not exist');
assert(!appJs.includes('mergeMonthlyToRevenue'), 'merge to revenue must not exist');
assert(!appJs.includes('localStorage.clear()'), 'localStorage.clear must not be used');

assert(appJs.includes('usesMonthlyResult'), 'monthly-result priority aggregation should remain');
assert(monthlyBrain.includes("aggregationSource: 'monthly-result'"), 'aggregation source field should remain in monthly-results-brain');

assert(css.includes('v4.10.20'), 'css should include v4.10.20 marker');

const forbiddenUiTerms = [
  '売上登録',
  '売上登録へ',
  '一括売上登録',
  '作業後確定',
  '作業後売上確定',
  '作業完了後',
  '作業完了',
  '売上登録済み'
];
for (const term of forbiddenUiTerms) {
  assert(!indexHtml.includes(term), `index.html must not include ${term}`);
}

console.log('== regression: v4.10.19 payment entry hierarchy ==');
execSync('node scripts/verify-v41019-payment-entry-hierarchy.mjs', { cwd: root, stdio: 'inherit' });

assert(statusMd.includes('v4.10.20'), 'status.md should document v4.10.20');
assert(handoffMd.includes('v4.10.20'), 'handoff.md should document v4.10.20');
assert(decisionLog.includes('v4.10.20'), 'decision-log.md should record v4.10.20');

console.log('All v4.10.20 monthly results hierarchy checks passed.');
