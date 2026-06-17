/**
 * Budil - localStorage 管理
 * キー: leads, demandNotes, generatedPosts, generatedMessages, followups, settings
 */
const Storage = {
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
    DAILY_ACTION_TASKS: 'budil_daily_action_tasks'
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
    return this.get(this.KEYS.LEADS, []);
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
    return this.get(this.KEYS.REVENUE_RECORDS, []);
  },

  saveRevenueRecords(list) {
    this.set(this.KEYS.REVENUE_RECORDS, list);
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

  updateRevenueRecord(id, data) {
    const list = this.getRevenueRecords();
    const idx = list.findIndex(r => r.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...data, updatedAt: new Date().toISOString() };
      this.saveRevenueRecords(list);
    }
  },

  deleteRevenueRecord(id) {
    this.saveRevenueRecords(this.getRevenueRecords().filter(r => r.id !== id));
  },

  getDailyActionTasks() {
    return this.getDailyActionTasksData().states;
  },

  getDailyActionTasksData() {
    const raw = this.get(this.KEYS.DAILY_ACTION_TASKS, null);
    if (!raw) return { states: [], manualTasks: [] };
    if (Array.isArray(raw)) return { states: raw, manualTasks: [] };
    return {
      states: raw.states || [],
      manualTasks: raw.manualTasks || []
    };
  },

  saveDailyActionTasksData(data) {
    this.set(this.KEYS.DAILY_ACTION_TASKS, {
      states: data.states || [],
      manualTasks: data.manualTasks || []
    });
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
  }
};

Storage.migrate();
