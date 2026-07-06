/**
 * Budil v4.11.10 - monthly billing workflow for coop/yamada verification.
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
  'js/app.js',
  'js/storage.js',
  'js/data-backup.js'
]) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.11.10 monthly-billing-workflow ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
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

console.log('== version check ==');
assert(indexHtml.includes('v4.11.10'), 'index.html should show v4.11.10');
assert(indexHtml.includes('js/app.js?v=4.11.10'), 'app.js cache buster should be v4.11.10');
assert(indexHtml.includes('css/style.css?v=4.11.10'), 'style.css cache buster should be v4.11.10');
assert(storageJs.includes("BUDIL_VERSION: 'v4.11.10'"), 'storage.js version should be v4.11.10');
assert(dataBackupJs.includes("APP_VERSION: 'v4.11.10'"), 'data-backup version should be v4.11.10');
assert(statusMd.includes('v4.11.10'), 'status.md should document v4.11.10');
assert(handoffMd.includes('v4.11.10'), 'handoff.md should document v4.11.10');
assert(decisionLog.includes('v4.11.10'), 'decision-log.md should record v4.11.10');

console.log('== receivables layout ==');
const viewReceivables = indexHtml.slice(
  indexHtml.indexOf('<section id="view-receivables"'),
  indexHtml.indexOf('<!-- フォロー -->')
);
assert(viewReceivables.includes('月末請求確認'), 'month-end billing review section required');
assert(viewReceivables.includes('月次請求'), 'monthly billing section required');
assert(viewReceivables.includes('1件ごと入金確認'), 'individual billing section required');
assert(viewReceivables.indexOf('receivables-monthly-billing-card') < viewReceivables.indexOf('receivables-list-card'),
  'monthly billing should be above individual list');

console.log('== app wiring ==');
assert(appJs.includes('renderReceivablesMonthlyBillingGroups'), 'monthly billing renderer required');
assert(appJs.includes('renderReceivablesMonthEndReview'), 'month-end review renderer required');
assert(appJs.includes('filterReceivableItemsForIndividualBilling'), 'individual billing filter required');
assert(appJs.includes('markMonthlyBillingGroupBilled'), 'group billed action required');
assert(appJs.includes('markMonthlyBillingGroupPaid'), 'group paid action required');
assert(appJs.includes('setRevenueBillingMonth'), 'billing month setter required');
assert(appJs.includes("monthlyBillingStatus: 'billed'"), 'billed status patch required');
assert(!appJs.includes('localStorage.clear'), 'localStorage.clear forbidden');

console.log('== revenue-brain monthly billing API ==');
assert(revenueBrainJs.includes('isMonthlyBillingSource'), 'isMonthlyBillingSource required');
assert(revenueBrainJs.includes('getMonthlyBillingSourceGroup'), 'getMonthlyBillingSourceGroup required');
assert(revenueBrainJs.includes('buildMonthlyBillingGroups'), 'buildMonthlyBillingGroups required');
assert(revenueBrainJs.includes('isMonthEndBillingReviewCandidate'), 'month-end review helper required');
assert(revenueBrainJs.includes('coop: 80'), 'coop profit rate must remain');
assert(revenueBrainJs.includes('yamada: 60'), 'yamada profit rate must remain');
assert(revenueBrainJs.includes('totalProfit = confirmedGrossProfit + scheduledGrossProfit - monthExpense'),
  'totalProfit formula must remain');

console.log('== forbidden terms ==');
const forbidden = ['見込み売上', '見込み利益', '今月売上', '今月利益', '予定含む', '予測利益'];
for (const term of forbidden) {
  assert(!viewReceivables.includes(term), `receivables view must not include ${term}`);
}

console.log('== runtime monthly billing logic ==');
function createSandbox() {
  const sandbox = {
    console,
    PaymentBrain: null,
    RevenueBrain: null,
    FollowUpBrain: { normalizeFollowUp: (f) => f },
    DocumentsBrain: null,
    WorkOrderBrain: null,
    ProfitBrain: null,
    ExecutiveBrain: null,
    RevenueSummaryBrain: null,
    MonthlyResultsBrain: null
  };
  runInContext(load('js/payment-brain.js'), createContext(sandbox));
  runInContext(load('js/revenue-brain.js'), createContext(sandbox));
  return createContext(sandbox);
}
const ctx = createSandbox();
const RB = runInContext('RevenueBrain', ctx);
assert(RB, 'RevenueBrain should load in sandbox');

assert(RB.isMonthlyBillingSource('\u30b3\u30fc\u30d7'), '\u30b3\u30fc\u30d7 should be monthly billing');
assert(RB.isMonthlyBillingSource('\u30b3\u30fc\u30d7\u30cf\u30a6\u30b8\u30f3\u30b0'), '\u30b3\u30fc\u30d7\u30cf\u30a6\u30b8\u30f3\u30b0 should be monthly billing');
assert(RB.isMonthlyBillingSource('\u30e4\u30de\u30c0'), '\u30e4\u30de\u30c0 should be monthly billing');
assert(RB.isMonthlyBillingSource('\u30e4\u30de\u30c0\u96fb\u6a5f'), '\u30e4\u30de\u30c0\u96fb\u6a5f should be monthly billing');
assert(RB.isMonthlyBillingSource('YAMADA'), 'YAMADA should be monthly billing');
assert(!RB.isMonthlyBillingSource('\u304f\u3089\u3057\u306e\u30de\u30fc\u30b1\u30c3\u30c8'), '\u304f\u3089\u3057\u306e\u30de\u30fc\u30b1\u30c3\u30c8 must not be monthly billing');
assert(!RB.isMonthlyBillingSource('110\u756a'), '110\u756a must not be monthly billing');
assert(RB.getMonthlyBillingSourceGroup('\u30b3\u30fc\u30d7') === 'coop', 'coop group');
assert(RB.getMonthlyBillingSourceGroup('\u30e4\u30de\u30c0\u96fb\u6a5f') === 'yamada', 'yamada group');

const sampleRecords = [
  { id: 'r1', workDate: '2026-07-30', amount: 25300, source: '\u30e4\u30de\u30c0', status: '\u78ba\u5b9a', paymentStatus: 'pending' },
  { id: 'r2', workDate: '2026-07-10', amount: 10000, source: 'LP', status: '\u78ba\u5b9a', paymentStatus: 'pending' },
  { id: 'r3', workDate: '2026-07-28', amount: 32670, source: '\u30b3\u30fc\u30d7', status: '\u78ba\u5b9a', paymentStatus: 'pending', billingMonth: '2026-08' }
];
const review = RB.collectMonthEndBillingReviewRecords(sampleRecords, '2026-07-31');
assert(review.some(r => r.id === 'r1'), 'month-end yamada should appear in review');
assert(!review.some(r => r.id === 'r3'), 'record with billingMonth set should not appear in review');
assert(!review.some(r => r.id === 'r2'), 'non-monthly source should not appear in review');

const groupsDefault = RB.buildMonthlyBillingGroups([
  { id: 'c1', workDate: '2026-07-05', amount: 10000, source: '\u30b3\u30fc\u30d7', status: '\u78ba\u5b9a', paymentStatus: 'pending' },
  { id: 'c2', workDate: '2026-07-20', amount: 5000, source: '\u30b3\u30fc\u30d7', status: '\u78ba\u5b9a', paymentStatus: 'pending' }
]);
assert(groupsDefault.length === 1, 'default billing month groups by workDate month');
assert(groupsDefault[0].billingMonth === '2026-07', 'default billing month from workDate');
assert(groupsDefault[0].totalRevenue === 15000, 'group revenue sum');
assert(groupsDefault[0].totalProfit === 12000, 'coop 80% profit on 15000');

const groupsExplicit = RB.buildMonthlyBillingGroups([sampleRecords[2]]);
assert(groupsExplicit[0].billingMonth === '2026-08', 'explicit billingMonth grouping');

const coopProfit = RB.computeRecordGrossShare({ amount: 10000, source: '\u30b3\u30fc\u30d7' });
const yamadaProfit = RB.computeRecordGrossShare({ amount: 10000, source: '\u30e4\u30de\u30c0' });
assert(coopProfit === 8000, 'coop 80% profit');
assert(yamadaProfit === 6000, 'yamada 60% profit');

const receivableItems = [
  { revenue: { source: '\u30b3\u30fc\u30d7', amount: 1000 }, primaryKind: 'revenue' },
  { revenue: { source: 'LP', amount: 2000 }, primaryKind: 'revenue' }
];
const individual = RB.filterReceivableItemsForIndividualBilling(receivableItems);
assert(individual.length === 1, 'coop/yamada excluded from individual receivables');
assert(individual[0].revenue.source === 'LP', 'direct source remains in individual list');

assert(!receptionJs.includes('buildMonthlyBillingGroups'), 'reception-brain must not change');
assert(!documentsJs.includes('buildMonthlyBillingGroups'), 'documents-brain must not change');
assert(!followJs.includes('buildMonthlyBillingGroups'), 'follow-up-brain must not change');

assert(css.includes('#view-receivables .receivables-monthly-billing-groups'), 'receivables monthly billing CSS required');

console.log('\nAll v4.11.10 monthly-billing-workflow checks passed.');
