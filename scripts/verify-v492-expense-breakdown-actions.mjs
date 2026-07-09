/**
 * Budil v4.10.1 expense breakdown and profit action verification.
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = path => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function makeStore(seed = {}) {
  const data = { ...seed };
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; },
    key(index) { return Object.keys(data)[index] || null; },
    get length() { return Object.keys(data).length; },
    _data: data
  };
}

function createSandbox() {
  const localStorage = makeStore();
  const ctx = createContext({
    localStorage,
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
  runInContext(load('js/work-completion-brain.js'), ctx, { filename: 'work-completion-brain.js' });
  runInContext(load('js/calendar-candidate-brain.js'), ctx, { filename: 'calendar-candidate-brain.js' });
  runInContext(load('js/monthly-results-brain.js'), ctx, { filename: 'monthly-results-brain.js' });
  runInContext(load('js/revenue-summary-brain.js'), ctx, { filename: 'revenue-summary-brain.js' });
  runInContext(load('js/profit-brain.js'), ctx, { filename: 'profit-brain.js' });
  runInContext(load('js/storage.js'), ctx, { filename: 'storage.js' });
  return { ctx };
}

for (const file of ['profit-brain.js', 'app.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const profitBrain = load('js/profit-brain.js');
const css = load('css/style.css');

console.log('== v4.10.1 expense breakdown and profit actions ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.12.4'), 'header version should be v4.10.1');
assert(indexHtml.includes('Budil v4.12.4'), 'sidebar version should be v4.10.1');
assert(indexHtml.includes('js/app.js?v=4.12.4'), 'app.js cache buster should be v4.10.1');
assert(load('js/storage.js').includes("BUDIL_VERSION: 'v4.12.4'"), 'storage version should be v4.10.1');

assert(indexHtml.includes('id="profit-expense-breakdown"'), 'expense breakdown block should exist');
assert(appJs.includes('renderProfitExpenseBreakdown'), 'app should render expense breakdown');
assert(profitBrain.includes('buildMonthExpenseBreakdown'), 'brain should build expense breakdown');
assert(!indexHtml.includes('\u652f\u51fa\u767b\u9332'), 'index should not use \u652f\u51fa\u767b\u9332');
assert(!appJs.includes('\u652f\u51fa\u767b\u9332'), 'app.js should not use \u652f\u51fa\u767b\u9332');
assert(indexHtml.includes('daily-section-title">\u7d4c\u8cbb\u5165\u529b'), 'daily section should use \u7d4c\u8cbb\u5165\u529b');
assert(indexHtml.includes('revenue-flow-diagnostics'), 'sales flow diagnostics block should remain');
assert(css.includes('profit-expense-breakdown'), 'expense breakdown styles should exist');
assert(css.includes('@media (max-width: 390px)') || css.includes('overflow-x: hidden'), 'layout should avoid horizontal scroll');

const today = '2026-06-28';
const revenues = [{
  id: 'rev-1',
  workDate: '2026-06-15',
  customerName: '\u5c71\u7530\u69d8',
  service: '\u30a8\u30a2\u30b3\u30f3',
  source: 'LP',
  amount: 50000,
  status: '\u78ba\u5b9a'
}];

{
  const expenses = [
    { id: 'exp-1', date: '2026-06-10', category: '\u4ea4\u901a\u30fb\u71c3\u6599', amount: 18000, source: 'daily-action-expense' },
    { id: 'exp-2', date: '2026-06-12', category: '\u85ac\u5242\u30fb\u6750\u6599', amount: 12500, source: 'daily-action-expense' },
    { id: 'exp-3', date: '2026-06-14', category: '\u5916\u6ce8\u8cbb', amount: 30000, source: 'daily-action-expense' }
  ];
  const healthyRevenues = [{ ...revenues[0], amount: 200000 }];
  const { ctx } = createSandbox();
  runInContext(`
    var breakdown = ProfitBrain.buildMonthExpenseBreakdown(${JSON.stringify(expenses)}, '2026-06');
    var profitCtx = ProfitBrain.buildProfitContext({
      today: ${JSON.stringify(today)},
      revenues: ${JSON.stringify(healthyRevenues)},
      expenses: ${JSON.stringify(expenses)},
      workOrders: [],
      leads: [],
      intakes: [],
      monthlyResults: []
    });
    var d = ProfitBrain.buildProfitOperationsDiagnostics(profitCtx, {
      today: ${JSON.stringify(today)},
      monthlyResults: [],
      revenues: ${JSON.stringify(healthyRevenues)}
    });
  `, ctx);
  assert(ctx.breakdown.rows.length === 3, 'breakdown should list non-zero categories');
  assert(ctx.breakdown.total === 60500, 'breakdown total should match month expenses');
  assert(ctx.breakdown.total === ctx.profitCtx.summary.monthExpense, 'breakdown total should match summary expense');
  assert(ctx.d.statusKey === 'high_category', 'dominant category should use high category status');
  assert(ctx.d.primaryAction && ctx.d.primaryAction.id === 'expense_breakdown', 'dominant category should suggest breakdown');
  assert(ctx.d.nextAction.includes('\u4e00\u756a\u5927\u304d\u3044\u7d4c\u8cbb\u30ab\u30c6\u30b4\u30ea'), 'dominant category should mention top category review');
}

{
  const { ctx } = createSandbox();
  runInContext(`
    var profitCtx = ProfitBrain.buildProfitContext({
      today: ${JSON.stringify(today)},
      revenues: ${JSON.stringify(revenues)},
      expenses: [],
      workOrders: [],
      leads: [],
      intakes: [],
      monthlyResults: []
    });
    var breakdown = ProfitBrain.buildMonthExpenseBreakdown([], '2026-06');
    var d = ProfitBrain.buildProfitOperationsDiagnostics(profitCtx, {
      today: ${JSON.stringify(today)},
      monthlyResults: [],
      revenues: ${JSON.stringify(revenues)}
    });
  `, ctx);
  assert(ctx.breakdown.isEmpty === true, 'empty month should flag no expenses');
  assert(ctx.d.statusKey === 'no_expense', 'no expense month should prompt expense input');
  assert(ctx.d.nextAction.includes('\u7d4c\u8cbb\u5165\u529b'), 'no expense action should mention expense input');
  assert(ctx.d.primaryAction && ctx.d.primaryAction.id === 'daily_expense', 'no expense should link to daily expense input');
}

{
  const deficitExpenses = [
    { id: 'exp-big', date: '2026-06-12', category: '\u4eba\u4ef6\u8cbb', amount: 80000, source: 'manual' },
    { id: 'exp-2', date: '2026-06-14', category: '\u85ac\u5242\u30fb\u6750\u6599', amount: 10000, source: 'manual' },
    { id: 'exp-3', date: '2026-06-16', category: '\u4ea4\u901a\u30fb\u71c3\u6599', amount: 5000, source: 'manual' }
  ];
  const { ctx } = createSandbox();
  runInContext(`
    var profitCtx = ProfitBrain.buildProfitContext({
      today: ${JSON.stringify(today)},
      revenues: ${JSON.stringify(revenues)},
      expenses: ${JSON.stringify(deficitExpenses)},
      workOrders: [],
      leads: [],
      intakes: [],
      monthlyResults: []
    });
    var d = ProfitBrain.buildProfitOperationsDiagnostics(profitCtx, {
      today: ${JSON.stringify(today)},
      monthlyResults: [],
      revenues: ${JSON.stringify(revenues)}
    });
  `, ctx);
  assert(ctx.d.monthProfit < 0, 'deficit scenario should have negative profit');
  assert(ctx.d.statusKey === 'deficit', 'deficit scenario should use deficit status');
  assert(ctx.d.nextAction.includes('\u5916\u6ce8\u8cbb'), 'deficit action should mention outsource/material/transport costs');
  assert(ctx.d.primaryAction.scrollSelector === '#profit-expense-breakdown', 'deficit action should scroll to breakdown');
}

{
  const lowMarginExpenses = [
    { id: 'exp-1', date: '2026-06-10', category: '\u5916\u6ce8\u8cbb', amount: 12000, source: 'manual' },
    { id: 'exp-2', date: '2026-06-11', category: '\u85ac\u5242\u30fb\u6750\u6599', amount: 8000, source: 'manual' },
    { id: 'exp-3', date: '2026-06-12', category: '\u4ea4\u901a\u30fb\u71c3\u6599', amount: 5000, source: 'manual' }
  ];
  const lowRevenues = [{ ...revenues[0], amount: 30000 }];
  const { ctx } = createSandbox();
  runInContext(`
    var profitCtx = ProfitBrain.buildProfitContext({
      today: ${JSON.stringify(today)},
      revenues: ${JSON.stringify(lowRevenues)},
      expenses: ${JSON.stringify(lowMarginExpenses)},
      workOrders: [],
      leads: [],
      intakes: [],
      monthlyResults: []
    });
    var d = ProfitBrain.buildProfitOperationsDiagnostics(profitCtx, {
      today: ${JSON.stringify(today)},
      monthlyResults: [],
      revenues: ${JSON.stringify(lowRevenues)}
    });
  `, ctx);
  assert(ctx.d.statusKey === 'low_margin', 'low margin scenario should use low margin status');
  assert(ctx.d.nextAction.includes('\u5358\u4fa1'), 'low margin action should mention unit price review');
  assert(ctx.d.primaryAction && ctx.d.primaryAction.id === 'expense_breakdown', 'low margin should suggest expense breakdown');
}

console.log('All v4.10.1 expense breakdown and profit action checks passed.');
