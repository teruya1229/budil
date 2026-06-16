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
  }
};
