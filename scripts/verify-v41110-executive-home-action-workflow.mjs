/**
 * Budil v4.12.4 - executive home action-first workflow verification.
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = (path) => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
};

for (const file of [
  'js/executive-brain.js',
  'js/profit-brain.js',
  'js/revenue-brain.js',
  'js/app.js',
  'js/storage.js',
  'js/data-backup.js'
]) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.12.4 executive-home-action-workflow ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const executiveJs = load('js/executive-brain.js');
const profitJs = load('js/profit-brain.js');
const revenueJs = load('js/revenue-brain.js');
const receptionJs = load('js/reception-brain.js');
const documentsJs = load('js/documents-brain.js');
const followJs = load('js/follow-up-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

console.log('== version check ==');
assert(indexHtml.includes('v4.12.14'), 'index.html should show v4.12.14');
assert(indexHtml.includes('js/app.js?v=4.12.14'), 'app.js cache buster should be v4.12.14');
assert(indexHtml.includes('css/style.css?v=4.12.14'), 'style.css cache buster should be v4.12.14');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.14'"), 'storage.js version should be v4.12.14');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.14'"), 'data-backup version should be v4.12.14');
assert(statusMd.includes('v4.12.5'), 'status.md should document v4.12.4');
assert(handoffMd.includes('v4.12.5'), 'handoff.md should document v4.12.4');
assert(decisionLog.includes('v4.12.5'), 'decision-log.md should record v4.12.4');

console.log('== executive home layout order ==');
const execHome = indexHtml.slice(
  indexHtml.indexOf('id="executive-home"'),
  indexHtml.indexOf('class="card card-wide card-daily-action-tasks"')
);
const priorityIdx = execHome.indexOf('exec-home-priority-action');
const todayTasksIdx = execHome.indexOf('exec-home-today-tasks-list');
const monthlyIdx = execHome.indexOf('exec-home-revenue-profit');
const attentionIdx = execHome.indexOf('exec-home-attention-list');
const supplementIdx = execHome.indexOf('exec-home-supplement-collapse');
assert(priorityIdx > 0 && todayTasksIdx > priorityIdx, 'priority action should precede today tasks');
assert(monthlyIdx > todayTasksIdx, 'monthly numbers should follow today tasks');
assert(attentionIdx > monthlyIdx, 'attention should follow monthly numbers');
assert(supplementIdx > attentionIdx, 'supplement collapse should be below attention');
assert(execHome.includes('今日やること'), 'today tasks section title required');
assert(execHome.includes('直近の注意'), 'attention section title required');
assert(execHome.includes('今日の最優先 → 今日やること → 今月の数字'), 'subtitle should reflect workflow order');

console.log('== action-first wiring ==');
assert(executiveJs.includes('buildTodayPriorityAction'), 'executive brain should define today priority action');
assert(executiveJs.includes('buildTodayTaskCategories'), 'executive brain should define today task categories');
assert(executiveJs.includes('buildAttentionItems'), 'executive brain should define attention items');
assert(appJs.includes('renderExecutiveTodayTasks'), 'app should render today tasks');
assert(appJs.includes('renderExecutiveAttention'), 'app should render attention items');
assert(appJs.includes('ExecutiveBrain.buildTodayPriorityAction'), 'app should use executive today priority action');
assert(appJs.includes('exec-home-priority-action-btn'), 'priority action button required');
assert(appJs.includes('data-exec-today-action'), 'today task action buttons required');
assert(appJs.includes('minimal: true'), 'executive home monthly numbers should use minimal mode');
assert(css.includes('exec-home-today-tasks'), 'today tasks CSS required');
assert(css.includes('exec-home-revenue-grid-minimal'), 'minimal monthly grid CSS required');

console.log('== priority order in executive brain ==');
const prioritySource = executiveJs.slice(
  executiveJs.indexOf('buildTodayPriorityAction(ctx) {'),
  executiveJs.indexOf('buildTodayTaskCategories(ctx) {')
);
assert(prioritySource.indexOf('revenue_queue') < prioritySource.indexOf('today_work'), 'revenue queue before today work');
assert(prioritySource.indexOf('today_work') < prioritySource.indexOf('payment_pending'), 'today work before payment');
assert(prioritySource.indexOf('payment_pending') < prioritySource.indexOf('month_end_billing'), 'payment before month-end billing');
assert(prioritySource.indexOf('month_end_billing') < prioritySource.indexOf('follow_up'), 'month-end before follow');
assert(prioritySource.indexOf('follow_up') < prioritySource.indexOf('no_expense'), 'follow before expense');
assert(prioritySource.indexOf('no_expense') < prioritySource.indexOf('reception'), 'expense before reception');

console.log('== forbidden terms ==');
const forbidden = ['見込み売上', '見込み利益', '今月売上', '今月利益'];
for (const term of forbidden) {
  assert(!execHome.includes(term), `executive home must not include ${term}`);
}
assert(!appJs.includes('localStorage.clear'), 'localStorage.clear forbidden');

console.log('== v4.11.5 profit rates maintained ==');
assert(revenueJs.includes('coop: 80'), 'coop profit rate must remain');
assert(revenueJs.includes('yamada: 60'), 'yamada profit rate must remain');
assert(revenueJs.includes('totalProfit = confirmedGrossProfit + scheduledGrossProfit - monthExpense'),
  'totalProfit formula must remain');

console.log('== untouched modules ==');
assert(!receptionJs.includes('buildTodayPriorityAction'), 'reception-brain must not change');
assert(!documentsJs.includes('buildTodayPriorityAction'), 'documents-brain must not change');
assert(!followJs.includes('buildTodayPriorityAction'), 'follow-up-brain must not change');
assert(profitJs.includes('buildExecutivePriorityAction'), 'profit brain legacy priority action must remain');

function createSandbox() {
  const sandbox = {
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
    undefined,
    PaymentBrain: null,
    RevenueBrain: null,
    ProfitBrain: null,
    WorkOrderBrain: null,
    WorkCompletionBrain: null,
    RevenueSummaryBrain: null,
    MonthlyResultsBrain: null,
    FollowUpBrain: null
  };
  const ctx = createContext(sandbox);
  runInContext(load('js/payment-brain.js'), ctx, { filename: 'payment-brain.js' });
  runInContext(load('js/work-order-brain.js'), ctx, { filename: 'work-order-brain.js' });
  runInContext(load('js/work-completion-brain.js'), ctx, { filename: 'work-completion-brain.js' });
  runInContext(load('js/revenue-summary-brain.js'), ctx, { filename: 'revenue-summary-brain.js' });
  runInContext(load('js/monthly-results-brain.js'), ctx, { filename: 'monthly-results-brain.js' });
  runInContext(load('js/revenue-brain.js'), ctx, { filename: 'revenue-brain.js' });
  runInContext(load('js/profit-brain.js'), ctx, { filename: 'profit-brain.js' });
  runInContext(load('js/executive-brain.js'), ctx, { filename: 'executive-brain.js' });
  return ctx;
}

console.log('== runtime priority: revenue queue first ==');
{
  const ctx = createSandbox();
  const queueWo = [{
    id: 'wo-q',
    customerName: '確定待ち様',
    serviceText: 'エアコン',
    scheduledDate: '2026-07-01',
    estimateAmount: 18000,
    status: 'tentative'
  }];
  const result = runInContext(`(() => {
    const c = {
      today: '2026-07-06',
      workOrders: ${JSON.stringify(queueWo)},
      revenues: [],
      todayWork: [],
      pendingReceptions: [],
      followUpSection: {},
      revenueProfitSection: { receivables: {}, monthExpense: 1000 },
      profitCtx: { summary: { monthExpenseCount: 1 } },
      analyticsDemandSection: { lines: [] }
    };
    return ExecutiveBrain.buildTodayPriorityAction(c);
  })()`, ctx);
  assert(result.statusKey === 'revenue_queue', 'revenue queue should be top priority');
  assert(result.primaryAction.label === '売上管理へ', 'revenue queue should link to revenue page');
  assert(result.primaryAction.view === 'revenue', 'revenue queue view should be revenue');
}

console.log('== runtime priority: receivables ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const c = {
      today: '2026-07-06',
      workOrders: [],
      revenues: [{ id: 'r1', workDate: '2026-07-01', amount: 10000, source: 'LP', status: '確定', paymentStatus: 'pending' }],
      todayWork: [],
      pendingReceptions: [],
      followUpSection: {},
      revenueProfitSection: {
        receivables: { pendingTotal: 10000, overdueCount: 0, count: 1 },
        monthExpense: 1000
      },
      profitCtx: { summary: { monthExpenseCount: 1 } },
      analyticsDemandSection: { lines: [] }
    };
    return ExecutiveBrain.buildTodayPriorityAction(c);
  })()`, ctx);
  assert(result.statusKey === 'payment_pending' || result.statusKey === 'payment_overdue', 'pending payment should surface');
  assert(result.primaryAction.label === '入金予定へ', 'payment should link to receivables');
}

console.log('\nAll v4.12.4 executive-home-action-workflow checks passed.');
