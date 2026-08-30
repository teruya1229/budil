/**
 * Budil v4.8.13 - 作業後の確定処理番頭
 */
const WorkCompletionBrain = {
  PAYMENT_METHODS: ['現金', 'カード', '振込', 'PayPay', 'その他'],

  TASK_TYPES: {
    confirm: '売上確定',
    revenue: '売上確定',
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
      if (typeof PaymentBrain !== 'undefined' ? PaymentBrain.isReceivablePending(rev) : rev.paymentStatus === '未入金') return '売上確定済み・入金待ち';
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

  getNextMonthEndDate(workDate) {
    const raw = String(workDate || '').trim().slice(0, 10);
    const parts = raw.split('-');
    if (parts.length < 3) return '';
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return '';
    let nextYear = year;
    let nextMonth = month + 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    const lastDay = new Date(nextYear, nextMonth, 0).getDate();
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  },

  isPaidCompletionStatus(paymentStatus) {
    const raw = String(paymentStatus || '').trim();
    if (raw === '入金済み') return true;
    if (typeof PaymentBrain !== 'undefined') {
      return PaymentBrain.migratePaymentStatus(raw, 'pending') === 'paid';
    }
    return raw === 'paid';
  },

  getDefaultPaymentDateForCompletion(paymentStatus, workDate, today) {
    if (this.isPaidCompletionStatus(paymentStatus)) {
      return String(today || '').trim().slice(0, 10);
    }
    return this.getNextMonthEndDate(workDate);
  },

  buildCompletionPaymentFields(paymentStatus, paymentDate, amount) {
    const statusRaw = String(paymentStatus || '未入金').trim() || '未入金';
    const date = String(paymentDate || '').trim().slice(0, 10);
    const amt = Number(amount) || 0;
    if (this.isPaidCompletionStatus(statusRaw)) {
      return {
        paymentStatus: statusRaw,
        paymentDate: date,
        expectedPaymentDate: '',
        paidDate: date,
        paidAmount: amt,
        unpaidAmount: 0
      };
    }
    return {
      paymentStatus: statusRaw,
      paymentDate: date,
      expectedPaymentDate: date,
      paidDate: '',
      paidAmount: 0,
      unpaidAmount: amt
    };
  },

  buildCompletionFormDefaults(workOrder, options) {
    const opts = options || {};
    const wo = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(workOrder)
      : workOrder;
    const service = typeof ReceptionBrain !== 'undefined'
      ? ReceptionBrain.matchRevenueService(wo.serviceText)
      : wo.serviceText;
    const source = typeof ReceptionBrain !== 'undefined'
      ? ReceptionBrain.matchRevenueSource(wo.source)
      : wo.source;
    const today = String(opts.today || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const workDate = wo.scheduledDate || today;
    const paymentStatus = '未入金';
    return {
      workDate,
      customerName: wo.customerName || '',
      actualService: wo.serviceText || '',
      service,
      source,
      amount: wo.estimateAmount || '',
      grossMarginRate: '',
      paymentStatus,
      paymentDate: this.getDefaultPaymentDateForCompletion(paymentStatus, workDate, today),
      paymentMethod: '',
      paymentConcern: false,
      additionalMemo: wo.memo || '',
      actualMemo: '',
      followMemo: '',
      cancelReason: '',
      leadId: wo.leadId || ''
    };
  },

  MAX_INLINE_EXPENSE_LINES: 3,

  resolveExpenseCategoryFromName(name, fallback) {
    const n = String(name || '').trim();
    const fb = String(fallback || '').trim();
    const daily = typeof ProfitBrain !== 'undefined' && Array.isArray(ProfitBrain.DAILY_EXPENSE_CATEGORIES)
      ? ProfitBrain.DAILY_EXPENSE_CATEGORIES
      : ['人件費', '薬剤・材料', '交通・燃料', '外注費', '広告費', '消耗品', 'その他'];
    const all = typeof ProfitBrain !== 'undefined' && Array.isArray(ProfitBrain.CATEGORIES)
      ? ProfitBrain.CATEGORIES
      : daily;
    if (n && daily.includes(n)) return n;
    if (n && all.includes(n)) return n;
    if (fb && (daily.includes(fb) || all.includes(fb))) return fb;
    return fb || 'その他';
  },

  normalizeInlineExpenseLine(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const name = String(src.name || src.content || '').trim();
    const amountRaw = src.amountRaw != null
      ? String(src.amountRaw).trim()
      : (src.amount === '' || src.amount == null ? '' : String(src.amount).trim());
    const amount = amountRaw === '' ? null : Number(amountRaw);
    return {
      name,
      content: name,
      amountRaw,
      amount,
      category: this.resolveExpenseCategoryFromName(name, src.category),
      memo: String(src.memo || '').trim()
    };
  },

  normalizeInlineExpenseLines(rawLines) {
    const list = Array.isArray(rawLines) ? rawLines : [];
    const out = [];
    for (const raw of list) {
      if (out.length >= this.MAX_INLINE_EXPENSE_LINES) break;
      out.push(this.normalizeInlineExpenseLine(raw));
    }
    return out;
  },

  sumInlineExpenseAmount(lines) {
    return (lines || []).reduce((n, line) => n + (Number(line && line.amount) || 0), 0);
  },

  validateInlineExpenseLines(rawLines) {
    const lines = this.normalizeInlineExpenseLines(rawLines);
    if (Array.isArray(rawLines) && rawLines.length > this.MAX_INLINE_EXPENSE_LINES) {
      return { ok: false, error: '経費は3件までです。' };
    }
    const items = [];
    for (const line of lines) {
      const empty = !line.name && line.amountRaw === '';
      if (empty) continue;
      if (line.amountRaw === '') {
        return { ok: false, error: '経費の金額を入力するか、空欄の明細を削除してください。' };
      }
      if (!Number.isFinite(line.amount) || line.amount <= 0 || !Number.isInteger(line.amount)) {
        return { ok: false, error: '経費金額は1円以上の整数で入力してください。' };
      }
      items.push({
        name: line.name,
        content: line.content,
        amount: line.amount,
        category: line.category,
        memo: line.memo
      });
      if (items.length > this.MAX_INLINE_EXPENSE_LINES) {
        return { ok: false, error: '経費は3件までです。' };
      }
    }
    const amount = this.sumInlineExpenseAmount(items);
    return { ok: true, shouldCreate: items.length > 0, items, amount };
  },

  buildInlineExpenseSnapshotState(inlineExpense) {
    const src = inlineExpense && typeof inlineExpense === 'object' ? inlineExpense : {};
    if (src.shouldCreate === false && !Array.isArray(src.items) && !(src.input && Array.isArray(src.input.items))) {
      return { shouldCreate: false };
    }
    const rawItems = Array.isArray(src.items)
      ? src.items
      : (src.input && Array.isArray(src.input.items) ? src.input.items : null);
    if (rawItems) {
      const checked = this.validateInlineExpenseLines(rawItems);
      if (!checked.ok) return { shouldCreate: false, error: checked.error };
      if (!checked.shouldCreate) return { shouldCreate: false };
      const first = checked.items[0];
      return {
        shouldCreate: true,
        items: checked.items,
        amount: checked.amount,
        category: first.category,
        content: first.content,
        memo: first.memo || ''
      };
    }
    if (!src.shouldCreate && !src.input) return { shouldCreate: false };
    const input = src.input || src;
    const checked = this.validateInlineExpenseLines([{
      name: input.content || input.name || '',
      content: input.content || input.name || '',
      amount: input.amount,
      amountRaw: input.amountRaw != null ? input.amountRaw : (input.amount == null || input.amount === '' ? '' : String(input.amount)),
      category: input.category,
      memo: input.memo || ''
    }]);
    if (!checked.ok) return { shouldCreate: false, error: checked.error };
    if (!checked.shouldCreate) return { shouldCreate: false };
    const first = checked.items[0];
    return {
      shouldCreate: true,
      items: checked.items,
      amount: checked.amount,
      category: first.category || String(input.category || 'その他').trim(),
      content: first.content,
      memo: first.memo || String(input.memo || '').trim()
    };
  },

  attachExpenseTotalsToPayload(payload, expenseState) {
    const next = payload && typeof payload === 'object' ? payload : {};
    if (!expenseState || !expenseState.shouldCreate || !Array.isArray(expenseState.items) || !expenseState.items.length) {
      return next;
    }
    next.expenseLines = expenseState.items.map(item => ({
      name: String(item.name || item.content || '').trim(),
      content: String(item.content || item.name || '').trim(),
      amount: Number(item.amount) || 0,
      category: String(item.category || 'その他').trim()
    }));
    next.expenseTotal = Number(expenseState.amount) || this.sumInlineExpenseAmount(next.expenseLines);
    return next;
  },

  createRevenuePayloadFromWorkOrder(workOrder, input) {
    const wo = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(workOrder)
      : workOrder;
    const now = new Date().toISOString();
    const memoParts = [input.actualMemo, input.additionalMemo].filter(Boolean);
    const paymentFields = this.buildCompletionPaymentFields(
      input.paymentStatus || '未入金',
      input.paymentDate,
      input.amount
    );
    const payload = {
      workDate: input.workDate || wo.scheduledDate || now.slice(0, 10),
      customerName: String(input.customerName || wo.customerName || '').trim(),
      actualService: String(input.actualService || '').trim(),
      service: input.service || input.actualService || wo.serviceText || '',
      source: input.source || wo.source || '',
      amount: Number(input.amount) || 0,
      status: '確定',
      paymentConcern: input.paymentConcern === true,
      memo: memoParts.join('\n'),
      sourceWorkOrderId: wo.id,
      intakeId: wo.intakeId || '',
      receptionIntakeId: wo.receptionIntakeId || wo.intakeId || '',
      sourceIntakeId: wo.sourceIntakeId || wo.intakeId || '',
      confirmedFrom: 'work-order',
      confirmedAt: now,
      isConfirmedRevenue: true,
      actualMemo: String(input.actualMemo || '').trim(),
      paymentMethod: String(input.paymentMethod || '').trim(),
      ...paymentFields
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
    if (wo.calendarDedupeKey) {
      payload.calendarDedupeKey = String(wo.calendarDedupeKey).trim();
    }
    if (wo.id && (wo.calendarDedupeKey || (wo.candidateMeta && wo.candidateMeta.importSource))) {
      payload.sourceCandidateId = wo.id;
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
    if (Array.isArray(input.expenseLines) && input.expenseLines.length) {
      this.attachExpenseTotalsToPayload(payload, {
        shouldCreate: true,
        items: input.expenseLines,
        amount: input.expenseTotal
      });
    } else if (input.expenseTotal != null && input.expenseTotal !== '') {
      payload.expenseTotal = Number(input.expenseTotal) || 0;
    }
    return payload;
  },

  createRevenueConfirmationSnapshot(workOrder, input, inlineExpense) {
    const expenseState = this.buildInlineExpenseSnapshotState(inlineExpense);
    const payload = this.createRevenuePayloadFromWorkOrder(workOrder, input || {});
    this.attachExpenseTotalsToPayload(payload, expenseState);
    const snapshot = {
      workOrderId: String(workOrder && workOrder.id || '').trim(),
      completionInput: JSON.parse(JSON.stringify(input || {})),
      payload: JSON.parse(JSON.stringify(payload)),
      expense: expenseState
    };
    snapshot.signature = JSON.stringify({
      workOrderId: snapshot.workOrderId,
      completionInput: snapshot.completionInput,
      payload: snapshot.payload,
      expense: snapshot.expense
    });
    return snapshot;
  },

  validateRevenueConfirmationSnapshot(snapshot) {
    const data = snapshot && snapshot.payload && typeof snapshot.payload === 'object'
      ? snapshot.payload
      : {};
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(String(data.workDate || ''));
    const amount = Number(data.amount);
    if (!String(snapshot && snapshot.workOrderId || '').trim()) return { ok: false, error: 'missing_work_order' };
    if (!validDate) return { ok: false, error: 'missing_work_date' };
    if (!String(data.customerName || '').trim()) return { ok: false, error: 'missing_customer' };
    if (!String(data.actualService || '').trim()) return { ok: false, error: 'missing_actual_service' };
    if (!String(data.service || '').trim()) return { ok: false, error: 'missing_service' };
    if (!String(data.source || '').trim()) return { ok: false, error: 'missing_source' };
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'invalid_amount' };
    if (String(data.status || '') !== '確定') return { ok: false, error: 'invalid_status' };
    if (String(data.sourceWorkOrderId || '') !== String(snapshot.workOrderId || '')) {
      return { ok: false, error: 'work_order_mismatch' };
    }
    return { ok: true };
  },

  formatRevenueConfirmationMessage(snapshot, options) {
    const data = snapshot && snapshot.payload ? snapshot.payload : {};
    const expense = snapshot && snapshot.expense ? snapshot.expense : { shouldCreate: false };
    const opts = options || {};
    const yen = value => `${(Number(value) || 0).toLocaleString('ja-JP')}円`;
    const lines = [
      opts.repairOnly
        ? '【保存済み売上の予定リンク修復】'
        : (opts.updateOnly ? '【既存売上を更新する内容】' : '【売上集計へ反映する内容】'),
      `対象日：${data.workDate || '未入力'}`,
      `対象顧客：${data.customerName || '未入力'}`,
      `売上金額：${yen(data.amount)}`,
      `入力された内訳：${data.actualService || data.service || '未入力'}`,
      `サービス分類：${data.service || '未入力'}`,
      `依頼元：${data.source || '未入力'}`,
      `粗利率：${data.grossMarginRate === '' || data.grossMarginRate == null ? '未設定' : `${Number(data.grossMarginRate)}%`}`,
      `支払い状態：${data.paymentStatus || '未入力'}`,
      `入金日／予定日：${data.paymentDate || data.expectedPaymentDate || data.paidDate || '未入力'}`,
      `支払い方法：${data.paymentMethod || '未選択'}`,
      `入金注意：${data.paymentConcern === true ? 'あり' : 'なし'}`
    ];
    if (String(data.memo || '').trim()) lines.push(`売上メモ：${String(data.memo).trim()}`);
    if (expense.shouldCreate) {
      const items = Array.isArray(expense.items) && expense.items.length ? expense.items : [expense];
      if (items.length <= 1) {
        lines.push(`同時登録する経費：${yen(expense.amount)}（${expense.category || 'その他'}）`);
        if (expense.content) lines.push(`経費内訳：${expense.content}`);
        if (expense.memo) lines.push(`経費メモ：${expense.memo}`);
      } else {
        lines.push(`同時登録する経費：${yen(expense.amount)}（${items.length}件）`);
        items.forEach((item, idx) => {
          const label = item.content || item.name || item.category || 'その他';
          lines.push(`経費${idx + 1}：${yen(item.amount)}（${label}）`);
        });
      }
    } else {
      lines.push('同時登録する経費：なし');
    }
    lines.push('', opts.repairOnly
      ? '新しい売上は作らず、この保存済み売上へのリンクだけを修復します。よろしいですか？'
      : (opts.updateOnly
          ? 'この表示内容で既存売上1件を更新します。よろしいですか？'
          : 'この表示内容を売上集計へ1件だけ反映します。よろしいですか？'));
    return lines.join('\n');
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
      confirm: `売上確定：${name}`,
      revenue: `売上確定：${name}`,
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
      reason: '売上確定待ちから',
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
      parts.push(`売上確定待ちが${s.pendingConfirmCount}件あります。金額・作業内容・支払い状態を確認して、確定売上に登録してください`);
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
    const lines = ['売上確定待ち：'];
    if (s.pendingConfirmCount) lines.push(`・売上確定待ち ${s.pendingConfirmCount}件`);
    if (s.unpaidCount) lines.push(`・入金待ち ${s.unpaidCount}件`);
    if (s.cancelFollowUpCount) lines.push(`・キャンセル後フォロー ${s.cancelFollowUpCount}件`);
    return lines.length > 1 ? lines : [];
  },

  buildWarnings(workOrders, revenues, today) {
    const warnings = [];
    const s = this.summarizeTargets(workOrders, revenues, today);
    if (s.pendingConfirmCount) warnings.push(`売上確定待ち（売上未確定）：${s.pendingConfirmCount}件`);
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
