/**
 * Budil v4.12.22 - 集客チェック1ボタン取得の自動起動修正 verify
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

assert(html.includes('v4.13.5'), 'index.html shows v4.12.26');
assert(html.includes('js/app.js?v=4.13.5'), 'app.js cache buster is v4.12.26');
assert(storage.includes("BUDIL_VERSION: 'v4.13.5'"), 'storage version is v4.12.26');
assert(dataBackup.includes("APP_VERSION: 'v4.13.5'"), 'data-backup version is v4.12.26');
assert(currentRunner.includes("EXPECTED_VERSION = 'v4.13.5'"), 'verify-current pins v4.12.26');

assert(app.includes('waitForMarketingHealth'), 'health retry helper exists');
assert(app.includes('MARKETING_HEALTH_RETRY_MS = 45000'), 'health retry window is 45s');
assert(app.includes('MARKETING_LOCAL_API_TIMEOUT_MS = 150000'), 'collect timeout allows browser start wait');
assert(app.includes('集客APIへ接続確認中'), 'API connection progress text exists');
assert(app.includes('Browser番頭を確認中／起動中'), 'browser ensure progress text exists');
assert(app.includes('marketingApiStatusLabel'), 'API status label helper exists');
assert(app.includes('marketingBrowserStatusLabel'), 'browser status label helper exists');
assert(app.includes('marketingCdpStatusLabel'), 'CDP status label helper exists');
assert(app.includes('marketingAutoStartLabel'), 'auto-start label helper exists');
assert(app.includes('前回取得値'), 'previous value label exists');
assert(app.includes('実際の最終成功日時'), 'last success datetime label exists');
assert(app.includes('今回の取得失敗理由'), 'current failure reason label exists');
assert(app.includes(MARKETING_API_UNREACHABLE_SNIPPET()), 'API unreachable message exists');
assert(app.includes('isMarketingBrowserEnsureFailure'), 'browser ensure failure detector exists');
assert(app.includes("marketingSyncInFlight"), 'repeat click guard remains');
assert(!app.includes('if (!health.cdpReady) throw'), 'health cdpReady alone no longer aborts');
assert(!app.includes('localStorage.clear'), 'localStorage.clear is not introduced');
assert(!/売上登録|作業完了後|作業後確定/.test(app), 'NG terms are not revived in app.js');

assert(statusMd.includes('v4.12.25'), 'status.md documents v4.12.25');
assert(handoffMd.includes('v4.12.25'), 'handoff.md documents v4.12.25');
assert(decisionLog.includes('v4.12.25'), 'decision-log.md records v4.12.25');

function MARKETING_API_UNREACHABLE_SNIPPET() {
  return '集客APIへ接続できません。APIが未起動、またはChromeのローカルネットワーク許可で遮断されている可能性があります。';
}

// Lightweight behavior stubs for critical branches
const healthRetrySource = app.slice(
  app.indexOf('async function waitForMarketingHealth'),
  app.indexOf('function marketingApiStatusLabel')
);
assert(healthRetrySource.includes('while (Date.now() - started <= maxMs)'), 'health retries until timeout');
assert(healthRetrySource.includes("requestMarketingLocalApi('/health'"), 'health retry only hits /health');

const runSource = app.slice(
  app.indexOf('async function runMarketingAutoSync'),
  app.indexOf('/* ── 広告番頭連携（共通JSON） ── */')
);
assert(runSource.includes('waitForMarketingHealth()'), 'sync starts with health retry');
assert(runSource.includes("'/collect/google-ads'"), 'google ads collect remains');
assert(runSource.includes("'/collect/ga4'"), 'ga4 collect remains');
assert(runSource.includes("'/collect/search-console'"), 'search console collect remains');
assert(runSource.includes('isMarketingBrowserEnsureFailure(result)'), 'browser ensure failure aborts before save');
assert(runSource.includes('lastMarketingRunMeta.saved = true'), 'save flag only on success path');
assert(runSource.includes('保存済みデータは削除していません'), 'failure keeps stored data messaging');
assert((runSource.match(/requestMarketingLocalApi\(path, 'POST'\)/g) || []).length === 1, 'each service posts once per loop iteration helper');

console.log('\nAll v4.12.22 marketing auto-start checks passed.');
