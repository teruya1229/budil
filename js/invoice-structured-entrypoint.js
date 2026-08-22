/**
 * Budil — 構造化入力から請求書を決定的に生成する正規入口（prepare / apply）
 *
 * - 金額・税・端数・採番は DocumentsBrain の既存仕様を再利用する（AI計算禁止）
 * - prepare は検証と checksum 付きプレビューのみ（書類・PDF・永続DBへ書かない）
 * - apply は prepare checksum + 明示 permit 必須。idempotency で二重作成を防ぐ
 * - 外部共有メモリへ業務正本を複製しない。PII・本文は呼び出し側ログへ出さないこと
 *
 * Browser / Node(vm) 両対応。Node CLI は scripts/invoice-structured-cli.mjs。
 */
const InvoiceStructuredEntrypoint = {
  PREPARE_TTL_MS: 30 * 60 * 1000,
  STATUS_ISSUED: 'issued',

  CODES: {
    OK: 'OK',
    INVALID_INPUT: 'INVALID_INPUT',
    CUSTOMER_NOT_FOUND: 'CUSTOMER_NOT_FOUND',
    NEEDS_CONFIRMATION: 'NEEDS_CONFIRMATION',
    EXPECTED_TOTAL_MISMATCH: 'EXPECTED_TOTAL_MISMATCH',
    DATE_ORDER_INVALID: 'DATE_ORDER_INVALID',
    PERMIT_REQUIRED: 'PERMIT_REQUIRED',
    CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',
    PREPARE_EXPIRED: 'PREPARE_EXPIRED',
    IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
    DOCUMENTS_BRAIN_MISSING: 'DOCUMENTS_BRAIN_MISSING',
    APPLY_FAILED: 'APPLY_FAILED'
  },

  fail(code, message, extra) {
    const out = { ok: false, code, message: String(message || code) };
    if (extra && typeof extra === 'object') Object.assign(out, extra);
    return out;
  },

  requireDocumentsBrain() {
    if (typeof DocumentsBrain === 'undefined' || !DocumentsBrain) {
      return null;
    }
    return DocumentsBrain;
  },

  isISODate(value) {
    const s = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const y = Number(s.slice(0, 4));
    const m = Number(s.slice(5, 7));
    const d = Number(s.slice(8, 10));
    const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  },

  isIntegerYen(value) {
    if (typeof value === 'number') {
      return Number.isInteger(value) && Number.isFinite(value);
    }
    if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
      return true;
    }
    return false;
  },

  toIntegerYen(value) {
    if (typeof value === 'number') return value;
    return Number(String(value).trim());
  },

  stableStringify(value) {
    const seen = new WeakSet();
    const normalize = (v) => {
      if (v == null) return null;
      if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
      if (Array.isArray(v)) return v.map(normalize);
      if (typeof v === 'object') {
        if (seen.has(v)) return null;
        seen.add(v);
        const out = {};
        Object.keys(v).sort().forEach((k) => {
          out[k] = normalize(v[k]);
        });
        return out;
      }
      return String(v);
    };
    return JSON.stringify(normalize(value));
  },

  defaultHashHex(text) {
    // FNV-1a 64-bit × 2 rounds — Node CLI は crypto SHA-256 を注入する。
    // ブラウザ単体でも決定的な checksum を出せるフォールバック。
    const s = String(text || '');
    let h1 = 0xcbf29ce484222325n;
    let h2 = 0x100000001b3n ^ BigInt(s.length);
    const prime = 0x100000001b3n;
    for (let i = 0; i < s.length; i += 1) {
      const c = BigInt(s.charCodeAt(i));
      h1 ^= c;
      h1 = BigInt.asUintN(64, h1 * prime);
      h2 ^= c << BigInt(i % 7);
      h2 = BigInt.asUintN(64, h2 * prime);
    }
    const a = h1.toString(16).padStart(16, '0');
    const b = h2.toString(16).padStart(16, '0');
    return `fnv2-${a}${b}`;
  },

  hashCanonical(payload, hashFn) {
    const body = this.stableStringify(payload);
    if (typeof hashFn === 'function') return String(hashFn(body));
    return this.defaultHashHex(body);
  },

  customerDisplayName(customer) {
    const c = customer && typeof customer === 'object' ? customer : {};
    return String(c.customerName || c.companyName || c.name || '').trim();
  },

  listCustomers(deps) {
    if (Array.isArray(deps && deps.customers)) return deps.customers.filter(Boolean);
    if (deps && typeof deps.getCustomers === 'function') {
      const list = deps.getCustomers();
      return Array.isArray(list) ? list.filter(Boolean) : [];
    }
    return [];
  },

  resolveCustomer(input, deps) {
    const customers = this.listCustomers(deps);
    const customerId = String((input && input.customerId) || '').trim();
    const customerName = String((input && input.customerName) || '').trim();

    if (customerId) {
      const hit = customers.find((c) => String(c.id || '').trim() === customerId);
      if (!hit) {
        return this.fail(this.CODES.CUSTOMER_NOT_FOUND, 'customerId に一致する顧客がありません');
      }
      return {
        ok: true,
        customerId: String(hit.id),
        customerName: this.customerDisplayName(hit),
        customerHonorific: hit.customerHonorific === '御中' ? '御中' : '様'
      };
    }

    if (!customerName) {
      return this.fail(this.CODES.INVALID_INPUT, 'customerId または一意な customerName が必要です');
    }

    const norm = (s) => String(s || '').trim().replace(/\s+/g, '').replace(/(様|御中)$/, '');
    const target = norm(customerName);
    const matches = customers.filter((c) => norm(this.customerDisplayName(c)) === target);
    if (matches.length === 0) {
      return this.fail(this.CODES.CUSTOMER_NOT_FOUND, '氏名に一致する顧客がありません');
    }
    if (matches.length > 1) {
      return this.fail(this.CODES.NEEDS_CONFIRMATION, '氏名だけでは顧客を一意に特定できません', {
        candidateCount: matches.length
      });
    }
    const hit = matches[0];
    return {
      ok: true,
      customerId: String(hit.id),
      customerName: this.customerDisplayName(hit),
      customerHonorific: hit.customerHonorific === '御中' ? '御中' : '様'
    };
  },

  /**
   * 明細金額は売上→請求書経路（buildInvoiceFromRevenue）と同じく税込合計として扱う。
   * unitPrice / quantity は整数円。line amount = round(unitPrice * quantity)。
   */
  normalizeLineItems(rawItems, invoiceDate, Documents) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return this.fail(this.CODES.INVALID_INPUT, 'items が空です');
    }
    const items = [];
    for (let i = 0; i < rawItems.length; i += 1) {
      const raw = rawItems[i] || {};
      const description = String(raw.description || raw.name || '').trim();
      if (!description) {
        return this.fail(this.CODES.INVALID_INPUT, `items[${i}].description が必要です`);
      }
      if (!this.isIntegerYen(raw.quantity) || this.toIntegerYen(raw.quantity) <= 0) {
        return this.fail(this.CODES.INVALID_INPUT, `items[${i}].quantity は正の整数である必要があります`);
      }
      if (!this.isIntegerYen(raw.unitPrice) || this.toIntegerYen(raw.unitPrice) < 0) {
        return this.fail(this.CODES.INVALID_INPUT, `items[${i}].unitPrice は0以上の整数円である必要があります`);
      }
      const quantity = this.toIntegerYen(raw.quantity);
      const unitPrice = this.toIntegerYen(raw.unitPrice);
      const amount = Documents.roundBySetting(unitPrice * quantity, 'floor');
      if (!Number.isInteger(amount)) {
        return this.fail(this.CODES.INVALID_INPUT, `items[${i}] の金額が整数円になりません`);
      }
      items.push({
        date: invoiceDate,
        name: description,
        description,
        unitPrice,
        quantity,
        amount
      });
    }
    return { ok: true, items };
  },

  /**
   * 既存 Budil: 売上金額→請求書は taxIncluded + inclusive basis。
   * その経路を正本として再利用する。
   */
  computeStoredInvoiceCalc(inclusiveItems, Documents) {
    const taxSettings = { ...Documents.defaultTaxSettings(), taxDisplayMode: 'taxIncluded' };
    const calc = Documents.calcFromItems(inclusiveItems, taxSettings, { itemsTaxBasis: 'inclusive' });
    const formItems = calc.displayItems || calc.items;
    const storedCalc = Documents.calcFromItems(formItems, taxSettings, {
      itemsTaxBasis: 'exclusive',
      preferExclusive: true
    });
    return { taxSettings: storedCalc.taxSettings, calc: storedCalc, inclusiveTotal: calc.total };
  },

  buildCanonicalPayload(parts) {
    return {
      schema: 'budil.invoice.structured.v1',
      customerId: parts.customerId,
      customerName: parts.customerName,
      customerHonorific: parts.customerHonorific,
      invoiceDate: parts.invoiceDate,
      dueDate: parts.dueDate,
      number: parts.number,
      items: parts.items.map((it) => ({
        description: it.description || it.name,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        amount: it.amount
      })),
      subtotal: parts.subtotal,
      tax: parts.tax,
      total: parts.total,
      taxSettings: {
        taxDisplayMode: parts.taxSettings.taxDisplayMode,
        taxCategory: parts.taxSettings.taxCategory,
        taxRounding: parts.taxSettings.taxRounding,
        lineRounding: parts.taxSettings.lineRounding,
        taxRate: parts.taxSettings.taxRate
      },
      idempotencyKey: parts.idempotencyKey,
      expiresAt: parts.expiresAt
    };
  },

  validateAndNormalize(input, deps) {
    const Documents = this.requireDocumentsBrain();
    if (!Documents) {
      return this.fail(this.CODES.DOCUMENTS_BRAIN_MISSING, 'DocumentsBrain が必要です');
    }
    const src = input && typeof input === 'object' ? input : {};
    const idempotencyKey = String(src.idempotencyKey || '').trim();
    if (!idempotencyKey) {
      return this.fail(this.CODES.IDEMPOTENCY_KEY_REQUIRED, 'idempotencyKey は必須です');
    }

    const customer = this.resolveCustomer(src, deps);
    if (!customer.ok) return customer;

    const now = deps && typeof deps.now === 'function' ? deps.now() : new Date();
    const invoiceDate = String(src.invoiceDate || src.issueDate || Documents.todayISO()).trim();
    if (!this.isISODate(invoiceDate)) {
      return this.fail(this.CODES.INVALID_INPUT, 'invoiceDate は ISO 日付 (YYYY-MM-DD) である必要があります');
    }
    const dueDate = String(src.dueDate || '').trim();
    if (!this.isISODate(dueDate)) {
      return this.fail(this.CODES.INVALID_INPUT, 'dueDate は ISO 日付 (YYYY-MM-DD) である必要があります');
    }
    if (dueDate < invoiceDate) {
      return this.fail(this.CODES.DATE_ORDER_INVALID, 'dueDate が invoiceDate より前です');
    }

    const lineResult = this.normalizeLineItems(src.items, invoiceDate, Documents);
    if (!lineResult.ok) return lineResult;

    const { calc, taxSettings, inclusiveTotal } = this.computeStoredInvoiceCalc(lineResult.items, Documents);
    if (!Number.isInteger(calc.total) || calc.total !== inclusiveTotal) {
      return this.fail(this.CODES.INVALID_INPUT, '合計金額の決定的計算に失敗しました');
    }

    if (src.expectedTotal != null && src.expectedTotal !== '') {
      if (!this.isIntegerYen(src.expectedTotal)) {
        return this.fail(this.CODES.INVALID_INPUT, 'expectedTotal は整数円である必要があります');
      }
      const expectedTotal = this.toIntegerYen(src.expectedTotal);
      if (expectedTotal !== calc.total) {
        return this.fail(this.CODES.EXPECTED_TOTAL_MISMATCH, 'expectedTotal が計算合計と一致しません', {
          computedTotal: calc.total
        });
      }
    }

    const documents = deps && typeof deps.getDocuments === 'function'
      ? deps.getDocuments()
      : (Array.isArray(deps && deps.documents) ? deps.documents : []);
    const number = String(src.number || '').trim() || Documents.suggestNumber(documents, 'invoice');

    // prepare で発行した expiresAt を apply がそのまま返すことで checksum を安定させる
    let expiresAt;
    let expiresAtMs;
    if (src.expiresAt) {
      const parsed = Date.parse(String(src.expiresAt));
      if (!Number.isFinite(parsed)) {
        return this.fail(this.CODES.INVALID_INPUT, 'expiresAt が不正です');
      }
      expiresAtMs = parsed;
      expiresAt = new Date(parsed).toISOString();
    } else if (deps && Number.isFinite(deps.expiresAtMs)) {
      expiresAtMs = deps.expiresAtMs;
      expiresAt = new Date(expiresAtMs).toISOString();
    } else {
      expiresAtMs = now.getTime() + this.PREPARE_TTL_MS;
      expiresAt = new Date(expiresAtMs).toISOString();
    }

    const titleSource = lineResult.items[0] && lineResult.items[0].name
      ? lineResult.items[0].name
      : '作業代金';
    const title = Documents.sanitizeCustomerFacingText(titleSource, { maxLen: 48 }) || '作業代金';

    const draft = Documents.normalizeDocument({
      id: '',
      type: 'invoice',
      number,
      issueDate: invoiceDate,
      dueDate,
      customerName: customer.customerName,
      customerHonorific: customer.customerHonorific,
      title,
      status: this.STATUS_ISSUED,
      items: calc.items,
      subtotal: calc.subtotal,
      tax: calc.tax,
      total: calc.total,
      taxSettings,
      note: Documents.INVOICE_DEFAULTS.note,
      bankInfo: Documents.DEFAULT_BANK_INFO,
      issuer: Documents.defaultIssuer(),
      paymentMethod: 'bank_transfer',
      paymentStatus: 'pending',
      expectedPaymentDate: dueDate,
      paidDate: '',
      paidAmount: 0,
      unpaidAmount: calc.total,
      paymentMemo: '',
      linkedDocumentId: '',
      linkedRevenueId: '',
      structuredCustomerId: customer.customerId,
      structuredIdempotencyKey: idempotencyKey
    });

    const canonical = this.buildCanonicalPayload({
      customerId: customer.customerId,
      customerName: customer.customerName,
      customerHonorific: customer.customerHonorific,
      invoiceDate,
      dueDate,
      number,
      items: lineResult.items,
      subtotal: calc.subtotal,
      tax: calc.tax,
      total: calc.total,
      taxSettings,
      idempotencyKey,
      expiresAt
    });

    return {
      ok: true,
      idempotencyKey,
      customerId: customer.customerId,
      customerName: customer.customerName,
      invoiceDate,
      dueDate,
      items: lineResult.items,
      subtotal: calc.subtotal,
      tax: calc.tax,
      total: calc.total,
      taxSettings,
      number,
      draft,
      canonical,
      expiresAt,
      expiresAtMs
    };
  },

  prepare(input, deps) {
    const normalized = this.validateAndNormalize(input, deps || {});
    if (!normalized.ok) return normalized;

    const checksum = this.hashCanonical(normalized.canonical, deps && deps.hashFn);
    return {
      ok: true,
      phase: 'prepare',
      code: this.CODES.OK,
      idempotencyKey: normalized.idempotencyKey,
      checksum,
      expiresAt: normalized.expiresAt,
      preview: {
        customerId: normalized.customerId,
        // 承認UI向け。ログ出力禁止（呼び出し側責務）
        customerName: normalized.customerName,
        invoiceDate: normalized.invoiceDate,
        dueDate: normalized.dueDate,
        items: normalized.items.map((it) => ({
          description: it.description || it.name,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          amount: it.amount
        })),
        subtotal: normalized.subtotal,
        tax: normalized.tax,
        total: normalized.total,
        number: normalized.number,
        taxSettings: {
          taxDisplayMode: normalized.taxSettings.taxDisplayMode,
          taxCategory: normalized.taxSettings.taxCategory,
          taxRounding: normalized.taxSettings.taxRounding,
          lineRounding: normalized.taxSettings.lineRounding,
          taxRate: normalized.taxSettings.taxRate
        }
      }
    };
  },

  apply(input, deps) {
    const d = deps && typeof deps === 'object' ? deps : {};
    if (d.permit !== true && !(input && input.permit === true)) {
      return this.fail(this.CODES.PERMIT_REQUIRED, 'apply には明示的な permit:true が必要です');
    }

    const providedChecksum = String((input && input.checksum) || d.checksum || '').trim();
    if (!providedChecksum) {
      return this.fail(this.CODES.CHECKSUM_MISMATCH, 'prepare 済み checksum が必要です');
    }

    const normalized = this.validateAndNormalize(input, d);
    if (!normalized.ok) return normalized;

    const now = d.now && typeof d.now === 'function' ? d.now() : new Date();
    if (now.getTime() > normalized.expiresAtMs) {
      return this.fail(this.CODES.PREPARE_EXPIRED, 'prepare の有効期限が切れています');
    }

    const checksum = this.hashCanonical(normalized.canonical, d.hashFn);
    if (checksum !== providedChecksum) {
      return this.fail(this.CODES.CHECKSUM_MISMATCH, 'checksum が一致しません');
    }

    if (typeof d.findIdempotency === 'function') {
      const existing = d.findIdempotency(normalized.idempotencyKey);
      if (existing && existing.ok) {
        return {
          ok: true,
          phase: 'apply',
          code: this.CODES.OK,
          idempotentReplay: true,
          invoiceId: existing.invoiceId,
          invoiceNumber: existing.invoiceNumber,
          pdfPointer: existing.pdfPointer,
          total: existing.total,
          dueDate: existing.dueDate,
          idempotencyKey: normalized.idempotencyKey
        };
      }
    }

    if (typeof d.addDocument !== 'function') {
      return this.fail(this.CODES.APPLY_FAILED, 'addDocument が必要です');
    }
    if (typeof d.writePdf !== 'function') {
      return this.fail(this.CODES.APPLY_FAILED, 'writePdf が必要です');
    }

    let saved;
    try {
      saved = d.addDocument(normalized.draft);
    } catch (err) {
      return this.fail(this.CODES.APPLY_FAILED, '請求書の保存に失敗しました');
    }
    if (!saved || !saved.id) {
      return this.fail(this.CODES.APPLY_FAILED, '請求書の保存結果が不正です');
    }

    let pdfPointer;
    try {
      pdfPointer = d.writePdf(saved);
    } catch (err) {
      return this.fail(this.CODES.APPLY_FAILED, 'PDF 生成に失敗しました');
    }
    if (!pdfPointer || typeof pdfPointer !== 'object' || !pdfPointer.path) {
      return this.fail(this.CODES.APPLY_FAILED, 'PDF pointer が不正です');
    }

    const result = {
      ok: true,
      phase: 'apply',
      code: this.CODES.OK,
      idempotentReplay: false,
      invoiceId: String(saved.id),
      invoiceNumber: String(saved.number || ''),
      pdfPointer: {
        kind: pdfPointer.kind || 'file',
        path: String(pdfPointer.path)
      },
      total: saved.total,
      dueDate: saved.dueDate,
      idempotencyKey: normalized.idempotencyKey
    };

    if (typeof d.saveIdempotency === 'function') {
      d.saveIdempotency(normalized.idempotencyKey, {
        ok: true,
        invoiceId: result.invoiceId,
        invoiceNumber: result.invoiceNumber,
        pdfPointer: result.pdfPointer,
        total: result.total,
        dueDate: result.dueDate
      });
    }

    return result;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = InvoiceStructuredEntrypoint;
}
