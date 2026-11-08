import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const ctx={Date,Intl};
for(const [file,name] of [
  ['js/work-completion-brain.js','WorkCompletionBrain'],
  ['js/payment-brain.js','PaymentBrain'],
  ['js/documents-brain.js','DocumentsBrain'],
  ['js/invoice-structured-entrypoint.js','InvoiceStructuredEntrypoint'],
  ['js/budil-gpt-invoice-lifecycle.js','BudilGptInvoiceLifecycle']
])ctx[name]=runInNewContext(readFileSync(file,'utf8')+';'+name,ctx);
const life=ctx.BudilGptInvoiceLifecycle;
const fields={workDate:'2026-11-06',amount:'18000',tax:'included',issueDate:'2026-11-06',
  dueDate:'2026-12-06',paymentMethod:'bank_transfer',expectedPaymentDate:'2026-12-06'};
const order={id:'w1',status:'confirmed',customerName:'田中太郎',serviceText:'架空の洗浄',scheduledDate:'2026-11-06'};
let orders=[order],revenues=[],documents=[],backups=[],failLink=false,failDocuments=false,failBackup=false;
const storage={KEYS:{WORK_ORDERS:'work',REVENUE_RECORDS:'revenue',DOCUMENTS:'docs'},
  getWorkOrders:()=>orders,getRevenueRecords:()=>revenues,getDocuments:()=>documents,
  getLeads:()=>[{id:'c1',name:'田中太郎'}],generateId:()=>String(documents.length+1),
  createSafetyBackup:({targetKey})=>{if(failBackup)throw Error('backup quota');backups.push(targetKey);},
  confirmRevenueForWorkOrder:(id,payload,input)=>{
    let revenue=revenues.find(r=>r.sourceWorkOrderId===id);
    if(!revenue){revenue={...payload,id:'r1'};revenues=[revenue];}
    if(failLink)return {ok:false,error:'work_order_link_failed',revenueSaved:true};
    orders=[{...orders[0],...ctx.WorkCompletionBrain.markWorkOrderCompleted(orders[0],revenue,input)}];
    return {ok:true,workOrder:orders[0],revenue};
  },
  saveDocuments:list=>{if(failDocuments)throw Error('quota');documents=structuredClone(list);}
};
const deps={storage,workCompletion:ctx.WorkCompletionBrain,documents:ctx.DocumentsBrain};
assert.equal(life.stage(orders[0],storage),'pending_completion');
assert.equal(life.prepareCompletion(order,{...fields,amount:''},deps).code,'COMPLETION_DETAILS_REQUIRED');
const first=life.prepareCompletion(order,fields,deps);
assert.equal(first.ok,true);
assert.equal(life.applyCompletion(first,{storage}).code,'CONFIRM_REQUIRED');
assert.equal(revenues.length,0);
failBackup=true;
assert.equal(life.applyCompletion(first,{storage,confirm:true}).code,'BACKUP_FAILED');
assert.equal(revenues.length,0);
failBackup=false;
failLink=true;
assert.equal(life.applyCompletion(first,{storage,confirm:true}).code,'COMPLETION_LINK_PENDING_RETRY');
assert.equal(revenues.length,1);
assert.equal(life.stage(orders[0],storage),'pending_completion');
assert.equal(life.prepareCompletion(orders[0],{...fields,amount:'19000'},deps).code,'EXISTING_REVENUE_CONFLICT');
failLink=false;
const retry=life.prepareCompletion(orders[0],fields,deps);
assert.equal(life.applyCompletion(retry,{storage,confirm:true}).stage,'pending_invoice');
assert.equal(revenues.length,1,'retry reuses linked revenue');
assert.equal(life.stage(orders[0],storage),'pending_invoice');
assert.equal(life.prepareWork(orders[0],{...fields,amount:'19000'},
  {storage,documents:ctx.DocumentsBrain,entrypoint:ctx.InvoiceStructuredEntrypoint}).code,
  'COMPLETION_INVOICE_MISMATCH');
const invoice=life.prepareWork(orders[0],fields,
  {storage,documents:ctx.DocumentsBrain,entrypoint:ctx.InvoiceStructuredEntrypoint});
assert.equal(invoice.ok,true,invoice.code);
assert.equal(life.apply(invoice,{storage}).code,'CONFIRM_REQUIRED');
failDocuments=true;
assert.equal(life.apply(invoice,{storage,confirm:true}).code,'ROLLBACK_FAILED');
assert.equal(documents.length,0);
assert.equal(life.stage(orders[0],storage),'pending_invoice');
failDocuments=false;
const afterReload=life.prepareWork(orders[0],fields,
  {storage,documents:ctx.DocumentsBrain,entrypoint:ctx.InvoiceStructuredEntrypoint});
assert.equal(life.apply(afterReload,{storage,confirm:true}).ok,true);
assert.equal(life.stage(orders[0],storage),'invoiced');
assert.equal(documents[0].paymentStatus,'pending');
assert.equal(life.apply(afterReload,{storage,confirm:true}).ok,false,'duplicate approval blocked');
assert.equal(documents.length,1);
assert.deepEqual(backups,['work','revenue','work','revenue','docs','docs']);
console.log('BUDIL_COMBINED_LIFECYCLE_FIXTURE PASS');
