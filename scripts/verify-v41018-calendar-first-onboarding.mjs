/**
 * Budil v4.10.20 — calendar-first onboarding verification.
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

for (const file of ['app.js', 'executive-brain.js', 'storage.js', 'data-backup.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

console.log('== v4.10.20 calendar-first onboarding ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const executiveBrain = load('js/executive-brain.js');
const css = load('css/style.css');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

assert(indexHtml.includes('v4.11.5'), 'index.html should show v4.11.5');
assert(indexHtml.includes('js/app.js?v=4.11.5'), 'app.js cache buster should be v4.11.5');
assert(storageJs.includes("BUDIL_VERSION: 'v4.11.5'"), 'storage.js version should be v4.11.5');
assert(dataBackupJs.includes("APP_VERSION: 'v4.11.5'"), 'data-backup version should be v4.11.5');

const startGuideStart = indexHtml.indexOf('id="dash-start-guide"');
const startGuideEnd = indexHtml.indexOf('dash-detail-sections');
const startGuideChunk = indexHtml.slice(startGuideStart, startGuideEnd);

assert(startGuideChunk.includes('Googleカレンダー予定を取り込む'), 'start guide should lead with calendar import');
assert(startGuideChunk.includes('売上確定待ちを確認する'), 'start guide should include revenue queue step');
assert(startGuideChunk.includes('毎日やることを確認する'), 'start guide should include daily tasks step');
assert(startGuideChunk.includes('id="btn-start-schedule-import"'), 'start guide should have schedule import primary button');
assert(startGuideChunk.includes('id="btn-start-revenue-queue"'), 'start guide should have revenue queue button');
assert(startGuideChunk.includes('start-guide-exception'), 'start guide should tuck manual input into exception details');
assert(!startGuideChunk.includes('売上明細を1件追加'), 'start guide must not show hand-input as main step');
assert(
  startGuideChunk.indexOf('start-guide-exception') < startGuideChunk.indexOf('btn-start-add-revenue'),
  'manual input button should live inside exception details'
);

assert(appJs.includes('ONBOARDING_PRIMARY_STEPS'), 'app should define onboarding primary steps');
assert(appJs.includes("label: 'Googleカレンダー予定を取り込む'"), 'onboarding primary step 1 should be calendar import');
assert(appJs.includes("label: '売上確定待ちを確認する'"), 'onboarding primary step 2 should be revenue queue');
assert(appJs.includes("label: '毎日やることを確認する'"), 'onboarding primary step 3 should be daily tasks');
assert(appJs.includes('onboarding-exception-actions'), 'onboarding guide should include exception details');
assert(appJs.includes("data-onboarding-action=\"revenue\">売上明細を手入力"), 'manual input should remain as exception action');
assert(!appJs.includes("label: '売上明細を1件追加'"), 'onboarding steps must not promote hand-input as main step');
assert(appJs.includes("action === 'calendar-import'"), 'onboarding should handle calendar-import action');
assert(appJs.includes("action === 'revenue-queue'"), 'onboarding should handle revenue-queue action');
assert(storageJs.includes('calendarImport:'), 'onboarding status should track calendar import');
assert(storageJs.includes('revenueQueue:'), 'onboarding status should track revenue queue');
assert(!appJs.includes('localStorage.clear()'), 'localStorage.clear must not be used');

const primaryQuickChunk = executiveBrain.slice(
  executiveBrain.indexOf('QUICK_LINKS'),
  executiveBrain.indexOf('hasHomeData')
);
assert(primaryQuickChunk.includes("label: '予定取り込み'"), 'executive home primary quick link should include schedule import');
assert(primaryQuickChunk.includes("label: '売上確定待ち'"), 'executive home primary quick link should include revenue queue');
assert(primaryQuickChunk.includes("tier: 'primary'"), 'calendar-first links should stay primary tier');
assert(!primaryQuickChunk.includes('売上明細を手入力'), 'executive quick links must not show hand-input label');

assert(appJs.includes("'schedule-import': () => navigateToView('calendar-candidate')"), 'executive home should navigate to schedule import');
assert(appJs.includes("revenue: () => navigateToView('revenue')"), 'executive revenue quick action should open revenue view not hand-input form');
assert(!appJs.includes('revenue: goToAddRevenue'), 'executive home must not route revenue quick action to hand-input');

assert(css.includes('onboarding-exception-actions'), 'css should style onboarding exception block');
assert(css.includes('v4.10.20'), 'css should include v4.10.20 onboarding marker');

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

console.log('== regression: v4.10.17 revenue entry hierarchy ==');
execSync('node scripts/verify-v41017-revenue-entry-hierarchy.mjs', { cwd: root, stdio: 'inherit' });

assert(statusMd.includes('v4.10.20'), 'status.md should document v4.10.20');
assert(handoffMd.includes('v4.10.20'), 'handoff.md should document v4.10.20');
assert(decisionLog.includes('v4.10.20'), 'decision-log.md should record v4.10.20');

console.log('All v4.10.20 calendar-first onboarding checks passed.');
