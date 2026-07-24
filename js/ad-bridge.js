/**
 * Budil - 広告番頭連携（共通JSON取込・月次集計）
 * 売上データとは分離して budil_ad_performance に保存する。
 */
const AdBridge = {
  SCHEMA_VERSION: 1,
  RECORD_TYPE: 'daily-ad-performance',
  STORAGE_KEY: 'budil_ad_performance',

  REQUIRED_FIELDS: [
    'schemaVersion',
    'source',
    'recordType',
    'recordId',
    'date',
    'campaignKey',
    'campaignName',
    'cost',
    'impressions',
    'clicks',
    'exportedAt'
  ],

  toFiniteOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  },

  toNonNegNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  },

  toNonNegOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  },

  safeDiv(a, b) {
    if (a === null || a === undefined || a === '' ||
        b === null || b === undefined || b === '') return null;
    const x = Number(a);
    const y = Number(b);
    if (!Number.isFinite(x) || !Number.isFinite(y) || y === 0) return null;
    const r = x / y;
    return Number.isFinite(r) ? r : null;
  },

  formatMetric(value, kind) {
    if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '未取得';
    const n = Number(value);
    if (kind === 'yen') return '¥' + Math.round(n).toLocaleString('ja-JP');
    if (kind === 'ratio') return (Math.round(n * 100) / 100).toLocaleString('ja-JP') + '倍';
    if (kind === 'percent') return n.toLocaleString('ja-JP', { maximumFractionDigits: 2 }) + '%';
    if (kind === 'number') return n.toLocaleString('ja-JP', { maximumFractionDigits: 2 });
    if (kind === 'int') return Math.round(n).toLocaleString('ja-JP');
    return String(n);
  },

  extractRecords(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return null;
    if (data.recordType === this.RECORD_TYPE && data.recordId) return [data];
    if (Array.isArray(data.records)) return data.records;
    return null;
  },

  normalizeSearchTerm(item) {
    if (item === null || item === undefined) return null;
    if (typeof item === 'string') {
      const term = item.trim();
      return term ? {
        term,
        matchedKeyword: null,
        matchType: null,
        impressions: null,
        clicks: null,
        cost: null,
        conversions: null,
        period: '',
        fetchedAt: '',
        sourceUrl: ''
      } : null;
    }
    if (typeof item !== 'object' || Array.isArray(item)) return null;
    const term = String(item.term || item.searchTerm || '').trim();
    if (!term) return null;
    return {
      term,
      matchedKeyword: item.matchedKeyword == null ? null : String(item.matchedKeyword),
      matchType: item.matchType == null ? null : String(item.matchType),
      impressions: this.toNonNegOrNull(item.impressions),
      clicks: this.toNonNegOrNull(item.clicks),
      cost: this.toNonNegOrNull(item.cost),
      conversions: this.toNonNegOrNull(item.conversions),
      period: String(item.period || ''),
      fetchedAt: String(item.fetchedAt || ''),
      sourceUrl: String(item.sourceUrl || '')
    };
  },

  summarizeSearchTerms(searchTerms) {
    if (!Array.isArray(searchTerms)) return '未取得';
    if (!searchTerms.length) return '0件';
    return searchTerms.slice(0, 5).map(item => {
      const term = this.normalizeSearchTerm(item);
      if (!term) return '';
      const clicks = this.formatMetric(term.clicks, 'int');
      const cost = this.formatMetric(term.cost, 'yen');
      const keyword = term.matchedKeyword || '未取得';
      return `${term.term}（クリック ${clicks} / 費用 ${cost} / KW ${keyword}）`;
    }).filter(Boolean).join('、') || '0件';
  },

  validateRecord(rec, labelPrefix) {
    const prefix = labelPrefix ? labelPrefix + ': ' : '';
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
      return { ok: false, error: prefix + '共通JSONの形式が正しくありません。' };
    }
    for (let i = 0; i < this.REQUIRED_FIELDS.length; i++) {
      const key = this.REQUIRED_FIELDS[i];
      const val = rec[key];
      if (val === undefined || val === null || val === '') {
        if ((key === 'cost' || key === 'impressions' || key === 'clicks') && val === 0) continue;
        return { ok: false, error: prefix + '必須項目「' + key + '」が不足しています。' };
      }
    }
    if (Number(rec.schemaVersion) !== this.SCHEMA_VERSION) {
      return { ok: false, error: prefix + 'schemaVersion が未対応です（期待値: ' + this.SCHEMA_VERSION + '）。' };
    }
    if (String(rec.recordType) !== this.RECORD_TYPE) {
      return { ok: false, error: prefix + 'recordType が daily-ad-performance ではありません。' };
    }
    return { ok: true, record: rec };
  },

  parseCommonJson(raw) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'JSONの形式が正しくありません。' };
    }
    const list = this.extractRecords(data);
    if (!list || !list.length) {
      return { ok: false, error: '広告番頭の共通JSON（daily-ad-performance）が見つかりません。' };
    }
    const records = [];
    for (let i = 0; i < list.length; i++) {
      const validated = this.validateRecord(list[i], 'records[' + i + ']');
      if (!validated.ok) return validated;
      records.push(validated.record);
    }
    return { ok: true, records };
  },

  normalizeForStore(rec, importSource) {
    const now = new Date().toISOString();
    return {
      schemaVersion: this.SCHEMA_VERSION,
      source: String(rec.source || 'ad-bantou'),
      recordType: this.RECORD_TYPE,
      recordId: String(rec.recordId || '').trim(),
      date: String(rec.date || '').trim(),
      account: rec.account == null ? 'BCサービス' : String(rec.account),
      campaignKey: String(rec.campaignKey || '').trim(),
      campaignName: String(rec.campaignName || '').trim(),
      lpType: rec.lpType == null ? '' : String(rec.lpType),
      adType: rec.adType == null ? 'Google検索広告' : String(rec.adType),
      status: rec.status == null ? '' : String(rec.status),
      budget: this.toNonNegOrNull(rec.budget),
      cost: this.toNonNegOrNull(rec.cost),
      impressions: this.toNonNegOrNull(rec.impressions),
      clicks: this.toNonNegOrNull(rec.clicks),
      averageCpc: this.toFiniteOrNull(rec.averageCpc),
      ctr: this.toFiniteOrNull(rec.ctr),
      conversions: this.toNonNegOrNull(rec.conversions),
      searchTerms: Array.isArray(rec.searchTerms)
        ? rec.searchTerms.map(item => this.normalizeSearchTerm(item)).filter(Boolean)
        : null,
      searchTermPeriod: rec.searchTermPeriod == null ? '' : String(rec.searchTermPeriod),
      searchTermStatus: rec.searchTermStatus == null ? '' : String(rec.searchTermStatus),
      searchTermReason: rec.searchTermReason == null ? '' : String(rec.searchTermReason),
      searchTermSourceUrl: rec.searchTermSourceUrl == null ? '' : String(rec.searchTermSourceUrl),
      cta: this.toNonNegOrNull(rec.cta),
      inquiries: this.toNonNegOrNull(rec.inquiries),
      contracts: this.toNonNegOrNull(rec.contracts),
      sales: this.toNonNegOrNull(rec.sales),
      memo: rec.memo == null ? '' : String(rec.memo),
      fetchedAt: String(rec.fetchedAt || rec.exportedAt || ''),
      sourceUrl: String(rec.sourceUrl || ''),
      exportedAt: String(rec.exportedAt || ''),
      importedAt: now,
      updatedAt: now,
      importSource: importSource || 'clipboard'
    };
  },

  currentMonthPrefix() {
    // JST基準（月末・月初のUTCズレを避ける）
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit'
      }).formatToParts(new Date());
      const y = (parts.find(p => p.type === 'year') || {}).value;
      const m = (parts.find(p => p.type === 'month') || {}).value;
      if (y && m) return y + '-' + m;
    } catch (e) { /* fall through */ }
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  },

  summarizeMonth(records, monthPrefix) {
    const prefix = monthPrefix || this.currentMonthPrefix();
    const list = (Array.isArray(records) ? records : []).filter(r =>
      r && String(r.date || '').slice(0, 7) === prefix
    );
    const fields = ['cost', 'impressions', 'clicks', 'inquiries', 'contracts', 'sales', 'cta'];
    const known = Object.fromEntries(fields.map(field => [field, 0]));
    const totals = list.reduce((acc, r) => {
      fields.forEach(field => {
        const value = this.toNonNegOrNull(r[field]);
        if (value !== null) {
          acc[field] += value;
          known[field] += 1;
        }
      });
      return acc;
    }, { cost: 0, impressions: 0, clicks: 0, inquiries: 0, contracts: 0, sales: 0, cta: 0, count: 0 });
    fields.forEach(field => {
      if (!known[field]) totals[field] = null;
    });
    totals.count = list.length;
    totals.month = prefix;
    totals.cpa = this.safeDiv(totals.cost, totals.inquiries);
    totals.costPerContract = this.safeDiv(totals.cost, totals.contracts);
    totals.roas = this.safeDiv(totals.sales, totals.cost);
    return totals;
  },

  previewRows(rec) {
    return [
      ['日付', rec.date || '—'],
      ['キャンペーン名', rec.campaignName || '—'],
      ['ステータス', rec.status || '未取得'],
      ['日予算', this.formatMetric(rec.budget, 'yen')],
      ['LP種別', rec.lpType || '—'],
      ['広告種別', rec.adType || '—'],
      ['広告費', this.formatMetric(rec.cost, 'yen')],
      ['表示回数', this.formatMetric(rec.impressions, 'int')],
      ['クリック数', this.formatMetric(rec.clicks, 'int')],
      ['CTR', this.formatMetric(rec.ctr, 'percent')],
      ['平均CPC', this.formatMetric(rec.averageCpc, 'yen')],
      ['コンバージョン', this.formatMetric(rec.conversions, 'number')],
      ['検索語句取得期間', rec.searchTermPeriod || '未取得'],
      ['検索語句上位', this.summarizeSearchTerms(rec.searchTerms)],
      ['検索語句未取得理由', rec.searchTermReason || 'なし'],
      ['CTA', this.formatMetric(rec.cta, 'int')],
      ['問い合わせ', this.formatMetric(rec.inquiries, 'int')],
      ['成約', this.formatMetric(rec.contracts, 'int')],
      ['売上', this.formatMetric(rec.sales, 'yen')],
      ['取得元', rec.sourceUrl || '未取得'],
      ['取得日時', rec.fetchedAt || rec.exportedAt || '未取得'],
      ['メモ', rec.memo || '—']
    ];
  }
};
