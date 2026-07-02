/**
 * Budil v3.8 - 利益・原価・支出番頭（概算経営判断用）
 */
const ProfitBrain = {
  CATEGORIES: [
    '人件費', '薬剤・材料', '交通・燃料', '広告費', '外注費', '手数料', '工具・部品',
    '車両', '通信費', 'サブスク', '事務用品', '消耗品', 'その他'
  ],

  DAILY_EXPENSE_CATEGORIES: [
    '人件費', '薬剤・材料', '交通・燃料', '外注費', '広告費', '消耗品', 'その他'
  ],

  EXPENSE_BREAKDOWN_CATEGORIES: [
    '人件費', '薬剤・材料', '交通・燃料', '外注費', '広告費', '消耗品', 'その他'
  ],

  PAYMENT_METHODS: ['現金', 'カード', '振込', 'その他'],

  SOURCE_GROUPS: [
    '直受け', 'LINE', 'くらしのマーケット', 'Google広告', 'Googleビジネスプロフィール',
    'コープ', 'ヤマダ', '紹介', 'その他'
  ],

  SERVICES: [
    'エアコン通常', 'エアコン完全分解', 'お掃除機能付きエアコン',
    '洗濯機クリーニング', 'レンジフード', 'キッチン', '浴室', '法人案件', 'その他'
  ],

  formatYen(amount) {
    return Number(amount || 0).toLocaleString('ja-JP') + '円';
  },

  formatRate(rate) {
    if (!Number.isFinite(rate)) return '—';
    return (Math.round(rate * 10) / 10).toFixed(1) + '%';
  },

  sumAmount(items) {
    return (items || []).reduce((n, item) => n + Number(item && item.amount || 0), 0);
  },

  monthKeyFromDate(dateStr) {
    return (dateStr || '').slice(0, 7);
  },

  currentMonthKey(today) {
    return (today || new Date().toISOString().slice(0, 10)).slice(0, 7);
  },

  normalizeExpense(raw) {
    const item = raw && typeof raw === 'object' ? { ...raw } : {};
    return {
      id: item.id || '',
      date: item.date || '',
      category: this.CATEGORIES.includes(item.category) ? item.category : (item.category || 'その他'),
      amount: Number(item.amount) || 0,
      taxIncluded: item.taxIncluded !== false,
      vendor: item.vendor || '',
      paymentMethod: item.paymentMethod || '',
      memo: item.memo || '',
      relatedRevenueId: item.relatedRevenueId || '',
      relatedWorkOrderId: item.relatedWorkOrderId || '',
      relatedLeadId: item.relatedLeadId || '',
      relatedDemandId: item.relatedDemandId || '',
      source: item.source || 'manual',
      isRecurring: !!item.isRecurring,
      isDemo: !!item.isDemo,
      isTest: !!item.isTest,
      createdAt: item.createdAt || '',
      updatedAt: item.updatedAt || ''
    };
  },

  normalizeExpenses(list) {
    return (list || []).map(e => this.normalizeExpense(e));
  },

  filterMonthExpenses(expenses, monthKey) {
    return this.normalizeExpenses(expenses).filter(e => e.date && e.date.startsWith(monthKey));
  },

  mapExpenseBreakdownCategory(category) {
    const cat = (category || '').trim() || 'その他';
    return this.EXPENSE_BREAKDOWN_CATEGORIES.includes(cat) ? cat : 'その他';
  },

  buildMonthExpenseBreakdown(expenses, monthKey) {
    const monthExpenses = this.filterMonthExpenses(expenses, monthKey);
    const totals = Object.fromEntries(this.EXPENSE_BREAKDOWN_CATEGORIES.map(c => [c, 0]));
    monthExpenses.forEach(e => {
      const mapped = this.mapExpenseBreakdownCategory(e.category);
      totals[mapped] += Number(e.amount) || 0;
    });
    const rows = this.EXPENSE_BREAKDOWN_CATEGORIES
      .map(category => ({ category, amount: totals[category] || 0 }))
      .filter(row => row.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    return {
      monthKey,
      count: monthExpenses.length,
      rows,
      total,
      topCategory: rows[0] || null,
      isEmpty: monthExpenses.length === 0
    };
  },

  hasDominantExpenseCategory(breakdown) {
    if (!breakdown || breakdown.isEmpty || !breakdown.topCategory) return false;
    if (breakdown.total <= 0) return false;
    const share = breakdown.topCategory.amount / breakdown.total;
    return share >= 0.35 && breakdown.topCategory.amount >= 5000;
  },

  isUnlinkedExpense(expense) {
    const e = this.normalizeExpense(expense);
    return !e.relatedRevenueId && !e.relatedWorkOrderId && !e.relatedLeadId;
  },

  normalizeSource(source) {
    const s = (source || '').trim();
    const map = {
      '直予約': '直受け',
      '直受け': '直受け',
      'LINE': 'LINE',
      'くらしのマーケット': 'くらしのマーケット',
      'Google広告': 'Google広告',
      'Googleビジネスプロフィール': 'Googleビジネスプロフィール',
      '紹介': '紹介',
      'コープ': 'コープ',
      'ヤマダ': 'ヤマダ',
      'Airリザーブ': 'その他',
      '法人': 'その他'
    };
    if (map[s]) return map[s];
    if (/コープ/i.test(s)) return 'コープ';
    if (/ヤマダ/i.test(s)) return 'ヤマダ';
    return this.SOURCE_GROUPS.includes(s) ? s : 'その他';
  },

  normalizeService(serviceText) {
    const text = (serviceText || '').trim();
    if (!text) return 'その他';
    const rules = [
      { key: 'お掃除機能付き', service: 'お掃除機能付きエアコン' },
      { key: '完全分解', service: 'エアコン完全分解' },
      { key: 'エアコン', service: 'エアコン通常' },
      { key: '洗濯機', service: '洗濯機クリーニング' },
      { key: 'レンジフード', service: 'レンジフード' },
      { key: 'キッチン', service: 'キッチン' },
      { key: '浴室', service: '浴室' },
      { key: '法人', service: '法人案件' }
    ];
    for (const rule of rules) {
      if (text.includes(rule.key)) return rule.service;
    }
    if (this.SERVICES.includes(text)) return text;
    return 'その他';
  },

  getExpensesForRevenue(revenueId, expenses, workOrders) {
    if (!revenueId) return [];
    const woIds = new Set(
      (workOrders || []).filter(w => w && w.actualRevenueId === revenueId).map(w => w.id)
    );
    return this.normalizeExpenses(expenses).filter(e =>
      e.relatedRevenueId === revenueId || (e.relatedWorkOrderId && woIds.has(e.relatedWorkOrderId))
    );
  },

  getExpensesForWorkOrder(workOrderId, expenses) {
    if (!workOrderId) return [];
    return this.normalizeExpenses(expenses).filter(e => e.relatedWorkOrderId === workOrderId);
  },

  classifyJudgment(grossRate, revenueTotal, expenseTotal) {
    if (revenueTotal <= 0 && expenseTotal > 0) return '注意';
    if (grossRate < 0) return '注意';
    if (grossRate < 40) return '改善';
    if (grossRate >= 70) return '増やす';
    return '続ける';
  },

  getRevenueProfitLabel(row) {
    if (!row) return '';
    if (row.marginUnset) return '粗利率未設定';
    if (row.expenseTotal <= 0 && row.revenueAmount > 0 && row.marginRate == null) return '支出未紐付け';
    if (row.grossProfit < 0) return '赤字注意';
    if (row.grossRate < 40) return '原価注意';
    if (row.grossRate >= 65) return '粗利良好';
    return '';
  },

  computeRevenueRowProfit(revenue, expenseTotal) {
    const revenueAmount = Number(revenue && revenue.amount || 0);
    const exp = Number(expenseTotal) || 0;
    const rate = typeof RevenueBrain !== 'undefined'
      ? RevenueBrain.resolveGrossMarginRate(revenue)
      : null;
    if (rate != null) {
      const marginProfit = RevenueBrain.computeMarginProfit(revenueAmount, rate);
      const deductionAmount = Math.max(0, revenueAmount - marginProfit);
      const grossProfit = marginProfit - exp;
      const grossRate = revenueAmount > 0 ? (marginProfit / revenueAmount) * 100 : 0;
      return {
        marginProfit,
        deductionAmount,
        grossProfit,
        grossRate,
        marginRate: rate,
        marginUnset: false
      };
    }
    const grossProfit = revenueAmount - exp;
    return {
      marginProfit: revenueAmount,
      deductionAmount: 0,
      grossProfit,
      grossRate: revenueAmount > 0 ? (grossProfit / revenueAmount) * 100 : 0,
      marginRate: null,
      marginUnset: revenueAmount > 0 && exp <= 0
    };
  },

  computeWorkOrderForecastProfit(workOrder, expenseTotal) {
    const estimate = this.getWorkOrderEstimateAmount(workOrder);
    const exp = Number(expenseTotal) || 0;
    const rate = typeof RevenueBrain !== 'undefined'
      ? RevenueBrain.resolveGrossMarginRate({
        source: workOrder && workOrder.source,
        grossMarginRate: workOrder && workOrder.grossMarginRate
      })
      : null;
    let marginProfit;
    let forecastProfit;
    if (rate != null) {
      marginProfit = RevenueBrain.computeMarginProfit(estimate, rate);
      forecastProfit = marginProfit - exp;
    } else {
      marginProfit = estimate;
      forecastProfit = estimate - exp;
    }
    if (estimate > 0) forecastProfit = Math.min(forecastProfit, marginProfit);
    return {
      marginProfit,
      deductionAmount: rate != null ? Math.max(0, estimate - marginProfit) : 0,
      forecastProfit,
      marginRate: rate,
      marginUnset: estimate > 0 && rate == null && exp <= 0
    };
  },

  getRevenueProfitRows(revenues, expenses, leads, workOrders) {
    const active = typeof RevenueBrain !== 'undefined'
      ? RevenueBrain.activeRecords(RevenueBrain.normalizeRevenueRecords(revenues))
      : (revenues || []).filter(r => r && r.status !== 'キャンセル');
    return active.slice().sort((a, b) => (b.workDate || '').localeCompare(a.workDate || '')).map(r => {
      const linked = this.getExpensesForRevenue(r.id, expenses, workOrders);
      const revenueAmount = Number(r.amount || 0);
      const expenseTotal = this.sumAmount(linked);
      const profit = this.computeRevenueRowProfit(r, expenseTotal);
      const row = {
        revenueId: r.id,
        workDate: r.workDate || '',
        customerName: r.customerName || '',
        service: r.service || '',
        source: r.source || '',
        revenueAmount,
        expenseTotal,
        marginProfit: profit.marginProfit,
        deductionAmount: profit.deductionAmount,
        grossProfit: profit.grossProfit,
        grossRate: profit.grossRate,
        marginRate: profit.marginRate,
        marginUnset: profit.marginUnset,
        leadId: r.leadId || ''
      };
      row.label = this.getRevenueProfitLabel(row);
      return row;
    });
  },

  getWorkOrderArea(workOrder, leads) {
    if (!workOrder) return '不明';
    if (workOrder.area && workOrder.area.trim()) return workOrder.area.trim();
    if (typeof MapBrain !== 'undefined') {
      if (workOrder.leadId) {
        const lead = (leads || []).find(l => l && l.id === workOrder.leadId);
        if (lead) return MapBrain.getLeadArea(lead);
      }
      return MapBrain.detectAreaFromAddress(workOrder.address || '');
    }
    return '不明';
  },

  getWorkOrderEstimateAmount(workOrder) {
    if (typeof RevenueSummaryBrain !== 'undefined') {
      return RevenueSummaryBrain.getScheduleEstimateAmount(
        RevenueSummaryBrain.normalizeScheduleWorkOrder(workOrder)
      );
    }
    const wo = workOrder && typeof workOrder === 'object' ? workOrder : {};
    const top = Number(wo.estimateAmount || 0);
    if (Number.isFinite(top) && top > 0) return top;
    const meta = wo.candidateMeta;
    if (meta && meta.estimatedAmount != null && meta.estimatedAmount !== '') {
      const parsed = parseInt(String(meta.estimatedAmount).replace(/[^\d]/g, ''), 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  },

  getMonthPlannedWorkOrders(workOrders, monthKey, today) {
    const t = today || new Date().toISOString().slice(0, 10);
    return (workOrders || []).filter(w => {
      if (!w) return false;
      const wo = typeof RevenueSummaryBrain !== 'undefined'
        ? RevenueSummaryBrain.normalizeScheduleWorkOrder(w)
        : w;
      if (!wo.scheduledDate || !wo.scheduledDate.startsWith(monthKey)) return false;
      if (typeof RevenueSummaryBrain !== 'undefined') {
        return RevenueSummaryBrain.isUpcomingRevenueScheduleWorkOrder(wo, t);
      }
      const activeStatuses = typeof WorkOrderBrain !== 'undefined'
        ? WorkOrderBrain.ACTIVE_STATUSES
        : ['tentative', 'confirmed'];
      return activeStatuses.includes(wo.status) && !wo.actualRevenueId;
    });
  },

  getWorkOrderForecastRows(workOrders, expenses, leads, today) {
    const activeStatuses = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.ACTIVE_STATUSES
      : ['tentative', 'confirmed', 'completed'];
    const sorted = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.sortByScheduledDateTimeAsc(
        (workOrders || []).filter(w => w && activeStatuses.includes(w.status) && !w.actualRevenueId)
      )
      : (workOrders || []).filter(w => w && activeStatuses.includes(w.status) && !w.actualRevenueId);
    return sorted
      .map(w => {
        const linked = this.getExpensesForWorkOrder(w.id, expenses);
        const estimate = this.getWorkOrderEstimateAmount(w);
        const expenseTotal = this.sumAmount(linked);
        const woProfit = this.computeWorkOrderForecastProfit(w, expenseTotal);
        const forecastProfit = woProfit.forecastProfit;
        const area = this.getWorkOrderArea(w, leads);
        const distanceClass = typeof MapBrain !== 'undefined'
          ? MapBrain.classifyAreaDistance(area, w.address || '')
          : 'unknown';
        const distanceLabel = typeof MapBrain !== 'undefined'
          ? MapBrain.getDistanceLabel(distanceClass)
          : '';
        const mapUrl = typeof MapBrain !== 'undefined'
          ? MapBrain.buildGoogleMapSearchUrl(w.address || '')
          : '';
        const lowProfitFar = (distanceClass === 'far' || distanceClass === 'caution')
          && estimate > 0 && forecastProfit / estimate < 0.5;
        const cautionText = lowProfitFar
          ? `${area}の作業予定です。移動コストを考えると最低金額の確認が必要です。`
          : (distanceClass === 'far' ? `${area}は遠方エリアです。移動コストに注意してください。` : '');
        return {
          workOrderId: w.id,
          scheduledDate: w.scheduledDate || '',
          customerName: w.customerName || '',
          serviceText: w.serviceText || '',
          estimate,
          expenseTotal,
          marginProfit: woProfit.marginProfit,
          deductionAmount: woProfit.deductionAmount,
          marginRate: woProfit.marginRate,
          marginUnset: woProfit.marginUnset,
          forecastProfit,
          area,
          distanceClass,
          distanceLabel,
          mapUrl,
          cautionText,
          source: w.source || ''
        };
      });
  },

  getPeriodProfitSummary(ctx) {
    const today = ctx.today || new Date().toISOString().slice(0, 10);
    const monthKey = ctx.monthKey || this.currentMonthKey(today);
    const revenues = typeof RevenueBrain !== 'undefined'
      ? RevenueBrain.activeRecords(RevenueBrain.normalizeRevenueRecords(ctx.revenues))
      : (ctx.revenues || []);
    const expenses = this.normalizeExpenses(ctx.expenses);
    const workOrders = ctx.workOrders || [];

    const monthRevenues = revenues.filter(r => r.workDate && r.workDate.startsWith(monthKey));
    const monthExpenses = this.filterMonthExpenses(expenses, monthKey);
    const monthRevenue = this.sumAmount(monthRevenues);
    const monthExpense = this.sumAmount(monthExpenses);
    const monthProfitDetails = monthRevenues.map(r => {
      const linked = this.getExpensesForRevenue(r.id, expenses, workOrders);
      return this.computeRevenueRowProfit(r, this.sumAmount(linked));
    });
    const monthMarginGross = monthProfitDetails.reduce((n, d) => n + d.marginProfit, 0);
    const marginDeductionTotal = monthProfitDetails.reduce((n, d) => n + d.deductionAmount, 0);
    const monthGrossProfit = monthMarginGross - monthExpense;
    const monthGrossRate = monthRevenue > 0 ? (monthMarginGross / monthRevenue) * 100 : 0;

    const adExpense = this.sumAmount(monthExpenses.filter(e => e.category === '広告費'));
    const feeExpense = this.sumAmount(monthExpenses.filter(e => e.category === '手数料'));
    const outsourceExpense = this.sumAmount(monthExpenses.filter(e => e.category === '外注費'));
    const unlinkedCount = monthExpenses.filter(e => this.isUnlinkedExpense(e)).length;
    const unlinkedTotal = this.sumAmount(monthExpenses.filter(e => this.isUnlinkedExpense(e)));

    const monthPlannedWorkOrders = this.getMonthPlannedWorkOrders(workOrders, monthKey, today);
    const plannedRevenueEstimate = monthPlannedWorkOrders.reduce(
      (n, w) => n + this.getWorkOrderEstimateAmount(w), 0
    );
    const plannedForecastProfit = monthPlannedWorkOrders.reduce((n, w) => {
      const exp = this.sumAmount(this.getExpensesForWorkOrder(w.id, expenses));
      return n + this.computeWorkOrderForecastProfit(w, exp).forecastProfit;
    }, 0);

    // 確定売上 = 確定ステータス（'確定','完了'）のレコードのみ
    const confirmedMonthRevenues = monthRevenues.filter(r =>
      typeof RevenueBrain !== 'undefined'
        ? RevenueBrain.isConfirmedRevenueStatus(r.status)
        : (r.status === '確定' || r.status === '完了')
    );
    const confirmedRevenue = this.sumAmount(confirmedMonthRevenues);

    // 確定利益 = 確定売上の粗利率ベース粗利 - 確定売上に紐付いた経費
    const confirmedProfitDetails = confirmedMonthRevenues.map(r => {
      const linked = this.getExpensesForRevenue(r.id, expenses, workOrders);
      return this.computeRevenueRowProfit(r, this.sumAmount(linked));
    });
    const confirmedMarginGross = confirmedProfitDetails.reduce((n, d) => n + d.marginProfit, 0);
    const confirmedLinkedExpense = confirmedMonthRevenues.reduce((n, r) =>
      n + this.sumAmount(this.getExpensesForRevenue(r.id, expenses, workOrders)), 0
    );
    const confirmedProfit = confirmedMarginGross - confirmedLinkedExpense;

    const totalRevenue = plannedRevenueEstimate + confirmedRevenue;
    const totalProfit = plannedForecastProfit + confirmedProfit;

    return {
      monthKey,
      monthRevenue,
      monthExpense,
      monthGrossProfit,
      monthGrossRate,
      monthMarginGross,
      marginDeductionTotal,
      plannedRevenueEstimate,
      plannedForecastProfit,
      confirmedRevenue,
      confirmedProfit,
      totalRevenue,
      totalProfit,
      workOrderEstimate: plannedRevenueEstimate,
      workOrderForecastProfit: plannedForecastProfit,
      forecastProfit: plannedForecastProfit,
      adExpense,
      feeExpense,
      outsourceExpense,
      unlinkedCount,
      unlinkedTotal,
      monthRevenueCount: monthRevenues.length,
      monthExpenseCount: monthExpenses.length
    };
  },

  buildServiceRows(revenues, expenses, workOrders) {
    const groups = {};
    const ensure = (service) => {
      if (!groups[service]) {
        groups[service] = { service, revenueCount: 0, revenueTotal: 0, expenseTotal: 0, grossProfit: 0, grossRate: 0 };
      }
      return groups[service];
    };

    const revRows = this.getRevenueProfitRows(revenues, expenses, [], workOrders);
    revRows.forEach(row => {
      const service = this.normalizeService(row.service);
      const g = ensure(service);
      g.revenueCount += 1;
      g.revenueTotal += row.revenueAmount;
      g.expenseTotal += row.expenseTotal;
      g.grossProfit += row.grossProfit;
    });

    (workOrders || []).forEach(w => {
      if (!w || w.actualRevenueId) return;
      const service = this.normalizeService(w.serviceText || '');
      const g = ensure(service);
      const est = Number(w.estimateAmount || 0);
      const exp = this.sumAmount(this.getExpensesForWorkOrder(w.id, expenses));
      const woProfit = this.computeWorkOrderForecastProfit(w, exp);
      g.revenueTotal += est;
      g.expenseTotal += exp;
      g.grossProfit += woProfit.forecastProfit;
    });

    return Object.values(groups).map(g => {
      g.grossRate = g.revenueTotal > 0 ? (g.grossProfit / g.revenueTotal) * 100 : 0;
      g.judgment = this.classifyJudgment(g.grossRate, g.revenueTotal, g.expenseTotal);
      return g;
    }).sort((a, b) => b.grossProfit - a.grossProfit);
  },

  getServiceProfitSummary(revenues, expenses, workOrders) {
    return this.buildServiceRows(revenues, expenses, workOrders);
  },

  buildAreaRows(revenues, expenses, workOrders, leads) {
    const groups = {};
    const ensure = (area) => {
      if (!groups[area]) {
        groups[area] = {
          area, revenueTotal: 0, expenseTotal: 0, grossProfit: 0, grossRate: 0,
          workOrderEstimate: 0, farCaution: false, judgment: '続ける', comment: ''
        };
      }
      return groups[area];
    };

    const revRows = this.getRevenueProfitRows(revenues, expenses, leads, workOrders);
    revRows.forEach(row => {
      let area = '不明';
      if (row.leadId && typeof MapBrain !== 'undefined') {
        const lead = (leads || []).find(l => l && l.id === row.leadId);
        area = lead ? MapBrain.getLeadArea(lead) : '不明';
      }
      const g = ensure(area);
      g.revenueTotal += row.revenueAmount;
      g.expenseTotal += row.expenseTotal;
      g.grossProfit += row.grossProfit;
    });

    this.getWorkOrderForecastRows(workOrders, expenses, leads).forEach(row => {
      const g = ensure(row.area || '不明');
      g.workOrderEstimate += row.estimate;
      g.expenseTotal += row.expenseTotal;
      g.grossProfit += row.forecastProfit;
      if (row.distanceClass === 'far' || row.distanceClass === 'caution') g.farCaution = true;
    });

    return Object.values(groups).map(g => {
      g.grossRate = g.revenueTotal > 0 ? (g.grossProfit / g.revenueTotal) * 100 : 0;
      g.judgment = this.classifyJudgment(g.grossRate, g.revenueTotal, g.expenseTotal);
      if (g.judgment === '増やす' || g.judgment === '続ける') {
        g.comment = `${g.area}：粗利${g.judgment === '増やす' ? '良好' : 'は継続可'}。`;
        if (typeof MapBrain !== 'undefined' && MapBrain.NEAR_AREAS.has(g.area)) {
          g.comment += '近場で移動効率が良いです。';
        }
      } else if (g.farCaution) {
        g.comment = `${g.area}：売上はあるが移動コストに注意。最低金額を確認してください。`;
      } else if (g.judgment === '注意' || g.judgment === '改善') {
        g.comment = `${g.area}：利益率に注意。価格・原価を確認してください。`;
      } else {
        g.comment = `${g.area}：概算利益を確認しましょう。`;
      }
      return g;
    }).sort((a, b) => b.grossProfit - a.grossProfit);
  },

  getAreaProfitSummary(revenues, expenses, workOrders, leads) {
    return this.buildAreaRows(revenues, expenses, workOrders, leads);
  },

  buildSourceRows(revenues, expenses, workOrders, intakes) {
    const groups = {};
    const ensure = (source) => {
      if (!groups[source]) {
        groups[source] = {
          source, revenueTotal: 0, expenseTotal: 0, adFeeTotal: 0,
          grossProfit: 0, grossRate: 0, judgment: '続ける', comment: ''
        };
      }
      return groups[source];
    };

    const revRows = this.getRevenueProfitRows(revenues, expenses, [], workOrders);
    revRows.forEach(row => {
      const source = this.normalizeSource(row.source);
      const g = ensure(source);
      g.revenueTotal += row.revenueAmount;
      g.expenseTotal += row.expenseTotal;
      g.grossProfit += row.grossProfit;
    });

    this.normalizeExpenses(expenses).forEach(e => {
      const src = this.normalizeSource(e.vendor || e.memo || '');
      if (e.category === '広告費' || e.category === '手数料') {
        const g = ensure(src === 'その他' ? this.normalizeSource(e.memo) : src);
        g.adFeeTotal += Number(e.amount || 0);
      }
    });

    this.SOURCE_GROUPS.forEach(source => ensure(source));

    return Object.values(groups)
      .filter(g => g.revenueTotal > 0 || g.expenseTotal > 0 || g.adFeeTotal > 0)
      .map(g => {
        g.grossRate = g.revenueTotal > 0 ? (g.grossProfit / g.revenueTotal) * 100 : 0;
        g.judgment = this.classifyJudgment(g.grossRate, g.revenueTotal, g.expenseTotal);
        if (g.source === 'Google広告') {
          if (g.adFeeTotal > 0 && g.revenueTotal < g.adFeeTotal * 3) {
            g.comment = 'Google広告：問い合わせはあるが広告費に注意。CPAと売上を確認。';
            g.judgment = '注意';
          }
        }
        if (g.source === '直受け' && g.grossRate >= 60) {
          g.comment = '直受け：手数料が少なく利益が残りやすい。';
        }
        if (g.source === 'くらしのマーケット' && g.adFeeTotal > 0) {
          g.comment = 'くらしのマーケット：手数料と移動コストを確認。';
        }
        if (!g.comment) {
          g.comment = `${g.source}：売上${this.formatYen(g.revenueTotal)}、粗利${this.formatYen(g.grossProfit)}。`;
        }
        return g;
      })
      .sort((a, b) => b.grossProfit - a.grossProfit);
  },

  getSourceProfitSummary(revenues, expenses, workOrders, intakes) {
    return this.buildSourceRows(revenues, expenses, workOrders, intakes);
  },

  buildProfitContext(ctx) {
    const today = ctx.today || new Date().toISOString().slice(0, 10);
    const baseSummary = this.getPeriodProfitSummary(ctx);
    let summary = baseSummary;
    if (typeof MonthlyResultsBrain !== 'undefined' && ctx.monthlyResults) {
      const monthKey = ctx.monthKey || baseSummary.monthKey;
      const monthly = MonthlyResultsBrain.findForMonth(ctx.monthlyResults, monthKey);
      if (monthly) {
        summary = MonthlyResultsBrain.buildProfitSummaryFromMonthly(monthly, {
          expenses: ctx.expenses,
          workOrderEstimate: baseSummary.workOrderEstimate,
          workOrderForecastProfit: baseSummary.workOrderForecastProfit
        });
      }
    }
    const revenueRows = this.getRevenueProfitRows(ctx.revenues, ctx.expenses, ctx.leads, ctx.workOrders);
    const workOrderRows = this.getWorkOrderForecastRows(ctx.workOrders, ctx.expenses, ctx.leads, today);
    const serviceRows = this.getServiceProfitSummary(ctx.revenues, ctx.expenses, ctx.workOrders);
    const areaRows = this.getAreaProfitSummary(ctx.revenues, ctx.expenses, ctx.workOrders, ctx.leads);
    const sourceRows = this.getSourceProfitSummary(ctx.revenues, ctx.expenses, ctx.workOrders, ctx.intakes);
    const hints = this.buildProfitImprovementHints({
      summary, revenueRows, workOrderRows, serviceRows, areaRows, sourceRows, expenses: ctx.expenses
    });
    return {
      today,
      summary,
      revenueRows,
      workOrderRows,
      serviceRows,
      areaRows,
      sourceRows,
      hints,
      revenues: ctx.revenues || [],
      expenses: this.normalizeExpenses(ctx.expenses)
    };
  },

  buildProfitImprovementHints(context) {
    const hints = [];
    const push = (type, title, detail) => {
      hints.push({ type, title, detail: detail || '' });
    };
    const c = context || {};
    const summary = c.summary || {};
    const expenses = c.expenses || [];

    if (summary.usesMonthlyResult) {
      if (summary.monthGrossProfit < 0) {
        push('deficit', '月次実績：今月は赤字注意', `概算粗利${this.formatYen(summary.monthGrossProfit)}です。`);
      }
      if (summary.adExpense > 0 && summary.monthRevenue < summary.adExpense * 4) {
        push('ad', '広告確認：Google広告費と売上を確認', `今月の広告費${this.formatYen(summary.adExpense)}に対し売上${this.formatYen(summary.monthRevenue)}です。`);
      }
      return hints.slice(0, 6);
    }

    if (summary.unlinkedCount > 0) {
      push('unlinked', '支出確認：未紐付け支出を整理', `未紐付け支出が${summary.unlinkedCount}件（${this.formatYen(summary.unlinkedTotal)}）あります。`);
    }
    if (summary.adExpense > 0 && summary.monthRevenue < summary.adExpense * 4) {
      push('ad', '広告確認：Google広告費と売上を確認', `今月の広告費${this.formatYen(summary.adExpense)}に対し売上${this.formatYen(summary.monthRevenue)}です。`);
    }
    (c.workOrderRows || []).filter(r => r.cautionText).slice(0, 2).forEach(r => {
      push('far', '価格確認：遠方案件の最低金額を見直す', r.cautionText);
    });
    (c.serviceRows || []).filter(s => s.judgment === '改善' || s.judgment === '注意').slice(0, 2).forEach(s => {
      push('service', `改善する：粗利率が低い${s.service}`, `粗利率${this.formatRate(s.grossRate)}。価格・作業時間・材料費を確認。`);
    });
    (c.revenueRows || []).filter(r => r.label === '赤字注意').slice(0, 1).forEach(r => {
      push('deficit', `赤字注意：${r.customerName || '売上'}`, `粗利${this.formatYen(r.grossProfit)}。原価と価格を確認。`);
    });
    const direct = (c.sourceRows || []).find(s => s.source === '直受け');
    if (direct && direct.grossRate >= 65) {
      push('direct', '直受け強化：口コミ・LINE・GBPを増やす', '直受けの利益が良い傾向です。口コミ・LINE・GBPを増やしましょう。');
    }
    if (!hints.length && expenses.length === 0) {
      push('start', '経費入力：今月の経費を1件記録', '薬剤・燃料・広告費などを記録すると利益が見えます。');
    }
    return hints.slice(0, 6);
  },

  createProfitTaskPayload(hint, today) {
    const t = today || new Date().toISOString().slice(0, 10);
    const title = (hint && hint.title) || '利益確認';
    const type = (hint && hint.type) || 'general';
    return {
      title,
      targetName: '利益管理',
      priority: type === 'deficit' || type === 'far' ? '高' : '中',
      action: title,
      memo: (hint && hint.detail) || '',
      dueDate: t,
      status: 'open',
      reason: '利益改善ヒント',
      pickupDedupeKey: ['profit', t, type, title].join('|')
    };
  },

  buildHomeComment(context) {
    const summary = (context && context.summary) || context;
    if (!summary || !summary.monthRevenue && !summary.monthExpense) return '';
    return `今月の概算粗利は${this.formatYen(summary.monthGrossProfit)}です。広告費と遠方案件の利益を確認しましょう。`;
  },

  buildMorningLines(context) {
    const summary = (context && context.summary) || context;
    if (!summary) return [];
    const lines = [
      `今月売上 ${this.formatYen(summary.monthRevenue)}`,
      `支出 ${this.formatYen(summary.monthExpense)}`,
      `概算粗利 ${this.formatYen(summary.monthGrossProfit)}`
    ];
    const cautions = [];
    if (summary.adExpense > 0 && summary.monthRevenue < summary.adExpense * 4) cautions.push('広告費');
    if ((context && context.workOrderRows || []).some(r => r.cautionText)) cautions.push('遠方案件');
    if (summary.unlinkedCount > 0) cautions.push('未紐付け支出');
    if (cautions.length) lines.push(`注意：${cautions.join('と')}を確認`);
    return lines;
  },

  buildWarnings(context) {
    const warnings = [];
    const summary = (context && context.summary) || {};
    const revenueRows = (context && context.revenueRows) || [];
    const deficitCount = revenueRows.filter(r => r.label === '赤字注意').length;
    if (deficitCount) warnings.push(`赤字注意の売上が${deficitCount}件あります`);
    if (summary.unlinkedCount > 0) warnings.push(`未紐付け支出が${summary.unlinkedCount}件あります`);
    if (summary.adExpense > 0 && summary.monthRevenue < summary.adExpense * 4) {
      warnings.push('広告費が売上に対して高めです');
    }
    (context && context.workOrderRows || []).filter(r => r.cautionText).slice(0, 2).forEach(r => {
      warnings.push(r.cautionText);
    });
    return warnings;
  },

  buildReportSection(context, periodLabel) {
    const c = context || {};
    const s = c.summary || {};
    const lines = [];
    lines.push('■ 利益状況');
    if (periodLabel) lines.push(`対象期間：${periodLabel}`);
    lines.push(`今月売上：${this.formatYen(s.monthRevenue)}`);
    lines.push(`支出：${this.formatYen(s.monthExpense)}`);
    lines.push(`概算粗利：${this.formatYen(s.monthGrossProfit)}`);
    lines.push(`粗利率：${this.formatRate(s.monthGrossRate)}`);
    lines.push(`予定売上見込み：${this.formatYen(s.plannedRevenueEstimate)}`);
    lines.push(`見込み利益：${this.formatYen(s.plannedForecastProfit)}`);
    lines.push(`確定売上：${this.formatYen(s.confirmedRevenue)}`);
    lines.push(`確定利益：${this.formatYen(s.confirmedProfit)}`);
    lines.push(`合計売上：${this.formatYen(s.totalRevenue)}`);
    lines.push(`合計利益：${this.formatYen(s.totalProfit)}`);
    lines.push(`広告費：${this.formatYen(s.adExpense)} / 手数料：${this.formatYen(s.feeExpense)} / 外注費：${this.formatYen(s.outsourceExpense)}`);
    lines.push(`未紐付け支出：${s.unlinkedCount || 0}件`);
    const monthlyLines = this.buildMonthlyRevenueProfitLines(c.revenues, c.expenses);
    if (monthlyLines.length) {
      lines.push('');
      lines.push('月別売上・粗利（直近）：');
      monthlyLines.forEach(l => lines.push(`・${l}`));
    }
    lines.push('');
    const svc = (c.serviceRows || []).slice(0, 5).map(r =>
      `${r.service}：売上${this.formatYen(r.revenueTotal)} / 粗利${this.formatYen(r.grossProfit)}（${r.judgment}）`
    );
    if (svc.length) {
      lines.push('サービス別利益：');
      svc.forEach(l => lines.push(`・${l}`));
      lines.push('');
    }
    const areas = (c.areaRows || []).slice(0, 4).map(r => r.comment).filter(Boolean);
    if (areas.length) {
      lines.push('エリア別利益：');
      areas.forEach(l => lines.push(`・${l}`));
      lines.push('');
    }
    const sources = (c.sourceRows || []).slice(0, 4).map(r => r.comment).filter(Boolean);
    if (sources.length) {
      lines.push('集客経路別利益：');
      sources.forEach(l => lines.push(`・${l}`));
      lines.push('');
    }
    const hints = (c.hints || []).map(h => h.title);
    if (hints.length) {
      lines.push('利益改善ヒント：');
      hints.forEach(h => lines.push(`・${h}`));
    }
    return lines.join('\n');
  },

  buildMonthlyRevenueProfitLines(revenues, expenses) {
    if (typeof RevenueSummaryBrain === 'undefined') return [];
    const active = RevenueSummaryBrain.confirmedRecords(revenues);
    const monthly = RevenueSummaryBrain.buildMonthlySummary(active).slice(0, 3);
    const expenseList = this.normalizeExpenses(expenses);
    return monthly.map(m => {
      const monthExpenses = expenseList.filter(e => e.date && e.date.startsWith(m.monthKey));
      const expenseTotal = monthExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const gross = m.total - expenseTotal;
      return `${m.label}：売上${this.formatYen(m.total)} / 粗利${this.formatYen(gross)}（${m.count}件）`;
    });
  },

  getDiagnosticsCounts(expenses, revenues, workOrders, leads) {
    const list = this.normalizeExpenses(expenses);
    const revIds = new Set((revenues || []).filter(r => r && r.id).map(r => r.id));
    const woIds = new Set((workOrders || []).filter(w => w && w.id).map(w => w.id));
    const leadIds = new Set((leads || []).filter(l => l && l.id).map(l => l.id));
    let noId = 0; let noDate = 0; let badAmount = 0; let noCategory = 0;
    let badRevRef = 0; let badWoRef = 0; let badLeadRef = 0; let unlinked = 0;

    list.forEach(e => {
      if (!e.id) noId++;
      if (!e.date) noDate++;
      if (e.amount != null && typeof e.amount !== 'number') badAmount++;
      if (!e.category) noCategory++;
      if (e.relatedRevenueId && !revIds.has(e.relatedRevenueId)) badRevRef++;
      if (e.relatedWorkOrderId && !woIds.has(e.relatedWorkOrderId)) badWoRef++;
      if (e.relatedLeadId && !leadIds.has(e.relatedLeadId)) badLeadRef++;
      if (this.isUnlinkedExpense(e)) unlinked++;
    });

    return {
      total: list.length,
      noId, noDate, badAmount, noCategory,
      badRevRef, badWoRef, badLeadRef, unlinked
    };
  },

  buildProfitOperationsDiagnostics(profitCtx, options) {
    const opts = options || {};
    const today = (profitCtx && profitCtx.today) || opts.today || new Date().toISOString().slice(0, 10);
    const summary = (profitCtx && profitCtx.summary) || {};
    const monthKey = summary.monthKey || this.currentMonthKey(today);
    const expenses = (profitCtx && profitCtx.expenses) || opts.expenses || [];
    const monthExpenses = this.filterMonthExpenses(expenses, monthKey);
    const expenseInputCount = monthExpenses.length;
    const expenseBreakdown = this.buildMonthExpenseBreakdown(expenses, monthKey);
    const aggregationLabel = summary.usesMonthlyResult ? '月次実績ベース' : '明細ベース';
    const profit = Number(summary.monthGrossProfit) || 0;
    const profitRate = Number(summary.monthGrossRate) || 0;
    const revenue = Number(summary.monthRevenue) || 0;

    let reconciliationLabel = '—';
    let hasReconciliationGap = false;
    if (typeof MonthlyResultsBrain !== 'undefined') {
      const monthlyResults = opts.monthlyResults || [];
      const revenues = opts.revenues || (profitCtx && profitCtx.revenues) || [];
      const rows = MonthlyResultsBrain.buildReconciliationReport(monthlyResults, revenues, {});
      const currentRow = rows.find(r => r.month === monthKey);
      if (currentRow) reconciliationLabel = currentRow.status;
      hasReconciliationGap = !!(currentRow && currentRow.status === '差額あり');
    }

    const lowExpenseThreshold = 3;
    const needsExpensePrompt = !summary.usesMonthlyResult
      && expenseInputCount < lowExpenseThreshold
      && (expenseInputCount === 0 || revenue > 0);
    const isDeficit = profit < 0;
    const isLowMargin = !isDeficit && revenue > 0 && profitRate < 40;

    let statusKey = 'ok';
    let statusMessage = '利益は黒字です。';
    let nextAction = '次の売上予定を確認してください。';
    let primaryAction = {
      id: 'upcoming',
      label: '売上予定を見る',
      view: 'dashboard',
      scrollSelector: '#daily-section-schedule'
    };

    if (needsExpensePrompt) {
      statusKey = expenseInputCount === 0 ? 'no_expense' : 'low_expense';
      statusMessage = expenseInputCount === 0
        ? '今月の経費入力がまだありません。'
        : `今月の経費入力が${expenseInputCount}件です。`;
      nextAction = '使ったお金を経費入力に記録してください。';
      primaryAction = {
        id: 'daily_expense',
        label: '経費入力を見る',
        view: 'dashboard',
        scrollSelector: '#daily-section-expense'
      };
    } else if (isDeficit) {
      statusKey = 'deficit';
      statusMessage = `今月利益は${this.formatYen(profit)}です。赤字に注意してください。`;
      nextAction = '外注費・材料費・交通費を確認してください。';
      primaryAction = {
        id: 'expense_breakdown',
        label: '経費内訳を見る',
        view: 'profit',
        scrollSelector: '#profit-expense-breakdown'
      };
    } else if (isLowMargin) {
      statusKey = 'low_margin';
      statusMessage = `利益率は${this.formatRate(profitRate)}です。原価・単価を確認してください。`;
      nextAction = '単価・外注費・材料費を見直してください。';
      primaryAction = {
        id: 'expense_breakdown',
        label: '経費内訳を見る',
        view: 'profit',
        scrollSelector: '#profit-expense-breakdown'
      };
    } else if (this.hasDominantExpenseCategory(expenseBreakdown)) {
      const top = expenseBreakdown.topCategory;
      statusKey = 'high_category';
      statusMessage = `${top.category}が今月いちばん大きい経費です（${this.formatYen(top.amount)}）。`;
      nextAction = '一番大きい経費カテゴリを確認してください。';
      primaryAction = {
        id: 'expense_breakdown',
        label: '経費内訳を見る',
        view: 'profit',
        scrollSelector: '#profit-expense-breakdown'
      };
    } else if (hasReconciliationGap) {
      statusKey = 'reconciliation_gap';
      statusMessage = '月次実績と売上明細に差額があります。';
      nextAction = '整合チェックを確認してください。';
      primaryAction = {
        id: 'reconciliation',
        label: '整合チェックを見る',
        view: 'revenue',
        scrollSelector: '#revenue-reconciliation-check'
      };
    }

    return {
      monthKey,
      monthRevenue: revenue,
      monthExpense: Number(summary.monthExpense) || 0,
      monthProfit: profit,
      monthProfitRate: profitRate,
      expenseInputCount,
      expenseBreakdown,
      aggregationLabel,
      usesMonthlyResult: !!summary.usesMonthlyResult,
      reconciliationLabel,
      hasReconciliationGap,
      statusKey,
      statusMessage,
      nextAction,
      primaryAction,
      flowNote: '売上確定→経費入力→利益集計→経費内訳。月次実績がある月は月次実績ベースを優先表示します。'
    };
  },

  buildMonthlyClosingCheck(options) {
    const opts = options || {};
    const today = opts.today || new Date().toISOString().slice(0, 10);
    const profitCtx = opts.profitCtx || this.buildProfitContext({
      today,
      revenues: opts.revenues || [],
      expenses: opts.expenses || [],
      workOrders: opts.workOrders || [],
      leads: opts.leads || [],
      intakes: opts.intakes || [],
      monthlyResults: opts.monthlyResults || []
    });
    const summary = profitCtx.summary || {};
    const monthKey = summary.monthKey || this.currentMonthKey(today);
    const workOrders = opts.workOrders || [];
    const revenues = opts.revenues || (profitCtx.revenues || []);
    const monthlyResults = opts.monthlyResults || [];
    const expenses = opts.expenses || (profitCtx.expenses || []);

    const revenueConfirmationQueueCount = typeof RevenueSummaryBrain !== 'undefined'
      ? RevenueSummaryBrain.countRevenueConfirmationQueue(workOrders, today)
      : 0;
    const upcoming = typeof RevenueSummaryBrain !== 'undefined'
      ? RevenueSummaryBrain.buildUpcomingRevenueScheduleSummary(workOrders, today)
      : { upcomingCount: 0 };
    const upcomingScheduleCount = upcoming.upcomingCount || 0;
    const monthExpenses = this.filterMonthExpenses(expenses, monthKey);
    const expenseInputCount = monthExpenses.length;

    const monthlyRecord = typeof MonthlyResultsBrain !== 'undefined'
      ? MonthlyResultsBrain.findForMonth(monthlyResults, monthKey)
      : null;
    const hasMonthlyResult = !!monthlyRecord;
    const monthlyResultLabel = hasMonthlyResult ? '入力済み' : '未入力';

    let reconciliationLabel = '—';
    let hasReconciliationGap = false;
    if (typeof MonthlyResultsBrain !== 'undefined') {
      const row = MonthlyResultsBrain.buildReconciliationRow(monthKey, monthlyResults, revenues);
      reconciliationLabel = row.status;
      hasReconciliationGap = row.status === '差額あり';
    }

    const monthRevenue = Number(summary.monthRevenue) || 0;
    const monthExpense = Number(summary.monthExpense) || 0;
    const monthProfit = Number(summary.monthGrossProfit) || 0;
    const isProfitable = monthProfit >= 0;

    const statusMessages = [];
    if (revenueConfirmationQueueCount > 0) {
      statusMessages.push('未確定売上があります');
    }
    if (expenseInputCount === 0) {
      statusMessages.push('経費入力がまだありません');
    }
    if (hasReconciliationGap) {
      statusMessages.push('月次実績と売上明細に差額があります');
    }
    if (!hasMonthlyResult) {
      statusMessages.push('月次実績が未入力です');
    }
    if (isProfitable && revenueConfirmationQueueCount === 0 && !hasReconciliationGap) {
      statusMessages.push('今月の利益は黒字です');
    }
    if (statusMessages.length === 0
      || (statusMessages.length === 1 && statusMessages[0] === '今月の利益は黒字です')) {
      statusMessages.push('月次締めの確認ができます');
    }

    let statusKey = 'ready';
    let nextAction = '月次締めの確認は完了に近い状態です。';
    let primaryAction = {
      id: 'ready',
      label: '月次実績を確認する',
      view: 'monthly-results',
      scrollSelector: '#monthly-results-form-card'
    };

    if (revenueConfirmationQueueCount > 0) {
      statusKey = 'revenue_queue';
      nextAction = '売上確定待ちを確認してください。';
      primaryAction = {
        id: 'revenue_queue',
        label: '売上確定待ちを見る',
        view: 'dashboard',
        scrollSelector: '#daily-section-revenue-queue'
      };
    } else if (expenseInputCount === 0) {
      statusKey = 'no_expense';
      nextAction = '使ったお金を経費入力に記録してください。';
      primaryAction = {
        id: 'daily_expense',
        label: '経費入力を見る',
        view: 'dashboard',
        scrollSelector: '#daily-section-expense'
      };
    } else if (hasReconciliationGap) {
      statusKey = 'reconciliation_gap';
      let gapDiff = 0;
      if (typeof MonthlyResultsBrain !== 'undefined') {
        const gapRow = MonthlyResultsBrain.buildReconciliationRow(monthKey, monthlyResults, revenues);
        gapDiff = Number(gapRow.diff) || 0;
      }
      if (gapDiff > 0) {
        nextAction = '月次実績との差額を売上明細に追加できます。';
        primaryAction = {
          id: 'reconciliation_add',
          label: '差額を確認する',
          view: 'revenue',
          scrollSelector: '#revenue-monthly-reconciliation'
        };
      } else {
        nextAction = '売上明細が月次実績より多いです。月次実績を確認してください。';
        primaryAction = {
          id: 'reconciliation_edit',
          label: '月次実績を編集',
          view: 'monthly-results',
          scrollSelector: '#monthly-results-form-card'
        };
      }
    } else if (!hasMonthlyResult) {
      statusKey = 'no_monthly';
      nextAction = '月次実績を入力してください。';
      primaryAction = {
        id: 'monthly_results',
        label: '月次実績を入力する',
        view: 'monthly-results',
        scrollSelector: '#monthly-results-form-card'
      };
    } else if (upcomingScheduleCount > 0) {
      statusKey = 'upcoming';
      nextAction = '今後の売上予定を確認してください。';
      primaryAction = {
        id: 'upcoming',
        label: '売上予定を見る',
        view: 'revenue',
        scrollSelector: '#revenue-upcoming-schedule'
      };
    }

    return {
      monthKey,
      monthRevenue,
      monthExpense,
      monthProfit,
      revenueConfirmationQueueCount,
      upcomingScheduleCount,
      monthlyResultLabel,
      hasMonthlyResult,
      reconciliationLabel,
      hasReconciliationGap,
      expenseInputCount,
      usesMonthlyResult: !!summary.usesMonthlyResult,
      statusMessages,
      statusKey,
      nextAction,
      primaryAction,
      flowNote: '今月の売上→今月の経費→今月の利益→未確定の売上→月次実績との整合→月次締めで次にやること'
    };
  },

  isMonthlyClosingPeriod(today) {
    const s = String(today || '').trim();
    const day = parseInt(s.split('-')[2], 10);
    if (!Number.isFinite(day)) return false;
    return day >= 25 || day <= 5;
  },

  buildExecutivePriorityAction(options) {
    const opts = options || {};
    const today = opts.today || new Date().toISOString().slice(0, 10);
    const workOrders = opts.workOrders || [];
    const revenues = opts.revenues || [];
    const monthlyResults = opts.monthlyResults || [];
    const expenses = opts.expenses || [];
    const profitCtx = opts.profitCtx || this.buildProfitContext({
      today,
      revenues,
      expenses,
      workOrders,
      leads: opts.leads || [],
      intakes: opts.intakes || [],
      monthlyResults
    });

    const salesFlow = typeof RevenueSummaryBrain !== 'undefined'
      ? RevenueSummaryBrain.buildSalesFlowDiagnostics(workOrders, revenues, monthlyResults, today)
      : null;
    const profitDiag = this.buildProfitOperationsDiagnostics(profitCtx, {
      today,
      monthlyResults,
      revenues
    });
    const monthlyClosing = this.buildMonthlyClosingCheck({
      today,
      profitCtx,
      workOrders,
      revenues,
      monthlyResults,
      expenses
    });

    const revenueConfirmationQueueCount = monthlyClosing.revenueConfirmationQueueCount || 0;
    const expenseInputCount = monthlyClosing.expenseInputCount || 0;
    const inClosingPeriod = this.isMonthlyClosingPeriod(today);

    if (revenueConfirmationQueueCount > 0) {
      return {
        statusKey: 'revenue_queue',
        message: '売上確定待ちを確認してください。',
        primaryAction: {
          id: 'revenue_queue',
          label: '売上確定待ちを見る',
          view: 'dashboard',
          scrollSelector: '#daily-section-revenue-queue'
        },
        source: 'sales-flow'
      };
    }

    const needsExpense = expenseInputCount === 0
      || profitDiag.statusKey === 'no_expense'
      || (profitDiag.primaryAction && profitDiag.primaryAction.id === 'daily_expense')
      || monthlyClosing.statusKey === 'no_expense';
    if (needsExpense) {
      return {
        statusKey: 'no_expense',
        message: '使ったお金を経費入力に記録してください。',
        primaryAction: {
          id: 'daily_expense',
          label: '経費入力を見る',
          view: 'dashboard',
          scrollSelector: '#daily-section-expense'
        },
        source: 'profit'
      };
    }

    if (inClosingPeriod && (monthlyClosing.hasReconciliationGap || !monthlyClosing.hasMonthlyResult)) {
      const useReconciliation = monthlyClosing.hasReconciliationGap;
      return {
        statusKey: useReconciliation ? 'reconciliation_gap' : 'no_monthly',
        message: '月次締めチェックを確認してください。',
        primaryAction: {
          id: 'monthly_closing',
          label: '月次締めチェックを見る',
          view: useReconciliation ? 'revenue' : 'dashboard',
          scrollSelector: useReconciliation ? '#revenue-reconciliation-check' : '#exec-home-monthly-closing-check'
        },
        source: 'monthly-closing'
      };
    }

    const upcomingCount = monthlyClosing.upcomingScheduleCount
      || (salesFlow && salesFlow.upcomingScheduleCount)
      || 0;
    if (upcomingCount > 0) {
      return {
        statusKey: 'upcoming',
        message: '今後の売上予定を確認してください。',
        primaryAction: {
          id: 'upcoming',
          label: '売上予定を見る',
          view: 'revenue',
          scrollSelector: '#revenue-upcoming-schedule'
        },
        source: 'sales-flow'
      };
    }

    return {
      statusKey: 'ok',
      message: '今日の確認は大きな問題ありません。',
      primaryAction: null,
      source: 'none'
    };
  },

  buildDataConsistencyCheck(options) {
    const opts = options || {};
    const today = opts.today || new Date().toISOString().slice(0, 10);
    const monthKey = this.currentMonthKey(today);
    const revenues = opts.revenues || [];
    const expenses = opts.expenses || [];
    const workOrders = opts.workOrders || [];
    const monthlyResults = opts.monthlyResults || [];
    const settings = opts.settings || {};

    const revList = revenues || [];
    const revenueCount = revList.length;
    const workOrderList = (workOrders || []).map(w =>
      typeof WorkOrderBrain !== 'undefined' ? WorkOrderBrain.normalizeWorkOrder(w) : w
    );
    const workOrderCount = workOrderList.filter(w => {
      if (typeof WorkOrderBrain !== 'undefined') {
        return WorkOrderBrain.ACTIVE_STATUSES.includes(w.status) || w.status === 'completed';
      }
      return w.status !== 'cancelled' && w.status !== 'archived';
    }).length;
    const expenseCount = (expenses || []).length;

    const monthlyMonthKeys = new Set();
    (monthlyResults || []).forEach(r => {
      const key = typeof MonthlyResultsBrain !== 'undefined'
        ? MonthlyResultsBrain.normalizeMonth(r.month || r.id)
        : String(r.month || '').slice(0, 7);
      if (key) monthlyMonthKeys.add(key);
    });
    const monthlyResultsMonthCount = monthlyMonthKeys.size;

    const revById = new Map(revList.filter(r => r && r.id).map(r => [r.id, r]));
    const woById = new Map(workOrderList.filter(w => w && w.id).map(w => [w.id, w]));

    let revenueMissingDate = 0;
    let revenueMissingAmount = 0;
    let revenueMissingCustomer = 0;
    let revenueUnknownStatus = 0;
    let revenueLinkBroken = 0;

    revList.forEach(raw => {
      const r = typeof RevenueSummaryBrain !== 'undefined'
        ? RevenueSummaryBrain.normalizeRevenueRecord(raw)
        : raw;
      if (!r || r.status === 'キャンセル') return;
      if (typeof RevenueSummaryBrain !== 'undefined' && RevenueSummaryBrain.isRevenueCandidateRecord(r)) return;

      const date = typeof RevenueSummaryBrain !== 'undefined'
        ? RevenueSummaryBrain.getRevenueDate(r)
        : String(r.workDate || '').slice(0, 10);
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) revenueMissingDate += 1;

      const amt = typeof RevenueSummaryBrain !== 'undefined'
        ? RevenueSummaryBrain.getRevenueAmount(r)
        : Number(r.amount);
      if (amt == null || amt <= 0) revenueMissingAmount += 1;

      if (!String(r.customerName || r.leadName || '').trim()) revenueMissingCustomer += 1;

      const st = String(r.status || '').trim();
      const knownStatuses = typeof RevenueSummaryBrain !== 'undefined'
        ? [...RevenueSummaryBrain.CONFIRMED_STATUSES, '予定']
        : ['確定', '完了', '予定'];
      if (!st || !knownStatuses.includes(st)) revenueUnknownStatus += 1;

      const srcWoId = String(r.sourceWorkOrderId || '').trim();
      if (srcWoId) {
        const wo = woById.get(srcWoId);
        if (!wo || String(wo.actualRevenueId || '') !== String(r.id)) revenueLinkBroken += 1;
      }
    });

    let expenseMissingDate = 0;
    let expenseMissingAmount = 0;
    let expenseMissingCategory = 0;
    (expenses || []).forEach(raw => {
      const e = raw && typeof raw === 'object' ? raw : {};
      if (!String(e.date || '').trim()) expenseMissingDate += 1;
      const amt = Number(e.amount);
      if (!Number.isFinite(amt) || amt <= 0) expenseMissingAmount += 1;
      if (!String(e.category || '').trim()) expenseMissingCategory += 1;
    });
    const monthExpenses = this.filterMonthExpenses(expenses, monthKey);
    const monthExpenseInputCount = monthExpenses.length;

    const revenueQueueCount = typeof RevenueSummaryBrain !== 'undefined'
      ? RevenueSummaryBrain.countRevenueConfirmationQueue(workOrders, today)
      : 0;

    let futureInQueue = 0;
    let missingDedupeKey = 0;
    let orphanActualRevenueId = 0;

    workOrderList.forEach(wo => {
      if (typeof WorkCompletionBrain !== 'undefined' && !WorkCompletionBrain.isOperationalWorkOrder(wo)) return;
      if (wo.status === 'cancelled' || wo.status === 'archived') return;

      if (typeof WorkCompletionBrain !== 'undefined' && WorkCompletionBrain.needsCompletionConfirm(wo, today)) {
        if (wo.scheduledDate && wo.scheduledDate > today) futureInQueue += 1;
      }

      const calendarImport = typeof CalendarCandidateBrain !== 'undefined'
        ? CalendarCandidateBrain.isPastRecoverySourceWorkOrder(wo)
        : !!(wo.candidateMeta && wo.candidateMeta.importSource === 'calendar-paste');
      if (calendarImport && !String(wo.calendarDedupeKey || '').trim()) missingDedupeKey += 1;

      const actualId = String(wo.actualRevenueId || '').trim();
      if (actualId && !revById.has(actualId)) orphanActualRevenueId += 1;
    });

    const reconciliationRows = typeof MonthlyResultsBrain !== 'undefined'
      ? MonthlyResultsBrain.buildReconciliationReport(monthlyResults, revenues, {})
      : [];
    const gapMonths = reconciliationRows.filter(r => r.status === '差額あり').length;
    const monthlyOnlyMonths = reconciliationRows.filter(r => r.status === '月次実績のみ').length;
    const detailOnlyMonths = reconciliationRows.filter(r => r.status === '明細のみ').length;
    const hasReconciliationGap = gapMonths > 0;
    const currentMonthRow = typeof MonthlyResultsBrain !== 'undefined'
      ? MonthlyResultsBrain.buildReconciliationRow(monthKey, monthlyResults, revenues)
      : null;
    const currentMonthGap = !!(currentMonthRow && currentMonthRow.status === '差額あり');
    const hasCurrentMonthMonthly = typeof MonthlyResultsBrain !== 'undefined'
      ? !!MonthlyResultsBrain.findForMonth(monthlyResults, monthKey)
      : false;

    const revenueInputLeakCount = revenueMissingDate + revenueMissingAmount + revenueMissingCustomer
      + revenueUnknownStatus + revenueLinkBroken;
    const expenseInputLeakCount = expenseMissingDate + expenseMissingAmount + expenseMissingCategory;
    const workOrderIssueCount = futureInQueue + missingDedupeKey + orphanActualRevenueId;

    const notices = [];
    if (revenueQueueCount > 0) notices.push(`注意：売上確定待ちが${revenueQueueCount}件あります。`);
    if (monthExpenseInputCount === 0) notices.push('注意：今月の経費入力がまだありません。');
    if (hasReconciliationGap || currentMonthGap) notices.push('注意：月次実績と売上明細に差額があります。');
    if (monthlyOnlyMonths > 0) notices.push(`注意：月次実績のみの月が${monthlyOnlyMonths}件あります。`);
    if (detailOnlyMonths > 0) notices.push(`注意：売上明細のみの月が${detailOnlyMonths}件あります。`);
    if (!hasCurrentMonthMonthly) notices.push('注意：今月の月次実績が未入力です。');
    if (revenueInputLeakCount > 0) notices.push(`注意：売上明細の入力漏れが${revenueInputLeakCount}件あります。`);
    if (expenseInputLeakCount > 0) notices.push(`注意：経費入力の入力漏れが${expenseInputLeakCount}件あります。`);
    if (workOrderIssueCount > 0) notices.push(`注意：作業予定と売上確定のズレが${workOrderIssueCount}件あります。`);

    let reviewCount = 0;
    if (revenueQueueCount > 0) reviewCount += 1;
    if (monthExpenseInputCount === 0) reviewCount += 1;
    if (hasReconciliationGap || currentMonthGap) reviewCount += 1;
    if (monthlyOnlyMonths > 0) reviewCount += 1;
    if (detailOnlyMonths > 0) reviewCount += 1;
    if (!hasCurrentMonthMonthly) reviewCount += 1;
    if (revenueInputLeakCount > 0) reviewCount += 1;
    if (expenseInputLeakCount > 0) reviewCount += 1;
    if (workOrderIssueCount > 0) reviewCount += 1;

    let statusKey = 'ok';
    let statusLabel = '状態：大きな問題はありません';
    let nextAction = '大きな問題はありません。バックアップしてから運用を続けてください。';
    let primaryAction = {
      id: 'backup',
      label: 'バックアップを見る',
      view: 'data',
      scrollSelector: '.backup-status-card'
    };

    if (revenueQueueCount > 0) {
      statusKey = 'revenue_queue';
      statusLabel = '状態：売上確定待ちがあります';
      nextAction = '売上確定待ちを確認してください。';
      primaryAction = {
        id: 'revenue_queue',
        label: '売上確定待ちを見る',
        view: 'dashboard',
        scrollSelector: '#daily-section-revenue-queue'
      };
    } else if (monthExpenseInputCount === 0) {
      statusKey = 'no_expense';
      statusLabel = '状態：経費入力がまだありません';
      nextAction = '使ったお金を経費入力に記録してください。';
      primaryAction = {
        id: 'daily_expense',
        label: '経費入力を見る',
        view: 'dashboard',
        scrollSelector: '#daily-section-expense'
      };
    } else if (hasReconciliationGap || currentMonthGap) {
      statusKey = 'reconciliation_gap';
      statusLabel = '状態：確認が必要です';
      nextAction = '整合チェックを確認してください。';
      primaryAction = {
        id: 'reconciliation',
        label: '整合チェックを見る',
        view: 'revenue',
        scrollSelector: '#revenue-reconciliation-check'
      };
    } else if (revenueInputLeakCount > 0 || expenseInputLeakCount > 0 || workOrderIssueCount > 0) {
      statusKey = 'input_leaks';
      statusLabel = '状態：確認が必要です';
      nextAction = '入力漏れのあるデータを確認してください。';
      if (revenueInputLeakCount >= expenseInputLeakCount && revenueInputLeakCount >= workOrderIssueCount) {
        primaryAction = {
          id: 'revenue_input',
          label: '売上明細を確認する',
          view: 'revenue',
          scrollSelector: '#revenue-aggregation-card'
        };
      } else if (expenseInputLeakCount > 0) {
        primaryAction = {
          id: 'expense_input',
          label: '経費入力を見る',
          view: 'dashboard',
          scrollSelector: '#daily-section-expense'
        };
      } else {
        primaryAction = {
          id: 'work_order_gap',
          label: '売上確定待ちを見る',
          view: 'dashboard',
          scrollSelector: '#daily-section-revenue-queue'
        };
      }
    }

    const backupWarning = reviewCount > 0 && !settings.lastBackupAt
      ? 'バックアップ未実施です。修正前にバックアップしてください。'
      : (reviewCount > 0 ? '修正前にバックアップすることをおすすめします。' : '');

    return {
      today,
      monthKey,
      revenueCount,
      workOrderCount,
      expenseCount,
      monthlyResultsMonthCount,
      monthExpenseInputCount,
      revenueQueueCount,
      revenueInputLeakCount,
      expenseInputLeakCount,
      workOrderIssueCount,
      gapMonths,
      monthlyOnlyMonths,
      detailOnlyMonths,
      hasCurrentMonthMonthly,
      hasReconciliationGap,
      reviewCount,
      notices,
      statusKey,
      statusLabel,
      nextAction,
      primaryAction,
      backupWarning,
      revenueIssues: {
        missingDate: revenueMissingDate,
        missingAmount: revenueMissingAmount,
        missingCustomer: revenueMissingCustomer,
        unknownStatus: revenueUnknownStatus,
        linkBroken: revenueLinkBroken
      },
      expenseIssues: {
        missingDate: expenseMissingDate,
        missingAmount: expenseMissingAmount,
        missingCategory: expenseMissingCategory
      },
      workOrderIssues: {
        futureInQueue,
        missingDedupeKey,
        orphanActualRevenueId
      }
    };
  },

  OPERATIONS_START_TEST_PATTERNS: [
    'テスト', '確認', 'v499', '既存fmt', 'サンプル', 'dummy', 'sample'
  ],

  matchesOperationsStartTestPattern(text) {
    const raw = String(text || '');
    const lower = raw.toLowerCase();
    return this.OPERATIONS_START_TEST_PATTERNS.some(pattern => {
      if (/^[a-z]+$/i.test(pattern)) return lower.includes(pattern.toLowerCase());
      return raw.includes(pattern);
    });
  },

  isTestLikeWorkOrder(wo) {
    if (!wo || typeof wo !== 'object') return false;
    const haystack = [wo.customerName, wo.serviceText].map(v => String(v || '')).join(' ');
    return this.matchesOperationsStartTestPattern(haystack);
  },

  detectTestLikeWorkOrders(workOrders) {
    return (workOrders || []).filter(wo => this.isTestLikeWorkOrder(wo));
  },

  buildOperationsStartCheck(options) {
    const opts = options || {};
    const today = opts.today || new Date().toISOString().slice(0, 10);
    const settings = opts.settings || {};
    const workOrders = opts.workOrders || [];
    const consistency = this.buildDataConsistencyCheck({ ...opts, today });
    const upcoming = typeof RevenueSummaryBrain !== 'undefined'
      ? RevenueSummaryBrain.buildUpcomingRevenueScheduleSummary(workOrders, today)
      : { upcomingCount: 0 };

    const testLikeOrders = this.detectTestLikeWorkOrders(workOrders);
    const testLikeCount = testLikeOrders.length;
    const needsBackupCheck = !settings.lastBackupAt;
    let backupLabel = '確認してください';
    if (!needsBackupCheck) {
      backupLabel = typeof DataBackup !== 'undefined' && DataBackup.formatBackupDate
        ? DataBackup.formatBackupDate(settings.lastBackupAt)
        : '保存済み';
    }

    const upcomingCount = upcoming.upcomingCount || 0;
    const revenueQueueCount = consistency.revenueQueueCount || 0;
    const monthExpenseCount = consistency.monthExpenseInputCount || 0;
    const hasCurrentMonthMonthly = !!consistency.hasCurrentMonthMonthly;
    const monthlyLabel = hasCurrentMonthMonthly ? '入力済み' : '未入力';
    const consistencyReviewCount = consistency.reviewCount || 0;
    const consistencyLabel = consistencyReviewCount > 0
      ? `確認が必要な項目 ${consistencyReviewCount}件`
      : '問題なし';

    let statusKey = 'ok';
    let statusLabel = '状態：実運用を開始できます';
    let nextAction = '大きな問題はありません。実運用を開始できます。';
    let primaryAction = null;

    if (testLikeCount > 0) {
      statusKey = 'test_data';
      statusLabel = '状態：確認が必要です';
      nextAction = 'テストデータを確認してください。';
      primaryAction = {
        id: 'test_data',
        label: '予定取り込みを見る',
        view: 'calendar-candidate',
        scrollSelector: '#calendar-candidate-saved-list'
      };
    } else if (needsBackupCheck) {
      statusKey = 'backup';
      statusLabel = '状態：確認が必要です';
      nextAction = '実運用前にバックアップを確認してください。';
      primaryAction = {
        id: 'backup',
        label: 'バックアップを見る',
        view: 'data',
        scrollSelector: '.backup-status-card'
      };
    } else if (revenueQueueCount > 0) {
      statusKey = 'revenue_queue';
      statusLabel = '状態：確認が必要です';
      nextAction = '売上確定待ちを確認してください。';
      primaryAction = {
        id: 'revenue_queue',
        label: '売上確定待ちを見る',
        view: 'dashboard',
        scrollSelector: '#daily-section-revenue-queue'
      };
    } else if (monthExpenseCount === 0) {
      statusKey = 'no_expense';
      statusLabel = '状態：確認が必要です';
      nextAction = '使ったお金を経費入力に記録してください。';
      primaryAction = {
        id: 'daily_expense',
        label: '経費入力を見る',
        view: 'dashboard',
        scrollSelector: '#daily-section-expense'
      };
    } else if (!hasCurrentMonthMonthly) {
      statusKey = 'no_monthly';
      statusLabel = '状態：確認が必要です';
      nextAction = '月次実績を確認してください。';
      primaryAction = {
        id: 'monthly_results',
        label: '月次実績を見る',
        view: 'monthly-results',
        scrollSelector: '#monthly-results-form-card'
      };
    } else if (consistencyReviewCount > 0) {
      statusKey = 'consistency';
      statusLabel = '状態：確認が必要です';
      nextAction = 'データ整合チェックを確認してください。';
      primaryAction = {
        id: 'consistency',
        label: 'データ整合チェックを見る',
        view: 'data',
        scrollSelector: '#data-consistency-check'
      };
    }

    return {
      today,
      statusKey,
      statusLabel,
      backupLabel,
      needsBackupCheck,
      upcomingCount,
      revenueQueueCount,
      monthExpenseCount,
      monthlyLabel,
      hasCurrentMonthMonthly,
      consistencyReviewCount,
      consistencyLabel,
      testLikeCount,
      testLikeOrders,
      nextAction,
      primaryAction
    };
  }
};
