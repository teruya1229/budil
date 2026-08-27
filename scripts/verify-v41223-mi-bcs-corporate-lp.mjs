/**
 * Budil v4.12.25 - 「集客チェック」MI.BCS法人LP独立表示 verify
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (file) => readFileSync(join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

const html = load('index.html');
const app = load('js/app.js');
const brainSrc = load('js/analytics-brain.js');
const css = load('css/style.css');
const storage = load('js/storage.js');
const dataBackup = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

for (const file of ['js/app.js', 'js/analytics-brain.js']) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
}

// -- version / cache buster ------------------------------------------------
assert(html.includes('v4.13.11'), 'index.html shows v4.12.26');
assert(html.includes('js/app.js?v=4.13.11'), 'app.js cache buster is v4.13.11');
assert(html.includes('css/style.css?v=4.13.11'), 'style.css cache buster is v4.13.11');
assert(html.includes('js/analytics-brain.js?v=4.13.11'), 'analytics-brain.js cache buster is v4.13.11');
assert(storage.includes("BUDIL_VERSION: 'v4.13.11'"), 'storage version is v4.13.11');
assert(dataBackup.includes("APP_VERSION: 'v4.13.11'"), 'data-backup version is v4.13.11');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.11'"), 'verify-current pins v4.12.26');
assert(statusMd.includes('v4.12.25'), 'status.md documents v4.12.25');
assert(handoffMd.includes('v4.12.25'), 'handoff.md documents v4.12.25');
assert(decisionLog.includes('v4.12.25'), 'decision-log.md records v4.12.25');

// -- shared identifier: single choke point ---------------------------------
assert(brainSrc.includes('isCorporateLpIdentifier'), 'isCorporateLpIdentifier exists in AnalyticsBrain');
const identifierMatches = brainSrc.match(/isCorporateLpIdentifier\(record\)\s*\{/g) || [];
assert(identifierMatches.length === 1, 'isCorporateLpIdentifier is defined exactly once (single choke point)');
assert(brainSrc.includes("CORPORATE_LP_PAGE_TYPE: 'mi_bcs_lp'"), 'corporate page_type constant is mi_bcs_lp');
assert(app.includes('buildCorporateLpMetrics'), 'buildCorporateLpMetrics exists');
assert(app.includes('renderCorporateLpCard'), 'renderCorporateLpCard exists');
assert(app.includes('MI.BCS法人LP'), 'MI.BCS法人LP label exists');
assert(css.includes('.corporate-lp-card'), 'corporate-lp-card CSS exists');
assert(css.includes('.corporate-lp-metric-grid'), 'corporate-lp-metric-grid CSS exists');

// -- household exclusion wiring (source-level regression proof) -----------
assert(
  /filterActive\(records\)\s*\{[^}]*isCorporateLpIdentifier/.test(brainSrc),
  'filterActive excludes corporate LP records'
);
assert(
  /function renderKpiTopPages\(snapshot\) \{[^]*?isCorporateLpIdentifier[^]*?aggregatePageRecordsByCanonicalPath/.test(app),
  'renderKpiTopPages excludes corporate LP before aggregation'
);
assert(
  /function buildMarketingInsights\(serviceResults, previousSnapshot\) \{[^]*?isCorporateLpIdentifier/.test(app),
  'buildMarketingInsights excludes corporate LP from household topPage/weakCta'
);
assert(
  /const ga4Records = AnalyticsBrain\.aggregatePageRecordsByCanonicalPath\(\s*householdGa4Records/.test(app),
  'renderMarketingOperationalSummary GA4ページ需要 excludes corporate LP'
);

// -- extract pure functions for behavioral tests ---------------------------
const extractFn = (source, name) => {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`missing ${name}`);
  let depth = 0;
  let started = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') {
      depth += 1;
      started = true;
    } else if (ch === '}') {
      depth -= 1;
      if (started && depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated ${name}`);
};
const extractConst = (source, name) => {
  const re = new RegExp(`const ${name} = [^;]*;`, 's');
  const match = source.match(re);
  if (!match) throw new Error(`missing const ${name}`);
  return match[0];
};

const context = createContext({ console, URL, String, Number, Object, Array, JSON, Math, Date });
runInContext(`${brainSrc}\nthis.AnalyticsBrain = AnalyticsBrain;`, context);
const Brain = context.AnalyticsBrain;
assert(Brain && typeof Brain.isCorporateLpIdentifier === 'function', 'AnalyticsBrain loaded in vm');

// -- 3. 法人LP正式識別条件 ---------------------------------------------------
assert(Brain.isCorporateLpIdentifier({ pageType: 'mi_bcs_lp' }) === true, 'page_type=mi_bcs_lp is corporate');
assert(Brain.isCorporateLpIdentifier({ page_type: 'mi_bcs_lp' }) === true, 'page_type(snake) is corporate');
assert(Brain.isCorporateLpIdentifier({ page_slug: '/mi-bcs/' }) === true, 'page_slug=/mi-bcs/ is corporate');
assert(
  Brain.isCorporateLpIdentifier({ url: 'https://teruya1229.github.io/mi-bcs/?v=1' }) === true,
  'full URL with query is corporate'
);
assert(
  Brain.isCorporateLpIdentifier({ page: 'https://teruya1229.github.io/mi-bcs/#contact' }) === true,
  'Search Console page field (full URL, hash) is corporate'
);
assert(Brain.isCorporateLpIdentifier({ pagePath: '/mi-bcs' }) === true, 'no trailing slash is absorbed');
assert(Brain.isCorporateLpIdentifier({ pagePath: '/mi-bcs/' }) === true, 'trailing slash matches');
assert(Brain.isCorporateLpIdentifier({ pagePath: '/mi-bcs-other/' }) === false, '/mi-bcs-other/ is NOT corporate');
assert(Brain.isCorporateLpIdentifier({ pagePath: '/cursor-test/' }) === false, '/cursor-test/ is NOT corporate');
assert(
  Brain.isCorporateLpIdentifier({ pagePath: '/complete-disassembly/' }) === false,
  '/complete-disassembly/ is NOT corporate'
);
assert(
  Brain.isCorporateLpIdentifier({ pagePath: '/cursor-test/central.html' }) === false,
  '/cursor-test/central.html is NOT corporate'
);
assert(
  Brain.isCorporateLpIdentifier({ pagePath: '/cursor-test/urasoe.html' }) === false,
  '/cursor-test/urasoe.html is NOT corporate'
);
assert(Brain.isCorporateLpIdentifier({}) === false, 'empty record is NOT corporate');
assert(Brain.isCorporateLpIdentifier(null) === false, 'null record is NOT corporate (no throw)');

// -- filterActive excludes corporate from household aggregation -----------
// Storage.getAnalyticsRecords() 経由の実レコードは normalizeRecord で pagePath が落ち、
// url フィールドだけが残る（upsertMarketingGa4Records は常に url を設定する）。
// そのためテストfixtureもurlで法人LPを識別できる形にする。
const householdAndCorp = [
  { id: 'h1', date: '2026-08-02', url: '/cursor-test/', pageName: '沖縄トップ', views: 20, bounceRate: 10, status: 'open' },
  { id: 'c1', date: '2026-08-02', url: '/mi-bcs/', pageName: 'MI.BCS法人LP', views: 1, bounceRate: 0, status: 'open' }
];
const active = Brain.filterActive(householdAndCorp);
assert(active.length === 1, 'filterActive drops the corporate record');
assert(active[0].id === 'h1', 'filterActive keeps the household record');

const ctx = Brain.buildContext(householdAndCorp, '2026-08-02');
assert(!ctx.topDemand.some(r => r.id === 'c1'), 'topDemand excludes corporate LP');
assert(!ctx.highBounce.some(r => r.id === 'c1'), 'highBounce excludes corporate LP');
assert(ctx.records.every(r => r.id !== 'c1'), 'buildContext records exclude corporate LP');

// -- buildMarketingInsights excludes corporate LP --------------------------
runInContext(`
${extractFn(app, 'buildMarketingInsights')}
globalThis.api = globalThis.api || {};
globalThis.api.buildMarketingInsights = buildMarketingInsights;
`, context);
const insightsResult = context.api.buildMarketingInsights({
  ga4: {
    records: [
      { pagePath: '/mi-bcs/', views: 999, ctaClicks: null, lineClicks: null, phoneClicks: null },
      { pagePath: '/cursor-test/', views: 5, ctaClicks: 1, lineClicks: 0, phoneClicks: 0 }
    ]
  },
  searchConsole: { queries: [] }
}, null);
assert(insightsResult.topPage && insightsResult.topPage.pagePath === '/cursor-test/', 'topPage never becomes corporate LP');
assert(
  !insightsResult.insights.some(text => text.includes('/mi-bcs/')),
  'insights text does not reference corporate LP'
);

// -- renderKpiTopPages excludes corporate LP -------------------------------
const kpiContext = createContext({
  console, String, Number, Array, Object, JSON,
  AnalyticsBrain: Brain,
  esc: (v) => String(v),
  kpiMetricValue: (v) => (v === null || v === undefined ? '未確認' : String(v))
});
runInContext(`
${extractFn(app, 'renderKpiTopPages')}
globalThis.api = { renderKpiTopPages };
`, kpiContext);
const topPagesHtml = kpiContext.api.renderKpiTopPages({
  pages: [
    { pageName: 'MI.BCS法人LP', url: '/mi-bcs/', views: 999 },
    { pageName: '沖縄トップ', url: '/cursor-test/', views: 20 }
  ]
});
assert(!topPagesHtml.includes('mi-bcs'), 'renderKpiTopPages HTML excludes /mi-bcs/');
assert(topPagesHtml.includes('cursor-test'), 'renderKpiTopPages HTML keeps household page');

// -- buildCorporateLpMetrics / corporateLpMetricValue ----------------------
const metricsContext = createContext({
  console, String, Number, Object, Array, JSON, Math, Date,
  AnalyticsBrain: Brain,
  esc: (v) => String(v)
});
runInContext(`
${extractConst(app, 'CORPORATE_LP_GA4_MEASUREMENT_START_DATE')}
${extractConst(app, 'SEARCH_CONSOLE_PAGE_LIST_CAP')}
${extractFn(app, 'buildCorporateLpMetrics')}
${extractFn(app, 'kpiMetricValue')}
${extractFn(app, 'corporateLpMetricValue')}
globalThis.api = { buildCorporateLpMetrics, corporateLpMetricValue, kpiMetricValue };
`, metricsContext);
const api2 = metricsContext.api;

// (a) real-shaped fixture: GA4 has /mi-bcs/ page row, SC has a matching page row
const withData = api2.buildCorporateLpMetrics({
  ga4: {
    status: 'success',
    period: '2026-08-02',
    periodLabel: '今日',
    fetchedAt: '2026-08-02T21:48:11+09:00',
    records: [
      { pagePath: '/cursor-test/', views: 14 },
      { pagePath: '/mi-bcs/', views: 1, activeUsers: 2 }
    ]
  },
  searchConsole: {
    status: 'success',
    period: '直近24時間',
    fetchedAt: '2026-08-02T21:47:13+09:00',
    pages: [
      { page: 'https://teruya1229.github.io/cursor-test/', clicks: 0, impressions: 25, ctr: 0, position: 14.0 },
      { page: 'https://teruya1229.github.io/mi-bcs/', clicks: 1, impressions: 4, ctr: 25, position: 6.0 }
    ]
  }
});
assert(withData.ga4.pv.status === 'ok' && withData.ga4.pv.value === 1, 'PV: real /mi-bcs/ page view is used (1)');
assert(withData.searchConsole.status === 'ok', 'SC: matched row -> ok');
assert(withData.searchConsole.impressions === 4, 'SC: impressions summed from matched rows only');
assert(withData.searchConsole.clicks === 1, 'SC: clicks summed from matched rows only');
assert(Math.abs(withData.searchConsole.ctr - 25) < 0.001, 'SC: ctr recomputed as clicks/impressions*100');
assert(withData.searchConsole.position === 6.0, 'SC: single matched row keeps its position');
assert(withData.ga4.line.status === 'unknown', 'LINE stays 未確認 even when PV is available (no page attribution)');
assert(withData.ga4.line.value === null, 'LINE value is never fabricated');
assert(withData.ga4.phone.status === 'unknown', 'PHONE stays 未確認');
assert(withData.ga4.inquiry.status === 'unknown', 'inquiry total stays 未確認 (depends on unconfirmed LINE/phone)');
assert(withData.ga4.inquiry.value === null, 'inquiry total is never coerced to 0/fabricated');
assert(withData.ga4.mailCta === null, 'mail CTA is not displayed (cta_type not held per LP)');

// (b) GA4 success but no /mi-bcs/ row present -> データなし(0, ok), not fabricated
const noCorpRow = api2.buildCorporateLpMetrics({
  ga4: { status: 'success', period: '2026-08-02', records: [{ pagePath: '/cursor-test/', views: 5 }] },
  searchConsole: { status: 'success', period: '直近24時間', pages: [{ page: 'https://teruya1229.github.io/cursor-test/', clicks: 0, impressions: 5, ctr: 0, position: 3 }] }
});
assert(noCorpRow.ga4.pv.status === 'ok' && noCorpRow.ga4.pv.value === 0, 'PV: success + no match under full page list = データなし(0)');
assert(noCorpRow.searchConsole.status === 'ok' && noCorpRow.searchConsole.impressions === 0, 'SC: success + no match under cap = データなし(0)');
assert(noCorpRow.searchConsole.ctr === null, 'SC: no matched row -> ctr has no basis to average, stays null');
assert(noCorpRow.searchConsole.position === null, 'SC: no matched row -> position has no basis to average, stays null');
assert(
  api2.corporateLpMetricValue(noCorpRow.searchConsole.ctr, '%', noCorpRow.searchConsole.status) === 'データなし',
  'CTR display for no-match SC row is データなし, not 0% (数値がない状態を0と表示しない)'
);
assert(
  api2.corporateLpMetricValue(noCorpRow.searchConsole.position, '', noCorpRow.searchConsole.status) === 'データなし',
  '平均掲載順位 display for no-match SC row is データなし, not 0'
);
assert(
  api2.corporateLpMetricValue(noCorpRow.searchConsole.impressions, '', noCorpRow.searchConsole.status) === '0',
  'impressions display for no-match SC row stays a real 0 (success + 0 = 0)'
);

// (c) GA4 collector error -> 取得失敗, not silently 0
const ga4Error = api2.buildCorporateLpMetrics({
  ga4: { status: 'error', records: [] },
  searchConsole: { status: 'success', period: '直近24時間', pages: [] }
});
assert(ga4Error.ga4.pv.status === 'error', 'GA4 error -> PV 取得失敗 (not データなし)');
assert(ga4Error.ga4.line.status === 'error', 'GA4 error -> LINE 取得失敗');

// (d) Search Console at the truncation cap with no match -> 未確認, not データなし
const scPagesAtCap = Array.from({ length: 25 }, (_, i) => ({
  page: `https://teruya1229.github.io/cursor-test/page${i}.html`,
  clicks: 0, impressions: 1, ctr: 0, position: 10
}));
const scTruncated = api2.buildCorporateLpMetrics({
  ga4: { status: 'success', period: '2026-08-02', records: [] },
  searchConsole: { status: 'success', period: '直近24時間', pages: scPagesAtCap }
});
assert(scTruncated.searchConsole.status === 'unknown', 'SC: no match at truncation cap -> 未確認 (not confirmed zero)');

// (e) old snapshot without ga4.records / sc.pages arrays -> 未確認, no throw
const legacySnapshot = api2.buildCorporateLpMetrics({
  ga4: { status: 'success' },
  searchConsole: { status: 'success' }
});
assert(legacySnapshot.ga4.pv.status === 'unknown', 'legacy snapshot (no ga4.records) -> PV 未確認 without throwing');
assert(legacySnapshot.searchConsole.status === 'unknown', 'legacy snapshot (no sc.pages) -> SC 未確認 without throwing');

// (f) period strictly before measurement start date -> 計測開始前 (only when unambiguous)
const beforeTracking = api2.buildCorporateLpMetrics({
  ga4: { status: 'success', period: '2026-08-01', records: [{ pagePath: '/mi-bcs/', views: 3 }] },
  searchConsole: { status: 'success', period: '直近24時間', pages: [] }
});
assert(beforeTracking.ga4.pv.status === 'before_tracking', 'strictly earlier date -> 計測開始前');
assert(beforeTracking.ga4.pv.value === null, '計測開始前 does not carry a fabricated value');

// (g) same-day (overlaps measurement start) -> must NOT be labeled 計測開始前
const sameDay = api2.buildCorporateLpMetrics({
  ga4: { status: 'success', period: '2026-08-02', records: [{ pagePath: '/mi-bcs/', views: 1 }] },
  searchConsole: { status: 'success', period: '直近24時間', pages: [] }
});
assert(sameDay.ga4.pv.status === 'ok', 'same-day as measurement start is not assumed 計測開始前');

// -- corporateLpMetricValue status label mapping ---------------------------
assert(api2.corporateLpMetricValue(3, '', 'ok') === '3', 'ok renders the numeric value');
assert(api2.corporateLpMetricValue(null, '', 'error') === '取得失敗', 'error renders 取得失敗');
assert(api2.corporateLpMetricValue(null, '', 'unknown') === '未確認', 'unknown renders 未確認');
assert(api2.corporateLpMetricValue(null, '', 'before_tracking') === '計測開始前', 'before_tracking renders 計測開始前');
assert(api2.corporateLpMetricValue(0, '', 'ok') === '0', 'ok with real 0 still renders 0 (success + 0 = 0)');
assert(api2.corporateLpMetricValue(null, '%', 'ok') === 'データなし', 'ok with null value (no rows to average) renders データなし, not 0');

// -- CTA double counting / generic CTA not added ---------------------------
const buildCorpFnSrc = extractFn(app, 'buildCorporateLpMetrics');
assert(!buildCorpFnSrc.includes('categories.cta'), 'generic cta category is never read for corporate LP metrics');
assert(!buildCorpFnSrc.includes('categories.line.value'), 'global LINE total is never assigned as corporate LINE');
assert(!buildCorpFnSrc.includes('categories.phone.value'), 'global phone total is never assigned as corporate phone');
assert(buildCorpFnSrc.includes('mailCta = null'), 'mail CTA is not derived/fabricated from any source');

// -- section 9: forbidden-change spot checks -------------------------------
assert(!app.includes('localStorage.clear()'), 'localStorage.clear is not introduced');
['売上登録', '一括売上登録', '登録対象を売上登録', '作業完了後', '作業後確定', '作業後売上確定'].forEach((ng) => {
  assert(!app.includes(ng), `NG term "${ng}" is not revived in app.js`);
});
assert(!/CORPORATE_LP[^\n]*localStorage\.setItem/.test(app), 'no new dedicated localStorage key for corporate LP');

console.log('\nAll v4.12.25 MI.BCS corporate LP checks passed.');
