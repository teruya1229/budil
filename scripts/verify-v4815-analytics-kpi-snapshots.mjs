/**
 * Budil v4.8.19 analytics KPI snapshot verification.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import vm from 'node:vm';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = path => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

for (const file of ['storage.js', 'analytics-brain.js', 'external-check-brain.js', 'action-brain.js', 'app.js']) {
  execSync(`node --check "${join(root, 'js', file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const storageJs = load('js/storage.js');
const analyticsBrainJs = load('js/analytics-brain.js');
const dataBackupJs = load('js/data-backup.js');
const css = load('css/style.css');

console.log('== v4.8.19 analytics KPI snapshots ==');

assert(indexHtml.includes('AI経営脳みそ v4.8.19'), 'header version should be v4.8.19');
assert(indexHtml.includes('Budil v4.8.19'), 'sidebar version should be v4.8.19');
assert(indexHtml.includes('js/app.js?v=4.8.19'), 'app.js cache buster should be v4.8.19');
assert(indexHtml.includes('id="browser-bantou-preview-kpi"'), 'KPI import preview container should exist');
assert(indexHtml.includes('id="analytics-kpi-snapshot"'), 'KPI snapshot card container should exist');
assert(storageJs.includes("ANALYTICS_SNAPSHOTS: 'budil_analytics_snapshots'"), 'analytics snapshot key should exist');
assert(storageJs.includes('getAnalyticsSnapshots()'), 'snapshot getter should exist');
assert(storageJs.includes('addAnalyticsSnapshot(item)'), 'snapshot add method should exist');
assert(dataBackupJs.includes("'budil_analytics_snapshots'"), 'analytics snapshots should be included in backup keys');
assert(appJs.includes('Storage.addAnalyticsSnapshot'), 'import save should persist analytics snapshots');
assert(appJs.includes('Storage.findAnalyticsSnapshotDuplicate'), 'duplicate warning should use rawTextHash');
assert(appJs.includes('未確認の項目は0ではありません'), 'UI should clarify unconfirmed values are not zero');
assert(appJs.includes('getRevenueContext()'), 'revenue target read-only context should be referenced');
const kpiSection = appJs.slice(appJs.indexOf('function kpiMetricValue'), appJs.indexOf('function renderAnalyticsSummary'));
assert(!kpiSection.includes('Storage.addRevenueRecord') && !kpiSection.includes('Storage.updateRevenueRecord'), 'analytics KPI UI should not write revenue records');
assert(!appJs.includes('localStorage.' + 'clear()'), 'app should not clear localStorage');
assert(css.includes('.analytics-kpi-card-grid'), 'KPI card CSS should exist');
assert(css.includes('grid-template-columns: minmax(0, 1fr)'), 'KPI layout should have mobile-safe single column');

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(`${analyticsBrainJs}\nthis.AnalyticsBrain = AnalyticsBrain;`, sandbox);
const AnalyticsBrain = sandbox.AnalyticsBrain;

const sample = `【Budilアナリティクス取り込み】
日付：2026-06-28
対象期間：直近28日
アクセス数：120
ユーザー数：85
新規ユーザー：40
セッション数：99
検索流入：43
LINEクリック：6
電話タップ：3
フォームクリック：
Search Console 表示回数：1000
Search Console クリック数：55
検索CTR：5.5%
Googleビジネス表示：300
Googleビジネスクリック：12
Googleビジネス電話：2
気づいた異常：なし
全体コメント：検索流入はあるがCTA確認が必要
広告判断：広告よりLP改善を優先

【ページ1】
ページ名：家庭向けエアコンLP
URL：https://example.com/lp
表示回数：80
LINEクリック：4
電話クリック：2

【今日やること候補】
1. LPのCTAを確認する`;

const parsed = AnalyticsBrain.parseBrowserBantouReport(sample);
parsed.rawText = sample;
const preview = AnalyticsBrain.buildImportPreview(parsed, []);
assert(preview.snapshot, 'snapshot preview should be created');
assert(preview.snapshot.metrics.accessCount === 120, 'access count should be extracted');
assert(preview.snapshot.metrics.users === 85, 'users should be extracted');
assert(preview.snapshot.metrics.formClicks === null, 'blank metric should stay unconfirmed/null');
assert(preview.snapshot.metrics.searchCtr === 5.5, 'CTR should be extracted as number');
assert(preview.snapshot.gbp.phone === 2, 'GBP phone should be extracted');
assert(preview.snapshot.rawTextHash, 'rawTextHash should be generated');
assert(preview.snapshot.insights.length > 0, 'insights should be generated');
assert(preview.snapshot.actionCandidates.length > 0, 'action candidates should be generated');

console.log('All v4.8.19 analytics KPI snapshot checks passed.');
