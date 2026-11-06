/** Local two-stage completion and invoice flow. Work, revenue, and documents use separate keys;
 * recovery is derived from saved records after reload. No Google side effects. */
const BudilGptInvoiceLifecycle = (() => {
  'use strict';
  const date = s => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
    const d = new Date(s + 'T00:00:00Z');
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  };
  const fail = code => ({ok:false,code});
  const fingerprint = value => JSON.stringify(value);
  const linkedRevenue = (order, storage) => storage.getRevenueRecords().find(r =>
    String(r.sourceWorkOrderId || r.workOrderId || '') === String(order.id));
  const hasInvoice = (order, storage) => storage.getDocuments().some(d => d.type === 'invoice' &&
    (String(d.sourceWorkOrderId || '') === String(order.id) ||
      d.localLifecycleKey === 'work-order:' + order.id));
  function billedAmount(order, fields, documents) {
    if (fields.tax !== 'excluded') return Number(fields.amount);
    const settings=documents.taxSettingsFromFormDisplayMode('taxExcluded',documents.defaultTaxSettings());
    return documents.calcFromItems([{name:order.serviceText,quantity:1,
      unitPrice:Number(fields.amount),amount:Number(fields.amount)}],settings,
      {itemsTaxBasis:'exclusive'}).total;
  }
  function stage(order, storage) {
    if (!order || !order.id) return 'missing';
    if (hasInvoice(order, storage)) return 'invoiced';
    return order.status === 'completed' && linkedRevenue(order, storage) ? 'pending_invoice' : 'pending_completion';
  }
  function prepareCompletion(order, fields, deps) {
    if (!order || !order.id || hasInvoice(order, deps.storage)) return fail('WORK_ALREADY_INVOICED');
    if (['cancelled','archived'].includes(order.status) ||
        !deps.workCompletion.isOperationalWorkOrder(order)) return fail('WORK_NOT_ACTIVE');
    if (!String(order.customerName || '').trim() || !String(order.serviceText || '').trim())
      return fail('WORK_ORDER_INCOMPLETE');
    if (!date(fields.workDate) || !Number.isSafeInteger(Number(fields.amount)) || Number(fields.amount) <= 0 ||
        !['included','excluded'].includes(fields.tax)) return fail('COMPLETION_DETAILS_REQUIRED');
    const revenue = linkedRevenue(order, deps.storage);
    if (order.status === 'completed' && revenue) return fail('COMPLETION_ALREADY_RECORDED');
    const total=billedAmount(order,fields,deps.documents);
    if (revenue && (Number(revenue.amount) !== total ||
        revenue.workDate !== fields.workDate)) return fail('EXISTING_REVENUE_CONFLICT');
    const input = {workDate:fields.workDate,customerName:order.customerName,
      actualService:order.serviceText,amount:total,paymentMethod:fields.paymentMethod || 'bank_transfer',
      paymentStatus:'未入金'};
    const payload = deps.workCompletion.createRevenuePayloadFromWorkOrder(order, input);
    return {ok:true,kind:'completion',sourceId:order.id,sourceSnapshot:fingerprint(order),
      revenuesSnapshot:fingerprint(deps.storage.getRevenueRecords()),input,payload,
      preview:{customerName:order.customerName,service:order.serviceText,
        workDate:fields.workDate,amount:total,tax:fields.tax}};
  }
  function applyCompletion(prepared, deps) {
    if (!prepared || !prepared.ok || prepared.kind !== 'completion' || deps.confirm !== true)
      return fail('CONFIRM_REQUIRED');
    const storage=deps.storage, order=storage.getWorkOrders().find(w => String(w.id) === prepared.sourceId);
    if (fingerprint(order) !== prepared.sourceSnapshot) return fail('SOURCE_CHANGED');
    if (hasInvoice(order, storage)) return fail('WORK_ALREADY_INVOICED');
    if (fingerprint(storage.getRevenueRecords()) !== prepared.revenuesSnapshot) return fail('REVENUES_CHANGED');
    const beforeOrders=storage.getWorkOrders(), beforeRevenue=storage.getRevenueRecords();
    try {
      storage.createSafetyBackup({reason:'budil_gpt_work_completion',targetKey:storage.KEYS.WORK_ORDERS,
        targetId:prepared.sourceId,data:beforeOrders,beforeCount:beforeOrders.length});
      storage.createSafetyBackup({reason:'budil_gpt_work_completion',targetKey:storage.KEYS.REVENUE_RECORDS,
        targetId:prepared.sourceId,data:beforeRevenue,beforeCount:beforeRevenue.length});
    } catch (_) { return fail('BACKUP_FAILED'); }
    const result=storage.confirmRevenueForWorkOrder(prepared.sourceId,prepared.payload,prepared.input);
    if (!result.ok) return {ok:false,code:result.error === 'work_order_link_failed' ?
      'COMPLETION_LINK_PENDING_RETRY' : 'COMPLETION_SAVE_FAILED'};
    if (stage(result.workOrder,storage) !== 'pending_invoice') return fail('COMPLETION_VERIFY_FAILED');
    return {ok:true,stage:'pending_invoice',workOrder:result.workOrder,revenue:result.revenue};
  }
  function prepareWork(order, fields, deps) {
    if (!order || !order.id || order.status !== 'completed' || !order.completedAt)
      return fail('COMPLETION_NOT_RECORDED');
    if (!String(order.customerName || '').trim() || !String(order.serviceText || '').trim())
      return fail('WORK_ORDER_INCOMPLETE');
    if (hasInvoice(order, deps.storage)) return fail('DUPLICATE_INVOICE');
    const revenue=linkedRevenue(order,deps.storage);
    if (revenue && (Number(revenue.amount) !== billedAmount(order,fields,deps.documents) ||
        revenue.workDate !== fields.workDate)) return fail('COMPLETION_INVOICE_MISMATCH');
    if (!Number.isSafeInteger(Number(fields.amount)) || Number(fields.amount) <= 0 ||
        !['included','excluded'].includes(fields.tax)) return fail('AMOUNT_OR_TAX_REQUIRED');
    if (!date(fields.issueDate) || !date(fields.dueDate) || fields.dueDate < fields.issueDate ||
        !date(fields.workDate)) return fail('DATES_REQUIRED');
    if (fields.paymentMethod !== 'bank_transfer' || !date(fields.expectedPaymentDate))
      return fail('PAYMENT_FIELDS_REQUIRED');
    if (fields.expectedPaymentDate > fields.dueDate) return fail('PAYMENT_DATE_AFTER_DUE');
    const customers = deps.storage.getLeads();
    const matches = customers.filter(c => String(c.company || c.name || c.customerName || c.companyName || c.contact || '').replace(/\s|様|御中/g,'') ===
      String(order.customerName).replace(/\s|様|御中/g,''));
    if (matches.length !== 1) return fail('CUSTOMER_NOT_UNIQUE');
    const item = {description:order.serviceText,quantity:1,unitPrice:Number(fields.amount)};
    const entry = deps.entrypoint.validateAndNormalize({customerId:matches[0].id || matches[0].customerId,
      invoiceDate:fields.issueDate,dueDate:fields.dueDate,items:[item],
      idempotencyKey:'work-order:' + order.id},
      {customers,documents:deps.storage.getDocuments()});
    if (!entry.ok) return fail(entry.code);
    let draft=entry.draft;
    if (fields.tax === 'excluded') {
      const settings=deps.documents.taxSettingsFromFormDisplayMode('taxExcluded',
        deps.documents.defaultTaxSettings());
      const calc=deps.documents.calcFromItems([{name:order.serviceText,quantity:1,
        unitPrice:Number(fields.amount),amount:Number(fields.amount)}],settings,
        {itemsTaxBasis:'exclusive'});
      draft=deps.documents.normalizeDocument({...draft,items:calc.items,subtotal:calc.subtotal,
        tax:calc.tax,total:calc.total,taxSettings:calc.taxSettings,taxMode:'taxExcluded'});
      if (draft.total !== calc.total || draft.tax !== calc.tax) return fail('TAX_CALC_FAILED');
    } else if (entry.total !== Number(fields.amount)) return fail('TAX_CALC_FAILED');
    const doc = {...draft,issueDate:fields.issueDate,dueDate:fields.dueDate,
      expectedPaymentDate:fields.expectedPaymentDate,sourceWorkOrderId:order.id,
      workDate:fields.workDate,localLifecycleKey:'work-order:' + order.id,
      status:'draft',paymentMethod:'bank_transfer',paymentStatus:'pending',
      paidDate:'',paidAmount:0,unpaidAmount:draft.total};
    return {ok:true,kind:'work',sourceId:order.id,sourceSnapshot:fingerprint(order),
      documentsSnapshot:fingerprint(deps.storage.getDocuments()),documents:[doc],
      preview:{customerName:doc.customerName,service:order.serviceText,total:doc.total,
        tax:doc.tax,issueDate:doc.issueDate,dueDate:doc.dueDate,
        expectedPaymentDate:doc.expectedPaymentDate,number:doc.number}};
  }
  function prepareQuote(approved, customerId, fields, deps) {
    if (!approved || approved.type !== 'estimate' || !customerId ||
        !Number.isSafeInteger(approved.total) || approved.total <= 0) return fail('QUOTE_NOT_APPROVED');
    if (!date(fields.issueDate) || !date(fields.dueDate) || fields.dueDate < fields.issueDate ||
        !date(fields.expectedPaymentDate) || fields.expectedPaymentDate > fields.dueDate)
      return fail('DATES_REQUIRED');
    if (fields.paymentMethod !== 'bank_transfer') return fail('PAYMENT_FIELDS_REQUIRED');
    const storage = deps.storage, before = storage.getDocuments();
    const quote = {...deps.documents.normalizeDocument({...approved,id:'doc-' + storage.generateId(),
      number:deps.documents.suggestNumber(before,'estimate'),status:'draft',
      localLifecycleKey:'quote-source:' + customerId + ':' + fingerprint(approved)}),
      localLifecycleKey:'quote-source:' + customerId + ':' + fingerprint(approved)};
    const base = deps.documents.convertEstimateToInvoice(quote,before);
    if (!base) return fail('CONVERSION_FAILED');
    const invoice = {...deps.documents.normalizeDocument({...base,id:'doc-' + storage.generateId(),
      issueDate:fields.issueDate,dueDate:fields.dueDate,
      expectedPaymentDate:fields.expectedPaymentDate,paymentMethod:'bank_transfer',
      paymentStatus:'pending',paidDate:'',paidAmount:0,unpaidAmount:quote.total,
      sourceEstimateId:quote.id,status:'draft',
      localLifecycleKey:'quote-invoice:' + quote.localLifecycleKey}),
      localLifecycleKey:'quote-invoice:' + quote.localLifecycleKey};
    if (invoice.total !== quote.total || invoice.tax !== quote.tax ||
        fingerprint(invoice.taxSettings) !== fingerprint(quote.taxSettings) ||
        fingerprint(invoice.items) !== fingerprint(quote.items)) return fail('QUOTE_INTEGRITY_FAILED');
    return {ok:true,kind:'quote',sourceId:customerId,sourceSnapshot:fingerprint(approved),
      documentsSnapshot:fingerprint(before),documents:[invoice,quote],
      preview:{customerName:invoice.customerName,service:invoice.title,total:invoice.total,
        tax:invoice.tax,issueDate:invoice.issueDate,dueDate:invoice.dueDate,
        expectedPaymentDate:invoice.expectedPaymentDate,number:invoice.number}};
  }
  function apply(prepared, deps) {
    if (!prepared || !prepared.ok || !deps || deps.confirm !== true) return fail('CONFIRM_REQUIRED');
    const storage = deps.storage;
    if (prepared.kind === 'work') {
      const current = storage.getWorkOrders().find(w => String(w.id) === prepared.sourceId);
      if (fingerprint(current) !== prepared.sourceSnapshot) return fail('SOURCE_CHANGED');
    } else if (prepared.kind === 'quote' &&
        fingerprint(deps.approvedQuote) !== prepared.sourceSnapshot) return fail('SOURCE_CHANGED');
    else if (prepared.kind !== 'quote') return fail('SOURCE_INVALID');
    const before = storage.getDocuments();
    if (fingerprint(before) !== prepared.documentsSnapshot) return fail('DOCUMENTS_CHANGED');
    if (before.some(d => prepared.documents.some(n => d.localLifecycleKey === n.localLifecycleKey ||
        d.id === n.id || (n.sourceWorkOrderId && d.sourceWorkOrderId === n.sourceWorkOrderId) ||
        (d.type === 'invoice' && d.number === n.number))))
      return fail('DUPLICATE_INVOICE');
    try {
      storage.createSafetyBackup({reason:'budil_gpt_invoice_lifecycle',targetKey:storage.KEYS.DOCUMENTS,
        targetId:prepared.sourceId,data:before,beforeCount:before.length});
    } catch (_) { return fail('BACKUP_FAILED'); }
    const next = [...prepared.documents,...before];
    try {
      storage.saveDocuments(next);
      if (fingerprint(storage.getDocuments()) !== fingerprint(next)) throw Error('VERIFY_FAILED');
    } catch (_) {
      try { storage.saveDocuments(before); } catch (_) { return fail('ROLLBACK_FAILED'); }
      return fail('SAVE_FAILED_ROLLED_BACK');
    }
    return {ok:true,invoice:prepared.documents[0],quote:prepared.documents[1] || null};
  }
  return Object.freeze({stage,prepareCompletion,applyCompletion,prepareWork,prepareQuote,apply});
})();
if(typeof module !== 'undefined' && module.exports) module.exports={BudilGptInvoiceLifecycle};
