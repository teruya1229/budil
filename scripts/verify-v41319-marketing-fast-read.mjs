/**
 * Budil v4.13.19 - 集客チェックを Browser番頭高速READ（/collect/all）へ統合
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

const html = load('index.html');
const app = load('js/app.js');
const storage = load('js/storage.js');
const dataBackup = load('js/data-backup.js');
const currentRunner = load('scripts/verify-current.mjs');
const statusMd = load('status.md');
const handoffMd = load('handoff.md');
const decisionLog = load('decision-log.md');

execFileSync(process.execPath, ['--check', join(root, 'js/app.js')], { stdio: 'inherit' });

assert(html.includes('v4.13.19'), 'index.html shows v4.13.19');
assert(html.includes('js/app.js?v=4.13.19'), 'app.js cache buster is v4.13.19');
assert(storage.includes("BUDIL_VERSION: 'v4.13.19'"), 'storage version is v4.13.19');
assert(dataBackup.includes("APP_VERSION: 'v4.13.19'"), 'data-backup version is v4.13.19');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.19'"), 'verify-current pins v4.13.19');
assert(statusMd.includes('v4.13.19'), 'status.md documents v4.13.19');
assert(handoffMd.includes('v4.13.19'), 'handoff.md documents v4.13.19');
assert(decisionLog.includes('v4.13.19'), 'decision-log.md records v4.13.19');

assert(app.includes("MARKETING_LOCAL_API_BASE = 'http://127.0.0.1:43822'"), 'loopback API is fixed');
assert(app.includes("'/collect/all'"), 'combined collect is preferred');
assert(app.includes("usedCombined"), 'combined collect guard exists');
assert(app.includes("'/collect/google-ads'"), 'google-ads collect remains as fallback');
assert(app.includes("'/collect/ga4'"), 'ga4 collect remains as fallback');
assert(app.includes("'/collect/search-console'"), 'search-console collect remains as fallback');
assert(app.includes('upsertMarketingAdRecords'), 'ad upsert remains');
assert(app.includes('upsertMarketingGa4Records'), 'GA4 upsert remains');
assert(app.includes('upsertMarketingSnapshot'), 'Search Console snapshot upsert remains');
assert(!app.includes('localStorage.clear'), 'localStorage.clear is not introduced');
assert(!app.includes('売上登録'), 'NG wording 売上登録 is not introduced');
assert(!app.includes('作業完了後'), 'NG wording 作業完了後 is not introduced');

console.log('verify-v41319-marketing-fast-read: PASS');
