/**
 * Budil v3.9 - アナリティクス番頭（GA4/Search Console手入力・需要読み取り）
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
      views: Number(item.views) || 0,
      activeUsers: Number(item.activeUsers) || 0,
      avgEngagementSeconds: Number(item.avgEngagementSeconds) || 0,
      eventCount: Number(item.eventCount) || 0,
      bounceRate: item.bounceRate != null ? Number(item.bounceRate) : 0,
      ctaClicks: Number(item.ctaClicks) || 0,
      lineClicks: Number(item.lineClicks) || 0,
      bookingClicks: Number(item.bookingClicks) || 0,
      phoneClicks: Number(item.phoneClicks) || 0,
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
      updatedAt: item.updatedAt || ''
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
    return {
      today: today || new Date().toISOString().slice(0, 10),
      records: active,
      topDemand,
      highBounce,
      contentIdeas,
      adReadiness,
      priority,
      strongCount: active.filter(r => r.demandScore >= 80).length,
      bounceCount: active.filter(r => Number(r.bounceRate) >= 60 && Number(r.views) >= 10).length
    };
  },

  buildHomeComment(ctx) {
    const c = ctx || {};
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
    lines.push(`需要強いページ ${c.strongCount || 0}件`);
    lines.push(`離脱注意ページ ${c.bounceCount || 0}件`);
    if (c.priority) {
      const act = (c.priority.recommendedActions || [])[0];
      lines.push(`今日の優先：${act ? act.text + '（' + c.priority.pageName + '）' : c.priority.pageName}`);
    }
    if (c.adReadiness) lines.push(`広告判断：${c.adReadiness.label}`);
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
    lines.push(`ページ別データ：${(c.records || []).length}件`);
    lines.push(`需要強いページ：${c.strongCount || 0}件`);
    lines.push(`離脱注意ページ：${c.bounceCount || 0}件`);
    if (c.adReadiness) lines.push(`広告判断：${c.adReadiness.label} — ${c.adReadiness.detail}`);
    lines.push('');
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
    });

    return {
      total: list.length, noId, noDate, noName, noUrl,
      badNumeric, badBounce, badScore, badStatus, highBounce, noCta
    };
  },

  POLICY_TEXT: '広告番頭は広告費を使った後の判断用です。現段階では、まず自然に見られているページ・検索需要を読み、LP・記事・SNS・導線を改善してから広告を乗せる方針です。'
};

function eventsLow(record) {
  return (Number(record.eventCount) || 0) < 5 && (Number(record.views) || 0) >= 10;
}
