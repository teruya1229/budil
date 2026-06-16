/**
 * Budil v0.3 - 営業番頭分析エンジン
 */
const SalesBrain = {
  PRODUCTS: {
    'AI帳票番頭': ['建設', '工務', '現場', '土木', '帳票', '経理', '請求', '伝票', '工事', '施工'],
    '広告番頭': ['飲食', '美容', 'サロン', '小売', '店舗', '集客', 'MEO', 'SEO', '広告', 'ホテル', '民宿'],
    'AI導入コンサル': ['士業', 'コンサル', '事務', 'DX', 'AI', '効率化', '自動化', '会計', '法律'],
    'BCサービス': ['清掃', 'クリーニング', 'ハウス', '管理会社', '民泊', '賃貸', '不動産', 'マンション', '洗濯', 'エアコン', '浴室']
  },

  DEMAND_BC_MAP: {
    '洗濯機クリーニング': { product: 'BCサービス', target: '管理会社へ洗濯機クリーニング提案' },
    'ドラム式洗濯機クリーニング': { product: 'BCサービス', target: '管理会社へドラム式洗濯機提案' },
    'エアコンクリーニング': { product: 'BCサービス', target: '民泊・管理会社へエアコン清掃提案' },
    '完全分解エアコンクリーニング': { product: 'BCサービス', target: '施設管理者へ完全分解清掃提案' },
    '浴室クリーニング': { product: 'BCサービス', target: '民泊・ホテルへ浴室清掃提案' },
    'レンジフード': { product: 'BCサービス', target: '飲食店へレンジフード清掃提案' }
  },

  daysSince(dateStr, today) {
    if (!dateStr) return null;
    return Math.floor((new Date(today) - new Date(dateStr)) / 86400000);
  },

  recommendProduct(lead, demand) {
    const ctx = [lead.industry, lead.memo, lead.url, lead.region, lead.service].filter(Boolean).join(' ');
    const scores = {};
    Object.entries(this.PRODUCTS).forEach(([product, triggers]) => {
      scores[product] = triggers.reduce((n, t) => n + (ctx.includes(t) ? 2 : 0), 0);
    });

    if (lead.service) {
      Object.keys(this.PRODUCTS).forEach(p => {
        if (lead.service.includes(p) || p.includes(lead.service)) scores[p] = (scores[p] || 0) + 3;
      });
    }

    if (demand && demand.recommendedServices) {
      demand.recommendedServices.forEach((s, i) => {
        const map = this.DEMAND_BC_MAP[s.name];
        if (map) scores[map.product] = (scores[map.product] || 0) + (5 - i);
        if (/AI|帳票/.test(s.name)) scores['AI帳票番頭'] = (scores['AI帳票番頭'] || 0) + (4 - i);
        if (/広告/.test(s.name)) scores['広告番頭'] = (scores['広告番頭'] || 0) + (4 - i);
      });
    }

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (sorted.length && sorted[0][1] > 0) return sorted[0][0];
    if (lead.service) return lead.service;
    return 'AI帳票番頭';
  },

  computePriority(lead, today) {
    if (['NG', '見送り', '成約'].includes(lead.status)) {
      return { level: 'C', score: 0, reasons: ['対象外ステータス（' + lead.status + '）'] };
    }

    let score = 0;
    const reasons = [];
    const sinceLast = this.daysSince(lead.lastContact, today);

    if (lead.nextContact && lead.nextContact <= today) {
      score += 50;
      reasons.push('次回連絡日（' + lead.nextContact + '）が到来');
    } else if (lead.nextContact) {
      const daysUntil = this.daysSince(today, lead.nextContact);
      if (daysUntil !== null && daysUntil <= 7) {
        score += 25;
        reasons.push('次回連絡日が近い（' + lead.nextContact + '）');
      }
    }

    if (sinceLast !== null && sinceLast >= 14) {
      score += 40;
      reasons.push('最終連絡から' + sinceLast + '日経過');
    } else if (sinceLast !== null && sinceLast >= 7) {
      score += 20;
      reasons.push('最終連絡から' + sinceLast + '日経過');
    }

    if (lead.status === '商談中' && sinceLast !== null && sinceLast >= 7) {
      score += 35;
      reasons.push('商談中のフォローが止まっている');
    }

    if (lead.status === '未接触') {
      score += 22;
      if (!reasons.length) reasons.push('未接触の新規リード');
    }

    if (lead.status === 'アプローチ中' && sinceLast !== null && sinceLast >= 7) {
      score += 28;
      reasons.push('アプローチ後の反応待ち');
    }

    let level = 'C';
    if (score >= 40) level = 'A';
    else if (score >= 20) level = 'B';
    if (!reasons.length) reasons.push('通常フォロー対象');

    return { level, score, reasons };
  },

  suggestAction(lead) {
    if (['NG', '見送り', '成約'].includes(lead.status)) return '保留';
    if (lead.status === '未接触') {
      if (lead.email) return 'メール送信';
      if (lead.contactForm) return 'フォーム送信';
      if (lead.phone) return '電話';
      return 'メール送信';
    }
    if (lead.status === 'アプローチ中' || lead.status === '商談中') return '再連絡';
    return '再連絡';
  },

  detectLeadLeaks(lead, today) {
    const warnings = [];
    const sinceLast = this.daysSince(lead.lastContact, today);

    if (sinceLast !== null && sinceLast >= 14 && !['NG', '見送り', '成約'].includes(lead.status)) {
      warnings.push({ type: 'danger', text: lead.company + ' — ' + sinceLast + '日以上連絡なし' });
    }
    if (lead.nextContact && lead.nextContact < today && !['NG', '見送り', '成約'].includes(lead.status)) {
      warnings.push({ type: 'warning', text: lead.company + ' — 次回連絡日超過（' + lead.nextContact + '）' });
    }
    if (lead.status === '商談中' && sinceLast !== null && sinceLast >= 7) {
      warnings.push({ type: 'warning', text: lead.company + ' — 商談中の放置（' + sinceLast + '日）' });
    }
    return warnings;
  },

  detectFollowupLeaks(followups, today) {
    const warnings = [];
    followups.forEach(f => {
      if (['成約', '見送り', 'NG'].includes(f.status)) return;
      const sinceLast = this.daysSince(f.lastContact, today);
      if (f.status === '返信あり' && sinceLast !== null && sinceLast >= 7) {
        warnings.push({ type: 'danger', text: f.company + ' — 返信待ち長期化（' + sinceLast + '日）' });
      }
      if (f.nextContact && f.nextContact < today) {
        warnings.push({ type: 'danger', text: f.company + ' — 追客フォロー漏れ（' + f.nextContact + '）' });
      }
    });
    return warnings;
  },

  enrichLead(lead, demand, settings, today) {
    const ai = this.computePriority(lead, today);
    const manual = lead.priorityManual === true;
    const useAi = settings.aiPriorityEnabled !== false && !manual;
    const effectivePriority = useAi ? ai.level : (lead.priority || 'B');
    const recommendedProduct = this.recommendProduct(lead, demand);
    const suggestedAction = this.suggestAction(lead);

    return {
      ...lead,
      aiPriority: ai.level,
      aiPriorityScore: ai.score,
      aiPriorityReasons: ai.reasons,
      effectivePriority,
      priorityManual: manual,
      recommendedProduct,
      suggestedAction,
      displayReason: ai.reasons[0] || '通常フォロー対象',
      productLabel: recommendedProduct + '向き'
    };
  },

  enrichLeads(leads, demand, settings, today) {
    return leads
      .map(l => this.enrichLead(l, demand, settings, today))
      .filter(l => !['NG', '見送り', '成約'].includes(l.status));
  },

  getTodayTargets(enriched) {
    const order = { A: 0, B: 1, C: 2 };
    return enriched
      .slice()
      .sort((a, b) => {
        const pd = (order[a.effectivePriority] ?? 1) - (order[b.effectivePriority] ?? 1);
        if (pd !== 0) return pd;
        return (b.aiPriorityScore || 0) - (a.aiPriorityScore || 0);
      })
      .slice(0, 5);
  },

  buildMissions(enriched, demand) {
    const missions = [];
    const counts = {};

    enriched.filter(l => l.effectivePriority === 'A' || l.effectivePriority === 'B').forEach(l => {
      counts[l.recommendedProduct] = (counts[l.recommendedProduct] || 0) + 1;
    });

    Object.entries(counts).forEach(([product, count]) => {
      missions.push({ text: product + '営業 ' + count + '件', type: 'sales' });
    });

    const recontact = enriched.filter(l => l.suggestedAction === '再連絡' && l.effectivePriority !== 'C').length;
    if (recontact) missions.push({ text: '再連絡 ' + recontact + '件', type: 'followup' });

    if (demand && demand.todayMove && demand.todayMove.service) {
      const svc = demand.todayMove.service;
      const map = this.DEMAND_BC_MAP[svc];
      if (map) {
        missions.unshift({ text: map.target, type: 'demand-link', highlight: true });
      } else if (/AI|帳票/.test(svc)) {
        missions.unshift({ text: '現場業・工務店へAI帳票番頭提案', type: 'demand-link', highlight: true });
      } else if (/広告/.test(svc)) {
        missions.unshift({ text: '集客課題のある店舗へ広告番頭提案', type: 'demand-link', highlight: true });
      }
    }

    if (!missions.length) {
      missions.push({ text: '営業先を登録するとミッションが表示されます', type: 'empty' });
    }

    return missions.slice(0, 6);
  },

  collectWarnings(leads, followups, today) {
    const warnings = [];
    leads.forEach(l => warnings.push(...this.detectLeadLeaks(l, today)));
    warnings.push(...this.detectFollowupLeaks(followups, today));
    const seen = new Set();
    return warnings.filter(w => {
      if (seen.has(w.text)) return false;
      seen.add(w.text);
      return true;
    }).slice(0, 8);
  }
};
