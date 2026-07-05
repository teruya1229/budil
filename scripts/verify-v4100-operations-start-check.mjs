/**
 * Budil v4.10.1 operations start check verification.
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

console.log('== v4.10.1 operations start check ==');

assert(indexHtml.includes('AI経営脳みそ v4.10.35'), 'header version should be v4.10.27');
assert(indexHtml.includes('Budil v4.10.35'), 'sidebar version should be v4.10.27');
assert(indexHtml.includes('js/app.js?v=4.10.35'), 'app.js cache buster should be v4.10.35');
assert(load('js/storage.js').includes("BUDIL_VERSION: 'v4.10.35'"), 'storage version should be v4.10.35');

assert(indexHtml.includes('id="exec-home-operations-start-check"'), 'operations start check container should exist');
assert(indexHtml.includes('exec-home-operations-start-check-block'), 'operations start check block class should exist');
assert(appJs.includes('renderOperationsStartCheck'), 'app.js should render operations start check');
assert(appJs.includes('buildOperationsStartCheck'), 'app.js should use buildOperationsStartCheck');
assert(profitJs.includes('buildOperationsStartCheck'), 'profit-brain should build operations start check');
assert(profitJs.includes('isTestLikeWorkOrder'), 'profit-brain should detect test-like work orders');
assert(profitJs.includes('OPERATIONS_START_TEST_PATTERNS'), 'test data patterns should be defined');
assert(!profitJs.includes('localStorage.clear'), 'profit-brain must not call localStorage.clear');

assert(appJs.includes('exec-home-operations-start-title'), 'operations start check title should render');
assert(appJs.includes('exec-home-operations-start-check'), 'test-like schedule label block should render');
assert(appJs.includes('exec-home-operations-start-action-btn'), 'operations start check action button should exist');
assert(!appJs.includes('localStorage.clear'), 'app.js must not call localStorage.clear');

assert(css.includes('.exec-home-operations-start-check'), 'operations start check styles should exist');
assert(!css.includes('.exec-home-operations-start-check {') || !css.match(/\.exec-home-operations-start-check[\s\S]*?overflow-x:\s*auto/), 'operations start check block should not force horizontal scroll');

const ctx = createSandbox();
const withTestData = runInContext(`(() => ProfitBrain.buildOperationsStartCheck({
  today: '2026-06-30',
  settings: { lastBackupAt: '2026-06-01T00:00:00.000Z' },
  workOrders: [
    { id: 'wo-test', customerName: 'v499???', serviceText: '????', scheduledDate: '2099-12-02', estimateAmount: 12000, status: 'tentative' },
    { id: 'wo-real', customerName: '???', serviceText: '??', scheduledDate: '2026-07-01', estimateAmount: 10000, status: 'tentative' }
  ],
  revenues: [],
  expenses: [{ id: 'e1', date: '2026-06-10', amount: 500, category: '???' }],
  monthlyResults: [{ id: 'mr1', month: '2026-06', revenue: 100000, expense: 20000 }]
}))()`, ctx);
assert(withTestData.testLikeCount === 1, 'should detect one test-like work order');
assert(withTestData.statusKey === 'test_data', 'test data should be highest priority');
assert(withTestData.primaryAction && withTestData.primaryAction.view === 'calendar-candidate', 'test data action should go to schedule import');
assert(withTestData.nextAction.includes('\u30c6\u30b9\u30c8\u30c7\u30fc\u30bf'), 'next action should mention test data');

const aliasParsed = runInContext(`(() => CalendarCandidateBrain.parseCalendarText([
  '\u3010\u30ab\u30ec\u30f3\u30c0\u30fc\u4e88\u5b9a\u3011',
  '\u4ef6\u540d\uff1a\u5225\u540d\u69d8',
  '\u65e5\u4ed8\uff1a2099-12-01',
  '\u6642\u9593\uff1a10:00-12:00',
  '\u91d1\u984d\uff1a12000\u5186'
].join('\\n')))()`, ctx);
assert(aliasParsed && aliasParsed.candidates && aliasParsed.candidates.length > 0, 'v4.9.9 label alias parsing should remain');

const backupNeeded = runInContext(`(() => ProfitBrain.buildOperationsStartCheck({
  today: '2026-06-30',
  settings: {},
  workOrders: [],
  revenues: [],
  expenses: [{ id: 'e1', date: '2026-06-10', amount: 500, category: '???' }],
  monthlyResults: [{ id: 'mr1', month: '2026-06', revenue: 100000, expense: 20000 }]
}))()`, ctx);
assert(backupNeeded.statusKey === 'backup', 'missing backup should trigger backup check');
assert(backupNeeded.primaryAction.view === 'data', 'backup action should go to data management');

const okState = runInContext(`(() => ProfitBrain.buildOperationsStartCheck({
  today: '2026-06-30',
  settings: { lastBackupAt: '2026-06-01T00:00:00.000Z' },
  workOrders: [{ id: 'wo1', customerName: 'Customer', serviceText: 'Service', scheduledDate: '2026-07-01', estimateAmount: 10000, status: 'scheduled' }],
  revenues: [{ id: 'rev1', customerName: 'Customer', workDate: '2026-06-15', amount: 100000, status: '\u78ba\u5b9a' }],
  expenses: [{ id: 'e1', date: '2026-06-10', amount: 500, category: 'supplies' }],
  monthlyResults: [{ id: 'mr1', month: '2026-06', sales: 100000, brokerFee: 0, materialCost: 0, laborCost: 0, outsourcingCost: 0, otherCost: 500 }]
}))()`, ctx);
assert(okState.statusKey === 'ok', 'clean data should be ready for operations start');
assert(okState.primaryAction == null, 'ready state should not expose extra action button');
assert(okState.nextAction.includes('\u5b9f\u904b\u7528'), 'ready next action should allow operations start');

assert(profitJs.includes('detectTestLikeWorkOrders'), 'profit brain should expose test-like detection helper');
assert(!profitJs.includes('removeItem(') || !profitJs.match(/detectTestLikeWorkOrders[\s\S]*removeItem/), 'test detection must not delete storage');

assert(indexHtml.includes('calendar-candidate-paste'), 'future schedule import UI should remain');
assert(indexHtml.includes('id="data-consistency-check"'), 'data consistency check should remain');
assert(indexHtml.includes('btn-export-data'), 'backup export button should remain');
assert(indexHtml.includes('exec-home-daily-core'), 'v4.10.20 executive home daily core should exist');
assert(indexHtml.includes('exec-home-next-action'), 'v4.10.20 executive home next action should exist');
assert(appJs.includes('renderDataConsistencyCheck'), 'data consistency rendering should remain');
assert(appJs.includes('renderExecutivePriorityAction'), 'executive priority action should remain');

console.log('All v4.10.1 operations start check tests passed.');
