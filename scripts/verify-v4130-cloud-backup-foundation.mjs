/**
 * Budil v4.13.0 - クラウドバックアップ基盤 Phase 1 verify
 *
 * Background: Budilは現在localStorageのみに保存しており、機種変更・端末故障・
 * ブラウザデータ消失で全データを失うリスクがある。Phase 1として、既存の
 * DataBackup.exportPayload() / validatePayload() をそのまま再利用し、
 * Supabase Edge Function `budil-backups` へ immutable snapshot を保存するだけの
 * 薄いクラウドバックアップ機能を追加した（保存のみ。自動同期・自動復元・
 * クラウドからの復元・双方向同期は一切行わない）。
 *
 * このverifyは、frontend（Budilリポジトリ）側の静的な安全性・分離要件のみを
 * 検証する。Supabase migration / Edge Function の実装確認はai-bantou-app側の
 * 静的検証・staging実通信テストで別途行っている（正本はai-bantou-app）。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scriptsDir = join(root, 'scripts');
const load = (file) => readFileSync(join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

const html = load('index.html');
const app = load('js/app.js');
const budilCloud = load('js/budil-cloud.js');
const dataBackup = load('js/data-backup.js');
const storage = load('js/storage.js');
const css = load('css/style.css');
const currentRunner = load('scripts/verify-current.mjs');

console.log('== 構文チェック ==');
for (const file of ['js/budil-cloud.js', 'js/app.js', 'js/data-backup.js', 'js/storage.js']) {
  execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
  console.log(`PASS: node --check ${file}`);
}

console.log('== 1. 未認証保存不可（frontend側は常にAuthorizationを付けて呼ぶ） ==');
assert(/Authorization:\s*'Bearer '\s*\+\s*accessToken/.test(budilCloud), 'backupNow attempt() must send Authorization: Bearer <accessToken>');
assert(/getValidAccessToken\(\)/.test(budilCloud), 'backupNow must resolve a valid access token before POSTing');
assert(/NOT_SIGNED_IN/.test(budilCloud), 'client must have a not-signed-in code path (no anonymous POST)');

console.log('== 2. verify_jwt=true（ai-bantou-app config.tomlの静的確認） ==');
const configTomlPath = join(root, '..', 'ai-bantou-app', 'supabase', 'config.toml');
assert(statSync(configTomlPath).isFile(), 'sibling ai-bantou-app/supabase/config.toml must exist for cross-repo static check');
const configToml = readFileSync(configTomlPath, 'utf8');
assert(/\[functions\.budil-backups\][\s\S]{0,80}enabled = true[\s\S]{0,80}verify_jwt = true/.test(configToml), 'config.toml must declare functions.budil-backups with enabled=true and verify_jwt=true');
assert(!/--no-verify-jwt/.test(configToml), 'config.toml must not reference --no-verify-jwt');

console.log('== 3. JWT検証・401（Edge Function実装の静的確認） ==');
const fnPath = join(root, '..', 'ai-bantou-app', 'supabase', 'functions', 'budil-backups', 'index.ts');
assert(statSync(fnPath).isFile(), 'sibling ai-bantou-app budil-backups Edge Function must exist');
const fnSource = readFileSync(fnPath, 'utf8');
assert(/createSupabaseContext\(\s*request\s*,\s*\{\s*auth:\s*"user"\s*\}\s*,?\s*\)/.test(fnSource), 'Edge Function must call createSupabaseContext(request, { auth: "user" }) like make-proxy');
assert(/authError \|\| !ctx\?\.userClaims\?\.id/.test(fnSource) && /401/.test(fnSource), 'Edge Function must return 401 when JWT/user claims are missing');

console.log('== 4. membership厳密1件確認 ==');
assert(/\.eq\("status", "active"\)/.test(fnSource) && /\.limit\(2\)/.test(fnSource), 'Edge Function must fetch at most 2 active memberships to detect 0/1/many');
assert(/memberships\.length !== 1/.test(fnSource) && /active_membership_required/.test(fnSource), 'Edge Function must require exactly one active membership (403 otherwise)');

console.log('== 5. tenant active確認 ==');
assert(/\.eq\("status", "active"\)/.test(fnSource.split('tenants').slice(1).join('tenants')) || /tenants[\s\S]{0,200}status.*active/.test(fnSource), 'Edge Function must check tenants.status = active');
assert(/active_tenant_required/.test(fnSource), 'Edge Function must return 403 active_tenant_required for inactive tenant');

console.log('== 6. tenantをfrontend値から決めない ==');
assert(!/tenant_id\s*[:=]\s*(body|payload|req|request)/i.test(fnSource), 'Edge Function must not assign tenant_id from client body/request');
assert(!/tenant_id/i.test(budilCloud), 'budil-cloud.js must never send a client-side tenant_id field');
assert(!/tenantId/i.test(budilCloud), 'budil-cloud.js must never send a client-side tenantId field');

console.log('== 7. tenant越境不可（latestはサーバー確定tenant_idのみで検索） ==');
assert(/isLatestRoute[\s\S]{0,600}\.eq\("tenant_id", membershipTenantId\)/.test(fnSource), 'GET /latest must filter strictly by server-derived membershipTenantId');

console.log('== 8. RLS有効 ==');
const migrationPath = join(root, '..', 'ai-bantou-app', 'supabase', 'migrations', '20260806100000_budil_snapshots_foundation.sql');
assert(statSync(migrationPath).isFile(), 'sibling ai-bantou-app budil_snapshots migration must exist');
const migrationSql = readFileSync(migrationPath, 'utf8');
assert(/ENABLE ROW LEVEL SECURITY/.test(migrationSql), 'budil_snapshots migration must enable RLS');
assert(/REVOKE ALL ON TABLE public\.budil_snapshots FROM (PUBLIC|anon|authenticated)/.test(migrationSql), 'budil_snapshots migration must explicitly revoke default privileges');
assert(/GRANT SELECT, INSERT ON TABLE public\.budil_snapshots TO service_role/.test(migrationSql), 'budil_snapshots migration must grant only SELECT, INSERT to service_role');

console.log('== 9. frontend直接DB操作なし ==');
assert(!/supabase-js/.test(budilCloud), 'budil-cloud.js must not bundle the supabase-js client library');
assert(!/\/rest\/v1\//.test(budilCloud), 'budil-cloud.js must never call PostgREST (/rest/v1/) directly');
assert(/\/functions\/v1\/budil-backups/.test(budilCloud), 'budil-cloud.js must go through the budil-backups Edge Function only');

console.log('== 10. service_role／secret keyなし ==');
assert(!/service_role\s*[:=]/i.test(budilCloud), 'budil-cloud.js must not assign any service_role key/value');
assert(!/serviceRoleKey|secretKey/.test(budilCloud), 'budil-cloud.js must not carry a serviceRoleKey/secretKey field');
assert(!/service_role/i.test(html), 'index.html must not contain the string service_role');
assert(!/sb_secret_/.test(budilCloud) && !/sb_secret_/.test(html), 'frontend must not contain any sb_secret_ key material');
assert(/publishableKey/.test(budilCloud), 'budil-cloud.js must only carry a publishable key field, not a secret key field');

console.log('== 11. snapshot更新／削除APIなし ==');
assert(!/method === "PUT"/.test(fnSource) && !/method === "PATCH"/.test(fnSource) && !/method === "DELETE"/.test(fnSource), 'Edge Function must not implement PUT/PATCH/DELETE handling for snapshots');
assert(!/UPDATE|DELETE/.test(migrationSql.replace(/-- .*/g, '')), 'budil_snapshots migration must not grant/define UPDATE or DELETE capability');

