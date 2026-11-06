/** Verify existing Budil business logic stays untouched by the GPT bridge. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const base='8a7c49e1b9b26e3580bab88bb0a2728ae4ac7a58';
const diff=spawnSync('git',['diff','--name-only',base,'HEAD'],{encoding:'utf8'});
assert.equal(diff.status,0,'git_diff_unavailable (checkout must fetch history)');
const paths=diff.stdout.trim().split('\n').filter(Boolean);
const allowed=[
  'index.html','js/budil-cloud.js','js/budil-gpt-offline-ui.js',
  'scripts/verify-budil-gpt-secure-readiness.mjs',
  'scripts/verify-budil-gpt-main-integration.mjs',
  'scripts/verify-budil-ai-p0-browser.mjs',
  '.github/workflows/budil-gpt-secure-readiness.yml'
];
for(const p of paths)assert.ok(allowed.includes(p),'Unexpected code change '+p);
for(const p of [
  'js/app.js','js/storage.js','js/documents-brain.js',
  'js/payment-brain.js','js/revenue-brain.js','js/work-order-brain.js'
]) assert.ok(!paths.includes(p),'Protected business code changed '+p);
const html=readFileSync('index.html','utf8');
const ui=readFileSync('js/budil-gpt-offline-ui.js','utf8');
const cloud=readFileSync('js/budil-cloud.js','utf8');
for(const id of ['budil-gpt-open','budil-gpt-shell','budil-gpt-run',
 'budil-gpt-consent','budil-gpt-remote-consent','budil-gpt-readiness',
 'budil-gpt-interpret','budil-gpt-candidates','budil-gpt-pdf'])
 assert.ok(html.includes('id="'+id+'"'),'Missing existing/additional UI '+id);
for(const p of ['js/storage.js','js/documents-brain.js','js/payment-brain.js',
  'js/budil-gpt-readonly.js','js/budil-gpt-offline-ui.js'])
 assert.ok(html.includes('src="'+p+'?'),'Required script missing '+p);
assert.ok(!/\bfetch\s*\(|\blocalStorage\s*\.|\.saveLeads\(|\.saveDocuments\(|\.addDocument\(|\.updateDocument\(|OPENAI_API_KEY/.test(ui),
 'UI must not directly send network request or persist');
assert.ok(ui.includes("gateway.query(parsed.request,true)"),'Local read gateway missing');
assert.ok(ui.includes("Data.getLeads()"),'Local customer resolver missing');
assert.ok(cloud.includes("getGptReadiness: getGptReadiness"));
assert.ok(cloud.includes("interpretAnonymizedQuote: interpretAnonymizedQuote"));
assert.ok(html.includes('js/budil-cloud.js?v=20261106c'));
console.log('BUDIL_GPT_MAIN_SAFE_INTEGRATION_PASS files='+paths.length);
