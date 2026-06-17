/**
 * Budil v3.7 - 作業後フォロー・口コミ・リピート番頭
 */
const FollowUpBrain = {
  DEFAULT_REVIEW_URL: 'https://g.page/r/CQj7TW8RxXd1EBM/review',

  THANKS_STATUSES: ['pending', 'done', 'skipped'],
  REVIEW_STATUSES: ['pending', 'done', 'skipped'],
  REPEAT_STATUSES: ['pending', 'planned', 'done', 'skipped'],

  TASK_TYPES: {
    thanks: 'お礼LINE',
    review: '口コミ依頼',
    repeat: 'リピート確認',
    check: '作業後確認'
  },

  MAINTENANCE_RULES: [
    { pattern: /完全分解/, label: '1〜2年後', months: 18 },
    { pattern: /お掃除機能/, label: '1年後', months: 12 },
    { pattern: /エアコン/, label: '1年後', months: 12 },
    { pattern: /洗濯/, label: '6ヶ月〜1年後', months: 9 },
    { pattern: /レンジ|換気/, label: '1年後', months: 12 },
    { pattern: /キッチン|浴室|風呂/, label: '6ヶ月〜1年後', months: 9 }
  ],

  normalizeFollowUp(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const thanksStatus = this.THANKS_STATUSES.includes(src.thanksStatus) ? src.thanksStatus : 'pending';
    const reviewStatus = this.REVIEW_STATUSES.includes(src.reviewStatus) ? src.reviewStatus : 'pending';
    const repeatStatus = this.REPEAT_STATUSES.includes(src.repeatStatus) ? src.repeatStatus : 'pending';
    return {
      thanksStatus,
      reviewStatus,
      repeatStatus,
      thanksSentAt: String(src.thanksSentAt || '').trim(),
      reviewRequestedAt: String(src.reviewRequestedAt || '').trim(),
      nextMaintenanceDate: String(src.nextMaintenanceDate || '').trim(),
      memo: String(src.memo || '').trim(),
      updatedAt: String(src.updatedAt || '').trim()
    };
  },

  isValidFollowUpShape(raw) {
    if (raw == null) return true;
    if (typeof raw !== 'object' || Array.isArray(raw)) return false;
    const f = this.normalizeFollowUp(raw);
    return f.thanksStatus && f.reviewStatus && f.repeatStatus;
  },

  addMonths(dateStr, months) {
    const d = new Date((dateStr || new Date().toISOString().slice(0, 10)) + 'T12:00:00');
    d.setMonth(d.getMonth() + Number(months || 12));
    return d.toISOString().slice(0, 10);
  },

  addDays(dateStr, offset) {
    const d = new Date((dateStr || new Date().toISOString().slice(0, 10)) + 'T12:00:00');
    d.setDate(d.getDate() + Number(offset || 0));
    return d.toISOString().slice(0, 10);
  },

  daysBetween(fromDate, toDate) {
    if (!fromDate || !toDate) return null;
    const a = new Date(fromDate + 'T12:00:00');
    const b = new Date(toDate + 'T12:00:00');
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
    return Math.round((b - a) / 86400000);
  },

  getMaintenanceRule(serviceText) {
    const text = serviceText || '';
    for (const rule of this.MAINTENANCE_RULES) {
      if (rule.pattern.test(text)) return rule;
    }
    return { label: '1年後', months: 12 };
  },

  estimateNextMaintenanceDate(target, today) {
    const t = today || new Date().toISOString().slice(0, 10);
    const followUp = this.normalizeFollowUp(target.followUp);
    if (followUp.nextMaintenanceDate) return followUp.nextMaintenanceDate;
    const workDate = target.workDate || t;
    const rule = this.getMaintenanceRule(target.serviceText);
    return this.addMonths(workDate, rule.months);
  },

  getReviewUrl(businessProfile) {
    const p = businessProfile || {};
    const url = (p.googleReviewUrl || '').trim();
    return url || this.DEFAULT_REVIEW_URL;
  },

  resolveWorkDate(workOrder, revenue) {
    if (revenue && revenue.workDate) return revenue.workDate;
    if (workOrder) {
      if (workOrder.scheduledDate) return workOrder.scheduledDate;
      if (workOrder.completedAt) return workOrder.completedAt.slice(0, 10);
    }
    return '';
  },

  mergeFollowUp(workOrder, revenue) {
    const woFu = workOrder && workOrder.followUp ? this.normalizeFollowUp(workOrder.followUp) : null;
    const revFu = revenue && revenue.followUp ? this.normalizeFollowUp(revenue.followUp) : null;
    if (!woFu && !revFu) return this.normalizeFollowUp({});
    if (!woFu) return revFu;
    if (!revFu) return woFu;
    return this.normalizeFollowUp({
      ...woFu,
      thanksStatus: woFu.thanksStatus !== 'pending' ? woFu.thanksStatus : revFu.thanksStatus,
      reviewStatus: woFu.reviewStatus !== 'pending' ? woFu.reviewStatus : revFu.reviewStatus,
      repeatStatus: woFu.repeatStatus !== 'pending' ? woFu.repeatStatus : revFu.repeatStatus,
      thanksSentAt: woFu.thanksSentAt || revFu.thanksSentAt,
      reviewRequestedAt: woFu.reviewRequestedAt || revFu.reviewRequestedAt,
      nextMaintenanceDate: woFu.nextMaintenanceDate || revFu.nextMaintenanceDate,
      memo: woFu.memo || revFu.memo,
      updatedAt: woFu.updatedAt || revFu.updatedAt
    });
  },

  buildTargetFromWorkOrder(workOrder, revenue, lead, today) {
    const wo = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(workOrder)
      : workOrder;
    const rev = revenue ? (typeof RevenueBrain !== 'undefined' ? RevenueBrain.normalizeRevenueRecord(revenue) : revenue) : null;
    const workDate = this.resolveWorkDate(wo, rev);
    const followUp = this.mergeFollowUp(wo, rev);
    const daysSince = this.daysBetween(workDate, today);
    const amount = rev ? Number(rev.amount) || 0 : Number(wo.estimateAmount) || 0;
    const needsThanks = followUp.thanksStatus === 'pending';
    const needsReview = !!rev && followUp.reviewStatus === 'pending';
    const needsRepeat = followUp.repeatStatus === 'pending' || followUp.repeatStatus === 'planned';
    const nextMaint = followUp.nextMaintenanceDate || this.estimateNextMaintenanceDate({
      workDate,
      serviceText: wo.serviceText,
      followUp
    }, today);
    const daysToMaint = this.daysBetween(today, nextMaint);
    const maintenanceNear = daysToMaint != null && daysToMaint >= 0 && daysToMaint <= 14;
    const inWindow = daysSince != null && daysSince >= 1 && daysSince <= 7;
    const hasRevenue = !!(rev || wo.actualRevenueId);
    const isActionable = (needsThanks || needsReview || (needsRepeat && maintenanceNear))
      && (inWindow || maintenanceNear || (needsThanks && daysSince != null && daysSince <= 14));

    if (wo.status !== 'completed' && !maintenanceNear) return null;
    if (!isActionable && !maintenanceNear) return null;

    return {
      id: 'fu-wo-' + wo.id,
      workOrderId: wo.id,
      revenueId: rev ? rev.id : (wo.actualRevenueId || ''),
      leadId: wo.leadId || (rev ? rev.leadId : '') || (lead ? lead.id : ''),
      customerName: wo.customerName || (rev ? rev.customerName : '') || (lead ? lead.company : ''),
      workDate,
      serviceText: wo.serviceText || (rev ? rev.service : ''),
      amount,
      source: wo.source || (rev ? rev.source : ''),
      leadName: lead ? lead.company : '',
      followUp: { ...followUp, nextMaintenanceDate: nextMaint },
      daysSinceWork: daysSince,
      needsThanks: needsThanks && inWindow,
      needsReview: needsReview && inWindow,
      needsRepeat,
      maintenanceNear,
      maintenanceLabel: this.getMaintenanceRule(wo.serviceText || (rev && rev.service)).label,
      hasRevenue
    };
  },

  leadHasFollowUpActivity(lead, type) {
    if (!lead || !Array.isArray(lead.activityLogs)) return false;
    const patterns = {
      thanks: /お礼LINE|作業後フォロー：お礼/,
      review: /口コミ依頼/,
      repeat: /リピート予定|次回メンテナンス/
    };
    const re = patterns[type];
    if (!re) return false;
    return lead.activityLogs.some(log => re.test((log.title || '') + (log.memo || '')));
  },

  getFollowUpTargets(ctx) {
    const today = ctx.today || new Date().toISOString().slice(0, 10);
    const workOrders = ctx.workOrders || [];
    const revenues = ctx.revenues || [];
    const leads = ctx.leads || [];
    const revMap = new Map(revenues.filter(r => r && r.id).map(r => [r.id, r]));
    const leadMap = new Map(leads.filter(l => l && l.id).map(l => [l.id, l]));
    const targets = [];
    const seen = new Set();

    workOrders.forEach(raw => {
      const wo = typeof WorkOrderBrain !== 'undefined'
        ? WorkOrderBrain.normalizeWorkOrder(raw)
        : raw;
      if (wo.status !== 'completed') return;
      const rev = wo.actualRevenueId ? revMap.get(wo.actualRevenueId) : null;
      const lead = wo.leadId ? leadMap.get(wo.leadId) : (rev && rev.leadId ? leadMap.get(rev.leadId) : null);
      const target = this.buildTargetFromWorkOrder(wo, rev, lead, today);
      if (!target) return;
      if (seen.has(target.workOrderId)) return;
      seen.add(target.workOrderId);
      targets.push(target);
    });

    revenues.forEach(raw => {
      const rev = typeof RevenueBrain !== 'undefined'
        ? RevenueBrain.normalizeRevenueRecord(raw)
        : raw;
      if (!rev || rev.status === 'キャンセル') return;
      if (seen.has('rev-' + rev.id)) return;
      const linkedWo = workOrders.find(w => w && w.actualRevenueId === rev.id);
      if (linkedWo) return;
      const workDate = rev.workDate || '';
      const daysSince = this.daysBetween(workDate, today);
      const inWindow = daysSince != null && daysSince >= 1 && daysSince <= 7;
      const followUp = this.normalizeFollowUp(rev.followUp);
      const lead = rev.leadId ? leadMap.get(rev.leadId) : null;
      const needsThanks = followUp.thanksStatus === 'pending' && inWindow;
      const needsReview = followUp.reviewStatus === 'pending' && inWindow;
      if (!needsThanks && !needsReview) return;
      const target = {
        id: 'fu-rev-' + rev.id,
        workOrderId: '',
        revenueId: rev.id,
        leadId: rev.leadId || '',
        customerName: rev.customerName || '',
        workDate,
        serviceText: rev.service || '',
        amount: Number(rev.amount) || 0,
        source: rev.source || '',
        leadName: lead ? lead.company : '',
        followUp,
        daysSinceWork: daysSince,
        needsThanks,
        needsReview,
        needsRepeat: followUp.repeatStatus === 'pending' || followUp.repeatStatus === 'planned',
        maintenanceNear: false,
        maintenanceLabel: this.getMaintenanceRule(rev.service).label,
        hasRevenue: true
      };
      seen.add('rev-' + rev.id);
      targets.push(target);
    });

    leads.forEach(lead => {
      if (!lead || !lead.id) return;
      const nd = lead.nextActionDate || lead.nextContact || '';
      const daysTo = this.daysBetween(today, nd);
      const isRepeatLead = lead.salesStatus === 'リピート候補' || /次回メンテナンス/.test(lead.nextAction || '');
      if (!isRepeatLead || daysTo == null || daysTo < 0 || daysTo > 14) return;
      if (seen.has('lead-' + lead.id)) return;
      targets.push({
        id: 'fu-lead-' + lead.id,
        workOrderId: '',
        revenueId: '',
        leadId: lead.id,
        customerName: lead.company || '',
        workDate: nd,
        serviceText: lead.service || '',
        amount: 0,
        source: lead.source || '',
        leadName: lead.company || '',
        followUp: this.normalizeFollowUp({ repeatStatus: 'planned', nextMaintenanceDate: nd }),
        daysSinceWork: null,
        needsThanks: false,
        needsReview: false,
        needsRepeat: true,
        maintenanceNear: true,
        maintenanceLabel: '次回メンテナンス確認',
        hasRevenue: false,
        isLeadOnly: true
      });
      seen.add('lead-' + lead.id);
    });

    targets.sort((a, b) => {
      const score = t => (t.needsThanks ? 0 : 3) + (t.needsReview ? 1 : 0) + (t.maintenanceNear ? 2 : 4);
      return score(a) - score(b);
    });
    return targets;
  },

  shortServiceLabel(serviceText) {
    const s = (serviceText || '').trim();
    if (!s) return '作業';
    if (s.length <= 24) return s;
    return s.slice(0, 24) + '…';
  },

  generateThanksMessage(target, businessProfile) {
    const name = (target.customerName || 'お客様').replace(/様$/, '') + '様';
    const service = this.shortServiceLabel(target.serviceText);
    const biz = businessProfile && businessProfile.businessName
      ? businessProfile.businessName
      : '';
    const lines = [
      `本日は${service}のご依頼ありがとうございました。`,
      '',
      '作業後に気になる点や、風のニオイ・水漏れなどがありましたら、遠慮なくLINEでご連絡ください。',
      '',
      'また次回も何かあればお気軽にご相談ください。'
    ];
    if (businessProfile && businessProfile.followUpMemo) {
      lines.push('', businessProfile.followUpMemo);
    }
    if (biz) lines.push('', biz);
    return lines.join('\n').trim();
  },

  generateReviewRequest(target, businessProfile) {
    const reviewUrl = this.getReviewUrl(businessProfile);
    const lines = [
      '本日はご依頼ありがとうございました。',
      '',
      'もし作業内容にご満足いただけましたら、今後の励みになりますので、Googleの口コミにご協力いただけると嬉しいです。',
      '',
      '無理のない範囲で大丈夫です。',
      'よろしくお願いいたします。'
    ];
    if (reviewUrl) {
      lines.push('', reviewUrl);
    }
    return lines.join('\n').trim();
  },

  generateRepeatProposal(target, businessProfile) {
    const rule = this.getMaintenanceRule(target.serviceText);
    const nextDate = target.followUp && target.followUp.nextMaintenanceDate
      ? target.followUp.nextMaintenanceDate
      : this.estimateNextMaintenanceDate(target, new Date().toISOString().slice(0, 10));
    const service = this.shortServiceLabel(target.serviceText);
    let body = '';
    if (/エアコン/.test(target.serviceText || '')) {
      body = 'エアコンは使用状況にもよりますが、1年に1回ほど内部確認しておくと安心です。';
    } else if (/洗濯/.test(target.serviceText || '')) {
      body = '洗濯機は半年〜1年ほどで再度カビやニオイが気になることがあります。';
    } else {
      body = `${service}は定期的なメンテナンス（目安：${rule.label}）をおすすめしています。`;
    }
    return [
      body,
      '来年の同じ時期にまた気になることがあれば、お気軽にご相談ください。',
      '',
      `次回目安：${nextDate}`
    ].join('\n');
  },

  formatFollowUpStatus(target) {
    const f = this.normalizeFollowUp(target.followUp);
    const parts = [];
    parts.push('お礼：' + ({ pending: '未', done: '済', skipped: '省略' }[f.thanksStatus] || f.thanksStatus));
    parts.push('口コミ：' + ({ pending: '未', done: '済', skipped: '省略' }[f.reviewStatus] || f.reviewStatus));
    parts.push('リピート：' + ({ pending: '未', planned: '予定', done: '済', skipped: '省略' }[f.repeatStatus] || f.repeatStatus));
    return parts.join(' / ');
  },

  formatFollowUpBadges(followUp) {
    const f = this.normalizeFollowUp(followUp);
    const badges = [];
    if (f.thanksStatus === 'done') badges.push('<span class="follow-up-badge follow-up-thanks-done">お礼済み</span>');
    else if (f.thanksStatus === 'pending') badges.push('<span class="follow-up-badge follow-up-thanks-pending">お礼未</span>');
    if (f.reviewStatus === 'done') badges.push('<span class="follow-up-badge follow-up-review-done">口コミ依頼済み</span>');
    else if (f.reviewStatus === 'pending') badges.push('<span class="follow-up-badge follow-up-review-pending">口コミ未</span>');
    if (f.repeatStatus === 'planned' || f.repeatStatus === 'done') {
      badges.push('<span class="follow-up-badge follow-up-repeat-planned">リピート予定</span>');
    }
    return badges.join(' ');
  },

  createFollowUpTaskPayload(target, type, today) {
    const t = today || new Date().toISOString().slice(0, 10);
    const name = target.customerName || 'お客様';
    const titleMap = {
      thanks: `お礼LINE：${name}`,
      review: `口コミ依頼：${name}`,
      repeat: `リピート確認：${name}`,
      check: `作業後確認：${name}`
    };
    const title = titleMap[type] || `作業後確認：${name}`;
    const refId = target.workOrderId || target.revenueId || target.leadId || '';
    return {
      title,
      targetName: name,
      priority: type === 'thanks' ? '高' : '中',
      action: title,
      memo: target.serviceText || '',
      dueDate: t,
      status: 'open',
      reason: '作業後フォロー番頭から',
      leadId: target.leadId || '',
      leadName: name,
      workOrderId: target.workOrderId || '',
      revenueId: target.revenueId || '',
      followUpType: type,
      pickupDedupeKey: ['follow-up', t, refId, type, title].join('|')
    };
  },

  buildLeadActivityLog(target, type, extra) {
    const now = new Date().toISOString();
    const map = {
      thanks: {
        type: 'contact',
        title: '作業後フォロー：お礼LINE送信済み',
        memo: (target.serviceText || '') + (extra && extra.memo ? ' / ' + extra.memo : '')
      },
      review: {
        type: 'contact',
        title: '口コミ依頼：Google口コミ依頼文を送信済み',
        memo: target.serviceText || ''
      },
      repeat: {
        type: 'other',
        title: 'リピート予定：' + (extra && extra.nextMaintenanceDate ? extra.nextMaintenanceDate + ' に次回メンテナンス確認' : '次回メンテナンス確認'),
        memo: target.serviceText || ''
      },
      memo: {
        type: 'work-memo',
        title: '作業後フォローメモ',
        memo: (extra && extra.memo) || ''
      }
    };
    const entry = map[type] || map.memo;
    return { ...entry, date: now.slice(0, 10), createdAt: now };
  },

  buildHomeComment(targets) {
    const list = targets || [];
    const thanks = list.filter(t => t.needsThanks).length;
    const review = list.filter(t => t.needsReview).length;
    const repeat = list.filter(t => t.needsRepeat && t.maintenanceNear).length;
    const total = thanks + review + repeat;
    if (!total) return '';
    const parts = [];
    if (thanks) parts.push(`お礼LINE ${thanks}件`);
    if (review) parts.push(`口コミ依頼 ${review}件`);
    if (repeat) parts.push(`リピート確認 ${repeat}件`);
    return `作業後フォローが${total}件あります（${parts.join('、')}）。忘れないようにしましょう。`;
  },

  buildMorningLines(targets) {
    const list = targets || [];
    const thanks = list.filter(t => t.needsThanks).length;
    const review = list.filter(t => t.needsReview).length;
    const repeat = list.filter(t => t.needsRepeat && (t.maintenanceNear || t.needsRepeat)).length;
    if (!thanks && !review && !repeat) return [];
    const lines = ['作業後フォロー：'];
    if (thanks) lines.push(`・お礼LINE ${thanks}件`);
    if (review) lines.push(`・口コミ依頼 ${review}件`);
    if (repeat) lines.push(`・リピート確認 ${repeat}件`);
    return lines;
  },

  buildWarnings(targets, today) {
    const warnings = [];
    const list = targets || [];
    const thanks = list.filter(t => t.needsThanks);
    const review = list.filter(t => t.needsReview);
    const repeat = list.filter(t => t.maintenanceNear && t.needsRepeat);
    if (thanks.length) warnings.push(`お礼未送信：${thanks.length}件`);
    if (review.length) warnings.push(`口コミ依頼未送信：${review.length}件`);
    if (repeat.length) warnings.push(`次回メンテナンス日が近いリピート候補：${repeat.length}件`);
    const doneNoFollow = list.filter(t =>
      t.hasRevenue && t.followUp.thanksStatus === 'pending' && t.followUp.reviewStatus === 'pending'
    );
    if (doneNoFollow.length) {
      warnings.push(`作業完了・売上登録済みだがフォロー未対応：${doneNoFollow.length}件`);
    }
    return warnings;
  },

  getDiagnosticsCounts(workOrders, revenues, leads, today) {
    const t = today || new Date().toISOString().slice(0, 10);
    const targets = this.getFollowUpTargets({
      workOrders: workOrders || [],
      revenues: revenues || [],
      leads: leads || [],
      today: t
    });
    let badFollowUp = 0;
    (workOrders || []).forEach(wo => {
      if (wo && wo.followUp != null && !this.isValidFollowUpShape(wo.followUp)) badFollowUp++;
    });
    (revenues || []).forEach(rev => {
      if (rev && rev.followUp != null && !this.isValidFollowUpShape(rev.followUp)) badFollowUp++;
    });
    const thanksPending = targets.filter(x => x.needsThanks).length;
    const reviewPending = targets.filter(x => x.needsReview).length;
    const maintNear = targets.filter(x => x.maintenanceNear && x.needsRepeat).length;
    return { thanksPending, reviewPending, maintNear, badFollowUp };
  },

  getFollowUpHistory(targets) {
    return (targets || [])
      .filter(t => {
        const f = t.followUp;
        return f.thanksStatus === 'done' || f.reviewStatus === 'done' || f.repeatStatus === 'planned' || f.repeatStatus === 'done';
      })
      .slice(0, 20);
  }
};
