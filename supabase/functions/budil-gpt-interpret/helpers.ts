/**
 * Budil GPT Phase 1 intent contract. Pure and side-effect free.
 * No raw customer records, storage writes, prices inference or tool execution.
 */
export const MAX_INSTRUCTION_BYTES = 2048;
export const MAX_INSTRUCTION_CHARS = 480;
export const MAX_TOTAL_YEN = 100000000;
export const SUPPORTED_ACTIONS = Object.freeze(["estimate_create","estimate_revision","unsupported"]);
export const INSTRUCTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "action","customer_name","service_name","quantity",
    "total_yen","tax_mode","amount_scope","needs_user_input","followup"
  ],
  properties: {
    action: { type: "string", enum: SUPPORTED_ACTIONS },
    customer_name: { type: ["string","null"] },
    service_name: { type: ["string","null"] },
    quantity: { type: ["integer","null"] },
    total_yen: { type: ["integer","null"] },
    tax_mode: { type: "string", enum: ["included","excluded","unknown"] },
    amount_scope: { type: "string", enum: ["total","each","unknown"] },
    needs_user_input: { type: "boolean" },
    followup: { type: ["string","null"] }
  }
};

/**
 * The ONLY real-customer-compatible wire format supported in this
 * experimental gateway: a neutral "お客様" alias, explicit AC service,
 * integer quantity, tax mode, and amount. No user name or free text.
 * This is validated again on the browser before any outbound request.
 */
export function isAnonymizedInstruction(raw: unknown): boolean {
  if (typeof raw !== "string" || raw.length > 140) return false;
  const m = raw.match(
    /^お客様の(エアコン洗浄|エアコンクリーニング)([1-9]|[12][0-9]|30)台を(税込|税抜)([1-9][0-9]{0,8})円で見積して$/
  );
  if (!m) return false;
  const amount = Number(m[4]);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_TOTAL_YEN;
}

export function normalizeNumerals(raw: unknown): string {
  return String(raw || "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0)-0xfee0))
    .replace(/[，、]/g, ",");
}
export function checkInput(raw: unknown): {ok: boolean; code?: string; input?: string} {
  if (typeof raw !== "string" || !raw.trim() || raw.length > MAX_INSTRUCTION_CHARS) {
    return { ok:false, code:"instruction_invalid" };
  }
  if (new TextEncoder().encode(raw).length > MAX_INSTRUCTION_BYTES) {
    return { ok:false, code:"instruction_too_large" };
  }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(raw)) {
    return { ok:false, code:"instruction_invalid" };
  }
  return { ok:true, input:raw.trim() };
}
function extractTotalCandidate(input: string): Set<number> {
  const str = normalizeNumerals(input);
  // This only verifies a model-extracted total; never invents a price.
  const matches = [...str.matchAll(/(?<![-\d])([0-9][0-9,]*)\s*円/g)];
  const candidates = new Set<number>();
  for (const m of matches) {
    const n = Number(m[1].replaceAll(",",""));
    if (Number.isSafeInteger(n) && n > 0 && n <= MAX_TOTAL_YEN) candidates.add(n);
  }
  return candidates;
}
function quantityMentioned(input: string, n: number): boolean {
  const normalized = normalizeNumerals(input).replace(/\s/g, "");
  if (new RegExp("(?:^|\\D)"+String(n)+"台(?:\\D|$)").test(normalized)) return true;
  const kanji = ["","一","二","三","四","五","六","七","八","九","十"];
  if (n >= 1 && n <= 10 && normalized.includes(kanji[n]+"台")) return true;
  return false;
}
function safeText(raw: unknown, limit = 80): string {
  return typeof raw === "string" && raw.trim().length <= limit ? raw.trim() : "";
}
export function validateModelIntent(input: unknown, raw: unknown) {
  const source = checkInput(input);
  if (!source.ok || !source.input) return { ok:false, code:"instruction_invalid" };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok:false, code:"model_output_invalid" };
  }
  const model = raw as Record<string, unknown>;
  const action = safeText(model.action, 32);
  if (!SUPPORTED_ACTIONS.includes(action)) return { ok:false, code:"action_forbidden" };
  let customerName = safeText(model.customer_name);
  let serviceName = safeText(model.service_name, 80);
  let totalYen: number | null = null;
  let quantity: number | null = null;

  if (model.total_yen !== null && model.total_yen !== undefined) {
    if (typeof model.total_yen !== 'number' || !Number.isSafeInteger(model.total_yen) ||
        model.total_yen < 1 || model.total_yen > MAX_TOTAL_YEN) {
      return { ok:false, code:"amount_invalid" };
    }
    totalYen = model.total_yen as number;
    if (!extractTotalCandidate(source.input).has(totalYen)) {
      return { ok:false, code:"amount_not_in_instruction" };
    }
  } else totalYen = null;
  if (model.quantity != null) {
    if (typeof model.quantity !== 'number' || !Number.isInteger(model.quantity) ||
        model.quantity < 1 || model.quantity > 30) {
      return { ok:false, code:"quantity_invalid" };
    }
    quantity = model.quantity as number;
    if (!quantityMentioned(source.input, quantity)) {
      return { ok:false, code:"quantity_not_in_instruction" };
    }
  } else quantity = null;
  const taxMode = safeText(model.tax_mode, 20);
  const taxMap = ["included","excluded","unknown"];
  if (!taxMap.includes(taxMode)) return {ok:false,code:"tax_mode_invalid"};
  const scope = safeText(model.amount_scope, 20);
  if (!["total","each","unknown"].includes(scope)) return {ok:false,code:"amount_scope_invalid"};
  const sourceFlat = source.input.replace(/\s/g, "").replace(/[　]/g,"");
  if (customerName && !sourceFlat.includes(customerName.replace(/\s/g,"").replace(/(さん|様|御中)$/,""))) {
    customerName = "";
  }
  if (serviceName && !sourceFlat.includes(serviceName.replace(/\s/g,""))) {
    // Keep the original wording rather than invent service items.
    serviceName = "";
  }
  if (taxMode === "included" && !/税込|内税/.test(source.input)) {
    return {ok:false,code:"tax_mode_not_supported"};
  }
  if (taxMode === "excluded" && !/税抜|税別|外税/.test(source.input)) {
    return {ok:false,code:"tax_mode_not_supported"};
  }
  if (scope === "each" || /単価|1台あたり|１台あたり/.test(source.input)) {
    return {ok:true,action:"unsupported",customer_name:customerName||null,
      service_name:serviceName||null,quantity,total_yen:totalYen,tax_mode:taxMode,
      amount_scope:"each",needs_user_input:true,followup:"合計金額を円単位で指定してください。",
      can_execute:false};
  }
  const needsUserInput = Boolean(model.needs_user_input);
  const supported = action !== "unsupported";
  return {
    ok:true,
    action,
    customer_name:customerName||null,
    service_name:serviceName||null,
    quantity,total_yen:totalYen,
    tax_mode:taxMode,amount_scope:scope,
    needs_user_input: needsUserInput || !supported ||
      (action==="estimate_create" && (!customerName || !serviceName || !quantity || !totalYen || taxMode==="unknown" || scope!=="total")) ||
      (action==="estimate_revision" && !totalYen),
    followup:safeText(model.followup,100)||null,
    can_execute:false
  };
}
