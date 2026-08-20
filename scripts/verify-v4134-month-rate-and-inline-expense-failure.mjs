/**
 * Budil v4.13.7 - 月粗利率（経費控除後）と経費保存例外時の部分保存案内 verify
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (file) => readFileSync(join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

const html = load('index.html');
const app = load('js/app.js');
const profitBrainSrc = load('js/profit-brain.js');
const revenueBrainSrc = load('js/revenue-brain.js');
const storageSrc = load('js/storage.js');
const dataBackup = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

for (const file of ['js/app.js', 'js/profit-brain.js', 'js/storage.js', 'js/data-backup.js']) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
}

console.log('== version / cache buster ==');
assert(html.includes('Budil v4.13.7'), 'index.html shows Budil v4.13.7');
assert(html.includes('js/app.js?v=4.13.7'), 'app.js cache buster is v4.13.7');
assert(html.includes('js/profit-brain.js?v=4.13.7'), 'profit-brain cache buster is v4.13.7');
assert(html.includes('css/style.css?v=4.13.7'), 'style.css cache buster is v4.13.7');
assert(storageSrc.includes("BUDIL_VERSION: 'v4.13.7'"), 'storage version is v4.13.7');
assert(dataBackup.includes("APP_VERSION: 'v4.13.7'"), 'data-backup version is v4.13.7');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.7'"), 'verify-current pins v4.13.7');
assert(currentRunner.includes('verify-v4134-month-rate-and-inline-expense-failure.mjs') ||
  /^verify-v4(10|11|12|13)\d.*\.mjs$/.test('verify-v4134-month-rate-and-inline-expense-failure.mjs'),
  'new verify is discoverable by current pattern');
assert(statusMd.includes('v4.13.7'), 'status.md documents v4.13.7');
assert(handoffMd.includes('v4.13.7'), 'handoff.md documents v4.13.7');
assert(decisionLog.includes('v4.13.7'), 'decision-log.md records v4.13.7');
assert(decisionLog.includes('monthGrossProfit÷monthRevenue') || decisionLog.includes('monthGrossProfit / monthRevenue') ||
  decisionLog.includes('monthGrossProfit÷monthRevenueへ修正') || decisionLog.includes('経費控除後'),
  'decision-log records month rate fix');
assert(decisionLog.includes('expense_save_failed') || decisionLog.includes('経費保存例外'),
  'decision-log records expense exception handling');

console.log('== load brains ==');
const localStore = new Map();
const sandbox = {
  console,
  localStorage: {
    getItem: (k) => (localStore.has(k) ? localStore.get(k) : null),
    setItem: (k, v) => localStore.set(k, String(v)),
    removeItem: (k) => localStore.delete(k)
  },
  window: {},
  document: { createElement: () => ({}) }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(revenueBrainSrc + '\n;this.RevenueBrain = RevenueBrain;', sandbox);
vm.runInContext(profitBrainSrc + '\n;this.ProfitBrain = ProfitBrain;', sandbox);
const { ProfitBrain, RevenueBrain } = sandbox;
assert(!!ProfitBrain && !!RevenueBrain, 'brains loaded');

const mkRev = (id, patch = {}) => ({
  id,
  workDate: '2026-08-10',
  customerName: 'v4134fixture顧客',
  service: 'エアコン通常',
  amount: 10000,
  status: '確定',
  source: 'くらしのマーケット',
  grossMarginRate: 80,
  createdAt: '2026-08-10T10:00:00.000Z',
  updatedAt: '2026-08-10T10:00:00.000Z',
  ...patch
});

console.log('== case1: month rate 10000 / 80% / 2000 ==');
{
  const revenues = [mkRev('r1')];
  const expenses = [{ id: 'e1', relatedRevenueId: 'r1', amount: 2000, date: '2026-08-10', category: '交通・燃料' }];
  const summary = ProfitBrain.getPeriodProfitSummary({
    today: '2026-08-12',
    monthKey: '2026-08',
    revenues,
    expenses,
    workOrders: []
  });
  assert(summary.monthMarginGross === 8000, 'monthMarginGross is 8000');
  assert(summary.monthExpense === 2000, 'monthExpense is 2000');
  assert(summary.monthGrossProfit === 6000, 'monthGrossProfit is 6000');
  assert(summary.monthGrossRate === 60, 'monthGrossRate is 60 (expense-adjusted)');
  const rowProfit = ProfitBrain.computeRevenueRowProfit(mkRev('r1'), 2000);
  assert(rowProfit.marginRate === 80, 'saved/share marginRate remains 80');
  assert(rowProfit.grossProfit === 6000, 'per-revenue expense-adjusted profit stays 6000');
}

console.log('== case2: multi revenue + unlinked expense, no double deduction ==');
{
  const revenues = [
    mkRev('r1'),
    mkRev('r2', { amount: 5000, grossMarginRate: 100, customerName: 'v4134fixture顧客B' })
  ];
  const expenses = [
    { id: 'e1', relatedRevenueId: 'r1', amount: 2000, date: '2026-08-10', category: '交通・燃料' },
    { id: 'e2', relatedRevenueId: '', amount: 3000, date: '2026-08-11', category: '広告費' }
  ];
  const summary = ProfitBrain.getPeriodProfitSummary({
    today: '2026-08-12',
    monthKey: '2026-08',
    revenues,
    expenses,
    workOrders: []
  });
  assert(summary.monthRevenue === 15000, 'month revenue is 15000');
  assert(summary.monthMarginGross === 13000, 'margin after share rates is 13000');
  assert(summary.monthExpense === 5000, 'month expense is 5000 once');
  assert(summary.monthGrossProfit === 8000, 'month gross profit is 8000');
  const expectedRate = (8000 / 15000) * 100;
  assert(summary.monthGrossRate === expectedRate, 'monthGrossRate is 8000/15000*100 without rounding');
  assert(summary.unlinkedTotal === 3000, 'unlinked expense diagnosed separately');
  const rows = ProfitBrain.getRevenueProfitRows(revenues, expenses, [], []);
  assert(rows.find(r => r.revenueId === 'r1').expenseTotal === 2000, 'linked expense on r1 only');
  assert(rows.find(r => r.revenueId === 'r2').expenseTotal === 0, 'unlinked not allocated to r2');
}

console.log('== case3: boundaries zero / deficit ==');
{
  const zeroSummary = ProfitBrain.getPeriodProfitSummary({
    today: '2026-08-12',
    monthKey: '2026-08',
    revenues: [],
    expenses: [{ id: 'e0', relatedRevenueId: '', amount: 1000, date: '2026-08-10', category: '広告費' }],
    workOrders: []
  });
  assert(zeroSummary.monthRevenue === 0, 'zero revenue month');
  assert(zeroSummary.monthGrossRate === 0, 'zero revenue yields rate 0');
  assert(Number.isFinite(zeroSummary.monthGrossRate), 'rate is finite');
  assert(!Number.isNaN(zeroSummary.monthGrossRate), 'rate is not NaN');

  const deficitSummary = ProfitBrain.getPeriodProfitSummary({
    today: '2026-08-12',
    monthKey: '2026-08',
    revenues: [mkRev('r-def', { amount: 10000, grossMarginRate: 80 })],
    expenses: [{ id: 'e-def', relatedRevenueId: '', amount: 9000, date: '2026-08-10', category: '広告費' }],
    workOrders: []
  });
  assert(deficitSummary.monthGrossProfit === -1000, 'deficit monthGrossProfit is -1000');
  assert(deficitSummary.monthGrossRate === -10, 'deficit monthGrossRate is -10');
}

console.log('== case4: planned forecast fallback keeps pre-expense rate ==');
{
  const revenues = [mkRev('r1')];
  const expenses = [{ id: 'e1', relatedRevenueId: 'r1', amount: 2000, date: '2026-08-10', category: '交通・燃料' }];
  const workOrders = [{
    id: 'wo-unset',
    status: 'confirmed',
    scheduledDate: '2026-08-20',
    estimateAmount: 10000,
    source: 'その他',
    grossMarginRate: null,
    actualRevenueId: ''
  }];
  const woAlone = ProfitBrain.computeWorkOrderForecastProfit(workOrders[0], 0);
  assert(woAlone.marginUnset === true, 'work order margin is unset for fallback path');
  const summary = ProfitBrain.getPeriodProfitSummary({
    today: '2026-08-12',
    monthKey: '2026-08',
    revenues,
    expenses,
    workOrders
  });
  assert(summary.monthGrossRate === 60, 'display monthGrossRate is expense-adjusted 60');
  assert(summary.plannedForecastProfit === 8000, 'fallback planned profit stays 8000 (not 6000)');
  assert(summary.plannedForecastProfit !== 6000, 'fallback does not apply expense-adjusted 60%');
}

console.log('== case5: saveInlineExpenseForRevenue exception handling ==');
const extractFn = (source, name) => {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`missing ${name}`);
  let depth = 0;
  let started = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') {
      depth += 1;
      started = true;
    } else if (ch === '}') {
      depth -= 1;
      if (started && depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated ${name}`);
};

{
  const saveFnSrc = extractFn(app, 'saveInlineExpenseForRevenue');
  const memoFnSrc = extractFn(app, 'buildDailyExpenseMemo');
  assert(saveFnSrc.includes('try'), 'saveInlineExpenseForRevenue wraps addExpenseRecord in try');
  assert(saveFnSrc.includes('catch'), 'saveInlineExpenseForRevenue has catch');
  assert(saveFnSrc.includes("error: 'expense_save_failed'"), 'returns expense_save_failed on failure');
  assert(saveFnSrc.includes('[Budil][inline-expense-save-failed]'), 'logs fixed tag on exception');

  const errorLogs = [];
  let addCalls = 0;
  const makeRunner = (addImpl) => {
    addCalls = 0;
    errorLogs.length = 0;
    const ctx = {
      Storage: {
        addExpenseRecord: (...args) => {
          addCalls += 1;
          return addImpl(...args);
        }
      },
      TODAY: () => '2026-08-10',
      console: {
        error: (...args) => { errorLogs.push(args); },
        log: () => {},
        warn: () => {}
      }
    };
    vm.createContext(ctx);
    vm.runInContext(
      `${memoFnSrc}\n${saveFnSrc}\nthis.saveInlineExpenseForRevenue = saveInlineExpenseForRevenue;`,
      ctx
    );
    return ctx;
  };

  const throwCtx = makeRunner(() => {
    throw new Error('QuotaExceededError');
  });
  let thrown = false;
  let throwResult;
  try {
    throwResult = throwCtx.saveInlineExpenseForRevenue('rev-throw', '2026-08-10', {
      category: '交通・燃料',
      amount: 2000,
      content: 'fixture',
      memo: ''
    });
  } catch {
    thrown = true;
  }
  assert(!thrown, 'exception is not rethrown to caller');
  assert(throwResult && throwResult.ok === false, 'throw path returns ok=false');
  assert(throwResult.error === 'expense_save_failed', 'throw path error is expense_save_failed');
  assert(addCalls === 1, 'addExpenseRecord called exactly once on throw');
  assert(errorLogs.length === 1, 'console.error recorded once on throw');
  assert(
    String(errorLogs[0][0]).includes('[Budil][inline-expense-save-failed]'),
    'console.error uses fixed tag'
  );
  assert(
    !JSON.stringify(errorLogs).includes('v4134fixture') &&
      !JSON.stringify(errorLogs).includes('customerName'),
    'error log does not dump customer/revenue payload'
  );

  const emptyCtx = makeRunner(() => null);
  const emptyResult = emptyCtx.saveInlineExpenseForRevenue('rev-empty', '2026-08-10', {
    category: '交通・燃料',
    amount: 1000,
    content: '',
    memo: ''
  });
  assert(emptyResult.ok === false && emptyResult.error === 'expense_save_failed',
    'empty return yields expense_save_failed');
  assert(addCalls === 1, 'empty path calls addExpenseRecord once');

  const okRecord = {
    id: 'expense-ok-1',
    amount: 1500,
    relatedRevenueId: 'rev-ok',
    date: '2026-08-10',
    category: '交通・燃料',
    source: 'revenue-inline-expense'
  };
  const okCtx = makeRunner(() => okRecord);
  const okResult = okCtx.saveInlineExpenseForRevenue('rev-ok', '2026-08-10', {
    category: '交通・燃料',
    amount: 1500,
    content: 'ok',
    memo: ''
  });
  assert(okResult.ok === true, 'success path returns ok=true');
  assert(okResult.expense === okRecord, 'success path returns created record');
  assert(addCalls === 1, 'success path calls addExpenseRecord once');
  assert(errorLogs.length === 0, 'success path does not console.error');
}

console.log('== case6: three save paths keep partial-save guidance ==');
{
  const extractThrough = (name) => extractFn(app, name);
  const workSrc = extractThrough('submitWorkCompletion');
  const pastSrc = extractThrough('submitPastRecoveryFromModal');
  const revSrc = extractThrough('handleRevenueSubmit');

  for (const [label, src] of [
    ['submitWorkCompletion', workSrc],
    ['submitPastRecoveryFromModal', pastSrc],
    ['handleRevenueSubmit', revSrc]
  ]) {
    assert(src.includes('saveInlineExpenseForRevenue('), `${label} calls saveInlineExpenseForRevenue`);
    assert(
      src.includes('売上は保存済みです。経費のみ未保存です。利益管理の経費入力から同じ売上へ紐づけて登録してください。'),
      `${label} shows partial-save alert`
    );
    assert(src.includes('expenseOk'), `${label} tracks expenseOk`);
  }

  // 失敗時に成功トースト文言を出さない条件（expenseOk && shouldCreate）
  assert(
    /if\s*\(\s*expenseOk\s*&&\s*inlineCheck\.shouldCreate\s*\)\s*\{[\s\S]*?売上と経費を保存しました/.test(workSrc),
    'submitWorkCompletion shows combined toast only when expenseOk'
  );
  assert(
    /if\s*\(\s*expenseOk\s*&&\s*inlineExpense\s*&&\s*inlineExpense\.shouldCreate\s*\)\s*\{[\s\S]*?売上と経費を保存しました/.test(pastSrc),
    'submitPastRecoveryFromModal shows combined toast only when expenseOk'
  );
  assert(
    /if\s*\(\s*inlineCheck\.shouldCreate\s*&&\s*expenseOk\s*\)\s*\{[\s\S]*?売上と経費を保存しました/.test(revSrc),
    'handleRevenueSubmit uses combined success message only when expenseOk'
  );
  assert(workSrc.includes('finally') && workSrc.includes('inlineExpenseSaveGuard = false'),
    'submitWorkCompletion clears guard in finally');
  assert(revSrc.includes('finally') && revSrc.includes('inlineExpenseSaveGuard = false'),
    'handleRevenueSubmit clears guard in finally');
  assert(!app.includes('localStorage.clear('), 'no localStorage.clear');
}

console.log('\nAll v4.13.7 month-rate and inline-expense-failure checks passed.');
