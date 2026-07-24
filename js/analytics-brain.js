/**
 * Budil v3.9.1 - アナリティクス番頭（手入力 + ブラウザー番頭連携取り込み）
 */
const AnalyticsBrain = {
  PAGE_TYPES: [
    '家庭LP', '完全分解LP', '業務LP', 'AI帳票番頭LP', '記事', 'FAQ', 'ブログ一覧', 'その他'
  ],

  SERVICE_TAGS: [
    'エアコンクリーニング', '完全分解', 'お掃除機能付き', '洗濯機クリーニング',
    '業務用エアコン', 'ハウスクリーニング', 'AI帳票番頭', 'Budil', 'その他'
  ],

  STATUSES: ['open', 'actioned', 'watching', 'archived'],

  STATUS_LABELS: {
    open: '未対応',
    actioned: '打ち手実行済み',
    watching: '様子見',
    archived: '保管'
  },

  SCORE_LABELS: {
    strong: '需要強い',
    grow: '改善すれば伸びる',
    lowTraffic: '読まれているが流入不足',
    bounce: '離脱注意',
    low: '優先度低め'
  },

  normalizeMetricValue(item, key, fallback = 0) {
    const value = item ? item[key] : null;
    if (item && item.importSource === 'browser-bantou' && (value === null || value === undefined || value === '')) {
      return null;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  },

  normalizeRecord(raw) {
    const item = raw && typeof raw === 'object' ? { ...raw } : {};
    const queries = item.searchQueries;
    let searchQueriesText = item.searchQueriesText || '';
    if (Array.isArray(queries)) {
      searchQueriesText = queries.map(q =>
        typeof q === 'string' ? q : [q.query, q.impressions, q.clicks].filter(Boolean).join(' ')
      ).join(', ');
    }
    const rec = {
      id: item.id || '',
      date: item.date || '',
      pageName: item.pageName || '',
      url: item.url || '',
      pageType: this.PAGE_TYPES.includes(item.pageType) ? item.pageType : (item.pageType || 'その他'),
      serviceTag: this.SERVICE_TAGS.includes(item.serviceTag) ? item.serviceTag : (item.serviceTag || 'その他'),
      views: this.normalizeMetricValue(item, 'views'),
      activeUsers: this.normalizeMetricValue(item, 'activeUsers'),
      avgEngagementSeconds: this.normalizeMetricValue(item, 'avgEngagementSeconds'),
      eventCount: this.normalizeMetricValue(item, 'eventCount'),
      bounceRate: this.normalizeMetricValue(item, 'bounceRate'),
      ctaClicks: this.normalizeMetricValue(item, 'ctaClicks'),
      lineClicks: this.normalizeMetricValue(item, 'lineClicks'),
      bookingClicks: this.normalizeMetricValue(item, 'bookingClicks'),
      phoneClicks: this.normalizeMetricValue(item, 'phoneClicks'),
      searchQueriesText,
      searchQueries: Array.isArray(item.searchQueries) ? item.searchQueries : [],
      sourceMemo: item.sourceMemo || '',
      memo: item.memo || '',
      diagnosis: item.diagnosis || '',
      demandScore: Number(item.demandScore) || 0,
      scoreLabel: item.scoreLabel || '',
      recommendedActions: Array.isArray(item.recommendedActions) ? item.recommendedActions : [],
      status: this.STATUSES.includes(item.status) ? item.status : 'open',
      isDemo: !!item.isDemo,
      isTest: !!item.isTest,
      createdAt: item.createdAt || '',
      updatedAt: item.updatedAt || '',
      importSource: item.importSource || '',
      browserReportText: item.browserReportText || '',
      overallComment: item.overallComment || '',
      adDecision: item.adDecision || '',
      recommendedActionText: item.recommendedActionText || ''
    };
    return rec;
  },

  normalizeRecords(list) {
    return (list || []).map(r => this.normalizeRecord(r));
  },

  totalClicks(record) {
    const r = record || {};
    return (Number(r.ctaClicks) || 0) + (Number(r.lineClicks) || 0)
      + (Number(r.bookingClicks) || 0) + (Number(r.phoneClicks) || 0);
  },

  calculateDemandScore(record) {
    const r = record || {};
    let score = 0;
    const views = Number(r.views) || 0;
    const users = Number(r.activeUsers) || 0;
    const engagement = Number(r.avgEngagementSeconds) || 0;
    const events = Number(r.eventCount) || 0;
    const clicks = this.totalClicks(r);
    const bounce = Number(r.bounceRate) || 0;

    if (views >= 100) score += 25;
    else if (views >= 50) score += 18;
    else if (views >= 20) score += 12;
    else if (views >= 5) score += 6;

    if (users >= 50) score += 15;
    else if (users >= 20) score += 10;
    else if (users >= 5) score += 5;

    if (engagement >= 60) score += 15;
    else if (engagement >= 30) score += 10;
    else if (engagement >= 15) score += 5;

    if (events >= 20) score += 10;
    else if (events >= 5) score += 5;

    if (clicks >= 5) score += 15;
    else if (clicks >= 2) score += 10;
    else if (clicks >= 1) score += 5;

    if (bounce <= 40) score += 10;
    else if (bounce <= 55) score += 5;
    else if (bounce >= 70) score -= 8;
    else if (bounce >= 60) score -= 4;

    if ((r.searchQueriesText || '').trim()) score += 3;

    return Math.max(0, Math.min(100, Math.round(score)));
  },

  getScoreLabel(score, record) {
    const r = record || {};
    const bounce = Number(r.bounceRate) || 0;
    const views = Number(r.views) || 0;
    if (score >= 80) return this.SCORE_LABELS.strong;
    if (bounce >= 65 && views >= 20) return this.SCORE_LABELS.bounce;
    if (views < 15 && bounce < 50 && (Number(r.avgEngagementSeconds) || 0) >= 20) {
      return this.SCORE_LABELS.lowTraffic;
    }
    if (score >= 60) return this.SCORE_LABELS.grow;
    if (score >= 40) return this.SCORE_LABELS.grow;
    return this.SCORE_LABELS.low;
  },

  diagnosePage(record) {
    const r = record || {};
    const views = Number(r.views) || 0;
    const bounce = Number(r.bounceRate) || 0;
    const engagement = Number(r.avgEngagementSeconds) || 0;
    const events = Number(r.eventCount) || 0;
    const clicks = this.totalClicks(r);
    const pageType = r.pageType || '';
    const pageName = r.pageName || '';
    const lines = [];

    if (views >= 30 && bounce >= 60) {
      lines.push('見られているが離脱が多いページです。ファーストビュー、料金、CTA、安心材料を改善してください。');
    }
    if (views < 20 && bounce < 50 && views > 0) {
      lines.push('少数だが読まれているページです。内部リンクやSNS投稿で流入を増やす価値があります。');
    }
    if (events >= 10) {
      lines.push('CTA・FAQ・料金導線が機能している可能性があります。導線をさらに強化してください。');
    }
    if (engagement > 0 && engagement < 20 && views >= 10) {
      lines.push('検索意図と内容がズレているか、冒頭で伝わっていない可能性があります。');
    }
    if (views >= 15 && clicks < 2) {
      lines.push('ボタン位置・文言・不安解消・LINE導線を見直してください。');
    }
    if (pageType === 'FAQ' && bounce < 45) {
      lines.push('不安解消ページとして機能している可能性があります。LPや料金ページへの導線を強化してください。');
    }
    if ((pageType === 'AI帳票番頭LP' || /AI帳票|帳票番頭/i.test(pageName)) && views >= 10 && bounce >= 55) {
      lines.push('興味は出ていますが離脱が多いです。無料診断CTA、導入事例、ファーストビューを改善してください。');
    }
    if (!lines.length) {
      if (views === 0) lines.push('データが少ないため、引き続き計測・入力を続けてください。');
      else lines.push('大きな問題は見当たりません。導線とCTAを継続改善しましょう。');
    }
    return lines.join('\n');
  },

  recommendActions(record) {
    const r = record || {};
    const score = r.demandScore || this.calculateDemandScore(r);
    const bounce = Number(r.bounceRate) || 0;
    const views = Number(r.views) || 0;
    const clicks = this.totalClicks(r);
    const pageType = r.pageType || '';
    const pageName = r.pageName || 'このページ';
    const actions = [];

    const push = (type, text) => {
      if (!actions.some(a => a.type === type)) actions.push({ type, text });
    };

    if (bounce >= 60 && views >= 15) {
      push('lp', 'LP改善');
      push('cta', 'CTA文言を改善');
      push('price', '料金表を見直す');
    }
    if (pageType === 'FAQ' && bounce < 50) {
      push('link', '内部リンクを追加');
      push('lp', 'LP改善');
    }
    if (pageType === '記事' || pageType === 'ブログ一覧') {
      push('blog', 'ブログ記事を書く');
      push('sns', 'SNS投稿を作る');
    }
    if (views < 20 && bounce < 50) {
      push('sns', 'SNS投稿を作る');
      push('link', '内部リンクを追加');
    }
    if (clicks < 2 && views >= 10) {
      push('line', 'LINE導線を上げる');
      push('cta', 'CTA文言を改善');
    }
    if (pageType === 'AI帳票番頭LP' || /AI帳票/i.test(pageName)) {
      push('cta', '無料診断CTAを追加');
      push('lp', 'LP改善');
      push('ad_wait', '広告はまだ不要');
    }
    if (eventsLow(r) && views >= 10) {
      push('faq', 'FAQ追加');
      push('case', '施工事例追加');
    }
    if (score >= 75 && bounce < 55 && clicks >= 2) {
      push('ad_test', '小額広告テスト');
    } else if (score < 70 || bounce >= 60) {
      push('ad_wait', '広告はまだ不要');
    }

    if (!actions.length) push('watch', '様子見');

    const summary = this.buildActionSummary(r, actions);
    return { actions, summary };
  },

  buildActionSummary(record, actions) {
    const r = record || {};
    const name = r.pageName || 'ページ';
    const bounce = Number(r.bounceRate) || 0;
    const views = Number(r.views) || 0;
    const types = new Set((actions || []).map(a => a.type));

    if (/AI帳票|帳票番頭/i.test(name) && views >= 10 && bounce >= 55) {
      return `${name}が見られています。ただし直帰率が高いため、まず無料診断CTAとファーストビューを改善してください。広告はまだ不要です。`;
    }
    if (r.pageType === 'FAQ' && bounce < 45) {
      return `${name}の直帰率が低く、不安解消ページとして機能している可能性があります。家庭LPへの導線を強化しましょう。`;
    }
    if (types.has('ad_wait')) {
      return `${name}はLP・導線改善を優先してください。広告は自然需要の勝ち筋が見えてから。`;
    }
    if (types.has('ad_test')) {
      return `${name}は需要が強めです。小額広告テストの候補になります。`;
    }
    const top = (actions || []).slice(0, 2).map(a => a.text).join('・');
    return `${name}：${top || '継続観測'}`;
  },

  enrichRecord(raw) {
    const r = this.normalizeRecord(raw);
    if (r.recommendedActionText && !r.memo) {
      r.memo = r.recommendedActionText;
    } else if (r.recommendedActionText && r.memo && !r.memo.includes(r.recommendedActionText)) {
      r.memo = `${r.memo} / ${r.recommendedActionText}`;
    }
    const demandScore = this.calculateDemandScore(r);
    const scoreLabel = this.getScoreLabel(demandScore, r);
    const diagnosis = raw.diagnosis || this.diagnosePage(r);
    const rec = this.recommendActions({ ...r, demandScore });
    return {
      ...r,
      demandScore,
      scoreLabel,
      diagnosis,
      recommendedActions: rec.actions,
      actionSummary: rec.summary
    };
  },

  enrichAll(records) {
    return this.normalizeRecords(records).map(r => this.enrichRecord(r));
  },

  filterActive(records) {
    return this.enrichAll(records).filter(r => r.status !== 'archived');
  },

  getTopDemandPages(records, limit) {
    return this.filterActive(records)
      .slice()
      .sort((a, b) => b.demandScore - a.demandScore)
      .slice(0, limit || 5);
  },

  getHighBouncePages(records, limit) {
    return this.filterActive(records)
      .filter(r => Number(r.bounceRate) >= 60 && Number(r.views) >= 10)
      .sort((a, b) => b.bounceRate - a.bounceRate)
      .slice(0, limit || 5);
  },

  getContentIdeas(records) {
    const ideas = [];
    this.filterActive(records).forEach(r => {
      if (r.pageType === '記事' && Number(r.views) < 20) {
        ideas.push({ pageName: r.pageName, idea: `SNS/記事追加：${r.serviceTag}の不安訴求`, recordId: r.id });
      }
      if (r.scoreLabel === this.SCORE_LABELS.lowTraffic) {
        ideas.push({ pageName: r.pageName, idea: `SNS投稿：${r.pageName}への導線強化`, recordId: r.id });
      }
      if ((r.searchQueriesText || '').trim()) {
        const q = r.searchQueriesText.split(',')[0].trim();
        if (q) ideas.push({ pageName: r.pageName, idea: `記事作成：${q}向けコンテンツ`, recordId: r.id });
      }
    });
    return ideas.slice(0, 6);
  },

  getAdReadiness(records) {
    const active = this.filterActive(records);
    const strong = active.filter(r => r.demandScore >= 75 && Number(r.bounceRate) < 55);
    const highBounce = active.filter(r => Number(r.bounceRate) >= 60 && Number(r.views) >= 15);
    if (strong.length >= 2) {
      return { ready: 'partial', label: '一部LPで小額広告テスト可', detail: '勝ち筋が見えたページから小さく試す段階です。' };
    }
    if (highBounce.length >= 2) {
      return { ready: 'no', label: 'まだ不要。LP改善を優先', detail: '直帰率が高いページが複数あります。広告前にLP・CTA改善を。' };
    }
    if (active.length === 0) {
      return { ready: 'unknown', label: 'データ不足', detail: 'GA4データを入力すると広告判断ができます。' };
    }
    return { ready: 'no', label: 'まだ不要。LP改善を優先', detail: '自然需要・導線改善を先に進めましょう。' };
  },

  buildContext(records, today) {
    const active = this.filterActive(records);
    const topDemand = this.getTopDemandPages(active, 5);
    const highBounce = this.getHighBouncePages(active, 5);
    const contentIdeas = this.getContentIdeas(active);
    const adReadiness = this.getAdReadiness(active);
    const priority = topDemand[0] || highBounce[0] || null;
    const browserBantou = this.getBrowserBantouMeta(records, today);
    return {
      today: today || new Date().toISOString().slice(0, 10),
      records: active,
      topDemand,
      highBounce,
      contentIdeas,
      adReadiness,
      priority,
      strongCount: active.filter(r => r.demandScore >= 80).length,
      bounceCount: active.filter(r => Number(r.bounceRate) >= 60 && Number(r.views) >= 10).length,
      browserBantou,
      todayConclusion: this.buildTodayConclusion(active, browserBantou)
    };
  },

  selectRecordsForDisplay(records, today) {
    const all = this.normalizeRecords(records);
    const t = today || new Date().toISOString().slice(0, 10);
    const todayBrowser = all.filter(r => r.date === t && r.importSource === 'browser-bantou');
    if (todayBrowser.length) return todayBrowser;
    const todayManual = all.filter(r => r.date === t && r.importSource !== 'browser-bantou');
    if (todayManual.length) return todayManual;
    const weekStart = new Date(t);
    weekStart.setDate(weekStart.getDate() - 6);
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const last7 = all.filter(r => r.date && r.date >= weekStartStr && r.date <= t);
    const real = last7.filter(r => !r.isDemo && !r.isTest);
    if (real.length) return real;
    const demo = last7.filter(r => r.isDemo || r.isTest);
    if (demo.length) return demo;
    const allReal = all.filter(r => !r.isDemo && !r.isTest);
    return allReal.length ? allReal : all;
  },

  getBrowserBantouMeta(records, today) {
    const t = today || new Date().toISOString().slice(0, 10);
    const browser = this.normalizeRecords(records).filter(r => r.importSource === 'browser-bantou');
    const todayBrowser = browser.filter(r => r.date === t);
    const sorted = browser.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const latest = sorted[0] || null;
    const ref = todayBrowser[0] || latest;
    return {
      importCount: browser.length,
      todayCount: todayBrowser.length,
      hasTodayImport: todayBrowser.length > 0,
      overallComment: ref ? (ref.overallComment || '') : '',
      adDecision: ref ? (ref.adDecision || '') : '',
      latestDate: latest ? latest.date : ''
    };
  },

  buildTodayConclusion(records, browserBantou) {
    const bb = browserBantou || {};
    if (bb.hasTodayImport && (bb.overallComment || bb.adDecision)) {
      const parts = [];
      if (bb.overallComment) parts.push(bb.overallComment);
      if (bb.adDecision) parts.push(bb.adDecision);
      return parts.join(' ');
    }
    const active = this.filterActive(records || []);
    const todayManual = active.filter(r => r.importSource !== 'browser-bantou');
    if (todayManual.length && active[0]) {
      const p = active[0];
      return p.actionSummary || p.diagnosis || '';
    }
    if (active.length && active[0]) {
      return active[0].actionSummary || active[0].diagnosis || '';
    }
    return '';
  },

  BROWSER_PAGE_FIELD_MAP: {
    'ページ名': 'pageName',
    'URL': 'url',
    'ページ種別': 'pageType',
    '関連サービス': 'serviceTag',
    '表示回数': 'views',
    'アクティブユーザー': 'activeUsers',
    '平均エンゲージメント秒': 'avgEngagementSeconds',
    'イベント数': 'eventCount',
    '直帰率': 'bounceRate',
    'CTAクリック': 'ctaClicks',
    'LINEクリック': 'lineClicks',
    '予約クリック': 'bookingClicks',
    '電話クリック': 'phoneClicks',
    '検索クエリ': 'searchQueriesText',
    '流入元メモ': 'sourceMemo',
    'メモ': 'memo',
    '推奨アクション': 'recommendedActionText'
  },

  BROWSER_NUMERIC_FIELDS: [
    'views', 'activeUsers', 'avgEngagementSeconds', 'eventCount', 'bounceRate',
    'ctaClicks', 'lineClicks', 'bookingClicks', 'phoneClicks'
  ],

  BROWSER_BANTOU_SAMPLE: `【Budilアナリティクス取り込み】
日付：2026-06-18
全体コメント：FAQページがよく読まれており、家庭LPへの導線強化が有効そうです。AI帳票番頭LPも見られていますが直帰率が高めです。
広告判断：広告はまだ不要。先にLP改善と内部リンク強化を優先。

【ページ1】
ページ名：家庭向けエアコンLP
URL：https://teruya1229.github.io/cursor-test/
ページ種別：家庭LP
関連サービス：エアコンクリーニング
表示回数：120
アクティブユーザー：85
平均エンゲージメント秒：42
イベント数：34
直帰率：58.4
CTAクリック：6
LINEクリック：4
予約クリック：1
電話クリック：1
検索クエリ：沖縄 エアコンクリーニング, 南城市 エアコン掃除
流入元メモ：自然検索とLINE経由
メモ：料金とFAQが見られている可能性
推奨アクション：FAQから家庭LPへの導線強化

【ページ2】
ページ名：AI帳票番頭LP
URL：https://teruya1229.github.io/ai-chouhyou-bantou/
ページ種別：AI帳票番頭LP
関連サービス：AI帳票番頭
表示回数：45
アクティブユーザー：28
平均エンゲージメント秒：18
イベント数：5
直帰率：68.4
CTAクリック：1
LINEクリック：0
予約クリック：0
電話クリック：0
検索クエリ：AI 帳票 自動化, 受付票 AI
流入元メモ：SNS/直接流入
メモ：興味はあるが離脱が多い
推奨アクション：ファーストビューと無料診断CTAを改善

【今日やること候補】
1. AI帳票番頭LPのファーストビューを改善
2. FAQページから家庭LPへの内部リンクを追加
3. エアコン通常清掃の不安訴求SNSを1本作成

【需要番頭に送る候補】
1. FAQページが不安解消ページとして機能している
2. AI帳票番頭LPは見られているが直帰率高め
3. 家庭向けエアコンLPは自然需要あり`,

  parseImportNumber(val) {
    if (val == null || val === '') return 0;
    const s = String(val).replace(/[%％]/g, '').trim();
    const n = parseFloat(s.replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  },

  extractLabelValue(line) {
    const m = String(line || '').match(/^([^：:]+)[：:]\s*(.*)$/);
    if (!m) return null;
    return { key: m[1].trim(), value: m[2].trim() };
  },

  parseNumberedSection(text, sectionName) {
    const re = new RegExp(`【${sectionName}】\\s*([\\s\\S]*?)(?=\\n【|$)`, 'i');
    const m = String(text || '').match(re);
    if (!m) return [];
    const items = [];
    m[1].split('\n').forEach(line => {
      const item = line.replace(/^\s*\d+[\.\)、．]\s*/, '').trim();
      if (item) items.push(item);
    });
    return items;
  },

  MARKETING_SECTION_HEADINGS: [
    '結論', '数値比較', 'Search Console', 'LP別確認', '画像404の影響',
    '原因候補ランキング', '今すぐやる', '後でいい', 'やらない方がいい', '広告について', '最終判断'
  ],

  PERIOD_BLOCK_METRIC_MAP: [
    ['lpSessions', ['LP表示回数', '表示回数', 'アクセス数']],
    ['users', ['ユーザー数', 'ユーザー']],
    ['newUsers', ['新規ユーザー', '新規ユーザー数']],
    ['sessions', ['セッション数', 'セッション']],
    ['events', ['イベント数']],
    ['avgStay', ['平均滞在時間']],
    ['organic', ['Google organic流入', 'organic流入', '自然検索', 'organic']],
    ['cpc', ['Google cpc流入', 'cpc流入', '広告流入', 'cpc']],
    ['direct', ['direct流入', 'direct', '直接流入']]
  ],

  isMarketingCheckText(text) {
    const src = String(text || '');
    return /##\s*(結論|数値比較|今すぐやる)|\d{1,2}\/\d{1,2}[〜～\-]\d{1,2}\/\d{1,2}/.test(src)
      || /LP表示回数|Google organic|Search Console表示|画像404|今すぐやる/.test(src);
  },

  extractMarketingSection(text, heading) {
    const escaped = String(heading || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const src = String(text || '');
    const patterns = [
      new RegExp(`##\\s*${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i'),
      new RegExp(`【${escaped}】\\s*\\n?([\\s\\S]*?)(?=\\n【|\\n##\\s|$)`, 'i')
    ];
    for (const re of patterns) {
      const m = src.match(re);
      if (m && m[1].trim()) return m[1].trim();
    }
    return '';
  },

  parseMarketingSectionItems(body) {
    const raw = String(body || '').trim();
    if (!raw) return [];
    const items = [];
    raw.split('\n').forEach(line => {
      const trimmed = line.trim().replace(/^[・•\-\*]\s*/, '').replace(/^\d+[\.\)、．]\s*/, '').trim();
      if (trimmed && trimmed !== this.KPI_UNCONFIRMED) items.push(trimmed);
    });
    return items;
  },

  matchPeriodMetricKey(label) {
    const key = String(label || '').trim();
    for (const [metricKey, labels] of this.PERIOD_BLOCK_METRIC_MAP) {
      if (labels.some(l => key === l || key.includes(l))) return metricKey;
    }
    return '';
  },

  extractPeriodBlockMetrics(block) {
    const metrics = {};
    String(block || '').split('\n').forEach(line => {
      const cleaned = line.trim().replace(/^[・•\-\*]\s*/, '');
      const field = this.extractLabelValue(cleaned);
      if (!field) return;
      const metricKey = this.matchPeriodMetricKey(field.key);
      if (!metricKey) return;
      if (metricKey === 'avgStay') metrics[metricKey] = field.value;
      else metrics[metricKey] = this.normalizeMetricNumber(field.value);
    });
    return metrics;
  },

  parseComparisonPeriods(text) {
    const periods = [];
    const src = String(text || '');
    const re = /(\d{1,2}\/\d{1,2})[〜～\-](\d{1,2}\/\d{1,2})[：:]\s*\n([\s\S]*?)(?=\n\d{1,2}\/\d{1,2}[〜～\-]|\n##\s|\n【|$)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      periods.push({
        label: `${m[1]}〜${m[2]}`,
        metrics: this.extractPeriodBlockMetrics(m[3])
      });
    }
    return periods;
  },

  parseSearchConsoleFromMarketing(text) {
    const section = this.extractMarketingSection(text, 'Search Console') || String(text || '');
    return {
      impressions: this.extractMetricByLabels(section, [
        'Search Console表示回数', 'SC表示回数', 'Search Console 表示回数', '表示回数'
      ]),
      clicks: this.extractMetricByLabels(section, [
        'クリック数', 'SCクリック数', 'Search Console クリック数', 'Search Console クリック数'
      ]),
      ctr: this.extractMetricByLabels(section, ['CTR', '検索CTR', 'Search Console CTR']),
      avgPosition: this.extractMetricByLabels(section, ['平均掲載順位', '平均順位'])
    };
  },

  parseImage404ByLp(text) {
    const section = this.extractMarketingSection(text, '画像404の影響') || String(text || '');
    const items = [];
    section.split('\n').forEach(line => {
      const trimmed = line.trim().replace(/^[・•\-\*]\s*/, '');
      if (!trimmed || !/画像404|404/.test(trimmed)) return;
      const m = trimmed.match(/(.+?)[：:]\s*(?:画像404[^\d]*)?(\d+)\s*件/);
      if (m) items.push({ pageName: m[1].trim(), count: Number(m[2]) });
    });
    return items.filter(i => i.pageName && Number.isFinite(i.count));
  },

  extractImmediateActions(text) {
    const body = this.extractMarketingSection(text, '今すぐやる');
    if (body) return this.parseMarketingSectionItems(body);
    const alt = this.parseNumberedSection(text, '今すぐやる');
    return alt.length ? alt : [];
  },

  parseMarketingCheckOverlay(text) {
    const src = String(text || '').trim();
    if (!src || !this.isMarketingCheckText(src)) return null;

    const sections = {};
    this.MARKETING_SECTION_HEADINGS.forEach(heading => {
      const body = this.extractMarketingSection(src, heading);
      if (body) sections[heading] = body;
    });

    const periods = this.parseComparisonPeriods(src);
    const currentMetrics = periods.length ? periods[periods.length - 1].metrics : {};
    const compareMetrics = periods.length > 1 ? periods[periods.length - 2].metrics : {};

    return {
      sections,
      periods,
      currentMetrics,
      compareMetrics,
      searchConsole: this.parseSearchConsoleFromMarketing(src),
      image404: this.parseImage404ByLp(src),
      immediateActions: this.extractImmediateActions(src)
    };
  },

  applyMarketingCheckToSnapshot(snapshot, marketingCheck) {
    const mk = marketingCheck || {};
    const metrics = snapshot.metrics || {};
    const trafficSources = snapshot.trafficSources || {};
    const cm = mk.currentMetrics || {};
    const comp = mk.compareMetrics || {};

    if (cm.users != null) metrics.users = cm.users;
    if (cm.newUsers != null) metrics.newUsers = cm.newUsers;
    if (cm.sessions != null) metrics.sessions = cm.sessions;
    if (cm.lpSessions != null) {
      metrics.sessions = cm.lpSessions;
      metrics.accessCount = cm.lpSessions;
    }
    if (cm.events != null) metrics.eventCount = cm.events;
    if (cm.organic != null) {
      trafficSources.organic = cm.organic;
      metrics.searchTraffic = cm.organic;
    }
    if (cm.cpc != null) trafficSources.paid = cm.cpc;
    if (cm.direct != null) trafficSources.direct = cm.direct;
    if (comp.users != null) metrics.compareUsers = comp.users;
    if (comp.lpSessions != null) metrics.compareLpSessions = comp.lpSessions;
    if (comp.events != null) metrics.compareEvents = comp.events;

    const sc = mk.searchConsole || {};
    if (sc.impressions != null) metrics.searchImpressions = sc.impressions;
    if (sc.clicks != null) metrics.searchClicks = sc.clicks;
    if (sc.ctr != null) metrics.searchCtr = sc.ctr;
    if (sc.avgPosition != null) metrics.searchAvgPosition = sc.avgPosition;

    const pages = Array.isArray(snapshot.pages) ? snapshot.pages.slice() : [];
    (mk.image404 || []).forEach(item => {
      if (!pages.some(p => p.pageName === item.pageName)) {
        pages.push({
          pageName: item.pageName,
          url: '',
          views: null,
          clicks: null,
          image404Count: item.count
        });
      }
    });

    const actionTitles = [];
    const addAction = title => {
      const clean = String(title || '').trim();
      if (clean && !actionTitles.includes(clean)) actionTitles.push(clean);
    };
    (snapshot.actionCandidates || []).forEach(addAction);
    (mk.immediateActions || []).forEach(addAction);

    snapshot.metrics = metrics;
    snapshot.trafficSources = trafficSources;
    snapshot.pages = pages;
    snapshot.actionCandidates = actionTitles;
    snapshot.marketingCheck = mk;
    snapshot.hasData = this.hasKnownSnapshotMetric(metrics) || pages.length > 0 || actionTitles.length > 0;
    return snapshot;
  },

  listUnconfirmedSnapshotMetrics(snapshot) {
    const m = (snapshot && snapshot.metrics) || {};
    const labels = [
      ['アクセス数', m.accessCount],
      ['ユーザー数', m.users],
      ['イベント数', m.eventCount],
      ['検索流入(organic)', m.searchTraffic],
      ['cpc流入', (snapshot.trafficSources || {}).paid],
      ['direct流入', (snapshot.trafficSources || {}).direct],
      ['SC表示回数', m.searchImpressions],
      ['SCクリック数', m.searchClicks],
      ['検索CTR', m.searchCtr],
      ['平均掲載順位', m.searchAvgPosition]
    ];
    return labels.filter(([, value]) => value === null || value === undefined || value === '')
      .map(([label]) => label);
  },

  buildParseDiagnostics(parsed) {
    const snapshot = parsed && parsed.snapshot ? parsed.snapshot : this.buildSnapshotFromReport(parsed || {});
    const immediateActions = (parsed && parsed.marketingCheck && parsed.marketingCheck.immediateActions)
      || (parsed && parsed.todayTasks)
      || [];
    const unconfirmed = this.listUnconfirmedSnapshotMetrics(snapshot);
    const nextSteps = [];
    if (unconfirmed.includes('アクセス数')) nextSteps.push('GA4の対象期間・LP表示回数を確認してください');
    if (unconfirmed.some(l => /SC|検索/.test(l))) nextSteps.push('Search Consoleの表示回数・クリック数を確認してください');
    if (unconfirmed.some(l => /organic|cpc|direct/.test(l))) nextSteps.push('流入元（organic/cpc/direct）をGA4で確認してください');
    if (!immediateActions.length) nextSteps.push('「今すぐやる」見出し付きで改善候補を書くと改善リストへ追加しやすくなります');
    if (!nextSteps.length) nextSteps.push('保存後、改善リストと確認履歴を確認してください');
    return {
      canSaveRaw: !!(parsed && String(parsed.rawText || '').trim()),
      extractedActionCount: immediateActions.length,
      unconfirmed,
      nextSteps
    };
  },

  createMarketingCheckHistoryReport(parsed, rawText) {
    const mk = (parsed && parsed.marketingCheck) || {};
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const createdAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const summary = typeof ExternalCheckBrain !== 'undefined'
      ? ExternalCheckBrain.emptySummary()
      : { date: '未確認', targets: '未確認' };
    summary.date = (parsed && parsed.date) || now.toISOString().slice(0, 10);
    summary.targets = '集客チェック';
    const actions = mk.immediateActions || (parsed && parsed.todayTasks) || [];
    if (actions.length) {
      summary.todayActions = actions;
      summary.analyticsCandidates = actions;
    }
    if (mk.sections && mk.sections['結論']) {
      summary.cautions = [String(mk.sections['結論']).split('\n')[0].slice(0, 200)];
    }
    if ((mk.image404 || []).length) {
      summary.noiseCandidates = mk.image404.map(i => `${i.pageName}：画像404 ${i.count}件`);
    }
    return {
      id: 'extchk-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      createdAt,
      source: 'marketing-check',
      rawText: String(rawText || ''),
      summary,
      warnings: (parsed && parsed.warnings) || [],
      marketingCheck: mk,
      notRevenueNote: '集客チェック由来の記録です。売上確定ではありません'
    };
  },

  parseBrowserBantouPages(text) {
    const src = String(text || '');
    const pages = [];
    const blocks = src.split(/【ページ\s*\d+】/i).slice(1);
    blocks.forEach(block => {
      const raw = {};
      const sectionEnd = block.search(/\n【/);
      const body = sectionEnd >= 0 ? block.slice(0, sectionEnd) : block;
      body.split('\n').forEach(line => {
        const field = this.extractLabelValue(line);
        if (!field) return;
        const mapped = this.BROWSER_PAGE_FIELD_MAP[field.key];
        if (mapped) raw[mapped] = field.value;
      });
      if (Object.keys(raw).length) pages.push(raw);
    });
    if (!pages.length) {
      const loose = this.parseLooseBrowserPages(src);
      return loose;
    }
    return pages;
  },

  parseLooseBrowserPages(text) {
    const pages = [];
    const urlRe = /https?:\/\/[^\s）)】\]]+/gi;
    const urls = [...new Set((text.match(urlRe) || []).map(u => u.replace(/[.,;]+$/, '')))];
    urls.forEach((url, i) => {
      const idx = text.indexOf(url);
      const chunk = text.slice(Math.max(0, idx - 200), idx + 400);
      const page = { url };
      const nameMatch = chunk.match(/ページ名[：:]\s*([^\n]+)/);
      if (nameMatch) page.pageName = nameMatch[1].trim();
      else page.pageName = `ページ${i + 1}`;
      const viewsMatch = chunk.match(/表示回数[：:]\s*([\d,.]+)/);
      if (viewsMatch) page.views = viewsMatch[1];
      const bounceMatch = chunk.match(/直帰率[：:]\s*([\d.]+)/);
      if (bounceMatch) page.bounceRate = bounceMatch[1];
      pages.push(page);
    });
    return pages;
  },

  tryParseBrowserJson(text) {
    const src = String(text || '').trim();
    if (!src) return null;
    const tryParse = str => {
      try { return JSON.parse(str); } catch (e) { return null; }
    };
    let data = tryParse(src);
    if (!data) {
      const m = src.match(/\{[\s\S]*\}/);
      if (m) data = tryParse(m[0]);
    }
    if (!data || typeof data !== 'object') return null;
    const pages = Array.isArray(data.pages) ? data.pages.map(p => ({
      pageName: p.pageName || p.page_name || '',
      url: p.url || '',
      pageType: p.pageType || p.page_type || '',
      serviceTag: p.serviceTag || p.service_tag || '',
      views: p.views,
      activeUsers: p.activeUsers || p.active_users,
      avgEngagementSeconds: p.avgEngagementSeconds || p.avg_engagement_seconds,
      eventCount: p.eventCount || p.event_count,
      bounceRate: p.bounceRate || p.bounce_rate,
      ctaClicks: p.ctaClicks || p.cta_clicks,
      lineClicks: p.lineClicks || p.line_clicks,
      bookingClicks: p.bookingClicks || p.booking_clicks,
      phoneClicks: p.phoneClicks || p.phone_clicks,
      searchQueriesText: p.searchQueriesText || p.search_queries_text || '',
      sourceMemo: p.sourceMemo || p.source_memo || '',
      memo: p.memo || '',
      recommendedActionText: p.recommendedActionText || p.recommended_action_text || ''
    })) : [];
    return {
      date: data.date || '',
      overallComment: data.overallComment || data.overall_comment || '',
      adDecision: data.adDecision || data.ad_decision || '',
      pages,
      todayTasks: Array.isArray(data.todayTasks) ? data.todayTasks : (data.today_tasks || []),
      demandCandidates: Array.isArray(data.demandCandidates) ? data.demandCandidates
        : (data.demand_candidates || []),
      sourceFormat: 'json'
    };
  },

  parseBrowserBantouReport(text) {
    const warnings = [];
    const errors = [];
    const src = String(text || '').trim();
    if (!src) {
      return {
        date: '', overallComment: '', adDecision: '', pages: [],
        todayTasks: [], demandCandidates: [], warnings: ['貼り付けテキストが空です'],
        errors: [], sourceFormat: 'empty'
      };
    }

    const jsonResult = this.tryParseBrowserJson(src);
    if (jsonResult && jsonResult.pages && jsonResult.pages.length) {
      jsonResult.warnings = warnings;
      jsonResult.errors = errors;
      if (!jsonResult.todayTasks.length) {
        jsonResult.todayTasks = this.parseNumberedSection(src, '今日やること候補');
      }
      if (!jsonResult.demandCandidates.length) {
        jsonResult.demandCandidates = this.parseNumberedSection(src, '需要番頭に送る候補');
      }
      return jsonResult;
    }

    let date = '';
    let overallComment = '';
    let adDecision = '';
    const headerMatch = src.match(/【Budilアナリティクス取り込み】([\s\S]*?)(?=【ページ|$)/i);
    const header = headerMatch ? headerMatch[1] : src.slice(0, 800);
    header.split('\n').forEach(line => {
      const field = this.extractLabelValue(line);
      if (!field) return;
      if (/^日付$/.test(field.key)) date = field.value.replace(/\//g, '-').slice(0, 10);
      if (/^全体コメント$/.test(field.key)) overallComment = field.value;
      if (/^広告判断$/.test(field.key)) adDecision = field.value;
    });
    if (!date) {
      const dm = src.match(/日付[：:]\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
      if (dm) date = dm[1].replace(/\//g, '-');
    }
    if (!date) date = new Date().toISOString().slice(0, 10);

    let pages = this.parseBrowserBantouPages(src);
    let sourceFormat = pages.length ? 'structured' : 'loose';
    const marketingCheck = this.parseMarketingCheckOverlay(src);
    if (!pages.length) {
      pages = this.parseLooseBrowserPages(src);
      if (pages.length) warnings.push('崩れたテキスト形式のため、拾えた項目のみ取り込みます');
      else if (!marketingCheck) warnings.push('ページデータを認識できませんでした。形式を確認してください');
      else warnings.push('ページブロックは未認識ですが、集客チェック形式として解析しました');
    }

    let todayTasks = this.parseNumberedSection(src, '今日やること候補');
    const demandCandidates = this.parseNumberedSection(src, '需要番頭に送る候補');

    if (marketingCheck) {
      sourceFormat = pages.length ? sourceFormat : 'marketing-check';
      if (marketingCheck.immediateActions.length) {
        todayTasks = [...new Set([...todayTasks, ...marketingCheck.immediateActions])];
      }
      if (!pages.length && marketingCheck.image404.length) {
        pages = marketingCheck.image404.map(item => ({
          pageName: item.pageName,
          url: '',
          views: 0,
          memo: `画像404: ${item.count}件`
        }));
      }
      if (marketingCheck.sections['結論'] && !overallComment) {
        overallComment = String(marketingCheck.sections['結論']).split('\n')[0].trim();
      }
      const adSection = marketingCheck.sections['広告について'] || marketingCheck.sections['最終判断'] || '';
      if (adSection && !adDecision) adDecision = adSection.split('\n')[0].trim();
    }

    pages.forEach((p, i) => {
      if (!(p.pageName || '').trim()) warnings.push(`ページ${i + 1}: ページ名がありません`);
    });

    return {
      date, overallComment, adDecision, pages, todayTasks, demandCandidates,
      warnings, errors, sourceFormat, marketingCheck, rawText: src
    };
  },

  KPI_UNCONFIRMED: '未確認',

  SNAPSHOT_METRIC_LABELS: {
    accessCount: ['対象期間アクセス', 'アクセス数', '総アクセス', 'ページビュー', 'PV', 'LP表示回数', '表示回数'],
    users: ['ユーザー数', 'ユーザー', 'アクティブユーザー'],
    newUsers: ['新規ユーザー', '新規ユーザー数'],
    sessions: ['セッション数', 'セッション', 'LP表示回数'],
    eventCount: ['イベント数'],
    searchTraffic: ['検索流入', '自然検索', 'Organic Search', 'オーガニック検索', 'Google organic流入', 'organic流入', 'organic'],
    inquiryClicks: ['問い合わせ導線クリック', '問い合わせクリック', '導線クリック', 'CTAクリック合計'],
    ctaClicks: ['CTAクリック'],
    lineClicks: ['LINEクリック', 'LINEタップ'],
    phoneTaps: ['電話タップ', '電話クリック'],
    formClicks: ['フォームクリック', 'フォーム送信クリック', '予約クリック', 'フォームクリック'],
    searchImpressions: ['検索表示回数', 'Search Console 表示回数', 'SC表示回数', '合計表示回数', 'Search Console表示回数'],
    searchClicks: ['検索クリック数', 'Search Console クリック数', 'SCクリック数', '合計クリック数', 'クリック数'],
    searchCtr: ['検索CTR', 'Search Console CTR', '平均CTR', 'CTR'],
    searchAvgPosition: ['平均掲載順位', '平均順位'],
    gbpViews: ['Googleビジネス表示', 'GBP表示', 'Googleビジネスプロフィール表示'],
    gbpClicks: ['Googleビジネスクリック', 'GBPクリック', 'Googleビジネスウェブサイトクリック'],
    gbpPhone: ['Googleビジネス電話', 'GBP電話', 'GBP電話タップ', 'Googleビジネス電話タップ']
  },

  SNAPSHOT_TRAFFIC_LABELS: {
    organic: ['Organic Search', '自然検索', 'オーガニック検索', 'Google organic流入', 'organic流入', 'organic'],
    paid: ['Paid Search', '広告流入', '有料検索', 'Google cpc流入', 'cpc流入', 'cpc'],
    direct: ['Direct', '直接流入', 'ダイレクト', 'direct流入', 'direct'],
    referral: ['Referral', '参照元', 'リファラル'],
    social: ['Organic Social', 'SNS流入', 'ソーシャル']
  },

  SNAPSHOT_SECTION_HEADERS: {
    ga4: [/^GA4\s*$/i, /^Google Analytics\s*$/i],
    inquiry: [/^問い合わせ導線\s*$/],
    searchConsole: [/^Search Console\s*$/i, /^サーチコンソール\s*$/i, /^SC\s*$/i],
    gbp: [/^Googleビジネスプロフィール\s*$/, /^Googleビジネス\s*$/, /^GBP\s*$/i],
    lpTop: [/^LP別アクセス上位\s*$/, /^LP別上位\s*$/, /^ページ別アクセス上位\s*$/]
  },

  SNAPSHOT_SECTION_METRICS: {
    ga4: {
      accessCount: ['アクセス数', 'ページビュー', 'PV'],
      users: ['ユーザー数', 'ユーザー', 'アクティブユーザー'],
      newUsers: ['新規ユーザー', '新規ユーザー数'],
      sessions: ['セッション数', 'セッション'],
      searchTraffic: ['検索流入', '自然検索', 'Organic Search', 'オーガニック検索']
    },
    inquiry: {
      lineClicks: ['LINEクリック', 'LINEタップ'],
      phoneTaps: ['電話タップ', '電話クリック'],
      formClicks: ['フォームクリック', 'フォーム送信クリック', '予約クリック'],
      ctaClicks: ['CTAクリック']
    },
    searchConsole: {
      searchImpressions: ['表示回数', 'インプレッション', '合計表示回数'],
      searchClicks: ['クリック数', 'クリック'],
      searchCtr: ['検索CTR', 'CTR', '平均CTR']
    },
    gbp: {
      gbpViews: ['表示', 'プロフィール表示'],
      gbpClicks: ['クリック', 'ウェブサイトクリック'],
      gbpPhone: ['電話', '電話タップ']
    }
  },

  allSnapshotSectionHeaderPatterns() {
    return Object.values(this.SNAPSHOT_SECTION_HEADERS).flat();
  },

  extractSectionBlock(text, headerPatterns) {
    const lines = String(text || '').split('\n');
    const patterns = headerPatterns || [];
    let startIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (patterns.some(re => re.test(line))) {
        startIdx = i + 1;
        break;
      }
    }
    if (startIdx < 0) return '';
    const stopPatterns = this.allSnapshotSectionHeaderPatterns();
    const blockLines = [];
    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && stopPatterns.some(re => re.test(line))) break;
      if (/^【/.test(line)) break;
      blockLines.push(lines[i]);
    }
    return blockLines.join('\n');
  },

  applySectionMetrics(rawText, metrics) {
    const m = metrics || {};
    Object.entries(this.SNAPSHOT_SECTION_METRICS).forEach(([sectionKey, fieldMap]) => {
      const block = this.extractSectionBlock(rawText, this.SNAPSHOT_SECTION_HEADERS[sectionKey]);
      if (!block.trim()) return;
      Object.entries(fieldMap).forEach(([metricKey, labels]) => {
        const value = this.extractMetricByLabels(block, labels);
        if (value !== null) m[metricKey] = value;
      });
    });
    return m;
  },

  parseLpTopAccessSection(text) {
    const block = this.extractSectionBlock(text, this.SNAPSHOT_SECTION_HEADERS.lpTop);
    if (!block.trim()) return [];
    const pages = [];
    block.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const numbered = trimmed.match(/^\d+[\.\)、．]\s*(.+?)[：:]\s*([\d,.]+(?:\.\d+)?)\s*$/);
      if (numbered) {
        pages.push({
          pageName: numbered[1].trim(),
          url: '',
          views: this.normalizeMetricNumber(numbered[2]),
          clicks: null,
          lineClicks: null,
          phoneTaps: null,
          formClicks: null
        });
        return;
      }
      const plain = trimmed.match(/^(.+?)[：:]\s*([\d,.]+(?:\.\d+)?)\s*$/);
      if (plain && !/^(表示|クリック|電話|アクセス)/.test(plain[1])) {
        pages.push({
          pageName: plain[1].trim(),
          url: '',
          views: this.normalizeMetricNumber(plain[2]),
          clicks: null,
          lineClicks: null,
          phoneTaps: null,
          formClicks: null
        });
      }
    });
    return pages.filter(p => p.pageName || p.views !== null);
  },

  stripPageBlocks(text) {
    return String(text || '')
      .replace(/【ページ\s*\d+】[\s\S]*?(?=\n【ページ\s*\d+】|\n【今日やること候補】|\n【需要番頭に送る候補】|$)/gi, '\n')
      .replace(/```[\s\S]*?```/g, '\n');
  },

  normalizeMetricNumber(value) {
    if (value == null) return null;
    let s = String(value)
      .replace(/[％%]/g, '')
      .replace(/件|回|人|ユーザー|セッション|クリック|表示|タップ|約|およそ|以上/g, '')
      .trim();
    if (!s || /未確認|不明|なし|n\/a|na|[-—]/i.test(s)) return null;
    const m = s.match(/-?\d+(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?/);
    if (!m) return null;
    const n = Number(m[0].replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  },

  extractMetricByLabels(text, labels) {
    const src = String(text || '');
    for (const label of labels || []) {
      const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?:^|\\n)[ \\t]*(?:[-・*][ \\t]*)?${escaped}[ \\t]*[：:][ \\t]*([^\\n]*)`, 'i');
      const m = src.match(re);
      if (m) {
        const n = this.normalizeMetricNumber(m[1]);
        if (n !== null) return n;
      }
    }
    return null;
  },

  extractPeriod(text, fallbackDate) {
    const src = String(text || '');
    const label = (src.match(/(?:対象期間|期間)[：:]\s*([^\n]+)/) || [])[1] || '';
    const dates = [...src.matchAll(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/g)]
      .map(m => `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`);
    return {
      periodLabel: label.trim() || (fallbackDate ? `${fallbackDate}確認分` : ''),
      periodStart: dates[0] || '',
      periodEnd: dates.length > 1 ? dates[dates.length - 1] : (dates[0] || fallbackDate || '')
    };
  },

  hashText(text) {
    const src = String(text || '');
    let hash = 2166136261;
    for (let i = 0; i < src.length; i++) {
      hash ^= src.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return ('0000000' + (hash >>> 0).toString(16)).slice(-8);
  },

  sumKnown(values) {
    const nums = (values || []).filter(v => v !== null && v !== undefined && Number.isFinite(Number(v)));
    if (!nums.length) return null;
    return nums.reduce((sum, v) => sum + Number(v), 0);
  },

  hasKnownSnapshotMetric(metrics) {
    return Object.values(metrics || {}).some(v => v !== null && v !== undefined && v !== '');
  },

  buildSnapshotFromReport(report) {
    const r = report || {};
    const rawText = r.rawText || '';
    const headerText = this.stripPageBlocks(rawText);
    const metrics = {};
    Object.entries(this.SNAPSHOT_METRIC_LABELS).forEach(([key, labels]) => {
      metrics[key] = this.extractMetricByLabels(headerText, labels);
    });
    this.applySectionMetrics(rawText, metrics);

    const readPageMetric = value => this.normalizeMetricNumber(value);
    let pages = (r.pages || []).map(p => {
      const views = readPageMetric(p.views);
      const cta = readPageMetric(p.ctaClicks);
      const line = readPageMetric(p.lineClicks);
      const booking = readPageMetric(p.bookingClicks);
      const phone = readPageMetric(p.phoneClicks);
      const clicks = this.sumKnown([cta, line, booking, phone]);
      return {
        pageName: (p.pageName || '').trim(),
        url: (p.url || '').trim(),
        views,
        clicks,
        lineClicks: line,
        phoneTaps: phone,
        formClicks: booking
      };
    }).filter(p => p.pageName || p.url || p.views !== null || p.clicks !== null);

    const lpTopPages = this.parseLpTopAccessSection(rawText);
    if (lpTopPages.length) {
      const blockPagesHaveViews = pages.some(p => p.views !== null && p.views > 0);
      if (!pages.length || !blockPagesHaveViews) pages = lpTopPages;
    }

    if (metrics.accessCount === null && pages.length) {
      metrics.accessCount = pages.reduce((sum, p) => sum + (Number(p.views) || 0), 0);
    }
    if (metrics.lineClicks === null && pages.length) {
      metrics.lineClicks = this.sumKnown(pages.map(p => p.lineClicks));
    }
    if (metrics.phoneTaps === null && pages.length) {
      metrics.phoneTaps = this.sumKnown(pages.map(p => p.phoneTaps));
    }
    if (metrics.formClicks === null && pages.length) {
      metrics.formClicks = this.sumKnown(pages.map(p => p.formClicks));
    }
    if (metrics.inquiryClicks === null) {
      metrics.inquiryClicks = this.sumKnown([
        metrics.ctaClicks, metrics.lineClicks, metrics.phoneTaps, metrics.formClicks
      ]);
    }

    const trafficSources = {};
    Object.entries(this.SNAPSHOT_TRAFFIC_LABELS).forEach(([key, labels]) => {
      trafficSources[key] = this.extractMetricByLabels(headerText, labels);
    });
    if (metrics.searchTraffic === null && trafficSources.organic !== null) {
      metrics.searchTraffic = trafficSources.organic;
    }

    const period = this.extractPeriod(rawText, r.date || '');
    const gbp = {
      views: metrics.gbpViews,
      clicks: metrics.gbpClicks,
      phone: metrics.gbpPhone
    };
    const searchConsole = {
      impressions: metrics.searchImpressions,
      clicks: metrics.searchClicks,
      ctr: metrics.searchCtr
    };
    const topPages = pages.slice().sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
    const warnings = [];
    if (!this.hasKnownSnapshotMetric(metrics) && !pages.length) warnings.push('KPI数値を抽出できませんでした');
    if (metrics.accessCount !== null && pages.length && !this.extractMetricByLabels(headerText, this.SNAPSHOT_METRIC_LABELS.accessCount)) {
      warnings.push('アクセス数はページ別表示回数の合計から算出しています');
    }
    const insights = this.buildSnapshotInsights({ metrics, pages: topPages, gbp, searchConsole, rawText });
    let snapshot = {
      source: 'paste-import',
      periodLabel: period.periodLabel,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      rawTextHash: this.hashText(rawText),
      metrics,
      pages: topPages,
      trafficSources,
      gbp,
      searchConsole,
      warnings,
      insights,
      actionCandidates: this.buildSnapshotActionCandidates({ metrics, pages: topPages, gbp, searchConsole, rawText }),
      hasData: this.hasKnownSnapshotMetric(metrics) || pages.length > 0
    };
    if (r.marketingCheck) snapshot = this.applyMarketingCheckToSnapshot(snapshot, r.marketingCheck);
    return snapshot;
  },

  buildSnapshotInsights(snapshot) {
    const s = snapshot || {};
    const m = s.metrics || {};
    const pages = s.pages || [];
    const lines = [];
    const access = m.accessCount;
    const search = m.searchTraffic;
    const inquiry = m.inquiryClicks;
    const gbpPhone = m.gbpPhone;
    const add = text => { if (text && !lines.includes(text)) lines.push(text); };

    if (access === null) add('アクセス数は未確認です。GA4の対象期間アクセスを確認してください。');
    else if (access > 0) add('アクセスは確認できています。問い合わせ導線クリックとセットで見てください。');
    else add('対象期間のアクセスが0または非常に少ない可能性があります。計測期間とGA4設定を確認してください。');

    if (search === null) add('検索流入は未確認です。Search ConsoleまたはGA4の自然検索を確認してください。');
    else if (search > 0) add('検索流入はあります。検索語句とLPの問い合わせ導線を確認しましょう。');
    else add('検索流入が少ない可能性があります。検索語句、タイトル、記事導線を確認してください。');

    if (inquiry === null) add('問い合わせ導線クリックは未確認です。LINE・電話・フォームのクリック計測を確認してください。');
    else if (access && access >= 20 && inquiry < 2) add('アクセスはありますが、問い合わせ導線クリックが少ない可能性があります。LPのCTAを確認してください。');
    else if (inquiry > 0) add('問い合わせ導線クリックは確認できています。どの導線が強いかを見て伸ばしましょう。');

    if (gbpPhone === null) add('GBP電話タップは未確認です。Googleビジネスプロフィールの行動を確認してください。');
    else if ((m.gbpViews || 0) > 0 && gbpPhone < 1) add('GBP表示はありますが、電話タップが少ない可能性があります。口コミ・投稿・電話導線を確認してください。');
    else if (gbpPhone > 0) add('GBPからの電話タップが確認できています。口コミ依頼と投稿を継続しましょう。');

    if (pages.length >= 2 && pages[0].views > Math.max(1, pages[1].views * 3)) {
      add(`LP別アクセスが「${pages[0].pageName || '上位LP'}」に偏っています。上位LPから問い合わせ導線への流れを優先確認してください。`);
    }
    if (/異常|急増|急減|海外|スパム|ノイズ|落ちて|減少/.test(String(s.rawText || ''))) {
      add('貼り付け内容に異常・ノイズの記述があります。期間・流入元・海外アクセスを確認してください。');
    } else {
      add('大きな異常記述は見当たりません。未確認項目を埋めながら継続観測してください。');
    }
    return lines.slice(0, 6);
  },

  buildSnapshotActionCandidates(snapshot) {
    const s = snapshot || {};
    const m = s.metrics || {};
    const titles = [];
    const add = title => { if (title && !titles.includes(title)) titles.push(title); };
    if (m.inquiryClicks === null || ((m.accessCount || 0) >= 20 && (m.inquiryClicks || 0) < 2)) {
      add('問い合わせ導線クリックを確認する');
      add('LPのCTAを確認する');
    }
    if (m.searchTraffic === null || (m.searchTraffic || 0) === 0) {
      add('検索語句を確認する');
    }
    if ((m.gbpViews || 0) > 0 && (m.gbpPhone || 0) < 1) {
      add('Google口コミ依頼をする');
      add('Googleビジネス投稿を作る');
    }
    if (/異常|急減|減少|落ちて|ノイズ|海外/.test(String(s.rawText || ''))) {
      add('アクセス減少の原因を確認する');
    }
    if ((m.accessCount || 0) > 0 && (m.inquiryClicks || 0) > 0) {
      add('広告再開を検討する');
    }
    return titles.slice(0, 6);
  },

  normalizeImportedAnalyticsRecord(raw, reportMeta) {
    const meta = reportMeta || {};
    const numeric = {};
    this.BROWSER_NUMERIC_FIELDS.forEach(f => {
      numeric[f] = this.parseImportNumber(raw[f]);
    });
    const reportText = meta.browserReportText || '';
    const summaryText = reportText.length > 500 ? reportText.slice(0, 500) + '…' : reportText;
    const payload = {
      date: meta.date || raw.date || new Date().toISOString().slice(0, 10),
      pageName: (raw.pageName || '').trim(),
      url: (raw.url || '').trim(),
      pageType: raw.pageType || 'その他',
      serviceTag: raw.serviceTag || 'その他',
      views: numeric.views,
      activeUsers: numeric.activeUsers,
      avgEngagementSeconds: numeric.avgEngagementSeconds,
      eventCount: numeric.eventCount,
      bounceRate: numeric.bounceRate,
      ctaClicks: numeric.ctaClicks,
      lineClicks: numeric.lineClicks,
      bookingClicks: numeric.bookingClicks,
      phoneClicks: numeric.phoneClicks,
      searchQueriesText: raw.searchQueriesText || '',
      sourceMemo: raw.sourceMemo || '外部確認レポート',
      memo: raw.memo || '',
      recommendedActionText: raw.recommendedActionText || '',
      status: 'open',
      importSource: 'browser-bantou',
      browserReportText: summaryText,
      overallComment: meta.overallComment || '',
      adDecision: meta.adDecision || ''
    };
    return this.enrichRecord(payload);
  },

  findDuplicateCandidates(records, existingRecords) {
    const duplicates = [];
    (records || []).forEach(r => {
      const match = (existingRecords || []).find(e =>
        e.date === r.date && (
          ((r.url || '').trim() && (e.url || '').trim() && e.url === r.url)
          || (!(r.url || '').trim() && e.pageName === r.pageName)
          || ((e.pageName || '') === (r.pageName || '') && (r.url || '') === (e.url || ''))
        )
      );
      if (match) {
        duplicates.push({ record: r, existing: match });
      }
    });
    return duplicates;
  },

  validateImportedRecords(records, existingRecords) {
    const warnings = [];
    const errors = [];
    (records || []).forEach((r, i) => {
      const label = r.pageName || `ページ${i + 1}`;
      if (!(r.pageName || '').trim()) warnings.push(`${label}: ページ名がありません`);
      if (!(r.url || '').trim()) warnings.push(`${label}: URLがありません`);
      const missingNumeric = this.BROWSER_NUMERIC_FIELDS.filter(f => !r[f] && r[f] !== 0).length;
      if (missingNumeric >= 5) warnings.push(`${label}: 数値項目の欠落が多いです`);
    });
    const duplicates = this.findDuplicateCandidates(records, existingRecords);
    duplicates.forEach(d => {
      warnings.push(`重複候補: ${d.record.pageName}（${d.record.date}）`);
    });
    if (!(records || []).length) errors.push('保存できるページがありません');
    return { warnings, errors, duplicates };
  },

  buildImportPreview(parsed, existingRecords) {
    const report = parsed || {};
    const meta = {
      date: report.date,
      overallComment: report.overallComment || '',
      adDecision: report.adDecision || '',
      browserReportText: report.rawText || ''
    };
    const records = (report.pages || []).map(p => this.normalizeImportedAnalyticsRecord(p, meta));
    const snapshot = this.buildSnapshotFromReport(report);
    const validation = this.validateImportedRecords(records, existingRecords);
    const hasMarketingData = !!(report.marketingCheck && (
      report.marketingCheck.immediateActions.length
      || Object.keys(report.marketingCheck.currentMetrics || {}).length
      || (report.marketingCheck.image404 || []).length
    ));
    const errors = (snapshot.hasData || hasMarketingData)
      ? validation.errors.filter(e => e !== '保存できるページがありません')
      : validation.errors;
    const diagnostics = this.buildParseDiagnostics({ ...report, snapshot });
    return {
      date: report.date,
      overallComment: report.overallComment || '',
      adDecision: report.adDecision || '',
      pages: records,
      pageCount: records.length,
      snapshot,
      todayTasks: report.todayTasks || [],
      demandCandidates: report.demandCandidates || [],
      marketingCheck: report.marketingCheck || null,
      immediateActions: (report.marketingCheck && report.marketingCheck.immediateActions) || [],
      warnings: [...(report.warnings || []), ...validation.warnings],
      errors: [...(report.errors || []), ...errors],
      duplicates: validation.duplicates,
      sourceFormat: report.sourceFormat || 'structured',
      parseDiagnostics: diagnostics,
      canSave: records.length > 0 || snapshot.hasData || diagnostics.canSaveRaw
    };
  },

  buildBrowserBantouPrompt(settings) {
    const profile = settings && settings.businessProfile
      ? (typeof Storage !== 'undefined' ? Storage.normalizeBusinessProfile(settings.businessProfile) : settings.businessProfile)
      : null;
    const businessName = (profile && profile.businessName) || 'BCサービス';
    const area = (profile && profile.area) || '沖縄南部';
    const mainServices = (profile && profile.mainServices && profile.mainServices.length)
      ? profile.mainServices.join('、')
      : 'エアコンクリーニング、完全分解、洗濯機クリーニング';
    const lineUrl = (profile && profile.lineUrl) || '';
    const googleReviewUrl = (profile && profile.googleReviewUrl) || '';
    const memo = (profile && profile.memo) || '';

  const profileLines = [];
    if (lineUrl) profileLines.push(`LINE URL：${lineUrl}`);
    if (googleReviewUrl) profileLines.push(`Google口コミURL：${googleReviewUrl}`);
    if (memo) profileLines.push(`メモ：${memo}`);

    return `あなたはBudil用の外部確認レポート作成担当です。
今日の目的は、GA4 / Search Console / Googleビジネスプロフィール / 必要なら広告状況を確認し、Budilに貼り付けられる形式で日次アナリティクスレポートを出すことです。

対象事業：
${businessName}

対象地域：
${area}

主力サービス：
${mainServices}
${profileLines.length ? '\n' + profileLines.join('\n') : ''}

確認対象：
1. GA4のページ別データ
2. Search Consoleの検索クエリ
3. Googleビジネスプロフィールの表示・行動
4. 必要ならGoogle広告の表示/クリック/費用
5. LPや記事の見られ方

重点ページ：
- 家庭向けエアコンLP
- 完全分解LP
- 業務用LP
- AI帳票番頭LP
- Budil販売/紹介ページ
- FAQページ
- ブログ/記事ページ
- 洗濯機クリーニング関連ページ

確認してほしいこと：
- 対象期間
- アクセス数
- ユーザー数
- 新規ユーザー
- セッション数
- 検索流入
- どのページが見られているか
- どのページの直帰率が高いか
- どのページの滞在/イベント/CTAが良いか
- LINE/予約/電話クリックがあるか
- フォームクリックがあるか
- Search Consoleの表示回数/クリック数/検索CTR
- Googleビジネスプロフィールの表示/クリック/電話
- どの検索クエリが伸びているか
- どのサービスに需要が出ていそうか
- 広告を使うべきか、まだLP改善を優先すべきか
- 今日やるべきことは何か

必ず最後に、以下の形式で出力してください。

【Budilアナリティクス取り込み】
日付：YYYY-MM-DD
対象期間：
アクセス数：
ユーザー数：
新規ユーザー：
セッション数：
検索流入：
LINEクリック：
電話タップ：
フォームクリック：
Search Console 表示回数：
Search Console クリック数：
検索CTR：
Googleビジネス表示：
Googleビジネスクリック：
Googleビジネス電話：
気づいた異常：
全体コメント：
広告判断：

【ページ1】
ページ名：
URL：
ページ種別：
関連サービス：
表示回数：
アクティブユーザー：
平均エンゲージメント秒：
イベント数：
直帰率：
CTAクリック：
LINEクリック：
予約クリック：
電話クリック：
検索クエリ：
流入元メモ：
メモ：
推奨アクション：

【ページ2】
ページ名：
URL：
ページ種別：
関連サービス：
表示回数：
アクティブユーザー：
平均エンゲージメント秒：
イベント数：
直帰率：
CTAクリック：
LINEクリック：
予約クリック：
電話クリック：
検索クエリ：
流入元メモ：
メモ：
推奨アクション：

【今日やること候補】
1.
2.
3.

【需要番頭に送る候補】
1.
2.
3.

注意：
分からない数値は空欄または0でOK。
推測した場合はメモに「推測」と書いてください。
広告費を使う判断は慎重にしてください。
現段階では、広告より先に自然需要・LP改善・SNS/記事改善を優先します。`;
  },

  createBrowserBantouTaskPayload(title, date) {
    const t = date || new Date().toISOString().slice(0, 10);
    const clean = (title || '').trim();
    return {
      title: clean,
      targetName: '外部確認レポート',
      priority: '中',
      action: clean,
      memo: '外部確認レポートの今日やること候補から追加',
      dueDate: t,
      status: 'open',
      reason: '外部確認/アナリティクス',
      pickupDedupeKey: ['browser-bantou', t, clean].join('|')
    };
  },

  createBrowserBantouDemandPayload(candidate, date) {
    const t = date || new Date().toISOString().slice(0, 10);
    const topic = (candidate || '').trim();
    return {
      date: t,
      source: '外部確認/アナリティクス',
      topic,
      summary: topic,
      demandScore: 55,
      relatedServices: [],
      suggestedActions: [
        { type: 'post', title: 'SNS/記事で需要を拾う', channel: 'Instagram' },
        { type: 'sales', title: 'LP・導線改善を検討' },
        { type: 'ad', title: '広告は保留（LP改善優先）' }
      ],
      memo: '外部確認レポートの需要ピックアップ候補から送付',
      status: 'open'
    };
  },

  buildHomeComment(ctx) {
    const c = ctx || {};
    const bb = c.browserBantou || {};
    if (bb.hasTodayImport) {
      const parts = [];
      if (bb.overallComment) parts.push(bb.overallComment);
      else if (c.todayConclusion) parts.push(c.todayConclusion);
      if (bb.adDecision) parts.push(bb.adDecision);
      if (parts.length) {
        return `外部確認：${parts.join(' ')}`;
      }
    }
    if (c.todayConclusion) return c.todayConclusion;
    const p = c.priority;
    if (!p) return '';
    if (/AI帳票|帳票番頭/i.test(p.pageName) && Number(p.bounceRate) >= 55) {
      return `${p.pageName}が見られていますが直帰率が高めです。広告より先にファーストビューと無料診断CTAを改善してください。`;
    }
    if (p.pageType === 'FAQ' && Number(p.bounceRate) < 45) {
      return `${p.pageName}の直帰率が低く、不安解消ページとして機能している可能性があります。家庭LPへの導線を強化しましょう。`;
    }
    if (p.actionSummary) return p.actionSummary;
    return `${p.pageName}（需要スコア${p.demandScore}）を確認しましょう。`;
  },

  buildMorningLines(ctx) {
    const c = ctx || {};
    const lines = [];
    const bb = c.browserBantou || {};
    if (bb.hasTodayImport) {
      lines.push('外部確認レポート取り込み済み');
    }
    lines.push(`需要強いページ ${c.strongCount || 0}件`);
    lines.push(`離脱注意ページ ${c.bounceCount || 0}件`);
    if (bb.adDecision) {
      lines.push(`広告判断：${bb.adDecision}`);
    } else if (c.adReadiness) {
      lines.push(`広告判断：${c.adReadiness.label}`);
    }
    if (c.priority && !bb.hasTodayImport) {
      const act = (c.priority.recommendedActions || [])[0];
      lines.push(`今日の優先：${act ? act.text + '（' + c.priority.pageName + '）' : c.priority.pageName}`);
    }
    return lines;
  },

  buildWarnings(ctx) {
    const warnings = [];
    const c = ctx || {};
    (c.highBounce || []).slice(0, 2).forEach(r => {
      warnings.push(`離脱注意：${r.pageName}（直帰率${r.bounceRate}%）`);
    });
    if (c.adReadiness && c.adReadiness.ready === 'no' && (c.records || []).length) {
      warnings.push('広告はまだ不要。LP改善を優先');
    }
    return warnings;
  },

  buildReportSection(ctx, periodLabel) {
    const c = ctx || {};
    const lines = [];
    lines.push('■ アナリティクス状況');
    if (periodLabel) lines.push(`対象期間：${periodLabel}`);
    const bb = c.browserBantou || {};
    if (bb.importCount) {
      lines.push(`外部レポート取り込み：${bb.importCount}件`);
      if (bb.overallComment) lines.push(`全体コメント：${bb.overallComment}`);
      if (bb.adDecision) lines.push(`広告判断：${bb.adDecision}`);
    }
    lines.push(`ページ別データ：${(c.records || []).length}件`);
    lines.push(`需要強いページ：${c.strongCount || 0}件`);
    lines.push(`離脱注意ページ：${c.bounceCount || 0}件`);
    if (!bb.adDecision && c.adReadiness) {
      lines.push(`広告判断：${c.adReadiness.label} — ${c.adReadiness.detail}`);
    }
    lines.push('');
    const browserPages = (c.records || []).filter(r => r.importSource === 'browser-bantou').slice(0, 5);
    if (browserPages.length) {
      lines.push('外部確認由来の改善候補：');
      browserPages.forEach(r => {
        const action = r.recommendedActionText || (r.recommendedActions || [])[0]?.text || r.actionSummary || '継続観測';
        lines.push(`・${r.pageName}：${action}`);
      });
      lines.push('');
    }
    const top = (c.topDemand || []).slice(0, 3);
    if (top.length) {
      lines.push('需要スコア上位：');
      top.forEach(r => lines.push(`・${r.pageName}：${r.demandScore}点（${r.scoreLabel}）`));
      lines.push('');
    }
    const bounce = (c.highBounce || []).slice(0, 3);
    if (bounce.length) {
      lines.push('離脱注意ページ：');
      bounce.forEach(r => lines.push(`・${r.pageName}：直帰率${r.bounceRate}%`));
      lines.push('');
    }
    const ideas = (c.contentIdeas || []).slice(0, 3);
    if (ideas.length) {
      lines.push('記事/SNS候補：');
      ideas.forEach(i => lines.push(`・${i.idea}`));
      lines.push('');
    }
    if (c.priority && c.priority.actionSummary) {
      lines.push(`今週の打ち手：${c.priority.actionSummary}`);
    }
    return lines.join('\n');
  },

  createTaskPayload(record, action, today) {
    const r = record || {};
    const act = action || {};
    const t = today || new Date().toISOString().slice(0, 10);
    const title = act.taskTitle || `${act.text || '改善'}：${r.pageName || 'ページ'}`;
    const type = act.type || 'general';
    return {
      title,
      targetName: r.pageName || 'アナリティクス',
      priority: type === 'ad_wait' || type === 'lp' || type === 'cta' ? '高' : '中',
      action: title,
      memo: r.actionSummary || r.diagnosis || '',
      dueDate: t,
      status: 'open',
      reason: 'アナリティクス番頭',
      analyticsRecordId: r.id || '',
      actionType: type,
      pickupDedupeKey: ['analytics', t, r.id || 'none', type, title].join('|')
    };
  },

  createDemandPickupPayload(record) {
    const r = record || {};
    const topic = `${r.pageName}が見られているが直帰率が高い`;
    const altTopic = r.pageName ? `${r.pageName}（需要スコア${r.demandScore}）` : 'アナリティクス需要';
    const finalTopic = Number(r.bounceRate) >= 55 && Number(r.views) >= 10 ? altTopic : `${r.pageName || 'ページ'}のアナリティクス需要`;
    const suggestedAction = (r.recommendedActions || []).map(a => a.text).slice(0, 2).join('、')
      || 'LP・導線改善';
    const score = Math.min(99, Math.max(40, r.demandScore || 50));
    return {
      date: r.date || new Date().toISOString().slice(0, 10),
      source: 'GA4手入力',
      topic: finalTopic,
      summary: `${r.diagnosis || ''} ${r.actionSummary || ''}`.trim(),
      demandScore: score,
      relatedServices: r.serviceTag && r.serviceTag !== 'その他' ? [r.serviceTag] : [],
      suggestedActions: [
        { type: 'post', title: `SNS投稿：${r.pageName}への導線`, channel: 'Instagram' },
        { type: 'sales', title: suggestedAction },
        { type: 'ad', title: (r.recommendedActions || []).some(a => a.type === 'ad_test') ? '小額広告テスト検討' : '広告は保留（LP改善優先）' }
      ],
      memo: `アナリティクス番頭から送付。URL: ${r.url || '—'}。シグナル: 表示${r.views}・直帰${r.bounceRate}%`,
      status: 'open',
      analyticsRecordId: r.id || ''
    };
  },

  getDiagnosticsCounts(records) {
    const list = this.normalizeRecords(records);
    let noId = 0; let noDate = 0; let noName = 0; let noUrl = 0;
    let badNumeric = 0; let badBounce = 0; let badScore = 0; let badStatus = 0;
    let highBounce = 0; let noCta = 0;
    let browserImport = 0; let browserNoUrl = 0; let browserMissingNumeric = 0;

    const dupKeys = new Map();
    let browserDuplicateCandidates = 0;

    list.forEach(r => {
      if (!r.id) noId++;
      if (!r.date) noDate++;
      if (!(r.pageName || '').trim()) noName++;
      if (!(r.url || '').trim()) noUrl++;
      ['views', 'activeUsers', 'avgEngagementSeconds', 'eventCount', 'bounceRate'].forEach(f => {
        const v = r[f];
        if (v != null && typeof v !== 'number') badNumeric++;
      });
      if (r.bounceRate < 0 || r.bounceRate > 100) badBounce++;
      if (r.demandScore < 0 || r.demandScore > 100) badScore++;
      if (r.status && !this.STATUSES.includes(r.status)) badStatus++;
      if (Number(r.bounceRate) >= 60 && Number(r.views) >= 10) highBounce++;
      if (Number(r.views) >= 15 && this.totalClicks(r) === 0) noCta++;

      if (r.importSource === 'browser-bantou') {
        browserImport++;
        if (!(r.url || '').trim()) browserNoUrl++;
        const missing = this.BROWSER_NUMERIC_FIELDS.filter(f => !r[f] && r[f] !== 0).length;
        if (missing >= 5) browserMissingNumeric++;
      }

      const dupKey = `${r.date}|${(r.url || '').trim()}|${(r.pageName || '').trim()}`;
      if (dupKeys.has(dupKey)) browserDuplicateCandidates++;
      else dupKeys.set(dupKey, 1);
    });

    return {
      total: list.length, noId, noDate, noName, noUrl,
      badNumeric, badBounce, badScore, badStatus, highBounce, noCta,
      browserImport, browserNoUrl, browserMissingNumeric, browserDuplicateCandidates
    };
  },

  POLICY_TEXT: '広告・集客支援は広告費を使った後の判断用です。現段階では、まず自然に見られているページ・検索需要を読み、LP・記事・SNS・導線を改善してから広告を乗せる方針です。集客チェック画面にGA4/Search Console/GBP/広告/画像404/分析済みレポートを貼り付けて取り込めます。'
};

function eventsLow(record) {
  return (Number(record.eventCount) || 0) < 5 && (Number(record.views) || 0) >= 10;
}
