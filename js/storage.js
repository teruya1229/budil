/**
 * Budil - localStorage 管理
 * キー: leads, demandNotes, generatedPosts, generatedMessages, followups, settings
 */
const Storage = {
  BUDIL_VERSION: 'v4.11.9',

  KEYS: {
    LEADS: 'budil_leads',
    DEMAND_NOTES: 'budil_demandNotes',
    GENERATED_POSTS: 'budil_generatedPosts',
    GENERATED_MESSAGES: 'budil_generatedMessages',
    FOLLOWUPS: 'budil_followups',
    SETTINGS: 'budil_settings',
    CARD_DRAFT: 'budil_card_draft',
    DAILY_DEMAND_LOGS: 'budil_daily_demand_logs',
    DEMAND_RADAR: 'budil_demand_radar',
    REVENUE_RECORDS: 'budil_revenue_records',
    REVENUE_SETTINGS: 'budil_revenue_settings',
    DAILY_ACTION_TASKS: 'budil_daily_action_tasks',
    DEMAND_PICKUPS: 'budil_demand_pickups',
    RECEPTION_INTAKES: 'budil_reception_intakes',
    WORK_ORDERS: 'budil_work_orders',
    EXPENSE_RECORDS: 'budil_expense_records',
    ANALYTICS_RECORDS: 'budil_analytics_records',
    ANALYTICS_SNAPSHOTS: 'budil_analytics_snapshots',
    EXTERNAL_CHECK_REPORTS: 'budil_external_check_reports',
    ACTION_CANDIDATES: 'budil_action_candidates',
    ACTION_CANDIDATE_STATES: 'budil_action_candidate_states',
    MONTHLY_RESULTS: 'budil_monthly_results',
    DOCUMENTS: 'budil_documents',
    SAFETY_BACKUPS: 'budil_safety_backups',
    OPERATION_LOGS: 'budil_operation_logs'
  },

  get(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },

  SAFETY_BACKUP_LIMIT: 30,
  OPERATION_LOG_LIMIT: 80,
  PROTECTED_DELETE_KEYS: [
    'budil_revenue_records',
    'budil_expense_records',
    'budil_documents',
    'budil_payment_records',
    'budil_reception_intakes',
    'budil_work_orders'
  ],

  cloneForSafety(data) {
    try {
      return JSON.parse(JSON.stringify(data));
    } catch {
      return data;
    }
  },

  getSafetyBackups() {
    const raw = this.get(this.KEYS.SAFETY_BACKUPS, []);
    return Array.isArray(raw) ? raw : [];
  },

  saveSafetyBackups(list) {
    this.set(this.KEYS.SAFETY_BACKUPS, Array.isArray(list) ? list.slice(0, this.SAFETY_BACKUP_LIMIT) : []);
  },

  getOperationLogs() {
    const raw = this.get(this.KEYS.OPERATION_LOGS, []);
    return Array.isArray(raw) ? raw : [];
  },

  saveOperationLogs(list) {
    this.set(this.KEYS.OPERATION_LOGS, Array.isArray(list) ? list.slice(0, this.OPERATION_LOG_LIMIT) : []);
  },

  getRecordsByKey(key) {
    switch (key) {
      case this.KEYS.REVENUE_RECORDS: return this.getRevenueRecords();
      case this.KEYS.DOCUMENTS: return this.getDocuments();
      case this.KEYS.RECEPTION_INTAKES: return this.getReceptionIntakes();
      case this.KEYS.WORK_ORDERS: return this.getWorkOrders();
      default: {
        const raw = this.get(key, []);
        return Array.isArray(raw) ? raw : [];
      }
    }
  },

  saveRecordsByKey(key, list, options = {}) {
    switch (key) {
      case this.KEYS.REVENUE_RECORDS: return this.saveRevenueRecords(list, options);
      case this.KEYS.DOCUMENTS: return this.saveDocuments(list);
      case this.KEYS.RECEPTION_INTAKES: return this.saveReceptionIntakes(list);
      case this.KEYS.WORK_ORDERS: return this.saveWorkOrders(list);
      default:
        this.set(key, list);
        return true;
    }
  },

  createSafetyBackup({ reason, targetKey, targetId = '', data = null, beforeCount = null }) {
    const list = this.getSafetyBackups();
    const snapshot = data != null ? data : this.getRecordsByKey(targetKey);
    const backup = {
      id: 'safety-backup-' + this.generateId(),
      createdAt: new Date().toISOString(),
      reason: reason || 'before_destructive_action',
      targetKey,
      targetId: String(targetId || ''),
      beforeCount: beforeCount != null ? beforeCount : (Array.isArray(snapshot) ? snapshot.length : null),
      data: this.cloneForSafety(snapshot)
    };
    list.unshift(backup);
    this.saveSafetyBackups(list);
    return backup;
  },

  recordOperationLog(entry) {
    const logs = this.getOperationLogs();
    const log = {
      id: 'operation-log-' + this.generateId(),
      createdAt: new Date().toISOString(),
      ...entry
    };
    logs.unshift(log);
    this.saveOperationLogs(logs);
    return log;
  },

  isTestDeletionTarget(item, testRunId = '') {
    if (!item || typeof item !== 'object') return false;
    const runId = String(testRunId || '').trim();
    return item.isTest === true || (!!runId && String(item.testRunId || '') === runId);
  },

  deleteTestRecordsByKey(targetKey, options = {}) {
    const before = this.getRecordsByKey(targetKey);
    const testRunId = String(options.testRunId || '').trim();
    const candidates = before.filter(item => this.isTestDeletionTarget(item, testRunId));
    if (!candidates.length) {
      return { ok: true, targetKey, deleted: 0, beforeCount: before.length, afterCount: before.length, skipped: true };
    }
    if (candidates.some(item => !item || !item.id)) {
      this.recordOperationLog({
        action: 'delete_test_records_blocked',
        targetKey,
        reason: 'missing_target_id',
        beforeCount: before.length,
        candidateCount: candidates.length
      });
      return { ok: false, error: 'missing_target_id', targetKey, deleted: 0, beforeCount: before.length, afterCount: before.length };
    }
    if (candidates.length >= before.length) {
      this.recordOperationLog({
        action: 'delete_test_records_blocked',
        targetKey,
        reason: 'all_records_delete_blocked',
        beforeCount: before.length,
        candidateCount: candidates.length
      });
      return { ok: false, error: 'all_records_delete_blocked', targetKey, deleted: 0, beforeCount: before.length, afterCount: before.length };
    }
    const ids = new Set(candidates.map(item => item.id));
    const next = before.filter(item => !ids.has(item && item.id));
    if (before.length - next.length !== candidates.length) {
      this.recordOperationLog({
        action: 'delete_test_records_blocked',
        targetKey,
        reason: 'count_mismatch',
        beforeCount: before.length,
        candidateCount: candidates.length,
        afterCount: next.length
      });
      return { ok: false, error: 'count_mismatch', targetKey, deleted: 0, beforeCount: before.length, afterCount: before.length };
    }
    const backup = this.createSafetyBackup({
      reason: options.reason || 'before_delete_test_records',
      targetKey,
      targetId: candidates.map(item => item.id).join(','),
      beforeCount: before.length,
      data: before
    });
    this.saveRecordsByKey(targetKey, next, { allowEmptyRevenue: false });
    this.recordOperationLog({
      action: options.action || 'delete_test_records',
      targetKey,
      targetIds: candidates.map(item => item.id),
      beforeCount: before.length,
      afterCount: next.length,
      deletedCount: candidates.length,
      safeBackupId: backup.id,
      testRunId
    });
    return { ok: true, targetKey, deleted: candidates.length, beforeCount: before.length, afterCount: next.length, safeBackupId: backup.id };
  },

  migrate() {
    if (localStorage.getItem('budil_migrated_v2')) return;

    const oldSales = this.get('budil_sales');
    if (oldSales && !this.get(this.KEYS.LEADS)) {
      const leads = oldSales.map(s => ({
        ...s,
        region: s.region || '',
        industry: s.industry || '',
        contactForm: s.contactForm || '',
        sns: s.sns || '',
        priority: s.priority || 'B',
        lastContact: s.lastContact || '',
        nextContact: s.nextContact || '',
        ngReason: s.ngReason || ''
      }));
      this.set(this.KEYS.LEADS, leads);
    }

    const oldDemand = this.get('budil_demand');
    if (oldDemand && !this.get(this.KEYS.DEMAND_NOTES)) {
      this.set(this.KEYS.DEMAND_NOTES, {
        trends: oldDemand.trends || '',
        ads: oldDemand.ads || '',
        gsc: oldDemand.gsc || '',
        ga4: '',
        instagram: ''
      });
    }

    const oldFollowup = this.get('budil_followup');
    if (oldFollowup && !this.get(this.KEYS.FOLLOWUPS)) {
      const followups = oldFollowup.map(f => ({
        ...f,
        nextContact: f.nextContact || '',
        ngReason: f.ngReason || ''
      }));
      this.set(this.KEYS.FOLLOWUPS, followups);
    }

    const oldDash = this.get('budil_dashboard');
    if (oldDash && !this.get(this.KEYS.SETTINGS)) {
      this.set(this.KEYS.SETTINGS, {
        priority: oldDash.priority || '',
        postTheme: oldDash.postTheme || '',
        memo: oldDash.memo || ''
      });
    }

    localStorage.setItem('budil_migrated_v2', '1');
  },

  migrateV17() {
    if (localStorage.getItem('budil_migrated_v17')) return;
    if (typeof SalesBrain === 'undefined') return;
    const leads = this.getLeads();
    if (leads.length) {
      const today = new Date().toISOString().slice(0, 10);
      const normalized = leads.map(l => {
        const n = SalesBrain.normalizeLead(l);
        const pri = SalesBrain.computeSalesPriority(n, today);
        return {
          ...n,
          priorityScore: pri.score,
          priorityReason: pri.reasons.join('、')
        };
      });
      this.saveLeads(normalized);
    }
    localStorage.setItem('budil_migrated_v17', '1');
  },

  getSettings() {
    return this.get(this.KEYS.SETTINGS, {
      priority: '', postTheme: '', memo: '', aiPriorityEnabled: true, lastBackupAt: null
    });
  },

  saveSettings(data) {
    this.set(this.KEYS.SETTINGS, data);
  },

  getDemandNotes() {
    const notes = this.get(this.KEYS.DEMAND_NOTES, {
      trends: '', ads: '', gsc: '', ga4: '', instagram: '', fieldNotes: ''
    });
    if (!notes.fieldNotes && notes.ga4) notes.fieldNotes = notes.ga4;
    return notes;
  },

  saveDemandNotes(data) {
    this.set(this.KEYS.DEMAND_NOTES, data);
  },

  getGeneratedPosts() {
    return this.get(this.KEYS.GENERATED_POSTS, null);
  },

  saveGeneratedPosts(data) {
    this.set(this.KEYS.GENERATED_POSTS, data);
  },

  getGeneratedMessages() {
    return this.get(this.KEYS.GENERATED_MESSAGES, {});
  },

  saveGeneratedMessages(data) {
    this.set(this.KEYS.GENERATED_MESSAGES, data);
  },

  getLeads() {
    const raw = this.get(this.KEYS.LEADS, []);
    return Array.isArray(raw) ? raw : [];
  },

  saveLeads(list) {
    this.set(this.KEYS.LEADS, list);
  },

  addLead(item) {
    const list = this.getLeads();
    item.id = this.generateId();
    item.createdAt = new Date().toISOString();
    list.push(item);
    this.saveLeads(list);
    return item;
  },

  updateLead(id, data) {
    const list = this.getLeads();
    const idx = list.findIndex(l => l.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...data, updatedAt: new Date().toISOString() };
      this.saveLeads(list);
    }
  },

  addSalesHistory(leadId, entry) {
    const list = this.getLeads();
    const idx = list.findIndex(l => l.id === leadId);
    if (idx === -1) return;
    if (!list[idx].salesHistory) list[idx].salesHistory = [];
    list[idx].salesHistory.unshift({
      id: this.generateId(),
      type: entry.type,
      at: new Date().toISOString(),
      note: entry.note || ''
    });
    this.saveLeads(list);
  },

  getLeadActivityLogs(leadId) {
    const lead = this.getLeads().find(l => l.id === leadId);
    if (!lead || !Array.isArray(lead.activityLogs)) return [];
    return lead.activityLogs;
  },

  addLeadActivityLog(leadId, log) {
    const list = this.getLeads();
    const idx = list.findIndex(l => l.id === leadId);
    if (idx === -1) return null;
    if (!list[idx].activityLogs) list[idx].activityLogs = [];
    const date = log.date || new Date().toISOString().slice(0, 10);
    if (log.type === 'task-done' && log.taskId) {
      const dup = list[idx].activityLogs.some(
        a => a.type === 'task-done' && a.taskId === log.taskId && a.date === date
      );
      if (dup) return null;
    }
    const entry = {
      id: log.id || ('activity_' + this.generateId()),
      date,
      type: log.type || 'other',
      title: log.title || '',
      memo: log.memo || '',
      taskId: log.taskId || '',
      taskKind: log.taskKind || '',
      priority: log.priority || '',
      reason: log.reason || '',
      action: log.action || '',
      targetName: log.targetName || '',
      nextAction: log.nextAction || '',
      nextContact: log.nextContact || '',
      createdAt: log.createdAt || new Date().toISOString()
    };
    list[idx].activityLogs.unshift(entry);
    this.saveLeads(list);
    return entry;
  },

  deleteLead(id) {
    this.saveLeads(this.getLeads().filter(l => l.id !== id));
  },

  getFollowups() {
    return this.get(this.KEYS.FOLLOWUPS, []);
  },

  saveFollowups(list) {
    this.set(this.KEYS.FOLLOWUPS, list);
  },

  addFollowup(item) {
    const list = this.getFollowups();
    item.id = this.generateId();
    item.createdAt = new Date().toISOString();
    list.push(item);
    this.saveFollowups(list);
    return item;
  },

  updateFollowup(id, data) {
    const list = this.getFollowups();
    const idx = list.findIndex(f => f.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...data, updatedAt: new Date().toISOString() };
      this.saveFollowups(list);
    }
  },

  deleteFollowup(id) {
    this.saveFollowups(this.getFollowups().filter(f => f.id !== id));
  },

  getCardDraft() {
    return this.get(this.KEYS.CARD_DRAFT, null);
  },

  saveCardDraft(data) {
    this.set(this.KEYS.CARD_DRAFT, data);
  },

  clearCardDraft() {
    localStorage.removeItem(this.KEYS.CARD_DRAFT);
  },

  getDailyDemandLogs() {
    return this.get(this.KEYS.DAILY_DEMAND_LOGS, {});
  },

  getDailyDemandLog(date) {
    return this.getDailyDemandLogs()[date] || null;
  },

  saveDailyDemandLog(date, entry) {
    const logs = this.getDailyDemandLogs();
    logs[date] = {
      ...entry,
      date,
      updatedAt: new Date().toISOString()
    };
    this.set(this.KEYS.DAILY_DEMAND_LOGS, logs);
  },

  getRecentDemandLogs(days = 7) {
    return Object.keys(this.getDailyDemandLogs())
      .sort((a, b) => b.localeCompare(a))
      .slice(0, days)
      .map(d => this.getDailyDemandLogs()[d]);
  },

  getDemandRadar() {
    return this.get(this.KEYS.DEMAND_RADAR, {
      watchedKeywords: [],
      marketMemos: { news: '', voices: '', competitor: '', field: '' },
      updatedAt: null
    });
  },

  saveDemandRadar(data) {
    this.set(this.KEYS.DEMAND_RADAR, {
      ...data,
      updatedAt: new Date().toISOString()
    });
  },

  getRevenueRecords() {
    const raw = this.get(this.KEYS.REVENUE_RECORDS, []);
    return Array.isArray(raw) ? raw : [];
  },

  saveRevenueRecords(list, options = {}) {
    const next = Array.isArray(list) ? list : [];
    const before = this.getRevenueRecords();
    if (!options.allowEmptyRevenue && before.length > 0 && next.length === 0) {
      this.recordOperationLog({
        action: 'save_revenue_blocked',
        targetKey: this.KEYS.REVENUE_RECORDS,
        reason: 'empty_array_overwrite_blocked',
        beforeCount: before.length,
        afterCount: 0
      });
      return false;
    }
    this.set(this.KEYS.REVENUE_RECORDS, next);
    return true;
  },

  getRevenueSettings() {
    return this.get(this.KEYS.REVENUE_SETTINGS, { monthlyTarget: 0 });
  },

  saveRevenueSettings(data) {
    this.set(this.KEYS.REVENUE_SETTINGS, data);
  },

  addRevenueRecord(item) {
    const list = this.getRevenueRecords();
    const record = {
      ...item,
      id: 'rev_' + this.generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    list.push(record);
    this.saveRevenueRecords(list);
    return record;
  },

  _applyPastCandidateRevenueOverrides(payload, overrides) {
    const o = overrides && typeof overrides === 'object' ? overrides : {};
    const next = { ...payload };
    if (o.workDate) next.workDate = String(o.workDate).trim();
    if (o.customerName) next.customerName = String(o.customerName).trim();
    const serviceVal = o.service || o.actualService;
    if (serviceVal) next.service = String(serviceVal).trim();
    if (o.source) next.source = String(o.source).trim();
    if (o.amount != null && o.amount !== '') next.amount = Number(o.amount) || 0;
    if (o.memo !== undefined) {
      const memo = String(o.memo || '').trim();
      next.memo = memo || next.memo;
    }
    if (o.paymentStatus) next.paymentStatus = String(o.paymentStatus).trim();
    if (o.paymentDate !== undefined) next.paymentDate = String(o.paymentDate || '').trim();
    if (o.paymentMethod !== undefined) next.paymentMethod = String(o.paymentMethod || '').trim();
    if (o.paymentConcern !== undefined) next.paymentConcern = o.paymentConcern === true;
    if (o.grossMarginRate !== '' && o.grossMarginRate != null) {
      const rate = Number(o.grossMarginRate);
      if (!Number.isNaN(rate)) next.grossMarginRate = rate;
    }
    if (o.followMemo !== undefined && String(o.followMemo).trim()) {
      next.followUp = {
        ...(next.followUp || {}),
        memo: String(o.followMemo).trim(),
        thanksStatus: (next.followUp && next.followUp.thanksStatus) || 'pending',
        reviewStatus: (next.followUp && next.followUp.reviewStatus) || 'pending',
        repeatStatus: (next.followUp && next.followUp.repeatStatus) || 'pending'
      };
    }
    return next;
  },

  _convertPastCandidateWorkOrderToRevenue(raw, idx, nextRevenues, nextWorkOrders, options, now, addedRecords, skipped) {
    const wo = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(raw)
      : raw;
    if (!wo) return;
    const classification = CalendarCandidateBrain.classifyPastRecoveryCandidate(wo, nextRevenues, {
      ...options,
      today: options.today || now.slice(0, 10)
    });
    if (classification.status !== CalendarCandidateBrain.PAST_RECOVERY_REVENUE_CANDIDATE) {
      skipped.push({ id: wo.id, status: classification.status, reasons: classification.reasons || [] });
      return;
    }
    const overrideMap = options.overrides && typeof options.overrides === 'object' ? options.overrides : {};
    const itemOverrides = overrideMap[wo.id] || options.override || null;
    let payload = CalendarCandidateBrain.createRevenuePayloadFromPastCandidate({
      ...wo,
      calendarDedupeKey: classification.calendarDedupeKey
    });
    if (itemOverrides) {
      payload = this._applyPastCandidateRevenueOverrides(payload, itemOverrides);
      if (itemOverrides.singleConvert) {
        const userMemo = String(itemOverrides.memo || '').trim();
        payload.memo = [userMemo, wo.memo, 'Googleカレンダー過去分復元から売上確定'].filter(Boolean).join('\n');
      }
    }
    const record = {
      ...payload,
      id: 'rev_' + this.generateId(),
      createdAt: now,
      updatedAt: now
    };
    nextRevenues.push(record);
    addedRecords.push(record);
    nextWorkOrders[idx] = {
      ...raw,
      status: 'completed',
      completedAt: raw.completedAt || now,
      actualRevenueId: record.id,
      calendarDedupeKey: classification.calendarDedupeKey,
      candidateMeta: {
        ...(raw.candidateMeta || {}),
        candidateStatus: CalendarCandidateBrain.PAST_RECOVERY_CONVERTED,
        confirmedRevenue: true,
        convertedRevenueId: record.id,
        convertedAt: now,
        pastRecoveryMode: true
      },
      completion: {
        ...(raw.completion || {}),
        status: 'completed',
        completedAt: raw.completedAt || now,
        revenueId: record.id,
        actualAmount: Number(record.amount || 0),
        actualService: record.service || raw.serviceText || '',
        paymentStatus: record.paymentStatus || '未入金',
        memo: itemOverrides && itemOverrides.singleConvert
          ? 'Googleカレンダー過去分復元から売上確定'
          : 'Googleカレンダー過去分復元モードで一括売上確定',
        needsReview: false,
        updatedAt: now
      },
      updatedAt: now
    };
  },

  convertCalendarPastCandidateToRevenue(workOrderId, options = {}) {
    const id = String(workOrderId || '').trim();
    if (!id) return { ok: false, error: 'no_candidate', added: 0, skipped: 0 };
    const overrides = options.overrides && typeof options.overrides === 'object'
      ? { ...options.overrides }
      : {};
    if (options.override) {
      overrides[id] = { ...options.override, singleConvert: true };
    }
    return this.bulkConvertCalendarPastCandidatesToRevenue([id], { ...options, overrides });
  },

  bulkConvertCalendarPastCandidatesToRevenue(workOrderIds, options = {}) {
    const ids = new Set((workOrderIds || []).map(id => String(id || '').trim()).filter(Boolean));
    if (!ids.size || typeof CalendarCandidateBrain === 'undefined') {
      return { ok: false, error: 'no_candidates', added: 0, skipped: 0 };
    }
    const beforeRevenues = this.getRevenueRecords();
    const beforeWorkOrders = this.getWorkOrders();
    const nextRevenues = beforeRevenues.slice();
    const nextWorkOrders = beforeWorkOrders.slice();
    const now = new Date().toISOString();
    const addedRecords = [];
    const skipped = [];

    nextWorkOrders.forEach((raw, idx) => {
      const wo = typeof WorkOrderBrain !== 'undefined'
        ? WorkOrderBrain.normalizeWorkOrder(raw)
        : raw;
      if (!wo || !ids.has(String(wo.id || ''))) return;
      this._convertPastCandidateWorkOrderToRevenue(
        raw, idx, nextRevenues, nextWorkOrders, options, now, addedRecords, skipped
      );
    });

    if (!addedRecords.length) {
      return {
        ok: true,
        added: 0,
        skipped: skipped.length,
        beforeCount: beforeRevenues.length,
        afterCount: beforeRevenues.length,
        addedAmount: 0,
        skippedItems: skipped
      };
    }

    const revenueBackup = this.createSafetyBackup({
      reason: 'before_calendar_past_bulk_revenue_convert',
      targetKey: this.KEYS.REVENUE_RECORDS,
      beforeCount: beforeRevenues.length,
      data: beforeRevenues
    });
    const workOrderBackup = this.createSafetyBackup({
      reason: 'before_calendar_past_bulk_candidate_convert',
      targetKey: this.KEYS.WORK_ORDERS,
      beforeCount: beforeWorkOrders.length,
      data: beforeWorkOrders
    });
    const savedRevenue = this.saveRevenueRecords(nextRevenues);
    if (!savedRevenue) {
      return { ok: false, error: 'save_revenue_failed', added: 0, skipped: skipped.length };
    }
    this.saveWorkOrders(nextWorkOrders);
    const addedAmount = addedRecords.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    this.recordOperationLog({
      action: 'calendar_past_candidates_bulk_converted_to_revenue',
      targetKey: this.KEYS.REVENUE_RECORDS,
      beforeCount: beforeRevenues.length,
      afterCount: nextRevenues.length,
      addedCount: addedRecords.length,
      skippedCount: skipped.length,
      addedAmount,
      safeBackupId: revenueBackup.id,
      workOrderBackupId: workOrderBackup.id,
      sourceCandidateIds: addedRecords.map(r => r.sourceCandidateId).filter(Boolean)
    });
    return {
      ok: true,
      added: addedRecords.length,
      skipped: skipped.length,
      beforeCount: beforeRevenues.length,
      afterCount: nextRevenues.length,
      addedAmount,
      addedRecords,
      skippedItems: skipped,
      safeBackupId: revenueBackup.id,
      workOrderBackupId: workOrderBackup.id
    };
  },

  updateRevenueRecord(id, data) {
    const list = this.getRevenueRecords();
    const idx = list.findIndex(r => r.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...data, updatedAt: new Date().toISOString() };
      this.saveRevenueRecords(list);
    }
  },

  deleteRevenueRecord(id) {
    const revId = String(id || '').trim();
    if (!revId) return { ok: false, error: 'missing_target_id' };
    const beforeRevenues = this.getRevenueRecords();
    const target = beforeRevenues.find(r => String(r.id || '').trim() === revId);
    if (!target) {
      this.recordOperationLog({
        action: 'delete_revenue_blocked',
        targetKey: this.KEYS.REVENUE_RECORDS,
        targetId: revId,
        reason: 'target_not_found',
        beforeCount: beforeRevenues.length
      });
      return { ok: false, error: 'target_not_found', beforeCount: beforeRevenues.length };
    }
    if (beforeRevenues.length <= 1) {
      this.recordOperationLog({
        action: 'delete_revenue_blocked',
        targetKey: this.KEYS.REVENUE_RECORDS,
        targetId: revId,
        reason: 'all_records_delete_blocked',
        beforeCount: beforeRevenues.length
      });
      return { ok: false, error: 'all_records_delete_blocked', beforeCount: beforeRevenues.length };
    }
    const nextRevenues = beforeRevenues.filter(r => String(r.id || '').trim() !== revId);
    if (nextRevenues.length !== beforeRevenues.length - 1) {
      this.recordOperationLog({
        action: 'delete_revenue_blocked',
        targetKey: this.KEYS.REVENUE_RECORDS,
        targetId: revId,
        reason: 'count_mismatch',
        beforeCount: beforeRevenues.length,
        afterCount: nextRevenues.length
      });
      return { ok: false, error: 'count_mismatch', beforeCount: beforeRevenues.length, afterCount: nextRevenues.length };
    }
    const revenueBackup = this.createSafetyBackup({
      reason: 'before_delete_revenue',
      targetKey: this.KEYS.REVENUE_RECORDS,
      targetId: revId,
      beforeCount: beforeRevenues.length,
      data: beforeRevenues
    });
    const documents = this.getDocuments();
    let changed = false;
    const nextDocuments = documents.map(d => {
      if (String(d.linkedRevenueId || '').trim() !== revId) return d;
      changed = true;
      return { ...d, linkedRevenueId: '', updatedAt: new Date().toISOString() };
    });
    let documentBackup = null;
    if (changed) {
      documentBackup = this.createSafetyBackup({
        reason: 'before_unlink_document_from_deleted_revenue',
        targetKey: this.KEYS.DOCUMENTS,
        targetId: revId,
        beforeCount: documents.length,
        data: documents
      });
      this.saveDocuments(nextDocuments);
    }
    this.saveRevenueRecords(nextRevenues);
    this.recordOperationLog({
      action: 'delete_revenue',
      targetKey: this.KEYS.REVENUE_RECORDS,
      targetId: revId,
      beforeCount: beforeRevenues.length,
      afterCount: nextRevenues.length,
      safeBackupId: revenueBackup.id,
      linkedDocumentBackupId: documentBackup ? documentBackup.id : ''
    });
    return { ok: true, targetId: revId, beforeCount: beforeRevenues.length, afterCount: nextRevenues.length, safeBackupId: revenueBackup.id };
  },

  getDailyActionTasks() {
    return this.getDailyActionTasksData().states;
  },

  getDailyActionTasksData() {
    const raw = this.get(this.KEYS.DAILY_ACTION_TASKS, null);
    if (!raw) return { states: [], manualTasks: [], dailyChecks: {} };
    if (Array.isArray(raw)) return { states: raw, manualTasks: [], dailyChecks: {} };
    return {
      states: raw.states || [],
      manualTasks: raw.manualTasks || [],
      dailyChecks: raw.dailyChecks || {}
    };
  },

  saveDailyActionTasksData(data) {
    const existing = this.getDailyActionTasksData();
    const payload = {
      states: data.states != null ? data.states : existing.states,
      manualTasks: data.manualTasks != null ? data.manualTasks : existing.manualTasks
    };
    const checks = data.dailyChecks != null ? data.dailyChecks : existing.dailyChecks;
    if (checks && Object.keys(checks).length) payload.dailyChecks = checks;
    this.set(this.KEYS.DAILY_ACTION_TASKS, payload);
  },

  getTodayCheckState(date) {
    const store = this.getDailyActionTasksData();
    const d = date || new Date().toISOString().slice(0, 10);
    return (store.dailyChecks && store.dailyChecks[d]) || null;
  },

  saveTodayCheckState(date, checkData) {
    const store = this.getDailyActionTasksData();
    const d = date || new Date().toISOString().slice(0, 10);
    store.dailyChecks = store.dailyChecks || {};
    const prev = store.dailyChecks[d] || {};
    const items = (checkData && checkData.items)
      ? { ...(prev.items || {}), ...checkData.items }
      : (prev.items || {});
    store.dailyChecks[d] = {
      checkedAt: (checkData && checkData.checkedAt) || prev.checkedAt || '',
      memo: (checkData && checkData.memo != null) ? checkData.memo : (prev.memo || ''),
      version: (checkData && checkData.version) || prev.version || this.BUDIL_VERSION,
      items
    };
    this.saveDailyActionTasksData(store);
    return store.dailyChecks[d];
  },

  saveDailyActionTasks(list) {
    const data = this.getDailyActionTasksData();
    data.states = list;
    this.saveDailyActionTasksData(data);
  },

  upsertDailyActionTaskState(taskId, date, data) {
    const store = this.getDailyActionTasksData();
    const idx = store.states.findIndex(item => item.taskId === taskId && item.date === date);
    const prev = idx !== -1 ? store.states[idx] : {};
    const entry = {
      taskId,
      date,
      status: data.status != null ? data.status : prev.status,
      memo: data.memo != null ? data.memo : (prev.memo || ''),
      snoozedUntil: data.snoozedUntil != null ? data.snoozedUntil : (prev.snoozedUntil || ''),
      completedAt: data.completedAt != null ? data.completedAt : (prev.completedAt || ''),
      title: data.title != null ? data.title : prev.title,
      priority: data.priority != null ? data.priority : prev.priority,
      targetName: data.targetName != null ? data.targetName : prev.targetName,
      action: data.action != null ? data.action : prev.action,
      nextAction: data.nextAction != null ? data.nextAction : (prev.nextAction || ''),
      nextContact: data.nextContact != null ? data.nextContact : (prev.nextContact || ''),
      dueDate: data.dueDate != null ? data.dueDate : prev.dueDate,
      updatedAt: new Date().toISOString()
    };
    if (idx !== -1) {
      store.states[idx] = { ...prev, ...entry };
    } else {
      store.states.push(entry);
    }
    this.saveDailyActionTasksData(store);
    return entry;
  },

  addManualDailyTask(task) {
    const store = this.getDailyActionTasksData();
    const now = new Date().toISOString();
    const record = {
      ...task,
      id: task.id || ('manual_' + this.generateId()),
      type: 'manual',
      reason: task.reason || '手動追加',
      status: task.status || 'open',
      createdAt: task.createdAt || now,
      updatedAt: now
    };
    store.manualTasks.push(record);
    this.saveDailyActionTasksData(store);
    return record;
  },

  updateManualDailyTask(id, data) {
    const store = this.getDailyActionTasksData();
    const idx = store.manualTasks.findIndex(t => t.id === id);
    if (idx === -1) return null;
    store.manualTasks[idx] = {
      ...store.manualTasks[idx],
      ...data,
      updatedAt: new Date().toISOString()
    };
    this.saveDailyActionTasksData(store);
    return store.manualTasks[idx];
  },

  getDemandPickups() {
    const raw = this.get(this.KEYS.DEMAND_PICKUPS, []);
    return Array.isArray(raw) ? raw : [];
  },

  saveDemandPickups(list) {
    this.set(this.KEYS.DEMAND_PICKUPS, list);
  },

  addDemandPickup(item) {
    const list = this.getDemandPickups();
    const now = new Date().toISOString();
    const record = {
      ...item,
      id: item.id || ('demand-' + this.generateId()),
      status: item.status || 'open',
      createdAt: item.createdAt || now,
      updatedAt: now
    };
    list.unshift(record);
    this.saveDemandPickups(list);
    return record;
  },

  updateDemandPickup(id, data) {
    const list = this.getDemandPickups();
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...data, updatedAt: new Date().toISOString() };
    this.saveDemandPickups(list);
    return list[idx];
  },

  CRITICAL_BACKUP_KEYS: [
    'budil_leads',
    'budil_revenue_records',
    'budil_revenue_settings',
    'budil_daily_action_tasks',
    'budil_demand_pickups',
    'budil_reception_intakes',
    'budil_work_orders',
    'budil_expense_records',
    'budil_analytics_records',
    'budil_analytics_snapshots',
    'budil_external_check_reports',
    'budil_action_candidates',
    'budil_action_candidate_states',
    'budil_monthly_results',
    'budil_documents',
    'budil_safety_backups',
    'budil_operation_logs'
  ],

  getDocuments() {
    const raw = this.get(this.KEYS.DOCUMENTS, []);
    return Array.isArray(raw) ? raw : [];
  },

  saveDocuments(list) {
    this.set(this.KEYS.DOCUMENTS, list);
  },

  addDocument(item) {
    const list = this.getDocuments();
    const now = new Date().toISOString();
    const normalized = typeof DocumentsBrain !== 'undefined'
      ? DocumentsBrain.normalizeDocument(item)
      : { ...item };
    const record = {
      ...normalized,
      id: normalized.id || ('doc-' + this.generateId()),
      createdAt: normalized.createdAt || now,
      updatedAt: now
    };
    list.unshift(record);
    this.saveDocuments(list);
    return record;
  },

  updateDocument(id, data) {
    const list = this.getDocuments();
    const idx = list.findIndex(d => d.id === id);
    if (idx === -1) return null;
    const prev = list[idx];
    const merged = typeof DocumentsBrain !== 'undefined'
      ? DocumentsBrain.normalizeDocument({ ...prev, ...data, id: prev.id })
      : { ...prev, ...data };
    list[idx] = { ...merged, createdAt: prev.createdAt, updatedAt: new Date().toISOString() };
    this.saveDocuments(list);
    return list[idx];
  },

  deleteDocument(id) {
    const docId = String(id || '').trim();
    if (!docId) return { ok: false, error: 'missing_target_id' };
    const beforeDocuments = this.getDocuments();
    const target = beforeDocuments.find(d => String(d.id || '').trim() === docId);
    if (!target) {
      this.recordOperationLog({
        action: 'delete_document_blocked',
        targetKey: this.KEYS.DOCUMENTS,
        targetId: docId,
        reason: 'target_not_found',
        beforeCount: beforeDocuments.length
      });
      return { ok: false, error: 'target_not_found', beforeCount: beforeDocuments.length };
    }
    const nextDocumentsOnly = beforeDocuments.filter(d => String(d.id || '').trim() !== docId);
    if (nextDocumentsOnly.length !== beforeDocuments.length - 1) {
      this.recordOperationLog({
        action: 'delete_document_blocked',
        targetKey: this.KEYS.DOCUMENTS,
        targetId: docId,
        reason: 'count_mismatch',
        beforeCount: beforeDocuments.length,
        afterCount: nextDocumentsOnly.length
      });
      return { ok: false, error: 'count_mismatch', beforeCount: beforeDocuments.length, afterCount: nextDocumentsOnly.length };
    }
    const documentBackup = this.createSafetyBackup({
      reason: 'before_delete_document',
      targetKey: this.KEYS.DOCUMENTS,
      targetId: docId,
      beforeCount: beforeDocuments.length,
      data: beforeDocuments
    });
    const revenues = this.getRevenueRecords();
    let changed = false;
    const nextRevenues = revenues.map(r => {
      if (String(r.linkedDocumentId || '').trim() !== docId) return r;
      changed = true;
      return { ...r, linkedDocumentId: '', updatedAt: new Date().toISOString() };
    });
    let revenueBackup = null;
    if (changed) {
      revenueBackup = this.createSafetyBackup({
        reason: 'before_unlink_revenue_from_deleted_document',
        targetKey: this.KEYS.REVENUE_RECORDS,
        targetId: docId,
        beforeCount: revenues.length,
        data: revenues
      });
      this.saveRevenueRecords(nextRevenues);
    }
    this.saveDocuments(nextDocumentsOnly);
    this.recordOperationLog({
      action: 'delete_document',
      targetKey: this.KEYS.DOCUMENTS,
      targetId: docId,
      beforeCount: beforeDocuments.length,
      afterCount: nextDocumentsOnly.length,
      safeBackupId: documentBackup.id,
      linkedRevenueBackupId: revenueBackup ? revenueBackup.id : ''
    });
    return { ok: true, targetId: docId, beforeCount: beforeDocuments.length, afterCount: nextDocumentsOnly.length, safeBackupId: documentBackup.id };
  },

  getDocumentById(id) {
    return this.getDocuments().find(d => d.id === id) || null;
  },

  getExternalCheckReports() {
    const raw = this.get(this.KEYS.EXTERNAL_CHECK_REPORTS, []);
    return Array.isArray(raw) ? raw : [];
  },

  saveExternalCheckReports(list) {
    this.set(this.KEYS.EXTERNAL_CHECK_REPORTS, list);
  },

  addExternalCheckReport(item) {
    const list = this.getExternalCheckReports();
    const now = new Date().toISOString();
    const record = {
      ...item,
      id: item.id || ('extchk-' + this.generateId()),
      createdAt: item.createdAt || now,
      source: item.source || 'browser-bantou'
    };
    list.unshift(record);
    this.saveExternalCheckReports(list);
    return record;
  },

  deleteExternalCheckReport(id) {
    this.saveExternalCheckReports(this.getExternalCheckReports().filter(r => r.id !== id));
  },

  getLatestExternalCheckReport() {
    const list = this.getExternalCheckReports();
    return list.length ? list[0] : null;
  },

  getActionCandidates() {
    const raw = this.get(this.KEYS.ACTION_CANDIDATES, []);
    return Array.isArray(raw) ? raw : [];
  },

  saveActionCandidates(list) {
    this.set(this.KEYS.ACTION_CANDIDATES, list);
  },

  getActionCandidateStates() {
    const raw = this.get(this.KEYS.ACTION_CANDIDATE_STATES, {});
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  },

  saveActionCandidateStates(states) {
    this.set(this.KEYS.ACTION_CANDIDATE_STATES, states && typeof states === 'object' ? states : {});
  },

  getActionCandidateState(key) {
    const id = String(key || '').trim();
    if (!id) return null;
    return this.getActionCandidateStates()[id] || null;
  },

  setActionCandidateState(key, state, meta = {}) {
    const id = String(key || '').trim();
    if (!id) return null;
    const states = this.getActionCandidateStates();
    const previous = states[id] || null;
    if (previous && previous.state === state) return previous;
    const now = new Date().toISOString();
    const record = {
      ...(previous || {}),
      key: id,
      state,
      title: meta.title || (states[id] && states[id].title) || '',
      source: meta.source || (states[id] && states[id].source) || '',
      sourceKey: meta.sourceKey || (states[id] && states[id].sourceKey) || '',
      updatedAt: now
    };
    if (state === 'not_needed') record.notNeededAt = now;
    states[id] = record;
    this.saveActionCandidateStates(states);
    this.recordOperationLog({
      action: state === 'not_needed' ? 'action_candidate_not_needed' : 'action_candidate_state_changed',
      targetKey: this.KEYS.ACTION_CANDIDATE_STATES,
      targetId: id,
      candidateTitle: record.title,
      candidateSource: record.source,
      candidateState: state
    });
    return record;
  },

  findActionCandidateByDedupe(dedupeKey) {
    return this.getActionCandidates().find(c => c.dedupeKey === dedupeKey) || null;
  },

  addActionCandidate(item) {
    const normalized = typeof ActionBrain !== 'undefined'
      ? ActionBrain.normalizeCandidate(item)
      : { ...item };
    if (this.findActionCandidateByDedupe(normalized.dedupeKey)) {
      return { duplicate: true, record: this.findActionCandidateByDedupe(normalized.dedupeKey) };
    }
    const list = this.getActionCandidates();
    const now = new Date().toISOString();
    const record = {
      ...normalized,
      id: normalized.id || ('actcand-' + this.generateId()),
      createdAt: normalized.createdAt || now,
      status: normalized.status || 'todo',
      doneAt: normalized.doneAt || null
    };
    list.unshift(record);
    this.saveActionCandidates(list);
    return { duplicate: false, record };
  },

  markActionCandidateDone(id) {
    const list = this.getActionCandidates();
    const idx = list.findIndex(c => c.id === id);
    if (idx === -1) return null;
    const now = new Date().toISOString();
    list[idx] = {
      ...list[idx],
      status: 'done',
      doneAt: now,
      updatedAt: now
    };
    this.saveActionCandidates(list);
    return list[idx];
  },

  markActionCandidateNotNeeded(id, fallback = {}) {
    const candidateId = String(id || '').trim();
    const list = this.getActionCandidates();
    let idx = list.findIndex(c => c.id === candidateId);
    const now = new Date().toISOString();
    const sourceReportId = String(fallback.sourceReportId || '').trim();
    const title = String(fallback.title || '').trim();
    const fallbackDedupeKey = sourceReportId && title
      ? (typeof ActionBrain !== 'undefined'
        ? ActionBrain.makeDedupeKey(sourceReportId, title)
        : ['external-check', sourceReportId, title].join('|'))
      : '';
    const nextStatus = typeof ActionBrain !== 'undefined' ? ActionBrain.STATUS_NOT_NEEDED : 'not_needed';
    let created = false;
    if (idx === -1 && fallbackDedupeKey) {
      const dedupeKey = fallbackDedupeKey;
      idx = list.findIndex(c => c.dedupeKey === dedupeKey);
    }
    if (idx === -1 && fallbackDedupeKey) {
      const normalized = typeof ActionBrain !== 'undefined'
        ? ActionBrain.createFromExternalCheck(sourceReportId, title)
        : {
          id: 'actcand-' + this.generateId(),
          createdAt: now,
          source: 'external-check',
          sourceReportId,
          title,
          status: 'todo',
          memo: '外部チェック由来の行動候補（売上確定ではありません）',
          doneAt: null,
          dedupeKey: fallbackDedupeKey
        };
      list.unshift({
        ...normalized,
        id: normalized.id || ('actcand-' + this.generateId()),
        status: nextStatus,
        notNeededAt: now,
        updatedAt: now
      });
      idx = 0;
      created = true;
    }
    if (idx === -1) return null;
    if (!created && list[idx].status === nextStatus) return list[idx];
    list[idx] = {
      ...list[idx],
      status: nextStatus,
      notNeededAt: now,
      updatedAt: now
    };
    this.saveActionCandidates(list);
    this.recordOperationLog({
      action: 'action_candidate_not_needed',
      targetKey: this.KEYS.ACTION_CANDIDATES,
      targetId: list[idx].id,
      candidateTitle: list[idx].title || fallback.title || '',
      candidateSource: list[idx].source || fallback.source || '',
      sourceReportId: list[idx].sourceReportId || fallback.sourceReportId || ''
    });
    return list[idx];
  },

  deleteActionCandidate(id) {
    this.saveActionCandidates(this.getActionCandidates().filter(c => c.id !== id));
  },

  getWorkOrders() {
    const raw = this.get(this.KEYS.WORK_ORDERS, []);
    return Array.isArray(raw) ? raw : [];
  },

  saveWorkOrders(list) {
    this.set(this.KEYS.WORK_ORDERS, list);
  },

  addWorkOrder(item) {
    const list = this.getWorkOrders();
    const now = new Date().toISOString();
    const normalized = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(item)
      : { ...item };
    const record = {
      ...normalized,
      id: normalized.id || ('work-' + this.generateId()),
      status: normalized.status || 'tentative',
      createdAt: normalized.createdAt || now,
      updatedAt: now
    };
    list.unshift(record);
    this.saveWorkOrders(list);
    return record;
  },

  updateWorkOrder(id, data) {
    const list = this.getWorkOrders();
    const idx = list.findIndex(w => w.id === id);
    if (idx === -1) return null;
    const prev = list[idx];
    const merged = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder({ ...prev, ...data, id: prev.id })
      : { ...prev, ...data };
    list[idx] = { ...merged, updatedAt: new Date().toISOString() };
    this.saveWorkOrders(list);
    return list[idx];
  },

  deleteDemoWorkOrders() {
    return this.deleteTestRecordsByKey(this.KEYS.WORK_ORDERS, {
      reason: 'before_delete_demo_work_orders',
      action: 'delete_demo_work_orders'
    });
  },

  getExpenseRecords() {
    const raw = this.get(this.KEYS.EXPENSE_RECORDS, []);
    return Array.isArray(raw) ? raw : [];
  },

  saveExpenseRecords(list) {
    this.set(this.KEYS.EXPENSE_RECORDS, list);
  },

  addExpenseRecord(item) {
    const list = this.getExpenseRecords();
    const now = new Date().toISOString();
    const normalized = typeof ProfitBrain !== 'undefined'
      ? ProfitBrain.normalizeExpense(item)
      : { ...item };
    const record = {
      ...normalized,
      id: normalized.id || ('expense-' + this.generateId()),
      createdAt: normalized.createdAt || now,
      updatedAt: now
    };
    list.unshift(record);
    this.saveExpenseRecords(list);
    return record;
  },

  updateExpenseRecord(id, data) {
    const list = this.getExpenseRecords();
    const idx = list.findIndex(e => e.id === id);
    if (idx === -1) return null;
    const prev = list[idx];
    const merged = typeof ProfitBrain !== 'undefined'
      ? ProfitBrain.normalizeExpense({ ...prev, ...data, id: prev.id })
      : { ...prev, ...data };
    list[idx] = { ...merged, updatedAt: new Date().toISOString() };
    this.saveExpenseRecords(list);
    return list[idx];
  },

  deleteExpenseRecord(id) {
    this.saveExpenseRecords(this.getExpenseRecords().filter(e => e.id !== id));
  },

  deleteDemoExpenseRecords() {
    this.saveExpenseRecords(this.getExpenseRecords().filter(e => !this.isTestDeletionTarget(e)));
  },

  getAnalyticsRecords() {
    const raw = this.get(this.KEYS.ANALYTICS_RECORDS, []);
    return Array.isArray(raw) ? raw : [];
  },

  saveAnalyticsRecords(list) {
    this.set(this.KEYS.ANALYTICS_RECORDS, list);
  },

  addAnalyticsRecord(item) {
    const list = this.getAnalyticsRecords();
    const now = new Date().toISOString();
    const normalized = typeof AnalyticsBrain !== 'undefined'
      ? AnalyticsBrain.enrichRecord(item)
      : { ...item };
    const record = {
      ...normalized,
      id: normalized.id || ('analytics-' + this.generateId()),
      status: normalized.status || 'open',
      createdAt: normalized.createdAt || now,
      updatedAt: now
    };
    list.unshift(record);
    this.saveAnalyticsRecords(list);
    return record;
  },

  updateAnalyticsRecord(id, data) {
    const list = this.getAnalyticsRecords();
    const idx = list.findIndex(r => r.id === id);
    if (idx === -1) return null;
    const prev = list[idx];
    const merged = typeof AnalyticsBrain !== 'undefined'
      ? AnalyticsBrain.enrichRecord({ ...prev, ...data, id: prev.id })
      : { ...prev, ...data };
    list[idx] = { ...merged, updatedAt: new Date().toISOString() };
    this.saveAnalyticsRecords(list);
    return list[idx];
  },

  deleteAnalyticsRecord(id) {
    this.saveAnalyticsRecords(this.getAnalyticsRecords().filter(r => r.id !== id));
  },

  deleteDemoAnalyticsRecords() {
    this.saveAnalyticsRecords(this.getAnalyticsRecords().filter(r => !this.isTestDeletionTarget(r)));
  },

  getAnalyticsSnapshots() {
    const raw = this.get(this.KEYS.ANALYTICS_SNAPSHOTS, []);
    return Array.isArray(raw) ? raw : [];
  },

  saveAnalyticsSnapshots(list) {
    this.set(this.KEYS.ANALYTICS_SNAPSHOTS, Array.isArray(list) ? list : []);
  },

  addAnalyticsSnapshot(item) {
    const list = this.getAnalyticsSnapshots();
    const now = new Date().toISOString();
    const record = {
      ...(item || {}),
      id: (item && item.id) || ('analytics-snapshot-' + this.generateId()),
      source: (item && item.source) || 'paste-import',
      importedAt: (item && item.importedAt) || now,
      createdAt: (item && item.createdAt) || now
    };
    list.unshift(record);
    this.saveAnalyticsSnapshots(list);
    return record;
  },

  getLatestAnalyticsSnapshot() {
    const list = this.getAnalyticsSnapshots();
    return list.length ? list[0] : null;
  },

  findAnalyticsSnapshotDuplicate(rawTextHash, periodLabel = '') {
    const hash = String(rawTextHash || '').trim();
    const period = String(periodLabel || '').trim();
    if (!hash) return null;
    return this.getAnalyticsSnapshots().find(s =>
      s && s.rawTextHash === hash && (!period || String(s.periodLabel || '').trim() === period)
    ) || null;
  },

  getMonthlyResults() {
    const raw = this.get(this.KEYS.MONTHLY_RESULTS, []);
    return Array.isArray(raw) ? raw : [];
  },

  saveMonthlyResults(list) {
    this.set(this.KEYS.MONTHLY_RESULTS, list);
  },

  getMonthlyResultByMonth(month) {
    const key = typeof MonthlyResultsBrain !== 'undefined'
      ? MonthlyResultsBrain.normalizeMonth(month)
      : String(month || '').trim();
    if (!key) return null;
    return this.getMonthlyResults().find(r => r.month === key || r.id === key) || null;
  },

  upsertMonthlyResult(item) {
    const list = this.getMonthlyResults();
    const normalized = typeof MonthlyResultsBrain !== 'undefined'
      ? MonthlyResultsBrain.normalizeRecord(item)
      : { ...item };
    const month = normalized.month || normalized.id;
    if (!month) return { ok: false, error: 'month_required' };
    normalized.id = month;
    normalized.month = month;
    const now = new Date().toISOString();
    const idx = list.findIndex(r => r.month === month || r.id === month);
    if (idx >= 0) {
      const prev = list[idx];
      list[idx] = {
        ...prev,
        ...normalized,
        id: month,
        month,
        createdAt: prev.createdAt || now,
        updatedAt: now
      };
      this.saveMonthlyResults(list);
      return { ok: true, record: list[idx], created: false };
    }
    const record = {
      ...normalized,
      id: month,
      month,
      createdAt: now,
      updatedAt: now
    };
    list.push(record);
    if (typeof MonthlyResultsBrain !== 'undefined') {
      this.saveMonthlyResults(MonthlyResultsBrain.sortByMonthDesc(list));
    } else {
      this.saveMonthlyResults(list);
    }
    return { ok: true, record, created: true };
  },

  updateMonthlyResult(id, data) {
    const list = this.getMonthlyResults();
    const idx = list.findIndex(r => r.id === id);
    if (idx === -1) return null;
    const prev = list[idx];
    const merged = typeof MonthlyResultsBrain !== 'undefined'
      ? MonthlyResultsBrain.normalizeRecord({ ...prev, ...data, id: prev.id, month: prev.month })
      : { ...prev, ...data };
    list[idx] = { ...merged, updatedAt: new Date().toISOString() };
    this.saveMonthlyResults(list);
    return list[idx];
  },

  deleteMonthlyResult(id) {
    this.saveMonthlyResults(this.getMonthlyResults().filter(r => r.id !== id));
  },

  getReceptionIntakes() {
    const raw = this.get(this.KEYS.RECEPTION_INTAKES, []);
    return Array.isArray(raw) ? raw : [];
  },

  saveReceptionIntakes(list) {
    this.set(this.KEYS.RECEPTION_INTAKES, list);
  },

  addReceptionIntake(item) {
    const list = this.getReceptionIntakes();
    const now = new Date().toISOString();
    const normalized = typeof ReceptionBrain !== 'undefined'
      ? ReceptionBrain.normalizeIntake(item)
      : { ...item };
    const record = {
      ...normalized,
      id: normalized.id || ('intake-' + this.generateId()),
      status: normalized.status || 'new',
      relatedTaskIds: Array.isArray(normalized.relatedTaskIds) ? normalized.relatedTaskIds : [],
      createdAt: normalized.createdAt || now,
      updatedAt: now
    };
    list.unshift(record);
    this.saveReceptionIntakes(list);
    return record;
  },

  updateReceptionIntake(id, data) {
    const list = this.getReceptionIntakes();
    const idx = list.findIndex(i => i.id === id);
    if (idx === -1) return null;
    const prev = list[idx];
    const merged = typeof ReceptionBrain !== 'undefined'
      ? ReceptionBrain.normalizeIntake({ ...prev, ...data, id: prev.id })
      : { ...prev, ...data };
    list[idx] = { ...merged, updatedAt: new Date().toISOString() };
    this.saveReceptionIntakes(list);
    return list[idx];
  },

  deleteDemoReceptionIntakes() {
    return this.deleteTestRecordsByKey(this.KEYS.RECEPTION_INTAKES, {
      reason: 'before_delete_demo_reception_intakes',
      action: 'delete_demo_reception_intakes'
    });
  },

  isValidDateStr(str) {
    if (!str || typeof str !== 'string') return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    const d = new Date(str + 'T12:00:00');
    return !Number.isNaN(d.getTime());
  },

  getLocalStorageUsage() {
    let bytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const val = localStorage.getItem(key);
        bytes += (key ? key.length : 0) + (val ? val.length : 0);
      }
    } catch {
      return { bytes: 0, label: '—' };
    }
    const kb = Math.round(bytes / 1024);
    return { bytes, label: kb + 'KB' };
  },

  _readRawKey(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return { exists: false, raw: null, parsed: null, parseOk: true };
      const parsed = JSON.parse(raw);
      return { exists: true, raw, parsed, parseOk: true };
    } catch (e) {
      return { exists: true, raw: localStorage.getItem(key), parsed: null, parseOk: false, error: e.message };
    }
  },

  runDataDiagnostics() {
    const ranAt = new Date().toISOString();
    const todayDiag = new Date().toISOString().slice(0, 10);
    const levels = { ok: [], caution: [], review: [], critical: [] };
    const counts = {
      leads: 0,
      revenue: 0,
      documents: 0,
      monthlyResults: 0,
      externalChecks: 0,
      receivablesPending: 0,
      linkedCount: 0,
      linkedBroken: 0,
      dailyTasks: 0,
      pickups: 0,
      receptionIntakes: 0,
      workOrders: 0,
      expenseRecords: 0,
      analyticsRecords: 0,
      analyticsSnapshots: 0,
      activityLogs: 0,
      performanceEntered: 0,
      dailyChecks: 0,
      actionCandidateStates: 0,
      safetyBackups: 0,
      operationLogs: 0
    };
    const keyStatus = [];
    const backupKeys = [];
    const usage = this.getLocalStorageUsage();
    const settings = this.getSettings();
    const previousDiagnosticCounts = settings.lastDiagnosticCounts || null;

    const add = (level, msg) => {
      if (levels[level]) levels[level].push(msg);
    };

    const backupList = (typeof DataBackup !== 'undefined' && DataBackup.BACKUP_KEYS)
      ? DataBackup.BACKUP_KEYS
      : this.CRITICAL_BACKUP_KEYS;

    backupList.forEach(key => {
      const info = this._readRawKey(key);
      keyStatus.push({ key, exists: info.exists, parseOk: info.parseOk });
      backupKeys.push({
        key,
        exists: info.exists,
        inBackupList: true,
        parseOk: info.parseOk
      });
      if (!info.parseOk) {
        add('critical', `読み込みできないlocalStorageデータ: ${key}`);
      }
    });

    this.CRITICAL_BACKUP_KEYS.forEach(key => {
      if (!backupKeys.some(b => b.key === key)) {
        const info = this._readRawKey(key);
        backupKeys.push({ key, exists: info.exists, inBackupList: backupList.includes(key), parseOk: info.parseOk });
      }
    });

    counts.actionCandidateStates = Object.keys(this.getActionCandidateStates()).length;
    counts.safetyBackups = this.getSafetyBackups().length;
    counts.operationLogs = this.getOperationLogs().length;
    add('ok', `候補状態 ${counts.actionCandidateStates}件`);
    add('ok', `安全バックアップ ${counts.safetyBackups}件`);
    add('ok', `操作ログ ${counts.operationLogs}件`);

    const missingCritical = this.CRITICAL_BACKUP_KEYS.filter(k => !backupList.includes(k));
    if (missingCritical.length) {
      add('review', 'バックアップ対象に不足キー: ' + missingCritical.join(', '));
    } else {
      add('ok', 'バックアップ対象の主要キーはすべて定義済み');
    }

    const leadIds = new Set();
    const leadsRaw = this._readRawKey(this.KEYS.LEADS);
    let leads = [];
    if (!leadsRaw.parseOk) {
      add('critical', '営業先データ（budil_leads）を読み込めません');
    } else if (leadsRaw.exists) {
      leads = Array.isArray(leadsRaw.parsed) ? leadsRaw.parsed : [];
      if (!Array.isArray(leadsRaw.parsed)) add('review', '営業先データが配列ではありません');
      counts.leads = leads.length;
      add('ok', `営業先 ${counts.leads}件`);

      const VALID_SALES = typeof SalesBrain !== 'undefined' ? SalesBrain.SALES_STATUSES : [];
      const VALID_LEGACY = ['未接触', 'アプローチ中', '商談中', '成約', '見送り', 'NG'];
      const VALID_PRIORITY = ['A', 'B', 'C'];
      let noId = 0; let noName = 0; let dupId = 0; let badLogs = 0;
      let badNextDate = 0; let badSalesStatus = 0; let badLegacyStatus = 0; let badPriority = 0;

      leads.forEach(lead => {
        if (!lead || typeof lead !== 'object') return;
        if (!lead.id) noId++;
        else if (leadIds.has(lead.id)) dupId++;
        else leadIds.add(lead.id);
        if (!(lead.company || '').trim()) noName++;
        if (lead.activityLogs != null && !Array.isArray(lead.activityLogs)) badLogs++;
        else if (Array.isArray(lead.activityLogs)) counts.activityLogs += lead.activityLogs.length;
        const nd = lead.nextActionDate || lead.nextContact;
        if (nd && !this.isValidDateStr(nd)) badNextDate++;
        if (lead.salesStatus && VALID_SALES.length && !VALID_SALES.includes(lead.salesStatus)) badSalesStatus++;
        if (lead.status && !VALID_LEGACY.includes(lead.status)) badLegacyStatus++;
        if (lead.priority && !VALID_PRIORITY.includes(lead.priority)) badPriority++;
      });

      if (noId) add('review', `IDなしの営業先 ${noId}件`);
      if (noName) add('review', `名前なしの営業先 ${noName}件`);
      if (dupId) add('review', `重複IDの営業先 ${dupId}件`);
      if (badLogs) add('review', `activityLogsが配列でない営業先 ${badLogs}件`);
      if (badNextDate) add('review', `nextActionDate形式不正 ${badNextDate}件`);
      if (badSalesStatus) add('caution', `salesStatusが想定外 ${badSalesStatus}件`);
      if (badLegacyStatus) add('caution', `statusが想定外 ${badLegacyStatus}件`);
      if (badPriority) add('caution', `priorityが想定外 ${badPriority}件`);
    } else {
      add('ok', '営業先 0件');
    }

    const revRaw = this._readRawKey(this.KEYS.REVENUE_RECORDS);
    let revenues = [];
    if (!revRaw.parseOk) {
      add('critical', '売上データ（budil_revenue_records）を読み込めません');
    } else if (revRaw.exists) {
      revenues = Array.isArray(revRaw.parsed) ? revRaw.parsed : [];
      if (!Array.isArray(revRaw.parsed)) add('review', '売上データが配列ではありません');
      counts.revenue = revenues.length;
      add('ok', `売上 ${counts.revenue}件`);
      if (counts.revenue === 0) {
        add('critical', '警告：売上データが0件です。安全バックアップや手元の記録を確認してください。');
      }
      if (previousDiagnosticCounts && Number(previousDiagnosticCounts.revenue) > counts.revenue) {
        const diff = Number(previousDiagnosticCounts.revenue) - counts.revenue;
        if (diff >= 1) add('caution', `前回診断より売上件数が${diff}件減っています`);
      }

      const revIds = new Set(revenues.filter(r => r && r.id).map(r => r.id));
      let noId = 0; let badAmount = 0; let noDate = 0; let badLeadRef = 0;
      let paymentConcern = 0;

      revenues.forEach(r => {
        if (!r || typeof r !== 'object') return;
        if (!r.id) noId++;
        if (r.amount != null && typeof r.amount !== 'number') badAmount++;
        if (!r.workDate) noDate++;
        const lid = r.leadId;
        if (lid && !leadIds.has(lid)) badLeadRef++;
        if (r.paymentConcern === true) paymentConcern++;
      });

      if (noId) add('review', `IDなしの売上 ${noId}件`);
      if (badAmount) add('review', `売上金額が数値でない ${badAmount}件`);
      if (noDate) add('caution', `日付なしの売上 ${noDate}件`);
      if (badLeadRef) add('review', `存在しない営業先に紐付いた売上 ${badLeadRef}件`);
      if (paymentConcern) add('caution', `入金注意（paymentConcern） ${paymentConcern}件`);

      if (typeof RevenueSummaryBrain !== 'undefined') {
        const revWarnings = RevenueSummaryBrain.getRevenueWarnings(revenues);
        if (revWarnings.noDate) add('caution', `日付不明の確定売上 ${revWarnings.noDate}件`);
        if (revWarnings.badAmount) add('caution', `金額不明/数値不正の売上 ${revWarnings.badAmount}件`);
        if (revWarnings.plannedCount) add('caution', `未確定の売上予定 ${revWarnings.plannedCount}件（集計対象外）`);
        if (revWarnings.unknownSource) add('caution', `依頼元不明の確定売上 ${revWarnings.unknownSource}件`);
        if (revWarnings.unknownService) add('caution', `サービス不明の確定売上 ${revWarnings.unknownService}件`);
      }
    } else {
      add('ok', '売上 0件');
      add('critical', '警告：売上データが0件です。安全バックアップや手元の記録を確認してください。');
      if (previousDiagnosticCounts && Number(previousDiagnosticCounts.revenue) > 0) {
        add('caution', `前回診断より売上件数が${Number(previousDiagnosticCounts.revenue)}件減っています`);
      }
    }

    const docRaw = this._readRawKey(this.KEYS.DOCUMENTS);
    let documents = [];
    if (!docRaw.parseOk) {
      add('critical', '請求書・見積書（budil_documents）を読み込めません');
    } else if (docRaw.exists) {
      documents = Array.isArray(docRaw.parsed) ? docRaw.parsed : [];
      if (!Array.isArray(docRaw.parsed)) add('review', '請求書・見積書データが配列ではありません');
      counts.documents = documents.length;
      const invoiceCount = documents.filter(d => d && d.type === 'invoice').length;
      const estimateCount = documents.filter(d => d && d.type === 'estimate').length;
      add('ok', `請求書/見積書 ${counts.documents}件（請求${invoiceCount} / 見積${estimateCount}）`);
    } else {
      add('ok', '請求書/見積書 0件');
    }

    const monthlyRaw = this._readRawKey(this.KEYS.MONTHLY_RESULTS);
    if (!monthlyRaw.parseOk) {
      add('critical', '月次実績（budil_monthly_results）を読み込めません');
    } else if (monthlyRaw.exists) {
      const monthly = Array.isArray(monthlyRaw.parsed) ? monthlyRaw.parsed : [];
      if (!Array.isArray(monthlyRaw.parsed)) add('review', '月次実績データが配列ではありません');
      counts.monthlyResults = monthly.length;
      add('ok', `月次実績 ${counts.monthlyResults}件`);
    } else {
      add('ok', '月次実績 0件');
    }

    const extRaw = this._readRawKey(this.KEYS.EXTERNAL_CHECK_REPORTS);
    if (!extRaw.parseOk) {
      add('critical', '外部チェック（budil_external_check_reports）を読み込めません');
    } else if (extRaw.exists) {
      const extList = Array.isArray(extRaw.parsed) ? extRaw.parsed : [];
      if (!Array.isArray(extRaw.parsed)) add('review', '外部チェックデータが配列ではありません');
      counts.externalChecks = extList.length;
      add('ok', `外部チェック ${counts.externalChecks}件`);
    } else {
      add('ok', '外部チェック 0件');
    }

    if (typeof DataBackup !== 'undefined') {
      const integrity = DataBackup.getIntegritySummaryFromData({
        budil_revenue_records: revenues,
        budil_documents: documents,
        budil_monthly_results: monthlyRaw.exists && monthlyRaw.parseOk ? monthlyRaw.parsed : [],
        budil_external_check_reports: extRaw.exists && extRaw.parseOk ? extRaw.parsed : [],
        budil_action_candidates: this._readRawKey(this.KEYS.ACTION_CANDIDATES).parsed || []
      });
      counts.linkedCount = integrity.linkedCount || 0;
      counts.linkedBroken = integrity.linkedBrokenCount || 0;
      add('ok', `linked済み ${counts.linkedCount}件`);
      if (counts.linkedBroken) add('caution', `linked切れ ${counts.linkedBroken}件`);
      if (integrity.revenueMissingPaymentFields) {
        add('caution', `payment fields欠落の売上 ${integrity.revenueMissingPaymentFields}件`);
      }
      if (integrity.documentsMissingPaymentFields) {
        add('caution', `payment fields欠落の請求書 ${integrity.documentsMissingPaymentFields}件`);
      }
      const taxMissing = Math.max(0, (integrity.documentCount || 0) - (integrity.documentsWithTaxSettings || 0));
      if (taxMissing) add('caution', `taxSettings欠落の請求書 ${taxMissing}件`);
    }

    if (typeof PaymentBrain !== 'undefined') {
      const receivables = PaymentBrain.summarizeReceivables(revenues, documents, todayDiag);
      counts.receivablesPending = receivables.count || 0;
      add('ok', `入金待ち ${counts.receivablesPending}件（未入金合計 ${PaymentBrain.formatYen(receivables.pendingTotal || 0)}）`);
    }

    const tasksRaw = this._readRawKey(this.KEYS.DAILY_ACTION_TASKS);
    if (!tasksRaw.parseOk) {
      add('critical', '今日やること（budil_daily_action_tasks）を読み込めません');
    } else if (tasksRaw.exists) {
      const data = tasksRaw.parsed;
      if (Array.isArray(data)) {
        counts.dailyTasks = data.length;
        add('ok', `今日やること（旧形式配列） ${counts.dailyTasks}件`);
        add('caution', 'budil_daily_action_tasks が旧形式配列です（読み込みは継続）');
      } else if (data && typeof data === 'object') {
        const states = Array.isArray(data.states) ? data.states : null;
        const manual = Array.isArray(data.manualTasks) ? data.manualTasks : null;
        const checks = data.dailyChecks && typeof data.dailyChecks === 'object' ? data.dailyChecks : null;
        if (!states) add('review', 'daily_action_tasks.states が配列ではありません');
        if (!manual) add('review', 'daily_action_tasks.manualTasks が配列ではありません');
        if (!checks) add('caution', 'dailyChecks が未設定です');
        const manualList = manual || [];
        const stateList = states || [];
        counts.dailyTasks = manualList.length + stateList.length;
        counts.dailyChecks = checks ? Object.keys(checks).length : 0;
        add('ok', `今日やること 手動${manualList.length}件 / 状態${stateList.length}件`);
        if (counts.dailyChecks) add('ok', `dailyChecks ${counts.dailyChecks}件`);

        let noManualId = 0; let badDue = 0; let doneCount = 0; let snoozedCount = 0;
        manualList.forEach(t => {
          if (!t || typeof t !== 'object') return;
          if (!t.id) noManualId++;
          if (t.dueDate && !this.isValidDateStr(t.dueDate)) badDue++;
          if (t.status === 'done') doneCount++;
          if (t.status === 'snoozed') snoozedCount++;
        });
        stateList.forEach(s => {
          if (s && s.status === 'done') doneCount++;
          if (s && s.status === 'snoozed') snoozedCount++;
        });
        if (noManualId) add('review', `手動タスクIDなし ${noManualId}件`);
        if (badDue) add('review', `dueDate形式不正 ${badDue}件`);
        if (doneCount) add('ok', `完了済みタスク ${doneCount}件`);
        if (snoozedCount) add('ok', `明日に回し/後回し ${snoozedCount}件`);
      } else {
        add('review', 'budil_daily_action_tasks の形式が不明です');
      }
    } else {
      add('ok', '今日やること 0件');
    }

    const pickupRaw = this._readRawKey(this.KEYS.DEMAND_PICKUPS);
    let pickups = [];
    const revIdSet = new Set(revenues.filter(r => r && r.id).map(r => r.id));
    const VALID_PICKUP_STATUS = ['open', 'used', 'ignored', 'archived'];
    if (!pickupRaw.parseOk) {
      add('critical', '需要ピックアップ（budil_demand_pickups）を読み込めません');
    } else if (pickupRaw.exists) {
      pickups = Array.isArray(pickupRaw.parsed) ? pickupRaw.parsed : [];
      if (!Array.isArray(pickupRaw.parsed)) add('review', '需要ピックアップが配列ではありません');
      counts.pickups = pickups.length;
      add('ok', `需要ピックアップ ${counts.pickups}件`);

      let noId = 0; let noTopic = 0; let badScore = 0; let badStatus = 0;
      let hasOutputs = 0; let noOutputs = 0; let hasExec = 0; let noExec = 0;
      let hasMetrics = 0; let badLeadRef = 0; let badRevRef = 0; let badSched = 0;
      let perfEntered = 0; let perfMissing = 0;

      pickups.forEach(raw => {
        if (!raw || typeof raw !== 'object') return;
        if (!raw.id) noId++;
        if (!(raw.topic || '').trim()) noTopic++;
        if (raw.demandScore != null && typeof raw.demandScore !== 'number') badScore++;
        if (raw.status && !VALID_PICKUP_STATUS.includes(raw.status)) badStatus++;
        if (raw.generatedOutputs && typeof raw.generatedOutputs === 'object') hasOutputs++;
        else noOutputs++;
        if (raw.executionStatus && typeof raw.executionStatus === 'object') hasExec++;
        else noExec++;

        const exec = typeof DemandBrain !== 'undefined'
          ? DemandBrain.normalizeExecutionStatus(raw)
          : (raw.executionStatus || {});
        const types = typeof DemandBrain !== 'undefined' ? DemandBrain.EXECUTION_TYPES : Object.keys(exec);

        types.forEach(type => {
          const item = exec[type] || {};
          if (item.metrics && typeof item.metrics === 'object' && Object.keys(item.metrics).length) hasMetrics++;
          const sched = item.scheduledDate;
          if (sched && !this.isValidDateStr(sched)) badSched++;
          if (typeof DemandBrain !== 'undefined') {
            const done = DemandBrain.isExecutionDone(type, item.status);
            const hasInput = DemandBrain.hasPerformanceInput(item);
            if (done && hasInput) perfEntered++;
            else if (done && !hasInput) perfMissing++;
          }
          (item.relatedLeadIds || []).forEach(lid => {
            if (lid && !leadIds.has(lid)) badLeadRef++;
          });
          (item.relatedRevenueIds || []).forEach(rid => {
            if (rid && !revIdSet.has(rid)) badRevRef++;
          });
        });
      });

      counts.performanceEntered = perfEntered;
      if (noId) add('review', `IDなしの需要ピックアップ ${noId}件`);
      if (noTopic) add('review', `topicなしの需要ピックアップ ${noTopic}件`);
      if (badScore) add('review', `demandScoreが数値でない ${badScore}件`);
      if (badStatus) add('caution', `statusが想定外 ${badStatus}件`);
      if (hasOutputs) add('ok', `generatedOutputsあり ${hasOutputs}件`);
      if (noOutputs) add('caution', `generatedOutputsなし ${noOutputs}件`);
      if (hasExec) add('ok', `executionStatusあり ${hasExec}件`);
      if (noExec) add('caution', `executionStatusなし ${noExec}件`);
      if (hasMetrics) add('ok', `metrics入力あり ${hasMetrics}件`);
      if (badLeadRef) add('review', `存在しない営業先へのrelatedLeadIds ${badLeadRef}件`);
      if (badRevRef) add('review', `存在しない売上へのrelatedRevenueIds ${badRevRef}件`);
      if (badSched) add('review', `scheduledDate形式不正 ${badSched}件`);
      if (perfEntered) add('ok', `成果入力済み施策 ${perfEntered}件`);
      if (perfMissing) add('caution', `成果未入力の施策 ${perfMissing}件`);
    } else {
      add('ok', '需要ピックアップ 0件');
    }

    const intakeRaw = this._readRawKey(this.KEYS.RECEPTION_INTAKES);
    let intakes = [];
    const VALID_INTAKE_STATUS = typeof ReceptionBrain !== 'undefined'
      ? ReceptionBrain.STATUSES
      : ['new', 'lead_created', 'task_created', 'revenue_candidate', 'done', 'archived'];
    if (!intakeRaw.parseOk) {
      add('critical', '受付データ（budil_reception_intakes）を読み込めません');
    } else if (intakeRaw.exists) {
      intakes = Array.isArray(intakeRaw.parsed) ? intakeRaw.parsed : [];
      if (!Array.isArray(intakeRaw.parsed)) add('review', '受付データが配列ではありません');
      counts.receptionIntakes = intakes.length;
      add('ok', `受付データ ${counts.receptionIntakes}件`);

      let noId = 0; let noName = 0; let badStatus = 0;
      let badLeadRef = 0; let badRevRef = 0; let badTaskIds = 0;
      let newCount = 0; let noLeadCount = 0;
      const revIds = new Set(revenues.filter(r => r && r.id).map(r => r.id));
      const manualIds = new Set();
      const tasksData = this.getDailyActionTasksData();
      (tasksData.manualTasks || []).forEach(t => { if (t && t.id) manualIds.add(t.id); });
      (tasksData.states || []).forEach(s => { if (s && s.taskId) manualIds.add(s.taskId); });

      intakes.forEach(item => {
        if (!item || typeof item !== 'object') return;
        if (!item.id) noId++;
        if (!(item.customerName || '').trim()) noName++;
        if (item.status && !VALID_INTAKE_STATUS.includes(item.status)) badStatus++;
        if (item.status === 'new') newCount++;
        if (!item.relatedLeadId && item.status !== 'archived' && item.status !== 'done') noLeadCount++;
        if (item.relatedLeadId && !leadIds.has(item.relatedLeadId)) badLeadRef++;
        if (item.relatedRevenueId && !revIds.has(item.relatedRevenueId)) badRevRef++;
        if (item.relatedTaskIds != null && !Array.isArray(item.relatedTaskIds)) {
          badTaskIds++;
        } else if (Array.isArray(item.relatedTaskIds)) {
          item.relatedTaskIds.forEach(tid => {
            if (tid && !manualIds.has(tid)) badTaskIds++;
          });
        }
      });

      if (noId) add('review', `IDなしの受付 ${noId}件`);
      if (noName) add('review', `お客様名なしの受付 ${noName}件`);
      if (badStatus) add('caution', `受付statusが想定外 ${badStatus}件`);
      if (badLeadRef) add('review', `存在しない営業先を指すrelatedLeadId ${badLeadRef}件`);
      if (badRevRef) add('review', `存在しない売上を指すrelatedRevenueId ${badRevRef}件`);
      if (badTaskIds) add('review', `relatedTaskIdsの形式不正または参照切れ ${badTaskIds}件`);
      if (newCount) add('ok', `新規受付 ${newCount}件`);
      if (noLeadCount) add('caution', `営業先未作成の受付 ${noLeadCount}件`);
    } else {
      add('ok', '受付データ 0件');
    }

    const workOrderRaw = this._readRawKey(this.KEYS.WORK_ORDERS);
    let workOrders = [];
    const VALID_WO_STATUS = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.STATUSES
      : ['tentative', 'confirmed', 'completed', 'cancelled', 'archived'];
    const revIdsForWo = new Set(revenues.filter(r => r && r.id).map(r => r.id));
    if (!workOrderRaw.parseOk) {
      add('critical', '作業予定データ（budil_work_orders）を読み込めません');
    } else if (workOrderRaw.exists) {
      workOrders = Array.isArray(workOrderRaw.parsed) ? workOrderRaw.parsed : [];
      if (!Array.isArray(workOrderRaw.parsed)) add('review', '作業予定データが配列ではありません');
      counts.workOrders = workOrders.length;
      add('ok', `作業予定 ${counts.workOrders}件`);

      let noId = 0; let noName = 0; let badDate = 0;
      let badStart = 0; let badEnd = 0; let badStatus = 0;
      let badLeadRef = 0; let badIntakeRef = 0; let badRevRef = 0;
      let completedNoRev = 0; let overdue = 0; let noAddress = 0; let unknownArea = 0;

      workOrders.forEach(item => {
        if (!item || typeof item !== 'object') return;
        if (!item.id) noId++;
        if (!(item.customerName || '').trim()) noName++;
        if (item.scheduledDate && !this.isValidDateStr(item.scheduledDate)) badDate++;
        if (item.startTime && typeof WorkOrderBrain !== 'undefined' && !WorkOrderBrain.isValidTime(item.startTime)) badStart++;
        if (item.endTime && typeof WorkOrderBrain !== 'undefined' && !WorkOrderBrain.isValidTime(item.endTime)) badEnd++;
        if (item.status && !VALID_WO_STATUS.includes(item.status)) badStatus++;
        if (item.leadId && !leadIds.has(item.leadId)) badLeadRef++;
        if (item.intakeId && !intakes.some(i => i && i.id === item.intakeId)) badIntakeRef++;
        if (item.actualRevenueId && !revIdsForWo.has(item.actualRevenueId)) badRevRef++;
        if (item.status === 'completed' && !item.actualRevenueId) completedNoRev++;
        if (['tentative', 'confirmed'].includes(item.status) && item.scheduledDate && item.scheduledDate < todayDiag) overdue++;
        if (['tentative', 'confirmed'].includes(item.status) && !(item.address || '').trim()) noAddress++;
        if (typeof MapBrain !== 'undefined' && (item.address || '').trim()) {
          const area = item.area || MapBrain.detectAreaFromAddress(item.address);
          if (area === '不明') unknownArea++;
        }
      });

      if (noId) add('review', `IDなしの作業予定 ${noId}件`);
      if (noName) add('review', `お客様名なしの作業予定 ${noName}件`);
      if (badDate) add('review', `scheduledDate形式不正 ${badDate}件`);
      if (badStart) add('review', `startTime不正 ${badStart}件`);
      if (badEnd) add('review', `endTime不正 ${badEnd}件`);
      if (badStatus) add('caution', `作業予定statusが想定外 ${badStatus}件`);
      if (badLeadRef) add('review', `存在しない営業先を指すleadId ${badLeadRef}件`);
      if (badIntakeRef) add('review', `存在しない受付を指すintakeId ${badIntakeRef}件`);
      if (badRevRef) add('review', `存在しない売上を指すactualRevenueId ${badRevRef}件`);
      if (completedNoRev) add('caution', `作業日経過・売上未確定 ${completedNoRev}件`);
      if (typeof WorkCompletionBrain !== 'undefined') {
        const wcDiag = WorkCompletionBrain.getDiagnosticsCounts(workOrders, revenues, todayDiag);
        if (wcDiag.completedNoRevenue) add('caution', `作業日経過・売上未確定 ${wcDiag.completedNoRevenue}件`);
        if (wcDiag.overdueActive) add('caution', `予定日が過ぎたが未完了の作業予定 ${wcDiag.overdueActive}件`);
        if (wcDiag.orphanConfirmed) add('caution', `売上確定済みだが作業予定に未紐付け ${wcDiag.orphanConfirmed}件`);
        if (wcDiag.unpaid) add('caution', `入金待ちの確定売上 ${wcDiag.unpaid}件`);
        if (wcDiag.cancelNoMemo) add('caution', `キャンセル状態だが理由なし ${wcDiag.cancelNoMemo}件`);
        if (wcDiag.pendingConfirmCount) add('caution', `売上確定待ち ${wcDiag.pendingConfirmCount}件`);
      }
      if (typeof CalendarCandidateBrain !== 'undefined') {
        const calDiag = CalendarCandidateBrain.getDiagnosticsCounts(workOrders);
        if (calDiag.calendarCandidateTotal) {
          add('ok', `カレンダー由来の作業予定候補 ${calDiag.calendarCandidateTotal}件`);
        }
        if (calDiag.pendingCount) add('caution', `作業予定未反映の候補 ${calDiag.pendingCount}件`);
        if (calDiag.withAmountNoRevenueCount) {
          add('caution', `予定金額あり・売上未確定の候補 ${calDiag.withAmountNoRevenueCount}件`);
        }
        if (calDiag.noDateCount) add('caution', `日付不明の予定候補 ${calDiag.noDateCount}件`);
        if (calDiag.duplicateSuspectCount) add('caution', `重複疑いの予定候補 ${calDiag.duplicateSuspectCount}件`);
      }
      if (overdue) add('caution', `予定日超過で未完了 ${overdue}件`);
      if (noAddress) add('caution', `住所未入力の作業予定 ${noAddress}件`);
      if (unknownArea) add('caution', `エリア不明の作業予定 ${unknownArea}件`);
    } else {
      add('ok', '作業予定 0件');
    }

    if (typeof FollowUpBrain !== 'undefined') {
      try {
        const fuDiag = FollowUpBrain.getDiagnosticsCounts(workOrders, revenues, leads, todayDiag);
        if (fuDiag.thanksPending) add('caution', `売上確定済み・お礼未送信 ${fuDiag.thanksPending}件`);
        if (fuDiag.reviewPending) add('caution', `売上確定済み・口コミ依頼未送信 ${fuDiag.reviewPending}件`);
        if (fuDiag.maintNear) add('caution', `次回メンテナンス日が近い ${fuDiag.maintNear}件`);
        if (fuDiag.badFollowUp) add('caution', `followUp形式不正 ${fuDiag.badFollowUp}件`);
      } catch (e) {
        add('review', `フォロー診断の実行に失敗: ${e.message || e}`);
      }
    }

    const expenseRaw = this._readRawKey(this.KEYS.EXPENSE_RECORDS);
    let expenses = [];
    if (!expenseRaw.parseOk) {
      add('critical', '支出データ（budil_expense_records）を読み込めません');
    } else if (expenseRaw.exists) {
      expenses = Array.isArray(expenseRaw.parsed) ? expenseRaw.parsed : [];
      if (!Array.isArray(expenseRaw.parsed)) add('review', '支出データが配列ではありません');
      counts.expenseRecords = expenses.length;
      add('ok', `支出 ${counts.expenseRecords}件`);

      if (typeof ProfitBrain !== 'undefined') {
        const expDiag = ProfitBrain.getDiagnosticsCounts(expenses, revenues, workOrders, leads);
        if (expDiag.noId) add('review', `IDなしの支出 ${expDiag.noId}件`);
        if (expDiag.noDate) add('caution', `日付なしの支出 ${expDiag.noDate}件`);
        if (expDiag.badAmount) add('review', `支出金額が数値でない ${expDiag.badAmount}件`);
        if (expDiag.noCategory) add('caution', `カテゴリなしの支出 ${expDiag.noCategory}件`);
        if (expDiag.badRevRef) add('review', `存在しない売上を指すrelatedRevenueId ${expDiag.badRevRef}件`);
        if (expDiag.badWoRef) add('review', `存在しない作業予定を指すrelatedWorkOrderId ${expDiag.badWoRef}件`);
        if (expDiag.badLeadRef) add('review', `存在しない営業先を指すrelatedLeadId ${expDiag.badLeadRef}件`);
        if (expDiag.unlinked) add('caution', `未紐付け支出 ${expDiag.unlinked}件`);
      }
    } else {
      add('ok', '支出 0件');
    }

    const analyticsRaw = this._readRawKey(this.KEYS.ANALYTICS_RECORDS);
    let analyticsRecords = [];
    if (!analyticsRaw.parseOk) {
      add('critical', 'アナリティクスデータ（budil_analytics_records）を読み込めません');
    } else if (analyticsRaw.exists) {
      analyticsRecords = Array.isArray(analyticsRaw.parsed) ? analyticsRaw.parsed : [];
      if (!Array.isArray(analyticsRaw.parsed)) add('review', 'アナリティクスデータが配列ではありません');
      counts.analyticsRecords = analyticsRecords.length;
      add('ok', `アナリティクス ${counts.analyticsRecords}件`);

      if (typeof AnalyticsBrain !== 'undefined') {
        const aDiag = AnalyticsBrain.getDiagnosticsCounts(analyticsRecords);
        if (aDiag.noId) add('review', `IDなしのアナリティクス ${aDiag.noId}件`);
        if (aDiag.noDate) add('caution', `日付なしのアナリティクス ${aDiag.noDate}件`);
        if (aDiag.noName) add('caution', `ページ名なしのアナリティクス ${aDiag.noName}件`);
        if (aDiag.noUrl) add('caution', `URLなしのアナリティクス ${aDiag.noUrl}件`);
        if (aDiag.badNumeric) add('review', `数値項目が数値でないアナリティクス ${aDiag.badNumeric}件`);
        if (aDiag.badBounce) add('caution', `直帰率が0〜100外 ${aDiag.badBounce}件`);
        if (aDiag.badScore) add('caution', `需要スコアが0〜100外 ${aDiag.badScore}件`);
        if (aDiag.badStatus) add('caution', `status想定外 ${aDiag.badStatus}件`);
        if (aDiag.highBounce) add('caution', `高直帰率ページ ${aDiag.highBounce}件`);
        if (aDiag.noCta) add('caution', `CTAなしページ ${aDiag.noCta}件`);
        if (aDiag.browserImport) add('ok', `外部レポート取り込み ${aDiag.browserImport}件`);
        if (aDiag.browserNoUrl) add('caution', `browser-bantou由来でURLなし ${aDiag.browserNoUrl}件`);
        if (aDiag.browserMissingNumeric) add('caution', `browser-bantou由来で数値欠落が多い ${aDiag.browserMissingNumeric}件`);
        if (aDiag.browserDuplicateCandidates) add('caution', `同日同URLの重複候補 ${aDiag.browserDuplicateCandidates}件`);
      }
    } else {
      add('ok', 'アナリティクス 0件');
    }

    const analyticsSnapshotRaw = this._readRawKey(this.KEYS.ANALYTICS_SNAPSHOTS);
    if (!analyticsSnapshotRaw.parseOk) {
      add('critical', 'アナリティクスKPI（budil_analytics_snapshots）を読み込めません');
    } else if (analyticsSnapshotRaw.exists) {
      const snapshots = Array.isArray(analyticsSnapshotRaw.parsed) ? analyticsSnapshotRaw.parsed : [];
      if (!Array.isArray(analyticsSnapshotRaw.parsed)) add('review', 'アナリティクスKPIが配列ではありません');
      counts.analyticsSnapshots = snapshots.length;
      add('ok', `アナリティクスKPI ${counts.analyticsSnapshots}件`);
    } else {
      add('ok', 'アナリティクスKPI 0件');
    }

    if (typeof MapBrain !== 'undefined') {
      const mapDiag = MapBrain.getDiagnosticsCounts(leads, intakes, revenues, workOrders);
      if (mapDiag.leadsNoAddress) add('caution', `住所未入力の営業先 ${mapDiag.leadsNoAddress}件`);
      if (mapDiag.intakesNoAddress) add('caution', `住所未入力の受付 ${mapDiag.intakesNoAddress}件`);
      if (mapDiag.leadsUnknownArea) add('caution', `エリア不明の営業先 ${mapDiag.leadsUnknownArea}件`);
      if (mapDiag.intakesUnknownArea) add('caution', `エリア不明の受付 ${mapDiag.intakesUnknownArea}件`);
      if (mapDiag.revenueNoAreaWithLead) {
        add('caution', `営業先紐付き売上で住所/エリアなし ${mapDiag.revenueNoAreaWithLead}件`);
      }
    }

    if (!levels.critical.length) {
      add('critical', '読み込みできないlocalStorageデータはありません');
    }

    settings.lastDiagnosticAt = ranAt;
    settings.lastDiagnosticCounts = { ...counts };
    this.saveSettings(settings);

    return {
      version: this.BUDIL_VERSION,
      ranAt,
      counts,
      usage,
      keyStatus,
      backupKeys,
      levels
    };
  },

  buildDiagnosticReportText(result) {
    if (!result) return '';
    const lines = [];
    lines.push('Budil データ診断レポート');
    lines.push('バージョン: ' + (result.version || this.BUDIL_VERSION));
    lines.push('診断日時: ' + (result.ranAt || '—'));
    lines.push('保存データ目安: ' + (result.usage && result.usage.label ? result.usage.label : '—'));
    lines.push('');
    lines.push('【件数】');
    const c = result.counts || {};
    lines.push(`営業先: ${c.leads ?? '—'}件`);
    lines.push(`売上: ${c.revenue ?? '—'}件`);
    lines.push(`請求書/見積書: ${c.documents ?? '—'}件`);
    lines.push(`月次実績: ${c.monthlyResults ?? '—'}件`);
    lines.push(`外部チェック: ${c.externalChecks ?? '—'}件`);
    lines.push(`入金待ち: ${c.receivablesPending ?? '—'}件`);
    lines.push(`linked済み: ${c.linkedCount ?? '—'}件`);
    lines.push(`linked切れ: ${c.linkedBroken ?? '—'}件`);
    lines.push(`今日やること: ${c.dailyTasks ?? '—'}件`);
    lines.push(`需要ピックアップ: ${c.pickups ?? '—'}件`);
    lines.push(`受付データ: ${c.receptionIntakes ?? '—'}件`);
    lines.push(`作業予定: ${c.workOrders ?? '—'}件`);
    lines.push(`支出: ${c.expenseRecords ?? '—'}件`);
    lines.push(`アナリティクス: ${c.analyticsRecords ?? '—'}件`);
    lines.push(`活動履歴: ${c.activityLogs ?? '—'}件`);
    lines.push(`成果入力済み: ${c.performanceEntered ?? '—'}件`);
    lines.push(`dailyChecks: ${c.dailyChecks ?? '—'}件`);
    lines.push(`候補状態: ${c.actionCandidateStates ?? '—'}件`);
    lines.push(`安全バックアップ: ${c.safetyBackups ?? '—'}件`);
    lines.push(`操作ログ: ${c.operationLogs ?? '—'}件`);
    lines.push('');
    lines.push('【localStorageキー】');
    (result.keyStatus || []).forEach(k => {
      lines.push(`${k.key}: ${k.exists ? (k.parseOk ? 'OK' : '読込エラー') : '未保存'}`);
    });
    lines.push('');
    ['ok', 'caution', 'review', 'critical'].forEach(level => {
      const label = { ok: '正常', caution: '注意', review: '要確認', critical: '重大' }[level];
      const items = (result.levels && result.levels[level]) || [];
      if (!items.length) return;
      lines.push(`【${label}】`);
      items.forEach(item => lines.push('・' + item));
      lines.push('');
    });
    return lines.join('\n').trim();
  },

  safeNormalizeDailyActionState() {
    const raw = localStorage.getItem(this.KEYS.DAILY_ACTION_TASKS);
    if (!raw) return { fixed: 0 };
    let data;
    try { data = JSON.parse(raw); } catch { return { fixed: 0, error: 'parse' }; }
    if (Array.isArray(data)) return { fixed: 0, legacy: true };
    if (!data || typeof data !== 'object') return { fixed: 0 };
    let fixed = 0;
    const store = { ...data };
    if (!Array.isArray(store.states)) { store.states = []; fixed++; }
    if (!Array.isArray(store.manualTasks)) { store.manualTasks = []; fixed++; }
    if (!store.dailyChecks || typeof store.dailyChecks !== 'object') {
      store.dailyChecks = {};
      fixed++;
    }
    if (fixed) this.saveDailyActionTasksData(store);
    return { fixed };
  },

  safeNormalizeLeads() {
    const leads = this.getLeads();
    if (!Array.isArray(leads)) return { fixed: 0 };
    let fixed = 0;
    const next = leads.map(l => {
      if (!l || typeof l !== 'object') return l;
      if (l.activityLogs != null && !Array.isArray(l.activityLogs)) {
        fixed++;
        return { ...l, activityLogs: [] };
      }
      return l;
    });
    if (fixed) this.saveLeads(next);
    return { fixed };
  },

  safeNormalizeDemandPickups() {
    const list = this.getDemandPickups();
    if (!Array.isArray(list)) return { fixed: 0 };
    let fixed = 0;
    const next = list.map(raw => {
      if (!raw || typeof raw !== 'object') return raw;
      const item = { ...raw };
      let changed = false;
      if (!item.generatedOutputs || typeof item.generatedOutputs !== 'object') {
        item.generatedOutputs = {};
        changed = true;
      }
      if (!Array.isArray(item.executionLogs)) { item.executionLogs = []; changed = true; }
      if (!Array.isArray(item.suggestedActions)) { item.suggestedActions = []; changed = true; }
      if (!Array.isArray(item.relatedServices)) { item.relatedServices = []; changed = true; }
      if (typeof DemandBrain !== 'undefined') {
        const exec = DemandBrain.normalizeExecutionStatus(item);
        DemandBrain.EXECUTION_TYPES.forEach(type => {
          if (!exec[type].metrics || typeof exec[type].metrics !== 'object') {
            exec[type].metrics = DemandBrain.normalizePerformanceMetrics(exec[type].metrics || {});
            changed = true;
          }
        });
        item.executionStatus = exec;
      } else if (!item.executionStatus || typeof item.executionStatus !== 'object') {
        item.executionStatus = {};
        changed = true;
      }
      if (changed) fixed++;
      return item;
    });
    if (fixed) this.saveDemandPickups(next);
    return { fixed };
  },

  normalizeBusinessProfile(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const parseList = val => {
      if (Array.isArray(val)) return val.map(s => String(s).trim()).filter(Boolean);
      if (!val) return [];
      return String(val).split(/[,、]/).map(s => s.trim()).filter(Boolean);
    };
    const businessName = (raw.businessName || '').trim();
    const area = (raw.area || '').trim();
    const industry = (raw.industry || '').trim();
    if (!businessName && !area && !industry) return null;
    return {
      businessName,
      area,
      industry,
      mainServices: parseList(raw.mainServices),
      mainChannels: parseList(raw.mainChannels),
      lineUrl: (raw.lineUrl || '').trim(),
      googleReviewUrl: (raw.googleReviewUrl || '').trim(),
      followUpMemo: (raw.followUpMemo || '').trim(),
      memo: (raw.memo || '').trim(),
      updatedAt: raw.updatedAt || new Date().toISOString()
    };
  },

  getBusinessProfile() {
    const settings = this.getSettings();
    return this.normalizeBusinessProfile(settings.businessProfile);
  },

  saveBusinessProfile(profile) {
    const settings = this.getSettings();
    const normalized = this.normalizeBusinessProfile({
      ...profile,
      updatedAt: new Date().toISOString()
    });
    settings.businessProfile = normalized;
    this.saveSettings(settings);
    return normalized;
  },

  formatBusinessProfileText(profile) {
    const p = this.normalizeBusinessProfile(profile);
    if (!p || !p.businessName) return '';
    const lines = [
      '事業プロフィール：',
      '事業名：' + p.businessName
    ];
    if (p.area) lines.push('地域：' + p.area);
    if (p.industry) lines.push('業種：' + p.industry);
    if (p.mainServices.length) lines.push('主力サービス：' + p.mainServices.join('、'));
    if (p.mainChannels.length) lines.push('主な集客経路：' + p.mainChannels.join('、'));
    if (p.lineUrl) lines.push('LINE URL：' + p.lineUrl);
    if (p.googleReviewUrl) lines.push('Google口コミURL：' + p.googleReviewUrl);
    if (p.followUpMemo) lines.push('フォロー文面メモ：' + p.followUpMemo);
    if (p.memo) lines.push('メモ：' + p.memo);
    return lines.join('\n');
  },

  isDemoOrTestFlag(item) {
    return !!(item && (item.isDemo === true || item.isTest === true || String(item.testRunId || '').trim()));
  },

  getOnboardingStatus() {
    const profile = this.getBusinessProfile();
    const monthlyTarget = Number(this.getRevenueSettings().monthlyTarget) || 0;
    const leads = this.getLeads().filter(l => !this.isDemoOrTestFlag(l));
    const revenues = this.getRevenueRecords().filter(r => !this.isDemoOrTestFlag(r));
    const pickups = this.getDemandPickups().filter(p => !this.isDemoOrTestFlag(p));
    const intakes = this.getReceptionIntakes().filter(i => !this.isDemoOrTestFlag(i));
    const store = this.getDailyActionTasksData();
    const manual = (store.manualTasks || []).filter(t => !this.isDemoOrTestFlag(t));
    const states = (store.states || []).filter(t => !this.isDemoOrTestFlag(t));
    const doneCount = manual.filter(t => t.status === 'done').length
      + states.filter(t => t.status === 'done').length;
    const settings = this.getSettings();
    const workOrders = this.getWorkOrders().filter(w => !this.isDemoOrTestFlag(w));
    const today = new Date().toISOString().slice(0, 10);
    return {
      businessProfile: !!(profile && profile.businessName),
      monthlyTarget: monthlyTarget > 0,
      leads: leads.length > 0,
      revenue: revenues.length > 0,
      calendarImport: workOrders.length > 0,
      revenueQueue: revenues.length > 0
        || workOrders.some(wo => (wo.scheduledDate || '') <= today),
      pickups: pickups.length >= 3,
      reception: intakes.length > 0,
      dailyTasks: manual.length + states.length > 0,
      taskCompleted: doneCount > 0,
      reportGenerated: !!settings.lastReportGeneratedAt
    };
  },

  hasDemoData() {
    const store = this.getDailyActionTasksData();
    const demoChecks = store.dailyChecks && Object.values(store.dailyChecks).some(c => c && c.isDemo === true);
    return this.getLeads().some(l => this.isDemoOrTestFlag(l))
      || this.getRevenueRecords().some(r => this.isDemoOrTestFlag(r))
      || this.getDemandPickups().some(p => this.isDemoOrTestFlag(p))
      || this.getReceptionIntakes().some(i => this.isDemoOrTestFlag(i))
      || this.getWorkOrders().some(w => this.isDemoOrTestFlag(w))
      || this.getExpenseRecords().some(e => this.isDemoOrTestFlag(e))
      || this.getAnalyticsRecords().some(a => this.isDemoOrTestFlag(a))
      || (store.manualTasks || []).some(t => this.isDemoOrTestFlag(t))
      || (store.states || []).some(t => this.isDemoOrTestFlag(t))
      || demoChecks;
  },

  createDemoData() {
    if (this.hasDemoData()) return { ok: false, error: 'exists' };
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = typeof DemandBrain !== 'undefined'
      ? DemandBrain._addDays(today, 1)
      : today;
    const now = new Date().toISOString();
    const demo = true;
    const flag = { isDemo: demo, isTest: demo, testRunId: 'demo-' + this.generateId() };

    const leadIds = [
      'demo_lead_' + this.generateId(),
      'demo_lead_' + this.generateId(),
      'demo_lead_' + this.generateId()
    ];
    const leadNames = ['デモ：南部マンション管理組合', 'デモ：読谷の飲食店', 'デモ：豊見城の個人宅'];
    const leadAddresses = [
      '沖縄県南城市玉城字某某',
      '沖縄県読谷村座喜味',
      '沖縄県沖縄市泡瀬'
    ];
    const leadAreas = ['南城市', '読谷村', '沖縄市'];
    const leads = this.getLeads();
    leadIds.forEach((id, i) => {
      leads.push({
        id,
        company: leadNames[i],
        address: leadAddresses[i],
        area: leadAreas[i],
        region: leadAddresses[i],
        ...flag,
        createdAt: now,
        salesStatus: i === 0 ? '成約' : (i === 1 ? '見積り・提案中' : '初回連絡済み'),
        status: i === 0 ? '成約' : '商談中',
        priority: i === 0 ? 'A' : 'B',
        service: i === 2 ? '洗濯機クリーニング' : 'エアコン完全分解',
        lastContact: today,
        lastContactAt: today,
        nextAction: i === 1 ? '見積り送付のフォロー' : 'お礼連絡',
        nextContact: tomorrow,
        nextActionDate: tomorrow,
        activityLogs: [{
          id: 'demo_activity_' + this.generateId(),
          date: today,
          type: 'contact',
          title: 'デモ用の営業メモ',
          ...flag,
          createdAt: now
        }]
      });
    });
    this.saveLeads(leads);

    this.addRevenueRecord({
      ...flag,
      workDate: today.slice(0, 8) + '05',
      customerName: leadNames[0],
      service: 'エアコン通常',
      source: '直予約',
      amount: 12000,
      status: '完了',
      paymentStatus: '入金済み',
      leadId: leadIds[0],
      leadName: leadNames[0],
      memo: 'デモデータ（6月・直予約）'
    });
    this.addRevenueRecord({
      ...flag,
      workDate: today.slice(0, 8) + '12',
      customerName: leadNames[0],
      service: 'エアコン完全分解',
      source: '紹介',
      amount: 28000,
      status: '完了',
      paymentStatus: '入金済み',
      leadId: leadIds[0],
      leadName: leadNames[0],
      memo: 'デモデータ（6月・紹介）'
    });
    this.addRevenueRecord({
      ...flag,
      workDate: today.slice(0, 5) + '07-03',
      customerName: leadNames[2],
      service: '洗濯機クリーニング',
      source: 'LINE',
      amount: 18000,
      status: '確定',
      paymentStatus: '未入金',
      leadId: leadIds[2],
      leadName: leadNames[2],
      memo: 'デモデータ（7月・LINE）'
    });
    this.addRevenueRecord({
      ...flag,
      workDate: today.slice(0, 5) + '07-10',
      customerName: leadNames[1],
      service: '法人案件',
      source: '法人',
      amount: 45000,
      status: '完了',
      paymentStatus: '入金済み',
      leadId: leadIds[1],
      leadName: leadNames[1],
      memo: 'デモデータ（7月・法人）'
    });
    this.addRevenueRecord({
      ...flag,
      workDate: today,
      customerName: leadNames[1],
      service: 'エアコン通常',
      source: 'くらしのマーケット',
      amount: 15000,
      status: '確定',
      paymentStatus: '未入金',
      leadId: leadIds[1],
      leadName: leadNames[1],
      memo: 'デモデータ（今月・くらしのマーケット）'
    });

    const pickupTopics = [
      { topic: '湿気・カビ', score: 88, services: ['エアコン完全分解', '洗濯機クリーニング'] },
      { topic: '梅雨前のエアコン', score: 76, services: ['エアコン通常', 'お掃除機能付きエアコン'] },
      { topic: '法人定期清掃', score: 71, services: ['法人案件', 'キッチン'] }
    ];
    const pickups = this.getDemandPickups();
    const pickupIds = [];
    pickupTopics.forEach((item, i) => {
      const id = 'demo_pickup_' + this.generateId();
      pickupIds.push(id);
      const execBase = typeof DemandBrain !== 'undefined'
        ? DemandBrain.normalizeExecutionStatus({})
        : {};
      const pickup = {
        id,
        date: today,
        source: 'クロクロ',
        topic: item.topic,
        summary: `デモ用：${item.topic}の需要が高まっています。`,
        demandScore: item.score,
        relatedServices: item.services,
        suggestedActions: [
          { type: 'post', title: `${item.topic}の注意喚起リール`, channel: 'Instagram' },
          { type: 'sales', title: `${item.topic}の見込み客へLINE` },
          { type: 'ad', title: `${item.topic}LP広告を強化` }
        ],
        memo: 'デモデータ',
        status: 'open',
        ...flag,
        createdAt: now,
        updatedAt: now,
        executionStatus: execBase,
        executionLogs: [],
        generatedOutputs: {}
      };
      if (i === 0 && pickup.executionStatus) {
        pickup.executionStatus.reel = {
          ...pickup.executionStatus.reel,
          status: 'scheduled',
          scheduledDate: today,
          memo: 'デモ：リール投稿予定'
        };
        pickup.executionStatus.ad = {
          ...pickup.executionStatus.ad,
          status: 'scheduled',
          scheduledDate: tomorrow,
          memo: 'デモ：広告反映予定'
        };
        pickup.executionStatus.instagram = {
          ...pickup.executionStatus.instagram,
          status: 'posted',
          executedAt: today,
          resultMemo: 'デモ：LINE相談2件',
          metrics: {
            views: 1200,
            reactions: 45,
            clicks: 18,
            lineInquiries: 2,
            reservations: 1,
            salesAmount: 28000,
            updatedAt: now
          }
        };
      }
      pickups.unshift(pickup);
    });
    this.saveDemandPickups(pickups);

    const taskDefs = [
      { title: 'デモ：湿気・カビリールを投稿', priority: '高', status: 'open' },
      { title: 'デモ：見積りフォロー電話', priority: '中', status: 'open', leadId: leadIds[1], leadName: leadNames[1] },
      { title: 'デモ：週次レポートを確認', priority: '中', status: 'done' }
    ];
    taskDefs.forEach((task, i) => {
      this.addManualDailyTask({
        ...flag,
        id: 'demo_manual_' + this.generateId(),
        title: task.title,
        targetName: task.leadName || '—',
        priority: task.priority,
        action: task.title,
        memo: 'デモデータ',
        dueDate: today,
        status: task.status,
        reason: 'デモデータ',
        leadId: task.leadId || '',
        leadName: task.leadName || '',
        completedAt: task.status === 'done' ? now : '',
        pickupDedupeKey: ['demo-task', today, task.title].join('|')
      });
    });

    const store = this.getDailyActionTasksData();
    store.dailyChecks = store.dailyChecks || {};
    store.dailyChecks[today] = {
      checkedAt: now,
      memo: 'デモ：朝の確認完了',
      version: 'v3.3',
      isDemo: true
    };
    this.saveDailyActionTasksData(store);

    const intakeDefs = [
      {
        source: 'くらしのマーケット',
        customerName: 'デモ：山田様',
        phone: '090-0000-0000',
        address: '沖縄県南城市〇〇',
        area: '南城市',
        serviceText: 'お掃除機能付きエアコン1台、完全分解希望',
        preferredDatesText: '6/20午前、6/22午後',
        memo: '型番未確認。写真をLINEでもらう必要あり。',
        estimateAmount: 15000,
        handlingStatus: '日程調整中',
        status: 'new'
      },
      {
        source: 'LINE',
        customerName: 'デモ：佐藤様',
        phone: '080-1111-2222',
        address: '沖縄県八重瀬町',
        area: '八重瀬町',
        serviceText: '縦型洗濯機クリーニング',
        preferredDatesText: '来週平日午前',
        memo: 'デモ用受付データ',
        estimateAmount: 12000,
        handlingStatus: '見積確認中',
        status: 'new'
      }
    ];
    intakeDefs.forEach(def => {
      this.addReceptionIntake({ ...def, ...flag });
    });

    const tomorrowWo = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.addDays(today, 1)
      : today;
    const demoWorkDate = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.addDays(today, -2)
      : today;
    this.addWorkOrder({
      ...flag,
      customerName: 'デモ：山田様',
      phone: '090-0000-0000',
      address: '沖縄県南城市玉城字某某',
      area: '南城市',
      source: 'くらしのマーケット',
      serviceText: 'お掃除機能付きエアコン1台、完全分解',
      scheduledDate: demoWorkDate,
      startTime: '09:00',
      endTime: '11:00',
      status: 'completed',
      estimateAmount: 15000,
      completedAt: new Date(demoWorkDate + 'T12:00:00').toISOString(),
      actualRevenueId: '',
      memo: 'デモ：今日の作業完了・お礼未送信',
      followUp: {
        thanksStatus: 'pending',
        reviewStatus: 'pending',
        repeatStatus: 'pending',
        updatedAt: now
      }
    });
    const demoWo2 = this.addWorkOrder({
      ...flag,
      customerName: 'デモ：佐藤様',
      phone: '080-1111-2222',
      address: '沖縄県八重瀬町',
      area: '八重瀬町',
      source: 'LINE',
      serviceText: '縦型洗濯機クリーニング',
      scheduledDate: tomorrowWo,
      startTime: '10:00',
      endTime: '12:00',
      status: 'tentative',
      estimateAmount: 12000,
      memo: 'デモ：明日の作業予定'
    });

    const calDate = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.addDays(today, 3)
      : today;
    this.addWorkOrder({
      ...flag,
      customerName: 'デモ：カレンダー候補・田中様',
      address: '沖縄県南城市',
      area: '南城市',
      source: '直予約',
      serviceText: 'エアコンクリーニング',
      scheduledDate: calDate,
      startTime: '14:00',
      endTime: '16:00',
      status: 'tentative',
      estimateAmount: 9000,
      memo: 'デモ：カレンダー候補（未反映）',
      candidateMeta: {
        importSource: 'calendar-paste',
        sourceType: 'work-order-candidate',
        candidateStatus: '候補',
        confidence: '予定',
        estimatedAmount: '9000',
        confirmedRevenue: false,
        originalText: 'デモ用カレンダー候補',
        importedAt: now
      }
    });
    this.addWorkOrder({
      ...flag,
      customerName: 'デモ：カレンダー候補・要確認',
      address: '沖縄県豊見城市',
      area: '豊見城市',
      source: '紹介',
      serviceText: '完全分解',
      scheduledDate: calDate,
      startTime: '09:00',
      endTime: '12:00',
      status: 'tentative',
      estimateAmount: 28000,
      memo: 'デモ：金額・日付要確認',
      candidateMeta: {
        importSource: 'calendar-paste',
        sourceType: 'work-order-candidate',
        candidateStatus: '要確認',
        confidence: '要確認',
        estimatedAmount: '28000',
        confirmedRevenue: false,
        cautionNote: '金額仮',
        originalText: 'デモ用要確認候補',
        importedAt: now
      }
    });
    this.addWorkOrder({
      ...flag,
      customerName: 'デモ：カレンダー反映済み',
      address: '沖縄県読谷村',
      area: '読谷村',
      source: 'くらしのマーケット',
      serviceText: '洗濯機クリーニング',
      scheduledDate: tomorrowWo,
      startTime: '13:00',
      endTime: '15:00',
      status: 'confirmed',
      estimateAmount: 18000,
      memo: 'デモ：候補から作業予定に反映済み・売上確定待ち',
      candidateMeta: {
        importSource: 'calendar-paste',
        sourceType: 'work-order-candidate',
        candidateStatus: '作業予定に追加済み',
        confidence: '確定っぽい',
        estimatedAmount: '18000',
        confirmedRevenue: false,
        originalText: 'デモ用反映済み候補',
        importedAt: now
      }
    });

    const pastWoDate = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.addDays(today, -1)
      : today;
    this.addWorkOrder({
      ...flag,
      customerName: 'デモ：売上確定待ち・比嘉様',
      phone: '090-2222-3333',
      address: '沖縄県宜野湾市',
      area: '宜野湾市',
      source: '直予約',
      serviceText: 'エアコン通常クリーニング',
      scheduledDate: pastWoDate,
      startTime: '14:00',
      endTime: '16:00',
      status: 'confirmed',
      estimateAmount: 8500,
      memo: 'デモ：予定日過ぎ・売上確定待ち'
    });

    this.addWorkOrder({
      ...flag,
      customerName: 'デモ：キャンセル・新垣様',
      address: '沖縄県うるま市',
      area: 'うるま市',
      source: 'LINE',
      serviceText: 'レンジフードクリーニング',
      scheduledDate: pastWoDate,
      status: 'cancelled',
      estimateAmount: 12000,
      cancel: {
        reason: 'お客様都合で延期',
        canceledAt: today,
        proposeAgain: true,
        memo: 'デモ：再提案候補'
      },
      completion: {
        status: 'cancelled',
        needsReview: false,
        memo: 'デモ：キャンセル',
        updatedAt: now
      },
      memo: 'デモ：キャンセル予定'
    });

    const demoRevConfirmed = this.addRevenueRecord({
      ...flag,
      workDate: pastWoDate,
      customerName: 'デモ：売上確定済み・金城様',
      service: 'エアコン完全分解',
      source: 'くらしのマーケット',
      amount: 22000,
      status: '確定',
      paymentStatus: '入金済み',
      confirmedFrom: 'work-order',
      confirmedAt: now,
      isConfirmedRevenue: true,
      memo: 'デモ：売上確定済み',
      followUp: {
        thanksStatus: 'done',
        reviewStatus: 'pending',
        repeatStatus: 'planned',
        updatedAt: now
      }
    });

    const demoWoConfirmed = this.addWorkOrder({
      ...flag,
      customerName: 'デモ：売上確定済み・金城様',
      address: '沖縄県浦添市',
      area: '浦添市',
      source: 'くらしのマーケット',
      serviceText: 'エアコン完全分解',
      scheduledDate: pastWoDate,
      startTime: '09:00',
      endTime: '12:00',
      status: 'completed',
      estimateAmount: 22000,
      completedAt: new Date(pastWoDate + 'T12:00:00').toISOString(),
      actualRevenueId: demoRevConfirmed.id,
      completion: {
        status: 'completed',
        completedAt: new Date(pastWoDate + 'T12:00:00').toISOString(),
        revenueId: demoRevConfirmed.id,
        actualAmount: 22000,
        actualService: 'エアコン完全分解',
        paymentStatus: '入金済み',
        memo: 'デモ：確定済み',
        updatedAt: now
      },
      followUp: {
        thanksStatus: 'done',
        reviewStatus: 'pending',
        repeatStatus: 'planned',
        updatedAt: now
      },
      memo: 'デモ：売上確定済み'
    });
    this.updateRevenueRecord(demoRevConfirmed.id, { sourceWorkOrderId: demoWoConfirmed.id });

    const demoRevUnpaid = this.addRevenueRecord({
      ...flag,
      workDate: today,
      customerName: 'デモ：入金待ち・大城様',
      service: '洗濯機クリーニング',
      source: 'Airリザーブ',
      amount: 15000,
      status: '確定',
      paymentStatus: '未入金',
      sourceWorkOrderId: '',
      confirmedFrom: 'work-order',
      confirmedAt: now,
      isConfirmedRevenue: true,
      memo: 'デモ：入金待ち',
      followUp: {
        thanksStatus: 'pending',
        reviewStatus: 'pending',
        repeatStatus: 'pending',
        updatedAt: now
      }
    });

    const demoWoUnpaid = this.addWorkOrder({
      ...flag,
      customerName: 'デモ：入金待ち・大城様',
      address: '沖縄県那覇市',
      area: '那覇市',
      source: 'Airリザーブ',
      serviceText: '洗濯機クリーニング',
      scheduledDate: today,
      startTime: '10:00',
      endTime: '12:00',
      status: 'completed',
      estimateAmount: 15000,
      completedAt: now,
      actualRevenueId: demoRevUnpaid.id,
      completion: {
        status: 'completed',
        completedAt: now,
        revenueId: demoRevUnpaid.id,
        actualAmount: 15000,
        actualService: '洗濯機クリーニング',
        paymentStatus: '未入金',
        memo: 'デモ：入金待ち',
        updatedAt: now
      },
      memo: 'デモ：入金待ち'
    });
    this.updateRevenueRecord(demoRevUnpaid.id, { sourceWorkOrderId: demoWoUnpaid.id });

    const demoRevenues = this.getRevenueRecords();
    const demoWo1 = this.getWorkOrders().find(w => w.isDemo && w.customerName.includes('山田'));
    if (demoWo1 && demoRevenues[0]) {
      const rev0 = demoRevenues[0];
      this.updateRevenueRecord(rev0.id, {
        followUp: {
          thanksStatus: 'done',
          reviewStatus: 'done',
          repeatStatus: 'planned',
          reviewRequestedAt: now,
          nextMaintenanceDate: typeof WorkOrderBrain !== 'undefined'
            ? WorkOrderBrain.addDays(today, 365)
            : today,
          memo: 'デモ：口コミ依頼済み・リピート予定あり',
          updatedAt: now
        }
      });
    }

    const demoWo1Final = this.getWorkOrders().find(w => w.isDemo && w.customerName.includes('山田'));
    if (demoWo1Final) {
      this.updateWorkOrder(demoWo1Final.id, {
        followUp: {
          thanksStatus: 'pending',
          reviewStatus: 'pending',
          repeatStatus: 'pending',
          updatedAt: now
        }
      });
    }

    const repeatDate = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.addDays(today, 7)
      : today;
    const leadsAfter = this.getLeads();
    const demoLead = leadsAfter.find(l => l.isDemo && (l.company || '').includes('読谷'));
    if (demoLead) {
      this.updateLead(demoLead.id, {
        salesStatus: 'リピート候補',
        priority: 'B',
        nextAction: '次回メンテナンス確認',
        nextActionDate: repeatDate,
        nextContact: repeatDate
      });
    }

    const demoRevenuesAll = this.getRevenueRecords().filter(r => this.isDemoOrTestFlag(r));
    const demoWorkOrdersAll = this.getWorkOrders().filter(w => this.isDemoOrTestFlag(w));
    const demoRevGoogle = demoRevenuesAll.find(r => (r.source || '').includes('LINE'));
    const demoWoFar = demoWorkOrdersAll.find(w => (w.customerName || '').includes('佐藤'));

    this.addExpenseRecord({
      ...flag,
      date: today,
      category: '広告費',
      amount: 3000,
      vendor: 'Google広告',
      paymentMethod: 'カード',
      memo: '完全分解LP向け広告費',
      source: 'manual'
    });
    this.addExpenseRecord({
      ...flag,
      date: today,
      category: '薬剤・材料',
      amount: 1200,
      vendor: '薬剤店',
      paymentMethod: '現金',
      memo: 'エアコン洗浄剤',
      relatedRevenueId: demoRevenuesAll[0] ? demoRevenuesAll[0].id : '',
      source: 'manual'
    });
    this.addExpenseRecord({
      ...flag,
      date: today,
      category: '交通・燃料',
      amount: 800,
      vendor: 'ガソリンスタンド',
      paymentMethod: 'カード',
      memo: '南部移動',
      relatedWorkOrderId: demoWoFar ? demoWoFar.id : '',
      source: 'manual'
    });
    this.addExpenseRecord({
      ...flag,
      date: today,
      category: '手数料',
      amount: 2000,
      vendor: 'くらしのマーケット',
      paymentMethod: '振込',
      memo: 'くらしのマーケット手数料',
      relatedRevenueId: demoRevGoogle ? demoRevGoogle.id : '',
      source: 'manual'
    });
    this.addExpenseRecord({
      ...flag,
      date: today,
      category: '工具・部品',
      amount: 1500,
      vendor: 'ホームセンター',
      paymentMethod: 'カード',
      memo: 'ブラシ・部品',
      source: 'manual'
    });

    const demoAnalytics = [
      {
        pageName: '家庭向けエアコンLP',
        url: 'https://teruya1229.github.io/cursor-test/',
        pageType: '家庭LP',
        serviceTag: 'エアコンクリーニング',
        views: 120, activeUsers: 85, avgEngagementSeconds: 42, eventCount: 34,
        bounceRate: 52, ctaClicks: 6, lineClicks: 4, bookingClicks: 1, phoneClicks: 1,
        searchQueriesText: '沖縄 エアコンクリーニング, 南城市 エアコン掃除',
        sourceMemo: 'GA4ページ別データから手入力',
        memo: 'デモ：需要強い'
      },
      {
        pageName: '完全分解LP',
        url: 'https://example.com/kanzen/',
        pageType: '完全分解LP',
        serviceTag: '完全分解',
        views: 68, activeUsers: 45, avgEngagementSeconds: 78, eventCount: 22,
        bounceRate: 48, ctaClicks: 4, lineClicks: 2, bookingClicks: 0, phoneClicks: 1,
        searchQueriesText: 'エアコン 完全分解 沖縄',
        sourceMemo: 'GA4手入力',
        memo: 'デモ：伸ばす価値あり'
      },
      {
        pageName: 'FAQページ',
        url: 'https://example.com/faq/',
        pageType: 'FAQ',
        serviceTag: 'エアコンクリーニング',
        views: 18, activeUsers: 14, avgEngagementSeconds: 55, eventCount: 8,
        bounceRate: 38, ctaClicks: 1, lineClicks: 1, bookingClicks: 0, phoneClicks: 0,
        searchQueriesText: 'エアコン 臭い 原因',
        memo: 'デモ：不安解消ページとして良好'
      },
      {
        pageName: 'AI帳票番頭LP',
        url: 'https://example.com/ai-chohyo/',
        pageType: 'AI帳票番頭LP',
        serviceTag: 'AI帳票番頭',
        views: 42, activeUsers: 31, avgEngagementSeconds: 22, eventCount: 12,
        bounceRate: 68, ctaClicks: 1, lineClicks: 0, bookingClicks: 0, phoneClicks: 0,
        searchQueriesText: 'AI 帳票 自動化',
        memo: 'デモ：LP改善優先'
      },
      {
        pageName: '洗濯機クリーニング記事',
        url: 'https://example.com/blog/sentakuki/',
        pageType: '記事',
        serviceTag: '洗濯機クリーニング',
        views: 12, activeUsers: 9, avgEngagementSeconds: 48, eventCount: 3,
        bounceRate: 44, ctaClicks: 0, lineClicks: 0, bookingClicks: 0, phoneClicks: 0,
        searchQueriesText: '洗濯機 クリーニング 沖縄',
        memo: 'デモ：SNS/記事追加候補'
      }
    ];
    demoAnalytics.forEach(def => {
      this.addAnalyticsRecord({ ...def, ...flag, date: today, sourceMemo: def.sourceMemo || 'GA4手入力' });
    });

    return { ok: true, pickupIds, leadIds };
  },

  deleteDemoData() {
    const testManualIds = (this.getDailyActionTasksData().manualTasks || [])
      .filter(t => this.isTestDeletionTarget(t))
      .map(t => t.id);

    const protectedResults = [
      this.deleteTestRecordsByKey(this.KEYS.REVENUE_RECORDS, {
        reason: 'before_delete_demo_revenue',
        action: 'delete_demo_revenue'
      }),
      this.deleteDemoReceptionIntakes(),
      this.deleteDemoWorkOrders()
    ];
    const blocked = protectedResults.find(r => r && r.ok === false);
    if (blocked) {
      return { ok: false, error: blocked.error || 'protected_delete_blocked', results: protectedResults };
    }

    this.saveLeads(this.getLeads().filter(l => !this.isTestDeletionTarget(l)));
    this.saveDemandPickups(this.getDemandPickups().filter(p => !this.isTestDeletionTarget(p)));
    this.deleteDemoExpenseRecords();
    this.deleteDemoAnalyticsRecords();

    const store = this.getDailyActionTasksData();
    const beforeTaskCount = (store.manualTasks || []).length + (store.states || []).length;
    this.createSafetyBackup({
      reason: 'before_delete_demo_daily_tasks',
      targetKey: this.KEYS.DAILY_ACTION_TASKS,
      beforeCount: beforeTaskCount,
      data: store
    });
    store.manualTasks = (store.manualTasks || []).filter(t => !this.isTestDeletionTarget(t));
    store.states = (store.states || []).filter(s =>
      !this.isTestDeletionTarget(s) && !testManualIds.includes(s.taskId)
    );
    if (store.dailyChecks) {
      Object.keys(store.dailyChecks).forEach(date => {
        if (store.dailyChecks[date] && store.dailyChecks[date].isDemo === true) {
          delete store.dailyChecks[date];
        }
      });
    }
    this.saveDailyActionTasksData(store);
    this.recordOperationLog({
      action: 'delete_demo_data',
      targetKey: 'multiple',
      protectedResults,
      beforeDailyTaskCount: beforeTaskCount,
      afterDailyTaskCount: (store.manualTasks || []).length + (store.states || []).length
    });
    return { ok: true, results: protectedResults };
  },

  runSafeFormatCorrection() {
    const r1 = this.safeNormalizeDailyActionState();
    const r2 = this.safeNormalizeLeads();
    const r3 = this.safeNormalizeDemandPickups();
    return {
      dailyTasks: r1.fixed || 0,
      leads: r2.fixed || 0,
      pickups: r3.fixed || 0,
      total: (r1.fixed || 0) + (r2.fixed || 0) + (r3.fixed || 0)
    };
  }
};

Storage.migrate();
