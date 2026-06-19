/**
 * Budil v2.2 - データバックアップ・復元
 */
const DataBackup = {
  VERSION: '3.1',

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
    'budil_external_check_reports',
    'budil_action_candidates'
  ],

  exportPayload() {
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
    return {
      version: this.VERSION,
      exportedAt: new Date().toISOString(),
      app: 'Budil',
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
    return { valid: true, data, keys, exportedAt: payload.exportedAt || null };
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

    return {
      leads, followups, demandLogs, radarKw, messages, hasPosts, hasCardDraft,
      hasDemandNotes, hasSettings, revenueRecords, hasRevenueSettings,
      dailyTaskStates, manualTasks, demandPickups, receptionIntakes, workOrders, expenseRecords, analyticsRecords
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
