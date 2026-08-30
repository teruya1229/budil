/**
 * Budil v4.13.12 - recover legacy calendar originalText before revenue confirmation.
 * Uses isolated in-memory fixtures only. No real browser profile or customer data.
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

for (const file of ['js/storage.js', 'js/app.js', 'js/work-order-brain.js', 'js/work-completion-brain.js']) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
}

const storageJs = load('js/storage.js');
const appJs = load('js/app.js');
const indexHtml = load('index.html');
const dataBackupJs = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');

function makeStore(seed = {}, options = {}) {
  const data = { ...seed };
  const events = options.events || [];
  let quotaChars = Number.isFinite(options.quotaChars) ? options.quotaChars : null;
  let failKey = '';
  const totalChars = () => Object.keys(data).reduce((sum, key) => sum + String(data[key] || '').length, 0);
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      const next = String(value);
      const current = Object.prototype.hasOwnProperty.call(data, key) ? String(data[key]).length : 0;
      if (failKey === key || (quotaChars != null && totalChars() - current + next.length > quotaChars)) {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      }
      events.push(`set:${key}`);
      data[key] = next;
    },
    removeItem(key) {
      events.push(`remove:${key}`);
      delete data[key];
    },
    key(index) { return Object.keys(data)[index] || null; },
    get length() { return Object.keys(data).length; },
    _data: data,
    _events: events,
    _totalChars: totalChars,
    _setQuota(value) { quotaChars = value; },
    _setFailKey(value) { failKey = value || ''; }
  };
}

function createSandbox(seed = {}, options = {}) {
  const events = options.events || [];
  const localStorage = makeStore({
    budil_work_orders: JSON.stringify(seed.budil_work_orders || []),
    budil_revenue_records: JSON.stringify(seed.budil_revenue_records || []),
    budil_safety_backups: JSON.stringify([]),
    budil_operation_logs: JSON.stringify([]),
    budil_migrated_v2: '1'
  }, { ...options, events });
  const body = {
    appendChild(node) { node.parentNode = body; },
    removeChild(node) { node.parentNode = null; }
  };
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
    Set,
    Map,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    MapBrain: { detectAreaFromAddress: () => '' },
    ReceptionBrain: { matchRevenueSource: value => value, matchRevenueService: value => value },
    RevenueBrain: { getDefaultGrossProfitRateBySource: () => null },
    Blob: class BlobFixture { constructor(parts, meta) { this.parts = parts; this.type = meta && meta.type; } },
    URL: {
      createObjectURL() { return 'blob:fixture'; },
      revokeObjectURL() {}
    },
    document: {
      body,
      createElement() {
        return {
          parentNode: null,
          href: '',
          download: '',
          click() { events.push('download'); }
        };
      }
    },
    confirm() { events.push('confirm'); return options.confirmResult !== false; },
    alert(message) { events.push(`alert:${message}`); }
  });
  runInContext(load('js/work-order-brain.js'), ctx, { filename: 'work-order-brain.js' });
  runInContext(load('js/calendar-candidate-brain.js'), ctx, { filename: 'calendar-candidate-brain.js' });
  runInContext(load('js/work-completion-brain.js'), ctx, { filename: 'work-completion-brain.js' });
  runInContext(storageJs, ctx, { filename: 'storage.js' });
  runInContext(dataBackupJs, ctx, { filename: 'data-backup.js' });
  runInContext('this.Storage = Storage; this.DataBackup = DataBackup; this.WorkCompletionBrain = WorkCompletionBrain;', ctx);
  return { ctx, localStorage, events };
}

function buildFullCalendarJson(padding = 120000) {
  const item = {
    source: 'google_calendar',
    calendarId: 'fixture@example.invalid',
    calendarEventId: 'evt-fixture-1',
    title: 'fixture event',
    date: '2026-08-27',
    start: { date: '2026-08-27', time: '10:00', isAllDay: false },
    end: { date: '2026-08-27', time: '12:00', isAllDay: false },
    extracted: { customerName: 'Fixture Customer', amount: 12345, workType: 'Fixture Service' },
    budilImport: {
      dedupeKey: 'google_calendar|fixture@example.invalid|evt-fixture-1',
      status: 'candidate'
    },
    rawEvent: { padding: 'Z'.repeat(padding) }
  };
  return JSON.stringify({
    source: 'google_calendar',
    schemaVersion: 1,
    fetchedAt: '2026-08-27T00:00:00.000Z',
    timezone: 'Asia/Tokyo',
    targetPeriod: { from: '2026-08-27', to: '2026-09-26' },
    items: [item]
  });
}

function workOrder(id, originalText, importSource = 'calendar-json-file', extra = {}) {
  return {
    id,
    customerName: `Fixture ${id}`,
    phone: '000-0000-0000',
    address: 'Fixture Address',
    source: '直受け',
    serviceText: 'Fixture Service',
    scheduledDate: '2026-08-27',
    scheduledEndDate: '2026-08-27',
    isAllDay: false,
    startTime: '10:00',
    endTime: '12:00',
    estimateAmount: 12345,
    status: 'confirmed',
    actualRevenueId: '',
    calendarDedupeKey: `google_calendar|fixture@example.invalid|${id}`,
    candidateMeta: {
      importSource,
      originalText,
      candidateStatus: '作業予定に追加済み',
      stableMarker: `stable-${id}`
    },
    ...extra
  };
}

function completionInput() {
  return {
    workDate: '2026-08-27',
    customerName: 'Fixture Customer',
    actualService: 'Fixture Service',
    service: 'Fixture Service',
    source: '直受け',
    amount: 12345,
    paymentStatus: '未入金',
    paymentDate: '2026-09-30',
    paymentMethod: '振込',
    paymentConcern: false,
    actualMemo: '',
    additionalMemo: '',
    followMemo: ''
  };
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function not found: ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function: ${name}`);
}

const fullJson = buildFullCalendarJson();
assert(fullJson.length >= 100 * 1024, 'fixture is sufficiently large');

console.log('== source and version contract ==');
assert(indexHtml.includes('Budil v4.13.12'), 'screen version is v4.13.12');
assert(indexHtml.includes('js/app.js?v=4.13.12'), 'app cache buster is v4.13.12');
assert(indexHtml.includes('css/style.css?v=4.13.12'), 'css cache buster is v4.13.12');
assert(storageJs.includes("BUDIL_VERSION: 'v4.13.12'"), 'Storage version is v4.13.12');
assert(dataBackupJs.includes("APP_VERSION: 'v4.13.12'"), 'backup version is v4.13.12');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.12'"), 'current runner pins v4.13.12');
assert(appJs.includes('recoverStorageForRevenueConfirmationIfNeeded'), 'revenue submit has explicit recovery gate');
assert(appJs.includes('commitSavableCalendarCandidates'), 'calendar bulk save path remains');
assert(appJs.includes("preview.sourceFormat === 'budil-calendar-json'"), 'calendar JSON individual/bulk compaction guard remains');

console.log('== recovery target and invariant checks ==');
{
  const manual = 'manual note '.repeat(12000);
  const genericJson = JSON.stringify({ source: 'not_google_calendar', items: [], padding: 'X'.repeat(120000) });
  const shortFullJson = buildFullCalendarJson(1000);
  const syncWrapperJson = JSON.stringify({ ok: true, payload: JSON.parse(fullJson) });
  const before = [
    workOrder('wo-target', fullJson),
    workOrder('wo-sync-wrapper', syncWrapperJson),
    workOrder('wo-manual', manual, 'calendar-paste'),
    workOrder('wo-generic', genericJson),
    workOrder('wo-small', shortFullJson)
  ];
  const { ctx, localStorage } = createSandbox({ budil_work_orders: before });
  runInContext('this.plan = Storage.prepareWorkOrderOriginalTextRecovery();', ctx);
  assert(ctx.plan.needed === true && ctx.plan.targetCount === 2, 'only the legacy full-calendar JSON and /sync wrapper are targeted');
  assert(ctx.plan.validation.ok === true, 'clone validation passes before save');
  assert(ctx.plan.workOrders[0].candidateMeta.originalText === '', 'only target originalText is emptied on clone');
  assert(ctx.plan.workOrders[1].candidateMeta.originalText === '', '/sync wrapper originalText is emptied on clone');
  assert(ctx.plan.workOrders[2].candidateMeta.originalText === manual, 'manual originalText remains');
  assert(ctx.plan.workOrders[3].candidateMeta.originalText === genericJson, 'generic JSON originalText remains');
  assert(ctx.plan.workOrders[4].candidateMeta.originalText === shortFullJson, 'small calendar JSON originalText remains');
  const expected = JSON.parse(JSON.stringify(before[0]));
  expected.candidateMeta.originalText = '';
  assert(JSON.stringify(ctx.plan.workOrders[0]) === JSON.stringify(expected), 'customer, amount, dates, IDs and all non-target fields are byte-equivalent');
  const writesBefore = localStorage._events.length;
  runInContext('this.recovery = Storage.recoverWorkOrderOriginalTextForRevenue();', ctx);
  const recoveryWrites = localStorage._events.slice(writesBefore).filter(event => event === 'set:budil_work_orders');
  assert(ctx.recovery.ok === true && ctx.recovery.changed === true, 'recovery succeeds');
  assert(recoveryWrites.length === 1, 'compacted work-order array is saved exactly once');
}

console.log('== cancel and backup ordering ==');
{
  const events = [];
  const fixture = workOrder('wo-cancel', fullJson);
  const { ctx, localStorage } = createSandbox(
    { budil_work_orders: [fixture] },
    { events, confirmResult: false }
  );
  const before = JSON.stringify(localStorage._data);
  const downloadFn = extractFunction(appJs, 'downloadBudilBackupSnapshot');
  const recoveryFn = extractFunction(appJs, 'recoverStorageForRevenueConfirmationIfNeeded');
  runInContext(`${downloadFn}\n${recoveryFn}\nthis.cancelResult = recoverStorageForRevenueConfirmationIfNeeded();`, ctx);
  assert(events.includes('download'), 'backup download starts');
  assert(events.indexOf('download') < events.indexOf('confirm'), 'backup starts before cleanup confirmation');
  assert(events.every(event => event !== 'set:budil_work_orders'), 'cancel performs no work-order write');
  assert(JSON.stringify(localStorage._data) === before, 'cancel leaves localStorage byte-for-byte unchanged');
  assert(ctx.cancelResult.cancelled === true, 'cancel is reported without continuing revenue save');
}

console.log('== quota reproduction, revenue save and idempotent repair ==');
{
  const polluted = [0, 1, 2, 3].map(i => workOrder(`wo-polluted-${i}`, fullJson));
  const { ctx, localStorage } = createSandbox({ budil_work_orders: polluted });
  runInContext(`
    var input = ${JSON.stringify(completionInput())};
    var wo = Storage.getWorkOrders()[0];
    this.payload = WorkCompletionBrain.createRevenuePayloadFromWorkOrder(wo, input);
  `, ctx);
  localStorage._setQuota(localStorage._totalChars() + 100);
  let oldFailure = null;
  try {
    runInContext('Storage.addRevenueRecord(payload);', ctx);
  } catch (error) {
    oldFailure = error;
  }
  assert(oldFailure && oldFailure.name === 'QuotaExceededError', 'old giant-JSON state reproduces QuotaExceededError');
  runInContext('this.recovered = Storage.recoverWorkOrderOriginalTextForRevenue();', ctx);
  assert(ctx.recovered.ok === true && ctx.recovered.targetCount === 4, 'all eligible duplicated originals are compacted');
  runInContext('this.firstSave = Storage.confirmRevenueForWorkOrder(wo.id, payload, input);', ctx);
  assert(ctx.firstSave.ok === true && ctx.firstSave.revenueCreated === true, 'one confirmed revenue is created after recovery');
  runInContext('this.secondSave = Storage.confirmRevenueForWorkOrder(wo.id, payload, input);', ctx);
  const revenues = JSON.parse(localStorage.getItem('budil_revenue_records'));
  const savedWo = JSON.parse(localStorage.getItem('budil_work_orders')).find(item => item.id === 'wo-polluted-0');
  assert(revenues.length === 1, 'second execution does not duplicate revenue');
  assert(savedWo.status === 'completed', 'work order becomes completed');
  assert(savedWo.actualRevenueId === revenues[0].id, 'work order receives actualRevenueId');
  assert(ctx.secondSave.ok === true && ctx.secondSave.linkedExistingRevenue === true, 'second execution reuses existing revenue');
}

console.log('== pre-save failure and partial-save repair ==');
{
  const fixture = workOrder('wo-fail-before', 'manual text', 'calendar-paste');
  const { ctx, localStorage } = createSandbox({ budil_work_orders: [fixture] });
  runInContext(`
    var input = ${JSON.stringify(completionInput())};
    var wo = Storage.getWorkOrders()[0];
    var payload = WorkCompletionBrain.createRevenuePayloadFromWorkOrder(wo, input);
  `, ctx);
  localStorage._setFailKey('budil_revenue_records');
  runInContext('this.failedBefore = Storage.confirmRevenueForWorkOrder(wo.id, payload, input);', ctx);
  assert(ctx.failedBefore.ok === false && ctx.failedBefore.revenueSaved === false, 'failure before revenue save is explicit');
  assert(JSON.parse(localStorage.getItem('budil_revenue_records')).length === 0, 'pre-save failure creates no revenue');
}
{
  const fixture = workOrder('wo-partial', 'manual text', 'calendar-paste');
  const { ctx, localStorage } = createSandbox({ budil_work_orders: [fixture] });
  runInContext(`
    var input = ${JSON.stringify(completionInput())};
    var wo = Storage.getWorkOrders()[0];
    var payload = WorkCompletionBrain.createRevenuePayloadFromWorkOrder(wo, input);
  `, ctx);
  localStorage._setFailKey('budil_work_orders');
  runInContext('this.partial = Storage.confirmRevenueForWorkOrder(wo.id, payload, input);', ctx);
  assert(ctx.partial.ok === false && ctx.partial.revenueSaved === true, 'revenue-only partial save is explicit');
  assert(JSON.parse(localStorage.getItem('budil_revenue_records')).length === 1, 'partial state contains exactly one saved revenue');
  assert(!JSON.parse(localStorage.getItem('budil_work_orders'))[0].actualRevenueId, 'partial state has no work-order link yet');
  localStorage._setFailKey('');
  runInContext('this.repaired = Storage.confirmRevenueForWorkOrder(wo.id, payload, input);', ctx);
  const revenues = JSON.parse(localStorage.getItem('budil_revenue_records'));
  const savedWo = JSON.parse(localStorage.getItem('budil_work_orders'))[0];
  assert(ctx.repaired.ok === true && ctx.repaired.linkedExistingRevenue === true, 'retry repairs only the missing link');
  assert(revenues.length === 1, 'partial-save repair does not add a second revenue');
  assert(savedWo.status === 'completed' && savedWo.actualRevenueId === revenues[0].id, 'partial-save repair completes and links work order');
}

console.log('== user messages and calendar regressions ==');
assert(appJs.includes('保存容量を回復できなかったため、売上は登録していません'), 'pre-save failure message is exact');
assert(appJs.includes('売上は保存済みです。再登録せず、予定リンクの修復が必要です'), 'partial-save message is distinct and exact');
assert((appJs.match(/recoverStorageForRevenueConfirmationIfNeeded\(\)/g) || []).length === 2, 'recovery runs only from the current-input work-completion submit path');
{
  const { ctx, localStorage } = createSandbox();
  runInContext(`
    Storage.addWorkOrder({
      id: 'wo-timed', customerName: 'Fixture Timed', scheduledDate: '2026-08-27',
      startTime: '10:00', endTime: '12:00', estimateAmount: 12000, status: 'confirmed',
      calendarDedupeKey: 'google_calendar|fixture@example.invalid|timed'
    });
    Storage.addWorkOrder({
      id: 'wo-allday', customerName: 'Fixture All Day', scheduledDate: '2026-08-28',
      scheduledEndDate: '2026-08-30', isAllDay: true, estimateAmount: 320000, status: 'confirmed',
      calendarDedupeKey: 'google_calendar|fixture@example.invalid|allday'
    });
  `, ctx);
  const saved = JSON.parse(localStorage.getItem('budil_work_orders'));
  assert(saved.length === 2, 'individual and repeated work-order saves remain available');
  const allDay = saved.find(item => item.id === 'wo-allday');
  assert(allDay.isAllDay === true && allDay.scheduledEndDate === '2026-08-30', 'all-day multi-day range remains');
  assert(allDay.estimateAmount === 320000, '320,000 yen regression remains');
}

console.log('\nAll v4.13.12 revenue storage recovery checks passed.');
