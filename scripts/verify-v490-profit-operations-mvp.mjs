/**
 * Budil v4.9.8 profit operations MVP verification.
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

function createSandbox(seed = {}) {
  const localStorage = makeStore(seed);
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
  return { ctx, localStorage };
}

for (const file of ['profit-brain.js', 'app.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const profitBrain = load('js/profit-brain.js');
const css = load('css/style.css');

console.log('== v4.9.8 profit operations MVP ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.9.8'), 'header version should be v4.9.8');
assert(indexHtml.includes('Budil v4.9.8'), 'sidebar version should be v4.9.8');
assert(indexHtml.includes('js/app.js?v=4.9.8'), 'app.js cache buster should be v4.9.8');
assert(load('js/storage.js').includes("BUDIL_VERSION: 'v4.9.8'"), 'storage version should be v4.9.8');

assert(indexHtml.includes('nav-label">\u58f2\u4e0a\u7ba1\u7406'), 'nav should use \u58f2\u4e0a\u7ba1\u7406');
assert(indexHtml.includes('nav-label">\u5229\u76ca\u7ba1\u7406'), 'nav should use \u5229\u76ca\u7ba1\u7406');
assert(indexHtml.includes('daily-section-title">\u7d4c\u8cbb\u5165\u529b'), 'daily section should use \u7d4c\u8cbb\u5165\u529b');
assert(indexHtml.includes('id="profit-operations-diagnostics"'), 'profit diagnostics block should exist');
assert(indexHtml.includes('\u7d4c\u8cbb\u5185\u8a33\u306e\u6d41\u308c\u3067'), 'profit view subtitle should describe breakdown flow');

assert(profitBrain.includes('buildProfitOperationsDiagnostics'), 'brain should define profit diagnostics');
assert(appJs.includes('renderProfitOperationsDiagnostics'), 'app should render profit diagnostics');
assert(appJs.includes('handleProfitDiagnosticAction'), 'app should handle profit diagnostic actions');
assert(appJs.includes('renderRevenueFlowDiagnostics'), 'sales flow diagnostics should remain');
assert(appJs.includes('PAST_RECOVERY_UI_ENABLED = false'), 'past recovery UI should stay disabled');
assert(indexHtml.includes('revenue-flow-diagnostics'), 'sales flow diagnostics block should remain');

assert(css.includes('profit-operations-diagnostics-block'), 'profit diagnostics styles should exist');
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
const expenses = [{
  id: 'exp-1',
  date: '2026-06-10',
  category: '\u85ac\u5242\u30fb\u6750\u6599',
  amount: 12000,
  source: 'daily-action-expense'
}];

{
  const { ctx } = createSandbox();
  runInContext(`
    var profitCtx = ProfitBrain.buildProfitContext({
      today: ${JSON.stringify(today)},
      revenues: ${JSON.stringify(revenues)},
      expenses: ${JSON.stringify(expenses)},
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
  assert(ctx.d.monthProfit === 38000, 'profit should be revenue minus expenses');
  assert(ctx.d.monthProfitRate > 0, 'profit rate should be calculated');
  assert(ctx.d.aggregationLabel === '\u660e\u7d30\u30d9\u30fc\u30b9', 'detail mode should be labeled');
  assert(ctx.d.primaryAction && ctx.d.primaryAction.id === 'daily_expense', 'low expense count should suggest expense input');
}

{
  const monthlyResults = [{
    id: '2026-06',
    month: '2026-06',
    sales: 500000,
    brokerFee: 0,
    materialCost: 50000,
    laborCost: 100000,
    outsourcingCost: 20000,
    otherCost: 0,
    profit: 330000
  }];
  const { ctx } = createSandbox();
  runInContext(`
    var profitCtx = ProfitBrain.buildProfitContext({
      today: ${JSON.stringify(today)},
      revenues: ${JSON.stringify(revenues)},
      expenses: ${JSON.stringify(expenses)},
      workOrders: [],
      leads: [],
      intakes: [],
      monthlyResults: ${JSON.stringify(monthlyResults)}
    });
    var d = ProfitBrain.buildProfitOperationsDiagnostics(profitCtx, {
      today: ${JSON.stringify(today)},
      monthlyResults: ${JSON.stringify(monthlyResults)},
      revenues: ${JSON.stringify(revenues)}
    });
  `, ctx);
  assert(ctx.profitCtx.summary.usesMonthlyResult === true, 'monthly result should override profit summary');
  assert(ctx.d.aggregationLabel === '\u6708\u6b21\u5b9f\u7e3e\u30d9\u30fc\u30b9', 'monthly mode should be labeled');
}

{
  const deficitExpenses = [{
    id: 'exp-big',
    date: '2026-06-12',
    category: '\u4eba\u4ef6\u8cbb',
    amount: 80000,
    source: 'manual'
  }, {
    id: 'exp-2',
    date: '2026-06-14',
    category: '\u85ac\u5242\u30fb\u6750\u6599',
    amount: 10000,
    source: 'manual'
  }, {
    id: 'exp-3',
    date: '2026-06-16',
    category: '\u4ea4\u901a\u30fb\u71c3\u6599',
    amount: 5000,
    source: 'manual'
  }];
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
  assert(ctx.d.primaryAction && ctx.d.primaryAction.id === 'expense_breakdown', 'deficit should suggest expense breakdown');
}

console.log('All v4.9.8 profit operations MVP checks passed.');