console.log('== 12. idempotency二重作成なし ==');
assert(/UNIQUE \(tenant_id, idempotency_key\)/.test(migrationSql), 'budil_snapshots migration must enforce UNIQUE(tenant_id, idempotency_key)');
assert(/insertError\.code === "23505"/.test(fnSource), 'Edge Function must handle the unique-violation (23505) path instead of allowing duplicates');

console.log('== 13. 異なるpayloadの同一keyは409 ==');
assert(/existing\.content_hash !== contentHash/.test(fnSource) && /idempotency_conflict/.test(fnSource), 'Edge Function must return idempotency_conflict when the same key carries a different content hash');

console.log('== 14. DataBackup.exportPayload()再利用 ==');
assert(/DataBackup\.exportPayload\(\)/.test(budilCloud), 'budil-cloud.js must call DataBackup.exportPayload() as the single source of backup content');
assert(!/BACKUP_KEYS/.test(budilCloud), 'budil-cloud.js must not duplicate BACKUP_KEYS; it must reuse DataBackup as-is');

console.log('== 15. DataBackup.validatePayload()通過 ==');
assert(/DataBackup\.validatePayload\(payload\)/.test(budilCloud), 'budil-cloud.js must validate the payload via DataBackup.validatePayload() before sending');
assert(/validation\.valid/.test(budilCloud), 'budil-cloud.js must check validation.valid and abort on failure');

