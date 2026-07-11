/**
 * Budil v4.12.10 - profit source display aligned with revenue analysis.
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = (path) => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
};

for (const file of ['js/profit-brain.js', 'js/revenue-summary-brain.js', 'js/revenue-brain.js', 'js/storage.js']) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.12.10 profit-source-display-alignment ==');

const indexHtml = load('index.html');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const profitJs = load('js/profit-brain.js');
const revenueSummaryJs = load('js/revenue-summary-brain.js');
const revenueBrainJs = load('js/revenue-brain.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

console.log('== version / cache buster ==');
assert(indexHtml.includes('v4.12.10'), 'index.html should show v4.12.10');
assert(indexHtml.includes('js/app.js?v=4.12.10'), 'app.js cache buster should be v4.12.10');
assert(indexHtml.includes('js/profit-brain.js?v=4.12.10'), 'profit-brain cache buster should be v4.12.10');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.10'"), 'storage version should be v4.12.10');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.10'"), 'data-backup version should be v4.12.10');
assert(!indexHtml.includes('?v=4.12.9'), 'old cache buster v4.12.9 should be gone');
assert(statusMd.includes('v4.12.10'), 'status.md should document v4.12.10');
assert(handoffMd.includes('v4.12.10'), 'handoff.md should document v4.12.10');
assert(decisionLog.includes('v4.12.10'), 'decision-log.md should record v4.12.10');

console.log('== wiring ==');
assert(profitJs.includes('resolveRevenueSourceLabel'), 'ProfitBrain should expose resolveRevenueSourceLabel');
assert(profitJs.includes('RevenueSummaryBrain.getRevenueSource'), 'profit revenue rows should use RevenueSummaryBrain');
assert(profitJs.includes('const source = this.resolveRevenueSourceLabel(row.source)'), 'buildSourceRows revenue path should use resolveRevenueSourceLabel');
assert(profitJs.includes("const src = this.normalizeSource(e.vendor || e.memo || '')"), 'expense path must keep normalizeSource');
assert(profitJs.includes("g.source === 'Google広告'"), 'Google広告 ad-fee comment must remain');
assert(profitJs.includes("g.source === '直受け'"), '直受け comment must remain');
assert(profitJs.includes("g.source === 'くらしのマーケット'"), 'くらし comment must remain');

function createSandbox() {
  const sandbox = {
    console,
    RevenueBrain: null,
    RevenueSummaryBrain: null,
    ProfitBrain: null,
    PaymentBrain: null,
    WorkOrderBrain: {
      forOperationalList: (x) => x || [],
      normalizeWorkOrder: (x) => x || {},
      ACTIVE_STATUSES: [],
      addDays: (d) => d,
      sortByScheduledDateTimeAsc: (x) => x || []
    },
    CalendarCandidateBrain: null,
    MonthlyResultsBrain: null,
    WorkCompletionBrain: null
  };
  runInContext(load('js/payment-brain.js'), createContext(sandbox));
  runInContext(load('js/revenue-brain.js'), createContext(sandbox));
  runInContext(load('js/revenue-summary-brain.js'), createContext(sandbox));
  runInContext(load('js/profit-brain.js'), createContext(sandbox));
  return createContext(sandbox);
}

const ctx = createSandbox();

const displayCases = [
  ['LP', 'LP'],
  ['Google', 'Google'],
  ['Google検索', 'Google検索'],
  ['Google広告', 'Google広告'],
  ['Googleビジネスプロフィール', 'Googleビジネスプロフィール'],
  ['LINE', 'LINE'],
  ['Airリザーブ', 'Airリザーブ'],
  ['紹介直', '紹介直'],
  ['110', '110番'],
  ['110番', '110番'],
  ['コープ', 'コープ'],
  ['くらしのマーケット', 'くらしのマーケット'],
  ['ヤマダ', 'ヤマダ'],
  ['', '不明'],
  ['未設定', '不明'],
  ['不明', '不明'],
  ['判定不能', '不明'],
  ['その他', 'その他']
];

console.log('== profit display labels match revenue analysis ==');
for (const [source, expected] of displayCases) {
  const profitLabel = runInContext(
    `ProfitBrain.resolveRevenueSourceLabel(${JSON.stringify(source)})`,
    ctx
  );
  const summaryLabel = runInContext(
    `RevenueSummaryBrain.getRevenueSource(${JSON.stringify({ source })})`,
    ctx
  );
  assert(profitLabel === expected, `profit label for ${source || '(empty)'} should be ${expected}, got ${profitLabel}`);
  assert(summaryLabel === expected, `summary label for ${source || '(empty)'} should be ${expected}, got ${summaryLabel}`);
  assert(profitLabel === summaryLabel, `profit and summary labels must match for ${source || '(empty)'}`);
}

console.log('== Airリザーブ must not collapse to その他 on revenue rows ==');
{
  const rows = runInContext(`ProfitBrain.buildSourceRows([
    { id: 'r1', workDate: '2026-07-03', amount: 10000, source: 'Airリザーブ', status: '確定', paymentStatus: 'paid' },
    { id: 'r2', workDate: '2026-07-04', amount: 8000, source: 'Google', status: '確定', paymentStatus: 'paid' },
    { id: 'r3', workDate: '2026-07-05', amount: 5000, source: 'LINE', status: '確定', paymentStatus: 'paid' }
  ], [], [], [])`, ctx);
  const names = rows.map((r) => r.source).sort();
  assert(names.includes('Airリザーブ'), 'Airリザーブ row must appear');
  assert(names.includes('Google'), 'Google row must appear');
  assert(names.includes('LINE'), 'LINE row must appear');
  assert(!names.includes('その他') || rows.find((r) => r.source === 'その他')?.revenueTotal === 0, '100% routes must not collapse into その他 revenue');
}

const profitCases = [
  ['LP', 100, false],
  ['Google広告', 100, false],
  ['LINE', 100, false],
  ['Airリザーブ', 100, false],
  ['紹介直', 100, false],
  ['110番', 80, false],
  ['コープ', 80, false],
  ['くらしのマーケット', 80, false],
  ['ヤマダ', 60, false],
  ['', 0, true],
  ['未設定', 0, true],
  ['不明', 0, true],
  ['判定不能', 0, true],
  ['その他', 0, true]
];

console.log('== profit rates unchanged ==');
for (const [source, expectedRate, reviewRequired] of profitCases) {
  const info = runInContext(`RevenueBrain.getSourceProfitRate(${JSON.stringify(source)})`, ctx);
  assert(info.rate === expectedRate, `${source || '(empty)'} rate should be ${expectedRate}, got ${info.rate}`);
  assert(info.reviewRequired === reviewRequired, `${source || '(empty)'} reviewRequired should be ${reviewRequired}`);
}

console.log('== buildSourceRows totals unchanged by regrouping ==');
{
  const revenues = [
    { id: 'r1', workDate: '2026-07-03', amount: 12000, source: 'Airリザーブ', status: '確定', paymentStatus: 'paid' },
    { id: 'r2', workDate: '2026-07-04', amount: 10000, source: 'Google広告', status: '確定', paymentStatus: 'paid' },
    { id: 'r3', workDate: '2026-07-05', amount: 8000, source: 'コープ', status: '確定', paymentStatus: 'paid' }
  ];
  const expenses = [
    { id: 'e1', date: '2026-07-03', amount: 1000, category: '交通・燃料', relatedRevenueId: 'r1' },
    { id: 'e2', date: '2026-07-04', amount: 2000, category: '広告費', vendor: 'Google広告', memo: 'Google広告' }
  ];
  const rows = runInContext(
    `ProfitBrain.buildSourceRows(${JSON.stringify(revenues)}, ${JSON.stringify(expenses)}, [], [])`,
    ctx
  );
  const totalRevenue = rows.reduce((s, r) => s + r.revenueTotal, 0);
  const totalExpense = rows.reduce((s, r) => s + r.expenseTotal, 0);
  const totalGross = rows.reduce((s, r) => s + r.grossProfit, 0);
  const totalAd = rows.reduce((s, r) => s + r.adFeeTotal, 0);
  assert(totalRevenue === 30000, `total revenue should stay 30000, got ${totalRevenue}`);
  assert(totalExpense === 1000, `linked expense total should stay 1000, got ${totalExpense}`);
  assert(totalAd === 2000, `ad fee total should stay 2000, got ${totalAd}`);
  assert(Number.isFinite(totalGross), 'gross total must remain finite');
}

console.log('== expense normalizeSource path unchanged for Air vendor ==');
{
  const expenseLabel = runInContext(`ProfitBrain.normalizeSource('Airリザーブ')`, ctx);
  assert(expenseLabel === 'その他', 'expense/vendor normalizeSource must keep Airリザーブ → その他');
}

console.log('== localStorage / record.source untouched ==');
assert(!profitJs.includes('localStorage'), 'profit-brain must not touch localStorage');
assert(!profitJs.includes('record.source ='), 'profit-brain must not rewrite record.source');

console.log('\nAll v4.12.10 profit-source-display-alignment checks passed.');
