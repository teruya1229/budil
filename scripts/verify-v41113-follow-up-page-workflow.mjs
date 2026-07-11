/**
 * Budil v4.12.4 - follow-up page action workflow verification.
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

console.log('== v4.12.4 follow-up-page-workflow ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const followJs = load('js/follow-up-brain.js');
const executiveJs = load('js/executive-brain.js');
const receptionJs = load('js/reception-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');
const documentsJs = load('js/documents-brain.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

const NG_TERMS = [
  '売上登録',
  '売上登録へ',
  '一括売上登録',
  '登録対象を売上登録',
  '作業完了',
  '作業完了後',
  '売上登録済み',
  '作業後確定',
  '作業後売上確定',
  '自動送信',
  '見込み客管理',
  'CRM化',
  '今月利益',
  '今月売上',
  '見込み売上',
  '見込み利益'
];

console.log('== version check ==');
assert(indexHtml.includes('v4.12.9'), 'index.html should show v4.12.9');
assert(indexHtml.includes('js/app.js?v=4.12.9'), 'app.js cache buster should be v4.12.9');
assert(indexHtml.includes('css/style.css?v=4.12.9'), 'style.css cache buster should be v4.12.9');
assert(indexHtml.includes('js/follow-up-brain.js?v=4.12.9'), 'follow-up-brain cache buster should be v4.12.9');
assert(storageJs.includes("BUDIL_VERSION: 'v4.12.9'"), 'storage.js version should be v4.12.9');
assert(dataBackupJs.includes("APP_VERSION: 'v4.12.9'"), 'data-backup version should be v4.12.9');
assert(statusMd.includes('v4.12.5'), 'status.md should document v4.12.4');
assert(handoffMd.includes('v4.12.5'), 'handoff.md should document v4.12.4');
assert(decisionLog.includes('v4.12.5'), 'decision-log.md should record v4.12.4');

console.log('== follow-up page structure ==');
assert(indexHtml.includes('今日やるフォロー'), 'today follow section required');
assert(indexHtml.includes('未対応フォロー'), 'pending follow section required');
assert(indexHtml.includes('follow-up-today-list'), 'today list container required');
assert(indexHtml.includes('follow-up-completed-list'), 'completed list container required');
assert(indexHtml.includes('文面プレビュー'), 'message preview section required');
assert(indexHtml.includes('フォロー済み / 対応不要'), 'completed collapsed section required');
assert(followJs.includes('groupFollowUpTargetsForList'), 'groupFollowUpTargetsForList required');
assert(followJs.includes('getFollowUpRecordsForList'), 'getFollowUpRecordsForList required');
assert(followJs.includes('getFollowUpNextActionLabel'), 'getFollowUpNextActionLabel required');
assert(appJs.includes('renderFollowUpTodayList'), 'renderFollowUpTodayList required');
assert(appJs.includes('renderFollowUpCompletedList'), 'renderFollowUpCompletedList required');
assert(appJs.includes('renderFollowUpListRow'), 'renderFollowUpListRow required');

console.log('== follow-up action wiring ==');
assert(appJs.includes('data-follow-row-open'), 'row open buttons required');
assert(appJs.includes('data-follow-row-copy'), 'row copy buttons required');
assert(appJs.includes('data-follow-row-mark'), 'row mark buttons required');
assert(appJs.includes('data-follow-view-revenue'), 'view revenue button required');
assert(appJs.includes('お礼LINE</button>'), 'thanks action label required');
assert(appJs.includes('口コミ依頼</button>'), 'review action label required');
assert(appJs.includes('リピート案内</button>'), 'repeat action label required');
assert(appJs.includes('文面コピー</button>'), 'copy label required');
assert(appJs.includes('済みにする</button>'), 'mark done label required');
assert(appJs.includes('売上を見る</button>'), 'view revenue label required');
assert(!appJs.includes('自動送信'), 'must not add auto-send');
assert(!followJs.includes('Storage.update'), 'follow brain must not write storage');

console.log('== copy + mark proximity ==');
{
  const expandedFn = appJs.match(/function renderFollowUpCardExpandedBlock[\s\S]*?\n  \}/);
  assert(expandedFn, 'renderFollowUpCardExpandedBlock must exist');
  assert(expandedFn[0].includes('文面コピー'), 'expanded block should have copy');
  assert(expandedFn[0].includes('済みにする'), 'expanded block should have mark near copy');
  assert(expandedFn[0].includes('follow-up-copy-mark-actions'), 'copy/mark action group required');
}

console.log('== v4.11.5 / v4.11.8 / v4.11.10 / v4.12.4 maintained ==');
assert(appJs.includes('buildSharedMonthlyMetrics'), 'profit metrics must remain');
assert(appJs.includes('renderReceptionListSection'), 'reception list sections must remain');
assert(appJs.includes('buildTodayPriorityAction'), 'executive home priority must remain');
assert(appJs.includes('data-follow-card-open'), 'legacy follow card actions must remain');
assert(appJs.includes('skipFollowUpCardAction'), 'follow skip helper must remain');
assert(receptionJs.includes('groupReceptionIntakesForList'), 'reception bucket helper must remain');

console.log('== untouched modules ==');
assert(!documentsJs.includes('v4.12.5'), 'documents-brain should not be version-bumped');
assert(!receptionJs.includes('v4.12.5'), 'reception-brain should not be changed');

console.log('== follow-up css ==');
assert(css.includes('follow-up-row-grid'), 'follow row grid required');
assert(css.includes('follow-up-bucket-todayAction'), 'today bucket style required');
assert(css.includes('follow-up-copy-mark-actions'), 'copy/mark action style required');

console.log('== storage keys unchanged ==');
assert(storageJs.includes("REVENUE_RECORDS: 'budil_revenue_records'"), 'revenue storage key must remain');
assert(!storageJs.includes('localStorage.clear'), 'must not clear localStorage');

for (const term of NG_TERMS) {
  assert(!appJs.includes(term), `NG term ${term} must not appear in app.js UI`);
}

function createSandbox() {
  const ctx = createContext({
    console, Date, JSON, Math, Number, String, Array, Object, Error,
    parseInt, parseFloat, isNaN, undefined, RegExp,
    window: { confirm: () => true },
    WorkOrderBrain: {
      normalizeWorkOrder: w => ({ ...(w || {}), status: w?.status || 'completed' })
    },
    RevenueBrain: null,
    FollowUpBrain: null,
    ExecutiveBrain: null
  });
  runInContext(load('js/revenue-brain.js'), ctx, { filename: 'revenue-brain.js' });
  runInContext(load('js/follow-up-brain.js'), ctx, { filename: 'follow-up-brain.js' });
  runInContext(load('js/executive-brain.js'), ctx, { filename: 'executive-brain.js' });
  return ctx;
}

function simulateBuckets(records, today) {
  const ctx = createSandbox();
  return runInContext(`(() => {
    const context = { revenues: [], workOrders: [], leads: [], today: ${JSON.stringify(today)} };
    return FollowUpBrain.groupFollowUpTargetsForList(${JSON.stringify(records)}, context);
  })()`, ctx);
}

console.log('== pending before completed ==');
{
  const records = [
    {
      id: 'fu-rev-done',
      customerName: '完了済み太郎',
      workDate: '2026-06-01',
      serviceText: 'エアコン',
      amount: 22000,
      source: '直受',
      hasRevenue: true,
      needsThanks: false,
      needsReview: false,
      needsRepeat: false,
      maintenanceNear: false,
      daysSinceWork: 35,
      followUp: { thanksStatus: 'done', reviewStatus: 'done', repeatStatus: 'planned' }
    },
    {
      id: 'fu-rev-open',
      customerName: '未対応花子',
      workDate: '2026-07-05',
      serviceText: 'エアコン',
      amount: 18000,
      source: '直受',
      hasRevenue: true,
      needsThanks: true,
      needsReview: true,
      needsRepeat: false,
      maintenanceNear: false,
      daysSinceWork: 1,
      followUp: { thanksStatus: 'pending', reviewStatus: 'pending', repeatStatus: 'pending' }
    }
  ];
  const buckets = simulateBuckets(records, '2026-07-06');
  assert(buckets.pending.some(x => x.id === 'fu-rev-open'), 'open record should be pending');
  assert(buckets.completed.some(x => x.id === 'fu-rev-done'), 'done record should be completed');
  assert(!buckets.pending.some(x => x.id === 'fu-rev-done'), 'completed must not stay in pending');
  assert(buckets.todayAction.some(x => x.id === 'fu-rev-open'), 'thanks pending should be today action');
}

console.log('== next action label ==');
{
  const ctx = createSandbox();
  const label = runInContext(`(() => {
    const record = {
      hasRevenue: true,
      needsThanks: true,
      needsReview: true,
      needsRepeat: false,
      maintenanceNear: false,
      followUp: { thanksStatus: 'pending', reviewStatus: 'pending', repeatStatus: 'pending' }
    };
    return FollowUpBrain.getFollowUpNextActionLabel(record, {});
  })()`, ctx);
  assert(label === 'お礼LINE', 'pending thanks should show お礼LINE next action');
}

console.log('\nAll v4.12.4 follow-up-page-workflow checks passed.');
