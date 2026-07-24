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

  safeDiv(a, b) {
    const x = Number(a);
    const y = Number(b);
    if (!Number.isFinite(x) || !Number.isFinite(y) || y === 0) return null;
    const r = x / y;
    return Number.isFinite(r) ? r : null;
  },

  formatMetric(value, kind) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    const n = Number(value);
    if (kind === 'yen') return '¥' + Math.round(n).toLocaleString('ja-JP');
    if (kind === 'ratio') return (Math.round(n * 100) / 100).toLocaleString('ja-JP') + '倍';
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
      cost: this.toNonNegNumber(rec.cost),
      impressions: this.toNonNegNumber(rec.impressions),
      clicks: this.toNonNegNumber(rec.clicks),
      averageCpc: this.toFiniteOrNull(rec.averageCpc),
      ctr: this.toFiniteOrNull(rec.ctr),
      cta: this.toNonNegNumber(rec.cta),
      inquiries: this.toNonNegNumber(rec.inquiries),
      contracts: this.toNonNegNumber(rec.contracts),
      sales: this.toNonNegNumber(rec.sales),
      memo: rec.memo == null ? '' : String(rec.memo),
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
    const totals = list.reduce((acc, r) => {
      acc.cost += this.toNonNegNumber(r.cost);
      acc.impressions += this.toNonNegNumber(r.impressions);
      acc.clicks += this.toNonNegNumber(r.clicks);
      acc.inquiries += this.toNonNegNumber(r.inquiries);
      acc.contracts += this.toNonNegNumber(r.contracts);
      acc.sales += this.toNonNegNumber(r.sales);
      acc.cta += this.toNonNegNumber(r.cta);
      return acc;
    }, { cost: 0, impressions: 0, clicks: 0, inquiries: 0, contracts: 0, sales: 0, cta: 0, count: 0 });
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
      ['LP種別', rec.lpType || '—'],
      ['広告種別', rec.adType || '—'],
      ['広告費', this.formatMetric(rec.cost, 'yen')],
      ['表示回数', this.formatMetric(rec.impressions, 'int')],
      ['クリック数', this.formatMetric(rec.clicks, 'int')],
      ['CTA', this.formatMetric(rec.cta, 'int')],
      ['問い合わせ', this.formatMetric(rec.inquiries, 'int')],
      ['成約', this.formatMetric(rec.contracts, 'int')],
      ['売上', this.formatMetric(rec.sales, 'yen')],
      ['メモ', rec.memo || '—']
    ];
  }
};
