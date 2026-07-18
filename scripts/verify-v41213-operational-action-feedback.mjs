/**
 * Budil v4.12.14 - operational action feedback clarification.
 * Duplicate follow-row actions removed; typed copy/done labels and success toasts added.
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
  'js/app.js',
  'js/follow-up-brain.js',
  'js/revenue-brain.js',
  'js/storage.js',
  'js/data-backup.js',
  'scripts/verify-v41213-operational-action-feedback.mjs',
  'scripts/verify-v41113-follow-up-page-workflow.mjs'
]) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.12.14 operational-action-feedback ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const followJs = load('js/follow-up-brain.js');
const revenueJs = load('js/revenue-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

console.log('== version / cache buster ==');
assert(indexHtml.includes('v4.12.14'), 'index.html should show v4.12.14');
assert(indexHtml.includes('js/app.js?v=4.12.14'), 'app.js cache buster should be v4.12.14');
assert(indexHtml.includes('css/style.css?v=4.12.14'), 'style.css cache buster should be v4.12.14');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.14'"), 'storage version should be v4.12.14');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.14'"), 'data-backup version should be v4.12.14');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.12.14'"), 'verify-current EXPECTED_VERSION should be v4.12.14');
assert(!indexHtml.includes('?v=4.12.12'), 'old cache buster v4.12.12 should be gone');
assert(statusMd.includes('v4.12.14'), 'status.md should document v4.12.14');
assert(handoffMd.includes('v4.12.14'), 'handoff.md should document v4.12.14');
assert(decisionLog.includes('v4.12.14'), 'decision-log.md should record v4.12.14');

console.log('== 1. follow list row duplicate actions removed ==');
{
  const rowFn = appJs.match(/function renderFollowUpListRow[\s\S]*?\n  function /);
  assert(rowFn, 'renderFollowUpListRow must exist');
  assert(!rowFn[0].includes('data-follow-row-copy'), 'list row must not emit data-follow-row-copy');
  assert(!rowFn[0].includes('data-follow-row-mark'), 'list row must not emit data-follow-row-mark');
  assert(!rowFn[0].includes('文面コピー'), 'list row must not show generic 文面コピー');
  assert(!/>済みにする</.test(rowFn[0]), 'list row must not show generic 済みにする');
  assert(rowFn[0].includes('お礼LINE文を開く'), 'list row thanks open label required');
  assert(rowFn[0].includes('口コミ依頼文を開く'), 'list row review open label required');
  assert(rowFn[0].includes('リピート案内文を開く'), 'list row repeat open label required');
  assert(rowFn[0].includes('売上を見る'), 'list row revenue action must remain');
  assert(rowFn[0].includes('data-follow-row-open'), 'list row open attrs required');
}
assert(!appJs.includes('data-follow-row-copy'), 'data-follow-row-copy must be removed globally');
assert(!appJs.includes('data-follow-row-mark'), 'data-follow-row-mark must be removed globally');
{
  const bindFn = appJs.match(/function bindFollowUpCardEvents[\s\S]*?\n  function /);
  assert(bindFn, 'bindFollowUpCardEvents must exist');
  assert(!bindFn[0].includes('data-follow-row-copy'), 'bind must not wire row-copy');
  assert(!bindFn[0].includes('data-follow-row-mark'), 'bind must not wire row-mark');
  assert(bindFn[0].includes('data-follow-row-open'), 'bind must still wire row-open');
  assert(bindFn[0].includes('data-follow-card-copy'), 'bind must still wire card-copy');
  assert(bindFn[0].includes('data-follow-card-mark'), 'bind must still wire card-mark');
}

console.log('== 2. typed follow copy / done labels and toasts ==');
assert(appJs.includes('お礼LINE文をコピー'), 'thanks copy label required');
assert(appJs.includes('口コミ依頼文をコピー'), 'review copy label required');
assert(appJs.includes('リピート案内文をコピー'), 'repeat copy label required');
assert(appJs.includes('お礼LINE送信済みにする'), 'thanks mark label required');
assert(appJs.includes('口コミ依頼送信済みにする'), 'review mark label required');
assert(appJs.includes('次回確認を予定にする'), 'repeat mark label required');
assert(appJs.includes('お礼LINE文をコピーしました'), 'thanks copy toast required');
assert(appJs.includes('口コミ依頼文をコピーしました'), 'review copy toast required');
assert(appJs.includes('リピート案内文をコピーしました'), 'repeat copy toast required');
assert(appJs.includes('お礼LINEを送信済みにしました。未対応フォローから外しました。'), 'thanks done toast required');
assert(appJs.includes('口コミ依頼を送信済みにしました。未対応フォローから外しました。'), 'review done toast required');
assert(appJs.includes('次回メンテナンス確認を予定にしました（'), 'repeat done toast required');
assert(appJs.includes('openFollowUpTarget'), 'openFollowUpTarget must remain');
assert(appJs.includes('scrollIntoView'), 'open action should scroll into view');
assert(appJs.includes('.follow-up-card-expanded'), 'open action should prefer card expanded scroll');

console.log('== 2b. follow-up flow note aligned with typed actions ==');
assert(!indexHtml.includes('「済みにする」で状態を更新します'), 'old follow note about 済みにする must be removed');
assert(
  indexHtml.includes('「〜文を開く」→文面コピー→LINE送信後に「〜送信済みにする」の順で処理します。リピート案内は「次回確認を予定にする」で記録します。送信はご自身で行ってください。'),
  'new follow-up flow note must exist'
);
assert(appJs.includes('お礼LINE文を開く'), 'typed thanks open button must remain');
assert(appJs.includes('口コミ依頼文を開く'), 'typed review open button must remain');
assert(appJs.includes('リピート案内文を開く'), 'typed repeat open button must remain');
assert(appJs.includes('お礼LINE文をコピー'), 'typed thanks copy button must remain');
assert(appJs.includes('口コミ依頼文をコピー'), 'typed review copy button must remain');
assert(appJs.includes('リピート案内文をコピー'), 'typed repeat copy button must remain');
assert(appJs.includes('お礼LINE送信済みにする'), 'typed thanks done button must remain');
assert(appJs.includes('口コミ依頼送信済みにする'), 'typed review done button must remain');
assert(appJs.includes('次回確認を予定にする'), 'typed repeat done button must remain');

console.log('== 3. follow status / activity / no auto-send preserved ==');
{
  const markFn = appJs.match(/function markFollowUpDone[\s\S]*?\n  function /);
  assert(markFn, 'markFollowUpDone must exist');
  assert(markFn[0].includes("thanksStatus: 'done'"), 'thanksStatus save must remain');
  assert(markFn[0].includes("reviewStatus: 'done'"), 'reviewStatus save must remain');
  assert(markFn[0].includes("repeatStatus: 'planned'"), 'repeatStatus planned save must remain');
  assert(markFn[0].includes('nextMaintenanceDate'), 'nextMaintenanceDate save must remain');
  assert(markFn[0].includes("addLeadFollowUpActivity(target, 'thanks')"), 'thanks activity must remain');
  assert(markFn[0].includes("addLeadFollowUpActivity(target, 'review')"), 'review activity must remain');
  assert(markFn[0].includes("addLeadFollowUpActivity(target, 'repeat'"), 'repeat activity must remain');
  assert(!markFn[0].includes('自動送信'), 'mark done must not auto-send');
}
assert(!appJs.includes('自動送信'), 'app must not add auto-send');
assert(followJs.includes('normalizeFollowUp') || followJs.includes('thanksStatus'), 'follow brain status helpers remain');

console.log('== 4. executive home follow copy toasts ==');
{
  const copyFn = appJs.match(/function copyExecutiveFollowMessage[\s\S]*?\n  function /);
  assert(copyFn, 'copyExecutiveFollowMessage must exist');
  assert(copyFn[0].includes('お礼LINE文をコピーしました'), 'executive thanks copy toast required');
  assert(copyFn[0].includes('口コミ依頼文をコピーしました'), 'executive review copy toast required');
  assert(copyFn[0].includes('FollowUpBrain.generateThanksMessage'), 'executive thanks content unchanged path');
  assert(copyFn[0].includes('FollowUpBrain.generateReviewRequest'), 'executive review content unchanged path');
}

console.log('== 5. pickup / calendar / reception success toasts ==');
{
  const pickupFn = appJs.match(/function updatePickupStatus[\s\S]*?\n  function /);
  assert(pickupFn, 'updatePickupStatus must exist');
  assert(pickupFn[0].includes('採用済みにしました。未対応一覧から外しました。'), 'pickup used toast required');
  assert(pickupFn[0].includes('無視にしました。未対応一覧から外しました。'), 'pickup ignored toast required');
  assert(pickupFn[0].includes('保管しました。未対応一覧から外しました。'), 'pickup archived toast required');
  assert(pickupFn[0].includes('Storage.updateDemandPickup'), 'pickup storage update must remain');
}
{
  const reviewFn = appJs.match(/function markCalendarCandidateReview[\s\S]*?\n  function /);
  const skipFn = appJs.match(/function skipCalendarCandidate[\s\S]*?\n  function /);
  assert(reviewFn, 'markCalendarCandidateReview must exist');
  assert(skipFn, 'skipCalendarCandidate must exist');
  assert(reviewFn[0].includes('要確認にしました。作業予定・売上は作成していません。'), 'calendar review toast required');
  assert(skipFn[0].includes('今回は取り込まないにしました。作業予定・売上は作成していません。'), 'calendar skip toast required');
  assert(reviewFn[0].includes("candidateStatus: '要確認'"), 'review must only update candidate status');
  assert(skipFn[0].includes("candidateStatus: 'スキップ'"), 'skip must only update candidate status');
  assert(!reviewFn[0].includes('addRevenue') && !reviewFn[0].includes('Storage.addRevenue'), 'review must not create revenue');
  assert(!skipFn[0].includes('addRevenue') && !skipFn[0].includes('Storage.addRevenue'), 'skip must not create revenue');
  assert(!reviewFn[0].includes('promoteCalendarCandidate'), 'review must not promote work order');
  assert(!skipFn[0].includes('promoteCalendarCandidate'), 'skip must not promote work order');
}
assert(appJs.includes('今回は取り込まない'), 'UI label 今回は取り込まない required');
assert(!appJs.includes('このまま保持'), 'old UI label このまま保持 must be gone');
{
  const receptionFn = appJs.match(/function updateReceptionIntakeStatus[\s\S]*?\n  function /);
  assert(receptionFn, 'updateReceptionIntakeStatus must exist');
  assert(receptionFn[0].includes('対応済みにしました。完了・対応不要一覧へ移動しました。'), 'reception done toast required');
  assert(receptionFn[0].includes('保管しました。完了・対応不要一覧へ移動しました。'), 'reception archived toast required');
  assert(receptionFn[0].includes('Storage.updateReceptionIntake'), 'reception status save must remain');
  assert(!receptionFn[0].includes('deleteReception') && !receptionFn[0].includes('removeReception'), 'reception must not delete intake');
}

console.log('== 6. skip does not create work order / revenue ==');
assert(appJs.includes('function promoteCalendarCandidate'), 'promote path must remain separate');
assert(appJs.includes('function skipCalendarCandidate'), 'skip path must remain');

console.log('== 7. profit rates / storage / calendar-first flow unchanged ==');
assert(revenueJs.includes('function getSourceProfitRate') || revenueJs.includes('getSourceProfitRate('), 'getSourceProfitRate must remain');
assert(revenueJs.includes('direct: 100'), 'direct profit rate unchanged');
assert(revenueJs.includes('coop: 80'), 'coop profit rate unchanged');
assert(revenueJs.includes('yamada: 60'), 'yamada profit rate unchanged');
assert(storageJs.includes("REVENUE_RECORDS: 'budil_revenue_records'"), 'revenue storage key unchanged');
assert(storageJs.includes("RECEPTION_INTAKES: 'budil_reception_intakes'") || storageJs.includes('budil_reception'), 'reception storage key unchanged');
assert(!storageJs.includes('operational_action_feedback'), 'no new feedback storage key');
assert(!appJs.includes('localStorage.clear'), 'app must not clear localStorage');
assert(indexHtml.includes('view-calendar-registration') || appJs.includes('calendar-candidate'), 'calendar-first flow surfaces remain');

{
  const sandbox = { console, PaymentBrain: null, RevenueBrain: null };
  const ctx = createContext(sandbox);
  runInContext(load('js/payment-brain.js'), ctx);
  runInContext(load('js/revenue-brain.js'), ctx);
  const rateCases = [
    ['直受け', 100, false],
    ['コープ', 80, false],
    ['ヤマダ', 60, false],
    ['', 0, true]
  ];
  for (const [source, rate, reviewRequired] of rateCases) {
    const info = runInContext(`RevenueBrain.getSourceProfitRate(${JSON.stringify(source)})`, ctx);
    assert(info.rate === rate, `${source || '(empty)'} rate must stay ${rate}, got ${info.rate}`);
    assert(info.reviewRequired === reviewRequired, `${source || '(empty)'} reviewRequired must stay ${reviewRequired}`);
  }
}

console.log('\nAll v4.12.14 operational-action-feedback checks passed.');
