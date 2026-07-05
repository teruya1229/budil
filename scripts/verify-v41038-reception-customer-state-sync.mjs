/**
 * Budil v4.10.38 - reception customer state sync verification.
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

console.log('== v4.10.38 reception-customer-state-sync ==');

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
assert(indexHtml.includes('v4.10.40'), 'index.html should show v4.10.40');
assert(indexHtml.includes('js/app.js?v=4.10.40'), 'app.js cache buster should be v4.10.40');
assert(storageJs.includes("BUDIL_VERSION: 'v4.10.40'"), 'storage.js version should be v4.10.40');
assert(dataBackupJs.includes("APP_VERSION: 'v4.10.40'"), 'data-backup version should be v4.10.40');

console.log('== resolve helpers ==');
assert(revenueJs.includes('resolveRevenueForIntake'), 'resolveRevenueForIntake should exist');
assert(revenueJs.includes('findStrongRevenueMatchForIntake'), 'strong match helper should exist');
assert(receptionJs.includes('resolvedRevenue'), 'workflow state should expose resolvedRevenue');
assert(receptionJs.includes('関連売上を見る'), 'primary label should be 関連売上を見る');
assert(!receptionJs.includes('relatedRevenueId ='), 'must not auto-save relatedRevenueId');
assert(!receptionJs.includes('Storage.update'), 'reception brain must not write storage');

console.log('== UI wiring ==');
assert(appJs.includes('data-exec-priority-view-revenue'), 'priority view revenue button should exist');
assert(appJs.includes('data-daily-priority-view-revenue'), 'daily priority view revenue button should exist');
assert(appJs.includes('関連売上を見る'), 'view revenue label should exist');
assert(appJs.includes('fillRevenueFromReceptionIntake'), 'exception fill helper should remain');
assert(appJs.includes('warnExceptionRevenueDuplicate'), 'duplicate guard should remain');
assert(executiveJs.includes('viewRevenueAction'), 'executive priorities should pass viewRevenueAction');

console.log('== no CSS change ==');
assert(css.includes('v4.10.37'), 'invoice layout marker should remain v4.10.37');
assert(!css.includes('v4.10.40'), 'css must not change for v4.10.40');

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

console.log('== 海老澤智貴様 resolved revenue without relatedRevenueId ==');
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
    customerName: '海老澤智貴',
    source: '直受',
    service: 'R1',
    amount: 22000,
    workDate: '2026-07-03',
    status: '確定'
  }];
  const result = runInContext(`(() => {
    const resolved = RevenueBrain.resolveRevenueForIntake(${JSON.stringify(intake)}, { revenues: ${JSON.stringify(revenues)}, workOrders: [], leads: [] });
    const state = ReceptionBrain.getWorkflowState(${JSON.stringify(intake)}, { revenues: ${JSON.stringify(revenues)}, workOrders: [], leads: [] });
    const summary = ReceptionBrain.buildIntakePrioritySummary(${JSON.stringify(intake)}, { revenues: ${JSON.stringify(revenues)}, workOrders: [], leads: [], followTargets: [] });
    const pending = ExecutiveBrain.getPendingReceptions([${JSON.stringify(intake)}], { revenues: ${JSON.stringify(revenues)}, workOrders: [], leads: [] });
    return { resolved, state, summary, pendingCount: pending.length };
  })()`, ctx);
  assert(result.resolved.linkSource === 'strongMatch', 'should resolve by strong match');
  assert(result.state.hasRevenue === true, 'intake should be revenue confirmed');
  assert(result.state.primaryAction === 'openRevenue', 'primary action should open revenue');
  assert(result.state.primaryLabel === '関連売上を見る', 'primary label should be view revenue');
  assert(result.summary.fillRevenueAction === false, 'priority must not offer fill revenue');
  assert(result.summary.viewRevenueAction === true, 'priority should offer view revenue');
  assert(result.summary.title.includes('売上確定済み'), 'priority title should show confirmed');
  assert(result.pendingCount === 0, 'resolved intake should not stay in pending receptions');
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
    const state = ReceptionBrain.getWorkflowState(${JSON.stringify(intake)}, { revenues: [], workOrders: [], leads: [] });
    const summary = ReceptionBrain.buildIntakePrioritySummary(${JSON.stringify(intake)}, { revenues: [], workOrders: [], leads: [], followTargets: [] });
    return { state, summary };
  })()`, ctx);
  assert(result.state.hasRevenue === false, 'unmatched intake should stay unconfirmed');
  assert(result.state.primaryAction === 'fillRevenue', 'unmatched intake should keep fill revenue action');
  assert(result.summary.fillRevenueAction === true, 'priority should offer fill revenue for unmatched');
}

console.log('== revenuePending excludes resolved ==');
{
  const ctx = createSandbox();
  const intake = {
    id: 'intake-ebisawa-2',
    customerName: '海老澤智貴',
    source: '直受',
    serviceText: 'R1',
    estimateAmount: 22000,
    scheduledDate: '2026-07-03',
    status: 'lead_created'
  };
  const revenues = [{
    id: 'rev-ebisawa-2',
    customerName: '海老澤智貴様',
    source: '直受',
    service: 'R1',
    amount: 22000,
    workDate: '2026-07-03'
  }];
  const summary = runInContext(`(() => ReceptionBrain.getReceptionSummary([${JSON.stringify(intake)}], '2026-07-05', { revenues: ${JSON.stringify(revenues)}, workOrders: [], leads: [] }))()`, ctx);
  assert(summary.revenuePending === 0, 'revenuePending should exclude resolved intake');
}

console.log('\nAll v4.10.38 reception-customer-state-sync checks passed.');
