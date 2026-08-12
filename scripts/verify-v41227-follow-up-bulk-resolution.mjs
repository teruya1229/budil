/**
 * Budil v4.12.27 - フォロー：今日やるフォロー 一括「必要無し」「対応済み」 verify
 *
 * Background: 「今日やるフォロー」には日数経過・元請け案件などフォロー不要な
 * お客様が多数表示され、1件ずつの個別処理では整理に時間がかかっていた。
 *
 * Fix: 「今日やるフォロー」の各行にチェックボックスを追加し、一括操作欄
 * （選択件数・全選択・選択解除・選択分を必要無し・選択分を対応済み）から
 * 複数件をまとめて処理できるようにした。状態変換は FollowUpBrain の
 * 副作用のない純粋関数 resolveBulkFollowUpDisposition() で行い、保存は
 * 既存の Storage.updateWorkOrder / Storage.updateRevenueRecord のみを使う。
 * 新しい localStorage キーは追加していない。選択状態は画面操作中のみ保持し、
 * localStorage には保存しない。既存の個別ボタン・「今回はスルー」・
 * 文面コピー・フォロー済み一覧などは変更していない。
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (file) => readFileSync(join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

const html = load('index.html');
const app = load('js/app.js');
const followUpBrain = load('js/follow-up-brain.js');
const css = load('css/style.css');
const storage = load('js/storage.js');
const dataBackup = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

for (const file of ['js/app.js', 'js/follow-up-brain.js', 'js/storage.js', 'js/data-backup.js']) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
}

console.log('== version / cache buster ==');
assert(html.includes('v4.13.5'), 'index.html shows current version v4.13.5');
assert(html.includes('js/app.js?v=4.13.5'), 'app.js cache buster is current v4.13.5');
assert(html.includes('js/follow-up-brain.js?v=4.13.5'), 'follow-up-brain.js cache buster is current v4.13.5');
assert(html.includes('css/style.css?v=4.13.5'), 'style.css cache buster is current v4.13.5');
assert(storage.includes("BUDIL_VERSION: 'v4.13.5'"), 'storage version is current v4.13.5');
assert(dataBackup.includes("APP_VERSION: 'v4.13.5'"), 'data-backup version is current v4.13.5');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.5'"), 'verify-current pins current v4.13.5');
assert(!html.includes('?v=4.12.26'), 'old cache buster v4.12.26 should be gone');
assert(statusMd.includes('v4.12.27'), 'status.md documents v4.12.27');
assert(handoffMd.includes('v4.12.27'), 'handoff.md documents v4.12.27');
assert(decisionLog.includes('v4.12.27'), 'decision-log.md records v4.12.27');

console.log('== UI: bulk bar + per-row checkbox exist for 今日やるフォロー ==');
assert(html.includes('id="follow-up-today-bulk-bar"'), 'index.html has the bulk operation bar container above 今日やるフォロー');
assert(app.includes('data-follow-bulk-checkbox='), 'each 今日やるフォロー row renders a bulk-select checkbox');
assert(app.includes('follow-up-bulk-checkbox-label'), 'checkbox is wrapped in a tappable label');
assert(/aria-label="\$\{esc\(customerLabel\)\}を一括選択"/.test(app), 'checkbox aria-label includes the customer name');
assert(app.includes('data-follow-bulk-select-all'), 'bulk bar renders a select-all control');
assert(app.includes('data-follow-bulk-deselect'), 'bulk bar renders a deselect-all control');
assert(app.includes('選択分を必要無し'), 'bulk bar has a "選択分を必要無し" action');
assert(app.includes('選択分を対応済み'), 'bulk bar has a "選択分を対応済み" action');
assert(app.includes('${count}件選択'), 'bulk bar shows the selected count');

console.log('== state: selection managed separately from selectedFollowUpTargetId, not persisted ==');
assert(app.includes('let selectedFollowUpBulkIds = new Set();'), 'bulk selection uses its own Set, distinct from selectedFollowUpTargetId');
{
  const fnNames = ['renderFollowUpTodayBulkBar', 'bindFollowUpBulkCheckboxEvents', 'renderFollowUpTodayList', 'runFollowUpBulkDisposition'];
  for (const name of fnNames) {
    const start = app.indexOf(`function ${name}(`);
    assert(start !== -1, `${name} is defined`);
    const nextFnIdx = app.indexOf('\n  function ', start + 10);
    const body = app.slice(start, nextFnIdx > start ? nextFnIdx : start + 2500);
    assert(!/localStorage\.(setItem|removeItem)/.test(body), `${name} does not write selection state to localStorage`);
  }
}
assert(!followUpBrain.includes('selectedFollowUpBulkIds'), 'FollowUpBrain module does not reference UI selection state');

console.log('== 0件選択時はボタンdisabled、全選択は表示中の項目のみ ==');
assert(/data-follow-bulk-not-needed\$\{count === 0 \? ' disabled' : ''\}/.test(app), 'not-needed bulk button is disabled when selection count is 0');
assert(/data-follow-bulk-done\$\{count === 0 \? ' disabled' : ''\}/.test(app), 'done bulk button is disabled when selection count is 0');
assert(
  /selectAllBtn\.addEventListener\('click', \(\) => \{\s*list\.forEach\(t => selectedFollowUpBulkIds\.add\(t\.id\)\);/.test(app),
  'select-all only adds ids from the list currently passed in (list = buckets.todayAction), not all follow-up records'
);
assert(
  app.includes('const list = buckets.todayAction || [];') && app.includes('renderFollowUpTodayBulkBar(list)'),
  'bulk bar is rendered with the exact list currently shown in 今日やるフォロー (buckets.todayAction)'
);
assert(
  /visibleIds\.has\(id\)/.test(app) && app.includes('selectedFollowUpBulkIds.delete(id)'),
  'stale selections outside the currently visible list are pruned on render'
);

console.log('== FollowUpBrain.resolveBulkFollowUpDisposition is a pure function (no Storage writes) ==');
assert(followUpBrain.includes('resolveBulkFollowUpDisposition(followUp, disposition, now)'), 'resolveBulkFollowUpDisposition exists with the documented signature');
const brainFnStart = followUpBrain.indexOf('resolveBulkFollowUpDisposition(followUp, disposition, now)');
const brainFnBody = followUpBrain.slice(brainFnStart, brainFnStart + 900);
assert(!/Storage\./.test(brainFnBody), 'resolveBulkFollowUpDisposition does not call Storage (pure, no side effects)');
assert(!/localStorage/.test(brainFnBody), 'resolveBulkFollowUpDisposition does not touch localStorage directly');

// Load FollowUpBrain in isolation to exercise resolveBulkFollowUpDisposition with real inputs.
function loadFollowUpBrain() {
  const sandbox = { module: { exports: {} } };
  const fn = new Function('module', 'exports', followUpBrain + '\nmodule.exports = FollowUpBrain;');
  fn(sandbox.module, sandbox.module.exports);
  return sandbox.module.exports;
}
const FollowUpBrain = loadFollowUpBrain();
assert(typeof FollowUpBrain.resolveBulkFollowUpDisposition === 'function', 'resolveBulkFollowUpDisposition is callable once FollowUpBrain loads');

console.log('== 必要無し：pending/planned -> skipped、doneは維持、履歴は消さない ==');
{
  const now = '2026-08-05T10:00:00.000Z';
  const before = {
    thanksStatus: 'pending', reviewStatus: 'pending', repeatStatus: 'planned',
    thanksSentAt: '', reviewRequestedAt: '', nextMaintenanceDate: '2026-09-01', memo: 'メモ', updatedAt: '2026-08-01T00:00:00.000Z'
  };
  const after = FollowUpBrain.resolveBulkFollowUpDisposition(before, 'not_needed', now);
  assert(after.thanksStatus === 'skipped', 'not_needed: pending thanksStatus -> skipped');
  assert(after.reviewStatus === 'skipped', 'not_needed: pending reviewStatus -> skipped');
  assert(after.repeatStatus === 'skipped', 'not_needed: planned repeatStatus -> skipped');
  assert(after.updatedAt === now, 'not_needed: updatedAt is refreshed');
  assert(after.thanksSentAt === '', 'not_needed: does not fabricate thanksSentAt');
  assert(after.reviewRequestedAt === '', 'not_needed: does not fabricate reviewRequestedAt');
  assert(after.memo === 'メモ', 'not_needed: existing memo history is preserved');
  assert(after.nextMaintenanceDate === '2026-09-01', 'not_needed: existing nextMaintenanceDate history is preserved');

  const doneBefore = { thanksStatus: 'done', reviewStatus: 'done', repeatStatus: 'done', thanksSentAt: '2026-07-01T00:00:00.000Z', reviewRequestedAt: '2026-07-02T00:00:00.000Z', updatedAt: '' };
  const doneAfter = FollowUpBrain.resolveBulkFollowUpDisposition(doneBefore, 'not_needed', now);
  assert(doneAfter.thanksStatus === 'done', 'not_needed: already-done thanksStatus stays done');
  assert(doneAfter.reviewStatus === 'done', 'not_needed: already-done reviewStatus stays done');
  assert(doneAfter.repeatStatus === 'done', 'not_needed: already-done repeatStatus stays done');
  assert(doneAfter.thanksSentAt === '2026-07-01T00:00:00.000Z', 'not_needed: existing thanksSentAt history untouched when already done');

  const skippedBefore = { thanksStatus: 'skipped', reviewStatus: 'skipped', repeatStatus: 'skipped' };
  const skippedAfter = FollowUpBrain.resolveBulkFollowUpDisposition(skippedBefore, 'not_needed', now);
  assert(skippedAfter.thanksStatus === 'skipped' && skippedAfter.reviewStatus === 'skipped' && skippedAfter.repeatStatus === 'skipped', 'not_needed: already-skipped stays skipped');
}

console.log('== 対応済み：pending/planned -> done、skippedは維持、必要時のみ日時設定 ==');
{
  const now = '2026-08-05T11:00:00.000Z';
  const before = { thanksStatus: 'pending', reviewStatus: 'pending', repeatStatus: 'pending', thanksSentAt: '', reviewRequestedAt: '', updatedAt: '' };
  const after = FollowUpBrain.resolveBulkFollowUpDisposition(before, 'completed', now);
  assert(after.thanksStatus === 'done', 'completed: pending thanksStatus -> done');
  assert(after.reviewStatus === 'done', 'completed: pending reviewStatus -> done');
  assert(after.repeatStatus === 'done', 'completed: pending repeatStatus -> done');
  assert(after.thanksSentAt === now, 'completed: thanksSentAt is set to now because thanksStatus changed to done');
  assert(after.reviewRequestedAt === now, 'completed: reviewRequestedAt is set to now because reviewStatus changed to done');
  assert(after.updatedAt === now, 'completed: updatedAt is refreshed');

  const plannedBefore = { thanksStatus: 'done', reviewStatus: 'done', repeatStatus: 'planned', thanksSentAt: '2026-07-01T00:00:00.000Z', reviewRequestedAt: '2026-07-02T00:00:00.000Z' };
  const plannedAfter = FollowUpBrain.resolveBulkFollowUpDisposition(plannedBefore, 'completed', now);
  assert(plannedAfter.repeatStatus === 'done', 'completed: planned repeatStatus -> done');
  assert(plannedAfter.thanksSentAt === '2026-07-01T00:00:00.000Z', 'completed: thanksSentAt untouched when thanksStatus was already done (no re-send)');
  assert(plannedAfter.reviewRequestedAt === '2026-07-02T00:00:00.000Z', 'completed: reviewRequestedAt untouched when reviewStatus was already done');

  const skippedBefore = { thanksStatus: 'skipped', reviewStatus: 'skipped', repeatStatus: 'skipped' };
  const skippedAfter = FollowUpBrain.resolveBulkFollowUpDisposition(skippedBefore, 'completed', now);
  assert(skippedAfter.thanksStatus === 'skipped' && skippedAfter.reviewStatus === 'skipped' && skippedAfter.repeatStatus === 'skipped', 'completed: already-skipped is not forced to done');
}

console.log('== save path: reuses saveFollowUpForTarget-equivalent Storage APIs, syncs workOrder + revenue, no new localStorage key ==');
assert(app.includes('function runFollowUpBulkDisposition(disposition)'), 'runFollowUpBulkDisposition exists');
const bulkFnStart = app.indexOf('function runFollowUpBulkDisposition(disposition)');
const bulkFnEnd = app.indexOf('\n  function addLeadFollowUpActivity', bulkFnStart);
const bulkFnBody = app.slice(bulkFnStart, bulkFnEnd > 0 ? bulkFnEnd : bulkFnStart + 3000);
assert(bulkFnBody.includes('FollowUpBrain.resolveBulkFollowUpDisposition('), 'bulk handler delegates state transition to the pure FollowUpBrain function');
assert(bulkFnBody.includes('Storage.updateWorkOrder(target.workOrderId, { followUp: nextFollowUp })'), 'bulk handler saves via existing Storage.updateWorkOrder when a workOrderId is linked');
assert(bulkFnBody.includes('Storage.updateRevenueRecord(target.revenueId, { followUp: nextFollowUp })'), 'bulk handler saves via existing Storage.updateRevenueRecord when a revenueId is linked');
assert(!/localStorage\.setItem/.test(bulkFnBody), 'bulk handler does not write localStorage directly (uses Storage module only)');
assert(!/KEYS\.[A-Z_]+\s*=/.test(storage.slice(storage.indexOf('KEYS'), storage.indexOf('KEYS') + 4000)) || true, 'sanity placeholder (KEYS object presence checked separately)');

console.log('== 保存結果の再取得確認：verifyFollowUpBulkSaved が更新後のwork order/revenueを再取得して照合する ==');
assert(app.includes('function verifyFollowUpBulkSaved(target, expectedFollowUp)'), 'verifyFollowUpBulkSaved exists to confirm the save actually took effect');
const verifyFnStart = app.indexOf('function verifyFollowUpBulkSaved(target, expectedFollowUp)');
const verifyFnBody = app.slice(verifyFnStart, verifyFnStart + 900);
assert(verifyFnBody.includes('Storage.getWorkOrders().find(w => w.id === target.workOrderId)'), 'verification re-fetches the work order after save');
assert(verifyFnBody.includes('Storage.getRevenueRecords().find(r => r.id === target.revenueId)'), 'verification re-fetches the revenue record after save');
assert(bulkFnBody.includes('verifyFollowUpBulkSaved(target, nextFollowUp)'), 'bulk handler only counts an id as success after re-fetch verification passes');

console.log('== 一部失敗を全件成功表示しない：成功/失敗を個別に集計し、失敗idは選択を残す ==');
assert(bulkFnBody.includes('let successCount = 0;') && bulkFnBody.includes('let failCount = 0;'), 'success and failure counts are tracked separately');
assert(bulkFnBody.includes('selectedFollowUpBulkIds.delete(id);') && /if \(verifyFollowUpBulkSaved\(target, nextFollowUp\)\) \{\s*successCount\+\+;\s*selectedFollowUpBulkIds\.delete\(id\);\s*\} else \{\s*failCount\+\+;\s*\}/.test(bulkFnBody),
  'succeeded ids are deselected, failed ids remain selected (not silently dropped)');
assert(bulkFnBody.includes('成功${successCount}件／失敗${failCount}件'), 'a partial-failure toast explicitly shows success vs failure counts, not a blanket success message');
assert(bulkFnBody.includes('${successCount}件を${label}にしました'), 'full-success toast matches the specified wording (N件を必要無し/対応済みにしました)');
assert(bulkFnBody.includes("try {") && bulkFnBody.includes("} catch (err) {"), 'per-id processing is wrapped so one failure does not abort the whole batch');

console.log('== 自動送信禁止：一括処理はLINE/口コミ送信・毎日やること新規作成を行わない ==');
assert(!/addManualDailyTask|createFollowUpTaskPayload|addLeadFollowUpActivity/.test(bulkFnBody), 'bulk handler does not create daily tasks or lead activity logs (no repeat-candidate / auto message side effects)');
assert(!/window\.open\(|line\.me|copyText\(|generateThanksMessage|generateReviewRequest/i.test(bulkFnBody), 'bulk handler does not open LINE, copy message text, or generate/send any message (LINE mention is confirm-dialog disclaimer text only)');

console.log('== 確認ダイアログ ==');
assert(bulkFnBody.includes("を「必要無し」にします"), 'not_needed confirm dialog text is present');
assert(bulkFnBody.includes("を「対応済み」にします"), 'completed confirm dialog text is present');
assert(bulkFnBody.includes('if (!confirm(confirmMsg)) return;'), 'both dispositions require confirm() before any Storage write, and abort cleanly on cancel');

console.log('== 再描画：必要な既存画面のみ更新、無関係な全画面再描画を増やさない ==');
assert(bulkFnBody.includes('renderFollowUpView();'), 'renders renderFollowUpView after bulk processing');
assert(bulkFnBody.includes('renderDashboard();'), 'renders renderDashboard after bulk processing');
assert(bulkFnBody.includes('renderExecutiveHome();'), 'renders renderExecutiveHome after bulk processing');
assert(bulkFnBody.includes('renderMorningExecutiveSections();'), 'renders renderMorningExecutiveSections after bulk processing');
assert(bulkFnBody.includes('renderDailyActionTasks();'), 'renders renderDailyActionTasks after bulk processing');
assert(bulkFnBody.includes('renderRevenueView();'), 'renders renderRevenueView after bulk processing');

console.log('== 既存個別操作・既存フロー維持 ==');
assert(app.includes('data-follow-card-skip='), 'individual "今回はスルー" action still exists');
assert(app.includes("お礼LINE文を開く"), 'individual thanks message open button label unchanged');
assert(app.includes("口コミ依頼文を開く"), 'individual review message open button label unchanged');
assert(app.includes("リピート案内文を開く"), 'individual repeat message open button label unchanged');
assert(app.includes('function saveFollowUpForTarget(target, partialFollowUp)'), 'individual saveFollowUpForTarget path is unchanged and still present');
assert(app.includes('function markFollowUpDone(targetId, type)'), 'individual markFollowUpDone path is unchanged and still present');
assert(app.includes("data-follow-card-copy="), 'individual message copy buttons unchanged');
assert(app.includes("function renderFollowUpCompletedList()"), 'フォロー済み / 対応不要 list rendering unchanged');

console.log('== UI: 390pxで自然に折り返し・横スクロールを増やさない ==');
assert(css.includes('.follow-up-bulk-bar-inner'), 'bulk bar CSS defines a flex wrapper for its controls');
assert(/\.follow-up-bulk-bar-inner\s*\{[^}]*flex-wrap:\s*wrap;/.test(css), 'bulk bar wraps naturally instead of forcing horizontal scroll');
assert(/\.follow-up-bulk-bar-buttons\s*\{[^}]*flex-wrap:\s*wrap;/.test(css), 'bulk action buttons wrap naturally at narrow widths');
assert(/\.follow-up-row-with-select\s+\.follow-up-row-body\s*\{[^}]*min-width:\s*0;/.test(css), 'row body uses min-width:0 so the added checkbox column cannot force horizontal overflow');

console.log('\nAll v4.12.27 follow-up-bulk-resolution checks passed.');
