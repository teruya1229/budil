/**
 * Budil v4.11.10 - source profit rates in shared monthly metrics verification.
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

console.log('== v4.11.10 source-profit-rates ==');

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
assert(indexHtml.includes('v4.11.10'), 'index.html should show v4.11.10');
assert(indexHtml.includes('js/app.js?v=4.11.10'), 'app.js cache buster should be v4.11.10');
assert(indexHtml.includes('js/revenue-brain.js?v=4.11.10'), 'revenue-brain cache buster should be v4.11.10');
assert(indexHtml.includes('js/profit-brain.js?v=4.11.10'), 'profit-brain cache buster should be v4.11.10');
assert(indexHtml.includes('js/executive-brain.js?v=4.11.10'), 'executive-brain cache buster should be v4.11.10');
assert(storageJs.includes("BUDIL_VERSION: 'v4.11.10'"), 'storage.js version should be v4.11.10');
assert(dataBackupJs.includes("APP_VERSION: 'v4.11.10'"), 'data-backup version should be v4.11.10');
assert(statusMd.includes('v4.11.10'), 'status.md should document v4.11.10');
assert(handoffMd.includes('v4.11.10'), 'handoff.md should document v4.11.10');
assert(decisionLog.includes('v4.11.10'), 'decision-log.md should record v4.11.10');

console.log('== source profit master wiring ==');
assert(revenueBrainJs.includes('getSourceProfitRate'), 'RevenueBrain should expose getSourceProfitRate');
assert(revenueBrainJs.includes('normalizeRevenueSource'), 'RevenueBrain should expose normalizeRevenueSource');
assert(revenueBrainJs.includes('calculateNetRevenueBySource'), 'RevenueBrain should expose calculateNetRevenueBySource');
assert(revenueBrainJs.includes('confirmedProfit = confirmedGrossProfit - monthExpense'), 'confirmedProfit should use gross share');
assert(revenueBrainJs.includes('scheduledProfit = scheduledGrossProfit'), 'scheduledProfit should equal scheduled gross share');
assert(revenueBrainJs.includes('totalProfit = confirmedGrossProfit + scheduledGrossProfit - monthExpense'), 'totalProfit should use gross shares');
assert(profitBrainJs.includes('getSharedMonthlyMetricsForProfit'), 'profit diagnostics should use shared metrics helper');
assert(appJs.includes("label: '予定利益'"), 'profit/revenue summary should show 予定利益');
assert(appJs.includes('確定粗利＋予定粗利'), 'profit flow note should explain gross share formula');

console.log('== forbidden label scan ==');
for (const term of ['見込み利益', '見込み売上', '今月利益', '今月売上', '予定売上見込み']) {
  assert(!appJs.includes(term), `app.js must not include forbidden label: ${term}`);
}

console.log('== untouched files ==');
assert(!receptionJs.includes('getSourceProfitRate'), 'reception-brain must not change for v4.11.10');
assert(!documentsJs.includes('getSourceProfitRate'), 'documents-brain must not change for v4.11.10');
assert(!followJs.includes('getSourceProfitRate'), 'follow-up-brain must not change for v4.11.10');

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

console.log('== source rate math ==');
{
  const ctx = createSandbox();
  const cases = [
    ['直請け', 10000, 10000],
    ['Airリザーブ', 10000, 10000],
    ['コープハウジング', 10000, 8000],
    ['片付け110番', 10000, 8000],
    ['くらしのマーケット', 10000, 8000],
    ['ヤマダ', 10000, 6000]
  ];
  for (const [source, amount, expected] of cases) {
    const share = runInContext(`RevenueBrain.calculateNetRevenueBySource(${amount}, ${JSON.stringify(source)})`, ctx);
    assert(share === expected, `${source} ${amount} should gross ${expected}, got ${share}`);
  }
}

console.log('== unknown source must not inflate profit ==');
{
  const ctx = createSandbox();
  for (const source of ['', '未設定', '不明']) {
    const info = runInContext(`RevenueBrain.getSourceProfitRate(${JSON.stringify(source)})`, ctx);
    assert(info.rate === 0, `unknown source ${source || '(empty)'} rate should be 0`);
    assert(info.reviewRequired === true, `unknown source ${source || '(empty)'} should require review`);
    const share = runInContext(`RevenueBrain.calculateNetRevenueBySource(10000, ${JSON.stringify(source)})`, ctx);
    assert(share === 0, `unknown source ${source || '(empty)'} must not become 10000 profit share`);
  }
  const metrics = buildMetrics(ctx, [
    { id: 'r-unknown', workDate: '2026-07-03', amount: 10000, source: '不明', status: '確定', paymentStatus: 'paid' }
  ]);
  assert(metrics.confirmedRevenue === 10000, 'unknown source revenue should still count in confirmedRevenue');
  assert(metrics.confirmedGrossProfit === 0, 'unknown source must not inflate confirmedGrossProfit');
  assert(metrics.confirmedProfit === -metrics.monthExpense, 'unknown source confirmedProfit should not assume 100%');
}

console.log('== shared metrics formulas ==');
{
  const ctx = createSandbox();
  const metrics = buildMetrics(ctx, [
    { id: 'r1', workDate: '2026-07-03', amount: 25000, source: '直請け', status: '確定', paymentStatus: 'paid' },
    { id: 'r2', workDate: '2026-07-04', amount: 10000, source: 'ヤマダ', status: '確定', paymentStatus: 'pending' }
  ], [
    { id: 'wo1', scheduledDate: '2026-07-07', estimateAmount: 10000, source: 'コープ', status: 'tentative' }
  ], [
    { id: 'e1', date: '2026-07-02', amount: 3000, category: '交通・燃料' }
  ]);
  assert(metrics.confirmedRevenue === 35000, `confirmedRevenue should be 35000, got ${metrics.confirmedRevenue}`);
  assert(metrics.scheduledRevenue === 10000, `scheduledRevenue should be 10000, got ${metrics.scheduledRevenue}`);
  assert(metrics.totalRevenue === 45000, `totalRevenue should be 45000, got ${metrics.totalRevenue}`);
  assert(metrics.confirmedGrossProfit === 31000, `confirmedGrossProfit should be 31000, got ${metrics.confirmedGrossProfit}`);
  assert(metrics.scheduledGrossProfit === 8000, `scheduledGrossProfit should be 8000, got ${metrics.scheduledGrossProfit}`);
  assert(metrics.confirmedProfit === 28000, `confirmedProfit should be 28000, got ${metrics.confirmedProfit}`);
  assert(metrics.scheduledProfit === 8000, `scheduledProfit should be 8000, got ${metrics.scheduledProfit}`);
  assert(metrics.totalProfit === 36000, `totalProfit should be 36000, got ${metrics.totalProfit}`);
  assert(metrics.totalProfit === metrics.confirmedGrossProfit + metrics.scheduledGrossProfit - metrics.monthExpense, 'totalProfit formula mismatch');
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
  assert(result.execSection.scheduledProfit === result.shared.scheduledProfit, 'executive and shared scheduledProfit must match');
}

execSync('node scripts/verify-v4114-unify-monthly-metric-labels.mjs', { cwd: root, stdio: 'inherit' });

console.log('\nAll v4.11.10 source-profit-rates checks passed.');
