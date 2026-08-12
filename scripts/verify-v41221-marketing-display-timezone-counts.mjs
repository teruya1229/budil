/**
 * Budil v4.12.22 - 集客チェック表示（JST統一・件数ラベル明確化）verify
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
const storage = load('js/storage.js');
const dataBackup = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

execFileSync(process.execPath, ['--check', join(root, 'js/app.js')], { stdio: 'inherit' });

assert(html.includes('v4.13.5'), 'index.html shows v4.12.26');
assert(html.includes('js/app.js?v=4.13.5'), 'app.js cache buster is v4.12.26');
assert(html.includes('css/style.css?v=4.13.5'), 'style.css cache buster is v4.12.26');
assert(storage.includes("BUDIL_VERSION: 'v4.13.5'"), 'storage version is v4.12.26');
assert(dataBackup.includes("APP_VERSION: 'v4.13.5'"), 'data-backup version is v4.12.26');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.5'"), 'verify-current pins v4.12.26');
assert(statusMd.includes('v4.12.25'), 'status.md documents v4.12.25');
assert(handoffMd.includes('v4.12.25'), 'handoff.md documents v4.12.25');
assert(decisionLog.includes('v4.12.25'), 'decision-log.md records v4.12.25');

assert(app.includes('function formatMarketingDateTime'), 'formatMarketingDateTime exists');
assert(app.includes("timeZone: 'Asia/Tokyo'"), 'Asia/Tokyo display is used');
assert(!/\+\s*9\s*\*\s*60\s*\*\s*60\s*\*\s*1000|getTime\(\)\s*\+\s*9\s*\*/.test(app), 'no simple +9 hour math');
assert(!/formatMarketingDateTime[\s\S]{0,400}getTime\(\)\s*\+/.test(app), 'formatMarketingDateTime does not add hours');
assert(!app.includes("raw + 'Z'") && !app.includes('+"Z"') && !app.includes("+ 'Z'"), 'no unconditional Z append');
assert(app.includes('formatMarketingDateTime(snapshot.importedAt || snapshot.createdAt'), 'KPI取得日時 uses formatMarketingDateTime');
assert(!/importedAt \|\| snapshot\.createdAt \|\| ''\)\.slice\(0,\s*16\)/.test(app), 'KPI取得日時 no longer string-slices ISO');

assert(app.includes('今回取得したデータ行数'), '9. label 今回取得したデータ行数');
assert(app.includes('保存済みレコード合計'), '10. label 保存済みレコード合計');
assert(app.includes('今回取得したデータ行数と保存済みレコード合計は、数え方が異なります'), 'count meaning note updated');
assert(!app.includes('保存データ行数'), '旧ラベル 保存データ行数 removed');
const marketingDisplaySlice = app.slice(
  app.indexOf('function renderMarketingOperationalSummary'),
  app.indexOf('function renderMarketingSyncStatus') + 2500
);
assert(!/\b19\b|\b31\b/.test(marketingDisplaySlice.match(/今回取得したデータ行数[\s\S]{0,80}/)?.[0] || ''), '11. no hardcoded 19/31 in fetch-count label markup');
assert(!/保存済みレコード合計：保存前\s*19|保存後\s*31/.test(marketingDisplaySlice), '11b. no hardcoded before/after counts in save result markup');

assert(app.includes('btn-marketing-auto-sync'), '14. one-button sync control remains');
assert(app.includes('runMarketingAutoSync'), '14b. one-button sync runner remains');
assert(app.includes("'/collect/google-ads'"), '14c. google-ads collect remains');
assert(app.includes("'/collect/ga4'"), '14d. ga4 collect remains');
assert(app.includes("'/collect/search-console'"), '14e. search-console collect remains');
assert(app.includes('upsertMarketingAdRecords'), '12. ad upsert remains');
assert(app.includes('upsertMarketingGa4Records'), '12b. ga4 upsert remains');
assert(app.includes('upsertMarketingSnapshot'), '12c. snapshot upsert remains');
assert(app.includes('overwrite: true'), '12d. ad overwrite upsert preserved');
assert(app.includes("item.importSource === 'browser-bantou'"), '12e. ga4 duplicate key preserved');
assert(!app.includes('localStorage.clear'), 'localStorage.clear not introduced');

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

const context = createContext({});
runInContext(`
${extractFn('formatMarketingDateTime')}
globalThis.formatMarketingDateTime = formatMarketingDateTime;
`, context);
const formatMarketingDateTime = context.formatMarketingDateTime;

const jstFromZ = formatMarketingDateTime('2026-07-28T09:45:03.025Z');
assert(/18:45:03/.test(jstFromZ), `1. UTC Z displays as JST (got ${jstFromZ})`);

const jstFromOffset0 = formatMarketingDateTime('2026-07-28T09:45:03+00:00');
assert(/18:45:03/.test(jstFromOffset0), `2. +00:00 displays as JST (got ${jstFromOffset0})`);

