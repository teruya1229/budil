/**
 * Budil v4.12.5 - calendar export and import workflow verification.
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
  if (!condition) throw new Error(`FAIL: ${message}`);
};

for (const file of ['js/app.js', 'js/storage.js', 'js/data-backup.js']) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

const NG_TERMS = [
  '\u898b\u8fbc\u307f\u58f2\u4e0a', '\u898b\u8fbc\u307f\u5229\u76ca', '\u4eca\u6708\u58f2\u4e0a', '\u4eca\u6708\u5229\u76ca',
  '\u58f2\u4e0a\u767b\u9332\u3078', '\u4e00\u62ec\u58f2\u4e0a\u767b\u9332', '\u4f5c\u696d\u5b8c\u4e86\u5f8c',
  '\u58f2\u4e0a\u767b\u9332\u6e08\u307f', '\u4f5c\u696d\u5f8c\u78ba\u5b9a'
];

console.log('== v4.12.5 calendar-export-import-workflow ==');

console.log('== version / cache buster ==');
assert(indexHtml.includes('v4.12.17'), 'index.html should show v4.12.17');
assert(indexHtml.includes('js/app.js?v=4.12.17'), 'app.js cache buster should be v4.12.17');
assert(indexHtml.includes('css/style.css?v=4.12.17'), 'style.css cache buster should be v4.12.17');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.17'"), 'storage version should be v4.12.17');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.17'"), 'data-backup version should be v4.12.17');
assert(!indexHtml.includes('?v=4.12.7'), 'old cache buster v4.12.7 should be gone');
assert(indexHtml.includes('js/calendar-candidate-brain.js?v=4.12.17'), 'calendar-candidate cache buster should be v4.12.17');

console.log('== workflow UI ==');
assert(indexHtml.includes('\u6700\u65b0\u4e88\u5b9a\u306e\u66f4\u65b0\u3068\u53d6\u308a\u8fbc\u307f'), 'workflow section title should exist');
assert(indexHtml.includes('btn-calendar-export-latest'), 'export latest button should exist');
assert(indexHtml.includes('Google\u30ab\u30ec\u30f3\u30c0\u30fc\u3092\u66f4\u65b0'), 'export latest button label should be Google calendar update');
assert(!indexHtml.includes('\u6700\u65b0\u4e88\u5b9a\u3092\u66f8\u304d\u51fa\u3059'), 'old export-only button label should be gone');
assert(indexHtml.includes('btn-calendar-candidate-json-import'), 'JSON import button should remain');
assert(indexHtml.includes('\u30ab\u30ec\u30f3\u30c0\u30fcJSON\u3092\u53d6\u308a\u8fbc\u3080'), 'JSON import button label should remain');
assert(indexHtml.includes('\u975e\u5e38\u7528'), 'manual JSON import should remain as emergency path');
assert(indexHtml.includes('\u6b63\u672c\u30d5\u30ed\u30fc'), 'canonical flow notice should remain');
assert(
  indexHtml.includes('\u78ba\u5b9a\u58f2\u4e0a\u306b\u306f\u307e\u3060\u5165\u308a\u307e\u305b\u3093'),
  'should state import is not confirmed revenue'
);
assert(indexHtml.includes('calendar-json-file-meta'), 'file meta panel should exist');
assert(indexHtml.includes('calendar-export-guide'), 'export guide panel should exist');

console.log('== app.js export/import workflow ==');
assert(appJs.includes('CALENDAR_EXPORT_BAT_PATH'), 'bat path constant should exist');
assert(appJs.includes('run-budil-calendar-export.bat'), 'bat path should be documented in app.js');
assert(appJs.includes('budil-calendar-events.json'), 'json path should be documented in app.js');
assert(appJs.includes('handleCalendarExportLatestClick'), 'export click handler should exist');
assert(appJs.includes('renderCalendarExportGuide'), 'export guide renderer should exist');
assert(appJs.includes('renderCalendarJsonFileMeta'), 'file meta renderer should exist');
assert(appJs.includes('getCalendarJsonStaleWarningLevel'), 'stale warning helper should exist');
assert(appJs.includes('CALENDAR_JSON_STALE_WARN_MS'), '6h stale threshold should exist');
assert(appJs.includes('CALENDAR_JSON_STALE_STRONG_MS'), '24h stale threshold should exist');
assert(appJs.includes('file.lastModified'), 'should use File.lastModified');
assert(appJs.includes('CALENDAR_EXPORT_LOCAL_API_URL'), 'local API URL hook should exist');
assert(appJs.includes("CALENDAR_LOCAL_API_BASE = 'http://127.0.0.1:43821'"), 'local API base must be fixed loopback URL');
assert(appJs.includes('CALENDAR_LOCAL_API_HEALTH_URL'), 'health URL constant should exist');
assert(appJs.includes('CALENDAR_LOCAL_API_SYNC_URL'), 'sync URL constant should exist');
assert(appJs.includes('commitSavableCalendarCandidates'), 'shared save helper should exist');
assert(appJs.includes('calendarLocalSyncInFlight'), 'client-side in-flight guard should exist');
assert(appJs.includes('AbortController'), 'timeout AbortController should exist');
assert(appJs.includes('ブラウザからbatファイルを直接実行することはできません'), 'manual guide should warn no direct bat execution');
assert(!appJs.includes('child_process'), 'app.js must not spawn local processes');
assert(!appJs.includes('require(\'child_process\')'), 'app.js must not require child_process');
assert(!appJs.includes('ActiveXObject'), 'app.js must not use ActiveX');
assert(appJs.includes('handleCalendarCandidateJsonFile'), 'JSON file import handler should remain');
assert(appJs.includes('applyCalendarCandidateParsed'), 'import preview flow should remain');
assert(appJs.includes('saveAllCalendarCandidates'), 'save all flow should remain');
assert(appJs.includes('function saveAllCalendarCandidates(force)'), 'manual save-all signature should remain');
assert(
  /function saveAllCalendarCandidates\(force\) \{[\s\S]{0,400}?commitSavableCalendarCandidates/.test(appJs),
  'saveAll must reuse shared commit helper'
);
console.log('== calendar-sync-worker investigation ==');
const workerBat = loadWorker('run-budil-calendar-export.bat');
const workerPkg = loadWorker('package.json');
const workerLocalApi = loadWorker('src/localApi/server.js');
const workerLocalApiMain = loadWorker('src/localApi/main.js');
const workerExportCore = loadWorker('src/utils/exportBudilCalendarCore.js');
assert(workerBat.includes('npm run sync:today'), 'bat should run sync:today');
assert(workerBat.includes('output\\budil-calendar-events.json'), 'bat output path should be fixed');
assert(!workerPkg.includes('"serve"'), 'worker should not expose generic HTTP serve script');
assert(workerPkg.includes('sync:today'), 'worker should keep sync:today script');
assert(workerPkg.includes('"local-api"'), 'worker should expose local-api script');
assert(!loadWorker('src/index.js').includes('createServer'), 'sync:today entry must not host HTTP server');
assert(workerLocalApi.includes('127.0.0.1'), 'local API must bind loopback only');
assert(workerLocalApi.includes('43821'), 'local API must use fixed port 43821');
assert(workerLocalApi.includes('https://teruya1229.github.io'), 'local API must allow Budil origin');
assert(workerLocalApi.includes('Access-Control-Allow-Private-Network'), 'local API must support PNA header');
assert(workerLocalApi.includes('host_forbidden'), 'local API must reject bad Host');
assert(workerLocalApi.includes('origin_forbidden'), 'local API must reject bad Origin');
assert(!workerLocalApi.includes('0.0.0.0'), 'local API must not bind 0.0.0.0');
assert(!/Access-Control-Allow-Origin:\s*\*/.test(workerLocalApi), 'local API must not use wildcard CORS');
assert(!workerLocalApi.includes('sync:today'), 'local API must not call sync:today');
assert(!workerLocalApiMain.includes('sync:today'), 'local API main must not call sync:today');
assert(!workerExportCore.includes('schedule-dashboard'), 'Budil export core must not update schedule-dashboard');
assert(!workerExportCore.includes('child_process'), 'Budil export core must not spawn commands');
assert(workerExportCore.includes('buildBudilCalendarEventsPayload'), 'local export must reuse Budil payload builder');

console.log('== css ==');
assert(css.includes('calendar-import-workflow-steps'), 'workflow step css should exist');
assert(css.includes('calendar-export-guide-panel'), 'export guide css should exist');
assert(css.includes('calendar-json-file-meta-panel'), 'file meta css should exist');
assert(css.includes('calendar-json-stale-warn'), 'stale warning css should exist');

console.log('== docs ==');
assert(statusMd.includes('v4.12.5'), 'status.md should document v4.12.5');
assert(handoffMd.includes('v4.12.5'), 'handoff.md should document v4.12.5');
assert(decisionLog.includes('v4.12.5'), 'decision-log.md should record v4.12.5');

console.log('== NG terms / data safety ==');
for (const term of NG_TERMS) {
  assert(!indexHtml.includes(term), `NG term in index.html: ${term}`);
}
assert(!appJs.includes('localStorage.clear'), 'localStorage.clear forbidden');
assert(!indexHtml.includes('src=""'), 'index.html must not contain empty src');

console.log('== chain prior release ==');
execSync('node scripts/verify-v4121-customer-asset-memo.mjs', { cwd: root, stdio: 'inherit' });

console.log('All v4.12.5 calendar-export-import-workflow checks passed.');
