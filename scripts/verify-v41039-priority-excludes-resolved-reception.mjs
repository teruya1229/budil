/**
 * Budil v4.10.41 - resolved reception excluded from today's priority verification.
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

for (const file of ['js/app.js', 'js/reception-brain.js', 'js/revenue-brain.js', 'js/executive-brain.js', 'js/storage.js']) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.10.41 priority-excludes-resolved-reception ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const receptionJs = load('js/reception-brain.js');
const revenueJs = load('js/revenue-brain.js');
const executiveJs = load('js/executive-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');

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
assert(indexHtml.includes('v4.10.41'), 'index.html should show v4.10.41');
assert(indexHtml.includes('js/app.js?v=4.10.41'), 'app.js cache buster should be v4.10.41');
assert(storageJs.includes("BUDIL_VERSION: 'v4.10.41'"), 'storage.js version should be v4.10.41');
assert(dataBackupJs.includes("APP_VERSION: 'v4.10.41'"), 'data-backup version should be v4.10.41');

console.log('== resolve helpers ==');
assert(receptionJs.includes('isIntakeRevenueResolved'), 'isIntakeRevenueResolved should exist');
assert(revenueJs.includes('duplicateMatch'), 'duplicate match resolution should exist');
assert(appJs.includes('isReceptionIntakeRevenueResolved'), 'app helper should exist');
assert(appJs.includes('getResolvedReceptionDailyTaskIntakeId'), 'daily task intake resolver should exist');
assert(executiveJs.includes('isIntakeRevenueResolved'), 'executive brain should use resolved intake filter');
assert(!receptionJs.includes('relatedRevenueId ='), 'must not auto-save relatedRevenueId');
assert(!receptionJs.includes('Storage.update'), 'reception brain must not write storage');

console.log('== priority UI guards ==');
assert(appJs.includes('!isReceptionIntakeRevenueResolved(p.intakeId)'), 'exec priority must guard fill button');
assert(
  appJs.includes('!isReceptionIntakeRevenueResolved(it.intakeId)')
  || appJs.includes('!isReceptionIntakeRevenueResolved(item.intakeId)'),
  'daily priority must guard fill button'
);
assert(appJs.includes('resolvedIntakeTasks'), 'resolved intake tasks should move to done display');
assert(appJs.includes('売上確定済み（受付と既存売上が一致）'), 'resolved intake done label should exist');

console.log('== no CSS change ==');
assert(css.includes('v4.10.37'), 'invoice layout marker should remain v4.10.37');
assert(!css.includes('v4.10.39'), 'css must not change for v4.10.39');

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
    WorkOrderBrain: { normalizeWorkOrder: w => ({ ...(w || {}) }) },
    RevenueBrain: null,
    ReceptionBrain: null,
    FollowUpBrain: null
  });
  runInContext(load('js/calendar-candidate-brain.js'), ctx, { filename: 'calendar-candidate-brain.js' });
  runInContext(load('js/reception-brain.js'), ctx, { filename: 'reception-brain.js' });
  runInContext(load('js/revenue-brain.js'), ctx, { filename: 'revenue-brain.js' });
  runInContext(load('js/executive-brain.js'), ctx, { filename: 'executive-brain.js' });
  return ctx;
}

console.log('== 海老澤智貴様 excluded from pending and priority ==');
{
  const ctx = createSandbox();
  const intake = {
    id: 'intake-ebisawa',
    customerName: '海老澤智貴',
    source: '直受',
    serviceText: 'R1',
    estimateAmount: 22000,
    scheduledDate: '2026-07-03',
    status: 'lead_created'
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
  const result = runInContext(`(() => {
    const ctxData = { revenues: ${JSON.stringify(revenues)}, workOrders: [], leads: [] };
    const resolved = RevenueBrain.isIntakeRevenueResolved
      ? ReceptionBrain.isIntakeRevenueResolved(${JSON.stringify(intake)}, ctxData)
      : ReceptionBrain.getWorkflowState(${JSON.stringify(intake)}, ctxData).hasRevenue;
    const summary = ReceptionBrain.buildIntakePrioritySummary(${JSON.stringify(intake)}, { ...ctxData, followTargets: [] });
    const pending = ExecutiveBrain.getPendingReceptions([${JSON.stringify(intake)}], ctxData);
    const topCtx = {
      today: '2026-07-05',
      todayWork: [],
      pendingReceptions: pending,
      followTargets: [],
      leads: [],
      workOrders: [],
      revenues: ${JSON.stringify(revenues)},
      revCtx: { records: ${JSON.stringify(revenues)} },
      pickups: [],
      dailyTasks: [],
      profitCtx: {},
      analyticsCtx: {},
      perfCtx: {}
    };
    const priorities = ExecutiveBrain.buildTopPriorities(topCtx);
    const summaryAll = ReceptionBrain.getReceptionSummary([${JSON.stringify(intake)}], '2026-07-05', ctxData);
    return { resolved, summary, pendingCount: pending.length, priorities, revenuePending: summaryAll.revenuePending };
  })()`, ctx);
  assert(result.resolved === true, '海老澤 intake should be revenue resolved');
  assert(result.summary.fillRevenueAction === false, 'priority summary must not offer fill revenue');
  assert(result.summary.viewRevenueAction === true, 'priority summary should offer view revenue');
  assert(result.pendingCount === 0, 'resolved intake should not stay in pending receptions');
  assert(result.priorities.every(p => !String(p.title || '').includes('売上確定')), 'resolved intake must not appear in top priorities');
  assert(result.revenuePending === 0, 'revenuePending should exclude resolved intake');
}

console.log('== revenue record date field fallback ==');
{
  const ctx = createSandbox();
  const intake = {
    id: 'intake-date-fallback',
    customerName: '日付フォールバック',
    source: '直受',
    serviceText: 'R1',
    estimateAmount: 10000,
    scheduledDate: '2026-07-01',
    status: 'lead_created'
  };
  const revenues = [{
    id: 'rev-date-fallback',
    customerName: '日付フォールバック',
    source: '直受',
    service: 'R1',
    amount: 10000,
    date: '2026-07-01',
    status: '確定'
  }];
  const result = runInContext(`(() => {
    const resolved = RevenueBrain.resolveRevenueForIntake(${JSON.stringify(intake)}, { revenues: ${JSON.stringify(revenues)}, workOrders: [], leads: [] });
    return ReceptionBrain.isIntakeRevenueResolved(${JSON.stringify(intake)}, { revenues: ${JSON.stringify(revenues)}, workOrders: [], leads: [] })
      && resolved.revenue && resolved.revenue.id === 'rev-date-fallback';
  })()`, ctx);
  assert(result === true, 'should resolve when revenue uses date field instead of workDate');
}

console.log('== unmatched intake keeps fill revenue ==');
{
  const ctx = createSandbox();
  const intake = {
    id: 'intake-new',
    customerName: '未登録太郎',
    source: 'LP',
    serviceText: 'エアコン通常',
    estimateAmount: 15000,
    scheduledDate: '2026-07-10',
    status: 'lead_created'
  };
  const result = runInContext(`(() => {
    const ctxData = { revenues: [], workOrders: [], leads: [] };
    const summary = ReceptionBrain.buildIntakePrioritySummary(${JSON.stringify(intake)}, { ...ctxData, followTargets: [] });
    const pending = ExecutiveBrain.getPendingReceptions([${JSON.stringify(intake)}], ctxData);
    return {
      resolved: ReceptionBrain.isIntakeRevenueResolved(${JSON.stringify(intake)}, ctxData),
      summary,
      pendingCount: pending.length
    };
  })()`, ctx);
  assert(result.resolved === false, 'unmatched intake should stay unresolved');
  assert(result.summary.fillRevenueAction === true, 'unmatched intake should keep fill revenue action');
  assert(result.pendingCount === 1, 'unmatched intake should remain pending');
}

console.log('\nAll v4.10.41 priority-excludes-resolved-reception checks passed.');
