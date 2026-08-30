/**
 * Budil v4.12.25 - work order delete: safety-backup capacity safety.
 *
 * Symptom investigated (real public v4.12.24 data): pressing
 * "Budilから予定を削除" on the public site shows
 * "保存に失敗したため、作業予定を削除できませんでした..." and the work
 * order is not deleted. The v4.12.24 exception handling itself worked
 * correctly (it caught the write failure and reported it instead of
 * failing silently); this verify targets the save failure itself.
 *
 * Real-data diagnosis (public URL, key names / byte sizes only, no
 * customer content read or logged):
 * - budil_work_orders alone was ~840KB for 11 records (avg ~76KB/record,
 *   dominated by a single field, candidateMeta).
 * - Storage.deleteWorkOrder()'s safety backup previously cloned the ENTIRE
 *   work-order list (`data: beforeWorkOrders`) into budil_safety_backups on
 *   every delete. With SAFETY_BACKUP_LIMIT=30, repeated deletes/failed
 *   attempts could accumulate up to 30 full-list clones in
 *   budil_safety_backups, multiplying an already-large per-record payload
 *   until the origin's localStorage write quota is exceeded.
 * - No production evidence of QuotaExceededError was found in this
 *   browser profile's budil_operation_logs (empty for delete_work_order),
 *   and budil_safety_backups was small (837 bytes / 1 unrelated entry) at
 *   diagnosis time, so the exact real exception name/message could not be
 *   confirmed without altering real data. Per instructions, the capacity
 *   ceiling is instead reproduced here with local fixture data only.
 *
 * Fix (minimal): the per-delete safety backup now stores only the single
 * deleted work order + its original array index (enough to restore that
 * one record), never the full list. If saving the safety-backup list still
 * fails (capacity exceeded), the oldest backups are dropped one at a time
 * and the save is retried, keeping the SAFETY_BACKUP_LIMIT policy and never
 * clearing all backups at once. If even the single newest backup cannot be
 * saved, the work order is not deleted and save_failed is reported (no
 * partial update, no false success).
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

console.log('== v4.12.25 work-order-delete safety-backup capacity ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

console.log('== version / cache buster ==');
assert(indexHtml.includes('v4.13.13'), 'index.html should show v4.12.26');
assert(indexHtml.includes('js/app.js?v=4.13.13'), 'app.js cache buster should be v4.13.13');
assert(indexHtml.includes('js/storage.js?v=4.13.13'), 'storage cache buster should be v4.13.13');
assert(storageJs.includes("BUDIL_VERSION: 'v4.13.13'"), 'storage version should be v4.13.13');
assert(dataBackupJs.includes("APP_VERSION: 'v4.13.13'"), 'data-backup version should be v4.13.13');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.13'"), 'verify-current EXPECTED_VERSION should be v4.13.13');
assert(!indexHtml.includes('?v=4.12.24'), 'old cache buster v4.12.24 should be gone');
assert(statusMd.includes('v4.12.25'), 'status.md should document v4.12.25');
assert(handoffMd.includes('v4.12.25'), 'handoff.md should document v4.12.25');
assert(decisionLog.includes('v4.12.25'), 'decision-log.md should record v4.12.25');

console.log('== static: backup no longer clones the whole work-order list ==');
{
  const fn = storageJs.match(/deleteWorkOrder\(id\) \{[\s\S]*?\n  \},\r?\n\r?\n  getExpenseRecords/);
  assert(fn, 'deleteWorkOrder body must be extractable');
  const body = fn[0];
  assert(!/data:\s*beforeWorkOrders\b/.test(body), 'must not pass the full beforeWorkOrders array as backup data');
  assert(/data:\s*\{\s*deletedWorkOrder:\s*target,\s*index:\s*targetIndex\s*\}/.test(body), 'backup data must be a compact single-item object');
}
{
  assert(/saveSafetyBackups\(list\)\s*\{[\s\S]*?attempt\.length <= 1[\s\S]*?throw err;/.test(storageJs), 'saveSafetyBackups must retry by trimming and rethrow when nothing more can be dropped');
  assert(!/localStorage\.clear\(\)/.test(storageJs), 'localStorage.clear must not be introduced');
  assert(storageJs.includes('SAFETY_BACKUP_LIMIT: 30'), 'SAFETY_BACKUP_LIMIT policy unchanged');
}

function createSandbox() {
  const store = Object.create(null);
  const state = { failKeys: new Set(), maxEntriesByKey: new Map(), setItemCalls: new Map() };
  const localStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      state.setItemCalls.set(key, (state.setItemCalls.get(key) || 0) + 1);
      if (state.failKeys.has(key)) {
        const err = new Error('QuotaExceededError: simulated storage write failure');
        err.name = 'QuotaExceededError';
        throw err;
      }
      const maxEntries = state.maxEntriesByKey.get(key);
      if (maxEntries != null) {
        let count = null;
        try {
          const parsed = JSON.parse(value);
          count = Array.isArray(parsed) ? parsed.length : null;
        } catch { /* not a JSON array, no entry-count limit applies */ }
        if (count != null && count > maxEntries) {
          const err = new Error('QuotaExceededError: simulated storage capacity exceeded');
          err.name = 'QuotaExceededError';
          throw err;
        }
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

