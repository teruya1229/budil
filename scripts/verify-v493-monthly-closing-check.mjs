/**
 * Budil v4.9.3 monthly closing check verification.
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

console.log('== v4.9.3 monthly closing check ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.9.3'), 'header version should be v4.9.3');
assert(indexHtml.includes('Budil v4.9.3'), 'sidebar version should be v4.9.3');
assert(indexHtml.includes('js/app.js?v=4.9.3'), 'app.js cache buster should be v4.9.3');
assert(load('js/storage.js').includes("BUDIL_VERSION: 'v4.9.3'"), 'storage version should be v4.9.3');

assert(indexHtml.includes('id="profit-monthly-closing-check"'), 'profit monthly closing block should exist');
assert(indexHtml.includes('id="revenue-monthly-closing-check"'), 'revenue monthly closing block should exist');
assert(indexHtml.includes('id="exec-home-monthly-closing-check"'), 'executive monthly closing block should exist');
assert(appJs.includes('renderMonthlyClosingCheck'), 'app should render monthly closing check');
assert(appJs.includes('buildMonthlyClosingCheck'), 'app should use monthly closing builder');
assert(profitBrain.includes('buildMonthlyClosingCheck'), 'brain should define monthly closing check');
assert(indexHtml.includes('\u6708\u6b21\u7de0\u3081\u30c1\u30a7\u30c3\u30af'), 'monthly closing title should exist');
assert(!indexHtml.includes('\u652f\u51fa\u767b\u9332'), 'index should not use \u652f\u51fa\u767b\u9332');
assert(!appJs.includes('\u652f\u51fa\u767b\u9332'), 'app.js should not use \u652f\u51fa\u767b\u9332');
assert(indexHtml.includes('daily-section-title">\u7d4c\u8cbb\u5165\u529b'), 'daily section should use \u7d4c\u8bbf\u5165\u529b');
assert(indexHtml.includes('revenue-flow-diagnostics'), 'sales flow diagnostics block should remain');
assert(indexHtml.includes('profit-operations-diagnostics'), 'profit operations diagnostics should remain');
assert(indexHtml.includes('profit-expense-breakdown'), 'expense breakdown block should remain');
assert(css.includes('monthly-closing-check'), 'monthly closing styles should exist');
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
const monthlyResults = [
  { id: '2026-06', month: '2026-06', sales: 50000, brokerFee: 0, materialCost: 10000, laborCost: 0, outsourcingCost: 0, otherCost: 0, profit: 40000 }
];
const queueWorkOrder = [{
  id: 'wo-queue',
  customerName: '\u78ba\u5b9a\u5f85\u3061\u69d8',
  serviceText: '\u30a8\u30a2\u30b3\u30f3',
  scheduledDate: '2026-06-25',
  estimateAmount: 18000,
  status: 'tentative'
}];

function buildCheck(ctxCode) {
  const { ctx } = createSandbox();
  runInContext(ctxCode, ctx);
  return ctx.c;
}

{
  const c = buildCheck(`
    var profitCtx = ProfitBrain.buildProfitContext({
      today: ${JSON.stringify(today)},
      revenues: ${JSON.stringify(revenues)},
      expenses: [{ id: 'exp-1', date: '2026-06-10', category: '\u4ea4\u901a\u30fb\u71c3\u6599', amount: 5000, source: 'daily-action-expense' }],
      workOrders: ${JSON.stringify(queueWorkOrder)},
      leads: [],
      intakes: [],
      monthlyResults: ${JSON.stringify(monthlyResults)}
    });
    var c = ProfitBrain.buildMonthlyClosingCheck({
      today: ${JSON.stringify(today)},
      profitCtx: profitCtx,
      workOrders: ${JSON.stringify(queueWorkOrder)},
      revenues: ${JSON.stringify(revenues)},
      monthlyResults: ${JSON.stringify(monthlyResults)},
      expenses: [{ id: 'exp-1', date: '2026-06-10', category: '\u4ea4\u901a\u30fb\u71c3\u6599', amount: 5000, source: 'daily-action-expense' }]
    });
  `);
  assert(c.revenueConfirmationQueueCount > 0, 'queue scenario should detect revenue confirmation queue');
  assert(c.statusKey === 'revenue_queue', 'queue should be top priority');
  assert(c.nextAction.includes('\u58f2\u4e0a\u78ba\u5b9a\u5f85\u3061'), 'queue next action should mention revenue confirmation');
  assert(c.primaryAction.scrollSelector === '#daily-section-revenue-queue', 'queue should link to daily revenue queue');
  assert(c.statusMessages.some(m => m.includes('\u672a\u78ba\u5b9a\u58f2\u4e0a')), 'queue should show pending sales status');
}

{
  const c = buildCheck(`
    var profitCtx = ProfitBrain.buildProfitContext({
      today: ${JSON.stringify(today)},
      revenues: ${JSON.stringify(revenues)},
      expenses: [],
      workOrders: [],
      leads: [],
      intakes: [],
      monthlyResults: ${JSON.stringify(monthlyResults)}
    });
    var c = ProfitBrain.buildMonthlyClosingCheck({
      today: ${JSON.stringify(today)},
      profitCtx: profitCtx,
      workOrders: [],
      revenues: ${JSON.stringify(revenues)},
      monthlyResults: ${JSON.stringify(monthlyResults)},
      expenses: []
    });
  `);
  assert(c.expenseInputCount === 0, 'no expense scenario should have zero expense input');
  assert(c.statusKey === 'no_expense', 'no expense should be second priority');
  assert(c.nextAction.includes('\u7d4c\u8cbb\u5165\u529b'), 'no expense action should mention expense input');
  assert(c.primaryAction.scrollSelector === '#daily-section-expense', 'no expense should link to daily expense input');
}

{
  const gapMonthly = [{ id: '2026-06', month: '2026-06', sales: 850020, brokerFee: 0, materialCost: 0, laborCost: 0, outsourcingCost: 0, otherCost: 0, profit: 400000 }];
  const c = buildCheck(`
    var profitCtx = ProfitBrain.buildProfitContext({
      today: ${JSON.stringify(today)},
      revenues: ${JSON.stringify(revenues)},
      expenses: [{ id: 'exp-1', date: '2026-06-10', category: '\u4ea4\u901a\u30fb\u71c3\u6599', amount: 5000, source: 'daily-action-expense' }],
      workOrders: [],
      leads: [],
      intakes: [],
      monthlyResults: ${JSON.stringify(gapMonthly)}
    });
    var c = ProfitBrain.buildMonthlyClosingCheck({
      today: ${JSON.stringify(today)},
      profitCtx: profitCtx,
      workOrders: [],
      revenues: ${JSON.stringify(revenues)},
      monthlyResults: ${JSON.stringify(gapMonthly)},
      expenses: [{ id: 'exp-1', date: '2026-06-10', category: '\u4ea4\u901a\u30fb\u71c3\u6599', amount: 5000, source: 'daily-action-expense' }]
    });
  `);
  assert(c.hasReconciliationGap === true, 'gap scenario should detect reconciliation gap');
  assert(c.statusKey === 'reconciliation_gap', 'gap should be third priority');
  assert(c.nextAction.includes('\u6574\u5408\u30c1\u30a7\u30c3\u30af'), 'gap action should mention reconciliation');
  assert(c.primaryAction.scrollSelector === '#revenue-reconciliation-check', 'gap should link to reconciliation check');
}

{
  const c = buildCheck(`
    var profitCtx = ProfitBrain.buildProfitContext({
      today: ${JSON.stringify(today)},
      revenues: ${JSON.stringify(revenues)},
      expenses: [{ id: 'exp-1', date: '2026-06-10', category: '\u4ea4\u901a\u30fb\u71c3\u6599', amount: 5000, source: 'daily-action-expense' }],
      workOrders: [],
      leads: [],
      intakes: [],
      monthlyResults: []
    });
    var c = ProfitBrain.buildMonthlyClosingCheck({
      today: ${JSON.stringify(today)},
      profitCtx: profitCtx,
      workOrders: [],
      revenues: ${JSON.stringify(revenues)},
      monthlyResults: [],
      expenses: [{ id: 'exp-1', date: '2026-06-10', category: '\u4ea4\u901a\u30fb\u71c3\u6599', amount: 5000, source: 'daily-action-expense' }]
    });
  `);
  assert(c.hasMonthlyResult === false, 'no monthly scenario should flag missing monthly result');
  assert(c.monthlyResultLabel === '\u672a\u5165\u529b', 'no monthly should show \u672a\u5165\u529b label');
  assert(c.statusKey === 'no_monthly', 'no monthly should be fourth priority');
  assert(c.nextAction.includes('\u6708\u6b21\u5b9f\u7e3e'), 'no monthly action should mention monthly results');
  assert(c.primaryAction.view === 'monthly-results', 'no monthly should link to monthly results view');
}

{
  const futureWorkOrder = [{
    id: 'wo-future',
    customerName: '\u672a\u6765\u69d8',
    serviceText: '\u6d74\u5ba4',
    scheduledDate: '2026-07-10',
    estimateAmount: 20000,
    status: 'tentative'
  }];
  const healthyExpenses = [
    { id: 'exp-1', date: '2026-06-10', category: '\u4ea4\u901a\u30fb\u71c3\u6599', amount: 5000, source: 'daily-action-expense' },
    { id: 'exp-2', date: '2026-06-11', category: '\u85ac\u5242\u30fb\u6750\u6599', amount: 3000, source: 'daily-action-expense' }
  ];
  const c = buildCheck(`
    var profitCtx = ProfitBrain.buildProfitContext({
      today: ${JSON.stringify(today)},
      revenues: ${JSON.stringify(revenues)},
      expenses: ${JSON.stringify(healthyExpenses)},
      workOrders: ${JSON.stringify(futureWorkOrder)},
      leads: [],
      intakes: [],
      monthlyResults: ${JSON.stringify(monthlyResults)}
    });
    var c = ProfitBrain.buildMonthlyClosingCheck({
      today: ${JSON.stringify(today)},
      profitCtx: profitCtx,
      workOrders: ${JSON.stringify(futureWorkOrder)},
      revenues: ${JSON.stringify(revenues)},
      monthlyResults: ${JSON.stringify(monthlyResults)},
      expenses: ${JSON.stringify(healthyExpenses)}
    });
  `);
  assert(c.upcomingScheduleCount > 0, 'upcoming scenario should detect upcoming schedule');
  assert(c.statusKey === 'upcoming', 'upcoming should be fifth priority');
  assert(c.nextAction.includes('\u58f2\u4e0a\u4e88\u5b9a'), 'upcoming action should mention sales schedule');
  assert(c.primaryAction.scrollSelector === '#revenue-upcoming-schedule', 'upcoming should link to schedule block');
}

{
  const healthyExpenses = [
    { id: 'exp-1', date: '2026-06-10', category: '\u4ea4\u901a\u30fb\u71c3\u6599', amount: 5000, source: 'daily-action-expense' },
    { id: 'exp-2', date: '2026-06-11', category: '\u85ac\u5242\u30fb\u6750\u6599', amount: 3000, source: 'daily-action-expense' }
  ];
  const c = buildCheck(`
    var profitCtx = ProfitBrain.buildProfitContext({
      today: ${JSON.stringify(today)},
      revenues: ${JSON.stringify(revenues)},
      expenses: ${JSON.stringify(healthyExpenses)},
      workOrders: [],
      leads: [],
      intakes: [],
      monthlyResults: ${JSON.stringify(monthlyResults)}
    });
    var c = ProfitBrain.buildMonthlyClosingCheck({
      today: ${JSON.stringify(today)},
      profitCtx: profitCtx,
      workOrders: [],
      revenues: ${JSON.stringify(revenues)},
      monthlyResults: ${JSON.stringify(monthlyResults)},
      expenses: ${JSON.stringify(healthyExpenses)}
    });
  `);
  assert(c.statusKey === 'ready', 'healthy scenario should be ready');
  assert(c.nextAction.includes('\u5b8c\u4e86\u306b\u8fd1\u3044'), 'healthy next action should mention near completion');
  assert(c.statusMessages.some(m => m.includes('\u9ed2\u5b57')), 'healthy should mention profitable status');
  assert(c.monthRevenue > 0 && c.monthExpense >= 0 && typeof c.monthProfit === 'number', 'healthy should expose month totals');
}

console.log('All v4.9.3 monthly closing check tests passed.');
