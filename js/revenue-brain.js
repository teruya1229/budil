/**
 * Budil v4.8.13 - 売上番頭（経営判断用）・営業先連携
 */
const RevenueBrain = {
  SERVICES: [
    'エアコン通常', 'エアコン完全分解', 'お掃除機能付きエアコン',
    '洗濯機クリーニング', 'レンジフード', 'キッチン', '浴室', '法人案件', 'その他'
  ],
  SOURCES: [
    'LP', '110番', 'くらしのマーケット', 'ヤマダ', 'コープ', 'その他'
  ],

  DEFAULT_GROSS_MARGIN_RATES: {
    'ヤマダ': 60,
    'くらしのマーケット': 80,
    'LP': 100
  },

  getDefaultGrossProfitRateBySource(source) {
    const normalized = this.normalizeSourceForForm(source);
    return Object.prototype.hasOwnProperty.call(this.DEFAULT_GROSS_MARGIN_RATES, normalized)
      ? this.DEFAULT_GROSS_MARGIN_RATES[normalized]
      : null;
  },

  normalizeSourceForForm(source) {
    const s = String(source || '').trim();
    if (!s || s === '不明') return 'その他';
    if (this.SOURCES.includes(s)) return s;
    if (/ヤマダ電機|ヤマダ|YAMADA/i.test(s)) return 'ヤマダ';
    if (/コープ|生協|\bcoop\b|COOP/i.test(s)) return 'コープ';
    if (/くらしのマーケット|くらし|ココナラ|おてがる/.test(s)) return 'くらしのマーケット';
    if (/エアコン110番|生活110番|110番/.test(s)) return '110番';
    if (/\bLP\b|ホームページ|\bHP\b|\bWeb\b|\bWEB\b|サイト/i.test(s)) return 'LP';
    return 'その他';
  },
  STATUSES: ['予定', '確定', 'キャンセル'],

  displayRevenueStatus(status) {
    if (status === '完了') return '確定';
    return status || '予定';
  },

  normalizeRevenueStatusForSave(status) {
    const s = String(status || '').trim();
    if (s === '完了') return '確定';
    if (this.STATUSES.includes(s)) return s;
    return '予定';
  },

  isConfirmedRevenueStatus(status) {
    return status === '確定' || status === '完了';
  },
  PAYMENT_STATUSES: ['pending', 'paid', 'partial', 'uncollected', 'cancelled'],

  formatYen(amount) {
    return Number(amount || 0).toLocaleString('ja-JP') + '円';
  },

  formatPaymentStatusLabel(status) {
    if (typeof PaymentBrain !== 'undefined') {
      return PaymentBrain.getPaymentStatusLabel({ paymentStatus: status });
    }
    if (status === '未入金' || status === 'pending') return '入金待ち';
    if (status === '入金済み' || status === 'paid') return '入金済み';
    return status || '—';
  },

  isPaidPaymentStatus(status) {
    const s = typeof PaymentBrain !== 'undefined'
      ? PaymentBrain.migratePaymentStatus(status, 'pending')
      : status;
    return s === 'paid';
  },

  isUnpaidPaymentStatus(status) {
    const s = typeof PaymentBrain !== 'undefined'
      ? PaymentBrain.migratePaymentStatus(status, 'pending')
      : status;
    return s === 'pending' || s === 'partial' || s === 'uncollected' || s === '未入金';
  },

  recordHasPaymentConcern(record) {
    return !!(record && record.paymentConcern === true);
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
    if (record.followUp != null && typeof record.followUp === 'object') {
      normalized.followUp = typeof FollowUpBrain !== 'undefined'
        ? FollowUpBrain.normalizeFollowUp(record.followUp)
        : record.followUp;
    }
    if (typeof PaymentBrain !== 'undefined') {
      const payment = PaymentBrain.normalizeRevenuePayment(normalized, {
        total: normalized.amount,
        defaultDate: normalized.workDate
      });
      Object.assign(normalized, payment);
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
    const paid = active.reduce((sum, r) => {
      if (typeof PaymentBrain !== 'undefined') return sum + PaymentBrain.getPaidAmount(r);
      return sum + (this.isPaidPaymentStatus(r.paymentStatus) ? Number(r.amount || 0) : 0);
    }, 0);
    const unpaid = active.reduce((sum, r) => {
      if (typeof PaymentBrain !== 'undefined') {
        return sum + PaymentBrain.getUnpaidAmount(r);
      }
      return sum + (this.isUnpaidPaymentStatus(r.paymentStatus) ? Number(r.amount || 0) : 0);
    }, 0);
    const concernRecords = active.filter(r => this.recordHasPaymentConcern(r));
    const dates = active.map(r => r.workDate).filter(Boolean).sort();
    return {
      total: this.sumAmount(active),
      paid,
      unpaid,
      paymentConcern: concernRecords.length > 0,
      paymentConcernCount: concernRecords.length,
      paymentConcernAmount: this.sumAmount(concernRecords),
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
        groups[r.leadId] = {
          leadId: r.leadId, total: 0, paid: 0, unpaid: 0,
          paymentConcern: false, paymentConcernAmount: 0,
          latestDate: null, count: 0, leadName: ''
        };
      }
      const g = groups[r.leadId];
      const amt = Number(r.amount || 0);
      g.total += amt;
      g.count += 1;
      if (this.isPaidPaymentStatus(r.paymentStatus)) g.paid += amt;
      else g.unpaid += typeof PaymentBrain !== 'undefined' ? PaymentBrain.getUnpaidAmount(r) : amt;
      if (this.recordHasPaymentConcern(r)) {
        g.paymentConcern = true;
        g.paymentConcernAmount += amt;
      }
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
      unpaidLeads: byLead.filter(l => l.unpaid > 0).slice(0, 5),
      paymentConcernLeads: byLead.filter(l => l.paymentConcern).slice(0, 5)
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
    if (outcome.paymentConcernLeads && outcome.paymentConcernLeads.length) {
      lines.push('入金注意あり：' + outcome.paymentConcernLeads.map(l => l.leadName).join('、'));
    }
    return lines;
  },

  daysSince(dateStr, today) {
    if (!dateStr) return null;
    return Math.floor((new Date(today) - new Date(dateStr)) / 86400000);
  },

  evaluateLeadSalesCandidate(lead, revSummary, today) {
    if (!lead || !revSummary || !revSummary.count) return null;

    const activeRecords = revSummary.records.filter(r => r.status !== 'キャンセル');
    const hasPaymentConcern = activeRecords.some(r => this.recordHasPaymentConcern(r));
    if (hasPaymentConcern) return null;

    const normalized = typeof SalesBrain !== 'undefined'
      ? SalesBrain.normalizeLead(lead)
      : lead;
    const services = activeRecords.map(r => r.service);
    const hasService = name => services.includes(name);
    const candidates = [];

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
    if (normalized.nextAction || normalized.nextActionDate) {
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

  evaluateLeadSalesHold(lead, revSummary) {
    if (!lead || !revSummary || !revSummary.paymentConcern) return null;
    const activeRecords = revSummary.records.filter(r => r.status !== 'キャンセル');
    const concernRecords = activeRecords.filter(r => this.recordHasPaymentConcern(r));
    if (!concernRecords.length) return null;
    return {
      leadId: lead.id,
      leadName: lead.company,
      reason: '入金注意タグあり',
      action: '入金予定を確認。確認できるまで追加営業は保留',
      concernAmount: revSummary.paymentConcernAmount,
      concernCount: revSummary.paymentConcernCount,
      latestDate: revSummary.latestDate
    };
  },

  getLeadSalesHold(leadId, records, leads) {
    const lead = (leads || []).find(l => l.id === leadId);
    if (!lead) return null;
    const revSummary = this.getLeadRevenueSummary(leadId, this.normalizeRevenueRecords(records));
    return this.evaluateLeadSalesHold(lead, revSummary);
  },

  getSalesHoldCandidates(records, leads, today) {
    const normalizedRecords = this.normalizeRevenueRecords(records);
    const leadMap = {};
    (leads || []).forEach(l => { leadMap[l.id] = l; });

    const byLead = this.summarizeRevenueByLead(normalizedRecords, leads);
    const holds = [];

    byLead.forEach(item => {
      if (!item.paymentConcern) return;
      const lead = leadMap[item.leadId];
      if (!lead) return;
      const revSummary = this.getLeadRevenueSummary(item.leadId, normalizedRecords);
      const hold = this.evaluateLeadSalesHold(lead, revSummary);
      if (hold) holds.push(hold);
    });

    holds.sort((a, b) => (b.concernAmount || 0) - (a.concernAmount || 0));
    return holds;
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
      if (revSummary.paymentConcern) return;
      const candidate = this.evaluateLeadSalesCandidate(lead, revSummary, today);
      if (candidate) candidates.push(candidate);
    });

    const priorityOrder = { high: 0, mid: 1, low: 2 };
    candidates.sort((a, b) => {
      const po = (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
      if (po !== 0) return po;
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
    const confirmed = this.sumAmount(active.filter(r => this.isConfirmedRevenueStatus(r.status)));
    const completed = 0;
    const paid = active.reduce((sum, r) => {
      if (typeof PaymentBrain !== 'undefined') return sum + PaymentBrain.getPaidAmount(r);
      return sum + (this.isPaidPaymentStatus(r.paymentStatus) ? Number(r.amount || 0) : 0);
    }, 0);
    const unpaid = active.reduce((sum, r) => {
      if (typeof PaymentBrain !== 'undefined') {
        return sum + PaymentBrain.getUnpaidAmount(r);
      }
      return sum + (this.isUnpaidPaymentStatus(r.paymentStatus) ? Number(r.amount || 0) : 0);
    }, 0);
    const paymentConcernCount = active.filter(r => this.recordHasPaymentConcern(r)).length;

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
      paymentConcernCount,
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

  buildManagementComment(context) {
    const summary = (context && context.summary) || {};
    const salesOutcome = (context && context.salesOutcome) || {};
    const nextCandidates = (context && (context.nextSalesCandidates || context.nextCandidates)) || [];
    const holdCandidates = (context && (context.salesHoldCandidates || context.holdCandidates)) || [];
    const lines = [];
    const top = nextCandidates[0];
    const hasHold = holdCandidates.length > 0;
    const hasTarget = summary.monthlyTarget > 0;
    const targetMet = hasTarget && summary.achievementRate >= 100;
    const targetNotMet = hasTarget && summary.remainingToTarget > 0 && summary.achievementRate < 100;

    if (summary.recordCount === 0) {
      const line = '今月の売上登録がまだありません。まずは直近の作業・予約・見込み客を登録して、状況を見える化してください。';
      return { lines: [line], brief: line };
    }

    if (targetNotMet) {
      lines.push(`今月は目標まであと${this.formatYen(summary.remainingToTarget)}です。売上候補を増やすか、既存営業先への追加提案を優先してください。`);
    } else if (targetMet && salesOutcome.unlinkedTotal === 0 && !hasHold) {
      lines.push('今月は売上管理が順調です。次はリピート候補と法人提案を増やして、翌月の売上につなげましょう。');
    } else if (salesOutcome.linkedTotal > 0) {
      lines.push(`今月は営業先に紐付いた売上が${this.formatYen(salesOutcome.linkedTotal)}あります。売上が出た営業先へのお礼・次回提案を忘れずに確認してください。`);
    } else {
      lines.push(`今月の売上予定は${this.formatYen(summary.planned)}です。`);
    }

    if (top) {
      lines.push(`今日の優先営業候補は${top.leadName}です。理由：${top.reason}。まずこの1件から動くのがおすすめです。`);
    }

    if (hasHold) {
      lines.push('営業保留中の案件があります。入金注意の確認が終わるまでは追加営業を控えてください。');
    } else if (salesOutcome.unlinkedTotal > 0) {
      lines.push('未紐付け売上があります。営業先と紐付けると、営業成果の分析に反映されます。');
    } else if (salesOutcome.linkedTotal > 0 || targetMet) {
      lines.push('未紐付け売上はありません。営業成果は正しく分析できています。');
    }

    const finalLines = lines.slice(0, 3);
    return {
      lines: finalLines,
      brief: finalLines.slice(0, 2).join(' ')
    };
  },

  buildDailyActionTasks(context) {
    const today = (context && context.today) || new Date().toISOString().slice(0, 10);
    const summary = (context && context.summary) || {};
    const salesOutcome = (context && context.salesOutcome) || {};
    const holdCandidates = (context && context.salesHoldCandidates) || [];
    const nextCandidates = (context && context.nextSalesCandidates) || [];
    const records = (context && context.records) || [];
    const leads = (context && context.leads) || [];
    const enrichedLeads = (context && context.enrichedLeads) || leads;
    const tasks = [];
    const addedLeadIds = new Set();
    const priorityOrder = { '高': 0, '中': 1, '低': 2 };

    holdCandidates.forEach(h => {
      tasks.push({
        id: `sales-hold:${h.leadId}`,
        priority: '高',
        type: 'sales-hold',
        title: '入金予定を確認',
        targetName: h.leadName,
        reason: '入金注意タグがあります',
        action: h.action,
        leadId: h.leadId,
        openTarget: 'lead'
      });
      addedLeadIds.add(h.leadId);
    });

    const monthKey = summary.monthKey || this.currentMonthKey(today);
    const unlinkedRecords = this.activeRecords(this.filterMonthRecords(records, monthKey))
      .filter(r => !r.leadId);
    if (salesOutcome.unlinkedTotal > 0) {
      const first = unlinkedRecords[0];
      tasks.push({
        id: 'unlinked-revenue',
        priority: '高',
        type: 'unlinked-revenue',
        title: '売上を営業先に紐付け',
        targetName: this.formatYen(salesOutcome.unlinkedTotal),
        reason: '営業成果分析に反映されていない',
        action: '未紐付け売上を営業先と紐付ける',
        revenueId: first ? first.id : '',
        openTarget: 'revenue'
      });
    }

    enrichedLeads.forEach(lead => {
      if (addedLeadIds.has(lead.id)) return;
      const normalized = typeof SalesBrain !== 'undefined' ? SalesBrain.normalizeLead(lead) : lead;
      const ss = normalized.salesStatus || normalized.status;
      if (['成約', '見送り', 'NG'].includes(ss)) return;
      if (normalized.nextActionDate && normalized.nextActionDate <= today) {
        const dateReason = normalized.nextActionDate === today
          ? '次回連絡日が今日です'
          : `次回連絡日が過ぎています（${normalized.nextActionDate}）`;
        tasks.push({
          id: `next-action:${lead.id}`,
          priority: '高',
          type: 'next-action',
          title: '予定していた営業アクションを実行',
          targetName: lead.company,
          reason: normalized.nextAction || dateReason,
          action: normalized.nextAction || '予定していた営業アクションを実行',
          leadId: lead.id,
          openTarget: 'lead'
        });
        addedLeadIds.add(lead.id);
      }
    });

    nextCandidates.forEach(c => {
      if (addedLeadIds.has(c.leadId)) return;
      tasks.push({
        id: `next-sales:${c.leadId}`,
        priority: '中',
        type: 'next-sales',
        title: 'お礼連絡・次回提案',
        targetName: c.leadName,
        reason: c.reason,
        action: c.action,
        leadId: c.leadId,
        openTarget: 'lead'
      });
      addedLeadIds.add(c.leadId);
    });

    if (summary.monthlyTarget > 0 && summary.remainingToTarget > 0) {
      tasks.push({
        id: 'target-remaining',
        priority: '中',
        type: 'target-remaining',
        title: '売上候補を増やす',
        targetName: this.formatYen(summary.remainingToTarget),
        reason: `目標まで残り${this.formatYen(summary.remainingToTarget)}`,
        action: '営業先への追加提案または新規売上登録を進める',
        openTarget: 'sales'
      });
    }

    const normalizedRecords = this.normalizeRevenueRecords(records);
    const byLead = this.summarizeRevenueByLead(normalizedRecords, leads);
    byLead.forEach(item => {
      if (addedLeadIds.has(item.leadId)) return;
      if (!item.latestDate) return;
      const days = this.daysSince(item.latestDate, today);
      if (days === null || days < 30) return;
      const lead = leads.find(l => l.id === item.leadId);
      tasks.push({
        id: `repeat:${item.leadId}`,
        priority: '中',
        type: 'repeat',
        title: 'リピート提案',
        targetName: lead ? lead.company : item.leadName,
        reason: `前回売上から${days}日以上`,
        action: 'お礼＋次回提案',
        leadId: item.leadId,
        openTarget: 'lead'
      });
      addedLeadIds.add(item.leadId);
    });

    if (summary.recordCount === 0) {
      tasks.push({
        id: 'register-revenue',
        priority: '低',
        type: 'register-revenue',
        title: '直近の作業・予約・見込み客を登録',
        targetName: '売上番頭',
        reason: '今月の売上登録がまだありません',
        action: '売上登録から状況を見える化する',
        openTarget: 'revenue'
      });
    }

    const hasHold = holdCandidates.length > 0;
    if (summary.recordCount > 0 && salesOutcome.linkedTotal > 0 && salesOutcome.unlinkedTotal === 0 && !hasHold) {
      tasks.push({
        id: 'maintain-relationship',
        priority: '低',
        type: 'maintain-relationship',
        title: '既存営業先の関係維持',
        targetName: '営業番頭',
        reason: '紐付け売上あり・保留なし・未紐付けなし',
        action: '定期的なお礼・フォローを継続する',
        openTarget: 'sales'
      });
    }

    tasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    return tasks;
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
    if (summary.paymentConcernCount > 0) {
      comments.push('入金注意タグの案件があります。入金予定を確認してください。');
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
      : '今月の売上ペースは安定しています。高単価提案を継続してください。';
  },

  buildSummaryText(summary, comment) {
    const lines = [
      `売上予定：${this.formatYen(summary.planned)}`,
      `入金済み：${this.formatYen(summary.paid)}`,
      `入金待ち：${this.formatYen(summary.unpaid)}`,
      `月間目標：${this.formatYen(summary.monthlyTarget)}`,
      `目標まで残り：${this.formatYen(summary.remainingToTarget)}`,
      `達成率：${summary.achievementRate}%`
    ];
    if (comment) lines.push('', comment);
    return lines.join('\n');
  }
};
