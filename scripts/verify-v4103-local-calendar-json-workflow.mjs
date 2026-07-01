/**
 * Budil v4.10.5 local calendar JSON workflow verification.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workerRoot = join(root, '..', 'calendar-sync-worker');
const load = (path) => readFileSync(join(root, path), 'utf8');
const loadWorker = (path) => readFileSync(join(workerRoot, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

console.log('== v4.10.5 local calendar JSON workflow ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const calendarBrain = load('js/calendar-candidate-brain.js');
const css = load('css/style.css');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

assert(indexHtml.includes('v4.10.17'), 'index.html should show v4.10.17');
assert(indexHtml.includes('run-budil-calendar-export.bat'), 'calendar JSON hint should mention bat launcher');
assert(indexHtml.includes('budil-calendar-events.json'), 'calendar JSON hint should mention output filename');
assert(indexHtml.includes('btn-calendar-candidate-json-import'), 'v4.10.1 JSON import button should remain');
assert(indexHtml.includes('btn-calendar-candidate-parse'), 'paste import button should remain');
assert(indexHtml.includes('calendar-candidate-paste'), 'paste textarea should remain');
assert(
  indexHtml.includes('確定売上明細には入りません') || indexHtml.includes('確定売上には入りません'),
  'should warn that import does not add to confirmed revenue'
);

assert(calendarBrain.includes('parseBudilCalendarEventsJson'), 'v4.10.1 JSON parser should remain');
assert(calendarBrain.includes('parseCalendarText'), 'paste parser should remain');
assert(appJs.includes('exportCalendarForBudil') === false, 'app.js should not add Firebase API integration');
assert(appJs.includes('addWorkOrder'), 'calendar import should still use work order save flow');

const workerBat = loadWorker('run-budil-calendar-export.bat');
const workerReadme = loadWorker('README.md');
const workerGitignore = loadWorker('.gitignore');

assert(workerBat.includes('npm run sync:today'), 'bat should run sync:today');
assert(workerBat.includes('output\\budil-calendar-events.json'), 'bat should show output path');
assert(workerReadme.includes('run-budil-calendar-export.bat'), 'worker README should document bat');
assert(workerReadme.includes('Budil 連携手順'), 'worker README should document Budil workflow');
assert(workerGitignore.includes('output/'), 'worker output/ should be gitignored');
assert(workerGitignore.includes('.env'), 'worker .env should be gitignored');
assert(workerGitignore.includes('credentials/'), 'worker credentials/ should be gitignored');

assert(statusMd.includes('v4.10.17'), 'status.md should document v4.10.17');
assert(statusMd.includes('Firebase / Functions API 案は一旦保留'), 'status.md should note Firebase on hold');
assert(handoffMd.includes('calendar-sync-worker'), 'handoff.md should document local worker path');
assert(decisionLog.includes('v4.10.17'), 'decision-log.md should record v4.10.17 decision');
assert(decisionLog.includes('hub/functions'), 'decision-log should keep hub/functions as future option');

assert(
  css.includes('@media (max-width: 390px)') || css.includes('overflow-x: hidden') || css.includes('overflow-x: clip'),
  'layout should avoid horizontal scroll at 390px'
);

execSync('node scripts/verify-v4101-calendar-json-file-import.mjs', { cwd: root, stdio: 'inherit' });

console.log('All v4.10.5 local calendar JSON workflow checks passed.');
