/**
 * Budil v0.2 - 需要サーチ分析エンジン
 */
const DemandBrain = {
  SERVICES: [
    { name: 'エアコンクリーニング', triggers: ['エアコン', '冷房', '冷暖房', 'クーラー', '吹き出し', '黒カビ'] },
    { name: '完全分解エアコンクリーニング', triggers: ['完全分解', '分解洗浄', '内部カビ', '内部洗浄'] },
    { name: '洗濯機クリーニング', triggers: ['洗濯機', '縦型', 'カビ臭', '洗濯槽', '槽洗浄'] },
    { name: 'ドラム式洗濯機クリーニング', triggers: ['ドラム式', 'ドラム', '乾燥不良', '乾燥'] },
    { name: 'レンジフード', triggers: ['レンジフード', '換気扇', '油汚れ', 'レンジ'] },
    { name: '浴室クリーニング', triggers: ['浴室', '風呂', '水垢', 'ユニットバス', 'お風呂'] },
    { name: 'AI帳票番頭', triggers: ['帳票', '請求書', '経理', '自動化', 'OCR', '伝票'] },
    { name: '広告番頭', triggers: ['広告', 'リスティング', 'MEO', 'SEO', '集客', 'Google広告', 'クリック'] },
    { name: 'AI導入コンサル', triggers: ['AI導入', 'ChatGPT', 'DX', '業務効率', 'コンサル', '生成AI'] }
  ],

  SCORE_UP_STRONG: ['急上昇', '急伸', 'ブレイク', '急増'],
  SCORE_UP: ['増加', '伸び', '伸びている', '多い', '高い', 'クリック', '表示', '問い合わせ', '上昇', '人気'],
  SCORE_DOWN: ['低下', '減少', '少ない', '下降', '減'],

  POST_THEMES: {
    'エアコンクリーニング': ['エアコン内部の黒カビ実写比較', 'エアコン臭いの原因チェックリスト', '沖縄の梅雨前エアコン掃除タイミング'],
    '完全分解エアコンクリーニング': ['完全分解と通常清掃の違い', '黒カビが見えたら完全分解のサイン', '分解洗浄のビフォーアフター'],
    '洗濯機クリーニング': ['縦型洗濯機のカビ臭対策', '洗濯槽の裏側が原因かも', '洗濯機クリーニングのタイミング'],
    'ドラム式洗濯機クリーニング': ['ドラム式の乾燥不良チェック', 'ドラム式洗濯機のカビ対策', '縦型との違いを現場目線で解説'],
    'レンジフード': ['レンジフード油汚れの見分け方', '換気扇掃除を後回しにすると起きること', '沖縄の油汚れ対策'],
    '浴室クリーニング': ['浴室カビの再発を防ぐポイント', '水垢 vs カビの見分け方', '浴室クリーニング前のセルフチェック'],
    'AI帳票番頭': ['帳票入力を減らす仕組みの一例', '現場で使えるAI帳票のイメージ', '紙帳票からの移行ステップ'],
    '広告番頭': ['沖縄現場業の集客で効く広告の型', '検索広告とMEOの使い分け', '問い合わせが増えた事例の共通点'],
    'AI導入コンサル': ['AI導入は何から始めるか', '現場業向けAI活用の第一歩', 'ChatGPTを業務に入れる前の整理']
  },

  SALES_THEMES: {
    'エアコンクリーニング': ['管理会社向けにエアコン定期清掃提案', '民泊向けにエアコン清掃パッケージ提案', '飲食店向けに換気・空調清掃提案'],
    '完全分解エアコンクリーニング': ['黒カビ報告のある物件へ完全分解提案', 'リフォーム業者への協業提案', '高齢施設向け空気環境改善提案'],
    '洗濯機クリーニング': ['管理会社向けに洗濯機クリーニング提案', '賃貸退去時の洗濯機清掃オプション提案', 'クリーニング店への業務提携提案'],
    'ドラム式洗濯機クリーニング': ['ドラム式オーナー向け定期清掃提案', '家電量販店アフター連携提案', '民泊向けドラム式メンテ提案'],
    'レンジフード': ['飲食店向けレンジフード定期清掃提案', '管理会社向け換気設備清掃提案', '店舗リニューアル時の厨房清掃提案'],
    '浴室クリーニング': ['民泊向け浴室清掃パッケージ提案', '賃貸退去清掃の浴室オプション提案', 'ホテル・旅館向け定期清掃提案'],
    'AI帳票番頭': ['現場業者向けにAI帳票番頭提案', '経理負担の多い会社への自動化提案', '紙帳票が多い業種への導入提案'],
    '広告番頭': ['集客に課題のある現場業へ広告番頭提案', '検索流入が伸びている業種への広告強化提案', 'MEO未対応店舗への露出改善提案'],
    'AI導入コンサル': ['業務効率化したい中小企業へAI導入提案', '事務負担の多い現場業へコンサル提案', 'DX着手前の整理・設計支援提案']
  },

  SAMPLE: {
    todayMove: {
      service: '洗濯機クリーニング',
      reason: '洗濯機クリーニング需要が伸びています。',
      action: '今日は「縦型洗濯機のカビ臭対策」投稿を優先してください。'
    },
    recommendedServices: [
      { name: '洗濯機クリーニング', score: 12, matchedKeywords: ['洗濯機', 'カビ臭'] },
      { name: 'エアコンクリーニング', score: 8, matchedKeywords: ['エアコン'] },
      { name: 'ドラム式洗濯機クリーニング', score: 6, matchedKeywords: ['ドラム式'] }
    ],
    postThemes: ['縦型洗濯機のカビ臭対策', 'ドラム式の乾燥不良チェック', 'エアコン内部の黒カビ実写比較'],
    salesThemes: ['管理会社向けに洗濯機クリーニング提案', '民泊向けにエアコン定期清掃提案', '現場業者向けにAI帳票番頭提案']
  },

  scoreKeyword(keyword, text) {
    const lines = text.split('\n').filter(l => l.includes(keyword));
    const ctx = lines.length ? lines.join(' ') : text;
    let level = '横ばい';
    let points = 2;

    if (this.SCORE_UP_STRONG.some(w => ctx.includes(w))) {
      level = '急上昇'; points = 4;
    } else if (this.SCORE_DOWN.some(w => ctx.includes(w))) {
      level = '下降'; points = 1;
    } else if (this.SCORE_UP.some(w => ctx.includes(w))) {
      level = '上昇'; points = 3;
    }

    return { keyword, level, points };
  },

  scoreKeywords(keywords, text) {
    return keywords.map(kw => this.scoreKeyword(kw, text));
  },

  recommendServices(keywordScores, text) {
    const combined = text + keywordScores.map(k => k.keyword).join(' ');
    const results = this.SERVICES.map(svc => {
      let score = 0;
      const matchedKeywords = [];
      svc.triggers.forEach(trigger => {
        if (combined.includes(trigger)) {
          const kwScore = keywordScores.find(k =>
            k.keyword.includes(trigger) || trigger.includes(k.keyword)
          );
          score += kwScore ? kwScore.points * 2 : 2;
          if (!matchedKeywords.includes(trigger)) matchedKeywords.push(trigger);
        }
      });
      keywordScores.forEach(ks => {
        if (svc.triggers.some(t => ks.keyword.includes(t) || t.includes(ks.keyword))) {
          score += ks.points;
          if (!matchedKeywords.includes(ks.keyword)) matchedKeywords.push(ks.keyword);
        }
      });
      return { name: svc.name, score, matchedKeywords };
    });

    return results
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  },

  pickThemes(serviceNames, themeMap) {
    const themes = [];
    serviceNames.forEach(name => {
      const list = themeMap[name] || [];
      if (list[0] && !themes.includes(list[0])) themes.push(list[0]);
      if (list[1] && themes.length < 3 && !themes.includes(list[1])) themes.push(list[1]);
    });
    if (themes.length < 3) {
      Object.values(themeMap).flat().forEach(t => {
        if (themes.length < 3 && !themes.includes(t)) themes.push(t);
      });
    }
    return themes.slice(0, 3);
  },

  buildTodayMove(topService, keywordScores, postThemes) {
    if (!topService) return null;
    const topKw = keywordScores.find(k => k.level === '急上昇' || k.level === '上昇')
      || keywordScores[0];
    const kwLabel = topKw ? topKw.keyword : topService.matchedKeywords[0] || '';
    const levelText = topKw && (topKw.level === '急上昇' || topKw.level === '上昇')
      ? '伸びています' : '注目されています';
    const postTheme = postThemes[0] || `${topService.name}の需要チェック`;

    return {
      service: topService.name,
      reason: kwLabel
        ? `${topService.name}（${kwLabel}）の需要が${levelText}。`
        : `${topService.name}需要が${levelText}。`,
      action: `今日は「${postTheme}」投稿を優先してください。`
    };
  },

  analyze(text, keywords) {
    const keywordScores = this.scoreKeywords(keywords, text);
    let recommendedServices = this.recommendServices(keywordScores, text);

    if (!recommendedServices.length && keywords.length) {
      recommendedServices = this.SERVICES.slice(0, 3).map((s, i) => ({
        name: s.name,
        score: 3 - i,
        matchedKeywords: [keywords[i] || s.triggers[0]]
      }));
    }

    const serviceNames = recommendedServices.map(r => r.name);
    const postThemes = this.pickThemes(serviceNames, this.POST_THEMES);
    const salesThemes = this.pickThemes(serviceNames, this.SALES_THEMES);
    const todayMove = this.buildTodayMove(recommendedServices[0], keywordScores, postThemes);

    return { keywordScores, recommendedServices, postThemes, salesThemes, todayMove };
  },

  PICKUP_SOURCES: ['クロクロ', '天気', 'ニュース', 'SNS', '検索需要', '手動', 'その他'],

  PICKUP_SERVICES: [
    'エアコン通常', 'エアコン完全分解', 'お掃除機能付きエアコン',
    '洗濯機クリーニング', 'レンジフード', 'キッチン', '浴室', '法人案件', 'その他'
  ],

  PICKUP_LABELS: [
    { key: 'topic', labels: ['テーマ：', 'テーマ:'] },
    { key: 'summary', labels: ['要約：', '要約:'] },
    { key: 'demandScore', labels: ['需要スコア：', '需要スコア:'] },
    { key: 'relatedServices', labels: ['関連サービス：', '関連サービス:'] },
    { key: 'postAction', labels: ['投稿案：', '投稿案:'] },
    { key: 'salesAction', labels: ['営業案：', '営業案:'] },
    { key: 'adAction', labels: ['広告案：', '広告案:'] },
    { key: 'memo', labels: ['メモ：', 'メモ:'] }
  ],

  KUROKURO_MORNING_PROMPT: `沖縄南部の清掃業向けに、今日の需要ピックアップを作ってください。

目的：
Budilの需要番頭に入力するため、今日の投稿・営業・広告アクションにつながる需要ネタを3件出してください。

調査観点：
1. 沖縄の天気・湿度・台風・梅雨・気温
2. エアコンクリーニング需要
3. 洗濯機クリーニング需要
4. カビ・臭い・湿気・水漏れ・結露
5. 家庭向け清掃需要
6. 法人向け清掃需要
7. SNS投稿に使えそうな生活者の不安
8. Google広告で押すべきサービス
9. 今週優先すべきサービス

出力形式は必ず以下でお願いします。

【需要ピックアップ1】
テーマ：
要約：
需要スコア：
関連サービス：
投稿案：
営業案：
広告案：
メモ：

【需要ピックアップ2】
テーマ：
要約：
需要スコア：
関連サービス：
投稿案：
営業案：
広告案：
メモ：

【需要ピックアップ3】
テーマ：
要約：
需要スコア：
関連サービス：
投稿案：
営業案：
広告案：
メモ：

条件：
- 地域は沖縄南部を中心
- サービスはエアコン通常、エアコン完全分解、お掃除機能付きエアコン、洗濯機クリーニング、レンジフード、キッチン、浴室、法人案件から選ぶ
- 今日やる行動に落とし込める内容にする
- 投稿案はInstagramリール向けにする
- 広告案はGoogle広告やLP改善に使える内容にする
- 需要スコアは0〜100で付ける
- 机上の空論ではなく、今日動ける提案にする`,

  isBulkPasteFormat(text) {
    return /【需要ピックアップ\s*\d+】/.test(text || '');
  },

  parseKurokuroBulkPaste(text) {
    const raw = (text || '').trim();
    if (!raw || !this.isBulkPasteFormat(raw)) return [];
    return raw.split(/【需要ピックアップ\s*\d+】/)
      .map(block => this.parseKurokuroPaste(block))
      .filter(p => p.topic || p.summary || p.demandScore != null);
  },

  parseClocloPaste(text) {
    if (this.isBulkPasteFormat(text)) return this.parseKurokuroBulkPaste(text);
    const single = this.parseKurokuroPaste(text);
    return Object.keys(single).length ? [single] : [];
  },

  parseKurokuroPaste(text) {
    const raw = (text || '').trim();
    if (!raw) return {};
    const result = {};
    const allLabels = this.PICKUP_LABELS.flatMap(f => f.labels);
    this.PICKUP_LABELS.forEach(field => {
      for (const label of field.labels) {
        const idx = raw.indexOf(label);
        if (idx === -1) continue;
        const start = idx + label.length;
        let end = raw.length;
        for (const other of allLabels) {
          if (other === label) continue;
          const pos = raw.indexOf(other, start);
          if (pos !== -1 && pos < end) end = pos;
        }
        const value = raw.slice(start, end).trim().replace(/\n+$/, '').trim();
        if (field.key === 'demandScore') {
          const num = parseInt(value.replace(/[^\d]/g, ''), 10);
          if (!isNaN(num)) result.demandScore = Math.min(100, Math.max(0, num));
        } else if (field.key === 'relatedServices') {
          result.relatedServices = this.parseRelatedServices(value);
        } else {
          result[field.key] = value;
        }
        break;
      }
    });
    return result;
  },

  parseRelatedServices(text) {
    if (!text) return [];
    const parts = text.split(/[、,／/]/).map(s => s.trim()).filter(Boolean);
    const matched = [];
    parts.forEach(part => {
      const found = this.PICKUP_SERVICES.find(s =>
        part.includes(s) || s.includes(part) ||
        (part.includes('完全分解') && s === 'エアコン完全分解') ||
        (part.includes('洗濯機') && s === '洗濯機クリーニング')
      );
      if (found && !matched.includes(found)) matched.push(found);
      else if (!found && part && !matched.includes(part)) matched.push(part);
    });
    return matched;
  },

  EXECUTION_TYPES: ['reel', 'instagram', 'line', 'gbp', 'ad'],

  EXECUTION_DEFAULT: {
    status: 'draft',
    scheduledDate: '',
    executedAt: '',
    memo: '',
    resultMemo: '',
    nextImproveMemo: '',
    metrics: {
      views: null,
      reactions: null,
      clicks: null,
      lineInquiries: null,
      reservations: null,
      salesAmount: null,
      updatedAt: ''
    },
    relatedLeadIds: [],
    relatedRevenueIds: []
  },

  METRICS_FIELDS: ['views', 'reactions', 'clicks', 'lineInquiries', 'reservations', 'salesAmount'],

  EXECUTION_META: {
    reel: {
      label: 'Instagramリール',
      shortLabel: 'リール投稿',
      taskTitle: 'リール投稿',
      dashPrefix: 'Instagramリール',
      doneLog: 'リール投稿済み',
      statuses: [
        { value: 'draft', label: '下書き' },
        { value: 'scheduled', label: '投稿予定' },
        { value: 'posted', label: '投稿済み' },
        { value: 'skipped', label: '見送り' }
      ],
      scheduledDateLabel: '投稿予定日',
      doneStatus: 'posted'
    },
    instagram: {
      label: 'Instagram投稿文',
      shortLabel: 'Instagram投稿',
      taskTitle: '投稿する',
      dashPrefix: 'Instagram投稿',
      doneLog: 'Instagram投稿済み',
      statuses: [
        { value: 'draft', label: '下書き' },
        { value: 'scheduled', label: '投稿予定' },
        { value: 'posted', label: '投稿済み' },
        { value: 'skipped', label: '見送り' }
      ],
      scheduledDateLabel: '投稿予定日',
      doneStatus: 'posted'
    },
    line: {
      label: 'LINE配信文',
      shortLabel: 'LINE配信',
      taskTitle: 'LINE配信',
      dashPrefix: 'LINE配信',
      doneLog: 'LINE配信済み',
      statuses: [
        { value: 'draft', label: '下書き' },
        { value: 'scheduled', label: '配信予定' },
        { value: 'posted', label: '配信済み' },
        { value: 'skipped', label: '見送り' }
      ],
      scheduledDateLabel: '配信予定日',
      doneStatus: 'posted'
    },
    gbp: {
      label: 'Googleビジネスプロフィール',
      shortLabel: 'GBP投稿',
      taskTitle: 'GBP投稿',
      dashPrefix: 'GBP投稿',
      doneLog: 'GBP投稿済み',
      statuses: [
        { value: 'draft', label: '下書き' },
        { value: 'scheduled', label: '投稿予定' },
        { value: 'posted', label: '投稿済み' },
        { value: 'skipped', label: '見送り' }
      ],
      scheduledDateLabel: '投稿予定日',
      doneStatus: 'posted'
    },
    ad: {
      label: 'Google広告文',
      shortLabel: '広告確認',
      taskTitle: '広告確認',
      dashPrefix: '広告確認',
      doneLog: '広告反映済み',
      statuses: [
        { value: 'draft', label: '下書き' },
        { value: 'scheduled', label: '反映予定' },
        { value: 'posted', label: '反映済み' },
        { value: 'skipped', label: '見送り' }
      ],
      scheduledDateLabel: '反映予定日',
      doneStatus: 'posted'
    }
  },

  normalizeExecutionStatus(pickup) {
    const existing = (pickup && pickup.executionStatus) || {};
    const result = {};
    this.EXECUTION_TYPES.forEach(type => {
      const raw = { ...this.EXECUTION_DEFAULT, ...(existing[type] || {}) };
      raw.metrics = this.normalizePerformanceMetrics(raw);
      raw.relatedLeadIds = Array.isArray(raw.relatedLeadIds) ? raw.relatedLeadIds.filter(Boolean) : [];
      raw.relatedRevenueIds = Array.isArray(raw.relatedRevenueIds) ? raw.relatedRevenueIds.filter(Boolean) : [];
      result[type] = raw;
    });
    return result;
  },

  normalizePerformanceMetrics(execItem) {
    const raw = (execItem && execItem.metrics) || {};
    const num = v => {
      if (v === '' || v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    return {
      views: num(raw.views),
      reactions: num(raw.reactions),
      clicks: num(raw.clicks),
      lineInquiries: num(raw.lineInquiries),
      reservations: num(raw.reservations),
      salesAmount: num(raw.salesAmount),
      updatedAt: raw.updatedAt || ''
    };
  },

  hasPerformanceInput(execItem) {
    if (!execItem) return false;
    const metrics = this.normalizePerformanceMetrics(execItem);
    if (this.METRICS_FIELDS.some(f => metrics[f] !== null && metrics[f] > 0)) return true;
    if ((execItem.resultMemo || '').trim()) return true;
    if ((execItem.nextImproveMemo || '').trim()) return true;
    if (Array.isArray(execItem.relatedLeadIds) && execItem.relatedLeadIds.length) return true;
    if (Array.isArray(execItem.relatedRevenueIds) && execItem.relatedRevenueIds.length) return true;
    return false;
  },

  getExecutionStatusLabel(type, status) {
    const meta = this.EXECUTION_META[type];
    if (!meta) return status || '';
    const found = meta.statuses.find(s => s.value === status);
    return found ? found.label : status || '';
  },

  isExecutionDone(type, status) {
    const meta = this.EXECUTION_META[type];
    return status === (meta ? meta.doneStatus : 'posted');
  },

  isExecutionPending(type, execItem) {
    if (!execItem) return false;
    if (execItem.status === 'skipped') return false;
    return !this.isExecutionDone(type, execItem.status);
  },

  hasGeneratedOutput(pickup, type) {
    const out = pickup && pickup.generatedOutputs;
    if (!out) return false;
    return !!(out[type] && String(out[type]).trim());
  },

  normalizePickup(item) {
    const actions = Array.isArray(item.suggestedActions) ? item.suggestedActions : [];
    const getAction = type => actions.find(a => a.type === type);
    const post = getAction('post');
    const sales = getAction('sales');
    const ad = getAction('ad');
    return {
      id: item.id || '',
      date: item.date || new Date().toISOString().slice(0, 10),
      source: item.source || 'クロクロ',
      topic: item.topic || '',
      summary: item.summary || '',
      demandScore: typeof item.demandScore === 'number' ? item.demandScore : 0,
      relatedServices: Array.isArray(item.relatedServices) ? item.relatedServices : [],
      suggestedActions: actions,
      postTitle: post ? post.title : '',
      salesTitle: sales ? sales.title : '',
      adTitle: ad ? ad.title : '',
      memo: item.memo || '',
      status: item.status || 'open',
      isTest: !!item.isTest,
      generatedOutputs: item.generatedOutputs || null,
      executionStatus: item.executionStatus || null,
      executionLogs: Array.isArray(item.executionLogs) ? item.executionLogs : [],
      createdAt: item.createdAt || '',
      updatedAt: item.updatedAt || ''
    };
  },

  buildExecutionSummary(pickup) {
    const p = this.normalizePickup(pickup);
    const exec = this.normalizeExecutionStatus(pickup);
    const badges = [];
    const hasAnyOutput = this.EXECUTION_TYPES.some(t => this.hasGeneratedOutput(pickup, t));
    if (hasAnyOutput) badges.push({ key: 'has-output', label: '文案あり', className: 'exec-badge-output' });

    let hasScheduled = false;
    let hasPosted = false;
    let hasLineDone = false;
    let hasAdDone = false;
    let hasResultMemo = false;

    this.EXECUTION_TYPES.forEach(type => {
      const item = exec[type];
      if (!item) return;
      if (item.status === 'scheduled') hasScheduled = true;
      if (this.isExecutionDone(type, item.status)) {
        hasPosted = true;
        if (type === 'line') hasLineDone = true;
        if (type === 'ad') hasAdDone = true;
      }
      if (item.resultMemo && item.resultMemo.trim()) hasResultMemo = true;
    });

    if (hasScheduled) badges.push({ key: 'scheduled', label: '投稿予定', className: 'exec-badge-scheduled' });
    if (hasPosted) badges.push({ key: 'posted', label: '投稿済み', className: 'exec-badge-posted' });
    if (hasLineDone) badges.push({ key: 'line-done', label: 'LINE済み', className: 'exec-badge-line' });
    if (hasAdDone) badges.push({ key: 'ad-done', label: '広告反映済み', className: 'exec-badge-ad' });
    if (hasResultMemo) badges.push({ key: 'result', label: '効果メモあり', className: 'exec-badge-result' });

    this.EXECUTION_TYPES.forEach(type => {
      const evalResult = this.evaluatePerformanceResult(pickup, type, [], []);
      if (evalResult.judgment === 'has_result') {
        badges.push({ key: 'perf-result-' + type, label: '成果あり', className: 'exec-badge-perf-result' });
      } else if (evalResult.judgment === 'has_reaction') {
        badges.push({ key: 'perf-reaction-' + type, label: '反応あり', className: 'exec-badge-perf-reaction' });
      } else if (evalResult.judgment === 'needs_improvement') {
        badges.push({ key: 'perf-needs-' + type, label: '改善必要', className: 'exec-badge-perf-needs' });
      }
    });

    const insightBadges = this.buildInsightSummary(pickup);
    insightBadges.forEach(b => {
      if (!badges.some(x => x.key === b.key)) badges.push(b);
    });

    return badges;
  },

  getExecutionManagementPickups(pickups, manualTasks) {
    const taskTopics = new Set();
    (manualTasks || []).forEach(t => {
      if (t.pickupTopic) taskTopics.add(t.pickupTopic);
    });
    return (pickups || [])
      .map(p => this.normalizePickup(p))
      .filter(p => {
        if (p.status !== 'open' && p.status !== 'used') return false;
        const raw = pickups.find(x => x.id === p.id) || p;
        const hasOutputs = this.EXECUTION_TYPES.some(t => this.hasGeneratedOutput(raw, t));
        const inTasks = taskTopics.has(p.topic);
        return hasOutputs || inTasks || p.status === 'open' || p.status === 'used';
      })
      .sort((a, b) => (b.date + (b.updatedAt || '')).localeCompare(a.date + (a.updatedAt || '')));
  },

  getTodayExecutionActions(pickups, today) {
    const t = today || new Date().toISOString().slice(0, 10);
    const actions = [];
    (pickups || []).forEach(raw => {
      const p = this.normalizePickup(raw);
      if (p.status !== 'open' && p.status !== 'used') return;
      const exec = this.normalizeExecutionStatus(raw);
      this.EXECUTION_TYPES.forEach(type => {
        const item = exec[type];
        if (!this.isExecutionPending(type, item)) return;
        if (item.status !== 'draft' && item.status !== 'scheduled') return;
        const scheduled = item.scheduledDate;
        if (!scheduled || scheduled > t) return;
        const meta = this.EXECUTION_META[type];
        const hasContent = this.hasGeneratedOutput(raw, type) || item.status === 'scheduled';
        if (!hasContent) return;
        actions.push({
          pickupId: p.id,
          topic: p.topic,
          type,
          label: meta.dashPrefix,
          shortLabel: meta.shortLabel,
          scheduledDate: scheduled,
          status: item.status
        });
      });
    });
    return actions.sort((a, b) => {
      const d = a.scheduledDate.localeCompare(b.scheduledDate);
      if (d !== 0) return d;
      return a.topic.localeCompare(b.topic);
    });
  },

  buildMorningExecutionLines(pickups, today) {
    return this.getTodayExecutionActions(pickups, today).map((a, i) => {
      return `${i + 1}. ${a.shortLabel}：${a.topic}`;
    });
  },

  buildDashboardExecutionLines(pickups, today) {
    return this.getTodayExecutionActions(pickups, today).map(a => {
      return `${a.label}：${a.topic}`;
    });
  },

  buildExecutionTaskDedupeKey(date, topic, type, title) {
    return [date, topic, type, title].join('|');
  },

  createExecutionTaskPayload(pickup, type) {
    const p = this.normalizePickup(pickup);
    const meta = this.EXECUTION_META[type];
    if (!meta) return null;
    const title = `${meta.taskTitle}：${p.topic}`;
    return {
      title,
      reason: `需要ピックアップ「${p.topic}」の${meta.label}`,
      priority: '中',
      contentType: type,
      rawTitle: p.topic,
      topic: p.topic
    };
  },

  createExecutionLog(pickup, type, memo) {
    const p = this.normalizePickup(pickup);
    const meta = this.EXECUTION_META[type];
    const today = new Date().toISOString().slice(0, 10);
    return {
      id: 'execution-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      date: today,
      type,
      title: p.topic,
      memo: memo || (meta ? meta.doneLog : '実行済み'),
      createdAt: new Date().toISOString()
    };
  },

  RESULT_GOOD_KEYWORDS: [
    '反応あり', '問い合わせ', 'LINE相談', '予約', '保存', 'クリック多い',
    '伸びた', '良かった', '反応良い'
  ],

  RESULT_BAD_KEYWORDS: [
    '反応薄い', '問い合わせなし', 'クリックなし', '保存少ない',
    '伸びない', '反応なし', '高い', 'CPA悪い'
  ],

  evaluateExecutionResult(pickup, type) {
    const p = this.normalizePickup(pickup);
    const exec = this.normalizeExecutionStatus(pickup);
    const item = exec[type] || this.EXECUTION_DEFAULT;
    const meta = this.EXECUTION_META[type] || {};
    const resultMemo = (item.resultMemo || '').trim();
    const nextImproveMemo = (item.nextImproveMemo || '').trim();
    const combined = resultMemo + nextImproveMemo;
    let judgment = 'neutral';
    let judgmentLabel = '様子見';
    let recommendation = '次回の反応も見て判断';

    if (this.RESULT_GOOD_KEYWORDS.some(kw => resultMemo.includes(kw) || combined.includes(kw))) {
      judgment = 'good';
      judgmentLabel = '良い反応';
      recommendation = '同じテーマで実写多めの続編を作る';
    } else if (this.RESULT_BAD_KEYWORDS.some(kw => resultMemo.includes(kw) || combined.includes(kw))) {
      judgment = 'needs_improvement';
      judgmentLabel = '改善必要';
      recommendation = '訴求・冒頭・実写量・CTAを見直す';
    }

    const nextAction = nextImproveMemo || recommendation;
    return {
      pickupId: p.id,
      topic: p.topic,
      relatedServices: p.relatedServices,
      type,
      channelLabel: meta.label || type,
      shortLabel: meta.shortLabel || type,
      executedAt: item.executedAt || '',
      resultMemo,
      nextImproveMemo,
      judgment,
      judgmentLabel,
      recommendation,
      nextAction,
      isDone: this.isExecutionDone(type, item.status)
    };
  },

  _collectExecutionReflectionEntries(pickups) {
    const entries = [];
    (pickups || []).forEach(raw => {
      const p = this.normalizePickup(raw);
      const exec = this.normalizeExecutionStatus(raw);
      const logs = Array.isArray(raw.executionLogs) ? raw.executionLogs : [];
      const loggedTypes = new Set(logs.map(l => l.type));

      this.EXECUTION_TYPES.forEach(type => {
        const item = exec[type];
        const hasResultMemo = !!(item.resultMemo && item.resultMemo.trim());
        const hasNextImprove = !!(item.nextImproveMemo && item.nextImproveMemo.trim());
        const isDone = this.isExecutionDone(type, item.status);
        const hasLog = loggedTypes.has(type);
        if (!isDone && !hasResultMemo && !hasNextImprove && !hasLog) return;

        const evalResult = this.evaluateExecutionResult(raw, type);
        const logForType = logs.find(l => l.type === type);
        entries.push({
          ...evalResult,
          executedAt: item.executedAt || (logForType ? logForType.date : ''),
          logMemo: logForType ? logForType.memo : ''
        });
      });
    });
    return entries.sort((a, b) => (b.executedAt || '').localeCompare(a.executedAt || ''));
  },

  getExecutionInsights(pickups) {
    const entries = this._collectExecutionReflectionEntries(pickups);
    let goodCount = 0;
    let needsImprovementCount = 0;
    let hasResultMemoCount = 0;
    entries.forEach(e => {
      if (e.resultMemo) hasResultMemoCount++;
      if (e.judgment === 'good') goodCount++;
      if (e.judgment === 'needs_improvement') needsImprovementCount++;
    });
    return { goodCount, needsImprovementCount, hasResultMemoCount, total: entries.length };
  },

  getReflectionItems(pickups) {
    return this._collectExecutionReflectionEntries(pickups);
  },

  getWinningPatterns(pickups) {
    return this._collectExecutionReflectionEntries(pickups)
      .filter(e => e.judgment === 'good')
      .map(e => ({
        ...e,
        nextGrowPlan: e.nextImproveMemo || '実写洗浄多めで続編を作る'
      }));
  },

  getImprovementCandidates(pickups) {
    return this._collectExecutionReflectionEntries(pickups)
      .filter(e => e.judgment === 'needs_improvement')
      .map(e => ({
        ...e,
        improvePlan: e.nextImproveMemo || e.recommendation
      }));
  },

  buildImprovementHints(pickups, max) {
    const limit = max || 2;
    const hints = [];
    this.getWinningPatterns(pickups).forEach(e => {
      if (hints.length >= limit) return;
      hints.push({
        kind: 'good',
        text: `${e.topic}の${e.shortLabel}は反応あり。今日は実写多めの続編を作るのがおすすめです。`,
        shortText: `${e.topic}は反応あり。続編候補`,
        pickupId: e.pickupId,
        type: e.type
      });
    });
    this.getImprovementCandidates(pickups).forEach(e => {
      if (hints.length >= limit) return;
      const label = e.type === 'ad' ? `${e.topic}広告` : `${e.topic}の${e.shortLabel}`;
      const effect = e.resultMemo || '反応薄い';
      const action = (e.improvePlan && e.improvePlan.includes('CTA'))
        ? 'CTAを見直しましょう。'
        : (e.improvePlan || '訴求・CTAを見直しましょう。');
      hints.push({
        kind: 'improve',
        text: `${label}は${effect.replace(/。$/, '')}。${action.replace(/。$/, '')}。`,
        shortText: e.type === 'ad' ? `${e.topic}広告はCTA見直し` : `${e.topic}は改善候補`,
        pickupId: e.pickupId,
        type: e.type
      });
    });
    return hints.slice(0, limit);
  },

  buildImprovementComment(pickups, max) {
    return this.buildImprovementHints(pickups, max).map(h => h.text);
  },

  buildMorningImprovementLines(pickups, max) {
    return this.buildImprovementHints(pickups, max).map(h => `・${h.shortText}`);
  },

  buildImprovementTaskDedupeKey(date, topic, type, taskKind, title) {
    return [date, topic, type, taskKind, title].join('|');
  },

  createImprovementTaskPayload(pickup, type, judgment) {
    const p = this.normalizePickup(pickup);
    const meta = this.EXECUTION_META[type];
    if (!meta) return null;
    if (judgment === 'good') {
      return {
        title: `続編を作る：${p.topic}`,
        reason: '効果メモで反応あり。勝ちパターン候補',
        priority: '中',
        taskKind: 'sequel',
        topic: p.topic,
        type
      };
    }
    const channelSuffix = type === 'ad' ? '広告' : '';
    return {
      title: `改善する：${p.topic}${channelSuffix}`,
      reason: '効果メモで反応薄い。訴求・CTAを見直す',
      priority: '中',
      taskKind: 'improve',
      topic: p.topic,
      type
    };
  },

  buildInsightSummary(pickup) {
    const badges = [];
    const entries = this._collectExecutionReflectionEntries([pickup]);
    let hasGood = false;
    let hasNeedsImprovement = false;
    let hasResultMemo = false;
    let hasWinning = false;
    let hasImproveTask = false;

    entries.forEach(e => {
      if (e.resultMemo) hasResultMemo = true;
      if (e.judgment === 'good') { hasGood = true; hasWinning = true; }
      if (e.judgment === 'needs_improvement') hasNeedsImprovement = true;
    });

    if (hasGood) badges.push({ key: 'good', label: '良い反応', className: 'insight-badge-good' });
    if (hasNeedsImprovement) badges.push({ key: 'needs', label: '改善必要', className: 'insight-badge-needs' });
    if (hasResultMemo) badges.push({ key: 'memo', label: '効果メモあり', className: 'insight-badge-memo' });
    if (hasWinning) badges.push({ key: 'winning', label: '勝ちパターン候補', className: 'insight-badge-winning' });
    if (hasImproveTask) badges.push({ key: 'improve-task', label: '改善タスクあり', className: 'insight-badge-improve-task' });

    return badges;
  },

  CONTENT_SERVICE_LP: {
    'エアコン通常': 'エアコンクリーニングLP',
    'エアコン完全分解': '完全分解エアコンLP',
    'お掃除機能付きエアコン': 'お掃除機能付きエアコンLP',
    '洗濯機クリーニング': '洗濯機クリーニングLP',
    'レンジフード': 'レンジフード清掃LP',
    'キッチン': 'キッチン清掃LP',
    '浴室': '浴室クリーニングLP',
    '法人案件': '法人清掃LP',
    'その他': 'BCサービス総合LP'
  },

  _pickupCtx(pickup) {
    const p = this.normalizePickup(pickup);
    const mainService = p.relatedServices[0] || '清掃サービス';
    const subService = p.relatedServices[1] || '';
    const serviceLabel = p.relatedServices.slice(0, 2).join('・') || mainService;
    const combined = (p.topic + p.summary + serviceLabel + p.postTitle).toLowerCase();
    const isAc = /エアコン|冷房|クーラー|カビ|ニオイ|臭い|湿気/.test(combined);
    const isWasher = /洗濯|ドラム|槽/.test(combined);
    const isKitchen = /レンジ|キッチン|油汚れ|換気/.test(combined);
    const isBath = /浴室|風呂|水垢|カビ/.test(combined);
    const isCorp = /法人|店舗|施設|管理会社/.test(combined);
    let worryHook = `最近${p.topic}、気になりませんか？`;
    if (isAc) worryHook = '最近エアコンのニオイ、気になりませんか？';
    else if (isWasher) worryHook = '洗濯後のニオイ、気になりませんか？';
    else if (isKitchen) worryHook = 'キッチンの油汚れ、後回しにしていませんか？';
    else if (isBath) worryHook = '浴室のカビや水垢、気になりませんか？';
    const evidenceLine = isAc
      ? '分解中・汚水・洗浄後を見せる。内部のカビ・ホコリの実写で説得力を出す。'
      : isWasher
        ? '洗濯槽の裏側・排水口・洗浄後の比較を見せる。'
        : '施工前後・汚れの実写・作業中の様子を見せる。';
    const explainLine = p.summary || (
      isAc ? '内部にカビ・ホコリが溜まっている可能性があります。沖縄の湿気が原因のことも多いです。'
        : isWasher ? '洗濯槽の裏側にカビや汚れが溜まっている可能性があります。'
          : `${p.topic}は放置すると再発しやすい状態です。`
    );
    return {
      ...p,
      mainService,
      subService,
      serviceLabel,
      isAc,
      isWasher,
      isKitchen,
      isBath,
      isCorp,
      worryHook,
      evidenceLine,
      explainLine
    };
  },

  _buildHashtags(ctx) {
    const tags = ['#沖縄南部', '#BCサービス', '#清掃'];
    if (ctx.isAc) tags.push('#エアコンクリーニング', '#エアコンカビ', '#沖縄エアコン');
    if (ctx.isWasher) tags.push('#洗濯機クリーニング', '#洗濯槽カビ');
    if (ctx.isKitchen) tags.push('#レンジフード清掃', '#キッチン清掃');
    if (ctx.isBath) tags.push('#浴室クリーニング', '#カビ対策');
    if (ctx.topic) tags.push('#' + ctx.topic.replace(/[・\s]/g, ''));
    return [...new Set(tags)].slice(0, 10).join(' ');
  },

  _recommendLp(ctx) {
    const svc = ctx.mainService;
    return this.CONTENT_SERVICE_LP[svc] || this.CONTENT_SERVICE_LP['その他'];
  },

  _recommendKeywords(ctx) {
    const kw = [];
    if (ctx.isAc) kw.push('エアコンクリーニング 沖縄', 'エアコン カビ 臭い', 'エアコン 完全分解 沖縄');
    if (ctx.isWasher) kw.push('洗濯機クリーニング 沖縄', '洗濯槽 カビ 臭い');
    if (ctx.isKitchen) kw.push('レンジフード 清掃 沖縄', 'キッチン 油汚れ 清掃');
    if (ctx.isBath) kw.push('浴室クリーニング 沖縄', '浴室 カビ 除去');
    if (ctx.isCorp) kw.push('法人 清掃 沖縄', '店舗 清掃 業者');
    if (!kw.length) kw.push(ctx.mainService + ' 沖縄', ctx.topic + ' 対策');
    return kw.slice(0, 8);
  },

  _excludeIntents(ctx) {
    const ex = ['自分で掃除', '掃除機 購入', '求人', 'DIYのみ'];
    if (ctx.isAc) ex.push('エアコン 修理', 'エアコン 購入');
    if (ctx.isWasher) ex.push('洗濯機 修理', '洗濯機 購入');
    return ex;
  },

  generateReelPlan(pickup) {
    const ctx = this._pickupCtx(pickup);
    const postHint = ctx.postTitle ? `\n（投稿案：${ctx.postTitle}）` : '';
    return `【リール構成】
尺：25〜30秒 / ストーリー型 / 実写証拠あり / 照屋アニメ解説キャラあり
テロップは入れすぎず、吹き出し中心${postHint}

0〜3秒：不安・違和感
「${ctx.worryHook}」

4〜10秒：原因提示
${ctx.explainLine}

11〜22秒：実写洗浄
${ctx.evidenceLine}

23〜28秒：安心・CTA
気になる方はLINEで写真を送って相談できます。`;
  },

  generateInstagramCaption(pickup) {
    const ctx = this._pickupCtx(pickup);
    const title = `${ctx.topic}｜沖縄南部の${ctx.mainService}`;
    const body = `沖縄南部は湿気の影響で、${ctx.topic}の相談が増えやすい時期です。

${ctx.explainLine}

${ctx.serviceLabel}は、見えない部分の汚れが原因のこともあります。不安なときは、まず状態を確認するのがおすすめです。

${ctx.postTitle ? '今回のテーマ：' + ctx.postTitle + '\n\n' : ''}押し売りはしません。気になる点があれば、写真を見ながら一緒に整理できます。`;
    const cta = '気になることがあれば、LINEで写真を送ってもらえれば確認できます。お気軽にご相談ください。';
    const hashtags = this._buildHashtags(ctx);
    const fullText = `${title}\n\n${body}\n\n${cta}\n\n${hashtags}`;
    return { title, body, cta, hashtags, fullText };
  },

  generateLineMessage(pickup) {
    const ctx = this._pickupCtx(pickup);
    const seasonNote = ctx.isAc || /湿気|梅雨|カビ/.test(ctx.topic + ctx.summary)
      ? '湿気が多い時期は、エアコン内部のカビやニオイの相談が増えます。'
      : `${ctx.topic}のご相談が増えています。`;
    const symptomLines = ctx.isAc
      ? '「最近ニオイが気になる」\n「黒い点が見える」'
      : ctx.isWasher
        ? '「洗濯後にニオイがする」\n「黒いカスが出る」'
        : `「${ctx.topic}が気になる」\n「様子を見てほしい」`;
    return `こんにちは、BCサービスです。
${seasonNote}

${symptomLines}
などあれば、写真を送ってもらえれば確認できます。

気になる方はお気軽にLINEでご相談ください。`;
  },

  generateGbpPost(pickup) {
    const ctx = this._pickupCtx(pickup);
    return `【沖縄南部】${ctx.topic}でお困りの方へ

${ctx.summary || ctx.explainLine}

BCサービスでは、${ctx.serviceLabel}のご相談を沖縄南部を中心に承っています。見えない汚れやニオイの原因は、写真を見るだけでも整理しやすくなります。

まずは状態確認から。施工のご相談・お見積りもお気軽にどうぞ。

${ctx.postTitle ? '今月の注目：' + ctx.postTitle : ''}`;
  },

  generateAdCopy(pickup) {
    const ctx = this._pickupCtx(pickup);
    const lp = this._recommendLp(ctx);
    const headlines = [];
    if (ctx.isAc) {
      headlines.push(
        'エアコンクリーニング沖縄南部',
        'エアコンカビ・臭い対策',
        '完全分解エアコン清掃',
        '沖縄の湿気対策エアコン掃除',
        'エアコン内部洗浄のご相談'
      );
    }
    if (ctx.isWasher) {
      headlines.push('洗濯機クリーニング沖縄', '洗濯槽カビ臭い対策', '縦型洗濯機の内部清掃');
    }
    headlines.push(
      ctx.mainService + 'のご相談',
      '沖縄南部の清掃はBCサービス',
      ctx.topic + 'の相談受付中',
      '写真で状態確認OK',
      'LINE相談歓迎'
    );
    const descriptions = [
      `${ctx.summary || ctx.explainLine} 沖縄南部対応。まずは写真で状態確認から。`,
      `${ctx.serviceLabel}のご相談承ります。押し売りなし。LINEで気軽に相談できます。`,
      ctx.adTitle
        ? `${ctx.adTitle}。${lp}で詳細をご確認ください。`
        : `${lp}からサービス内容・料金の目安をご確認いただけます。`
    ];
    const uniqueHeadlines = [...new Set(headlines)].slice(0, 10);
    return {
      headlines: uniqueHeadlines,
      descriptions: descriptions.slice(0, 5),
      recommendedLp: lp,
      keywords: this._recommendKeywords(ctx),
      excludeIntents: this._excludeIntents(ctx),
      fullText: [
        '【広告見出し案】',
        uniqueHeadlines.map((h, i) => (i + 1) + '. ' + h).join('\n'),
        '',
        '【説明文案】',
        descriptions.map((d, i) => (i + 1) + '. ' + d).join('\n'),
        '',
        '【推奨LP】' + lp,
        '【推奨キーワード】' + this._recommendKeywords(ctx).join(' / '),
        '【除外した方がいい検索意図】' + this._excludeIntents(ctx).join(' / ')
      ].join('\n')
    };
  },

  generateAllOutputs(pickup) {
    const instagram = this.generateInstagramCaption(pickup);
    const ad = this.generateAdCopy(pickup);
    return {
      reel: this.generateReelPlan(pickup),
      instagram: instagram.fullText,
      line: this.generateLineMessage(pickup),
      gbp: this.generateGbpPost(pickup),
      ad: ad.fullText,
      updatedAt: new Date().toISOString()
    };
  },

  formatGeneratedOutputsForSave(outputs) {
    if (!outputs) return null;
    return {
      reel: outputs.reel || '',
      instagram: outputs.instagram || '',
      line: outputs.line || '',
      gbp: outputs.gbp || '',
      ad: outputs.ad || '',
      updatedAt: outputs.updatedAt || new Date().toISOString()
    };
  },

  buildContentTaskDedupeKey(date, topic, contentType) {
    return [date, topic, 'content', contentType].join('|');
  },

  buildContentDailyTask(pickup, contentType) {
    const p = this.normalizePickup(pickup);
    const reason = `今日の需要ピックアップ「${p.topic}」から`;
    const map = {
      reel: { title: `リール投稿：${p.topic}`, rawTitle: p.topic },
      instagram: { title: `投稿する：${p.topic}`, rawTitle: p.topic },
      line: { title: `LINE配信：${p.topic}`, rawTitle: p.topic },
      gbp: { title: `GBP投稿：${p.topic}`, rawTitle: p.topic },
      ad: { title: `広告確認：${p.topic}`, rawTitle: p.topic }
    };
    const item = map[contentType];
    if (!item) return null;
    return {
      title: item.title,
      reason,
      priority: '中',
      contentType,
      rawTitle: item.rawTitle,
      topic: p.topic
    };
  },

  buildPickupFromForm(form) {
    const suggestedActions = [];
    if (form.postAction) {
      suggestedActions.push({ type: 'post', title: form.postAction, channel: 'Instagram' });
    }
    if (form.salesAction) {
      suggestedActions.push({ type: 'sales', title: form.salesAction });
    }
    if (form.adAction) {
      suggestedActions.push({ type: 'ad', title: form.adAction });
    }
    return {
      date: form.date,
      source: form.source,
      topic: form.topic,
      summary: form.summary,
      demandScore: form.demandScore,
      relatedServices: form.relatedServices,
      suggestedActions,
      memo: form.memo,
      status: 'open',
      isTest: !!form.isTest
    };
  },

  buildPickupFromParsed(parsed, defaults) {
    return this.buildPickupFromForm({
      date: (defaults && defaults.date) || new Date().toISOString().slice(0, 10),
      source: (defaults && defaults.source) || 'クロクロ',
      topic: parsed.topic || '',
      summary: parsed.summary || '',
      demandScore: parsed.demandScore != null ? parsed.demandScore : 50,
      relatedServices: parsed.relatedServices || [],
      postAction: parsed.postAction || '',
      salesAction: parsed.salesAction || '',
      adAction: parsed.adAction || '',
      memo: parsed.memo || ''
    });
  },

  getScoreJudgment(score) {
    const n = typeof score === 'number' ? score : 0;
    if (n >= 80) return { label: '今日優先', className: 'pickup-judgment-high' };
    if (n >= 60) return { label: '候補', className: 'pickup-judgment-mid' };
    return { label: '様子見', className: 'pickup-judgment-low' };
  },

  getTopDemandPickups(pickups, date) {
    const today = date || new Date().toISOString().slice(0, 10);
    return (pickups || [])
      .filter(p => p.date === today && p.status === 'open')
      .map(p => this.normalizePickup(p))
      .sort((a, b) => b.demandScore - a.demandScore)
      .slice(0, 3);
  },

  getTodayUsedPickups(pickups, date) {
    const today = date || new Date().toISOString().slice(0, 10);
    return (pickups || [])
      .filter(p => p.date === today && p.status === 'used')
      .map(p => this.normalizePickup(p))
      .sort((a, b) => b.demandScore - a.demandScore);
  },

  getTodayPickups(pickups, date) {
    const today = date || new Date().toISOString().slice(0, 10);
    return (pickups || [])
      .filter(p => p.date === today && p.status === 'open')
      .map(p => this.normalizePickup(p))
      .sort((a, b) => b.demandScore - a.demandScore);
  },

  getTodayTop3(pickups, date) {
    return this.getTopDemandPickups(pickups, date);
  },

  buildDemandComment(pickups, date) {
    const top3 = this.getTopDemandPickups(pickups, date);
    if (!top3.length) {
      return '今日の需要ピックアップはまだありません。クロクロで調査した結果を貼り付けると、投稿案・営業案・広告案に変換できます。';
    }
    const top = top3[0];
    const services = top.relatedServices.slice(0, 2).join('・') || '関連サービス';
    let line = `今日の需要は「${top.topic}」が強めです。`;
    if (top.demandScore >= 80) {
      line += `${top.topic}を最優先に。`;
    }
    if (top.postTitle) {
      line += `${services}の投稿を優先してください。`;
    } else {
      line += `${services}の訴求を優先してください。`;
    }
    if (top.adTitle) line += ' 広告・LPの確認も忘れずに。';
    return line;
  },

  buildManagementDemandLine(pickups, date) {
    const top3 = this.getTopDemandPickups(pickups, date);
    if (!top3.length) return '';
    return this.buildDemandComment(pickups, date);
  },

  buildMorningDemandLines(pickups, date) {
    const top3 = this.getTopDemandPickups(pickups, date);
    return top3.map((p, i) => {
      const services = p.relatedServices.slice(0, 2).join('・');
      let hint = '';
      if (p.postTitle && services) hint = `${services}投稿を優先`;
      else if (p.postTitle) hint = p.postTitle.slice(0, 24);
      else if (services) hint = `${services}訴求`;
      else hint = (p.summary || '').slice(0, 24);
      return `${i + 1}. ${p.topic}（${p.demandScore}点） ${hint}`;
    });
  },

  buildPickupTaskDedupeKey(date, topic, actionType, rawTitle) {
    return [date, topic, actionType, rawTitle].join('|');
  },

  getPickupActionRawTitle(pickup, actionType) {
    const p = this.normalizePickup(pickup);
    if (actionType === 'post') return p.postTitle;
    if (actionType === 'sales') return p.salesTitle;
    if (actionType === 'ad') return p.adTitle;
    return '';
  },

  buildDailyTaskFromPickup(pickup, actionType) {
    const p = this.normalizePickup(pickup);
    const reason = `今日の需要ピックアップ「${p.topic}」から`;
    const rawTitle = this.getPickupActionRawTitle(pickup, actionType);
    if (actionType === 'post' && rawTitle) {
      return { title: `投稿する：${rawTitle}`, reason, priority: '中', actionType, rawTitle, topic: p.topic };
    }
    if (actionType === 'sales' && rawTitle) {
      return { title: `営業する：${rawTitle}`, reason, priority: '中', actionType, rawTitle, topic: p.topic };
    }
    if (actionType === 'ad' && rawTitle) {
      return { title: `広告確認：${rawTitle}`, reason, priority: '中', actionType, rawTitle, topic: p.topic };
    }
    return null;
  },

  createTestPickup(date) {
    const today = date || new Date().toISOString().slice(0, 10);
    return {
      date: today,
      source: 'クロクロ',
      topic: '湿気・カビ',
      summary: '沖縄は湿度が高く、エアコン内部のカビ・臭い訴求が合いそう。',
      demandScore: 82,
      relatedServices: ['エアコン完全分解', '洗濯機クリーニング'],
      suggestedActions: [
        { type: 'post', title: 'エアコン内部のカビ注意リール', channel: 'Instagram' },
        { type: 'sales', title: '過去の完全分解見込み客へLINE' },
        { type: 'ad', title: '完全分解LPを強める' }
      ],
      memo: 'テストデータ',
      status: 'open',
      isTest: true
    };
  },

  _addDays(dateStr, offset) {
    const d = new Date((dateStr || new Date().toISOString().slice(0, 10)) + 'T12:00:00');
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  },

  filterPickupsByPeriod(pickups, today, period) {
    const t = today || new Date().toISOString().slice(0, 10);
    const list = pickups || [];
    if (period === 'all') return list;
    if (period === 'month') {
      const monthKey = t.slice(0, 7);
      return list.filter(p => (p.date || '').slice(0, 7) === monthKey);
    }
    const start = this._addDays(t, -6);
    return list.filter(p => {
      const d = p.date || '';
      return d >= start && d <= t;
    });
  },

  getWeeklyServiceFocus(pickups, today, period) {
    const filtered = this.filterPickupsByPeriod(pickups, today, period);
    const scores = {};
    const reasonMap = {};

    const addScore = (svc, pts, reason) => {
      if (!svc) return;
      scores[svc] = (scores[svc] || 0) + pts;
      if (!reasonMap[svc]) reasonMap[svc] = [];
      if (reason && !reasonMap[svc].includes(reason)) reasonMap[svc].push(reason);
    };

    filtered.forEach(raw => {
      const p = this.normalizePickup(raw);
      if (p.status === 'ignored' || p.status === 'archived') return;
      let bonus = 0;
      if (p.demandScore >= 80) bonus = 3;
      else if (p.demandScore >= 60) bonus = 2;
      (p.relatedServices || []).forEach(svc => {
        addScore(svc, 1 + bonus, null);
        if (bonus >= 2 && p.topic) {
          addScore(svc, 0, `「${p.topic}」需要（${p.demandScore}点）`);
        }
      });
    });

    this.getWinningPatterns(filtered).forEach(w => {
      (w.relatedServices || []).forEach(svc => {
        addScore(svc, 3, `「${w.topic}」で反応あり`);
      });
    });

    filtered.forEach(raw => {
      this.EXECUTION_TYPES.forEach(type => {
        const evalResult = this.evaluateActionDecision(raw, type, [], []);
        if (evalResult.decision === 'grow') {
          (evalResult.relatedServices || []).forEach(svc => {
            addScore(svc, 5, `「${evalResult.topic}」で増やす判断`);
          });
        } else if (evalResult.decision === 'continue') {
          (evalResult.relatedServices || []).forEach(svc => {
            addScore(svc, 2, `「${evalResult.topic}」で継続判断`);
          });
        }
      });
    });

    return Object.entries(scores)
      .map(([service, score]) => ({
        service,
        score,
        reasons: reasonMap[service] || [],
        reasonText: this._buildServiceReason(service, reasonMap[service] || [], filtered)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  },

  _buildServiceReason(service, reasons, pickups) {
    const good = reasons.find(r => r.includes('反応あり'));
    if (good) {
      const topic = good.replace(/「|」で反応あり/g, '');
      return `${topic}需要が強く、反応ありの投稿があります。`;
    }
    const demandReasons = reasons.filter(r => r.includes('需要'));
    if (demandReasons.length >= 2) {
      return `カビ・臭い系の需要ピックアップが複数あります。`;
    }
    if (demandReasons.length === 1) {
      return demandReasons[0].replace(/需要（\d+点）/, '需要が注目されています。');
    }
    const count = pickups.filter(raw => {
      const p = this.normalizePickup(raw);
      return (p.relatedServices || []).includes(service);
    }).length;
    if (count >= 2) return `今週の需要ピックアップに${count}件含まれています。`;
    return '今週の需要データから注目されています。';
  },

  getWeeklyPostPlan(pickups, today, period) {
    const filtered = this.filterPickupsByPeriod(pickups, today, period);
    const plan = [];
    const seen = new Set();

    const addPlan = (text, count, topic, kind) => {
      const key = text;
      if (seen.has(key)) return;
      seen.add(key);
      plan.push({ text, count: count || 1, topic: topic || '', kind: kind || 'post', short: text });
    };

    this.getWinningPatterns(filtered)
      .filter(w => w.type === 'reel' || w.type === 'instagram')
      .forEach(w => {
        const isReel = w.type === 'reel';
        const label = isReel ? `${w.topic}系の実写リール` : `${w.topic}の投稿`;
        addPlan(`${label}を${isReel ? 2 : 1}本`, isReel ? 2 : 1, w.topic, isReel ? 'reel' : 'instagram');
      });

    this.getTopPerformanceRanking(filtered, [], [], 3)
      .filter(e => e.judgment === 'has_result' && (e.type === 'reel' || e.type === 'instagram'))
      .forEach(e => {
        const isReel = e.type === 'reel';
        const label = isReel ? `${e.topic}系の実写リール（成果あり）` : `${e.topic}の投稿（成果あり）`;
        addPlan(`${label}を${isReel ? 2 : 1}本`, isReel ? 2 : 1, e.topic, isReel ? 'reel' : 'instagram');
      });

    this.getFocusRecommendations(filtered, [], [], 5).forEach(f => {
      if (f.decision === 'grow' && (f.type === 'reel' || f.type === 'instagram')) {
        const isReel = f.type === 'reel';
        addPlan(`${f.topic}の${isReel ? '続編リール' : '続編投稿'}を${isReel ? 2 : 1}本（増やす）`, isReel ? 2 : 1, f.topic, isReel ? 'reel' : 'instagram');
      } else if (f.decision === 'continue' && (f.type === 'reel' || f.type === 'instagram')) {
        addPlan(`${f.topic}の投稿を継続（続ける）`, 1, f.topic, f.type === 'reel' ? 'reel' : 'instagram');
      }
    });

    filtered.forEach(raw => {
      const p = this.normalizePickup(raw);
      if (p.status === 'ignored' || p.status === 'archived') return;
      if (p.demandScore < 60 && !p.postTitle) return;
      const topic = p.topic;
      if (!topic) return;
      const postTitle = p.postTitle || '';
      if (/リール|reel/i.test(postTitle) || /リール|reel/i.test(topic)) {
        addPlan(`${topic}系の実写リールを1本`, 1, topic, 'reel');
      } else if (/洗濯|カビ|臭い/i.test(topic + postTitle)) {
        addPlan(`${topic}のカビ注意投稿を1本`, 1, topic, 'post');
      } else if (/完全分解|ビフォー|アフター/i.test(topic + postTitle)) {
        addPlan(`${topic}のビフォーアフター投稿を1本`, 1, topic, 'post');
      } else if (p.postTitle) {
        addPlan(`${p.postTitle}を1本`, 1, topic, 'post');
      }
    });

    return plan.slice(0, 6);
  },

  getWeeklyAdPlan(pickups, today, period) {
    const filtered = this.filterPickupsByPeriod(pickups, today, period);
    const plan = [];
    const seen = new Set();

    const addPlan = (text, topic, kind) => {
      if (seen.has(text)) return;
      seen.add(text);
      plan.push({ text, topic: topic || '', kind: kind || 'ad', short: text });
    };

    this.getImprovementCandidates(filtered)
      .filter(c => c.type === 'ad')
      .forEach(c => {
        const effect = c.resultMemo || '';
        if (/クリック/.test(effect) && /問い合わせなし|相談なし/.test(effect)) {
          addPlan(`${c.topic}の広告はCTAを確認`, c.topic, 'cta-check');
        } else {
          addPlan(`${c.topic}の広告文を見直す`, c.topic, 'ad-review');
        }
      });

    this.getPerformanceImprovementCandidates(filtered, [], [])
      .filter(c => c.type === 'ad')
      .forEach(c => {
        addPlan(`${c.topic}の広告はCTAを確認（成果未達）`, c.topic, 'cta-check');
      });

    this.getStopOrImproveCandidates(filtered, [], [])
      .filter(c => c.type === 'ad' && c.decision === 'improve')
      .forEach(c => {
        addPlan(`${c.topic}の広告はCTA改善（施策判断）`, c.topic, 'cta-check');
      });

    this.getStopOrImproveCandidates(filtered, [], [])
      .filter(c => c.decision === 'stop')
      .forEach(c => {
        addPlan(`【今週やらない】${c.topic}の${c.shortLabel}`, c.topic, 'skip');
      });

    filtered.forEach(raw => {
      const p = this.normalizePickup(raw);
      if (!p.adTitle) return;
      if (/LP|完全分解/i.test(p.adTitle)) {
        addPlan(`${p.adTitle}を見直す`, p.topic, 'ad-review');
      } else if (/テスト|訴求/i.test(p.adTitle)) {
        addPlan(`${p.adTitle}`, p.topic, 'ad-test');
      } else {
        addPlan(`${p.adTitle}の訴求をテストする`, p.topic, 'ad-test');
      }
    });

    const hasClickNoInquiry = this.getImprovementCandidates(filtered).some(c =>
      /クリック/.test(c.resultMemo || '') && /問い合わせなし|相談なし|反応薄い/.test(c.resultMemo || '')
    );
    if (hasClickNoInquiry && !seen.has('クリックあり問い合わせなしの案件はCTAを確認')) {
      addPlan('クリックあり問い合わせなしの案件はCTAを確認', '', 'cta-check');
    }

    return plan.slice(0, 5);
  },

  getWeeklySalesPlan(ctx) {
    const today = ctx.today || new Date().toISOString().slice(0, 10);
    const enriched = ctx.enriched || [];
    const records = ctx.records || [];
    const leads = ctx.leads || [];
    const weekEnd = this._addDays(today, 7);
    const lines = [];
    const seen = new Set();

    const addLine = text => {
      if (!text || seen.has(text)) return;
      seen.add(text);
      lines.push(text);
    };

    const dueSoon = enriched.filter(l => {
      const nc = l.nextActionDate || l.nextContact || '';
      return nc && nc >= today && nc <= weekEnd && !['NG', '見送り', '成約'].includes(l.status);
    });
    if (dueSoon.length) addLine('次回連絡日が近い営業先を優先');

    const Revenue = typeof RevenueBrain !== 'undefined' ? RevenueBrain : null;
    if (Revenue) {
      const holds = Revenue.getSalesHoldCandidates(records, leads, today);
      if (holds.length) addLine('営業保留中の案件は追加営業しない');

      const nextSales = Revenue.getNextSalesCandidates(records, leads, today);
      const withRevenue = nextSales.filter(c => (c.total || 0) > 0);
      if (withRevenue.length) addLine('売上が出た営業先へお礼連絡と次回提案');
    }

    if (!lines.length) addLine('営業先を登録し、次回連絡日を設定すると方針が出ます');

    return lines;
  },

  getWeeklyActionTasks(strategy) {
    const tasks = [];
    const seen = new Set();

    (strategy.postPlan || []).slice(0, 3).forEach(item => {
      const title = `今週やる：${item.text}`;
      const key = title;
      if (seen.has(key)) return;
      seen.add(key);
      tasks.push({
        title,
        reason: '週間作戦ボード（投稿方針）',
        priority: '中',
        taskKind: 'weekly-post',
        topic: item.topic || item.text
      });
    });

    (strategy.adPlan || []).slice(0, 2).forEach(item => {
      const title = `今週やる：${item.text}`;
      if (seen.has(title)) return;
      seen.add(title);
      tasks.push({
        title,
        reason: '週間作戦ボード（広告方針）',
        priority: '中',
        taskKind: 'weekly-ad',
        topic: item.topic || item.text
      });
    });

    (strategy.salesPlan || []).slice(0, 1).forEach(line => {
      let title = '';
      if (line.includes('次回連絡日')) title = '今週やる：次回連絡日の営業先を確認する';
      else if (line.includes('お礼')) title = '今週やる：売上が出た営業先へお礼連絡する';
      else title = `今週やる：${line}`;
      if (seen.has(title)) return;
      seen.add(title);
      tasks.push({
        title,
        reason: '週間作戦ボード（営業方針）',
        priority: '中',
        taskKind: 'weekly-sales',
        topic: line
      });
    });

    return tasks;
  },

  buildWeeklyStrategyComment(strategy) {
    if (!strategy.hasData) return [];
    const lines = [];
    const topSvc = (strategy.serviceFocus || [])[0];
    const topWin = (strategy.winningPatterns || [])[0];

    if (topSvc) {
      const topicHint = topWin ? topWin.topic : (strategy.postPlan[0] && strategy.postPlan[0].topic);
      if (topicHint) {
        lines.push(`今週は${topicHint}需要が強めです。`);
      } else {
        lines.push(`今週は${topSvc.service}需要が強めです。`);
      }
    } else if (strategy.postPlan.length) {
      lines.push(`今週は${strategy.postPlan[0].topic || '投稿'}テーマが注目されています。`);
    }

    const postHint = (strategy.postPlan || [])[0];
    const adHint = (strategy.adPlan || [])[0];
    if (postHint && adHint) {
      const postShort = postHint.text.replace(/を\d+本$/, '');
      const adShort = adHint.text.includes('CTA') ? 'CTAの見直し' : adHint.text;
      lines.push(`${postShort}を優先し、広告は${adShort}を行いましょう。`);
    } else if (postHint) {
      lines.push(`${postHint.text}を優先しましょう。`);
    } else if (adHint) {
      lines.push(`広告は${adHint.text}を行いましょう。`);
    }

    const salesLines = strategy.salesPlan || [];
    if (salesLines.length) {
      const salesText = salesLines.slice(0, 2).join('。');
      lines.push(salesText + (salesText.endsWith('。') ? '' : '。') + '次回連絡日のある営業先を優先してください。');
    }

    const perfSummary = strategy.performanceSummary;
    if (perfSummary && perfSummary.hasData) {
      if (perfSummary.highlights.length) {
        lines.push(`成果が出た施策：${perfSummary.highlights[0]}を続けましょう。`);
      }
      if (perfSummary.salesAmount > 0) {
        lines.push(`施策経由の売上 ${perfSummary.salesAmount.toLocaleString('ja-JP')}円。勝ちパターンを横展開しましょう。`);
      }
    }

    const perfImprove = (strategy.performanceImprovements || [])[0];
    if (perfImprove) {
      lines.push(`${perfImprove.topic}の${perfImprove.type === 'ad' ? '広告' : '施策'}は改善候補です。`);
    }

    const topFocus = (strategy.focusRecommendations || [])[0];
    if (topFocus) {
      lines.push(`${topFocus.topic}は${topFocus.decisionLabel}判断。${topFocus.reason.split('。')[0]}。`);
    }

    const stopCand = (strategy.stopOrImproveCandidates || []).find(c => c.decision === 'stop');
    if (stopCand) {
      lines.push(`${stopCand.topic}は停止候補。今週は優先度を下げましょう。`);
    }

    const growServices = (strategy.serviceFocusInsights || []).filter(s => s.decision === 'grow');
    if (growServices.length) {
      lines.push(`${growServices[0].service}は勝ち筋。${growServices[0].nextStep}`);
    }

    return lines.slice(0, 5);
  },

  buildMorningWeeklyLines(strategy, max) {
    const limit = max || 3;
    const lines = [];
    (strategy.postPlan || []).slice(0, 1).forEach(p => {
      if (p.kind === 'reel') lines.push(`・${p.topic || p.text}系リールを優先`);
      else lines.push(`・${p.topic || p.text}投稿を優先`);
    });
    (strategy.adPlan || []).slice(0, 1).forEach(a => {
      if (a.text.includes('CTA')) lines.push(`・${a.topic || '広告'}のCTA確認`);
      else lines.push(`・${a.text.replace(/を見直す$/, '')}を見直し`);
    });
    (strategy.salesPlan || []).slice(0, 1).forEach(s => {
      if (s.includes('次回連絡日')) lines.push('・次回連絡日の営業先を確認');
    });
    return lines.slice(0, limit);
  },

  buildWeeklyTaskDedupeKey(date, taskKind, title) {
    return [date, 'weekly', taskKind, title].join('|');
  },

  buildWeeklyStrategy(context) {
    const today = context.today || new Date().toISOString().slice(0, 10);
    const period = context.period || '7d';
    const pickups = context.pickups || [];
    const records = context.records || [];
    const filtered = this.filterPickupsByPeriod(pickups, today, period);

    const serviceFocus = this.getWeeklyServiceFocus(pickups, today, period);
    const postPlan = this.getWeeklyPostPlan(pickups, today, period);
    const adPlan = this.getWeeklyAdPlan(pickups, today, period);
    const salesPlan = this.getWeeklySalesPlan(context);
    const winningPatterns = this.getWinningPatterns(filtered);
    const improvementCandidates = this.getImprovementCandidates(filtered);
    const performanceRanking = this.getTopPerformanceRanking(filtered, records, context.leads || [], 5);
    const revenueLinked = this.getRevenueLinkedActions(filtered, records, context.leads || []);
    const performanceImprovements = this.getPerformanceImprovementCandidates(filtered, records, context.leads || []);
    const performanceSummary = this.getWeeklyPerformanceSummary(pickups, today, records, context.leads || []);
    const decisionInsights = this.getActionDecisionInsights(filtered, records, context.leads || [], today);
    const focusRecommendations = this.getFocusRecommendations(filtered, records, context.leads || [], 3, today);
    const stopOrImproveCandidates = this.getStopOrImproveCandidates(filtered, records, context.leads || []);
    const serviceFocusInsights = this.getServiceFocusInsights(filtered, records, context.leads || []);

    const strategy = {
      period,
      today,
      serviceFocus,
      postPlan,
      adPlan,
      salesPlan,
      winningPatterns,
      improvementCandidates,
      performanceRanking,
      revenueLinked,
      performanceImprovements,
      performanceSummary,
      decisionInsights,
      focusRecommendations,
      stopOrImproveCandidates,
      serviceFocusInsights,
      hasData: !!(serviceFocus.length || postPlan.length || adPlan.length ||
        winningPatterns.length || improvementCandidates.length || filtered.length ||
        performanceRanking.length || revenueLinked.length || decisionInsights.total)
    };

    strategy.comment = this.buildWeeklyStrategyComment(strategy);
    strategy.actionTasks = this.getWeeklyActionTasks(strategy);
    strategy.morningLines = this.buildMorningWeeklyLines(strategy, 3);
    return strategy;
  },

  WEEKDAY_LABELS: ['日', '月', '火', '水', '木', '金', '土'],

  getSevenDayCalendar(today) {
    const t = today || new Date().toISOString().slice(0, 10);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = this._addDays(t, i);
      const d = new Date(date + 'T12:00:00');
      days.push({
        date,
        weekday: this.WEEKDAY_LABELS[d.getDay()],
        offset: i,
        isToday: i === 0
      });
    }
    return days;
  },

  getCalendarItemStatusLabel(item) {
    const type = item.execType || item.type;
    const meta = type ? this.EXECUTION_META[type] : null;
    const status = item.status || 'draft';

    if (item.kind === 'manual') {
      if (status === 'done' || item.completed) return '完了済み';
      if (status === 'snoozed') return '後回し';
      if (item.inDailyTasks) return '今日やること追加済み';
      return '未完了';
    }

    if (status === 'skipped') return '後回し';
    if (meta && this.isExecutionDone(type, status)) {
      const done = meta.statuses.find(s => s.value === 'posted');
      return done ? done.label : '完了済み';
    }
    if (status === 'scheduled' && meta) {
      const s = meta.statuses.find(x => x.value === 'scheduled');
      return s ? s.label : '予定あり';
    }
    if (status === 'draft') return '下書き';
    if (item.inDailyTasks) return '今日やること追加済み';
    if (item.overdue) return '期限超過';
    return this.getExecutionStatusLabel(type, status) || status;
  },

  getOverdueExecutionItems(pickups, today, dailyTaskKeys) {
    const t = today || new Date().toISOString().slice(0, 10);
    const items = [];
    (pickups || []).forEach(raw => {
      const p = this.normalizePickup(raw);
      if (p.status !== 'open' && p.status !== 'used') return;
      const exec = this.normalizeExecutionStatus(raw);
      this.EXECUTION_TYPES.forEach(type => {
        const ex = exec[type];
        const scheduled = ex.scheduledDate;
        if (!scheduled || scheduled >= t) return;
        if (!this.isExecutionPending(type, ex)) return;
        const meta = this.EXECUTION_META[type];
        const title = `${meta.dashPrefix}：${p.topic}`;
        const dedupeKey = this.buildExecutionTaskDedupeKey(t, p.topic, type, `${meta.taskTitle}：${p.topic}`);
        items.push({
          id: `exec-overdue-${p.id}-${type}`,
          kind: 'execution',
          date: t,
          scheduledDate: scheduled,
          title,
          label: meta.dashPrefix,
          topic: p.topic,
          status: ex.status,
          statusLabel: '期限超過',
          pickupId: p.id,
          execType: type,
          completed: false,
          overdue: true,
          inDailyTasks: (dailyTaskKeys || new Set()).has(dedupeKey),
          dedupeKey
        });
      });
    });
    return items;
  },

  getActionCalendarItems(pickups, manualTasks, taskStates, today) {
    const t = today || new Date().toISOString().slice(0, 10);
    const end = this._addDays(t, 6);
    const items = [];
    const dailyTaskKeys = new Set();
    (manualTasks || []).forEach(mt => {
      if (mt.pickupDedupeKey) dailyTaskKeys.add(mt.pickupDedupeKey);
    });

    (pickups || []).forEach(raw => {
      const p = this.normalizePickup(raw);
      if (p.status !== 'open' && p.status !== 'used') return;
      const exec = this.normalizeExecutionStatus(raw);
      this.EXECUTION_TYPES.forEach(type => {
        const ex = exec[type];
        const scheduled = ex.scheduledDate;
        if (!scheduled || scheduled < t || scheduled > end) return;
        const meta = this.EXECUTION_META[type];
        const title = `${meta.dashPrefix}：${p.topic}`;
        const dedupeKey = this.buildExecutionTaskDedupeKey(scheduled, p.topic, type, `${meta.taskTitle}：${p.topic}`);
        items.push({
          id: `exec-${p.id}-${type}`,
          kind: 'execution',
          date: scheduled,
          title,
          label: meta.dashPrefix,
          topic: p.topic,
          status: ex.status,
          statusLabel: this.getCalendarItemStatusLabel({ kind: 'execution', execType: type, status: ex.status, inDailyTasks: dailyTaskKeys.has(dedupeKey) }),
          pickupId: p.id,
          execType: type,
          completed: this.isExecutionDone(type, ex.status),
          inDailyTasks: dailyTaskKeys.has(dedupeKey),
          dedupeKey
        });
      });
    });

    (manualTasks || []).forEach(mt => {
      const due = mt.dueDate;
      if (!due || due < t || due > end) return;
      const doneState = (taskStates || []).find(s => s.taskId === mt.id && s.status === 'done');
      const isDone = !!(doneState || mt.status === 'done');
      items.push({
        id: `manual-${mt.id}`,
        kind: 'manual',
        date: due,
        title: mt.title || '',
        label: mt.title || '',
        topic: mt.pickupTopic || '',
        status: isDone ? 'done' : (mt.status || 'open'),
        statusLabel: this.getCalendarItemStatusLabel({ kind: 'manual', status: mt.status, completed: isDone, inDailyTasks: true }),
        taskId: mt.id,
        completed: isDone,
        inDailyTasks: true,
        dedupeKey: mt.pickupDedupeKey || this.buildCalendarTaskDedupeKey(due, mt.title, 'manual', mt.pickupTopic || '')
      });
    });

    return items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  },

  groupCalendarItemsByDay(items, days, pickups, today, dailyTaskKeys) {
    const byDay = {};
    (days || []).forEach(d => { byDay[d.date] = []; });
    (items || []).forEach(item => {
      if (byDay[item.date]) byDay[item.date].push(item);
    });
    const overdue = this.getOverdueExecutionItems(pickups, today, dailyTaskKeys);
    overdue.forEach(item => {
      if (!byDay[today].some(x => x.id === item.id)) byDay[today].push(item);
    });
    return byDay;
  },

  getUnscheduledWeeklyCandidates(strategy, manualTasks, pickups, today) {
    const candidates = (strategy && strategy.actionTasks) || [];
    if (!candidates.length) return [];
    const t = today || new Date().toISOString().slice(0, 10);
    const end = this._addDays(t, 6);
    const scheduledTitles = new Set();

    (manualTasks || []).forEach(mt => {
      if (mt.title) scheduledTitles.add(mt.title);
    });

    (pickups || []).forEach(raw => {
      const exec = this.normalizeExecutionStatus(raw);
      this.EXECUTION_TYPES.forEach(type => {
        const scheduled = exec[type].scheduledDate;
        if (scheduled && scheduled >= t && scheduled <= end) {
          const p = this.normalizePickup(raw);
          const meta = this.EXECUTION_META[type];
          scheduledTitles.add(`${meta.dashPrefix}：${p.topic}`);
        }
      });
    });

    return candidates
      .map((task, index) => ({ ...task, index }))
      .filter(task => !scheduledTitles.has(task.title));
  },

  buildCalendarTaskDedupeKey(date, title, kind, topic) {
    return [date, title, kind, topic || ''].join('|');
  },

  createCalendarTaskPayload(item) {
    return {
      title: item.title,
      reason: `投稿・広告カレンダー（${item.date}）`,
      priority: '中',
      kind: item.kind || 'calendar',
      topic: item.topic || '',
      execType: item.execType || '',
      pickupId: item.pickupId || ''
    };
  },

  getTodayScheduleItems(pickups, manualTasks, taskStates, today) {
    const t = today || new Date().toISOString().slice(0, 10);
    const dailyTaskKeys = new Set();
    (manualTasks || []).forEach(mt => { if (mt.pickupDedupeKey) dailyTaskKeys.add(mt.pickupDedupeKey); });
    const weekItems = this.getActionCalendarItems(pickups, manualTasks, taskStates, t);
    const todayItems = weekItems.filter(i => i.date === t);
    const overdue = this.getOverdueExecutionItems(pickups, t, dailyTaskKeys);
    const merged = [...todayItems];
    overdue.forEach(o => {
      if (!merged.some(x => x.pickupId === o.pickupId && x.execType === o.execType)) merged.push(o);
    });
    return merged.filter(i => !i.completed);
  },

  buildDashboardScheduleLines(items) {
    return (items || []).map(i => `${i.label}：${i.topic || i.title.replace(/^[^:]+：/, '')}`);
  },

  buildMorningScheduleLines(items) {
    return (items || []).map((i, idx) => {
      const meta = i.execType ? this.EXECUTION_META[i.execType] : null;
      const prefix = meta ? meta.shortLabel : (i.label || i.title).split('：')[0];
      const topic = i.topic || i.title.replace(/^[^:]+：/, '');
      return `${idx + 1}. ${prefix}：${topic}`;
    });
  },

  buildTodayScheduleComment(items) {
    if (items && items.length) return '';
    return '今日の投稿・広告予定はありません。週間作戦から1件入れると、今日やることに反映できます。';
  },

  PERFORMANCE_CONVERSION_KEYWORDS: ['問い合わせ', '予約', '売上', 'LINE相談'],
  PERFORMANCE_REACTION_KEYWORDS: ['反応あり', '保存', 'クリック'],
  PERFORMANCE_BAD_KEYWORDS: ['反応なし', '問い合わせなし', 'クリックなし'],

  evaluatePerformanceResult(pickup, type, revenues, leads) {
    const p = this.normalizePickup(pickup);
    const exec = this.normalizeExecutionStatus(pickup);
    const item = exec[type] || this.EXECUTION_DEFAULT;
    const meta = this.EXECUTION_META[type] || {};
    const metrics = item.metrics || this.normalizePerformanceMetrics(item);
    const resultMemo = (item.resultMemo || '').trim();
    const nextImproveMemo = (item.nextImproveMemo || '').trim();
    const relatedRevenueIds = item.relatedRevenueIds || [];
    const relatedLeadIds = item.relatedLeadIds || [];
    const revList = revenues || [];
    const hasRelatedRevenue = relatedRevenueIds.some(id => revList.find(r => r.id === id));
    const hasInput = this.hasPerformanceInput(item);
    const isDone = this.isExecutionDone(type, item.status);

    let totalSalesAmount = metrics.salesAmount || 0;
    relatedRevenueIds.forEach(id => {
      const rev = revList.find(r => r.id === id);
      if (rev) totalSalesAmount += Number(rev.amount || 0);
    });

    const goodMemo = this.PERFORMANCE_CONVERSION_KEYWORDS.some(kw => resultMemo.includes(kw));
    const reactionMemo = this.PERFORMANCE_REACTION_KEYWORDS.some(kw => resultMemo.includes(kw));
    const badMemo = this.PERFORMANCE_BAD_KEYWORDS.some(kw => resultMemo.includes(kw));

    const hasConversion = (metrics.lineInquiries || 0) >= 1 ||
      (metrics.reservations || 0) >= 1 ||
      (metrics.salesAmount || 0) > 0 ||
      hasRelatedRevenue || goodMemo;

    const hasReaction = (metrics.views || 0) > 0 ||
      (metrics.reactions || 0) > 0 ||
      (metrics.clicks || 0) > 0 || reactionMemo;

    let judgment = 'not_entered';
    let judgmentLabel = '成果未入力';
    let recommendation = '実行後の反応をメモすると、次回の改善に使えます。';

    if (hasConversion) {
      judgment = 'has_result';
      judgmentLabel = '成果あり';
      recommendation = 'この施策は問い合わせ・売上につながった可能性があります。続編候補です。';
    } else if (hasReaction && hasInput) {
      judgment = 'has_reaction';
      judgmentLabel = '反応あり';
      recommendation = '反応はあります。次はLINE相談や予約につなげるCTAを強めましょう。';
    } else if (isDone && (badMemo || (hasInput && !hasReaction && !hasConversion))) {
      judgment = 'needs_improvement';
      judgmentLabel = '改善必要';
      recommendation = '冒頭・実写量・CTA・LP導線を見直しましょう。';
    } else if (!hasInput && isDone) {
      judgment = 'not_entered';
    }

    const nextAction = nextImproveMemo || recommendation;
    return {
      pickupId: p.id,
      topic: p.topic,
      relatedServices: p.relatedServices,
      type,
      channelLabel: meta.label || type,
      shortLabel: meta.shortLabel || type,
      executedAt: item.executedAt || '',
      resultMemo,
      nextImproveMemo,
      metrics,
      relatedLeadIds,
      relatedRevenueIds,
      totalSalesAmount,
      judgment,
      judgmentLabel,
      recommendation,
      nextAction,
      isDone,
      hasInput
    };
  },

  _collectPerformanceEntries(pickups, revenues, leads, today) {
    const t = today || new Date().toISOString().slice(0, 10);
    const entries = [];
    (pickups || []).forEach(raw => {
      const exec = this.normalizeExecutionStatus(raw);
      this.EXECUTION_TYPES.forEach(type => {
        const item = exec[type];
        const evalResult = this.evaluatePerformanceResult(raw, type, revenues, leads);
        const scheduled = item.scheduledDate;
        const isDone = this.isExecutionDone(type, item.status);
        const scheduledPast = !!(scheduled && scheduled < t);
        const hasResultMemo = !!(item.resultMemo && item.resultMemo.trim());
        const hasPerfInput = this.hasPerformanceInput(item);
        if (!isDone && !scheduledPast && !hasResultMemo && !hasPerfInput) return;
        entries.push({
          ...evalResult,
          executedAt: item.executedAt || scheduled || '',
          scheduledDate: scheduled
        });
      });
    });
    return entries.sort((a, b) => (b.executedAt || '').localeCompare(a.executedAt || ''));
  },

  getPerformanceInsights(pickups, revenues, leads, today) {
    const entries = this._collectPerformanceEntries(pickups, revenues, leads, today);
    let hasResultCount = 0;
    let hasReactionCount = 0;
    let needsImprovementCount = 0;
    let notEnteredCount = 0;
    entries.forEach(e => {
      if (e.judgment === 'has_result') hasResultCount++;
      else if (e.judgment === 'has_reaction') hasReactionCount++;
      else if (e.judgment === 'needs_improvement') needsImprovementCount++;
      else notEnteredCount++;
    });
    return {
      entries,
      hasResultCount,
      hasReactionCount,
      needsImprovementCount,
      notEnteredCount,
      total: entries.length
    };
  },

  _scorePerformanceEntry(entry) {
    const m = entry.metrics || {};
    return (m.lineInquiries || 0) * 100 +
      (m.reservations || 0) * 200 +
      (entry.totalSalesAmount || m.salesAmount || 0);
  },

  getTopPerformanceRanking(pickups, revenues, leads, max) {
    const limit = max || 5;
    return this._collectPerformanceEntries(pickups, revenues, leads)
      .filter(e => e.judgment === 'has_result' || e.judgment === 'has_reaction' || this._scorePerformanceEntry(e) > 0)
      .sort((a, b) => this._scorePerformanceEntry(b) - this._scorePerformanceEntry(a))
      .slice(0, limit)
      .map(e => ({
        ...e,
        nextGrowPlan: e.nextImproveMemo || '同じテーマで実写多めの続編'
      }));
  },

  getRevenueLinkedActions(pickups, revenues, leads) {
    return this._collectPerformanceEntries(pickups, revenues, leads)
      .filter(e => (e.totalSalesAmount || 0) > 0 || (e.relatedRevenueIds || []).length > 0)
      .sort((a, b) => (b.totalSalesAmount || 0) - (a.totalSalesAmount || 0));
  },

  getPerformanceImprovementCandidates(pickups, revenues, leads) {
    return this._collectPerformanceEntries(pickups, revenues, leads)
      .filter(e => e.judgment === 'needs_improvement')
      .map(e => {
        const m = e.metrics || {};
        let resultSummary = e.resultMemo || '';
        if (!resultSummary) {
          const parts = [];
          if ((m.clicks || 0) > 0) parts.push('クリックあり');
          if ((m.views || 0) > 0 || (m.reactions || 0) > 0) parts.push('反応あり');
          parts.push('問い合わせなし');
          resultSummary = parts.join(' / ');
        }
        return {
          ...e,
          resultSummary,
          improvePlan: e.nextImproveMemo || e.recommendation
        };
      });
  },

  getWeeklyPerformanceSummary(pickups, today, revenues, leads) {
    const t = today || new Date().toISOString().slice(0, 10);
    const start = this._addDays(t, -6);
    const entries = this._collectPerformanceEntries(pickups, revenues, leads, t)
      .filter(e => {
        const d = (e.executedAt || '').slice(0, 10);
        return d && d >= start && d <= t && e.judgment !== 'not_entered';
      });
    let lineInquiries = 0;
    let reservations = 0;
    let salesAmount = 0;
    const highlights = [];
    entries.forEach(e => {
      const m = e.metrics || {};
      lineInquiries += m.lineInquiries || 0;
      reservations += m.reservations || 0;
      salesAmount += e.totalSalesAmount || m.salesAmount || 0;
      if (e.judgment === 'has_result' && highlights.length < 3) {
        highlights.push(`${e.topic} ${e.shortLabel}`);
      }
    });
    return {
      lineInquiries,
      reservations,
      salesAmount,
      highlights,
      hasData: entries.length > 0
    };
  },

  buildPerformanceComment(pickups, revenues, leads) {
    const summary = this.getWeeklyPerformanceSummary(pickups, undefined, revenues, leads);
    if (!summary.hasData) return [];
    const lines = [];
    if (summary.lineInquiries) lines.push(`LINE相談 ${summary.lineInquiries}件`);
    if (summary.reservations) lines.push(`予約 ${summary.reservations}件`);
    if (summary.salesAmount) lines.push(`施策経由売上 ${summary.salesAmount.toLocaleString('ja-JP')}円`);
    summary.highlights.slice(0, 2).forEach(h => lines.push(`成果あり：${h}`));
    return lines;
  },

  buildMorningPerformanceLines(pickups, revenues, leads, max) {
    const limit = max || 3;
    const entries = this._collectPerformanceEntries(pickups, revenues, leads)
      .filter(e => e.judgment !== 'not_entered')
      .slice(0, limit * 2);
    const lines = [];
    entries.forEach(e => {
      if (lines.length >= limit) return;
      if (e.judgment === 'has_result') {
        const m = e.metrics || {};
        const detail = m.lineInquiries ? `LINE相談${m.lineInquiries}件` : '成果あり';
        const suffix = e.type === 'reel' ? 'リール' : (e.type === 'ad' ? '広告' : e.shortLabel);
        lines.push(`・${e.topic}${suffix}から${detail}`);
      } else if (e.judgment === 'needs_improvement') {
        const suffix = e.type === 'ad' ? '広告' : '';
        lines.push(`・${e.topic}${suffix}は問い合わせなし。CTA改善候補`);
      } else if (e.judgment === 'has_reaction') {
        lines.push(`・${e.topic}：反応あり。CTA強化候補`);
      }
    });
    return lines.slice(0, limit);
  },

  buildPerformanceTaskDedupeKey(date, topic, type, taskKind, title) {
    return [date, topic, type, taskKind, title].join('|');
  },

  createPerformanceTaskPayload(pickup, type, judgment) {
    const p = this.normalizePickup(pickup);
    const meta = this.EXECUTION_META[type];
    if (!meta) return null;
    const short = meta.shortLabel || type;
    if (judgment === 'has_result') {
      return {
        title: `続編を作る：${p.topic} ${short}`,
        reason: '施策成果でLINE相談あり',
        priority: '中',
        taskKind: 'performance-sequel',
        topic: p.topic,
        type
      };
    }
    const suffix = type === 'ad' ? '広告' : (type === 'reel' ? 'リール' : '');
    return {
      title: `改善する：${p.topic}${suffix}`,
      reason: '施策成果で問い合わせなし',
      priority: '中',
      taskKind: 'performance-improve',
      topic: p.topic,
      type
    };
  },

  formatPerformanceMetricsSummary(metrics) {
    const m = metrics || {};
    const parts = [];
    if (m.views) parts.push(`表示${m.views}`);
    if (m.reactions) parts.push(`反応${m.reactions}`);
    if (m.clicks) parts.push(`クリック${m.clicks}`);
    if (m.lineInquiries) parts.push(`LINE${m.lineInquiries}`);
    if (m.reservations) parts.push(`予約${m.reservations}`);
    if (m.salesAmount) parts.push(`${m.salesAmount.toLocaleString('ja-JP')}円`);
    return parts.length ? parts.join(' / ') : '—';
  },

  DECISION_GROW_KEYWORDS: ['予約', '売上', '問い合わせ複数', '反応良い'],
  DECISION_CONTINUE_KEYWORDS: ['反応あり', '保存', 'クリック'],
  DECISION_IMPROVE_KEYWORDS: ['問い合わせなし', '予約なし'],
  DECISION_STOP_KEYWORDS: ['反応なし', 'クリックなし', '高い', 'CPA悪い', '反応薄い'],

  calculateFocusScore(perf, decision) {
    const m = (perf && perf.metrics) || {};
    let score = 0;
    const totalSales = perf.totalSalesAmount || m.salesAmount || 0;
    if (totalSales > 0) score += 5;
    if ((perf.relatedRevenueIds || []).length > 0) score += 5;
    if ((m.reservations || 0) >= 1) score += 4;
    if ((m.lineInquiries || 0) >= 1) score += 3;
    if ((m.clicks || 0) >= 1) score += 1;
    if ((m.reactions || 0) >= 1) score += 1;
    if (perf.judgment === 'needs_improvement' || decision === 'improve') score -= 1;
    if (decision === 'stop') score -= 3;
    return score;
  },

  _buildGrowReason(perf) {
    const m = perf.metrics || {};
    const parts = [];
    if ((m.lineInquiries || 0) >= 1) parts.push(`LINE相談${m.lineInquiries}件`);
    if ((m.reservations || 0) >= 1) parts.push(`予約${m.reservations}件`);
    if ((perf.totalSalesAmount || 0) > 0) parts.push(`売上${(perf.totalSalesAmount || 0).toLocaleString('ja-JP')}円`);
    if ((perf.relatedRevenueIds || []).length > 0 && !parts.some(p => p.includes('売上'))) {
      parts.push('関連売上あり');
    }
    const detail = parts.length ? parts.join('、') + 'につながっています。' : '成果が出ています。';
    return `${detail}同じテーマで続編を作る価値があります。`;
  },

  _buildGrowNextStep(perf) {
    if (perf.nextImproveMemo) return perf.nextImproveMemo;
    if (perf.type === 'reel') return '実写多めの続編リールを作る';
    if (perf.type === 'ad') return '同テーマの広告を横展開する';
    return '同じテーマで続編を作る';
  },

  evaluateActionDecision(pickup, type, revenues, leads) {
    const perf = this.evaluatePerformanceResult(pickup, type, revenues, leads);
    const m = perf.metrics || {};
    const resultMemo = perf.resultMemo || '';
    const hasRelatedRevenue = (perf.relatedRevenueIds || []).length > 0;
    const totalSales = perf.totalSalesAmount || 0;

    let decision = 'watch';
    let decisionLabel = '様子見';
    let reason = 'まだ判断材料が少ないです。反応メモを追加してください。';
    let nextStep = perf.nextImproveMemo || perf.nextAction || '反応メモを追加する';

    const isGrow = (m.reservations || 0) >= 1 ||
      totalSales > 0 ||
      hasRelatedRevenue ||
      (m.lineInquiries || 0) >= 2 ||
      this.DECISION_GROW_KEYWORDS.some(kw => resultMemo.includes(kw));

    const isContinue = !isGrow && (
      (m.lineInquiries || 0) >= 1 ||
      (m.clicks || 0) > 0 ||
      (m.reactions || 0) > 0 ||
      this.DECISION_CONTINUE_KEYWORDS.some(kw => resultMemo.includes(kw)) ||
      perf.judgment === 'has_reaction'
    );

    const isImprove = !isGrow && !isContinue && (
      (((m.clicks || 0) > 0 || (m.views || 0) > 0 || (m.reactions || 0) > 0) && (m.lineInquiries || 0) === 0) ||
      this.DECISION_IMPROVE_KEYWORDS.some(kw => resultMemo.includes(kw)) ||
      perf.judgment === 'needs_improvement'
    );

    const isStop = !isGrow && !isContinue && !isImprove && (
      (type === 'ad' && perf.hasInput && (m.clicks || 0) === 0 && (m.lineInquiries || 0) === 0) ||
      this.DECISION_STOP_KEYWORDS.some(kw => resultMemo.includes(kw)) ||
      (perf.isDone && perf.hasInput && !((m.views || 0) + (m.reactions || 0) + (m.clicks || 0) + (m.lineInquiries || 0)))
    );

    if (isGrow) {
      decision = 'grow';
      decisionLabel = '増やす';
      reason = this._buildGrowReason(perf);
      nextStep = this._buildGrowNextStep(perf);
    } else if (isContinue) {
      decision = 'continue';
      decisionLabel = '続ける';
      reason = '反応があります。CTAを少し強めて継続しましょう。';
      nextStep = perf.nextImproveMemo || '写真相談への導線を強める';
    } else if (isImprove) {
      decision = 'improve';
      decisionLabel = '改善';
      const hasClicks = (m.clicks || 0) > 0;
      reason = hasClicks
        ? '見られてはいますが相談につながっていません。冒頭・CTA・LINE導線を見直しましょう。'
        : '反応はあるものの予約・相談につながっていません。訴求とCTAを見直しましょう。';
      nextStep = perf.nextImproveMemo || (type === 'ad' ? 'LP冒頭とLINE CTAを見直す' : '冒頭・CTA・LINE導線を見直す');
    } else if (isStop) {
      decision = 'stop';
      decisionLabel = '停止候補';
      reason = '反応が弱いです。今週は優先度を下げて別テーマを試しましょう。';
      nextStep = perf.nextImproveMemo || '今週は別テーマを優先する';
    } else if (!perf.hasInput && perf.isDone) {
      decision = 'watch';
      decisionLabel = '様子見';
      reason = 'まだ判断材料が少ないです。反応メモを追加してください。';
      nextStep = '数値成果または反応メモを入力する';
    }

    const focusScore = this.calculateFocusScore(perf, decision);
    const performanceSummary = this.formatPerformanceMetricsSummary(m);

    return {
      ...perf,
      decision,
      decisionLabel,
      reason,
      nextStep,
      focusScore,
      performanceSummary
    };
  },

  _collectDecisionEntries(pickups, revenues, leads, today) {
    const entries = [];
    (pickups || []).forEach(raw => {
      this.EXECUTION_TYPES.forEach(type => {
        const item = this.evaluateActionDecision(raw, type, revenues, leads);
        const include = item.hasInput ||
          item.isDone ||
          item.decision === 'grow' ||
          item.decision === 'improve' ||
          item.decision === 'stop' ||
          item.judgment === 'needs_improvement' ||
          (item.totalSalesAmount || 0) > 0;
        if (!include) return;
        entries.push(item);
      });
    });
    return entries.sort((a, b) => b.focusScore - a.focusScore);
  },

  getActionDecisionInsights(pickups, revenues, leads, today) {
    const entries = this._collectDecisionEntries(pickups, revenues, leads, today);
    const counts = { grow: 0, continue: 0, improve: 0, stop: 0, watch: 0 };
    entries.forEach(e => { counts[e.decision] = (counts[e.decision] || 0) + 1; });
    return { entries, counts, total: entries.length };
  },

  getFocusRecommendations(pickups, revenues, leads, max, today) {
    const limit = max || 3;
    const t = today || new Date().toISOString().slice(0, 10);
    const start = this._addDays(t, -6);
    return this._collectDecisionEntries(pickups, revenues, leads, today)
      .filter(e => {
        const d = (e.executedAt || '').slice(0, 10);
        if (!d) return e.decision === 'grow' || e.decision === 'continue';
        return d >= start && d <= t;
      })
      .filter(e => e.decision === 'grow' || e.decision === 'continue' || e.focusScore > 0)
      .sort((a, b) => {
        const order = { grow: 4, continue: 3, improve: 2, watch: 1, stop: 0 };
        const d = (order[b.decision] || 0) - (order[a.decision] || 0);
        if (d !== 0) return d;
        return b.focusScore - a.focusScore;
      })
      .slice(0, limit);
  },

  getStopOrImproveCandidates(pickups, revenues, leads) {
    return this._collectDecisionEntries(pickups, revenues, leads)
      .filter(e => e.decision === 'improve' || e.decision === 'stop')
      .sort((a, b) => {
        if (a.decision === 'stop' && b.decision !== 'stop') return -1;
        if (b.decision === 'stop' && a.decision !== 'stop') return 1;
        return a.focusScore - b.focusScore;
      });
  },

  getServiceFocusInsights(pickups, revenues, leads) {
    const entries = this._collectDecisionEntries(pickups, revenues, leads);
    const byService = {};

    entries.forEach(e => {
      const services = (e.relatedServices && e.relatedServices.length) ? e.relatedServices : ['その他'];
      services.forEach(svc => {
        if (!byService[svc]) {
          byService[svc] = {
            service: svc,
            actionCount: 0,
            lineInquiries: 0,
            reservations: 0,
            salesAmount: 0,
            focusScore: 0,
            decisions: []
          };
        }
        const g = byService[svc];
        g.actionCount++;
        g.lineInquiries += e.metrics?.lineInquiries || 0;
        g.reservations += e.metrics?.reservations || 0;
        g.salesAmount += e.totalSalesAmount || e.metrics?.salesAmount || 0;
        g.focusScore += e.focusScore;
        g.decisions.push(e.decision);
      });
    });

    const decisionFromCounts = decisions => {
      if (decisions.includes('grow')) return 'grow';
      if (decisions.includes('continue')) return 'continue';
      if (decisions.includes('improve')) return 'improve';
      if (decisions.filter(d => d === 'stop').length >= 2) return 'stop';
      return 'watch';
    };

    const labelMap = {
      grow: '増やす',
      continue: '続ける',
      improve: '改善',
      stop: '停止候補',
      watch: '様子見'
    };

    const nextMap = {
      grow: svc => `${svc}の実写ビフォーアフターを増やす`,
      continue: svc => `${svc}の写真相談導線を強める`,
      improve: svc => `${svc}のCTA・LP導線を見直す`,
      stop: () => '今週は別サービスを優先',
      watch: svc => `${svc}の成果メモを追加する`
    };

    return Object.values(byService)
      .map(g => {
        const decision = decisionFromCounts(g.decisions);
        return {
          ...g,
          decision,
          decisionLabel: labelMap[decision] || '様子見',
          nextStep: typeof nextMap[decision] === 'function' ? nextMap[decision](g.service) : nextMap.watch(g.service)
        };
      })
      .sort((a, b) => b.focusScore - a.focusScore);
  },

  buildFocusComment(pickups, revenues, leads) {
    const recs = this.getFocusRecommendations(pickups, revenues, leads, 3);
    const stops = this.getStopOrImproveCandidates(pickups, revenues, leads).slice(0, 2);
    const lines = [];
    recs.forEach(r => {
      const svc = (r.relatedServices || [])[0] || '';
      const svcPart = svc ? `×${svc}` : '';
      lines.push(`${r.topic}${svcPart}は${r.decisionLabel}`);
    });
    stops.forEach(s => {
      if (s.decision === 'improve' && s.type === 'ad') {
        lines.push(`${s.topic}広告はCTA改善`);
      } else if (s.decision === 'stop') {
        lines.push(`${s.topic}は今週優先度を下げる`);
      }
    });
    return lines.slice(0, 4);
  },

  buildMorningFocusLines(pickups, revenues, leads, max) {
    const limit = max || 3;
    const comments = this.buildFocusComment(pickups, revenues, leads);
    if (!comments.length) return [];
    return comments.slice(0, limit).map(c => `・${c}`);
  },

  buildDecisionTaskDedupeKey(date, topic, type, decisionLabel, title) {
    return [date, topic, type, decisionLabel, title].join('|');
  },

  createDecisionTaskPayload(decision) {
    if (!decision) return null;
    const topic = decision.topic || '';
    const type = decision.type || '';
    const meta = this.EXECUTION_META[type];
    const short = meta ? meta.shortLabel : type;

    if (decision.decision === 'grow') {
      const suffix = type === 'reel' ? 'の続編リール' : (type === 'ad' ? 'の横展開' : 'の続編');
      return {
        title: `増やす：${topic}${suffix}`,
        reason: '施策判断で売上・相談につながったため',
        priority: '高',
        decisionLabel: decision.decisionLabel,
        topic,
        type
      };
    }
    if (decision.decision === 'improve') {
      const title = type === 'ad'
        ? `改善する：${topic}LP広告のCTA`
        : `改善する：${topic}のCTA`;
      return {
        title,
        reason: 'クリックあり・問い合わせなし',
        priority: '中',
        decisionLabel: decision.decisionLabel,
        topic,
        type
      };
    }
    if (decision.decision === 'stop') {
      return {
        title: `見直す：${topic}${short}の優先度`,
        reason: '反応が弱いため今週は優先度低め',
        priority: '低',
        decisionLabel: decision.decisionLabel,
        topic,
        type
      };
    }
    if (decision.decision === 'continue') {
      return {
        title: `続ける：${topic} ${short}`,
        reason: '施策判断で反応あり。継続して様子を見る',
        priority: '中',
        decisionLabel: decision.decisionLabel,
        topic,
        type
      };
    }
    return null;
  }
};
