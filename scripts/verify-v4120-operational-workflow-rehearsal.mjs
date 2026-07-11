/**
 * Budil v4.12.5 - operational workflow rehearsal verification.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = (path) => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
};

for (const file of [
  'js/app.js', 'js/storage.js', 'js/data-backup.js', 'js/work-order-brain.js',
  'js/revenue-brain.js', 'js/profit-brain.js', 'js/executive-brain.js',
  'js/reception-brain.js', 'js/follow-up-brain.js'
]) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const workOrderJs = load('js/work-order-brain.js');
const revenueJs = load('js/revenue-brain.js');
const executiveJs = load('js/executive-brain.js');
const receptionJs = load('js/reception-brain.js');
const css = load('css/style.css');

const T = {
  morning: '\u671d\u30ec\u30dd\u30fc\u30c8',
  receptionList: '\u53d7\u4ed8\u4e00\u89a7',
  monthEndChecklist: '\u6708\u672b\u30c1\u30a7\u30c3\u30af\u30ea\u30b9\u30c8',
  revenueQueue: '\u4f5c\u696d\u5f8c\u306e\u58f2\u4e0a\u78ba\u5b9a\u5f85\u3061',
  calendarCanonical: 'Google\u30ab\u30ec\u30f3\u30c0\u30fc\u304c\u4f5c\u696d\u4e88\u5b9a\u306e\u6b63\u672c',
  canonicalFlow: '\u6b63\u672c\u30d5\u30ed\u30fc',
  expenseList: '\u7d4c\u8cbb\u4e00\u89a7',
  expenseListNg: '<h2>\u652f\u51fa\u4e00\u89a7</h2>',
  noAutoSend: '\u81ea\u52d5\u9001\u4fe1\u306f\u3057\u307e\u305b\u3093',
  ngSalesForecast: '\u898b\u8fbc\u307f\u58f2\u4e0a'
};

const NG_TERMS = [
  '\u898b\u8fbc\u307f\u58f2\u4e0a', '\u898b\u8fbc\u307f\u5229\u76ca', '\u4eca\u6708\u58f2\u4e0a', '\u4eca\u6708\u5229\u76ca',
  '\u4e88\u5b9a\u542b\u3080', '\u4e88\u6e2c\u5229\u76ca', '\u81ea\u52d5\u6708\u6b21\u7de0\u3081', '\u81ea\u52d5\u8acb\u6c42\u66f8',
  '\u4f1a\u8a08\u30bd\u30d5\u30c8', 'CRM\u5316',
  '\u58f2\u4e0a\u767b\u9332\u3078', '\u4e00\u62ec\u58f2\u4e0a\u767b\u9332', '\u4f5c\u696d\u5b8c\u4e86\u5f8c',
  '\u58f2\u4e0a\u767b\u9332\u6e08\u307f', '\u4f5c\u696d\u5f8c\u78ba\u5b9a'
];

const FORMAL_TERMS = [
  '\u78ba\u5b9a\u58f2\u4e0a', '\u4e88\u5b9a\u58f2\u4e0a', '\u5408\u8a08\u58f2\u4e0a', '\u4eca\u6708\u7d4c\u8cbb',
  '\u78ba\u5b9a\u5229\u76ca', '\u4e88\u5b9a\u5229\u76ca', '\u5408\u8a08\u5229\u76ca', '\u5165\u91d1\u6e08\u307f',
  '\u5165\u91d1\u5f85\u3061', '\u4ef2\u4ecb\u6599', '\u6708\u6b21\u8acb\u6c42', '\u8acb\u6c42\u6708',
  '\u6708\u672b\u30c1\u30a7\u30c3\u30af\u30ea\u30b9\u30c8', '\u58f2\u4e0a\u78ba\u5b9a\u6f0f\u308c',
  '\u304a\u793cLINE', '\u53e3\u30b3\u30df\u4f9d\u983c', '\u30ea\u30d4\u30fc\u30c8\u6848\u5185',
  '\u6587\u9762\u30b3\u30d4\u30fc', '\u6e08\u307f\u306b\u3059\u308b'
];

const WORKFLOW_BUTTONS = [
  '\u58f2\u4e0a\u7ba1\u7406\u3078', '\u58f2\u4e0a\u78ba\u5b9a\u3078', 'Google\u30ab\u30ec\u30f3\u30c0\u30fc\u78ba\u8a8d',
  '\u4e88\u5b9a\u78ba\u8a8d', '\u5165\u91d1\u4e88\u5b9a\u3078', '\u6708\u6b21\u8acb\u6c42\u3092\u898b\u308b',
  '\u8acb\u6c42\u66f8/\u898b\u7a4d\u66f8\u3078', '\u30d5\u30a9\u30ed\u30fc\u3078', '\u304a\u793cLINE',
  '\u53e3\u30b3\u30df\u4f9d\u983c', '\u30ea\u30d4\u30fc\u30c8\u6848\u5185', '\u6587\u9762\u30b3\u30d4\u30fc',
  '\u6e08\u307f\u306b\u3059\u308b', '\u58f2\u4e0a\u3092\u898b\u308b', '\u7d4c\u8cbb\u5165\u529b\u3078',
  '\u5229\u76ca\u7ba1\u7406\u3078', '\u95a2\u9023\u58f2\u4e0a\u3092\u898b\u308b', '\u7de8\u96c6'
];

const VIEW_IDS = [
  'view-dashboard', 'view-calendar-registration', 'view-revenue', 'view-receivables',
  'view-profit', 'view-follow-up', 'view-monthly-results', 'view-documents'
];

const STORAGE_KEY_SNIPPETS = [
  'budil_revenue_records', 'budil_work_orders', 'budil_reception_intakes',
  'budil_expense_records', 'budil_followups'
];

console.log('== v4.12.5 operational-workflow-rehearsal ==');

console.log('== version / cache buster ==');
assert(indexHtml.includes('v4.12.11'), 'index.html should show v4.12.11');
assert(indexHtml.includes('js/app.js?v=4.12.11'), 'app.js cache buster should be v4.12.11');
assert(indexHtml.includes('css/style.css?v=4.12.11'), 'style.css cache buster should be v4.12.11');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.11'"), 'storage version should be v4.12.11');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.11'"), 'data-backup version should be v4.12.11');
assert(!indexHtml.includes('?v=4.12.7'), 'old cache buster v4.12.7 should be gone');

console.log('== empty src / layout safety ==');
assert(!indexHtml.includes('src=""'), 'index.html must not contain empty img/iframe src');
assert(appJs.includes('cleanupDocumentSealImages'), 'document seal empty-src cleanup should exist');
assert(css.includes('overflow-x: hidden') || css.includes('@media (max-width: 390px)'),
  'layout should guard horizontal scroll');

console.log('== workflow screens exist ==');
for (const id of VIEW_IDS) {
  assert(indexHtml.includes(`id="${id}"`), `view ${id} should exist`);
}
assert(indexHtml.includes(T.morning), 'morning report section should exist');
assert(indexHtml.includes(T.receptionList), 'reception list section should exist');
assert(indexHtml.includes(T.monthEndChecklist), 'month-end checklist should exist');
assert(indexHtml.includes(T.revenueQueue), 'revenue queue section should exist');

console.log('== operational flow order ==');
assert(indexHtml.includes('exec-home-priority-action'), 'executive priority action block');
assert(indexHtml.includes('schedule-revenue-queue-list'), 'schedule revenue queue');
assert(indexHtml.includes('receivables-monthly-billing-card'), 'monthly billing card');
assert(indexHtml.includes('follow-up-today-list'), 'follow today list');
assert(receptionJs.includes('groupReceptionIntakesForList'), 'reception 4-bucket grouping');
assert(revenueJs.includes('getSourceProfitRate'), 'source profit rate helper');
assert(revenueJs.includes('isMonthlyBillingSource'), 'monthly billing source helper');
assert(executiveJs.includes('buildTodayPriorityAction'), 'today priority action builder');

console.log('== navigation wiring ==');
assert(appJs.includes('function navigateToView'), 'navigateToView should exist');
assert(appJs.includes('data-reception-open-revenue'), 'reception related revenue button');
assert(appJs.includes('data-reception-schedule-check'), 'reception schedule check button');
assert(appJs.includes('openRevenueFromReceptionIntake'), 'reception to revenue bridge');
for (const label of WORKFLOW_BUTTONS) {
  assert(appJs.includes(label) || indexHtml.includes(label), `workflow label "${label}" should exist`);
}

console.log('== Google Calendar canonical flow ==');
assert(indexHtml.includes(T.calendarCanonical), 'calendar canonical note');
assert(indexHtml.includes(T.canonicalFlow), 'canonical flow note');
const visibleFn = appJs.match(/function renderReceptionVisibleActions[\s\S]*?^  }/m);
assert(visibleFn, 'renderReceptionVisibleActions should exist');
assert(!visibleFn[0].includes('data-reception-create-work-order'),
  'visible reception actions must not promote direct work-order creation');

console.log('== formal wording / NG terms ==');
const visibleSources = [indexHtml, appJs, workOrderJs].join('\n');
for (const term of NG_TERMS) {
  assert(!visibleSources.includes(term), `NG term should not appear: ${term}`);
}
for (const term of FORMAL_TERMS) {
  assert(indexHtml.includes(term) || appJs.includes(term), `formal term should appear: ${term}`);
}
assert(indexHtml.includes(T.expenseList), 'profit expense list should use formal label');
assert(!indexHtml.includes(T.expenseListNg), 'profit view should not use expense-list heading');
assert(!workOrderJs.includes(T.ngSalesForecast), 'work-order-brain should not use NG forecast label');
assert(indexHtml.includes(T.noAutoSend) || appJs.includes(T.noAutoSend), 'follow view no-auto-send note');

console.log('== data safety ==');
assert(!appJs.includes('localStorage.clear'), 'localStorage.clear forbidden in app.js');
for (const key of STORAGE_KEY_SNIPPETS) {
  assert(storageJs.includes(key), `storage key ${key} should remain`);
}
assert(dataBackupJs.includes('exportPayload'), 'backup export helper should exist');
assert(dataBackupJs.includes('importData'), 'backup import helper should exist');

console.log('== no new automation hooks ==');
assert(!appJs.includes('autoSendLine'), 'LINE auto-send must not be added');
assert(!appJs.includes('autoMonthlyClose'), 'auto monthly close must not be added');

console.log('== chain prior cross-screen stability ==');
execSync('node scripts/verify-v41115-cross-screen-workflow-stability.mjs', { cwd: root, stdio: 'inherit' });

console.log('All v4.12.5 operational-workflow-rehearsal checks passed.');
