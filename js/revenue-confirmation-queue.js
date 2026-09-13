/**
 * 売上確定待ちキュー（READ）。app.js の collectRevenueConfirmationQueue と同一判定。
 * Storage / DOM には触れない。localStorage 非書込。
 */
const RevenueConfirmationQueue = {
  collect(workOrders, revenues, today, options) {
    const opts = options || {};
    const scheduleMode = !!opts.scheduleMode;
    const pastRecoveryUiEnabled = opts.pastRecoveryUiEnabled === true;
    const workOrderItems = [];

    (workOrders || []).forEach(raw => {
      const wo = typeof WorkOrderBrain !== 'undefined'
        ? WorkOrderBrain.normalizeWorkOrder(raw)
        : raw;
      if (typeof WorkCompletionBrain === 'undefined' || !WorkCompletionBrain.isOperationalWorkOrder(wo)) {
        // v4.10.27: 候補ステータスのカレンダー予定でも今日・過去日付+金額ありなら確定待ちに含める
        if (typeof CalendarCandidateBrain !== 'undefined'
          && CalendarCandidateBrain.isCalendarCandidateWorkOrder(wo)
          && CalendarCandidateBrain.isPendingCandidate(wo)
          && !wo.actualRevenueId
          && (wo.scheduledEndDate || wo.scheduledDate) && (wo.scheduledEndDate || wo.scheduledDate) <= today
          && Number(wo.estimateAmount || 0) > 0
          && wo.status !== 'cancelled' && wo.status !== 'archived'
          && (!scheduleMode || wo.status !== 'completed')) {
          workOrderItems.push({
            type: 'work-order',
            id: wo.id,
            scheduledDate: wo.scheduledDate || '',
            startTime: wo.startTime || '',
            endTime: wo.endTime || '',
            createdAt: wo.createdAt || '',
            customerName: wo.customerName || 'お客様',
            serviceText: wo.serviceText || '',
            source: wo.source || '',
            amount: wo.estimateAmount,
            statusLabel: '売上確定待ち'
          });
        }
        return;
      }
      if (wo.status === 'cancelled' || wo.status === 'archived') return;
      if (wo.actualRevenueId) return;
      if (wo.scheduledDate && wo.scheduledDate > today) return;
      if (scheduleMode) {
        if (wo.status === 'completed') return;
        if (Number(wo.estimateAmount || 0) <= 0) return;
        const isPastScheduled = WorkCompletionBrain.isPastScheduledActive(wo, today);
        const needsReview = !!(wo.completion && wo.completion.needsReview);
        if (!isPastScheduled && !needsReview) return;
        workOrderItems.push({
          type: 'work-order',
          id: wo.id,
          scheduledDate: wo.scheduledDate || '',
          startTime: wo.startTime || '',
          endTime: wo.endTime || '',
          createdAt: wo.createdAt || '',
          customerName: wo.customerName || 'お客様',
          serviceText: wo.serviceText || '',
          source: wo.source || '',
          amount: wo.estimateAmount,
          statusLabel: needsReview ? '要確認' : '売上確定待ち'
        });
        return;
      }

      const isCompleted = wo.status === 'completed';
      const isPastScheduled = WorkCompletionBrain.isPastScheduledActive(wo, today);
      if (!isCompleted && !isPastScheduled && !(wo.completion && wo.completion.needsReview)) return;

      let statusLabel = '売上未確定';
      if (isCompleted) statusLabel = '売上未確定';
      else if (isPastScheduled || (wo.completion && wo.completion.needsReview)) statusLabel = '売上確定待ち';

      workOrderItems.push({
        type: 'work-order',
        id: wo.id,
        scheduledDate: wo.scheduledDate || '',
        startTime: wo.startTime || '',
        endTime: wo.endTime || '',
        createdAt: wo.createdAt || '',
        customerName: wo.customerName || 'お客様',
        serviceText: wo.serviceText || '',
        source: wo.source || '',
        amount: wo.estimateAmount,
        statusLabel
      });
    });

    const workOrderIds = new Set(workOrderItems.map(item => item.id));
    const pastRecoveryItems = [];

    if (pastRecoveryUiEnabled && typeof CalendarCandidateBrain !== 'undefined') {
      const classifyOptions = { today };
      (workOrders || []).forEach(raw => {
        const wo = typeof WorkOrderBrain !== 'undefined'
          ? WorkOrderBrain.normalizeWorkOrder(raw)
          : raw;
        if (workOrderIds.has(wo.id)) return;
        if (!CalendarCandidateBrain.isCalendarCandidateWorkOrder(wo)) return;
        if ((wo.candidateMeta && wo.candidateMeta.importSource) !== CalendarCandidateBrain.IMPORT_SOURCE) return;
        if (CalendarCandidateBrain.getCandidateStatus(wo) === CalendarCandidateBrain.PAST_RECOVERY_CONVERTED) return;
        if (wo.actualRevenueId) return;
        if (wo.scheduledDate && wo.scheduledDate > today) return;

        const classification = CalendarCandidateBrain.classifyPastRecoveryCandidate(wo, revenues, classifyOptions);
        if (classification.status !== CalendarCandidateBrain.PAST_RECOVERY_REVENUE_CANDIDATE) return;
        if (scheduleMode) return;

        pastRecoveryItems.push({
          type: 'past-recovery',
          id: wo.id,
          scheduledDate: wo.scheduledDate || '',
          startTime: wo.startTime || '',
          endTime: wo.endTime || '',
          createdAt: wo.createdAt || '',
          customerName: wo.customerName || 'お客様',
          serviceText: wo.serviceText || '',
          source: wo.source || '',
          amount: wo.estimateAmount,
          statusLabel: '過去売上復元'
        });
      });
    }

    const sorter = typeof WorkOrderBrain !== 'undefined' && typeof WorkOrderBrain.sortByScheduledDateTimeAsc === 'function'
      ? WorkOrderBrain.sortByScheduledDateTimeAsc.bind(WorkOrderBrain)
      : (items => (items || []).slice());
    const allItems = sorter([...workOrderItems, ...pastRecoveryItems]);
    const previewLimit = opts.previewLimit != null ? opts.previewLimit : 3;
    return {
      items: allItems,
      visible: allItems.slice(0, previewLimit),
      hiddenCount: Math.max(0, allItems.length - previewLimit),
      totalCount: allItems.length,
      workOrderCount: workOrderItems.length,
      pastRecoveryCount: pastRecoveryItems.length
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RevenueConfirmationQueue;
}
