/**
 * Budil v4.8.21 revenue confirmation queue verification.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = path => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

for (const file of ['app.js', 'storage.js', 'work-completion-brain.js', 'calendar-candidate-brain.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const storageJs = load('js/storage.js');
const css = load('css/style.css');

console.log('== v4.8.21 revenue confirmation queue ==');

assert(indexHtml.includes('AI\u7d4c\u55b6\u8133\u307f\u305d v4.8.21'), 'header version should be v4.8.21');
assert(indexHtml.includes('Budil v4.8.21'), 'sidebar version should be v4.8.21');
assert(indexHtml.includes('js/app.js?v=4.8.21'), 'app.js cache buster should be v4.8.21');

assert(indexHtml.includes('daily-section-revenue-queue'), 'revenue queue section should exist');
assert(indexHtml.includes('\u58f2\u4e0a\u78ba\u5b9a\u5f85\u3061'), 'revenue queue title should exist');
assert(indexHtml.includes('daily-section-revenue-assist'), 'manual revenue assist details should exist');
assert(indexHtml.includes('\u624b\u5165\u529b\u3067\u58f2\u4e0a\u3092\u8ffd\u52a0'), 'manual revenue assist title should exist');
assert(indexHtml.includes('work-completion-queue-source'), 'work completion queue source field should exist');

assert(appJs.includes('collectRevenueConfirmationQueue'), 'queue collector should exist');
assert(appJs.includes('renderDailyRevenueConfirmationQueue'), 'queue renderer should exist');
assert(appJs.includes('showRevenueConfirmedNotice'), 'confirmed notice should exist');
assert(appJs.includes('submitPastRecoveryFromModal'), 'single past recovery confirm should exist');
assert(appJs.includes('openWorkCompletionModalFromQueue'), 'queue modal opener should exist');
assert(appJs.includes('allItems.slice(0, 3)'), 'queue should cap at 3 items');
assert(appJs.includes('wo.scheduledDate > today'), 'future work orders should be excluded from queue');
assert(appJs.includes('actualRevenueId) return'), 'actualRevenueId work orders should be excluded');
assert(appJs.includes('PAST_RECOVERY_REVENUE_CANDIDATE'), 'past recovery eligible filter should exist');
assert(!appJs.match(/collectDailyPriorityItems\(\)[\s\S]{0,1200}pendingRevenue/), 'daily priority should not duplicate pending revenue');
assert(appJs.includes('daily-revenue-confirmed-text'), 'post confirm notice block should exist');
assert(appJs.includes('data-revenue-confirmed-copy-review'), 'post confirm review copy button should exist');
assert(appJs.includes('data-revenue-confirmed-go-follow'), 'post confirm follow link should exist');
assert(appJs.includes('data-revenue-confirmed-go-list'), 'post confirm revenue list link should exist');

assert(storageJs.includes('convertCalendarPastCandidateToRevenue'), 'single past recovery convert should exist');
assert(storageJs.includes('_convertPastCandidateWorkOrderToRevenue'), 'shared past recovery helper should exist');
assert(storageJs.includes('createSafetyBackup'), 'safety backup should remain for past recovery convert');

assert(appJs.includes('external-check-dash-brief'), 'v4.8.20 external check summary should remain');
assert(appJs.includes('renderDashExternalCheckDetailsBody'), 'external check details should remain');
assert(appJs.includes('AnalyticsBrain'), 'analytics brain usage should remain');
assert(storageJs.includes('PROTECTED_DELETE_KEYS'), 'v4.8.8 protected delete keys should remain');
assert(indexHtml.includes('calendar-candidate-notice'), 'v4.8.12 past recovery safety notice should remain');

assert(css.includes('daily-revenue-queue-card'), 'queue card styles should exist');
assert(css.includes('daily-section-revenue-assist'), 'assist details styles should exist');
assert(css.includes('overflow-x: hidden') || css.includes('overflow-x:hidden') || css.includes('min-width: 0'), 'layout should avoid horizontal scroll patterns');

console.log('All v4.8.21 revenue confirmation queue checks passed.');
