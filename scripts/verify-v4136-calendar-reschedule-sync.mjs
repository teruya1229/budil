/**
 * Budil v4.13.7 - calendar schedule reschedule sync + manual date edit verify
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const { createContext, runInContext } = vm;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (file) => readFileSync(join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

const html = load('index.html');
const app = load('js/app.js');
const brainJs = load('js/calendar-candidate-brain.js');
const storageJs = load('js/storage.js');
const workOrderBrainJs = load('js/work-order-brain.js');
const dataBackup = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');

for (const file of ['js/app.js', 'js/storage.js', 'js/calendar-candidate-brain.js', 'js/work-order-brain.js']) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
}

console.log('== version / cache buster ==');
assert(html.includes('Budil v4.13.11'), 'index.html shows Budil v4.13.11');
assert(html.includes('js/app.js?v=4.13.11'), 'app.js cache buster is v4.13.11');
assert(storageJs.includes("BUDIL_VERSION: 'v4.13.11'"), 'storage version is v4.13.11');
assert(dataBackup.includes("APP_VERSION: 'v4.13.11'"), 'data-backup version is v4.13.11');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.11'"), 'verify-current pins v4.13.11');
assert(
  /^verify-v4(10|11|12|13)\d.*\.mjs$/.test('verify-v4136-calendar-reschedule-sync.mjs'),
  'new verify is discoverable by current pattern'
);

console.log('== UI wiring ==');
assert(html.includes('id="work-order-manual-entry-summary"'), 'manual entry summary id exists');
assert(app.includes('日付・時間を編集'), 'saved card edit button label exists');
assert(app.includes('function openCalendarSavedWorkOrderScheduleEditor('), 'editor opener exists');
assert(app.includes('function syncWorkOrderManualEntrySummary('), 'summary sync exists');
assert(app.includes('作業予定を編集'), 'edit heading text exists');
assert(app.includes('作業予定を更新しました'), 'update toast exists');
assert(app.includes('linkedDedupeKeys'), 'local API sends linked dedupe keys');
assert(app.includes('syncWorkOrderScheduleFromCalendar'), 'storage sync helper used');
assert(!app.includes('localStorage.clear'), 'localStorage.clear forbidden');

console.log('== brain / storage helpers ==');
assert(brainJs.includes('classifyStableCalendarImportItem'), 'stable import classifier exists');
assert(brainJs.includes('formatScheduleUpdatePreviewText'), 'schedule preview formatter exists');
assert(storageJs.includes('syncWorkOrderScheduleFromCalendar'), 'storage schedule sync exists');
assert(storageJs.includes('before_sync_work_order_schedule'), 'schedule sync safety backup reason exists');

function makeStore(seed = {}) {
  const data = { ...seed };
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; },
    key(i) { return Object.keys(data)[i] || null; },
    get length() { return Object.keys(data).length; }
  };
}

function createSandbox(seed = {}) {
  const localStorage = makeStore({
    budil_work_orders: JSON.stringify(seed.budil_work_orders || []),
    budil_revenue_records: JSON.stringify(seed.budil_revenue_records || []),
    budil_safety_backups: JSON.stringify(seed.budil_safety_backups || []),
    budil_operation_logs: JSON.stringify(seed.budil_operation_logs || []),
    budil_migrated_v2: '1'
  });
  const ctx = createContext({
    localStorage,
    console,
    Date,
    JSON,
    Math,
    Number,
    String,
    Array,
    Object,
    Boolean,
    RegExp,
    parseInt,
    isNaN,
    MapBrain: { detectAreaFromAddress: () => '' },
    ReceptionBrain: { matchRevenueSource: (v) => v, matchRevenueService: (v) => v },
    RevenueBrain: { getDefaultGrossProfitRateBySource: () => null }
  });
  runInContext(workOrderBrainJs, ctx, { filename: 'work-order-brain.js' });
  runInContext(brainJs, ctx, { filename: 'calendar-candidate-brain.js' });
  runInContext(storageJs, ctx, { filename: 'storage.js' });
  return ctx;
}

function baseWorkOrder(overrides = {}) {
  return {
    id: 'wo-test-1',
    customerName: 'テスト様',
    serviceText: 'エアコンクリーニング',
    scheduledDate: '2026-08-27',
    startTime: '10:00',
    endTime: '13:00',
    estimateAmount: 15000,
    status: 'tentative',
    calendarDedupeKey: 'google_calendar|primary|evt-reschedule-1',
    candidateMeta: {
      importSource: 'browser-bantou-calendar',
      sourceType: 'calendar_candidate',
      candidateStatus: '作業予定に追加済み',
      confirmedRevenue: false
    },
    intakeId: 'intake-1',
    leadId: 'lead-1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides
  };
}

function candidateFrom(wo, patch = {}) {
  return {
    scheduledDate: wo.scheduledDate,
    startTime: wo.startTime,
    endTime: wo.endTime,
    customerName: wo.customerName,
    serviceText: wo.serviceText,
    estimateAmount: wo.estimateAmount,
    calendarDedupeKey: wo.calendarDedupeKey,
    ...patch
  };
}

console.log('== 1. same stable key moved to today keeps id ==');
{
  const ctx = createSandbox({ budil_work_orders: [baseWorkOrder()] });
  const result = runInContext(`(() => {
    const preview = CalendarCandidateBrain.buildImportPreview({
      candidates: [{
        scheduledDate: '2026-08-19',
        startTime: '09:00',
        endTime: '12:00',
        customerName: 'テスト様',
        serviceText: 'エアコンクリーニング',
        estimateAmount: 15000,
        calendarDedupeKey: 'google_calendar|primary|evt-reschedule-1'
      }]
    }, Storage.getWorkOrders(), { revenues: [] });
    const sync = Storage.syncWorkOrderScheduleFromCalendar(
      'wo-test-1',
      'google_calendar|primary|evt-reschedule-1',
      { scheduledDate: '2026-08-19', startTime: '09:00', endTime: '12:00' }
    );
    return {
      importKind: preview.items[0].importKind,
      sync,
      after: Storage.getWorkOrders(),
      revenueCount: Storage.getRevenueRecords().length
    };
  })()`, ctx);
  assert(result.importKind === 'schedule-update', 'reschedule classified as schedule-update');
  assert(result.sync.ok && !result.sync.unchanged, 'schedule sync succeeds');
  assert(result.after.length === 1, 'work order count unchanged');
  assert(result.after[0].id === 'wo-test-1', 'work order id unchanged');
  assert(result.after[0].scheduledDate === '2026-08-19', 'date updated');
  assert(result.after[0].estimateAmount === 15000, 'amount preserved');
  assert(result.revenueCount === 0, 'no revenue auto-created');
}

console.log('== 2. future to past shows in revenue queue logic (date only) ==');
{
  const ctx = createSandbox({ budil_work_orders: [baseWorkOrder()] });
  const result = runInContext(`(() => {
    Storage.syncWorkOrderScheduleFromCalendar(
      'wo-test-1',
      'google_calendar|primary|evt-reschedule-1',
      { scheduledDate: '2026-08-19', startTime: '10:00', endTime: '13:00' }
    );
    return Storage.getWorkOrders()[0];
  })()`, ctx);
  assert(result.scheduledDate <= '2026-08-19', 'moved to today or earlier');
}

console.log('== 3. time-only change ==');
{
  const ctx = createSandbox({ budil_work_orders: [baseWorkOrder()] });
  const wo = runInContext(`(() => {
    Storage.syncWorkOrderScheduleFromCalendar(
      'wo-test-1',
      'google_calendar|primary|evt-reschedule-1',
      { scheduledDate: '2026-08-27', startTime: '11:00', endTime: '14:00' }
    );
    return Storage.getWorkOrders()[0];
  })()`, ctx);
  assert(wo.scheduledDate === '2026-08-27', 'date unchanged');
  assert(wo.startTime === '11:00' && wo.endTime === '14:00', 'time updated');
}

console.log('== 4. unchanged reload ==');
{
  const ctx = createSandbox({ budil_work_orders: [baseWorkOrder()] });
  const result = runInContext(`(() => {
    const beforeUpdatedAt = Storage.getWorkOrders()[0].updatedAt;
    const backupsBefore = Storage.getSafetyBackups().length;
    const sync = Storage.syncWorkOrderScheduleFromCalendar(
      'wo-test-1',
      'google_calendar|primary|evt-reschedule-1',
      { scheduledDate: '2026-08-27', startTime: '10:00', endTime: '13:00' }
    );
    return {
      sync,
      beforeUpdatedAt,
      afterUpdatedAt: Storage.getWorkOrders()[0].updatedAt,
      backupsAfter: Storage.getSafetyBackups().length,
      backupsBefore
    };
  })()`, ctx);
  assert(result.sync.ok && result.sync.unchanged, 'unchanged sync returns unchanged');
  assert(result.afterUpdatedAt === result.beforeUpdatedAt, 'updatedAt unchanged');
  assert(result.backupsAfter === result.backupsBefore, 'no extra safety backup');
}

console.log('== 5. different event id stays new/duplicate path ==');
{
  const ctx = createSandbox({ budil_work_orders: [baseWorkOrder()] });
  const importKind = runInContext(`(() => {
    const preview = CalendarCandidateBrain.buildImportPreview({
      candidates: [{
        scheduledDate: '2026-08-19',
        startTime: '09:00',
        endTime: '12:00',
        customerName: 'テスト様',
        serviceText: 'エアコンクリーニング',
        estimateAmount: 15000,
        calendarDedupeKey: 'google_calendar|primary|evt-other'
      }]
    }, Storage.getWorkOrders(), { revenues: [] });
    return preview.items[0].importKind;
  })()`, ctx);
  assert(importKind !== 'schedule-update', 'other event id is not schedule-update');
}

console.log('== 6. legacy exact duplicate stays duplicate ==');
{
  const ctx = createSandbox({
    budil_work_orders: [baseWorkOrder({
      calendarDedupeKey: 'calendar-past-recovery|2026-08-27|test|15000|svc|src|10:00|13:00'
    })]
  });
  const isDuplicate = runInContext(`(() => {
    const preview = CalendarCandidateBrain.buildImportPreview({
      candidates: [{
        scheduledDate: '2026-08-27',
        startTime: '10:00',
        endTime: '13:00',
        customerName: 'テスト様',
        serviceText: 'エアコンクリーニング',
        estimateAmount: 15000,
        calendarDedupeKey: ''
      }]
    }, Storage.getWorkOrders(), { revenues: [] });
    return preview.items[0].isDuplicate;
  })()`, ctx);
  assert(isDuplicate, 'legacy duplicate remains duplicate');
}

console.log('== 7. revenue locked blocks sync ==');
{
  const ctx = createSandbox({
    budil_work_orders: [baseWorkOrder({ actualRevenueId: 'rev-1' })],
    budil_revenue_records: [{ id: 'rev-1', sourceWorkOrderId: 'wo-test-1', amount: 15000 }]
  });
  const result = runInContext(`(() => {
    const preview = CalendarCandidateBrain.buildImportPreview({
      candidates: [{
        scheduledDate: '2026-08-19',
        startTime: '10:00',
        endTime: '13:00',
        customerName: 'テスト様',
        serviceText: 'エアコンクリーニング',
        estimateAmount: 15000,
        calendarDedupeKey: 'google_calendar|primary|evt-reschedule-1'
      }]
    }, Storage.getWorkOrders(), { revenues: Storage.getRevenueRecords() });
    const sync = Storage.syncWorkOrderScheduleFromCalendar(
      'wo-test-1',
      'google_calendar|primary|evt-reschedule-1',
      { scheduledDate: '2026-08-19', startTime: '10:00', endTime: '13:00' }
    );
    return { importKind: preview.items[0].importKind, sync, wo: Storage.getWorkOrders()[0] };
  })()`, ctx);
  assert(result.importKind === 'update-blocked', 'confirmed revenue blocks update');
  assert(result.sync.blocked, 'storage sync blocked');
  assert(result.wo.scheduledDate === '2026-08-27', 'original schedule preserved');
}

console.log('== 8. cancelled/archived blocked ==');
{
  const ctx = createSandbox({ budil_work_orders: [baseWorkOrder({ status: 'cancelled' })] });
  const sync = runInContext(`(() => Storage.syncWorkOrderScheduleFromCalendar(
    'wo-test-1',
    'google_calendar|primary|evt-reschedule-1',
    { scheduledDate: '2026-08-19', startTime: '10:00', endTime: '13:00' }
  ))()`, ctx);
  assert(sync.blocked, 'cancelled blocked');
}

console.log('== 9. save failure keeps original ==');
{
  const ctx = createSandbox({ budil_work_orders: [baseWorkOrder()] });
  const result = runInContext(`(() => {
    const originalSave = Storage.saveWorkOrders.bind(Storage);
    Storage.saveWorkOrders = () => { throw new Error('save_failed'); };
    const sync = Storage.syncWorkOrderScheduleFromCalendar(
      'wo-test-1',
      'google_calendar|primary|evt-reschedule-1',
      { scheduledDate: '2026-08-19', startTime: '10:00', endTime: '13:00' }
    );
    Storage.saveWorkOrders = originalSave;
    return { sync, wo: Storage.getWorkOrders()[0], count: Storage.getWorkOrders().length };
  })()`, ctx);
  assert(result.sync.ok === false && result.sync.error === 'save_failed', 'save failure reported');
  assert(result.count === 1, 'no duplicate work order added');
  assert(result.wo.scheduledDate === '2026-08-27', 'original date kept on failure');
}

console.log('== 10. manual edit preserves linkage ==');
{
  const ctx = createSandbox({ budil_work_orders: [baseWorkOrder()] });
  const wo = runInContext(`(() => {
    Storage.updateWorkOrder('wo-test-1', {
      scheduledDate: '2026-08-20',
      startTime: '08:00',
      endTime: '10:00',
      calendarDedupeKey: 'google_calendar|primary|evt-reschedule-1',
      candidateMeta: ${JSON.stringify(baseWorkOrder().candidateMeta)},
      intakeId: 'intake-1',
      leadId: 'lead-1',
      status: 'tentative',
      actualRevenueId: '',
      createdAt: '2026-08-01T00:00:00.000Z'
    });
    return Storage.getWorkOrders()[0];
  })()`, ctx);
  assert(wo.id === 'wo-test-1', 'manual edit keeps id');
  assert(wo.calendarDedupeKey === 'google_calendar|primary|evt-reschedule-1', 'dedupe key preserved');
  assert(wo.intakeId === 'intake-1' && wo.leadId === 'lead-1', 'links preserved');
}

console.log('== 11. preview text ==');
{
  const ctx = createSandbox();
  const text = runInContext(`(() => CalendarCandidateBrain.formatScheduleUpdatePreviewText(
    { scheduledDate: '2026-08-27', startTime: '10:00', endTime: '13:00' },
    { scheduledDate: '2026-08-19', startTime: '09:00', endTime: '12:00' }
  ))()`, ctx);
  assert(text.includes('2026-08-27 10:00〜13:00'), 'preview includes previous schedule');
  assert(text.includes('2026-08-19 09:00〜12:00'), 'preview includes next schedule');
}

console.log('All v4.13.7 calendar-reschedule-sync checks passed.');
