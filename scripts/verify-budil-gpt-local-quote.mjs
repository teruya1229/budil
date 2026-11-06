import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const ctx=createContext({Date,Intl,console,URL});
for(const path of ['js/documents-brain.js','js/customer-resolve-entrypoint.js','js/budil-gpt-anonymize.js','experiments/budil-gpt-phase1/fixture-core.js'])runInContext(read(path),ctx,{filename:path});
const {d,c,a,C}=runInContext('({d:DocumentsBrain,c:CustomerResolveEntrypoint,a:BudilGptAnonymize,C:BudilGptFixtureCore})',ctx);
const raw='田中太郎さんのエアコン洗浄2台を税込18,000円で見積して';
const response={ok:true,phase:'interpret_only',input_mode:'anonymized',requires_human_approval:true,action:'estimate_create',can_execute:false,needs_user_input:false,customer_name:'お客様',service_name:'エアコン洗浄',quantity:2,total_yen:18000,tax_mode:'included',amount_scope:'total'};
const customers=[{id:'local-c001',name:'田中太郎',area:'八重瀬町'},{id:'local-c002',name:'田中太郎',area:'南城市'},{id:'local-c003',name:'山田花子',area:'与那原町'}];
const deps={documentsBrain:d,customerResolver:c,anonymizer:a,localAccessConsent:true,localLeads:customers};
const newSession=()=>C.createSession();
const matched=()=>{const s=newSession();assert.equal(C.startAnonymized(s,raw,response,deps).code,'CANDIDATES');return s};
let n=0;function check(k,fn){fn();n++;console.log('PASS '+k)}
check('consent is required before accessing local leads',()=>{
 const s=newSession();assert.equal(C.startAnonymized(s,raw,response,{...deps,localAccessConsent:false}).code,'LOCAL_CONSENT_REQUIRED');
 assert.equal(s.stage,'idle');
});
check('missing local data source is rejected',()=>{
 const s=newSession();assert.equal(C.startAnonymized(s,raw,response,{...deps,localLeads:undefined}).code,'LOCAL_CONSENT_REQUIRED');
});
check('hallucinated price is blocked before query',()=>{
 const s=newSession();assert.equal(C.startAnonymized(s,raw,{...response,total_yen:22000},deps).code,'ANONYMIZED_RESPONSE_INVALID');
 assert.equal(s.stage,'idle');
});
check('hallucinated name is blocked',()=>{
 const s=newSession();assert.equal(C.startAnonymized(s,raw,{...response,customer_name:'田中太郎'},deps).code,'ANONYMIZED_RESPONSE_INVALID');
});
check('server approval requirement cannot be bypassed',()=>{
 const s=newSession();assert.equal(C.startAnonymized(s,raw,{...response,requires_human_approval:false},deps).code,'ANONYMIZED_RESPONSE_INVALID');
});
check('original local identity never enters GPT payload',()=>{
 const p=a.prepare(raw);assert.equal(p.ok,true);assert.equal(p.local.customerName,'田中太郎');
 assert.equal(JSON.stringify(p.wire).includes('田中太郎'),false);
});
check('identical names still require explicit customer choice',()=>{
 const s=matched();assert.equal(s.kind,'local');assert.equal(s.stage,'candidate');
 assert.equal(s.candidates.length,2);assert.equal(s.selectedCustomerId,'');
});
check('customer selection outside candidates rejected',()=>{
 const s=matched();assert.equal(C.selectCustomer(s,'fabricated-customer',deps).code,'CUSTOMER_SELECTION_INVALID');
});
check('draft uses existing Budil DocumentsBrain with local identity',()=>{
 const s=matched();const r=C.selectCustomer(s,'local-c001',deps);
 assert.equal(r.code,'DRAFT_READY');assert.equal(r.doc.customerName,'田中太郎');
 assert.equal(r.doc.total,18000);assert.equal(r.doc.type,'estimate');assert.equal(r.doc.status,'draft');
 assert.equal(r.doc.title.startsWith('【未発行】'),true);
});
check('single candidate also waits for human selection',()=>{
 const s=newSession();const original='山田花子様のエアコンクリーニング1台を税別8000円で見積書作って';
 const r=C.startAnonymized(s,original,{...response,service_name:'エアコンクリーニング',quantity:1,total_yen:8000,tax_mode:'excluded'},deps);
 assert.equal(r.code,'CANDIDATES');assert.equal(s.candidates.length,1);assert.equal(s.stage,'candidate');
});
check('safe local amount correction retains identity',()=>{
 const s=matched();C.selectCustomer(s,'local-c001',deps);
 const r=C.revise(s,'金額を税込20,000円に変更',deps);
 assert.equal(r.code,'DRAFT_REVISED');assert.equal(r.doc.total,20000);assert.equal(r.doc.customerName,'田中太郎');
});
check('stale amount approval blocked',()=>{
 const s=matched();C.selectCustomer(s,'local-c001',deps);
 C.revise(s,'金額を税込20,000円に変更',deps);
 assert.equal(C.approve(s,1).code,'STALE_REVISION');
});
check('manual approval does not issue or persist invoice',()=>{
 const s=matched();C.selectCustomer(s,'local-c001',deps);
 const r=C.approve(s,1);assert.equal(r.code,'APPROVED_LOCAL_DRAFT');
 assert.equal(r.persisted,false);assert.equal(s.approved.status,'draft');
});
check('approved quote snapshot is immutable from caller',()=>{
 const s=matched();C.selectCustomer(s,'local-c002',deps);C.approve(s,1);
 const v=C.getApprovedForPdf(s);v.doc.total=1;
 assert.equal(C.getApprovedForPdf(s).doc.total,18000);
});
check('remote revisions blocked for real names',()=>{
 const s=matched();C.selectCustomer(s,'local-c001',deps);
 assert.equal(C.reviseStructured(s,'金額を税込20,000円に変更',{
  ok:true,phase:'interpret_only',action:'estimate_revision',needs_user_input:false,
  can_execute:false,total_yen:20000,tax_mode:'included',amount_scope:'total'
 },deps).code,'LOCAL_STRUCTURED_REVISION_DISABLED');
});
check('original fictional mode never reads injected local leads',()=>{
 const s=newSession();const r=C.start(s,'比嘉清子さんのエアコン洗浄2台を税込18,000円で見積して',deps);
 assert.equal(r.code,'CANDIDATES');assert.equal(s.candidates[0].customerId,'fixture-c003');
 assert.equal(s.kind,'fixture');
});
check('local mode still blocks untrusted model output',()=>{
 const s=newSession();s.kind='local';
 assert.equal(C.startAnonymized(s,raw,{...response,can_execute:true},deps).code,'ANONYMIZED_RESPONSE_INVALID');
});
check('core has no implicit storage or network access',()=>{
 const code=read('experiments/budil-gpt-phase1/fixture-core.js');
 assert.equal(/\blocalStorage\s*\.|\bfetch\s*\(|Storage\.(?:get|save|update)/.test(code),false);
});
check('offline quote requires local data consent',()=>{
 const s=newSession();const r=C.startLocalParsed(s,raw,{...deps,localAccessConsent:false});
 assert.equal(r.code,'LOCAL_CONSENT_REQUIRED');assert.equal(s.stage,'idle');
});
check('offline quote never trusts free form amount',()=>{
 const s=newSession();const r=C.startLocalParsed(s,'田中太郎さんのエアコン洗浄2台を18000円で見積して',deps);
 assert.equal(r.code,'LOCAL_INSTRUCTION_INVALID');assert.equal(s.stage,'idle');
});
check('offline quote resolves same-name leads without GPT',()=>{
 const s=newSession();const r=C.startLocalParsed(s,raw,deps);
 assert.equal(r.ok,true);assert.equal(r.code,'CANDIDATES');
 assert.equal(s.stage,'candidate');assert.equal(s.kind,'local');
 assert.equal(s.candidates.length,2);
});
check('offline quote allows human-selected local draft',()=>{
 const s=newSession();C.startLocalParsed(s,raw,deps);
 const selected=C.selectCustomer(s,'local-c001',deps);
 assert.equal(selected.code,'DRAFT_READY');
 assert.equal(selected.doc.customerName,'田中太郎');
 assert.equal(selected.doc.total,18000);
 assert.equal(selected.doc.status,'draft');
 assert.equal(C.approve(s,1).code,'APPROVED_LOCAL_DRAFT');
});
check('offline quote never invokes GPT or writes Storage',()=>{
 const source=read('experiments/budil-gpt-phase1/fixture-core.js');
 const part=source.slice(source.indexOf('function startLocalParsed'),source.indexOf('function startAnonymized'));
 assert.ok(!/\bfetch\s*\(|\bStorage\b|interpretFixture|openai|\.save\w*\(/i.test(part));
});
console.log('Budil GPT local anonymized quote '+n+'/23 PASS');
