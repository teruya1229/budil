/**
 * Budil×GPT: local-only redaction of a small, explicit Japanese quote grammar.
 *
 * Real customer names MUST remain in the browser. The API receives only
 * a customer-neutral instruction, never an address, phone, email, notes or
 * existing customer records. Only after a verified response may the caller
 * use CustomerResolveEntrypoint locally and ask the user to select the lead.
 *
 * This is a constrained first business flow, not general Japanese NLP.
 */
const BudilGptAnonymize = (() => {
  'use strict';
  const MAX_LENGTH = 220;
  const NAME = /^[一-龯々ぁ-んァ-ヶｦ-ﾟー・A-Za-z]{2,40}$/u;
  const SERVICES = Object.freeze(['エアコン洗浄', 'エアコンクリーニング']);
  const TAX = Object.freeze({
    '税込': 'included', '内税': 'included',
    '税抜': 'excluded', '税別': 'excluded', '外税': 'excluded'
  });
  const MAX_YEN = 100000000;
  const deny = (code) => ({ ok: false, code });
  function normalized(value) {
    return String(value).replace(/[０-９]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
      .replace(/[，、]/g, ',').replace(/[　\s]+/g, '');
  }
  function prepare(raw) {
    if (typeof raw !== 'string' || !raw.trim() ||
        raw.length > MAX_LENGTH || /[\x00-\x1f]/.test(raw)) {
      return deny('INPUT_INVALID');
    }
    const text = normalized(raw);
    // Use a single full match. Nothing after the sentence can reach GPT.
    const match = text.match(
      /^(.+?)の(エアコン洗浄|エアコンクリーニング)([0-9]{1,2})台を(税込|内税|税抜|税別|外税)([0-9][0-9,]*)円で見積(?:書)?(?:も)?(?:作って|して|お願い)?$/
    );
    if (!match) return deny('FORMAT_UNSUPPORTED');
    const customerName = match[1].replace(/(さん|様|御中)$/, '');
    if (!NAME.test(customerName) || customerName === 'お客様') {
      return deny('CUSTOMER_NAME_INVALID');
    }
    const serviceName = match[2];
    if (!SERVICES.includes(serviceName)) return deny('SERVICE_UNSUPPORTED');
    const quantity = Number(match[3]);
    const yenText = match[5];
    // Commas are allowed only as 1,000 grouping, never as an arbitrary string.
    if (!/^(?:[1-9][0-9]{0,8}|[1-9][0-9]{0,2}(?:,[0-9]{3})+)$/.test(yenText)) {
      return deny('AMOUNT_INVALID');
    }
    const totalYen = Number(yenText.replace(/,/g, ''));
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 30 ||
        !Number.isSafeInteger(totalYen) || totalYen < 1 || totalYen > MAX_YEN) {
      return deny('AMOUNT_OR_QUANTITY_INVALID');
    }
    const taxMode = TAX[match[4]];
    // This string contains ZERO extracted customer identifiers.
    const instruction = 'お客様の' + serviceName + quantity + '台を' +
      (taxMode === 'included' ? '税込' : '税抜') + totalYen +
      '円で見積して';
    return Object.freeze({
      ok: true,
      local: Object.freeze({
        customerName, serviceName, quantity, totalYen, taxMode
      }),
      wire: Object.freeze({ mode: 'anonymized', instruction }),
      personalDataSent: false,
      externalRequestSent: false,
      requiresCustomerSelection: true,
      requiresDocumentApproval: true
    });
  }
  function wireOnly(raw) {
    const ready = prepare(raw);
    if (!ready.ok) return ready;
    return { ok: true, ...ready.wire };
  }
  function verifyResult(raw, response) {
    const expected = prepare(raw); // Recompute; do not trust mutable client state.
    if (!expected.ok) return expected;
    if (!response || typeof response !== 'object' ||
        response.ok !== true || response.phase !== 'interpret_only' ||
        response.action !== 'estimate_create' ||
        response.can_execute !== false || response.needs_user_input !== false ||
        response.amount_scope !== 'total' ||
        response.customer_name !== 'お客様' ||
        response.service_name !== expected.local.serviceName ||
        response.quantity !== expected.local.quantity ||
        response.total_yen !== expected.local.totalYen ||
        response.tax_mode !== expected.local.taxMode) {
      return deny('MODEL_RESULT_MISMATCH');
    }
    return {
      ok: true,
      local: { ...expected.local },
      persisted: false, canExecute: false,
      requiresCustomerSelection: true,
      requiresDocumentApproval: true
    };
  }
  function acceptsWire(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).length !== 2 ||
        input.mode !== 'anonymized' ||
        typeof input.instruction !== 'string') return false;
    // No arbitrary text: the API must check the same whitelist again.
    const match = input.instruction.match(
      /^お客様の(エアコン洗浄|エアコンクリーニング)([1-9]|[12][0-9]|30)台を(税込|税抜)([1-9][0-9]{0,8})円で見積して$/
    );
    if (!match) return false;
    const total = Number(match[4]);
    return Number.isSafeInteger(total) && total > 0 && total <= MAX_YEN;
  }
  return Object.freeze({prepare, wireOnly, verifyResult, acceptsWire});
})();
if (typeof module !== 'undefined' && module.exports) module.exports = {BudilGptAnonymize};
