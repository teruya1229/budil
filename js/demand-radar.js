/**
 * Budil v1.3 - 需要レーダー（外部需要・手入力思考整理）
 */
const DemandRadar = {
  SERVICES: [
    { id: 'ac', name: 'エアコン', triggers: ['エアコン', '冷房', 'クーラー', 'エアコン臭い', '冷暖房'] },
    { id: 'full-ac', name: '完全分解', triggers: ['完全分解', '分解洗浄', '内部カビ'] },
    { id: 'washer', name: '洗濯機', triggers: ['洗濯機', '洗濯機クリーニング', '洗濯槽', '縦型'] },
    { id: 'drum', name: 'ドラム式', triggers: ['ドラム式', 'ドラム', '乾燥不良', '乾燥'] },
    { id: 'hood', name: 'レンジフード', triggers: ['レンジフード', '換気扇', '油汚れ'] },
    { id: 'bath', name: '浴室', triggers: ['浴室', '風呂', '水垢', 'ユニットバス'] },
    { id: 'ai-doc', name: 'AI帳票', triggers: ['AI帳票', '帳票', '請求書', 'OCR', '伝票', '経理'] },
    { id: 'ads', name: '広告・集客支援', triggers: ['広告・集客支援', '広告番頭', '広告', '集客', 'MEO', 'SEO', 'リスティング'] }
  ],

  UP_WORDS: ['増加', '上昇', '伸び', '急上昇', '人気', '問い合わせ', 'クリック', '表示'],
  DOWN_WORDS: ['減少', '低下', '下降', '少ない', '減'],

  defaultData() {
    return {
      watchedKeywords: [],
      marketMemos: { news: '', voices: '', competitor: '', field: '' },
      updatedAt: null
    };
  },

  analyze(radarData, dailyLogs, demand) {
    const data = radarData || this.defaultData();
    const logs = dailyLogs || [];
    const combinedText = this.buildCombinedText(data, logs, demand);
    const serviceScores = this.scoreServices(data.watchedKeywords, combinedText, logs);
    const trends = this.analyzeTrends(logs, data.watchedKeywords);
    const weeklyFocus = this.buildWeeklyFocus(serviceScores, trends, data.watchedKeywords);
    const topService = serviceScores[0] || null;

    return {
      watchedKeywords: data.watchedKeywords || [],
      marketMemos: data.marketMemos || {},
      serviceScores,
      topService,
      weeklyFocus,
      increasingTrends: trends.increasing,
      decreasingTrends: trends.decreasing,
      updatedAt: data.updatedAt
    };
  },

  buildCombinedText(data, logs, demand) {
    const parts = [];
    const memos = data.marketMemos || {};
    parts.push(memos.news, memos.voices, memos.competitor, memos.field);
    (data.watchedKeywords || []).forEach(k => parts.push(k));
    logs.forEach(log => {
      if (log.input) {
        parts.push(log.input.ads, log.input.gsc, log.input.trends, log.input.instagram, log.input.fieldNotes);
      }
      if (log.keywords) parts.push(log.keywords.join(' '));
    });
    if (demand && demand.keywords) parts.push(demand.keywords.join(' '));
    return parts.filter(Boolean).join('\n');
  },

  scoreServices(watchedKeywords, text, logs) {
    const scores = this.SERVICES.map(svc => {
      let score = 0;
      const matched = [];

      svc.triggers.forEach(t => {
        if (text.includes(t)) {
          score += 3;
          matched.push(t);
        }
      });

      (watchedKeywords || []).forEach(kw => {
        if (svc.triggers.some(t => kw.includes(t) || t.includes(kw)) || kw.includes(svc.name)) {
          score += 5;
          if (!matched.includes(kw)) matched.push(kw);
        }
      });

      logs.slice(0, 3).forEach(log => {
        const logText = [
          log.recommendedService,
          (log.keywords || []).join(' '),
          log.input && log.input.fieldNotes
        ].filter(Boolean).join(' ');
        if (svc.triggers.some(t => logText.includes(t)) || (log.recommendedService && log.recommendedService.includes(svc.name))) {
          score += 2;
        }
      });

      return { ...svc, score, matched };
    });

    return scores.sort((a, b) => b.score - a.score);
  },

  analyzeTrends(logs, watchedKeywords) {
    const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length < 2) {
      return { increasing: [], decreasing: [] };
    }

    const mid = Math.floor(sorted.length / 2);
    const older = sorted.slice(0, mid);
    const recent = sorted.slice(mid);
    const items = new Map();

    const track = (label, bucket) => {
      if (!label) return;
      const key = String(label).trim();
      if (!key) return;
      if (!items.has(key)) items.set(key, { label: key, older: 0, recent: 0 });
      items.get(key)[bucket]++;
    };

    const scanLogs = (logList, bucket) => {
      logList.forEach(log => {
        (log.keywords || []).forEach(k => track(k, bucket));
        if (log.recommendedService) track(log.recommendedService, bucket);
        const text = log.input
          ? [log.input.ads, log.input.gsc, log.input.trends, log.input.fieldNotes].filter(Boolean).join('\n')
          : '';
        this.UP_WORDS.forEach(w => { if (text.includes(w)) track(w + 'シグナル', bucket); });
        (watchedKeywords || []).forEach(k => { if (text.includes(k)) track(k, bucket); });
      });
    };

    scanLogs(older, 'older');
    scanLogs(recent, 'recent');

    const increasing = [];
    const decreasing = [];

    items.forEach(item => {
      if (item.recent > item.older) {
        increasing.push({ label: item.label, change: '+' + (item.recent - item.older), recent: item.recent });
      } else if (item.recent < item.older) {
        decreasing.push({ label: item.label, change: '-' + (item.older - item.recent), recent: item.recent });
      } else if (item.recent > 0) {
        increasing.push({ label: item.label, change: '継続', recent: item.recent });
      }
    });

    increasing.sort((a, b) => b.recent - a.recent);
    decreasing.sort((a, b) => b.recent - a.recent);

    return {
      increasing: increasing.slice(0, 8),
      decreasing: decreasing.slice(0, 8)
    };
  },

  buildWeeklyFocus(serviceScores, trends, watchedKeywords) {
    const top = serviceScores.find(s => s.score > 0);
    if (!top) {
      if (watchedKeywords && watchedKeywords.length) {
        return '今週は「' + watchedKeywords[0] + '」を軸に需要を追う';
      }
      return '今週の注目キーワードと市場メモを入力してください';
    }

    const rising = trends.increasing[0];
    let focus = '今週は' + top.name;
    if (/洗濯|ドラム/.test(top.name)) {
      focus += 'クリーニングを強化';
    } else if (/AI帳票/.test(top.name)) {
      focus += '提案を強化';
    } else if (/広告/.test(top.name)) {
      focus += 'の集客支援を強化';
    } else if (/完全分解|エアコン|レンジ|浴室/.test(top.name)) {
      focus += 'の訴求を強化';
    } else {
      focus += 'を強化';
    }

    if (rising && rising.label !== top.name) {
      focus += '（' + rising.label + 'が上昇傾向）';
    }
    return focus;
  }
};
