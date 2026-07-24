/**
 * Budil v4.12.17 - work order delete + completion payment date defaults.
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
  'js/app.js',
  'js/storage.js',
  'js/work-completion-brain.js',
  'js/payment-brain.js',
  'js/revenue-brain.js',
  'js/data-backup.js'
]) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.12.17 work-order-delete-payment-date ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const storageJs = load('js/storage.js');
const completionJs = load('js/work-completion-brain.js');
const revenueJs = load('js/revenue-brain.js');
const dataBackupJs = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

console.log('== version / cache buster ==');
assert(indexHtml.includes('v4.12.17'), 'index.html should show v4.12.17');
assert(indexHtml.includes('js/app.js?v=4.12.17'), 'app.js cache buster should be v4.12.17');
assert(indexHtml.includes('js/storage.js?v=4.12.17'), 'storage cache buster should be v4.12.17');
assert(indexHtml.includes('js/work-completion-brain.js?v=4.12.17'), 'work-completion-brain cache buster should be v4.12.17');
assert(indexHtml.includes('css/style.css?v=4.12.17'), 'style.css cache buster should be v4.12.17');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.17'"), 'storage version should be v4.12.17');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.17'"), 'data-backup version should be v4.12.17');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.12.17'"), 'verify-current EXPECTED_VERSION should be v4.12.17');
assert(!indexHtml.includes('?v=4.12.14'), 'old cache buster v4.12.14 should be gone');
assert(statusMd.includes('v4.12.17'), 'status.md should document v4.12.17');
assert(handoffMd.includes('v4.12.17'), 'handoff.md should document v4.12.17');
assert(decisionLog.includes('v4.12.17'), 'decision-log.md should record v4.12.17');

console.log('== D. clear vs delete UI wiring ==');
assert(indexHtml.includes('id="btn-work-order-delete"'), 'delete button required');
assert(indexHtml.includes('Budilから予定を削除'), 'delete button label required');
assert(indexHtml.includes('btn-danger'), 'delete uses existing danger style');
assert(appJs.includes('function deleteWorkOrderFromForm'), 'delete handler required');
assert(appJs.includes('Storage.deleteWorkOrder'), 'delete must call Storage.deleteWorkOrder');
assert(appJs.includes('Googleカレンダーの予定は削除されません'), 'confirm must mention calendar not deleted');
assert(appJs.includes('次回のJSON取り込みで再表示される可能性'), 'confirm must mention re-import risk');
assert(appJs.includes('入力をクリア'), 'new clear label required');
assert(appJs.includes('編集をやめる'), 'edit cancel label required');
assert(appJs.includes('保存済み予定は削除していません'), 'clear toast must clarify no delete');
assert(appJs.includes('Budilの作業予定を削除しました。Googleカレンダーは変更していません。'), 'success toast required');
{
  const clearFn = appJs.match(/function clearWorkOrderForm[\s\S]*?\n  function /);
  assert(clearFn, 'clearWorkOrderForm must remain');
  assert(!clearFn[0].includes('Storage.deleteWorkOrder'), 'clear must not delete from Storage');
  assert(!clearFn[0].includes('deleteWorkOrder('), 'clear must not call deleteWorkOrder');
}

function createSandbox() {
  const store = Object.create(null);
  const localStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      Object.keys(store).forEach((k) => delete store[k]);
    }
  };
  const sandbox = {
    console,
    localStorage,
    Date,
    JSON,
    Math,
    Number,
    String,
    Array,
    Object,
    Boolean,
    Set,
    Map,
    parseInt,
    parseFloat,
    isNaN,
    PaymentBrain: null,
    RevenueBrain: null,
    WorkOrderBrain: {
      normalizeWorkOrder: (x) => ({ ...(x || {}) }),
      formatYen: (n) => `${n}円`
    },
    WorkCompletionBrain: null,
    ReceptionBrain: {
      matchRevenueService: (x) => x || '',
      matchRevenueSource: (x) => x || '',
      normalizeIntake: (x) => ({ ...(x || {}) })
    },
    FollowUpBrain: {
      normalizeFollowUp: (x) => ({ ...(x || {}) })
    },
    ProfitBrain: {
      normalizeExpense: (x) => ({ ...(x || {}) })
    },
    CalendarCandidateBrain: undefined,
    Storage: null
  };
  const ctx = createContext(sandbox);
  runInContext(load('js/payment-brain.js'), ctx);
  runInContext(load('js/revenue-brain.js'), ctx);
  runInContext(load('js/work-completion-brain.js'), ctx);
  runInContext(load('js/storage.js'), ctx);
  return { ctx, store };
}

const { ctx } = createSandbox();

function resetStore() {
  runInContext('localStorage.clear();', ctx);
}

console.log('== A. delete one work order ==');
{
  resetStore();
  const result = runInContext(`(() => {
    const a = Storage.addWorkOrder({ id: 'work-keep', customerName: '残す予定', scheduledDate: '2026-07-20', estimateAmount: 10000, status: 'tentative' });
    const b = Storage.addWorkOrder({ id: 'work-del', customerName: '消す予定', scheduledDate: '2026-07-21', estimateAmount: 12000, status: 'tentative' });
    const before = Storage.getWorkOrders().length;
    const backupsBefore = Storage.getSafetyBackups().length;
    const logsBefore = Storage.getOperationLogs().length;
    const del = Storage.deleteWorkOrder('work-del');
    const list = Storage.getWorkOrders();
    return {
      del,
      before,
      after: list.length,
      ids: list.map(w => w.id).sort(),
      backupsDelta: Storage.getSafetyBackups().length - backupsBefore,
      logsDelta: Storage.getOperationLogs().length - logsBefore,
      lastLog: Storage.getOperationLogs()[0] || null,
      calendarKeys: Object.keys(localStorage).filter(k => /calendar|candidate|ai|hub/i.test(k))
    };
  })()`, ctx);
  assert(result.del.ok === true, 'delete should succeed');
  assert(result.after === result.before - 1, 'exactly one work order removed');
  assert(result.ids.includes('work-keep') && !result.ids.includes('work-del'), 'only target deleted');
  assert(result.backupsDelta >= 1, 'safety backup must be created');
  assert(result.logsDelta >= 1, 'operation log must be created');
  assert(result.lastLog && result.lastLog.action === 'delete_work_order', 'log action must be delete_work_order');
  assert(result.lastLog.safeBackupId, 'log must record safeBackupId');
  assert(result.calendarKeys.length === 0, 'no calendar/AI keys should be introduced');
}

console.log('== B. revenue lock ==');
{
  resetStore();
  const lockedActual = runInContext(`(() => {
    Storage.addWorkOrder({ id: 'work-locked-a', customerName: 'A', scheduledDate: '2026-07-10', estimateAmount: 8000, status: 'completed', actualRevenueId: 'rev_x' });
    Storage.addWorkOrder({ id: 'work-other', customerName: 'B', scheduledDate: '2026-07-11', estimateAmount: 9000, status: 'tentative' });
    const beforeWo = JSON.stringify(Storage.getWorkOrders());
    const beforeRev = JSON.stringify(Storage.getRevenueRecords());
    const del = Storage.deleteWorkOrder('work-locked-a');
    return {
      del,
      woSame: JSON.stringify(Storage.getWorkOrders()) === beforeWo,
      revSame: JSON.stringify(Storage.getRevenueRecords()) === beforeRev
    };
  })()`, ctx);
  assert(lockedActual.del.ok === false && lockedActual.del.error === 'revenue_locked', 'actualRevenueId must block delete');
  assert(lockedActual.woSame && lockedActual.revSame, 'lock must not change work orders or revenues');

  resetStore();
  const lockedRef = runInContext(`(() => {
    Storage.addWorkOrder({ id: 'work-locked-b', customerName: 'C', scheduledDate: '2026-07-12', estimateAmount: 7000, status: 'tentative' });
    Storage.addRevenueRecord({ id: 'rev_ref', workDate: '2026-07-12', customerName: 'C', amount: 7000, status: '確定', sourceWorkOrderId: 'work-locked-b', paymentStatus: '未入金' });
    const beforeWo = JSON.stringify(Storage.getWorkOrders());
    const beforeRev = JSON.stringify(Storage.getRevenueRecords());
    const del = Storage.deleteWorkOrder('work-locked-b');
    return {
      del,
      woSame: JSON.stringify(Storage.getWorkOrders()) === beforeWo,
      revSame: JSON.stringify(Storage.getRevenueRecords()) === beforeRev
    };
  })()`, ctx);
  assert(lockedRef.del.ok === false && lockedRef.del.error === 'revenue_locked', 'sourceWorkOrderId revenue must block delete');
  assert(lockedRef.woSame && lockedRef.revSame, 'ref lock must not mutate records');
}

console.log('== C. related unlink ==');
{
  resetStore();
  const unlink = runInContext(`(() => {
    Storage.addWorkOrder({ id: 'work-keep2', customerName: '残', scheduledDate: '2026-07-22', estimateAmount: 10000, status: 'tentative' });
    Storage.addWorkOrder({ id: 'work-del2', customerName: '消', scheduledDate: '2026-07-23', estimateAmount: 11000, status: 'tentative' });
    Storage.addReceptionIntake({
      id: 'intake-1',
      customerName: '受付',
      status: 'work_scheduled',
      relatedWorkOrderId: 'work-del2',
      relatedWorkOrderIds: ['work-del2', 'work-keep2'],
      relatedLeadId: 'lead-1'
    });
    Storage.addReceptionIntake({
      id: 'intake-2',
      customerName: '単独',
      status: 'work_scheduled',
      relatedWorkOrderId: 'work-del2',
      relatedWorkOrderIds: ['work-del2'],
      relatedLeadId: 'lead-2'
    });
    Storage.addExpenseRecord({ id: 'exp-1', date: '2026-07-23', amount: 500, category: '交通・燃料', relatedWorkOrderId: 'work-del2' });
    Storage.addManualDailyTask({ id: 'task-1', title: '確認', workOrderId: 'work-del2', status: 'open' });
    const del = Storage.deleteWorkOrder('work-del2');
    const intake1 = Storage.getReceptionIntakes().find(i => i.id === 'intake-1');
    const intake2 = Storage.getReceptionIntakes().find(i => i.id === 'intake-2');
    const expense = Storage.getExpenseRecords().find(e => e.id === 'exp-1');
    const task = Storage.getDailyActionTasksData().manualTasks.find(t => t.id === 'task-1');
    return { del, intake1, intake2, expense, task, intakeCount: Storage.getReceptionIntakes().length };
  })()`, ctx);
  assert(unlink.del.ok === true, 'unlink delete should succeed');
  assert(unlink.intakeCount === 2, 'reception records must remain');
  assert(unlink.intake1.relatedWorkOrderIds.join(',') === 'work-keep2', 'only target id removed from reception ids');
  assert(unlink.intake1.relatedWorkOrderId === 'work-keep2', 'primary moves to remaining work order');
  assert(unlink.intake1.status === 'work_scheduled', 'status stays when other WO remains');
  assert(unlink.intake2.relatedWorkOrderIds.length === 0, 'solo reception loses WO ids');
  assert(unlink.intake2.status === 'lead_created', 'solo work_scheduled falls back to lead_created');
  assert(unlink.expense && unlink.expense.relatedWorkOrderId === '', 'expense unlinked not deleted');
  assert(unlink.task && unlink.task.workOrderId === '', 'manual task unlinked not deleted');
  assert(unlink.task.title === '確認', 'task body preserved');
}

console.log('== E/F. payment date defaults and canonical fields ==');
{
  const pending = runInContext(`(() => {
    const d1 = WorkCompletionBrain.getDefaultPaymentDateForCompletion('未入金', '2026-07-18', '2026-07-18');
    const d2 = WorkCompletionBrain.getDefaultPaymentDateForCompletion('未入金', '2026-12-15', '2026-07-18');
    const fields = WorkCompletionBrain.buildCompletionPaymentFields('未入金', d1, 15000);
    const payload = WorkCompletionBrain.createRevenuePayloadFromWorkOrder(
      { id: 'work-p', customerName: 'P', scheduledDate: '2026-07-18', estimateAmount: 15000, serviceText: 'エアコン通常', source: '直受け' },
      { workDate: '2026-07-18', customerName: 'P', actualService: 'エアコン通常', service: 'エアコン通常', source: '直受け', amount: 15000, paymentStatus: '未入金', paymentDate: d1 }
    );
    const normalized = RevenueBrain.normalizeRevenueRecord(payload);
    return { d1, d2, fields, payload, normalized };
  })()`, ctx);
  assert(pending.d1 === '2026-08-31', '2026-07-18 pending default must be 2026-08-31');
  assert(pending.d2 === '2027-01-31', '2026-12-15 pending default must be 2027-01-31');
  assert(pending.fields.expectedPaymentDate === '2026-08-31', 'pending fields expectedPaymentDate');
  assert(pending.fields.paidDate === '', 'pending fields paidDate empty');
  assert(pending.normalized.expectedPaymentDate === '2026-08-31', 'normalized pending keeps expectedPaymentDate');
  assert(!pending.normalized.paidDate, 'normalized pending paidDate empty');

  const paid = runInContext(`(() => {
    const d = WorkCompletionBrain.getDefaultPaymentDateForCompletion('入金済み', '2026-07-10', '2026-07-18');
    const fields = WorkCompletionBrain.buildCompletionPaymentFields('入金済み', d, 20000);
    const payload = WorkCompletionBrain.createRevenuePayloadFromWorkOrder(
      { id: 'work-paid', customerName: 'Q', scheduledDate: '2026-07-10', estimateAmount: 20000, serviceText: 'エアコン通常', source: '直受け' },
      { workDate: '2026-07-10', customerName: 'Q', actualService: 'エアコン通常', service: 'エアコン通常', source: '直受け', amount: 20000, paymentStatus: '入金済み', paymentDate: d }
    );
    const normalized = RevenueBrain.normalizeRevenueRecord(payload);
    return { d, fields, payload, normalized };
  })()`, ctx);
  assert(paid.d === '2026-07-18', 'paid default must use provided today');
  assert(paid.fields.paidDate === '2026-07-18', 'paid fields paidDate');
  assert(paid.fields.expectedPaymentDate === '', 'paid fields expectedPaymentDate empty');
  assert(paid.fields.paidAmount === 20000 && paid.fields.unpaidAmount === 0, 'paid amounts');
  assert(paid.normalized.paidDate === '2026-07-18', 'normalized paid keeps paidDate');
  assert(!paid.normalized.expectedPaymentDate, 'normalized paid expectedPaymentDate empty');
}

console.log('== G. manual date kept ==');
{
  const manual = runInContext(`(() => {
    const fields = WorkCompletionBrain.buildCompletionPaymentFields('未入金', '2026-08-15', 9000);
    const defaults = WorkCompletionBrain.buildCompletionFormDefaults(
      { id: 'work-m', customerName: 'M', scheduledDate: '2026-07-18', estimateAmount: 9000, serviceText: 'エアコン通常', source: '直受け' },
      { today: '2026-07-18' }
    );
    return { fields, defaults };
  })()`, ctx);
  assert(manual.fields.expectedPaymentDate === '2026-08-15', 'manual non-month-end date must save');
  assert(manual.defaults.paymentDate === '2026-08-31', 'defaults still auto next month end');
  assert(appJs.includes("dataset.manualPaymentDate"), 'app tracks manual payment date');
  assert(appJs.includes('syncWorkCompletionPaymentDateUi'), 'status change updates payment date UI');
  assert(appJs.includes('applyWorkCompletionPaymentDateForWorkDateChange'), 'work date change helper required');
  const methodHandler = appJs.match(/work-completion-payment-method'\)\?\.addEventListener\('change'[\s\S]*?\}\);/);
  assert(methodHandler, 'payment method change handler must exist');
  assert(!methodHandler[0].includes('payment-date'), 'payment method change must not rewrite payment date');
}

console.log('== H. canonical invariants ==');
{
  const rates = runInContext(`(() => ([
    RevenueBrain.getSourceProfitRate('直受け'),
    RevenueBrain.getSourceProfitRate('コープ'),
    RevenueBrain.getSourceProfitRate('ヤマダ'),
    RevenueBrain.getSourceProfitRate('')
  ]))()`, ctx);
  assert(rates[0].rate === 100 && rates[0].reviewRequired === false, 'direct 100%');
  assert(rates[1].rate === 80, 'coop 80%');
  assert(rates[2].rate === 60, 'yamada 60%');
  assert(rates[3].rate === 0 && rates[3].reviewRequired === true, 'unknown 0%+review');
  assert(!storageJs.includes('budil_work_order_delete'), 'no new storage key for delete');
  assert(!appJs.includes('localStorage.setItem(\'workCompletion'), 'no UI state persistence for payment date');
  assert(!completionJs.includes('record.source ='), 'completion brain must not rewrite record.source');
  assert(storageJs.includes("KEYS.WORK_ORDERS"), 'work order key unchanged');
}

console.log('\nAll v4.12.17 work-order-delete-payment-date checks passed.');
