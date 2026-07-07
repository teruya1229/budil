/**
 * Budil v4.8.31 sales summary monthly reconciliation verification.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const jsDir = join(root, 'js');

function load(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function createSandbox(seed) {
  const localStorage = {
    _data: { ...(seed || {}) },
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; }
  };
  const ctx = {
    localStorage,
    console,
    JSON,
    Math,
    Date,
    Number,
    String,
    Array,
    Object,
    parseInt,
    parseFloat,
    isNaN: Number.isNaN,
    setTimeout,
    clearTimeout
  };
  return { ctx };
}

function runInContext(code, ctx, opts) {
  vm.runInNewContext(code, ctx, opts);
}

function bootBrains(ctx) {
  ['messages.js', 'payment-brain.js', 'revenue-brain.js', 'work-order-brain.js',
    'profit-brain.js', 'monthly-results-brain.js', 'revenue-summary-brain.js',
    'calendar-candidate-brain.js', 'storage.js'].forEach(file => {
    runInContext(load(join('js', file)), ctx, { filename: file });
  });
}

console.log('== v4.8.31 sales monthly reconciliation ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.12.0'), 'header version should be v4.8.31');
assert(indexHtml.includes('Budil v4.12.0'), 'sidebar version should be v4.8.31');
assert(indexHtml.includes('js/app.js?v=4.12.0'), 'app.js cache buster should be v4.8.31');
assert(indexHtml.includes('\u4e88\u5b9a\u53d6\u308a\u8fbc\u307f'), 'schedule import nav should exist');
assert(!indexHtml.includes('nav-label">\u904e\u53bb\u58f2\u4e0a\u5fa9\u5143'), 'past recovery nav label should be hidden');
assert(indexHtml.includes('calendar-past-recovery-panel hidden'), 'past recovery panel should be hidden');
assert(indexHtml.includes('\u4e88\u5b9a\u53d6\u308a\u8fbc\u307f'), 'schedule import view title should exist');
assert(indexHtml.includes('monthly-results-reconciliation'), 'monthly reconciliation block should exist');
assert(indexHtml.includes('revenue-monthly-reconciliation'), 'revenue reconciliation block should exist');
assert(appJs.includes('PAST_RECOVERY_UI_ENABLED = false'), 'past recovery UI should be disabled');
assert(appJs.includes('buildReconciliationReport'), 'reconciliation helper usage should exist');
assert(load('js/revenue-summary-brain.js').includes('buildMonthlySummaryWithResults'), 'monthly summary merge should exist');

for (const file of ['monthly-results-brain.js', 'revenue-summary-brain.js', 'app.js']) {
  execSync(`node --check "${join(jsDir, file)}"`, { stdio: 'inherit' });
}

{
  const monthly = [{
    id: '2026-06',
    month: '2026-06',
    sales: 850020,
    brokerFee: 0,
    materialCost: 0,
    laborCost: 0,
    outsourcingCost: 0,
    otherCost: 0,
    profit: 400000
  }];
  const revenues = [{
    id: 'rev-1',
    workDate: '2026-06-15',
    customerName: '\u5c71\u7530\u69d8',
    service: '\u30a8\u30a2\u30b3\u30f3',
    source: 'LP',
    amount: 24200,
    status: '\u78ba\u5b9a'
  }];
  const { ctx } = createSandbox({
    budil_monthly_results: JSON.stringify(monthly),
    budil_revenue_records: JSON.stringify(revenues)
  });
  bootBrains(ctx);
  runInContext(`
    var compact = RevenueSummaryBrain.buildCompactSummary(
      Storage.getRevenueRecords(),
      '2026-06-28',
      Storage.getMonthlyResults()
    );
    var report = MonthlyResultsBrain.buildReconciliationReport(
      Storage.getMonthlyResults(),
      Storage.getRevenueRecords()
    );
    var row = report.find(function(r) { return r.month === '2026-06'; });
  `, ctx);
  assert(ctx.compact.thisMonthTotal === 850020, 'current month total should use monthly result');
  assert(ctx.compact.usesMonthlyResultThisMonth === true, 'compact should flag monthly result month');
  assert(ctx.row.monthlySales === 850020, 'reconciliation monthly sales should be 850020');
  assert(ctx.row.detailTotal === 24200, 'reconciliation detail total should be 24200');
  assert(ctx.row.diff === 825820, 'reconciliation diff should be 825820');
  assert(ctx.row.status === '\u5dee\u984d\u3042\u308a', 'reconciliation status should be diff');
}

{
  const monthly = [{ id: '2026-05', month: '2026-05', sales: 500000, profit: 200000 }];
  const { ctx } = createSandbox({
    budil_monthly_results: JSON.stringify(monthly),
    budil_revenue_records: JSON.stringify([])
  });
  bootBrains(ctx);
  runInContext(`
    var view = RevenueSummaryBrain.getMonthSalesView(
      '2026-05',
      Storage.getRevenueRecords(),
      Storage.getMonthlyResults()
    );
  `, ctx);
  assert(ctx.view.displayTotal === 500000, 'monthly-only month should not show zero');
  assert(ctx.view.status === '\u6708\u6b21\u5b9f\u7e3e\u306e\u307f', 'monthly-only status should match');
}

{
  const revenues = [{
    id: 'rev-2',
    workDate: '2026-03-10',
    customerName: '\u4f50\u85e4\u69d8',
    service: '\u6d74\u5ba4',
    amount: 18000,
    status: '\u78ba\u5b9a'
  }];
  const { ctx } = createSandbox({
    budil_monthly_results: JSON.stringify([]),
    budil_revenue_records: JSON.stringify(revenues)
  });
  bootBrains(ctx);
  runInContext(`
    var view = RevenueSummaryBrain.getMonthSalesView(
      '2026-03',
      Storage.getRevenueRecords(),
      Storage.getMonthlyResults()
    );
  `, ctx);
  assert(ctx.view.displayTotal === 18000, 'detail-only month should use detail total');
  assert(ctx.view.status === '\u660e\u7d30\u306e\u307f', 'detail-only status should match');
}

{
  const amount = 30000;
  const monthly = [{ id: '2026-04', month: '2026-04', sales: amount, profit: 10000 }];
  const revenues = [{
    id: 'rev-3',
    workDate: '2026-04-12',
    amount,
    status: '\u78ba\u5b9a',
    service: '\u30a8\u30a2\u30b3\u30f3',
    customerName: '\u7530\u4e2d\u69d8'
  }];
  const { ctx } = createSandbox({
    budil_monthly_results: JSON.stringify(monthly),
    budil_revenue_records: JSON.stringify(revenues)
  });
  bootBrains(ctx);
  runInContext(`
    var row = MonthlyResultsBrain.buildReconciliationRow(
      '2026-04',
      Storage.getMonthlyResults(),
      Storage.getRevenueRecords()
    );
  `, ctx);
  assert(ctx.row.status === '\u4e00\u81f4', 'matching month should be match');
}

console.log('All v4.8.31 sales monthly reconciliation checks passed.');
