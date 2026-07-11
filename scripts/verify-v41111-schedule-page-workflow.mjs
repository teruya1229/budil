/**
 * Budil v4.12.4 - schedule page completion workflow verification.
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
  'js/work-order-brain.js',
  'js/revenue-brain.js',
  'js/profit-brain.js',
  'js/app.js',
  'js/storage.js',
  'js/data-backup.js'
]) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.12.4 schedule-page-workflow ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const workOrderBrainJs = load('js/work-order-brain.js');
const revenueBrainJs = load('js/revenue-brain.js');
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
assert(indexHtml.includes('v4.12.10'), 'index.html should show v4.12.10');
assert(indexHtml.includes('js/app.js?v=4.12.10'), 'app.js cache buster should be v4.12.10');
assert(indexHtml.includes('css/style.css?v=4.12.10'), 'style.css cache buster should be v4.12.10');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.10'"), 'storage.js version should be v4.12.10');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.10'"), 'data-backup version should be v4.12.10');
assert(statusMd.includes('v4.12.5'), 'status.md should document v4.12.4');
assert(handoffMd.includes('v4.12.5'), 'handoff.md should document v4.12.4');
assert(decisionLog.includes('v4.12.5'), 'decision-log.md should record v4.12.4');

console.log('== schedule page layout order ==');
const scheduleView = indexHtml.slice(
  indexHtml.indexOf('id="view-calendar-registration"'),
  indexHtml.indexOf('id="view-calendar-candidate"')
);
assert(scheduleView.includes('作業後の売上確定待ち'), 'post-work queue heading required');
assert(scheduleView.includes('今日の作業予定'), 'today schedule heading required');
assert(scheduleView.includes('直近の作業予定'), 'upcoming schedule heading required');
assert(scheduleView.includes('card-schedule-import-collapse'), 'import collapse required');
assert(scheduleView.includes('work-order-manual-entry'), 'manual work order form required');
assert(scheduleView.includes('card-schedule-past-collapse'), 'past/completed collapse required');
assert(
  scheduleView.indexOf('schedule-revenue-queue-list') < scheduleView.indexOf('schedule-today-list'),
  'revenue queue should be above today schedule'
);
assert(
  scheduleView.indexOf('schedule-today-list') < scheduleView.indexOf('schedule-upcoming-list'),
  'today schedule should be above upcoming schedule'
);
assert(
  scheduleView.indexOf('schedule-upcoming-list') < scheduleView.indexOf('card-schedule-import-collapse'),
  'upcoming schedule should be above import collapse'
);
assert(
  scheduleView.indexOf('work-order-manual-entry') < scheduleView.indexOf('card-schedule-past-collapse'),
  'manual form should be above past collapse'
);

console.log('== schedule workflow wiring ==');
assert(appJs.includes('scheduleMode: true'), 'schedule page should use schedule queue mode');
assert(appJs.includes('renderScheduleTodayList'), 'today schedule renderer required');
assert(appJs.includes('renderScheduleUpcomingList'), 'upcoming schedule renderer required');
assert(appJs.includes('renderScheduleWorkOrderRow'), 'schedule row renderer required');
assert(appJs.includes('openWorkOrderFormPanel'), 'edit should open existing form panel');
assert(appJs.includes('getUpcomingWorkOrders'), 'upcoming work orders helper required');
assert(workOrderBrainJs.includes('getUpcomingWorkOrders'), 'work-order brain upcoming helper required');
assert(appJs.includes('Googleカレンダー確認'), 'calendar confirm button required');
assert(appJs.includes('売上確定へ'), 'queue confirm button label required');
assert(appJs.includes('data-schedule-wo-edit'), 'schedule row edit action required');

{
  const confirmFn = appJs.match(/function openWorkCompletionModalFromQueue[\s\S]*?\n  \}/);
  assert(confirmFn, 'openWorkCompletionModalFromQueue must remain');
  assert(!confirmFn[0].includes('addWorkOrder'), 'queue confirm must not create work orders');
  assert(!confirmFn[0].includes('Storage.addRevenueRecord'), 'queue confirm must not auto-save revenue');
}

console.log('== schedule queue filter ==');
const collectFn = appJs.slice(
  appJs.indexOf('function collectRevenueConfirmationQueue'),
  appJs.indexOf('function formatRevenueQueueDate')
);
assert(collectFn.includes('scheduleMode'), 'queue collector should support schedule mode');
assert(collectFn.includes("wo.status === 'completed'"), 'schedule mode should exclude completed');
assert(collectFn.includes('estimateAmount || 0) <= 0'), 'schedule mode should require amount');

console.log('== preserved flows ==');
assert(indexHtml.includes('id="executive-home"'), 'executive home must remain');
assert(indexHtml.includes('id="revenue-confirmation-queue-list"'), 'revenue queue must remain');
assert(revenueBrainJs.includes('confirmedFeeAmount = confirmedRevenue - confirmedGrossProfit'), 'v4.11.5 fee formula must remain');
assert(revenueBrainJs.includes('totalProfit = confirmedGrossProfit + scheduledGrossProfit - monthExpense'), 'totalProfit formula must remain');
assert(!receptionJs.includes('renderScheduleTodayList'), 'reception-brain must not change for v4.12.4');
assert(!documentsJs.includes('renderScheduleTodayList'), 'documents-brain must not change for v4.12.4');
assert(!followJs.includes('renderScheduleTodayList'), 'follow-up-brain must not change for v4.12.4');

console.log('== forbidden label scan ==');
for (const term of ['見込み利益', '見込み売上', '今月利益', '今月売上', '予定売上見込み']) {
  assert(!scheduleView.includes(term), `schedule view must not include forbidden label: ${term}`);
}

console.log('== schedule css ==');
assert(css.includes('#view-calendar-registration .schedule-work-order-row'), 'schedule row css required');
assert(css.includes('#view-calendar-registration .schedule-revenue-queue-list'), 'schedule queue css required');

{
  const ctx = createContext({
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
  runInContext(load('js/work-order-brain.js'), ctx, { filename: 'work-order-brain.js' });
  runInContext(load('js/calendar-candidate-brain.js'), ctx, { filename: 'calendar-candidate-brain.js' });
  runInContext(load('js/work-completion-brain.js'), ctx, { filename: 'work-completion-brain.js' });
  runInContext(`
    const today = '2026-07-06';
    const workOrders = [
      { id: 'past-open', customerName: '過去未確定', serviceText: 'エアコン', scheduledDate: '2026-07-05', estimateAmount: 12000, source: 'コープ', status: 'confirmed', startTime: '10:00', endTime: '12:00' },
      { id: 'past-done', customerName: '完了済み', serviceText: '洗濯機', scheduledDate: '2026-07-04', estimateAmount: 8000, source: 'ヤマダ', status: 'completed' },
      { id: 'past-rev', customerName: '売上確定済み', serviceText: 'レンジ', scheduledDate: '2026-07-03', estimateAmount: 9000, source: 'LP', status: 'confirmed', actualRevenueId: 'rev1' },
      { id: 'today-open', customerName: '今日', serviceText: '掃除', scheduledDate: '2026-07-06', estimateAmount: 10000, source: 'コープ', status: 'confirmed', startTime: '13:00', endTime: '15:00' },
      { id: 'future-open', customerName: '明日', serviceText: '分解', scheduledDate: '2026-07-07', estimateAmount: 15000, source: 'くらしのマーケット', status: 'tentative', startTime: '09:00', endTime: '11:00' }
    ];
    var todayItems = WorkOrderBrain.getTodayWorkOrders(workOrders, today);
    var upcomingItems = WorkOrderBrain.getUpcomingWorkOrders(workOrders, today);
  `, ctx);
  assert(ctx.todayItems.length === 1 && ctx.todayItems[0].id === 'today-open', 'today list should include only today active schedule');
  assert(ctx.upcomingItems.length === 1 && ctx.upcomingItems[0].id === 'future-open', 'upcoming list should include tomorrow schedule only');
}

execSync('node scripts/verify-v41110-executive-home-action-workflow.mjs', { cwd: root, stdio: 'inherit' });

console.log('\nAll v4.12.4 schedule-page-workflow checks passed.');
