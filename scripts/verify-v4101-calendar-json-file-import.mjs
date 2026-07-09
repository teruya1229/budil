/**
 * Budil v4.10.1 calendar JSON file import verification.
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = path => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const WORKER_DEDUPE = 'google_calendar|dummy-calendar|dummy-event-001';
const FUTURE_DATE = '2099-12-01';

const dummyWorkerJson = {
  source: 'google_calendar',
  schemaVersion: 1,
  fetchedAt: '2099-01-01T00:00:00.000Z',
  timezone: 'Asia/Tokyo',
  targetPeriod: { from: FUTURE_DATE, to: '2099-12-31' },
  items: [
    {
      title: 'テスト様 エアコンクリーニング',
      date: FUTURE_DATE,
      start: { time: '10:00', isAllDay: false },
      end: { time: '12:00', isAllDay: false },
      location: '沖縄県南城市',
      description: '予定メモ',
      extracted: {
        customerName: 'テスト様',
        amount: 12000,
        address: '沖縄県南城市',
        phone: '090-0000-0000'
      },
      budilImport: {
        dedupeKey: WORKER_DEDUPE,
        source: 'google_calendar'
      }
    },
    {
      title: '過去分ダミー',
      date: '2020-01-01',
      start: { time: '10:00', isAllDay: false },
      end: { time: '12:00', isAllDay: false },
      extracted: { customerName: '過去様', amount: 10000 },
      budilImport: { dedupeKey: 'google_calendar|dummy|past-001' }
    },
    {
      title: '金額なしダミー',
      date: FUTURE_DATE,
      start: { time: '13:00', isAllDay: false },
      end: { time: '14:00', isAllDay: false },
      extracted: { customerName: '金額なし様' },
      budilImport: { dedupeKey: 'google_calendar|dummy|no-amount' }
    },
    {
      title: 'キャンセル分ダミー',
      date: FUTURE_DATE,
      start: { time: '15:00', isAllDay: false },
      end: { time: '16:00', isAllDay: false },
      extracted: { customerName: 'キャンセル様', amount: 8000 },
      description: 'キャンセル連絡あり',
      budilImport: { dedupeKey: 'google_calendar|dummy|cancelled' }
    }
  ]
};

function makeStore(seed = {}) {
  const data = { ...seed };
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; },
    key(index) { return Object.keys(data)[index] || null; },
    get length() { return Object.keys(data).length; },
    _data: data
  };
}

function parse(localStorage, key, fallback) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}

function createSandbox(seed = {}) {
  const localStorage = makeStore(seed);
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
    Set,
    Map,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    undefined
  });
  runInContext(load('js/map-brain.js'), ctx, { filename: 'map-brain.js' });
  runInContext(load('js/revenue-brain.js'), ctx, { filename: 'revenue-brain.js' });
  runInContext(load('js/reception-brain.js'), ctx, { filename: 'reception-brain.js' });
  runInContext(load('js/work-order-brain.js'), ctx, { filename: 'work-order-brain.js' });
  runInContext(load('js/work-completion-brain.js'), ctx, { filename: 'work-completion-brain.js' });
  runInContext(load('js/revenue-summary-brain.js'), ctx, { filename: 'revenue-summary-brain.js' });
  runInContext(load('js/calendar-candidate-brain.js'), ctx, { filename: 'calendar-candidate-brain.js' });
  runInContext(load('js/profit-brain.js'), ctx, { filename: 'profit-brain.js' });
  runInContext(load('js/storage.js'), ctx, { filename: 'storage.js' });
  runInContext(load('js/data-backup.js'), ctx, { filename: 'data-backup.js' });
  return { ctx, localStorage };
}

for (const file of ['calendar-candidate-brain.js', 'storage.js', 'app.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const calendarBrain = load('js/calendar-candidate-brain.js');
const css = load('css/style.css');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const profitJs = load('js/profit-brain.js');

console.log('== v4.10.1 calendar JSON file import ==');

assert(indexHtml.includes('AI経営脳みそ v4.12.3'), 'header version should be v4.12.3');
assert(indexHtml.includes('Budil v4.12.3'), 'sidebar version should be v4.12.3');
assert(indexHtml.includes('js/app.js?v=4.12.3'), 'app.js cache buster should be v4.12.3');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.3'"), 'storage version should be v4.12.3');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.3'"), 'data-backup version should be v4.12.3');

assert(indexHtml.includes('id="btn-calendar-candidate-json-import"'), 'JSON import button should exist');
assert(indexHtml.includes('id="calendar-candidate-json-input"'), 'JSON file input should exist');
assert(indexHtml.includes('\u30ab\u30ec\u30f3\u30c0\u30fcJSON\u3092\u53d6\u308a\u8fbc\u3080'), 'JSON import label should exist');
assert(indexHtml.includes('calendar-candidate-paste'), 'paste import UI should remain');
assert(!indexHtml.includes('hub-import.js'), 'hub-import should not be wired');

assert(calendarBrain.includes('parseBudilCalendarEventsJson'), 'worker JSON parser should exist');
assert(calendarBrain.includes('mapWorkerItemToCandidate'), 'worker item mapper should exist');
assert(appJs.includes('handleCalendarCandidateJsonFile'), 'JSON file handler should exist');
assert(appJs.includes('applyCalendarCandidateParsed'), 'shared parsed apply helper should exist');
assert(!appJs.includes('localStorage.clear('), 'localStorage.clear must not be used');

assert(css.includes('overflow-x: hidden') || css.includes('min-width: 0'), 'layout should avoid horizontal scroll patterns');

const { ctx, localStorage } = createSandbox();
const jsonText = JSON.stringify(dummyWorkerJson);

const parsed = runInContext(
  `(() => CalendarCandidateBrain.parseBudilCalendarEventsJson(${JSON.stringify(jsonText)}))()`,
  ctx
);
assert(parsed.sourceFormat === 'budil-calendar-json', 'worker JSON sourceFormat should be budil-calendar-json');
assert(parsed.candidates && parsed.candidates.length === 4, 'should read all dummy items');

const futureCandidate = parsed.candidates[0];
assert(futureCandidate.customerName === 'テスト様', 'customerName should map from extracted');
assert(futureCandidate.estimateAmount === 12000, 'amount should map from extracted');
assert(futureCandidate.calendarDedupeKey === WORKER_DEDUPE, 'worker dedupeKey should be preserved');
assert(futureCandidate.startTime === '10:00', 'start time should map');
assert(futureCandidate.endTime === '12:00', 'end time should map');

const titleOnly = runInContext(
  `(() => CalendarCandidateBrain.mapWorkerItemToCandidate({
    title: 'コープ 山田様 N1',
    date: '${FUTURE_DATE}',
    start: { time: '09:00', isAllDay: false },
    end: { time: '10:00', isAllDay: false },
    extracted: { amount: 5000 },
    budilImport: { dedupeKey: 'google_calendar|dummy|title-only' }
  }))()`,
  ctx
);
assert(titleOnly.customerName.includes('山田'), 'title should infer customerName when extracted missing');

const preview = runInContext(
  `(() => {
    const parsed = CalendarCandidateBrain.parseBudilCalendarEventsJson(${JSON.stringify(jsonText)});
    const built = CalendarCandidateBrain.buildImportPreview(parsed, []);
    return CalendarCandidateBrain.attachFutureImportPreview(built, '${FUTURE_DATE}');
  })()`,
  ctx
);
assert(preview.items.length === 4, 'preview should include all items');
const eligible = preview.items.filter(i => i.futureImport && i.futureImport.savable);
// v4.10.27: 過去日付でも金額があれば eligible（翌日インポート対応）
assert(eligible.length === 2, 'future dated amount item AND past dated amount item should both be savable (v4.10.27)');
assert(preview.items[1].futureImport.status === 'eligible', 'past date with amount should be eligible in v4.10.27');
assert(preview.items[2].futureImport.status === 'excluded', 'no amount should be excluded');
assert(preview.items[3].futureImport.status === 'excluded', 'cancelled should be excluded');

runInContext(`
(() => {
  const parsed = CalendarCandidateBrain.parseBudilCalendarEventsJson(${JSON.stringify(jsonText)});
  const preview = CalendarCandidateBrain.attachFutureImportPreview(
    CalendarCandidateBrain.buildImportPreview(parsed, []),
    '${FUTURE_DATE}'
  );
  const item = preview.items[0];
  const payload = CalendarCandidateBrain.createWorkOrderPayload(item.candidate, {
    calendarDedupeKey: item.candidate.calendarDedupeKey,
    importSource: CalendarCandidateBrain.JSON_IMPORT_SOURCE
  });
  Storage.addWorkOrder(payload);
})();
`, ctx);

const workOrders = parse(localStorage, 'budil_work_orders', []);
assert(workOrders.length === 1, 'eligible item should save to budil_work_orders');
assert(workOrders[0].calendarDedupeKey === WORKER_DEDUPE, 'saved work order should keep worker dedupe key');
assert(workOrders[0].estimateAmount === 12000, 'saved work order should keep amount');

const revenues = parse(localStorage, 'budil_revenue_records', []);
assert(revenues.length === 0, 'budil_revenue_records must not auto-add');

const upcoming = runInContext(
  `(() => RevenueSummaryBrain.buildUpcomingRevenueScheduleSummary(Storage.getWorkOrders(), '${FUTURE_DATE}'))()`,
  ctx
);
assert(upcoming.upcomingCount >= 1, 'saved work order should appear in upcoming revenue schedule');
assert(upcoming.label.includes('\u672a\u78ba\u5b9a'), 'upcoming schedule should remain tentative');

const dupPreview = runInContext(
  `(() => {
    const parsed = CalendarCandidateBrain.parseBudilCalendarEventsJson(${JSON.stringify(jsonText)});
    const built = CalendarCandidateBrain.buildImportPreview(parsed, Storage.getWorkOrders());
    return CalendarCandidateBrain.attachFutureImportPreview(built, '${FUTURE_DATE}');
  })()`,
  ctx
);
assert(dupPreview.items[0].isDuplicate === true, 're-import should detect duplicate via calendarDedupeKey');

const pasteParsed = runInContext(`(() => CalendarCandidateBrain.parseCalendarText(${JSON.stringify([
  '【カレンダー予定】',
  `日付：${FUTURE_DATE}`,
  '開始時間：09:00',
  '終了時間：11:00',
  'お客様名：貼り付け様',
  '作業内容：エアコン',
  '予定金額：15000'
].join('\\n'))}))()`, ctx);
assert(pasteParsed.sourceFormat !== 'budil-calendar-json', 'paste import should remain separate');
assert(pasteParsed.candidates.length === 1, 'paste import should still parse');

const aliasParsed = runInContext(`(() => CalendarCandidateBrain.parseCalendarText(${JSON.stringify([
  '【カレンダー予定】',
  `件名：LP／別名様／清掃`,
  `日付：${FUTURE_DATE}`,
  '金額：12000円',
  '時間：10:00-12:00'
].join('\\n'))}))()`, ctx);
assert(aliasParsed.candidates.length === 1, 'v4.9.9 label alias parsing should remain');

const backupNeeded = runInContext(`(() => ProfitBrain.buildOperationsStartCheck({
  today: '2026-06-30',
  settings: {},
  workOrders: [],
  revenues: [],
  expenses: [{ id: 'e1', date: '2026-06-10', amount: 500, category: '消耗品' }],
  monthlyResults: [{ id: 'mr1', month: '2026-06', revenue: 100000, expense: 20000 }]
}))()`, ctx);
assert(backupNeeded.statusKey === 'backup', 'v4.10.0 operations start check should remain');

const consistency = runInContext(`(() => {
  if (typeof Storage.runDataConsistencyCheck !== 'function') return { ok: true };
  return Storage.runDataConsistencyCheck();
})()`, ctx);
assert(consistency == null || consistency.ok !== false, 'v4.9.7 data consistency check should remain callable');

assert(dataBackupJs.includes('exportPayload'), 'v4.9.6 backup export should remain');
assert(indexHtml.includes('btn-export-data'), 'backup export button should remain');
assert(!profitJs.match(/detectTestLikeWorkOrders[\s\S]*removeItem\(/), 'test detection must not delete storage');

console.log('All v4.10.1 calendar JSON file import checks passed.');
