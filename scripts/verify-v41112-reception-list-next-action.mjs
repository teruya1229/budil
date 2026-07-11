/**
 * Budil v4.12.4 - reception list next-action workflow verification.
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

for (const file of ['js/app.js', 'js/reception-brain.js', 'js/revenue-brain.js', 'js/storage.js']) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.12.4 reception-list-next-action ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const receptionJs = load('js/reception-brain.js');
const revenueJs = load('js/revenue-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');
const documentsJs = load('js/documents-brain.js');
const followJs = load('js/follow-up-brain.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

const NG_TERMS = [
  '売上登録',
  '売上登録へ',
  '一括売上登録',
  '登録対象を売上登録',
  '作業完了',
  '作業完了後',
  '売上登録済み',
  '作業後確定',
  '作業後売上確定'
];

console.log('== version check ==');
assert(indexHtml.includes('v4.12.10'), 'index.html should show v4.12.10');
assert(indexHtml.includes('js/app.js?v=4.12.10'), 'app.js cache buster should be v4.12.10');
assert(indexHtml.includes('css/style.css?v=4.12.10'), 'style.css cache buster should be v4.12.10');
assert(indexHtml.includes('js/reception-brain.js?v=4.12.10'), 'reception-brain cache buster should be v4.12.10');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.10'"), 'storage.js version should be v4.12.10');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.10'"), 'data-backup version should be v4.12.10');
assert(statusMd.includes('v4.12.5'), 'status.md should document v4.12.4');
assert(handoffMd.includes('v4.12.5'), 'handoff.md should document v4.12.4');
assert(decisionLog.includes('v4.12.5'), 'decision-log.md should record v4.12.4');

console.log('== reception list bucket helpers ==');
assert(receptionJs.includes('groupReceptionIntakesForList'), 'groupReceptionIntakesForList required');
assert(receptionJs.includes('getReceptionListBucket'), 'getReceptionListBucket required');
assert(receptionJs.includes('needsReceptionAttention'), 'needsReceptionAttention required');
assert(receptionJs.includes('getReceptionNextActionLabel'), 'getReceptionNextActionLabel required');
assert(appJs.includes('renderReceptionListSection'), 'renderReceptionListSection required');
assert(appJs.includes('renderReceptionVisibleActions'), 'renderReceptionVisibleActions required');
assert(appJs.includes('未処理・要対応の受付'), 'needs-action section title required');
assert(appJs.includes('今日確認する受付'), 'today-check section title required');
assert(appJs.includes('売上確定済み受付'), 'resolved section title required');
assert(appJs.includes('完了・対応不要・古い受付'), 'completed section title required');

console.log('== reception list action wiring ==');
assert(appJs.includes('data-reception-gcal-check'), 'google calendar check button required');
assert(appJs.includes('data-reception-schedule-check'), 'schedule check button required');
assert(appJs.includes('data-reception-nav-revenue'), 'revenue nav button required');
assert(appJs.includes('受付詳細'), 'reception detail button required');
assert(appJs.includes('Googleカレンダー確認'), 'google calendar label required');
assert(appJs.includes('予定確認'), 'schedule confirm label required');
assert(!receptionJs.includes('relatedRevenueId ='), 'must not auto-save relatedRevenueId');
assert(!receptionJs.includes('Storage.update'), 'reception brain must not write storage');

console.log('== must not strengthen create-work-order from reception list ==');
{
  const visibleFn = appJs.match(/function renderReceptionVisibleActions[\s\S]*?\n  \}/);
  assert(visibleFn, 'renderReceptionVisibleActions must exist');
  assert(!visibleFn[0].includes('data-reception-create-work-order'), 'visible actions must not create work orders');
  assert(!visibleFn[0].includes('この受付から作業予定を作る'), 'visible actions must not promote work-order creation');
}
{
  const detailFn = appJs.match(/function renderReceptionDetailActions[\s\S]*?\n  \}/);
  assert(detailFn, 'renderReceptionDetailActions must exist');
  assert(!detailFn[0].includes('この受付から作業予定を作る'), 'detail actions must not promote work-order creation');
}

console.log('== v4.11.0 revenue resolved sync maintained ==');
assert(revenueJs.includes('resolveRevenueForIntake'), 'resolveRevenueForIntake should exist');
assert(revenueJs.includes('findStrongRevenueMatchForIntake'), 'strong match helper should exist');
assert(receptionJs.includes('isIntakeRevenueResolved'), 'isIntakeRevenueResolved should exist');
assert(appJs.includes('isReceptionWorkflowRevenueResolved'), 'reception list workflow helper should exist');
assert(
  appJs.includes("!(resolved && label === '売上未確定')"),
  'reception list should hide 売上未確定 label when resolved'
);
assert(
  appJs.includes('isReceptionWorkflowRevenueResolved(state)')
  && appJs.includes('関連売上を見る</button>`'),
  'reception list should use view revenue when resolved'
);

console.log('== v4.10.39 / v4.11.10 / v4.12.4 maintained ==');
assert(appJs.includes('!isReceptionIntakeRevenueResolved(p.intakeId)'), 'exec priority fill guard must remain');
assert(appJs.includes('売上確定済み（受付と既存売上が一致）'), 'resolved intake done label should remain');
assert(appJs.includes('renderScheduleTodayList'), 'schedule page today list must remain');
assert(appJs.includes('scheduleMode: true'), 'schedule queue mode must remain');
assert(appJs.includes('buildTodayPriorityAction'), 'executive home priority must remain');
assert(appJs.includes('data-follow-card-open'), 'follow card actions should remain');
assert(appJs.includes('confirmationStatus'), 'calendar confirmationStatus handling should remain');

console.log('== untouched modules ==');
assert(!documentsJs.includes('v4.12.5'), 'documents-brain should not be version-bumped');
assert(followJs.includes('getFollowUpTargets'), 'follow-up brain core helpers must remain');

console.log('== reception list css ==');
assert(css.includes('reception-saved-grid'), 'reception grid layout required');
assert(css.includes('reception-bucket-needsAction'), 'needs-action bucket style required');
assert(css.includes('reception-visible-actions'), 'visible actions style required');

console.log('== storage keys unchanged ==');
assert(storageJs.includes("RECEPTION_INTAKES: 'budil_reception_intakes'"), 'reception storage key must remain');
assert(!storageJs.includes('localStorage.clear'), 'must not clear localStorage');

for (const term of NG_TERMS) {
  assert(!appJs.includes(term), `NG term ${term} must not appear in app.js UI`);
}

function createSandbox() {
  const ctx = createContext({
    console, Date, JSON, Math, Number, String, Array, Object, Error,
    parseInt, parseFloat, isNaN, undefined, RegExp,
    window: { confirm: () => true },
    CalendarCandidateBrain: null,
    MapBrain: { detectAreaFromAddress: () => '', getIntakeArea: () => '' },
    WorkOrderBrain: null,
    RevenueBrain: null,
    ReceptionBrain: null,
    FollowUpBrain: null
  });
  runInContext(load('js/work-order-brain.js'), ctx, { filename: 'work-order-brain.js' });
  runInContext(load('js/calendar-candidate-brain.js'), ctx, { filename: 'calendar-candidate-brain.js' });
  runInContext(load('js/reception-brain.js'), ctx, { filename: 'reception-brain.js' });
  runInContext(load('js/revenue-brain.js'), ctx, { filename: 'revenue-brain.js' });
  return ctx;
}

function simulateBuckets(intakes, revenues, workOrders, today) {
  const ctx = createSandbox();
  return runInContext(`(() => {
    const context = {
      revenues: ${JSON.stringify(revenues)},
      workOrders: ${JSON.stringify(workOrders || [])},
      leads: []
    };
    const buckets = ReceptionBrain.groupReceptionIntakesForList(${JSON.stringify(intakes)}, context, ${JSON.stringify(today)});
    return {
      needsAction: buckets.needsAction.map(x => x.intake.id),
      todayCheck: buckets.todayCheck.map(x => x.intake.id),
      revenueResolved: buckets.revenueResolved.map(x => x.intake.id),
      completed: buckets.completed.map(x => x.intake.id)
    };
  })()`, ctx);
}

function simulateResolvedUi(intake, revenues) {
  const ctx = createSandbox();
  return runInContext(`(() => {
    const context = { revenues: ${JSON.stringify(revenues)}, workOrders: [], leads: [] };
    const state = ReceptionBrain.getWorkflowState(${JSON.stringify(intake)}, context);
    const resolved = !!(state.hasRevenue || state.resolvedRevenue);
    const bucket = ReceptionBrain.getReceptionListBucket(${JSON.stringify(intake)}, context, '2026-07-06');
    const labels = (state.labels || []).filter(label => !(resolved && label === '売上未確定'));
    const visible = resolved
      ? '関連売上を見る'
      : 'この受付から売上確定する';
    return { resolved, bucket, labels, visible };
  })()`, ctx);
}

console.log('== strong-match intake goes to revenueResolved bucket ==');
{
  const intake = {
    id: 'intake-ebisawa',
    customerName: '海老澤智貴',
    source: '直受',
    serviceText: 'R1',
    estimateAmount: 22000,
    scheduledDate: '2026-07-03',
    status: 'lead_created',
    createdAt: '2026-07-01T10:00:00.000Z'
  };
  const revenues = [{
    id: 'rev-ebisawa',
    customerName: '海老澤智貴様',
    source: '直受',
    service: 'R1',
    amount: 22000,
    workDate: '2026-07-03',
    status: '確定'
  }];
  const buckets = simulateBuckets([intake, {
    id: 'intake-open',
    customerName: '未処理太郎',
    source: 'LP',
    serviceText: 'エアコン通常',
    status: 'new',
    createdAt: '2026-07-06T10:00:00.000Z'
  }], revenues, [], '2026-07-06');
  const ui = simulateResolvedUi(intake, revenues);
  assert(ui.resolved === true, 'strong match intake should be resolved');
  assert(ui.bucket === 'revenueResolved', 'resolved intake must not stay in needsAction');
  assert(buckets.revenueResolved.includes('intake-ebisawa'), 'resolved intake should be in revenueResolved bucket');
  assert(buckets.needsAction.includes('intake-open'), 'new intake should be in needsAction bucket');
  assert(!buckets.needsAction.includes('intake-ebisawa'), 'resolved intake must not be in needsAction bucket');
  assert(ui.labels.includes('売上確定済み'), 'resolved intake should show 売上確定済み');
  assert(!ui.labels.includes('売上未確定'), 'resolved intake must not show 売上未確定');
}

console.log('== completed intake stays in collapsed bucket ==');
{
  const buckets = simulateBuckets([{
    id: 'intake-done',
    customerName: '完了済み太郎',
    source: '直受',
    serviceText: 'エアコン',
    status: 'done',
    createdAt: '2026-05-01T10:00:00.000Z'
  }], [], [], '2026-07-06');
  assert(buckets.completed.includes('intake-done'), 'done intake should be in completed bucket');
  assert(!buckets.needsAction.includes('intake-done'), 'done intake must not be in needsAction');
}

console.log('\nAll v4.12.4 reception-list-next-action checks passed.');
