/**
 * Budil x GPT Phase 1 — isolated fictional-data rehearsal.
 * This is a deterministic mock, NOT OpenAI/GPT, and never reads or writes Budil Storage.
 * Business/tax calculations and customer matching are delegated to existing Budil modules.
 */
(function (scope) {
  'use strict';

  const FIXTURE_CUSTOMERS = [
    { id: 'fixture-c001', name: '田中太郎', area: '南城市', isDemo: true },
    { id: 'fixture-c002', name: '田中太郎', area: '八重瀬町', isDemo: true },
    { id: 'fixture-c003', name: '比嘉清子', area: '与那原町', isDemo: true },
    { id: 'fixture-c004', name: '佐藤美咲', area: '糸満市', isDemo: true }
  ];
  const MAX_YEN = 100000000;
  const MAX_QTY = 30;

  function fail(code, message, extra) {
    return Object.assign({ ok: false, code, message }, extra || {});
  }
  function normalizeInput(raw) {
    return String(raw == null ? '' : raw)
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[，、]/g, ',')
      .replace(/[　\s]+/g, '');
  }
  function parseYen(s) {
    const matches = [...s.matchAll(/([0-9][0-9,]*)円/g)];
    if (matches.length !== 1) return fail('AMOUNT_REQUIRED', '合計金額を円単位で1つ指定してください。');
    const digits = matches[0][1].replace(/,/g, '');
    if (!/^\d+$/.test(digits)) return fail('AMOUNT_INVALID', '金額が不正です。');
    const amount = Number(digits);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_YEN) {
      return fail('AMOUNT_INVALID', '金額は1円以上1億円以下の整数で指定してください。');
    }
    return { ok: true, amount };
  }
  function taxModeFromText(s) {
    const inclusive = /税込|内税/.test(s);
    const exclusive = /税抜|税別|外税/.test(s);
    if (inclusive && exclusive) return 'conflict';
    if (inclusive) return 'taxIncluded';
    if (exclusive) return 'taxExcluded';
    return '';
  }
  function parseInitial(raw) {
    const s = normalizeInput(raw);
    if (!s || s.length > 220) return fail('INPUT_INVALID', '220文字以内で指示してください。');
    if (!/見積/.test(s)) return fail('NOT_ESTIMATE', 'デモでは見積書作成だけを扱います。');
    const m = s.match(/^(.+?)の(エアコン洗浄|エアコンクリーニング)([0-9]+)台/);
    if (!m) {
      return fail('FORMAT_REQUIRED', '例：比嘉清子さんのエアコン洗浄2台を税込18,000円で見積して');
    }
    const name = m[1].replace(/(さん|様|御中)$/, '');
    const quantity = Number(m[3]);
    if (!name || name.length > 80) return fail('NAME_REQUIRED', 'フルネームを指定してください。');
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
      return fail('QTY_INVALID', '台数は1〜30台で指定してください。');
    }
    if (/単価|1台あたり|\/台|／台/.test(s)) {
      return fail('TOTAL_REQUIRED', '単価ではなく見積の合計金額を指定してください。');
    }
    const yen = parseYen(s);
    if (!yen.ok) return yen;
    const taxMode = taxModeFromText(s);
    if (taxMode === 'conflict') return fail('TAX_CONFLICT', '税込と税抜が両方指定されています。');
    return {
      ok: true,
      intent: { customerName: name, service: m[2], quantity, amount: yen.amount, taxMode }
    };
  }
  function parseCorrection(raw) {
    const s = normalizeInput(raw);
    if (!s || s.length > 220) return fail('INPUT_INVALID', '220文字以内で修正してください。');
    if (!/変更|修正|直し|にして|変えて/.test(s)) {
      return fail('REVISION_FORMAT', '例：金額を税込20,000円に変更');
    }
    if (/台|件|名|顧客|住所|日付|品目/.test(s)) {
      return fail('REVISION_SCOPE', 'このデモでは金額だけを修正できます。');
    }
    const yen = parseYen(s);
    if (!yen.ok) return yen;
    const taxMode = taxModeFromText(s);
    if (taxMode === 'conflict') return fail('TAX_CONFLICT', '税込と税抜が両方指定されています。');
    return { ok: true, amount: yen.amount, taxMode };
  }
  function createSession() {
    return {
      stage: 'idle',
      intent: null,
      candidates: [],
      selectedCustomerId: '',
      selectedCustomerName: '',
      draft: null,
      approved: null,
      revision: 0
    };
  }
  function getDependencies(deps) {
    const d = deps && typeof deps === 'object' ? deps : {};
    const customerResolver = d.customerResolver
      || (typeof CustomerResolveEntrypoint !== 'undefined' && CustomerResolveEntrypoint);
    const documentsBrain = d.documentsBrain
      || (typeof DocumentsBrain !== 'undefined' && DocumentsBrain);
    if (!customerResolver || !documentsBrain) {
      return fail('DEPENDENCY_MISSING', '既存のBudil顧客照合・帳票計算モジュールが読み込めません。');
    }
    return { ok: true, customerResolver, documentsBrain };
  }
  function resolveName(session, deps) {
    const loaded = getDependencies(deps);
    if (!loaded.ok) return loaded;
    const response = loaded.customerResolver.resolve(
      { name: session.intent.customerName },
      { leads: FIXTURE_CUSTOMERS }
    );
    if (response.status === 'not_found') {
      session.stage = 'need_name';
      return fail('CUSTOMER_NOT_FOUND', '架空顧客と一致しません。フルネームを入力してください。', {
        candidates: []
      });
    }
    if (response.status !== 'needs_confirmation' && response.status !== 'ambiguous') {
      return fail('CUSTOMER_RESOLUTION_FAILED', '候補を確定できません。');
    }
    session.candidates = response.candidates.slice();
    session.stage = 'candidate';
    return {
      ok: true, code: 'CANDIDATES',
      candidates: session.candidates.slice(),
      message: '候補を確認し、本人が顧客を選んでください。'
    };
  }
  function start(session, raw, deps) {
    if (!session || session.stage !== 'idle') {
      return fail('SESSION_NOT_IDLE', '先に進行中の操作を完了するか、デモをリセットしてください。');
    }
    const parsed = parseInitial(raw);
    if (!parsed.ok) return parsed;
    session.intent = parsed.intent;
    if (!session.intent.taxMode) {
      session.stage = 'need_tax_mode';
      return fail('NEEDS_TAX_MODE', '18,000円は税込合計ですか？税抜合計ですか？「税込」または「税抜」と入力してください。');
    }
    return resolveName(session, deps);
  }
  function answerTaxMode(session, raw, deps) {
    if (!session || session.stage !== 'need_tax_mode') return fail('SESSION_NOT_WAITING', '税区分の回答待ちではありません。');
    const mode = taxModeFromText(normalizeInput(raw));
    if (!mode || mode === 'conflict') return fail('NEEDS_TAX_MODE', '「税込」または「税抜」と入力してください。');
    session.intent.taxMode = mode;
    return resolveName(session, deps);
  }
  function answerName(session, raw, deps) {
    if (!session || session.stage !== 'need_name') return fail('SESSION_NOT_WAITING', '顧客名の回答待ちではありません。');
    const name = normalizeInput(raw).replace(/(さん|様|御中)$/, '');
    if (!name || name.length > 80 || /[0-9]/.test(name)) return fail('NAME_REQUIRED', '架空顧客のフルネームを入力してください。');
    session.intent.customerName = name;
    return resolveName(session, deps);
  }
  function makeDraft(intent, customerName, deps) {
    const loaded = getDependencies(deps);
    if (!loaded.ok) return loaded;
    const docs = loaded.documentsBrain;
    const unitPrice = intent.amount / intent.quantity;
    if (!Number.isSafeInteger(unitPrice) || unitPrice <= 0) {
      return fail('UNIT_PRICE_INTEGRITY', '総額を台数で割り切れません。合計金額を修正してください。');
    }
    const mode = intent.taxMode;
    const settings = docs.taxSettingsFromFormDisplayMode(mode, docs.defaultTaxSettings());
    const inputItems = [{
      date: '',
      name: intent.service,
      quantity: intent.quantity,
      unitPrice,
      amount: intent.amount
    }];
    const calc = docs.calcFromItems(inputItems, settings, {
      itemsTaxBasis: mode === 'taxIncluded' ? 'inclusive' : 'exclusive'
    });
    const template = docs.buildDefaultDocument('estimate', []);
    const doc = docs.normalizeDocument(Object.assign({}, template, {
      id: '',
      type: 'estimate',
      title: '【デモ】' + intent.service,
      customerName,
      status: 'draft',
      items: mode === 'taxIncluded' ? calc.displayItems : calc.items,
      subtotal: calc.subtotal,
      tax: calc.tax,
      total: calc.total,
      taxMode: mode,
      taxSettings: calc.taxSettings,
      note: '【デモ・架空顧客】検証用です。お客様への送付・正式発行は禁止。'
    }));
    if (doc.total !== calc.total || doc.subtotal !== calc.subtotal) {
      return fail('CALC_MISMATCH', '既存Budilの税計算と帳票表示が一致しません。');
    }
    return { ok: true, doc };
  }
  function selectCustomer(session, customerId, deps) {
    if (!session || session.stage !== 'candidate') return fail('CUSTOMER_SELECTION_BLOCKED', '顧客候補を先に検索してください。');
    const candidate = session.candidates.find((c) => c.customerId === String(customerId));
    if (!candidate) return fail('CUSTOMER_SELECTION_INVALID', '表示候補以外は選択できません。');
    const intent = session.intent;
    const draft = makeDraft(intent, candidate.displayName, deps);
    if (!draft.ok) return draft;
    session.selectedCustomerId = candidate.customerId;
    session.selectedCustomerName = candidate.displayName;
    session.draft = draft.doc;
    session.revision = 1;
    session.approved = null;
    session.stage = 'draft';
    return { ok: true, code: 'DRAFT_READY', revision: session.revision, doc: structuredCopy(session.draft) };
  }
  function structuredCopy(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function revise(session, raw, deps) {
    if (!session || session.stage !== 'draft') return fail('REVISION_BLOCKED', '承認前の見積下書きだけ修正できます。');
    const parsed = parseCorrection(raw);
    if (!parsed.ok) return parsed;
    const nextIntent = Object.assign({}, session.intent, {
      amount: parsed.amount,
      taxMode: parsed.taxMode || session.intent.taxMode
    });
    const next = makeDraft(nextIntent, session.selectedCustomerName, deps);
    if (!next.ok) return next;
    session.intent = nextIntent;
    session.draft = next.doc;
    session.revision += 1;
    session.approved = null;
    return { ok: true, code: 'DRAFT_REVISED', revision: session.revision, doc: structuredCopy(session.draft) };
  }
  function approve(session, revision) {
    if (!session || session.stage !== 'draft' || !session.selectedCustomerId || !session.draft) {
      return fail('APPROVAL_BLOCKED', '顧客選択と見積下書きの確認が必要です。');
    }
    if (Number(revision) !== session.revision) {
      return fail('STALE_REVISION', '表示している下書きが古いため、最新内容で確認し直してください。');
    }
    session.approved = structuredCopy(session.draft);
    session.stage = 'approved';
    return { ok: true, code: 'APPROVED_FIXTURE', doc: structuredCopy(session.approved) };
  }
  function getApprovedForPdf(session) {
    if (!session || session.stage !== 'approved' || !session.approved) {
      return fail('NOT_APPROVED', '先に本人が見積下書きを承認してください。');
    }
    return { ok: true, doc: structuredCopy(session.approved) };
  }

  const api = Object.freeze({
    fixtureCustomers: () => FIXTURE_CUSTOMERS.map((c) => Object.assign({}, c)),
    parseInitial, parseCorrection, createSession, start, answerTaxMode, answerName,
    selectCustomer, revise, approve, getApprovedForPdf
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  scope.BudilGptFixtureCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
