/**
 * Budil v4.12.4 - profit page workflow and schedule edit actions verification.
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
  'js/revenue-brain.js',
  'js/executive-brain.js',
  'js/profit-brain.js',
  'js/app.js',
  'js/storage.js',
  'js/data-backup.js'
]) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.12.4 profit-page-workflow ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const revenueBrainJs = load('js/revenue-brain.js');
const profitBrainJs = load('js/profit-brain.js');
const executiveBrainJs = load('js/executive-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');
const receptionJs = load('js/reception-brain.js');
const documentsJs = load('js/documents-brain.js');
const followJs = load('js/follow-up-brain.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

console.log('== version check ==');
assert(indexHtml.includes('v4.12.13'), 'index.html should show v4.12.13');
assert(indexHtml.includes('js/app.js?v=4.12.13'), 'app.js cache buster should be v4.12.13');
assert(indexHtml.includes('css/style.css?v=4.12.13'), 'style.css cache buster should be v4.12.13');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.13'"), 'storage.js version should be v4.12.13');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.13'"), 'data-backup version should be v4.12.13');
assert(statusMd.includes('v4.12.5'), 'status.md should document v4.12.4');
assert(handoffMd.includes('v4.12.5'), 'handoff.md should document v4.12.4');
assert(decisionLog.includes('v4.12.5'), 'decision-log.md should record v4.12.4');

console.log('== profit page layout ==');
assert(indexHtml.includes('id="profit-operations-diagnostics"'), 'profit operations diagnostics block required');
assert(indexHtml.includes('id="profit-summary"'), 'profit summary block required');
assert(indexHtml.includes('id="profit-upcoming-schedule"'), 'profit upcoming schedule block required');
assert(indexHtml.includes('id="profit-open-expense-form"'), 'profit expense quick action required');
assert(indexHtml.includes('profit-detail-analysis-collapse'), 'detail analysis should be collapsible');
assert(indexHtml.includes('id="profit-work-order-rows"'), 'work order analysis must remain');
assert(indexHtml.includes('id="profit-service-rows"'), 'service analysis must remain');
assert(indexHtml.includes('id="profit-area-rows"'), 'area analysis must remain');
assert(indexHtml.includes('id="profit-source-rows"'), 'source analysis must remain');
assert(indexHtml.includes('id="profit-hints"'), 'profit hints must remain');
assert(indexHtml.indexOf('profit-operations-diagnostics') < indexHtml.indexOf('profit-upcoming-schedule'), 'profit state should appear before upcoming schedule');
assert(indexHtml.indexOf('profit-summary') < indexHtml.indexOf('profit-upcoming-schedule'), 'monthly numbers should appear before upcoming schedule');
assert(indexHtml.indexOf('profit-upcoming-schedule') < indexHtml.indexOf('profit-expense-form-section'), 'upcoming schedule should appear before expense form');

console.log('== schedule edit actions ==');
assert(appJs.includes('renderProfitUpcomingSchedule'), 'app should render profit upcoming schedule');
assert(appJs.includes('data-profit-schedule-edit'), 'profit schedule edit button required');
assert(appJs.includes('openWorkOrderEditFromProfit'), 'profit schedule edit should open existing work order form');
assert(appJs.includes("navigateToView('calendar-registration')"), 'edit should use existing calendar-registration flow');
assert(appJs.includes('function openWorkOrderEditFromProfit'), 'profit edit helper required');
{
  const editFn = appJs.match(/function openWorkOrderEditFromProfit[\s\S]*?\n  \}/);
  assert(editFn, 'openWorkOrderEditFromProfit body should exist');
  assert(!editFn[0].includes('openWorkCompletionModal'), 'edit must not open revenue confirmation');
  assert(!editFn[0].includes('saveWorkOrderFromForm'), 'edit must not auto-save work orders');
  assert(!editFn[0].includes('addWorkOrder'), 'edit must not create duplicate work orders');
}

console.log('== v4.11.5 profit calculation preserved ==');
assert(revenueBrainJs.includes('calculateNetRevenueBySource'), 'source profit rate helper must remain');
assert(revenueBrainJs.includes('totalProfit = confirmedGrossProfit + scheduledGrossProfit - monthExpense'), 'totalProfit formula must remain');
assert(profitBrainJs.includes('getSharedMonthlyMetricsForProfit'), 'profit diagnostics shared metrics must remain');
assert(appJs.includes('\u4e88\u5b9a\u5229\u76ca'), 'scheduled profit label must remain');

console.log('== forbidden label scan ==');
for (const term of ['\u898b\u8fbc\u307f\u5229\u76ca', '\u898b\u8fbc\u307f\u58f2\u4e0a', '\u4eca\u6708\u5229\u76ca', '\u4eca\u6708\u58f2\u4e0a', '\u4e88\u5b9a\u58f2\u4e0a\u898b\u8fbc\u307f']) {
  assert(!appJs.includes(term), `app.js must not include forbidden label: ${term}`);
}

console.log('== untouched modules ==');
assert(!receptionJs.includes('renderProfitUpcomingSchedule'), 'reception-brain must not change for v4.12.4');
assert(!documentsJs.includes('renderProfitUpcomingSchedule'), 'documents-brain must not change for v4.12.4');
assert(!followJs.includes('renderProfitUpcomingSchedule'), 'follow-up-brain must not change for v4.12.4');
assert(css.includes('profit-detail-analysis-collapse'), 'css should style profit detail collapse');

function createSandbox() {
  const sandbox = {
    console,
    RevenueBrain: null,
    ProfitBrain: null,
    PaymentBrain: null,
    WorkOrderBrain: null,
    ExecutiveBrain: null,
    RevenueSummaryBrain: null,
    MonthlyResultsBrain: null
  };
  runInContext(load('js/work-order-brain.js'), createContext(sandbox));
  runInContext(load('js/payment-brain.js'), createContext(sandbox));
  runInContext(load('js/monthly-results-brain.js'), createContext(sandbox));
  runInContext(load('js/profit-brain.js'), createContext(sandbox));
  runInContext(load('js/revenue-brain.js'), createContext(sandbox));
  runInContext(load('js/revenue-summary-brain.js'), createContext(sandbox));
  runInContext(load('js/executive-brain.js'), createContext(sandbox));
  return createContext(sandbox);
}

console.log('== screen consistency ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const records = [
      { id: 'r1', workDate: '2026-07-03', amount: 25000, source: '\u76f4\u8acb\u3051', status: '\u78ba\u5b9a', paymentStatus: 'paid' },
      { id: 'r2', workDate: '2026-07-04', amount: 10000, source: '\u30e4\u30de\u30c0', status: '\u78ba\u5b9a', paymentStatus: 'pending' }
    ];
    const workOrders = [
      { id: 'wo1', scheduledDate: '2026-07-07', estimateAmount: 10000, source: '\u30b3\u30fc\u30d7', status: 'tentative', startTime: '10:00', endTime: '12:00', customerName: '\u30c6\u30b9\u30c8' }
    ];
    const expenses = [{ id: 'e1', date: '2026-07-02', amount: 3000, category: '\u4ea4\u901a\u30fb\u71c3\u6599' }];
    const settings = { monthlyTarget: 100000 };
    const shared = RevenueBrain.buildSharedMonthlyMetrics({
      records, settings, workOrders, expenses, today: '2026-07-05', monthKey: '2026-07'
    });
    const execSection = ExecutiveBrain.buildRevenueProfitSection({
      today: '2026-07-05',
      workOrders,
      expenses,
      revCtx: { records, settings, summary: { monthlyTarget: 100000 } },
      profitCtx: { summary: { monthKey: '2026-07', unlinkedCount: 0, adExpense: 0, usesMonthlyResult: false }, revenueRows: [], revenues: records, expenses, workOrders },
      forecast: {}
    });
    const profitDiag = ProfitBrain.buildProfitOperationsDiagnostics(
      { summary: { monthKey: '2026-07', usesMonthlyResult: false }, revenues: records, expenses, workOrders },
      { today: '2026-07-05', revenues: records, workOrders, expenses }
    );
    const upcoming = RevenueSummaryBrain.buildUpcomingRevenueScheduleSummary(workOrders, '2026-07-05');
    return { shared, execSection, profitDiag, upcoming };
  })()`, ctx);

  assert(result.execSection.totalProfit === result.shared.totalProfit, 'executive and shared totalProfit must match');
  assert(result.profitDiag.monthProfit === result.shared.totalProfit, 'profit diagnostics and shared totalProfit must match');
  assert(result.upcoming.upcomingCount >= 1, 'upcoming schedule summary should include future work order');
  assert(result.upcoming.upcoming[0].id === 'wo1', 'upcoming schedule item should expose work order id for edit');
}

console.log('\nAll v4.12.4 profit-page-workflow checks passed.');
