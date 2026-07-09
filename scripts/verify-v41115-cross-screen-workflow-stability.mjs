/**
 * Budil v4.12.4 - cross-screen workflow stability verification.
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

for (const file of ['js/app.js', 'js/storage.js', 'js/data-backup.js', 'js/work-order-brain.js']) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const workOrderJs = load('js/work-order-brain.js');
const css = load('css/style.css');

const NG_TERMS = [
  '見込み売上', '見込み利益', '今月売上', '今月利益', '予定含む', '予測利益',
  '自動月次締め', '自動請求書', '会計ソフト', 'CRM化'
];

const WORKFLOW_BUTTONS = [
  { label: '売上管理へ', pattern: '売上管理へ' },
  { label: '売上確定へ', pattern: '売上確定へ' },
  { label: '作業予定を見る', pattern: '作業予定を見る' },
  { label: 'Googleカレンダー確認', pattern: 'Googleカレンダー確認' },
  { label: '予定確認', pattern: '予定確認' },
  { label: '入金予定へ', pattern: '入金予定へ' },
  { label: '月次請求を見る', pattern: '月次請求を見る' },
  { label: '請求書/見積書へ', pattern: '請求書/見積書へ' },
  { label: 'フォローへ', pattern: 'フォローへ' },
  { label: 'お礼LINE', pattern: 'お礼LINE' },
  { label: '口コミ依頼', pattern: '口コミ依頼' },
  { label: 'リピート案内', pattern: 'リピート案内' },
  { label: '文面コピー', pattern: '文面コピー' },
  { label: '済みにする', pattern: '済みにする' },
  { label: '売上を見る', pattern: '売上を見る' },
  { label: '経費入力へ', pattern: '経費入力へ' },
  { label: '利益管理へ', pattern: '利益管理へ' },
  { label: '関連売上を見る', pattern: '関連売上を見る' }
];

const VIEW_IDS = [
  'view-dashboard',
  'view-calendar-registration',
  'view-revenue',
  'view-receivables',
  'view-profit',
  'view-follow-up',
  'view-monthly-results',
  'view-documents'
];

console.log('== v4.12.4 cross-screen-workflow-stability ==');

console.log('== version / cache buster ==');
assert(indexHtml.includes('v4.12.7'), 'index.html should show v4.12.7');
assert(indexHtml.includes('js/app.js?v=4.12.7'), 'app.js cache buster should be v4.12.7');
assert(indexHtml.includes('css/style.css?v=4.12.7'), 'style.css cache buster should be v4.12.7');
assert(indexHtml.includes('js/revenue-brain.js?v=4.12.7'), 'revenue-brain cache buster should be v4.12.7');
assert(indexHtml.includes('js/profit-brain.js?v=4.12.7'), 'profit-brain cache buster should be v4.12.7');
assert(indexHtml.includes('js/executive-brain.js?v=4.12.7'), 'executive-brain cache buster should be v4.12.7');
assert(indexHtml.includes('js/work-order-brain.js?v=4.12.7'), 'work-order-brain cache buster should be v4.12.7');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.7'"), 'storage version should be v4.12.7');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.7'"), 'data-backup version should be v4.12.7');
assert(!indexHtml.includes('?v=4.11.14'), 'old cache buster v4.11.14 should be gone');
assert(!indexHtml.includes('?v=4.12.35'), 'broken cache buster v4.12.35 should not exist');

console.log('== empty src guards ==');
assert(!indexHtml.includes('src=""'), 'index.html must not contain empty img/iframe src');
assert(!indexHtml.includes("src=''"), 'index.html must not contain empty src attribute');
assert(appJs.includes('cleanupDocumentSealImages'), 'document seal empty-src cleanup should exist');

console.log('== workflow screens exist ==');
for (const id of VIEW_IDS) {
  assert(indexHtml.includes(`id="${id}"`), `view ${id} should exist`);
}
assert(indexHtml.includes('朝レポート'), 'morning report section should exist');
assert(indexHtml.includes('受付一覧'), 'reception list section should exist');
assert(indexHtml.includes('月末チェックリスト'), 'month-end checklist should exist');

console.log('== navigation wiring ==');
assert(appJs.includes('function navigateToView'), 'navigateToView should exist');
assert(appJs.includes('bindMonthEndNavButtons'), 'month-end nav binding should exist');
assert(appJs.includes('data-month-end-nav'), 'month-end nav buttons should exist');
assert(appJs.includes('data-reception-open-revenue'), 'reception related revenue button should exist');
assert(appJs.includes('data-reception-schedule-check'), 'reception schedule check button should exist');
assert(appJs.includes('data-follow-row-open'), 'follow row action buttons should exist');
assert(appJs.includes('data-revenue-go-receivable'), 'revenue to receivables button should exist');
assert(appJs.includes('goToReception'), 'reception navigation helper should exist');

for (const btn of WORKFLOW_BUTTONS) {
  assert(appJs.includes(btn.pattern) || indexHtml.includes(btn.pattern),
    `workflow button label "${btn.label}" should exist in app or index`);
}

console.log('== v4.11.5-14 structure maintained ==');
assert(indexHtml.includes('exec-home-priority-action'), 'v4.11.10 priority action block should remain');
assert(indexHtml.includes('exec-home-today-tasks'), 'v4.11.10 today tasks should remain');
assert(indexHtml.includes('schedule-revenue-queue-list'), 'v4.11.11 schedule revenue queue should remain');
assert(indexHtml.includes('receivables-monthly-billing-card'), 'v4.11.9 monthly billing card should remain');
assert(indexHtml.includes('follow-up-today-list'), 'v4.11.13 follow today list should remain');
assert(indexHtml.includes('month-end-checklist'), 'v4.11.14 month-end checklist should remain');
assert(appJs.includes('buildMonthEndChecklist'), 'v4.11.14 checklist builder should remain');
assert(load('js/revenue-brain.js').includes('getSourceProfitRate'), 'v4.11.5 source profit rate helper should remain');

console.log('== NG wording (visible sources) ==');
const visibleSources = [indexHtml, appJs, workOrderJs].join('\n');
for (const term of NG_TERMS) {
  assert(!visibleSources.includes(term), `NG term "${term}" should not appear in visible sources`);
}
assert(indexHtml.includes('経費一覧'), 'profit expense list should use 経費一覧');
assert(!indexHtml.includes('<h2>支出一覧</h2>'), 'profit view should not use 支出一覧 heading');
assert(!workOrderJs.includes('見込み売上'), 'work-order-brain should not use 見込み売上');

console.log('== layout safety ==');
assert(css.includes('month-end-checklist') || css.includes('exec-home-priority-action'),
  'cross-screen layout styles should exist');

console.log('All v4.12.4 cross-screen-workflow-stability checks passed.');
