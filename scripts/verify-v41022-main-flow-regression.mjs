/**
 * Budil v4.10.38 主導線・主従整理リグレッションverify
 *
 * 確認内容：
 * - v4.10.14〜v4.10.21 の主従整理が維持されていること
 * - 通常UIにNG文言が復活していないこと
 * - Googleカレンダー → 予定取り込み → 売上確定待ち → 売上確定 → 売上一覧 → 入金予定 の主導線が維持
 * - 売上明細手入力が主入口に戻っていないこと
 * - 月次実績が通常売上入力に見えないこと
 * - 請求書が売上正本に見えないこと
 * - 入金予定が入金管理の主入口として維持されていること
 * - 集客チェックが外部確認の主入口として維持されていること
 * - はじめてガイドの主3ステップがcalendar-firstのまま維持されていること
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = (path) => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
};

// JS構文チェック
for (const file of ['app.js', 'storage.js', 'data-backup.js', 'executive-brain.js', 'revenue-brain.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

console.log('== v4.10.25 main-flow-regression ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const executiveBrain = load('js/executive-brain.js');
const revenueBrain = load('js/revenue-brain.js');

// ── バージョン確認 ────────────────────────────────────────────
assert(indexHtml.includes('v4.11.1'), 'index.html should show v4.11.1');
assert(storageJs.includes("BUDIL_VERSION: 'v4.11.1'"), 'storage.js BUDIL_VERSION should be v4.10.41');
assert(dataBackupJs.includes("APP_VERSION: 'v4.11.1'"), 'data-backup APP_VERSION should be v4.10.41');
console.log('  [OK] バージョン v4.10.27');

// ── NG文言チェック (通常UI) ────────────────────────────────────
const ngWords = [
  '売上登録へ',
  '一括売上登録',
  '登録対象を売上登録',
  '作業完了後',
  '売上登録済み',
  '作業後確定',
  '作業後売上確定',
];

// index.html（通常UI）でのNG文言チェック
for (const w of ngWords) {
  assert(!indexHtml.includes(w), `index.html should NOT contain NG word: "${w}"`);
}
// app.js renderHTMLでのNG文言チェック（テンプレートリテラル内のUI文言）
for (const w of ngWords) {
  // コード内部変数名・コメントではなくUI描画文字列として含まれていないことを確認
  const idx = appJs.indexOf(w);
  if (idx !== -1) {
    const context = appJs.slice(Math.max(0, idx - 50), idx + 50);
    throw new Error(`FAIL: app.js contains NG word "${w}" at context: ...${context}...`);
  }
}
// executive-brain.js でのNG文言チェック
for (const w of ngWords) {
  assert(!executiveBrain.includes(w), `executive-brain.js should NOT contain NG word: "${w}"`);
}
console.log('  [OK] NG文言なし（index.html / app.js / executive-brain.js）');

// ── はじめてガイド：calendar-first 主3ステップ ──────────────────
assert(appJs.includes("key: 'calendarImport'"), 'ONBOARDING step 1 should be calendarImport');
assert(appJs.includes("key: 'revenueQueue'"), 'ONBOARDING step 2 should be revenueQueue');
assert(appJs.includes("key: 'dailyTasks'"), 'ONBOARDING step 3 should be dailyTasks');
// ステップ1の順序確認（calendarImport が revenueQueue より前）
const calIdx = appJs.indexOf("key: 'calendarImport'");
const revIdx = appJs.indexOf("key: 'revenueQueue'");
const dailyIdx = appJs.indexOf("key: 'dailyTasks'");
assert(calIdx < revIdx && revIdx < dailyIdx, 'Onboarding steps must be in order: calendar → revenue → daily');
console.log('  [OK] はじめてガイド calendar-first 主3ステップ維持');

// ── 売上明細手入力が補助扱いであること ──────────────────────────
// details 内に配置されていること
assert(indexHtml.includes('売上明細を手入力（例外！）') || indexHtml.includes('売上明細を手入力（例外'), 'manual revenue entry should be labeled as exception');
// 主入口ボタン（btn-primary）として単独で前面表示していないことを確認
// → details collapse内に存在すること
assert(indexHtml.includes('class="card card-wide revenue-manual-entry-collapse"') ||
       indexHtml.includes('revenue-manual-entry-collapse') ||
       indexHtml.includes('summary>売上明細を手入力'), 'manual revenue entry should be in details collapse');
console.log('  [OK] 売上明細手入力が例外・補助として配置');

// ── 月次実績：通常売上入力に見えないこと ─────────────────────────
// nav に 月次実績・照合 と表示
assert(indexHtml.includes('月次実績・照合'), 'nav should include 月次実績・照合');
// 月次実績が通常売上入力の主入口でないことを示す補足が存在
assert(
  indexHtml.includes('月次実績と売上明細の差額') || indexHtml.includes('差額を確認'),
  'monthly results should mention 差額確認 (reconciliation only)'
);
// 月次実績ビューに自動マージしない旨の記載
assert(
  indexHtml.includes('自動同期しません') || indexHtml.includes('読み取り専用'),
  'monthly results should state no auto-merge'
);
console.log('  [OK] 月次実績：照合用・自動マージなし維持');

// ── 請求書が売上正本に見えないこと ───────────────────────────────
assert(indexHtml.includes('documents-purpose-note'), 'documents-purpose-note should exist');
assert(
  indexHtml.includes('請求書は既存売上と紐付け') || indexHtml.includes('請求書は書類'),
  'invoice should be described as auxiliary'
);
// 入金管理の補助であることの記載
assert(
  indexHtml.includes('入金確認の主入口は「入金予定」') || indexHtml.includes('入金予定」が主入口'),
  'payment main entry should be 入金予定'
);
console.log('  [OK] 請求書が書類・補助として維持');

// ── 入金予定が入金管理の主入口であること ─────────────────────────
// navに入金予定が存在
assert(indexHtml.includes('入金予定'), 'nav should include 入金予定');
// 売上明細の支払い状態が補助であること
assert(
  indexHtml.includes('入金管理の補助') || indexHtml.includes('入金確認の主入口は「入金予定」') || indexHtml.includes('入金予定」が主入口'),
  'payment status in revenue detail should be marked as auxiliary'
);
console.log('  [OK] 入金予定が入金管理の主入口として維持');

// ── 集客チェックが外部確認の主入口であること ─────────────────────
// navに集客チェックが存在
assert(indexHtml.includes('集客チェック'), 'nav should include 集客チェック');
// external-check旧サイト確認画面に「貼り付けは集客チェックへ」の誘導
assert(
  indexHtml.includes('貼り付け入口は集客チェック') || indexHtml.includes('集客チェック画面から取り込んで'),
  'external check paste should direct to 集客チェック'
);
// 旧貼り付け入口が details内（初期close）であること
assert(
  indexHtml.includes('external-check-legacy-paste-collapse'),
  'legacy paste should be in collapse details'
);
console.log('  [OK] 集客チェックが外部確認の主入口として維持');

// ── v4.10.14 利益表示：見込みと確定を混在させない ─────────────────
// profit-brain.jsまたはapp.jsに利益分離の記述があること
const profitBrain = load('js/profit-brain.js');
assert(
  profitBrain.includes('grossProfit') || profitBrain.includes('見込み') || profitBrain.includes('確定'),
  'profit brain should separate confirmed and estimated profit'
);
console.log('  [OK] v4.10.14 利益表示整理：profit-brain.js存在確認');

// ── v4.10.16 毎日やること：外部確認カードはdetails初期closed ──────
// 外部確認記録のdashboard表示がdetails内にあること
assert(
  indexHtml.includes('card-external-check-collapse') || indexHtml.includes('card-external-check-inner'),
  'external check on dashboard should be in details collapse'
);
console.log('  [OK] v4.10.16 毎日やること：外部確認はdetails collapse維持');

// ── v4.10.17 売上入口：主導線説明が存在 ─────────────────────────
assert(
  indexHtml.includes('revenue-flow-hint') || indexHtml.includes('作業予定から売上確定が通常'),
  'revenue view should have flow hint describing main flow'
);
console.log('  [OK] v4.10.17 売上入口：主導線説明維持');

// ── v4.10.18 はじめてガイド：手入力フォームを直接開かない ─────────
// ONBOARDING_PRIMARY_STEPSのactionに'add-revenue'や'manual'が含まれないこと
const onboardingSection = appJs.slice(appJs.indexOf("key: 'calendarImport'") - 100, appJs.indexOf("key: 'calendarImport'") + 600);
assert(
  !onboardingSection.includes('add-revenue') && !onboardingSection.includes('manual-entry'),
  'ONBOARDING_PRIMARY_STEPS should not include manual revenue entry actions'
);
console.log('  [OK] v4.10.18 はじめてガイド：手入力フォーム直接開かない');

// ── v4.10.20 月次実績：nav/title確認 ───────────────────────────
assert(indexHtml.includes('月次実績・照合'), 'monthly results should use label 月次実績・照合');
assert(
  !indexHtml.includes('月次売上入力') && !indexHtml.includes('月次売上登録'),
  'monthly results should NOT look like regular revenue entry'
);
console.log('  [OK] v4.10.20 月次実績・照合：nav/titleラベル維持');

// ── v4.10.21 請求書から売上作成が主入口に見えないこと ─────────────
// 請求書ビューの冒頭に補助説明があること
assert(
  indexHtml.includes('doc-payment-assist-note') || indexHtml.includes('請求書は書類'),
  'invoice view should have auxiliary note'
);
console.log('  [OK] v4.10.21 請求書から売上作成が主入口に見えない');

// ── 朝レポートのNG文言確認 ─────────────────────────────────────
assert(!executiveBrain.includes('作業後確定'), "executive-brain.js morning report should NOT contain '作業後確定'");
assert(!executiveBrain.includes('売上登録'), "executive-brain.js should NOT contain '売上登録' as UI label");
console.log('  [OK] 朝レポート section title NG文言なし');

// ── storage.js診断メッセージNG文言確認 ────────────────────────────
// 診断メッセージに作業後確定が含まれないこと
const storageDiagLine = storageJs.match(/pendingConfirmCount.*?件/);
if (storageDiagLine) {
  assert(!storageDiagLine[0].includes('作業後確定'), 'storage.js diagnostic should NOT contain 作業後確定');
}
console.log('  [OK] storage.js診断メッセージ NG文言なし');

console.log('\n✅ v4.10.24 main-flow-regression: ALL CHECKS PASSED');
