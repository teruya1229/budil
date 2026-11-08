import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
import{runInContext,createContext}from'node:vm';
import{join,dirname}from'node:path';
import{fileURLToPath}from'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const code=p=>readFileSync(join(root,p),'utf8');
const ctx=createContext({console,Date,Intl});
for(const p of ['js/customer-resolve-entrypoint.js','js/payment-brain.js','js/budil-gpt-readonly.js','js/budil-gpt-local-source.js'])runInContext(code(p),ctx,{filename:p});
const m=runInContext('({Resolver:CustomerResolveEntrypoint,Payment:PaymentBrain,ReadOnly:BudilGptReadOnly,Source:BudilGptLocalSource})',ctx);
let leads=0,docs=0,work=0,revenues=0,expenses=0,intakes=0,writes=0;
const storage={
 getLeads(){leads++;return[{id:'f1',name:'田中太郎',area:'南城市',phone:'09011112222'},{id:'f2',name:'田中太郎',area:'八重瀬町',phone:'09033334444'}];},
 getDocuments(){docs++;return[{id:'d1',type:'invoice',number:'INV-100',customerName:'田中太郎',total:18000,status:'issued',paymentStatus:'pending',paidAmount:0,unpaidAmount:18000,expectedPaymentDate:'2026-11-12'}];},
 getWorkOrders(){work++;return[{id:'w1',customerName:'田中太郎',status:'confirmed',scheduledDate:'2026-11-13'}];},
 getRevenueRecords(){revenues++;return[];},
 getReceptionIntakes(){intakes++;return[];},
 getExpenseRecords(){expenses++;return[];},
 saveLeads(){writes++;throw Error('write');},
 saveDocuments(){writes++;throw Error('write');}
};
const g=m.Source.make({storage,readonly:m.ReadOnly,customerResolver:m.Resolver,paymentBrain:m.Payment,profitBrain:{getPeriodProfitSummary(){return {monthRevenue:18000,monthExpense:0,monthGrossProfit:18000,confirmedRevenue:0,confirmedProfit:0,plannedForecastProfit:0};}}});
const q=(action,query)=>({action,query});
let n=0;function check(label,fn){fn();n++;console.log('PASS '+n+' '+label);}
check('constructor no data access',()=>assert.equal(leads+docs+work+revenues,0));
check('per-call consent required',()=>{assert.equal(g.query(q('customer.search','田中太郎'),false).code,'LOCAL_CONSENT_REQUIRED');assert.equal(leads,0);});
check('undefined consent denied',()=>{assert.equal(g.query(q('document.search','田中太郎')).ok,false);assert.equal(docs,0);});
check('unknown action denied before read',()=>{assert.equal(g.query(q('customer.delete','田中太郎'),true).code,'ACTION_NOT_ALLOWED');assert.equal(leads,0);});
check('exact name search invokes original resolver',()=>{const r=g.query(q('customer.search','田中太郎'),true);assert.equal(r.ok,true);assert.equal(r.view.candidates.length,2);assert.equal(docs,0);});
check('same name always demands selection',()=>{const r=g.query(q('customer.search','田中太郎'),true);assert.equal(r.view.selectedCustomerId,null);});
check('model receipt contains no phone or customer name',()=>{const r=g.query(q('customer.search','田中太郎'),true);assert.ok(!/田中|090|f1/.test(JSON.stringify(r.modelReceipt)));});
check('customer timeline lists candidates without private notes',()=>{
 const b={work,revenues,intakes};
 const result=g.query(q('customer.timeline','田中'),true);
 assert.equal(result.ok,true);
 assert.equal(result.view.candidateCount,2);
 assert.equal(result.view.selectedCustomerId,null);
 assert.equal('customerMemo' in result.view,false);
 assert.equal(work,b.work);assert.equal(revenues,b.revenues);assert.equal(intakes,b.intakes);
});
check('timeline details require an explicit second read consent',()=>{
 const detail={action:'customer.timeline.detail',customerId:'f1',limit:10};
 const before={leads,work,revenues,intakes};
 assert.equal(g.query(detail,false).code,'LOCAL_CONSENT_REQUIRED');
 assert.equal(leads,before.leads);assert.equal(work,before.work);
 assert.equal(revenues,before.revenues);assert.equal(intakes,before.intakes);
 const result=g.query(detail,true);
 assert.equal(result.ok,true);
 assert.equal(result.view.linkage,'exact_id_only');
 assert.equal(leads,before.leads+1);assert.equal(work,before.work+1);
 assert.equal(revenues,before.revenues+1);assert.equal(intakes,before.intakes+1);
 assert.equal(result.modelReceipt.hasPrivateData,false);
});
check('document search uses only document getter',()=>{const v=revenues;const r=g.query(q('document.search','田中太郎'),true);assert.equal(r.view.documents.length,1);assert.equal(revenues,v);});
check('work search uses only work getter',()=>{const v=leads;const r=g.query(q('work.search','田中太郎'),true);assert.equal(r.view.workOrders.length,1);assert.equal(leads,v);});
check('receivables stay unpaid with existing engine',()=>{const r=g.query({action:'receivables.summary',date:'2026-11-06'},true);assert.equal(r.ok,true);assert.equal(r.view.pendingTotal,18000);assert.equal(r.view.paidStatusChanged,false);});
check('profit reads only required sources and never writes',()=>{
 const before={docs,leads,expenses,work,revenues};
 const r=g.query({action:'profit.summary',date:'2026-11-06'},true);
 assert.equal(r.ok,true);assert.equal(r.view.monthGrossProfit,18000);
 assert.equal(docs,before.docs);assert.equal(leads,before.leads);
 assert.equal(expenses,before.expenses+1);
 assert.equal(work,before.work+1);assert.equal(revenues,before.revenues+1);
 assert.equal(writes,0);
});
check('unexpected tenant rejected',()=>assert.equal(g.query({action:'customer.search',query:'田中太郎',tenant_id:'other'},true).code,'INVALID_INPUT'));
check('calendar mutation forbidden',()=>assert.equal(g.query({action:'calendar.create',date:'2026-11-13'},true).ok,false));
check('exception hides private content',()=>{const z=m.Source.make({storage:{getLeads(){throw Error('secret name');}},readonly:m.ReadOnly,customerResolver:m.Resolver});const r=z.query(q('customer.search','田中太郎'),true);assert.ok(!JSON.stringify(r).includes('secret name'));});
check('missing getter fails closed',()=>{const z=m.Source.make({storage:{},readonly:m.ReadOnly});assert.equal(z.query(q('document.search','田中太郎'),true).code,'DATA_SOURCE_UNAVAILABLE');});
check('missing dependencies fail closed',()=>assert.equal(m.Source.make().query(q('customer.search','田中太郎'),true).code,'DEPENDENCY_MISSING'));
check('never invokes writes',()=>assert.equal(writes,0));
check('bridge imports no network or secret',()=>{const s=code('js/budil-gpt-local-source.js');assert.ok(!/fetch\s*\(|localStorage\s*\.|OPENAI_API_KEY/.test(s));assert.ok(!/storage\.(?:save|update|delete|remove)\w*\s*\(/.test(s));});
console.log('Budil local Storage gateway '+n+'/'+n+' PASS');
