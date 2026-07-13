/**
 * Budil v4.10.41 - follow card inline actions and readability verification.
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

for (const file of ['js/app.js', 'js/follow-up-brain.js', 'js/executive-brain.js', 'js/storage.js']) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.10.41 follow-card-actions ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const followJs = load('js/follow-up-brain.js');
const executiveJs = load('js/executive-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');

const NG_TERMS = [
  '売上登録',
  '売上登録へ',
  '一括売上登録',
  '登録対象を売上登録',
  '作業完了',
  '作業完了後',
  '売上登録済み',
  '作業後確定',
  '作業後売上確定'
];

console.log('== version check ==');
assert(indexHtml.includes('v4.12.12'), 'index.html should show v4.12.12');
assert(indexHtml.includes('js/app.js?v=4.12.12'), 'app.js cache buster should be v4.12.12');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.12'"), 'storage.js version should be v4.12.12');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.12'"), 'data-backup version should be v4.12.12');

console.log('== follow card action wiring ==');
assert(appJs.includes('renderFollowUpCardActionSection'), 'card action sections should exist');
assert(appJs.includes('data-follow-card-open'), 'card open buttons should exist');
assert(appJs.includes('data-follow-card-skip'), 'card skip buttons should exist');
assert(appJs.includes('skipFollowUpCardAction'), 'card skip helper should exist');
assert(appJs.includes('followUpPriorityFocusId'), 'priority focus state should exist');
assert(appJs.includes('今日の最優先から確認中'), 'priority focus badge should exist');
assert(appJs.includes('口コミ依頼を作る/確認'), 'review action label should exist');
assert(appJs.includes('リピート提案を確認'), 'repeat action label should exist');
assert(appJs.includes('お礼LINEを作る/確認'), 'v4.10.41 thanks label should remain');
assert(appJs.includes('data-daily-priority-follow-open'), 'v4.10.41 daily priority follow wiring should remain');
assert(followJs.includes('buildFollowCardSkipKey'), 'follow skip key helper should exist');
assert(followJs.includes('buildFollowCardStatusRows'), 'follow status rows helper should exist');
assert(!/skipFollowUpCardAction[\s\S]{0,900}thanksStatus:\s*'done'/.test(appJs), 'skip must not auto-mark thanks as done');

console.log('== readability CSS (follow only) ==');
assert(css.includes('v4.10.41 follow card actions'), 'follow css marker should be v4.10.41');
assert(css.includes('.follow-up-target-name'), 'follow name styling should exist');
assert(css.includes('.follow-up-status-grid'), 'follow status grid should exist');
assert(css.includes('.follow-up-card-actions'), 'follow card actions styling should exist');
assert(!css.includes('invoice-sheet-v4.10.41'), 'invoice css must not change');

console.log('== storage keys unchanged ==');
assert(storageJs.includes("ACTION_CANDIDATE_STATES"), 'existing action candidate states key must remain');
assert(!storageJs.includes('localStorage.clear'), 'must not clear localStorage');

for (const term of NG_TERMS) {
  assert(!appJs.includes(term), `NG term ${term} must not appear in app.js UI`);
}

function createSandbox() {
  const ctx = createContext({
    console, Date, JSON, Math, Number, String, Array, Object, Error,
    parseInt, parseFloat, isNaN, undefined, RegExp,
    window: { confirm: () => true },
    WorkOrderBrain: { normalizeWorkOrder: w => ({ ...(w || {}) }) },
    RevenueBrain: null,
    FollowUpBrain: null,
    ExecutiveBrain: null
  });
  runInContext(load('js/revenue-brain.js'), ctx, { filename: 'revenue-brain.js' });
  runInContext(load('js/follow-up-brain.js'), ctx, { filename: 'follow-up-brain.js' });
  runInContext(load('js/executive-brain.js'), ctx, { filename: 'executive-brain.js' });
  return ctx;
}

console.log('== follow status rows ==');
{
  const ctx = createSandbox();
  const result = runInContext(`(() => {
    const target = {
      id: 'fu-rev-test',
      customerName: '伊地 美千代',
      needsThanks: true,
      needsReview: false,
      needsRepeat: false,
      maintenanceNear: false,
      followUp: { thanksStatus: 'pending', reviewStatus: 'pending', repeatStatus: 'pending' }
    };
    const rows = FollowUpBrain.buildFollowCardStatusRows(target, {
      today: '2026-07-05',
      getActionCandidateState: () => null
    });
    return rows;
  })()`, ctx);
  assert(result.thanks.label === '未', 'thanks should be pending');
  assert(result.thanks.hint.includes('対応'), 'thanks hint should explain action');
}

console.log('== skip key format ==');
{
  const ctx = createSandbox();
  const key = runInContext(`FollowUpBrain.buildFollowCardSkipKey('fu-rev-test', 'thanks', '2026-07-05')`, ctx);
  assert(key.startsWith('follow-skip|'), 'skip key should use follow-skip prefix');
  assert(key.includes('fu-rev-test'), 'skip key should include target id');
}

console.log('\nAll v4.10.41 follow-card-actions checks passed.');
