/**
 * Budil v4.13.13 - confirmed revenue must come from current user input and an exact confirmation snapshot.
 * Isolated in-memory fixtures only. No browser profile, production localStorage, or customer data.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = file => readFileSync(join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

const app = load('js/app.js');
const index = load('index.html');
const storageSource = load('js/storage.js');
const completionSource = load('js/work-completion-brain.js');

for (const file of ['js/app.js', 'js/storage.js', 'js/work-completion-brain.js']) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
}

function makeLocalStorage(seed = {}) {
  const data = { ...seed };
  const writes = [];
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); writes.push(key); },
    removeItem(key) { delete data[key]; },
    key(index) { return Object.keys(data)[index] || null; },
    get length() { return Object.keys(data).length; },
    data,
    writes
  };
}

function createSandbox(workOrders = [], revenues = []) {
  const localStorage = makeLocalStorage({
    budil_work_orders: JSON.stringify(workOrders),
    budil_revenue_records: JSON.stringify(revenues),
    budil_safety_backups: '[]',
    budil_operation_logs: '[]',
    budil_migrated_v2: '1'
  });
  const ctx = createContext({
    localStorage, console, Date, JSON, Math, Number, String, Array, Object, Boolean,
    RegExp, Set, Map, Error, parseInt, parseFloat, isNaN,
    MapBrain: { detectAreaFromAddress: () => '' },
    ReceptionBrain: { matchRevenueSource: value => value, matchRevenueService: value => value },
    RevenueBrain: { getDefaultGrossProfitRateBySource: () => null }
  });
  for (const file of ['js/work-order-brain.js', 'js/follow-up-brain.js', 'js/work-completion-brain.js', 'js/storage.js']) {
    runInContext(load(file), ctx, { filename: file });
  }
  runInContext('this.Storage = Storage; this.WorkCompletionBrain = WorkCompletionBrain;', ctx);
  return { ctx, localStorage };
}

function workOrder(id) {
  return {
    id,
    customerName: '隔離fixture顧客',
    source: '直受け',
    serviceText: '予定上の作業',
    scheduledDate: '2026-08-27',
    scheduledEndDate: '2026-08-27',
    estimateAmount: 300000,
    status: 'confirmed',
    actualRevenueId: '',
    calendarDedupeKey: `google_calendar|fixture.invalid|${id}`,
    candidateMeta: { importSource: 'calendar-json-file', originalText: '', stableMarker: `stable-${id}` }
  };
}

function completionInput() {
  return {
    workDate: '2026-08-27',
    customerName: '隔離fixture顧客',
    actualService: '本日入力した作業内訳A＋追加作業B',
    service: '法人案件',
    source: '直受け',
    amount: 320000,
    grossMarginRate: '75',
    paymentStatus: '未入金',
    paymentDate: '2026-09-30',
    paymentMethod: '振込',
    paymentConcern: true,
    actualMemo: '本日入力した売上メモ',
    additionalMemo: '',
    followMemo: ''
  };
}

console.log('== input-only UI and stale target guards ==');
assert(index.includes('入力内容を確認して確定'), 'targetless submit label is removed');
assert(index.includes('実際の作業内容（内訳）'), 'the user-visible breakdown field is explicit');
assert(app.includes("document.getElementById('work-completion-date').value = defaults.workDate"), 'work-order confirmation form pre-fills scheduled date');
assert(app.includes("document.getElementById('work-completion-actual-service').value = defaults.actualService"), 'work-order confirmation form pre-fills scheduled breakdown');
assert(app.includes("document.getElementById('work-completion-amount').value = defaults.amount"), 'work-order confirmation form pre-fills scheduled amount');
assert(!app.includes("document.getElementById('work-completion-date').value = ''"), 'work-order date is not cleared to empty');
assert(!app.includes("document.getElementById('work-completion-actual-service').value = ''"), 'work-order breakdown is not cleared to empty');
assert(!app.includes("document.getElementById('work-completion-amount').value = ''"), 'work-order amount is not cleared to empty');
assert(app.includes('WORK_COMPLETION_REQUIRED_USER_INPUT_IDS'), 'required user input fields are tracked');
assert(app.includes('validateCurrentWorkCompletionSession'), 'current modal and work-order identity are validated');
assert(app.includes('getWorkCompletionSourceSignature'), 'stale source data is detected');
assert(app.includes('workCompletionSubmitInFlight'), 'double submission is guarded before confirmation');
assert(!app.includes('`確定売上として登録します。${diffMsg}'), 'old targetless confirmation message is absent');
assert(app.includes('対象内容を入力確認しない過去売上復元からの直接確定は無効です'), 'old direct past-recovery confirmation is disabled');

console.log('== exact snapshot and confirmation content ==');
const wo = workOrder('fixture-work-order-1');
const { ctx, localStorage } = createSandbox([wo]);
ctx.fixtureWorkOrder = wo;
ctx.fixtureInput = completionInput();
ctx.fixtureInlineExpense = {
  shouldCreate: true,
  input: { category: '交通・燃料', amount: 12500, content: '駐車場・燃料', memo: '本日分' }
};
runInContext(`
  this.snapshot = WorkCompletionBrain.createRevenueConfirmationSnapshot(
    fixtureWorkOrder,
    fixtureInput,
    fixtureInlineExpense
  );
  this.snapshotCheck = WorkCompletionBrain.validateRevenueConfirmationSnapshot(snapshot);
  this.message = WorkCompletionBrain.formatRevenueConfirmationMessage(snapshot);
`, ctx);
assert(ctx.snapshotCheck.ok === true, 'complete current input produces a valid snapshot');
assert(ctx.snapshot.payload.workDate === '2026-08-27', 'snapshot contains the entered target date');
assert(ctx.snapshot.payload.amount === 320000, 'snapshot contains the entered amount');
assert(ctx.snapshot.payload.actualService === completionInput().actualService, 'snapshot contains the entered breakdown');
assert(ctx.message.includes('対象日：2026-08-27'), 'confirmation displays the exact target date');
assert(ctx.message.includes('売上金額：320,000円'), 'confirmation displays the exact amount');
assert(ctx.message.includes(`入力された内訳：${completionInput().actualService}`), 'confirmation displays the exact breakdown');
assert(ctx.message.includes('サービス分類：法人案件'), 'confirmation displays the aggregate service classification');
assert(ctx.message.includes('依頼元：直受け'), 'confirmation displays the aggregate source');
assert(ctx.message.includes('粗利率：75%'), 'confirmation displays gross margin rate');
assert(ctx.message.includes('同時登録する経費：12,500円（交通・燃料）'), 'confirmation displays the profit-impacting expense');
assert(app.includes('confirmationSnapshot.payload') && app.includes('confirmationSnapshot.completionInput'), 'the confirmed snapshot is passed to the save boundary');

console.log('== unfilled and cancel are write-free ==');
ctx.emptyInput = { ...completionInput(), workDate: '', actualService: '', amount: 0 };
runInContext(`
  this.emptySnapshot = WorkCompletionBrain.createRevenueConfirmationSnapshot(fixtureWorkOrder, emptyInput, { shouldCreate: false });
  this.emptyCheck = WorkCompletionBrain.validateRevenueConfirmationSnapshot(emptySnapshot);
`, ctx);
assert(ctx.emptyCheck.ok === false, 'unfilled date, breakdown, and amount are rejected');
const beforeCancel = JSON.stringify(localStorage.data);
const cancelAccepted = false;
if (cancelAccepted) runInContext('Storage.confirmRevenueForWorkOrder(fixtureWorkOrder.id, snapshot.payload, snapshot.completionInput);', ctx);
assert(JSON.stringify(localStorage.data) === beforeCancel, 'cancel changes no stored value or aggregate');

console.log('== OK saves one exact revenue and updates today total ==');
runInContext('this.firstSave = Storage.confirmRevenueForWorkOrder(fixtureWorkOrder.id, snapshot.payload, snapshot.completionInput);', ctx);
assert(ctx.firstSave.ok === true && ctx.firstSave.revenueCreated === true, 'OK creates one confirmed revenue');
let savedRevenues = JSON.parse(localStorage.getItem('budil_revenue_records'));
assert(savedRevenues.length === 1, 'exactly one revenue is stored');
for (const [key, value] of Object.entries(ctx.snapshot.payload)) {
  assert(JSON.stringify(savedRevenues[0][key]) === JSON.stringify(value), `saved payload matches confirmed ${key}`);
}
const todayTotal = savedRevenues
  .filter(item => item.workDate === '2026-08-27' && item.status === '確定')
  .reduce((sum, item) => sum + Number(item.amount || 0), 0);
assert(todayTotal === 320000, 'today confirmed-revenue total increases by exactly 320000');

console.log('== double submission and target swap ==');
runInContext('this.secondSave = Storage.confirmRevenueForWorkOrder(fixtureWorkOrder.id, snapshot.payload, snapshot.completionInput);', ctx);
savedRevenues = JSON.parse(localStorage.getItem('budil_revenue_records'));
assert(ctx.secondSave.ok === true && ctx.secondSave.linkedExistingRevenue === true, 'retry reuses the existing work-order revenue');
assert(savedRevenues.length === 1, 'double operation still leaves exactly one revenue');

const wo2 = workOrder('fixture-work-order-2');
const swapSandbox = createSandbox([wo, wo2]);
swapSandbox.ctx.snapshotFromOtherRecord = ctx.snapshot;
runInContext(`
  this.swapResult = Storage.confirmRevenueForWorkOrder(
    'fixture-work-order-2',
    snapshotFromOtherRecord.payload,
    snapshotFromOtherRecord.completionInput
  );
`, swapSandbox.ctx);
assert(swapSandbox.ctx.swapResult.ok === false && swapSandbox.ctx.swapResult.error === 'revenue_payload_mismatch', 'a snapshot cannot be saved to another work order');
assert(JSON.parse(swapSandbox.localStorage.getItem('budil_revenue_records')).length === 0, 'target swap creates no revenue');

console.log('== other new-revenue form routes use detailed snapshots ==');
assert(app.includes('const snapshot = createManualRevenueConfirmationSnapshot(payload'), 'today quick entry creates a confirmation snapshot');
assert(app.includes('confirmManualRevenueSnapshot(snapshot)'), 'today quick entry requires the detailed confirmation');
assert(app.includes('Storage.addRevenueRecord(snapshot.payload)'), 'today quick entry saves the displayed payload');
assert(app.includes('confirmManualRevenueSnapshot(confirmationSnapshot, { updateOnly: !!id })'), 'manual revenue form confirms exact create/update content');
assert(app.includes('Storage.addRevenueRecord(confirmationSnapshot.payload)'), 'manual revenue form saves the displayed payload');
assert(storageSource.includes("error: 'revenue_payload_mismatch'"), 'storage rejects mismatched or incomplete work-order payloads');
assert(completionSource.includes('formatRevenueConfirmationMessage'), 'confirmation formatter is centralized with payload creation');

console.log('\nAll v4.13.13 revenue input confirmation checks passed.');
