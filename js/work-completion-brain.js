/**
 * Budil v4.8.6 - 作業後の確定処理番頭
 */
const WorkCompletionBrain = {
  PAYMENT_METHODS: ['現金', 'カード', '振込', 'PayPay', 'その他'],

  TASK_TYPES: {
    confirm: '作業後確定',
    revenue: '売上確定確認',
    payment: '入金確認',
    cancelFollow: 'キャンセル後フォロー'
  },

  normalizeCompletion(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const now = new Date().toISOString();
    return {
      status: String(src.status || '').trim(),
      completedAt: String(src.completedAt || '').trim(),
      revenueId: String(src.revenueId || '').trim(),
      actualAmount: src.actualAmount != null && src.actualAmount !== '' ? Number(src.actualAmount) || 0 : '',
      actualService: String(src.actualService || '').trim(),
      paymentStatus: String(src.paymentStatus || '').trim(),
      memo: String(src.memo || '').trim(),
      needsReview: src.needsReview === true,
      reviewNote: String(src.reviewNote || '').trim(),
      updatedAt: String(src.updatedAt || now).trim()
    };
  },

  normalizeCancelInfo(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      reason: String(src.reason || '').trim(),
      canceledAt: String(src.canceledAt || '').trim(),
      proposeAgain: src.proposeAgain === true,
      memo: String(src.memo || '').trim()
    };
  },

  isOperationalWorkOrder(workOrder) {
    const wo = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(workOrder)
      : workOrder;
    if (!wo) return false;
    if (typeof CalendarCandidateBrain !== 'undefined'
      && CalendarCandidateBrain.isPendingCandidate(wo)) return false;
    return true;
  },

  getLinkedRevenue(workOrder, revenues) {
    const wo = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(workOrder)
      : workOrder;
    if (!wo || !wo.actualRevenueId) return null;
    return (revenues || []).find(r => r && r.id === wo.actualRevenueId) || null;
  },

  getDisplayStatus(workOrder, revenues) {
    const wo = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(workOrder)
      : workOrder;
    if (!wo) return '—';
    const completion = wo.completion ? this.normalizeCompletion(wo.completion) : null;
    if (wo.status === 'cancelled') return 'キャンセル';
    if (completion && completion.needsReview) return '要確認';
    const rev = this.getLinkedRevenue(wo, revenues);
    if (rev) {
      if (typeof PaymentBrain !== 'undefined' ? PaymentBrain.isReceivablePending(rev) : rev.paymentStatus === '未入金') return '作業完了・入金待ち';
      return '売上確定済み';
    }
    if (wo.status === 'completed' || this.isPastScheduledActive(wo)) return '売上未確定';
    return '売上未確定';
  },

  isPastScheduledActive(workOrder, today) {
    const wo = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(workOrder)
      : workOrder;
    const t = today || new Date().toISOString().slice(0, 10);
    if (!wo || !wo.scheduledDate) return false;
    if (!WorkOrderBrain.ACTIVE_STATUSES.includes(wo.status)) return false;
    return wo.scheduledDate <= t;
  },

  needsCompletionConfirm(workOrder, today) {
    const wo = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(workOrder)
      : workOrder;
    if (!this.isOperationalWorkOrder(wo)) return false;
    if (wo.status === 'cancelled' || wo.status === 'archived') return false;
    if (wo.actualRevenueId) return false;
    if (wo.completion && wo.completion.needsReview) return true;
    if (wo.status === 'completed') return true;
    return this.isPastScheduledActive(wo, today);
  },

  isRevenueLocked(workOrder) {
    const wo = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(workOrder)
      : workOrder;
    return !!(wo && wo.actualRevenueId);
  },

  buildCompletionFormDefaults(workOrder) {
    const wo = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(workOrder)
      : workOrder;
    const service = typeof ReceptionBrain !== 'undefined'
      ? ReceptionBrain.matchRevenueService(wo.serviceText)
      : wo.serviceText;
    const source = typeof ReceptionBrain !== 'undefined'
      ? ReceptionBrain.matchRevenueSource(wo.source)
      : wo.source;
    const today = new Date().toISOString().slice(0, 10);
    return {
      workDate: wo.scheduledDate || today,
      customerName: wo.customerName || '',
      actualService: wo.serviceText || '',
      service,
      source,
      amount: wo.estimateAmount || '',
      grossMarginRate: '',
      paymentStatus: '未入金',
      paymentDate: '',
      paymentMethod: '',
      paymentConcern: false,
      additionalMemo: wo.memo || '',
      actualMemo: '',
      followMemo: '',
      cancelReason: '',
      leadId: wo.leadId || ''
    };
  },

  createRevenuePayloadFromWorkOrder(workOrder, input) {
    const wo = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(workOrder)
      : workOrder;
    const now = new Date().toISOString();
    const memoParts = [input.actualMemo, input.additionalMemo].filter(Boolean);
    const payload = {
      workDate: input.workDate || wo.scheduledDate || now.slice(0, 10),
      customerName: String(input.customerName || wo.customerName || '').trim(),
      service: input.service || input.actualService || wo.serviceText || '',
      source: input.source || wo.source || '',
      amount: Number(input.amount) || 0,
      status: '確定',
      paymentStatus: input.paymentStatus || '未入金',
      paymentConcern: input.paymentConcern === true,
      memo: memoParts.join('\n'),
      leadId: input.leadId || wo.leadId || '',
      leadName: '',
      sourceWorkOrderId: wo.id,
      intakeId: wo.intakeId || '',
      receptionIntakeId: wo.receptionIntakeId || wo.intakeId || '',
      sourceIntakeId: wo.sourceIntakeId || wo.intakeId || '',
      confirmedFrom: 'work-order',
      confirmedAt: now,
      isConfirmedRevenue: true,
      actualMemo: String(input.actualMemo || '').trim(),
      paymentDate: String(input.paymentDate || '').trim(),
      paymentMethod: String(input.paymentMethod || '').trim()
    };
    if (input.grossMarginRate !== '' && input.grossMarginRate != null) {
      const rate = Number(input.grossMarginRate);
      if (!Number.isNaN(rate)) payload.grossMarginRate = rate;
    }
    if (wo.candidateMeta) {
      payload.candidateMeta = {
        fromCandidate: true,
        originalEstimateAmount: String(wo.candidateMeta.estimatedAmount || wo.estimateAmount || ''),
        originalImportSource: String(wo.candidateMeta.importSource || '')
      };
    }
    if (typeof FollowUpBrain !== 'undefined') {
      payload.followUp = FollowUpBrain.normalizeFollowUp({
        thanksStatus: 'pending',
        reviewStatus: 'pending',
        repeatStatus: 'pending',
        memo: String(input.followMemo || '').trim(),
        updatedAt: now
      });
    }
    return payload;
  },

  markWorkOrderCompleted(workOrder, revenueRecord, input) {
    const wo = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(workOrder)
      : workOrder;
    const now = new Date().toISOString();
    const completion = this.normalizeCompletion({
      status: 'completed',
      completedAt: wo.completedAt || now,
      revenueId: revenueRecord.id,
      actualAmount: Number(input.amount) || 0,
      actualService: input.actualService || input.service || wo.serviceText,
      paymentStatus: input.paymentStatus || '未入金',
      memo: input.actualMemo || '',
      needsReview: false,
      updatedAt: now
    });
    const patch = {
      status: 'completed',
      completedAt: wo.completedAt || now,
      actualRevenueId: revenueRecord.id,
      completion
    };
    if (typeof FollowUpBrain !== 'undefined') {
      patch.followUp = FollowUpBrain.normalizeFollowUp({
        thanksStatus: 'pending',
        reviewStatus: 'pending',
        repeatStatus: 'pending',
        memo: input.followMemo || '',
        updatedAt: now
      });
    }
    if (wo.candidateMeta) {
      patch.candidateMeta = {
        ...wo.candidateMeta,
        confirmedRevenue: true
      };
    }
    return patch;
  },

  markWorkOrderCanceled(workOrder, cancelInput) {
    const wo = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(workOrder)
      : workOrder;
    const now = new Date().toISOString();
    const cancel = this.normalizeCancelInfo({
      reason: cancelInput.reason,
      canceledAt: cancelInput.canceledAt || now.slice(0, 10),
      proposeAgain: cancelInput.proposeAgain === true,
      memo: cancelInput.memo || ''
    });
    return {
      status: 'cancelled',
      completion: this.normalizeCompletion({
        status: 'cancelled',
        completedAt: '',
        revenueId: '',
        memo: cancel.memo,
        needsReview: false,
        updatedAt: now
      }),
      cancel,
      memo: [wo.memo, cancel.reason ? `キャンセル：${cancel.reason}` : ''].filter(Boolean).join('\n')
    };
  },

  markWorkOrderNeedsReview(workOrder, note) {
    const wo = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(workOrder)
      : workOrder;
    const now = new Date().toISOString();
    const completion = this.normalizeCompletion({
      ...(wo.completion || {}),
      needsReview: true,
      reviewNote: String(note || '').trim(),
      updatedAt: now
    });
    return { completion };
  },

  summarizeTargets(workOrders, revenues, today) {
    const t = today || new Date().toISOString().slice(0, 10);
    const list = (workOrders || []).filter(w => this.isOperationalWorkOrder(w));
    const revList = revenues || [];
    let pendingConfirmCount = 0;
    let unpaidCount = 0;
    let cancelFollowUpCount = 0;
    let todayPendingCount = 0;
    let needsReviewCount = 0;

    list.forEach(raw => {
      const wo = typeof WorkOrderBrain !== 'undefined'
        ? WorkOrderBrain.normalizeWorkOrder(raw)
        : raw;
      if (this.needsCompletionConfirm(wo, t)) {
        pendingConfirmCount += 1;
        if (wo.scheduledDate === t) todayPendingCount += 1;
      }
      if (wo.completion && wo.completion.needsReview) needsReviewCount += 1;
      const rev = this.getLinkedRevenue(wo, revList);
      if (rev && (typeof PaymentBrain !== 'undefined' ? PaymentBrain.isReceivablePending(rev) : rev.paymentStatus === '未入金') && rev.status !== 'キャンセル') unpaidCount += 1;
      if (wo.status === 'cancelled' && wo.cancel && wo.cancel.proposeAgain) cancelFollowUpCount += 1;
    });

    return {
      pendingConfirmCount,
      unpaidCount,
      cancelFollowUpCount,
      todayPendingCount,
      needsReviewCount
    };
  },

  getCompletionTargets(workOrders, revenues, today) {
    const t = today || new Date().toISOString().slice(0, 10);
    return (workOrders || [])
      .filter(w => this.isOperationalWorkOrder(w))
      .map(w => typeof WorkOrderBrain !== 'undefined' ? WorkOrderBrain.normalizeWorkOrder(w) : w)
      .filter(w => this.needsCompletionConfirm(w, t) || (w.completion && w.completion.needsReview))
      .map(w => ({
        workOrder: w,
        displayStatus: this.getDisplayStatus(w, revenues),
        revenue: this.getLinkedRevenue(w, revenues)
      }));
  },

  createTaskPayload(workOrder, type, today) {
    const wo = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(workOrder)
      : workOrder;
    const t = today || new Date().toISOString().slice(0, 10);
    const name = wo.customerName || 'お客様';
    const titles = {
      confirm: `作業後確定：${name}`,
      revenue: `売上確定確認：${name}`,
      payment: `入金確認：${name}`,
      cancelFollow: `キャンセル後フォロー：${name}`
    };
    const title = titles[type] || titles.confirm;
    return {
      title,
      targetName: name,
      priority: type === 'payment' ? '高' : '中',
      action: title,
      memo: wo.serviceText || '',
      dueDate: t,
      status: 'open',
      reason: '作業後確定処理番頭から',
      leadId: wo.leadId || '',
      leadName: name,
      pickupDedupeKey: ['work-completion', type, t, wo.id, title].join('|'),
      workOrderId: wo.id
    };
  },

  buildHomeComment(summary) {
    const s = summary || {};
    const parts = [];
    if (s.pendingConfirmCount) {
      parts.push(`作業後確定待ちが${s.pendingConfirmCount}件あります。金額・作業内容・支払い状態を確認して、確定売上に登録してください`);
    }
    if (s.unpaidCount) {
      parts.push(`入金待ちが${s.unpaidCount}件あります`);
    }
    if (s.cancelFollowUpCount) {
      parts.push(`キャンセル後フォローが${s.cancelFollowUpCount}件あります`);
    }
    return parts.join('。') + (parts.length ? '。' : '');
  },

  buildMorningReport(summary) {
    const s = summary || {};
    if (!s.pendingConfirmCount && !s.unpaidCount && !s.cancelFollowUpCount) return [];
    const lines = ['作業後確定：'];
    if (s.pendingConfirmCount) lines.push(`・売上確定待ち ${s.pendingConfirmCount}件`);
    if (s.unpaidCount) lines.push(`・入金待ち ${s.unpaidCount}件`);
    if (s.cancelFollowUpCount) lines.push(`・キャンセル後フォロー ${s.cancelFollowUpCount}件`);
    return lines.length > 1 ? lines : [];
  },

  buildWarnings(workOrders, revenues, today) {
    const warnings = [];
    const s = this.summarizeTargets(workOrders, revenues, today);
    if (s.pendingConfirmCount) warnings.push(`作業後確定待ち（売上未確定）：${s.pendingConfirmCount}件`);
    if (s.needsReviewCount) warnings.push(`要確認の作業予定：${s.needsReviewCount}件`);
    if (s.unpaidCount) warnings.push(`入金待ちの確定売上：${s.unpaidCount}件`);
    const t = today || new Date().toISOString().slice(0, 10);
    const overdue = (workOrders || []).filter(w => {
      const wo = typeof WorkOrderBrain !== 'undefined' ? WorkOrderBrain.normalizeWorkOrder(w) : w;
      return this.isOperationalWorkOrder(wo)
        && WorkOrderBrain.ACTIVE_STATUSES.includes(wo.status)
        && wo.scheduledDate && wo.scheduledDate < t;
    });
    if (overdue.length) warnings.push(`予定日が過ぎたが未完了：${overdue.length}件`);
    let orphanRev = 0;
    (revenues || []).forEach(r => {
      if (!r.sourceWorkOrderId || !r.isConfirmedRevenue) return;
      const wo = (workOrders || []).find(w => w && w.id === r.sourceWorkOrderId);
      if (!wo || wo.actualRevenueId !== r.id) orphanRev += 1;
    });
    if (orphanRev) warnings.push(`売上確定済みだが作業予定に未紐付け：${orphanRev}件`);
    const cancelNoMemo = (workOrders || []).filter(w => {
      const wo = typeof WorkOrderBrain !== 'undefined' ? WorkOrderBrain.normalizeWorkOrder(w) : w;
      return wo.status === 'cancelled' && !(wo.cancel && wo.cancel.reason);
    });
    if (cancelNoMemo.length) warnings.push(`キャンセル理由なし：${cancelNoMemo.length}件`);
    return warnings;
  },

  getDiagnosticsCounts(workOrders, revenues, today) {
    const t = today || new Date().toISOString().slice(0, 10);
    const list = (workOrders || []).map(w =>
      typeof WorkOrderBrain !== 'undefined' ? WorkOrderBrain.normalizeWorkOrder(w) : w
    );
    const revList = revenues || [];
    let completedNoRevenue = 0;
    let overdueActive = 0;
    let orphanConfirmed = 0;
    let unpaid = 0;
    let cancelNoMemo = 0;

    list.forEach(wo => {
      if (!this.isOperationalWorkOrder(wo)) return;
      if (wo.status === 'completed' && !wo.actualRevenueId) completedNoRevenue += 1;
      if (WorkOrderBrain.ACTIVE_STATUSES.includes(wo.status) && wo.scheduledDate && wo.scheduledDate < t) {
        overdueActive += 1;
      }
      if (wo.status === 'cancelled' && !(wo.cancel && wo.cancel.reason)) cancelNoMemo += 1;
    });

    revList.forEach(r => {
      if ((typeof PaymentBrain !== 'undefined' ? PaymentBrain.isReceivablePending(r) : r.paymentStatus === '未入金') && r.status !== 'キャンセル' && r.isConfirmedRevenue) unpaid += 1;
      if (r.sourceWorkOrderId && r.isConfirmedRevenue) {
        const wo = list.find(w => w.id === r.sourceWorkOrderId);
        if (!wo || wo.actualRevenueId !== r.id) orphanConfirmed += 1;
      }
    });

    return {
      completedNoRevenue,
      overdueActive,
      orphanConfirmed,
      unpaid,
      cancelNoMemo,
      ...this.summarizeTargets(workOrders, revenues, today)
    };
  }
};
