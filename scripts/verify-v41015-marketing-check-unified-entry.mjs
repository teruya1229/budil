/**
 * Budil v4.10.20 — marketing check unified paste entry verification.
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = (path) => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function createAnalyticsSandbox() {
  const ctx = createContext({
    console,
    Date,
    JSON,
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    undefined,
    ExternalCheckBrain: {
      emptySummary() {
        return {
          date: '未確認',
          targets: '未確認',
          scheduleCandidates: ['未確認'],
          demandCandidates: ['未確認'],
          analyticsCandidates: ['未確認'],
          gbpSignals: ['未確認'],
          adAnomalies: ['未確認'],
          todayActions: ['未確認'],
          noiseCandidates: ['未確認'],
          cautions: ['未確認']
        };
      }
    }
  });
  runInContext(load('js/external-check-brain.js'), ctx, { filename: 'external-check-brain.js' });
  runInContext(load('js/analytics-brain.js'), ctx, { filename: 'analytics-brain.js' });
  runInContext(load('js/action-brain.js'), ctx, { filename: 'action-brain.js' });
  return ctx;
}

function createProfitSandbox() {
  const ctx = createContext({
    console,
    Date,
    JSON,
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    undefined
  });
  runInContext(load('js/revenue-brain.js'), ctx, { filename: 'revenue-brain.js' });
  runInContext(load('js/work-order-brain.js'), ctx, { filename: 'work-order-brain.js' });
  runInContext(load('js/profit-brain.js'), ctx, { filename: 'profit-brain.js' });
  return ctx;
}

const SAMPLE_FREE_TEXT = `## 結論
LP改善を優先

## 数値比較
6/10〜6/19：
・LP表示回数：87セッション
・ユーザー数：87
・イベント数：809
・平均滞在時間：1分01秒
・Google organic流入：9
・Google cpc流入：16
・direct流入：56

6/20〜6/30：
・LP表示回数：56セッション
・ユーザー数：56
・イベント数：363
・平均滞在時間：46秒
・Google organic流入：13
・Google cpc流入：5
・direct流入：32

## Search Console
Search Console表示回数：422
クリック数：14
CTR：3.3%
平均掲載順位：10.1

## 画像404の影響
家庭向けエアコンLP：画像404が2件
AI帳票番頭LP：画像404が1件

## 今すぐやる
- LP画像404を修正する
- お問い合わせ集中バナーを変更する
- 電話CTAを追加する
- LINEクリック計測を追加する
- 電話クリック計測を追加する`;

for (const file of ['app.js', 'analytics-brain.js', 'external-check-brain.js', 'storage.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

console.log('== v4.10.20 marketing check unified entry ==');

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const analyticsJs = load('js/analytics-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

assert(indexHtml.includes('v4.10.39'), 'index.html should show v4.10.39');
assert(indexHtml.includes('js/app.js?v=4.10.39'), 'app.js cache buster should be v4.10.39');
assert(storageJs.includes("BUDIL_VERSION: 'v4.10.39'"), 'storage.js version should be v4.10.39');
assert(dataBackupJs.includes("APP_VERSION: 'v4.10.39'"), 'data-backup version should be v4.10.39');

assert(indexHtml.includes('集客チェック'), 'index.html should use 集客チェック label');
assert(indexHtml.includes('id="browser-bantou-paste"'), 'main paste textarea should exist');
assert(indexHtml.includes('external-check-legacy-paste-collapse'), 'legacy paste should be tucked away');
assert(!indexHtml.includes('data-view="external-check"'), 'external-check should not be a main nav entry');
assert(indexHtml.includes('id="analytics-check-history"'), 'analytics history section should exist');

assert(analyticsJs.includes('parseMarketingCheckOverlay'), 'analytics brain should parse marketing check overlay');
assert(analyticsJs.includes('createMarketingCheckHistoryReport'), 'analytics brain should create history report');
assert(appJs.includes('addMarketingCheckActionCandidates'), 'app should add marketing check action candidates');
assert(appJs.includes('renderBrowserBantouParseDiagnostics'), 'app should render parse diagnostics');
assert(!appJs.includes('localStorage.clear()'), 'localStorage.clear must not be used');

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

console.log('== free text report parsing ==');
{
  const ctx = createAnalyticsSandbox();
  const result = runInContext(`(() => {
    const parsed = AnalyticsBrain.parseBrowserBantouReport(${JSON.stringify(SAMPLE_FREE_TEXT)});
    const preview = AnalyticsBrain.buildImportPreview(parsed, []);
    const m = preview.snapshot.metrics || {};
    const ts = preview.snapshot.trafficSources || {};
    return {
      users: m.users,
      compareUsers: m.compareUsers,
      sessions: m.sessions,
      compareLpSessions: m.compareLpSessions,
      events: m.eventCount,
      compareEvents: m.compareEvents,
      organic: ts.organic,
      cpc: ts.paid,
      direct: ts.direct,
      scImpressions: m.searchImpressions,
      scClicks: m.searchClicks,
      scCtr: m.searchCtr,
      scPosition: m.searchAvgPosition,
      image404: (preview.marketingCheck && preview.marketingCheck.image404) || [],
      immediateActions: preview.immediateActions || [],
      canSave: preview.canSave,
      diagnostics: preview.parseDiagnostics
    };
  })()`, ctx);

  assert(result.users === 56, `users should be 56, got ${result.users}`);
  assert(result.compareUsers === 87, `compareUsers should be 87, got ${result.compareUsers}`);
  assert(result.sessions === 56, `LP sessions should be 56, got ${result.sessions}`);
  assert(result.compareLpSessions === 87, `compare LP sessions should be 87, got ${result.compareLpSessions}`);
  assert(result.events === 363, `events should be 363, got ${result.events}`);
  assert(result.compareEvents === 809, `compare events should be 809, got ${result.compareEvents}`);
  assert(result.organic === 13, `organic should be 13, got ${result.organic}`);
  assert(result.cpc === 5, `cpc should be 5, got ${result.cpc}`);
  assert(result.direct === 32, `direct should be 32, got ${result.direct}`);
  assert(result.scImpressions === 422, `SC impressions should be 422, got ${result.scImpressions}`);
  assert(result.scClicks === 14, `SC clicks should be 14, got ${result.scClicks}`);
  assert(result.scCtr === 3.3, `SC CTR should be 3.3, got ${result.scCtr}`);
  assert(result.scPosition === 10.1, `SC avg position should be 10.1, got ${result.scPosition}`);
  assert(result.image404.length === 2, `image404 entries should be 2, got ${result.image404.length}`);
  assert(result.immediateActions.length === 5, `immediate actions should be 5, got ${result.immediateActions.length}`);
  assert(result.canSave, 'preview should be saveable');
  assert(result.diagnostics && result.diagnostics.canSaveRaw, 'raw save should be available');
}

console.log('== improvement candidate titles ==');
{
  const ctx = createAnalyticsSandbox();
  const titles = runInContext(`(() => {
    const parsed = AnalyticsBrain.parseBrowserBantouReport(${JSON.stringify(SAMPLE_FREE_TEXT)});
    return parsed.todayTasks || [];
  })()`, ctx);
  const expected = [
    'LP画像404を修正する',
    'お問い合わせ集中バナーを変更する',
    '電話CTAを追加する',
    'LINEクリック計測を追加する',
    '電話クリック計測を追加する'
  ];
  for (const title of expected) {
    assert(titles.includes(title), `expected improvement candidate missing: ${title}`);
  }
}

console.log('== parse failure partial save ==');
{
  const ctx = createAnalyticsSandbox();
  const partial = runInContext(`(() => {
    const parsed = AnalyticsBrain.parseBrowserBantouReport('## 今すぐやる\\n- 電話CTAを追加する\\n\\n未整形メモだけ');
    const preview = AnalyticsBrain.buildImportPreview(parsed, []);
    return {
      canSave: preview.canSave,
      actionCount: (preview.immediateActions || []).length,
      diagnostics: preview.parseDiagnostics
    };
  })()`, ctx);
  assert(partial.canSave, 'partial report should be saveable');
  assert(partial.actionCount >= 1, 'partial report should extract improvement candidate');
  assert(partial.diagnostics && partial.diagnostics.canSaveRaw, 'partial report should allow raw save');
}

console.log('== v4.10.14 profit 3-tier display regression ==');
assert(appJs.includes('profit-forecast-breakdown'), 'profit forecast breakdown should remain');
assert(appJs.includes('profit-summary-highlight'), 'profit summary highlight should remain');
assert(appJs.includes('予定売上見込み'), 'planned revenue estimate row should remain');
assert(appJs.includes('合計利益'), 'total profit row should remain');

console.log('== v4.10.13 profit rate calculation regression ==');
{
  const ctx = createProfitSandbox();
  const result = runInContext(`(() => {
    const revenue = {
      id: 'rev-test',
      workDate: '2026-07-01',
      customerName: 'テスト様',
      service: 'エアコン通常',
      source: 'ヤマダ',
      amount: 25300,
      grossMarginRate: 60,
      status: '確定'
    };
    const row = ProfitBrain.computeRevenueRowProfit(revenue, 0);
    return { marginProfit: row.marginProfit, deduction: row.deductionAmount };
  })()`, ctx);
  assert(result.marginProfit === 15180, `margin profit should be 15180, got ${result.marginProfit}`);
  assert(result.deduction === 10120, `deduction should be 10120, got ${result.deduction}`);
}

console.log('== v4.10.12 duplicate guard regression ==');
assert(storageJs.includes('findActionCandidateByDedupe'), 'duplicate guard helper should remain');

assert(statusMd.includes('v4.10.20'), 'status.md should document v4.10.20');
assert(handoffMd.includes('v4.10.20'), 'handoff.md should document v4.10.20');
assert(decisionLog.includes('v4.10.20'), 'decision-log.md should record v4.10.20');

console.log('All v4.10.20 marketing check unified entry checks passed.');
