/**
 * Budil v4.10.1 executive priority action verification.
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

console.log('== v4.10.1 executive priority action ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.12.4'), 'header version should be v4.10.1');
assert(indexHtml.includes('Budil v4.12.4'), 'sidebar version should be v4.10.1');
assert(indexHtml.includes('js/app.js?v=4.12.4'), 'app.js cache buster should be v4.10.1');
assert(load('js/storage.js').includes("BUDIL_VERSION: 'v4.12.4'"), 'storage version should be v4.10.1');

assert(indexHtml.includes('id="exec-home-priority-action"'), 'executive priority action block should exist');
assert(appJs.includes('renderExecutivePriorityAction'), 'app should render executive priority action');
assert(appJs.includes('buildTodayPriorityAction'), 'app should use priority action builder');
assert(profitBrain.includes('buildExecutivePriorityAction'), 'brain should define executive priority action');
assert(profitBrain.includes('isMonthlyClosingPeriod'), 'brain should define monthly closing period helper');
assert(appJs.includes('\u4eca\u65e5\u306e\u6700\u512a\u5148\u30a2\u30af\u30b7\u30e7\u30f3'), 'priority action title should be rendered by app');
assert(indexHtml.includes('id="exec-home-monthly-closing-check"'), 'monthly closing block should remain');
assert(indexHtml.includes('profit-operations-diagnostics'), 'profit diagnostics should remain');
assert(indexHtml.includes('revenue-flow-diagnostics'), 'sales flow diagnostics should remain');
assert(!indexHtml.includes('\u652f\u51fa\u767b\u9332'), 'index should not use \u652f\u51fa\u767b\u9332');
assert(!appJs.includes('\u652f\u51fa\u767b\u9332'), 'app.js should not use \u652f\u51fa\u767b\u9332');
assert(css.includes('exec-home-priority-action'), 'priority action styles should exist');
assert(css.includes('@media (max-width: 390px)') || css.includes('overflow-x: hidden'), 'layout should avoid horizontal scroll');

const revenues = [{
  id: 'rev-1',
  workDate: '2026-06-15',
  customerName: '\u5c71\u7530\u69d8',
  service: '\u30a8\u30a2\u30b3\u30f3',
  source: 'LP',
  amount: 50000,
  status: '\u78ba\u5b9a'
}];
const queueWorkOrder = [{
  id: 'wo-queue',
  customerName: '\u78ba\u5b9a\u5f85\u3061\u69d8',
  serviceText: '\u30a8\u30a2\u30b3\u30f3',
  scheduledDate: '2026-06-25',
  estimateAmount: 18000,
  status: 'tentative'
}];

function buildPriority(ctxCode) {
  const { ctx } = createSandbox();
  runInContext(ctxCode, ctx);
  return ctx.p;
}

{
  const p = buildPriority(`
    var p = ProfitBrain.buildExecutivePriorityAction({
      today: '2026-06-28',
      workOrders: ${JSON.stringify(queueWorkOrder)},
      revenues: ${JSON.stringify(revenues)},
      monthlyResults: [],
      expenses: [{ id: 'exp-1', date: '2026-06-10', category: '\u4ea4\u901a\u30fb\u71c3\u6599', amount: 5000, source: 'daily-action-expense' }]
    });
  `);
  assert(p.statusKey === 'revenue_queue', 'queue should be top priority');
  assert(p.message.includes('\u58f2\u4e0a\u78ba\u5b9a\u5f85\u3061'), 'queue message should mention revenue confirmation');
  assert(p.primaryAction.label === '\u58f2\u4e0a\u78ba\u5b9a\u5f85\u3061\u3092\u898b\u308b', 'queue button label should match');
  assert(p.primaryAction.scrollSelector === '#daily-section-revenue-queue', 'queue should link to revenue queue');
}

{
  const p = buildPriority(`
    var p = ProfitBrain.buildExecutivePriorityAction({
      today: '2026-06-28',
      workOrders: [],
      revenues: ${JSON.stringify(revenues)},
      monthlyResults: [],
      expenses: []
    });
  `);
  assert(p.statusKey === 'no_expense', 'no expense should be second priority');
  assert(p.message.includes('\u7d4c\u8cbb\u5165\u529b'), 'expense message should mention expense input');
  assert(p.primaryAction.label === '\u7d4c\u8cbb\u5165\u529b\u3092\u898b\u308b', 'expense button label should match');
  assert(p.primaryAction.scrollSelector === '#daily-section-expense', 'expense should link to daily expense');
}

{
  const gapMonthly = [{ id: '2026-06', month: '2026-06', sales: 850020, brokerFee: 0, materialCost: 0, laborCost: 0, outsourcingCost: 0, otherCost: 0, profit: 400000 }];
  const p = buildPriority(`
    var p = ProfitBrain.buildExecutivePriorityAction({
      today: '2026-06-28',
      workOrders: [],
      revenues: ${JSON.stringify(revenues)},
      monthlyResults: ${JSON.stringify(gapMonthly)},
      expenses: [{ id: 'exp-1', date: '2026-06-10', category: '\u4ea4\u901a\u30fb\u71c3\u6599', amount: 5000, source: 'daily-action-expense' }]
    });
  `);
  assert(p.statusKey === 'reconciliation_gap', 'gap in closing period should prioritize monthly closing');
  assert(p.message.includes('\u6708\u6b21\u7de0\u3081\u30c1\u30a7\u30c3\u30af'), 'closing message should mention monthly closing check');
  assert(p.primaryAction.label === '\u6708\u6b21\u7de0\u3081\u30c1\u30a7\u30c3\u30af\u3092\u898b\u308b', 'closing button label should match');
  assert(p.primaryAction.scrollSelector === '#revenue-reconciliation-check', 'gap should link to reconciliation');
}

{
  const { ctx } = createSandbox();
  runInContext(`var inPeriod = ProfitBrain.isMonthlyClosingPeriod('2026-06-28');`, ctx);
  assert(ctx.inPeriod === true, 'day 28 should be in closing period');
}

{
  const p = buildPriority(`
    var p = ProfitBrain.buildExecutivePriorityAction({
      today: '2026-06-15',
      workOrders: [],
      revenues: ${JSON.stringify(revenues)},
      monthlyResults: [{ id: '2026-06', month: '2026-06', sales: 50000, brokerFee: 0, materialCost: 10000, laborCost: 0, outsourcingCost: 0, otherCost: 0, profit: 40000 }],
      expenses: [{ id: 'exp-1', date: '2026-06-10', category: '\u4ea4\u901a\u30fb\u71c3\u6599', amount: 5000, source: 'daily-action-expense' }]
    });
  `);
  assert(p.statusKey === 'ok', 'healthy mid-month should be ok without upcoming');
}

{
  const { ctx } = createSandbox();
  runInContext(`var midPeriod = ProfitBrain.isMonthlyClosingPeriod('2026-06-15');`, ctx);
  assert(ctx.midPeriod === false, 'day 15 should not be in closing period');
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
  const p = buildPriority(`
    var p = ProfitBrain.buildExecutivePriorityAction({
      today: '2026-06-15',
      workOrders: ${JSON.stringify(futureWorkOrder)},
      revenues: ${JSON.stringify(revenues)},
      monthlyResults: [{ id: '2026-06', month: '2026-06', sales: 50000, brokerFee: 0, materialCost: 10000, laborCost: 0, outsourcingCost: 0, otherCost: 0, profit: 40000 }],
      expenses: ${JSON.stringify(healthyExpenses)}
    });
  `);
  assert(p.statusKey === 'upcoming', 'upcoming should be suggested when no higher priority issues');
  assert(p.message.includes('\u58f2\u4e0a\u4e88\u5b9a'), 'upcoming message should mention sales schedule');
  assert(p.primaryAction.scrollSelector === '#revenue-upcoming-schedule', 'upcoming should link to schedule block');
}

{
  const p = buildPriority(`
    var p = ProfitBrain.buildExecutivePriorityAction({
      today: '2026-07-03',
      workOrders: [],
      revenues: ${JSON.stringify(revenues)},
      monthlyResults: [],
      expenses: [{ id: 'exp-1', date: '2026-07-01', category: '\u4ea4\u901a\u30fb\u71c3\u6599', amount: 5000, source: 'daily-action-expense' }]
    });
  `);
  assert(p.statusKey === 'no_monthly', 'missing monthly in early month should trigger closing check');
  assert(p.primaryAction.scrollSelector === '#exec-home-monthly-closing-check', 'missing monthly should link to exec closing block');
}

{
  const { ctx } = createSandbox();
  runInContext(`var earlyPeriod = ProfitBrain.isMonthlyClosingPeriod('2026-07-03');`, ctx);
  assert(ctx.earlyPeriod === true, 'day 3 should be in closing period');
}

console.log('All v4.10.1 executive priority action checks passed.');
