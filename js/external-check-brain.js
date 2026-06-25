/**
 * Budil v4.4.8 - Browser番頭 外部チェック貼り付け番頭
 * 【Budil貼り付け用】ブロックを簡易パースして保存する。売上確定にはしない。
 */
const ExternalCheckBrain = {
  BLOCK_MARKER: '【Budil貼り付け用】',
  SOURCE: 'browser-bantou',
  UNCONFIRMED: '未確認',

  SECTIONS: [
    { key: 'scheduleCandidates', heading: '予定候補' },
    { key: 'demandCandidates', heading: '需要候補' },
    { key: 'analyticsCandidates', heading: 'アナリティクス候補' },
    { key: 'gbpSignals', heading: 'GBP反応' },
    { key: 'adAnomalies', heading: '広告異常' },
    { key: 'todayActions', heading: '今日やること候補' },
    { key: 'noiseCandidates', heading: '注意・ノイズ候補' },
    { key: 'cautions', heading: '注意・未確認' }
  ],

  emptySummary() {
    const summary = { date: this.UNCONFIRMED, targets: this.UNCONFIRMED };
    this.SECTIONS.forEach(({ key }) => {
      summary[key] = [this.UNCONFIRMED];
    });
    return summary;
  },

  isExternalCheckText(text) {
    return String(text || '').includes(this.BLOCK_MARKER);
  },

  extractHeaderValue(text, label) {
    const re = new RegExp(`^${label}[：:]\\s*(.+)$`, 'm');
    const m = String(text || '').match(re);
    return m ? m[1].trim() : '';
  },

  extractSectionBody(text, heading) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`##\\s*${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
    const m = String(text || '').match(re);
    return m ? m[1].trim() : '';
  },

  parseSectionItems(body) {
    const raw = String(body || '').trim();
    if (!raw) return [];
    if (raw === this.UNCONFIRMED || raw === `- ${this.UNCONFIRMED}`) return [];

    const items = [];
    const lines = raw.split('\n');
    let current = '';

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (/^-\s/.test(trimmed)) {
        if (current) items.push(current.trim());
        current = trimmed.replace(/^-\s*/, '');
      } else if (current) {
        current += ' / ' + trimmed;
      } else if (trimmed !== this.UNCONFIRMED) {
        items.push(trimmed);
      }
    });
    if (current) items.push(current.trim());

    return items.filter(item => item && item !== this.UNCONFIRMED);
  },

  parseReport(rawText) {
    const text = String(rawText || '').trim();
    const summary = this.emptySummary();
    const warnings = [];

    if (!text) {
      warnings.push('貼り付け本文が空です');
      return { rawText: text, summary, warnings, valid: false };
    }

    if (!this.isExternalCheckText(text)) {
      warnings.push('【Budil貼り付け用】ブロックが見つかりません（そのまま保存は可能です）');
    }

    const date = this.extractHeaderValue(text, '確認日');
    const targets = this.extractHeaderValue(text, '確認対象');
    if (date) summary.date = date;
    if (targets) summary.targets = targets;

    this.SECTIONS.forEach(({ key, heading }) => {
      const body = this.extractSectionBody(text, heading);
      const items = this.parseSectionItems(body);
      summary[key] = items.length ? items : [this.UNCONFIRMED];
    });

    if (summary.scheduleCandidates.some(i => /売上確定|成約|入金済/.test(i))) {
      warnings.push('予定候補に売上確定らしき表現があります。候補としてのみ扱い、売上集計には含めません。');
    }
    if (summary.gbpSignals.some(i => /売上|成約金額/.test(i) && !/売上確定ではない/.test(i))) {
      warnings.push('GBP反応は集客情報です。売上確定として扱いません。');
    }

    return {
      rawText: text,
      summary,
      warnings,
      valid: true,
      notRevenueNote: '予定候補・GBP反応は売上確定ではありません'
    };
  },

  createReport(rawText) {
    const parsed = this.parseReport(rawText);
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const createdAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    return {
      id: 'extchk-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      createdAt,
      source: this.SOURCE,
      rawText: parsed.rawText,
      summary: parsed.summary,
      warnings: parsed.warnings || [],
      notRevenueNote: parsed.notRevenueNote
    };
  },

  topItems(items, limit) {
    const list = Array.isArray(items) ? items.filter(i => i && i !== this.UNCONFIRMED) : [];
    if (!list.length) return [this.UNCONFIRMED];
    return list.slice(0, limit || 3);
  },

  formatCreatedAt(iso) {
    if (!iso) return '—';
    return iso.slice(0, 16).replace('T', ' ');
  },

  countActionItems(summary) {
    const actions = summary && summary.todayActions ? summary.todayActions : [];
    return actions.filter(i => i && i !== this.UNCONFIRMED).length;
  }
};
