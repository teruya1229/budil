/**
 * Budil v4.10.1 data consistency check verification.
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = path => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function makeStore(seed = {}) {
  const data = { ...seed };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    }
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
  [
    'storage.js',
    'messages.js',
    'revenue-brain.js',
    'revenue-summary-brain.js',
    'monthly-results-brain.js',
    'work-order-brain.js',
    'work-completion-brain.js',
    'calendar-candidate-brain.js',
    'profit-brain.js'
  ].forEach(file => runInContext(load(`js/${file}`), ctx, { filename: file }));
  return ctx;
}

execSync(`node --check "${join(root, 'js', 'app.js')}"`, { stdio: 'inherit' });
execSync(`node --check "${join(root, 'js', 'profit-brain.js')}"`, { stdio: 'inherit' });

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const profitJs = load('js/profit-brain.js');
const css = load('css/style.css');

console.log('== v4.10.1 data consistency check ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.12.3'), 'header version should be v4.10.1');
assert(indexHtml.includes('Budil v4.12.3'), 'sidebar version should be v4.10.1');
assert(indexHtml.includes('js/app.js?v=4.12.3'), 'app.js cache buster should be v4.10.1');
assert(load('js/storage.js').includes("BUDIL_VERSION: 'v4.12.3'"), 'storage version should be v4.10.1');

assert(indexHtml.includes('id="data-consistency-check"'), 'data management consistency block should exist');
assert(indexHtml.includes('id="exec-home-data-consistency-check"'), 'exec home consistency block should exist');
assert(indexHtml.includes('\u30c7\u30fc\u30bf\u6574\u5408\u30c1\u30a7\u30c3\u30af'), 'data consistency label should exist');
assert(appJs.includes('buildDataConsistencyCheck'), 'profit brain consistency check should exist');
assert(appJs.includes('renderDataConsistencyCheck'), 'app should render data consistency check');
assert(appJs.includes('handleDataConsistencyAction'), 'consistency action handler should exist');
assert(profitJs.includes('buildDataConsistencyCheck'), 'profit brain should define consistency check');
assert(!profitJs.includes('localStorage.clear'), 'profit brain must not clear storage');

assert(indexHtml.includes('id="exec-home-priority-action"'), 'v4.9.4 priority action should remain');
assert(indexHtml.includes('id="exec-home-monthly-closing-check"'), 'v4.9.3 monthly closing should remain');
assert(indexHtml.includes('backup-protected-note'), 'v4.9.6 backup guidance should remain');
assert(!appJs.includes('\u652f\u51fa\u767b\u9332'), 'expense input wording should remain');

assert(css.includes('data-consistency-check') || css.includes('data-consistency-notices'),
  'consistency check styles should exist');
assert(css.includes('@media (max-width: 390px)') || css.includes('overflow-x: hidden'),
  'layout should avoid horizontal scroll at 390px');

console.log('== consistency check logic ==');
{
  const today = '2026-06-15';
  const ctx = createSandbox();
  const base = runInContext(`(() => {
    const today = '${today}';
    return ProfitBrain.buildDataConsistencyCheck({
      today,
      settings: {},
      revenues: [],
      expenses: [],
      workOrders: [],
      monthlyResults: []
    });
  })()`, ctx);
  assert(base.monthExpenseInputCount === 0, 'should detect zero month expenses');
  assert(base.statusKey === 'no_expense', 'zero expense should prioritize after queue');
  assert(base.reviewCount >= 1, 'should count review items');

  const queueCtx = createSandbox();
  const queue = runInContext(`(() => {
    const today = '${today}';
    const workOrders = [{
      id: 'wo_queue',
      customerName: 'A\u69d8',
      scheduledDate: '2026-06-10',
      status: 'scheduled',
      estimateAmount: 10000
    }];
    return ProfitBrain.buildDataConsistencyCheck({
      today,
      settings: {},
      revenues: [],
      expenses: [{ id: 'exp1', date: '2026-06-01', category: '\u6750\u6599\u8cbb', amount: 1000 }],
      workOrders,
      monthlyResults: []
    });
  })()`, queueCtx);
  assert(queue.revenueQueueCount > 0, 'should detect revenue confirmation queue');
  assert(queue.statusKey === 'revenue_queue', 'queue should be top priority');
  assert(queue.primaryAction.scrollSelector === '#daily-section-revenue-queue', 'queue action should link to revenue queue');

  const leakCtx = createSandbox();
  const leak = runInContext(`(() => {
    const today = '${today}';
    return ProfitBrain.buildDataConsistencyCheck({
      today,
      settings: { lastBackupAt: '2026-06-01T00:00:00.000Z' },
      revenues: [
        { id: 'rev_bad', amount: 0, customerName: '', status: '\u4e0d\u660e', workDate: '' }
      ],
      expenses: [
        { id: 'exp_ok', date: '2026-06-01', category: '\u6750\u6599\u8cbb', amount: 1000 },
        { id: 'exp_bad', amount: 0, date: '', category: '' }
      ],
      workOrders: [{
        id: 'wo_orphan',
        customerName: 'B\u69d8',
        scheduledDate: '2026-06-01',
        status: 'completed',
        actualRevenueId: 'rev_missing'
      }],
      monthlyResults: []
    });
  })()`, leakCtx);
  assert(leak.revenueInputLeakCount > 0, 'should detect revenue input leaks');
  assert(leak.expenseInputLeakCount > 0, 'should detect expense input leaks');
  assert(leak.workOrderIssues.orphanActualRevenueId > 0, 'should detect orphan actualRevenueId');
  assert(leak.statusKey === 'input_leaks', 'input leaks should be detected when no higher priority issues');

  const reconCtx = createSandbox();
  const recon = runInContext(`(() => {
    const today = '${today}';
    return ProfitBrain.buildDataConsistencyCheck({
      today,
      settings: { lastBackupAt: '2026-06-01T00:00:00.000Z' },
      revenues: [{ id: 'rev1', amount: 8000, customerName: 'C\u69d8', status: '\u5b8c\u4e86', workDate: '2026-06-05' }],
      expenses: [{ id: 'exp1', date: '2026-06-01', category: '\u6750\u6599\u8cbb', amount: 1000 }],
      workOrders: [],
      monthlyResults: [{ id: 'mr1', month: '2026-06', sales: 10000, profit: 5000 }]
    });
  })()`, reconCtx);
  assert(recon.hasReconciliationGap || recon.gapMonths > 0, 'should detect reconciliation gap');
  assert(recon.statusKey === 'reconciliation_gap', 'gap should trigger reconciliation action');
  assert(recon.primaryAction.scrollSelector === '#revenue-reconciliation-check', 'gap action should link to reconciliation');
}

console.log('All v4.10.1 data consistency check tests passed.');
