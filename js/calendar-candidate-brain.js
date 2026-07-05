/**
 * Budil v4.3 - カレンダー/予定候補取り込み番頭
 * カレンダー予定は作業予定候補として扱い、売上確定にはしない。
 * v4.11.0: 予定取り込みロジック維持（cache buster更新のみ）
 */
const CalendarCandidateBrain = {
  IMPORT_SOURCE: 'calendar-paste',
  JSON_IMPORT_SOURCE: 'calendar-json-file',
  SOURCE_TYPE: 'work-order-candidate',
  BLOCK_MARKER: '【カレンダー予定】',
  CANDIDATE_STATUSES: [
    '候補',
    '作業予定に追加済み',
    '要確認',
    'スキップ',
    '売上実績候補',
    'converted',
    'excluded',
    'duplicate_suspected'
  ],
  PAST_RECOVERY_REVENUE_CANDIDATE: '売上実績候補',
  PAST_RECOVERY_CONVERTED: 'converted',
  PAST_RECOVERY_EXCLUDED: 'excluded',
  PAST_RECOVERY_DUPLICATE: 'duplicate_suspected',
  // v4.10.42: 未確定は状態ラベルとして扱い、候補除外ワードに含めない
  NON_EXCLUSION_CONFIRMATION_STATUSES: ['未確定', '支払方法未定', '型番確認中'],
  PAST_RECOVERY_EXCLUDED_PATTERN: /キャンセル|取消|取り消し|中止|見積|見積もり|見積り|見積のみ|日程調整|調整中|仮予定|仮押さえ/,
  FUTURE_IMPORT_EXCLUDED_PATTERN: /キャンセル|取消|取り消し|中止|見積もり|見積り|見積のみ|見積$|日程調整中|調整中|休み|仮予定|仮押さえ/,

  PASTE_LABELS: {
    '日付': 'scheduledDate',
    '開始時間': 'startTime',
    '終了時間': 'endTime',
    'タイトル': 'title',
    'お客様名': 'customerName',
    '作業内容': 'serviceText',
    '住所': 'address',
    '依頼元': 'source',
    '予定金額': 'estimateAmount',
    'メモ': 'memo',
    '確度': 'confidence',
    '注意': 'cautionNote'
  },

  PASTE_LABEL_ALIASES: {
    '件名': 'title',
    '予定名': 'title',
    '作業名': 'title',
    '内容': 'title',
    '金額': 'estimateAmount',
    '料金': 'estimateAmount',
    '売上予定': 'estimateAmount',
    '売上金額': 'estimateAmount',
    '見込み金額': 'estimateAmount',
    '時間': 'startTime',
    '時刻': 'startTime',
    '作業時間': 'startTime',
    '開始': 'startTime',
    '終了': 'endTime',
    '顧客名': 'customerName',
    '氏名': 'customerName',
    '名前': 'customerName',
    '顧客': 'customerName',
    '場所': 'address',
    '所在地': 'address',
    '訪問先': 'address',
    '備考': 'memo',
    '詳細': 'memo',
    '説明': 'memo',
    'ステータス': 'confidence',
    '状態': 'confidence'
  },

  resolvePasteField(labelKey) {
    const key = String(labelKey || '').trim();
    if (!key) return '';
    if (this.PASTE_LABELS[key]) return this.PASTE_LABELS[key];
    return this.PASTE_LABEL_ALIASES[key] || '';
  },

  normalizeConfirmationStatus(value) {
    return String(value || '').trim();
  },

  isNonExclusionConfirmationStatus(value) {
    const status = this.normalizeConfirmationStatus(value);
    return this.NON_EXCLUSION_CONFIRMATION_STATUSES.includes(status);
  },

  resolveConfirmationStatus(raw) {
    const item = raw && typeof raw === 'object' ? raw : {};
    const extracted = item.extracted && typeof item.extracted === 'object' ? item.extracted : {};
    return this.normalizeConfirmationStatus(
      extracted.confirmationStatus || item.confirmationStatus || ''
    );
  },

  sanitizeMemoForExclusionCheck(memo) {
    return String(memo || '')
      .split('\n')
      .filter(line => !/(?:確認)?(?:Status|ステータス|状態|確度)[：:]\s*(未確定|支払方法未定|型番確認中)\s*$/i.test(line.trim()))
      .join(' ');
  },

  buildFutureImportExclusionText(candidate) {
    const c = this.normalizeCandidate(candidate);
    const memo = this.sanitizeMemoForExclusionCheck(c.memo);
    const confidence = this.isNonExclusionConfirmationStatus(c.confidence) ? '' : c.confidence;
    const confirmationStatus = this.isNonExclusionConfirmationStatus(c.confirmationStatus)
      ? ''
      : c.confirmationStatus;
    return [
      c.title,
      c.customerName,
      c.serviceText,
      c.source,
      memo,
      c.cautionNote,
      confidence,
      confirmationStatus
    ].join(' ');
  },

  buildPastRecoveryExclusionText(candidate) {
    return this.buildFutureImportExclusionText(candidate);
  },

  normalizeCandidateMeta(raw) {
    const item = raw && typeof raw === 'object' ? raw : {};
    const now = new Date().toISOString();
    return {
      importSource: item.importSource || this.IMPORT_SOURCE,
      sourceType: item.sourceType || this.SOURCE_TYPE,
      originalText: String(item.originalText || '').trim(),
      confidence: String(item.confidence || '').trim(),
      estimatedAmount: item.estimatedAmount != null ? String(item.estimatedAmount) : '',
      importedAt: item.importedAt || now,
      confirmedRevenue: item.confirmedRevenue === true,
      candidateStatus: this.CANDIDATE_STATUSES.includes(item.candidateStatus)
        ? item.candidateStatus
        : '候補',
      cautionNote: String(item.cautionNote || '').trim()
    };
  },

  isPastRecoverySourceWorkOrder(workOrder) {
    const wo = workOrder && typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(workOrder)
      : workOrder;
    if (!wo) return false;
    const meta = wo.candidateMeta;
    if (meta) {
      if (meta.importSource === this.IMPORT_SOURCE) return true;
      if (meta.importSource === this.JSON_IMPORT_SOURCE) return true;
      if (meta.sourceType === this.SOURCE_TYPE) return true;
      if (meta.originalText && String(meta.originalText).includes(this.BLOCK_MARKER)) return true;
    }
    if (wo.calendarDedupeKey && String(wo.calendarDedupeKey).startsWith('calendar-past-recovery')) return true;
    return false;
  },

  isCalendarCandidateWorkOrder(workOrder) {
    return this.isPastRecoverySourceWorkOrder(workOrder);
  },

  getCandidateStatus(workOrder) {
    const wo = workOrder && typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(workOrder)
      : workOrder;
    if (!this.isPastRecoverySourceWorkOrder(wo)) return '';
    return (wo.candidateMeta && wo.candidateMeta.candidateStatus) || '候補';
  },

  isPendingCandidate(workOrder) {
    const st = this.getCandidateStatus(workOrder);
    return st === '候補' || st === '要確認' || st === this.PAST_RECOVERY_REVENUE_CANDIDATE;
  },

  isPromotedCandidate(workOrder) {
    return this.getCandidateStatus(workOrder) === '作業予定に追加済み';
  },

  normalizeCandidate(candidate, originalText) {
    const c = candidate && typeof candidate === 'object' ? { ...candidate } : {};
    const meta = c.candidateMeta && typeof c.candidateMeta === 'object' ? c.candidateMeta : {};
    const topAmount = this.parseAmount(c.estimateAmount);
    const amountRaw = topAmount > 0
      ? c.estimateAmount
      : (meta.estimatedAmount != null && meta.estimatedAmount !== '' ? meta.estimatedAmount : c.amount);
    const amount = this.parseAmount(amountRaw);
    return {
      scheduledDate: this.normalizeDate(c.scheduledDate || c.date),
      startTime: this.normalizeTime(c.startTime),
      endTime: this.normalizeTime(c.endTime),
      title: String(c.title || '').trim(),
      customerName: String(c.customerName || '').trim(),
      serviceText: String(c.serviceText || c.service || '').trim(),
      address: String(c.address || '').trim(),
      source: String(c.source || '').trim(),
      estimateAmount: amount,
      memo: String(c.memo || '').trim(),
      confidence: String(c.confidence || '').trim(),
      confirmationStatus: String(c.confirmationStatus || '').trim(),
      cautionNote: String(c.cautionNote || c.caution || '').trim(),
      phone: String(c.phone || '').trim(),
      calendarDedupeKey: String(c.calendarDedupeKey || '').trim(),
      importSource: this.IMPORT_SOURCE,
      sourceType: this.SOURCE_TYPE,
      originalText: String(originalText || c.originalText || meta.originalText || '').trim()
    };
  },

  inferCustomerNameFromTitle(title) {
    const fields = { title: String(title || '').trim() };
    if (!fields.title) return '';
    this.inferFromPlainTitle(fields);
    if (fields.customerName) return fields.customerName;
    const parts = this.parseTitleParts(fields.title);
    if (parts.customerName) return parts.customerName;
    return fields.title.slice(0, 40);
  },

  mapWorkerItemToCandidate(item) {
    const row = item && typeof item === 'object' ? item : {};
    const extracted = row.extracted && typeof row.extracted === 'object' ? row.extracted : {};
    const budilImport = row.budilImport && typeof row.budilImport === 'object' ? row.budilImport : {};
    const start = row.start && typeof row.start === 'object' ? row.start : {};
    const end = row.end && typeof row.end === 'object' ? row.end : {};
    const customerName = String(extracted.customerName || '').trim()
      || this.inferCustomerNameFromTitle(row.title);
    const serviceText = String(extracted.workType || extracted.workDetails || '').trim()
      || String(row.title || '').trim();
    const address = String(extracted.address || row.location || '').trim();
    const amount = this.parseAmount(
      extracted.amount != null && extracted.amount !== ''
        ? extracted.amount
        : extracted.amountText
    );
    const confirmationStatus = this.resolveConfirmationStatus(row);
    const memoParts = [String(row.description || '').trim()];
    if (extracted.phone) memoParts.push('電話：' + String(extracted.phone).trim());
    return this.normalizeCandidate({
      title: row.title,
      scheduledDate: row.date,
      date: row.date,
      startTime: start.isAllDay ? '' : (start.time || ''),
      endTime: end.isAllDay ? '' : (end.time || ''),
      customerName,
      serviceText,
      address,
      source: String(extracted.requestSource || budilImport.source || 'google_calendar').trim(),
      estimateAmount: amount,
      phone: extracted.phone,
      memo: memoParts.filter(Boolean).join('\n'),
      confidence: confirmationStatus,
      confirmationStatus,
      calendarDedupeKey: String(budilImport.dedupeKey || '').trim()
    }, '');
  },

  parseBudilCalendarEventsJson(text) {
    const warnings = [];
    const errors = [];
    const src = String(text || '').trim();
    if (!src) {
      return {
        candidates: [],
        warnings: ['JSONが空です'],
        errors: [],
        sourceFormat: 'json-file-empty'
      };
    }
    let payload;
    try {
      payload = JSON.parse(src);
    } catch {
      return {
        candidates: [],
        warnings: [],
        errors: ['JSONの形式が正しくありません'],
        sourceFormat: 'json-file-invalid'
      };
    }
    if (!payload || typeof payload !== 'object') {
      return {
        candidates: [],
        warnings: [],
        errors: ['JSONルートがオブジェクトではありません'],
        sourceFormat: 'json-file-invalid'
      };
    }
    const items = Array.isArray(payload.items) ? payload.items : null;
    if (!items) {
      return {
        candidates: [],
        warnings: [],
        errors: ['items 配列が見つかりません'],
        sourceFormat: 'json-file-invalid'
      };
    }
    if (!items.length) warnings.push('items が0件です');
    const candidates = items.map(item => this.mapWorkerItemToCandidate(item));
    return {
      candidates,
      warnings,
      errors,
      sourceFormat: 'budil-calendar-json',
      rawText: src,
      meta: {
        source: payload.source || '',
        schemaVersion: payload.schemaVersion,
        fetchedAt: payload.fetchedAt || '',
        targetPeriod: payload.targetPeriod || null
      }
    };
  },

  resolvePastRecoveryCandidate(raw) {
    const wo = raw && typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(raw)
      : (raw && typeof raw === 'object' ? { ...raw } : {});
    const meta = wo.candidateMeta && typeof wo.candidateMeta === 'object' ? wo.candidateMeta : {};
    const topAmount = Number(wo.estimateAmount || 0);
    return this.normalizeCandidate({
      ...wo,
      id: wo.id,
      estimateAmount: topAmount > 0 ? wo.estimateAmount : meta.estimatedAmount,
      scheduledDate: wo.scheduledDate || wo.date,
      serviceText: wo.serviceText || wo.service,
      customerName: wo.customerName,
      source: wo.source,
      address: wo.address,
      memo: wo.memo,
      title: wo.title,
      cautionNote: meta.cautionNote,
      confidence: meta.confidence,
      originalText: meta.originalText,
      candidateMeta: meta
    });
  },

  normalizeDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const iso = raw.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
    if (iso) {
      return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
    }
    const short = raw.match(/(\d{1,2})[\/／月](\d{1,2})/);
    if (short) {
      const year = new Date().getFullYear();
      return `${year}-${String(short[1]).padStart(2, '0')}-${String(short[2]).padStart(2, '0')}`;
    }
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
  },

  normalizeTime(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const m = raw.match(/(\d{1,2})[:：時](\d{0,2})/);
    if (m) {
      const h = String(m[1]).padStart(2, '0');
      const min = String(m[2] || '0').padStart(2, '0');
      return `${h}:${min}`;
    }
    return /^\d{2}:\d{2}$/.test(raw) ? raw : '';
  },

  parseTimeField(value) {
    const raw = String(value || '').trim();
    if (!raw) return { startTime: '', endTime: '' };
    const range = raw.match(
      /(\d{1,2}[:：時]\d{0,2})\s*[-–—~〜～]\s*(\d{1,2}[:：時]\d{0,2})/
    );
    if (range) {
      return {
        startTime: this.normalizeTime(range[1]),
        endTime: this.normalizeTime(range[2])
      };
    }
    return { startTime: this.normalizeTime(raw), endTime: '' };
  },

  parseAmount(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
    const parsed = parseInt(String(value).replace(/[^\d]/g, ''), 10);
    return Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
  },

  extractLabelValue(line) {
    const m = String(line || '').match(/^([^：:]+)[：:]\s*(.*)$/);
    if (!m) return null;
    return { key: m[1].trim(), value: m[2].trim() };
  },

  parseTitleParts(title) {
    const parts = String(title || '').split(/[／\/|｜]/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 3) {
      return { source: parts[0], customerName: parts[1], serviceText: parts.slice(2).join(' ') };
    }
    if (parts.length === 2) {
      return { customerName: parts[0], serviceText: parts[1] };
    }
    return { serviceText: title };
  },

  inferFromPlainTitle(fields) {
    const title = String(fields.title || '').trim();
    if (!title || fields.customerName) return;
    const bySuffix = title.match(/^(.+?様)\s+(.+)$/);
    if (bySuffix) {
      fields.customerName = bySuffix[1].trim();
      if (!fields.serviceText) fields.serviceText = bySuffix[2].trim();
      return;
    }
    if (/様$/.test(title)) {
      fields.customerName = title;
      return;
    }
    if (!fields.serviceText) fields.serviceText = title;
  },

  applyPasteField(fields, mapped, value) {
    const raw = String(value || '').trim();
    if (!mapped || !raw) return;
    if (mapped === 'startTime') {
      const times = this.parseTimeField(raw);
      if (times.startTime) fields.startTime = times.startTime;
      if (times.endTime) fields.endTime = times.endTime;
      return;
    }
    if (mapped === 'endTime') {
      fields.endTime = this.normalizeTime(raw);
      return;
    }
    if (mapped === 'estimateAmount') {
      fields.estimateAmount = raw;
      return;
    }
    fields[mapped] = raw;
  },

  parseCandidateBlock(text) {
    const fields = {};
    const lines = String(text || '').split('\n');
    lines.forEach(line => {
      const field = this.extractLabelValue(line.trim());
      if (!field) return;
      const mapped = this.resolvePasteField(field.key);
      if (mapped) this.applyPasteField(fields, mapped, field.value);
    });
    if (fields.title && !fields.customerName) {
      const fromTitle = this.parseTitleParts(fields.title);
      Object.assign(fields, fromTitle);
    }
    this.inferFromPlainTitle(fields);
    if (!fields.serviceText && fields.title) {
      fields.serviceText = fields.title;
    }
    return this.normalizeCandidate(fields, text);
  },

  tryParseJson(text) {
    const src = String(text || '').trim();
    if (!src.startsWith('{') && !src.startsWith('[')) return null;
    try {
      const parsed = JSON.parse(src);
      if (Array.isArray(parsed)) return parsed.map(item => this.normalizeCandidate(item, src));
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.candidates)) {
          return parsed.candidates.map(item => this.normalizeCandidate(item, src));
        }
        return [this.normalizeCandidate(parsed, src)];
      }
    } catch {
      return null;
    }
    return null;
  },

  splitBlocks(text) {
    const src = String(text || '').trim();
    if (!src) return [];
    if (src.includes(this.BLOCK_MARKER)) {
      return src.split(this.BLOCK_MARKER)
        .map(s => s.trim())
        .filter(Boolean)
        .map(block => this.BLOCK_MARKER + '\n' + block);
    }
    const chunks = src.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
    if (chunks.length > 1) return chunks;
    return [src];
  },

  parseCalendarText(text) {
    const warnings = [];
    const errors = [];
    const src = String(text || '').trim();
    if (!src) {
      return { candidates: [], warnings: ['貼り付けテキストが空です'], errors: [], sourceFormat: 'empty' };
    }

    const jsonCandidates = this.tryParseJson(src);
    if (jsonCandidates && jsonCandidates.length) {
      return {
        candidates: jsonCandidates,
        warnings,
        errors,
        sourceFormat: 'json',
        rawText: src
      };
    }

    const blocks = this.splitBlocks(src);
    const candidates = blocks.map(block => this.parseCandidateBlock(block));
    if (!candidates.length) errors.push('予定候補を認識できませんでした');

    candidates.forEach((c, i) => {
      if (!c.scheduledDate) warnings.push(`候補${i + 1}: 日付がありません`);
      if (!c.customerName) warnings.push(`候補${i + 1}: お客様名がありません`);
      if (!c.serviceText) warnings.push(`候補${i + 1}: 作業内容がありません`);
    });

    return {
      candidates,
      warnings,
      errors,
      sourceFormat: blocks.length > 1 ? 'blocks' : 'single',
      rawText: src
    };
  },

  buildDedupeKey(candidate) {
    const c = this.normalizeCandidate(candidate);
    return [
      c.scheduledDate,
      c.startTime,
      c.customerName,
      c.serviceText,
      c.address,
      c.title
    ].join('|').toLowerCase();
  },

  normalizeDedupeText(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, '')
      .toLowerCase();
  },

  buildCalendarDedupeKey(candidate) {
    const c = this.normalizeCandidate(candidate);
    // v4.10.27: startTime/endTime を追加して同日・同金額・別時間の別予定を区別する
    return [
      'calendar-past-recovery',
      c.scheduledDate,
      this.normalizeDedupeText(c.customerName),
      Number(c.estimateAmount || 0),
      this.normalizeDedupeText(c.serviceText),
      this.normalizeDedupeText(c.source),
      c.startTime || '',
      c.endTime || ''
    ].join('|');
  },

  hasPastRecoveryExcludedWord(candidate) {
    const text = this.buildPastRecoveryExclusionText(candidate);
    return this.PAST_RECOVERY_EXCLUDED_PATTERN.test(text);
  },

  hasFutureImportExcludedWord(candidate) {
    const text = this.buildFutureImportExclusionText(candidate);
    if (this.FUTURE_IMPORT_EXCLUDED_PATTERN.test(text)) return true;
    return /(?:^|\s)見積(?:$|\s)/.test(text);
  },

  isInPastRecoveryRange(candidate, options) {
    const c = this.normalizeCandidate(candidate);
    const opts = options || {};
    if (!c.scheduledDate) return false;
    if (opts.startDate && c.scheduledDate < opts.startDate) return false;
    if (opts.endDate && c.scheduledDate > opts.endDate) return false;
    const today = opts.today || new Date().toISOString().slice(0, 10);
    return c.scheduledDate < today;
  },

  isOnOrAfterToday(candidate, today) {
    const c = this.normalizeCandidate(candidate);
    if (!c.scheduledDate) return false;
    const t = today || new Date().toISOString().slice(0, 10);
    return c.scheduledDate >= t;
  },

  detectRevenueDuplicate(candidate, revenues) {
    const c = this.normalizeCandidate(candidate);
    const key = this.buildCalendarDedupeKey(c);
    const customer = this.normalizeDedupeText(c.customerName);
    const service = this.normalizeDedupeText(c.serviceText);
    const source = this.normalizeDedupeText(c.source);
    const amount = Number(c.estimateAmount || 0);
    const sourceCandidateId = String(candidate && candidate.id || '').trim();
    const matches = [];

    (revenues || []).forEach(record => {
      if (!record) return;
      if (record.calendarDedupeKey && record.calendarDedupeKey === key) {
        matches.push({ type: 'calendarDedupeKey', revenue: record, reason: 'calendarDedupeKeyが同じ売上があります' });
        return;
      }
      if (sourceCandidateId && (
        String(record.sourceCandidateId || '') === sourceCandidateId
        || String(record.sourceWorkOrderId || '') === sourceCandidateId
      )) {
        matches.push({ type: 'sourceCandidateId', revenue: record, reason: '同じ候補IDから作成済みの売上があります' });
        return;
      }
      const recCustomer = this.normalizeDedupeText(record.customerName);
      const recService = this.normalizeDedupeText(record.service || record.actualService || '');
      const recSource = this.normalizeDedupeText(record.source);
      const recAmount = Number(record.amount || 0);
      const near = (
        String(record.workDate || '') === c.scheduledDate
        && recCustomer
        && customer
        && recCustomer === customer
        && recAmount === amount
        && (recService === service || recSource === source)
      );
      if (near) {
        matches.push({ type: 'near', revenue: record, reason: '日付・顧客名・金額が近い売上があります' });
      }
    });
    return matches;
  },

  buildRevenueDuplicateCandidateFromForm(formData) {
    const d = formData && typeof formData === 'object' ? formData : {};
    return {
      scheduledDate: String(d.workDate || d.scheduledDate || '').slice(0, 10),
      customerName: String(d.customerName || '').trim(),
      serviceText: String(d.service || d.serviceText || '').trim(),
      source: String(d.source || '').trim(),
      estimateAmount: Number(d.amount != null ? d.amount : d.estimateAmount) || 0,
      id: String(d.sourceWorkOrderId || d.id || '').trim()
    };
  },

  findRevenueDuplicateMatches(formData, revenues, options) {
    const opts = options || {};
    const excludeId = String(opts.excludeId || '').trim();
    const candidate = this.buildRevenueDuplicateCandidateFromForm(formData);
    const raw = this.detectRevenueDuplicate(candidate, revenues || []);
    if (!excludeId) return raw;
    return raw.filter(m => m.revenue && String(m.revenue.id || '') !== excludeId);
  },

  isDatesNearForLink(a, b, maxDays) {
    const da = String(a || '').slice(0, 10);
    const db = String(b || '').slice(0, 10);
    if (!da || !db) return false;
    if (da === db) return true;
    const limit = maxDays != null ? Number(maxDays) : 3;
    const t1 = new Date(da + 'T12:00:00').getTime();
    const t2 = new Date(db + 'T12:00:00').getTime();
    if (!Number.isFinite(t1) || !Number.isFinite(t2)) return false;
    return Math.abs(t1 - t2) / 86400000 <= limit;
  },

  normalizeCustomerForLink(name) {
    const raw = String(name || '').trim().replace(/\s*(様|御中)$/, '');
    return this.normalizeDedupeText(raw ? raw + '様' : raw);
  },

  findRevenueLinkCandidatesForDocument(doc, revenues) {
    const d = doc && typeof doc === 'object' ? doc : {};
    if (d.type && d.type !== 'invoice') return [];
    const issueDate = String(d.issueDate || '').slice(0, 10);
    const customerKey = this.normalizeCustomerForLink(d.customerName);
    const amount = Number(d.total || 0);
    if (!customerKey || !amount) return [];

    const matches = [];
    (revenues || []).forEach(record => {
      if (!record || record.status === 'キャンセル') return;
      const recAmount = Number(record.amount || 0);
      if (recAmount !== amount) return;
      const recCustomer = this.normalizeCustomerForLink(record.customerName);
      if (!recCustomer || recCustomer !== customerKey) return;
      const workDate = String(record.workDate || '').slice(0, 10);
      if (!this.isDatesNearForLink(workDate, issueDate, 3)) return;
      matches.push(record);
    });
    return matches;
  },

  revenueHasStrongDuplicateLink(record) {
    if (!record) return false;
    return !!(
      String(record.sourceWorkOrderId || '').trim()
      || String(record.linkedDocumentId || '').trim()
      || String(record.calendarDedupeKey || '').trim()
    );
  },

  classifyPastRecoveryCandidate(candidate, revenues, options) {
    const c = this.resolvePastRecoveryCandidate(candidate);
    const reasons = [];
    if (!this.isInPastRecoveryRange(c, options)) {
      reasons.push('対象期間外、または過去日付ではありません');
    }
    if (!Number(c.estimateAmount || 0)) reasons.push('金額なし');
    if (this.hasPastRecoveryExcludedWord(c)) reasons.push('対象外ワードあり');
    if (candidate && candidate.actualRevenueId) reasons.push('作業予定に売上IDが登録済み');

    if (reasons.length) {
      return {
        status: this.PAST_RECOVERY_EXCLUDED,
        label: '対象外候補',
        reasons,
        calendarDedupeKey: this.buildCalendarDedupeKey(c),
        duplicates: []
      };
    }

    const duplicates = this.detectRevenueDuplicate(candidate, revenues);
    if (duplicates.length) {
      return {
        status: this.PAST_RECOVERY_DUPLICATE,
        label: '重複疑い',
        reasons: duplicates.map(d => d.reason),
        calendarDedupeKey: this.buildCalendarDedupeKey(c),
        duplicates
      };
    }

    return {
      status: this.PAST_RECOVERY_REVENUE_CANDIDATE,
      label: '売上実績候補',
      reasons: [],
      calendarDedupeKey: this.buildCalendarDedupeKey(c),
      duplicates: []
    };
  },

  buildPastRecoveryReport(workOrders, revenues, options) {
    const list = (workOrders || [])
      .filter(w => this.isPastRecoverySourceWorkOrder(w))
      .map(w => typeof WorkOrderBrain !== 'undefined' ? WorkOrderBrain.normalizeWorkOrder(w) : w)
      .filter(w => this.getCandidateStatus(w) !== this.PAST_RECOVERY_CONVERTED);
    const items = list.map(w => {
      const classification = this.classifyPastRecoveryCandidate(w, revenues || [], options || {});
      return { workOrder: w, classification };
    });
    return this.summarizePastRecoveryItems(items);
  },

  buildPastRecoveryReportFromPreview(preview, revenues, options) {
    const items = (preview && preview.items || []).map((item, index) => {
      const candidate = {
        ...(item.candidate || {}),
        id: item.candidate && item.candidate.id ? item.candidate.id : `preview-${index}`
      };
      const classification = this.classifyPastRecoveryCandidate(candidate, revenues || [], options || {});
      return {
        workOrder: candidate,
        classification,
        previewIndex: index,
        isPreview: true
      };
    });
    return this.summarizePastRecoveryItems(items);
  },

  mergePastRecoveryReports(primary, secondary) {
    const a = primary || this.summarizePastRecoveryItems([]);
    const b = secondary || this.summarizePastRecoveryItems([]);
    const seen = new Set();
    const items = [];
    [...(a.items || []), ...(b.items || [])].forEach(item => {
      const wo = item.workOrder || {};
      const key = String(wo.id || '') || this.buildCalendarDedupeKey(this.resolvePastRecoveryCandidate(wo));
      if (seen.has(key)) return;
      seen.add(key);
      items.push(item);
    });
    return this.summarizePastRecoveryItems(items);
  },

  summarizePastRecoveryItems(items) {
    const list = Array.isArray(items) ? items : [];
    const eligible = list.filter(i => i.classification.status === this.PAST_RECOVERY_REVENUE_CANDIDATE);
    const excluded = list.filter(i => i.classification.status === this.PAST_RECOVERY_EXCLUDED);
    const duplicateSuspects = list.filter(i => i.classification.status === this.PAST_RECOVERY_DUPLICATE);
    const totalAmount = eligible.reduce((sum, i) => sum + Number(this.resolvePastRecoveryCandidate(i.workOrder).estimateAmount || 0), 0);
    return {
      items: list,
      eligible,
      excluded,
      duplicateSuspects,
      eligibleCount: eligible.length,
      excludedCount: excluded.length,
      duplicateSuspectCount: duplicateSuspects.length,
      totalAmount
    };
  },

  detectDuplicates(candidate, workOrders, savedCandidates) {
    const c = this.normalizeCandidate(candidate);
    const key = this.buildDedupeKey(c);
    const workerDedupeKey = String(
      (candidate && candidate.calendarDedupeKey) || c.calendarDedupeKey || ''
    ).trim();
    const candidateCalendarKey = workerDedupeKey || this.buildCalendarDedupeKey(c);
    const list = [...(workOrders || []), ...(savedCandidates || [])];
    const matches = [];
    list.forEach(item => {
      const wo = typeof WorkOrderBrain !== 'undefined'
        ? WorkOrderBrain.normalizeWorkOrder(item)
        : item;
      if (candidateCalendarKey && wo.calendarDedupeKey && wo.calendarDedupeKey === candidateCalendarKey) {
        matches.push({
          type: 'calendarDedupeKey',
          workOrder: wo,
          reason: '同じカレンダー予定が既に取り込み済みです'
        });
        return;
      }
      const itemKey = this.buildDedupeKey({
        scheduledDate: wo.scheduledDate,
        startTime: wo.startTime,
        customerName: wo.customerName,
        serviceText: wo.serviceText,
        address: wo.address,
        title: ''
      });
      if (!itemKey || itemKey !== key) {
        const near = (
          wo.scheduledDate === c.scheduledDate
          && wo.customerName && c.customerName
          && wo.customerName === c.customerName
          && Number(wo.estimateAmount || 0) === Number(c.estimateAmount || 0)
          && (wo.serviceText === c.serviceText || wo.startTime === c.startTime)
        );
        if (near) {
          matches.push({
            type: 'near',
            workOrder: wo,
            reason: this.isCalendarCandidateWorkOrder(wo)
              ? '同じカレンダー予定が既に取り込み済みです'
              : '日付・顧客名・作業内容が近い予定があります'
          });
        }
        return;
      }
      matches.push({
        type: 'exact',
        workOrder: wo,
        reason: this.isCalendarCandidateWorkOrder(wo) ? '同じ候補が既にあります' : '同じ作業予定が既にあります'
      });
    });
    return matches;
  },

  buildImportPreview(parsed, workOrders) {
    const report = parsed || {};
    const calendarOrders = (workOrders || []).filter(w => this.isCalendarCandidateWorkOrder(w));
    const items = (report.candidates || []).map((c, index) => {
      const duplicates = this.detectDuplicates(c, workOrders, calendarOrders);
      return {
        index,
        candidate: c,
        duplicates,
        isDuplicate: duplicates.length > 0,
        warnings: []
      };
    });
    return {
      items,
      count: items.length,
      warnings: report.warnings || [],
      errors: report.errors || [],
      sourceFormat: report.sourceFormat || 'structured',
      rawText: report.rawText || ''
    };
  },

  attachPastRecoveryPreview(preview, revenues, options) {
    if (!preview || !Array.isArray(preview.items)) return preview;
    preview.items = preview.items.map(item => {
      const classification = this.classifyPastRecoveryCandidate(item.candidate, revenues || [], options || {});
      return {
        ...item,
        pastRecovery: classification
      };
    });
    return preview;
  },

  classifyFutureImportCandidate(candidate, today) {
    const c = this.normalizeCandidate(candidate);
    const reasons = [];
    if (!c.scheduledDate) reasons.push('日付なし');
    // v4.10.42: 日時・作業内容・金額が揃えば候補。未確定は状態ラベルのみで除外しない。
    if (!c.startTime) reasons.push('時間なし');
    if (!String(c.serviceText || '').trim()) reasons.push('作業内容なし');
    // v4.10.27: 過去日付は単独では hard-exclude しない（金額あり翌日インポート対応）
    if (!Number(c.estimateAmount || 0)) reasons.push('金額なし');
    if (this.hasFutureImportExcludedWord(c)) reasons.push('対象外ワードあり');
    if (reasons.length) {
      return {
        status: 'excluded',
        label: '対象外',
        reasons,
        savable: false
      };
    }
    return {
      status: 'eligible',
      label: '取り込み対象',
      reasons: [],
      savable: true
    };
  },

  isFutureImportSavable(item, force) {
    if (!item) return false;
    if (item.isPastDate && !force) {
      // v4.10.27: 過去日付でも金額があれば保存可能（翌日インポート対応）
      const amt = item.candidate ? Number(item.candidate.estimateAmount || 0) : 0;
      if (!amt) return false;
    }
    if (item.futureImport && item.futureImport.savable === false) return false;
    if (item.isDuplicate && !force) return false;
    return true;
  },

  summarizeFutureImportPreview(preview) {
    const items = (preview && preview.items) || [];
    let duplicateCount = 0;
    let excludedCount = 0;
    let savableCount = 0;
    items.forEach(item => {
      if (item.isDuplicate) {
        duplicateCount += 1;
        return;
      }
      if (item.futureImport && item.futureImport.status === 'excluded') {
        excludedCount += 1;
        return;
      }
      savableCount += 1;
    });
    return {
      readCount: items.length,
      savedCount: 0,
      duplicateCount,
      excludedCount,
      savableCount,
      revenueRegistered: false
    };
  },

  attachFutureImportPreview(preview, today) {
    if (!preview || !Array.isArray(preview.items)) return preview;
    const t = today || new Date().toISOString().slice(0, 10);
    let pastCount = 0;
    preview.items = preview.items.map(item => {
      const c = this.normalizeCandidate(item.candidate);
      const isPastDate = !!(c.scheduledDate && c.scheduledDate < t);
      if (isPastDate) pastCount += 1;
      const warnings = [...(item.warnings || [])];
      const futureImport = this.classifyFutureImportCandidate(c, t);
      if (futureImport.status === 'excluded') {
        warnings.push(`対象外：${futureImport.reasons.join(' / ')}（保存対象外）`);
      } else if (isPastDate) {
        warnings.push('過去日付の予定です。近未来取り込みでは今日以降を推奨します');
      }
      return { ...item, warnings, isPastDate, futureImport };
    });
    if (pastCount) {
      preview.warnings = [
        ...(preview.warnings || []),
        `過去日付の予定が${pastCount}件あります。今日以降の予定を中心に取り込んでください。`
      ];
    }
    preview.futureImportSummary = this.summarizeFutureImportPreview(preview);
    return preview;
  },

  buildBrowserPrompt(options) {
    const opts = options || {};
    const profile = typeof Storage !== 'undefined' ? Storage.getBusinessProfile() : {};
    const area = (profile && profile.area) || '沖縄南部';
    const period = opts.periodLabel || '今日以降（今週と来週を中心）';
    const pastRecoveryMode = opts.pastRecoveryMode === true;
    return [
      'Googleカレンダー等の予定一覧を確認し、Budil取り込み用フォーマットに整理してください（Budilはカレンダーに直接接続しません）。',
      '',
      '目的：',
      pastRecoveryMode
        ? '過去分復元モードで、作業済みの売上実績候補としてBudilに取り込むため。'
        : '今日以降のカレンダー予定を作業予定としてBudilに取り込むため。作業後は売上確定待ちから売上化します。',
      '',
      '重要：',
      pastRecoveryMode
        ? '過去日付・金額ありの作業済み候補を優先してください。キャンセル・見積のみ・日程調整中は注意欄に明記してください。'
        : '今日以降の予定を優先してください。売上確定ではありません。予定候補として出力してください。',
      '金額が不明な場合は空欄。',
      'キャンセルや仮予定は必ず分かるようにしてください。',
      '',
      `確認期間：${period}`,
      `対象エリア：${area}`,
      '',
      '出力形式（1件ごとに繰り返し）：',
      this.BLOCK_MARKER,
      '日付：YYYY-MM-DD',
      '開始時間：HH:MM',
      '終了時間：HH:MM',
      'タイトル：依頼元／お客様名／作業内容',
      'お客様名：',
      '作業内容：',
      '住所：',
      '依頼元：',
      '予定金額：',
      'メモ：',
      '確度：予定 / 仮 / 確定っぽい / 要確認',
      '注意：',
      '',
      '複数件ある場合は、上記ブロックを件数分繰り返してください。'
    ].join('\n');
  },

  createWorkOrderPayload(candidate, extra) {
    const c = this.normalizeCandidate(candidate);
    const now = new Date().toISOString();
    const meta = this.normalizeCandidateMeta({
      importSource: (extra && extra.importSource) || this.IMPORT_SOURCE,
      sourceType: this.SOURCE_TYPE,
      originalText: c.originalText || (extra && extra.originalText) || '',
      confidence: c.confidence || c.confirmationStatus,
      estimatedAmount: c.estimateAmount ? String(c.estimateAmount) : '',
      importedAt: now,
      confirmedRevenue: false,
      candidateStatus: (extra && extra.candidateStatus) || '候補',
      cautionNote: c.cautionNote
    });
    const area = typeof MapBrain !== 'undefined'
      ? MapBrain.detectAreaFromAddress(c.address)
      : '';
    return {
      customerName: c.customerName,
      address: c.address,
      area,
      source: c.source,
      serviceText: c.serviceText,
      scheduledDate: c.scheduledDate,
      startTime: c.startTime || '09:00',
      endTime: c.endTime || '11:00',
      estimateAmount: c.estimateAmount,
      memo: [c.memo, c.cautionNote ? '注意：' + c.cautionNote : ''].filter(Boolean).join('\n'),
      status: 'tentative',
      candidateMeta: meta,
      calendarDedupeKey: extra && extra.calendarDedupeKey
        ? extra.calendarDedupeKey
        : (c.calendarDedupeKey || this.buildCalendarDedupeKey(c)),
      isDemo: extra && extra.isDemo,
      isTest: extra && extra.isTest
    };
  },

  createRevenuePayloadFromPastCandidate(workOrder) {
    const wo = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(workOrder)
      : workOrder;
    const c = this.normalizeCandidate(wo);
    const now = new Date().toISOString();
    const source = typeof ReceptionBrain !== 'undefined'
      ? ReceptionBrain.matchRevenueSource(c.source)
      : c.source;
    const service = typeof ReceptionBrain !== 'undefined'
      ? ReceptionBrain.matchRevenueService(c.serviceText)
      : c.serviceText;
    const payload = {
      workDate: c.scheduledDate || now.slice(0, 10),
      customerName: c.customerName,
      service,
      source,
      amount: Number(c.estimateAmount || 0),
      status: '確定',
      paymentStatus: '未入金',
      paymentConcern: false,
      memo: [wo.memo, 'Googleカレンダー過去分復元モードから一括売上確定'].filter(Boolean).join('\n'),
      sourceWorkOrderId: wo.id || '',
      sourceCandidateId: wo.id || '',
      calendarDedupeKey: wo.calendarDedupeKey || this.buildCalendarDedupeKey(wo),
      confirmedFrom: 'calendar-past-recovery',
      confirmedAt: now,
      isConfirmedRevenue: true,
      candidateMeta: {
        fromCandidate: true,
        originalEstimateAmount: String(wo.estimateAmount || ''),
        originalImportSource: this.IMPORT_SOURCE,
        pastRecoveryMode: true
      },
      paymentDate: '',
      paymentMethod: ''
    };
    if (typeof RevenueBrain !== 'undefined') {
      const rate = RevenueBrain.getDefaultGrossProfitRateBySource(source);
      if (rate !== null) payload.grossMarginRate = rate;
    }
    return payload;
  },

  buildTaskDedupeKey(candidate, taskType, today) {
    const c = this.normalizeCandidate(candidate);
    const date = today || new Date().toISOString().slice(0, 10);
    return ['calendar-candidate', taskType, date, c.scheduledDate, c.customerName, c.serviceText].join('|');
  },

  createTaskPayload(candidate, taskType, today) {
    const c = this.normalizeCandidate(candidate);
    const date = today || new Date().toISOString().slice(0, 10);
    const type = taskType || 'review';
    let title = '';
    if (type === 'schedule') {
      title = `予定確認：${c.customerName || 'お客様'} ${c.scheduledDate || ''} ${c.startTime || ''}`.trim();
    } else if (type === 'promote') {
      title = `カレンダー予定をBudilへ確定：${c.customerName || 'お客様'}`;
    } else {
      title = `作業予定候補確認：${c.customerName || 'お客様'}`;
    }
    return {
      title,
      targetName: c.customerName || '予定候補',
      priority: type === 'schedule' ? '高' : '中',
      action: title,
      memo: [c.serviceText, c.cautionNote].filter(Boolean).join(' / '),
      dueDate: c.scheduledDate || date,
      status: 'open',
      reason: 'カレンダー予定候補',
      pickupDedupeKey: this.buildTaskDedupeKey(c, type, date)
    };
  },

  summarizeCandidates(workOrders, today) {
    const t = today || new Date().toISOString().slice(0, 10);
    const list = (workOrders || []).filter(w => this.isCalendarCandidateWorkOrder(w));
    const pending = list.filter(w => this.isPendingCandidate(w));
    const review = list.filter(w => this.getCandidateStatus(w) === '要確認');
    const promoted = list.filter(w => this.isPromotedCandidate(w));
    const skipped = list.filter(w => this.getCandidateStatus(w) === 'スキップ');
    const noDate = pending.filter(w => !w.scheduledDate);
    const withAmountNoRevenue = list.filter(w =>
      Number(w.estimateAmount) > 0 && !w.actualRevenueId && this.isPendingCandidate(w)
    );
    const todayCandidates = pending.filter(w => w.scheduledDate === t);
    const duplicateSuspects = pending.filter(w => {
      const dups = this.detectDuplicates(w, workOrders, []);
      return dups.some(d => d.type === 'near' || d.type === 'exact');
    });
    return {
      total: list.length,
      pendingCount: pending.length,
      reviewCount: review.length,
      promotedCount: promoted.length,
      skippedCount: skipped.length,
      noDateCount: noDate.length,
      withAmountNoRevenueCount: withAmountNoRevenue.length,
      todayCount: todayCandidates.length,
      duplicateSuspectCount: duplicateSuspects.length,
      pending,
      review,
      todayCandidates
    };
  },

  buildHomeComment(summary) {
    const s = summary || {};
    if (!s.pendingCount && !s.reviewCount) return '';
    const parts = [];
    if (s.pendingCount) parts.push(`予定候補が${s.pendingCount}件`);
    if (s.reviewCount) parts.push(`要確認${s.reviewCount}件`);
    return parts.join('、') + 'あります。作業予定へ反映する前に、内容・金額・依頼元を確認してください。';
  },

  buildMorningReport(summary) {
    const s = summary || {};
    if (!s.total) return [];
    return [
      '予定候補：',
      `・未反映 ${s.pendingCount || 0}件`,
      `・要確認 ${s.reviewCount || 0}件`,
      `・今日の候補 ${s.todayCount || 0}件`
    ];
  },

  buildWarnings(summary) {
    const s = summary || {};
    const warnings = [];
    if (s.pendingCount) warnings.push(`未反映の予定候補：${s.pendingCount}件`);
    if (s.reviewCount) warnings.push(`要確認の予定候補：${s.reviewCount}件`);
    if (s.withAmountNoRevenueCount) {
      warnings.push(`予定金額あり・売上未確定：${s.withAmountNoRevenueCount}件`);
    }
    if (s.noDateCount) warnings.push(`日付不明の予定候補：${s.noDateCount}件`);
    if (s.duplicateSuspectCount) warnings.push(`重複疑いの予定候補：${s.duplicateSuspectCount}件`);
    return warnings;
  },

  getDiagnosticsCounts(workOrders) {
    const s = this.summarizeCandidates(workOrders);
    return {
      calendarCandidateTotal: s.total,
      pendingCount: s.pendingCount,
      withAmountNoRevenueCount: s.withAmountNoRevenueCount,
      noDateCount: s.noDateCount,
      duplicateSuspectCount: s.duplicateSuspectCount
    };
  },

  formatStatusLabel(status) {
    return status || '候補';
  }
};
