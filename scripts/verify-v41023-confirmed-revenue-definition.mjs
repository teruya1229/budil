/**
 * Budil v4.10.38 — 確定売上定義統一 verification.
 *
 * 確認内容:
 * - 確定売上に予定売上が混ざらないこと
 * - 予定売上見込みと確定売上が分離されていること
 * - 合計売上が予定売上見込み + 確定売上になっていること
 * - 見込み利益に確定利益が混ざらないこと
 * - 確定利益が確定売上から計算されていること
 * - 合計利益が見込み利益 + 確定利益になっていること
 * - RevenueBrain / ProfitBrain / RevenueSummaryBrain の確定売上定義が矛盾しないこと
 * - v4.10.14 の利益表示3段整理を壊していないこと
 * - v4.10.19 の入金予定主導線を壊していないこと
 * - v4.10.20 の月次実績・照合整理を壊していないこと
 * - v4.10.21 の請求書・見積書/売上明細整理を壊していないこと
 * - v4.10.22 の通常UI NG文言整理を壊していないこと
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

// --- 構文チェック ---
for (const file of ['js/revenue-brain.js', 'js/profit-brain.js', 'js/revenue-summary-brain.js', 'js/app.js', 'js/storage.js']) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.10.25 confirmed-revenue-definition ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const revenueBrainJs = load('js/revenue-brain.js');
const profitBrainJs = load('js/profit-brain.js');
const revenueSummaryBrainJs = load('js/revenue-summary-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

// --- バージョン確認 ---
assert(indexHtml.includes('v4.12.14'), 'index.html should show v4.12.14');
assert(indexHtml.includes('js/app.js?v=4.12.14'), 'app.js cache buster should be v4.12.14');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.14'"), 'storage.js version should be v4.12.14');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.14'"), 'data-backup version should be v4.12.14');
assert(statusMd.includes('v4.10.25'), 'status.md should document v4.10.25');
assert(handoffMd.includes('v4.10.25'), 'handoff.md should document v4.10.25');
assert(decisionLog.includes('v4.10.25'), 'decision-log.md should record v4.10.25');

// --- RevenueBrain.summarize の定義確認 ---
console.log('== RevenueBrain.summarize definition check ==');
assert(revenueBrainJs.includes('isConfirmedRevenueStatus'), 'RevenueBrain should have isConfirmedRevenueStatus');
assert(revenueBrainJs.includes('confirmedList'), 'RevenueBrain.summarize should use confirmedList for confirmed-only');
assert(revenueBrainJs.includes('plannedList'), 'RevenueBrain.summarize should use plannedList for unconfirmed-only');
assert(revenueBrainJs.includes('const total = confirmed + planned'), 'RevenueBrain.summarize should expose total = confirmed + planned');

// --- ProfitBrain.getPeriodProfitSummary の定義確認 ---
console.log('== ProfitBrain.getPeriodProfitSummary definition check ==');
assert(profitBrainJs.includes('confirmedMonthRevenues'), 'ProfitBrain should use confirmedMonthRevenues (confirmed-only filter)');
assert(profitBrainJs.includes('isConfirmedRevenueStatus'), 'ProfitBrain should use RevenueBrain.isConfirmedRevenueStatus');
assert(profitBrainJs.includes('confirmedMarginGross'), 'ProfitBrain should compute confirmedMarginGross separately');
assert(profitBrainJs.includes('confirmedLinkedExpense'), 'ProfitBrain should compute confirmedLinkedExpense from confirmed records');

// --- RevenueSummaryBrain の定義確認 ---
console.log('== RevenueSummaryBrain definition check ==');
assert(revenueSummaryBrainJs.includes("CONFIRMED_STATUSES: ['確定', '完了']"), 'RevenueSummaryBrain should have CONFIRMED_STATUSES');
assert(revenueSummaryBrainJs.includes('isConfirmedRevenueRecord'), 'RevenueSummaryBrain should have isConfirmedRevenueRecord');

// --- UI表示ラベルの整合確認 ---
console.log('== UI label consistency check ==');
assert(appJs.includes("label: '確定売上'"), 'app.js should show 確定売上');
assert(appJs.includes("label: '予定売上'"), 'app.js should show 予定売上');
assert(appJs.includes('合計売上'), 'app.js should show 合計売上');
assert(appJs.includes('合計利益'), 'app.js should show 合計利益');
assert(!appJs.includes('予定売上見込み'), 'app.js must not show 予定売上見込み');
assert(!appJs.includes('見込み利益'), 'app.js must not show 見込み利益');
// 月次実績なし時は summary.confirmed（確定売上）を表示
assert(appJs.includes('summary.confirmed'), 'app.js should use summary.confirmed for confirmed revenue display');
// summary.total を合計売上として使用
assert(appJs.includes('summary.total'), 'app.js should reference summary.total for total display');

// --- NG文言確認 ---
console.log('== NG term check ==');
const forbiddenUiTerms = [
  '売上登録へ',
  '一括売上登録',
  '登録対象を売上登録',
  '作業後確定',
  '作業後売上確定',
  '作業完了後',
  '作業完了',
  '売上登録済み',
];
for (const term of forbiddenUiTerms) {
  assert(!indexHtml.includes(term), `index.html should not include NG term: ${term}`);
}

// --- localStorage.clear() 禁止確認 ---
assert(!appJs.includes('localStorage.clear()'), 'localStorage.clear must not be used');

// ============================================================
// 数値テスト：確定売上定義の統一
// テストデータ：
//   - 予定売上：65,800円（workOrder、ヤマダ60%）
//   - 確定売上：25,300円（revenue record、status='確定'、60%）
//   - 粗利率60%
// 期待値：
//   - 予定売上見込み：65,800円
//   - 見込み利益：39,480円（= 65800 × 60%）
//   - 確定売上：25,300円
//   - 確定利益：15,180円（= 25300 × 60%）
//   - 合計売上：91,100円
//   - 合計利益：54,660円（= 39,480 + 15,180）
// ============================================================
console.log('== numerical test: confirmed revenue definition ==');

function createSandbox() {
  const ctx = createContext({
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
  runInContext(load('js/calendar-candidate-brain.js'), ctx, { filename: 'calendar-candidate-brain.js' });
  runInContext(load('js/work-order-brain.js'), ctx, { filename: 'work-order-brain.js' });
  runInContext(load('js/revenue-brain.js'), ctx, { filename: 'revenue-brain.js' });
  runInContext(load('js/revenue-summary-brain.js'), ctx, { filename: 'revenue-summary-brain.js' });
  runInContext(load('js/profit-brain.js'), ctx, { filename: 'profit-brain.js' });
  return ctx;
}

// テスト1: 予定売上と確定売上の分離（RevenueBrain.summarize）
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const todayKey = '2026-07-01';
    const monthKey = '2026-07';
    const records = [
      { id: 'r-confirmed', workDate: '2026-07-01', customerName: '確定客', service: 'エアコン通常', source: 'ヤマダ', amount: 25300, grossMarginRate: 60, status: '確定' },
      { id: 'r-planned',   workDate: '2026-07-10', customerName: '予定客', service: 'エアコン通常', source: 'ヤマダ', amount: 18000, grossMarginRate: 60, status: '予定' }
    ];
    const settings = { monthlyTarget: 100000 };
    const summary = RevenueBrain.summarize(records, settings, monthKey);
    return summary;
  })()`, ctx);

  assert(result.confirmed === 25300, `confirmed should be 25300 (confirmed-status only), got ${result.confirmed}`);
  assert(result.planned === 18000, `planned should be 18000 (unconfirmed-status only), got ${result.planned}`);
  assert(result.total === 43300, `total should be 43300 (confirmed + planned), got ${result.total}`);
  assert(result.confirmed + result.planned === result.total, 'total must equal confirmed + planned');
  console.log(`  RevenueBrain.summarize: confirmed=${result.confirmed}, planned=${result.planned}, total=${result.total} OK`);
}

// テスト2: ProfitBrain.getPeriodProfitSummary の確定売上・確定利益・合計の正確性
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const confirmedRevenue = {
      id: 'rev-confirmed-41023',
      workDate: '2026-07-01',
      customerName: '確定売上テスト',
      service: 'エアコン通常',
      source: 'ヤマダ',
      amount: 25300,
      grossMarginRate: 60,
      status: '確定'
    };
    // 予定ステータスの明細（ProfitBrain の confirmedRevenue に混ざらないことを確認）
    const plannedDetailRevenue = {
      id: 'rev-planned-41023',
      workDate: '2026-07-05',
      customerName: '予定明細テスト',
      service: 'エアコン通常',
      source: 'ヤマダ',
      amount: 12000,
      grossMarginRate: 60,
      status: '予定'
    };
    // Googleカレンダー由来の予定売上（workOrder）
    const workOrder = {
      id: 'wo-41023',
      customerName: '予定取り込みテスト',
      serviceText: 'エアコンクリーニング',
      scheduledDate: '2026-07-08',
      estimateAmount: 65800,
      source: 'ヤマダ',
      status: 'tentative'
    };
    const summary = ProfitBrain.getPeriodProfitSummary({
      today: '2026-07-01',
      monthKey: '2026-07',
      revenues: [confirmedRevenue, plannedDetailRevenue],
      expenses: [],
      workOrders: [workOrder]
    });
    return summary;
  })()`, ctx);

  // 確定売上は確定ステータスのみ（予定明細12000が混ざらないこと）
  assert(result.confirmedRevenue === 25300, `confirmedRevenue should be 25300 (confirmed-status only), got ${result.confirmedRevenue}`);
  assert(result.confirmedProfit === 15180, `confirmedProfit should be 15180 (25300×60%), got ${result.confirmedProfit}`);
  // 予定売上見込みはworkOrderベース
  assert(result.plannedRevenueEstimate === 65800, `plannedRevenueEstimate should be 65800, got ${result.plannedRevenueEstimate}`);
  assert(result.plannedForecastProfit === 39480, `plannedForecastProfit should be 39480 (65800×60%), got ${result.plannedForecastProfit}`);
  // 合計売上 = workOrder予定 + 確定売上（明細内予定は除外）
  assert(result.totalRevenue === 91100, `totalRevenue should be 91100 (65800+25300), got ${result.totalRevenue}`);
  // 合計利益 = 見込み利益 + 確定利益
  assert(result.totalProfit === 54660, `totalProfit should be 54660 (39480+15180), got ${result.totalProfit}`);
  assert(result.totalProfit === result.plannedForecastProfit + result.confirmedProfit,
    `totalProfit must equal plannedForecastProfit + confirmedProfit`);
  assert(result.totalRevenue === result.plannedRevenueEstimate + result.confirmedRevenue,
    `totalRevenue must equal plannedRevenueEstimate + confirmedRevenue`);
  console.log(`  ProfitBrain.getPeriodProfitSummary: confirmed=${result.confirmedRevenue}, planned=${result.plannedRevenueEstimate}, total=${result.totalRevenue} OK`);
  console.log(`  confirmedProfit=${result.confirmedProfit}, plannedForecastProfit=${result.plannedForecastProfit}, totalProfit=${result.totalProfit} OK`);
}

// テスト3: 予定ステータスの明細が confirmedRevenue に混ざらないこと（予定のみの場合）
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const plannedOnly = {
      id: 'rev-planned-only',
      workDate: '2026-07-03',
      customerName: '予定のみ客',
      service: 'エアコン通常',
      source: 'ヤマダ',
      amount: 30000,
      grossMarginRate: 60,
      status: '予定'
    };
    const summary = ProfitBrain.getPeriodProfitSummary({
      today: '2026-07-01',
      monthKey: '2026-07',
      revenues: [plannedOnly],
      expenses: [],
      workOrders: []
    });
    return summary;
  })()`, ctx);

  assert(result.confirmedRevenue === 0, `confirmedRevenue should be 0 when no confirmed records, got ${result.confirmedRevenue}`);
  assert(result.confirmedProfit === 0, `confirmedProfit should be 0 when no confirmed records, got ${result.confirmedProfit}`);
  console.log(`  予定のみ: confirmedRevenue=${result.confirmedRevenue}, confirmedProfit=${result.confirmedProfit} OK`);
}

// テスト4: RevenueSummaryBrain の confirmedRecords が RevenueBrain と一致すること
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const records = [
      { id: 'r1', workDate: '2026-07-01', amount: 10000, status: '確定' },
      { id: 'r2', workDate: '2026-07-02', amount: 20000, status: '完了' },
      { id: 'r3', workDate: '2026-07-03', amount: 30000, status: '予定' },
      { id: 'r4', workDate: '2026-07-04', amount: 40000, status: 'キャンセル' }
    ];
    const rsbConfirmed = RevenueSummaryBrain.confirmedRecords(records);
    const rbConfirmed = records.filter(r => RevenueBrain.isConfirmedRevenueStatus(r.status));
    return {
      rsbCount: rsbConfirmed.length,
      rbCount: rbConfirmed.length,
      rsbTotal: rsbConfirmed.reduce((s, r) => s + Number(r.amount), 0),
      rbTotal: rbConfirmed.reduce((s, r) => s + Number(r.amount), 0)
    };
  })()`, ctx);

  assert(result.rsbCount === 2, `RevenueSummaryBrain confirmedRecords should return 2 records (確定+完了), got ${result.rsbCount}`);
  assert(result.rbCount === 2, `RevenueBrain isConfirmedRevenueStatus should filter 2 records, got ${result.rbCount}`);
  assert(result.rsbTotal === 30000, `RevenueSummaryBrain confirmed total should be 30000, got ${result.rsbTotal}`);
  assert(result.rsbTotal === result.rbTotal, `RevenueSummaryBrain and RevenueBrain must have same confirmed total`);
  console.log(`  RevenueSummaryBrain/RevenueBrain 定義一致: rsbTotal=${result.rsbTotal}, rbTotal=${result.rbTotal} OK`);
}

// テスト5: RevenueBrain.summarize で見込み利益に確定利益が混ざらないこと
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const records = [
      { id: 'r-c', workDate: '2026-07-01', amount: 25300, grossMarginRate: 60, status: '確定' },
      { id: 'r-p', workDate: '2026-07-10', amount: 65800, grossMarginRate: 60, status: '予定' }
    ];
    const settings = {};
    const summary = RevenueBrain.summarize(records, settings, '2026-07');
    return summary;
  })()`, ctx);

  assert(result.confirmed === 25300, `confirmed should be 25300, got ${result.confirmed}`);
  assert(result.planned === 65800, `planned (unconfirmed) should be 65800, got ${result.planned}`);
  assert(result.total === 91100, `total should be 91100, got ${result.total}`);
  // planned は confirmed を含まないこと
  assert(result.planned !== result.confirmed + result.planned, 'planned must not include confirmed amount');
  console.log(`  RevenueBrain.summarize分離: confirmed=${result.confirmed}, planned=${result.planned}, total=${result.total} OK`);
}

// --- v4.10.14 利益表示3段整理の回帰テスト ---
console.log('== v4.10.14 profit 3-tier regression ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const revenue = {
      id: 'rev-reg-41014',
      workDate: '2026-07-01',
      customerName: '回帰テスト60%様',
      service: 'エアコン通常',
      source: 'ヤマダ',
      amount: 25300,
      grossMarginRate: 60,
      status: '確定'
    };
    const workOrders = [
      { id: 'wo-1', customerName: 'ヤマダ案件', serviceText: 'エアコン', scheduledDate: '2026-07-02', estimateAmount: 25300, source: 'ヤマダ', status: 'tentative' },
      { id: 'wo-2', customerName: '直案件', serviceText: 'エアコン', scheduledDate: '2026-07-03', estimateAmount: 22000, source: '直受け', status: 'confirmed' },
      { id: 'wo-3', customerName: 'コープ案件', serviceText: '洗濯機', scheduledDate: '2026-07-04', estimateAmount: 0, source: 'コープ', status: 'tentative', candidateMeta: { estimatedAmount: '18500' } }
    ];
    const row = ProfitBrain.computeRevenueRowProfit(revenue, 0);
    const summary = ProfitBrain.getPeriodProfitSummary({
      today: '2026-07-01',
      monthKey: '2026-07',
      revenues: [revenue],
      expenses: [],
      workOrders
    });
    return { row, summary };
  })()`, ctx);

  assert(result.row.marginProfit === 15180, `confirmed margin profit should be 15180, got ${result.row.marginProfit}`);
  assert(result.row.deductionAmount === 10120, `deduction should be 10120, got ${result.row.deductionAmount}`);
  assert(result.summary.confirmedRevenue === 25300, `confirmedRevenue should be 25300, got ${result.summary.confirmedRevenue}`);
  assert(result.summary.confirmedProfit === 15180, `confirmedProfit should be 15180, got ${result.summary.confirmedProfit}`);
  assert(result.summary.plannedRevenueEstimate === 65800, `plannedRevenueEstimate should be 65800, got ${result.summary.plannedRevenueEstimate}`);
  assert(result.summary.totalRevenue === 91100, `totalRevenue should be 91100, got ${result.summary.totalRevenue}`);
  assert(result.summary.totalProfit === result.summary.plannedForecastProfit + result.summary.confirmedProfit,
    `totalProfit must equal plannedForecastProfit + confirmedProfit`);
  assert(result.summary.totalRevenue === result.summary.plannedRevenueEstimate + result.summary.confirmedRevenue,
    `totalRevenue must equal plannedRevenueEstimate + confirmedRevenue`);
  assert(result.summary.forecastProfit === result.summary.plannedForecastProfit, 'forecastProfit alias should equal plannedForecastProfit');
  console.log(`  v4.10.14回帰: confirmedRevenue=${result.summary.confirmedRevenue}, totalRevenue=${result.summary.totalRevenue} OK`);
}

// --- v4.10.19 入金予定主導線の維持確認 ---
console.log('== v4.10.19 payment entry hierarchy check ==');
assert(appJs.includes('入金予定'), 'app.js should maintain 入金予定 reference');
assert(indexHtml.includes('入金予定'), 'index.html should maintain 入金予定');

// --- v4.10.20 月次実績・照合整理の維持確認 ---
console.log('== v4.10.20 monthly results hierarchy check ==');
assert(appJs.includes('月次実績'), 'app.js should maintain 月次実績 reference');
assert(appJs.includes('applyMonthlyResultToRevenueSummary'), 'app.js should have applyMonthlyResultToRevenueSummary');

// --- v4.10.21 請求書・売上明細整理の維持確認 ---
console.log('== v4.10.21 invoice/revenue linking check ==');
assert(indexHtml.includes('確定売上として登録'), 'index.html should show 確定売上として登録');

// --- v4.10.22 NG文言確認（再確認） ---
console.log('== v4.10.22 NG term regression ==');
const ngTerms22 = [
  '売上登録へ', '一括売上登録', '登録対象を売上登録', '作業後確定',
  '作業後売上確定', '作業完了後', '売上登録済み'
];
for (const term of ngTerms22) {
  assert(!indexHtml.includes(term), `index.html NG term regression: ${term}`);
}

// --- CSS変更なし確認 ---
const cssJs = load('css/style.css');
assert(!cssJs.includes('v4.10.24'), 'css/style.css should NOT have v4.10.24 marker (CSS should not be changed)');

console.log('');
console.log('All v4.10.25 confirmed-revenue-definition checks passed.');
