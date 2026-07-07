/**
 * Budil v4.8.16 - データバックアップ・復元
 */
const DataBackup = {
  VERSION: '4.0',
  APP_VERSION: 'v4.11.15',

  PAYMENT_FIELDS: [
    'paymentMethod',
    'paymentStatus',
    'expectedPaymentDate',
    'paidDate',
    'paidAmount',
    'unpaidAmount',
    'paymentMemo'
  ],

  BACKUP_KEYS: [
    'budil_leads',
    'budil_followups',
    'budil_demandNotes',
    'budil_generatedPosts',
    'budil_generatedMessages',
    'budil_settings',
    'budil_daily_demand_logs',
    'budil_demand_radar',
    'budil_card_draft',
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

  exportPayload() {
    const data = {};
    const dataKeys = [];
    this.BACKUP_KEYS.forEach(key => {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        dataKeys.push(key);
        try {
          data[key] = JSON.parse(raw);
        } catch {
          data[key] = raw;
        }
      }
    });
    return {
      version: this.VERSION,
      backupVersion: this.APP_VERSION,
      appVersion: this.APP_VERSION,
      exportedAt: new Date().toISOString(),
      app: 'Budil',
      dataKeys,
      data
    };
  },

  validatePayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return { valid: false, error: 'JSONの形式が正しくありません' };
    }
    const data = payload.data || payload;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { valid: false, error: 'dataオブジェクトが見つかりません' };
    }
    const keys = Object.keys(data).filter(k => this.BACKUP_KEYS.includes(k));
    if (!keys.length) {
      return { valid: false, error: 'Budilのバックアップキーが含まれていません' };
    }
    return {
      valid: true,
      data,
      keys,
      exportedAt: payload.exportedAt || null,
      backupVersion: payload.backupVersion || payload.appVersion || null,
      appVersion: payload.appVersion || payload.backupVersion || null,
      dataKeys: payload.dataKeys || keys,
      integrity: this.getIntegritySummaryFromData(data)
    };
  },

  hasPaymentFields(record) {
    if (!record || typeof record !== 'object') return false;
    return this.PAYMENT_FIELDS.some(field => {
      const val = record[field];
      return val != null && val !== '';
    });
  },

  getIntegritySummaryFromData(data) {
    const src = data || {};
    const revenues = Array.isArray(src.budil_revenue_records) ? src.budil_revenue_records : [];
    const documents = Array.isArray(src.budil_documents) ? src.budil_documents : [];
    const safetyBackups = Array.isArray(src.budil_safety_backups) ? src.budil_safety_backups : [];
    const operationLogs = Array.isArray(src.budil_operation_logs) ? src.budil_operation_logs : [];
    const actionCandidateStates = src.budil_action_candidate_states && typeof src.budil_action_candidate_states === 'object'
      ? src.budil_action_candidate_states
      : {};
    const docIds = new Set(documents.filter(d => d && d.id).map(d => d.id));
    const revIds = new Set(revenues.filter(r => r && r.id).map(r => r.id));

    let linkedRevenueCount = 0;
    let linkedDocumentCount = 0;
    let linkedBrokenCount = 0;
    let revenueWithPaymentFields = 0;
    let revenueMissingPaymentFields = 0;
    let documentsWithPaymentFields = 0;
    let documentsMissingPaymentFields = 0;
    let documentsWithTaxSettings = 0;

    revenues.forEach(r => {
      if (!r || typeof r !== 'object') return;
      if (this.hasPaymentFields(r)) revenueWithPaymentFields++;
      else revenueMissingPaymentFields++;
      const linkedDocId = String(r.linkedDocumentId || '').trim();
      if (linkedDocId) {
        linkedRevenueCount++;
        if (!docIds.has(linkedDocId)) linkedBrokenCount++;
      }
    });

    documents.forEach(d => {
      if (!d || typeof d !== 'object') return;
      if (this.hasPaymentFields(d)) documentsWithPaymentFields++;
      else documentsMissingPaymentFields++;
      if (d.taxSettings || d.taxMode != null || d.taxRate != null) documentsWithTaxSettings++;
      const linkedRevId = String(d.linkedRevenueId || '').trim();
      if (linkedRevId) {
        linkedDocumentCount++;
        if (!revIds.has(linkedRevId)) linkedBrokenCount++;
      }
    });

    const invoiceCount = documents.filter(d => d && d.type === 'invoice').length;
    const estimateCount = documents.filter(d => d && d.type === 'estimate').length;

    return {
      dataKeys: Object.keys(src).filter(k => this.BACKUP_KEYS.includes(k)),
      revenueCount: revenues.length,
      documentCount: documents.length,
      invoiceCount,
      estimateCount,
      monthlyResults: Array.isArray(src.budil_monthly_results) ? src.budil_monthly_results.length : 0,
      externalCheck: Array.isArray(src.budil_external_check_reports) ? src.budil_external_check_reports.length : 0,
      actionCandidates: Array.isArray(src.budil_action_candidates) ? src.budil_action_candidates.length : 0,
      actionCandidateStates: Object.keys(actionCandidateStates).length,
      safetyBackups: safetyBackups.length,
      operationLogs: operationLogs.length,
      linkedRevenueCount,
      linkedDocumentCount,
      linkedCount: linkedRevenueCount + linkedDocumentCount,
      linkedBrokenCount,
      revenueWithPaymentFields,
      revenueMissingPaymentFields,
      documentsWithPaymentFields,
      documentsMissingPaymentFields,
      documentsWithTaxSettings
    };
  },

  inspectBackupData(data, label) {
    const summary = this.getIntegritySummaryFromData(data);
    console.info('[Budil Backup]', label || 'inspect', summary);
    return summary;
  },

  inspectCurrentData(label) {
    const data = {};
    this.BACKUP_KEYS.forEach(key => {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        try {
          data[key] = JSON.parse(raw);
        } catch {
          data[key] = raw;
        }
      }
    });
    return this.inspectBackupData(data, label || 'current');
  },

  buildIntegritySummaryLines(integrity) {
    const s = integrity || {};
    return [
      '売上 ' + (s.revenueCount || 0) + '件',
      '請求書/見積書 ' + (s.documentCount || 0) + '件（請求' + (s.invoiceCount || 0) + ' / 見積' + (s.estimateCount || 0) + '）',
      '月次実績 ' + (s.monthlyResults || 0) + '件',
      '外部チェック ' + (s.externalCheck || 0) + '件',
      '改善リスト ' + (s.actionCandidates || 0) + '件',
      '候補状態 ' + (s.actionCandidateStates || 0) + '件',
      '安全バックアップ ' + (s.safetyBackups || 0) + '件',
      '操作ログ ' + (s.operationLogs || 0) + '件',
      'linked ID あり ' + (s.linkedCount || 0) + '件',
      'linked切れ ' + (s.linkedBrokenCount || 0) + '件',
      'payment fields あり（売上 ' + (s.revenueWithPaymentFields || 0) + ' / 請求書 ' + (s.documentsWithPaymentFields || 0) + '）',
      'taxSettings あり ' + (s.documentsWithTaxSettings || 0) + '件'
    ];
  },

  getSummaryFromData(data) {
    const leads = Array.isArray(data.budil_leads) ? data.budil_leads.length : 0;
    const followups = Array.isArray(data.budil_followups) ? data.budil_followups.length : 0;
    const demandLogs = data.budil_daily_demand_logs && typeof data.budil_daily_demand_logs === 'object'
      ? Object.keys(data.budil_daily_demand_logs).length : 0;
    const radarKw = data.budil_demand_radar && data.budil_demand_radar.watchedKeywords
      ? data.budil_demand_radar.watchedKeywords.length : 0;
    const messages = data.budil_generatedMessages && typeof data.budil_generatedMessages === 'object'
      ? Object.keys(data.budil_generatedMessages).length : 0;
    const hasPosts = !!(data.budil_generatedPosts);
    const hasCardDraft = !!(data.budil_card_draft);
    const hasDemandNotes = !!(data.budil_demandNotes);
    const hasSettings = !!(data.budil_settings);
    const revenueRecords = Array.isArray(data.budil_revenue_records) ? data.budil_revenue_records.length : 0;
    const hasRevenueSettings = !!(data.budil_revenue_settings);
    const dailyTasks = data.budil_daily_action_tasks;
    let dailyTaskStates = 0;
    let manualTasks = 0;
    if (Array.isArray(dailyTasks)) {
      dailyTaskStates = dailyTasks.length;
    } else if (dailyTasks && typeof dailyTasks === 'object') {
      dailyTaskStates = Array.isArray(dailyTasks.states) ? dailyTasks.states.length : 0;
      manualTasks = Array.isArray(dailyTasks.manualTasks) ? dailyTasks.manualTasks.length : 0;
    }

    const demandPickups = Array.isArray(data.budil_demand_pickups) ? data.budil_demand_pickups.length : 0;
    const receptionIntakes = Array.isArray(data.budil_reception_intakes) ? data.budil_reception_intakes.length : 0;
    const workOrders = Array.isArray(data.budil_work_orders) ? data.budil_work_orders.length : 0;
    const expenseRecords = Array.isArray(data.budil_expense_records) ? data.budil_expense_records.length : 0;
    const analyticsRecords = Array.isArray(data.budil_analytics_records) ? data.budil_analytics_records.length : 0;
    const monthlyResults = Array.isArray(data.budil_monthly_results) ? data.budil_monthly_results.length : 0;
    const documents = Array.isArray(data.budil_documents) ? data.budil_documents.length : 0;
    const externalCheck = Array.isArray(data.budil_external_check_reports) ? data.budil_external_check_reports.length : 0;
    const actionCandidates = Array.isArray(data.budil_action_candidates) ? data.budil_action_candidates.length : 0;
    const actionCandidateStates = data.budil_action_candidate_states && typeof data.budil_action_candidate_states === 'object'
      ? Object.keys(data.budil_action_candidate_states).length : 0;
    const safetyBackups = Array.isArray(data.budil_safety_backups) ? data.budil_safety_backups.length : 0;
    const operationLogs = Array.isArray(data.budil_operation_logs) ? data.budil_operation_logs.length : 0;
    const integrity = this.getIntegritySummaryFromData(data);

    return {
      leads, followups, demandLogs, radarKw, messages, hasPosts, hasCardDraft,
      hasDemandNotes, hasSettings, revenueRecords, hasRevenueSettings,
      dailyTaskStates, manualTasks, demandPickups, receptionIntakes, workOrders, expenseRecords, analyticsRecords,
      monthlyResults, documents, externalCheck, actionCandidates, actionCandidateStates, safetyBackups, operationLogs, integrity
    };
  },

  getCurrentSummary() {
    const data = {};
    this.BACKUP_KEYS.forEach(key => {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        try { data[key] = JSON.parse(raw); } catch { /* skip */ }
      }
    });
    return this.getSummaryFromData(data);
  },

  importData(data, keys) {
    const importKeys = keys || this.BACKUP_KEYS.filter(k => data[k] !== undefined);
    importKeys.forEach(key => {
      if (data[key] !== undefined) {
        localStorage.setItem(key, JSON.stringify(data[key]));
      }
    });
  },

  clearAllData() {
    this.BACKUP_KEYS.forEach(key => localStorage.removeItem(key));
  },

  filename() {
    const d = new Date().toISOString().slice(0, 10);
    return 'budil-backup-' + d + '.json';
  },

  recordBackupTime() {
    const settings = Storage.getSettings();
    settings.lastBackupAt = new Date().toISOString();
    Storage.saveSettings(settings);
    return settings.lastBackupAt;
  },

  formatBackupDate(iso) {
    if (!iso) return '未バックアップ';
    try {
      const d = new Date(iso);
      return d.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  }
};
