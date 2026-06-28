/**
 * Budil v4.8.20 input clear, margin default, and reception UI verification.
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = join(root, 'js');

function load(path) {
  return readFileSync(join(root, path), 'utf8');
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log('== v4.8.20 input clear and margin check ==');
for (const file of ['revenue-brain.js', 'reception-brain.js', 'work-order-brain.js', 'work-completion-brain.js', 'app.js']) {
  execSync(`node --check "${join(jsDir, file)}"`, { stdio: 'inherit' });
}

const ctx = createContext({ console, Object, String, Number, Array, RegExp, undefined });
runInContext(load('js/revenue-brain.js'), ctx, { filename: 'revenue-brain.js' });

const defaults = runInContext(`({
  yamada: RevenueBrain.getDefaultGrossProfitRateBySource('ヤマダ'),
  kurashi: RevenueBrain.getDefaultGrossProfitRateBySource('くらしのマーケット'),
  lp: RevenueBrain.getDefaultGrossProfitRateBySource('LP'),
  other: RevenueBrain.getDefaultGrossProfitRateBySource('その他'),
  oneTen: RevenueBrain.getDefaultGrossProfitRateBySource('110番'),
  coop: RevenueBrain.getDefaultGrossProfitRateBySource('コープ'),
  yamadaAlias: RevenueBrain.getDefaultGrossProfitRateBySource('ヤマダ電機')
})`, ctx);

assert(defaults.yamada === 60, 'ヤマダ should default gross margin to 60');
assert(defaults.kurashi === 80, 'くらしのマーケット should default gross margin to 80');
assert(defaults.lp === 100, 'LP should default gross margin to 100');
assert(defaults.other === null, 'その他 should not auto-fill gross margin');
assert(defaults.oneTen === null, '110番 should not auto-fill gross margin');
assert(defaults.coop === null, 'コープ should not auto-fill gross margin');
assert(defaults.yamadaAlias === 60, 'ヤマダ aliases should normalize to 60');

const indexHtml = load('index.html');
const appJs = load('js/app.js');

assert(indexHtml.includes('id="revenue-gross-margin-rate"'), 'revenue form should have gross margin input');
assert(indexHtml.includes('id="btn-reception-clear"') && indexHtml.includes('入力をクリア'), 'reception form should have clear button text');
assert(/card-reception-next hidden/.test(indexHtml), 'reception next-action card should be hidden by default');

assert(appJs.includes('applyRevenueGrossMarginDefault({ force: true })'), 'reception/work-order revenue fill should force margin default');
assert(appJs.includes('bindGrossMarginManualTracking'), 'gross margin manual tracking should be bound');
assert(appJs.includes('manualGrossMarginRate'), 'manual gross margin should be respected');
assert(appJs.includes('clearReceptionDraftInputs'), 'reception draft clear helper should exist');
assert(appJs.includes("document.getElementById('reception-paste-area')"), 'reception clear should touch paste area');
assert(appJs.includes("if (nextEl) nextEl.innerHTML = '';"), 'hidden next-action section should not render normal content');
assert(appJs.includes('grossMarginRate: grossMarginRateInput'), 'revenue form data should persist gross margin rate');

console.log('OK: v4.8.20 input clear, margin defaults, and next-action hiding');
