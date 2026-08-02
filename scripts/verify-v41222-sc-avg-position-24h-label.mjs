/**
 * Budil v4.12.22 hotfix: SC平均掲載順位ラベルに直近24時間を明記
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (file) => readFileSync(join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

execFileSync(process.execPath, ['--check', join(root, 'js/app.js')], { stdio: 'inherit' });

const app = load('js/app.js');
const label = 'SC平均掲載順位（直近24時間・補足）';

const kpiStart = app.indexOf('function renderKpiMetricRows');
const kpiEnd = app.indexOf('function renderKpiTopPages');
assert(kpiStart >= 0 && kpiEnd > kpiStart, 'renderKpiMetricRows block found');
const kpiSlice = app.slice(kpiStart, kpiEnd);
assert(kpiSlice.includes(label), 'KPI補足行 uses 直近24時間 label');
assert(!kpiSlice.includes('<span>SC平均掲載順位（補足）</span>'), 'old KPI補足 label removed');

const autoStart = app.indexOf('function renderMarketingOperationalSummary');
const autoEnd = app.indexOf('function renderMarketingSyncStatus');
assert(autoStart >= 0 && autoEnd > autoStart, 'renderMarketingOperationalSummary block found');
const autoSlice = app.slice(autoStart, autoEnd);
assert(autoSlice.includes('marketing-auto-metric-grid'), 'marketing-auto-metric-grid remains');
assert(autoSlice.includes(label), '集客サマリー uses 直近24時間 label');
assert(!autoSlice.includes('<span>SC平均掲載順位</span>'), 'old summary label without 直近24時間 removed');

assert((app.match(/SC平均掲載順位（直近24時間・補足）/g) || []).length === 2, 'new label appears exactly twice');
assert(autoSlice.includes('対象期間：'), 'Search Console detail period label preserved');
assert(autoSlice.includes('平均掲載順位（補足）：'), 'Search Console detail position label unchanged');
assert(autoSlice.includes('表示回数：'), 'Search Console detail impressions preserved');
assert(autoSlice.includes('クリック数：'), 'Search Console detail clicks preserved');

const assignSlice = app.slice(
  app.indexOf('metrics.searchAvgPosition'),
  app.indexOf('metrics.searchAvgPosition') + 220
);
assert(assignSlice.includes('metrics.searchAvgPosition = Number(sc.totals.position)'), 'searchAvgPosition assign unchanged');
assert(assignSlice.includes("metricStatus.searchAvgPosition = 'ok'"), 'searchAvgPosition status assign unchanged');

assert(!app.includes('localStorage.clear'), 'localStorage.clear not introduced');

console.log('OK: v4.12.22 SC avg position 24h label hotfix');
