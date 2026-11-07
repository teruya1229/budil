import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const context={Date,Intl,console};
for(const [file,name] of [
  ['js/payment-brain.js','PaymentBrain'],
  ['js/documents-brain.js','DocumentsBrain'],
  ['js/invoice-structured-entrypoint.js','InvoiceStructuredEntrypoint'],
  ['js/budil-gpt-invoice-lifecycle.js','BudilGptInvoiceLifecycle']
])context[name]=runInNewContext(readFileSync(file,'utf8')+';'+name,context);
const {DocumentsBrain:docs,InvoiceStructuredEntrypoint:entry,BudilGptInvoiceLifecycle:life}=context;
let documents=[],backups=[],writes=0,throwWrite=false;
const order={id:'w1',status:'completed',completedAt:'2026-11-06T00:00:00Z',
  customerName:'田中太郎',serviceText:'エアコン洗浄2台',scheduledDate:'2026-11-06'};
let orders=[order];
const storage={KEYS:{DOCUMENTS:'budil_documents'},getLeads:()=>[{id:'c1',name:'田中太郎'}],
  getWorkOrders:()=>orders,getRevenueRecords:()=>[],getDocuments:()=>documents,generateId:()=>String(++writes),
  createSafetyBackup:({data})=>{backups.push(structuredClone(data));return {id:'backup'};},
  saveDocuments:list=>{if(throwWrite){throwWrite=false;throw Error('quota');}documents=structuredClone(list);}};
const fields={workDate:'2026-11-06',amount:'18000',tax:'included',issueDate:'2026-11-06',
  dueDate:'2026-12-06',paymentMethod:'bank_transfer',expectedPaymentDate:'2026-12-06'};
assert.equal(life.prepareWork({...order,status:'confirmed'},fields,{storage,documents:docs,entrypoint:entry}).code,'COMPLETION_NOT_RECORDED');
assert.equal(life.prepareWork(order,{...fields,amount:''},{storage,documents:docs,entrypoint:entry}).ok,false);
const work=life.prepareWork(order,fields,{storage,documents:docs,entrypoint:entry});
assert.equal(work.ok,true,work.code);
const workExcluded=life.prepareWork(order,{...fields,tax:'excluded'},{storage,documents:docs,entrypoint:entry});
assert.equal(workExcluded.ok,true,workExcluded.code);
assert.equal(workExcluded.documents[0].total,19800);
assert.equal(life.apply(work,{storage}).code,'CONFIRM_REQUIRED');
assert.equal(documents.length,0);
orders=[{...order,serviceText:'変更済み'}];
assert.equal(life.apply(work,{storage,confirm:true}).code,'SOURCE_CHANGED');
orders=[order];
const backupMethod=storage.createSafetyBackup;
storage.createSafetyBackup=()=>{throw Error('quota');};
assert.equal(life.apply(work,{storage,confirm:true}).code,'BACKUP_FAILED');
assert.equal(documents.length,0);
storage.createSafetyBackup=backupMethod;
const saved=life.apply(work,{storage,confirm:true});
assert.equal(saved.ok,true,saved.code);
assert.equal(saved.invoice.sourceWorkOrderId,'w1');
assert.equal(saved.invoice.paymentStatus,'pending');
assert.equal(saved.invoice.total,18000);
assert.equal(life.apply(work,{storage,confirm:true}).ok,false);
assert.equal(documents.length,1);
assert.equal(backups.length,1);
const approved=docs.normalizeDocument({...docs.buildDefaultDocument('estimate',[]),
  customerName:'田中太郎',items:[{name:'洗浄',quantity:2,unitPrice:9000,amount:18000}],
  status:'draft'});
const q=life.prepareQuote(approved,'c1',fields,{storage,documents:docs});
assert.equal(q.ok,true,q.code);
assert.equal(q.documents[0].total,q.documents[1].total);
assert.equal(q.documents[0].tax,q.documents[1].tax);
assert.equal(life.apply(q,{storage,confirm:true,approvedQuote:{...approved,title:'changed'}}).code,'SOURCE_CHANGED');
assert.equal(life.apply(q,{storage,confirm:true,approvedQuote:approved}).ok,true);
assert.equal(documents.length,3);
assert.equal(documents[0].sourceEstimateId,documents[1].id);
assert.equal(documents[1].type,'estimate');

assert.equal(life.prepareIssue(saved.invoice.id,storage).code,'LINKED_WORK_OR_REVENUE_CHANGED',
  'linked work invoice cannot be issued while revenue consistency is unresolved');
const issue=life.prepareIssue(documents[0].id,storage);
assert.equal(issue.ok,true,issue.code);
assert.equal(issue.preview.externalSendPerformed,false);
assert.equal(life.applyIssue(issue,{storage,confirm:false,notSentAcknowledged:true}).code,'ISSUE_CONFIRM_REQUIRED');
assert.equal(life.applyIssue(issue,{storage,confirm:true,notSentAcknowledged:false}).code,'ISSUE_CONFIRM_REQUIRED');
assert.equal(documents[0].status,'draft');
const beforeIssue=structuredClone(documents);
documents[0]={...documents[0],total:25000};
assert.equal(life.applyIssue(issue,{storage,confirm:true,notSentAcknowledged:true}).code,'DOCUMENTS_CHANGED');
documents=beforeIssue;
const issueBackup=storage.createSafetyBackup;
storage.createSafetyBackup=()=>{throw Error('fictional quota');};
assert.equal(life.applyIssue(issue,{storage,confirm:true,notSentAcknowledged:true}).code,'BACKUP_FAILED');
storage.createSafetyBackup=issueBackup;
throwWrite=true;
assert.equal(life.applyIssue(issue,{storage,confirm:true,notSentAcknowledged:true}).code,'SAVE_FAILED_ROLLED_BACK');
assert.equal(documents[0].status,'draft','write failure leaves invoice unissued');
const issued=life.applyIssue(issue,{storage,confirm:true,notSentAcknowledged:true});
assert.equal(issued.ok,true,issued.code);
assert.equal(issued.externalSendPerformed,false);
assert.equal(documents[0].status,'issued');
assert.equal(documents[0].paymentStatus,'pending');
assert.equal(documents[0].paidAmount,0);
assert.equal(documents[0].unpaidAmount,18000);
assert.equal(documents[1].status,'draft','original quote remains unchanged');
assert.equal(life.applyIssue(issue,{storage,confirm:true,notSentAcknowledged:true}).code,'DOCUMENTS_CHANGED');
assert.equal(life.prepareIssue(documents[0].id,storage).code,'INVOICE_NOT_DRAFT');

const q2=life.prepareQuote({...approved,title:'second'},'c1',fields,{storage,documents:docs});
assert.equal(q2.ok,true,q2.code);
throwWrite=true;
assert.equal(life.apply(q2,{storage,confirm:true,approvedQuote:{...approved,title:'second'}}).code,'SAVE_FAILED_ROLLED_BACK');
assert.equal(documents.length,3);
console.log('BUDIL_INVOICE_LIFECYCLE_FIXTURE PASS');
