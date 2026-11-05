/**
 * Budil×GPT Phase1 isolated fixture regression tests.
 * Run: node scripts/verify-budil-gpt-phase1-fixture.mjs
 * No credentials, network, production storage or real customer data.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => readFileSync(join(root, p), 'utf8');
const ctx = createContext({ console: { log() {}, warn() {}, error() {} }, Date, Intl });
for (const p of [
  'js/documents-brain.js',
  'js/customer-resolve-entrypoint.js',
  'experiments/budil-gpt-phase1/fixture-core.js'
]) runInContext(load(p), ctx, { filename: p });
runInContext('this.BudilFixture = BudilGptFixtureCore; this.Doc = DocumentsBrain; this.Resolve = CustomerResolveEntrypoint;', ctx);
const F = ctx.BudilFixture;
const deps = { customerResolver: ctx.Resolve, documentsBrain: ctx.Doc };
let count = 0;
function check(label, fn) {
  fn();
  count += 1;
  console.log('PASS ' + label);
}
function makeSingle() {
  const s = F.createSession();
  assert.equal(F.start(s, '比嘉清子さんのエアコン洗浄2台を税込18,000円で見積して', deps).code, 'CANDIDATES');
  assert.equal(F.selectCustomer(s, 'fixture-c003', deps).code, 'DRAFT_READY');
  return s;
}
check('1. fictional customers only / no live Storage', () => {
  const customers = F.fixtureCustomers();
  assert.equal(customers.length, 4);
  assert.ok(customers.every((x) => x.isDemo === true));
  assert.ok(!/Storage\.|localStorage|fetch\(|XMLHttpRequest/.test(load('experiments/budil-gpt-phase1/fixture-core.js')));
});
check('2. single name candidate still requires explicit confirmation', () => {
  const s = F.createSession();
  const r = F.start(s, '比嘉清子さんのエアコン洗浄2台を税込18,000円で見積して', deps);
  assert.equal(r.candidates.length, 1);
  assert.equal(s.stage, 'candidate');
  assert.equal(F.getApprovedForPdf(s).code, 'NOT_APPROVED');
});
check('3. duplicate names remain ambiguous', () => {
  const s = F.createSession();
  const r = F.start(s, '田中太郎さんのエアコン洗浄2台を税込18,000円で見積して', deps);
  assert.equal(r.candidates.length, 2);
  assert.equal(s.stage, 'candidate');
  assert.equal(F.selectCustomer(s, 'fixture-c003', deps).code, 'CUSTOMER_SELECTION_INVALID');
});
check('4. unknown customer requires full name, then resolve', () => {
  const s = F.createSession();
  assert.equal(F.start(s, '田中さんのエアコン洗浄2台を税込18,000円で見積して', deps).code, 'CUSTOMER_NOT_FOUND');
  assert.equal(F.answerName(s, '比嘉清子さん', deps).code, 'CANDIDATES');
});
check('5. missing tax mode prompts for clarification', () => {
  const s = F.createSession();
  assert.equal(F.start(s, '比嘉清子さんのエアコン洗浄2台を18,000円で見積して', deps).code, 'NEEDS_TAX_MODE');
  assert.equal(F.answerTaxMode(s, '不明', deps).code, 'NEEDS_TAX_MODE');
  assert.equal(F.answerTaxMode(s, '税込', deps).code, 'CANDIDATES');
});
check('6. inclusive quote 18000 yen follows existing Budil calculation', () => {
  const s = makeSingle();
  assert.equal(s.draft.total, 18000);
  assert.equal(s.draft.tax, 1636);
  assert.equal(s.draft.subtotal, 16364);
  assert.equal(s.draft.taxSettings.taxDisplayMode, 'taxIncluded');
  assert.equal(s.draft.items.length, 1);
  assert.equal(s.draft.items[0].quantity, 2);
});
check('7. revision 20000 yen and approved immutable snapshot', () => {
  const s = makeSingle();
  assert.equal(F.revise(s, '金額を税込20,000円に変更', deps).code, 'DRAFT_REVISED');
  assert.equal(F.approve(s, 1).code, 'STALE_REVISION');
  assert.equal(F.approve(s, 2).code, 'APPROVED_FIXTURE');
  assert.equal(F.getApprovedForPdf(s).doc.total, 20000);
  const approved = F.getApprovedForPdf(s);
  approved.doc.total = 5;
  assert.equal(F.getApprovedForPdf(s).doc.total, 20000);
  assert.equal(F.approve(s, 2).code, 'APPROVAL_BLOCKED');
});
check('8. invalid revisions do not mutate draft', () => {
  const s = makeSingle();
  const before = JSON.stringify(s.draft);
  assert.equal(F.revise(s, '金額を税込-20,000円に変更', deps).ok, false);
  assert.equal(F.revise(s, '台数を3台に変更', deps).code, 'REVISION_SCOPE');
  assert.equal(JSON.stringify(s.draft), before);
});
check('9. invalid input (missing price, zero qty, service) rejects', () => {
  assert.equal(F.parseInitial('比嘉清子さんのエアコン洗浄2台を見積').code, 'AMOUNT_REQUIRED');
  assert.equal(F.parseInitial('比嘉清子さんのエアコン洗浄0台を税込18,000円で見積して').code, 'QTY_INVALID');
  assert.equal(F.parseInitial('比嘉清子さんの電気工事2件を税込18,000円で見積して').code, 'FORMAT_REQUIRED');
});
check('10. no unsafe auto-cost inference', () => {
  assert.equal(F.parseInitial('比嘉清子さんのエアコン洗浄2台を1台あたり税込9,000円で見積して').code, 'TOTAL_REQUIRED');
  assert.equal(F.parseInitial('比嘉清子さんのエアコン洗浄2台を税込18,000円と税込20,000円で見積して').code, 'AMOUNT_REQUIRED');
});
check('11. price and tax contradictions rejected', () => {
  assert.equal(F.parseInitial('比嘉清子さんのエアコン洗浄2台を税込税抜18,000円で見積して').code, 'TAX_CONFLICT');
  assert.equal(F.parseInitial('比嘉清子さんのエアコン洗浄2台を税込0円で見積して').code, 'AMOUNT_INVALID');
});
check('12. non-divisible total is not silently rounded', () => {
  const s = F.createSession();
  assert.equal(F.start(s, '比嘉清子さんのエアコン洗浄2台を税込18,001円で見積して', deps).code, 'CANDIDATES');
  assert.equal(F.selectCustomer(s, 'fixture-c003', deps).code, 'UNIT_PRICE_INTEGRITY');
  assert.equal(s.stage, 'candidate');
});
check('13. tax excluded uses DocumentsBrain, not LLM arithmetic', () => {
  const s = F.createSession();
  assert.equal(F.start(s, '比嘉清子さんのエアコン洗浄2台を税抜18,000円で見積して', deps).ok, true);
  F.selectCustomer(s, 'fixture-c003', deps);
  assert.equal(s.draft.subtotal, 18000);
  assert.equal(s.draft.tax, 1800);
  assert.equal(s.draft.total, 19800);
});
check('14. existing invoice/estimate layout is reused', () => {
  const s = makeSingle();
  const html = ctx.Doc.buildStandaloneDocumentHtml(s.draft, { cssText: '.doc-sheet { font-size: 12px; }', baseHref: 'https://example.org/budil/budil-gpt-phase1-demo.html' });
  assert.ok(html.includes('見積書'));
  assert.ok(html.includes('18,000円'));
  assert.ok(html.includes('【デモ・架空顧客】'));
  assert.ok(html.includes('/budil/assets/bc-service-seal.jpg'));
});
check('15. document/PDF path is existing Budil engine', () => {
  const ui = load('experiments/budil-gpt-phase1/fixture-ui.js');
  const html = load('budil-gpt-phase1-demo.html');
  assert.ok(ui.includes('BudilDocExport.downloadDocumentPdf'));
  assert.ok(html.includes('js/doc-export.js'));
  assert.ok(html.includes('js/documents-brain.js'));
  assert.ok(!ui.includes('Storage.'));
});
check('16. no production page/index or storage modification in fixture', () => {
  const core = load('experiments/budil-gpt-phase1/fixture-core.js');
  const ui = load('experiments/budil-gpt-phase1/fixture-ui.js');
  assert.ok(!/localStorage\.|sessionStorage\.|Storage\.getLeads|Storage\.addDocument|Calendar\.|fetch\(/.test(core + ui));
  assert.equal(F.createSession().stage, 'idle');
});
console.log('Budil×GPT Phase 1 fixture: ' + count + '/16 PASS');
