/**
 * Budil v4.10.1 near-future schedule import verification.
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
  runInContext(load('js/calendar-candidate-brain.js'), ctx, { filename: 'calendar-candidate-brain.js' });
  runInContext(load('js/storage.js'), ctx, { filename: 'storage.js' });
  return { ctx, localStorage };
}

for (const file of ['calendar-candidate-brain.js', 'storage.js', 'app.js', 'work-completion-brain.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const calendarBrain = load('js/calendar-candidate-brain.js');

console.log('== v4.10.1 future schedule import ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.12.4'), 'header version should be v4.10.1');
assert(indexHtml.includes('Budil v4.12.4'), 'sidebar version should be v4.10.1');
assert(indexHtml.includes('js/app.js?v=4.12.4'), 'app.js cache buster should be v4.10.1');

assert(indexHtml.includes('JSON\u51fa\u529b') || indexHtml.includes('JSON\u53d6\u308a\u8fbc\u307f'), 'future import subtitle should mention json import');
assert(indexHtml.includes('\u78ba\u5b9a\u58f2\u4e0a\u306b\u306f\u307e\u3060\u5165\u308a\u307e\u305b\u3093') || indexHtml.includes('\u78ba\u5b9a\u58f2\u4e0a\u306b\u306f\u5165\u308a\u307e\u305b\u3093'), 'future import should clarify not confirmed revenue');
assert(indexHtml.includes('calendar-past-recovery-panel hidden'), 'past recovery panel should stay hidden');
assert(!indexHtml.includes('nav-label">\u904e\u53bb\u58f2\u4e0a\u5fa9\u5143'), 'past recovery nav label should not appear');
assert(indexHtml.includes('id="mgmt-calendar-candidates-section"'), 'morning past recovery section id should exist');
assert(indexHtml.includes('morning-section hidden') && indexHtml.includes('mgmt-calendar-candidates-section'), 'morning past recovery section should stay hidden');

assert(appJs.includes('PAST_RECOVERY_UI_ENABLED = false'), 'past recovery UI should remain disabled');
assert(appJs.includes('attachFutureImportPreview'), 'future import preview helper should be wired');
assert(appJs.includes('getCalendarImportCandidateStatus'), 'import status helper should exist');
assert(appJs.includes('\u4f5c\u696d\u4e88\u5b9a\u306b\u8ffd\u52a0\u6e08\u307f'), 'saved imports should default to operational work order status');

assert(calendarBrain.includes('hasFutureImportExcludedWord'), 'future import exclusion helper should exist');
assert(calendarBrain.includes('isOnOrAfterToday'), 'today-or-later helper should exist');
assert(calendarBrain.includes('\u58f2\u4e0a\u78ba\u5b9a\u5f85\u3061\u304b\u3089\u58f2\u4e0a\u5316'), 'browser prompt should mention revenue queue');

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

const completedPaste = [
  '【カレンダー予定】',
  '日付：2026-06-25',
  '開始時間：13:00',
  '終了時間：15:00',
  'タイトル：ヤマダ／作業後様／レンジフード',
  'お客様名：作業後様',
  '作業内容：レンジフードクリーニング',
  '住所：浦添市',
  '依頼元：ヤマダ',
  '予定金額：18000',
  '確度：確定っぽい'
].join('\n');

{
  const { ctx, localStorage } = createSandbox({
    budil_work_orders: '[]',
    budil_revenue_records: '[]'
  });
  runInContext(`
    var parsed = CalendarCandidateBrain.parseCalendarText(${JSON.stringify(futurePaste)});
    var preview = CalendarCandidateBrain.buildImportPreview(parsed, Storage.getWorkOrders());
    preview = CalendarCandidateBrain.attachFutureImportPreview(preview, '2026-06-28');
    var item = preview.items[0];
    var payload = CalendarCandidateBrain.createWorkOrderPayload(item.candidate, {
      originalText: ${JSON.stringify(futurePaste)},
      candidateStatus: '作業予定に追加済み'
    });
    var added = Storage.addWorkOrder(payload);
  `, ctx);

  const workOrders = parse(localStorage, 'budil_work_orders', []);
  const revenues = parse(localStorage, 'budil_revenue_records', []);
  assert(workOrders.length === 1, 'future import should save one work order');
  assert(revenues.length === 0, 'future import alone must not add revenue records');
  const wo = workOrders[0];
  assert(wo.calendarDedupeKey, 'work order should have calendarDedupeKey');
  assert(wo.candidateMeta && wo.candidateMeta.importSource === 'calendar-paste', 'import source should be calendar-paste');
  assert(wo.candidateMeta.sourceType === 'work-order-candidate', 'sourceType should be work-order-candidate');
  assert(wo.scheduledDate === '2026-07-05', 'future date should be preserved');
}

{
  const { ctx, localStorage } = createSandbox({
    budil_work_orders: '[]',
    budil_revenue_records: '[]'
  });
  runInContext(`
    var parsed = CalendarCandidateBrain.parseCalendarText(${JSON.stringify(futurePaste)});
    var preview = CalendarCandidateBrain.buildImportPreview(parsed, Storage.getWorkOrders());
    var item = preview.items[0];
    var payload = CalendarCandidateBrain.createWorkOrderPayload(item.candidate, {
      originalText: ${JSON.stringify(futurePaste)},
      candidateStatus: '作業予定に追加済み'
    });
    Storage.addWorkOrder(payload);
    var preview2 = CalendarCandidateBrain.buildImportPreview(parsed, Storage.getWorkOrders());
  `, ctx);
  assert(ctx.preview2.items[0].isDuplicate === true, 'duplicate import should be detected');
  const workOrders = parse(localStorage, 'budil_work_orders', []);
  assert(workOrders.length === 1, 'duplicate import should not add another work order without force');
}

{
  const { ctx } = createSandbox({
    budil_work_orders: '[]',
    budil_revenue_records: '[]'
  });
  runInContext(`
    var parsed = CalendarCandidateBrain.parseCalendarText(${JSON.stringify(pastPaste)});
    var preview = CalendarCandidateBrain.buildImportPreview(parsed, Storage.getWorkOrders());
    preview = CalendarCandidateBrain.attachFutureImportPreview(preview, '2026-06-28');
  `, ctx);
  assert(ctx.preview.items[0].isPastDate === true, 'past date should be flagged in future import preview');
  assert(ctx.preview.items[0].futureImport.status === 'eligible', 'past date with amount should remain eligible');
  assert(ctx.preview.items[0].futureImport.savable === true, 'past date with amount should be savable');
}

{
  const { ctx } = createSandbox({
    budil_work_orders: '[]',
    budil_revenue_records: '[]'
  });
  runInContext(`
    var parsed = CalendarCandidateBrain.parseCalendarText(${JSON.stringify(completedPaste)});
    var preview = CalendarCandidateBrain.buildImportPreview(parsed, Storage.getWorkOrders());
    var item = preview.items[0];
    var payload = CalendarCandidateBrain.createWorkOrderPayload(item.candidate, {
      originalText: ${JSON.stringify(completedPaste)},
      candidateStatus: '作業予定に追加済み'
    });
    var wo = Storage.addWorkOrder(payload);
    var normalized = WorkOrderBrain.normalizeWorkOrder(wo);
    var inQueue = WorkCompletionBrain.isOperationalWorkOrder(normalized)
      && !normalized.actualRevenueId
      && normalized.scheduledDate <= '2026-06-28'
      && WorkCompletionBrain.needsCompletionConfirm(normalized, '2026-06-28');
  `, ctx);
  assert(ctx.inQueue === true, 'past-scheduled imported work order should be revenue-queue eligible');
}

console.log('All v4.10.1 future schedule import checks passed.');
