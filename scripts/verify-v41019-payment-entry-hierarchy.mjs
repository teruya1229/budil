/**
 * Budil v4.10.20 — payment entry hierarchy verification.
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
execSync(`node --check "${join(root, 'js', 'payment-brain.js')}"`, { stdio: 'inherit' });
execSync(`node --check "${join(root, 'js', 'documents-brain.js')}"`, { stdio: 'inherit' });

console.log('== v4.10.20 payment entry hierarchy ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const paymentBrain = load('js/payment-brain.js');
const css = load('css/style.css');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

assert(indexHtml.includes('v4.10.25'), 'index.html should show v4.10.25');
assert(indexHtml.includes('js/app.js?v=4.10.25'), 'app.js cache buster should be v4.10.25');
assert(storageJs.includes("BUDIL_VERSION: 'v4.10.25'"), 'storage.js version should be v4.10.25');
assert(dataBackupJs.includes("APP_VERSION: 'v4.10.25'"), 'data-backup version should be v4.10.25');

const receivablesStart = indexHtml.indexOf('id="view-receivables"');
const receivablesEnd = indexHtml.indexOf('id="view-follow-up"');
const receivablesChunk = indexHtml.slice(receivablesStart, receivablesEnd);

assert(receivablesChunk.includes('主入口'), '入金予定 view subtitle should declare it as main entry');
assert(receivablesChunk.includes('入金確認'), '入金予定 view should mention 入金確認');
assert(receivablesChunk.includes('入金待ちサマリー'), 'receivables summary card should remain');
assert(receivablesChunk.includes('入金予定一覧'), 'receivables list card should remain');
assert(receivablesChunk.includes('receivables-filter-btn'), 'receivables filter buttons should remain');
assert(receivablesChunk.includes('入金済み'), '入金済み button should remain in receivables');
assert(
  receivablesChunk.indexOf('入金確認') < receivablesChunk.indexOf('receivables-summary'),
  '入金確認 note should appear in header before summary card'
);

const revenueManualStart = indexHtml.indexOf('id="revenue-manual-input-details"');
const revenueManualEnd = indexHtml.indexOf('id="view-receivables"');
const revenueManualChunk = indexHtml.slice(revenueManualStart, revenueManualEnd);

assert(revenueManualChunk.includes('revenue-payment-details'), 'revenue payment details should exist');
assert(revenueManualChunk.includes('入金管理（補助）'), 'revenue payment details summary should mark as supplementary');
assert(revenueManualChunk.includes('revenue-payment-assist-note'), 'revenue payment assist note should exist');
assert(revenueManualChunk.includes('入金予定'), 'revenue payment assist note should reference 入金予定');
assert(!revenueManualChunk.includes('<summary>入金管理</summary>'), 'bare 入金管理 summary in revenue form must be replaced');

const docFormStart = indexHtml.indexOf('id="doc-form"');
const docFormEnd = indexHtml.indexOf('id="view-receivables"');
const docFormChunk = docFormStart > 0 ? indexHtml.slice(docFormStart, docFormEnd) : '';

assert(indexHtml.includes('入金管理（書類・補助）'), 'doc payment details summary should mark as supplementary document');
assert(indexHtml.includes('doc-payment-assist-note'), 'doc payment assist note should exist');
assert(indexHtml.includes('請求書は書類'), 'doc payment note should clarify invoice is a document not source of truth');

assert(indexHtml.includes('現場での支払い状態を記録'), 'work-completion modal should note field record purpose');
assert(indexHtml.includes('支払い状態（現場記録）'), 'work-completion payment label should indicate field record');
assert(!indexHtml.includes('支払い状態 *</label>'), 'old mandatory label text without field-record note must be replaced');

assert(indexHtml.includes('入金確認：入金予定'), 'revenue-flow-hint should include payment confirmation pointing to 入金予定');

assert(appJs.includes('markReceivablePaid'), 'markReceivablePaid function should remain');
assert(appJs.includes('syncLinkedPayment'), 'syncLinkedPayment should be called from markReceivablePaid');
assert(appJs.includes('renderReceivablesView'), 'renderReceivablesView should remain');
assert(appJs.includes('summarizeReceivables'), 'summarizeReceivables call should remain');
assert(appJs.includes('filterReceivables'), 'filterReceivables call should remain');

assert(paymentBrain.includes('buildReceivableItems'), 'buildReceivableItems should exist in payment-brain');
assert(paymentBrain.includes('syncLinkedPayment'), 'syncLinkedPayment should exist in payment-brain');
assert(
  paymentBrain.includes('docList.forEach(doc =>'),
  'document-first iteration in buildReceivableItems should remain'
);
assert(
  paymentBrain.includes("rev.linkedDocumentId && docList.some(d => d.id === rev.linkedDocumentId"),
  'revenue side should skip when linked document handles it (no-double-display guard)'
);

assert(appJs.includes('tryLinkDocumentToExistingRevenue'), 'invoice link guard should remain (v4.10.12)');
assert(appJs.includes('confirmRevenueSaveWithDuplicateCheck'), 'duplicate guard should remain (v4.10.12)');
assert(appJs.includes('isWorkOrderRevenueLocked'), 'actualRevenueId lock should remain');
assert(!appJs.includes('localStorage.clear()'), 'localStorage.clear must not be used');

assert(css.includes('v4.10.20'), 'css should include v4.10.20 marker');

const forbiddenUiTerms = [
  '売上登録',
  '売上登録へ',
  '一括売上登録',
  '登録対象を売上登録',
  '作業後確定',
  '作業後売上確定',
  '作業完了後',
  '作業完了',
  '売上登録済み'
];
for (const term of forbiddenUiTerms) {
  assert(!indexHtml.includes(term), `index.html should not include ${term} in normal UI`);
}

console.log('== regression: v4.10.18 calendar-first onboarding ==');
execSync('node scripts/verify-v41018-calendar-first-onboarding.mjs', { cwd: root, stdio: 'inherit' });

assert(statusMd.includes('v4.10.20'), 'status.md should document v4.10.20');
assert(handoffMd.includes('v4.10.20'), 'handoff.md should document v4.10.20');
assert(decisionLog.includes('v4.10.20'), 'decision-log.md should record v4.10.20');

console.log('All v4.10.20 payment entry hierarchy checks passed.');
