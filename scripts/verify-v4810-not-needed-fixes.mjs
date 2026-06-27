/**
 * Budil v4.8.13 not-needed candidate fix verification.
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
    get length() { return Object.keys(data).length; },
    key(index) { return Object.keys(data)[index] || null; },
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; },
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
    if (rel === 'scripts/verify-v4810-not-needed-fixes.mjs') continue;
    const st = statSync(path);
    if (st.isDirectory()) readSourceFiles(path, out);
    else if (/\.(js|mjs|html|md)$/.test(name)) out.push(path);
  }
  return out;
}

console.log('== v4.8.13 not-needed fix check ==');

for (const file of ['action-brain.js', 'storage.js', 'app.js', 'data-backup.js']) {
  execSync(`node --check "${join(jsDir, file)}"`, { stdio: 'inherit' });
}

const indexHtml = load('index.html');
const appJs = load('js/app.js');
const storageJs = load('js/storage.js');

assert(indexHtml.includes('AI経営脳みそ v4.8.13'), 'header version should be v4.8.13');
assert(indexHtml.includes('Budil v4.8.13'), 'sidebar version should be v4.8.13');
assert(indexHtml.includes('js/app.js?v=4.8.13'), 'app.js cache buster should be v4.8.13');
assert(appJs.includes('compact') && appJs.includes('data-act-not-needed-report'), 'compact today action candidates should render not-needed buttons');
assert(appJs.includes('data-exec-priority-not-needed'), 'top priority not-needed button should remain');
assert(appJs.includes('data-act-not-needed="${esc(c.id)}"'), 'action candidate not-needed button should remain');
assert(appJs.includes('btn.dataset.bound') && appJs.includes('data-exec-priority-not-needed'), 'executive priority handlers should have bound guard');
assert(storageJs.includes('if (previous && previous.state === state) return previous;'), 'candidate state save should be idempotent');
assert(storageJs.includes('if (!created && list[idx].status === nextStatus) return list[idx];'), 'action candidate not-needed should be idempotent');

{
  const { ctx, localStorage } = createSandbox({
    budil_revenue_records: JSON.stringify([{ id: 'rev_real', amount: 10000 }]),
    budil_documents: JSON.stringify([{ id: 'doc_real' }]),
    budil_reception_intakes: JSON.stringify([{ id: 'intake_real' }]),
    budil_work_orders: JSON.stringify([{ id: 'work_real' }])
  });
  runInContext(`
    Storage.setActionCandidateState('exec-priority|2026-06-27|follow|abc|review', 'not_needed', {
      title: '口コミ依頼：お客様',
      source: 'フォロー'
    });
    Storage.setActionCandidateState('exec-priority|2026-06-27|follow|abc|review', 'not_needed', {
      title: '口コミ依頼：お客様',
      source: 'フォロー'
    });
  `, ctx);
  const logs = parse(localStorage, 'budil_operation_logs', []);
  assert(logs.filter(l => l.action === 'action_candidate_not_needed').length === 1,
    'top priority not-needed should log once for repeated same operation');
}

{
  const { ctx, localStorage } = createSandbox({});
  runInContext(`
    Storage.markActionCandidateNotNeeded('', { sourceReportId: 'report-1', title: 'LINE誘導する' });
    Storage.markActionCandidateNotNeeded('', { sourceReportId: 'report-1', title: 'LINE誘導する' });
  `, ctx);
  const candidates = parse(localStorage, 'budil_action_candidates', []);
  const logs = parse(localStorage, 'budil_operation_logs', []);
  assert(candidates.length === 1, 'repeated report/title not-needed should not duplicate candidates');
  assert(candidates[0].status === 'not_needed', 'candidate should remain not_needed');
  assert(logs.filter(l => l.action === 'action_candidate_not_needed').length === 1,
    'today action not-needed should log once for repeated same operation');
}

{
  const { ctx, localStorage } = createSandbox({
    budil_revenue_records: JSON.stringify([{ id: 'rev_real', amount: 10000 }]),
    budil_documents: JSON.stringify([{ id: 'doc_real' }]),
    budil_reception_intakes: JSON.stringify([{ id: 'intake_real' }]),
    budil_work_orders: JSON.stringify([{ id: 'work_real' }])
  });
  runInContext(`Storage.markActionCandidateNotNeeded('', { sourceReportId: 'report-2', title: '口コミ依頼する' })`, ctx);
  assert(parse(localStorage, 'budil_revenue_records', []).length === 1, 'revenue data must remain');
  assert(parse(localStorage, 'budil_documents', []).length === 1, 'documents must remain');
  assert(parse(localStorage, 'budil_reception_intakes', []).length === 1, 'reception intakes must remain');
  assert(parse(localStorage, 'budil_work_orders', []).length === 1, 'work orders must remain');
}

const sourceText = readSourceFiles(root).map(p => readFileSync(p, 'utf8')).join('\n');
assert(!(new RegExp('localStorage' + '\\.clear\\s*\\(')).test(sourceText), 'direct localStorage clear must not exist');
assert(!(new RegExp('saveRevenueRecords' + '\\s*\\(\\s*\\[\\s*\\]\\s*\\)')).test(sourceText), 'empty revenue save must not exist');

console.log('All v4.8.13 not-needed fix checks passed.');
