/**
 * Budil v4.10.25 — 請求書・見積書画面 視認性・入力しやすさ verification.
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

for (const file of ['js/app.js', 'js/storage.js', 'js/data-backup.js', 'js/documents-brain.js']) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.10.25 documents-ui-readability ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const css = load('css/style.css');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

// --- バージョン ---
assert(indexHtml.includes('v4.10.25'), 'index.html should show v4.10.25');
assert(indexHtml.includes('js/app.js?v=4.10.25'), 'app.js cache buster should be v4.10.25');
assert(indexHtml.includes('css/style.css?v=4.10.25.1'), 'css cache buster should be v4.10.25.1');
assert(storageJs.includes("BUDIL_VERSION: 'v4.10.25'"), 'storage.js version should be v4.10.25');
assert(dataBackupJs.includes("APP_VERSION: 'v4.10.25'"), 'data-backup version should be v4.10.25');
assert(statusMd.includes('v4.10.25'), 'status.md should document v4.10.25');
assert(handoffMd.includes('v4.10.25'), 'handoff.md should document v4.10.25');
assert(decisionLog.includes('v4.10.25'), 'decision-log.md should record v4.10.25');

// --- CSS 対象限定 ---
console.log('== CSS scope check ==');
assert(css.includes('v4.10.25 請求書・見積書'), 'css should include v4.10.25 documents marker');
assert(css.includes('#view-documents .doc-tax-settings-details'), 'tax settings styles should be scoped to #view-documents');
assert(css.includes('#view-documents .doc-tax-preview'), 'tax preview styles should be scoped to #view-documents');
assert(css.includes('#view-documents .doc-item-row'), 'item row styles should be scoped to #view-documents');
assert(css.includes('#view-documents .documents-preview-body'), 'preview body styles should be scoped to #view-documents');
assert(!css.includes('body {\n  color: #0f172a'), 'css must not change global body text color');

// --- 税・端数設定エリアの文字色 ---
console.log('== tax settings readability ==');
assert(css.includes('--doc-panel-text: #0f172a'), 'light panel should use dark readable text');
assert(css.includes('#view-documents .doc-tax-settings-details .doc-tax-settings-body .form-group label'), 'tax settings labels should have explicit color');
assert(css.includes('#view-documents .doc-tax-settings-details .doc-tax-settings-body .doc-checkbox-label'), 'checkbox labels should have explicit color');

// --- input / textarea / select ---
console.log('== form control colors ==');
assert(css.includes('#view-documents .documents-form input'), 'documents form inputs should have explicit colors');
assert(css.includes('#view-documents .documents-form textarea'), 'documents form textareas should have explicit colors');
assert(css.includes('#view-documents .documents-form select'), 'documents form selects should have explicit colors');
assert(css.includes('::placeholder'), 'placeholder color should be defined for documents form');

// --- 明細入力欄 ---
console.log('== line items layout ==');
assert(indexHtml.includes('doc-items-header'), 'index.html should include doc-items-header');
assert(indexHtml.includes('doc-items-hint'), 'index.html should include doc-items-hint');
assert(appJs.includes('updateDocItemsHeader'), 'app.js should update doc items header');
assert(appJs.includes('doc-field-label'), 'app.js should render labeled doc item fields');
assert(css.includes('minmax(0, 1fr)'), 'item row grid should prevent horizontal crush with minmax');

// --- プレビュー ---
console.log('== preview area ==');
assert(indexHtml.includes('doc-preview-heading'), 'preview panel should have visible heading');
assert(indexHtml.includes('doc-tax-preview-label'), 'tax preview should have readable label');
assert(indexHtml.includes('doc-tax-preview-hint'), 'tax preview should have hint text');
assert(css.includes('#view-documents #documents-preview-panel'), 'preview panel should have distinct frame styling');
assert(css.includes('doc-preview-heading'), 'preview heading should be styled');

// --- v4.10.21 主従整理 ---
console.log('== v4.10.21 invoice hierarchy regression ==');
assert(indexHtml.includes('売上の正本は売上明細'), 'documents view should clarify revenue primary source');
assert(indexHtml.includes('請求書は補助書類'), 'documents view should state invoice is supplementary');
assert(appJs.includes('tryLinkDocumentToExistingRevenue'), 'link-first logic must remain');

// --- v4.10.24 売上・利益定義 ---
console.log('== v4.10.24 profit definition regression ==');
const profitBrainJs = load('js/profit-brain.js');
assert(profitBrainJs.includes('monthGrossRate > 0'), 'profit-brain monthGrossRate fallback must remain');
assert(appJs.includes('今月の確定売上'), 'profit panel 今月の確定売上 label must remain');

// --- NG文言 ---
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
  assert(!appJs.includes(term), `app.js should not include NG term: ${term}`);
}
assert(!appJs.includes('localStorage.clear()'), 'localStorage.clear must not be used');

// --- スマホ横スクロール対策 ---
assert(css.includes('@media (max-width: 390px)'), 'css should include 390px mobile rules for documents');
assert(css.includes('#view-documents .doc-item-row'), 'mobile item row rules should exist under #view-documents');

console.log('\nAll v4.10.25 documents-ui-readability checks passed.');
