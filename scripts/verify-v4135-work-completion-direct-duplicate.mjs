/**
 * Budil v4.13.7 - 売上確定画面の直受け追加複製 verify
 *
 * Background: v4.13.1/4 では「直受け追加で複製」が受付・予定確認の作業予定
 * 編集フォームにしかない。実務では売上確定モーダルから同じ操作が必要。
 *
 * Fix: #work-completion-modal の操作欄へ同名ボタンを追加。通常の作業予定
 * （queue source=work-order かつ Storage に対象あり）でのみ表示・有効。
 * past-recovery / 対象なし / モーダル閉鎖後は非表示・無効。
 * 押下時は確認後にモーダルを閉じ、Storage 上の元予定から表示項目だけを
 * 引き継いだ未保存 draft を作業予定入力へ表示する。即保存しない。
 * 既存の作業予定編集画面の複製ボタンは維持。
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (file) => readFileSync(join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

const html = load('index.html');
const app = load('js/app.js');
const revenueBrainSrc = load('js/revenue-brain.js');
const receptionBrainSrc = load('js/reception-brain.js');
const storage = load('js/storage.js');
const dataBackup = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');
const css = load('css/style.css');

for (const file of ['js/app.js', 'js/revenue-brain.js', 'js/storage.js', 'js/data-backup.js']) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
}

console.log('== version / cache buster ==');
assert(html.includes('Budil v4.13.10'), 'index.html shows Budil v4.13.10');
assert(html.includes('js/app.js?v=4.13.10'), 'app.js cache buster is v4.13.10');
assert(html.includes('js/revenue-brain.js?v=4.13.10'), 'revenue-brain.js cache buster is v4.13.10');
assert(html.includes('css/style.css?v=4.13.10'), 'style.css cache buster is v4.13.10');
assert(storage.includes("BUDIL_VERSION: 'v4.13.10'"), 'storage version is v4.13.10');
assert(dataBackup.includes("APP_VERSION: 'v4.13.10'"), 'data-backup version is v4.13.10');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.10'"), 'verify-current pins v4.13.10');
assert(
  /^verify-v4(10|11|12|13)\d.*\.mjs$/.test('verify-v4135-work-completion-direct-duplicate.mjs'),
  'new verify is discoverable by current pattern'
);
assert(statusMd.includes('v4.13.10'), 'status.md documents v4.13.10');
assert(handoffMd.includes('v4.13.10'), 'handoff.md documents v4.13.10');
assert(decisionLog.includes('v4.13.10'), 'decision-log.md records v4.13.10');

console.log('== 1-2. button only inside work-completion-form actions ==');
const completionFormMatch = html.match(/<form id="work-completion-form">([\s\S]*?)<\/form>/);
assert(!!completionFormMatch, 'work-completion-form exists');
const completionFormHtml = completionFormMatch[1];
assert(completionFormHtml.includes('id="btn-work-completion-duplicate-direct"'),
  'duplicate button is inside work-completion-form');
assert((html.match(/id="btn-work-completion-duplicate-direct"/g) || []).length === 1,
  'completion duplicate button appears exactly once');
assert(completionFormHtml.includes('work-completion-modal-actions'),
  'actions bar class remains');
const actionsMatch = completionFormHtml.match(
  /<div class="modal-actions work-completion-modal-actions">([\s\S]*?)<\/div>/
);
assert(!!actionsMatch, 'work-completion-modal-actions exists');
assert(actionsMatch[1].includes('id="btn-work-completion-duplicate-direct"'),
  'button is inside work-completion-modal-actions');
assert(actionsMatch[1].includes('入力内容を確認して確定'), 'submit button requires content confirmation');
assert(actionsMatch[1].includes('id="btn-work-completion-add-task"'), 'add-task button remains');
assert(actionsMatch[1].includes('id="btn-work-completion-cancel-modal"'), 'close button remains');
assert(
  /id="btn-work-completion-duplicate-direct"[^>]*type="button"/.test(actionsMatch[1])
  || /type="button"[^>]*id="btn-work-completion-duplicate-direct"/.test(actionsMatch[1]),
  'button type is button'
);
assert(
  /id="btn-work-completion-duplicate-direct"[^>]*class="btn btn-secondary hidden"[^>]*disabled/.test(actionsMatch[1])
  || /id="btn-work-completion-duplicate-direct"[^>]*class="[^"]*btn btn-secondary hidden[^"]*"[^>]*disabled/.test(actionsMatch[1]),
  'initial state is hidden + disabled via btn btn-secondary'
);
assert(actionsMatch[1].includes('直受け追加で複製'), 'button label is 直受け追加で複製');

console.log('== 3-5. visibility sync conditions ==');
assert(app.includes('function syncWorkCompletionDuplicateDirectButton('),
  'syncWorkCompletionDuplicateDirectButton exists');
{
  const start = app.indexOf('function syncWorkCompletionDuplicateDirectButton(');
  const next = app.indexOf('\n  function ', start + 10);
  const body = app.slice(start, next > start ? next : start + 1800);
  assert(body.includes("source === 'work-order'"), 'shows only for work-order queue source');
  assert(body.includes('work-completion-wo-id'), 'checks work-completion-wo-id');
  assert(body.includes('getWorkOrders()'), 'checks Storage work order existence');
  assert(body.includes("classList.contains('hidden')") || body.includes('modalOpen'),
    'requires modal open / hides when closed');
  assert(body.includes("dupBtn.classList.toggle('hidden'") || body.includes("btn.classList.toggle('hidden'"),
    'toggles hidden class');
  assert(body.includes('.disabled = !canShow') || body.includes('disabled = !canShow'),
    'toggles disabled');
}
{
  const start = app.indexOf('function openWorkCompletionModalFromQueue(');
  const next = app.indexOf('\n  function ', start + 10);
  const body = app.slice(start, next > start ? next : start + 800);
  assert(body.includes('syncWorkCompletionDuplicateDirectButton()'),
    'openWorkCompletionModalFromQueue syncs button after queue source set');
  assert(body.includes("source === 'past-recovery'"), 'past-recovery source still set');
}
{
  const start = app.indexOf('function closeWorkCompletionModal(');
  const next = app.indexOf('\n  function ', start + 10);
  const body = app.slice(start, next > start ? next : start + 600);
  assert(body.includes('syncWorkCompletionDuplicateDirectButton()'),
    'closeWorkCompletionModal syncs button (hide after close)');
}

console.log('== 6. event listener not double-bound ==');
{
  const start = app.indexOf('function initWorkCompletion(');
  const next = app.indexOf('\n  function ', start + 10);
  const body = app.slice(start, next > start ? next : start + 3500);
  assert(body.includes('btn-work-completion-duplicate-direct'),
    'initWorkCompletion wires completion duplicate button');
  assert(body.includes("dupCompletionBtn.dataset.bound") || body.includes('dataset.bound'),
    'completion duplicate listener uses dataset.bound guard');
  assert(body.includes('duplicateWorkOrderFromCompletionAsDirectReceive'),
    'wires duplicateWorkOrderFromCompletionAsDirectReceive');
}

console.log('== 7-17. completion duplicate behavior ==');
assert(app.includes('function applyDirectReceiveDuplicateDraftToForm('),
  'shared draft helper exists');
assert(app.includes('function duplicateWorkOrderFromCompletionAsDirectReceive('),
  'completion duplicate handler exists');
{
  const start = app.indexOf('function duplicateWorkOrderFromCompletionAsDirectReceive(');
  const next = app.indexOf('\n  function ', start + 10);
  const body = app.slice(start, next > start ? next : start + 4500);
  assert(body.includes("source !== 'work-order'"), 'refuses non work-order source');
  assert(body.includes('work-completion-wo-id'), 'reads work-completion-wo-id');
  assert(body.includes('confirm('), 'shows confirm dialog');
  assert(body.includes('売上確定画面の入力内容は保存されません。元の予定を残したまま、直受け追加用の未保存予定を作成します。続けますか？'),
    'confirm message matches spec');
  assert(body.includes('if (!ok) return'), 'cancel returns without changes');
  assert(body.includes('closeWorkCompletionModal()'), 'continues by closing completion modal');
  assert(body.includes("navigateToView('calendar-registration')"), 'navigates to calendar-registration');
  assert(body.includes('openWorkOrderFormPanel('), 'opens work order form panel');
  assert(body.includes('applyDirectReceiveDuplicateDraftToForm('), 'applies draft via shared helper');
  assert(body.includes('直受け追加用に複製しました。作業内容と金額を確認して保存してください。元の予定は変更していません。'),
    'shows required toast');
  assert(!/Storage\.(addWorkOrder|updateWorkOrder)\s*\(/.test(body),
    'completion duplicate does not call Storage.add/updateWorkOrder');
  assert(!/submitWorkCompletion\s*\(/.test(body),
    'completion duplicate does not call submitWorkCompletion');
  assert(!/addExpenseRecord|addRevenueRecord/.test(body),
    'completion duplicate does not create revenue/expense');
  assert(body.includes('existing.customerName') && body.includes('existing.phone')
    && body.includes('existing.address') && body.includes('existing.area')
    && body.includes('existing.serviceText') && body.includes('existing.scheduledDate')
    && body.includes('existing.startTime') && body.includes('existing.endTime')
    && body.includes('existing.estimateAmount') && body.includes('existing.memo'),
    'inherits display fields from Storage work order');
  assert(!/actualRevenueId|candidateMeta|calendarDedupeKey|completedAt|sourceCandidateId|confirmedRevenue|completion\s*:/.test(body),
    'does not copy calendar/candidate/revenue/completion linkage fields');
  assert(!/work-completion-amount|work-completion-inline|customer-asset|payment/.test(body),
    'does not copy modal-entered actual/expense/payment/asset fields');
}
{
  const start = app.indexOf('function applyDirectReceiveDuplicateDraftToForm(');
  const next = app.indexOf('\n  function ', start + 10);
  const body = app.slice(start, next > start ? next : start + 3500);
  assert(body.includes("document.getElementById('work-order-edit-id').value = ''"), 'clears edit id');
  assert(body.includes("'直受け'") || body.includes('"直受け"'), 'sets source to 直受け');
  assert(body.includes("value = 'confirmed'") || body.includes('value = "confirmed"'), 'sets status to confirmed');
  assert(body.includes("work-order-intake').value = ''"), 'clears related intake');
  assert(body.includes("work-order-lead').value = ''"), 'clears related lead');
  assert(body.includes('work-order-customer') && body.includes('work-order-phone')
    && body.includes('work-order-address') && body.includes('work-order-area')
    && body.includes('work-order-service') && body.includes('work-order-date')
    && body.includes('work-order-start') && body.includes('work-order-end')
    && body.includes('work-order-amount') && body.includes('work-order-memo'),
    'applies the 10 display fields');
}

console.log('== 18. existing work-order form duplicate preserved ==');
const formMatch = html.match(/<form id="work-order-form">([\s\S]*?)<\/form>/);
assert(!!formMatch, 'work-order-form exists');
assert(formMatch[1].includes('id="btn-work-order-duplicate-direct"'),
  'existing work-order duplicate button remains');
assert(app.includes('function duplicateWorkOrderFormAsDirectReceive('),
  'existing form duplicate handler remains');
{
  const start = app.indexOf('function duplicateWorkOrderFormAsDirectReceive(');
  const next = app.indexOf('\n  function ', start + 10);
  const body = app.slice(start, next > start ? next : start + 2500);
  assert(body.includes("getElementById('work-order-customer')"),
    'form duplicate still reads current form values');
  assert(body.includes('applyDirectReceiveDuplicateDraftToForm('),
    'form duplicate uses shared helper');
  assert(!/Storage\.(addWorkOrder|updateWorkOrder)\s*\(/.test(body),
    'form duplicate still does not save');
  assert(!/navigateToView\(/.test(body), 'form duplicate does not navigate away');
}

console.log('== 19. 直受け 100% and SOURCES[0] remains LP ==');
{
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(revenueBrainSrc + '\n;this.RevenueBrain = RevenueBrain;', sandbox);
  vm.runInContext(receptionBrainSrc + '\n;this.ReceptionBrain = ReceptionBrain;', sandbox);
  const RB = sandbox.RevenueBrain;
  assert(RB.SOURCES[0] === 'LP', 'SOURCES[0] remains LP');
  assert(RB.SOURCES.includes('直受け'), 'SOURCES includes 直受け');
  assert(RB.DEFAULT_GROSS_MARGIN_RATES['直受け'] === 100, 'DEFAULT_GROSS_MARGIN_RATES 直受け is 100');
  const profit = RB.getSourceProfitRate('直受け');
  assert(profit.rate === 100 && profit.reviewRequired === false, 'getSourceProfitRate(直受け) => 100');
}

console.log('== 20-22. no new storage key / no clear / no CSS change ==');
assert(storage.includes("WORK_ORDERS: 'budil_work_orders'"), 'work orders key unchanged');
assert(!storage.includes('budil_work_order_direct') && !app.includes('budil_work_completion_direct'),
  'no new direct-duplicate storage key');
assert(!app.includes('localStorage.clear(') && !storage.includes('localStorage.clear('),
  'localStorage.clear is not used');
assert(!/btn-work-completion-duplicate-direct/.test(css), 'no dedicated CSS for completion duplicate button');
assert(css.includes('.work-completion-modal-actions')
  && /work-completion-modal-actions\s*\{[^}]*flex-wrap:\s*wrap/.test(css),
  '.work-completion-modal-actions keeps flex-wrap: wrap');

console.log('== 23-24. submitWorkCompletion and existing verifies untouched ==');
assert(app.includes('function submitWorkCompletion('), 'submitWorkCompletion remains');
assert(!currentRunner.includes('skip') || currentRunner.includes('EXPECTED_VERSION'),
  'verify-current still runs full discovery');
assert(!/exclude|omit|skipVerify|assert\.relax/i.test(currentRunner.replace(/\/\*[\s\S]*?\*\//g, '')),
  'verify-current has no exclude/omit/relax of asserts');

console.log('== NG wording ==');
const ngWords = ['売上登録', '売上登録へ', '一括売上登録', '登録対象を売上登録', '作業完了後', '売上登録済み', '作業後確定', '作業後売上確定'];
for (const word of ngWords) {
  assert(!html.includes(word), `index.html must not revive NG wording: ${word}`);
}

console.log('== docs ==');
assert(statusMd.includes('売上確定') && (statusMd.includes('直受け追加で複製') || statusMd.includes('直受け追加複製')),
  'status.md mentions completion direct duplicate');
assert(handoffMd.includes('v4.13.10') && handoffMd.includes('直受け'),
  'handoff.md mentions v4.13.10 直受け');
assert(decisionLog.includes('v4.13.10') && (decisionLog.includes('売上確定') || decisionLog.includes('work-completion')),
  'decision-log records v4.13.10 completion duplicate');

console.log('\nAll v4.13.7 work-completion-direct-duplicate checks passed.');
