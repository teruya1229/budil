/**
 * Budil v4.10.1 future schedule import UI-flow verification.
 * Simulates btn-calendar-candidate-parse → btn-calendar-candidate-save-all
 * (same handler sequence as js/app.js), starting from empty storage.
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

function parseStore(localStorage, key, fallback) {
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
  for (const file of [
    'revenue-brain.js',
    'reception-brain.js',
    'work-order-brain.js',
    'work-completion-brain.js',
    'revenue-summary-brain.js',
    'calendar-candidate-brain.js',
    'storage.js'
  ]) {
    runInContext(load(`js/${file}`), ctx, { filename: file });
  }
  return { ctx, localStorage };
}

/**
 * Mirrors parseCalendarCandidatePaste + saveAllCalendarCandidates in app.js
 * for future import mode (PAST_RECOVERY_UI_ENABLED = false).
 */
function runScheduleImportUiFlow(ctx, pasteText, today) {
  runInContext(`
    var PAST_RECOVERY_ENABLED = false;
    var pasteText = ${JSON.stringify(pasteText)};
    var today = ${JSON.stringify(today)};

    function getCalendarFutureImportSummary(preview) {
      return preview.futureImportSummary
        ? Object.assign({}, preview.futureImportSummary)
        : CalendarCandidateBrain.summarizeFutureImportPreview(preview);
    }

    function getCalendarImportCandidateStatus(item) {
      if (item.pastRecovery && item.pastRecovery.status) return item.pastRecovery.status;
      return '作業予定に追加済み';
    }

    // === btn-calendar-candidate-parse (future import branch) ===
    var parsed = CalendarCandidateBrain.parseCalendarText(pasteText);
    var preview = CalendarCandidateBrain.buildImportPreview(parsed, Storage.getWorkOrders());
    preview = CalendarCandidateBrain.attachFutureImportPreview(preview, today);
    var previewSummary = getCalendarFutureImportSummary(preview);

    // === btn-calendar-candidate-save-all ===
    var saveSummary = getCalendarFutureImportSummary(preview);
    var savableItems = preview.items.filter(function(item) {
      return CalendarCandidateBrain.isFutureImportSavable(item, false);
    });
    var saved = 0;
    savableItems.forEach(function(item) {
      if (!CalendarCandidateBrain.isFutureImportSavable(item, false)) return;
      if (item.isDuplicate) return;
      var payload = CalendarCandidateBrain.createWorkOrderPayload(item.candidate, {
        originalText: preview.rawText,
        candidateStatus: getCalendarImportCandidateStatus(item)
      });
      Storage.addWorkOrder(payload);
      saved += 1;
    });
    saveSummary.savedCount = saved;
    saveSummary.revenueRegistered = false;

    var workOrders = Storage.getWorkOrders();
    var revenues = Storage.getRevenueRecords();
    var upcoming = RevenueSummaryBrain.buildUpcomingRevenueScheduleSummary(workOrders, today);
    uiFlowResult = {
      previewSummary: previewSummary,
      saveSummary: saveSummary,
      workOrders: workOrders,
      revenues: revenues,
      upcoming: upcoming
    };
  `, ctx);
  return ctx.uiFlowResult;
}

