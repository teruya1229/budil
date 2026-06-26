/**
 * Budil v4.6.0 - 請求書・見積書（税・端数設定・入金管理）
 * localStorage: budil_documents
 */
const DocumentsBrain = {
  SEAL_IMAGE: 'assets/bc-service-seal.jpg',
  TAX_RATE: 10,

  DEFAULT_TAX_SETTINGS: {
    taxDisplayMode: 'taxExcluded',
    taxRate: 10,
    taxCategory: 'taxable10',
    taxRounding: 'floor',
    lineRounding: 'floor',
    showUnit: false,
    showZeroTax: false,
    showTaxBreakdown: true
  },

  TAX_CATEGORY_OPTIONS: [
    { value: 'taxable10', label: '10%', rate: 10 },
    { value: 'reduced8', label: '8%（軽減税率）', rate: 8 },
    { value: 'taxable8', label: '8%', rate: 8 },
    { value: 'taxable5', label: '5%', rate: 5 },
    { value: 'exempt', label: '免税', rate: 0 },
    { value: 'nonTaxable', label: '非課税', rate: 0 },
    { value: 'outOfScope', label: '不課税', rate: 0 }
  ],

  ROUNDING_OPTIONS: [
    { value: 'floor', label: '切り捨て' },
    { value: 'ceil', label: '切り上げ' },
    { value: 'round', label: '四捨五入' }
  ],

  INVOICE_STATUSES: [
    { value: 'draft', label: '下書き' },
    { value: 'issued', label: '請求済み' },
    { value: 'paid', label: '入金済み' },
    { value: 'cancelled', label: '取消' }
  ],

  ESTIMATE_STATUSES: [
    { value: 'draft', label: '下書き' },
    { value: 'submitted', label: '提出済み' },
    { value: 'won', label: '受注' },
    { value: 'lost', label: '失注' },
    { value: 'converted', label: '請求書へ変換済み' }
  ],

  DEFAULT_BANK_INFO: 'PayPay銀行\u3000ビジネス営業部支店\n普通\u3000６１７２９１５\n名義人\u3000ビーシーサービスナンジョウテルヤスバル',

  DEFAULT_ISSUER: {
    name: 'BCサービス南城',
    registrationNumber: 'T6810722660743',
    postalCode: '〒901-1204',
    address: '沖縄県南城市大里稲嶺\n2127-34',
    tel: '080-1716-2205',
    fax: '098-901-7925',
    sealImage: 'assets/bc-service-seal.jpg'
  },

  INVOICE_DEFAULTS: {
    title: 'エアコンクリーニング',
    itemName: 'エアコンクリーニング一式',
    quantity: 1,
    unitPrice: 13000,
    note: '誠に恐れ入りますが、振込手数料はご負担いただきますよう、宜しくお願い致します。'
  },

  ESTIMATE_DEFAULTS: {
    title: '中部支店エアコン取付工事',
    itemName: 'エアコン取外し・処分・取付(標準工事)',
    quantity: 1,
    unitPrice: 27000,
    note: '標準工事には、配管・電線・ドレンホース4mまで、室外機の地面置きまたはベランダ置きが含まれます。\n現地で4mを超える場合は、配管延長として1mごとに＋4,000円追加となります。'
  },

  roundBySetting(value, mode) {
    const n = Number(value) || 0;
    if (mode === 'ceil') return Math.ceil(n);
    if (mode === 'round') return Math.round(n);
    return Math.floor(n);
  },

  getTaxRateFromCategory(category) {
    const hit = this.TAX_CATEGORY_OPTIONS.find(o => o.value === category);
    return hit ? hit.rate : 10;
  },

  taxCategoryLabel(category) {
    const hit = this.TAX_CATEGORY_OPTIONS.find(o => o.value === category);
    return hit ? hit.label : String(category || '');
  },

  defaultTaxSettings() {
    return { ...this.DEFAULT_TAX_SETTINGS };
  },

  normalizeTaxSettings(raw, legacyTaxMode) {
    const base = this.defaultTaxSettings();
    const src = raw && typeof raw === 'object' ? raw : {};
    const fromSettings = src.taxSettings && typeof src.taxSettings === 'object' ? src.taxSettings : {};

    let taxDisplayMode = fromSettings.taxDisplayMode;
    if (taxDisplayMode !== 'taxIncluded' && taxDisplayMode !== 'taxExcluded') {
      const mode = legacyTaxMode || src.taxMode;
      if (mode === 'taxIncluded') taxDisplayMode = 'taxIncluded';
      else if (mode === 'taxExcluded') taxDisplayMode = 'taxExcluded';
      else taxDisplayMode = base.taxDisplayMode;
    }

    const taxCategory = this.TAX_CATEGORY_OPTIONS.some(o => o.value === fromSettings.taxCategory)
      ? fromSettings.taxCategory
      : (Number(src.taxRate) === 8 ? 'taxable8'
        : Number(src.taxRate) === 5 ? 'taxable5'
          : Number(src.taxRate) === 0 ? 'exempt'
            : base.taxCategory);

    const taxRounding = ['floor', 'ceil', 'round'].includes(fromSettings.taxRounding)
      ? fromSettings.taxRounding : base.taxRounding;
    const lineRounding = ['floor', 'ceil', 'round'].includes(fromSettings.lineRounding)
      ? fromSettings.lineRounding : base.lineRounding;

    const taxRate = this.getTaxRateFromCategory(taxCategory);

    return {
      taxDisplayMode,
      taxRate,
      taxCategory,
      taxRounding,
      lineRounding,
      showUnit: fromSettings.showUnit === true,
      showZeroTax: fromSettings.showZeroTax === true,
      showTaxBreakdown: fromSettings.showTaxBreakdown !== false
    };
  },

  formatYen(n) {
    return Number(n || 0).toLocaleString('ja-JP') + '円';
  },

  parseAmount(val) {
    if (val == null || val === '') return 0;
    const n = Number(String(val).replace(/[,，]/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  },

  todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  addDays(iso, days) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + Number(days || 0));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  defaultDueDate(issueDate) {
    const base = issueDate || this.todayISO();
    const d = new Date(base + 'T12:00:00');
    d.setMonth(d.getMonth() + 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const y = last.getFullYear();
    const m = String(last.getMonth() + 1).padStart(2, '0');
    const day = String(last.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  statusLabel(type, status) {
    const list = type === 'invoice' ? this.INVOICE_STATUSES : this.ESTIMATE_STATUSES;
    const hit = list.find(s => s.value === status);
    return hit ? hit.label : status || '—';
  },

  typeLabel(type) {
    return type === 'invoice' ? '請求書' : '見積書';
  },

  normalizeItem(raw, lineRounding, showUnit) {
    const item = raw && typeof raw === 'object' ? { ...raw } : {};
    const quantity = Math.max(0, this.parseAmount(item.quantity) || 1);
    const unitPrice = this.parseAmount(item.unitPrice);
    const mode = lineRounding || 'floor';
    let amount = this.parseAmount(item.amount);
    if (!amount && unitPrice) {
      amount = this.roundBySetting(unitPrice * quantity, mode);
    }
    const normalized = {
      date: item.date || '',
      name: String(item.name || '').trim(),
      unitPrice,
      quantity,
      amount
    };
    if (showUnit) normalized.unit = String(item.unit || '').trim();
    return normalized;
  },

  calcFromItems(items, taxSettings) {
    const ts = this.normalizeTaxSettings({ taxSettings });
    const rate = ts.taxRate;
    const normalized = (items || []).map(it => this.normalizeItem(it, ts.lineRounding, ts.showUnit));
    const itemsSum = normalized.reduce((sum, it) => sum + it.amount, 0);

    if (ts.taxDisplayMode === 'taxExcluded') {
      const subtotal = itemsSum;
      const tax = rate > 0
        ? this.roundBySetting(subtotal * rate / 100, ts.taxRounding)
        : 0;
      const total = subtotal + tax;
      return {
        items: normalized,
        subtotal,
        tax,
        total,
        taxExcluded: subtotal,
        taxIncluded: total,
        taxSettings: ts
      };
    }

    const total = itemsSum;
    const tax = rate > 0
      ? this.roundBySetting(total * rate / (100 + rate), ts.taxRounding)
      : 0;
    const taxExcluded = total - tax;
    return {
      items: normalized,
      subtotal: taxExcluded,
      tax,
      total,
      taxExcluded,
      taxIncluded: total,
      taxSettings: ts
    };
  },

  suggestNumber(documents, type) {
    const nums = (documents || [])
      .filter(d => d && d.type === type && d.number != null && d.number !== '')
      .map(d => parseInt(String(d.number).replace(/\D/g, ''), 10))
      .filter(n => Number.isFinite(n));
    const max = nums.length ? Math.max(...nums) : (type === 'invoice' ? 492 : 140);
    return String(max + 1);
  },

  defaultIssuer() {
    return { ...this.DEFAULT_ISSUER, sealImage: this.SEAL_IMAGE };
  },

  buildDefaultDocument(type, documents) {
    const today = this.todayISO();
    const isInvoice = type === 'invoice';
    const defs = isInvoice ? this.INVOICE_DEFAULTS : this.ESTIMATE_DEFAULTS;
    const taxSettings = this.defaultTaxSettings();
    const items = [{
      date: isInvoice ? today : '',
      name: defs.itemName,
      unitPrice: defs.unitPrice,
      quantity: defs.quantity,
      amount: this.roundBySetting(defs.unitPrice * defs.quantity, taxSettings.lineRounding)
    }];
    const calc = this.calcFromItems(items, taxSettings);
    return {
      id: '',
      type,
      number: this.suggestNumber(documents, type),
      issueDate: today,
      dueDate: isInvoice ? this.defaultDueDate(today) : '',
      customerName: '',
      customerHonorific: '様',
      title: defs.title,
      status: 'draft',
      items: calc.items,
      subtotal: calc.subtotal,
      tax: calc.tax,
      total: calc.total,
      taxSettings: calc.taxSettings,
      taxMode: 'taxExcluded',
      taxRate: calc.taxSettings.taxRate,
      note: defs.note,
      bankInfo: isInvoice ? this.DEFAULT_BANK_INFO : '',
      issuer: this.defaultIssuer(),
      createdAt: '',
      updatedAt: '',
      paymentMethod: isInvoice ? 'bank_transfer' : 'cash',
      paymentStatus: isInvoice ? 'pending' : 'paid',
      expectedPaymentDate: '',
      paidDate: '',
      paidAmount: 0,
      unpaidAmount: calc.total,
      paymentMemo: '',
      linkedDocumentId: '',
      linkedRevenueId: ''
    };
  },

  normalizeDocument(raw) {
    const doc = raw && typeof raw === 'object' ? { ...raw } : {};
    const type = doc.type === 'estimate' ? 'estimate' : 'invoice';
    const taxSettings = this.normalizeTaxSettings(doc, doc.taxMode);
    const calc = this.calcFromItems(doc.items || [], taxSettings);
    const issuer = { ...this.defaultIssuer(), ...(doc.issuer || {}) };
    issuer.sealImage = issuer.sealImage || this.SEAL_IMAGE;
    const taxMode = taxSettings.taxDisplayMode === 'taxIncluded' ? 'taxIncluded' : 'taxExcluded';
    return {
      id: doc.id || '',
      type,
      number: String(doc.number || '').trim(),
      issueDate: doc.issueDate || this.todayISO(),
      dueDate: doc.dueDate || '',
      customerName: String(doc.customerName || '').trim(),
      customerHonorific: doc.customerHonorific === '御中' ? '御中' : '様',
      title: String(doc.title || '').trim(),
      status: doc.status || 'draft',
      items: calc.items,
      subtotal: calc.subtotal,
      tax: calc.tax,
      total: calc.total,
      taxSettings: calc.taxSettings,
      taxMode,
      taxRate: calc.taxSettings.taxRate,
      note: String(doc.note || '').trim(),
      bankInfo: String(doc.bankInfo || (type === 'invoice' ? this.DEFAULT_BANK_INFO : '')).trim(),
      issuer,
      sourceEstimateId: doc.sourceEstimateId || '',
      createdAt: doc.createdAt || '',
      updatedAt: doc.updatedAt || '',
      ...(typeof PaymentBrain !== 'undefined'
        ? PaymentBrain.normalizeDocumentPayment(doc, { total: calc.total, defaultDate: doc.issueDate })
        : {
          paymentMethod: 'bank_transfer',
          paymentStatus: 'pending',
          expectedPaymentDate: '',
          paidDate: '',
          paidAmount: 0,
          unpaidAmount: calc.total,
          paymentMemo: '',
          linkedDocumentId: '',
          linkedRevenueId: ''
        })
    };
  },

  sortDocuments(documents) {
    return (documents || []).slice().sort((a, b) => {
      const da = (a.issueDate || a.updatedAt || a.createdAt || '');
      const db = (b.issueDate || b.updatedAt || b.createdAt || '');
      if (da !== db) return db.localeCompare(da);
      return (b.number || '').localeCompare(a.number || '', 'ja', { numeric: true });
    });
  },

  customerDisplay(doc) {
    const name = (doc.customerName || '').trim();
    if (!name) return '（宛名未入力）';
    if (name.endsWith('様') || name.endsWith('御中')) return name;
    return name + ' ' + (doc.customerHonorific || '様');
  },

  nl2br(text) {
    return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  },

  taxDisplayNote(ts) {
    const cat = this.taxCategoryLabel(ts.taxCategory);
    const mode = ts.taxDisplayMode === 'taxIncluded' ? '内税' : '外税';
    if (ts.taxRate === 0) return `（${mode}・${cat}）`;
    return `（${mode}・${ts.taxRate}%・${cat}）`;
  },

  renderDocumentSheet(doc, escFn) {
    const esc = escFn || (s => String(s || ''));
    const d = this.normalizeDocument(doc);
    const ts = d.taxSettings;
    const isInvoice = d.type === 'invoice';
    const title = isInvoice ? '請求書' : '見積書';
    const amountLabel = isInvoice ? 'ご請求金額' : '御見積金額';
    const taxModeNote = this.taxDisplayNote(ts);
    const showUnit = ts.showUnit;
    const showTaxRow = ts.showZeroTax || d.tax > 0;

    const unitHeader = showUnit ? '<th class="doc-col-unit">単位</th>' : '';
    const itemRows = d.items.map(it => `
      <tr>
        ${isInvoice ? `<td class="doc-col-date">${esc(it.date || '')}</td>` : ''}
        <td class="doc-col-name">${esc(it.name)}</td>
        <td class="doc-col-price num">${esc(this.formatYen(it.unitPrice))}</td>
        <td class="doc-col-qty num">${esc(it.quantity)}</td>
        ${showUnit ? `<td class="doc-col-unit">${esc(it.unit || '')}</td>` : ''}
        <td class="doc-col-amount num">${esc(this.formatYen(it.amount))}</td>
      </tr>`).join('');

    const issuerLines = [
      esc(d.issuer.name),
      isInvoice && d.issuer.registrationNumber ? '登録番号：' + esc(d.issuer.registrationNumber) : '',
      esc(d.issuer.postalCode),
      esc((d.issuer.address || '').replace(/\n/g, ' ')),
      'TEL: ' + esc(d.issuer.tel),
      d.issuer.fax ? 'FAX: ' + esc(d.issuer.fax) : ''
    ].filter(Boolean).join('<br>');

    const metaRows = isInvoice ? `
      <div class="doc-meta-row"><span class="doc-meta-label">請求書番号</span><span class="doc-meta-value">${esc(d.number)}</span></div>
      <div class="doc-meta-row"><span class="doc-meta-label">請求日</span><span class="doc-meta-value">${esc(d.issueDate)}</span></div>
      <div class="doc-meta-row"><span class="doc-meta-label">お支払期限</span><span class="doc-meta-value">${esc(d.dueDate)}</span></div>
      <div class="doc-meta-row"><span class="doc-meta-label">件名</span><span class="doc-meta-value">${esc(d.title)}</span></div>`
      : `
      <div class="doc-meta-row"><span class="doc-meta-label">見積書番号</span><span class="doc-meta-value">${esc(d.number)}</span></div>
      <div class="doc-meta-row"><span class="doc-meta-label">発行日</span><span class="doc-meta-value">${esc(d.issueDate)}</span></div>
      <div class="doc-meta-row"><span class="doc-meta-label">件名</span><span class="doc-meta-value">${esc(d.title)}</span></div>`;

    let taxBreakdown = '';
    if (ts.showTaxBreakdown) {
      if (ts.taxDisplayMode === 'taxIncluded') {
        taxBreakdown = `
      <div class="doc-tax-breakdown">
        <h3 class="doc-section-title">税率別内訳（${ts.taxRate > 0 ? ts.taxRate + '%' : this.taxCategoryLabel(ts.taxCategory)}）</h3>
        <table class="doc-table doc-table-compact">
          <thead><tr><th>税抜金額</th><th>消費税額</th><th>税込金額</th></tr></thead>
          <tbody><tr>
            <td class="num">${esc(this.formatYen(d.subtotal))}</td>
            <td class="num">${esc(this.formatYen(d.tax))}</td>
            <td class="num">${esc(this.formatYen(d.total))}</td>
          </tr></tbody>
        </table>
      </div>`;
      } else {
        const rateLabel = ts.taxRate > 0 ? `${ts.taxRate}%対象` : this.taxCategoryLabel(ts.taxCategory);
        taxBreakdown = `
      <div class="doc-tax-breakdown">
        <h3 class="doc-section-title">内訳 ${rateLabel}</h3>
        <table class="doc-table doc-table-compact">
          <thead><tr><th>小計（税抜）</th>${showTaxRow ? '<th>消費税</th>' : ''}<th>合計（税込）</th></tr></thead>
          <tbody><tr>
            <td class="num">${esc(this.formatYen(d.subtotal))}</td>
            ${showTaxRow ? `<td class="num">${esc(this.formatYen(d.tax))}</td>` : ''}
            <td class="num">${esc(this.formatYen(d.total))}</td>
          </tr></tbody>
        </table>
      </div>`;
      }
    }

    const bankBlock = isInvoice && d.bankInfo ? `
      <div class="doc-bank">
        <h3 class="doc-section-title">振込先</h3>
        <div class="doc-bank-body">${this.nl2br(d.bankInfo)}</div>
      </div>` : '';

    const noteBlock = d.note ? `
      <div class="doc-note">
        <h3 class="doc-section-title">備考</h3>
        <div class="doc-note-body">${this.nl2br(d.note)}</div>
      </div>` : '';

    const dateHeader = isInvoice ? '<th class="doc-col-date">納品日</th>' : '';

    let totalsBlock;
    if (ts.taxDisplayMode === 'taxIncluded') {
      totalsBlock = `
        <div class="doc-totals">
          <div class="doc-totals-row"><span>小計</span><span class="num">${esc(this.formatYen(d.subtotal))}</span></div>
          ${showTaxRow ? `<div class="doc-totals-row"><span>うち消費税額合計</span><span class="num">${esc(this.formatYen(d.tax))}</span></div>` : ''}
          <div class="doc-totals-row doc-totals-grand"><span>合計</span><span class="num">${esc(this.formatYen(d.total))}</span></div>
        </div>`;
    } else {
      totalsBlock = `
        <div class="doc-totals">
          <div class="doc-totals-row"><span>小計</span><span class="num">${esc(this.formatYen(d.subtotal))}</span></div>
          ${showTaxRow ? `<div class="doc-totals-row"><span>消費税</span><span class="num">${esc(this.formatYen(d.tax))}</span></div>` : ''}
          <div class="doc-totals-row doc-totals-grand"><span>合計</span><span class="num">${esc(this.formatYen(d.total))}</span></div>
        </div>`;
    }

    return `
      <div class="doc-sheet" data-doc-id="${esc(d.id)}">
        <div class="doc-sheet-header">
          <div class="doc-sheet-left">
            <h1 class="doc-title">${title}</h1>
            <p class="doc-customer">${esc(this.customerDisplay(d))}</p>
          </div>
          <div class="doc-sheet-right">
            <div class="doc-issuer-block">
              <div class="doc-issuer-text">${issuerLines}</div>
              <img class="doc-seal" src="${esc(d.issuer.sealImage)}" alt="印影" width="72" height="72">
            </div>
          </div>
        </div>
        <div class="doc-meta">${metaRows}</div>
        <div class="doc-total-banner">
          <span class="doc-total-label">${amountLabel}</span>
          <span class="doc-total-amount">${esc(this.formatYen(d.total))}</span>
          <span class="doc-total-tax-note">${taxModeNote}</span>
        </div>
        <table class="doc-table doc-items-table">
          <thead>
            <tr>
              ${dateHeader}
              <th class="doc-col-name">品目</th>
              <th class="doc-col-price">単価</th>
              <th class="doc-col-qty">数量</th>
              ${unitHeader}
              <th class="doc-col-amount">価格</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
        ${totalsBlock}
        ${taxBreakdown}
        ${bankBlock}
        ${noteBlock}
      </div>`;
  },

  convertEstimateToInvoice(estimate, documents) {
    const src = this.normalizeDocument(estimate);
    if (src.type !== 'estimate') return null;
    const today = this.todayISO();
    return {
      ...src,
      id: '',
      type: 'invoice',
      number: this.suggestNumber(documents, 'invoice'),
      issueDate: today,
      dueDate: this.defaultDueDate(today),
      status: 'draft',
      bankInfo: this.DEFAULT_BANK_INFO,
      taxSettings: { ...src.taxSettings },
      sourceEstimateId: src.id,
      createdAt: '',
      updatedAt: ''
    };
  },

  toRevenuePrefill(doc) {
    const d = this.normalizeDocument(doc);
    if (d.type !== 'invoice') return null;
    const serviceGuess = (d.title || d.items[0]?.name || 'その他').slice(0, 40);
    const payment = typeof PaymentBrain !== 'undefined'
      ? PaymentBrain.normalizeDocumentPayment(d, { total: d.total, defaultDate: d.issueDate })
      : {};
    return {
      workDate: d.issueDate || this.todayISO(),
      customerName: (d.customerName || '').replace(/\s*(様|御中)$/, '') + '様',
      service: serviceGuess,
      amount: d.total,
      status: '確定',
      paymentMethod: payment.paymentMethod || 'bank_transfer',
      paymentStatus: payment.paymentStatus || 'pending',
      expectedPaymentDate: payment.expectedPaymentDate || '',
      paidDate: payment.paidDate || '',
      paidAmount: payment.paidAmount || 0,
      unpaidAmount: payment.unpaidAmount || d.total,
      paymentMemo: payment.paymentMemo || '',
      linkedDocumentId: d.id,
      memo: `請求書No.${d.number} ${d.title || ''}`.trim()
    };
  },

  buildInvoiceFromRevenue(revenue, documents) {
    const rev = typeof RevenueBrain !== 'undefined'
      ? RevenueBrain.normalizeRevenueRecord(revenue)
      : (revenue || {});
    const today = this.todayISO();
    const amount = this.parseAmount(rev.amount);
    if (amount <= 0) return null;

    const subject = [
      rev.memo,
      rev.description,
      rev.title,
      rev.serviceName,
      rev.service,
      '作業代金'
    ].map(s => String(s || '').trim()).find(Boolean) || '作業代金';
    const customerRaw = String(rev.customerName || rev.leadName || '').trim();
    const taxSettings = { ...this.defaultTaxSettings(), taxDisplayMode: 'taxIncluded' };
    const items = [{
      date: rev.workDate || today,
      name: subject,
      unitPrice: amount,
      quantity: 1,
      amount
    }];
    const calc = this.calcFromItems(items, taxSettings);
    const paymentSrc = typeof PaymentBrain !== 'undefined'
      ? PaymentBrain.normalizeRevenuePayment(rev, { total: amount, defaultDate: rev.workDate || today })
      : {};
    const payment = typeof PaymentBrain !== 'undefined'
      ? PaymentBrain.normalizeDocumentPayment(
        { ...paymentSrc, paymentMemo: rev.paymentMemo || '' },
        { total: calc.total, defaultDate: today }
      )
      : {
        paymentMethod: 'bank_transfer',
        paymentStatus: 'pending',
        expectedPaymentDate: '',
        paidDate: '',
        paidAmount: 0,
        unpaidAmount: calc.total,
        paymentMemo: ''
      };
    const issueDate = today;
    const expectedDate = payment.expectedPaymentDate || '';

    return {
      id: '',
      type: 'invoice',
      number: this.suggestNumber(documents, 'invoice'),
      issueDate,
      dueDate: expectedDate || this.defaultDueDate(issueDate),
      customerName: customerRaw.replace(/\s*(様|御中)$/, ''),
      customerHonorific: customerRaw.endsWith('御中') ? '御中' : '様',
      title: subject,
      status: 'draft',
      items: calc.items,
      subtotal: calc.subtotal,
      tax: calc.tax,
      total: calc.total,
      taxSettings: calc.taxSettings,
      note: String(rev.memo || '').trim(),
      bankInfo: this.DEFAULT_BANK_INFO,
      issuer: this.defaultIssuer(),
      ...payment,
      linkedRevenueId: rev.id || '',
      linkedDocumentId: ''
    };
  }
};
