/**
 * Budil v4.9.4 sales operations MVP final polish verification.
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

const PAST_RECOVERY_PATTERNS = [
  '過去売上復元',
  '過去分復元',
  '売上実績候補',
  '登録対象を売上登録'
];

function stripHiddenHtml(html) {
  return html
    .replace(/<div class="calendar-past-recovery-panel[\s\S]*?(?=<h2>カレンダー予定の貼り付け)/, '')
    .replace(/id="mgmt-calendar-candidates-section"[\s\S]*?<\/div>\s*<div class="morning-section">/, '<div class="morning-section">')
    .replace(/<[^>]*\bhidden\b[^>]*>[\s\S]*?<\/[^>]+>/gi, '');
}

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
const visibleIndex = stripHiddenHtml(indexHtml);

console.log('== v4.9.4 sales operations MVP ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.9.4'), 'header version should be v4.9.4');
assert(indexHtml.includes('Budil v4.9.4'), 'sidebar version should be v4.9.4');
assert(indexHtml.includes('js/app.js?v=4.9.4'), 'app.js cache buster should be v4.9.4');
assert(load('js/storage.js').includes("BUDIL_VERSION: 'v4.9.4'"), 'storage version should be v4.9.4');

for (const pattern of PAST_RECOVERY_PATTERNS) {
  assert(!visibleIndex.includes(pattern), `visible index should not include "${pattern}"`);
}

assert(visibleIndex.includes('今日以降のカレンダー予定を作業予定として保存します'), 'schedule import should mention work order save');
assert(visibleIndex.includes('予定取り込みだけでは確定売上には入りません'), 'schedule import should clarify not confirmed revenue');
assert(visibleIndex.includes('売上予定（未確定）'), 'upcoming revenue label should be visible');
assert(visibleIndex.includes('確定売上・月次実績とは合算しません'), 'upcoming should clarify no merge');
assert(visibleIndex.includes('作業日当日以降で、まだ売上確定していない予定です'), 'revenue queue description should match');
assert(visibleIndex.includes('月単位の確定経営数字を入力します。売上明細とは別管理です'), 'monthly results subtitle should clarify separation');
assert(visibleIndex.includes('自動同期はしません'), 'reconciliation should mention no auto sync');

assert(!summaryBrain.includes('過去売上復元'), 'diagnostics flow note should not mention past recovery');
assert(summaryBrain.includes('予定取り込み→売上予定→売上確定待ち→確定売上'), 'flow note should describe sales pipeline');
assert(summaryBrain.includes('これからの予定売上です'), 'upcoming scope note should be clear');
assert(summaryBrain.includes('作業後に売上確定すると確定売上に反映されます'), 'upcoming hint should mention confirmation');

assert(appJs.includes('月次実績と売上明細の差額を確認します。自動同期はしません'), 'app reconciliation note should be clear');
assert(appJs.includes('renderRevenueFlowDiagnostics'), 'sales flow diagnostics render should remain');
assert(appJs.includes('handleSalesFlowDiagnosticAction'), 'diagnostic action handler should remain');
assert(appJs.includes('renderCalendarCandidateImportSummaryHtml'), 'import result display should remain');
assert(indexHtml.includes('daily-section-expense'), 'daily expense section should remain');
assert(appJs.includes('PAST_RECOVERY_UI_ENABLED = false'), 'past recovery UI should stay disabled');

assert(css.includes('overflow-x: hidden') || css.includes('min-width: 0'), 'layout should avoid horizontal scroll patterns');
assert(css.includes('@media (max-width: 390px)') || css.includes('max-width: 390px'), '390px layout rules should exist');

const today = '2026-06-28';
const monthlyResults = [
  { id: '2026-06', month: '2026-06', sales: 850020, brokerFee: 0, materialCost: 0, laborCost: 0, outsourcingCost: 0, otherCost: 0, profit: 400000 }
];
const revenueRecords = [{
  id: 'rev-1',
  workDate: '2026-06-15',
  customerName: '\u5c71\u7530\u69d8',
  service: '\u30a8\u30a2\u30b3\u30f3',
  source: 'LP',
  amount: 24200,
  status: '\u78ba\u5b9a'
}];
const workOrders = [{
  id: 'wo-1',
  customerName: '\u7530\u4e2d\u69d8',
  serviceText: '\u30a8\u30a2\u30b3\u30f3\u30af\u30ea\u30fc\u30cb\u30f3\u30b0',
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
  assert(ctx.d.revenueConfirmationQueueCount >= 1, 'past work order should be in revenue queue');
  assert(ctx.d.statusKey === 'revenue_queue', 'revenue queue should be primary status');
  assert(ctx.d.primaryAction && ctx.d.primaryAction.id === 'revenue_queue', 'primary action should be revenue queue');
  assert(ctx.d.primaryAction.label === '\u58f2\u4e0a\u78ba\u5b9a\u5f85\u3061\u3092\u898b\u308b', 'queue action label should match');
}

{
  const futureOnly = [{
    id: 'wo-future',
    customerName: '\u672a\u6765\u69d8',
    serviceText: '\u6d74\u5ba4\u30af\u30ea\u30fc\u30cb\u30f3\u30b0',
    scheduledDate: '2026-07-10',
    estimateAmount: 20000,
    status: 'tentative'
  }];
  const { ctx } = createSandbox();
  runInContext(`
    var upcoming = RevenueSummaryBrain.buildUpcomingRevenueScheduleSummary(
      ${JSON.stringify(futureOnly)},
      ${JSON.stringify(today)}
    );
  `, ctx);
  assert(ctx.upcoming.label === '\u58f2\u4e0a\u4e88\u5b9a\uff08\u672a\u78ba\u5b9a\uff09', 'upcoming label should be unsettled');
  assert(ctx.upcoming.scopeNote.includes('\u5408\u7b97\u3057\u307e\u305b\u3093'), 'upcoming should not merge with confirmed');
  assert(ctx.upcoming.upcomingCount === 1, 'future work order should count as upcoming');
}

{
  const { ctx } = createSandbox();
  runInContext(`
    var d = RevenueSummaryBrain.buildSalesFlowDiagnostics([], [], [], ${JSON.stringify(today)});
  `, ctx);
  assert(ctx.d.primaryAction && ctx.d.primaryAction.id === 'schedule_import', 'empty state should suggest schedule import');
  assert(ctx.d.primaryAction.view === 'calendar-candidate', 'schedule import view should match');
}

console.log('All v4.9.4 sales operations MVP checks passed.');
