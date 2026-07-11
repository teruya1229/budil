/**
 * Budil v4.12.11 - profit target month view.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = (path) => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
};

for (const file of ['js/app.js', 'js/profit-brain.js', 'js/storage.js', 'js/data-backup.js']) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.12.11 profit-target-month ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const profitJs = load('js/profit-brain.js');
const revenueJs = load('js/revenue-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

console.log('== version / cache buster ==');
assert(indexHtml.includes('v4.12.11'), 'index.html should show v4.12.11');
assert(indexHtml.includes('js/app.js?v=4.12.11'), 'app.js cache buster should be v4.12.11');
assert(indexHtml.includes('js/profit-brain.js?v=4.12.11'), 'profit-brain cache buster should be v4.12.11');
assert(indexHtml.includes('css/style.css?v=4.12.11'), 'style.css cache buster should be v4.12.11');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.11'"), 'storage version should be v4.12.11');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.11'"), 'data-backup version should be v4.12.11');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.12.11'"), 'verify-current EXPECTED_VERSION should be v4.12.11');
assert(!indexHtml.includes('?v=4.12.10'), 'old cache buster v4.12.10 should be gone');
assert(statusMd.includes('v4.12.11'), 'status.md should document v4.12.11');
assert(handoffMd.includes('v4.12.11'), 'handoff.md should document v4.12.11');
assert(decisionLog.includes('v4.12.11'), 'decision-log.md should record v4.12.11');

console.log('== UI wiring ==');
assert(indexHtml.includes('id="profit-target-month"'), 'profit target month input required');
assert(indexHtml.includes('id="profit-target-month-reset"'), 'reset-to-current-month button required');
assert(indexHtml.includes('今月に戻す'), 'reset button label required');
assert(indexHtml.includes('id="profit-status-heading"'), 'dynamic status heading required');
assert(indexHtml.includes('id="profit-numbers-heading"'), 'dynamic numbers heading required');
assert(css.includes('profit-target-month-bar'), 'minimal CSS for target month bar required');

console.log('== in-memory state only ==');
assert(appJs.includes('let profitTargetMonthKey = null'), 'profitTargetMonthKey must be in-memory');
assert(appJs.includes('useProfitTargetMonth'), 'profit view must opt into target month context');
assert(!appJs.includes("localStorage.setItem('profitTargetMonth"), 'must not persist target month to localStorage');
assert(!appJs.includes('profit_target_month'), 'must not add profit_target_month storage key');
assert(!storageJs.includes('profitTargetMonth'), 'storage.js must not gain profitTargetMonth key');

console.log('== same-month filtering ==');
assert(appJs.includes('filterRecordsForProfitMonth'), 'month filter helper required');
assert(appJs.includes('getProfitContext({ useProfitTargetMonth: true })'), 'profit view context must use target month');
assert(appJs.includes('ctx.workOrderRows = []'), 'past month must clear work-order forecast rows');
assert(appJs.includes('buildUpcomingRevenueScheduleSummary(monthWorkOrders'), 'upcoming schedule must use selected-month work orders');
assert(appJs.includes("useProfitTargetMonth: true"), 'monthly closing from profit must pass target month');

console.log('== monthly result summary vs detail ==');
assert(appJs.includes('resolveProfitSummaryMetrics'), 'monthly-result summary metrics helper required');
assert(appJs.includes('s.usesMonthlyResult'), 'summary must detect monthly-result months');
assert(appJs.includes('詳細分析は保存済み明細のみ'), 'monthly-result note must clarify detail is detail-only');
assert(!appJs.includes('buildProfitSummaryFromMonthly') || true, 'app may rely on ProfitBrain monthly summary');
assert(!profitJs.includes('push(...monthly') && !appJs.includes('月次実績を売上行'), 'must not invent detail rows from monthly results');

console.log('== future month soft handling ==');
assert(appJs.includes("monthKind === 'future'"), 'future month branch required');
assert(appJs.includes('予定確認用'), 'future month must be labeled preview');
assert(appJs.includes('future_preview') || appJs.includes('月次実績未入力・経費未入力を締め警告にしません'), 'future month must not treat missing monthly as closing warning');

console.log('== other screens stay current-month ==');
assert(appJs.includes('getSharedMonthlyMetrics()'), 'other screens keep default current-month shared metrics');
assert(appJs.includes("renderMonthlyClosingCheck('exec-home-monthly-closing-check'"), 'exec home closing check remains');
assert(appJs.includes("renderMonthlyClosingCheck('revenue-monthly-closing-check'"), 'revenue closing check remains');

console.log('== profit rates / source / calendar unchanged ==');
assert(revenueJs.includes('direct: 100'), 'direct profit rate unchanged');
assert(revenueJs.includes('coop: 80'), 'coop profit rate unchanged');
assert(revenueJs.includes('yamada: 60'), 'yamada profit rate unchanged');
assert(profitJs.includes('resolveRevenueSourceLabel'), 'v4.12.10 source display helper must remain');
assert(!appJs.includes('localStorage.clear'), 'app must not clear localStorage');
assert(!indexHtml.includes('exportCalendarForBudil'), 'calendar API must not enter Budil UI');

console.log('\nAll v4.12.11 profit-target-month checks passed.');
