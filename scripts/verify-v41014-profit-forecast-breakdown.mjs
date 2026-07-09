/**
 * Budil v4.10.20 — profit forecast breakdown verification.
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = (path) => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function createProfitSandbox() {
  const ctx = createContext({
    console,
    Date,
    JSON,
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    undefined
  });
  runInContext(load('js/calendar-candidate-brain.js'), ctx, { filename: 'calendar-candidate-brain.js' });
  runInContext(load('js/work-order-brain.js'), ctx, { filename: 'work-order-brain.js' });
  runInContext(load('js/revenue-brain.js'), ctx, { filename: 'revenue-brain.js' });
  runInContext(load('js/revenue-summary-brain.js'), ctx, { filename: 'revenue-summary-brain.js' });
  runInContext(load('js/profit-brain.js'), ctx, { filename: 'profit-brain.js' });
  return ctx;
}

for (const file of ['app.js', 'profit-brain.js', 'revenue-brain.js', 'storage.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

console.log('== v4.10.20 profit forecast breakdown ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const profitJs = load('js/profit-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

assert(indexHtml.includes('v4.12.4'), 'index.html should show v4.12.4');
assert(indexHtml.includes('js/app.js?v=4.12.4'), 'app.js cache buster should be v4.12.4');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.4'"), 'storage.js version should be v4.12.4');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.4'"), 'data-backup version should be v4.12.4');

assert(profitJs.includes('plannedRevenueEstimate'), 'profit brain should expose plannedRevenueEstimate');
assert(profitJs.includes('plannedForecastProfit'), 'profit brain should expose plannedForecastProfit');
assert(profitJs.includes('confirmedRevenue'), 'profit brain should expose confirmedRevenue');
assert(profitJs.includes('confirmedProfit'), 'profit brain should expose confirmedProfit');
assert(profitJs.includes('totalRevenue'), 'profit brain should expose totalRevenue');
assert(profitJs.includes('totalProfit'), 'profit brain should expose totalProfit');
assert(profitJs.includes('getMonthPlannedWorkOrders'), 'profit brain should filter month planned work orders');
assert(appJs.includes('getSharedMonthlyMetrics'), 'profit UI should use shared monthly metrics');
assert(appJs.includes("label: '予定売上'"), 'profit UI should show 予定売上 label');
assert(appJs.includes('合計利益'), 'profit UI should show total profit label');
assert(!appJs.includes('localStorage.clear()'), 'localStorage.clear must not be used');

const forbiddenUiTerms = [
  '売上登録',
  '売上登録へ',
  '一括売上登録',
  '登録対象を売上登録',
  '作業後確定',
  '作業後売上確定',
  '作業完了後',
  '作業完了',
  '売上登録済み',
  '+ 新規登録',
  '売上を登録',
  '売上を1件登録'
];
for (const term of forbiddenUiTerms) {
  assert(!indexHtml.includes(term), `index.html should not include ${term} in normal UI`);
}

console.log('== breakdown math (v4.10.13 regression sample) ==');
{
  const ctx = createProfitSandbox();
  const result = runInContext(`(() => {
    const revenue = {
      id: 'rev-verify-25300',
      workDate: '2026-07-01',
      customerName: '検収粗利率60%様',
      service: 'エアコン通常',
      source: 'ヤマダ',
      amount: 25300,
      grossMarginRate: 60,
      status: '確定'
    };
    const workOrders = [
      { id: 'wo-verify-yamada', customerName: 'ヤマダ案件', serviceText: 'エアコンクリーニング', scheduledDate: '2026-07-02', estimateAmount: 25300, source: 'ヤマダ', status: 'tentative' },
      { id: 'wo-verify-genchi', customerName: '現地確認', serviceText: '現地確認', scheduledDate: '2026-07-03', estimateAmount: 22000, source: '直安', status: 'confirmed' },
      { id: 'wo-verify-coop', customerName: 'コープ案件', serviceText: '洗濯機', scheduledDate: '2026-07-04', estimateAmount: 0, source: 'コープ', status: 'tentative', candidateMeta: { estimatedAmount: '18500' } }
    ];
    const row = ProfitBrain.computeRevenueRowProfit(revenue, 0);
    const summary = ProfitBrain.getPeriodProfitSummary({
      today: '2026-07-01',
      monthKey: '2026-07',
      revenues: [revenue],
      expenses: [],
      workOrders
    });
    return { row, summary };
  })()`, ctx);

  assert(result.row.marginProfit === 15180, `confirmed margin profit should be 15180, got ${result.row.marginProfit}`);
  assert(result.row.deductionAmount === 10120, `deduction should be 10120, got ${result.row.deductionAmount}`);
  assert(result.summary.confirmedRevenue === 25300, `confirmed revenue should be 25300, got ${result.summary.confirmedRevenue}`);
  assert(result.summary.confirmedProfit === 15180, `confirmed profit should be 15180, got ${result.summary.confirmedProfit}`);
  assert(result.summary.plannedRevenueEstimate === 65800, `planned revenue should be 65800, got ${result.summary.plannedRevenueEstimate}`);
  // v4.12.4: コープ案件は依頼元別80%を反映。直安は不明のため monthGrossRate(60%) フォールバック
  assert(result.summary.plannedForecastProfit === 43180, `planned forecast profit should be 43180 (coop 80% + genchi fallback), got ${result.summary.plannedForecastProfit}`);
  assert(result.summary.totalRevenue === 91100, `total revenue should be 91100, got ${result.summary.totalRevenue}`);
  assert(result.summary.totalProfit === 58360, `total profit should be 58360 (43180+15180), got ${result.summary.totalProfit}`);
  assert(result.summary.plannedForecastProfit <= result.summary.plannedRevenueEstimate, 'planned forecast profit must not exceed planned revenue');
  assert(result.summary.forecastProfit === result.summary.plannedForecastProfit, 'forecastProfit alias should be planned-only');
  assert(result.summary.totalProfit === result.summary.plannedForecastProfit + result.summary.confirmedProfit, 'total profit should equal planned + confirmed');
  assert(result.summary.totalRevenue === result.summary.plannedRevenueEstimate + result.summary.confirmedRevenue, 'total revenue should equal planned + confirmed');
  assert(result.summary.marginDeductionTotal === 10120, `margin deduction should remain 10120, got ${result.summary.marginDeductionTotal}`);
}

console.log('== v4.10.13 profit rate regression ==');
execSync(`node "${join(root, 'scripts/verify-v41013-profit-rate-calculation.mjs')}"`, { stdio: 'inherit', cwd: root });

console.log('== v4.10.12 duplicate guard regression ==');
execSync(`node "${join(root, 'scripts/verify-v41012-revenue-duplicate-guards.mjs')}"`, { stdio: 'inherit', cwd: root });

assert(statusMd.includes('v4.10.20'), 'status.md should document v4.10.20');
assert(handoffMd.includes('v4.10.20'), 'handoff.md should document v4.10.20');
assert(decisionLog.includes('v4.10.20'), 'decision-log.md should record v4.10.20');

console.log('All v4.10.20 profit forecast breakdown checks passed.');
