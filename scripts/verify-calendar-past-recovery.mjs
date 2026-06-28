/**
 * Calendar past recovery mode verification.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = join(root, 'js');

function load(path) {
  return readFileSync(join(root, path), 'utf8');
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

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
  runInContext(load('js/calendar-candidate-brain.js'), ctx, { filename: 'calendar-candidate-brain.js' });
  runInContext(load('js/storage.js'), ctx, { filename: 'storage.js' });
  return { ctx, localStorage };
}

function readSourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const rel = relative(root, path).replace(/\\/g, '/');
    if (rel.startsWith('.git/') || rel.startsWith('recovery/')) continue;
    if (rel === 'scripts/verify-calendar-past-recovery.mjs') continue;
    const st = statSync(path);
    if (st.isDirectory()) readSourceFiles(path, out);
    else if (/\.(js|mjs|html|md)$/.test(name)) out.push(path);
  }
  return out;
}

console.log('== calendar past recovery mode check ==');

for (const file of ['calendar-candidate-brain.js', 'storage.js', 'app.js']) {
  execSync(`node --check "${join(jsDir, file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const calendarBrain = load('js/calendar-candidate-brain.js');
const storageJs = load('js/storage.js');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.8.20'), 'header version should be v4.8.20');
assert(indexHtml.includes('Budil v4.8.20'), 'sidebar version should be v4.8.20');
assert(indexHtml.includes('js/app.js?v=4.8.20'), 'app.js cache buster should be v4.8.20');
assert(indexHtml.includes('calendar-past-recovery-mode'), 'past recovery mode toggle should exist');
assert(indexHtml.includes('btn-calendar-past-bulk-convert'), 'bulk convert button should exist');
assert(indexHtml.includes('\u767b\u9332\u5bfe\u8c61\u3092\u58f2\u4e0a\u767b\u9332'), 'bulk convert button label should exist');
assert(indexHtml.includes('\u4e00\u62ec\u58f2\u4e0a\u767b\u9332\u306e\u524d\u306b\u5b89\u5168\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u3092\u4f5c\u6210\u3057\u307e\u3059'), 'past recovery safety backup note should exist');
assert(indexHtml.includes('\u65e2\u5b58\u58f2\u4e0a\u306f\u4e0a\u66f8\u304d\u305b\u305a\u3001\u65b0\u898f\u5206\u3060\u3051\u8ffd\u52a0\u3057\u307e\u3059'), 'past recovery append-only note should exist');
assert(indexHtml.includes('\u5143\u306e\u30ab\u30ec\u30f3\u30c0\u30fc\u5fa9\u5143\u30c7\u30fc\u30bf\u306f\u524a\u9664\u3057\u307e\u305b\u3093'), 'past recovery non-delete note should exist');
assert(indexHtml.includes('\u767b\u9332\u5bfe\u8c61\u304c0\u4ef6\u306e\u3068\u304d\u306f\u4e00\u62ec\u58f2\u4e0a\u767b\u9332\u3067\u304d\u307e\u305b\u3093'), 'past recovery zero-candidate note should exist');
assert(indexHtml.includes('\u30ad\u30e3\u30f3\u30bb\u30eb\u3001\u898b\u7a4d\u3001\u65e5\u7a0b\u8abf\u6574\u4e2d\u3001\u91d1\u984d\u306a\u3057\u3001\u91cd\u8907\u7591\u3044\u306f\u4e00\u62ec\u767b\u9332\u5bfe\u8c61\u5916\u3067\u3059'), 'past recovery exclusion note should exist');
assert(appJs.includes('bulkConvertCalendarPastCandidatesToRevenue'), 'app should call bulk conversion');
assert(calendarBrain.includes('PAST_RECOVERY_REVENUE_CANDIDATE'), 'past recovery classifier should exist');
assert(storageJs.includes('calendar_past_candidates_bulk_converted_to_revenue'), 'bulk operation log should exist');

const calendarMeta = {
  importSource: 'calendar-paste',
  sourceType: 'work-order-candidate',
  candidateStatus: '売上実績候補',
  estimatedAmount: '20000'
};

const seedWorkOrders = [
  {
    id: 'work-eligible',
    customerName: '山田様',
    serviceText: 'エアコンクリーニング',
    source: 'LP',
    scheduledDate: '2026-04-15',
    startTime: '09:00',
    estimateAmount: 20000,
    status: 'tentative',
    candidateMeta: calendarMeta
  },
  {
    id: 'work-duplicate',
    customerName: '佐藤様',
    serviceText: 'エアコン通常',
    source: 'ヤマダ',
    scheduledDate: '2026-05-10',
    startTime: '10:00',
    estimateAmount: 15000,
    status: 'tentative',
    candidateMeta: calendarMeta
  },
  {
    id: 'work-cancel',
    customerName: '取消様',
    serviceText: 'エアコン キャンセル',
    source: 'LP',
    scheduledDate: '2026-06-01',
    estimateAmount: 10000,
    status: 'tentative',
    candidateMeta: calendarMeta
  },
  {
    id: 'work-no-amount',
    customerName: '金額なし様',
    serviceText: '浴室',
    source: 'LP',
    scheduledDate: '2026-06-02',
    estimateAmount: 0,
    status: 'tentative',
    candidateMeta: calendarMeta
  },
  {
    id: 'work-future',
    customerName: '未来様',
    serviceText: '浴室',
    source: 'LP',
    scheduledDate: '2026-06-28',
    estimateAmount: 18000,
    status: 'tentative',
    candidateMeta: calendarMeta
  }
];

const seedRevenues = [
  {
    id: 'rev-existing',
    workDate: '2026-05-10',
    customerName: '佐藤様',
    service: 'エアコン通常',
    source: 'ヤマダ',
    amount: 15000,
    status: '確定'
  }
];

{
  const { ctx, localStorage } = createSandbox({
    budil_work_orders: JSON.stringify(seedWorkOrders),
    budil_revenue_records: JSON.stringify(seedRevenues)
  });
  runInContext(`
    var report = CalendarCandidateBrain.buildPastRecoveryReport(
      Storage.getWorkOrders(),
      Storage.getRevenueRecords(),
      { startDate: '2026-04-01', endDate: '2026-06-30', today: '2026-06-27' }
    );
  `, ctx);
  assert(ctx.report.eligibleCount === 1, 'only one past candidate should be eligible');
  assert(ctx.report.totalAmount === 20000, 'eligible total should be 20000');
  assert(ctx.report.duplicateSuspectCount === 1, 'one duplicate should be suspected');
  assert(ctx.report.excludedCount === 3, 'cancel/no amount/future should be excluded');

  runInContext(`
    var result = Storage.bulkConvertCalendarPastCandidatesToRevenue(
      report.eligible.map(item => item.workOrder.id),
      { startDate: '2026-04-01', endDate: '2026-06-30', today: '2026-06-27' }
    );
  `, ctx);
  assert(ctx.result.ok === true, 'bulk conversion should succeed');
  assert(ctx.result.added === 1, 'one revenue should be added');
  assert(ctx.result.beforeCount === 1 && ctx.result.afterCount === 2, 'revenue count should increase by one');
  assert(ctx.result.addedAmount === 20000, 'added amount should be 20000');

  const revenues = parse(localStorage, 'budil_revenue_records', []);
  const workOrders = parse(localStorage, 'budil_work_orders', []);
  const logs = parse(localStorage, 'budil_operation_logs', []);
  const backups = parse(localStorage, 'budil_safety_backups', []);
  const added = revenues.find(r => r.sourceCandidateId === 'work-eligible');
  const converted = workOrders.find(w => w.id === 'work-eligible');
  const duplicate = workOrders.find(w => w.id === 'work-duplicate');

  assert(!!added, 'added revenue should keep sourceCandidateId');
  assert(!!added.calendarDedupeKey, 'added revenue should keep calendarDedupeKey');
  assert(added.confirmedFrom === 'calendar-past-recovery', 'added revenue should mark recovery source');
  assert(converted.actualRevenueId === added.id, 'candidate should link to added revenue');
  assert(converted.candidateMeta.candidateStatus === 'converted', 'candidate should become converted');
  assert(!duplicate.actualRevenueId, 'duplicate suspect should not be converted');
  assert(logs.filter(l => l.action === 'calendar_past_candidates_bulk_converted_to_revenue').length === 1,
    'bulk conversion should record one operation log');
  assert(backups.some(b => b.reason === 'before_calendar_past_bulk_revenue_convert'), 'revenue backup should exist');
  assert(backups.some(b => b.reason === 'before_calendar_past_bulk_candidate_convert'), 'work order backup should exist');
}

const sourceText = readSourceFiles(root).map(p => readFileSync(p, 'utf8')).join('\n');
assert(!(new RegExp('localStorage' + '\\.clear\\s*\\(')).test(sourceText), 'direct localStorage clear must not exist');
assert(!(new RegExp('saveRevenueRecords' + '\\s*\\(\\s*\\[\\s*\\]\\s*\\)')).test(sourceText), 'empty revenue save must not exist');

console.log('All calendar past recovery mode checks passed.');
