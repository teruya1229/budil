/**
 * Budil v4.8.12 - 売上集計（月別・年別・依頼元別・サービス別）
 * 集計対象は budil_revenue_records の確定売上（確定・完了）のみ。
 * 作業予定の見込み・受付候補・未確定予定は混ぜない。
 */
const RevenueSummaryBrain = {
  UNKNOWN_DATE_KEY: 'unknown',
  UNKNOWN_SOURCE: '不明',
  UNKNOWN_SERVICE: '不明',
  CONFIRMED_STATUSES: ['確定', '完了'],

  SOURCE_ALIASES: {
    'LP': 'LP',
    'ホームページ': 'LP',
    'Google': 'LP',
    'Google広告': 'LP',
    'Googleビジネスプロフィール': 'LP',
    '110': '110番',
    '110番': '110番',
    'くらし': 'くらしのマーケット',
    'くらしのマーケット': 'くらしのマーケット',
    'ヤマダ': 'ヤマダ',
    'コープ': 'コープ',
    'LINE': 'その他',
    'Airリザーブ': 'その他',
    '直受け': 'その他',
    '直予約': 'その他',
    '紹介': 'その他',
    '法人': 'その他'
  },

  SERVICE_ALIASES: {
    '完全分解': 'エアコン完全分解',
    'エアコン完全分解': 'エアコン完全分解',
    'お掃除機能付き': 'お掃除機能付きエアコン',
    '洗濯機': '洗濯機クリーニング',
    '業務用エアコン': '法人案件',
    'ハウスクリーニング': 'その他',
    'レンジフード': 'レンジフード',
    'キッチン': 'キッチン',
    '浴室': '浴室'
  },

  formatYen(amount) {
    return RevenueBrain.formatYen(amount);
  },

  formatMonthLabel(monthKey) {
    if (!monthKey || monthKey === this.UNKNOWN_DATE_KEY) return '日付不明';
    const parts = monthKey.split('-');
    if (parts.length < 2) return monthKey;
    return `${parts[0]}年${parseInt(parts[1], 10)}月`;
  },

  formatYearLabel(yearKey) {
    if (!yearKey || yearKey === this.UNKNOWN_DATE_KEY) return '日付不明';
    return `${yearKey}年`;
  },

  normalizeRevenueRecord(record) {
    return RevenueBrain.normalizeRevenueRecord(record);
  },

  getRevenueDate(record) {
    if (!record) return null;
    const raw = record.workDate || record.revenueDate || record.date || '';
    const date = String(raw).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  },

  getMonthKey(record) {
    const date = this.getRevenueDate(record);
    return date ? date.slice(0, 7) : this.UNKNOWN_DATE_KEY;
  },

  getYearKey(record) {
    const date = this.getRevenueDate(record);
    return date ? date.slice(0, 4) : this.UNKNOWN_DATE_KEY;
  },

  getRevenueAmount(record) {
    if (!record || record.amount == null || record.amount === '') return null;
    const amt = Number(record.amount);
    return Number.isFinite(amt) && amt >= 0 ? amt : null;
  },

  isRevenueCandidateRecord(record) {
    if (!record) return false;
    if (record.isCandidate === true || record.isRevenueCandidate === true || record.revenueCandidate === true) {
      return true;
    }
    if (record.candidateStatus === 'revenue_candidate' || record.status === 'revenue_candidate') {
      return true;
    }
    return false;
  },

  isConfirmedRevenueRecord(record) {
    if (!record || typeof record !== 'object') return false;
    if (record.status === 'キャンセル') return false;
    if (this.isRevenueCandidateRecord(record)) return false;
    if (!this.CONFIRMED_STATUSES.includes(record.status)) return false;
    return this.getRevenueAmount(record) != null;
  },

  isPlannedRevenueRecord(record) {
    if (!record || record.status === 'キャンセル') return false;
    if (this.isRevenueCandidateRecord(record)) return true;
    if (record.status === '予定') return this.getRevenueAmount(record) != null;
    return false;
  },

  confirmedRecords(records) {
    return this.normalizeRevenueRecords(records).filter(r => this.isConfirmedRevenueRecord(r));
  },

  /** @deprecated 売上集計では confirmedRecords を使う */
  activeRecords(records) {
    return this.confirmedRecords(records);
  },

  getRevenueSource(record) {
    const raw = String(record.source || record.referralSource || '').trim();
    if (!raw) return this.UNKNOWN_SOURCE;
    if (this.SOURCE_ALIASES[raw]) return this.SOURCE_ALIASES[raw];
    if ((RevenueBrain.SOURCES || []).includes(raw)) return raw;
    return raw;
  },

  getRevenueService(record) {
    const raw = String(record.service || record.serviceText || record.menu || '').trim();
    if (!raw) return this.UNKNOWN_SERVICE;
    if (this.SERVICE_ALIASES[raw]) return this.SERVICE_ALIASES[raw];
    if ((RevenueBrain.SERVICES || []).includes(raw)) return raw;
    return raw;
  },

  normalizeRevenueRecords(records) {
    return RevenueBrain.normalizeRevenueRecords(records);
  },

  filterRecords(records, filter) {
    const f = filter || {};
    let list = this.confirmedRecords(records);
    if (f.year) {
      list = list.filter(r => this.getYearKey(r) === String(f.year));
    }
    if (f.month) {
      const monthKey = f.month.length === 7 ? f.month : `${f.year || ''}-${String(f.month).padStart(2, '0')}`;
      list = list.filter(r => this.getMonthKey(r) === monthKey);
    }
    if (f.source) {
      list = list.filter(r => this.getRevenueSource(r) === f.source);
    }
    if (f.service) {
      list = list.filter(r => this.getRevenueService(r) === f.service);
    }
    return list;
  },

  sumAmount(list) {
    return list.reduce((sum, r) => sum + (this.getRevenueAmount(r) || 0), 0);
  },

  avgAmount(total, count) {
    return count > 0 ? Math.round(total / count) : 0;
  },

  getJudgmentLabel(row, grandTotal, type) {
    const count = row.count || 0;
    const total = row.total || 0;
    const avg = row.avg || this.avgAmount(total, count);
    const share = grandTotal > 0 ? total / grandTotal : 0;
    const labels = [];
    if (share >= 0.25 && count >= 3) labels.push('主力');
    if (share >= 0.1 && share < 0.25 && count >= 2) labels.push('伸ばす価値あり');
    if (count <= 2 && total > 0) labels.push('件数少なめ');
    if (avg >= 25000 && count >= 1) labels.push('単価高め');
    if (type === 'source' && row.name === this.UNKNOWN_SOURCE) labels.push('要確認');
    if (type === 'service' && row.name === this.UNKNOWN_SERVICE) labels.push('要確認');
    if (!labels.length) labels.push('継続');
    return labels.slice(0, 2).join('・');
  },

  buildDimensionSummary(records, getKeyFn, type) {
    const groups = {};
    records.forEach(r => {
      const amount = this.getRevenueAmount(r);
      if (amount == null) return;
      const key = getKeyFn(r);
      if (!groups[key]) groups[key] = { name: key, count: 0, total: 0 };
      groups[key].count += 1;
      groups[key].total += amount;
    });
    const grandTotal = Object.values(groups).reduce((s, g) => s + g.total, 0);
    return Object.values(groups)
      .map(g => ({
        ...g,
        avg: this.avgAmount(g.total, g.count),
        share: grandTotal > 0 ? Math.round((g.total / grandTotal) * 100) : 0,
        judgment: this.getJudgmentLabel(g, grandTotal, type)
      }))
      .sort((a, b) => b.total - a.total);
  },

  buildMonthlySummary(records) {
    const groups = {};
    records.forEach(r => {
      const amount = this.getRevenueAmount(r);
      if (amount == null) return;
      const key = this.getMonthKey(r);
      if (!groups[key]) groups[key] = { monthKey: key, label: this.formatMonthLabel(key), count: 0, total: 0 };
      groups[key].count += 1;
      groups[key].total += amount;
    });
    return Object.values(groups)
      .map(g => ({ ...g, avg: this.avgAmount(g.total, g.count) }))
      .sort((a, b) => {
        if (a.monthKey === this.UNKNOWN_DATE_KEY) return 1;
        if (b.monthKey === this.UNKNOWN_DATE_KEY) return -1;
        return b.monthKey.localeCompare(a.monthKey);
      });
  },

  buildYearlySummary(records) {
    const groups = {};
    records.forEach(r => {
      const amount = this.getRevenueAmount(r);
      if (amount == null) return;
      const key = this.getYearKey(r);
      if (!groups[key]) groups[key] = { yearKey: key, label: this.formatYearLabel(key), count: 0, total: 0, months: new Set() };
      groups[key].count += 1;
      groups[key].total += amount;
      const mk = this.getMonthKey(r);
      if (mk !== this.UNKNOWN_DATE_KEY) groups[key].months.add(mk);
    });
    return Object.values(groups)
      .map(g => {
        const monthCount = g.months.size || 1;
        return {
          yearKey: g.yearKey,
          label: g.label,
          count: g.count,
          total: g.total,
          monthAvg: this.avgAmount(g.total, monthCount)
        };
      })
      .sort((a, b) => {
        if (a.yearKey === this.UNKNOWN_DATE_KEY) return 1;
        if (b.yearKey === this.UNKNOWN_DATE_KEY) return -1;
        return b.yearKey.localeCompare(a.yearKey);
      });
  },

  buildYearlySummaryWithResults(records, monthlyResults) {
    const yearKeys = new Set();
    this.confirmedRecords(records).forEach(r => {
      const yk = this.getYearKey(r);
      if (yk !== this.UNKNOWN_DATE_KEY) yearKeys.add(yk);
    });
    (monthlyResults || []).forEach(m => {
      const mk = typeof MonthlyResultsBrain !== 'undefined'
        ? MonthlyResultsBrain.normalizeMonth(m.month || m.id)
        : '';
      if (mk) yearKeys.add(mk.slice(0, 4));
    });
    return [...yearKeys]
      .sort((a, b) => {
        if (a === this.UNKNOWN_DATE_KEY) return 1;
        if (b === this.UNKNOWN_DATE_KEY) return -1;
        return b.localeCompare(a);
      })
      .map(yearKey => {
        const monthKeys = this.collectMonthKeysForYear(records, monthlyResults, yearKey);
        let total = 0;
        let detailCount = 0;
        monthKeys.forEach(mk => {
          const view = this.getMonthSalesView(mk, records, monthlyResults);
          total += view.displayTotal;
          detailCount += view.detailCount;
        });
        const monthCount = monthKeys.size || 1;
        return {
          yearKey,
          label: this.formatYearLabel(yearKey),
          count: detailCount,
          total,
          monthAvg: this.avgAmount(total, monthCount)
        };
      });
  },

  buildSourceSummary(records, filter) {
    const list = filter ? this.filterRecords(records, filter) : this.confirmedRecords(records);
    return this.buildDimensionSummary(list, r => this.getRevenueSource(r), 'source');
  },

  buildServiceSummary(records, filter) {
    const list = filter ? this.filterRecords(records, filter) : this.confirmedRecords(records);
    return this.buildDimensionSummary(list, r => this.getRevenueService(r), 'service');
  },

  buildMonthlySourceSummary(records) {
    const confirmed = this.confirmedRecords(records);
    const byMonth = {};
    confirmed.forEach(r => {
      const amount = this.getRevenueAmount(r);
      if (amount == null) return;
      const mk = this.getMonthKey(r);
      if (!byMonth[mk]) byMonth[mk] = [];
      byMonth[mk].push(r);
    });
    return Object.keys(byMonth)
      .sort((a, b) => {
        if (a === this.UNKNOWN_DATE_KEY) return 1;
        if (b === this.UNKNOWN_DATE_KEY) return -1;
        return b.localeCompare(a);
      })
      .map(mk => ({
        monthKey: mk,
        label: this.formatMonthLabel(mk),
        sources: this.buildSourceSummary(byMonth[mk])
      }));
  },

  buildMonthlyServiceSummary(records) {
    const confirmed = this.confirmedRecords(records);
    const byMonth = {};
    confirmed.forEach(r => {
      const amount = this.getRevenueAmount(r);
      if (amount == null) return;
      const mk = this.getMonthKey(r);
      if (!byMonth[mk]) byMonth[mk] = [];
      byMonth[mk].push(r);
    });
    return Object.keys(byMonth)
      .sort((a, b) => {
        if (a === this.UNKNOWN_DATE_KEY) return 1;
        if (b === this.UNKNOWN_DATE_KEY) return -1;
        return b.localeCompare(a);
      })
      .map(mk => ({
        monthKey: mk,
        label: this.formatMonthLabel(mk),
        services: this.buildServiceSummary(byMonth[mk])
      }));
  },

  buildYearlySourceSummary(records) {
    const confirmed = this.confirmedRecords(records);
    const byYear = {};
    confirmed.forEach(r => {
      const amount = this.getRevenueAmount(r);
      if (amount == null) return;
      const yk = this.getYearKey(r);
      if (!byYear[yk]) byYear[yk] = [];
      byYear[yk].push(r);
    });
    return Object.keys(byYear)
      .sort((a, b) => b.localeCompare(a))
      .map(yk => ({
        yearKey: yk,
        label: this.formatYearLabel(yk),
        sources: this.buildSourceSummary(byYear[yk])
      }));
  },

  buildYearlyServiceSummary(records) {
    const confirmed = this.confirmedRecords(records);
    const byYear = {};
    confirmed.forEach(r => {
      const amount = this.getRevenueAmount(r);
      if (amount == null) return;
      const yk = this.getYearKey(r);
      if (!byYear[yk]) byYear[yk] = [];
      byYear[yk].push(r);
    });
    return Object.keys(byYear)
      .sort((a, b) => b.localeCompare(a))
      .map(yk => ({
        yearKey: yk,
        label: this.formatYearLabel(yk),
        services: this.buildServiceSummary(byYear[yk])
      }));
  },

  shiftMonthKey(monthKey, delta) {
    if (!monthKey || monthKey === this.UNKNOWN_DATE_KEY) return null;
    const parts = monthKey.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  },

  getMonthSalesView(monthKey, records, monthlyResults) {
    const key = monthKey || '';
    const detail = typeof MonthlyResultsBrain !== 'undefined'
      ? MonthlyResultsBrain.sumDetailRevenueForMonth(records, key)
      : { total: this.sumAmount(this.confirmedRecords(records).filter(r => this.getMonthKey(r) === key)), count: 0 };
    const monthly = typeof MonthlyResultsBrain !== 'undefined'
      ? MonthlyResultsBrain.findForMonth(monthlyResults, key)
      : null;
    const hasMonthly = !!monthly;
    const hasDetail = detail.count > 0 || detail.total > 0;
    const monthlySales = hasMonthly ? monthly.sales : null;
    const status = typeof MonthlyResultsBrain !== 'undefined'
      ? MonthlyResultsBrain.classifyReconciliationStatus(monthlySales, detail.total, hasMonthly, hasDetail)
      : (hasDetail ? '明細のみ' : 'データなし');
    if (hasMonthly) {
      return {
        monthKey: key,
        displayTotal: monthly.sales,
        source: 'monthly-result',
        monthlySales: monthly.sales,
        detailTotal: detail.total,
        detailCount: detail.count,
        diff: monthly.sales - detail.total,
        status
      };
    }
    return {
      monthKey: key,
      displayTotal: detail.total,
      source: hasDetail ? 'detail' : 'none',
      monthlySales: null,
      detailTotal: detail.total,
      detailCount: detail.count,
      diff: 0,
      status
    };
  },

  collectMonthKeysForYear(records, monthlyResults, yearKey) {
    const keys = new Set();
    this.confirmedRecords(records).forEach(r => {
      const mk = this.getMonthKey(r);
      if (mk !== this.UNKNOWN_DATE_KEY && mk.startsWith(yearKey)) keys.add(mk);
    });
    (monthlyResults || []).forEach(m => {
      const mk = typeof MonthlyResultsBrain !== 'undefined'
        ? MonthlyResultsBrain.normalizeMonth(m.month || m.id)
        : String(m.month || '').slice(0, 7);
      if (mk && mk.startsWith(yearKey)) keys.add(mk);
    });
    return keys;
  },

  buildCompactSummary(records, today, monthlyResults) {
    const t = today || new Date().toISOString().slice(0, 10);
    const currentMonth = t.slice(0, 7);
    const currentYear = t.slice(0, 4);
    const prevMonth = this.shiftMonthKey(currentMonth, -1);
    const confirmed = this.confirmedRecords(records);

    const thisMonthView = this.getMonthSalesView(currentMonth, records, monthlyResults);
    const prevMonthView = prevMonth ? this.getMonthSalesView(prevMonth, records, monthlyResults) : null;
    const thisMonthRecords = confirmed.filter(r => this.getMonthKey(r) === currentMonth);
    const prevMonthRecords = prevMonth ? confirmed.filter(r => this.getMonthKey(r) === prevMonth) : [];
    const yearRecords = confirmed.filter(r => this.getYearKey(r) === currentYear);

    const thisMonthTotal = thisMonthView.displayTotal;
    const prevMonthTotal = prevMonthView ? prevMonthView.displayTotal : 0;
    const yearMonths = this.collectMonthKeysForYear(records, monthlyResults, currentYear);
    let yearTotal = 0;
    yearMonths.forEach(mk => {
      yearTotal += this.getMonthSalesView(mk, records, monthlyResults).displayTotal;
    });
    const yearMonthAvg = yearMonths.size > 0 ? Math.round(yearTotal / yearMonths.size) : 0;

    const topSources = this.buildSourceSummary(thisMonthRecords).slice(0, 3);
    const topServices = this.buildServiceSummary(thisMonthRecords).slice(0, 3);

    return {
      currentMonth,
      prevMonth,
      currentYear,
      thisMonthTotal,
      prevMonthTotal,
      monthDiff: thisMonthTotal - prevMonthTotal,
      yearTotal,
      yearMonthAvg,
      topSources,
      topServices,
      thisMonthCount: thisMonthRecords.length,
      prevMonthCount: prevMonthRecords.length,
      yearCount: yearRecords.length,
      thisMonthView,
      prevMonthView,
      usesMonthlyResultThisMonth: thisMonthView.source === 'monthly-result',
      monthlySourceNote: thisMonthView.source === 'monthly-result' && typeof MonthlyResultsBrain !== 'undefined'
        ? MonthlyResultsBrain.AGGREGATION_SOURCE_NOTE
        : ''
    };
  },

  buildMonthlySummaryWithResults(records, monthlyResults) {
    const monthKeys = new Set();
    this.confirmedRecords(records).forEach(r => {
      const mk = this.getMonthKey(r);
      if (mk !== this.UNKNOWN_DATE_KEY) monthKeys.add(mk);
    });
    (monthlyResults || []).forEach(m => {
      const mk = typeof MonthlyResultsBrain !== 'undefined'
        ? MonthlyResultsBrain.normalizeMonth(m.month || m.id)
        : '';
      if (mk) monthKeys.add(mk);
    });
    return [...monthKeys]
      .sort((a, b) => {
        if (a === this.UNKNOWN_DATE_KEY) return 1;
        if (b === this.UNKNOWN_DATE_KEY) return -1;
        return b.localeCompare(a);
      })
      .map(mk => {
        const view = this.getMonthSalesView(mk, records, monthlyResults);
        const count = view.source === 'monthly-result' ? view.detailCount : view.detailCount;
        return {
          monthKey: mk,
          label: this.formatMonthLabel(mk),
          count,
          total: view.displayTotal,
          avg: count > 0 ? this.avgAmount(view.detailTotal, count) : view.displayTotal,
          source: view.source,
          monthlySales: view.monthlySales,
          detailTotal: view.detailTotal,
          diff: view.diff,
          status: view.status
        };
      });
  },

  buildPeriodLabel(filter) {
    const f = filter || {};
    if (f.month) return this.formatMonthLabel(f.month.length === 7 ? f.month : `${f.year}-${String(f.month).padStart(2, '0')}`);
    if (f.year) return `${f.year}年`;
    return '全期間';
  },

  buildJudgmentText(compact, sources, services) {
    const parts = [];
    const topSrc = (sources || compact.topSources || [])[0];
    const topSvc = (services || compact.topServices || [])[0];
    if (topSrc) parts.push(`${topSrc.name}が強い`);
    if (topSvc) parts.push(`${topSvc.name}の件数が多い`);
    if (compact.monthDiff > 0) parts.push('先月比で増加');
    else if (compact.monthDiff < 0) parts.push('先月比で減少');
    return parts.length ? parts.join('、') + '。' : 'データを蓄積すると判断が出ます。';
  },

  buildCopyText(summary, filter) {
    const f = filter || {};
    const periodLabel = this.buildPeriodLabel(f);
    const records = summary.filteredRecords || [];
    const total = summary.periodTotal != null ? summary.periodTotal : this.sumAmount(records);
    const count = summary.periodCount != null ? summary.periodCount : records.length;
    const avg = this.avgAmount(total, count);
    const sources = summary.sources || this.buildSourceSummary(records);
    const services = summary.services || this.buildServiceSummary(records);
    const compact = summary.compact || {};

    const lines = [
      '【売上集計】（確定売上のみ）',
      `対象期間：${periodLabel}`,
      '',
      `売上合計：${this.formatYen(total)}`,
      `売上件数：${count}件`,
      `平均単価：${this.formatYen(avg)}`,
      '',
      '依頼元別：'
    ];
    sources.slice(0, 8).forEach(s => {
      lines.push(`・${s.name}：${this.formatYen(s.total)} / ${s.count}件`);
    });
    lines.push('', 'サービス別：');
    services.slice(0, 8).forEach(s => {
      lines.push(`・${s.name}：${this.formatYen(s.total)} / ${s.count}件`);
    });
    lines.push('', '判断：');
    lines.push(this.buildJudgmentText(compact, sources, services));
    return lines.join('\n');
  },

  getRevenueWarnings(records) {
    const list = this.normalizeRevenueRecords(records || []);
    let noDate = 0;
    let badAmount = 0;
    let unknownSource = 0;
    let unknownService = 0;
    let plannedCount = 0;
    let plannedTotal = 0;
    let candidateCount = 0;
    let noDateConfirmedCount = 0;
    let noDateConfirmedTotal = 0;

    list.forEach(r => {
      if (!r || r.status === 'キャンセル') return;
      if (this.isPlannedRevenueRecord(r)) {
        plannedCount += 1;
        plannedTotal += this.getRevenueAmount(r) || 0;
        if (this.isRevenueCandidateRecord(r)) candidateCount += 1;
        return;
      }
      if (!this.isConfirmedRevenueRecord(r)) {
        if (this.getRevenueAmount(r) == null) badAmount++;
        return;
      }
      if (!this.getRevenueDate(r)) {
        noDate += 1;
        noDateConfirmedCount += 1;
        noDateConfirmedTotal += this.getRevenueAmount(r) || 0;
      }
      if (this.getRevenueSource(r) === this.UNKNOWN_SOURCE) unknownSource++;
      if (this.getRevenueService(r) === this.UNKNOWN_SERVICE) unknownService++;
    });

    return {
      noDate, badAmount, unknownSource, unknownService,
      plannedCount, plannedTotal, candidateCount,
      noDateConfirmedCount, noDateConfirmedTotal
    };
  },

  normalizeScheduleWorkOrder(workOrder) {
    return typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.normalizeWorkOrder(workOrder)
      : (workOrder || {});
  },

  hasUpcomingScheduleExcludedWord(workOrder) {
    const wo = this.normalizeScheduleWorkOrder(workOrder);
    if (typeof CalendarCandidateBrain !== 'undefined') {
      return CalendarCandidateBrain.hasPastRecoveryExcludedWord(wo);
    }
    const text = [wo.customerName, wo.serviceText, wo.source, wo.memo].join(' ');
    return /キャンセル|取消|取り消し|中止|見積|見積もり|見積り|見積のみ|日程調整|調整中|仮予定|仮押さえ|未確定/.test(text);
  },

  isUpcomingRevenueScheduleWorkOrder(workOrder, today) {
    const wo = this.normalizeScheduleWorkOrder(workOrder);
    if (!wo || !wo.scheduledDate) return false;
    const t = today || new Date().toISOString().slice(0, 10);
    if (wo.scheduledDate < t) return false;
    if (wo.actualRevenueId) return false;
    if (wo.status === 'cancelled' || wo.status === 'archived' || wo.status === 'completed') return false;
    const meta = wo.candidateMeta;
    if (meta && meta.candidateStatus === 'スキップ') return false;
    const amt = Number(wo.estimateAmount || 0);
    if (!Number.isFinite(amt) || amt <= 0) return false;
    if (this.hasUpcomingScheduleExcludedWord(wo)) return false;
    return true;
  },

  getUpcomingScheduleStatusLabel(workOrder, today) {
    const wo = this.normalizeScheduleWorkOrder(workOrder);
    const t = today || new Date().toISOString().slice(0, 10);
    if (!wo.scheduledDate) return '予定';
    if (wo.scheduledDate === t) return '作業後に売上確定';
    const soonEnd = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.addDays(t, 3)
      : t;
    if (wo.scheduledDate <= soonEnd) return '近日';
    return '予定';
  },

  formatUpcomingScheduleDate(scheduledDate, today) {
    const date = String(scheduledDate || '').slice(0, 10);
    const t = today || new Date().toISOString().slice(0, 10);
    if (!date) return '—';
    if (date === t) return '今日';
    if (typeof WorkOrderBrain !== 'undefined' && date === WorkOrderBrain.addDays(t, 1)) return '明日';
    const parts = date.split('-');
    if (parts.length === 3) return `${Number(parts[1])}/${Number(parts[2])}`;
    return date;
  },

  buildUpcomingRevenueScheduleSummary(workOrders, today) {
    const t = today || new Date().toISOString().slice(0, 10);
    const monthKey = t.slice(0, 7);
    const eligible = (workOrders || [])
      .map(w => this.normalizeScheduleWorkOrder(w))
      .filter(w => this.isUpcomingRevenueScheduleWorkOrder(w, t))
      .sort((a, b) => {
        const d = (a.scheduledDate || '').localeCompare(b.scheduledDate || '');
        if (d !== 0) return d;
        return (a.startTime || '').localeCompare(b.startTime || '');
      });
    const thisMonth = eligible.filter(w => w.scheduledDate && w.scheduledDate.startsWith(monthKey));
    const monthTotal = thisMonth.reduce((sum, w) => sum + Number(w.estimateAmount || 0), 0);
    return {
      monthCount: thisMonth.length,
      monthTotal,
      upcoming: eligible.slice(0, 3).map(wo => ({
        id: wo.id || '',
        scheduledDate: wo.scheduledDate || '',
        dateLabel: this.formatUpcomingScheduleDate(wo.scheduledDate, t),
        customerName: wo.customerName || '（名前なし）',
        serviceText: wo.serviceText || '—',
        amount: Number(wo.estimateAmount || 0),
        statusLabel: this.getUpcomingScheduleStatusLabel(wo, t)
      })),
      upcomingCount: eligible.length,
      label: '売上予定（未確定）',
      scopeNote: '作業予定の見込みです。確定売上・月次実績とは合算しません。',
      hint: '※作業後に売上確定すると、確定売上に反映されます。'
    };
  },

  buildWorkOrderForecastSummary(workOrders, today) {
    const t = today || new Date().toISOString().slice(0, 10);
    const monthKey = t.slice(0, 7);
    const list = (workOrders || []).filter(w => {
      if (!w || w.status === 'キャンセル') return false;
      if (w.actualRevenueId) return false;
      const amt = Number(w.estimateAmount || 0);
      if (!Number.isFinite(amt) || amt <= 0) return false;
      const date = String(w.workDate || w.date || '').slice(0, 10);
      return date && date.startsWith(monthKey);
    });
    return {
      count: list.length,
      total: list.reduce((sum, w) => sum + Number(w.estimateAmount || 0), 0),
      label: '作業予定の見込み（今月）'
    };
  },

  buildReceptionCandidateSummary(intakes) {
    const list = (intakes || []).filter(i => {
      if (!i) return false;
      if (i.status === 'revenue_candidate') return true;
      const amt = Number(i.estimateAmount || 0);
      return amt > 0 && !i.relatedRevenueId && i.status !== 'done' && i.status !== 'archived';
    });
    return {
      count: list.length,
      total: list.reduce((sum, i) => sum + Number(i.estimateAmount || 0), 0),
      label: '受付の売上候補'
    };
  },

  buildSeparateDisplays(records, extra, today) {
    const warnings = this.getRevenueWarnings(records);
    const workOrders = (extra && extra.workOrders) || [];
    const intakes = (extra && extra.intakes) || [];
    return {
      scopeNote: '確定売上（売上番頭で確定・完了登録済み）のみ集計。見込み・候補は含みません。',
      forecast: this.buildWorkOrderForecastSummary(workOrders, today),
      receptionCandidates: this.buildReceptionCandidateSummary(intakes),
      plannedRevenue: {
        count: warnings.plannedCount,
        total: warnings.plannedTotal,
        label: '未確定の売上予定（ステータス：予定）'
      },
      noDateConfirmed: {
        count: warnings.noDateConfirmedCount,
        total: warnings.noDateConfirmedTotal,
        label: '日付不明の確定売上'
      }
    };
  },

  buildFullSummary(records, filter, today, extra) {
    const monthlyResults = (extra && extra.monthlyResults) || [];
    const filtered = this.filterRecords(records, filter);
    const compact = this.buildCompactSummary(records, today, monthlyResults);
    const confirmed = this.confirmedRecords(records);
    const baseRecords = filtered.length ? filtered : confirmed;
    const filterMonthKey = filter && filter.month
      ? (filter.month.length === 7 ? filter.month : `${filter.year || ''}-${String(filter.month).padStart(2, '0')}`)
      : '';
    const periodView = filterMonthKey
      ? this.getMonthSalesView(filterMonthKey, records, monthlyResults)
      : null;
    const periodTotal = filterMonthKey && periodView
      ? periodView.displayTotal
      : this.sumAmount(filtered);
    return {
      compact,
      filteredRecords: filtered,
      periodTotal,
      periodCount: filtered.length,
      periodView,
      monthly: this.buildMonthlySummaryWithResults(records, monthlyResults),
      yearly: this.buildYearlySummaryWithResults(records, monthlyResults),
      reconciliation: typeof MonthlyResultsBrain !== 'undefined'
        ? MonthlyResultsBrain.buildReconciliationReport(monthlyResults, records)
        : [],
      sources: this.buildSourceSummary(records, filter),
      services: this.buildServiceSummary(records, filter),
      monthlySources: this.buildMonthlySourceSummary(filtered.length ? filtered : records),
      monthlyServices: this.buildMonthlyServiceSummary(filtered.length ? filtered : records),
      yearlySources: this.buildYearlySourceSummary(filtered.length ? filtered : records),
      yearlyServices: this.buildYearlyServiceSummary(filtered.length ? filtered : records),
      warnings: this.getRevenueWarnings(records),
      separate: this.buildSeparateDisplays(records, extra, today),
      filter: filter || {}
    };
  },

  getFilterOptions(records) {
    const confirmed = this.confirmedRecords(records);
    const years = [...new Set(confirmed.map(r => this.getYearKey(r)).filter(y => y !== this.UNKNOWN_DATE_KEY))].sort((a, b) => b.localeCompare(a));
    const months = [...new Set(confirmed.map(r => this.getMonthKey(r)).filter(m => m !== this.UNKNOWN_DATE_KEY))].sort((a, b) => b.localeCompare(a));
    const sources = [...new Set(confirmed.map(r => this.getRevenueSource(r)))].sort();
    const services = [...new Set(confirmed.map(r => this.getRevenueService(r)))].sort();
    return { years, months, sources, services };
  }
};
