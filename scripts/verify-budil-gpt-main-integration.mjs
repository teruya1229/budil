/** Verify the integrated PR changes only approved UI/assistant code, never core
 * pricing/business engines or any confidential config. Update the explicit
 * list only after reviewing each newly introduced path. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
// Compare the PR against current main, not the November 6 release ancestor.
// A stale fixed base incorrectly flagged unrelated, already-published CI files.
const baseline=spawnSync('git',['merge-base','HEAD','origin/main'],{encoding:'utf8'});
assert.equal(baseline.status,0,'current_main_merge_base_unavailable');
const base=baseline.stdout.trim();
assert.match(base,/^[a-f0-9]{40}$/,'invalid_merge_base');
const diff=spawnSync('git',['diff','--name-only',base,'HEAD'],{encoding:'utf8'});
assert.equal(diff.status,0,'git_diff_unavailable (checkout must fetch history)');
const paths=diff.stdout.trim().split('\n').filter(Boolean);
const allowed=new Set([
  ".github/workflows/budil-local-busy-read.yml",
  ".github/workflows/budil-ai-conversation-p0.yml",
  ".github/workflows/budil-cloud-safe-restore.yml",
  ".github/workflows/budil-conversation-20.yml",
  ".github/workflows/budil-gpt-privacy-readonly.yml",
  ".github/workflows/budil-integration-20261106.yml",
  ".github/workflows/budil-live-pages-acceptance.yml",
  ".github/workflows/budil-practical-e2e.yml",
  "docs/budil-cloud-safe-restore-20261106.md",
  "docs/budil-local-bank-csv.md",
  "docs/budil-local-booking.md",
  "docs/budil-release-gate-20261107.md",
  "docs/budil-local-invoice-lifecycle.md",
  "experiments/budil-gpt-phase1/fixture-core.js",
  "calendar-read-test.html",
  ".github/workflows/budil-gcal-contract.yml",
  ".github/workflows/budil-calendar-edge-deny-smoke.yml",
  "docs/budil-calendar-write-production-preparation-20261112.md",
  "index.html",
  "js/budil-gpt-calendar-preview.js",
  "js/work-order-brain.js",
  "scripts/verify-budil-gcal-workorder-sync.mjs",
  "js/budil-gpt-calendar-link.js",
  "scripts/verify-budil-gcal-local-link.mjs",
  "scripts/verify-budil-gcal-test-cleanup.mjs",
  "scripts/verify-budil-gcal-credential-diagnostic.mjs",
  "scripts/verify-budil-gcal-diagnostic-route.mjs",
  "supabase/functions/budil-calendar-write/diagnostic-route.mjs",
  "supabase/functions/budil-calendar-write/diagnostic.mjs",
  "scripts/verify-budil-gcal-compact-browser.mjs",
  "scripts/verify-budil-gcal-write-auth.mjs",
  "scripts/verify-budil-gcal-google-http.mjs",
  "scripts/verify-budil-gcal-write-token.mjs",
  "scripts/verify-budil-gcal-server-integration.mjs",
  "scripts/verify-budil-gcal-write-busy.mjs",
  "scripts/verify-budil-gcal-ledger.mjs",
  "scripts/verify-budil-gcal-slots.mjs",
  "supabase/functions/budil-calendar-write/slots.mjs",
  ".github/workflows/budil-gcal-slot-postgres.yml",
  "docs/sql/budil-calendar-write-slots-proposal.sql",
  "scripts/sql/verify-budil-calendar-slots.sql",
  "scripts/verify-budil-calendar-slot-race.mjs",
  "supabase/functions/budil-calendar-write/ledger.mjs",
  "supabase/functions/budil-calendar-write/google-write-token.mjs",
  "supabase/functions/budil-calendar-write/google-write-events.mjs",
  "supabase/functions/budil-calendar-write/authority.mjs",
  "supabase/functions/budil-calendar-write/handler.mjs",
  "supabase/functions/budil-calendar-write/index.ts",
  "js/budil-cloud-restore-ui.js",
  "js/budil-cloud-restore.js",
  "js/budil-cloud.js",
  "js/budil-gpt-bank-reconcile.js",
  "js/budil-gpt-booking.js",
  "js/budil-gpt-conversation.js",
  "js/budil-gpt-invoice-lifecycle.js",
  "js/budil-gpt-local-commands.js",
  "js/budil-gpt-local-source.js",
  "js/budil-gpt-offline-ui.js",
  "js/budil-gpt-public-read.js",
  "js/budil-gpt-readonly.js",
  "scripts/audit-budil-original-19.mjs",
  "scripts/verify-budil-ai-p0-browser.mjs",
  "scripts/verify-budil-ai-release-browser.mjs",
  "scripts/verify-budil-cloud-restore-browser.mjs",
  "scripts/verify-budil-cloud-restore-server.mjs",
  "scripts/verify-budil-local-busy.mjs",
  "scripts/verify-budil-live-published.mjs",
  "scripts/verify-budil-calendar-read-test.mjs",
  "scripts/verify-budil-cloud-safe-restore.mjs",
  "scripts/verify-budil-gpt-bank-browser.mjs",
  "scripts/verify-budil-gpt-bank-reconcile.mjs",
  "scripts/verify-budil-gpt-booking-browser.mjs",
  "scripts/verify-budil-gpt-booking.mjs",
  "scripts/verify-budil-gpt-combined-lifecycle.mjs",
  "scripts/verify-budil-gpt-conversation-20.mjs",
  "scripts/verify-budil-gpt-invoice-browser.mjs",
  "scripts/verify-budil-gpt-invoice-lifecycle.mjs",
  "scripts/verify-budil-gpt-local-commands.mjs",
  "scripts/verify-budil-gpt-local-source.mjs",
  "scripts/verify-budil-gpt-main-integration.mjs",
  "scripts/verify-budil-gpt-multi-turn.mjs",
  "scripts/verify-budil-gpt-public-read.mjs",
  "scripts/verify-budil-gpt-readonly-privacy.ts",
  "scripts/verify-budil-gpt-readonly.mjs",
  "supabase/functions/budil-backups/helpers.ts",
  "supabase/functions/budil-backups/index.ts",
  "supabase/functions/budil-gpt-interpret/helpers.ts",
  "supabase/functions/budil-gpt-interpret/index.ts",
  "supabase/functions/budil-gpt-interpret/readonly.ts"
]);
assert.ok(paths.length>0,'unexpected empty integration diff');
for(const p of paths) {
  const isolatedCalendarCandidate = /^experiments\/budil-gcal-write-sandbox\/(?:atomic-ledger|booking-command|booking-preview|calendar-route|existing-read-booking|fakes|google-calendar-http|production-call-adapter|transaction|verify|verify-extra)\.(?:cjs|js)$/.test(p) ||
    p==='experiments/budil-gcal-write-sandbox/schema-proposal.sql';
  assert.ok(allowed.has(p)||isolatedCalendarCandidate,'Unexpected code change '+p);
  assert.ok(!/(?:^|\/)(?:\.env|private|secrets?|credentials?|tokens?)(?:\/|\.|$)/i.test(p),
    'Unsafe path in source diff '+p);
}
for(const p of [
  'js/app.js','js/storage.js','js/documents-brain.js',
  'js/payment-brain.js','js/revenue-brain.js'
]) assert.ok(!paths.includes(p),'Protected business code changed '+p);
const html=readFileSync('index.html','utf8');
const ui=readFileSync('js/budil-gpt-offline-ui.js','utf8');
const cloud=readFileSync('js/budil-cloud.js','utf8');
for(const id of [
 'budil-gpt-open','budil-gpt-shell','budil-gpt-run',
 'budil-gpt-consent','budil-gpt-remote-consent','budil-gpt-readiness',
 'budil-gpt-interpret','budil-gpt-public-consent','budil-gpt-public-read',
 'budil-gpt-candidates','budil-gpt-pdf',
 'budil-gpt-booking','budil-gpt-invoice','budil-gpt-bank',
 'cloud-restore-section','cloud-restore-saved'
]) {
  const token='id="'+id+'"';
  assert.ok(html.includes(token),'Required UI missing '+id);
  assert.equal(html.split(token).length-1,1,'Duplicate UI control '+id);
}
for(const p of [
 'js/storage.js','js/documents-brain.js','js/payment-brain.js',
 'js/budil-gpt-readonly.js','js/budil-gpt-booking.js',
 'js/budil-gpt-invoice-lifecycle.js','js/budil-gpt-bank-reconcile.js',
 'js/budil-gpt-public-read.js','js/budil-cloud-restore.js',
 'js/budil-cloud-restore-ui.js','js/budil-gpt-offline-ui.js'
]) assert.ok(html.includes('src="'+p+'?'),'Required script missing '+p);
assert.ok(!/\bfetch\s*\(|\blocalStorage\s*\.|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY/.test(ui),
 'UI cannot directly bypass cloud client or storage access layer');
assert.ok(ui.includes("gateway.query(parsed.request,true)"),'Local read gateway missing');
assert.ok(ui.includes("Data.getLeads()"),'Local customer resolver missing');
for(const marker of [
 "createSafetyBackup(","budil-gpt-consent","budil-gpt-remote-consent",
 "budil-gpt-public-consent","addEventListener('click',saveBooking)",
 "addEventListener('click',saveInvoice)","addEventListener('click',runPublicRead)"
]) assert.ok(ui.includes(marker),'Human approval or backup guard missing '+marker);
for(const marker of [
 'getGptReadiness: getGptReadiness',
 'interpretAnonymizedQuote: interpretAnonymizedQuote',
 'interpretPiiFreeRead: interpretPiiFreeRead',
 'fetchLatestPayload: fetchLatestPayload'
]) assert.ok(cloud.includes(marker),'Required cloud boundary missing '+marker);
assert.ok(/src="js\/budil-cloud\.js\?v=[^"]+"/.test(html),
 'Versioned cloud bridge script missing');
console.log('BUDIL_GPT_MAIN_SAFE_INTEGRATION_PASS files='+paths.length);
