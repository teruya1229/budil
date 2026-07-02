/**
 * Budil v4.10.24 — 利益ラベル整合性 verification.
 *
 * 確認内容:
 * - 見込み利益 = 予定売上見込み × 粗利率 になっていること
 * - 確定利益 = 確定売上 × 粗利率 になっていること
 * - 合計利益 = 見込み利益 + 確定利益 になっていること
 * - 粗利率未設定workOrderには確定売上由来の月粗利率をフォールバック適用すること
 * - 「今月の確定売上」ラベルが利益管理画面に存在すること
 * - v4.10.23 の確定売上定義を壊していないこと
 * - NG文言が復活していないこと
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
for (const file of ['js/profit-brain.js', 'js/revenue-brain.js', 'js/revenue-summary-brain.js', 'js/app.js', 'js/storage.js', 'js/data-backup.js']) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.10.24 profit-label-consistency ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const profitBrainJs = load('js/profit-brain.js');
const revenueBrainJs = load('js/revenue-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');

// --- バージョン確認 ---
assert(indexHtml.includes('v4.10.24'), 'index.html should show v4.10.24');
assert(indexHtml.includes('js/app.js?v=4.10.24'), 'app.js cache buster should be v4.10.24');
assert(storageJs.includes("BUDIL_VERSION: 'v4.10.24'"), 'storage.js version should be v4.10.24');
assert(dataBackupJs.includes("APP_VERSION: 'v4.10.24'"), 'data-backup version should be v4.10.24');

// --- ProfitBrain の見込み利益フォールバック修正確認 ---
console.log('== ProfitBrain plannedForecastProfit fallback check ==');
assert(profitBrainJs.includes('woResult.marginUnset'), 'profit-brain.js should check marginUnset for fallback');
assert(profitBrainJs.includes('monthGrossRate > 0'), 'profit-brain.js should use monthGrossRate as fallback condition');
assert(profitBrainJs.includes('Math.round(est * monthGrossRate / 100)'), 'profit-brain.js should apply monthGrossRate to estimate');

// --- app.js の利益管理「今月の確定売上」ラベル確認 ---
console.log('== app.js profit panel label check ==');
assert(appJs.includes('今月の確定売上'), 'app.js should show 今月の確定売上 in profit panel');
assert(appJs.includes('profitRevLabel'), 'app.js should use profitRevLabel variable');
assert(appJs.includes('profitRevValue'), 'app.js should use profitRevValue variable');
assert(appJs.includes('s.confirmedRevenue != null ? s.confirmedRevenue : s.monthRevenue'), 'app.js should prefer confirmedRevenue for profit panel');

// --- v4.10.23 の確定売上定義が維持されていること ---
console.log('== v4.10.23 confirmed revenue definition regression ==');
assert(profitBrainJs.includes('confirmedMonthRevenues'), 'ProfitBrain should still use confirmedMonthRevenues');
assert(profitBrainJs.includes('isConfirmedRevenueStatus'), 'ProfitBrain should still use isConfirmedRevenueStatus');
assert(revenueBrainJs.includes('confirmedList'), 'RevenueBrain.summarize should still use confirmedList');
assert(revenueBrainJs.includes('plannedList'), 'RevenueBrain.summarize should still use plannedList');
assert(revenueBrainJs.includes('const total = confirmed + planned'), 'RevenueBrain.summarize total should still = confirmed + planned');

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
assert(!appJs.includes('localStorage.clear()'), 'localStorage.clear must not be used');

// --- CSS変更なし確認 ---
const css = load('css/style.css');
assert(!css.includes('v4.10.24'), 'css/style.css should NOT have v4.10.24 marker (CSS未変更ルール)');

// ============================================================
// 数値テスト：見込み利益の粗利率適用確認
// テストデータ:
//   - 確定売上: 25,300円, source='ヤマダ', grossMarginRate=60 (確定)
//   - workOrder①: 予定売上見込み22,500円, source='不明'（粗利率未設定）
//   - workOrder②: 予定売上見込み18,000円, source='不明'（粗利率未設定）
//   - 合計予定売上見込み: 40,500円
//   - monthGrossRate = 60% (確定売上から算出)
// 期待値:
//   - 予定売上見込み: 40,500円
//   - 見込み利益: 24,300円 (= 40,500 × 60%)  ※売上額そのままではない
//   - 確定売上: 25,300円
//   - 確定利益: 15,180円 (= 25,300 × 60%)
//   - 合計売上: 65,800円 (= 40,500 + 25,300)
//   - 合計利益: 39,480円 (= 24,300 + 15,180)
// ============================================================
console.log('== numerical test: profit rate applied to planned forecast ==');

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

// テスト1: 粗利率未設定workOrderに月粗利率フォールバックが適用されること
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const confirmedRev = {
      id: 'rev-c1',
      workDate: '2026-07-01',
      customerName: '確定客',
      service: 'エアコン通常',
      source: 'ヤマダ',
      amount: 25300,
      grossMarginRate: 60,
      status: '確定'
    };
    // 粗利率未設定・source不明の作業予定
    const wo1 = {
      id: 'wo-1',
      customerName: '予定客1',
      serviceText: 'エアコン',
      scheduledDate: '2026-07-10',
      estimateAmount: 22500,
      source: '不明',
      status: 'tentative'
    };
    const wo2 = {
      id: 'wo-2',
      customerName: '予定客2',
      serviceText: 'エアコン',
      scheduledDate: '2026-07-15',
      estimateAmount: 18000,
      source: '不明',
      status: 'tentative'
    };
    const summary = ProfitBrain.getPeriodProfitSummary({
      today: '2026-07-01',
      monthKey: '2026-07',
      revenues: [confirmedRev],
      expenses: [],
      workOrders: [wo1, wo2]
    });
    return summary;
  })()`, ctx);

  // 基本の確定売上確認
  assert(result.confirmedRevenue === 25300, `confirmedRevenue should be 25300, got ${result.confirmedRevenue}`);
  assert(result.confirmedProfit === 15180, `confirmedProfit should be 15180 (25300×60%), got ${result.confirmedProfit}`);
  // 予定売上見込み = 作業予定の見積もり合計
  assert(result.plannedRevenueEstimate === 40500, `plannedRevenueEstimate should be 40500, got ${result.plannedRevenueEstimate}`);
  // 見込み利益は売上額そのままではなく粗利率適用済み
  assert(result.plannedForecastProfit !== result.plannedRevenueEstimate,
    `plannedForecastProfit must NOT equal plannedRevenueEstimate (profit rate must be applied), got both=${result.plannedForecastProfit}`);
  assert(result.plannedForecastProfit === 24300,
    `plannedForecastProfit should be 24300 (40500×60%), got ${result.plannedForecastProfit}`);
  // 合計
  assert(result.totalRevenue === 65800, `totalRevenue should be 65800 (40500+25300), got ${result.totalRevenue}`);
  assert(result.totalProfit === 39480, `totalProfit should be 39480 (24300+15180), got ${result.totalProfit}`);
  assert(result.totalProfit === result.plannedForecastProfit + result.confirmedProfit,
    `totalProfit must equal plannedForecastProfit + confirmedProfit`);
  console.log(`  confirmedRevenue=${result.confirmedRevenue}, confirmedProfit=${result.confirmedProfit} OK`);
  console.log(`  plannedRevenueEstimate=${result.plannedRevenueEstimate}, plannedForecastProfit=${result.plannedForecastProfit} OK`);
  console.log(`  totalRevenue=${result.totalRevenue}, totalProfit=${result.totalProfit} OK`);
}

// テスト2: 個別粗利率あり workOrder は個別粗利率を優先すること
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const confirmedRev = {
      id: 'rev-c2',
      workDate: '2026-07-01',
      customerName: '確定客2',
      service: 'エアコン通常',
      source: 'ヤマダ',
      amount: 20000,
      grossMarginRate: 60,
      status: '確定'
    };
    // 個別粗利率80%のworkOrder（フォールバックを使わない）
    const woWithRate = {
      id: 'wo-rate',
      customerName: '個別粗利率客',
      serviceText: 'エアコン',
      scheduledDate: '2026-07-12',
      estimateAmount: 30000,
      grossMarginRate: 80,
      source: '不明',
      status: 'tentative'
    };
    const summary = ProfitBrain.getPeriodProfitSummary({
      today: '2026-07-01',
      monthKey: '2026-07',
      revenues: [confirmedRev],
      expenses: [],
      workOrders: [woWithRate]
    });
    return summary;
  })()`, ctx);

  // 個別粗利率80%が適用されること（monthGrossRate=60%のフォールバックではなく）
  assert(result.plannedForecastProfit === 24000,
    `plannedForecastProfit should be 24000 (30000×80%), got ${result.plannedForecastProfit}`);
  console.log(`  個別粗利率優先: plannedForecastProfit=${result.plannedForecastProfit} (30000×80%=24000) OK`);
}

// テスト3: 確定売上なし（monthGrossRate=0）の場合、フォールバック不適用
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    // 確定売上なし → monthGrossRate = 0
    const wo = {
      id: 'wo-noRate',
      customerName: '予定のみ',
      serviceText: 'エアコン',
      scheduledDate: '2026-07-20',
      estimateAmount: 50000,
      source: '不明',
      status: 'tentative'
    };
    const summary = ProfitBrain.getPeriodProfitSummary({
      today: '2026-07-01',
      monthKey: '2026-07',
      revenues: [],
      expenses: [],
      workOrders: [wo]
    });
    return summary;
  })()`, ctx);

  // monthGrossRate=0のため、フォールバック不適用 → forecastProfit = estimate（既存動作維持）
  assert(result.confirmedRevenue === 0, `confirmedRevenue should be 0, got ${result.confirmedRevenue}`);
  assert(result.plannedRevenueEstimate === 50000, `plannedRevenueEstimate should be 50000, got ${result.plannedRevenueEstimate}`);
  // フォールバック不適用の場合は forecastProfit = estimate（既存の marginUnset 動作）
  assert(result.plannedForecastProfit === 50000,
    `plannedForecastProfit should be 50000 (no fallback when monthGrossRate=0), got ${result.plannedForecastProfit}`);
  console.log(`  monthGrossRate=0時フォールバック不適用: plannedForecastProfit=${result.plannedForecastProfit} OK`);
}

// テスト4: 合計の一貫性確認（v4.10.23 regression）
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const recs = [
      { id: 'r-c', workDate: '2026-07-01', amount: 25300, grossMarginRate: 60, status: '確定', source: 'ヤマダ', customerName: 'A', service: 'B' },
      { id: 'r-p', workDate: '2026-07-05', amount: 10000, grossMarginRate: 60, status: '予定', source: 'ヤマダ', customerName: 'C', service: 'D' }
    ];
    const wo = {
      id: 'wo-t4',
      scheduledDate: '2026-07-10',
      estimateAmount: 65800,
      source: 'ヤマダ',
      status: 'tentative'
    };
    const summary = ProfitBrain.getPeriodProfitSummary({
      today: '2026-07-01',
      monthKey: '2026-07',
      revenues: recs,
      expenses: [],
      workOrders: [wo]
    });
    return summary;
  })()`, ctx);

  // 確定売上は確定ステータスのみ
  assert(result.confirmedRevenue === 25300, `confirmedRevenue should be 25300 (confirmed only), got ${result.confirmedRevenue}`);
  // totalRevenue = workOrder予定 + 確定売上
  assert(result.totalRevenue === result.plannedRevenueEstimate + result.confirmedRevenue,
    `totalRevenue must equal plannedRevenueEstimate + confirmedRevenue`);
  assert(result.totalProfit === result.plannedForecastProfit + result.confirmedProfit,
    `totalProfit must equal plannedForecastProfit + confirmedProfit`);
  console.log(`  v4.10.23 regression: confirmedRevenue=${result.confirmedRevenue}, totalRevenue=${result.totalRevenue} OK`);
}

// ============================================================
// v4.10.14 profit 3-tier regression
// ============================================================
console.log('== v4.10.14 profit 3-tier regression ==');
assert(profitBrainJs.includes('plannedRevenueEstimate'), 'ProfitBrain should have plannedRevenueEstimate (3-tier)');
assert(profitBrainJs.includes('plannedForecastProfit'), 'ProfitBrain should have plannedForecastProfit (3-tier)');
assert(profitBrainJs.includes('confirmedRevenue'), 'ProfitBrain should have confirmedRevenue (3-tier)');
assert(profitBrainJs.includes('confirmedProfit'), 'ProfitBrain should have confirmedProfit (3-tier)');
assert(profitBrainJs.includes('totalRevenue'), 'ProfitBrain should have totalRevenue (3-tier)');
assert(profitBrainJs.includes('totalProfit'), 'ProfitBrain should have totalProfit (3-tier)');
assert(appJs.includes('予定売上見込み'), 'app.js should display 予定売上見込み');
assert(appJs.includes('見込み利益'), 'app.js should display 見込み利益');
assert(appJs.includes('確定売上'), 'app.js should display 確定売上');
assert(appJs.includes('確定利益'), 'app.js should display 確定利益');
assert(appJs.includes('合計売上'), 'app.js should display 合計売上');
assert(appJs.includes('合計利益'), 'app.js should display 合計利益');
console.log('  v4.10.14 profit 3-tier: all labels present OK');

// ============================================================
// v4.10.19 payment hierarchy regression
// ============================================================
console.log('== v4.10.19 payment entry hierarchy check ==');
assert(appJs.includes('売上確定待ち'), 'app.js should show 売上確定待ち');
// 入金管理は「補助」ラベルで存在するのが正しい（主導線禁止）
assert(!indexHtml.includes('<a>入金管理</a>') && !indexHtml.includes('>入金管理<'), 'index.html should not have 入金管理 as standalone nav item (補助ラベルは許可)');

// ============================================================
// v4.10.22 NG term regression
// ============================================================
console.log('== v4.10.22 NG term regression ==');
for (const term of forbiddenUiTerms) {
  assert(!appJs.includes(term), `app.js should not include NG term: ${term}`);
}

console.log('\nAll v4.10.24 profit-label-consistency checks passed.');
