/**
 * Budil v4.8.6 - 予約・作業予定番頭
 */
const WorkOrderBrain = {
  STATUSES: ['tentative', 'confirmed', 'completed', 'cancelled', 'archived'],

  STATUS_LABELS: {
    tentative: '仮予定',
    confirmed: '確定',
    completed: '作業完了',
    cancelled: 'キャンセル',
    archived: '保管'
  },

  ACTIVE_STATUSES: ['tentative', 'confirmed'],

  normalizeWorkOrder(raw) {
    const now = new Date().toISOString();
    const item = raw && typeof raw === 'object' ? { ...raw } : {};
    const amount = item.estimateAmount;
    let estimateAmount = 0;
    if (typeof amount === 'number' && !Number.isNaN(amount)) {
      estimateAmount = amount;
    } else if (amount != null && amount !== '') {
      const parsed = parseInt(String(amount).replace(/[^\d]/g, ''), 10);
      estimateAmount = Number.isNaN(parsed) ? 0 : parsed;
    }
    const status = this.STATUSES.includes(item.status) ? item.status : 'tentative';
    const address = String(item.address || '').trim();
    const area = String(item.area || '').trim()
      || (typeof MapBrain !== 'undefined' ? MapBrain.detectAreaFromAddress(address) : '');
    const intakeId = String(item.intakeId || item.receptionIntakeId || item.sourceIntakeId || '').trim();
    const normalized = {
      id: item.id || '',
      intakeId,
      receptionIntakeId: String(item.receptionIntakeId || intakeId).trim(),
      sourceIntakeId: String(item.sourceIntakeId || intakeId).trim(),
      leadId: String(item.leadId || '').trim(),
      customerName: String(item.customerName || '').trim(),
      phone: String(item.phone || '').trim(),
      address,
      area,
      source: String(item.source || '').trim(),
      serviceText: String(item.serviceText || '').trim(),
      scheduledDate: String(item.scheduledDate || '').trim(),
      startTime: String(item.startTime || '').trim(),
      endTime: String(item.endTime || '').trim(),
      status,
      estimateAmount,
      actualRevenueId: String(item.actualRevenueId || '').trim(),
      memo: String(item.memo || '').trim(),
      calendarAdded: item.calendarAdded === true,
      completedAt: String(item.completedAt || '').trim(),
      createdAt: item.createdAt || now,
      updatedAt: item.updatedAt || now,
      isDemo: item.isDemo === true,
      isTest: item.isTest === true
    };
    if (item.candidateMeta && typeof item.candidateMeta === 'object') {
      normalized.candidateMeta = typeof CalendarCandidateBrain !== 'undefined'
        ? CalendarCandidateBrain.normalizeCandidateMeta(item.candidateMeta)
        : { ...item.candidateMeta };
    }
    if (item.followUp != null && typeof item.followUp === 'object') {
      normalized.followUp = typeof FollowUpBrain !== 'undefined'
        ? FollowUpBrain.normalizeFollowUp(item.followUp)
        : item.followUp;
    }
    if (item.completion != null && typeof item.completion === 'object') {
      normalized.completion = typeof WorkCompletionBrain !== 'undefined'
        ? WorkCompletionBrain.normalizeCompletion(item.completion)
        : item.completion;
    }
    if (item.cancel != null && typeof item.cancel === 'object') {
      normalized.cancel = typeof WorkCompletionBrain !== 'undefined'
        ? WorkCompletionBrain.normalizeCancelInfo(item.cancel)
        : item.cancel;
    }
    return normalized;
  },

  isPendingCalendarCandidate(workOrder) {
    return typeof CalendarCandidateBrain !== 'undefined'
      && CalendarCandidateBrain.isPendingCandidate(workOrder);
  },

  forOperationalList(workOrders) {
    return (workOrders || []).filter(w => !this.isPendingCalendarCandidate(w));
  },

  isValidTime(str) {
    if (!str || typeof str !== 'string') return false;
    return /^\d{2}:\d{2}$/.test(str);
  },

  addDays(dateStr, offset) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + Number(offset || 0));
    return d.toISOString().slice(0, 10);
  },

  getMonthStart(today) {
    const t = today || new Date().toISOString().slice(0, 10);
    return t.slice(0, 7) + '-01';
  },

  getWorkOrderArea(workOrder) {
    if (!workOrder) return '不明';
    if (workOrder.area && workOrder.area.trim()) return workOrder.area.trim();
    return typeof MapBrain !== 'undefined'
      ? MapBrain.detectAreaFromAddress(workOrder.address || '')
      : '不明';
  },

  parsePreferredDate(text, today) {
    const t = today || new Date().toISOString().slice(0, 10);
    const year = parseInt(t.slice(0, 4), 10);
    const src = String(text || '');
    const m = src.match(/(\d{1,2})\s*[\/／月]\s*(\d{1,2})/);
    if (!m) return { scheduledDate: '', startTime: '', endTime: '' };
    const month = String(m[1]).padStart(2, '0');
    const day = String(m[2]).padStart(2, '0');
    const scheduledDate = `${year}-${month}-${day}`;
    let startTime = '09:00';
    let endTime = '11:00';
    if (/午後|PM|pm/.test(src)) {
      startTime = '13:00';
      endTime = '15:00';
    } else if (/午前|AM|am|朝/.test(src)) {
      startTime = '09:00';
      endTime = '11:00';
    }
    return { scheduledDate, startTime, endTime };
  },

  createFromIntake(intake) {
    const normalized = typeof ReceptionBrain !== 'undefined'
      ? ReceptionBrain.normalizeIntake(intake)
      : this.normalizeWorkOrder(intake);
    const dateGuess = this.parsePreferredDate(
      [normalized.preferredDatesText, normalized.memo].filter(Boolean).join(' '),
      new Date().toISOString().slice(0, 10)
    );
    const memoParts = [];
    if (normalized.preferredDatesText) memoParts.push('希望日：' + normalized.preferredDatesText);
    if (normalized.memo) memoParts.push(normalized.memo);
    return this.normalizeWorkOrder({
      customerName: normalized.customerName,
      phone: normalized.phone,
      address: normalized.address,
      area: normalized.area,
      source: normalized.source,
      serviceText: normalized.serviceText,
      scheduledDate: dateGuess.scheduledDate,
      startTime: dateGuess.startTime,
      endTime: dateGuess.endTime,
      estimateAmount: normalized.estimateAmount,
      memo: memoParts.join('\n'),
      intakeId: normalized.id,
      receptionIntakeId: normalized.id,
      sourceIntakeId: normalized.id,
      leadId: normalized.relatedLeadId || '',
      status: 'tentative'
    });
  },

  createFromLead(lead) {
    if (!lead) return this.normalizeWorkOrder({});
    const addr = typeof MapBrain !== 'undefined' ? MapBrain.getLeadAddress(lead) : (lead.address || lead.region || '');
    const area = typeof MapBrain !== 'undefined' ? MapBrain.getLeadArea(lead) : (lead.area || '');
    return this.normalizeWorkOrder({
      customerName: lead.company || '',
      phone: lead.phone || '',
      address: addr,
      area,
      source: lead.source || '',
      serviceText: lead.service || '',
      memo: lead.memo || '',
      leadId: lead.id || ''
    });
  },

  buildCalendarTitle(workOrder) {
    const wo = this.normalizeWorkOrder(workOrder);
    const parts = [wo.source, wo.customerName, wo.serviceText].filter(Boolean);
    return parts.join(' ') || '作業予定';
  },

  buildGoogleCalendarUrl(workOrder) {
    const wo = this.normalizeWorkOrder(workOrder);
    if (!wo.scheduledDate || !this.isValidTime(wo.startTime) || !this.isValidTime(wo.endTime)) {
      return { url: '', ready: false, reason: '予定日または開始・終了時間を入力してください' };
    }
    const start = wo.scheduledDate.replace(/-/g, '') + 'T' + wo.startTime.replace(':', '') + '00';
    const end = wo.scheduledDate.replace(/-/g, '') + 'T' + wo.endTime.replace(':', '') + '00';
    const title = this.buildCalendarTitle(wo);
    const details = [
      wo.phone ? '電話：' + wo.phone : '',
      wo.serviceText ? '作業：' + wo.serviceText : '',
      wo.memo || '',
      wo.estimateAmount ? '見込み：' + wo.estimateAmount + '円' : '',
      'Budil作業予定から追加'
    ].filter(Boolean).join('\n');
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      dates: `${start}/${end}`,
      details,
      location: wo.address || ''
    });
    return { url: 'https://calendar.google.com/calendar/render?' + params.toString(), ready: true, reason: '' };
  },

  filterActive(workOrders) {
    return this.forOperationalList(workOrders).map(w => this.normalizeWorkOrder(w))
      .filter(w => w.status !== 'archived' && w.status !== 'cancelled');
  },

  getTodayWorkOrders(workOrders, today) {
    const t = today || new Date().toISOString().slice(0, 10);
    return this.filterActive(workOrders).filter(w =>
      w.scheduledDate === t && this.ACTIVE_STATUSES.includes(w.status)
    );
  },

  getWeekWorkOrders(workOrders, today) {
    const t = today || new Date().toISOString().slice(0, 10);
    const end = this.addDays(t, 6);
    return this.filterActive(workOrders).filter(w => {
      if (!w.scheduledDate) return false;
      return w.scheduledDate >= t && w.scheduledDate <= end
        && this.ACTIVE_STATUSES.includes(w.status);
    }).sort((a, b) => {
      const d = (a.scheduledDate || '').localeCompare(b.scheduledDate || '');
      if (d !== 0) return d;
      return (a.startTime || '').localeCompare(b.startTime || '');
    });
  },

  sumEstimate(workOrders) {
    return (workOrders || []).reduce((sum, w) => sum + (Number(w.estimateAmount) || 0), 0);
  },

  getSalesForecast(workOrders, revenues, today) {
    const t = today || new Date().toISOString().slice(0, 10);
    const monthStart = this.getMonthStart(t);
    const list = this.forOperationalList(workOrders || []).map(w => this.normalizeWorkOrder(w));
    const active = list.filter(w => this.ACTIVE_STATUSES.includes(w.status));
    const todayOrders = active.filter(w => w.scheduledDate === t);
    const weekEnd = this.addDays(t, 6);
    const weekOrders = active.filter(w => w.scheduledDate >= t && w.scheduledDate <= weekEnd);
    const monthOrders = active.filter(w => w.scheduledDate >= monthStart && w.scheduledDate <= t.slice(0, 7) + '-31');
    const tentative = active.filter(w => w.status === 'tentative');
    const confirmed = active.filter(w => w.status === 'confirmed');
    const completedNoRevenue = list.filter(w =>
      w.status === 'completed' && !w.actualRevenueId
    );
    return {
      todayCount: todayOrders.length,
      todayAmount: this.sumEstimate(todayOrders),
      weekCount: weekOrders.length,
      weekAmount: this.sumEstimate(weekOrders),
      monthCount: monthOrders.length,
      monthAmount: this.sumEstimate(monthOrders),
      tentativeCount: tentative.length,
      tentativeAmount: this.sumEstimate(tentative),
      confirmedCount: confirmed.length,
      confirmedAmount: this.sumEstimate(confirmed),
      completedNoRevenueCount: completedNoRevenue.length
    };
  },

  buildHomeComment(workOrders, today) {
    const forecast = this.getSalesForecast(workOrders, [], today);
    if (!forecast.todayCount && !forecast.weekCount) return '';
    const parts = [];
    if (forecast.todayCount) {
      parts.push(`今日は作業予定が${forecast.todayCount}件、見込み売上は${this.formatYen(forecast.todayAmount)}です`);
    }
    if (forecast.completedNoRevenueCount) {
      parts.push(`作業完了後の売上未登録が${forecast.completedNoRevenueCount}件あります`);
    } else if (forecast.todayCount) {
      parts.push('作業完了後に売上登録を忘れないようにしましょう');
    }
    return parts.join('。') + (parts.length ? '。' : '');
  },

  buildWorkOrderWarnings(workOrders, leads, intakes, revenues, today) {
    const t = today || new Date().toISOString().slice(0, 10);
    const list = (workOrders || []).map(w => this.normalizeWorkOrder(w));
    const warnings = [];
    const completedNoRevenue = list.filter(w => w.status === 'completed' && !w.actualRevenueId);
    if (completedNoRevenue.length) {
      warnings.push(`作業完了済みだが売上未登録：${completedNoRevenue.length}件`);
    }
    const overdue = list.filter(w =>
      this.ACTIVE_STATUSES.includes(w.status) && w.scheduledDate && w.scheduledDate < t
    );
    if (overdue.length) {
      warnings.push(`予定日超過で未完了：${overdue.length}件`);
    }
    const noAddress = list.filter(w =>
      this.ACTIVE_STATUSES.includes(w.status) && !(w.address || '').trim()
    );
    if (noAddress.length) {
      warnings.push(`住所未入力の作業予定：${noAddress.length}件`);
    }
    const noTime = list.filter(w =>
      this.ACTIVE_STATUSES.includes(w.status) && w.scheduledDate &&
      (!this.isValidTime(w.startTime) || !this.isValidTime(w.endTime))
    );
    if (noTime.length) {
      warnings.push(`時間未設定の作業予定：${noTime.length}件`);
    }
    return warnings;
  },

  buildMorningLines(workOrders, today) {
    const forecast = this.getSalesForecast(workOrders, [], today);
    if (!forecast.todayCount && !forecast.weekCount && !forecast.completedNoRevenueCount) return [];
    const lines = ['作業予定：'];
    if (forecast.todayCount) {
      lines.push(`・今日 ${forecast.todayCount}件 / 見込み ${this.formatYen(forecast.todayAmount)}`);
    }
    if (forecast.weekCount) {
      lines.push(`・今週 ${forecast.weekCount}件 / 見込み ${this.formatYen(forecast.weekAmount)}`);
    }
    if (forecast.completedNoRevenueCount) {
      lines.push(`・作業完了後の売上未登録 ${forecast.completedNoRevenueCount}件`);
    }
    return lines.length > 1 ? lines : [];
  },

  createTaskPayload(workOrder, today) {
    const wo = this.normalizeWorkOrder(workOrder);
    const svc = wo.serviceText ? wo.serviceText.slice(0, 30) : '作業';
    const title = `作業予定：${wo.customerName || 'お客様'} ${svc}`;
    const date = today || new Date().toISOString().slice(0, 10);
    return {
      title,
      targetName: wo.customerName || '—',
      priority: '高',
      action: title,
      memo: wo.memo || '',
      dueDate: wo.scheduledDate || date,
      status: 'open',
      reason: '予約・作業予定番頭から',
      leadId: wo.leadId || '',
      leadName: wo.customerName || '',
      pickupDedupeKey: ['work-order', date, wo.id, title].join('|'),
      workOrderId: wo.id
    };
  },

  buildRevenueFormPayload(workOrder) {
    const wo = this.normalizeWorkOrder(workOrder);
    const service = typeof ReceptionBrain !== 'undefined'
      ? ReceptionBrain.matchRevenueService(wo.serviceText)
      : wo.serviceText;
    const source = typeof ReceptionBrain !== 'undefined'
      ? ReceptionBrain.matchRevenueSource(wo.source)
      : wo.source;
    return {
      workDate: wo.scheduledDate || new Date().toISOString().slice(0, 10),
      customerName: wo.customerName,
      service,
      source,
      amount: wo.estimateAmount,
      memo: wo.memo,
      leadId: wo.leadId || '',
      workOrderId: wo.id,
      intakeId: wo.intakeId || '',
      receptionIntakeId: wo.receptionIntakeId || wo.intakeId || '',
      sourceIntakeId: wo.sourceIntakeId || wo.intakeId || ''
    };
  },

  formatYen(amount) {
    if (typeof RevenueBrain !== 'undefined' && RevenueBrain.formatYen) {
      return RevenueBrain.formatYen(amount);
    }
    return (Number(amount) || 0).toLocaleString('ja-JP') + '円';
  },

  formatStatus(status) {
    return this.STATUS_LABELS[status] || status || '—';
  },

  groupByDate(workOrders) {
    const groups = {};
    (workOrders || []).forEach(w => {
      const d = w.scheduledDate || '日付未設定';
      if (!groups[d]) groups[d] = [];
      groups[d].push(w);
    });
    return Object.keys(groups).sort().map(date => ({ date, items: groups[date] }));
  }
};
