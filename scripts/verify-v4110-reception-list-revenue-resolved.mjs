/**
 * Budil v4.11.10 - reception list revenue resolved display verification.
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

console.log('== v4.11.10 reception-list-revenue-resolved ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const receptionJs = load('js/reception-brain.js');
const revenueJs = load('js/revenue-brain.js');
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
assert(indexHtml.includes('v4.11.10'), 'index.html should show v4.11.10');
assert(indexHtml.includes('js/app.js?v=4.11.10'), 'app.js cache buster should be v4.11.10');
assert(indexHtml.includes('js/reception-brain.js?v=4.11.0'), 'reception-brain cache buster should remain v4.11.0');
assert(indexHtml.includes('js/revenue-brain.js?v=4.11.10'), 'revenue-brain cache buster should be v4.11.10');
assert(storageJs.includes("BUDIL_VERSION: 'v4.11.10'"), 'storage.js version should be v4.11.10');
assert(dataBackupJs.includes("APP_VERSION: 'v4.11.10'"), 'data-backup version should be v4.11.10');

console.log('== reception list display helpers ==');
assert(revenueJs.includes('resolveRevenueForIntake'), 'resolveRevenueForIntake should exist');
assert(revenueJs.includes('findStrongRevenueMatchForIntake'), 'strong match helper should exist');
assert(receptionJs.includes('isIntakeRevenueResolved'), 'isIntakeRevenueResolved should exist');
assert(appJs.includes('isReceptionWorkflowRevenueResolved'), 'reception list workflow helper should exist');
assert(appJs.includes('renderReceptionStateLabels'), 'reception list labels renderer should exist');
assert(appJs.includes('data-reception-open-revenue'), 'view revenue button wiring should exist');
assert(!receptionJs.includes('relatedRevenueId ='), 'must not auto-save relatedRevenueId');
assert(!receptionJs.includes('Storage.update'), 'reception brain must not write storage');

console.log('== reception list must not show fill revenue when resolved ==');
assert(
  appJs.includes("!(resolved && label === '売上未確定')"),
  'reception list should hide 売上未確定 label when resolved'
);
assert(
  appJs.includes('isReceptionWorkflowRevenueResolved(state)')
  && appJs.includes('関連売上を見る</button>`'),
  'reception list primary/detail should use view revenue when resolved'
);

console.log('== v4.10.39 priority exclusion maintained ==');
assert(appJs.includes('!isReceptionIntakeRevenueResolved(p.intakeId)'), 'exec priority fill guard must remain');
assert(appJs.includes('売上確定済み（受付と既存売上が一致）'), 'resolved intake done label should remain');

console.log('== v4.10.41 follow wiring untouched ==');
assert(appJs.includes('data-follow-card-open'), 'follow card actions should remain');

console.log('== v4.10.42 calendar import untouched ==');
assert(appJs.includes('confirmationStatus'), 'calendar confirmationStatus handling should remain');

console.log('== no CSS change ==');
assert(css.includes('v4.10.37'), 'invoice layout marker should remain v4.10.37');
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
  return ctx;
}

function simulateReceptionListUi(intake, revenues) {
  const ctx = createSandbox();
  return runInContext(`(() => {
    const state = ReceptionBrain.getWorkflowState(${JSON.stringify(intake)}, { revenues: ${JSON.stringify(revenues)}, workOrders: [], leads: [] });
    const resolved = !!(state.hasRevenue || state.resolvedRevenue);
    const labels = (state.labels || []).filter(label => !(resolved && label === '売上未確定'));
    const primaryLabel = resolved ? '関連売上を見る' : (state.primaryLabel || '');
    const detailLabel = resolved ? '関連売上を見る' : 'この受付から売上確定する';
    return {
      resolved,
      linkSource: RevenueBrain.resolveRevenueForIntake(${JSON.stringify(intake)}, { revenues: ${JSON.stringify(revenues)}, workOrders: [], leads: [] }).linkSource,
      labels,
      primaryLabel,
      detailLabel,
      hasUnconfirmedLabel: labels.includes('売上未確定')
    };
  })()`, ctx);
}

console.log('== 海老澤智貴様 reception list resolved without relatedRevenueId ==');
{
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
  const ui = simulateReceptionListUi(intake, revenues);
  assert(ui.linkSource === 'strongMatch', 'should resolve by strong match');
  assert(ui.resolved === true, 'reception list should treat intake as revenue resolved');
  assert(ui.primaryLabel === '関連売上を見る', 'primary action should be view revenue');
  assert(ui.detailLabel === '関連売上を見る', 'detail action should be view revenue');
  assert(!ui.hasUnconfirmedLabel, 'reception list must not show 売上未確定 label');
  assert(ui.labels.includes('売上確定済み'), 'reception list should show 売上確定済み label');
}

console.log('== unmatched intake keeps fill revenue in reception list ==');
{
  const intake = {
    id: 'intake-new',
    customerName: '未登録太郎',
    source: 'LP',
    serviceText: 'エアコン通常',
    estimateAmount: 15000,
    scheduledDate: '2026-07-10',
    status: 'lead_created'
  };
  const ui = simulateReceptionListUi(intake, []);
  assert(ui.resolved === false, 'unmatched intake should stay unresolved in list');
  assert(ui.detailLabel === 'この受付から売上確定する', 'unmatched intake should keep fill revenue action');
  assert(ui.hasUnconfirmedLabel, 'unmatched intake should keep 売上未確定 label');
}

console.log('\nAll v4.11.10 reception-list-revenue-resolved checks passed.');
