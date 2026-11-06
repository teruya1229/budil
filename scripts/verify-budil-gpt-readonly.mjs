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
const deps={customerResolver:c,paymentBrain:p,getLeads:()=>{reads++;return leads;},getDocuments:()=>{reads++;return docs;},getWorkOrders:()=>{reads++;return work;},getRevenueRecords:()=>{reads++;return [];}};
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
check('partial name has no match',()=>assert.equal(query('customer.search','田中').view.candidateCount,0));
check('invalid and long query rejected',()=>{assert.equal(query('customer.search','田中'.repeat(80)).ok,false);assert.equal(query('customer.search','.*').view.candidateCount,0)});
check('document only safe metadata',()=>{const o=query('document.search','比嘉清子');assert.equal(o.view.documents.length,2);assert.equal('memo' in o.view.documents[0],false);privateSafe(o)});
check('document number and type exact',()=>{assert.equal(query('document.search','INV-01').view.documents.length,1);assert.equal(query('document.search','請求書').view.documents.length,2);assert.equal(query('document.search','請').view.documents.length,0)});
check('too many documents does not reveal partial list',()=>{const o=query('document.search','比嘉清子',{limit:1});assert.equal(o.view.tooMany,true);assert.equal(o.view.documents.length,0);privateSafe(o)});
check('work metadata excludes private address',()=>{const o=query('work.search','比嘉清子');assert.equal(o.view.workOrders.length,1);assert.equal('address' in o.view.workOrders[0],false);privateSafe(o)});
check('impossible date refused',()=>assert.equal(r.perform({action:'receivables.summary',date:'2026-02-30'},deps,true).ok,false));
check('payment brain aggregate only',()=>{const o=r.perform({action:'receivables.summary',date:'2026-11-05'},deps,true);assert.equal(o.ok,true);assert.equal(o.view.pendingTotal,20000);assert.equal(o.view.count,1);assert.equal(o.view.paidStatusChanged,false);privateSafe(o)});
check('relative date refused',()=>assert.equal(r.perform({action:'receivables.summary',date:'today'},deps,true).ok,false));
check('unexpected filter refused',()=>assert.equal(r.perform({action:'receivables.summary',date:'2026-11-05',query:'田中'},deps,true).ok,false));
check('no implicit Storage dependency',()=>assert.equal(r.perform({action:'customer.search',query:'比嘉清子'},{customerResolver:c},true).code,'DEPENDENCY_MISSING'));
check('reader exception safe',()=>{const x=r.perform({action:'document.search',query:'比嘉清子'},{getDocuments(){throw Error('private content')}},true);assert.equal(x.code,'READ_UNAVAILABLE');assert.ok(!JSON.stringify(x).includes('private content'))});
check('five read-only actions including bounded month search',()=>assert.deepEqual(Array.from(r.ACTIONS),['customer.search','document.search','document.period','work.search','receivables.summary']));
check('no network or storage mutations in source',()=>assert.ok(!/(?:\bfetch\(|\blocalStorage\.|Storage\.(?:set|add|update|save|delete)|\.insert\(|\.upsert\(|\.update\(|\.delete\(|\.apply\()/.test(src('js/budil-gpt-readonly.js'))));
console.log('Budil GPT local read-only adapter '+n+'/20 PASS');
