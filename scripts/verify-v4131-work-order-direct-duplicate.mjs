/**
 * Budil v4.13.5 - 売上確定待ち予定の直受け追加複製 verify
 *
 * Background: 元請け案件の作業当日にお客様から直接追加作業を受ける場合がある。
 * 元請け分の依頼元別利益率は維持し、追加作業分だけを別売上として
 * 「直受け・利益率100%」で確定できるようにする。
 *
 * Fix: 受付・予定確認画面の作業予定フォームに「直受け追加で複製」ボタンを追加。
 * 押下時は Storage へ保存せず、表示フォーム項目だけを引き継いだ未保存の新規
 * 作業予定フォームへ切り替える。依頼元は直受け、状態は confirmed、関連受付・
 * 関連営業先は空。元レコードは不変。保存は既存の保存ボタン経由のみ。
 * RevenueBrain.SOURCES に直受けを追加（SOURCES[0]=LP は維持）し、
 * DEFAULT_GROSS_MARGIN_RATES の直受けを100%とする。
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
assert(html.includes('Budil v4.13.5'), 'index.html shows Budil v4.13.5');
assert(html.includes('js/app.js?v=4.13.5'), 'app.js cache buster is v4.13.5');
assert(html.includes('js/revenue-brain.js?v=4.13.5'), 'revenue-brain.js cache buster is v4.13.5');
assert(html.includes('css/style.css?v=4.13.5'), 'style.css cache buster is v4.13.5');
assert(storage.includes("BUDIL_VERSION: 'v4.13.5'"), 'storage version is v4.13.5');
assert(dataBackup.includes("APP_VERSION: 'v4.13.5'"), 'data-backup version is v4.13.5');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.5'"), 'verify-current pins v4.13.5');
assert(statusMd.includes('v4.13.5'), 'status.md documents v4.13.5');
assert(handoffMd.includes('v4.13.5'), 'handoff.md documents v4.13.5');
assert(decisionLog.includes('v4.13.5'), 'decision-log.md records v4.13.5');

console.log('== 1. button only inside existing work-order-form ==');
const formMatch = html.match(/<form id="work-order-form">([\s\S]*?)<\/form>/);
assert(!!formMatch, 'work-order-form exists');
const formHtml = formMatch[1];
assert(formHtml.includes('id="btn-work-order-duplicate-direct"'), 'duplicate button is inside work-order-form');
assert((html.match(/id="btn-work-order-duplicate-direct"/g) || []).length === 1, 'duplicate button appears exactly once');
assert(formHtml.includes('直受け追加で複製'), 'button label is 直受け追加で複製');
assert(/id="btn-work-order-duplicate-direct"[^>]*class="btn btn-secondary btn-sm hidden"[^>]*disabled/.test(formHtml)
  || /id="btn-work-order-duplicate-direct"[^>]*class="[^"]*btn btn-secondary btn-sm hidden[^"]*"[^>]*disabled/.test(formHtml),
  'new-entry default is hidden + disabled via btn btn-secondary btn-sm');

console.log('== 2-3. edit-only visibility via syncWorkOrderFormActionState ==');
assert(app.includes('btn-work-order-duplicate-direct'), 'app.js references duplicate button');
assert(app.includes('function duplicateWorkOrderFormAsDirectReceive('), 'duplicate handler exists');
assert(app.includes('function syncWorkOrderFormActionState('), 'syncWorkOrderFormActionState exists');
{
  const start = app.indexOf('function syncWorkOrderFormActionState(');
  const next = app.indexOf('\n  function ', start + 10);
  const body = app.slice(start, next > start ? next : start + 1200);
  assert(body.includes('btn-work-order-duplicate-direct'), 'sync toggles duplicate button');
  assert(body.includes("dupBtn.classList.toggle('hidden', !canDuplicate)"), 'duplicate hidden when not editing');
  assert(body.includes('dupBtn.disabled = !canDuplicate'), 'duplicate disabled when not editing');
}

console.log('== 4-11. duplicate does not save; copies display fields only ==');
{
  const start = app.indexOf('function duplicateWorkOrderFormAsDirectReceive(');
  const next = app.indexOf('\n  function ', start + 10);
  const body = app.slice(start, next > start ? next : start + 4500);
  const helperStart = app.indexOf('function applyDirectReceiveDuplicateDraftToForm(');
  const helperNext = helperStart >= 0 ? app.indexOf('\n  function ', helperStart + 10) : -1;
  const helperBody = helperStart >= 0
    ? app.slice(helperStart, helperNext > helperStart ? helperNext : helperStart + 3500)
    : '';
  const combined = body + '\n' + helperBody;
  assert(app.includes('function applyDirectReceiveDuplicateDraftToForm('), 'shared draft helper exists for form apply');
  assert(body.includes('applyDirectReceiveDuplicateDraftToForm('), 'form duplicate calls shared draft helper');
  assert(!/Storage\.(addWorkOrder|updateWorkOrder)\s*\(/.test(combined), 'duplicate handler does not call Storage.add/updateWorkOrder');
  assert(combined.includes("document.getElementById('work-order-edit-id').value = ''"), 'clears edit id');
  assert(combined.includes("'直受け'") || combined.includes('"直受け"'), 'sets source to 直受け');
  assert(combined.includes("value = 'confirmed'") || combined.includes('value = "confirmed"'), 'sets status to confirmed');
  assert(combined.includes("work-order-intake').value = ''"), 'clears related intake');
  assert(combined.includes("work-order-lead').value = ''"), 'clears related lead');
  assert(body.includes('対象の作業予定が見つかりませんでした'), 'shows not-found message when edit id missing in Storage');
  assert(body.includes('直受け追加用に複製しました。作業内容と金額を確認して保存してください。元の予定は変更していません。'),
    'shows required toast message');
  assert(combined.includes("work-order-customer"), 'copies customer');
  assert(combined.includes("work-order-phone"), 'copies phone');
  assert(combined.includes("work-order-address"), 'copies address');
  assert(combined.includes("work-order-area"), 'copies area');
  assert(combined.includes("work-order-service"), 'copies service');
  assert(combined.includes("work-order-date"), 'copies date');
  assert(combined.includes("work-order-start"), 'copies start');
  assert(combined.includes("work-order-end"), 'copies end');
  assert(combined.includes("work-order-amount"), 'copies amount');
  assert(combined.includes("work-order-memo"), 'copies memo');
  assert(!/actualRevenueId|candidateMeta|calendarDedupeKey|completedAt|sourceCandidateId|completion\s*:/.test(combined),
    'does not copy calendar/candidate/revenue/completion linkage fields');
}

console.log('== 12. save path remains existing saveWorkOrderFromForm ==');
assert(app.includes('function saveWorkOrderFromForm('), 'existing saveWorkOrderFromForm remains');
assert(app.includes("dupBtn.addEventListener('click', duplicateWorkOrderFormAsDirectReceive)"),
  'duplicate button is wired in initWorkOrder');

console.log('== 13-14. 直受け 100% and SOURCES[0] remains LP ==');
{
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(revenueBrainSrc + '\n;this.RevenueBrain = RevenueBrain;', sandbox);
  vm.runInContext(receptionBrainSrc + '\n;this.ReceptionBrain = ReceptionBrain;', sandbox);
  const RB = sandbox.RevenueBrain;
  const RecB = sandbox.ReceptionBrain;
  assert(RB.SOURCES[0] === 'LP', 'SOURCES[0] remains LP');
  assert(RB.SOURCES.includes('直受け'), 'SOURCES includes 直受け');
  assert(RB.DEFAULT_GROSS_MARGIN_RATES['直受け'] === 100, 'DEFAULT_GROSS_MARGIN_RATES 直受け is 100');
  const profit = RB.getSourceProfitRate('直受け');
  assert(profit.rate === 100 && profit.reviewRequired === false, 'getSourceProfitRate(直受け) => 100 / reviewRequired false');
  assert(RB.normalizeRevenueSource('直受け') === 'direct', 'normalizeRevenueSource(直受け) => direct');
  assert(RB.getDefaultGrossProfitRateBySource('直受け') === 100, 'getDefaultGrossProfitRateBySource(直受け) => 100');
  assert(RecB.matchRevenueSource('直受け') === '直受け', 'ReceptionBrain.matchRevenueSource(直受け) => 直受け');
  assert(RB.calculateNetRevenueBySource(15000, '直受け') === 15000, 'profit amount equals revenue at 100%');
}
assert(html.includes('直受け100%'), 'revenue form hint mentions 直受け100%');

console.log('== 15-16. existing buttons and duplicate-warning path preserved ==');
assert(formHtml.includes('type="submit"') && formHtml.includes('保存'), 'save button remains');
assert(formHtml.includes('id="btn-work-order-clear"'), 'clear/cancel edit button remains');
assert(formHtml.includes('id="btn-work-order-delete"'), 'delete button remains');
assert(formHtml.includes('id="btn-work-order-gmap"'), 'gmap button remains');
assert(formHtml.includes('id="btn-work-order-calendar"'), 'calendar button remains');
assert(app.includes('confirmRevenueSaveWithDuplicateCheck'), 'existing revenue duplicate warning path remains');
assert(!/duplicateWorkOrderFormAsDirectReceive[\s\S]{0,200}confirmRevenueSaveWithDuplicateCheck/.test(app),
  'duplicate handler does not bypass revenue duplicate checks');

console.log('== 17. localStorage keys/schema unchanged ==');
assert(storage.includes("WORK_ORDERS: 'budil_work_orders'"), 'work orders key unchanged');
assert(!storage.includes('budil_work_order_direct'), 'no new direct-duplicate storage key');
assert(!app.includes('localStorage.clear(') && !storage.includes('localStorage.clear('), 'localStorage.clear is not used');

console.log('== 18. layout relies on existing flex-wrap (no broad CSS for this button) ==');
assert(css.includes('.pickup-form-actions') && /pickup-form-actions\s*\{[^}]*flex-wrap:\s*wrap/.test(css),
  '.pickup-form-actions keeps flex-wrap: wrap');
assert(!/btn-work-order-duplicate-direct/.test(css), 'no dedicated CSS rule for duplicate button');

console.log('== 19. NG wording must not return in public UI ==');
const ngWords = ['売上登録', '売上登録へ', '一括売上登録', '登録対象を売上登録', '作業完了後', '売上登録済み', '作業後確定', '作業後売上確定'];
for (const word of ngWords) {
  assert(!html.includes(word), `index.html must not revive NG wording: ${word}`);
}
assert(!html.includes('>作業完了<') && !html.includes('作業完了</'), 'index.html must not revive 作業完了 as UI label');

console.log('== docs ==');
assert(statusMd.includes('直受け追加で複製') || statusMd.includes('直受け追加複製'), 'status.md mentions direct duplicate');
assert(handoffMd.includes('直受け') && handoffMd.includes('v4.13.5'), 'handoff.md mentions v4.13.5 直受け');
assert(decisionLog.includes('直受け') && decisionLog.includes('即保存しない'), 'decision-log records no immediate save');

console.log('\nAll v4.13.5 work-order-direct-duplicate checks passed.');
