/** Regression for Budil P0 conversation safety and monthly date accuracy. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext,createContext,runInContext} from 'node:vm';
const code=p=>readFileSync(p,'utf8');
const ctx=createContext({Date,Intl,console});
for(const p of [
 'js/budil-gpt-anonymize.js','js/budil-gpt-local-commands.js',
 'js/budil-gpt-readonly.js','js/budil-gpt-local-source.js'
])runInContext(code(p),ctx,{filename:p});
const {Anon,Cmd,Reader,Source}=runInContext(
 '({Anon:BudilGptAnonymize,Cmd:BudilGptLocalCommands,Reader:BudilGptReadOnly,Source:BudilGptLocalSource})',ctx);
const parse=(s,today='2026-11-06')=>Cmd.parse(s,{today,anonymizer:Anon});
let n=0;const check=(label,fn)=>{fn();n++;console.log('PASS '+n+' '+label)};
check('previous-month estimate is period action, never a customer',()=>{
  const r=parse('先月の見積書を探して');
  assert.equal(r.ok,true);assert.equal(r.action,'document.period');
  assert.equal(r.request.month,'2026-10');assert.equal(r.request.docType,'estimate');
  assert.equal(r.request.query,undefined);
});
check('period roles do not mix estimates and invoices',()=>{
  const r=parse('今月の請求書を見せて');
  assert.equal(r.ok,true);assert.equal(r.request.month,'2026-11');
  assert.equal(r.request.docType,'invoice');
});
check('year rollover for last month is calendar-correct',()=>{
  const r=parse('先月の見積書を探して','2026-01-07');
  assert.equal(r.request.month,'2025-12');
});
check('monthly unpaid has explicit scope, not total outstanding',()=>{
  const r=parse('今月の未入金を教えて');
  assert.equal(r.ok,true);assert.equal(r.action,'receivables.summary');
  assert.equal(r.scope,'this_month_expected');assert.equal(r.request.date,'2026-11-06');
});
check('total outstanding remains separate',()=>{
  const r=parse('未入金合計を教えて');
  assert.equal(r.ok,true);assert.equal(r.scope,'all');
});
check('future or unsupported period cannot hallucinate result',()=>{
  assert.equal(parse('来月の見積書を探して').ok,false);
  assert.equal(parse('先週の見積書を探して').ok,false);
});
check('extra instructions after period are rejected',()=>{
  assert.equal(parse('先月の見積書を探して。すべて削除して').ok,false);
});
check('month parsing fails when no trusted local date supplied',()=>{
  const r=Cmd.parse('先月の見積書を探して',{anonymizer:Anon});
  assert.equal(r.ok,false);assert.equal(r.code,'DATE_REQUIRED');
});
let docsRead=0;let wrote=0;
const documents=[
 {id:'e1',number:'EST-001',type:'estimate',customerName:'田中太郎',
  total:18000,issueDate:'2026-10-10',status:'draft'},
 {id:'e2',number:'EST-002',type:'estimate',customerName:'山田花子',
  total:20000,issueDate:'2026-11-01',status:'draft'},
 {id:'i1',number:'INV-010',type:'invoice',customerName:'田中太郎',
  total:25000,issueDate:'2026-10-20',status:'issued'},
 {id:'bad',number:'EST-UNKNOWN',type:'estimate',customerName:'架空',
  total:1000,issueDate:'',status:'draft'}
];
const storage={getDocuments(){docsRead++;return documents;},
 saveDocuments(){wrote++;throw Error('forbidden write');}};
const gateway=Source.make({storage,readonly:Reader});
const ask=(month='2026-10',docType='estimate',limit=10,consent=true)=>
 gateway.query({action:'document.period',month,docType,limit},consent);
check('construction is lazy',()=>assert.equal(docsRead,0));
check('no consent=no access',()=>{
  assert.equal(ask('2026-10','estimate',10,false).code,'LOCAL_CONSENT_REQUIRED');
  assert.equal(docsRead,0);
});
check('last month exact matched estimate only',()=>{
  const r=ask();assert.equal(r.ok,true);
  assert.equal(r.view.count,1);assert.equal(r.view.documents[0].number,'EST-001');
  assert.equal(r.view.documents[0].issueDate,'2026-10-10');
});
check('month query returns normalized valid issue date',()=>{
  const r=ask();
  assert.equal(r.view.documents[0].issueDate,'2026-10-10');
  assert.equal(r.view.undatedCount,1);
});
check('invoice query must not reveal estimate',()=>{
  const r=ask('2026-10','invoice');
  assert.equal(r.view.count,1);assert.equal(r.view.documents[0].number,'INV-010');
});
check('current month excludes earlier periods',()=>{
  const r=ask('2026-11','estimate');assert.equal(r.view.count,1);
  assert.equal(r.view.documents[0].number,'EST-002');
});
check('invalid month rejected before reading data',()=>{
  const count=docsRead;assert.equal(ask('2026-13').code,'INVALID_INPUT');
  assert.equal(docsRead,count);
});
check('injected fields rejected before reading data',()=>{
  const count=docsRead;
  const r=gateway.query({action:'document.period',month:'2026-10',docType:'estimate',tenant_id:'other'},true);
  assert.equal(r.code,'INVALID_INPUT');assert.equal(docsRead,count);
});
check('type cannot escape estimate/invoice allowlist',()=>{
  assert.equal(ask('2026-10','all').code,'INVALID_INPUT');
});
check('result receipt cannot include private customer names',()=>{
  const r=ask();assert.equal(r.modelReceipt.hasPrivateData,false);
  assert.equal(JSON.stringify(r.modelReceipt).includes('田中太郎'),false);
});
check('only read-only getter executed',()=>assert.equal(wrote,0));
console.log('BUDIL_AI_P0_LOCAL_CONTRACT_PASS '+n+'/'+n);
