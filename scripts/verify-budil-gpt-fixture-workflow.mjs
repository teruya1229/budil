/**
 * Budil×GPT fixture workflow: native Node 22 regression using real Budil business brains.
 * All interactions are fictional and in-memory only. No localStorage/Calendar/Bank.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const files=[
  'js/payment-brain.js','js/documents-brain.js','js/work-order-brain.js',
  'js/customer-resolve-entrypoint.js','experiments/budil-gpt-phase1/fixture-core.js',
  'experiments/budil-gpt-phase1/fixture-workflow.js'
];
const code=(p)=>readFileSync(join(root,p),'utf8');
const ctx=createContext({Date,Intl,console});
for(const p of files)runInContext(code(p),ctx,{filename:p});
runInContext('this.modules={PaymentBrain,DocumentsBrain,WorkOrderBrain,CustomerResolveEntrypoint,Core:BudilGptFixtureCore,Workflow:BudilGptFixtureWorkflow}',ctx);
const {PaymentBrain,DocumentsBrain,WorkOrderBrain,CustomerResolveEntrypoint,Core,Workflow}=ctx.modules;
const deps={paymentBrain:PaymentBrain,documentsBrain:DocumentsBrain,workOrderBrain:WorkOrderBrain};
function makeQuote(){
  const s=Core.createSession();
  assert.equal(Core.start(s,'比嘉清子さんのエアコン洗浄2台を税込18,000円で見積して',
    {customerResolver:CustomerResolveEntrypoint,documentsBrain:DocumentsBrain}).code,'CANDIDATES');
  assert.equal(Core.selectCustomer(s,'fixture-c003',
    {customerResolver:CustomerResolveEntrypoint,documentsBrain:DocumentsBrain}).code,'DRAFT_READY');
  assert.equal(Core.approve(s,1).code,'APPROVED_FIXTURE');
  return s;
}
function makeWorkflow(){const s=Workflow.makeSession(makeQuote(),deps);assert.equal(s.ok,true);return s;}
function prepare(s,date='2026-11-13',start='13:00',end='15:00'){
  return Workflow.prepareAppointment(s,date,start,end);
}
function book(s){
  const result=prepare(s);
  assert.equal(result.code,'APPOINTMENT_PREVIEW');
  return Workflow.confirmAppointment(s,result.slot.token,true);
}
function completed(){const s=makeWorkflow();book(s);Workflow.completeWorkOrder(s,true);return s;}
let total=0;
function check(label,fn){fn();total++;console.log('PASS '+label);}
check('1. unapproved estimate cannot initialize workflow',()=>{
  const q=Core.createSession();
  assert.equal(Workflow.makeSession(q,deps).code,'QUOTE_NOT_APPROVED');
});
check('2. approved existing Budil estimate accepted only in demo',()=>{
  const s=makeWorkflow();assert.equal(s.stage,'ready');
  assert.equal(s.estimate.total,18000);
  assert.equal(s.customerId,'fixture-c003');
});
check('3. invalid dates and times fail closed',()=>{
  const s=makeWorkflow();
  for(const [d,a,b] of [['2026-02-30','10:00','11:00'],
    ['2026-11-13','11:00','10:00'],['2026-11-13','bad','11:00'],
    ['2026-11-13','10:00','23:00']]) {
    assert.equal(prepare(s,d,a,b).ok,false);
  }
});
check('4. busy demo slot cannot create booking',()=>{
  const s=makeWorkflow();assert.equal(prepare(s,'2026-11-13','10:00','11:00').code,'DEMO_SLOT_BUSY');
  assert.equal(s.workOrder,null);
});
check('5. booking preview does not mutate calendar or work order',()=>{
  const s=makeWorkflow();const result=prepare(s);
  assert.equal(result.code,'APPOINTMENT_PREVIEW');
  assert.equal(s.workOrder,null);
  assert.equal(result.slot.source,'DEMO_CALENDAR_ONLY');
});
check('6. booking without permit denied',()=>{
  const s=makeWorkflow();const result=prepare(s);
  assert.equal(Workflow.confirmAppointment(s,result.slot.token,false).code,'PERMIT_REQUIRED');
  assert.equal(s.workOrder,null);
});
check('7. stale reservation token rejected',()=>{
  const s=makeWorkflow();const old=prepare(s).slot.token;
  const current=prepare(s,'2026-11-14','13:00','15:00').slot.token;
  assert.equal(Workflow.confirmAppointment(s,old,true).code,'STALE_PREVIEW');
  assert.equal(Workflow.confirmAppointment(s,current,true).code,'FIXTURE_WORK_SCHEDULED');
});
check('8. booked status uses Budil WorkOrderBrain and does not write Google',()=>{
  const s=makeWorkflow();const result=book(s);
  assert.equal(result.code,'FIXTURE_WORK_SCHEDULED');
  assert.equal(result.workOrder.status,'confirmed');
  assert.equal(result.workOrder.calendarAdded,false);
  assert.equal(result.externalCalendarWritten,false);
  assert.equal(result.workOrder.estimateAmount,18000);
});
check('9. repeated booking confirmation denied',()=>{
  const s=makeWorkflow();const reservation=prepare(s);Workflow.confirmAppointment(s,reservation.slot.token,true);
  assert.equal(Workflow.confirmAppointment(s,reservation.slot.token,true).ok,false);
});
check('10. work completion requires explicit permit',()=>{
  const s=makeWorkflow();book(s);
  assert.equal(Workflow.completeWorkOrder(s,false).code,'PERMIT_REQUIRED');
  assert.equal(s.workOrder.status,'confirmed');
});
check('11. work completion is idempotent no repeat',()=>{
  const s=makeWorkflow();book(s);
  assert.equal(Workflow.completeWorkOrder(s,true).code,'FIXTURE_WORK_COMPLETED');
  assert.equal(Workflow.completeWorkOrder(s,true).ok,false);
  assert.equal(s.workOrder.status,'completed');
});
check('12. invoice cannot be created before completion',()=>{
  const s=makeWorkflow();book(s);
  assert.equal(Workflow.prepareInvoice(s).code,'COMPLETION_REQUIRED');
});
check('13. invoice draft uses existing Budil conversion and matches quote',()=>{
  const s=completed();const out=Workflow.prepareInvoice(s);
  assert.equal(out.code,'FIXTURE_INVOICE_DRAFT');
  assert.equal(out.invoice.type,'invoice');
  assert.equal(out.invoice.status,'draft');
  assert.equal(out.invoice.total,18000);
  assert.equal(out.invoice.customerName,'比嘉清子');
  assert.equal(out.invoice.paymentStatus,'pending');
});
check('14. invoice approval is separate from preparation',()=>{
  const s=completed();Workflow.prepareInvoice(s);
  assert.equal(Workflow.approvedInvoiceForPdf(s).code,'INVOICE_NOT_APPROVED');
  assert.equal(Workflow.approveInvoice(s,false).code,'PERMIT_REQUIRED');
  assert.equal(Workflow.approveInvoice(s,true).code,'FIXTURE_INVOICE_APPROVED');
  assert.equal(Workflow.approvedInvoiceForPdf(s).invoice.total,18000);
});
check('15. invoice preview approval does not issue or persist',()=>{
  const s=completed();Workflow.prepareInvoice(s);
  const r=Workflow.approveInvoice(s,true);
  assert.equal(r.issued,false);assert.equal(r.persisted,false);
  assert.equal(r.invoice.status,'draft');
  assert.equal(Workflow.approveInvoice(s,true).ok,false);
});
check('16. receivables use existing PaymentBrain and stay unpaid',()=>{
  const s=completed();Workflow.prepareInvoice(s);Workflow.approveInvoice(s,true);
  const r=Workflow.unpaidSummary(s,'2026-11-13');
  assert.equal(r.ok,true);
  assert.equal(r.summary.pendingTotal,18000);
  assert.equal(r.summary.count,1);
  assert.equal(r.confirmedBankPayment,false);
});
check('17. payment match is a suggestion, not a paid confirmation',()=>{
  const s=completed();Workflow.prepareInvoice(s);
  const match=Workflow.matchFictionalBankEntry(s,{fixture:true,amount:18000});
  assert.equal(match.code,'POSSIBLE_MATCH');
  assert.equal(match.paymentStatus,'pending');
  assert.equal(match.bankPaymentConfirmed,false);
  const unpaid=Workflow.unpaidSummary(s);
  assert.equal(unpaid.summary.pendingTotal,18000);
});
check('18. unverifiable bank payload cannot mark paid',()=>{
  const s=completed();Workflow.prepareInvoice(s);
  assert.equal(Workflow.matchFictionalBankEntry(s,{amount:18000}).code,'BANK_EVIDENCE_REQUIRED');
  assert.equal(Workflow.matchFictionalBankEntry(s,{fixture:true,amount:12000}).code,'UNMATCHED');
  assert.equal(s.invoice.paymentStatus,'pending');
});
check('19. natural-language search is isolated to fixture documents',()=>{
  const s=completed();Workflow.prepareInvoice(s);
  const result=Workflow.findDocuments(s,'比嘉清子');
  assert.equal(result.documents.length,2);
  assert.equal(Workflow.findDocuments(s,'田中').documents.length,0);
});
check('20. PDF for invoice uses existing Budil renderer safely',()=>{
  const s=completed();Workflow.prepareInvoice(s);Workflow.approveInvoice(s,true);
  const d=Workflow.approvedInvoiceForPdf(s).invoice;
  const html=DocumentsBrain.buildStandaloneDocumentHtml(d,{cssText:'.doc-sheet {}',
    baseHref:'https://example.com/budil/budil-gpt-phase1-demo.html'});
  assert.ok(html.includes('請求書'));
  assert.ok(html.includes('18,000円'));
  assert.ok(html.includes('架空デモ'));
});
check('21. project fixture never accesses production storage/calendar/provider',()=>{
  const src=code('experiments/budil-gpt-phase1/fixture-workflow.js');
  assert.ok(!/(?:localStorage|fetch\(|\.getLeads\(|\.addDocument\(|\.updateDocument\(|\.insert\(|getCalendarEvents|api\.openai)/.test(src));
});
check('22. search outputs are defensive copies',()=>{
  const s=completed();Workflow.prepareInvoice(s);
  const r=Workflow.findDocuments(s,'見積書');
  assert.ok(r.ok);
  if(r.documents.length) {r.documents[0].total=1;assert.equal(s.estimate.total,18000);}
});
console.log('Budil GPT fixture workflow '+total+'/22 PASS');