console.log('== A. compact backup: no full-list clone, restorable single-item info kept ==');
{
  const { ctx } = createSandbox();
  const result = runInContext(`(() => {
    Storage.addWorkOrder({ id: 'work-1', customerName: '予定1', scheduledDate: '2026-08-20', estimateAmount: 10000, status: 'tentative' });
    Storage.addWorkOrder({ id: 'work-2', customerName: '予定2', scheduledDate: '2026-08-21', estimateAmount: 12000, status: 'tentative' });
    Storage.addWorkOrder({ id: 'work-3', customerName: '予定3', scheduledDate: '2026-08-22', estimateAmount: 9000, status: 'tentative' });
    const beforeIds = Storage.getWorkOrders().map(w => w.id);
    const del = Storage.deleteWorkOrder('work-2');
    const backups = Storage.getSafetyBackups();
    const list = Storage.getWorkOrders();
    return { del, backups, beforeIds, afterIds: list.map(w => w.id) };
  })()`, ctx);
  assert(result.del.ok === true, 'delete should succeed');
  assert(!result.afterIds.includes('work-2') && result.afterIds.includes('work-1') && result.afterIds.includes('work-3'), 'only the target must be removed');
  const b = result.backups[0];
  assert(b && b.reason === 'before_delete_work_order' && b.targetKey === 'budil_work_orders' && b.targetId === 'work-2', 'newest backup must describe this delete');
  assert(!Array.isArray(b.data), 'backup data must not be the whole work-order array');
  assert(b.data && b.data.deletedWorkOrder && b.data.deletedWorkOrder.id === 'work-2', 'backup must retain the deleted record for restore');
  assert(typeof b.data.index === 'number' && result.beforeIds[b.data.index] === 'work-2', 'backup must retain the original position for restore');
  const serialized = JSON.stringify(b.data);
  assert(!serialized.includes('work-1') && !serialized.includes('work-3'), 'backup must not carry other work orders (no full-list clone)');
}

console.log('== B. capacity exceeded: oldest backups trimmed minimally, newest backup always kept ==');
{
  const { ctx, store, state } = createSandbox();
  runInContext(`(() => {
    for (let i = 1; i <= 5; i++) {
      Storage.createSafetyBackup({ reason: 'old_dummy_' + i, targetKey: 'budil_revenue_records', targetId: 'dummy-' + i, data: { pad: 'x' } });
    }
    Storage.addWorkOrder({ id: 'work-cap', customerName: '容量テスト', scheduledDate: '2026-08-25', estimateAmount: 7000, status: 'tentative' });
    Storage.addWorkOrder({ id: 'work-keep', customerName: '残す', scheduledDate: '2026-08-26', estimateAmount: 5000, status: 'tentative' });
  })()`, ctx);
  assert(JSON.parse(store['budil_safety_backups']).length === 5, 'setup must create exactly 5 pre-existing backups');
  state.maxEntriesByKey.set('budil_safety_backups', 3);
  const result = runInContext(`(() => {
    const del = Storage.deleteWorkOrder('work-cap');
    const backups = Storage.getSafetyBackups();
    const workOrders = Storage.getWorkOrders();
    return { del, backups, workOrderIds: workOrders.map(w => w.id) };
  })()`, ctx);
  assert(result.del.ok === true, 'delete must still succeed once the backup list fits under the capacity ceiling');
  assert(!result.workOrderIds.includes('work-cap') && result.workOrderIds.includes('work-keep'), 'only the target work order must be removed');
  assert(result.backups.length === 3, 'backup list must be trimmed down to exactly the capacity ceiling, not wiped');
  assert(result.backups[0].reason === 'before_delete_work_order' && result.backups[0].targetId === 'work-cap', 'the newest backup must always be kept');
  assert(result.backups.some((b) => b.reason === 'old_dummy_5'), 'at least one older backup must survive (trimming is minimal, not all-at-once)');
  assert(!result.backups.some((b) => b.reason === 'old_dummy_1'), 'the oldest backups must be the ones dropped first');
  const attempts = state.setItemCalls.get('budil_safety_backups') || 0;
  assert(attempts >= 3, 'saving must have retried more than once (iterative trim), not a single all-or-nothing write');
}

