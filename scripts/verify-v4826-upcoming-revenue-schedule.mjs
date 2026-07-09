/**
 * Budil v4.10.1 upcoming revenue schedule summary verification.
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
  runInContext(load('js/work-order-brain.js'), ctx, { filename: 'work-order-brain.js' });
  runInContext(load('js/calendar-candidate-brain.js'), ctx, { filename: 'calendar-candidate-brain.js' });
  runInContext(load('js/revenue-summary-brain.js'), ctx, { filename: 'revenue-summary-brain.js' });
  runInContext(load('js/storage.js'), ctx, { filename: 'storage.js' });
  return { ctx, localStorage };
}

for (const file of ['revenue-summary-brain.js', 'app.js', 'work-order-brain.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const summaryBrain = load('js/revenue-summary-brain.js');
const css = load('css/style.css');

console.log('== v4.10.1 upcoming revenue schedule ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.12.4'), 'header version should be v4.10.1');
assert(indexHtml.includes('Budil v4.12.4'), 'sidebar version should be v4.10.1');
assert(indexHtml.includes('js/app.js?v=4.12.4'), 'app.js cache buster should be v4.10.1');
assert(indexHtml.includes('dash-upcoming-revenue-schedule'), 'dashboard upcoming schedule block should exist');
assert(indexHtml.includes('revenue-upcoming-schedule'), 'revenue view upcoming schedule block should exist');
assert(indexHtml.includes('\u58f2\u4e0a\u4e88\u5b9a\uff08\u672a\u78ba\u5b9a\uff09'), 'daily schedule title should show unconfirmed upcoming revenue');

assert(appJs.includes('buildUpcomingRevenueScheduleSummary'), 'app should use upcoming schedule summary');
assert(appJs.includes('renderUpcomingRevenueScheduleHtml'), 'upcoming schedule renderer should exist');
assert(appJs.includes('\u58f2\u4e0a\u4e88\u5b9a\uff08\u672a\u78ba\u5b9a\uff09'), 'unconfirmed label should appear in renderer');

assert(summaryBrain.includes('buildUpcomingRevenueScheduleSummary'), 'brain should define upcoming schedule summary');
assert(summaryBrain.includes('isUpcomingRevenueScheduleWorkOrder'), 'brain should filter upcoming schedule work orders');
assert(summaryBrain.includes('hasUpcomingScheduleExcludedWord'), 'brain should exclude estimate/cancel words');

assert(css.includes('upcoming-revenue-schedule-block'), 'upcoming schedule styles should exist');
assert(css.includes('overflow-x: hidden') || css.includes('min-width: 0'), 'layout should avoid horizontal scroll patterns');

const today = '2026-06-28';
const month = '2026-06';
const workOrders = [
  {
    id: 'wo-future-1',
    customerName: '田中様',
    serviceText: 'エアコンクリーニング',
    scheduledDate: '2026-06-30',
    estimateAmount: 22000,
    status: 'tentative'
  },
  {
    id: 'wo-future-2',
    customerName: '佐藤様',
    serviceText: '洗濯機クリーニング',
    scheduledDate: '2026-07-05',
    estimateAmount: 15000,
    status: 'confirmed'
  },
  {
    id: 'wo-future-3',
    customerName: '鈴木様',
    serviceText: '浴室クリーニング',
    scheduledDate: '2026-06-29',
    estimateAmount: 18000,
    status: 'tentative',
    candidateMeta: { importSource: 'calendar-paste', sourceType: 'work-order-candidate', candidateStatus: '作業予定に追加済み' }
  },
  {
    id: 'wo-no-amount',
    customerName: '金額なし様',
    serviceText: 'エアコン',
    scheduledDate: '2026-07-01',
    estimateAmount: 0,
    status: 'tentative'
  },
  {
    id: 'wo-cancel',
    customerName: '取消様',
    serviceText: 'エアコン キャンセル',
    scheduledDate: '2026-07-02',
    estimateAmount: 12000,
    status: 'tentative'
  },
  {
    id: 'wo-estimate',
    customerName: '見積様',
    serviceText: '見積のみ',
    scheduledDate: '2026-07-03',
    estimateAmount: 10000,
    status: 'tentative'
  },
  {
    id: 'wo-past',
    customerName: '過去様',
    serviceText: 'レンジフード',
    scheduledDate: '2026-06-20',
    estimateAmount: 16000,
    status: 'tentative'
  },
  {
    id: 'wo-confirmed-revenue',
    customerName: '確定済み様',
    serviceText: 'キッチン',
    scheduledDate: '2026-07-04',
    estimateAmount: 20000,
    status: 'completed',
    actualRevenueId: 'rev-1'
  }
];

{
  const { ctx } = createSandbox();
  runInContext(`
    var summary = RevenueSummaryBrain.buildUpcomingRevenueScheduleSummary(${JSON.stringify(workOrders)}, ${JSON.stringify(today)});
  `, ctx);
  const s = ctx.summary;
  assert(s.monthCount === 2, 'this month should include two upcoming schedules (6/29 and 6/30)');
  assert(s.monthTotal === 40000, 'this month total should be 22000 + 18000');
  assert(s.upcomingCount === 3, 'eligible upcoming schedules should be 3');
  assert(s.upcoming.length === 3, 'upcoming list should cap at 3 items');
  assert(s.upcoming[0].scheduledDate === '2026-06-29', 'nearest upcoming should be 6/29');
  assert(s.upcoming.every(i => i.amount > 0), 'upcoming items should have amounts');
  assert(!s.upcoming.some(i => i.customerName === '取消様'), 'cancel wording should be excluded');
  assert(!s.upcoming.some(i => i.customerName === '見積様'), 'estimate-only wording should be excluded');
  assert(!s.upcoming.some(i => i.customerName === '確定済み様'), 'revenue-confirmed work order should be excluded');
}

{
  const { ctx, localStorage } = createSandbox({
    budil_work_orders: JSON.stringify(workOrders),
    budil_revenue_records: '[]',
    budil_monthly_results: '[]'
  });
  runInContext(`
    var payload = CalendarCandidateBrain.createWorkOrderPayload({
      customerName: '新規様',
      serviceText: 'エアコン',
      scheduledDate: '2026-07-10',
      estimateAmount: 14000,
      source: 'LP'
    }, { candidateStatus: '作業予定に追加済み' });
    Storage.addWorkOrder(payload);
    var revenues = Storage.getRevenueRecords();
    var monthly = localStorage.getItem('budil_monthly_results');
  `, ctx);
  assert(ctx.revenues.length === 0, 'schedule import must not add revenue records');
  assert(!ctx.monthly || ctx.monthly === '[]', 'monthly results must remain unchanged');
}

console.log('All v4.10.1 upcoming revenue schedule checks passed.');
