/**
 * Budil v4.10.1 future schedule import result summary verification.
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
  runInContext(load('js/revenue-brain.js'), ctx, { filename: 'revenue-brain.js' });
  runInContext(load('js/reception-brain.js'), ctx, { filename: 'reception-brain.js' });
  runInContext(load('js/work-order-brain.js'), ctx, { filename: 'work-order-brain.js' });
  runInContext(load('js/work-completion-brain.js'), ctx, { filename: 'work-completion-brain.js' });
  runInContext(load('js/revenue-summary-brain.js'), ctx, { filename: 'revenue-summary-brain.js' });
  runInContext(load('js/calendar-candidate-brain.js'), ctx, { filename: 'calendar-candidate-brain.js' });
  runInContext(load('js/storage.js'), ctx, { filename: 'storage.js' });
  return { ctx, localStorage };
}

for (const file of ['calendar-candidate-brain.js', 'storage.js', 'app.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const calendarBrain = load('js/calendar-candidate-brain.js');
const css = load('css/style.css');

console.log('== v4.10.1 future schedule import results ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.11.15'), 'header version should be v4.10.1');
assert(indexHtml.includes('Budil v4.11.15'), 'sidebar version should be v4.10.1');
assert(indexHtml.includes('js/app.js?v=4.11.15'), 'app.js cache buster should be v4.10.1');
assert(indexHtml.includes('id="calendar-candidate-import-result"'), 'import result panel should exist');

assert(appJs.includes('renderCalendarCandidateImportSummaryHtml'), 'import result renderer should exist');
assert(appJs.includes('getCalendarFutureImportSummary'), 'import summary helper should exist');
assert(appJs.includes('\u58f2\u4e0a\u660e\u7d30\u3078\u306e\u767b\u9332'), 'revenue registration note should exist');
assert(appJs.includes('\u58f2\u4e0a\u4e88\u5b9a\uff08\u672a\u78ba\u5b9a\uff09'), 'next step should mention upcoming revenue');
assert(appJs.includes('calendar-import-go-revenue'), 'revenue navigation button should exist');
assert(appJs.includes('calendar-import-go-daily'), 'daily tasks navigation button should exist');
assert(appJs.includes('\u53d6\u308a\u8fbc\u307f\u5bfe\u8c61\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3067\u3057\u305f'), 'zero-case guidance should exist');

assert(calendarBrain.includes('hasFutureImportExcludedWord'), 'future import exclusion helper should exist');
assert(calendarBrain.includes('summarizeFutureImportPreview'), 'future import summary should exist');
assert(calendarBrain.includes('isFutureImportSavable'), 'savable filter should exist');

assert(css.includes('calendar-candidate-import-result'), 'import result styles should exist');
assert(css.includes('overflow-x: hidden') || css.includes('min-width: 0'), 'layout should avoid horizontal scroll patterns');

const futurePaste = [
  '【カレンダー予定】',
  '日付：2026-07-05',
  '開始時間：09:00',
  '終了時間：11:00',
  'タイトル：LP／田中様／エアコンクリーニング',
  'お客様名：田中様',
  '作業内容：エアコンクリーニング',
  '住所：糸満市',
  '依頼元：LP',
  '予定金額：15000',
  '確度：予定'
].join('\n');

const multiPaste = Array.from({ length: 10 }, (_, i) => [
  '【カレンダー予定】',
  `日付：2026-07-${String(10 + i).padStart(2, '0')}`,
  '開始時間：09:00',
  '終了時間：11:00',
  `タイトル：LP／顧客${i + 1}様／エアコン`,
  `お客様名：顧客${i + 1}様`,
  '作業内容：エアコンクリーニング',
  '住所：那覇市',
  '依頼元：LP',
  `予定金額：${12000 + i * 100}`,
  '確度：予定'
].join('\n')).join('\n\n');

const excludedPaste = [
  '【カレンダー予定】',
  '日付：2026-07-08',
  '開始時間：09:00',
  '終了時間：11:00',
  'タイトル：LP／取消様／エアコン キャンセル',
  'お客様名：取消様',
  '作業内容：エアコン キャンセル',
  '住所：那覇市',
  '依頼元：LP',
  '予定金額：12000',
  '確度：予定',
  '',
  '【カレンダー予定】',
  '日付：2026-07-09',
  '開始時間：10:00',
  '終了時間：12:00',
  'タイトル：LP／見積様／見積のみ',
  'お客様名：見積様',
  '作業内容：見積のみ',
  '住所：浦添市',
  '依頼元：LP',
  '予定金額：10000',
  '確度：見積',
  '',
  '【カレンダー予定】',
  '日付：2026-07-10',
  '開始時間：13:00',
  '終了時間：15:00',
  'タイトル：LP／金額なし様／エアコン',
  'お客様名：金額なし様',
  '作業内容：エアコンクリーニング',
  '住所：宜野湾市',
  '依頼元：LP',
  '予定金額：',
  '確度：予定'
].join('\n');

{
  const { ctx } = createSandbox();
  runInContext(`
    var parsed = CalendarCandidateBrain.parseCalendarText(${JSON.stringify(multiPaste)});
    var preview = CalendarCandidateBrain.buildImportPreview(parsed, []);
    preview = CalendarCandidateBrain.attachFutureImportPreview(preview, '2026-06-28');
    var summary = CalendarCandidateBrain.summarizeFutureImportPreview(preview);
  `, ctx);
  assert(ctx.summary.readCount === 10, 'should read 10 schedule blocks');
  assert(ctx.summary.savableCount === 10, 'all 10 should be savable');
  assert(ctx.summary.duplicateCount === 0, 'no duplicates on first import');
  assert(ctx.summary.excludedCount === 0, 'no excluded on clean paste');
}

{
  const { ctx, localStorage } = createSandbox({
    budil_work_orders: '[]',
    budil_revenue_records: '[]'
  });
  runInContext(`
    var parsed = CalendarCandidateBrain.parseCalendarText(${JSON.stringify(multiPaste)});
    var preview = CalendarCandidateBrain.buildImportPreview(parsed, []);
    preview = CalendarCandidateBrain.attachFutureImportPreview(preview, '2026-06-28');
    var saved = 0;
    preview.items.forEach(function(item) {
      if (!CalendarCandidateBrain.isFutureImportSavable(item, false)) return;
      var payload = CalendarCandidateBrain.createWorkOrderPayload(item.candidate, {
        candidateStatus: '作業予定に追加済み'
      });
      Storage.addWorkOrder(payload);
      saved += 1;
    });
    var workOrders = Storage.getWorkOrders();
    var revenues = Storage.getRevenueRecords();
  `, ctx);
  assert(ctx.saved === 10, 'should save 10 work orders');
  assert(ctx.workOrders.length === 10, 'budil_work_orders should have 10 entries');
  assert(ctx.revenues.length === 0, 'must not add budil_revenue_records');
}

{
  const { ctx, localStorage } = createSandbox({
    budil_work_orders: '[]',
    budil_revenue_records: '[]'
  });
  runInContext(`
    var parsed = CalendarCandidateBrain.parseCalendarText(${JSON.stringify(futurePaste)});
    var preview = CalendarCandidateBrain.buildImportPreview(parsed, []);
    preview = CalendarCandidateBrain.attachFutureImportPreview(preview, '2026-06-28');
    var item = preview.items[0];
    var payload = CalendarCandidateBrain.createWorkOrderPayload(item.candidate, { candidateStatus: '作業予定に追加済み' });
    Storage.addWorkOrder(payload);
    var preview2 = CalendarCandidateBrain.buildImportPreview(parsed, Storage.getWorkOrders());
    preview2 = CalendarCandidateBrain.attachFutureImportPreview(preview2, '2026-06-28');
    var summary2 = CalendarCandidateBrain.summarizeFutureImportPreview(preview2);
    var workOrders = Storage.getWorkOrders();
  `, ctx);
  assert(ctx.summary2.readCount === 1, 're-import should still read 1');
  assert(ctx.summary2.duplicateCount === 1, 're-import should count 1 duplicate');
  assert(ctx.summary2.savableCount === 0, 'duplicate should not be savable');
  assert(ctx.workOrders.length === 1, 'duplicate must not add another work order');
}

{
  const { ctx } = createSandbox();
  runInContext(`
    var parsed = CalendarCandidateBrain.parseCalendarText(${JSON.stringify(excludedPaste)});
    var preview = CalendarCandidateBrain.buildImportPreview(parsed, []);
    preview = CalendarCandidateBrain.attachFutureImportPreview(preview, '2026-06-28');
    var summary = CalendarCandidateBrain.summarizeFutureImportPreview(preview);
    var savable = preview.items.filter(function(item) {
      return CalendarCandidateBrain.isFutureImportSavable(item, false);
    });
    var upcoming = RevenueSummaryBrain.buildUpcomingRevenueScheduleSummary([], '2026-06-28');
  `, ctx);
  assert(ctx.summary.readCount === 3, 'should read 3 excluded candidates');
  assert(ctx.summary.excludedCount === 3, 'all 3 should be excluded');
  assert(ctx.summary.savableCount === 0, 'none should be savable');
  assert(ctx.savable.length === 0, 'savable filter should return empty');
}

{
  const { ctx } = createSandbox();
  runInContext(`
    var parsed = CalendarCandidateBrain.parseCalendarText('');
    var preview = CalendarCandidateBrain.buildImportPreview(parsed, []);
    preview = CalendarCandidateBrain.attachFutureImportPreview(preview, '2026-06-28');
    var summary = CalendarCandidateBrain.summarizeFutureImportPreview(preview);
  `, ctx);
  assert(ctx.summary.readCount === 0, 'empty paste should read 0');
}

console.log('All v4.10.1 future schedule import result checks passed.');
