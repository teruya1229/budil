/**
 * Budil v4.10.1 sales flow diagnostics action links verification.
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

console.log('== v4.10.1 sales diagnostics actions ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.11.14'), 'header version should be v4.10.1');
assert(indexHtml.includes('Budil v4.11.14'), 'sidebar version should be v4.10.1');
assert(indexHtml.includes('js/app.js?v=4.11.14'), 'app.js cache buster should be v4.10.1');
assert(indexHtml.includes('id="revenue-flow-diagnostics"'), 'diagnostics block should remain');
assert(indexHtml.includes('id="daily-section-revenue-queue"'), 'revenue queue section should exist');

assert(appJs.includes('handleSalesFlowDiagnosticAction'), 'diagnostics action handler should exist');
assert(appJs.includes('revenue-flow-diagnostics-action'), 'diagnostics action button class should exist');
assert(appJs.includes('id="revenue-reconciliation-check"'), 'reconciliation scroll target should exist');
assert(appJs.includes('renderRevenueFlowDiagnostics'), 'diagnostics renderer should remain');
assert(appJs.includes('renderCalendarCandidateImportSummaryHtml'), 'schedule import result should remain');

assert(summaryBrain.includes('primaryAction'), 'brain should define primaryAction');
assert(summaryBrain.includes('売上確定待ちを見る'), 'revenue queue action label should exist');
assert(summaryBrain.includes('整合チェックを見る'), 'reconciliation action label should exist');
assert(summaryBrain.includes('売上予定を見る'), 'upcoming action label should exist');
assert(summaryBrain.includes('予定取り込みへ'), 'schedule import action label should exist');
assert(summaryBrain.includes('毎日やることを見る'), 'daily tasks action label should exist');

assert(css.includes('revenue-flow-diagnostics-action-wrap'), 'action button styles should exist');
assert(css.includes('overflow-x: hidden') || css.includes('min-width: 0'), 'layout should avoid horizontal scroll patterns');

const today = '2026-06-28';
const monthlyResults = [
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
const queueWorkOrder = [{
  id: 'wo-queue',
  customerName: '確定待ち様',
  serviceText: 'エアコン',
  scheduledDate: '2026-06-25',
  estimateAmount: 18000,
  status: 'tentative'
}];

{
  const { ctx } = createSandbox();
  runInContext(`
    var d = RevenueSummaryBrain.buildSalesFlowDiagnostics(
      ${JSON.stringify(queueWorkOrder)},
      ${JSON.stringify(revenueRecords)},
      ${JSON.stringify(monthlyResults)},
      ${JSON.stringify(today)}
    );
  `, ctx);
  assert(ctx.d.primaryAction && ctx.d.primaryAction.id === 'revenue_queue', 'queue should map to revenue_queue action');
  assert(ctx.d.primaryAction.label === '売上確定待ちを見る', 'queue action label should match');
  assert(ctx.d.primaryAction.view === 'dashboard', 'queue should navigate to dashboard');
  assert(ctx.d.primaryAction.scrollSelector === '#daily-section-revenue-queue', 'queue should scroll to revenue queue section');
}

{
  const { ctx } = createSandbox();
  runInContext(`
    var d = RevenueSummaryBrain.buildSalesFlowDiagnostics([], ${JSON.stringify(revenueRecords)}, ${JSON.stringify(monthlyResults)}, ${JSON.stringify(today)});
  `, ctx);
  assert(ctx.d.primaryAction && ctx.d.primaryAction.id === 'reconciliation', 'gap should map to reconciliation action');
  assert(ctx.d.primaryAction.label === '整合チェックを見る', 'reconciliation label should match');
  assert(ctx.d.primaryAction.scrollSelector === '#revenue-reconciliation-check', 'reconciliation scroll target should match');
}

{
  const futureOnly = [{
    id: 'wo-future',
    customerName: '未来様',
    serviceText: '浴室',
    scheduledDate: '2026-07-10',
    estimateAmount: 20000,
    status: 'tentative'
  }];
  const { ctx } = createSandbox();
  runInContext(`
    var d = RevenueSummaryBrain.buildSalesFlowDiagnostics(${JSON.stringify(futureOnly)}, [], [], ${JSON.stringify(today)});
  `, ctx);
  assert(ctx.d.primaryAction && ctx.d.primaryAction.id === 'upcoming', 'upcoming should map to upcoming action');
  assert(ctx.d.primaryAction.label === '売上予定を見る', 'upcoming label should match');
  assert(ctx.d.primaryAction.scrollSelector === '#revenue-upcoming-schedule', 'upcoming scroll target should match');
}

{
  const { ctx } = createSandbox();
  runInContext(`
    var d = RevenueSummaryBrain.buildSalesFlowDiagnostics([], [], [], ${JSON.stringify(today)});
  `, ctx);
  assert(ctx.d.primaryAction && ctx.d.primaryAction.id === 'schedule_import', 'no work orders should map to schedule import');
  assert(ctx.d.primaryAction.view === 'calendar-candidate', 'schedule import view should match');
}

{
  const { ctx } = createSandbox();
  runInContext(`
    var d = RevenueSummaryBrain.buildSalesFlowDiagnostics([{
      id: 'wo-only',
      customerName: '予定のみ様',
      serviceText: 'エアコン',
      scheduledDate: '2026-07-10',
      estimateAmount: 0,
      status: 'tentative'
    }], [], [], ${JSON.stringify(today)});
  `, ctx);
  assert(ctx.d.primaryAction && ctx.d.primaryAction.id === 'daily_tasks', 'no confirmed revenue should map to daily tasks');
  assert(ctx.d.primaryAction.label === '毎日やることを見る', 'daily tasks label should match');
}

console.log('All v4.10.1 sales diagnostics action checks passed.');
