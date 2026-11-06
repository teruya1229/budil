/** Contract: main Budil entrypoint changed ONLY by additions on this branch. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const original='bf6d132a47aff26b3f38c5ef68f269b362c7f6ed';
const file='index.html';
const html=readFileSync(file,'utf8');
const diff=spawnSync('git',['diff','--unified=0',original,'HEAD','--',file],{encoding:'utf8'});
assert.equal(diff.status,0,'git_diff_unavailable');
const removed=diff.stdout.split('\n').filter(l=>l.startsWith('-')&&!l.startsWith('---'));
assert.equal(removed.length,0,'Existing Budil HTML was removed or changed');
const added=diff.stdout.split('\n').filter(l=>l.startsWith('+')&&!l.startsWith('+++'));
assert.ok(added.length>30&&added.length<190,'Unexpectedly large/small UI change');
const required=[
  'id="budil-gpt-open"','id="budil-gpt-shell"','id="budil-gpt-consent"',
  'id="budil-gpt-run"','id="budil-gpt-candidates"','id="budil-gpt-pdf"',
  'js/budil-gpt-offline-ui.js?v=20261106a',
  'js/budil-gpt-local-source.js?v=20261106a',
  'js/budil-gpt-local-commands.js?v=20261106a',
  'css/budil-gpt-offline.css?v=20261106a'
];
for(const label of required)assert.ok(html.includes(label),'Required UI missing '+label);
for(const restricted of ['<script src="https://','OPENAI_API_KEY','service_role','secret_key'])
  assert.ok(!added.join('\n').includes(restricted),'unsafe addition '+restricted);
const changed=spawnSync('git',['diff','--name-only',original,'HEAD'],{encoding:'utf8'});
assert.equal(changed.status,0);
const protectedFiles=['js/app.js','js/storage.js','js/documents-brain.js',
  'js/payment-brain.js','js/revenue-brain.js','js/work-order-brain.js'];
for(const p of protectedFiles)assert.ok(!changed.stdout.split('\n').includes(p),
  'Core protected business logic changed '+p);
const source=readFileSync('js/budil-gpt-offline-ui.js','utf8');
assert.ok(!/\bfetch\s*\(|\blocalStorage\s*\.|\.saveLeads\(|\.saveDocuments\(|\.addDocument\(|\.updateDocument\(|OPENAI_API_KEY/.test(source),
  'local UI must not perform network or business persistence');
assert.ok(source.includes('Data.getLeads()')&&source.includes("gateway.query(parsed.request,true)"));
console.log('BUDIL_GPT_MAIN_ADDITIVE_INTEGRATION_PASS added='+added.length+
' removed='+removed.length);
