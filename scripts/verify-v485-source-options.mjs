/**
 * Budil v4.8.5 - 依頼元共通マスター検証
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = join(root, 'js');

const EXPECTED_SOURCES = ['LP', '110番', 'くらしのマーケット', 'ヤマダ', 'コープ', 'その他'];
const OLD_SOURCES = ['直予約', 'LINE', 'Airリザーブ', 'Google広告', 'Googleビジネスプロフィール', '紹介', '法人'];

function loadScript(name) {
  return readFileSync(join(jsDir, name), 'utf8');
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log('== v4.8.5 source options check ==');
execSync(`node --check "${join(jsDir, 'revenue-brain.js')}"`, { stdio: 'inherit' });
execSync(`node --check "${join(jsDir, 'reception-brain.js')}"`, { stdio: 'inherit' });

const ctx = createContext({
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
  undefined,
  MapBrain: { detectAreaFromAddress: () => '' }
});

runInContext(loadScript('revenue-brain.js'), ctx, { filename: 'revenue-brain.js' });
runInContext(loadScript('reception-brain.js'), ctx, { filename: 'reception-brain.js' });

const sources = runInContext('RevenueBrain.SOURCES', ctx);
assert(JSON.stringify(sources) === JSON.stringify(EXPECTED_SOURCES), `SOURCES mismatch: ${JSON.stringify(sources)}`);
OLD_SOURCES.forEach(old => {
  assert(!sources.includes(old), `old source still in SOURCES: ${old}`);
});

const normalizeCases = runInContext(`
  ({
    yamada: RevenueBrain.normalizeSourceForForm('ヤマダ'),
    yamadaDenki: RevenueBrain.normalizeSourceForForm('ヤマダ電機'),
    coop: RevenueBrain.normalizeSourceForForm('コープ'),
    kurashi: RevenueBrain.normalizeSourceForForm('くらし'),
    b110: RevenueBrain.normalizeSourceForForm('110番から'),
    lp: RevenueBrain.normalizeSourceForForm('ホームページ'),
    line: RevenueBrain.normalizeSourceForForm('LINE'),
    empty: RevenueBrain.normalizeSourceForForm(''),
    unknown: RevenueBrain.normalizeSourceForForm('不明')
  })
`, ctx);

assert(normalizeCases.yamada === 'ヤマダ', 'normalize ヤマダ');
assert(normalizeCases.yamadaDenki === 'ヤマダ', 'normalize ヤマダ電機');
assert(normalizeCases.coop === 'コープ', 'normalize コープ');
assert(normalizeCases.kurashi === 'くらしのマーケット', 'normalize くらし');
assert(normalizeCases.b110 === '110番', 'normalize 110番');
assert(normalizeCases.lp === 'LP', 'normalize LP');
assert(normalizeCases.line === 'その他', 'normalize legacy LINE');
assert(normalizeCases.empty === 'その他', 'normalize empty');
assert(normalizeCases.unknown === 'その他', 'normalize 不明');

const inferCases = runInContext(`
  ({
    lp: ReceptionBrain.inferSourceFromText('ホームページから問い合わせ\\n氏名：テスト 太郎 様'),
    b110: ReceptionBrain.inferSourceFromText('110番からの依頼\\n氏名：テスト 太郎 様'),
    kurashi: ReceptionBrain.inferSourceFromText('くらしのマーケット予約\\n氏名：テスト 太郎 様'),
    yamada: ReceptionBrain.inferSourceFromText('ヤマダ案件\\n依頼番号：2167-26T0626-037\\n氏名：テスト 太郎 様'),
    coop: ReceptionBrain.inferSourceFromText('コープ案件\\n氏名：テスト 太郎 様'),
    other: ReceptionBrain.inferSourceFromText('電話で問い合わせ\\n氏名：テスト 太郎 様')
  })
`, ctx);

assert(inferCases.lp === 'LP', 'infer LP');
assert(inferCases.b110 === '110番', 'infer 110番');
assert(inferCases.kurashi === 'くらしのマーケット', 'infer くらし');
assert(inferCases.yamada === 'ヤマダ', 'infer ヤマダ');
assert(inferCases.coop === 'コープ', 'infer コープ');
assert(inferCases.other === 'その他', 'infer その他');

const pasteCases = runInContext(`
  ({
    labeled: ReceptionBrain.parseAiBantouPaste('依頼元：ヤマダ\\n氏名：平良 真俊 様').source,
    inferred: ReceptionBrain.parseAiBantouPaste('ヤマダ案件\\n氏名：テスト 太郎 様').source,
    revenueMatch: ReceptionBrain.matchRevenueSource('ヤマダ')
  })
`, ctx);

assert(pasteCases.labeled === 'ヤマダ', 'labeled paste source');
assert(pasteCases.inferred === 'ヤマダ', 'inferred paste source');
assert(pasteCases.revenueMatch === 'ヤマダ', 'matchRevenueSource ヤマダ');

const html = readFileSync(join(root, 'index.html'), 'utf8');
assert(html.includes('<select id="reception-source">'), 'reception-source should be select');
assert(!html.includes('id="reception-source" placeholder'), 'reception-source should not be text input');
assert(html.includes('v4.8.5'), 'index.html should show v4.8.5');

console.log('OK: source options, normalization, inference, reception/revenue master');
