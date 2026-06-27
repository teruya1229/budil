/**
 * Budil v4.8.4 - 入金予定・支払方法管理（整合性重視）
 * 売上・請求書の支払方法・入金状態を共通で扱う
 */
const PaymentBrain = {
  PAYMENT_METHODS: [
    { value: 'cash', label: '現金' },
    { value: 'bank_transfer', label: '銀行振込' },
    { value: 'touch_payment', label: 'タッチ決済' },
    { value: 'online_payment', label: 'オンライン決済' },
    { value: 'square_card', label: 'Squareカード決済' },
    { value: 'kurashi_deferred', label: 'くらし後払い' },
    { value: 'kurashi_card', label: 'くらしカード決済' },
    { value: 'corporate_monthly', label: '法人月末請求' },
    { value: 'other', label: 'その他' }
  ],

  PAYMENT_METHOD_LABELS: {
    cash: '現金',
    bank_transfer: '銀行振込',
    touch_payment: 'タッチ決済',
    online_payment: 'オンライン決済',
    square_card: 'Squareカード決済',
    kurashi_deferred: 'くらし後払い',
    kurashi_card: 'くらしカード決済',
    corporate_monthly: '法人月末請求',
    other: 'その他',
    card: 'カード決済（旧）'
  },

  PAYMENT_METHOD_RULE_LABELS: {
    cash: '当日入金済み',
    bank_transfer: '月末締翌月末日払',
    touch_payment: '毎月5日払（1〜4日は当月5日、5日以降は翌月5日）',
    online_payment: '月末締翌月末日払',
    square_card: '毎週水曜締・同週金曜払',
    kurashi_deferred: '月末締め・翌月末払い',
    kurashi_card: '毎月1日払・4営業日前締（土日のみ除外、祝日は未対応）',
    corporate_monthly: '初期値は翌月末。翌々月末払いの場合は手入力してください。',
    other: '手入力',
    card: '旧カード決済：手入力または既存予定日を優先'
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

  parseISODate(date) {
    const s = String(date || '').trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  },

  toISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  addDaysISO(date, days) {
    const d = this.parseISODate(date) || this.parseISODate(this.todayISO());
    d.setDate(d.getDate() + Number(days || 0));
    return this.toISODate(d);
  },

  monthEndISO(year, monthIndex) {
    return this.toISODate(new Date(year, monthIndex + 1, 0, 12, 0, 0, 0));
  },

  nextMonthEndISO(baseDate) {
    const d = this.parseISODate(baseDate) || this.parseISODate(this.todayISO());
    return this.monthEndISO(d.getFullYear(), d.getMonth() + 1);
  },

  firstOfMonthISO(year, monthIndex) {
    return this.toISODate(new Date(year, monthIndex, 1, 12, 0, 0, 0));
  },

  subtractBusinessDaysISO(date, count) {
    const d = this.parseISODate(date) || this.parseISODate(this.todayISO());
    let remaining = Number(count || 0);
    while (remaining > 0) {
      d.setDate(d.getDate() - 1);
      const day = d.getDay();
      if (day !== 0 && day !== 6) remaining -= 1;
    }
    return this.toISODate(d);
  },

  calculateExpectedPaymentDate(paymentMethod, baseDate) {
    const method = String(paymentMethod || '').trim();
    const base = this.parseISODate(baseDate) || this.parseISODate(this.todayISO());
    const iso = this.toISODate(base);
    const year = base.getFullYear();
    const month = base.getMonth();
    const day = base.getDate();
    const weekday = base.getDay();

    if (method === 'cash') return iso;
    if (['bank_transfer', 'online_payment', 'kurashi_deferred', 'corporate_monthly'].includes(method)) {
      return this.nextMonthEndISO(iso);
    }
    if (method === 'touch_payment') {
      const targetMonth = day <= 4 ? month : month + 1;
      return this.toISODate(new Date(year, targetMonth, 5, 12, 0, 0, 0));
    }
    if (method === 'square_card') {
      const daysToFriday = weekday <= 3 ? 5 - weekday : 12 - weekday;
      return this.addDaysISO(iso, daysToFriday);
    }
    if (method === 'kurashi_card') {
      const candidate = this.firstOfMonthISO(year, month + 1);
      const cutoff = this.subtractBusinessDaysISO(candidate, 4);
      if (iso <= cutoff) return candidate;
      return this.firstOfMonthISO(year, month + 2);
    }
    return '';
  },

  getPaymentMethodRuleLabel(paymentMethod) {
    return this.PAYMENT_METHOD_RULE_LABELS[paymentMethod] || '手入力';
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
    const expectedPaymentDate = this.calculateExpectedPaymentDate(method, baseDate);
    if (method === 'cash') {
      return {
        paymentStatus: 'paid',
        paidDate: baseDate,
        paidAmount: amt,
        unpaidAmount: 0,
        expectedPaymentDate
      };
    }
    return {
      paymentStatus: 'pending',
      paidDate: '',
      paidAmount: 0,
      unpaidAmount: amt,
      expectedPaymentDate
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
    const baseDate = opts.date || next.workDate || next.issueDate || this.todayISO();
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
    if (method === 'cash' && (opts.forceStatusDefault === true || opts.forceExpectedDate === true)) {
      next.paidDate = baseDate;
    }
    const normalized = this.normalizePaymentAmounts(next, total, baseDate);
    const calculatedExpectedDate = this.calculateExpectedPaymentDate(method, baseDate);
    if ((method === 'other' || method === 'card') && opts.forceExpectedDate === true) {
      next.expectedPaymentDate = '';
    } else if (method !== 'other' && method !== 'card' && (opts.forceExpectedDate === true || !next.expectedPaymentDate)) {
      next.expectedPaymentDate = calculatedExpectedDate;
    } else if (method === 'cash' && opts.forceExpectedDate === true) {
      next.expectedPaymentDate = calculatedExpectedDate;
    }
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
    if (!storage || !revenueId || !documentId) return { linked: false };
    const revId = String(revenueId).trim();
    const docId = String(documentId).trim();
    if (!revId || !docId) return { linked: false };

    const revenues = storage.getRevenueRecords();
    const documents = storage.getDocuments();
    const revenue = revenues.find(r => r.id === revId);
    const document = documents.find(d => d.id === docId);
    if (!revenue || !document) return { linked: false };

    const prevDocId = String(revenue.linkedDocumentId || '').trim();
    const prevRevId = String(document.linkedRevenueId || '').trim();

    if (prevDocId && prevDocId !== docId) {
      const prevDoc = documents.find(d => d.id === prevDocId);
      if (prevDoc && String(prevDoc.linkedRevenueId || '').trim() === revId) {
        storage.updateDocument(prevDocId, { linkedRevenueId: '' });
      }
    }
    if (prevRevId && prevRevId !== revId) {
      const prevRevenue = revenues.find(r => r.id === prevRevId);
      if (prevRevenue && String(prevRevenue.linkedDocumentId || '').trim() === docId) {
        storage.updateRevenueRecord(prevRevId, { linkedDocumentId: '' });
      }
    }

    revenues.forEach(r => {
      if (r.id !== revId && String(r.linkedDocumentId || '').trim() === docId) {
        storage.updateRevenueRecord(r.id, { linkedDocumentId: '' });
      }
    });
    documents.forEach(d => {
      if (d.id !== docId && String(d.linkedRevenueId || '').trim() === revId) {
        storage.updateDocument(d.id, { linkedRevenueId: '' });
      }
    });

    storage.updateRevenueRecord(revId, { linkedDocumentId: docId });
    storage.updateDocument(docId, { linkedRevenueId: revId });
    return { linked: true, revenueId: revId, documentId: docId };
  },

  unlinkRevenueDocument(revenueId, storage) {
    if (!storage || !revenueId) return false;
    const revId = String(revenueId).trim();
    if (!revId) return false;
    const revenue = storage.getRevenueRecords().find(r => r.id === revId);
    const docId = String(revenue && revenue.linkedDocumentId || '').trim();
    storage.updateRevenueRecord(revId, { linkedDocumentId: '' });
    if (docId) {
      const doc = storage.getDocuments().find(d => d.id === docId);
      if (doc && String(doc.linkedRevenueId || '').trim() === revId) {
        storage.updateDocument(docId, { linkedRevenueId: '' });
      }
    }
    return true;
  },

  unlinkDocumentRevenue(documentId, storage) {
    if (!storage || !documentId) return false;
    const docId = String(documentId).trim();
    if (!docId) return false;
    const doc = storage.getDocuments().find(d => d.id === docId);
    const revId = String(doc && doc.linkedRevenueId || '').trim();
    storage.updateDocument(docId, { linkedRevenueId: '' });
    if (revId) {
      const revenue = storage.getRevenueRecords().find(r => r.id === revId);
      if (revenue && String(revenue.linkedDocumentId || '').trim() === docId) {
        storage.updateRevenueRecord(revId, { linkedDocumentId: '' });
      }
    }
    return true;
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

  getSourceDisplayLabel(item) {
    return '元データ：' + this.getSourceTypeLabel(item);
  },

  getLinkedBreakLabel(item) {
    if (item.linkedBroken === 'revenue') return 'linked元の売上が見つかりません';
    if (item.linkedBroken === 'document') return 'linked先の請求書が見つかりません';
    return '';
  },

  getDelayLabel(expectedDate, today) {
    const exp = String(expectedDate || '').trim();
    if (!exp) return '入金予定日未設定';
    const base = today || this.todayISO();
    if (exp >= base) {
      const diff = Math.round((new Date(exp + 'T12:00:00') - new Date(base + 'T12:00:00')) / 86400000);
      return diff === 0 ? '本日入金予定' : `入金予定まであと${diff}日`;
    }
    const overdue = Math.round((new Date(base + 'T12:00:00') - new Date(exp + 'T12:00:00')) / 86400000);
    return `${overdue}日遅れ`;
  },

  getMonthKey(date) {
    return String(date || this.todayISO()).slice(0, 7);
  },

  getNextMonthKey(monthKey) {
    const [y, m] = String(monthKey || this.getMonthKey()).split('-').map(Number);
    if (m === 12) return `${y + 1}-01`;
    return `${y}-${String(m + 1).padStart(2, '0')}`;
  },

  sortReceivableItems(items, today) {
    const base = today || this.todayISO();
    const rank = (item) => {
      const exp = String(item.expectedPaymentDate || '').trim();
      if (!exp) return { group: 2, sortKey: '9999-99-99' };
      if (exp < base && this.isReceivablePending(item.record)) return { group: 0, sortKey: exp };
      return { group: 1, sortKey: exp };
    };
    return [...(items || [])].sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra.group !== rb.group) return ra.group - rb.group;
      if (ra.sortKey !== rb.sortKey) return ra.sortKey.localeCompare(rb.sortKey);
      return (b.unpaidAmount || 0) - (a.unpaidAmount || 0);
    });
  },

  filterReceivables(items, filter, today) {
    const base = today || this.todayISO();
    const monthKey = this.getMonthKey(base);
    const nextMonthKey = this.getNextMonthKey(monthKey);
    const f = String(filter || 'all');
    if (f === 'this_month') {
      return (items || []).filter(i => String(i.expectedPaymentDate || '').startsWith(monthKey));
    }
    if (f === 'next_month') {
      return (items || []).filter(i => String(i.expectedPaymentDate || '').startsWith(nextMonthKey));
    }
    if (f === 'overdue') {
      return (items || []).filter(i => this.isOverdue(i.record, base));
    }
    if (f === 'corporate_monthly') {
      return (items || []).filter(i => i.paymentMethod === 'corporate_monthly');
    }
    if (f === 'kurashi') {
      return (items || []).filter(i => ['kurashi_deferred', 'kurashi_card'].includes(i.paymentMethod));
    }
    if (f === 'other') {
      return (items || []).filter(i => !['corporate_monthly', 'kurashi_deferred', 'kurashi_card'].includes(i.paymentMethod));
    }
    return items || [];
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
      const linkedBroken = doc.linkedRevenueId && !linkedRev ? 'revenue' : '';
      const key = doc.linkedRevenueId
        ? 'link:rev:' + doc.linkedRevenueId
        : (doc.linkedDocumentId ? 'link:doc:' + doc.id : 'document:' + doc.id);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      items.push({
        key,
        sourceType: linkedRev ? 'linked' : 'document',
        linkedBroken,
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
      const linkedDoc = rev.linkedDocumentId
        ? docList.find(d => d.id === rev.linkedDocumentId)
        : null;
      const linkedBroken = rev.linkedDocumentId && !linkedDoc ? 'document' : '';
      const key = rev.linkedDocumentId
        ? 'link:doc:' + rev.linkedDocumentId
        : 'revenue:' + rev.id;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      items.push({
        key,
        sourceType: 'revenue',
        linkedBroken,
        record: rev,
        revenue: rev,
        document: linkedDoc || null,
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

    return this.sortReceivableItems(items, this.todayISO());
  },

  summarizeReceivables(revenues, documents, today) {
    const base = today || this.todayISO();
    const monthKey = this.getMonthKey(base);
    const nextMonthKey = this.getNextMonthKey(monthKey);
    const items = this.buildReceivableItems(revenues, documents);
    let pendingTotal = 0;
    let thisMonthExpected = 0;
    let nextMonthExpected = 0;
    let overdueCount = 0;
    items.forEach(item => {
      pendingTotal += item.unpaidAmount || 0;
      const exp = String(item.expectedPaymentDate || '').trim();
      if (exp && exp.startsWith(monthKey)) {
        thisMonthExpected += item.unpaidAmount || 0;
      }
      if (exp && exp.startsWith(nextMonthKey)) {
        nextMonthExpected += item.unpaidAmount || 0;
      }
      if (this.isOverdue(item.record, base)) overdueCount += 1;
    });
    return {
      pendingTotal,
      thisMonthExpected,
      nextMonthExpected,
      overdueCount,
      count: items.length,
      items
    };
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
