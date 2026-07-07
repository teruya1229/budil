/**
 * Budil v4.10.1 sales flow diagnostics verification.
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
  runInContext(load('js/storage.js'), ctx, { filename: 'storage.js' });
  return { ctx, localStorage };
}

for (const file of ['revenue-summary-brain.js', 'app.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const summaryBrain = load('js/revenue-summary-brain.js');
const css = load('css/style.css');

console.log('== v4.10.1 sales flow diagnostics ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.11.14'), 'header version should be v4.10.1');
assert(indexHtml.includes('Budil v4.11.14'), 'sidebar version should be v4.10.1');
assert(indexHtml.includes('js/app.js?v=4.11.14'), 'app.js cache buster should be v4.10.1');
assert(indexHtml.includes('id="revenue-flow-diagnostics"'), 'sales flow diagnostics block should exist');
assert(indexHtml.includes('calendar-candidate-import-result'), 'schedule import result panel should remain');

assert(appJs.includes('renderRevenueFlowDiagnostics'), 'app should render sales flow diagnostics');
assert(appJs.includes('buildSalesFlowDiagnostics'), 'app should use diagnostics builder');
assert(appJs.includes('renderCalendarCandidateImportSummaryHtml'), 'schedule import result display should remain');

assert(summaryBrain.includes('buildSalesFlowDiagnostics'), 'brain should define sales flow diagnostics');
assert(summaryBrain.includes('countRevenueConfirmationQueue'), 'brain should count revenue queue');
assert(summaryBrain.includes('flowNote'), 'brain should include future flow note');

assert(css.includes('revenue-flow-diagnostics'), 'diagnostics styles should exist');
assert(css.includes('overflow-x: hidden') || css.includes('min-width: 0'), 'layout should avoid horizontal scroll patterns');

const today = '2026-06-28';
const monthlyResults = [
  { id: '2026-04', month: '2026-04', sales: 500000, brokerFee: 0, materialCost: 0, laborCost: 0, outsourcingCost: 0, otherCost: 0, profit: 200000 },
  { id: '2026-05', month: '2026-05', sales: 600000, brokerFee: 0, materialCost: 0, laborCost: 0, outsourcingCost: 0, otherCost: 0, profit: 250000 },
  { id: '2026-06', month: '2026-06', sales: 850020, brokerFee: 0, materialCost: 0, laborCost: 0, outsourcingCost: 0, otherCost: 0, profit: 400000 }
];
const revenueRecords = [{
  id: 'rev-1',
  workDate: '2026-06-15',
  customerName: '山田様',
  service: 'エアコン',
  source: 'LP',
  amount: 24200,
  status: '確定'
}];
const workOrders = [{
  id: 'wo-1',
  customerName: '田中様',
  serviceText: 'エアコンクリーニング',
  scheduledDate: '2026-06-25',
  estimateAmount: 18000,
  status: 'tentative'
}];

{
  const { ctx } = createSandbox();
  runInContext(`
    var d = RevenueSummaryBrain.buildSalesFlowDiagnostics(
      ${JSON.stringify(workOrders)},
      ${JSON.stringify(revenueRecords)},
      ${JSON.stringify(monthlyResults)},
      ${JSON.stringify(today)}
    );
  `, ctx);
  const d = ctx.d;
  assert(d.monthlyMonthCount === 3, 'monthly results should be 3 months');
  assert(d.confirmedRevenueCount === 1, 'confirmed revenue should be 1');
  assert(d.workOrderCount === 1, 'work orders should be 1');
  assert(d.hasReconciliationGap === true, 'june monthly vs detail should show gap');
  assert(d.reconciliationLabel === '差額あり', 'reconciliation label should be gap');
}

{
  const futureWorkOrders = [
    ...workOrders,
    {
      id: 'wo-future',
      customerName: '佐藤様',
      serviceText: '洗濯機クリーニング',
      scheduledDate: '2026-07-05',
      estimateAmount: 15000,
      status: 'tentative'
    }
  ];
  const { ctx } = createSandbox();
  runInContext(`
    var d = RevenueSummaryBrain.buildSalesFlowDiagnostics(
      ${JSON.stringify(futureWorkOrders)},
      ${JSON.stringify(revenueRecords)},
      ${JSON.stringify(monthlyResults)},
      ${JSON.stringify(today)}
    );
  `, ctx);
  assert(ctx.d.upcomingScheduleCount >= 1, 'upcoming schedule count should be shown');
  assert(ctx.d.revenueConfirmationQueueCount >= 1, 'revenue queue count should be shown');
  assert(ctx.d.statusKey === 'revenue_queue', 'revenue queue should take priority for status');
  assert(ctx.d.nextAction.includes('売上確定待ち'), 'next action should mention revenue queue');
}

{
  const { ctx } = createSandbox();
  runInContext(`
    var d = RevenueSummaryBrain.buildSalesFlowDiagnostics([], [], [], ${JSON.stringify(today)});
  `, ctx);
  assert(ctx.d.monthlyMonthCount === 0, 'empty monthly should be 0');
  assert(ctx.d.workOrderCount === 0, 'empty work orders should be 0');
  assert(ctx.d.upcomingScheduleCount === 0, 'empty upcoming should be 0');
  assert(ctx.d.statusKey === 'no_work_orders', 'no work orders status should apply');
  assert(ctx.d.nextAction.includes('予定取り込み'), 'next action should suggest schedule import');
}

{
  const onlyFuture = [{
    id: 'wo-future-only',
    customerName: '未来様',
    serviceText: '浴室クリーニング',
    scheduledDate: '2026-07-10',
    estimateAmount: 20000,
    status: 'tentative'
  }];
  const { ctx } = createSandbox();
  runInContext(`
    var d = RevenueSummaryBrain.buildSalesFlowDiagnostics(
      ${JSON.stringify(onlyFuture)},
      [],
      [],
      ${JSON.stringify(today)}
    );
  `, ctx);
  assert(ctx.d.upcomingScheduleCount === 1, 'future-only work order should count as upcoming');
  assert(ctx.d.nextAction.includes('売上確定'), 'next action should mention post-work confirmation');
}

console.log('All v4.10.1 sales flow diagnostics checks passed.');
