/**
 * Budil v4.12.19 集客KPI 12/15 実用化 verify
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (file) => readFileSync(join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

const html = load('index.html');
const app = load('js/app.js');
const css = load('css/style.css');

for (const file of ['js/app.js', 'js/analytics-brain.js']) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
}

assert(html.includes('v4.12.19'), 'index.html shows v4.12.19');
assert(html.includes('js/app.js?v=4.12.19'), 'app.js cache buster is v4.12.19');
assert(html.includes('css/style.css?v=4.12.19'), 'style.css cache buster is v4.12.19');
assert(app.includes('buildMarketingSnapshotMetrics'), 'metrics builder exists');
assert(app.includes('metricStatus'), 'metricStatus is persisted');
assert(app.includes('KPI取得数'), 'KPI取得数 label exists');
assert(app.includes('保存データ行数'), '保存データ行数 label exists');
assert(app.includes('自然検索流入セッション'), 'organic search label is explicit');
assert(app.includes('予約フォームクリック'), 'form click label is 予約フォームクリック');
assert(app.includes('GBP取得機能が未接続'), 'GBP not_connected reason exists');
assert(app.includes("'not_connected'"), 'not_connected status is used');
assert(app.includes('searchAvgPosition'), 'SC average position is mapped');
assert(app.includes('SC平均掲載順位'), 'SC average position is displayed');
assert(app.includes('periodDetails'), 'period details are stored');
assert(app.includes('organicSearchSessions'), 'organicSearchSessions is consumed');
assert(!app.includes('inquiryClicks: null'), 'fixed inquiryClicks:null is removed');
assert(!app.includes('全面完成'), 'does not claim full completion');
assert(!app.includes('完全合格'), 'does not claim full pass');
assert(css.includes('.is-not-connected'), 'not_connected readable style exists');
assert(css.includes('.analytics-kpi-row-supplement'), 'SC supplement style exists');

const extractFn = (name) => {
  const start = app.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`missing ${name}`);
  let depth = 0;
  let started = false;
  for (let i = start; i < app.length; i += 1) {
    const ch = app[i];
    if (ch === '{') {
      depth += 1;
      started = true;
    } else if (ch === '}') {
      depth -= 1;
      if (started && depth === 0) return app.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated ${name}`);
};

const context = createContext({
  MARKETING_KPI_METRIC_KEYS: [
    'accessCount', 'users', 'newUsers', 'sessions', 'searchTraffic',
    'lineClicks', 'phoneTaps', 'formClicks', 'inquiryClicks',
    'searchImpressions', 'searchClicks', 'searchCtr',
    'gbpViews', 'gbpClicks', 'gbpPhone'
  ],
  esc: (value) => String(value)
});
runInContext(`
${extractFn('mapMarketingEventCategoryMetric')}
${extractFn('buildMarketingSnapshotMetrics')}
${extractFn('countOkMarketingKpis')}
${extractFn('resolveKpiMetricStatus')}
${extractFn('kpiMetricValue')}
globalThis.api = {
  mapMarketingEventCategoryMetric,
  buildMarketingSnapshotMetrics,
  countOkMarketingKpis,
  resolveKpiMetricStatus,
  kpiMetricValue
};
`, context);
const api = context.api;

const success = api.buildMarketingSnapshotMetrics({
  ga4: {
    status: 'success',
    totals: {
      screenPageViews: 6,
      activeUsers: 5,
      newUsers: 5,
      sessions: 7,
      organicSearchSessions: 2
    },
    records: [{ views: 2, activeUsers: 2 }],
    eventDetails: {
      categories: {
        line: { value: 0, status: 'success' },
        phone: { value: 1, status: 'success' },
        reservation: { value: 2, status: 'success' },
        cta: { value: 9, status: 'success' }
      }
    },
    errors: []
  },
  searchConsole: {
    status: 'success',
    period: '直近24時間',
    totals: { impressions: 10, clicks: 1, ctr: 0.1, position: 12.3 }
  },
  googleAds: { status: 'success', records: [] }
});

assert(success.metrics.newUsers === 5, '1. newUsers saved');
assert(success.metrics.sessions === 7, '2. sessions saved');
assert(success.metrics.searchTraffic === 2, '3. Organic Search sessions saved');
assert(success.metrics.lineClicks === 0, '4. LINE clicks mapped (0 ok)');
assert(success.metrics.phoneTaps === 1, '5. phone taps mapped');
assert(success.metrics.formClicks === 2, '6. reservation/form clicks mapped');
assert(success.metrics.inquiryClicks === 3, '7. inquiry total = line+phone+form');
assert(success.metrics.inquiryClicks !== 12, '8. generic CTA is not double-counted');
assert(api.kpiMetricValue(0, '', 'ok') === '0', '9. successful zero renders as 0');
assert(success.metricStatus.gbpViews === 'not_connected', '11. GBP views not_connected');
assert(success.metricStatus.gbpClicks === 'not_connected', '11b. GBP clicks not_connected');
assert(success.metricStatus.gbpPhone === 'not_connected', '11c. GBP phone not_connected');
assert(success.metrics.searchAvgPosition === 12.3, '14. SC position saved as supplement');
assert(api.countOkMarketingKpis({
  metrics: success.metrics,
  metricStatus: success.metricStatus
}) === 12, 'KPI ok count is 12/15');

const failedEvents = api.buildMarketingSnapshotMetrics({
  ga4: {
    status: 'partial',
    totals: { newUsers: 1, sessions: 1, organicSearchSessions: 0, screenPageViews: 1, activeUsers: 1 },
    records: [{ views: 1, activeUsers: 1 }],
    eventDetails: {
      categories: {
        line: { value: null, status: 'error', reason: 'GA4イベント内訳の取得失敗' },
        phone: { value: 0, status: 'success' },
        reservation: { value: 0, status: 'success' }
      }
    },
    errors: ['GA4イベント内訳の取得失敗']
  },
  searchConsole: { status: 'success', totals: { impressions: 1, clicks: 0, ctr: 0, position: 8 } },
  googleAds: { status: 'success', records: [] }
});
assert(failedEvents.metricStatus.lineClicks === 'error', '10. collector failure is error');
assert(api.kpiMetricValue(null, '', 'error') === '取得失敗', '10b. error renders 取得失敗');
assert(failedEvents.metrics.lineClicks !== 0, '10c. failure is not coerced to 0');

const legacy = {
  metrics: {
    accessCount: 10,
    users: 4,
    newUsers: null,
    sessions: null,
    searchTraffic: null,
    lineClicks: null,
    phoneTaps: null,
    formClicks: null,
    inquiryClicks: null,
    searchImpressions: 3,
    searchClicks: 1,
    searchCtr: 0.3,
    gbpViews: null,
    gbpClicks: null,
    gbpPhone: null
  }
};
assert(api.resolveKpiMetricStatus('accessCount', legacy.metrics.accessCount, null) === 'ok', '12. legacy numeric is ok');
assert(api.resolveKpiMetricStatus('newUsers', legacy.metrics.newUsers, null) === 'unknown', '12b. legacy null stays unknown');
assert(api.kpiMetricValue(legacy.metrics.newUsers, '', 'unknown') === '未確認', '12c. unknown renders 未確認');
assert(api.kpiMetricValue(null, '', 'not_connected') === '未接続', '11d. not_connected renders 未接続');

assert(app.includes('totalRecords'), '13. saved row count still tracked separately');
assert(app.includes('kpiOkCount'), '13b. KPI ok count tracked separately');
assert(app.includes('GA4ページ期間'), '15. GA4 page period label exists');
assert(app.includes('GA4イベント期間'), '15b. GA4 event period label exists');
assert(app.includes('upsertMarketingSnapshot'), '16. one-button upsert retained');
assert(app.includes('upsertMarketingGa4Records'), '16b. GA4 upsert retained');
assert(app.includes('marketingSyncInFlight'), '16c. repeat-click guard retained');

console.log('\nAll v4.12.19 marketing KPI 12/15 checks passed.');
