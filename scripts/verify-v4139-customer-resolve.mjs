/**
 * Budil v4.13.9 — leads Canonical Data の read-only customer-resolve verification.
 * 一時 fixture のみ。本番 localStorage / 公開環境 / 共通Chromeは使わない。
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  statSync
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createContext, runInContext } from 'node:vm';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const load = (path) => readFileSync(join(root, path), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
};
const sha256Hex = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');

for (const file of [
  'js/map-brain.js',
  'js/customer-resolve-entrypoint.js',
  'scripts/customer-resolve-cli.mjs'
]) {
  execSync(`node --check "${join(root, file)}"`, { stdio: 'inherit' });
}

console.log('== v4.13.9 customer-resolve (leads canonical) ==');

const entryJs = load('js/customer-resolve-entrypoint.js');
const cliJs = load('scripts/customer-resolve-cli.mjs');
assert(entryJs.includes('CustomerResolveEntrypoint'), 'entrypoint const must exist');
assert(entryJs.includes('needs_confirmation'), 'needs_confirmation required');
assert(entryJs.includes('ambiguous'), 'ambiguous required');
assert(entryJs.includes('maskPhone') && entryJs.includes('maskEmail'), 'mask helpers required');
assert(entryJs.includes('invoiceApplyAllowed: false') || entryJs.includes('invoiceApplyAllowed:false'), 'apply forbidden flag');
assert(cliJs.includes('customer-resolve'), 'CLI present');
assert(cliJs.includes('input_json_rejected') || cliJs.includes('INPUT_JSON_REJECTED'), 'reject --input-json');
assert(cliJs.includes('shape-probe'), 'shape-probe required');
assert(!cliJs.includes('bc-memory'), 'must not copy to Memory');
assert(!/safeLog\([^)]*phone/.test(cliJs), 'safeLog must not include phone');
assert(!/safeLog\([^)]*email/.test(cliJs), 'safeLog must not include email');
assert(!/console\.log\([^)]*displayName/.test(cliJs), 'CLI must not log displayName');

function createSandbox() {
  const ctx = createContext({
    console: { log() {}, info() {}, warn() {}, error() {} },
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
    undefined,
    RegExp,
    BigInt,
    module: { exports: {} },
    exports: {}
  });
  runInContext(load('js/map-brain.js'), ctx, { filename: 'map-brain.js' });
  runInContext(load('js/customer-resolve-entrypoint.js'), ctx, {
    filename: 'customer-resolve-entrypoint.js'
  });
  runInContext(
    'this.MapBrain = MapBrain; this.CustomerResolveEntrypoint = CustomerResolveEntrypoint;',
    ctx
  );
  return ctx;
}

const E = createSandbox().CustomerResolveEntrypoint;

const fixtureLeads = [
  {
    id: 'lead-fixture-morishita-001',
    company: '森下 太郎',
    phone: '090-1111-2222',
    email: 'morishita.taro@example.com',
    area: '南城市',
    address: '沖縄県南城市大里字○○1-2-3',
    memo: '秘密メモ本文は返却禁止'
  },
  {
    id: 'lead-fixture-morishita-002',
    company: '森下 太郎',
    phone: '080-3333-4444',
    email: 'other.morishita@example.com',
    area: '那覇市',
    address: '沖縄県那覇市おもろまち1-1',
    memo: '同姓同名fixture'
  },
  {
    id: 'lead-fixture-unique-phone',
    company: '一意 電話',
    phone: '098-999-8888',
    email: 'unique.phone@example.jp',
    area: '豊見城市'
  },
  {
    id: 'lead-fixture-unique-email',
    company: '一意 メール',
    phone: '',
    email: 'Unique.Email@Example.COM',
    area: '糸満市'
  }
];

// customerId 完全一致
{
  const r = E.resolve({ customerId: 'lead-fixture-morishita-001' }, { leads: fixtureLeads });
  assert(r.status === 'matched' && r.ok === true, 'customerId matched');
  assert(r.selectedCustomerId === 'lead-fixture-morishita-001', 'selectedCustomerId');
  assert(r.requiresUserConfirmation === false, 'customerId no confirmation');
  assert(r.invoiceApplyAllowed === false, 'no auto apply');
}

// customerId 不在
{
  const r = E.resolve({ customerId: 'no-such-lead' }, { leads: fixtureLeads });
  assert(r.status === 'not_found' && r.ok === false, 'customerId not_found');
}

// 氏名1件でも needs_confirmation
{
  const r = E.resolve({ name: '一意 電話' }, { leads: fixtureLeads });
  assert(r.status === 'needs_confirmation', 'single name needs_confirmation');
  assert(r.candidates.length === 1, 'single candidate');
  assert(!r.selectedCustomerId, 'must not auto-select');
}

// 同姓同名 ambiguous
{
  const r = E.resolve({ name: '森下 太郎' }, { leads: fixtureLeads });
  assert(r.status === 'ambiguous', 'ambiguous same name');
  assert(r.candidates.length === 2, 'two candidates');
}

// 電話正規化（ハイフン差）
{
  const r = E.resolve({ phone: '09011112222' }, { leads: fixtureLeads });
  assert(r.status === 'needs_confirmation', 'phone normalized match');
  assert(r.candidates[0].customerId === 'lead-fixture-morishita-001', 'phone hit id');
  assert(r.candidates[0].maskedPhone.endsWith('2222'), 'masked phone last4');
  assert(!String(JSON.stringify(r)).includes('090-1111-2222'), 'full phone not emitted');
}

// メール正規化（大文字小文字）
{
  const r = E.resolve({ email: 'unique.email@example.com' }, { leads: fixtureLeads });
  assert(r.status === 'needs_confirmation', 'email normalized');
  assert(r.candidates[0].customerId === 'lead-fixture-unique-email', 'email hit');
  assert(r.candidates[0].maskedEmail.includes('***'), 'masked email');
  assert(!String(JSON.stringify(r)).toLowerCase().includes('unique.email@example.com'), 'full email not emitted');
}

// 空入力拒否
{
  const r = E.resolve({}, { leads: fixtureLeads });
  assert(r.status === 'invalid_input', 'empty rejected');
}

// 候補上限
{
  const many = [];
  for (let i = 0; i < 12; i += 1) {
    many.push({ id: `dup-${i}`, company: '重複 太郎', phone: `0900000${String(i).padStart(4, '0')}` });
  }
  const r = E.resolve({ name: '重複 太郎', limit: 10 }, { leads: many });
  assert(r.status === 'too_many', 'too_many when over limit');
  assert(r.candidates.length === 0, 'candidates cleared on too_many');
}

// 住所全文・メモ非出力
{
  const r = E.resolve({ customerId: 'lead-fixture-morishita-001' }, { leads: fixtureLeads });
  const dumped = JSON.stringify(r);
  assert(!dumped.includes('大里'), 'full address not emitted');
  assert(!dumped.includes('秘密メモ'), 'memo not emitted');
  assert(r.candidates[0].municipality === '南城市', 'municipality only');
}

// CLI fixture
const tmp = mkdtempSync(join(tmpdir(), 'budil-customer-resolve-'));
const leadsPath = join(tmp, 'leads.json');
writeFileSync(leadsPath, `${JSON.stringify(fixtureLeads, null, 2)}\n`, 'utf8');
const hashBefore = sha256Hex(readFileSync(leadsPath));

function runCli(command, inputObj, extraArgs = []) {
  const args = [join(root, 'scripts/customer-resolve-cli.mjs'), command, '--leads-file', leadsPath, ...extraArgs];
  const input = inputObj == null ? '' : JSON.stringify(inputObj);
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    input,
    windowsHide: true
  });
  return result;
}

{
  const r = runCli('resolve', { customerId: 'lead-fixture-morishita-001' });
  assert(r.status === 0, 'CLI matched exit 0');
  const lines = (r.stdout || '').trim().split(/\r?\n/).filter(Boolean);
  assert(lines.length === 1, 'CLI single JSON line');
  const payload = JSON.parse(lines[0]);
  assert(payload.status === 'matched', 'CLI matched status');
  assert(!(r.stderr || '').includes('森下'), 'stderr no name PII');
  assert(!(r.stderr || '').includes('090'), 'stderr no phone PII');
}

{
  const r = runCli('resolve', { name: '一意 電話' });
  assert(r.status === 0, 'CLI needs_confirmation exit 0');
  const payload = JSON.parse(r.stdout.trim());
  assert(payload.status === 'needs_confirmation', 'CLI needs_confirmation');
}

{
  const r = runCli('resolve', { name: '森下 太郎' });
  assert(r.status === 0, 'CLI ambiguous exit 0');
  const payload = JSON.parse(r.stdout.trim());
  assert(payload.status === 'ambiguous', 'CLI ambiguous');
}

{
  const r = runCli('resolve', { customerId: 'missing' });
  assert(r.status === 1, 'CLI not_found exit 1');
}

{
  const r = runCli('resolve', {});
  assert(r.status === 2, 'CLI empty invalid exit 2');
}

{
  const huge = { name: 'あ'.repeat(500) };
  const r = runCli('resolve', huge);
  assert(r.status !== 0, 'CLI huge name rejected');
}

{
  const r = spawnSync(
    process.execPath,
    [join(root, 'scripts/customer-resolve-cli.mjs'), 'resolve', '--leads-file', leadsPath, '--input-json', '{"name":"x"}'],
    { cwd: root, encoding: 'utf8', input: '', windowsHide: true }
  );
  assert(r.status === 2, 'CLI rejects --input-json');
  const payload = JSON.parse((r.stdout || '').trim());
  assert(payload.code === 'INPUT_JSON_REJECTED', 'INPUT_JSON_REJECTED');
}

{
  const r = runCli('shape-probe', null);
  assert(r.status === 0, 'shape-probe exit 0');
  const payload = JSON.parse(r.stdout.trim());
  assert(payload.readable === true && payload.count === fixtureLeads.length, 'shape probe counts');
  assert(payload.hashMatch === true, 'shape probe hash match');
  assert(payload.piiEmitted === false, 'shape probe no pii flag');
  const dumped = JSON.stringify(payload);
  assert(!dumped.includes('森下'), 'shape probe no names');
  assert(!dumped.includes('example.com'), 'shape probe no emails');
}

const hashAfter = sha256Hex(readFileSync(leadsPath));
assert(hashAfter === hashBefore, 'leads file unchanged after CLI');
assert(statSync(leadsPath).size > 0, 'leads still present');

// 例外メッセージに PII を載せない（entrypoint）
{
  const r = E.resolve({ phone: 'not-a-phone!!!' }, { leads: fixtureLeads });
  assert(r.status === 'invalid_input', 'bad phone invalid');
  assert(!JSON.stringify(r).includes('not-a-phone'), 'exception payload no raw phone');
}

rmSync(tmp, { recursive: true, force: true });
console.log('PASS v4.13.9 customer-resolve');
