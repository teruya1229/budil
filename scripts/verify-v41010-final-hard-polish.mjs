/**
 * Budil v4.10.20 — final hard polish verification.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = (path) => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

console.log('== v4.10.20 final hard polish ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const revenueBrain = load('js/revenue-brain.js');
const revenueSummaryBrain = load('js/revenue-summary-brain.js');
const css = load('css/style.css');
const storageJs = load('js/storage.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

assert(indexHtml.includes('v4.10.35'), 'index.html should show v4.10.35');
assert(indexHtml.includes('js/app.js?v=4.10.35'), 'app.js cache buster should be v4.10.35');
assert(storageJs.includes("BUDIL_VERSION: 'v4.10.35'"), 'storage.js version should be v4.10.35');

const forbiddenUiTerms = [
  '売上登録',
  '売上登録へ',
  '一括売上登録',
  '登録対象を売上登録',
  '作業後確定',
  '作業後売上確定',
  '作業完了後',
  '作業完了',
  '売上登録済み',
  '+ 新規登録',
  '売上を登録',
  '売上を1件登録'
];
for (const term of forbiddenUiTerms) {
  assert(!indexHtml.includes(term), `index.html should not include ${term} in normal UI`);
}

assert(indexHtml.includes('売上確定後のお礼・口コミ依頼・リピート提案をつなぐ'), 'follow subtitle should use 売上確定後');
assert(indexHtml.includes('+ 明細を追加'), 'revenue list should use + 明細を追加');
assert(indexHtml.includes('売上明細を手入力'), 'manual revenue entry label should remain');
assert(indexHtml.includes('売上明細を保存'), 'daily quick form submit should not say 売上を登録');
assert(indexHtml.includes('card-product-overview-collapse'), 'product overview should be collapsible on data management');
assert(indexHtml.includes('card-recommended-ops-collapse'), 'recommended ops should be collapsible on data management');
assert(indexHtml.includes('card-dev-checklists-collapse'), 'mvp checklists should be in dev details');
assert(!indexHtml.includes('id="product-overview-data" class="card card-wide card-product-overview"'), 'product overview must not be always-visible card');

assert(!appJs.includes("? '売上予定'"), 'app.js monthly summary label must not use bare 売上予定');
assert(appJs.includes(": '確定売上'"), 'revenue summary panel should label confirmed revenue as 確定売上');
assert(!revenueBrain.includes('今月の売上予定は'), 'revenue-brain management comment should not say 今月の売上予定は');
assert(revenueBrain.includes('今月の確定売上は'), 'revenue-brain should use 今月の確定売上は');
assert(appJs.includes('ONBOARDING_PRIMARY_STEPS'), 'onboarding should define calendar-first primary steps');
assert(appJs.includes("label: 'Googleカレンダー予定を取り込む'"), 'onboarding primary step should be calendar import');
assert(appJs.includes('onboarding-exception-actions'), 'manual revenue entry should stay in exception details');
assert(appJs.includes('calendar-candidate-saved-more'), 'v4.10.9 import button layout maintained');

assert(!css.includes('.product-overview-card {\n  background: #fff'), 'product overview cards must not use white background');
assert(css.includes('card-product-overview-collapse'), 'css should style collapsed product overview');
assert(css.includes('v4.10.20'), 'css should include v4.10.20 polish marker');

assert(revenueSummaryBrain.includes('displayCount'), 'upcoming summary should expose displayCount');
assert(revenueSummaryBrain.includes('displayTotal'), 'upcoming summary should expose displayTotal');
assert(appJs.includes('summary.displayCount'), 'app should render header from displayCount');
assert(appJs.includes('renderRevenueConfirmationQueueBlock'), 'v4.10.8 revenue queue block maintained');
assert(appJs.includes('sortByScheduledDateTimeAsc'), 'v4.10.7 date sort should remain');
assert(!appJs.includes('localStorage.clear()'), 'localStorage.clear must not be used');
assert(indexHtml.includes('btn-calendar-candidate-json-import'), 'v4.10.1 JSON import maintained');
assert(indexHtml.includes('id="view-revenue-analysis"'), 'v4.10.5 revenue analysis maintained');

assert(statusMd.includes('v4.10.20'), 'status.md should document v4.10.20');
assert(handoffMd.includes('v4.10.20'), 'handoff.md should document v4.10.20');
assert(decisionLog.includes('v4.10.20'), 'decision-log.md should record v4.10.20');

execSync('node scripts/verify-v4109-final-operational-polish.mjs', { cwd: root, stdio: 'inherit' });

console.log('All v4.10.20 final hard polish checks passed.');
