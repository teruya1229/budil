import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync('supabase/functions/budil-backups/index.ts','utf8');
const html=readFileSync('index.html','utf8');
const ui=readFileSync('js/budil-cloud-restore-ui.js','utf8');
const cloud=readFileSync('js/budil-cloud.js','utf8');
function must(text,msg){assert.ok(src.includes(text),msg);}
must('createSupabaseContext','JWT auth preserved');
must('active_membership_required','single active tenant membership required');
must('active_tenant_required','active tenant required');
must('const isDownloadRoute','distinct payload route required');
must('memberships[0].role !== "owner"','only owner may download full snapshot');
must('"restore_owner_required"','owner error required');
must('.eq("tenant_id", membershipTenantId)','tenant-scoped read required');
must('"Cache-Control": "no-store"','cache disabled');
must('"Access-Control-Allow-Origin": origin','exact origin needed');
must('.insert({','existing immutable POST backup unchanged');
must('idempotency_conflict','existing idempotency protection unchanged');
must('isDownloadRoute ? "id, created_at, app_version, backup_version, content_hash, payload"',
  'metadata must not include payload');
assert.ok(src.indexOf('createSupabaseContext')<src.indexOf('if (isDownloadRoute &&'),
  'auth before reading snapshot');
for(const key of ['btn-cloud-restore-preview','btn-cloud-restore-download',
 'cloud-restore-saved','btn-cloud-restore-apply','btn-cloud-restore-reload'])
 assert.ok(html.includes('id="'+key+'"'),key+' is missing');
assert.match(ui,/saved\.checked!==true/,'manual saved JSON acknowledgement is required');
assert.match(ui,/permit:true,backupSaved:true/,'explicit allow required');
assert.match(ui,/BudilCloud\.fetchLatestPayload\(\)/,'only explicit snapshot load');
assert.match(ui,/\.addEventListener\('click',/,'user gesture required');
assert.ok(!/\bfetch\s*\(/.test(ui),'UI must not bypass authenticated BudilCloud');
assert.ok(cloud.includes('fetchLatestPayload: fetchLatestPayload'),'read-only cloud API');
console.log('BUDIL_CLOUD_SERVER_CONTRACT_PASS');
