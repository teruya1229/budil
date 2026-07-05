/**
 * Budil v4.10.20 — gross margin rate profit calculation verification.
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
  runInContext(load('js/revenue-brain.js'), ctx, { filename: 'revenue-brain.js' });
  runInContext(load('js/work-order-brain.js'), ctx, { filename: 'work-order-brain.js' });
  runInContext(load('js/profit-brain.js'), ctx, { filename: 'profit-brain.js' });
  return ctx;
}

for (const file of ['app.js', 'profit-brain.js', 'revenue-brain.js', 'storage.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

console.log('== v4.10.20 profit rate calculation ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const profitJs = load('js/profit-brain.js');
const revenueJs = load('js/revenue-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

assert(indexHtml.includes('v4.10.33'), 'index.html should show v4.10.33');
assert(indexHtml.includes('js/app.js?v=4.10.33'), 'app.js cache buster should be v4.10.33');
assert(storageJs.includes("BUDIL_VERSION: 'v4.10.33'"), 'storage.js version should be v4.10.33');
assert(dataBackupJs.includes("APP_VERSION: 'v4.10.33'"), 'data-backup version should be v4.10.33');

assert(revenueJs.includes('resolveGrossMarginRate'), 'revenue brain should resolve gross margin rate');
assert(revenueJs.includes('computeMarginProfit'), 'revenue brain should compute margin profit');
assert(profitJs.includes('computeRevenueRowProfit'), 'profit brain should compute revenue row profit');
assert(profitJs.includes('workOrderForecastProfit'), 'profit brain should track work order forecast profit');
assert(appJs.includes('仲介料・控除（粗利率）'), 'profit UI should show margin deduction label');
assert(appJs.includes('仲介料・手数料'), 'profit UI should rename fee label');
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

console.log('== margin profit math ==');
{
  const ctx = createProfitSandbox();
  const result = runInContext(`(() => {
    const revenue = {
      id: 'rev-test',
      workDate: '2026-07-01',
      customerName: 'テスト様',
      service: 'エアコン通常',
      source: 'ヤマダ',
      amount: 25300,
      grossMarginRate: 60,
      status: '確定'
    };
    const row = ProfitBrain.computeRevenueRowProfit(revenue, 0);
    const summary = ProfitBrain.getPeriodProfitSummary({
      today: '2026-07-01',
      monthKey: '2026-07',
      revenues: [revenue],
      expenses: [],
      workOrders: []
    });
    return {
      marginProfit: row.marginProfit,
      deduction: row.deductionAmount,
      grossRate: row.grossRate,
      monthGrossProfit: summary.monthGrossProfit,
      monthGrossRate: summary.monthGrossRate,
      marginDeductionTotal: summary.marginDeductionTotal
    };
  })()`, ctx);
  assert(result.marginProfit === 15180, `margin profit should be 15180, got ${result.marginProfit}`);
  assert(result.deduction === 10120, `deduction should be 10120, got ${result.deduction}`);
  assert(Math.abs(result.grossRate - 60) < 0.01, `gross rate should be 60%, got ${result.grossRate}`);
  assert(result.monthGrossProfit === 15180, `month gross profit should be 15180, got ${result.monthGrossProfit}`);
  assert(Math.abs(result.monthGrossRate - 60) < 0.01, `month gross rate should be 60%, got ${result.monthGrossRate}`);
  assert(result.marginDeductionTotal === 10120, `margin deduction total should be 10120, got ${result.marginDeductionTotal}`);
  assert(result.monthGrossProfit <= 25300, 'profit must not exceed revenue');
}

console.log('== forecast profit must not exceed work order estimate revenue ==');
{
  const ctx = createProfitSandbox();
  const result = runInContext(`(() => {
    const workOrders = [
      { id: 'wo-1', customerName: 'A', serviceText: 'エアコン', source: 'ヤマダ', scheduledDate: '2026-07-05', estimateAmount: 50000, status: 'tentative' },
      { id: 'wo-2', customerName: 'B', serviceText: '浴室', source: 'ヤマダ', scheduledDate: '2026-07-08', estimateAmount: 54090, status: 'confirmed' }
    ];
    const summary = ProfitBrain.getPeriodProfitSummary({
      today: '2026-07-01',
      monthKey: '2026-07',
      revenues: [{ id: 'rev-1', workDate: '2026-07-01', amount: 25300, grossMarginRate: 60, source: 'ヤマダ', status: '確定' }],
      expenses: [],
      workOrders
    });
    return {
      workOrderEstimate: summary.workOrderEstimate,
      forecastProfit: summary.forecastProfit,
      workOrderForecastProfit: summary.workOrderForecastProfit
    };
  })()`, ctx);
  assert(result.workOrderEstimate === 104090, `work order estimate should be 104090, got ${result.workOrderEstimate}`);
  assert(result.forecastProfit <= result.workOrderEstimate + 15180, 'forecast profit must not exceed revenue base');
  assert(result.forecastProfit < result.workOrderEstimate, 'forecast profit must be less than work order estimate alone when month profit exists');
  assert(result.workOrderForecastProfit <= result.workOrderEstimate, 'work order forecast profit must not exceed estimate total');
}

console.log('== unset margin rate legacy compatibility ==');
{
  const ctx = createProfitSandbox();
  const result = runInContext(`(() => {
    const revenue = {
      id: 'rev-legacy',
      workDate: '2026-07-02',
      customerName: '旧データ様',
      service: 'その他',
      source: 'その他',
      amount: 10000,
      status: '確定'
    };
    const row = ProfitBrain.computeRevenueRowProfit(revenue, 2000);
    const summary = ProfitBrain.getPeriodProfitSummary({
      today: '2026-07-02',
      monthKey: '2026-07',
      revenues: [revenue],
      expenses: [{ id: 'exp-1', date: '2026-07-02', category: '消耗品', amount: 2000 }],
      workOrders: []
    });
    return {
      marginUnset: row.marginUnset,
      grossProfit: row.grossProfit,
      monthGrossProfit: summary.monthGrossProfit
    };
  })()`, ctx);
  assert(result.marginUnset === false, 'legacy row with expenses should not be margin-unset');
  assert(result.grossProfit === 8000, `legacy gross profit should be 8000, got ${result.grossProfit}`);
  assert(result.monthGrossProfit === 8000, `legacy month gross profit should be 8000, got ${result.monthGrossProfit}`);
}

console.log('== v4.10.12 duplicate guard regression ==');
execSync(`node "${join(root, 'scripts/verify-v41012-revenue-duplicate-guards.mjs')}"`, { stdio: 'inherit', cwd: root });

assert(statusMd.includes('v4.10.20'), 'status.md should document v4.10.20');
assert(handoffMd.includes('v4.10.20'), 'handoff.md should document v4.10.20');
assert(decisionLog.includes('v4.10.20'), 'decision-log.md should record v4.10.20');

console.log('All v4.10.20 profit rate calculation checks passed.');
