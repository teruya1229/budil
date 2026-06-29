/**
 * Budil v4.8.28 not-needed action candidate verification.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = join(root, 'js');

function load(path) {
  return readFileSync(join(root, path), 'utf8');
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function makeStore(seed = {}) {
  const data = { ...seed };
  return {
    get length() {
      return Object.keys(data).length;
    },
    key(index) {
      return Object.keys(data)[index] || null;
    },
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
    _data: data
  };
}

function createSandbox(seed = {}) {
  const localStorage = makeStore(seed);
  const ctx = createContext({
    localStorage,
    console,
    Date,
    JSON,
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    undefined
  });
  runInContext(load('js/action-brain.js'), ctx, { filename: 'action-brain.js' });
  runInContext(load('js/storage.js'), ctx, { filename: 'storage.js' });
  return { ctx, localStorage };
}

function parse(localStorage, key, fallback) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}

function readSourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const rel = relative(root, path).replace(/\\/g, '/');
    if (rel.startsWith('.git/') || rel.startsWith('recovery/')) continue;
    if (rel === 'scripts/verify-v489-not-needed-action-candidates.mjs') continue;
    const st = statSync(path);
    if (st.isDirectory()) readSourceFiles(path, out);
    else if (/\.(js|mjs|html|md)$/.test(name)) out.push(path);
  }
  return out;
}

console.log('== v4.8.28 not-needed action candidate check ==');

for (const file of ['action-brain.js', 'storage.js', 'app.js', 'data-backup.js']) {
  execSync(`node --check "${join(jsDir, file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const actionBrainJs = load('js/action-brain.js');
const storageJs = load('js/storage.js');
const dataBackupJs = load('js/data-backup.js');

assert(indexHtml.includes('AI経営脳みそ v4.8.28'), 'header version should be v4.8.28');
assert(indexHtml.includes('Budil v4.8.28'), 'sidebar version should be v4.8.28');
assert(indexHtml.includes('js/app.js?v=4.8.28'), 'app.js cache buster should be v4.8.28');
assert(appJs.includes('data-exec-priority-not-needed'), 'top priority needs not-needed button');
assert(appJs.includes('data-act-not-needed'), 'action candidate list needs not-needed button');
assert(appJs.includes('data-act-not-needed-report'), 'today action candidate needs not-needed button before add');
assert(actionBrainJs.includes("STATUS_NOT_NEEDED: 'not_needed'"), 'ActionBrain not-needed status missing');
assert(storageJs.includes('markActionCandidateNotNeeded'), 'Storage not-needed method missing');
assert(storageJs.includes('action_candidate_not_needed'), 'operation log action missing');
assert(dataBackupJs.includes('budil_action_candidate_states'), 'candidate state backup key missing');

{
  const seed = {
    budil_revenue_records: JSON.stringify([{ id: 'rev_real', amount: 10000 }]),
    budil_documents: JSON.stringify([{ id: 'doc_real' }]),
    budil_reception_intakes: JSON.stringify([{ id: 'intake_real' }]),
    budil_work_orders: JSON.stringify([{ id: 'work_real' }])
  };
  const { ctx, localStorage } = createSandbox(seed);
  runInContext(`
    const added = Storage.addActionCandidate(ActionBrain.createFromExternalCheck('report-1', '口コミ依頼を送る'));
    Storage.markActionCandidateNotNeeded(added.record.id);
  `, ctx);
  const candidates = parse(localStorage, 'budil_action_candidates', []);
  const logs = parse(localStorage, 'budil_operation_logs', []);
  assert(candidates.length === 1, 'not-needed should keep original candidate record');
  assert(candidates[0].status === 'not_needed', 'candidate status should be not_needed');
  assert(candidates[0].notNeededAt, 'notNeededAt should be recorded');
  assert(logs.some(l => l.action === 'action_candidate_not_needed'), 'operation log should record not-needed');
  assert(parse(localStorage, 'budil_revenue_records', []).length === 1, 'revenue data must remain');
  assert(parse(localStorage, 'budil_documents', []).length === 1, 'documents must remain');
  assert(parse(localStorage, 'budil_reception_intakes', []).length === 1, 'reception intakes must remain');
  assert(parse(localStorage, 'budil_work_orders', []).length === 1, 'work orders must remain');
}

{
  const { ctx, localStorage } = createSandbox({});
  runInContext(`Storage.markActionCandidateNotNeeded('', { sourceReportId: 'report-2', title: 'LINE誘導する' })`, ctx);
  const candidates = parse(localStorage, 'budil_action_candidates', []);
  assert(candidates.length === 1, 'not-needed from report/title should create a candidate state record');
  assert(candidates[0].status === 'not_needed', 'report/title not-needed should persist not_needed');
  const state = runInContext(`ActionBrain.getCandidateState(Storage.getActionCandidates(), 'report-2', 'LINE誘導する')`, ctx);
  assert(state === 'not_needed', 'candidate state should resolve to not_needed after reload-style read');
}

{
  const { ctx, localStorage } = createSandbox({});
  runInContext(`
    Storage.setActionCandidateState('exec-priority|2026-06-27|follow|abc|review', 'not_needed', {
      title: '口コミ依頼：お客様',
      source: 'フォロー',
      sourceKey: 'follow-up'
    });
  `, ctx);
  const states = parse(localStorage, 'budil_action_candidate_states', {});
  assert(states['exec-priority|2026-06-27|follow|abc|review'].state === 'not_needed',
    'top priority not-needed state should persist');
  const logs = parse(localStorage, 'budil_operation_logs', []);
  assert(logs.some(l => l.action === 'action_candidate_not_needed'), 'top priority state should log not-needed operation');
}

const sourceText = readSourceFiles(root).map(p => readFileSync(p, 'utf8')).join('\n');
assert(!(new RegExp('localStorage' + '\\.clear\\s*\\(')).test(sourceText), 'direct localStorage clear must not exist');
assert(!(new RegExp('saveRevenueRecords' + '\\s*\\(\\s*\\[\\s*\\]\\s*\\)')).test(sourceText), 'empty revenue save must not exist');
assert(!sourceText.includes('git add recovery'), 'recovery must not be added by scripts/docs');

console.log('All v4.8.28 not-needed action candidate checks passed.');
