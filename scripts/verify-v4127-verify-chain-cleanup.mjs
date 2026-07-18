/**
 * Budil v4.12.14 - verify chain cleanup verification.
 * Confirms current/legacy split, version pins, and safety guards.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptsDir = join(root, 'scripts');
const load = (path) => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
};

const EXPECTED_VERSION = 'v4.12.14';
const EXPECTED_CACHE = '4.12.14';

console.log(`== ${EXPECTED_VERSION} verify-chain-cleanup ==`);

console.log('== runner files ==');
assert(statSync(join(scriptsDir, 'verify-current.mjs')).isFile(), 'verify-current.mjs must exist');
assert(statSync(join(scriptsDir, 'verify-legacy-reference.mjs')).isFile(), 'verify-legacy-reference.mjs must exist');

const currentRunner = load('scripts/verify-current.mjs');
const legacyRunner = load('scripts/verify-legacy-reference.mjs');
assert(currentRunner.includes('verify-v4(10|11|12)'), 'current runner must target v4.10–v4.12 scripts');
assert(currentRunner.includes('checkVerifyPrerequisites'), 'current runner must gate on formal env prerequisites');
assert(currentRunner.includes('calendar-sync-worker'), 'current runner must require sibling calendar-sync-worker');
assert(currentRunner.includes('googleapis'), 'current runner must require hub/functions googleapis');
assert(currentRunner.includes('Budil root'), 'current runner must warn against npm install at Budil root');
assert(legacyRunner.includes('verify-v48'), 'legacy runner must target v4.8 scripts');
assert(legacyRunner.includes('verify-reception-actions.mjs'), 'legacy runner must list reception-actions');
assert(legacyRunner.includes('verify-calendar-past-recovery.mjs'), 'legacy runner must list calendar-past-recovery');

console.log('== docs record split ==');
for (const doc of ['status.md', 'handoff.md', 'decision-log.md']) {
  const text = load(doc);
  assert(text.includes('current verify'), `${doc} must document current verify chain`);
  assert(text.includes('legacy'), `${doc} must document legacy verify handling`);
  assert(text.includes('v4.12.14'), `${doc} must document v4.12.14`);
}

console.log('== version pins ==');
const indexHtml = load('index.html');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
assert(indexHtml.includes(`AI経営脳みそ ${EXPECTED_VERSION}`), 'index header version must be v4.12.14');
assert(indexHtml.includes(`Budil ${EXPECTED_VERSION}`), 'index sidebar version must be v4.12.14');
assert(indexHtml.includes(`js/app.js?v=${EXPECTED_CACHE}`), 'app.js cache buster must be v4.12.14');
assert(storageJs.includes(`BUDIL_VERSION: '${EXPECTED_VERSION}'`), 'storage version must be v4.12.14');
assert(dataBackupJs.includes(`APP_VERSION: '${EXPECTED_VERSION}'`), 'data-backup version must be v4.12.14');
assert(indexHtml.includes('js/calendar-candidate-brain.js?v=4.12.14'), 'calendar-candidate cache buster must be v4.12.14');
assert(!indexHtml.includes('?v=4.12.7'), 'old cache buster v4.12.7 must be gone from index');

console.log('== key feature verifies still present ==');
const mustExist = [
  'verify-v4123-calendar-export-import-workflow.mjs',
  'verify-v4124-customer-memo-quick-edit.mjs',
  'verify-v4125-curama-payment-methods.mjs',
  'verify-v4126-touch-card-payment-cycle.mjs',
  'verify-v4129-source-analysis-alignment.mjs',
  'verify-v41210-profit-source-display-alignment.mjs',
  'verify-v41211-profit-target-month.mjs',
  'verify-v4115-source-profit-rates.mjs',
  'verify-v4119-monthly-billing-workflow.mjs'
];
for (const name of mustExist) {
  assert(statSync(join(scriptsDir, name)).isFile(), `${name} must remain in repo`);
}

console.log('== legacy scripts excluded from current runner ==');
const legacyNames = readdirSync(scriptsDir).filter((n) => /^verify-v48\d.*\.mjs$/.test(n) || /^verify-v49\d.*\.mjs$/.test(n));
for (const legacy of legacyNames.slice(0, 3)) {
  assert(!currentRunner.includes(legacy), `current runner must not include legacy ${legacy}`);
}

console.log('== localStorage.clear guard ==');
const jsSources = readdirSync(join(root, 'js'))
  .filter((n) => n.endsWith('.js'))
  .map((n) => load(`js/${n}`))
  .join('\n');
assert(!/localStorage\.clear\s*\(/.test(jsSources), 'js/ must not contain localStorage.clear()');
assert(!/localStorage\.clear\s*\(/.test(indexHtml), 'index.html must not contain localStorage.clear()');

const calendarRecovery = load('scripts/verify-calendar-past-recovery.mjs');
assert(calendarRecovery.includes("rel.startsWith('.cursor/')"), 'calendar recovery verify must skip .cursor');
assert(calendarRecovery.includes("rel.startsWith('scripts/')"), 'calendar recovery verify must skip scripts');

console.log('== reception-actions sandbox fix ==');
const receptionVerify = load('scripts/verify-reception-actions.mjs');
assert(receptionVerify.includes("loadScript('revenue-brain.js')"), 'reception-actions verify must load revenue-brain');

console.log('== commit hygiene ==');
const trackedSensitive = spawnSync('git', ['ls-files', 'auth', 'js/hub-import.js', '.env', 'output'], {
  cwd: root,
  encoding: 'utf8'
});
const tracked = (trackedSensitive.stdout || '').trim();
assert(!tracked, `sensitive paths must not be tracked: ${tracked || '(ok)'}`);

console.log(`\nAll ${EXPECTED_VERSION} verify-chain-cleanup checks passed.`);
