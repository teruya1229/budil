import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
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
const bridgeSource = load('js/ad-bridge.js');
const analytics = load('js/analytics-brain.js');
const css = load('css/style.css');

for (const file of ['js/app.js', 'js/ad-bridge.js', 'js/analytics-brain.js']) {
  await import('node:child_process').then(({ execFileSync }) =>
    execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' })
  );
}

assert(html.includes('id="btn-marketing-auto-sync"'), 'one-button sync control exists');
assert(html.includes('集客データを取得して保存'), 'main button label is exact');
assert(html.includes('id="marketing-manual-tools"'), 'manual fallback details exists');
assert(app.includes("MARKETING_LOCAL_API_BASE = 'http://127.0.0.1:43822'"), 'loopback API is fixed');
assert(app.includes('MARKETING_LOCAL_API_TIMEOUT_MS = 90000'), '90 second timeout exists');
assert(app.includes('marketingSyncInFlight'), 'repeat click guard exists');
assert(app.includes('upsertMarketingAdRecords'), 'ad upsert exists');
assert(app.includes('upsertMarketingGa4Records'), 'GA4 upsert exists');
assert(app.includes('upsertMarketingSnapshot'), 'Search Console snapshot upsert exists');
assert(app.includes('formatMarketingEventCategory'), 'GA4 event state formatter exists');
assert(app.includes('searchTermPeriod'), 'Google Ads search-term period is rendered');
assert(app.includes('自動起動:'), 'API auto-start state is rendered');
assert(app.includes('データ不足のため判定保留'), 'insufficient-data decision exists');
assert(!app.includes('localStorage.clear'), 'localStorage.clear is not introduced');
assert(analytics.includes("item.importSource === 'browser-bantou'"), 'automated missing values remain null');
assert(css.includes('.ad-performance-preview-card'), 'readable ad preview styling exists');
assert(css.includes('@media (max-width: 600px)'), 'mobile layout exists');
assert(css.includes('opacity: 1 !important'), 'preview disabled-looking opacity is removed');

const context = createContext({});
runInContext(`${bridgeSource}; globalThis.__bridge = AdBridge;`, context);
const bridge = context.__bridge;
assert(bridge.formatMetric(0, 'int') === '0', 'real zero renders as 0');
assert(bridge.formatMetric(null, 'int') === '未取得', 'missing metric renders as 未取得');
const normalized = bridge.normalizeForStore({
  source: 'browser-bantou',
  recordType: 'daily-ad-performance',
  recordId: 'test',
  date: '2026-07-24',
  campaignKey: 'campaign',
  campaignName: 'campaign',
  cost: 0,
  impressions: 0,
  clicks: 0,
  inquiries: null
}, 'browser-bantou');
assert(normalized.cost === 0, 'zero survives normalization');
assert(normalized.inquiries === null, 'missing value survives normalization');
const searchTermNormalized = bridge.normalizeForStore({
  source: 'browser-bantou',
  recordType: 'daily-ad-performance',
  recordId: 'search-term-test',
  date: '2026-07-24',
  campaignKey: 'campaign',
  campaignName: 'campaign',
  cost: 57,
  impressions: 1,
  clicks: 1,
  searchTermPeriod: '今日',
  searchTerms: [{
    term: 'エアコン 分解 洗浄',
    matchedKeyword: 'エアコン 分解洗浄',
    clicks: 1,
    cost: 57
  }]
}, 'browser-bantou');
assert(searchTermNormalized.searchTerms[0].term === 'エアコン 分解 洗浄', 'search-term object survives normalization');
assert(searchTermNormalized.searchTerms[0].clicks === 1, 'search-term zero/value semantics survive normalization');
assert(bridge.safeDiv(0, 57) === 0, 'real zero survives ratio calculation');
assert(bridge.safeDiv(null, 57) === null, 'missing numerator stays missing in ratio calculation');

console.log('\nAll v4.12.17 marketing one-button checks passed.');