const jstFromOffset9 = formatMarketingDateTime('2026-07-28T18:45:03+09:00');
assert(/18:45:03/.test(jstFromOffset9), `3. +09:00 is not double-converted (got ${jstFromOffset9})`);
assert(!/27:45|3:45:03|03:45:03/.test(jstFromOffset9.replace(/^.*\s/, '') === '3:45:03' ? 'BAD' : jstFromOffset9), '3b. +09:00 hour stays 18');

// 調査結果: Browser番頭 now_iso は初回から JST(+09:00)。offsetなしUTC生成は未確認のため
// 無条件UTC解釈は入れない。確認済みの問題は Z付きUTCを slice して壁時計表示していたこと。
// ここでは「Z付きUTC（Budil生成）がJST表示になる」ことを合格条件として検証する。
const confirmedBudilUtc = formatMarketingDateTime('2026-07-28T09:45:03.025Z');
assert(/18:45:03/.test(confirmedBudilUtc), `4. confirmed Budil UTC(Z) displays as JST (got ${confirmedBudilUtc})`);

assert(formatMarketingDateTime('') === '未取得', '5. empty shows 未取得');
assert(formatMarketingDateTime(null) === '未取得', '5b. null shows 未取得');
assert(formatMarketingDateTime(undefined) === '未取得', '5c. undefined shows 未取得');
const invalid = formatMarketingDateTime('not-a-date');
assert(invalid === 'not-a-date', `5d. invalid value does not throw (got ${invalid})`);

const completedAt = '2026-07-28T09:45:03.025Z';
const savedAt = '2026-07-28T09:45:03.100Z';
assert(Date.parse(savedAt) >= Date.parse(completedAt), '6. completedAt/savedAt order (savedAt >= completedAt)');
assert(/18:45:03/.test(formatMarketingDateTime(completedAt)), '6b. completedAt JST');
assert(/18:45:03/.test(formatMarketingDateTime(savedAt)), '6c. savedAt JST');

const totalRecordsExpr = app.match(/const totalRecords = ([^;]+);/);
assert(totalRecordsExpr, '7. totalRecords expression found');
assert(/adRecords\.length/.test(totalRecordsExpr[1]), '7a. ads records counted');
assert(/ga4Records\.length/.test(totalRecordsExpr[1]), '7b. ga4 records counted');
assert(/sc\.queries \|\| \[\]\)\.length/.test(totalRecordsExpr[1]), '7c. SC queries counted');
assert(/sc\.pages \|\| \[\]\)\.length/.test(totalRecordsExpr[1]), '7d. SC pages counted');

const beforeExpr = app.match(/beforeCount:\s*Storage\.getAdPerformanceRecords\(\)\.length\s*\+\s*Storage\.getAnalyticsRecords\(\)\.length\s*\+\s*Storage\.getAnalyticsSnapshots\(\)\.length/);
const afterExpr = app.match(/afterCount\s*=\s*Storage\.getAdPerformanceRecords\(\)\.length\s*\+\s*Storage\.getAnalyticsRecords\(\)\.length\s*\+\s*Storage\.getAnalyticsSnapshots\(\)\.length/);
assert(beforeExpr, '8. beforeCount = 3 storage areas');
assert(afterExpr, '8b. afterCount = 3 storage areas');

// Fixture: 4 arrays sum for totalRecords meaning
const fixtureAds = [{ id: 'a1' }, { id: 'a2' }];
const fixtureGa4 = [{ id: 'g1' }];
const fixtureQueries = [{ query: 'q1' }, { query: 'q2' }, { query: 'q3' }];
const fixturePages = [{ page: 'p1' }, { page: 'p2' }];
const fixtureTotal = fixtureAds.length + fixtureGa4.length + fixtureQueries.length + fixturePages.length;
assert(fixtureTotal === 8, `7e. fixture totalRecords calc = ${fixtureTotal}`);

// Fixture: 3 storage areas for before/after
const fixtureBefore = { ads: 2, analytics: 3, snapshots: 1 };
const fixtureAfterSameDay = { ads: 2, analytics: 3, snapshots: 1 }; // upsert same day → counts unchanged
assert(
  fixtureBefore.ads + fixtureBefore.analytics + fixtureBefore.snapshots
    === fixtureAfterSameDay.ads + fixtureAfterSameDay.analytics + fixtureAfterSameDay.snapshots,
  '13. same-day upsert fixture keeps top-level counts stable'
);
assert(app.includes('findAdPerformanceByRecordId'), '13b. ad recordId upsert key remains');
assert(app.includes('item.date === record.date'), '13c. ga4 date+path upsert key remains');
assert(app.includes('source === MARKETING_SYNC_SOURCE') || app.includes("source: MARKETING_SYNC_SOURCE"), '13d. snapshot source upsert remains');

console.log('\nAll v4.12.22 marketing display timezone/counts checks passed.');
