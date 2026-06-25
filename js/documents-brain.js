/**
 * Budil v4.4.9 - 請求書・見積書
 * localStorage: budil_documents
 */
const DocumentsBrain = {
  SEAL_IMAGE: 'assets/bc-service-seal.jpg',
  TAX_RATE: 10,

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
    unitPrice: 11819,
    note: '標準工事には、配管・電線・ドレンホース4mまで、室外機の地面置きまたはベランダ置きが含まれます。\n現地で4mを超える場合は、配管延長として1mごとに＋4,000円追加となります。'
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

  normalizeItem(raw, taxMode, taxRate) {
    const item = raw && typeof raw === 'object' ? { ...raw } : {};
    const quantity = Math.max(0, this.parseAmount(item.quantity) || 1);
    const unitPrice = this.parseAmount(item.unitPrice);
    let amount = this.parseAmount(item.amount);
    if (!amount && unitPrice) amount = Math.round(unitPrice * quantity);
    return {
      date: item.date || '',
      name: String(item.name || '').trim(),
      unitPrice,
      quantity,
      amount
    };
  },

  calcFromItems(items, taxMode, taxRate) {
    const rate = Number(taxRate) || this.TAX_RATE;
    const normalized = (items || []).map(it => this.normalizeItem(it, taxMode, rate));
    const itemsSubtotal = normalized.reduce((sum, it) => sum + it.amount, 0);

    if (taxMode === 'taxExcluded') {
      const subtotal = itemsSubtotal;
      const tax = Math.round(subtotal * rate / 100);
      const total = subtotal + tax;
      return { items: normalized, subtotal, tax, total, taxExcluded: subtotal, taxIncluded: total };
    }

    const total = itemsSubtotal;
    const taxExcluded = Math.round(total / (1 + rate / 100));
    const tax = total - taxExcluded;
    return { items: normalized, subtotal: taxExcluded, tax, total, taxExcluded, taxIncluded: total };
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
    const taxMode = isInvoice ? 'taxIncluded' : 'taxExcluded';
    const unitPrice = defs.unitPrice;
    const quantity = defs.quantity;
    const amount = isInvoice ? unitPrice : Math.round(unitPrice * quantity);
    const items = [{
      date: today,
      name: defs.itemName,
      unitPrice: isInvoice ? unitPrice : unitPrice,
      quantity,
      amount: isInvoice ? unitPrice : amount
    }];
    const calc = this.calcFromItems(items, taxMode, this.TAX_RATE);
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
      taxMode,
      taxRate: this.TAX_RATE,
      note: defs.note,
      bankInfo: isInvoice ? this.DEFAULT_BANK_INFO : '',
      issuer: this.defaultIssuer(),
      createdAt: '',
      updatedAt: ''
    };
  },

  normalizeDocument(raw) {
    const doc = raw && typeof raw === 'object' ? { ...raw } : {};
    const type = doc.type === 'estimate' ? 'estimate' : 'invoice';
    const taxMode = doc.taxMode === 'taxExcluded' ? 'taxExcluded' : 'taxIncluded';
    const taxRate = Number(doc.taxRate) || this.TAX_RATE;
    const calc = this.calcFromItems(doc.items || [], taxMode, taxRate);
    const issuer = { ...this.defaultIssuer(), ...(doc.issuer || {}) };
    issuer.sealImage = issuer.sealImage || this.SEAL_IMAGE;
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
      taxMode,
      taxRate,
      note: String(doc.note || '').trim(),
      bankInfo: String(doc.bankInfo || (type === 'invoice' ? this.DEFAULT_BANK_INFO : '')).trim(),
      issuer,
      sourceEstimateId: doc.sourceEstimateId || '',
      createdAt: doc.createdAt || '',
      updatedAt: doc.updatedAt || ''
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

  renderDocumentSheet(doc, escFn) {
    const esc = escFn || (s => String(s || ''));
    const d = this.normalizeDocument(doc);
    const isInvoice = d.type === 'invoice';
    const title = isInvoice ? '請求書' : '見積書';
    const amountLabel = isInvoice ? 'ご請求金額' : '御見積金額';
    const taxModeNote = d.taxMode === 'taxIncluded'
      ? '（税込入力・10%）'
      : '（税抜入力・10%）';

    const itemRows = d.items.map(it => `
      <tr>
        <td class="doc-col-date">${esc(it.date || '')}</td>
        <td class="doc-col-name">${esc(it.name)}</td>
        <td class="doc-col-price num">${esc(this.formatYen(it.unitPrice))}</td>
        <td class="doc-col-qty num">${esc(it.quantity)}</td>
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

    const taxBreakdown = isInvoice ? `
      <div class="doc-tax-breakdown">
        <h3 class="doc-section-title">税率別内訳（${d.taxRate}%）</h3>
        <table class="doc-table doc-table-compact">
          <thead><tr><th>税抜金額</th><th>消費税額</th><th>税込金額</th></tr></thead>
          <tbody><tr>
            <td class="num">${esc(this.formatYen(d.subtotal))}</td>
            <td class="num">${esc(this.formatYen(d.tax))}</td>
            <td class="num">${esc(this.formatYen(d.total))}</td>
          </tr></tbody>
        </table>
      </div>` : `
      <div class="doc-tax-breakdown">
        <h3 class="doc-section-title">内訳 ${taxModeNote}</h3>
        <table class="doc-table doc-table-compact">
          <thead><tr><th>小計（税抜）</th><th>消費税（${d.taxRate}%）</th><th>合計（税込）</th></tr></thead>
          <tbody><tr>
            <td class="num">${esc(this.formatYen(d.subtotal))}</td>
            <td class="num">${esc(this.formatYen(d.tax))}</td>
            <td class="num">${esc(this.formatYen(d.total))}</td>
          </tr></tbody>
        </table>
      </div>`;

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
              <th class="doc-col-amount">価格</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
        <div class="doc-totals">
          <div class="doc-totals-row"><span>小計</span><span class="num">${esc(this.formatYen(d.subtotal))}</span></div>
          <div class="doc-totals-row"><span>うち消費税額合計</span><span class="num">${esc(this.formatYen(d.tax))}</span></div>
          <div class="doc-totals-row doc-totals-grand"><span>合計</span><span class="num">${esc(this.formatYen(d.total))}</span></div>
        </div>
        ${taxBreakdown}
        ${bankBlock}
        ${noteBlock}
      </div>`;
  },

  convertEstimateToInvoice(estimate, documents) {
    const src = this.normalizeDocument(estimate);
    if (src.type !== 'estimate') return null;
    const today = this.todayISO();
    const rate = src.taxRate || this.TAX_RATE;
    const items = src.items.map(it => {
      if (src.taxMode === 'taxExcluded') {
        const unitPrice = Math.round(it.unitPrice * (1 + rate / 100));
        const amount = Math.round(it.amount * (1 + rate / 100));
        return { ...it, unitPrice, amount };
      }
      return { ...it };
    });
    const calc = this.calcFromItems(items, 'taxIncluded', rate);
    return {
      ...src,
      id: '',
      type: 'invoice',
      number: this.suggestNumber(documents, 'invoice'),
      issueDate: today,
      dueDate: this.defaultDueDate(today),
      status: 'draft',
      taxMode: 'taxIncluded',
      items: calc.items,
      subtotal: calc.subtotal,
      tax: calc.tax,
      total: calc.total,
      bankInfo: this.DEFAULT_BANK_INFO,
      sourceEstimateId: src.id,
      createdAt: '',
      updatedAt: ''
    };
  },

  toRevenuePrefill(doc) {
    const d = this.normalizeDocument(doc);
    if (d.type !== 'invoice') return null;
    const serviceGuess = (d.title || d.items[0]?.name || 'その他').slice(0, 40);
    return {
      workDate: d.issueDate || this.todayISO(),
      customerName: (d.customerName || '').replace(/\s*(様|御中)$/, '') + '様',
      service: serviceGuess,
      amount: d.total,
      status: d.status === 'paid' ? '完了' : '確定',
      paymentStatus: d.status === 'paid' ? '入金済み' : '未入金',
      memo: `請求書No.${d.number} ${d.title || ''}`.trim()
    };
  }
};
