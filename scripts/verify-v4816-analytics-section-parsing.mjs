/**
 * Budil v4.8.18 analytics section KPI parsing verification.
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
const analyticsBrainJs = load('js/analytics-brain.js');

console.log('== v4.8.18 analytics section parsing ==');

assert(indexHtml.includes('v4.8.18'), 'header version should be v4.8.18');
assert(indexHtml.includes('js/app.js?v=4.8.18'), 'app.js cache buster should be v4.8.18');
assert(analyticsBrainJs.includes('applySectionMetrics'), 'section metric parser should exist');
assert(analyticsBrainJs.includes('parseLpTopAccessSection'), 'LP top parser should exist');

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(`${analyticsBrainJs}\nthis.AnalyticsBrain = AnalyticsBrain;`, sandbox);
const AnalyticsBrain = sandbox.AnalyticsBrain;

const sample = `対象期間：2026-06-01〜2026-06-30

GA4
アクセス数：320
ユーザー数：210
新規ユーザー：180
セッション数：260
検索流入：120
自然検索：110

LP別アクセス上位
1. 完全分解LP：140
2. 家庭向け南部LP：90
3. 業務用LP：35

問い合わせ導線
LINEクリック：12
電話タップ：6
フォームクリック：3

Search Console
表示回数：2400
クリック数：96
検索CTR：4.0%

Googleビジネスプロフィール
表示：1800
クリック：42
電話：8

気づいた異常：
完全分解LPは見られているが、問い合わせ導線クリックが少ない可能性があります。

改善候補：
LPのCTA確認、Google口コミ依頼、Googleビジネス投稿。`;

const parsed = AnalyticsBrain.parseBrowserBantouReport(sample);
parsed.rawText = sample;
const preview = AnalyticsBrain.buildImportPreview(parsed, []);
const snap = preview.snapshot;
const m = snap.metrics;

assert(snap, 'snapshot should be created');
assert(m.accessCount === 320, `access count should be 320, got ${m.accessCount}`);
assert(m.users === 210, `users should be 210, got ${m.users}`);
assert(m.newUsers === 180, `new users should be 180, got ${m.newUsers}`);
assert(m.sessions === 260, `sessions should be 260, got ${m.sessions}`);
assert(m.searchTraffic === 120, `search traffic should be 120, got ${m.searchTraffic}`);
assert(m.lineClicks === 12, `line clicks should be 12, got ${m.lineClicks}`);
assert(m.phoneTaps === 6, `phone taps should be 6, got ${m.phoneTaps}`);
assert(m.formClicks === 3, `form clicks should be 3, got ${m.formClicks}`);
assert(m.inquiryClicks === 21, `inquiry clicks should be 21, got ${m.inquiryClicks}`);
assert(m.searchImpressions === 2400, `SC impressions should be 2400, got ${m.searchImpressions}`);
assert(m.searchClicks === 96, `SC clicks should be 96, got ${m.searchClicks}`);
assert(m.searchCtr === 4, `SC CTR should be 4, got ${m.searchCtr}`);
assert(m.gbpViews === 1800, `GBP views should be 1800, got ${m.gbpViews}`);
assert(m.gbpClicks === 42, `GBP clicks should be 42, got ${m.gbpClicks}`);
assert(m.gbpPhone === 8, `GBP phone should be 8, got ${m.gbpPhone}`);
assert(snap.searchConsole.impressions === 2400, 'searchConsole.impressions should be 2400');
assert(snap.searchConsole.clicks === 96, 'searchConsole.clicks should be 96');
assert(snap.searchConsole.ctr === 4, 'searchConsole.ctr should be 4');
assert(snap.gbp.views === 1800, 'gbp.views should be 1800');
assert(snap.gbp.clicks === 42, 'gbp.clicks should be 42');
assert(snap.gbp.phone === 8, 'gbp.phone should be 8');
assert(snap.pages.length === 3, `LP top pages should be 3, got ${snap.pages.length}`);
assert(snap.pages[0].pageName === '完全分解LP', `pages[0].name should be 完全分解LP, got ${snap.pages[0].pageName}`);
assert(snap.pages[0].views === 140, `pages[0].views should be 140, got ${snap.pages[0].views}`);
assert(snap.pages[1].pageName === '家庭向け南部LP', `pages[1].name should be 家庭向け南部LP`);
assert(snap.pages[1].views === 90, `pages[1].views should be 90`);
assert(snap.pages[2].pageName === '業務用LP', `pages[2].name should be 業務用LP`);
assert(snap.pages[2].views === 35, `pages[2].views should be 35`);

const blankSample = `GA4
アクセス数：100

Search Console
表示回数：

Googleビジネスプロフィール
表示：`;
const blankParsed = AnalyticsBrain.parseBrowserBantouReport(blankSample);
blankParsed.rawText = blankSample;
const blankPreview = AnalyticsBrain.buildImportPreview(blankParsed, []);
const blankM = blankPreview.snapshot.metrics;
assert(blankM.searchImpressions === null, 'blank SC impressions should stay null');
assert(blankM.gbpViews === null, 'blank GBP views should stay null');

console.log('All v4.8.18 analytics section parsing checks passed.');
