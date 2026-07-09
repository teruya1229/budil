/**
 * Budil v4.10.1 schedule → revenue confirmation flow verification.
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

function createSandbox(seed = {}, extraBrains = []) {
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
  const brains = [
    'revenue-brain.js',
    'work-order-brain.js',
    'calendar-candidate-brain.js',
    'work-completion-brain.js',
    'revenue-summary-brain.js',
    ...extraBrains
  ];
  brains.forEach(file => runInContext(load(`js/${file}`), ctx, { filename: file }));
  runInContext(load('js/storage.js'), ctx, { filename: 'storage.js' });
  return { ctx, localStorage };
}

for (const file of ['revenue-summary-brain.js', 'work-completion-brain.js', 'app.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const summaryBrain = load('js/revenue-summary-brain.js');
const completionBrain = load('js/work-completion-brain.js');

console.log('== v4.10.1 schedule to revenue flow ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.12.3'), 'header version should be v4.10.1');
assert(indexHtml.includes('Budil v4.12.3'), 'sidebar version should be v4.10.1');
assert(indexHtml.includes('js/app.js?v=4.12.3'), 'app.js cache buster should be v4.10.1');
assert(indexHtml.includes('\u58f2\u4e0a\u4e88\u5b9a\uff08\u672a\u78ba\u5b9a\uff09'), 'daily schedule title should show unconfirmed label');
assert(indexHtml.includes('daily-section-schedule'), 'daily schedule section should exist');
assert(indexHtml.indexOf('daily-section-schedule') < indexHtml.indexOf('daily-section-revenue-assist'),
  'schedule section should appear before manual revenue assist');

assert(appJs.includes('isRevenueConfirmationQueueCandidate') || summaryBrain.includes('isRevenueConfirmationQueueCandidate'), 'queue candidate filter should exist');
assert(appJs.includes('showFlowNote'), 'daily schedule should show flow note');
assert(appJs.includes('\u4f5c\u696d\u65e5\u5f53\u65e5\u4ee5\u964d\u3067\u3001\u307e\u3060\u58f2\u4e0a\u78ba\u5b9a\u3057\u3066\u3044\u306a\u3044\u4e88\u5b9a'), 'revenue queue lead should mention on-or-after work day');

assert(summaryBrain.includes('isRevenueConfirmationQueueCandidate'), 'brain should define queue candidate helper');
assert(summaryBrain.includes('flowNote'), 'brain should define flow note');

assert(completionBrain.includes('calendarDedupeKey'), 'work completion should preserve calendarDedupeKey');
assert(completionBrain.includes('sourceCandidateId'), 'work completion should preserve sourceCandidateId');

const today = '2026-06-28';
const futureWo = {
  id: 'wo-future',
  customerName: '未来様',
  serviceText: 'エアコンクリーニング',
  scheduledDate: '2026-07-05',
  estimateAmount: 22000,
  status: 'confirmed',
  candidateMeta: { importSource: 'calendar-paste', sourceType: 'work-order-candidate', candidateStatus: '作業予定に追加済み' },
  calendarDedupeKey: 'calendar-past-recovery|2026-07-05|未来様|22000|エアコンクリーニング|lp'
};
const pastWo = {
  id: 'wo-past',
  customerName: '過去様',
  serviceText: '浴室クリーニング',
  scheduledDate: '2026-06-25',
  estimateAmount: 18000,
  status: 'confirmed',
  candidateMeta: { importSource: 'calendar-paste', sourceType: 'work-order-candidate', candidateStatus: '作業予定に追加済み' },
  calendarDedupeKey: 'calendar-past-recovery|2026-06-25|過去様|18000|浴室クリーニング|lp'
};
const todayWo = {
  id: 'wo-today',
  customerName: '今日様',
  serviceText: 'レンジフード',
  scheduledDate: '2026-06-28',
  estimateAmount: 15000,
  status: 'confirmed',
  candidateMeta: { importSource: 'calendar-paste', sourceType: 'work-order-candidate', candidateStatus: '作業予定に追加済み' }
};
const confirmedWo = {
  id: 'wo-done',
  customerName: '確定済み様',
  serviceText: 'キッチン',
  scheduledDate: '2026-06-20',
  estimateAmount: 20000,
  status: 'completed',
  actualRevenueId: 'rev-done',
  calendarDedupeKey: 'calendar-past-recovery|2026-06-20|確定済み様|20000|キッチン|lp'
};

{
  const { ctx } = createSandbox();
  runInContext(`
    var today = ${JSON.stringify(today)};
    var future = RevenueSummaryBrain.isUpcomingRevenueScheduleWorkOrder(${JSON.stringify(futureWo)}, today);
    var pastUpcoming = RevenueSummaryBrain.isUpcomingRevenueScheduleWorkOrder(${JSON.stringify(pastWo)}, today);
    var todayUpcoming = RevenueSummaryBrain.isUpcomingRevenueScheduleWorkOrder(${JSON.stringify(todayWo)}, today);
    var confirmedUpcoming = RevenueSummaryBrain.isUpcomingRevenueScheduleWorkOrder(${JSON.stringify(confirmedWo)}, today);
    var futureQueue = RevenueSummaryBrain.isRevenueConfirmationQueueCandidate(${JSON.stringify(futureWo)}, today);
    var pastQueue = RevenueSummaryBrain.isRevenueConfirmationQueueCandidate(${JSON.stringify(pastWo)}, today);
    var todayQueue = RevenueSummaryBrain.isRevenueConfirmationQueueCandidate(${JSON.stringify(todayWo)}, today);
    var confirmedQueue = RevenueSummaryBrain.isRevenueConfirmationQueueCandidate(${JSON.stringify(confirmedWo)}, today);
  `, ctx);
  assert(ctx.future === true, 'future schedule should appear in upcoming revenue');
  assert(ctx.pastUpcoming === false, 'past schedule should not appear in upcoming revenue');
  assert(ctx.todayUpcoming === true, 'today schedule may appear in upcoming revenue on work day');
  assert(ctx.confirmedUpcoming === false, 'confirmed schedule should not appear in upcoming revenue');
  assert(ctx.futureQueue === false, 'future schedule should not appear in revenue queue yet');
  assert(ctx.pastQueue === true, 'past schedule should appear in revenue queue');
  assert(ctx.todayQueue === false, 'today schedule should not enter revenue queue until after work day');
  assert(ctx.confirmedQueue === false, 'confirmed schedule should not appear in revenue queue');
}

{
  const { ctx, localStorage } = createSandbox({
    budil_work_orders: JSON.stringify([pastWo]),
    budil_revenue_records: '[]'
  });
  runInContext(`
    var wo = Storage.getWorkOrders()[0];
    var input = {
      workDate: '2026-06-25',
      customerName: '過去様',
      actualService: '浴室クリーニング',
      service: '浴室クリーニング',
      source: 'LP',
      amount: 18000,
      paymentStatus: '未入金',
      actualMemo: '',
      followMemo: ''
    };
    var payload = WorkCompletionBrain.createRevenuePayloadFromWorkOrder(wo, input);
    var record = Storage.addRevenueRecord(payload);
    var patch = WorkCompletionBrain.markWorkOrderCompleted(wo, record, input);
    Storage.updateWorkOrder(wo.id, patch);
    var updated = Storage.getWorkOrders()[0];
    var upcoming = RevenueSummaryBrain.isUpcomingRevenueScheduleWorkOrder(updated, '2026-06-28');
    var queue = RevenueSummaryBrain.isRevenueConfirmationQueueCandidate(updated, '2026-06-28');
  `, ctx);
  const revenues = parse(localStorage, 'budil_revenue_records', []);
  const record = revenues[0];
  const wo = parse(localStorage, 'budil_work_orders', [])[0];
  assert(revenues.length === 1, 'revenue confirm should add one revenue record');
  assert(record.calendarDedupeKey === pastWo.calendarDedupeKey, 'calendarDedupeKey should be preserved on revenue');
  assert(record.sourceCandidateId === pastWo.id, 'sourceCandidateId should be preserved on revenue');
  assert(record.sourceWorkOrderId === pastWo.id, 'sourceWorkOrderId should be preserved on revenue');
  assert(wo.actualRevenueId === record.id, 'work order should keep actualRevenueId');
  assert(ctx.upcoming === false, 'confirmed work order should be excluded from upcoming revenue');
  assert(ctx.queue === false, 'confirmed work order should be excluded from revenue queue');
}

console.log('All v4.10.1 schedule to revenue flow checks passed.');
