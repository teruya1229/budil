/**
 * Budil GPT local read-only business adapter.
 * Does not import Storage, fetch, localStorage or the OpenAI provider.
 * Only the caller can supply real data via explicit dependencies, and every
 * invocation requires opt-in for reading local records on this device.
 * Returns a local UI view and a separate non-PII model-safe receipt.
 * NO mutations, no Cloud/Google Calendar/Bank operations.
 */
const BudilGptReadOnly = (() => {
  'use strict';
  const ACTIONS = Object.freeze([
    'customer.search', 'document.search', 'document.period', 'work.search', 'receivables.summary', 'profit.summary'
  ]);
  const MAX_RESULTS = 10;
  const BAD_INPUT = 'INVALID_INPUT';
  const fail = (code) => ({
    ok: false, code, localOnly: true, persisted: false, requiresConsent: true
  });
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const str = (value, max=120) => {
    if(typeof value !== 'string') return '';
    const trimmed = value.trim();
    return trimmed && trimmed.length <= max ? trimmed : '';
  };
  const validDate = value => {
    if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y,m,d] = value.split('-').map(Number);
    const dt=new Date(Date.UTC(y,m-1,d));
    return dt.getUTCFullYear()===y && dt.getUTCMonth()+1===m && dt.getUTCDate()===d;
  };
  const exactKeys = (data, allowed) => Object.keys(data).every(k=>allowed.includes(k));
  const toArray = (deps, key) => {
    if(typeof deps[key] !== 'function') return null;
    const value = deps[key]();
    return Array.isArray(value) ? value : null;
  };
  const receipt = (action, status, count, tooMany = false) => Object.freeze({
    action, status, count, tooMany,
    readOnly: true, hasPrivateData: false, canExecute: false, canPersist: false
  });
  const ok = (action, view, summary) => ({
    ok: true, code: 'OK', action, localOnly: true,
    persisted: false, exported: false, networkUsed: false,
    requiresConsent: true, view, modelReceipt: summary
  });
  const verify = (request) => {
    if (!object(request) || !exactKeys(request, ['action','query','limit','date','month','docType'])) return null;
    const action = str(request.action, 40);
    if (!ACTIONS.includes(action)) return null;
    const limit = request.limit == null ? MAX_RESULTS : request.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESULTS) return null;
    if (action === 'receivables.summary' || action === 'profit.summary') {
      if(!exactKeys(request,['action','date']) || !validDate(request.date)) return null;
      return {action,date:request.date};
    }
    if (action === 'document.period') {
      if(!exactKeys(request,['action','month','docType','limit']) ||
         typeof request.month !== 'string' ||
         !/^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$/.test(request.month) ||
         (request.docType !== 'estimate' && request.docType !== 'invoice'))
        return null;
      return {action,month:request.month,docType:request.docType,limit};
    }
    if(!exactKeys(request,['action','query','limit'])) return null;
    const query = str(request.query, 120);
    if (!query || /[\x00-\x1f]/.test(query)) return null;
    return {action,query,limit};
  };
  const customer = (request, deps) => {
    if(!deps || !deps.customerResolver || typeof deps.customerResolver.resolve !== 'function') return fail('DEPENDENCY_MISSING');
    const leads=toArray(deps,'getLeads');
    if(!leads) return fail('DEPENDENCY_MISSING');
    const result=deps.customerResolver.resolve({name:request.query,limit:request.limit},{leads});
    // Surname-only searches are read-only, bounded candidate suggestions,
    // never identity matches. The canonical exact-ID resolver is unchanged.
    // Only 2-4 Japanese characters qualify; no arbitrary substring matching.
    if(result.status==='not_found' &&
       /^[一-龯々ぁ-んァ-ヶ]{2,4}$/u.test(request.query) &&
       typeof deps.customerResolver.normalizeName==='function' &&
       typeof deps.customerResolver.leadDisplayName==='function' &&
       typeof deps.customerResolver.toCandidate==='function') {
      const queryName=deps.customerResolver.normalizeName(request.query);
      const suggestions=leads.filter(lead=>{
        const name=deps.customerResolver.normalizeName(deps.customerResolver.leadDisplayName(lead));
        return name.length>queryName.length && name.startsWith(queryName);
      });
      const tooMany=suggestions.length>request.limit;
      const candidates=tooMany?[]:suggestions.map(lead=>({
        ...deps.customerResolver.toCandidate(lead,'surname_suggestion'),
        requiresUserConfirmation:true
      }));
      if(suggestions.length){
        return ok(request.action,{
          status:tooMany?'too_many':'surname_suggestions',
          candidateCount:suggestions.length,candidates,
          selectedCustomerId:null,requiresUserConfirmation:true
        },receipt(request.action,tooMany?'too_many':'surname_suggestions',
          suggestions.length,tooMany));
      }
    }
    const count=Number(result.candidateCount)||0;
    // Reuse the original Budil identity resolver. Do not "auto-confirm"
    // a single candidate matched by name.
    const matches=Array.isArray(result.candidates)
      ? result.candidates.slice(0,request.limit).map(c=>({
          customerId:String(c.customerId||''),
          displayName:String(c.displayName||''),
          municipality:String(c.municipality||''),
          maskedPhone:String(c.maskedPhone||''),
          maskedEmail:String(c.maskedEmail||''),
          requiresUserConfirmation:true
        })) : [];
    const status=String(result.status||'not_found');
    return ok(request.action, {
      status, candidateCount:count, candidates:matches,
      selectedCustomerId:null,requiresUserConfirmation:true
    }, receipt(request.action,status,count,status==='too_many'));
  };
  const document = (request,deps) => {
    const docs=toArray(deps,'getDocuments');
    if(!docs)return fail('DEPENDENCY_MISSING');
    // Exact name, document number or document type; no arbitrary memo searches.
    const query=request.query.replace(/\s+/g,'');
    const matching=docs.filter(doc=>{
      if(!object(doc))return false;
      const name=String(doc.customerName||'').replace(/\s+/g,'');
      const number=String(doc.number||'').replace(/\s+/g,'');
      const type=doc.type==='estimate'?'見積書':doc.type==='invoice'?'請求書':'';
      return name===query || number===query || type===query;
    });
    const tooMany=matching.length>request.limit;
    const view=tooMany?[]:matching.slice(0,request.limit).map(doc=>({
      documentId:String(doc.id||''),type:doc.type==='estimate'?'estimate':'invoice',
      number:String(doc.number||''),customerName:String(doc.customerName||''),
      total:Number.isSafeInteger(doc.total)&&doc.total>=0?doc.total:null,
      issueDate:validDate(doc.issueDate)?doc.issueDate:'',
      status:String(doc.status||'')
    }));
    return ok(request.action,{count:matching.length,tooMany,documents:view},
      receipt(request.action,matching.length?'matched':'not_found',matching.length,tooMany));
  };
  const documentPeriod = (request,deps) => {
    const docs=toArray(deps,'getDocuments');
    if(!docs)return fail('DEPENDENCY_MISSING');
    const typed=docs.filter(doc=>object(doc)&&doc.type===request.docType);
    const undatedCount=typed.filter(doc=>!validDate(doc.issueDate)).length;
    const matches=typed.filter(doc=>validDate(doc.issueDate)&&
      doc.issueDate.slice(0,7)===request.month);
    const tooMany=matches.length>request.limit;
    const view=matches.slice(0,request.limit).map(doc=>({
      documentId:String(doc.id||''),
      type:request.docType,number:String(doc.number||''),
      customerName:String(doc.customerName||''),
      total:Number.isSafeInteger(doc.total)&&doc.total>=0?doc.total:null,
      issueDate:doc.issueDate,
      status:String(doc.status||'')
    }));
    return ok(request.action,{
      count:matches.length,tooMany,documents:view,
      month:request.month,documentType:request.docType,undatedCount
    },receipt(request.action,matches.length?'matched':'not_found',matches.length,tooMany));
  };
  const profit = (request,deps) => {
    if(!deps || !deps.profitBrain ||
       typeof deps.profitBrain.getPeriodProfitSummary!=='function')return fail('DEPENDENCY_MISSING');
    const revenues=toArray(deps,'getRevenueRecords');
    const expenses=toArray(deps,'getExpenseRecords');
    const workOrders=toArray(deps,'getWorkOrders');
    if(!revenues||!expenses||!workOrders)return fail('DEPENDENCY_MISSING');
    const summary=deps.profitBrain.getPeriodProfitSummary({
      today:request.date,monthKey:request.date.slice(0,7),
      revenues,expenses,workOrders
    });
    if(!object(summary))return fail('READ_UNAVAILABLE');
    const required=['monthRevenue','monthExpense','monthGrossProfit',
      'confirmedRevenue','confirmedProfit','plannedForecastProfit'];
    if(!required.every(k=>Number.isFinite(summary[k])))return fail('READ_UNAVAILABLE');
    return ok(request.action,{
      month:request.date.slice(0,7),
      monthRevenue:summary.monthRevenue,
      monthExpense:summary.monthExpense,
      monthGrossProfit:summary.monthGrossProfit,
      confirmedRevenue:summary.confirmedRevenue,
      confirmedProfit:summary.confirmedProfit,
      plannedForecastProfit:summary.plannedForecastProfit,
      approximation:true,noBankReconciliation:true
    },receipt(request.action,'estimated',1));
  };
  const work = (request,deps) => {
    const orders=toArray(deps,'getWorkOrders');
    if(!orders)return fail('DEPENDENCY_MISSING');
    const query=request.query.replace(/\s+/g,'');
    const matching=orders.filter(order=>{
      if(!object(order))return false;
      const id=String(order.id||'').replace(/\s+/g,'');
      const name=String(order.customerName||'').replace(/\s+/g,'');
      return name===query||id===query;
    });
    const tooMany=matching.length>request.limit;
    const view=tooMany?[]:matching.slice(0,request.limit).map(order=>({
      workOrderId:String(order.id||''),customerName:String(order.customerName||''),
      scheduledDate:validDate(order.scheduledDate)?order.scheduledDate:'',
      status:String(order.status||''),calendarWritePerformed:false
    }));
    return ok(request.action,{count:matching.length,tooMany,workOrders:view},
      receipt(request.action,matching.length?'matched':'not_found',matching.length,tooMany));
  };
  const receivables = (request,deps) => {
    const revenues=toArray(deps,'getRevenueRecords');
    const docs=toArray(deps,'getDocuments');
    if(!revenues||!docs||!deps.paymentBrain||
      typeof deps.paymentBrain.summarizeReceivables!=='function')return fail('DEPENDENCY_MISSING');
    const summary=deps.paymentBrain.summarizeReceivables(revenues,docs,request.date);
    if(!summary||!Number.isFinite(summary.pendingTotal)||!Number.isInteger(summary.count))
      return fail('CALCULATION_UNAVAILABLE');
    // Important: NEVER return summary.items to GPT/UI; it includes potentially
    // sensitive invoice/customer records. Aggregate only.
    const view={
      pendingTotal:summary.pendingTotal, count:summary.count,
      overdueCount:summary.overdueCount, thisMonthExpected:summary.thisMonthExpected,
      nextMonthExpected:summary.nextMonthExpected,
      bankReconciliationPerformed:false,paidStatusChanged:false
    };
    return ok(request.action,view,receipt(request.action,'aggregate',summary.count));
  };
  function perform(request,deps,consent) {
    if(consent!==true) return fail('LOCAL_CONSENT_REQUIRED');
    const normalized=verify(request);
    if(!normalized) return fail(BAD_INPUT);
    try {
      if(normalized.action==='customer.search')return customer(normalized,deps);
      if(normalized.action==='document.search')return document(normalized,deps);
      if(normalized.action==='document.period')return documentPeriod(normalized,deps);
      if(normalized.action==='work.search')return work(normalized,deps);
      if(normalized.action==='receivables.summary')return receivables(normalized,deps);
      if(normalized.action==='profit.summary')return profit(normalized,deps);
    } catch(_) { return fail('READ_UNAVAILABLE'); }
    return fail('ACTION_NOT_ALLOWED');
  }
  return Object.freeze({ACTIONS,perform});
})();
if(typeof module!=='undefined'&&module.exports)module.exports={BudilGptReadOnly};
