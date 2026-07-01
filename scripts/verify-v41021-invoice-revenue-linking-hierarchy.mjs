/**
 * Budil v4.10.22 — invoice/estimate revenue linking hierarchy verification.
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

for (const file of ['app.js', 'storage.js', 'data-backup.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}
execSync(`node --check "${join(root, 'js', 'documents-brain.js')}"`, { stdio: 'inherit' });

console.log('== v4.10.22 invoice-revenue linking hierarchy ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const documentsBrain = load('js/documents-brain.js');
const css = load('css/style.css');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

assert(indexHtml.includes('v4.10.22'), 'index.html should show v4.10.22');
assert(indexHtml.includes('js/app.js?v=4.10.22'), 'app.js cache buster should be v4.10.22');
assert(storageJs.includes("BUDIL_VERSION: 'v4.10.22'"), 'storage.js version should be v4.10.22');
assert(dataBackupJs.includes("APP_VERSION: 'v4.10.22'"), 'data-backup version should be v4.10.22');

// 請求書・見積書 view に目的注記があること
assert(indexHtml.includes('documents-purpose-note'), 'documents-purpose-note should exist in index.html');
assert(indexHtml.includes('売上の正本は売上明細'), 'documents view should clarify 売上の正本は売上明細');
assert(indexHtml.includes('請求書は補助書類'), 'documents view should state 請求書は補助書類');

// ボタン文言の整理：「売上明細に反映」が曖昧なまま残っていないこと
// （static HTML の btn-doc-reflect-revenue テキストは hidden 初期値なので空でも可、
//  JS側で設定するテキストに「既存売上に紐付け・補助作成」が使われていること）
assert(appJs.includes('既存売上に紐付け・補助作成'), 'app.js should use 既存売上に紐付け・補助作成 button label');

// linked時は「linked売上を開く」が維持されていること
assert(appJs.includes('linked売上を開く'), 'app.js should keep linked売上を開く label for already-linked invoices');

// フォームタイトルの整理
assert(appJs.includes('売上明細を手入力（請求書から補助入力）'), 'app.js should use 補助入力 in form title');
assert(!appJs.includes('売上明細を手入力（請求書から反映）'), 'app.js should not use 請求書から反映 in form title');

// トースト文言の整理
assert(appJs.includes('売上明細フォームに補助入力しました'), 'app.js should use 補助入力 in toast message');
assert(!appJs.includes('売上明細フォームに反映しました'), 'app.js should not use old 反映 toast for document flow');

// 入金予定リンク切れボタンの整理
assert(!appJs.includes(`data-reflect-doc-revenue="${'${esc(item.primaryId)}'}">売上明細に反映`), 'app.js receivable button should not say 売上明細に反映');

// 売上の正本 budil_revenue_records を参照していること
assert(indexHtml.includes('budil_revenue_records'), 'index.html should reference budil_revenue_records as primary');

// 既存売上への紐付け優先ロジックが維持されていること
assert(appJs.includes('tryLinkDocumentToExistingRevenue'), 'tryLinkDocumentToExistingRevenue must exist');
assert(appJs.includes('新規作成せず、この売上と請求書を紐付けますか'), 'link-first confirm dialog must exist');
assert(appJs.includes('既存の売上候補が'), 'multiple candidates handling must exist');

// v4.10.12 重複ガードが維持されていること
assert(appJs.includes('confirmRevenueSaveWithDuplicateCheck'), 'duplicate guard must exist');
assert(appJs.includes('findRevenueDuplicateMatches'), 'duplicate match finder must exist');
assert(appJs.includes('既存の売上明細と重複の可能性が高いです'), 'strong duplicate warning must exist');
assert(!appJs.includes('localStorage.clear()'), 'localStorage.clear must not be used');

// v4.10.19 入金予定主導線が維持されていること
const receivablesViewStart = indexHtml.indexOf('id="view-receivables"');
const receivablesChunk = indexHtml.slice(receivablesViewStart, receivablesViewStart + 3000);
assert(receivablesChunk.includes('主入口'), 'receivables view should label itself as 主入口');
assert(indexHtml.includes('入金管理（書類・補助）'), 'invoice payment details should remain marked as 書類・補助');

// v4.10.20 月次実績・照合導線が維持されていること
const navChunk = indexHtml.slice(0, indexHtml.indexOf('</nav>') + 10);
assert(navChunk.includes('data-view="monthly-results"'), 'monthly-results nav button should remain');
assert(!navChunk.includes('月次実績入力</span>'), 'nav should not say 月次実績入力');

// NG文言が通常UIに復活していないこと
const forbiddenUiTerms = [
  '売上登録',
  '売上登録へ',
  '一括売上登録',
  '登録対象を売上登録',
  '作業完了後',
  '作業完了',
  '売上登録済み',
  '作業後確定',
  '作業後売上確定'
];
for (const term of forbiddenUiTerms) {
  assert(!indexHtml.includes(term), `index.html must not include ${term}`);
}

// CSS バージョンマーカー
assert(css.includes('v4.10.22'), 'css should include v4.10.22 marker');

console.log('== regression: v4.10.20 monthly results hierarchy ==');
execSync('node scripts/verify-v41020-monthly-results-hierarchy.mjs', { cwd: root, stdio: 'inherit' });

assert(statusMd.includes('v4.10.22'), 'status.md should document v4.10.22');
assert(handoffMd.includes('v4.10.22'), 'handoff.md should document v4.10.22');
assert(decisionLog.includes('v4.10.22'), 'decision-log.md should record v4.10.22');

console.log('All v4.10.22 invoice-revenue linking hierarchy checks passed.');
