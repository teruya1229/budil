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
    nextImproveMemo: ''
  },

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
      result[type] = { ...this.EXECUTION_DEFAULT, ...(existing[type] || {}) };
    });
    return result;
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
  }
};
