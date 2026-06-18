/**
 * Budil v4.3 - カレンダー/予定候補取り込み番頭
 * カレンダー予定は作業予定候補として扱い、売上確定にはしない。
 */
const CalendarCandidateBrain = {
  IMPORT_SOURCE: 'calendar-paste',
  SOURCE_TYPE: 'work-order-candidate',
  BLOCK_MARKER: '【カレンダー予定】',
  CANDIDATE_STATUSES: ['候補', '作業予定に追加済み', '要確認', 'スキップ'],

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

  isCalendarCandidateWorkOrder(workOrder) {
    const wo = workOrder && typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(workOrder)
      : workOrder;
    return !!(wo && wo.candidateMeta && wo.candidateMeta.importSource === this.IMPORT_SOURCE);
  },

  getCandidateStatus(workOrder) {
    if (!this.isCalendarCandidateWorkOrder(workOrder)) return '';
    return workOrder.candidateMeta.candidateStatus || '候補';
  },

  isPendingCandidate(workOrder) {
    const st = this.getCandidateStatus(workOrder);
    return st === '候補' || st === '要確認';
  },

  isPromotedCandidate(workOrder) {
    return this.getCandidateStatus(workOrder) === '作業予定に追加済み';
  },

  normalizeCandidate(candidate, originalText) {
    const c = candidate && typeof candidate === 'object' ? { ...candidate } : {};
    const amount = this.parseAmount(c.estimateAmount);
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
      cautionNote: String(c.cautionNote || c.caution || '').trim(),
      importSource: this.IMPORT_SOURCE,
      sourceType: this.SOURCE_TYPE,
      originalText: String(originalText || c.originalText || '').trim()
    };
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

  parseCandidateBlock(text) {
    const fields = {};
    const lines = String(text || '').split('\n');
    lines.forEach(line => {
      const field = this.extractLabelValue(line.trim());
      if (!field) return;
      const mapped = this.PASTE_LABELS[field.key];
      if (mapped) fields[mapped] = field.value;
    });
    if (fields.title && !fields.customerName) {
      const fromTitle = this.parseTitleParts(fields.title);
      Object.assign(fields, fromTitle);
    }
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

  detectDuplicates(candidate, workOrders, savedCandidates) {
    const key = this.buildDedupeKey(candidate);
    const list = [...(workOrders || []), ...(savedCandidates || [])];
    const matches = [];
    list.forEach(item => {
      const wo = typeof WorkOrderBrain !== 'undefined'
        ? WorkOrderBrain.normalizeWorkOrder(item)
        : item;
      const itemKey = this.buildDedupeKey({
        scheduledDate: wo.scheduledDate,
        startTime: wo.startTime,
        customerName: wo.customerName,
        serviceText: wo.serviceText,
        address: wo.address,
        title: wo.candidateMeta && wo.candidateMeta.originalText
      });
      if (!itemKey || itemKey !== key) {
        const near = (
          wo.scheduledDate === candidate.scheduledDate
          && wo.customerName && candidate.customerName
          && wo.customerName === candidate.customerName
          && (wo.serviceText === candidate.serviceText || wo.startTime === candidate.startTime)
        );
        if (near) matches.push({ type: 'near', workOrder: wo, reason: '日付・顧客名・作業内容が近い予定があります' });
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

  buildBrowserPrompt(options) {
    const opts = options || {};
    const profile = typeof Storage !== 'undefined' ? Storage.getBusinessProfile() : {};
    const area = (profile && profile.area) || '沖縄南部';
    const period = opts.periodLabel || '今週と来週（または指定された月）';
    return [
      'Googleカレンダーを確認して、指定期間の作業予定をBudil取り込み用に整理してください。',
      '',
      '目的：',
      '予定を売上確定ではなく、作業予定候補としてBudilに取り込むため。',
      '',
      '重要：',
      '売上確定ではありません。予定候補として出力してください。',
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
      importSource: this.IMPORT_SOURCE,
      sourceType: this.SOURCE_TYPE,
      originalText: c.originalText || (extra && extra.originalText) || '',
      confidence: c.confidence,
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
      isDemo: extra && extra.isDemo,
      isTest: extra && extra.isTest
    };
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