for (const file of ['calendar-candidate-brain.js', 'storage.js', 'app.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const calendarBrain = load('js/calendar-candidate-brain.js');
const css = load('css/style.css');

console.log('== v4.10.1 future schedule import UI flow ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.12.0'), 'header version should be v4.10.4');
assert(indexHtml.includes('Budil v4.12.0'), 'sidebar version should be v4.10.4');
assert(indexHtml.includes('js/app.js?v=4.12.0'), 'app.js cache buster should be v4.10.4');
assert(load('js/storage.js').includes("BUDIL_VERSION: 'v4.12.0'"), 'storage version should be v4.10.4');

assert(indexHtml.includes('JSON\u53d6\u308a\u8fbc\u307f') || indexHtml.includes('JSON\u51fa\u529b'), 'paste hint should mention json import');
assert(indexHtml.includes('Budil\u306f\u30ab\u30ec\u30f3\u30c0\u30fc\u306b\u76f4\u63a5\u63a5\u7d9a\u3057\u307e\u305b\u3093') || indexHtml.includes('\u6b63\u672c\u30d5\u30ed\u30fc'), 'paste hint should clarify no direct calendar API');
assert(indexHtml.includes('\u53d6\u308a\u8fbc\u307f\u7528\u30d5\u30a9\u30fc\u30de\u30c3\u30c8\u3092\u30b3\u30d4\u30fc'), 'copy button should describe format copy');

assert(appJs.includes('renderCalendarCandidateImportSummaryHtml'), 'import result renderer should exist');
assert(appJs.includes('\u65e5\u4ed8\u304c\u8aad\u307f\u53d6\u308c\u308b\u5f62\u5f0f\u3067\u3059\u304b\uff1f'), 'zero-case should mention date format');
assert(appJs.includes('PAST_RECOVERY_UI_ENABLED = false'), 'past recovery UI should stay disabled');

assert(calendarBrain.includes('hasFutureImportExcludedWord'), 'future import exclusion helper should exist');
assert(calendarBrain.includes('calendarDedupeKey'), 'calendar dedupe key should remain');
assert(calendarBrain.includes('type: \'calendarDedupeKey\''), 'duplicate detection should use calendarDedupeKey');

assert(css.includes('calendar-candidate-import-result'), 'import result styles should exist');

const today = '2026-06-30';
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
  '確度：未確定'
].join('\n');

const pastPaste = [
  '【カレンダー予定】',
  '日付：2026-05-01',
  '開始時間：10:00',
  '終了時間：12:00',
  'タイトル：LP／過去様／浴室クリーニング',
  'お客様名：過去様',
  '作業内容：浴室クリーニング',
  '住所：那覇市',
  '依頼元：LP',
  '予定金額：12000',
  '確度：予定'
].join('\n');

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
  '確度：予定'
].join('\n');

{
  const { ctx } = createSandbox();
  const result = runScheduleImportUiFlow(ctx, futurePaste, today);
  assert(result.previewSummary.readCount === 1, 'UI parse should read 1 item');
  assert(result.previewSummary.savableCount === 1, '未確定 confidence should remain savable');
  assert(result.saveSummary.savedCount === 1, 'UI save should persist 1 work order');
  assert(result.revenues.length === 0, 'UI save must not add budil_revenue_records');
  const wo = result.workOrders[0];
  assert(wo.calendarDedupeKey, 'saved work order should keep calendarDedupeKey');
  assert(wo.candidateMeta && wo.candidateMeta.importSource === 'calendar-paste', 'importSource should be calendar-paste');
  assert(wo.candidateMeta.sourceType === 'work-order-candidate', 'sourceType should be work-order-candidate');
  assert(wo.candidateMeta.candidateStatus === '作業予定に追加済み', 'import should promote to operational work order status');
  assert(result.upcoming.upcomingCount === 1, 'saved import should appear in upcoming revenue schedule');
}

{
  const { ctx } = createSandbox();
  const first = runScheduleImportUiFlow(ctx, futurePaste, today);
  assert(first.saveSummary.savedCount === 1, 'first import should save once');
  const second = runScheduleImportUiFlow(ctx, futurePaste, today);
  assert(second.previewSummary.duplicateCount === 1, 're-import should count duplicate');
  assert(second.previewSummary.savableCount === 0, 'duplicate should not be savable');
  assert(second.saveSummary.savedCount === 0, 'duplicate re-import should not save again');
  assert(parseStore(ctx.localStorage, 'budil_work_orders', []).length === 1, 'duplicate must not double-save');
}

{
  const { ctx } = createSandbox();
  const result = runScheduleImportUiFlow(ctx, pastPaste, today);
  assert(result.previewSummary.savableCount === 1, 'past date with amount should be savable');
  assert(result.saveSummary.savedCount === 1, 'past date with amount may save via future import UI');
}

{
  const { ctx } = createSandbox();
  const result = runScheduleImportUiFlow(ctx, excludedPaste, today);
  assert(result.previewSummary.excludedCount === 1, 'cancel wording should be excluded');
  assert(result.saveSummary.savedCount === 0, 'excluded item should not save');
}

{
  const { ctx } = createSandbox();
  const result = runScheduleImportUiFlow(ctx, '', today);
  assert(result.previewSummary.readCount === 0, 'empty paste should read 0');
  assert(result.saveSummary.savedCount === 0, 'empty paste should save 0');
}

console.log('All v4.10.1 future schedule import UI flow checks passed.');
