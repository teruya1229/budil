/**
 * Budil v4.12.24 - work order delete: exception safety + partial-update prevention.
 *
 * Symptom investigated: pressing "Budilから予定を削除" appeared to do nothing.
 * Non-destructive browser diagnosis on the public URL (v4.12.23) confirmed the
 * confirm() dialog fires correctly on click (hypothesis A ruled out), and a
 * clean local delete (confirm -> delete -> redraw -> toast) completed with no
 * console error either. The one confirmed architectural weakness found by code
 * review is: Storage.deleteWorkOrder() had no exception handling around its
 * localStorage writes, and deleteWorkOrderFromForm() had no try/catch around
 * the Storage.deleteWorkOrder() call. If any write in the multi-step delete
 * (safety backup, unlink reception/expense/tasks, save) throws - e.g.
 * QuotaExceededError - the exception would propagate silently: no user
 * feedback, and (worse) related records could already be unlinked before the
 * work order itself is actually removed, leaving a corrupted in-between state.
 *
 * This verify locks in the fix: the work order save now happens first (right
 * after the safety backup) and is wrapped in try/catch so a failure there
 * changes nothing and reports save_failed; unlink steps run only afterward and
 * are individually best-effort so a failure there cannot undo/prevent the
 * already-completed deletion; the UI layer never shows a success message on
 * failure and always tells the user why nothing was saved.
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

console.log('== v4.12.24 work-order-delete exception safety ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

console.log('== version / cache buster ==');
assert(indexHtml.includes('v4.12.24'), 'index.html should show v4.12.24');
assert(indexHtml.includes('js/app.js?v=4.12.24'), 'app.js cache buster should be v4.12.24');
assert(indexHtml.includes('js/storage.js?v=4.12.24'), 'storage cache buster should be v4.12.24');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.24'"), 'storage version should be v4.12.24');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.24'"), 'data-backup version should be v4.12.24');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.12.24'"), 'verify-current EXPECTED_VERSION should be v4.12.24');
assert(!indexHtml.includes('?v=4.12.23'), 'old cache buster v4.12.23 should be gone');
assert(statusMd.includes('v4.12.24'), 'status.md should document v4.12.24');
assert(handoffMd.includes('v4.12.24'), 'handoff.md should document v4.12.24');
assert(decisionLog.includes('v4.12.24'), 'decision-log.md should record v4.12.24');

console.log('== UI wiring: delete button + one-shot click handler ==');
assert(indexHtml.includes('id="btn-work-order-delete"'), 'delete button required');
assert(appJs.includes('function deleteWorkOrderFromForm'), 'delete handler required');
assert(appJs.includes('Storage.deleteWorkOrder'), 'delete must call Storage.deleteWorkOrder');
{
  const registrations = appJs.match(/addEventListener\('click', deleteWorkOrderFromForm\)/g) || [];
  assert(registrations.length === 1, 'delete click handler must be registered exactly once (not re-bound per render)');
}
{
  const fn = appJs.match(/function deleteWorkOrderFromForm\(\)[\s\S]*?\r?\n  \}\r?\n/);
  assert(fn, 'deleteWorkOrderFromForm body must be extractable');
  const body = fn[0];
  assert(/const ok = confirm\(/.test(body), 'must confirm before any deletion');
  assert(/if \(!ok\) return;/.test(body), 'cancel must return before calling Storage.deleteWorkOrder (no save on cancel)');
  const confirmIdx = body.indexOf('if (!ok) return;');
  const callIdx = body.indexOf('Storage.deleteWorkOrder(id)');
  assert(confirmIdx > -1 && callIdx > confirmIdx, 'Storage.deleteWorkOrder must be called only after the cancel-return check');
  assert(/try\s*\{\s*result = Storage\.deleteWorkOrder\(id\);\s*\}\s*catch/.test(body), 'Storage.deleteWorkOrder call must be wrapped in try/catch');
  assert(body.includes("result.error === 'save_failed'"), 'must branch on save_failed');
  const saveFailedIdx = body.indexOf("result.error === 'save_failed'");
  const toastIdx = body.indexOf('showAppToast(');
  assert(saveFailedIdx > -1 && toastIdx > -1 && saveFailedIdx < toastIdx, 'save_failed branch must be checked before the success toast is ever reached');
}

function createSandbox() {
  const store = Object.create(null);
  const state = { failKeys: new Set() };
  const localStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      if (state.failKeys.has(key)) {
        const err = new Error('QuotaExceededError: simulated storage write failure');
        err.name = 'QuotaExceededError';
        throw err;
      }
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
    Error,
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
  return { ctx, store, state };
}

console.log('== A. delete one work order (baseline, still works) ==');
{
  const { ctx } = createSandbox();
  const result = runInContext(`(() => {
    Storage.addWorkOrder({ id: 'work-keep', customerName: '残す予定', scheduledDate: '2026-08-20', estimateAmount: 10000, status: 'tentative' });
    Storage.addWorkOrder({ id: 'work-del', customerName: '消す予定', scheduledDate: '2026-08-21', estimateAmount: 12000, status: 'tentative' });
    const del = Storage.deleteWorkOrder('work-del');
    const list = Storage.getWorkOrders();
    return { del, after: list.length, ids: list.map(w => w.id).sort() };
  })()`, ctx);
  assert(result.del.ok === true, 'delete should succeed');
  assert(result.after === 1, 'exactly one work order removed');
  assert(result.ids[0] === 'work-keep', 'only target deleted');
  assert(Array.isArray(result.del.unlinkErrors) && result.del.unlinkErrors.length === 0, 'no unlink errors expected in the happy path');
}

console.log('== B. save_failed: exception on the primary work-order write ==');
{
  const { ctx, state } = createSandbox();
  runInContext(`(() => {
    Storage.addWorkOrder({ id: 'work-a', customerName: 'A', scheduledDate: '2026-08-10', estimateAmount: 8000, status: 'tentative' });
    Storage.addReceptionIntake({ id: 'intake-a', customerName: 'A', status: 'work_scheduled', relatedWorkOrderId: 'work-a', relatedWorkOrderIds: ['work-a'] });
  })()`, ctx);
  state.failKeys.add('budil_work_orders');
  const result = runInContext(`(() => {
    const beforeWo = JSON.stringify(Storage.getWorkOrders());
    const beforeIntake = JSON.stringify(Storage.getReceptionIntakes());
    const del = Storage.deleteWorkOrder('work-a');
    return {
      del,
      woUnchanged: JSON.stringify(Storage.getWorkOrders()) === beforeWo,
      intakeUnchanged: JSON.stringify(Storage.getReceptionIntakes()) === beforeIntake
    };
  })()`, ctx);
  assert(result.del.ok === false, 'quota-exceeded style write failure must not report success');
  assert(result.del.error === 'save_failed', 'error code must be save_failed');
  assert(result.woUnchanged, 'work order list must be unchanged when the primary write fails');
  assert(result.intakeUnchanged, 'reception intake must NOT be unlinked when the primary write never completed (no partial update)');
}

console.log('== C. partial-update prevention: unlink step fails AFTER the work order is already deleted ==');
{
  const { ctx, state } = createSandbox();
  runInContext(`(() => {
    Storage.addWorkOrder({ id: 'work-b', customerName: 'B', scheduledDate: '2026-08-11', estimateAmount: 9000, status: 'tentative' });
    Storage.addReceptionIntake({ id: 'intake-b', customerName: 'B', status: 'work_scheduled', relatedWorkOrderId: 'work-b', relatedWorkOrderIds: ['work-b'] });
  })()`, ctx);
  state.failKeys.add('budil_reception_intakes');
  const result = runInContext(`(() => {
    const del = Storage.deleteWorkOrder('work-b');
    const list = Storage.getWorkOrders();
    const intake = Storage.getReceptionIntakes().find(i => i.id === 'intake-b');
    return { del, remaining: list.map(w => w.id), intake };
  })()`, ctx);
  assert(result.del.ok === true, 'work order deletion must still succeed even though a later unlink step failed');
  assert(!result.remaining.includes('work-b'), 'target work order must actually be gone');
  assert(Array.isArray(result.del.unlinkErrors) && result.del.unlinkErrors.some(e => e.step === 'reception'), 'unlink failure must be recorded, not swallowed silently');
  assert(result.intake && result.intake.relatedWorkOrderId === 'work-b', 'when unlink write fails, reception record is left as-is (not half-updated)');
}

console.log('== D. revenue lock still holds (unchanged) ==');
{
  const { ctx } = createSandbox();
  const lockedActual = runInContext(`(() => {
    Storage.addWorkOrder({ id: 'work-locked', customerName: 'C', scheduledDate: '2026-08-12', estimateAmount: 8000, status: 'completed', actualRevenueId: 'rev_x' });
    const beforeWo = JSON.stringify(Storage.getWorkOrders());
    const del = Storage.deleteWorkOrder('work-locked');
    return { del, woSame: JSON.stringify(Storage.getWorkOrders()) === beforeWo };
  })()`, ctx);
  assert(lockedActual.del.ok === false && lockedActual.del.error === 'revenue_locked', 'actualRevenueId must still block delete');
  assert(lockedActual.woSame, 'locked delete must not change work orders');
}

console.log('== E. related unlink still moves references, never deletes reception/expense/task records ==');
{
  const { ctx } = createSandbox();
  const unlink = runInContext(`(() => {
    Storage.addWorkOrder({ id: 'work-del2', customerName: '消', scheduledDate: '2026-08-23', estimateAmount: 11000, status: 'tentative' });
    Storage.addExpenseRecord({ id: 'exp-1', date: '2026-08-23', amount: 500, category: '交通・燃料', relatedWorkOrderId: 'work-del2' });
    Storage.addManualDailyTask({ id: 'task-1', title: '確認', workOrderId: 'work-del2', status: 'open' });
    const del = Storage.deleteWorkOrder('work-del2');
    const expense = Storage.getExpenseRecords().find(e => e.id === 'exp-1');
    const task = Storage.getDailyActionTasksData().manualTasks.find(t => t.id === 'task-1');
    return { del, expense, task };
  })()`, ctx);
  assert(unlink.del.ok === true, 'delete should succeed');
  assert(unlink.expense && unlink.expense.relatedWorkOrderId === '', 'expense unlinked not deleted');
  assert(unlink.task && unlink.task.workOrderId === '', 'manual task unlinked not deleted');
  assert(unlink.task.title === '確認', 'task body preserved');
}

console.log('== F. no unrelated spec changes ==');
{
  assert(!storageJs.includes('budil_work_order_delete'), 'no new storage key for delete');
  assert(storageJs.includes('KEYS.WORK_ORDERS'), 'work order key unchanged');
  assert(appJs.includes('Googleカレンダーの予定は削除されません'), 'confirm must still mention calendar not deleted');
  assert(appJs.includes('Budilの作業予定を削除しました。Googleカレンダーは変更していません。'), 'success toast unchanged');
  assert(!appJs.includes('localStorage.clear()'), 'localStorage.clear must not be introduced');
}

console.log('\nAll v4.12.24 work-order-delete exception safety checks passed.');
