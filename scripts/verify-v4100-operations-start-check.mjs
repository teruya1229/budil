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

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.10.1'), 'header version should be v4.10.1');
assert(indexHtml.includes('Budil v4.10.1'), 'sidebar version should be v4.10.1');
assert(indexHtml.includes('js/app.js?v=4.10.1'), 'app.js cache buster should be v4.10.1');
assert(load('js/storage.js').includes("BUDIL_VERSION: 'v4.10.1'"), 'storage version should be v4.10.1');

assert(indexHtml.includes('id="exec-home-operations-start-check"'), 'operations start check container should exist');
assert(indexHtml.includes('exec-home-operations-start-check-block'), 'operations start check block class should exist');
assert(appJs.includes('renderOperationsStartCheck'), 'app.js should render operations start check');
assert(appJs.includes('buildOperationsStartCheck'), 'app.js should use buildOperationsStartCheck');
assert(profitJs.includes('buildOperationsStartCheck'), 'profit-brain should build operations start check');
assert(profitJs.includes('isTestLikeWorkOrder'), 'profit-brain should detect test-like work orders');
assert(profitJs.includes('OPERATIONS_START_TEST_PATTERNS'), 'test data patterns should be defined');
assert(!profitJs.includes('localStorage.clear'), 'profit-brain must not call localStorage.clear');

assert(appJs.includes('実運用開始チェック'), 'operations start check title should render');
assert(appJs.includes('テストデータらしき予定'), 'test-like schedule label should render');
assert(appJs.includes('exec-home-operations-start-action-btn'), 'operations start check action button should exist');
assert(!appJs.includes('localStorage.clear'), 'app.js must not call localStorage.clear');

assert(css.includes('.exec-home-operations-start-check'), 'operations start check styles should exist');
assert(!css.includes('.exec-home-operations-start-check {') || !css.match(/\.exec-home-operations-start-check[\s\S]*?overflow-x:\s*auto/), 'operations start check block should not force horizontal scroll');

const ctx = createSandbox();
const withTestData = runInContext(`(() => ProfitBrain.buildOperationsStartCheck({
  today: '2026-06-30',
  settings: { lastBackupAt: '2026-06-01T00:00:00.000Z' },
  workOrders: [
    { id: 'wo-test', customerName: 'v499確認様', serviceText: 'エアコン', scheduledDate: '2099-12-02', estimateAmount: 12000, status: 'tentative' },
    { id: 'wo-real', customerName: '山田様', serviceText: '清掃', scheduledDate: '2026-07-01', estimateAmount: 10000, status: 'tentative' }
  ],
  revenues: [],
  expenses: [{ id: 'e1', date: '2026-06-10', amount: 500, category: '消耗品' }],
  monthlyResults: [{ id: 'mr1', month: '2026-06', revenue: 100000, expense: 20000 }]
}))()`, ctx);
assert(withTestData.testLikeCount === 1, 'should detect one test-like work order');
assert(withTestData.statusKey === 'test_data', 'test data should be highest priority');
assert(withTestData.primaryAction && withTestData.primaryAction.view === 'calendar-candidate', 'test data action should go to schedule import');
assert(withTestData.nextAction.includes('テストデータ'), 'next action should mention test data');

const aliasParsed = runInContext(`(() => CalendarCandidateBrain.parseCalendarText([
  '【カレンダー予定】',
  '日付：2099-12-01',
  '時間：10:00-12:00',
  '件名：テスト様 エアコン',
  '金額：12000'
].join('\\n')))()`, ctx);
assert(aliasParsed && aliasParsed.candidates && aliasParsed.candidates.length > 0, 'v4.9.9 label alias parsing should remain');

const backupNeeded = runInContext(`(() => ProfitBrain.buildOperationsStartCheck({
  today: '2026-06-30',
  settings: {},
  workOrders: [],
  revenues: [],
  expenses: [{ id: 'e1', date: '2026-06-10', amount: 500, category: '消耗品' }],
  monthlyResults: [{ id: 'mr1', month: '2026-06', revenue: 100000, expense: 20000 }]
}))()`, ctx);
assert(backupNeeded.statusKey === 'backup', 'missing backup should trigger backup check');
assert(backupNeeded.primaryAction.view === 'data', 'backup action should go to data management');

const okState = runInContext(`(() => ProfitBrain.buildOperationsStartCheck({
  today: '2026-06-30',
  settings: { lastBackupAt: '2026-06-01T00:00:00.000Z' },
  workOrders: [{ id: 'wo1', customerName: '山田様', serviceText: '清掃', scheduledDate: '2026-07-01', estimateAmount: 10000, status: 'scheduled' }],
  revenues: [{ id: 'rev1', customerName: '山田様', workDate: '2026-06-15', amount: 100000, status: '確定' }],
  expenses: [{ id: 'e1', date: '2026-06-10', amount: 500, category: '消耗品' }],
  monthlyResults: [{ id: 'mr1', month: '2026-06', sales: 100000, brokerFee: 0, materialCost: 0, laborCost: 0, outsourcingCost: 0, otherCost: 500 }]
}))()`, ctx);
assert(okState.statusKey === 'ok', 'clean data should be ready for operations start');
assert(okState.primaryAction == null, 'ready state should not expose extra action button');
assert(okState.nextAction.includes('実運用を開始できます'), 'ready next action should allow operations start');

assert(profitJs.includes('detectTestLikeWorkOrders'), 'profit brain should expose test-like detection helper');
assert(!profitJs.includes('removeItem(') || !profitJs.match(/detectTestLikeWorkOrders[\s\S]*removeItem/), 'test detection must not delete storage');

assert(indexHtml.includes('calendar-candidate-paste'), 'future schedule import UI should remain');
assert(indexHtml.includes('id="data-consistency-check"'), 'data consistency check should remain');
assert(indexHtml.includes('btn-export-data'), 'backup export button should remain');
assert(indexHtml.includes('exec-home-ops-flow'), 'executive home hierarchy from v4.9.5 should remain');
assert(appJs.includes('renderDataConsistencyCheck'), 'data consistency rendering should remain');
assert(appJs.includes('renderExecutivePriorityAction'), 'executive priority action should remain');

console.log('All v4.10.1 operations start check tests passed.');
