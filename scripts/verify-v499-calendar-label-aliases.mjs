/**
 * Budil v4.10.1 calendar paste label alias verification.
 * Uses the same parse → preview → save handler sequence as the import UI.
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
    _data: data
  };
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

function runScheduleImportUiFlow(ctx, pasteText, today) {
  runInContext(`
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

    var parsed = CalendarCandidateBrain.parseCalendarText(pasteText);
    var preview = CalendarCandidateBrain.buildImportPreview(parsed, Storage.getWorkOrders());
    preview = CalendarCandidateBrain.attachFutureImportPreview(preview, today);
    var previewSummary = getCalendarFutureImportSummary(preview);
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
    uiFlowResult = {
      parsed: parsed.candidates[0] || null,
      previewSummary: previewSummary,
      saveSummary: saveSummary,
      workOrders: Storage.getWorkOrders(),
      revenues: Storage.getRevenueRecords(),
      upcoming: RevenueSummaryBrain.buildUpcomingRevenueScheduleSummary(Storage.getWorkOrders(), today)
    };
  `, ctx);
  return ctx.uiFlowResult;
}

for (const file of ['calendar-candidate-brain.js', 'storage.js', 'app.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const calendarBrain = load('js/calendar-candidate-brain.js');

console.log('== v4.10.1 calendar label aliases ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.12.0'), 'header version should be v4.10.10');
assert(indexHtml.includes('Budil v4.12.0'), 'sidebar version should be v4.10.10');
assert(indexHtml.includes('js/app.js?v=4.12.0'), 'app.js cache buster should be v4.10.10');
assert(load('js/storage.js').includes("BUDIL_VERSION: 'v4.12.0'"), 'storage version should be v4.10.10');

assert(calendarBrain.includes('PASTE_LABEL_ALIASES'), 'label alias map should exist');
assert(calendarBrain.includes("'件名': 'title'"), '件名 alias should map to title');
assert(calendarBrain.includes("'金額': 'estimateAmount'"), '金額 alias should map to estimateAmount');
assert(calendarBrain.includes('parseTimeField'), 'time range parser should exist');
assert(calendarBrain.includes('inferFromPlainTitle'), 'plain title inference should exist');

const today = '2026-06-30';
const aliasSample = [
  '【カレンダー予定】',
  '日付：2099-12-01',
  '時間：10:00-12:00',
  '件名：テスト様 エアコンクリーニング',
  '金額：12,000円',
  '確度：未確定',
  '住所：沖縄県南城市',
  'メモ：未来予定取り込みテスト'
].join('\n');

const standardSample = [
  '【カレンダー予定】',
  '日付：2099-12-01',
  '開始時間：10:00',
  '終了時間：12:00',
  'タイトル：LP／テスト様／エアコンクリーニング',
  'お客様名：テスト様',
  '作業内容：エアコンクリーニング',
  '住所：沖縄県南城市',
  '依頼元：LP',
  '予定金額：15000',
  '確度：予定'
].join('\n');

const cancelSample = [
  '【カレンダー予定】',
  '日付：2099-12-02',
  '時間：10:00-11:00',
  '件名：キャンセル テスト様',
  '金額：12000',
  'メモ：対象外テスト'
].join('\n');

const noAmountSample = [
  '【カレンダー予定】',
  '日付：2099-12-03',
  '時間：10:00-11:00',
  '件名：金額なし テスト様',
  'メモ：金額なしテスト'
].join('\n');

const pastSample = [
  '【カレンダー予定】',
  '日付：2020-01-01',
  '時間：10:00-11:00',
  '件名：過去日付 テスト様',
  '金額：12000',
  'メモ：過去日付対象外テスト'
].join('\n');

const kariSample = [
  '【カレンダー予定】',
  '日付：2099-12-10',
  '時間：09:00〜11:00',
  '件名：仮予定様 エアコン',
  '金額：￥10000',
  '状態：仮予定'
].join('\n');

{
  const { ctx } = createSandbox({ budil_work_orders: '[]', budil_revenue_records: '[]' });
  const result = runScheduleImportUiFlow(ctx, aliasSample, today);
  const c = result.parsed;
  assert(c.scheduledDate === '2099-12-01', 'alias sample should parse date');
  assert(c.startTime === '10:00', 'alias sample should parse start time');
  assert(c.endTime === '12:00', 'alias sample should parse end time');
  assert(c.title.includes('テスト様'), 'alias sample should parse 件名 as title');
  assert(c.estimateAmount === 12000, 'alias sample should parse comma/yen amount');
  assert(c.customerName === 'テスト様', 'alias sample should infer customer from 件名');
  assert(result.previewSummary.savableCount === 1, 'alias sample should be savable');
  assert(result.saveSummary.savedCount === 1, 'alias sample should save one work order');
  assert(result.revenues.length === 0, 'alias sample must not add revenue records');
  assert(result.upcoming.upcomingCount === 1, 'alias sample should appear in upcoming revenue');
  const wo = result.workOrders[0];
  assert(wo.calendarDedupeKey, 'saved work order should keep calendarDedupeKey');
  assert(wo.candidateMeta && wo.candidateMeta.sourceType === 'work-order-candidate', 'sourceType should remain');
}

{
  const { ctx } = createSandbox({ budil_work_orders: '[]', budil_revenue_records: '[]' });
  const first = runScheduleImportUiFlow(ctx, aliasSample, today);
  assert(first.saveSummary.savedCount === 1, 'first alias import should save');
  const second = runScheduleImportUiFlow(ctx, aliasSample, today);
  assert(second.previewSummary.duplicateCount === 1, 'alias re-import should count duplicate');
  assert(second.saveSummary.savedCount === 0, 'alias re-import should not save again');
  assert(second.workOrders.length === 1, 'duplicate must not double-save');
}

{
  const { ctx } = createSandbox({ budil_work_orders: '[]', budil_revenue_records: '[]' });
  const result = runScheduleImportUiFlow(ctx, standardSample, today);
  assert(result.saveSummary.savedCount === 1, 'standard format should still save');
  assert(result.parsed.estimateAmount === 15000, 'standard format amount should parse');
}

{
  const { ctx } = createSandbox();
  const result = runScheduleImportUiFlow(ctx, kariSample, today);
  assert(result.previewSummary.savableCount === 0, '仮予定 should be excluded from savable future import');
  assert(result.previewSummary.excludedCount === 1, '仮予定 alone should exclude from import');
}

{
  const { ctx } = createSandbox();
  const result = runScheduleImportUiFlow(ctx, cancelSample, today);
  assert(result.previewSummary.excludedCount === 1, 'cancel in 件名 should be excluded');
  assert(result.saveSummary.savedCount === 0, 'cancel sample should not save');
}

{
  const { ctx } = createSandbox();
  const result = runScheduleImportUiFlow(ctx, noAmountSample, today);
  assert(result.previewSummary.excludedCount === 1, 'no amount sample should be excluded');
  assert(result.saveSummary.savedCount === 0, 'no amount sample should not save');
}

{
  const { ctx } = createSandbox();
  const result = runScheduleImportUiFlow(ctx, pastSample, today);
  assert(result.previewSummary.savableCount === 1, 'past date with amount should be savable');
  assert(result.saveSummary.savedCount === 1, 'past date with amount should save');
}

console.log('All v4.10.1 calendar label alias checks passed.');
