/** Budil GPT -> canonical invoice draft handoff (local, owner-confirmed).
 * Model output is untrusted. Only owner-typed evidence is accepted. No auto writes. */
const BudilGptInvoiceDraft = (() => {
 'use strict';
 const fail=(code,detail='')=>({ok:false,code,detail});
 const norm=s=>String(s||'').replace(/[\s　]+/gu,'').replace(/(?:様|御中)$/u,'');
 const yen=s=>String(s||'').replace(/[,，\s￥¥円]/gu,'');
 const date=s=>{
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(String(s||'')))return false;
  const d=new Date(s+'T00:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
 };
 const evidence=(line,term)=>norm(line).includes(norm(term));
 const hasMoney=(line,amount)=> {
   const tokens=String(line||'').replace(/[,，](?=\d{3}\b)/gu,'').match(/\d+/gu)||[];
   return tokens.includes(String(amount));
 };
 function plan(rows,typed,leads){
  if(typeof typed!=='string'||!Array.isArray(rows)||rows.length<1||rows.length>12||!Array.isArray(leads))
   return fail('ROWS_INVALID');
  const lines=typed.split(/\r?\n/gu).filter(Boolean);
  const groups=new Map(),notFound=[];
  for(const [i,row] of rows.entries()){
   if(!row||typeof row!=='object'||Array.isArray(row))return fail('ROW_INVALID',String(i+1));
   const customer=String(row.customerName||'').trim();
   const description=String(row.description||'').trim();
   const quantity=Number(row.quantity),unitPrice=Number(row.unitPriceIncl);
   const providedTotal=Number(row.statedTotalIncl);
   const workDate=String(row.workDate||'');
   if(customer.length<2||description.length<2||description.length>100||
      !Number.isSafeInteger(quantity)||quantity<1||quantity>100||
      !Number.isSafeInteger(unitPrice)||unitPrice<1||unitPrice>100000000||
      !Number.isSafeInteger(providedTotal)||providedTotal!==quantity*unitPrice||
      !['included','excluded','unknown'].includes(row.taxMode))
     return fail('ROW_FIELDS_INVALID',String(i+1));
   const sourceLine=lines.find(line=>evidence(line,customer)&&evidence(line,description)&&
     hasMoney(line,providedTotal)&&(!workDate||line.includes(workDate)||line.includes(workDate.replace(/-/gu,'/'))));
   if(!sourceLine)return fail('ROW_NOT_IN_INPUT',String(i+1));
   // Net->gross conversions are never guessed. A gross value must be visible in the typed line.
   if(row.taxMode==='unknown')return fail('TAX_BASIS_UNCLEAR',String(i+1));
   if(workDate&&!date(workDate))return fail('WORK_DATE_INVALID',String(i+1));
   const hits=leads.filter(c=>c&&norm(c.name||c.company||c.customerName||c.companyName||c.contact)===norm(customer));
   if(hits.length!==1||!hits[0].id){
    notFound.push({customerName:customer,row:i+1,reason:hits.length>1?'CUSTOMER_AMBIGUOUS':'CUSTOMER_NOT_FOUND'});
    continue;
   }
   const id=String(hits[0].id);
   if(!groups.has(id))groups.set(id,{customerId:id,customerName:customer,items:[]});
   groups.get(id).items.push({description,quantity,unitPrice,amount:providedTotal,workDate});
  }
  return {ok:true,groups:[...groups.values()],notFound,acceptedRows:[...groups.values()].reduce((n,g)=>n+g.items.length,0)};
 }
 function prepare(group,fields,deps){
  if(!group||!group.customerId||!Array.isArray(group.items)||!group.items.length||
     !fields||!date(fields.invoiceDate)||!date(fields.dueDate)||fields.dueDate<fields.invoiceDate)
   return fail('DATES_REQUIRED');
  if(!deps||!deps.entry||!deps.storage||typeof deps.storage.getDocuments!=='function')return fail('DEPENDENCY_MISSING');
  const docs=deps.storage.getDocuments();
  const customers=deps.storage.getLeads();
  const exact=customers.filter(c=>c&&String(c.id)===String(group.customerId)&&
    norm(c.name||c.company||c.customerName||c.companyName||c.contact)===norm(group.customerName));
  if(exact.length!==1)return fail('CUSTOMER_CHANGED');
  const key='gpt-draft:'+deps.entry.hashCanonical({
   customerId:group.customerId,items:group.items,invoiceDate:fields.invoiceDate,dueDate:fields.dueDate
  });
  if(docs.some(d=>d.structuredIdempotencyKey===key||d.localLifecycleKey===key))
   return fail('DUPLICATE_DRAFT');
  const input={
   customerId:String(group.customerId),invoiceDate:fields.invoiceDate,dueDate:fields.dueDate,
   items:group.items.map(({description,quantity,unitPrice})=>({description,quantity,unitPrice})),
   expectedTotal:group.items.reduce((sum,x)=>sum+x.amount,0),idempotencyKey:key
  };
  const preview=deps.entry.prepare(input,{customers,documents:docs});
  if(!preview.ok)return preview;
  return {ok:true,phase:'draft_preview',input,preview,customerName:group.customerName,
    snapshot:JSON.stringify(docs),customerSnapshot:JSON.stringify(exact[0]),group,
    source:group.items,invoiceDate:fields.invoiceDate,dueDate:fields.dueDate};
 }
 function save(staged,deps){
  if(!deps||deps.confirm!==true)return fail('CONFIRM_REQUIRED');
  if(!staged||staged.ok!==true||staged.phase!=='draft_preview')return fail('PREVIEW_REQUIRED');
  const {storage,entry,documents}=deps;
  if(!storage||!entry||!documents)return fail('DEPENDENCY_MISSING');
  const currentDocs=storage.getDocuments();
  if(JSON.stringify(currentDocs)!==staged.snapshot)return fail('DOCUMENTS_CHANGED');
  const currentCustomer=storage.getLeads().find(c=>c&&String(c.id)===staged.input.customerId);
  if(!currentCustomer||JSON.stringify(currentCustomer)!==staged.customerSnapshot)
   return fail('CUSTOMER_CHANGED');
  if(currentDocs.some(d=>d.structuredIdempotencyKey===staged.input.idempotencyKey||
    d.localLifecycleKey===staged.input.idempotencyKey))
   return fail('DUPLICATE_DRAFT');
  const input={...staged.input,expiresAt:staged.preview.expiresAt,number:staged.preview.preview.number};
  const validated=entry.validateAndNormalize(input,{customers:storage.getLeads(),documents:currentDocs});
  if(!validated.ok)return validated;
  if(entry.hashCanonical(validated.canonical)!==staged.preview.checksum ||
      validated.total!==staged.preview.preview.total)return fail('CHECKSUM_MISMATCH');
  if(Date.now()>Date.parse(staged.preview.expiresAt))return fail('PREVIEW_EXPIRED');
  if(typeof storage.createSafetyBackup!=='function'||typeof storage.saveDocuments!=='function'||
     typeof storage.generateId!=='function')return fail('STORAGE_UNAVAILABLE');
  try{
   const backup=storage.createSafetyBackup({reason:'budil_gpt_invoice_draft',
    targetKey:storage.KEYS.DOCUMENTS,data:currentDocs,beforeCount:currentDocs.length});
   if(!backup||!backup.id)return fail('BACKUP_FAILED');
  }catch(_){return fail('BACKUP_FAILED');}
  const normalizedDraft=documents.normalizeDocument({...validated.draft,id:'doc-'+storage.generateId(),
    status:'draft',paidAmount:0,paymentStatus:'pending',
    unpaidAmount:validated.total});
  // normalizeDocument intentionally drops custom fields; attach the durable
  // duplicate guard AFTER canonical normalization, before the one local save.
  const doc={...normalizedDraft,structuredIdempotencyKey:staged.input.idempotencyKey,
    localLifecycleKey:staged.input.idempotencyKey};
  if(doc.status!=='draft'||doc.total!==validated.total||!doc.id)return fail('DRAFT_VALIDATION_FAILED');
  try{storage.saveDocuments([...currentDocs,doc]);}
  catch(_){return fail('SAVE_FAILED');}
  const saved=storage.getDocuments().find(d=>d&&d.id===doc.id);
  if(!saved||saved.status!=='draft'||saved.total!==validated.total)
   return fail('READBACK_FAILED');
  return {ok:true,phase:'saved_draft',invoiceId:saved.id,total:saved.total,customerName:saved.customerName,
    issued:false,externalSendPerformed:false};
 }
 return Object.freeze({plan,prepare,save});
})();
if(typeof module!=='undefined'&&module.exports)module.exports={BudilGptInvoiceDraft};