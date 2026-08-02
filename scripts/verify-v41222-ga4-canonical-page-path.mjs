/**
 * Budil v4.12.22 hotfix: GA4 pages aggregate by canonical path
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

for (const file of ['js/analytics-brain.js', 'js/app.js']) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
}

const brainSrc = load('js/analytics-brain.js');
const appSrc = load('js/app.js');
assert(brainSrc.includes('normalizePagePath'), 'normalizePagePath exists');
assert(brainSrc.includes('resolveCanonicalPagePath'), 'resolveCanonicalPagePath exists');
assert(brainSrc.includes('aggregatePageRecordsByCanonicalPath'), 'aggregatePageRecordsByCanonicalPath exists');
assert(appSrc.includes('aggregatePageRecordsByCanonicalPath'), 'app.js uses aggregation');
assert(appSrc.includes('groupByDate: true'), 'getAnalyticsContext groups by date + path');

const context = createContext({ console, URL, String, Number, Object, Array, JSON, Math });
runInContext(`${brainSrc}\nthis.AnalyticsBrain = AnalyticsBrain;`, context);
const Brain = context.AnalyticsBrain;
assert(Brain && typeof Brain.normalizePagePath === 'function', 'AnalyticsBrain loaded in vm');

const variants = [
  '/complete-disassembly',
  '/complete-disassembly/',
  '/complete-disassembly/?v=1',
  '/complete-disassembly/?utm_source=google',
  'https://teruya1229.github.io/complete-disassembly/?v=2',
  'https://teruya1229.github.io/complete-disassembly/#section',
  '//complete-disassembly//'
];
variants.forEach((value) => {
  assert(
    Brain.normalizePagePath(value) === '/complete-disassembly/',
    `normalize ${value} -> /complete-disassembly/`
  );
});

assert(Brain.normalizePagePath(null) === '', 'null -> empty');
assert(Brain.normalizePagePath(undefined) === '', 'undefined -> empty');
assert(Brain.normalizePagePath('') === '', 'empty -> empty');
assert(Brain.normalizePagePath(123) === '/123' || Brain.normalizePagePath(123) === '', 'non-string handled without throw');
assert(Brain.normalizePagePath({ foo: 1 }) === '', 'object -> empty without throw');

const oldNew = [
  {
    id: 'old',
    date: '2026-08-02',
    pageName: '旧タイトル完全分解',
    pagePath: '/complete-disassembly/',
    url: '/complete-disassembly/',
    views: 3,
    fetchedAt: '2026-08-02T10:00:00+09:00'
  },
  {
    id: 'new',
    date: '2026-08-02',
    pageName: '新タイトル完全分解',
    pagePath: '/complete-disassembly',
    url: 'https://teruya1229.github.io/complete-disassembly/?v=1',
    views: 4,
    fetchedAt: '2026-08-02T18:00:00+09:00'
  }
];
const frozen = JSON.parse(JSON.stringify(oldNew));
const once = Brain.aggregatePageRecordsByCanonicalPath(oldNew, { groupByDate: true });
assert(once.length === 1, 'old+new titles become 1 row');
assert(once[0].canonicalPath === '/complete-disassembly/', 'canonical path is /complete-disassembly/');
assert(once[0].views === 7, 'views 3+4 = 7');
assert(once[0].displayTitle === '新タイトル完全分解', 'newer title is kept');
assert(JSON.stringify(oldNew) === JSON.stringify(frozen), 'input array is not mutated');

const twice = Brain.aggregatePageRecordsByCanonicalPath(once, { groupByDate: true });
assert(twice.length === 1 && twice[0].views === 7, 're-aggregate does not inflate views');

const separate = Brain.aggregatePageRecordsByCanonicalPath([
  { pagePath: '/cursor-test/', views: 1, date: '2026-08-02' },
  { pagePath: '/cursor-test/central.html', views: 1, date: '2026-08-02' },
  { pagePath: '/cursor-test/urasoe.html', views: 1, date: '2026-08-02' },
  { pagePath: '/cursor-test/articles/okinawa-aircon-not-cooling-causes.html', views: 1, date: '2026-08-02' }
], { groupByDate: true });
assert(separate.length === 4, 'four cursor-test pages stay separate');

const noPath = Brain.aggregatePageRecordsByCanonicalPath([
  { id: 'title-only', pageName: 'タイトルのみ', views: 2, date: '2026-08-02' }
], { groupByDate: true });
assert(noPath.length === 1, 'title-only record is kept');
assert(noPath[0].pageName === 'タイトルのみ', 'title-only display preserved');

const crossDate = Brain.aggregatePageRecordsByCanonicalPath([
  { date: '2026-08-01', pagePath: '/complete-disassembly/', views: 2, pageName: 'A' },
  { date: '2026-08-02', pagePath: '/complete-disassembly/', views: 5, pageName: 'B' }
], { groupByDate: true });
assert(crossDate.length === 2, 'different dates stay 2 rows');
assert(crossDate.map(r => r.views).sort().join(',') === '2,5', 'dates are not summed together');

const snapshotPages = [
  { pageName: '旧タイトル完全分解', url: '/complete-disassembly/', views: 3 },
  { pageName: '新タイトル完全分解', url: '/complete-disassembly/?v=1', views: 4 }
];
const kpiPages = Brain.aggregatePageRecordsByCanonicalPath(snapshotPages, { groupByDate: false });
assert(kpiPages.length === 1, 'renderKpiTopPages source aggregates to 1 row');
assert(kpiPages[0].views === 7, 'kpi top pages views = 7');
assert(
  (kpiPages[0].canonicalPath || kpiPages[0].pagePath) === '/complete-disassembly/',
  'kpi top pages label path is /complete-disassembly/'
);

console.log('OK: verify-v41222-ga4-canonical-page-path');
