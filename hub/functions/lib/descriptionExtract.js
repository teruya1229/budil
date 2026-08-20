function toAsciiDigits(s) {
  return s.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0 + 48));
}

function getRawDescriptionText(description) {
  if (description === null || description === undefined) return "";
  return String(description);
}

function normalizeDescription(description) {
  return getRawDescriptionText(description).replace(/[ \t\r\n　]+/g, "");
}

function descriptionToPlainLines(description) {
  return getRawDescriptionText(description)
    .replace(/<br\s*\/?>/gi, "\n")
    .split(/\r?\n/)
    .map((line) => line.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);
}

function parseLabeledMap(description) {
  const map = {};
  for (const line of descriptionToPlainLines(description)) {
    const match = line.match(/^([^：:]+)[：:]\s*(.*)$/u);
    if (match) {
      map[match[1].trim()] = match[2].trim();
    }
  }
  return map;
}

function pickLabeled(labeled, keys) {
  for (const key of keys) {
    if (labeled[key]) return labeled[key];
  }
  return null;
}

function parseAmountFromText(text) {
  if (!text) return null;
  const match = String(text).match(/([0-9０-９,]+)/);
  if (!match) return null;
  const digits = toAsciiDigits(match[1]).replace(/,/g, "");
  const amount = Number(digits);
  return Number.isFinite(amount) ? amount : null;
}

function extractPhoneNumber(description) {
  const labeled = parseLabeledMap(description);
  const fromLabel = pickLabeled(labeled, ["電話番号", "電話", "TEL", "Tel"]);
  if (fromLabel) {
    return toAsciiDigits(fromLabel).replace(/\s+/g, " ").trim();
  }
  const normalized = normalizeDescription(description);
  const re = /(?:電話番号|電話)[：:]([0-9０-９+()（）][0-9０-９\-()（）+／/]*)/;
  const m = normalized.match(re);
  if (!m) return "";
  return toAsciiDigits(m[1]).replace(/\s+/g, " ").trim();
}

function looksLikePhoneOrAddressNoise(raw) {
  const text = String(raw || "");
  if (/(?:電話|TEL|Tel|〒|住所)/.test(text)) return true;
  if (/\d{2,4}-\d{2,4}-\d{3,4}/.test(text)) return true;
  if (/\d{3}-\d{4}/.test(text) && !/[¥￥円]/.test(text)) return true;
  return false;
}

function extractBareCurrencyAmount(description) {
  for (const line of descriptionToPlainLines(description)) {
    if (looksLikePhoneOrAddressNoise(line)) continue;
    const yenMark = line.match(/[¥￥]\s*([0-9０-９][0-9０-９,]*)/);
    if (yenMark) {
      const amount = parseAmountFromText(yenMark[1]);
      if (amount != null && amount >= 1000) {
        return { amountText: yenMark[0].trim(), amount };
      }
    }
    const yenSuffix = line.match(/([0-9０-９][0-9０-９,]*)\s*円/);
    if (yenSuffix) {
      const amount = parseAmountFromText(yenSuffix[1]);
      if (amount != null && amount >= 1000) {
        return { amountText: yenSuffix[0].trim(), amount };
      }
    }
  }
  return { amountText: null, amount: null };
}

function extractAmountFields(description) {
  const labeled = parseLabeledMap(description);
  const amountText = pickLabeled(labeled, ["金額", "料金"]);
  if (amountText) {
    return {
      amountText,
      amount: parseAmountFromText(amountText)
    };
  }
  const normalized = normalizeDescription(description);
  const re = /(?:金額|料金)[：:]*([0-9０-９,]+円[^\\n\\r]*)/;
  const m = normalized.match(re);
  if (m) {
    return {
      amountText: m[1].trim(),
      amount: parseAmountFromText(m[1])
    };
  }
  const labeledLoose = parseAmountFromText(normalized.match(/(?:金額|料金)[：:]*([0-9０-９,]+)円?/)?.[1]);
  if (labeledLoose != null) {
    return {
      amountText: String(labeledLoose),
      amount: labeledLoose
    };
  }
  return extractBareCurrencyAmount(description);
}

function extractAddress(description, location) {
  const labeled = parseLabeledMap(description);
  const fromDescription = pickLabeled(labeled, ["住所", "所在地", "現場住所"]);
  if (fromDescription) return fromDescription;
  const locationText = String(location || "").trim();
  return locationText || null;
}

function extractCustomerName(description) {
  const labeled = parseLabeledMap(description);
  return pickLabeled(labeled, ["氏名", "お客様名", "顧客名", "お客様", "名前"]);
}

function extractSourceName(description) {
  const labeled = parseLabeledMap(description);
  return pickLabeled(labeled, ["依頼元", "元", "紹介元"]);
}

function extractWorkType(description, title) {
  const labeled = parseLabeledMap(description);
  const labeledValue = pickLabeled(labeled, ["作業内容", "作業", "サービス"]);
  if (labeledValue) return labeledValue;
  const titleText = String(title || "").trim();
  return titleText || null;
}

export function extractReceptionFields(description, { title, location } = {}) {
  const labeled = parseLabeledMap(description);
  const amountFields = extractAmountFields(description);
  return {
    customerName: extractCustomerName(description),
    requestSource: extractSourceName(description),
    address: extractAddress(description, location),
    phone: extractPhoneNumber(description) || null,
    amount: amountFields.amount,
    amountText: amountFields.amountText,
    workType: extractWorkType(description, title),
    workDetails: pickLabeled(labeled, ["補足", "作業詳細", "詳細"])
  };
}
