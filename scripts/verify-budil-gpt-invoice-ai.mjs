/** Invoice AI handoff: fake customer data, no provider/network and no real writes. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const ctx={Date,Intl,console};
for(const [path,name] of [
 ['js/documents-brain.js','DocumentsBrain'],
 ['js/invoice-structured-entrypoint.js','InvoiceStructuredEntrypoint'],
 ['js/budil-gpt-invoice-draft.js','BudilGptInvoiceDraft'],
 ['js/budil-gpt-chat.js','BudilGptChat']
])ctx[name]=runInNewContext(readFileSync(path,'utf8')+';'+name,ctx);
const {DocumentsBrain:documents,InvoiceStructuredEntrypoint:entry,
 BudilGptInvoiceDraft:invoice,BudilGptChat:chat}=ctx;
let docs=[],backups=[],writes=0,saveCalls=0;
const leads=[
 {id:'fake-a',name:'架空花子'},
 {id:'fake-b',name:'架空次郎'},
 {id:'fake-z',name:'同姓太郎'},
 {id:'fake-z2',name:'同姓太郎'}
];
const storage={
 KEYS:{DOCUMENTS:'budil_documents'},
 getLeads:()=>structuredClone(leads),
 getDocuments:()=>structuredClone(docs),
 generateId:()=>String(++writes),
 createSafetyBackup:({data})=>{backups.push(structuredClone(data));return{id:'backup-'+backups.length}},
 saveDocuments:updated=>{saveCalls++;docs=structuredClone(updated)}
};
const typed=[
 '11908 架空花子 レンジフード清掃 2026/11/02 11200 12320',
 '30558137 架空次郎 換気扇清掃 2026/11/16 3200 3520',
 '30110 架空花子 トイレ清掃 2026/11/21 7000 7700',
 '請求書を作って'
].join('\n');
const rows=[
 {customerName:'架空花子',description:'レンジフード清掃',workDate:'2026-11-02',quantity:1,unitPriceIncl:12320,statedTotalIncl:12320,taxMode:'included'},
 {customerName:'架空次郎',description:'換気扇清掃',workDate:'2026-11-16',quantity:1,unitPriceIncl:3520,statedTotalIncl:3520,taxMode:'included'},
 {customerName:'架空花子',description:'トイレ清掃',workDate:'2026-11-21',quantity:1,unitPriceIncl:7700,statedTotalIncl:7700,taxMode:'included'}
];
let n=0;const test=(name,fn)=>{fn();console.log('PASS '+(++n)+' '+name)};
const fields={invoiceDate:'2026-11-26',dueDate:'2026-12-31'};
const mock=(action,extra={})=>({
 ok:true,phase:'chat_plan_only',can_execute:false,persisted:false,customer_records_sent:false,
 reply:'下書きを確認してください',action,query:'',date:'',month:'',docType:'none',
 needs_confirmation:action==='invoice.preview',invoiceRows:action==='invoice.preview'?rows:[],...extra
});
test('typed PII and multiline rows can reach GPT under v3 consent',()=>{
 const p=chat.prepare(typed,[]);assert.equal(p.ok,true);assert.equal(p.message,typed);
 assert.equal(saveCalls,0);
});
test('client accepts verified invoice preview proposal but never triggers write',()=>{
 const p=chat.verify(mock('invoice.preview'),{},typed);
 assert.equal(p.ok,true);assert.equal(p.action,'invoice.preview');
 assert.equal(p.request,null);assert.equal(p.invoiceRows.length,3);assert.equal(saveCalls,0);
});
test('one click cannot execute without owner confirmation',()=>{
 const plan=invoice.plan(rows,typed,leads);
 assert.equal(plan.ok,true);assert.equal(plan.groups.length,2);
 assert.equal(plan.groups.find(g=>g.customerName==='架空花子').items.length,2);
 const prepared=invoice.prepare(plan.groups[0],fields,{entry,documents,storage});
 assert.equal(prepared.ok,true,prepared.code);
 assert.equal(invoice.save(prepared,{entry,documents,storage}).code,'CONFIRM_REQUIRED');
 assert.equal(saveCalls,0);
});
test('two different customers never combined in one draft',()=>{
 const p=invoice.plan(rows,typed,leads);
 const a=invoice.prepare(p.groups[0],fields,{entry,documents,storage});
 const b=invoice.prepare(p.groups[1],fields,{entry,documents,storage});
 assert.equal(a.ok,true,a.code);assert.equal(b.ok,true,b.code);
 assert.equal(a.preview.preview.total,20020);
 assert.equal(b.preview.preview.total,3520);
 assert.equal(saveCalls,0);
});
test('model invented extra amount is refused before any local record read',()=>{
 const fake=structuredClone(rows);fake[0].unitPriceIncl=99999;fake[0].statedTotalIncl=99999;
 assert.equal(invoice.plan(fake,typed,leads).code,'ROW_NOT_IN_INPUT');
 assert.equal(saveCalls,0);
});
test('model cannot misattribute customer or service to unrelated row',()=>{
 const fake=structuredClone(rows);fake[0].customerName='架空次郎';
 assert.equal(invoice.plan(fake,typed,leads).code,'ROW_NOT_IN_INPUT');
});
test('ambiguous and unregistered names never create a draft',()=>{
 const ambiguous=invoice.plan([rows[0]],typed.replaceAll('架空花子','同姓太郎'),leads);
 assert.equal(ambiguous.code,'ROW_NOT_IN_INPUT'); // output must reflect owner source verbatim
 const other=[{...rows[0],customerName:'同姓太郎'}],text=typed.replaceAll('架空花子','同姓太郎');
 const ambiguous2=invoice.plan(other,text,leads);
 assert.equal(ambiguous2.ok,true);
 assert.equal(ambiguous2.groups.length,0);
 assert.equal(ambiguous2.notFound[0].reason,'CUSTOMER_AMBIGUOUS');
});
test('missing tax certainty and impossible dates are refused',()=>{
 assert.equal(invoice.plan([{...rows[0],taxMode:'unknown'}],typed,leads).code,'TAX_BASIS_UNCLEAR');
 assert.equal(invoice.plan([{...rows[0],workDate:'2026-13-30'}],typed,leads).code,'ROW_NOT_IN_INPUT');
 const p=invoice.plan(rows,typed,leads);
 assert.equal(invoice.prepare(p.groups[0],{invoiceDate:'2026-11-26',dueDate:''},{entry,documents,storage}).code,'DATES_REQUIRED');
 assert.equal(saveCalls,0);
});
test('stale customer information fails before save',()=>{
 const group=invoice.plan(rows,typed,leads).groups[0];
 const staged=invoice.prepare(group,fields,{entry,documents,storage});
 leads[0].name='改名';
 assert.equal(invoice.save(staged,{confirm:true,entry,documents,storage}).code,'CUSTOMER_CHANGED');
 leads[0].name='架空花子';
 assert.equal(saveCalls,0);
});
test('explicit owner confirmation persists draft and rereads, not issued',()=>{
 const group=invoice.plan(rows,typed,leads).groups[0];
 const staged=invoice.prepare(group,fields,{entry,documents,storage});
 const out=invoice.save(staged,{confirm:true,entry,documents,storage});
 assert.equal(out.ok,true,out.code);
 assert.equal(out.issued,false);assert.equal(out.externalSendPerformed,false);
 assert.equal(docs.length,1);assert.equal(docs[0].status,'draft');
 assert.equal(docs[0].total,20020);assert.equal(backups.length,1);
 assert.equal(saveCalls,1);
});
test('stale prepare cannot overwrite changed documents or replay',()=>{
 const group=invoice.plan(rows,typed,leads).groups[0];
 const staged=invoice.prepare(group,fields,{entry,documents,storage});
 assert.equal(staged.code,'DUPLICATE_DRAFT');
 const b=invoice.prepare(invoice.plan(rows,typed,leads).groups[1],fields,{entry,documents,storage});
 assert.equal(b.ok,true,b.code);
 docs.push({id:'synthetic-unrelated'});
 assert.equal(invoice.save(b,{confirm:true,entry,documents,storage}).code,'DOCUMENTS_CHANGED');
 docs.pop();
});
test('each group can be saved separately after fresh preview',()=>{
 const b=invoice.prepare(invoice.plan(rows,typed,leads).groups[1],fields,{entry,documents,storage});
 const out=invoice.save(b,{confirm:true,entry,documents,storage});
 assert.equal(out.ok,true,out.code);
 assert.equal(docs.length,2);assert.equal(docs[1].status,'draft');
 assert.equal(docs[1].total,3520);
 assert.equal(backups.length,2);assert.equal(saveCalls,2);
});
console.log('BUDIL_GPT_INVOICE_DRAFT '+n+'/'+n+' PASS; fictional data only, zero external writes');
