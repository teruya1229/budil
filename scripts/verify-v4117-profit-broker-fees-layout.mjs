/**
 * Budil v4.11.15 - broker fees visibility and profit metrics layout verification.
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
  'js/data-backup.js'
]) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.11.15 profit-broker-fees-layout ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const revenueBrainJs = load('js/revenue-brain.js');
const profitBrainJs = load('js/profit-brain.js');
const executiveBrainJs = load('js/executive-brain.js');
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
assert(indexHtml.includes('v4.11.15'), 'index.html should show v4.11.15');
assert(indexHtml.includes('js/app.js?v=4.11.15'), 'app.js cache buster should be v4.11.15');
assert(indexHtml.includes('css/style.css?v=4.11.15'), 'style.css cache buster should be v4.11.15');
assert(indexHtml.includes('js/revenue-brain.js?v=4.11.15'), 'revenue-brain cache buster should be v4.11.15');
assert(storageJs.includes("BUDIL_VERSION: 'v4.11.15'"), 'storage.js version should be v4.11.15');
assert(dataBackupJs.includes("APP_VERSION: 'v4.11.15'"), 'data-backup version should be v4.11.15');
assert(statusMd.includes('v4.11.15'), 'status.md should document v4.11.15');
assert(handoffMd.includes('v4.11.15'), 'handoff.md should document v4.11.15');
assert(decisionLog.includes('v4.11.15'), 'decision-log.md should record v4.11.15');

console.log('== shared fee metrics wiring ==');
assert(revenueBrainJs.includes('confirmedFeeAmount'), 'revenue-brain should expose confirmedFeeAmount');
assert(revenueBrainJs.includes('scheduledFeeAmount'), 'revenue-brain should expose scheduledFeeAmount');
assert(revenueBrainJs.includes('totalFeeAmount'), 'revenue-brain should expose totalFeeAmount');
assert(revenueBrainJs.includes('confirmedFeeAmount = confirmedRevenue - confirmedGrossProfit'), 'confirmedFeeAmount formula required');
assert(revenueBrainJs.includes('scheduledFeeAmount = scheduledRevenue - scheduledGrossProfit'), 'scheduledFeeAmount formula required');
assert(revenueBrainJs.includes('totalFeeAmount = confirmedFeeAmount + scheduledFeeAmount'), 'totalFeeAmount formula required');

console.log('== profit page labels and restored blocks ==');
assert(appJs.includes("label: '仲介料'"), 'profit summary should show 仲介料');
assert(appJs.includes("label: '確定仲介料'"), 'profit summary should show 確定仲介料');
assert(appJs.includes("label: '予定仲介料'"), 'profit summary should show 予定仲介料');
assert(appJs.includes('月別確定売上（直近）'), 'monthly confirmed revenue brief must remain');
assert(appJs.includes('仲介料・控除（粗利率）'), 'margin deduction card must remain');
assert(appJs.includes('広告費'), 'ad expense card must remain');
assert(appJs.includes('仲介料・手数料'), 'fee expense card must remain');
assert(appJs.includes('外注費'), 'outsource expense card must remain');
assert(appJs.includes('未紐付け支出'), 'unlinked expense card must remain');
assert(appJs.includes('profit-expense-overview'), 'expense overview must be outside detail analysis');
assert(appJs.includes('profit-fee-formula'), 'profit status should show fee formula');
assert(indexHtml.includes('profit-summary-root'), 'profit summary root should not nest summary-grid class');
assert(css.includes('#view-profit .profit-metrics-layout'), 'profit metrics layout css required');
assert(css.includes('#view-profit .profit-breakdown-grid'), 'profit breakdown grid css required');

console.log('== revenue summary broker fees ==');
assert(appJs.includes('確定仲介料：'), 'revenue summary html should show 確定仲介料');
assert(appJs.includes('予定仲介料：'), 'revenue summary html should show 予定仲介料');

console.log('== v4.11.15 workflow preserved ==');
assert(appJs.includes('data-profit-schedule-edit'), 'profit schedule edit button must remain');
assert(appJs.includes('function openWorkOrderEditFromProfit'), 'profit edit helper must remain');
assert(indexHtml.includes('profit-detail-analysis-collapse'), 'detail analysis collapse must remain');
assert(revenueBrainJs.includes('totalProfit = confirmedGrossProfit + scheduledGrossProfit - monthExpense'), 'totalProfit formula must remain');

console.log('== forbidden label scan ==');
for (const term of ['見込み利益', '見込み売上', '今月利益', '今月売上', '予定売上見込み']) {
  assert(!appJs.includes(term), `app.js must not include forbidden label: ${term}`);
}

console.log('== untouched modules ==');
assert(!receptionJs.includes('confirmedFeeAmount'), 'reception-brain must not change for v4.11.15');
assert(!documentsJs.includes('confirmedFeeAmount'), 'documents-brain must not change for v4.11.15');
assert(!followJs.includes('confirmedFeeAmount'), 'follow-up-brain must not change for v4.11.15');

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

function buildMetrics(ctx, records, workOrders, expenses, monthKey = '2026-07') {
  return runInContext(`(() => RevenueBrain.buildSharedMonthlyMetrics({
    records: ${JSON.stringify(records)},
    workOrders: ${JSON.stringify(workOrders || [])},
    expenses: ${JSON.stringify(expenses || [])},
    settings: { monthlyTarget: 0 },
    today: '2026-07-05',
    monthKey: '${monthKey}'
  }))()`, ctx);
}

console.log('== broker fee math ==');
{
  const ctx = createSandbox();
  const direct = buildMetrics(ctx, [
    { id: 'r1', workDate: '2026-07-03', amount: 10000, source: '直請け', status: '確定', paymentStatus: 'paid' }
  ]);
  assert(direct.confirmedFeeAmount === 0, `直請け fee should be 0, got ${direct.confirmedFeeAmount}`);
  assert(direct.totalFeeAmount === 0, `直請け total fee should be 0, got ${direct.totalFeeAmount}`);

  const air = buildMetrics(ctx, [
    { id: 'r2', workDate: '2026-07-03', amount: 10000, source: 'Airリザーブ', status: '確定', paymentStatus: 'paid' }
  ]);
  assert(air.confirmedFeeAmount === 0, `Air fee should be 0, got ${air.confirmedFeeAmount}`);

  const coop = buildMetrics(ctx, [
    { id: 'r3', workDate: '2026-07-03', amount: 10000, source: 'コープハウジング', status: '確定', paymentStatus: 'paid' }
  ]);
  assert(coop.confirmedFeeAmount === 2000, `コープ fee should be 2000, got ${coop.confirmedFeeAmount}`);
  assert(coop.confirmedGrossProfit === 8000, `コープ gross should be 8000, got ${coop.confirmedGrossProfit}`);

  const yamada = buildMetrics(ctx, [
    { id: 'r4', workDate: '2026-07-03', amount: 25300, source: 'ヤマダ', status: '確定', paymentStatus: 'paid' }
  ]);
  assert(yamada.confirmedFeeAmount === 10120, `ヤマダ 25300 fee should be 10120, got ${yamada.confirmedFeeAmount}`);
  assert(yamada.confirmedGrossProfit === 15180, `ヤマダ gross should be 15180, got ${yamada.confirmedGrossProfit}`);

  const metrics = buildMetrics(ctx, [
    { id: 'r1', workDate: '2026-07-03', amount: 25000, source: '直請け', status: '確定', paymentStatus: 'paid' },
    { id: 'r2', workDate: '2026-07-04', amount: 10000, source: 'ヤマダ', status: '確定', paymentStatus: 'pending' }
  ], [
    { id: 'wo1', scheduledDate: '2026-07-07', estimateAmount: 10000, source: 'コープ', status: 'tentative' }
  ], [
    { id: 'e1', date: '2026-07-02', amount: 3000, category: '交通・燃料' }
  ]);
  assert(metrics.confirmedFeeAmount === metrics.confirmedRevenue - metrics.confirmedGrossProfit, 'confirmedFeeAmount formula mismatch');
  assert(metrics.scheduledFeeAmount === metrics.scheduledRevenue - metrics.scheduledGrossProfit, 'scheduledFeeAmount formula mismatch');
  assert(metrics.totalFeeAmount === metrics.confirmedFeeAmount + metrics.scheduledFeeAmount, 'totalFeeAmount formula mismatch');
  assert(
    metrics.totalProfit === metrics.totalRevenue - metrics.totalFeeAmount - metrics.monthExpense,
    'totalProfit should equal totalRevenue - totalFeeAmount - monthExpense'
  );
}

console.log('== screen consistency ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const records = [
      { id: 'r1', workDate: '2026-07-03', amount: 25000, source: '直請け', status: '確定', paymentStatus: 'paid' },
      { id: 'r2', workDate: '2026-07-04', amount: 10000, source: 'ヤマダ', status: '確定', paymentStatus: 'pending' }
    ];
    const workOrders = [
      { id: 'wo1', scheduledDate: '2026-07-07', estimateAmount: 10000, source: 'コープ', status: 'tentative' }
    ];
    const expenses = [{ id: 'e1', date: '2026-07-02', amount: 3000, category: '交通・燃料' }];
    const settings = { monthlyTarget: 100000 };
    const shared = RevenueBrain.buildSharedMonthlyMetrics({
      records, settings, workOrders, expenses, today: '2026-07-05', monthKey: '2026-07'
    });
    const execSection = ExecutiveBrain.buildRevenueProfitSection({
      today: '2026-07-05',
      workOrders,
      expenses,
      revCtx: { records, settings, summary: { monthlyTarget: 100000 } },
      profitCtx: { summary: { unlinkedCount: 0, adExpense: 0, usesMonthlyResult: false }, revenueRows: [], revenues: records, expenses, workOrders },
      forecast: {}
    });
    const profitDiag = ProfitBrain.buildProfitOperationsDiagnostics(
      { summary: { monthKey: '2026-07', usesMonthlyResult: false }, revenues: records, expenses, workOrders },
      { today: '2026-07-05', revenues: records, workOrders, expenses }
    );
    return { shared, execSection, profitDiag };
  })()`, ctx);

  assert(result.execSection.totalProfit === result.shared.totalProfit, 'executive and shared totalProfit must match');
  assert(result.profitDiag.monthProfit === result.shared.totalProfit, 'profit diagnostics and shared totalProfit must match');
  assert(result.shared.totalFeeAmount === 6000, `total fee should be 6000, got ${result.shared.totalFeeAmount}`);
}

execSync('node scripts/verify-v4116-profit-page-workflow.mjs', { cwd: root, stdio: 'inherit' });

console.log('\nAll v4.11.15 profit-broker-fees-layout checks passed.');
