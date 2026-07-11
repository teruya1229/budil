/**
 * Budil v4.12.5 - curama online card and deferred payment methods verification.
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

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const paymentBrainJs = load('js/payment-brain.js');
const revenueBrainJs = load('js/revenue-brain.js');
const profitBrainJs = load('js/profit-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

const ONLINE_LABEL = 'くらしのマーケット：オンラインカード決済';
const DEFERRED_LABEL = 'くらしのマーケット：後払い';

console.log('== v4.12.5 curama-payment-methods ==');

console.log('== version / cache buster ==');
assert(indexHtml.includes('v4.12.10'), 'index.html should show v4.12.10');
assert(indexHtml.includes('js/app.js?v=4.12.10'), 'app.js cache buster should be v4.12.10');
assert(indexHtml.includes('css/style.css?v=4.12.10'), 'style.css cache buster should be v4.12.10');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.10'"), 'storage version should be v4.12.10');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.10'"), 'data-backup version should be v4.12.10');
assert(!indexHtml.includes('?v=4.12.7'), 'old cache buster v4.12.7 should be gone from index');
assert(indexHtml.includes('js/calendar-candidate-brain.js?v=4.12.10'), 'calendar-candidate cache buster should be v4.12.10');
assert(statusMd.includes('v4.12.5'), 'status.md should document v4.12.5');
assert(handoffMd.includes('v4.12.5'), 'handoff.md should document v4.12.5');
assert(decisionLog.includes('v4.12.5'), 'decision-log.md should record v4.12.5');

console.log('== payment method options ==');
assert(paymentBrainJs.includes("value: 'curama_online_card'"), 'curama_online_card option required');
assert(paymentBrainJs.includes("value: 'curama_deferred'"), 'curama_deferred option required');
assert(paymentBrainJs.includes(ONLINE_LABEL), 'online card label required');
assert(paymentBrainJs.includes(DEFERRED_LABEL), 'deferred label required');
assert(paymentBrainJs.includes("value: 'kurashi_deferred'"), 'legacy kurashi_deferred must remain');
assert(paymentBrainJs.includes("value: 'kurashi_card'"), 'legacy kurashi_card must remain');
assert(paymentBrainJs.includes("value: 'cash'"), 'cash option must remain');

console.log('== revenue-brain payment helpers ==');
assert(revenueBrainJs.includes('isCuramaOnlineCardPayment'), 'isCuramaOnlineCardPayment required');
assert(revenueBrainJs.includes('isCuramaDeferredPayment'), 'isCuramaDeferredPayment required');
assert(revenueBrainJs.includes('getPaymentMethodLabel'), 'getPaymentMethodLabel required');
assert(revenueBrainJs.includes('buildCuramaDeferredSummary'), 'buildCuramaDeferredSummary required');
assert(revenueBrainJs.includes('market: 80'), 'market profit rate must remain');
assert(revenueBrainJs.includes('coop: 80'), 'coop profit rate must remain');
assert(revenueBrainJs.includes('yamada: 60'), 'yamada profit rate must remain');

console.log('== app wiring ==');
assert(appJs.includes('renderReceivablesCuramaDeferredNotice'), 'receivables curama deferred notice required');
assert(appJs.includes('renderMonthEndCuramaDeferred'), 'month-end curama deferred section required');
assert(appJs.includes('renderReceivablePaymentMethodCell'), 'receivable payment method cell required');
assert(appJs.includes('fillWorkCompletionSelects'), 'work completion selects required');
assert(appJs.includes('curama_online_card'), 'work completion should include curama online card');
assert(appJs.includes('curama_deferred'), 'work completion should include curama deferred');
assert(!appJs.includes('localStorage.clear'), 'localStorage.clear forbidden');

console.log('== receivables / month-end layout ==');
const viewReceivables = indexHtml.slice(
  indexHtml.indexOf('<section id="view-receivables"'),
  indexHtml.indexOf('<!-- フォロー -->')
);
assert(viewReceivables.includes('receivables-curama-deferred-card'), 'receivables curama deferred card required');
assert(viewReceivables.includes('月末締め・翌月末入金'), 'deferred note required in receivables');
assert(indexHtml.includes('month-end-curama-deferred-card'), 'month-end curama deferred card required');
assert(viewReceivables.indexOf('receivables-curama-deferred-card') < viewReceivables.indexOf('receivables-list-card'),
  'curama deferred notice should be above individual list');

console.log('== profit month-end checklist ==');
assert(profitBrainJs.includes("id: 'curama-deferred'"), 'month-end checklist curama deferred item required');

console.log('== css badges ==');
assert(css.includes('payment-method-badge-deferred'), 'deferred badge style required');
assert(css.includes('payment-method-badge-online-card'), 'online card badge style required');

console.log('== forbidden terms ==');
const forbidden = ['見込み売上', '見込み利益', '今月売上', '今月利益', '売上登録へ', '一括売上登録', '作業完了後'];
for (const term of forbidden) {
  assert(!viewReceivables.includes(term), `receivables view must not include ${term}`);
}

console.log('== runtime payment logic ==');
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
const PaymentBrain = runInContext('PaymentBrain', ctx);
const RevenueBrain = runInContext('RevenueBrain', ctx);
assert(RevenueBrain, 'RevenueBrain should load in sandbox');
assert(PaymentBrain, 'PaymentBrain should load in sandbox');

assert(RevenueBrain.isCuramaOnlineCardPayment('curama_online_card'), 'curama_online_card should match online card');
assert(RevenueBrain.isCuramaOnlineCardPayment('kurashi_card'), 'legacy kurashi_card should match online card');
assert(RevenueBrain.isCuramaDeferredPayment('curama_deferred'), 'curama_deferred should match deferred');
assert(RevenueBrain.isCuramaDeferredPayment('kurashi_deferred'), 'legacy kurashi_deferred should match deferred');
assert(!RevenueBrain.isCuramaDeferredPayment(''), 'empty payment method must not infer deferred');
assert(!RevenueBrain.isCuramaDeferredPayment('', 'くらしのマーケット'), 'source alone must not infer deferred');

assert(PaymentBrain.PAYMENT_METHOD_LABELS.curama_online_card === ONLINE_LABEL, 'online card label map');
assert(PaymentBrain.PAYMENT_METHOD_LABELS.curama_deferred === DEFERRED_LABEL, 'deferred label map');

const normalized = PaymentBrain.normalizeRevenuePayment({
  paymentMethod: 'curama_deferred',
  paymentStatus: 'pending',
  amount: 25300,
  workDate: '2026-07-01'
}, { total: 25300, defaultDate: '2026-07-01' });
assert(normalized.paymentMethod === 'curama_deferred', 'curama_deferred should persist on normalize');

const legacy = PaymentBrain.normalizeRevenuePayment({
  amount: 10000,
  workDate: '2026-07-01'
}, { total: 10000, defaultDate: '2026-07-01' });
assert(legacy.paymentMethod === 'cash', 'missing paymentMethod should not break normalize');

const summary = RevenueBrain.buildCuramaDeferredSummary([
  { workDate: '2026-07-02', customerName: 'A', amount: 10000, paymentMethod: 'curama_deferred', paymentStatus: 'pending', status: '確定' },
  { workDate: '2026-07-03', customerName: 'B', amount: 15300, paymentMethod: 'curama_deferred', paymentStatus: 'paid', status: '確定' }
]);
assert(summary.count === 1, 'only pending deferred records should count');
assert(summary.total === 10000, 'deferred summary total should match open records');

const coopGroup = RevenueBrain.buildMonthlyBillingGroups([
  { workDate: '2026-07-28', customerName: 'C', amount: 20000, source: 'コープ', paymentStatus: 'pending', status: '確定' }
]);
assert(coopGroup.length === 1, 'coop monthly billing group must remain');

const profitInfo = RevenueBrain.getSourceProfitRate('くらしのマーケット');
assert(profitInfo.rate === 80 && profitInfo.category === 'market', 'kurashi source profit rate unchanged');

console.log('PASS: v4.12.5 curama-payment-methods');
