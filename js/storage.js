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
    CARD_DRAFT: 'budil_card_draft'
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

  getSettings() {
    return this.get(this.KEYS.SETTINGS, {
      priority: '', postTheme: '', memo: '', aiPriorityEnabled: true
    });
  },

  saveSettings(data) {
    this.set(this.KEYS.SETTINGS, data);
  },

  getDemandNotes() {
    return this.get(this.KEYS.DEMAND_NOTES, {
      trends: '', ads: '', gsc: '', ga4: '', instagram: ''
    });
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
  }
};

Storage.migrate();
