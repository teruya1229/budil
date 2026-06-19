/**
 * Budil - 行動候補（外部チェック由来など）
 * やること候補として扱い、売上確定にはしない。
 */
const ActionBrain = {
  SOURCE_EXTERNAL_CHECK: 'external-check',
  STATUS_TODO: 'todo',
  STATUS_DONE: 'done',

  normalizeCandidate(raw) {
    const item = raw && typeof raw === 'object' ? raw : {};
    const title = String(item.title || '').trim();
    const sourceReportId = String(item.sourceReportId || '').trim();
    return {
      id: item.id || '',
      createdAt: item.createdAt || '',
      source: item.source || this.SOURCE_EXTERNAL_CHECK,
      sourceReportId,
      title,
      status: item.status === this.STATUS_DONE ? this.STATUS_DONE : this.STATUS_TODO,
      memo: String(item.memo || '').trim(),
      doneAt: item.doneAt || null,
      dedupeKey: item.dedupeKey || this.makeDedupeKey(sourceReportId, title)
    };
  },

  makeDedupeKey(sourceReportId, title) {
    return [this.SOURCE_EXTERNAL_CHECK, sourceReportId, title].join('|');
  },

  makeDailyTaskDedupeKey(sourceReportId, title) {
    return `external-check|${sourceReportId}|${title}`;
  },

  findByDedupeKey(candidates, dedupeKey) {
    const list = Array.isArray(candidates) ? candidates : [];
    return list.find(c => c.dedupeKey === dedupeKey) || null;
  },

  getCandidateState(candidates, sourceReportId, title) {
    const found = this.findByDedupeKey(candidates, this.makeDedupeKey(sourceReportId, title));
    if (!found) return 'none';
    return found.status === this.STATUS_DONE ? 'done' : 'added';
  },

  getTodoCandidates(candidates) {
    return (Array.isArray(candidates) ? candidates : [])
      .map(c => this.normalizeCandidate(c))
      .filter(c => c.status === this.STATUS_TODO);
  },

  getDoneCandidates(candidates) {
    return (Array.isArray(candidates) ? candidates : [])
      .map(c => this.normalizeCandidate(c))
      .filter(c => c.status === this.STATUS_DONE);
  },

  getByReportId(candidates, reportId) {
    return (Array.isArray(candidates) ? candidates : [])
      .map(c => this.normalizeCandidate(c))
      .filter(c => c.sourceReportId === reportId);
  },

  countTodo(candidates) {
    return this.getTodoCandidates(candidates).length;
  },

  topTodo(candidates, limit) {
    return this.getTodoCandidates(candidates).slice(0, limit || 3);
  },

  isOrphanedSource(sourceReportId, reports) {
    const id = String(sourceReportId || '').trim();
    if (!id) return true;
    const list = Array.isArray(reports) ? reports : [];
    return !list.some(r => r && r.id === id);
  },

  createFromExternalCheck(sourceReportId, title) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const createdAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    return this.normalizeCandidate({
      id: 'actcand-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      createdAt,
      source: this.SOURCE_EXTERNAL_CHECK,
      sourceReportId,
      title,
      status: this.STATUS_TODO,
      memo: '外部チェック由来の行動候補（売上確定ではありません）',
      doneAt: null
    });
  },

  formatCreatedAt(iso) {
    if (!iso) return '—';
    return iso.slice(0, 16).replace('T', ' ');
  }
};
