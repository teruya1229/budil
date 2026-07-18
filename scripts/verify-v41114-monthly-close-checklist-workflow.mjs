/**
 * Budil v4.12.4 - monthly close checklist workflow verification.
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

for (const file of [
  'js/payment-brain.js',
  'js/revenue-brain.js',
  'js/profit-brain.js',
  'js/app.js',
  'js/storage.js',
  'js/data-backup.js'
]) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.12.4 monthly-close-checklist-workflow ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const profitJs = load('js/profit-brain.js');
const revenueBrainJs = load('js/revenue-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');
const receptionJs = load('js/reception-brain.js');
const documentsJs = load('js/documents-brain.js');
const followJs = load('js/follow-up-brain.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

const NG_TERMS = [
  '見込み売上', '見込み利益', '今月売上', '今月利益', '予定含む', '予測利益',
  '自動月次締め', '自動請求書', '会計ソフト', 'localStorage' + '.clear'
];

console.log('== version check ==');
assert(indexHtml.includes('v4.12.14'), 'index.html should show v4.12.14');
assert(indexHtml.includes('js/app.js?v=4.12.14'), 'app.js cache buster should be v4.12.14');
assert(indexHtml.includes('css/style.css?v=4.12.14'), 'style.css cache buster should be v4.12.14');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.14'"), 'storage.js version should be v4.12.14');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.14'"), 'data-backup version should be v4.12.14');

console.log('== monthly close page structure ==');
const viewMonthly = indexHtml.slice(
  indexHtml.indexOf('<section id="view-monthly-results"'),
  indexHtml.indexOf('<!-- 集客チェック')
);
assert(viewMonthly.includes('月末チェックリスト'), 'month-end checklist title required');
assert(viewMonthly.includes('month-end-checklist'), 'checklist container required');
assert(viewMonthly.includes('売上確定漏れ'), 'revenue gaps section required');
assert(viewMonthly.includes('入金待ち / 入金遅れ'), 'payment pending section required');
assert(viewMonthly.includes('コープ・ヤマダ月次請求確認'), 'monthly billing section required');
assert(viewMonthly.includes('経費入力確認'), 'expense check section required');
assert(viewMonthly.includes('請求書/見積書補助確認'), 'documents aux section required');
assert(viewMonthly.includes('月次実績入力'), 'monthly results form must remain');
assert(viewMonthly.includes('利益確認'), 'profit check section required');
assert(viewMonthly.includes('詳細分析・履歴'), 'details collapse required');
assert(viewMonthly.indexOf('month-end-checklist') < viewMonthly.indexOf('month-end-revenue-gaps'),
  'checklist should be above revenue gaps');
assert(viewMonthly.indexOf('month-end-revenue-gaps') < viewMonthly.indexOf('month-end-payment-pending'),
  'revenue gaps should be above payment pending');
assert(viewMonthly.indexOf('month-end-payment-pending') < viewMonthly.indexOf('month-end-monthly-billing'),
  'payment pending should be above monthly billing');
assert(viewMonthly.indexOf('month-end-monthly-billing') < viewMonthly.indexOf('month-end-expense-check'),
  'monthly billing should be above expense check');
assert(viewMonthly.indexOf('month-end-expense-check') < viewMonthly.indexOf('month-end-documents-aux'),
  'expense check should be above documents aux');
assert(viewMonthly.indexOf('monthly-results-form-card') < viewMonthly.indexOf('month-end-profit-check'),
  'monthly results form should be above profit check');
assert(viewMonthly.indexOf('month-end-profit-check') < viewMonthly.indexOf('card-month-end-details-collapse'),
  'profit check should be above details collapse');
assert(viewMonthly.includes('請求月ベース'), 'billing month hint required');
assert(viewMonthly.includes('作業月ベース'), 'work month hint required');
assert(viewMonthly.includes('入金月ベース'), 'payment month hint required');

console.log('== app wiring ==');
assert(appJs.includes('getMonthEndCloseContext'), 'month-end context builder required');
assert(appJs.includes('renderMonthEndChecklist'), 'checklist renderer required');
assert(appJs.includes('renderMonthEndRevenueGaps'), 'revenue gaps renderer required');
assert(appJs.includes('renderMonthEndPaymentPending'), 'payment pending renderer required');
assert(appJs.includes('renderMonthEndMonthlyBilling'), 'monthly billing renderer required');
assert(appJs.includes('renderMonthEndExpenseCheck'), 'expense check renderer required');
assert(appJs.includes('renderMonthEndDocumentsAux'), 'documents aux renderer required');
assert(appJs.includes('renderMonthEndProfitCheck'), 'profit check renderer required');
assert(appJs.includes('scheduleMode: true'), 'revenue gaps must use schedule mode');
assert(appJs.includes('売上確定へ'), 'revenue confirm action required');
assert(appJs.includes('作業予定を見る'), 'schedule link required');
assert(appJs.includes('月次請求を見る'), 'monthly billing link required');
assert(appJs.includes('請求書/見積書へ'), 'documents link required');
assert(appJs.includes('月次実績を入力'), 'monthly results action required');
assert(!appJs.includes('自動月次締め'), 'auto close forbidden');
assert(!appJs.includes('localStorage.clear'), 'localStorage.clear forbidden');

console.log('== profit-brain checklist API ==');
assert(profitJs.includes('buildMonthEndChecklist'), 'buildMonthEndChecklist required');
assert(profitJs.includes("id: 'curama-deferred'"), 'curama deferred checklist item required');
assert(appJs.includes('renderMonthEndCuramaDeferred'), 'month-end curama deferred renderer required');
assert(revenueBrainJs.includes('buildMonthlyBillingGroups'), 'monthly billing groups must remain');
assert(revenueBrainJs.includes('coop: 80'), 'coop profit rate must remain');
assert(revenueBrainJs.includes('yamada: 60'), 'yamada profit rate must remain');

console.log('== forbidden terms in monthly close view ==');
for (const term of NG_TERMS) {
  assert(!viewMonthly.includes(term), `monthly close view must not include ${term}`);
}

console.log('== v4.11.5 / v4.11.8 / v4.11.9 / v4.11.10 / v4.11.11 / v4.12.4 maintained ==');
assert(appJs.includes('buildSharedMonthlyMetrics'), 'shared monthly metrics must remain');
assert(appJs.includes('renderReceivablesMonthlyBillingGroups'), 'v4.11.9 billing renderer must remain');
assert(appJs.includes('buildTodayPriorityAction'), 'v4.11.10 executive priority must remain');
assert(appJs.includes('renderWorkOrderPendingCompletionList'), 'v4.11.11 schedule queue must remain');
assert(appJs.includes('renderFollowUpTodayList'), 'v4.12.4 follow list must remain');
assert(appJs.includes('renderReceptionListSection'), 'v4.11.12 reception list must remain');

console.log('== untouched modules ==');
assert(!receptionJs.includes('renderMonthEndChecklist'), 'reception-brain must not change');
assert(!documentsJs.includes('renderMonthEndChecklist'), 'documents-brain must not change');
assert(!followJs.includes('renderMonthEndChecklist'), 'follow-up-brain must not change');

console.log('== css ==');
assert(css.includes('month-end-checklist-row'), 'checklist row style required');
assert(css.includes('month-end-profit-grid'), 'profit grid style required');
assert(css.includes('card-month-end-details-collapse'), 'details collapse style required');

console.log('== storage keys unchanged ==');
assert(storageJs.includes("REVENUE_RECORDS: 'budil_revenue_records'"), 'revenue storage key must remain');
assert(storageJs.includes("MONTHLY_RESULTS: 'budil_monthly_results'"), 'monthly results key must remain');

function createSandbox() {
  const sandbox = {
    console,
    PaymentBrain: null,
    RevenueBrain: null,
    MonthlyResultsBrain: {
      findForMonth: (records, month) => (records || []).find(r => r.month === month) || null
    },
    ProfitBrain: null
  };
  runInContext(load('js/payment-brain.js'), createContext(sandbox));
  runInContext(load('js/revenue-brain.js'), createContext(sandbox));
  runInContext(load('js/profit-brain.js'), createContext(sandbox));
  return createContext(sandbox);
}

console.log('== runtime checklist logic ==');
const ctx = createSandbox();
const PB = runInContext('ProfitBrain', ctx);
assert(PB, 'ProfitBrain should load');
const checklist = PB.buildMonthEndChecklist({
  today: '2026-07-31',
  revenues: [
    { id: 'r1', workDate: '2026-07-10', amount: 10000, source: 'コープ', status: '確定', paymentStatus: 'pending' },
    { id: 'r2', workDate: '2026-07-20', amount: 8000, source: 'LP', status: '確定', paymentStatus: 'paid', paidAmount: 8000 }
  ],
  expenses: [{ date: '2026-07-05', amount: 1000, category: 'その他' }],
  documents: [{ type: 'invoice', status: 'draft' }],
  monthlyResults: [],
  revenueGapCount: 2,
  revenueGapAmount: 25000
});
assert(checklist.items.length === 8, 'checklist should have 8 items');
assert(checklist.items[0].label === '売上確定漏れ', 'first item should be revenue gaps');
assert(checklist.items[0].count === 2, 'revenue gap count');
const billingItem = checklist.items.find(i => i.id === 'monthly-billing');
assert(billingItem, 'monthly billing checklist item required');
const curamaDeferredItem = checklist.items.find(i => i.id === 'curama-deferred');
assert(curamaDeferredItem, 'curama deferred checklist item required');
assert(checklist.metrics.billingGroups.length >= 1, 'coop billing group should exist');

console.log('\nAll v4.12.4 monthly-close-checklist-workflow checks passed.');
