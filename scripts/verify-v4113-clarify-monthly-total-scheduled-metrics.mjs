/**
 * Budil v4.12.4 - clarify monthly total and scheduled metrics verification.
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
  'js/app.js',
  'js/storage.js',
  'js/data-backup.js'
]) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.12.4 clarify-monthly-total-scheduled-metrics ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const revenueBrainJs = load('js/revenue-brain.js');
const executiveBrainJs = load('js/executive-brain.js');
const profitBrainJs = load('js/profit-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');
const receptionJs = load('js/reception-brain.js');
const documentsJs = load('js/documents-brain.js');
const followJs = load('js/follow-up-brain.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

console.log('== version check ==');
assert(indexHtml.includes('v4.12.14'), 'index.html should show v4.12.14');
assert(indexHtml.includes('js/app.js?v=4.12.14'), 'app.js cache buster should be v4.12.14');
assert(indexHtml.includes('js/revenue-brain.js?v=4.12.14'), 'revenue-brain cache buster should be v4.12.14');
assert(indexHtml.includes('js/executive-brain.js?v=4.12.14'), 'executive-brain cache buster should be v4.12.14');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.14'"), 'storage.js version should be v4.12.14');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.14'"), 'data-backup version should be v4.12.14');
assert(statusMd.includes('v4.12.5'), 'status.md should document v4.12.4');
assert(handoffMd.includes('v4.12.5'), 'handoff.md should document v4.12.4');
assert(decisionLog.includes('v4.12.5'), 'decision-log.md should record v4.12.4');

console.log('== shared metrics fields ==');
assert(revenueBrainJs.includes('scheduledRevenue = plannedAdditionalRevenue'), 'scheduledRevenue should alias plannedAdditionalRevenue');
assert(revenueBrainJs.includes('totalRevenue = confirmedRevenue + plannedAdditionalRevenue'), 'totalRevenue should sum confirmed and scheduled');
assert(revenueBrainJs.includes('totalProfit = confirmedGrossProfit + scheduledGrossProfit - monthExpense'), 'totalProfit should use gross shares minus expense');
assert(revenueBrainJs.includes('plannedRevenue = totalRevenue'), 'plannedRevenue should remain legacy alias of totalRevenue');
assert(revenueBrainJs.includes('plannedProfit = totalProfit'), 'plannedProfit should remain legacy alias of totalProfit');
assert(revenueBrainJs.includes('monthlyTarget - totalRevenue'), 'remainingToTarget should use totalRevenue');
assert(revenueBrainJs.includes('totalRevenue / monthlyTarget'), 'achievementRate should use totalRevenue');

console.log('== revenue summary labels ==');
assert(appJs.includes("label: '予定売上'"), 'revenue summary should show 予定売上 label');
assert(appJs.includes("label: '合計売上'"), 'revenue summary should show 合計売上 label');
assert(appJs.includes("label: '確定利益'"), 'revenue summary should show 確定利益 label');
assert(appJs.includes("label: '合計利益'"), 'revenue summary should show 合計利益 label');
assert(appJs.includes("label: '今月経費'"), 'revenue summary should show 今月経費 label');
assert(appJs.includes("label: '予定利益'"), 'revenue summary should show 予定利益 label');
assert(!appJs.includes("label: '確定', value:"), 'revenue summary must not keep standalone 確定 label');
assert(!appJs.includes("{ label: '予定売上', value: RevenueBrain.formatYen(m.plannedRevenue)"), '予定売上 must not use plannedRevenue for display');

console.log('== executive home labels ==');
assert(appJs.includes('<span>合計売上</span>'), 'executive home should show 合計売上');
assert(appJs.includes('<span>合計利益</span>'), 'executive home should show 合計利益');
assert(appJs.includes('<span>確定売上</span>'), 'executive home should show 確定売上');
assert(appJs.includes('<span>予定売上</span>'), 'executive home should show 予定売上');
assert(appJs.includes('<span>今月経費</span>'), 'executive home should show 今月経費');
assert(!appJs.includes('今月合計売上'), 'executive home must not show 今月合計売上');
assert(!appJs.includes('今月合計利益'), 'executive home must not show 今月合計利益');
assert(appJs.includes('<span>予定利益</span>'), 'executive home should show 予定利益');
assert(executiveBrainJs.includes("monthRevenueLabel = '合計売上'"), 'executive monthRevenueLabel should be 合計売上');

console.log('== untouched files ==');
assert(!receptionJs.includes('buildSharedMonthlyMetrics'), 'reception-brain must not change for v4.12.4');
assert(!documentsJs.includes('buildSharedMonthlyMetrics'), 'documents-brain must not change for v4.12.4');
assert(!followJs.includes('buildSharedMonthlyMetrics'), 'follow-up-brain must not change for v4.12.4');
assert(profitBrainJs.includes('getSharedMonthlyMetricsForProfit'), 'profit-brain should delegate to RevenueBrain shared metrics');
assert(!profitBrainJs.includes('buildSharedMonthlyMetrics(ctx)'), 'profit-brain must not define its own buildSharedMonthlyMetrics');

function createSandbox() {
  const sandbox = {
    console,
    RevenueBrain: null,
    ProfitBrain: null,
    PaymentBrain: null,
    WorkOrderBrain: null,
    ExecutiveBrain: null,
    RevenueSummaryBrain: null,
    MonthlyResultsBrain: null
  };
  runInContext(load('js/work-order-brain.js'), createContext(sandbox));
  runInContext(load('js/payment-brain.js'), createContext(sandbox));
  runInContext(load('js/monthly-results-brain.js'), createContext(sandbox));
  runInContext(load('js/profit-brain.js'), createContext(sandbox));
  runInContext(load('js/revenue-brain.js'), createContext(sandbox));
  runInContext(load('js/revenue-summary-brain.js'), createContext(sandbox));
  runInContext(load('js/executive-brain.js'), createContext(sandbox));
  return createContext(sandbox);
}

console.log('== numeric definition tests ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const TODAY = '2026-07-05';
    const monthKey = '2026-07';
    const records = [
      { id: 'r1', workDate: '2026-07-03', amount: 25000, source: '直請け', status: '確定', paymentStatus: 'paid' },
      { id: 'r2', workDate: '2026-07-04', amount: 8000, status: '予定', paymentStatus: 'pending' },
      { id: 'r3', workDate: '2026-07-06', amount: 5000, status: 'キャンセル', paymentStatus: 'pending' }
    ];
    const workOrders = [
      { id: 'wo1', scheduledDate: '2026-07-07', estimateAmount: 32670, source: '直請け', status: 'tentative' },
      { id: 'wo2', scheduledDate: '2026-07-10', estimateAmount: 15000, status: 'tentative', actualRevenueId: 'linked' },
      { id: 'wo3', scheduledDate: '2026-07-12', estimateAmount: 0, status: 'tentative' },
      { id: 'wo4', scheduledDate: '2026-07-15', estimateAmount: 12000, status: 'completed' }
    ];
    const expenses = [
      { id: 'e1', date: '2026-07-02', amount: 3000, category: '交通・燃料' }
    ];
    const settings = { monthlyTarget: 100000 };
    const shared = RevenueBrain.buildSharedMonthlyMetrics({
      records, settings, workOrders, expenses, today: TODAY, monthKey
    });
    const execSection = ExecutiveBrain.buildRevenueProfitSection({
      today: TODAY,
      workOrders,
      expenses,
      revCtx: { records, settings, summary: { monthlyTarget: 100000 } },
      profitCtx: { summary: { unlinkedCount: 0, adExpense: 0 }, revenueRows: [] },
      forecast: {}
    });
    return { shared, execSection };
  })()`, ctx);

  assert(result.shared.confirmedRevenue === 25000, `confirmedRevenue should be 25000, got ${result.shared.confirmedRevenue}`);
  assert(result.shared.scheduledRevenue === 32670, `scheduledRevenue should be 32670, got ${result.shared.scheduledRevenue}`);
  assert(result.shared.plannedAdditionalRevenue === result.shared.scheduledRevenue, 'scheduledRevenue should equal plannedAdditionalRevenue');
  assert(result.shared.totalRevenue === 57670, `totalRevenue should be 57670, got ${result.shared.totalRevenue}`);
  assert(result.shared.totalRevenue === result.shared.confirmedRevenue + result.shared.scheduledRevenue, 'totalRevenue should equal confirmed + scheduled');
  assert(result.shared.plannedRevenue === result.shared.totalRevenue, 'plannedRevenue legacy alias should equal totalRevenue');
  assert(result.shared.totalProfit === 54670, `totalProfit should be 54670, got ${result.shared.totalProfit}`);
  assert(result.shared.totalProfit === result.shared.confirmedGrossProfit + result.shared.scheduledGrossProfit - result.shared.monthExpense, 'totalProfit should use gross shares minus expense');
  assert(result.shared.plannedProfit === result.shared.totalProfit, 'plannedProfit legacy alias should equal totalProfit');
  assert(result.shared.remainingToTarget === 42330, `remainingToTarget should be 42330, got ${result.shared.remainingToTarget}`);
  assert(result.shared.achievementRate === 58, `achievementRate should be 58, got ${result.shared.achievementRate}`);

  assert(result.execSection.totalRevenue === result.shared.totalRevenue, 'executive and shared totalRevenue must match');
  assert(result.execSection.scheduledRevenue === result.shared.scheduledRevenue, 'executive and shared scheduledRevenue must match');
  assert(result.execSection.totalProfit === result.shared.totalProfit, 'executive and shared totalProfit must match');
  assert(result.execSection.confirmedRevenue === result.shared.confirmedRevenue, 'executive and shared confirmedRevenue must match');
  assert(result.execSection.monthRevenueLabel === '合計売上', 'executive label should be 合計売上');
}

execSync('node scripts/verify-v4112-unified-monthly-metrics.mjs', { cwd: root, stdio: 'inherit' });

console.log('\nAll v4.12.4 clarify-monthly-total-scheduled-metrics checks passed.');
