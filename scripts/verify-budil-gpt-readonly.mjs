import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const src=p=>readFileSync(join(root,p),'utf8');
const ctx=createContext({Date,Intl,console});
for(const p of ['js/customer-resolve-entrypoint.js','js/payment-brain.js','js/budil-gpt-readonly.js'])runInContext(src(p),ctx,{filename:p});
const modules=runInContext('({r:BudilGptReadOnly,c:CustomerResolveEntrypoint,p:PaymentBrain})',ctx);
const {r,c,p}=modules;
const leads=[{id:'fixture1',name:'田中太郎',phone:'09012345678',email:'fake@invalid.test',area:'南城市',address:'秘密住所'},{id:'fixture2',name:'田中太郎',phone:'09098765432',area:'糸満市'},{id:'fixture3',name:'比嘉清子',phone:'09012345678',area:'与那原町'}];
const docs=[
{id:'fixture-d1',type:'estimate',number:'EST-01',customerName:'比嘉清子',total:18000,issueDate:'2026-11-05',status:'draft',memo:'秘密'},
{id:'fixture-d2',type:'invoice',number:'INV-01',customerName:'比嘉清子',total:20000,issueDate:'2026-11-05',status:'issued',paymentStatus:'pending',paidAmount:0,unpaidAmount:20000,expectedPaymentDate:'2026-11-20',memo:'秘密'},
{id:'fixture-d3',type:'invoice',number:'INV-02',customerName:'田中太郎',total:5000,issueDate:'2026-10-22',status:'issued',paymentStatus:'paid',paidAmount:5000,unpaidAmount:0}];
const work=[{id:'fixture-w1',customerName:'比嘉清子',scheduledDate:'2026-11-13',status:'confirmed',address:'秘密住所'}];
let reads=0;
const deps={customerResolver:c,paymentBrain:p,profitBrain:{getPeriodProfitSummary({monthKey}){assert.equal(monthKey,'2026-11');return {monthRevenue:30000,monthExpense:5000,monthGrossProfit:25000,confirmedRevenue:25000,confirmedProfit:20000,plannedForecastProfit:5000};}},getExpenseRecords:()=>{reads++;return[{date:'2026-11-01',amount:5000}];},getLeads:()=>{reads++;return leads;},getDocuments:()=>{reads++;return docs;},getWorkOrders:()=>{reads++;return work;},getRevenueRecords:()=>{reads++;return [];}};
const query=(action,value,extra={})=>r.perform({action,query:value,...extra},deps,true);
let n=0;
const check=(name,fn)=>{fn();n++;console.log('PASS '+n+'. '+name)};
function privateSafe(result){
const receipt=JSON.stringify(result.modelReceipt);
for(const word of ['比嘉','田中','090','fixture-','@','秘密','20000'])assert.ok(!receipt.includes(word));
assert.equal(result.modelReceipt.canExecute,false);
assert.equal(result.modelReceipt.hasPrivateData,false);
assert.equal(result.persisted,false);
}
check('deny before consent without reading',()=>{const x=reads;assert.equal(r.perform({action:'customer.search',query:'田中太郎'},deps,false).code,'LOCAL_CONSENT_REQUIRED');assert.equal(x,reads)});
check('refuse forbidden action',()=>assert.equal(query('customer.delete','田中太郎').code,'INVALID_INPUT'));
check('refuse request-provided tenant',()=>assert.equal(r.perform({action:'customer.search',query:'田中太郎',tenant_id:'another'},deps,true).code,'INVALID_INPUT'));
check('refuse array',()=>assert.equal(r.perform([],deps,true).ok,false));
check('one exact customer requires selection',()=>{const o=query('customer.search','比嘉清子');assert.equal(o.view.candidates.length,1);assert.equal(o.view.requiresUserConfirmation,true);assert.equal(o.view.selectedCustomerId,null);privateSafe(o)});
check('multiple same-name customers not auto-selected',()=>{const o=query('customer.search','田中太郎');assert.equal(o.view.candidates.length,2);assert.equal(o.view.requiresUserConfirmation,true)});
check('surname lookup only offers masked candidates',()=>{
  const o=query('customer.search','田中');
  assert.equal(o.view.candidateCount,2);
  assert.equal(o.view.status,'surname_suggestions');
  assert.equal(o.view.requiresUserConfirmation,true);
  assert.equal(o.view.selectedCustomerId,null);
  assert.equal(o.view.candidates.length,2);
  assert.equal(o.view.candidates[0].maskedPhone.endsWith('5678'),true);
  assert.ok(!JSON.stringify(o.view).includes('09012345678'));
  privateSafe(o);
});
check('bounded suggestions never return more than requested limit',()=>{
  const o=query('customer.search','田中',{limit:1});
  assert.equal(o.view.candidateCount,2);
  assert.equal(o.view.status,'too_many');
  assert.equal(o.view.candidates.length,0);
  privateSafe(o);
});
check('one character and substring searches do not guess identities',()=>{
  assert.equal(query('customer.search','田').view.candidateCount,0);
  assert.equal(query('customer.search','太郎').view.candidateCount,0);
});
check('invalid and long query rejected',()=>{assert.equal(query('customer.search','田中'.repeat(80)).ok,false);assert.equal(query('customer.search','.*').view.candidateCount,0)});
check('document only safe metadata',()=>{const o=query('document.search','比嘉清子');assert.equal(o.view.documents.length,2);assert.equal('memo' in o.view.documents[0],false);privateSafe(o)});
check('document number and type exact',()=>{assert.equal(query('document.search','INV-01').view.documents.length,1);assert.equal(query('document.search','請求書').view.documents.length,2);assert.equal(query('document.search','請').view.documents.length,0)});
check('too many documents does not reveal partial list',()=>{const o=query('document.search','比嘉清子',{limit:1});assert.equal(o.view.tooMany,true);assert.equal(o.view.documents.length,0);privateSafe(o)});
check('work metadata excludes private address',()=>{const o=query('work.search','比嘉清子');assert.equal(o.view.workOrders.length,1);assert.equal('address' in o.view.workOrders[0],false);privateSafe(o)});
check('customer history demands explicit selection of an exact ID',()=>{
 const found=query('customer.timeline','田中');
 assert.equal(found.ok,true);
 assert.equal(found.view.candidateCount,2);
 assert.equal(found.view.selectedCustomerId,null);
 assert.equal('customerMemo' in found.view,false);
 privateSafe(found);
 const denied=r.perform({action:'customer.timeline.detail',customerId:'fixture1',limit:10},deps,false);
 assert.equal(denied.code,'LOCAL_CONSENT_REQUIRED');
});
check('customer history includes only linked jobs and existing asset fields',()=>{
 const original=leads[0];
 original.customerTypeMajor='A';
 original.customerTypeMinor='F';
 original.customerMemo='現場は駐車不可、室外機高所';
 original.activityLogs=[{date:'2026-11-04',title:'現場連絡',memo:'養生を優先'}];
 original.salesHistory=[{at:'2026-11-05T10:00:00Z',type:'電話',note:'工事日調整'}];
 work.push({id:'work-linked',customerName:'別名表記',leadId:'fixture1',scheduledDate:'2026-11-03',serviceText:'エアコン洗浄',status:'completed',memo:'天井高い'});
 work.push({id:'work-same-name',customerName:'田中太郎',leadId:'fixture2',scheduledDate:'2026-11-02',memo:'他人の作業'});
 deps.getReceptionIntakes=()=>[{id:'intake-1',relatedLeadId:'fixture1'}];
 work.push({id:'work-intake',customerName:'同名でなくてもよい',intakeId:'intake-1',scheduledDate:'2026-11-01',serviceText:'配管点検'});
 deps.getRevenueRecords=()=>[{id:'rev-linked',leadId:'fixture1',workDate:'2026-10-20',service:'洗浄',amount:19000,memo:'実施済'},
   {id:'rev-other',leadId:'fixture2',workDate:'2026-11-03',service:'他人の売上',amount:40000}];
 const result=r.perform({action:'customer.timeline.detail',customerId:'fixture1',limit:10},deps,true);
 assert.equal(result.ok,true);
 assert.equal(result.view.customerTypeMajor,'A');
 assert.equal(result.view.customerTypeMinor,'F');
 assert.ok(result.view.customerMemo.includes('駐車不可'));
 assert.equal(result.view.linkedWorkCount,2);
 assert.equal(result.view.linkedRevenueCount,1);
 assert.equal(result.view.recordCount,5);
 assert.ok(result.view.records.some(x=>x.label==='エアコン洗浄'));
 assert.ok(result.view.records.some(x=>x.label==='配管点検'));
 assert.ok(result.view.records.some(x=>x.label==='洗浄'));
 assert.ok(!JSON.stringify(result.view.records).includes('他人の作業'));
 assert.ok(!JSON.stringify(result.view.records).includes('他人の売上'));
 privateSafe(result);
});
check('unknown IDs, spoofed claims and incomplete data fail closed',()=>{
 assert.equal(r.perform({action:'customer.timeline.detail',customerId:'missing'},deps,true).code,'CUSTOMER_NOT_FOUND');
 assert.equal(r.perform({action:'customer.timeline.detail',customerId:'fixture1',tenant_id:'x'},deps,true).code,'INVALID_INPUT');
 assert.equal(r.perform({action:'customer.timeline.detail',customerId:'fixture1'},{
   getLeads:()=>leads,getWorkOrders:()=>work,getRevenueRecords:()=>[],
   customerResolver:c
 },true).code,'DEPENDENCY_MISSING');
});
check('customer history allows deliberate bounded paging only',()=>{
 const lead=leads[0];
 const previous=lead.activityLogs;
 lead.activityLogs=Array.from({length:18},(_,i)=>({
   date:'2026-11-'+String(i+1).padStart(2,'0'),title:'点検記録'+i,memo:'架空記録'+i
 }));
 const first=r.perform({action:'customer.timeline.detail',customerId:'fixture1',limit:10},deps,true);
 assert.equal(first.ok,true);
 assert.equal(first.view.records.length,10);
 assert.equal(first.view.hasMore,true);
 const next=r.perform({action:'customer.timeline.detail',customerId:'fixture1',limit:10,offset:10},deps,true);
 assert.equal(next.ok,true);
 assert.equal(next.view.offset,10);
 assert.equal(next.view.records.length,10);
 assert.equal(next.view.hasMore,true);
 assert.equal(r.perform({action:'customer.timeline.detail',customerId:'fixture1',offset:-1},deps,true).code,'INVALID_INPUT');
 assert.equal(r.perform({action:'customer.timeline.detail',customerId:'fixture1',limit:100},deps,true).code,'INVALID_INPUT');
 privateSafe(next);
 lead.activityLogs=previous;
});
check('impossible date refused',()=>assert.equal(r.perform({action:'receivables.summary',date:'2026-02-30'},deps,true).ok,false));
check('payment brain aggregate only',()=>{const o=r.perform({action:'receivables.summary',date:'2026-11-05'},deps,true);assert.equal(o.ok,true);assert.equal(o.view.pendingTotal,20000);assert.equal(o.view.count,1);assert.equal(o.view.paidStatusChanged,false);privateSafe(o)});
check('profit uses existing calculator and exposes only aggregate',()=>{
  const o=r.perform({action:'profit.summary',date:'2026-11-06'},deps,true);
  assert.equal(o.ok,true);assert.equal(o.view.monthGrossProfit,25000);
  assert.equal(o.view.approximation,true);assert.equal(o.view.noBankReconciliation,true);
  privateSafe(o);
});
check('profit requires consent and valid date',()=>{
  assert.equal(r.perform({action:'profit.summary',date:'2026-11-06'},deps,false).code,'LOCAL_CONSENT_REQUIRED');
  assert.equal(r.perform({action:'profit.summary',date:'2026-02-30'},deps,true).code,'INVALID_INPUT');
});
check('relative date refused',()=>assert.equal(r.perform({action:'receivables.summary',date:'today'},deps,true).ok,false));
check('unexpected filter refused',()=>assert.equal(r.perform({action:'receivables.summary',date:'2026-11-05',query:'田中'},deps,true).ok,false));
check('no implicit Storage dependency',()=>assert.equal(r.perform({action:'customer.search',query:'比嘉清子'},{customerResolver:c},true).code,'DEPENDENCY_MISSING'));
check('reader exception safe',()=>{const x=r.perform({action:'document.search',query:'比嘉清子'},{getDocuments(){throw Error('private content')}},true);assert.equal(x.code,'READ_UNAVAILABLE');assert.ok(!JSON.stringify(x).includes('private content'))});
check('read-only actions include bounded work date search',()=>assert.deepEqual(Array.from(r.ACTIONS),['customer.search','customer.timeline','customer.timeline.detail','document.search','document.period','work.search','work.date','receivables.summary','profit.summary']));
check('no network or storage mutations in source',()=>assert.ok(!/(?:\bfetch\(|\blocalStorage\.|Storage\.(?:set|add|update|save|delete)|\.insert\(|\.upsert\(|\.update\(|\.delete\(|\.apply\()/.test(src('js/budil-gpt-readonly.js'))));
console.log('Budil GPT local read-only adapter '+n+'/'+n+' PASS');
