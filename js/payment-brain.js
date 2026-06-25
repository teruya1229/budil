/**
 * Budil v4.4.9.2 - 入金予定・支払方法管理（整合性重視）
 * 売上・請求書の支払方法・入金状態を共通で扱う
 */
const PaymentBrain = {
  PAYMENT_METHODS: [
    { value: 'cash', label: '現金' },
    { value: 'bank_transfer', label: '銀行振込' },
    { value: 'card', label: 'カード決済' },
    { value: 'kurashi_deferred', label: 'くらし後払い' },
    { value: 'kurashi_card', label: 'くらしカード決済' },
    { value: 'corporate_monthly', label: '法人月末請求' },
    { value: 'other', label: 'その他' }
  ],

  PAYMENT_METHOD_LABELS: {
    cash: '現金',
    bank_transfer: '銀行振込',
    card: 'カード決済',
    kurashi_deferred: 'くらし後払い',
    kurashi_card: 'くらしカード決済',
    corporate_monthly: '法人月末請求',
    other: 'その他'
  },

  PAYMENT_STATUSES: [
    { value: 'pending', label: '入金待ち' },
    { value: 'paid', label: '入金済み' },
    { value: 'partial', label: '一部入金' },
    { value: 'uncollected', label: '未回収' },
    { value: 'cancelled', label: '取消' }
  ],

  PAYMENT_STATUS_LABELS: {
    pending: '入金待ち',
    paid: '入金済み',
    partial: '一部入金',
    uncollected: '未回収',
    cancelled: '取消'
  },

  LEGACY_PAYMENT_STATUS: {
    '未入金': 'pending',
    '入金済み': 'paid'
  },

  RECEIVABLE_STATUSES: ['pending', 'partial', 'uncollected'],

  todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  parseAmount(val) {
    if (val == null || val === '') return 0;
    const n = Number(String(val).replace(/[,，]/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  },

  formatYen(amount) {
    return Number(amount || 0).toLocaleString('ja-JP') + '円';
  },

  migratePaymentStatus(raw, fallback) {
    const s = String(raw || '').trim();
    if (this.PAYMENT_STATUS_LABELS[s]) return s;
    if (this.LEGACY_PAYMENT_STATUS[s]) return this.LEGACY_PAYMENT_STATUS[s];
    return fallback || 'pending';
  },

  getTotal(record) {
    if (!record) return 0;
    if (record.type === 'invoice' || record.type === 'estimate') {
      return this.parseAmount(record.total);
    }
    return this.parseAmount(record.amount != null ? record.amount : record.total);
  },

  getPaymentMethodLabel(record) {
    const method = record && record.paymentMethod;
    return this.PAYMENT_METHOD_LABELS[method] || method || '—';
  },

  getPaymentStatusLabel(record) {
    const status = this.migratePaymentStatus(record && record.paymentStatus, 'pending');
    return this.PAYMENT_STATUS_LABELS[status] || status || '—';
  },

  getPaidAmount(record) {
    const total = this.getTotal(record);
    const status = this.migratePaymentStatus(record && record.paymentStatus, 'pending');
    if (status === 'paid') return total;
    if (status === 'partial') return Math.min(total, this.parseAmount(record && record.paidAmount));
    if (status === 'cancelled') return 0;
    if (status === 'pending' || status === 'uncollected') return 0;
    if (record && record.paidAmount != null && record.paidAmount !== '') {
      return Math.min(total, this.parseAmount(record.paidAmount));
    }
    if (status === 'paid') return total;
    return 0;
  },

  getUnpaidAmount(record) {
    const total = this.getTotal(record);
    const status = this.migratePaymentStatus(record && record.paymentStatus, 'pending');
    if (status === 'paid' || status === 'cancelled') return 0;
    if (status === 'partial') {
      const unpaid = this.parseAmount(record && record.unpaidAmount);
      if (unpaid > 0) return unpaid;
      return Math.max(0, total - this.getPaidAmount(record));
    }
    if (status === 'pending' || status === 'uncollected') return total;
    if (record && record.unpaidAmount != null && record.unpaidAmount !== '') {
      return this.parseAmount(record.unpaidAmount);
    }
    return Math.max(0, total - this.getPaidAmount(record));
  },

  getReceivableKey(record) {
    if (!record) return '';
    if (record.linkedDocumentId) return 'link:doc:' + record.linkedDocumentId;
    if (record.linkedRevenueId) return 'link:rev:' + record.linkedRevenueId;
    const kind = record._receivableKind || (record.type === 'invoice' ? 'document' : 'revenue');
    const id = record.id || record._receivableId || '';
    return kind + ':' + id;
  },

  isReceivablePending(record) {
    const status = this.migratePaymentStatus(record && record.paymentStatus, 'pending');
    return this.RECEIVABLE_STATUSES.includes(status);
  },

  isCancelled(record) {
    return this.migratePaymentStatus(record && record.paymentStatus, 'pending') === 'cancelled';
  },

  suggestDefaultsForMethod(method, total, date) {
    const amt = this.parseAmount(total);
    const baseDate = date || this.todayISO();
    if (method === 'cash') {
      return {
        paymentStatus: 'paid',
        paidDate: baseDate,
        paidAmount: amt,
        unpaidAmount: 0,
        expectedPaymentDate: ''
      };
    }
    return {
      paymentStatus: 'pending',
      paidDate: '',
      paidAmount: 0,
      unpaidAmount: amt,
      expectedPaymentDate: ''
    };
  },

  clampAmount(value, total) {
    const max = Math.max(0, this.parseAmount(total));
    return Math.min(max, Math.max(0, this.parseAmount(value)));
  },

  normalizePaymentAmounts(record, total, date) {
    const src = record || {};
    const amt = this.parseAmount(total);
    const paymentStatus = this.migratePaymentStatus(src.paymentStatus, 'pending');
    let paidDate = String(src.paidDate || '').trim();
    let paidAmount = this.clampAmount(src.paidAmount, amt);

    if (paymentStatus === 'paid') {
      paidDate = paidDate || date || this.todayISO();
      paidAmount = amt;
      return { paymentStatus, paidDate, paidAmount, unpaidAmount: 0 };
    }

    if (paymentStatus === 'partial') {
      return {
        paymentStatus,
        paidDate,
        paidAmount,
        unpaidAmount: Math.max(0, amt - paidAmount)
      };
    }

    if (paymentStatus === 'cancelled') {
      return { paymentStatus, paidDate: '', paidAmount: 0, unpaidAmount: 0 };
    }

    return { paymentStatus, paidDate: '', paidAmount: 0, unpaidAmount: amt };
  },

  applyPaymentStatusDefaults(record, total, date) {
    const next = { ...(record || {}) };
    return { ...next, ...this.normalizePaymentAmounts(next, total, date) };
  },

  applyPaymentMethodDefaults(record, total, options) {
    const opts = options || {};
    const method = opts.method || (record && record.paymentMethod) || 'cash';
    const next = { ...(record || {}), paymentMethod: method };
    const currentStatus = this.migratePaymentStatus(next.paymentStatus, method === 'cash' ? 'paid' : 'pending');
    const shouldUseMethodDefault = opts.forceStatusDefault === true
      || !next.paymentStatus
      || currentStatus === 'pending'
      || currentStatus === 'paid';
    if (shouldUseMethodDefault) {
      next.paymentStatus = method === 'cash' ? 'paid' : 'pending';
    } else {
      next.paymentStatus = currentStatus;
    }
    const normalized = this.normalizePaymentAmounts(next, total, opts.date || next.workDate || next.issueDate);
    return { ...next, ...normalized };
  },

  applyMethodChange(current, method, total, date, options) {
    return this.applyPaymentMethodDefaults({ ...(current || {}), paymentMethod: method }, total, {
      ...(options || {}),
      method,
      date
    });
  },

  normalizeRevenuePayment(raw, options) {
    const opts = options || {};
    const src = raw || {};
    const total = this.parseAmount(opts.total != null ? opts.total : src.amount);
    const paymentMethod = (src.paymentMethod && this.PAYMENT_METHOD_LABELS[src.paymentMethod])
      ? src.paymentMethod
      : 'cash';

    let paymentStatus;
    if (src.paymentStatus != null && src.paymentStatus !== '') {
      paymentStatus = this.migratePaymentStatus(src.paymentStatus, 'paid');
    } else {
      paymentStatus = 'paid';
    }

    const amounts = this.normalizePaymentAmounts(
      { ...src, paymentStatus },
      total,
      src.workDate || opts.defaultDate || this.todayISO()
    );

    return {
      paymentMethod,
      paymentStatus: amounts.paymentStatus,
      expectedPaymentDate: String(src.expectedPaymentDate || '').trim(),
      paidDate: amounts.paidDate,
      paidAmount: amounts.paidAmount,
      unpaidAmount: amounts.unpaidAmount,
      paymentMemo: String(src.paymentMemo || '').trim(),
      linkedDocumentId: String(src.linkedDocumentId || '').trim(),
      linkedRevenueId: String(src.linkedRevenueId || '').trim()
    };
  },

  normalizeDocumentPayment(raw, options) {
    const opts = options || {};
    const total = this.parseAmount(opts.total != null ? opts.total : raw.total);
    const issueDate = raw.issueDate || opts.defaultDate || this.todayISO();
    let paymentMethod = raw.paymentMethod;
    if (!paymentMethod || !this.PAYMENT_METHOD_LABELS[paymentMethod]) {
      paymentMethod = 'bank_transfer';
    }
    let paymentStatus = this.migratePaymentStatus(raw.paymentStatus, 'pending');
    if (!raw.paymentStatus && raw.status === 'paid') {
      paymentStatus = 'paid';
    }
    if (!raw.paymentStatus && !raw.status) {
      paymentStatus = 'pending';
    }

    const amounts = this.normalizePaymentAmounts(
      { ...raw, paymentStatus },
      total,
      raw.paidDate || issueDate
    );

    return {
      paymentMethod,
      paymentStatus: amounts.paymentStatus,
      expectedPaymentDate: String(raw.expectedPaymentDate || '').trim(),
      paidDate: amounts.paidDate,
      paidAmount: amounts.paidAmount,
      unpaidAmount: amounts.unpaidAmount,
      paymentMemo: String(raw.paymentMemo || '').trim(),
      linkedDocumentId: String(raw.linkedDocumentId || '').trim(),
      linkedRevenueId: String(raw.linkedRevenueId || '').trim()
    };
  },

  buildPaidPatch(total, today) {
    const amt = this.parseAmount(total);
    const date = today || this.todayISO();
    return {
      paymentStatus: 'paid',
      paidDate: date,
      paidAmount: amt,
      unpaidAmount: 0
    };
  },

  buildPartialPatch(total, paidAmount) {
    const amt = this.parseAmount(total);
    const paid = this.clampAmount(paidAmount, amt);
    return {
      paymentStatus: 'partial',
      paidAmount: paid,
      unpaidAmount: Math.max(0, amt - paid)
    };
  },

  buildCancelledPatch() {
    return {
      paymentStatus: 'cancelled',
      paidDate: '',
      paidAmount: 0,
      unpaidAmount: 0
    };
  },

  syncLinkedPayment(sourceKind, sourceId, patch, storage) {
    if (sourceKind && typeof sourceKind === 'object') {
      const opts = sourceKind;
      sourceKind = opts.sourceType || opts.sourceKind;
      sourceId = opts.sourceId;
      patch = opts.paymentPatch || opts.patch;
      storage = opts.storage;
    }
    if (!storage || !sourceKind || !sourceId || !patch) return { updated: false };
    const revenues = storage.getRevenueRecords();
    const documents = storage.getDocuments();
    let revenue = null;
    let document = null;

    if (sourceKind === 'revenue') {
      revenue = revenues.find(r => r.id === sourceId);
      if (revenue && revenue.linkedDocumentId) {
        document = documents.find(d => d.id === revenue.linkedDocumentId);
      }
      if (!document) {
        document = documents.find(d => d.linkedRevenueId === sourceId);
      }
    } else if (sourceKind === 'document') {
      document = documents.find(d => d.id === sourceId);
      if (document && document.linkedRevenueId) {
        revenue = revenues.find(r => r.id === document.linkedRevenueId);
      }
      if (!revenue) {
        revenue = revenues.find(r => r.linkedDocumentId === sourceId);
      }
    }

    const buildTargetPaymentPatch = (target, total) => {
      const allowed = [
        'paymentMethod',
        'paymentStatus',
        'expectedPaymentDate',
        'paidDate',
        'paidAmount',
        'unpaidAmount',
        'paymentMemo'
      ];
      const base = {};
      allowed.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(patch, key)) base[key] = patch[key];
      });
      const status = this.migratePaymentStatus(base.paymentStatus || target.paymentStatus, 'pending');
      const normalized = this.applyPaymentStatusDefaults(
        { ...target, ...base, paymentStatus: status },
        total,
        base.paidDate || patch.paidDate || this.todayISO()
      );
      const result = { ...base };
      ['paymentStatus', 'paidDate', 'paidAmount', 'unpaidAmount'].forEach(key => {
        result[key] = normalized[key];
      });
      return result;
    };

    if (revenue && sourceKind === 'document') {
      storage.updateRevenueRecord(revenue.id, buildTargetPaymentPatch(revenue, revenue.amount));
      return { updated: true, targetType: 'revenue', targetId: revenue.id };
    }
    if (document && sourceKind === 'revenue') {
      storage.updateDocument(document.id, buildTargetPaymentPatch(document, document.total));
      return { updated: true, targetType: 'document', targetId: document.id };
    }
    return { updated: false };
  },

  linkRevenueAndDocument(revenueId, documentId, storage) {
    if (!storage || !revenueId || !documentId) return;
    storage.updateRevenueRecord(revenueId, { linkedDocumentId: documentId });
    storage.updateDocument(documentId, { linkedRevenueId: revenueId });
  },

  getCounterparty(record) {
    return String(record.customerName || record.title || '—').trim() || '—';
  },

  getSubject(record) {
    if (record.type === 'invoice') {
      return String(record.title || record.items?.[0]?.name || '—').trim() || '—';
    }
    return String(record.service || record.memo || record.title || '—').trim() || '—';
  },

  getSourceTypeLabel(item) {
    if (item.sourceType === 'linked') return '売上＋請求書';
    if (item.sourceType === 'document') return '請求書';
    return '売上';
  },

  getDelayLabel(expectedDate, today) {
    const exp = String(expectedDate || '').trim();
    if (!exp) return '—';
    const base = today || this.todayISO();
    if (exp >= base) {
      const diff = Math.round((new Date(exp + 'T12:00:00') - new Date(base + 'T12:00:00')) / 86400000);
      return diff === 0 ? '本日' : `あと${diff}日`;
    }
    const overdue = Math.round((new Date(base + 'T12:00:00') - new Date(exp + 'T12:00:00')) / 86400000);
    return `遅れ${overdue}日`;
  },

  isOverdue(record, today) {
    const exp = String(record.expectedPaymentDate || '').trim();
    if (!exp) return false;
    const base = today || this.todayISO();
    return exp < base && this.isReceivablePending(record);
  },

  buildReceivableItems(revenues, documents) {
    const revList = (revenues || []).map(r => {
      const payment = this.normalizeRevenuePayment(r, { total: r.amount, defaultDate: r.workDate });
      return { ...r, ...payment, _receivableKind: 'revenue' };
    });
    const docList = (documents || [])
      .filter(d => d && d.type === 'invoice')
      .map(d => {
        const payment = this.normalizeDocumentPayment(d, { total: d.total, defaultDate: d.issueDate });
        return { ...d, ...payment, _receivableKind: 'document' };
      });

    const linkedDocIds = new Set();
    const linkedRevIds = new Set();
    revList.forEach(r => {
      if (r.linkedDocumentId) linkedDocIds.add(r.linkedDocumentId);
      if (r.linkedRevenueId) linkedRevIds.add(r.linkedRevenueId);
    });
    docList.forEach(d => {
      if (d.linkedRevenueId) linkedRevIds.add(d.linkedRevenueId);
      if (d.linkedDocumentId) linkedDocIds.add(d.linkedDocumentId);
    });

    const items = [];
    const seenKeys = new Set();

    docList.forEach(doc => {
      if (!this.isReceivablePending(doc)) return;
      const linkedRev = doc.linkedRevenueId
        ? revList.find(r => r.id === doc.linkedRevenueId)
        : null;
      const key = doc.linkedRevenueId
        ? 'link:rev:' + doc.linkedRevenueId
        : (doc.linkedDocumentId ? 'link:doc:' + doc.id : 'document:' + doc.id);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      items.push({
        key,
        sourceType: linkedRev ? 'linked' : 'document',
        record: doc,
        revenue: linkedRev || null,
        document: doc,
        counterparty: this.getCounterparty(doc),
        subject: this.getSubject(doc),
        total: this.getTotal(doc),
        unpaidAmount: this.getUnpaidAmount(doc),
        paymentMethod: doc.paymentMethod,
        expectedPaymentDate: doc.expectedPaymentDate,
        paymentStatus: doc.paymentStatus,
        primaryKind: 'document',
        primaryId: doc.id,
        linkedRevenueId: doc.linkedRevenueId || '',
        linkedDocumentId: doc.id
      });
    });

    revList.forEach(rev => {
      if (!this.isReceivablePending(rev)) return;
      if (rev.linkedDocumentId && docList.some(d => d.id === rev.linkedDocumentId && this.isReceivablePending(d))) {
        return;
      }
      const key = rev.linkedDocumentId
        ? 'link:doc:' + rev.linkedDocumentId
        : 'revenue:' + rev.id;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      items.push({
        key,
        sourceType: 'revenue',
        record: rev,
        revenue: rev,
        document: null,
        counterparty: this.getCounterparty(rev),
        subject: this.getSubject(rev),
        total: this.getTotal(rev),
        unpaidAmount: this.getUnpaidAmount(rev),
        paymentMethod: rev.paymentMethod,
        expectedPaymentDate: rev.expectedPaymentDate,
        paymentStatus: rev.paymentStatus,
        primaryKind: 'revenue',
        primaryId: rev.id,
        linkedRevenueId: rev.id,
        linkedDocumentId: rev.linkedDocumentId || ''
      });
    });

    return items.sort((a, b) => {
      const da = a.expectedPaymentDate || '9999-99-99';
      const db = b.expectedPaymentDate || '9999-99-99';
      if (da !== db) return da.localeCompare(db);
      return (b.unpaidAmount || 0) - (a.unpaidAmount || 0);
    });
  },

  summarizeReceivables(revenues, documents, today) {
    const base = today || this.todayISO();
    const monthKey = base.slice(0, 7);
    const items = this.buildReceivableItems(revenues, documents);
    let pendingTotal = 0;
    let thisMonthExpected = 0;
    let overdueCount = 0;
    items.forEach(item => {
      pendingTotal += item.unpaidAmount || 0;
      const exp = String(item.expectedPaymentDate || '').trim();
      if (exp && exp.startsWith(monthKey)) {
        thisMonthExpected += item.unpaidAmount || 0;
      }
      if (this.isOverdue(item.record, base)) overdueCount += 1;
    });
    return { pendingTotal, thisMonthExpected, overdueCount, count: items.length, items };
  },

  getDocumentStatusLabel(doc) {
    if (typeof DocumentsBrain !== 'undefined') {
      return DocumentsBrain.statusLabel('invoice', doc.status || 'draft');
    }
    const map = { draft: '下書き', issued: '請求済み', paid: '入金済み', cancelled: '取消' };
    return map[doc.status] || doc.status || '—';
  },

  getCombinedStatusDisplay(doc) {
    const docStatus = this.getDocumentStatusLabel(doc);
    const payStatus = this.getPaymentStatusLabel(doc);
    return { docStatus, payStatus, combined: `書類状態：${docStatus} / 入金状態：${payStatus}` };
  },

  revenueToDocumentPrefill(revenue) {
    const r = revenue || {};
    const payment = this.normalizeRevenuePayment(r, { total: r.amount, defaultDate: r.workDate });
    return { ...payment };
  }
};
