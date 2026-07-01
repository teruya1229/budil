/**
 * Budil v4.10.19 — entry simplification verification.
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

for (const file of ['app.js', 'storage.js', 'data-backup.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

console.log('== v4.10.19 entry simplification ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const css = load('css/style.css');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

assert(indexHtml.includes('v4.10.19'), 'index.html should show v4.10.19');
assert(indexHtml.includes('js/app.js?v=4.10.19'), 'app.js cache buster should be v4.10.19');
assert(storageJs.includes("BUDIL_VERSION: 'v4.10.19'"), 'storage.js version should be v4.10.19');
assert(dataBackupJs.includes("APP_VERSION: 'v4.10.19'"), 'data-backup version should be v4.10.19');

const dailyCardStart = indexHtml.indexOf('class="card card-wide card-daily-action-tasks"');
const dailyCardEnd = indexHtml.indexOf('card-external-check-collapse');
const dailyCardChunk = indexHtml.slice(dailyCardStart, dailyCardEnd);

assert(dailyCardChunk.includes('id="daily-section-today-tasks"'), 'today tasks section should exist upfront');
assert(dailyCardChunk.includes('id="dash-daily-action-tasks"'), 'task list container should exist in daily card');
assert(
  dailyCardChunk.indexOf('id="dash-daily-action-tasks"') < dailyCardChunk.indexOf('daily-tasks-more-sections'),
  'task list should appear before closed task-add details'
);
const moreSectionsChunk = dailyCardChunk.slice(dailyCardChunk.indexOf('daily-tasks-more-sections'));
assert(
  !moreSectionsChunk.includes('id="dash-daily-action-tasks"'),
  'dash-daily-action-tasks must not be hidden inside closed details'
);
assert(dailyCardChunk.includes('daily-section-revenue-assist'), 'hand-input assist section should remain');

const flowStripChunk = dailyCardChunk.slice(
  dailyCardChunk.indexOf('daily-flow-strip'),
  dailyCardChunk.indexOf('<h2>毎日やること</h2>')
);
assert(!flowStripChunk.includes('売上明細を手入力'), 'daily flow strip must not show hand-input as main step');
assert(flowStripChunk.includes('data-daily-flow="schedule-import"'), 'daily flow strip should include schedule import');
assert(flowStripChunk.includes('data-daily-flow="revenue-queue"'), 'daily flow strip should include revenue queue');

assert(indexHtml.includes('card-external-check-collapse'), 'external check card should be collapsed on dashboard');
assert(
  indexHtml.indexOf('card-external-check-collapse') < indexHtml.indexOf('id="dash-action-candidates"'),
  'external check collapse should precede improvement list card'
);
assert(!indexHtml.includes('id="dash-external-check" class="card card-wide card-external-check"'), 'external check must not be a prominent open card');

assert(indexHtml.includes('id="browser-bantou-paste"'), 'single marketing check paste entry should remain');
assert(indexHtml.includes('external-check-legacy-paste-collapse'), 'legacy paste should stay tucked away');

assert(appJs.includes("navigateToView('dashboard', '#dash-action-candidates')"), 'improvement list should go to dashboard card');
assert(appJs.includes("navigateToView('dashboard', '#daily-section-today-tasks')"), 'daily add should scroll to today tasks');
assert(
  !appJs.includes("navigateToView('external-check', '.card-external-check-unified')"),
  'improvement list must not navigate to legacy external-check'
);
assert(appJs.includes('data-daily-flow="schedule-import"') || appJs.includes("flow === 'schedule-import'"), 'app should handle schedule-import flow');
assert(appJs.includes("flow === 'revenue-queue'"), 'app should handle revenue-queue flow');
assert(appJs.includes('action-candidates-daily-note'), 'dashboard improvement card should note daily tasks as main entry');
assert(!appJs.includes('localStorage.clear()'), 'localStorage.clear must not be used');

assert(css.includes('daily-section-today-tasks'), 'css should style today tasks section');
assert(css.includes('card-external-check-collapse'), 'css should style collapsed external check');

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

console.log('== regression: v4.10.15 marketing check unified entry ==');
execSync('node scripts/verify-v41015-marketing-check-unified-entry.mjs', { cwd: root, stdio: 'inherit' });

console.log('== regression: v4.10.14 profit forecast breakdown ==');
execSync('node scripts/verify-v41014-profit-forecast-breakdown.mjs', { cwd: root, stdio: 'inherit' });

console.log('== regression: v4.10.13 profit rate calculation ==');
execSync('node scripts/verify-v41013-profit-rate-calculation.mjs', { cwd: root, stdio: 'inherit' });

console.log('== regression: v4.10.12 revenue duplicate guards ==');
execSync('node scripts/verify-v41012-revenue-duplicate-guards.mjs', { cwd: root, stdio: 'inherit' });

assert(statusMd.includes('v4.10.19'), 'status.md should document v4.10.19');
assert(handoffMd.includes('v4.10.19'), 'handoff.md should document v4.10.19');
assert(decisionLog.includes('v4.10.19'), 'decision-log.md should record v4.10.19');

console.log('All v4.10.19 entry simplification checks passed.');
