/**
 * Budil v4.13.7 - all-day multi-day calendar import + bare amount extraction
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const { createContext, runInContext } = vm;
const require = createRequire(import.meta.url);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (file) => readFileSync(join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

for (const file of [
  'js/app.js',
  'js/storage.js',
  'js/calendar-candidate-brain.js',
  'js/work-order-brain.js',
  'hub/functions/lib/descriptionExtract.js',
  'hub/functions/lib/budilCalendarTransform.js'
]) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
}

const html = load('index.html');
const app = load('js/app.js');
const brainJs = load('js/calendar-candidate-brain.js');
const storageJs = load('js/storage.js');
const workOrderBrainJs = load('js/work-order-brain.js');
const dataBackup = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');

console.log('== version ==');
assert(html.includes('Budil v4.13.10'), 'index shows Budil v4.13.10');
assert(html.includes('js/app.js?v=4.13.10'), 'app.js cache buster v4.13.10');
assert(storageJs.includes("BUDIL_VERSION: 'v4.13.10'"), 'storage v4.13.10');
assert(dataBackup.includes("APP_VERSION: 'v4.13.10'"), 'data-backup v4.13.10');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.10'"), 'verify-current v4.13.10');
assert(html.includes('work-order-all-day'), 'all-day checkbox exists');
assert(html.includes('work-order-end-date'), 'end date field exists');
assert(app.includes('syncWorkOrderAllDayFormUi'), 'all-day form sync exists');
assert(app.includes('formatScheduleLabel'), 'schedule label used in UI');
assert(!app.includes('localStorage.clear'), 'localStorage.clear forbidden');

const hubExtract = await import(pathToFileURL(join(root, 'hub/functions/lib/descriptionExtract.js')).href);
const hubTransform = await import(pathToFileURL(join(root, 'hub/functions/lib/budilCalendarTransform.js')).href);
const workerExtract = require(join(root, '..', 'calendar-sync-worker', 'src', 'transform', 'descriptionExtract.js'));
const workerBuild = require(join(root, '..', 'calendar-sync-worker', 'src', 'transform', 'buildBudilCalendarEvents.js'));

console.log('== amount extraction ==');
assert(hubExtract.extractReceptionFields('320,000円').amount === 320000, 'hub bare 320,000円');
assert(hubExtract.extractReceptionFields('￥320,000').amount === 320000, 'hub ￥320,000');
assert(hubExtract.extractReceptionFields('¥320000').amount === 320000, 'hub ¥320000');
assert(hubExtract.extractReceptionFields('金額：15000円').amount === 15000, 'hub labeled amount');
assert(hubExtract.extractReceptionFields('電話：090-9597-7878').amount == null, 'hub phone not amount');
assert(workerExtract.extractAmountFields('320,000円').amount === 320000, 'worker bare 320,000円');
assert(workerExtract.extractAmountFields('金額：12000円').amount === 12000, 'worker labeled amount');

console.log('== exclusive end date ==');
assert(
  hubTransform.inclusiveEndDateFromExclusive('2026-08-25', '2026-08-29') === '2026-08-28',
  'hub inclusive end 8/25-8/29 → 8/28'
);
assert(
  workerBuild.inclusiveEndDateFromExclusive('2026-08-25', '2026-08-29') === '2026-08-28',
  'worker inclusive end 8/25-8/29 → 8/28'
);

const mapped = hubTransform.mapGoogleEventToApiItem({
  id: 'evt-saki-allday',
  summary: 'Sakiさん引越しエアコン',
  description: '320,000円',
  start: { date: '2026-08-25' },
  end: { date: '2026-08-29' }
}, { calendarId: 'test@example.com', timezone: 'Asia/Tokyo' });
assert(mapped.isAllDay === true, 'hub mapped isAllDay');
assert(mapped.date === '2026-08-25', 'hub mapped start date');
assert(mapped.endDateInclusive === '2026-08-28', 'hub mapped inclusive end');
assert(mapped.extracted.amount === 320000, 'hub mapped amount');

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

const sakiItem = {
  source: 'google_calendar',
  calendarId: 'test@example.com',
  calendarEventId: 'evt-saki-allday',
  title: 'Sakiさん引越しエアコン',
  date: '2026-08-25',
  isAllDay: true,
  endDateInclusive: '2026-08-28',
  start: { date: '2026-08-25', time: null, isAllDay: true },
  end: { date: '2026-08-29', time: null, isAllDay: true },
  description: '320,000円',
  extracted: {
    customerName: 'Sakiさん',
    amount: 320000,
    amountText: '320,000円',
    workType: '引越しエアコン',
    requestSource: '直受け',
    confirmationStatus: '確定'
  },
  budilImport: {
    dedupeKey: 'google_calendar|test@example.com|evt-saki-allday',
    status: 'candidate'
  }
};

console.log('== candidate mapping / savable ==');
{
  const ctx = createSandbox();
  const cand = runInContext(
    `CalendarCandidateBrain.mapWorkerItemToCandidate(${JSON.stringify(sakiItem)})`,
    ctx
  );
  assert(cand.scheduledDate === '2026-08-25', 'candidate start 8/25');
  assert(cand.scheduledEndDate === '2026-08-28', 'candidate end 8/28');
  assert(cand.isAllDay === true, 'candidate isAllDay');
  assert(!cand.startTime && !cand.endTime, 'candidate has no fake times');
  assert(cand.estimateAmount === 320000, 'candidate amount 320000');
  const cls = runInContext(
    `CalendarCandidateBrain.classifyFutureImportCandidate(${JSON.stringify(cand)}, '2026-08-20')`,
    ctx
  );
  assert(cls.savable === true, 'all-day with amount is savable');
  assert(!(cls.reasons || []).includes('時間なし'), '時間なし not used for all-day');
  const payload = runInContext(
    `CalendarCandidateBrain.createWorkOrderPayload(${JSON.stringify(cand)})`,
    ctx
  );
  assert(payload.isAllDay === true, 'payload isAllDay');
  assert(payload.startTime === '' && payload.endTime === '', 'payload no fake 09:00');
  assert(payload.scheduledEndDate === '2026-08-28', 'payload end date');
}

console.log('== save once / no duplicate / schedule update ==');
{
  const ctx = createSandbox();
  const parsed = {
    candidates: [
      runInContext(`CalendarCandidateBrain.mapWorkerItemToCandidate(${JSON.stringify(sakiItem)})`, ctx)
    ],
    warnings: [],
    errors: []
  };
  let preview = runInContext(
    `CalendarCandidateBrain.buildImportPreview(${JSON.stringify(parsed)}, [], { revenues: [] })`,
    ctx
  );
  preview = runInContext(
    `CalendarCandidateBrain.attachFutureImportPreview(${JSON.stringify(preview)}, '2026-08-20')`,
    ctx
  );
  assert(preview.items[0].futureImport.savable === true, 'preview savable');
  const payload = runInContext(
    `CalendarCandidateBrain.createWorkOrderPayload(${JSON.stringify(preview.items[0].candidate)})`,
    ctx
  );
  const saved = runInContext(`Storage.addWorkOrder(${JSON.stringify(payload)})`, ctx);
  assert(runInContext('Storage.getWorkOrders().length', ctx) === 1, 'one work order created');
  assert(saved.isAllDay === true, 'saved isAllDay');

  let preview2 = runInContext(
    `CalendarCandidateBrain.buildImportPreview(${JSON.stringify(parsed)}, Storage.getWorkOrders(), { revenues: [] })`,
    ctx
  );
  assert(preview2.items[0].importKind === 'unchanged', 'reimport unchanged');

  const moved = {
    ...sakiItem,
    date: '2026-08-24',
    endDateInclusive: '2026-08-27',
    start: { date: '2026-08-24', time: null, isAllDay: true },
    end: { date: '2026-08-28', time: null, isAllDay: true }
  };
  const movedCand = runInContext(
    `CalendarCandidateBrain.mapWorkerItemToCandidate(${JSON.stringify(moved)})`,
    ctx
  );
  let preview3 = runInContext(
    `CalendarCandidateBrain.buildImportPreview(${JSON.stringify({ candidates: [movedCand] })}, Storage.getWorkOrders(), { revenues: [] })`,
    ctx
  );
  assert(preview3.items[0].importKind === 'schedule-update', 'range change is schedule-update');
  const next = preview3.items[0].scheduleUpdate.nextSchedule;
  const sync = runInContext(
    `Storage.syncWorkOrderScheduleFromCalendar(${JSON.stringify(saved.id)}, ${JSON.stringify(saved.calendarDedupeKey)}, ${JSON.stringify(next)})`,
    ctx
  );
  assert(sync.ok === true && !sync.unchanged, 'schedule sync ok');
  const after = runInContext('Storage.getWorkOrders()', ctx);
  assert(after.length === 1, 'still one work order after sync');
  assert(after[0].id === saved.id, 'same work order id');
  assert(after[0].scheduledDate === '2026-08-24', 'updated start date');
  assert(after[0].scheduledEndDate === '2026-08-27', 'updated end date');
  assert(runInContext('Storage.getRevenueRecords().length', ctx) === 0, 'no revenue auto-created');
}

console.log('== revenue locked blocks update ==');
{
  const wo = {
    id: 'wo-locked',
    customerName: 'Sakiさん',
    serviceText: '引越しエアコン',
    scheduledDate: '2026-08-25',
    scheduledEndDate: '2026-08-28',
    isAllDay: true,
    estimateAmount: 320000,
    status: 'tentative',
    actualRevenueId: 'rev-1',
    calendarDedupeKey: 'google_calendar|test@example.com|evt-saki-allday',
    candidateMeta: { importSource: 'calendar-json-file', sourceType: 'work-order-candidate', candidateStatus: '作業予定に追加済み' }
  };
  const ctx = createSandbox({
    budil_work_orders: [wo],
    budil_revenue_records: [{ id: 'rev-1', sourceWorkOrderId: 'wo-locked', amount: 320000 }]
  });
  const cand = runInContext(
    `CalendarCandidateBrain.mapWorkerItemToCandidate(${JSON.stringify({
      ...sakiItem,
      date: '2026-08-20',
      endDateInclusive: '2026-08-22',
      start: { date: '2026-08-20', time: null, isAllDay: true },
      end: { date: '2026-08-23', time: null, isAllDay: true }
    })})`,
    ctx
  );
  const preview = runInContext(
    `CalendarCandidateBrain.buildImportPreview(${JSON.stringify({ candidates: [cand] })}, Storage.getWorkOrders(), { revenues: Storage.getRevenueRecords() })`,
    ctx
  );
  assert(preview.items[0].importKind === 'update-blocked', 'revenue linked is update-blocked');
  const after = runInContext('Storage.getWorkOrders()[0]', ctx);
  assert(after.scheduledDate === '2026-08-25', 'locked date unchanged');
}

console.log('== timed / holiday exclusions remain ==');
{
  const ctx = createSandbox();
  const timed = runInContext(`CalendarCandidateBrain.normalizeCandidate(${JSON.stringify({
    scheduledDate: '2026-08-26',
    startTime: '10:00',
    endTime: '12:00',
    customerName: '時間あり',
    serviceText: 'R1',
    estimateAmount: 12000,
    source: '直受け'
  })})`, ctx);
  const timedCls = runInContext(
    `CalendarCandidateBrain.classifyFutureImportCandidate(${JSON.stringify(timed)}, '2026-08-20')`,
    ctx
  );
  assert(timedCls.savable === true, 'timed with amount remains savable');

  const holiday = runInContext(`CalendarCandidateBrain.normalizeCandidate(${JSON.stringify({
    scheduledDate: '2026-08-26',
    isAllDay: true,
    scheduledEndDate: '2026-08-26',
    customerName: '休み',
    serviceText: '休み',
    title: '休み',
    estimateAmount: 0
  })})`, ctx);
  const holidayCls = runInContext(
    `CalendarCandidateBrain.classifyFutureImportCandidate(${JSON.stringify(holiday)}, '2026-08-20')`,
    ctx
  );
  assert(holidayCls.savable === false, 'holiday all-day excluded');
}

console.log('\nAll v4.13.7 all-day multi-day amount checks passed.');
