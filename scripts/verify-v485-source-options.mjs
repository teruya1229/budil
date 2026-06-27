/**
 * Budil v4.8.7 source option verification.
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = join(root, 'js');

function loadScript(name) {
  return readFileSync(join(jsDir, name), 'utf8');
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log('== v4.8.7 source options check ==');
for (const file of ['revenue-brain.js', 'revenue-summary-brain.js', 'reception-brain.js']) {
  execSync(`node --check "${join(jsDir, file)}"`, { stdio: 'inherit' });
}

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
  parseInt,
  undefined,
  MapBrain: { detectAreaFromAddress: () => '' }
});

for (const file of ['revenue-brain.js', 'revenue-summary-brain.js', 'reception-brain.js']) {
  runInContext(loadScript(file), ctx, { filename: file });
}

const result = runInContext(`
  ({
    sources: RevenueBrain.SOURCES,
    matches: {
      lp: ReceptionBrain.matchRevenueSource('Google広告'),
      tel: ReceptionBrain.matchRevenueSource('110番'),
      market: ReceptionBrain.matchRevenueSource('くらしのマーケット'),
      yamada: ReceptionBrain.matchRevenueSource('ヤマダ'),
      coop: ReceptionBrain.matchRevenueSource('コープ'),
      other: ReceptionBrain.matchRevenueSource('LINE')
    },
    summary: {
      google: RevenueSummaryBrain.getRevenueSource({ source: 'Google広告' }),
      oldDirect: RevenueSummaryBrain.getRevenueSource({ source: '直予約' }),
      yamada: RevenueSummaryBrain.getRevenueSource({ source: 'ヤマダ' })
    }
  });
`, ctx);

assert(JSON.stringify(result.sources) === JSON.stringify(['LP', '110番', 'くらしのマーケット', 'ヤマダ', 'コープ', 'その他']), 'RevenueBrain.SOURCES should be the v4.8.7 six options');
assert(result.matches.lp === 'LP', 'Google-like source should map to LP');
assert(result.matches.tel === '110番', '110 source should map to 110番');
assert(result.matches.market === 'くらしのマーケット', 'market source should stay market');
assert(result.matches.yamada === 'ヤマダ', 'ヤマダ source should stay ヤマダ');
assert(result.matches.coop === 'コープ', 'コープ source should stay コープ');
assert(result.matches.other === 'その他', 'out-of-master source should map to その他');
assert(result.summary.google === 'LP', 'summary alias should map Google広告 to LP');
assert(result.summary.oldDirect === 'その他', 'summary alias should map old direct booking to その他');
assert(result.summary.yamada === 'ヤマダ', 'summary alias should keep ヤマダ');

const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
const appJs = loadScript('app.js');
assert(indexHtml.includes('<select id="reception-source">'), 'reception source should be a select');
assert(indexHtml.includes('<select id="work-order-source">'), 'work order source should be a select');
assert(appJs.includes('fillSourceSelectOptions'), 'app should use common source select filler');

console.log('OK: source options and source inheritance helpers');
