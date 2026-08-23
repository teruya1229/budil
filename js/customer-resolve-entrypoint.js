/**
 * Budil — leads を Canonical Data とする read-only 顧客解決入口。
 *
 * - customerId 完全一致のみ matched（自動確定可）
 * - 氏名・電話・メール等は候補提示のみ。1件でも needs_confirmation（自動確定禁止）
 * - 推測補完・曖昧部分一致はしない
 * - 返却は本人判別用の最小限＋mask。住所全文・メモ本文・完全連絡先は出さない
 * - 永続化・leads 書込・請求書 apply は行わない
 *
 * Browser / Node(vm) 両対応。Node CLI は scripts/customer-resolve-cli.mjs。
 */
const CustomerResolveEntrypoint = {
  MAX_CANDIDATES: 10,
  MAX_QUERY_STRING: 200,

  CODES: {
    MATCHED: 'matched',
    NEEDS_CONFIRMATION: 'needs_confirmation',
    AMBIGUOUS: 'ambiguous',
    NOT_FOUND: 'not_found',
    TOO_MANY: 'too_many',
    INVALID_INPUT: 'invalid_input'
  },

  result(status, extra) {
    const out = {
      ok: status === this.CODES.MATCHED || status === this.CODES.NEEDS_CONFIRMATION || status === this.CODES.AMBIGUOUS,
      status,
      code: String(status).toUpperCase(),
      candidates: [],
      candidateCount: 0,
      requiresUserConfirmation: status !== this.CODES.MATCHED && status !== this.CODES.NOT_FOUND,
      invoiceApplyAllowed: false,
      memoryWrite: false
    };
    if (extra && typeof extra === 'object') Object.assign(out, extra);
    if (Array.isArray(out.candidates)) {
      out.candidateCount = out.candidates.length;
    }
    return out;
  },

  fail(status, message, extra) {
    return this.result(status, Object.assign({ message: String(message || status) }, extra || {}));
  },

  /**
   * 既存 Reception / FollowUp 系の氏名正規化に揃える（完全一致用）。
   * includes による推測一致はしない。
   */
  normalizeName(value) {
    return String(value || '')
      .trim()
      .replace(/\s*(様|御中|さん)$/i, '')
      .replace(/\s+/g, '')
      .toLowerCase();
  },

  /** 電話は数字のみ（ハイフン・全角等を除去）。推測補完なし。 */
  normalizePhone(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const zen = raw.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
    return zen.replace(/\D+/g, '');
  },

  normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  },

  normalizeMunicipality(value) {
    return String(value || '').trim().replace(/\s+/g, '');
  },

  leadDisplayName(lead) {
    const l = lead && typeof lead === 'object' ? lead : {};
    return String(l.company || l.companyName || l.customerName || l.name || l.contact || '').trim();
  },

  leadCustomerId(lead) {
    const l = lead && typeof lead === 'object' ? lead : {};
    return String(l.id || l.customerId || '').trim();
  },

  leadPhone(lead) {
    const l = lead && typeof lead === 'object' ? lead : {};
    return String(l.phone || l.tel || '').trim();
  },

  leadEmail(lead) {
    const l = lead && typeof lead === 'object' ? lead : {};
    return String(l.email || l.mail || '').trim();
  },

  /**
   * 市区町村相当のみ。住所全文は返さない。
   * MapBrain があれば再利用、なければ area / region の短い値のみ。
   */
  leadMunicipality(lead) {
    const l = lead && typeof lead === 'object' ? lead : {};
    if (typeof MapBrain !== 'undefined' && MapBrain && typeof MapBrain.getLeadArea === 'function') {
      const area = String(MapBrain.getLeadArea(l) || '').trim();
      if (area && area !== '不明') return area;
    }
    const area = String(l.area || '').trim();
    if (area) return area;
    const region = String(l.region || '').trim();
    // region が住所全文の場合は出さない（長すぎる／番地を含む）
    if (region && region.length <= 20 && !/\d/.test(region) && !/丁目|番地|-/.test(region)) {
      return region;
    }
    if (typeof MapBrain !== 'undefined' && MapBrain && typeof MapBrain.detectAreaFromAddress === 'function') {
      const detected = String(MapBrain.detectAreaFromAddress(String(l.address || l.region || '')) || '').trim();
      if (detected && detected !== '不明') return detected;
    }
    return '';
  },

  maskPhone(value) {
    const digits = this.normalizePhone(value);
    if (!digits) return '';
    if (digits.length <= 4) return '****';
    return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
  },

  maskEmail(value) {
    const email = String(value || '').trim();
    if (!email || !email.includes('@')) return email ? '***@***' : '';
    const [local, domain] = email.split('@');
    const localMask = local.length <= 1 ? '*' : `${local[0]}***`;
    const domainParts = domain.split('.');
    const domainMask = domainParts.length >= 2
      ? `${domainParts[0][0] || '*'}***.${domainParts.slice(1).join('.')}`
      : '***';
    return `${localMask}@${domainMask}`;
  },

  listLeads(deps) {
    if (Array.isArray(deps && deps.leads)) return deps.leads.filter(Boolean);
    if (deps && typeof deps.getLeads === 'function') {
      const list = deps.getLeads();
      return Array.isArray(list) ? list.filter(Boolean) : [];
    }
    return [];
  },

  sanitizeQuery(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { ok: false, message: '入力は JSON オブジェクトである必要があります' };
    }
    const keys = Object.keys(input);
    const allowed = new Set(['customerId', 'name', 'phone', 'email', 'municipality', 'limit']);
    for (const k of keys) {
      if (!allowed.has(k)) {
        return { ok: false, message: '未対応の検索項目があります' };
      }
    }
    const customerId = String(input.customerId || '').trim();
    const name = String(input.name || input.customerName || '').trim();
    const phone = String(input.phone || '').trim();
    const email = String(input.email || '').trim();
    const municipality = String(input.municipality || '').trim();
    let limit = this.MAX_CANDIDATES;
    if (input.limit != null && input.limit !== '') {
      const n = Number(input.limit);
      if (!Number.isInteger(n) || n < 1 || n > this.MAX_CANDIDATES) {
        return { ok: false, message: 'limit が不正です' };
      }
      limit = n;
    }
    for (const [label, value] of [
      ['customerId', customerId],
      ['name', name],
      ['phone', phone],
      ['email', email],
      ['municipality', municipality]
    ]) {
      if (value.length > this.MAX_QUERY_STRING) {
        return { ok: false, message: `${label} が長すぎます` };
      }
    }
    if (!customerId && !name && !phone && !email) {
      return { ok: false, message: 'customerId / name / phone / email のいずれかが必要です' };
    }
    // customerId 指定時は他条件を混ぜない（完全一致専用）
    if (customerId && (name || phone || email || municipality)) {
      return { ok: false, message: 'customerId 指定時は他の検索条件を併用できません' };
    }
    return {
      ok: true,
      query: { customerId, name, phone, email, municipality, limit }
    };
  },

  toCandidate(lead, matchReason) {
    return {
      customerId: this.leadCustomerId(lead),
      displayName: this.leadDisplayName(lead),
      municipality: this.leadMunicipality(lead),
      maskedPhone: this.maskPhone(this.leadPhone(lead)),
      maskedEmail: this.maskEmail(this.leadEmail(lead)),
      matchReason: String(matchReason || '')
    };
  },

  /**
   * @param {object} input stdin 構造化クエリ
   * @param {object} deps { leads | getLeads }
   */
  resolve(input, deps) {
    const sanitized = this.sanitizeQuery(input);
    if (!sanitized.ok) {
      return this.fail(this.CODES.INVALID_INPUT, sanitized.message);
    }
    const query = sanitized.query;
    const leads = this.listLeads(deps);

    if (query.customerId) {
      const hit = leads.find((l) => this.leadCustomerId(l) === query.customerId);
      if (!hit) {
        return this.fail(this.CODES.NOT_FOUND, 'customerId に一致する顧客がありません', {
          ok: false,
          requiresUserConfirmation: false
        });
      }
      return this.result(this.CODES.MATCHED, {
        ok: true,
        requiresUserConfirmation: false,
        candidates: [this.toCandidate(hit, 'customerId')],
        selectedCustomerId: this.leadCustomerId(hit)
      });
    }

    const nameNorm = query.name ? this.normalizeName(query.name) : '';
    const phoneNorm = query.phone ? this.normalizePhone(query.phone) : '';
    const emailNorm = query.email ? this.normalizeEmail(query.email) : '';
    const muniNorm = query.municipality ? this.normalizeMunicipality(query.municipality) : '';

    if (query.phone && !phoneNorm) {
      return this.fail(this.CODES.INVALID_INPUT, 'phone を正規化できません');
    }
    if (query.email && !emailNorm) {
      return this.fail(this.CODES.INVALID_INPUT, 'email を正規化できません');
    }

    const matches = [];
    for (const lead of leads) {
      const reasons = [];
      if (nameNorm) {
        const leadName = this.normalizeName(this.leadDisplayName(lead));
        if (!leadName || leadName !== nameNorm) continue;
        reasons.push('name');
      }
      if (phoneNorm) {
        const leadPhone = this.normalizePhone(this.leadPhone(lead));
        if (!leadPhone || leadPhone !== phoneNorm) continue;
        reasons.push('phone');
      }
      if (emailNorm) {
        const leadEmail = this.normalizeEmail(this.leadEmail(lead));
        if (!leadEmail || leadEmail !== emailNorm) continue;
        reasons.push('email');
      }
      if (muniNorm) {
        const leadMuni = this.normalizeMunicipality(this.leadMunicipality(lead));
        if (!leadMuni || leadMuni !== muniNorm) continue;
        reasons.push('municipality');
      }
      if (!reasons.length) continue;
      matches.push({ lead, matchReason: reasons.join('+') });
    }

    if (matches.length === 0) {
      return this.fail(this.CODES.NOT_FOUND, '一致する顧客がありません', {
        ok: false,
        requiresUserConfirmation: false
      });
    }

    if (matches.length > query.limit) {
      return this.fail(this.CODES.TOO_MANY, '候補が上限を超えています。検索条件を追加してください', {
        ok: false,
        requiresUserConfirmation: true,
        candidateCount: matches.length,
        candidates: [],
        maxCandidates: query.limit
      });
    }

    const candidates = matches.map((m) => this.toCandidate(m.lead, m.matchReason));
    // 氏名・電話・メール経路は件数に関わらず自動確定しない
    if (candidates.length === 1) {
      return this.result(this.CODES.NEEDS_CONFIRMATION, {
        ok: true,
        requiresUserConfirmation: true,
        candidates,
        message: '候補が1件ありますが本人確認が必要です'
      });
    }
    return this.result(this.CODES.AMBIGUOUS, {
      ok: true,
      requiresUserConfirmation: true,
      candidates,
      message: '複数候補があるため本人確認が必要です'
    });
  },

  /**
   * 本番/バックアップ leads の shape だけを返す（値・PIIなし）。
   */
  shapeProbe(leads) {
    const list = Array.isArray(leads) ? leads.filter(Boolean) : [];
    let withId = 0;
    let withName = 0;
    let withPhone = 0;
    let withEmail = 0;
    let withMunicipality = 0;
    for (const lead of list) {
      if (this.leadCustomerId(lead)) withId += 1;
      if (this.leadDisplayName(lead)) withName += 1;
      if (this.normalizePhone(this.leadPhone(lead))) withPhone += 1;
      if (this.normalizeEmail(this.leadEmail(lead))) withEmail += 1;
      if (this.leadMunicipality(lead)) withMunicipality += 1;
    }
    const n = list.length || 1;
    return {
      ok: true,
      readable: true,
      count: list.length,
      rates: {
        customerId: Number((withId / n).toFixed(4)),
        name: Number((withName / n).toFixed(4)),
        phone: Number((withPhone / n).toFixed(4)),
        email: Number((withEmail / n).toFixed(4)),
        municipality: Number((withMunicipality / n).toFixed(4))
      },
      schemaCompatible: withId > 0 && withName > 0,
      sideEffects: false
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CustomerResolveEntrypoint };
}