console.log('== 16. localStorageキー変更なし ==');
assert(!/[^.\w]localStorage\.(getItem|setItem|removeItem|clear)\s*\(/.test(budilCloud), 'budil-cloud.js must not call any localStorage read/write API (session token uses sessionStorage only)');
assert(/sessionStorage/.test(budilCloud), 'budil-cloud.js must keep its auth session in sessionStorage, not localStorage');
assert(!/localStorage\.clear\s*\(/.test(app) && !/localStorage\.clear\s*\(/.test(budilCloud), 'no localStorage.clear() introduced by cloud backup work');

console.log('== 17. 自動同期なし ==');
assert(!/setInterval/.test(budilCloud), 'budil-cloud.js must not run any interval-based auto-sync');
assert(!/setTimeout\s*\(\s*(function|\(\)\s*=>)\s*[^,]*backupNow/.test(budilCloud), 'budil-cloud.js must not schedule automatic backups');

console.log('== 18. 自動復元なし ==');
assert(!/restore/i.test(budilCloud), 'budil-cloud.js must not implement any restore-from-cloud path');
assert(!/importPayload|applyPayload/.test(budilCloud), 'budil-cloud.js must not write any imported/applied payload back into local data');

console.log('== 19. cloud失敗時も既存データ不変 ==');
assert(!/Storage\.set/.test(budilCloud) && !/Storage\.update/.test(budilCloud), 'budil-cloud.js must never write business data via Storage.set/update');
assert(/失敗時も既存業務localStorageは一切変更しない/.test(budilCloud) || /保存のみ/.test(budilCloud), 'budil-cloud.js must document save-only, no local mutation on failure');

console.log('== 20. 二重押下防止 ==');
assert(/backupInFlight/.test(budilCloud), 'budil-cloud.js must guard concurrent backupNow() calls with an in-flight flag');
assert(/backupBtn\.disabled\s*=\s*true/.test(app), 'app.js must disable the cloud backup button immediately on click');
assert(/backupBtn\.disabled \|\| BudilCloud\.isBackupInFlight\(\)/.test(app), 'app.js click handler must check both the disabled DOM state and the in-flight flag before proceeding');

console.log('== 21. payload／個人情報をログへ出さない ==');
assert(!/console\.(log|error|warn|info)\([^)]*payload/i.test(budilCloud), 'budil-cloud.js must never log the payload object');
assert(!/console\.(log|error|warn|info)\([^)]*password/i.test(app) && !/console\.(log|error|warn|info)\([^)]*password/i.test(budilCloud), 'app.js/budil-cloud.js must never log password values');
assert(!/console\.log\(event, detail\)/.test(fnSource), 'Edge Function log helper must not accept arbitrary payload/PII content');
assert(/Never log payload contents, PII, tokens/.test(fnSource), 'Edge Function must document that logs never include payload/PII/tokens/keys');

console.log('== 22. 新規会員登録UIなし ==');
const cloudSectionMatch = html.match(/<h2 class="backup-section-heading">クラウドバックアップ<\/h2>[\s\S]*?<div class="card card-wide card-test-data">/);
assert(!!cloudSectionMatch, 'index.html must contain a delimited cloud backup section');
const cloudSectionHtml = cloudSectionMatch ? cloudSectionMatch[0] : '';
assert(!/新規登録|会員登録|sign[_-]?up/i.test(cloudSectionHtml), 'cloud backup section must not contain any signup UI');
assert(!/register|create-account/i.test(budilCloud), 'budil-cloud.js must not implement account creation');

console.log('== 23. ローカルバックアップ／復元維持 ==');
assert(/<h2 class="backup-section-heading">ローカルバックアップ<\/h2>/.test(html), 'index.html must keep the ローカルバックアップ heading, separated from cloud');
assert(/id="btn-export-data"/.test(html), 'local export (backup) button must remain');
assert(/id="btn-import-select"/.test(html), 'local import (restore) button must remain');
assert(/id="btn-import-confirm"/.test(html), 'local restore confirmation flow must remain');

console.log('== 24. originによるstaging／production固定 ==');
assert(/teruya1229\.github\.io/.test(budilCloud) && /production/.test(budilCloud), 'budil-cloud.js must map the GitHub Pages origin to production');
assert(/localhost/.test(budilCloud) && /127\.0\.0\.1/.test(budilCloud) && /staging/.test(budilCloud), 'budil-cloud.js must map localhost/127.0.0.1 to staging');
assert(/return null;.*(fail closed|未知origin)/is.test(budilCloud) || /未知origin: fail closed/.test(budilCloud), 'budil-cloud.js must fail closed (return null) for unknown origins');

console.log('== 25. query等による環境切替なし ==');
assert(!/location\.search/.test(budilCloud), 'budil-cloud.js must not read location.search for environment switching');
assert(!/location\.hash/.test(budilCloud), 'budil-cloud.js must not read location.hash for environment switching');
assert(!/localStorage\.getItem\(['"]env/.test(budilCloud), 'budil-cloud.js must not allow environment override via localStorage');
assert(/resolveEnvironment\(\)/.test(budilCloud) && /hostname/.test(budilCloud), 'environment must be resolved solely from hostname');

console.log('== 26. 既存verify削除・緩和なし（本数維持＋新規1本以上） ==');
const CURRENT_PATTERN = /^verify-v4(10|11|12|13)\d.*\.mjs$/;
const currentScripts = readdirSync(scriptsDir).filter((n) => CURRENT_PATTERN.test(n));
const BASELINE_COUNT = 87; // v4.12.27時点（このverify追加前）の現行チェーン本数
assert(currentScripts.length >= BASELINE_COUNT + 1, `current verify chain must keep at least ${BASELINE_COUNT} existing scripts and add this one (found ${currentScripts.length})`);
assert(currentScripts.includes('verify-v4130-cloud-backup-foundation.mjs'), 'this script must be discoverable by the current verify runner');
assert(currentRunner.includes('verify-v4(10|11|12|13)'), 'verify-current.mjs must still target the v4.10–v4.13 pattern (no narrowing)');

console.log('== UI: バージョン・cache buster整合 ==');
assert(html.includes('AI経営脳みそ v4.13.2'), 'index header version must be v4.13.2');
assert(html.includes('js/budil-cloud.js?v=4.13.2'), 'budil-cloud.js cache buster must be v4.13.2');
assert(storage.includes("BUDIL_VERSION: 'v4.13.2'"), 'storage.js version must be v4.13.2');
assert(dataBackup.includes("APP_VERSION: 'v4.13.2'"), 'data-backup.js version must be v4.13.2');

console.log('== UI: 390pxで横スクロールを増やさない ==');
assert(/\.card-cloud-backup/.test(css), 'css/style.css must define styling scoped to .card-cloud-backup');
assert(!/\.card-cloud-backup[^{]*\{[^}]*overflow-x:\s*scroll/i.test(css), 'cloud backup card must not force horizontal scroll');

console.log(`\nAll v4.13.2 cloud-backup-foundation checks passed.`);
