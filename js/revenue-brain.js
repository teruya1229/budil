/**
 * Budil v1.9.3 - 売上番頭（経営判断用）・営業先連携
 */
const RevenueBrain = {
  SERVICES: [
    'エアコン通常', 'エアコン完全分解', 'お掃除機能付きエアコン',
    '洗濯機クリーニング', 'レンジフード', 'キッチン', '浴室', '法人案件', 'その他'
  ],
  SOURCES: [
    '直予約', 'LINE', 'Airリザーブ', 'くらしのマーケット', 'Google広告',
    'Googleビジネスプロフィール', '紹介', '法人', 'その他'
  ],
  STATUSES: ['予定', '確定', '完了', 'キャンセル'],
  PAYMENT_STATUSES: ['未入金', '入金済み'],

  formatYen(amount) {
    return Number(amount || 0).toLocaleString('ja-JP') + '円';
  },

  monthKeyFromDate(dateStr) {
    return (dateStr || '').slice(0, 7);
  },

  currentMonthKey(today) {
    return (today || new Date().toISOString().slice(0, 10)).slice(0, 7);
  },

  filterMonthRecords(records, monthKey) {
    return (records || []).filter(r => r.workDate && r.workDate.startsWith(monthKey));
  },

  activeRecords(records) {
    return (records || []).filter(r => r.status !== 'キャンセル');
  },

  normalizeRevenueRecord(record) {
    if (!record) return record;
    const normalized = { ...record };
    if (normalized.leadId) {
      normalized.leadId = String(normalized.leadId);
      normalized.leadName = normalized.leadName || '';
    }
    return normalized;
  },

  normalizeRevenueRecords(records) {
    return (records || []).map(r => this.normalizeRevenueRecord(r));
  },

  getRevenueRecordsByLeadId(leadId, records) {
    if (!leadId) return [];
    return this.normalizeRevenueRecords(records).filter(r => r.leadId === leadId);
  },

  resolveLeadLabel(record, leads) {
    if (!record || !record.leadId) return '未紐付け';
    const lead = (leads || []).find(l => l.id === record.leadId);
    if (lead) return lead.company || record.leadName || '未紐付け';
    return record.leadName || '削除済み営業先';
  },

  getLeadRevenueSummary(leadId, records) {
    const linked = this.getRevenueRecordsByLeadId(leadId, records);
    const active = this.activeRecords(linked);
    const paid = this.sumAmount(active.filter(r => r.paymentStatus === '入金済み'));
    const unpaid = this.sumAmount(active.filter(r => r.paymentStatus === '未入金'));
    const dates = active.map(r => r.workDate).filter(Boolean).sort();
    return {
      total: this.sumAmount(active),
      paid,
      unpaid,
      latestDate: dates.length ? dates[dates.length - 1] : null,
      records: linked.slice().sort((a, b) => (b.workDate || '').localeCompare(a.workDate || '')),
      count: active.length
    };
  },

  summarizeRevenueByLead(records, leads) {
    const active = this.activeRecords(this.normalizeRevenueRecords(records));
    const groups = {};
    active.forEach(r => {
      if (!r.leadId) return;
      if (!groups[r.leadId]) {
        groups[r.leadId] = { leadId: r.leadId, total: 0, paid: 0, unpaid: 0, latestDate: null, count: 0, leadName: '' };
      }
      const g = groups[r.leadId];
      const amt = Number(r.amount || 0);
      g.total += amt;
      g.count += 1;
      if (r.paymentStatus === '入金済み') g.paid += amt;
      else g.unpaid += amt;
      if (r.leadName) g.leadName = r.leadName;
      if (r.workDate && (!g.latestDate || r.workDate > g.latestDate)) g.latestDate = r.workDate;
    });

    const leadMap = {};
    (leads || []).forEach(l => { leadMap[l.id] = l; });

    return Object.values(groups)
      .map(g => {
        const lead = leadMap[g.leadId];
        const salesStatus = lead
          ? (lead.salesStatus || (typeof SalesBrain !== 'undefined' ? SalesBrain.mapLegacyStatus(lead.status) : lead.status))
          : null;
        return {
          ...g,
          leadName: lead ? lead.company : (g.leadName || '削除済み営業先'),
          salesStatus
        };
      })
      .sort((a, b) => b.total - a.total);
  },

  getLinkedRevenueSummary(records, leads, monthKey) {
    const monthRecords = monthKey ? this.filterMonthRecords(records, monthKey) : (records || []);
    const active = this.activeRecords(this.normalizeRevenueRecords(monthRecords));
    let linkedTotal = 0;
    let unlinkedTotal = 0;
    const leadIdsWithRevenue = new Set();

    active.forEach(r => {
      const amount = Number(r.amount || 0);
      if (r.leadId) {
        linkedTotal += amount;
        leadIdsWithRevenue.add(r.leadId);
      } else {
        unlinkedTotal += amount;
      }
    });

    const byLead = this.summarizeRevenueByLead(active, leads);
    const contractedCount = (leads || []).filter(l => {
      const ss = l.salesStatus || (typeof SalesBrain !== 'undefined' ? SalesBrain.mapLegacyStatus(l.status) : l.status);
      return ss === '成約' && leadIdsWithRevenue.has(l.id);
    }).length;

    return {
      linkedTotal,
      unlinkedTotal,
      leadCount: leadIdsWithRevenue.size,
      contractedCount,
      topLeads: byLead.slice(0, 3),
      unpaidLeads: byLead.filter(l => l.unpaid > 0).slice(0, 5)
    };
  },

  buildSalesOutcomeComment(outcome) {
    const lines = [];
    if (outcome.linkedTotal > 0) {
      lines.push(`今月、営業先に紐付いた売上は${this.formatYen(outcome.linkedTotal)}です`);
    }
    if (outcome.unlinkedTotal > 0) {
      lines.push('未紐付け売上があります。あとで営業先と紐付けると成果分析がしやすくなります');
    }
    if (outcome.contractedCount > 0) {
      lines.push('成約済み営業先があります。口コミ・次回提案・法人化提案を忘れずに確認してください');
    }
    return lines;
  },

  buildMorningSalesOutcomeLines(outcome) {
    if (!outcome) return [];
    const lines = [`今月の紐付け売上：${this.formatYen(outcome.linkedTotal)}`];
    if (outcome.unlinkedTotal > 0) {
      lines.push(`未紐付け売上：${this.formatYen(outcome.unlinkedTotal)}`);
    } else {
      lines.push('未紐付け売上なし');
    }
    if (outcome.unpaidLeads && outcome.unpaidLeads.length) {
      lines.push('未入金あり：' + outcome.unpaidLeads.map(l => l.leadName).join('、'));
    }
    return lines;
  },

  daysSince(dateStr, today) {
    if (!dateStr) return null;
    return Math.floor((new Date(today) - new Date(dateStr)) / 86400000);
  },

  evaluateLeadSalesCandidate(lead, revSummary, today) {
    if (!lead || !revSummary || !revSummary.count) return null;

    const normalized = typeof SalesBrain !== 'undefined'
      ? SalesBrain.normalizeLead(lead)
      : lead;
    const activeRecords = revSummary.records.filter(r => r.status !== 'キャンセル');
    const services = activeRecords.map(r => r.service);
    const hasService = name => services.includes(name);
    const candidates = [];

    if (revSummary.unpaid > 0) {
      candidates.push({
        priority: 'high', priorityScore: 3, rule: 1,
        reason: '未入金があります',
        action: 'まず入金確認。その後、次回提案へ',
        actionTitle: '入金確認',
        shortTag: '未入金確認'
      });
    }
    if (!normalized.nextAction && !normalized.nextActionDate) {
      candidates.push({
        priority: 'high', priorityScore: 3, rule: 2,
        reason: '売上後の次アクション未設定',
        action: 'お礼連絡・次回提案を設定',
        actionTitle: 'お礼連絡・次回提案を設定',
        shortTag: '次回提案候補'
      });
    }
    if (revSummary.latestDate) {
      const days = this.daysSince(revSummary.latestDate, today);
      if (days !== null && days >= 30) {
        candidates.push({
          priority: 'high', priorityScore: 3, rule: 3,
          reason: '前回売上から30日以上',
          action: 'お礼＋次回提案',
          actionTitle: 'お礼＋次回提案',
          shortTag: 'リピート候補'
        });
      }
    }
    if (hasService('エアコン通常')) {
      candidates.push({
        priority: 'mid', priorityScore: 2, rule: 4,
        reason: '通常洗浄から追加提案余地あり',
        action: '完全分解・洗濯機クリーニング提案',
        actionTitle: '完全分解・洗濯機提案',
        shortTag: '次回提案候補'
      });
    }
    if (hasService('法人案件')) {
      candidates.push({
        priority: 'mid', priorityScore: 2, rule: 5,
        reason: '法人案件は継続提案向き',
        action: '定期清掃・複数台提案',
        actionTitle: '定期清掃・複数台提案',
        shortTag: '法人定期提案候補'
      });
    }
    if (hasService('洗濯機クリーニング')) {
      candidates.push({
        priority: 'mid', priorityScore: 2, rule: 6,
        reason: '水回り・エアコン提案余地あり',
        action: 'エアコン・浴室・レンジフード提案',
        actionTitle: 'エアコン・浴室・レンジフード提案',
        shortTag: '次回提案候補'
      });
    }
    if (revSummary.unpaid === 0 && (normalized.nextAction || normalized.nextActionDate)) {
      candidates.push({
        priority: 'low', priorityScore: 1, rule: 7,
        reason: '良好な既存営業先',
        action: '定期的に関係維持',
        actionTitle: '関係維持',
        shortTag: 'リピート候補'
      });
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.priorityScore - a.priorityScore || a.rule - b.rule);
    const best = candidates[0];
    return {
      leadId: lead.id,
      leadName: lead.company,
      reason: best.reason,
      action: best.action,
      actionTitle: best.actionTitle,
      shortTag: best.shortTag,
      priority: best.priority,
      priorityLabel: best.priority === 'high' ? '高' : best.priority === 'mid' ? '中' : '低',
      total: revSummary.total,
      unpaid: revSummary.unpaid,
      latestDate: revSummary.latestDate,
      nextActionUnset: !normalized.nextAction && !normalized.nextActionDate
    };
  },

  getLeadNextSalesAction(leadId, records, leads, today) {
    const lead = (leads || []).find(l => l.id === leadId);
    if (!lead) return null;
    const revSummary = this.getLeadRevenueSummary(leadId, this.normalizeRevenueRecords(records));
    return this.evaluateLeadSalesCandidate(lead, revSummary, today || new Date().toISOString().slice(0, 10));
  },

  getNextSalesCandidates(records, leads, today) {
    const normalizedRecords = this.normalizeRevenueRecords(records);
    const leadMap = {};
    (leads || []).forEach(l => { leadMap[l.id] = l; });

    const byLead = this.summarizeRevenueByLead(normalizedRecords, leads);
    const candidates = [];

    byLead.forEach(item => {
      const lead = leadMap[item.leadId];
      if (!lead) return;
      const revSummary = this.getLeadRevenueSummary(item.leadId, normalizedRecords);
      const candidate = this.evaluateLeadSalesCandidate(lead, revSummary, today);
      if (candidate) candidates.push(candidate);
    });

    const priorityOrder = { high: 0, mid: 1, low: 2 };
    candidates.sort((a, b) => {
      const po = (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
      if (po !== 0) return po;
      if ((b.unpaid > 0) !== (a.unpaid > 0)) return (b.unpaid > 0 ? 1 : 0) - (a.unpaid > 0 ? 1 : 0);
      return (b.total || 0) - (a.total || 0);
    });

    return candidates;
  },

  sumAmount(list) {
    return list.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  },

  groupByField(records, field) {
    const groups = {};
    records.forEach(r => {
      const key = r[field] || 'その他';
      groups[key] = (groups[key] || 0) + Number(r.amount || 0);
    });
    return Object.entries(groups)
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({ name, amount }));
  },

  summarize(records, settings, targetMonth) {
    const monthKey = targetMonth || this.currentMonthKey();
    const monthAll = this.filterMonthRecords(records, monthKey);
    const active = this.activeRecords(monthAll);

    const planned = this.sumAmount(active);
    const confirmed = this.sumAmount(active.filter(r => r.status === '確定'));
    const completed = this.sumAmount(active.filter(r => r.status === '完了'));
    const paid = this.sumAmount(active.filter(r => r.paymentStatus === '入金済み'));
    const unpaid = this.sumAmount(active.filter(r => r.paymentStatus === '未入金'));

    const monthlyTarget = Number(settings && settings.monthlyTarget) || 0;
    const remainingToTarget = Math.max(0, monthlyTarget - planned);
    const achievementRate = monthlyTarget > 0 ? Math.round((planned / monthlyTarget) * 100) : 0;

    const now = new Date();
    const parts = monthKey.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const isCurrentMonth = monthKey === this.currentMonthKey();
    const todayDay = now.getDate();
    const daysLeft = isCurrentMonth ? Math.max(1, lastDay - todayDay + 1) : lastDay;
    const dailyNeeded = remainingToTarget > 0 ? Math.ceil(remainingToTarget / daysLeft) : 0;

    return {
      monthKey,
      planned,
      confirmed,
      completed,
      paid,
      unpaid,
      monthlyTarget,
      remainingToTarget,
      achievementRate,
      daysLeft,
      dailyNeeded,
      byService: this.groupByField(active, 'service'),
      bySource: this.groupByField(active, 'source'),
      recordCount: active.length
    };
  },

  buildBantouComment(summary) {
    const comments = [];
    if (!summary.monthlyTarget) {
      comments.push('月間目標を設定してください。');
    }
    if (summary.recordCount === 0) {
      comments.push('今月の売上予定がありません。売上登録から始めてください。');
    } else if (summary.monthlyTarget && summary.achievementRate < 30) {
      comments.push('売上強化が必要です。営業・追客を優先してください。');
    } else if (summary.monthlyTarget && summary.achievementRate < 60) {
      comments.push('まだ目標まで差があります。高単価メニューを意識してください。');
    }
    if (summary.unpaid > 0) {
      comments.push('未入金があります。入金確認をしてください。');
    }
    const highTicket = (summary.byService || [])
      .filter(s => ['エアコン完全分解', '法人案件'].includes(s.name))
      .reduce((sum, s) => sum + s.amount, 0);
    if (summary.planned > 0 && highTicket / summary.planned < 0.2) {
      comments.push('高単価メニューの提案余地があります。');
    }
    if (summary.monthlyTarget && summary.achievementRate >= 80) {
      comments.push('目標達成率が高いです。無理な低単価案件より高単価・リピーター案件を優先してください。');
    }
    return comments.length
      ? comments.join(' ')
      : '今月の売上ペースは安定しています。入金確認と高単価提案を継続してください。';
  },

  buildSummaryText(summary, comment) {
    const lines = [
      `売上予定：${this.formatYen(summary.planned)}`,
      `入金済み：${this.formatYen(summary.paid)}`,
      `未入金：${this.formatYen(summary.unpaid)}`,
      `月間目標：${this.formatYen(summary.monthlyTarget)}`,
      `目標まで残り：${this.formatYen(summary.remainingToTarget)}`,
      `達成率：${summary.achievementRate}%`
    ];
    if (comment) lines.push('', comment);
    return lines.join('\n');
  }
};