console.log('== C. backup cannot be saved even once: work order is NOT deleted, no partial update ==');
{
  const { ctx, store, state } = createSandbox();
  runInContext(`(() => {
    Storage.addWorkOrder({ id: 'work-nospace', customerName: '容量なし', scheduledDate: '2026-08-27', estimateAmount: 6000, status: 'tentative' });
    Storage.addReceptionIntake({ id: 'intake-nospace', customerName: '容量なし', status: 'work_scheduled', relatedWorkOrderId: 'work-nospace', relatedWorkOrderIds: ['work-nospace'] });
  })()`, ctx);
  const beforeWo = store['budil_work_orders'];
  const hadBackupsBefore = Object.prototype.hasOwnProperty.call(store, 'budil_safety_backups');
  state.maxEntriesByKey.set('budil_safety_backups', 0);
  const result = runInContext(`(() => {
    const beforeIntake = JSON.stringify(Storage.getReceptionIntakes());
    const del = Storage.deleteWorkOrder('work-nospace');
    return { del, intakeUnchanged: JSON.stringify(Storage.getReceptionIntakes()) === beforeIntake };
  })()`, ctx);
  assert(result.del.ok === false, 'must not report success when even the newest backup cannot be saved');
  assert(result.del.error === 'save_failed', 'error code must be save_failed');
  assert(store['budil_work_orders'] === beforeWo, 'work order list must be byte-for-byte unchanged (no partial update)');
  assert(Object.prototype.hasOwnProperty.call(store, 'budil_safety_backups') === hadBackupsBefore, 'safety backups must be unchanged (no half-written backup persisted)');
  assert(result.intakeUnchanged, 'related reception must NOT be unlinked when the work order itself was never actually deleted');
}

console.log('== D. success vs save_failed are clearly distinguished ==');
{
  const { ctx, state } = createSandbox();
  runInContext(`Storage.addWorkOrder({ id: 'work-ok', customerName: 'OK', scheduledDate: '2026-08-28', estimateAmount: 4000, status: 'tentative' });`, ctx);
  const ok = runInContext(`Storage.deleteWorkOrder('work-ok')`, ctx);
  assert(ok.ok === true && ok.error === undefined, 'a normal delete must report ok:true with no error code');

  runInContext(`Storage.addWorkOrder({ id: 'work-fail', customerName: 'FAIL', scheduledDate: '2026-08-29', estimateAmount: 4000, status: 'tentative' });`, ctx);
  state.failKeys.add('budil_work_orders');
  const failed = runInContext(`Storage.deleteWorkOrder('work-fail')`, ctx);
  assert(failed.ok === false && failed.error === 'save_failed', 'a failed delete must report ok:false with error save_failed');
}

console.log('== E. revenue-confirmed work orders still cannot be deleted ==');
{
  const { ctx } = createSandbox();
  const locked = runInContext(`(() => {
    Storage.addWorkOrder({ id: 'work-locked', customerName: 'D', scheduledDate: '2026-08-12', estimateAmount: 8000, status: 'completed', actualRevenueId: 'rev_x' });
    const beforeWo = JSON.stringify(Storage.getWorkOrders());
    const del = Storage.deleteWorkOrder('work-locked');
    return { del, woSame: JSON.stringify(Storage.getWorkOrders()) === beforeWo };
  })()`, ctx);
  assert(locked.del.ok === false && locked.del.error === 'revenue_locked', 'actualRevenueId must still block delete');
  assert(locked.woSame, 'locked delete must not change work orders');
}

console.log('== F. related unlink still moves references, never deletes reception/expense/task records ==');
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
}

console.log('== G. no unrelated spec changes ==');
{
  assert(!storageJs.includes('budil_work_order_delete'), 'no new storage key for delete');
  assert(storageJs.includes('KEYS.WORK_ORDERS'), 'work order key unchanged');
  assert(storageJs.includes("SAFETY_BACKUPS: 'budil_safety_backups'"), 'safety backup key unchanged');
  assert(appJs.includes('Googleカレンダーの予定は削除されません'), 'confirm must still mention calendar not deleted');
  assert(appJs.includes('Budilの作業予定を削除しました。Googleカレンダーは変更していません。'), 'success toast unchanged');
  assert(!appJs.includes('localStorage.clear()'), 'localStorage.clear must not be introduced in app.js');
  assert(!/gapi|calendar\.google|fetch\(/.test(storageJs.match(/deleteWorkOrder\(id\) \{[\s\S]*?\n  \},\r?\n\r?\n  getExpenseRecords/)[0]), 'deleteWorkOrder must not touch Google Calendar');
}

console.log('\nAll v4.12.25 work-order-delete safety-backup capacity checks passed.');
