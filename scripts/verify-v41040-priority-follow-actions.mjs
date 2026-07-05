/**
 * Budil v4.10.41 - today's priority follow/sales action buttons verification.
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

for (const file of ['js/app.js', 'js/follow-up-brain.js', 'js/reception-brain.js', 'js/executive-brain.js', 'js/storage.js']) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.10.41 priority-follow-actions ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const followJs = load('js/follow-up-brain.js');
const receptionJs = load('js/reception-brain.js');
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
assert(indexHtml.includes('v4.10.42'), 'index.html should show v4.10.42');
assert(indexHtml.includes('js/app.js?v=4.10.42'), 'app.js cache buster should be v4.10.42');
assert(storageJs.includes("BUDIL_VERSION: 'v4.10.42'"), 'storage.js version should be v4.10.42');
assert(dataBackupJs.includes("APP_VERSION: 'v4.10.42'"), 'data-backup version should be v4.10.42');

console.log('== daily priority action wiring ==');
assert(appJs.includes('renderDailyPriorityActionButtons'), 'daily priority action renderer should exist');
assert(appJs.includes('bindDailyPriorityActionEvents'), 'daily priority action binder should exist');
assert(appJs.includes('data-daily-priority-follow-open'), 'follow open button should exist');
assert(appJs.includes('data-daily-priority-skip'), 'skip button should exist');
assert(appJs.includes('お礼LINEを作る/確認'), 'thanks action label should exist');
assert(appJs.includes('今回はスルー'), 'skip label should exist');
assert(appJs.includes('営業アクションを確認'), 'sales action label should exist');
assert(appJs.includes('openFollowUpFromPriority'), 'follow navigation helper should exist');
assert(appJs.includes('openSalesActionFromPriority'), 'sales navigation helper should exist');
assert(appJs.includes('skipDailyPriorityItem'), 'skip helper should exist');
assert(appJs.includes('isPriorityItemDismissed'), 'dismiss filter should exist');
assert(appJs.includes('isDailyPriorityThanksLineItem'), 'thanks item detector should exist');
assert(appJs.includes('isDailyPrioritySalesActionItem'), 'sales item detector should exist');
assert(!/skipDailyPriorityItem[\s\S]{0,800}thanksStatus:\s*'done'/.test(appJs), 'skip must not auto-mark thanks as done');
assert(followJs.includes('findThanksTargetByCustomerName'), 'follow target resolver should exist');
assert(followJs.includes('buildPriorityThanksDedupeKey'), 'thanks dedupe helper should exist');
assert(followJs.includes('buildPrioritySalesDedupeKey'), 'sales dedupe helper should exist');
assert(executiveJs.includes('followTargetId'), 'executive follow priority metadata should remain');
assert(receptionJs.includes('isIntakeRevenueResolved'), 'v4.10.41 reception sync should remain');
assert(appJs.includes('isReceptionIntakeRevenueResolved'), 'v4.10.41 app sync helper should remain');

console.log('== no CSS change ==');
assert(css.includes('v4.10.37'), 'invoice layout marker should remain v4.10.37');
assert(!css.includes('v4.10.40'), 'css must not change for v4.10.40');

console.log('== storage keys unchanged ==');
assert(storageJs.includes("RECEPTION_INTAKES: 'budil_reception_intakes'"), 'reception storage key must remain');
assert(storageJs.includes("ACTION_CANDIDATE_STATES"), 'existing action candidate states key must remain');
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
  runInContext(load('js/follow-up-brain.js'), ctx, { filename: 'follow-up-brain.js' });
  runInContext(load('js/executive-brain.js'), ctx, { filename: 'executive-brain.js' });
  return ctx;
}

console.log('== thanks priority metadata ==');
{
  const ctx = createSandbox();
  const today = '2026-07-05';
  const revenue = {
    id: 'rev-iji',
    customerName: '伊地 美千代',
    service: 'R2',
    amount: 22000,
    workDate: '2026-07-03',
    status: '確定',
    followUp: { thanksStatus: 'pending', reviewStatus: 'pending', repeatStatus: 'pending' }
  };
  const result = runInContext(`(() => {
    const targets = FollowUpBrain.getFollowUpTargets({
      workOrders: [],
      revenues: [${JSON.stringify(revenue)}],
      leads: [],
      today: '${today}'
    });
    const target = targets.find(t => t.needsThanks);
    const priorities = ExecutiveBrain.buildTopPriorities({
      today: '${today}',
      pendingReceptions: [],
      leads: [],
      workOrders: [],
      revenues: [${JSON.stringify(revenue)}],
      todayWork: [],
      followTargets: targets,
      analyticsCtx: {},
      profitCtx: {},
      dailyTasks: []
    });
    const thanksPriority = priorities.find(p => String(p.title || '').startsWith('お礼LINE：'));
    const dedupeKey = FollowUpBrain.buildPriorityThanksDedupeKey(target.id, 'thanks', '${today}');
    return { target, thanksPriority, dedupeKey, targetCount: targets.filter(t => t.needsThanks).length };
  })()`, ctx);
  assert(result.targetCount === 1, 'pending thanks target should exist');
  assert(result.thanksPriority && result.thanksPriority.followTargetId === result.target.id, 'priority should carry followTargetId');
  assert(result.thanksPriority.title.includes('伊地'), 'priority title should include customer name');
  assert(result.dedupeKey.includes('exec-priority'), 'dedupe key should use exec-priority prefix');
}

console.log('== sent thanks excluded from priority ==');
{
  const ctx = createSandbox();
  const today = '2026-07-05';
  const revenue = {
    id: 'rev-done',
    customerName: '送信済み太郎',
    service: 'R1',
    amount: 10000,
    workDate: '2026-07-03',
    status: '確定',
    followUp: { thanksStatus: 'done', reviewStatus: 'pending', repeatStatus: 'pending', thanksSentAt: '2026-07-04T10:00:00.000Z' }
  };
  const result = runInContext(`(() => {
    const targets = FollowUpBrain.getFollowUpTargets({
      workOrders: [],
      revenues: [${JSON.stringify(revenue)}],
      leads: [],
      today: '${today}'
    });
    const priorities = ExecutiveBrain.buildTopPriorities({
      today: '${today}',
      pendingReceptions: [],
      leads: [],
      workOrders: [],
      revenues: [${JSON.stringify(revenue)}],
      todayWork: [],
      followTargets: targets,
      analyticsCtx: {},
      profitCtx: {},
      dailyTasks: []
    });
    return {
      thanksTargets: targets.filter(t => t.needsThanks).length,
      thanksPriority: priorities.filter(p => String(p.title || '').startsWith('お礼LINE：')).length
    };
  })()`, ctx);
  assert(result.thanksTargets === 0, 'done thanks should not stay actionable');
  assert(result.thanksPriority === 0, 'done thanks should not appear in top priorities');
}

console.log('== v4.10.41 resolved reception still excluded ==');
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
    const resolved = ReceptionBrain.isIntakeRevenueResolved(${JSON.stringify(intake)}, ctxData);
    const pending = ExecutiveBrain.getPendingReceptions([${JSON.stringify(intake)}], ctxData);
    const priorities = ExecutiveBrain.buildTopPriorities({
      today: '2026-07-05',
      pendingReceptions: pending,
      leads: [],
      workOrders: [],
      revenues: ${JSON.stringify(revenues)},
      todayWork: [],
      followTargets: [],
      analyticsCtx: {},
      profitCtx: {},
      dailyTasks: []
    });
    return { resolved, pendingCount: pending.length, fillButtons: priorities.filter(p => p.fillRevenueAction).length };
  })()`, ctx);
  assert(result.resolved === true, 'resolved intake should remain resolved');
  assert(result.pendingCount === 0, 'resolved intake should stay out of pending');
  assert(result.fillButtons === 0, 'resolved intake must not expose fill revenue in priorities');
}

console.log('\nAll v4.10.41 priority-follow-actions checks passed.');
