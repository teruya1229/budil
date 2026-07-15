/**
 * Budil v4.12.6 - touch card payment method and payment cycle labels verification.
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
const TOUCH_LABEL = 'カード：タッチ決済';

console.log('== v4.12.6 touch-card-payment-cycle ==');

console.log('== version / cache buster ==');
assert(indexHtml.includes('v4.12.13'), 'index.html should show v4.12.13');
assert(indexHtml.includes('js/app.js?v=4.12.13'), 'app.js cache buster should be v4.12.13');
assert(indexHtml.includes('css/style.css?v=4.12.13'), 'style.css cache buster should be v4.12.13');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.13'"), 'storage version should be v4.12.13');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.13'"), 'data-backup version should be v4.12.13');
assert(!indexHtml.includes('?v=4.12.7'), 'old cache buster v4.12.7 should be gone from index');
assert(indexHtml.includes('js/calendar-candidate-brain.js?v=4.12.13'), 'calendar-candidate cache buster should be v4.12.13');
assert(statusMd.includes('v4.12.13'), 'status.md should document v4.12.13');
assert(handoffMd.includes('v4.12.13'), 'handoff.md should document v4.12.13');
assert(decisionLog.includes('v4.12.13'), 'decision-log.md should record v4.12.13');
assert(statusMd.includes('v4.12.6'), 'status.md should retain v4.12.6 history');

console.log('== payment method options ==');
assert(paymentBrainJs.includes("value: 'card_touch'"), 'card_touch option required');
assert(paymentBrainJs.includes(TOUCH_LABEL), 'touch card label required');
assert(paymentBrainJs.includes("value: 'curama_online_card'"), 'curama_online_card option must remain');
assert(paymentBrainJs.includes("value: 'curama_deferred'"), 'curama_deferred option must remain');
assert(paymentBrainJs.includes(ONLINE_LABEL), 'online card label must remain');
assert(paymentBrainJs.includes(DEFERRED_LABEL), 'deferred label must remain');
assert(paymentBrainJs.includes("value: 'touch_payment'"), 'legacy touch_payment must remain');

console.log('== payment cycle helpers ==');
assert(paymentBrainJs.includes('PAYMENT_CYCLE_LABELS'), 'PAYMENT_CYCLE_LABELS required');
assert(paymentBrainJs.includes('getPaymentCycleLabel'), 'getPaymentCycleLabel required');
assert(paymentBrainJs.includes('getPaymentCycleNote'), 'getPaymentCycleNote required');
assert(revenueBrainJs.includes('getPaymentCycleLabel'), 'RevenueBrain.getPaymentCycleLabel required');
assert(revenueBrainJs.includes('getPaymentCycleNote'), 'RevenueBrain.getPaymentCycleNote required');

console.log('== app wiring ==');
assert(appJs.includes('updateRevenuePaymentCycleHint'), 'revenue payment cycle hint required');
assert(appJs.includes('updateWorkCompletionPaymentCycleHint'), 'work completion payment cycle hint required');
assert(appJs.includes('revenue-payment-cycle-hint'), 'revenue payment cycle hint element required');
assert(appJs.includes('work-completion-payment-cycle-hint'), 'work completion payment cycle hint element required');
assert(appJs.includes('card_touch'), 'app should reference card_touch');
assert(appJs.includes('payment-cycle-label'), 'payment cycle label display required');
assert(appJs.includes('renderReceivablesCuramaDeferredNotice'), 'receivables curama deferred notice must remain');
assert(appJs.includes('renderMonthEndCuramaDeferred'), 'month-end curama deferred section must remain');
assert(!appJs.includes('localStorage.clear'), 'localStorage.clear forbidden');

console.log('== html hints ==');
assert(indexHtml.includes('id="revenue-payment-cycle-hint"'), 'revenue payment cycle hint in html');
assert(indexHtml.includes('id="work-completion-payment-cycle-hint"'), 'work completion payment cycle hint in html');

console.log('== css ==');
assert(css.includes('payment-cycle-hint'), 'payment-cycle-hint style required');
assert(css.includes('payment-cycle-label'), 'payment-cycle-label style required');
assert(css.includes('payment-method-badge-touch-card'), 'touch card badge style required');

console.log('== profit / monthly billing unchanged ==');
assert(revenueBrainJs.includes('market: 80'), 'market profit rate must remain');
assert(revenueBrainJs.includes('coop: 80'), 'coop profit rate must remain');
assert(revenueBrainJs.includes('yamada: 60'), 'yamada profit rate must remain');
assert(profitBrainJs.includes("id: 'curama-deferred'"), 'month-end checklist curama deferred item must remain');

console.log('== forbidden terms ==');
const forbidden = ['見込み売上', '見込み利益', '今月売上', '今月利益', '売上登録へ', '一括売上登録', '作業完了後'];
const viewReceivables = indexHtml.slice(
  indexHtml.indexOf('<section id="view-receivables"'),
  indexHtml.indexOf('<!-- フォロー -->')
);
for (const term of forbidden) {
  assert(!viewReceivables.includes(term), `receivables view must not include ${term}`);
}

console.log('== runtime payment cycle logic ==');
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

assert(PaymentBrain.PAYMENT_METHOD_LABELS.card_touch === TOUCH_LABEL, 'card_touch label map');
assert(PaymentBrain.getPaymentCycleLabel('card_touch') === '5日払い', 'card_touch cycle label');
assert(PaymentBrain.getPaymentCycleLabel('touch_payment') === '5日払い', 'legacy touch_payment cycle label');
assert(PaymentBrain.getPaymentCycleLabel('cash') === '作業当日集金', 'cash cycle label');
assert(PaymentBrain.getPaymentCycleLabel('bank_transfer') === '入金確認が必要', 'bank_transfer cycle label');
assert(PaymentBrain.getPaymentCycleLabel('curama_online_card') === '毎月1日出金（祝日等は翌営業日）', 'curama online card cycle');
assert(PaymentBrain.getPaymentCycleLabel('curama_deferred') === '月末締め・翌月末払い', 'curama deferred cycle');
assert(PaymentBrain.getPaymentCycleLabel('', 'コープ') === '月次請求。請求月・入金月を確認', 'coop monthly billing cycle via source');
assert(PaymentBrain.getPaymentCycleLabel('', 'ヤマダ') === '月次請求。請求月・入金月を確認', 'yamada monthly billing cycle via source');
assert(PaymentBrain.getPaymentCycleLabel('') === '入金方法を確認', 'empty payment method cycle');
assert(PaymentBrain.getPaymentCycleLabel('', 'くらしのマーケット') === '入金方法を確認', 'kurashi source alone must not infer deferred');

assert(RevenueBrain.isCuramaOnlineCardPayment('curama_online_card'), 'curama_online_card distinct from touch');
assert(RevenueBrain.isCuramaDeferredPayment('curama_deferred'), 'curama_deferred distinct from touch');
assert(!RevenueBrain.isCuramaOnlineCardPayment('card_touch'), 'card_touch must not match online card');
assert(!RevenueBrain.isCuramaDeferredPayment('card_touch'), 'card_touch must not match deferred');

const touchNote = PaymentBrain.getPaymentCycleNote('card_touch');
assert(touchNote.includes('5日払い'), 'touch card note should mention 5日払い');
assert(touchNote.includes('入金確認はユーザーが行います'), 'touch card note should mention manual confirm');

const normalized = PaymentBrain.normalizeRevenuePayment({
  paymentMethod: 'card_touch',
  paymentStatus: 'pending',
  amount: 12000,
  workDate: '2026-07-01'
}, { total: 12000, defaultDate: '2026-07-01' });
assert(normalized.paymentMethod === 'card_touch', 'card_touch should persist on normalize');
assert(normalized.paymentStatus === 'pending', 'card_touch must not auto-mark paid');

const deferredSummary = RevenueBrain.buildCuramaDeferredSummary([
  { workDate: '2026-07-02', customerName: 'A', amount: 10000, paymentMethod: 'curama_deferred', paymentStatus: 'pending', status: '確定' }
]);
assert(deferredSummary.count === 1, 'kurashi deferred card summary must remain');

const coopGroup = RevenueBrain.buildMonthlyBillingGroups([
  { workDate: '2026-07-28', customerName: 'C', amount: 20000, source: 'コープ', paymentStatus: 'pending', status: '確定' }
]);
assert(coopGroup.length === 1, 'coop monthly billing group must remain');

const profitInfo = RevenueBrain.getSourceProfitRate('くらしのマーケット');
assert(profitInfo.rate === 80 && profitInfo.category === 'market', 'kurashi source profit rate unchanged');

console.log('PASS: v4.12.6 touch-card-payment-cycle');
