/**
 * Budil v4.11.12 - unify monthly metric labels across screens verification.
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = (path) => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
};

for (const file of [
  'js/revenue-brain.js',
  'js/executive-brain.js',
  'js/profit-brain.js',
  'js/app.js',
  'js/storage.js',
  'js/data-backup.js',
  'js/calendar-candidate-brain.js'
]) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.11.12 unify-monthly-metric-labels ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const executiveBrainJs = load('js/executive-brain.js');
const profitBrainJs = load('js/profit-brain.js');
const calendarBrainJs = load('js/calendar-candidate-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');
const receptionJs = load('js/reception-brain.js');
const documentsJs = load('js/documents-brain.js');
const followJs = load('js/follow-up-brain.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

const officialLabels = ['確定売上', '予定売上', '合計売上', '今月経費', '確定利益', '予定利益', '合計利益', '入金済み', '入金待ち'];
const forbiddenLabels = [
  '今月利益',
  '今月売上',
  '今月合計売上',
  '今月合計利益',
  '今月予定売上',
  '今月予定利益',
  '予定売上見込み',
  '見込み利益',
  '見込み売上',
  '見込み金額',
  '予定含む',
  '合計売上（予定含む）',
  '今月の合計売上（予定含む）',
  '今月の利益',
  'profitRevLabel'
];

console.log('== version check ==');
assert(indexHtml.includes('v4.11.12'), 'index.html should show v4.11.12');
assert(indexHtml.includes('js/app.js?v=4.11.12'), 'app.js cache buster should be v4.11.12');
assert(indexHtml.includes('js/revenue-brain.js?v=4.11.12'), 'revenue-brain cache buster should be v4.11.12');
assert(indexHtml.includes('js/executive-brain.js?v=4.11.12'), 'executive-brain cache buster should be v4.11.12');
assert(storageJs.includes("BUDIL_VERSION: 'v4.11.12'"), 'storage.js version should be v4.11.12');
assert(dataBackupJs.includes("APP_VERSION: 'v4.11.12'"), 'data-backup version should be v4.11.12');
assert(statusMd.includes('v4.11.12'), 'status.md should document v4.11.12');
assert(handoffMd.includes('v4.11.12'), 'handoff.md should document v4.11.12');
assert(decisionLog.includes('v4.11.12'), 'decision-log.md should record v4.11.12');

console.log('== executive home / morning report ==');
assert(appJs.includes('<span>合計売上</span>'), 'executive home should show 合計売上');
assert(appJs.includes('<span>合計利益</span>'), 'executive home should show 合計利益');
assert(appJs.includes('合計売上 ${esc(RevenueBrain.formatYen(rp.totalRevenue'), 'morning report should show 合計売上');
assert(appJs.includes('合計利益 ${esc(ProfitBrain.formatYen(rp.totalProfit'), 'morning report should show 合計利益');
assert(appJs.includes('今月経費 ${esc(ProfitBrain.formatYen(rp.monthExpense))}'), 'morning report should show 今月経費');
assert(executiveBrainJs.includes("monthRevenueLabel = '合計売上'"), 'executive monthRevenueLabel should be 合計売上');
assert(executiveBrainJs.includes('合計売上 ${RevenueBrain.formatYen(rp.totalRevenue'), 'executive morning lines should use 合計売上');

console.log('== profit management ==');
for (const label of ['確定売上', '予定売上', '合計売上', '今月経費', '確定利益', '予定利益', '合計利益']) {
  assert(appJs.includes(`label: '${label}'`), `profit/revenue summary should include ${label}`);
}
assert(appJs.includes('getSharedMonthlyMetrics({ monthKey: s.monthKey })'), 'profit summary should use shared monthly metrics');

console.log('== calendar import ==');
assert(indexHtml.includes('予定売上（円）'), 'calendar import form should show 予定売上（円）');
assert(!indexHtml.includes('見込み金額（円）'), 'calendar import form must not show 見込み金額（円）');
assert(indexHtml.includes('この金額は予定売上として扱い、売上確定後は確定売上に移ります。'), 'calendar import note should explain 予定売上');
assert(calendarBrainJs.includes("'予定売上（円）': 'estimateAmount'"), 'calendar import mapping should accept 予定売上（円）');

console.log('== monthly results form labels ==');
assert(indexHtml.includes('for="monthly-results-sales">合計売上<'), 'monthly results sales label should be 合計売上');
assert(indexHtml.includes('for="monthly-results-profit">合計利益<'), 'monthly results profit label should be 合計利益');

console.log('== revenue summary official labels ==');
for (const label of officialLabels) {
  assert(appJs.includes(`label: '${label}'`), `revenue summary should include ${label}`);
}

console.log('== forbidden label scan (app.js / index.html) ==');
for (const term of forbiddenLabels) {
  assert(!appJs.includes(term), `app.js must not include forbidden label: ${term}`);
}
for (const term of ['見込み金額（円）', '見込み利益', '予定売上見込み', '今月合計売上', '今月合計利益', '今月利益', '今月売上']) {
  assert(!indexHtml.includes(term), `index.html must not include forbidden label: ${term}`);
}

console.log('== untouched files ==');
assert(!receptionJs.includes('buildSharedMonthlyMetrics'), 'reception-brain must not change for v4.11.12');
assert(!documentsJs.includes('buildSharedMonthlyMetrics'), 'documents-brain must not change for v4.11.12');
assert(!followJs.includes('buildSharedMonthlyMetrics'), 'follow-up-brain must not change for v4.11.12');

execSync('node scripts/verify-v4113-clarify-monthly-total-scheduled-metrics.mjs', { cwd: root, stdio: 'inherit' });

console.log('\nAll v4.11.12 unify-monthly-metric-labels checks passed.');
