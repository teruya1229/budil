/**
 * Budil v4.4 - 経営司令塔ホーム（毎朝5分・全番頭統合）
 */
const ExecutiveBrain = {
  VERSION: 'v4.4.9',

  CHECK_ITEMS: [
    { id: 'workOrders', label: '作業予定を確認した' },
    { id: 'reception', label: '新規受付を確認した' },
    { id: 'revenueProfit', label: '売上/利益を確認した' },
    { id: 'followUp', label: 'フォロー/口コミを確認した' },
    { id: 'analyticsDemand', label: 'アナリティクス/需要を確認した' },
    { id: 'dailyTasks', label: '今日やることを確認した' },
    { id: 'backupDiagnostic', label: 'バックアップ/データ診断を確認した' }
  ],

  QUICK_LINKS: [
    { id: 'reception', label: '受付・予定', view: 'reception', tier: 'primary' },
    { id: 'revenue', label: '売上・利益', view: 'revenue', tier: 'primary' },
    { id: 'analytics', label: '集客・需要', view: 'analytics', tier: 'primary' },
    { id: 'tasks', label: '今日やること', action: 'tasks', tier: 'primary' },
    { id: 'monthly-results', label: '月次実績を入れる', view: 'monthly-results', tier: 'secondary' },
    { id: 'external-check', label: '外部チェックを保存', view: 'external-check', tier: 'secondary' },
    { id: 'morning-report', label: '朝レポートを見る', action: 'morning-report', tier: 'secondary' }
  ],

  hasHomeData(ctx) {
    const c = ctx || {};
    return !!(c.workOrders && c.workOrders.length)
      || !!(c.intakes && c.intakes.length)
      || !!(c.revenues && c.revenues.length)
      || !!(c.expenses && c.expenses.length)
      || !!(c.pickups && c.pickups.length)
      || !!(c.analyticsRecords && c.analyticsRecords.length)
      || !!(c.leads && c.leads.length)
      || !!(c.dailyTasks && c.dailyTasks.length);
  },

  buildContext(raw) {
    const today = raw.today || new Date().toISOString().slice(0, 10);
    const workOrders = (raw.workOrders || []).map(w => WorkOrderBrain.normalizeWorkOrder(w));
    const intakes = (raw.intakes || []).map(i => ReceptionBrain.normalizeIntake(i));
    const followTargets = raw.followUpTargets || [];
    const revCtx = raw.revCtx || {};
    const profitCtx = raw.profitCtx || {};
    const analyticsCtx = raw.analyticsCtx || {};
    const mapCtx = raw.mapCtx || { warnings: [], summary: [] };
    const forecast = WorkOrderBrain.getSalesForecast(workOrders, raw.revenues || [], today);
    const completionSummary = typeof WorkCompletionBrain !== 'undefined'
      ? WorkCompletionBrain.summarizeTargets(workOrders, raw.revenues || [], today)
      : {};
    const todayWork = WorkOrderBrain.getTodayWorkOrders(workOrders, today);
    const receptionSummary = ReceptionBrain.getReceptionSummary(intakes, today);
    const pendingReceptions = this.getPendingReceptions(intakes);
    const ctx = {
      today,
      workOrders,
      intakes,
      leads: raw.leads || [],
      pendingReceptions,
      receptionSummary,
      followTargets,
      revCtx,
      profitCtx,
      analyticsCtx,
      mapCtx,
      forecast,
      completionSummary,
      todayWork,
      pickups: raw.pickups || [],
      dailyTasks: raw.dailyTasks || [],
      leads: raw.leads || [],
      settings: raw.settings || {},
      checkState: raw.checkState || null,
      diagnosticLevels: raw.diagnosticLevels || null,
      perfCtx: raw.perfCtx || {}
    };
    ctx.summary = this.buildExecutiveSummary(ctx);
    ctx.topPriorities = this.buildTopPriorities(ctx);
    ctx.workSection = this.buildTodayWorkSection(ctx);
    ctx.receptionSection = this.buildReceptionSection(ctx);
    ctx.revenueProfitSection = this.buildRevenueProfitSection(ctx);
    ctx.followUpSection = this.buildFollowUpSection(ctx);
    ctx.analyticsDemandSection = this.buildAnalyticsDemandSection(ctx);
    ctx.warnings = this.buildWarnings(ctx);
    ctx.morningReport = this.buildMorningExecutiveReport(ctx);
    return ctx;
  },

  buildExecutiveSummary(ctx) {
    const c = ctx || {};
    if (!this.hasHomeData(c)) {
      return {
        isEmpty: true,
        lines: ['まだ判断材料が少ないため、デモデータ作成または受付・売上・アナリティクスの入力から始めてください。']
      };
    }
    const lines = [];
    const push = line => { if (line && !lines.includes(line)) lines.push(line); };

    if (c.forecast && c.forecast.todayCount) {
      push(`今日は作業予定${c.forecast.todayCount}件、見込み売上${WorkOrderBrain.formatYen(c.forecast.todayAmount)}です。`);
    }

    const bb = c.analyticsCtx && c.analyticsCtx.browserBantou;
    if (bb && bb.hasTodayImport && (bb.overallComment || bb.adDecision)) {
      if (bb.overallComment) push(bb.overallComment);
      if (bb.adDecision) push(bb.adDecision);
    } else {
      const analyticsComment = typeof AnalyticsBrain !== 'undefined'
        ? AnalyticsBrain.buildHomeComment(c.analyticsCtx)
        : '';
      if (analyticsComment) push(analyticsComment.replace(/^ブラウザー番頭確認：/, ''));
    }

    const intakeComment = ReceptionBrain.buildReceptionHomeCommentFromIntakes(c.intakes);
    if (intakeComment) push(intakeComment);

    const profitComment = typeof ProfitBrain !== 'undefined'
      ? ProfitBrain.buildHomeComment(c.profitCtx)
      : '';
    if (profitComment) push(profitComment);

    const followComment = typeof FollowUpBrain !== 'undefined'
      ? FollowUpBrain.buildHomeComment(c.followTargets)
      : '';
    if (followComment) push(followComment);

    if (typeof CalendarCandidateBrain !== 'undefined') {
      const calComment = CalendarCandidateBrain.buildHomeComment(
        CalendarCandidateBrain.summarizeCandidates(c.workOrders, c.today)
      );
      if (calComment) push(calComment);
    }

    if (typeof WorkCompletionBrain !== 'undefined') {
      const completionComment = WorkCompletionBrain.buildHomeComment(c.completionSummary);
      if (completionComment) push(completionComment);
    }

    const rev = c.revCtx.summary || {};
    if (rev.monthlyTarget > 0 && rev.remainingToTarget > 0) {
      push(`売上目標まではあと${RevenueBrain.formatYen(rev.remainingToTarget)}です。`);
    }

    if (!lines.length && c.revCtx.managementComment && c.revCtx.managementComment.lines) {
      return { isEmpty: false, lines: c.revCtx.managementComment.lines.slice(0, 3) };
    }

    return { isEmpty: false, lines: lines.slice(0, 3) };
  },

  getPendingReceptions(intakes) {
    const skip = new Set(['done', 'archived', 'work_scheduled']);
    return (intakes || [])
      .map(i => ReceptionBrain.normalizeIntake(i))
      .filter(i => !skip.has(i.status))
      .filter(i =>
        i.status === 'new'
        || i.status === 'lead_created'
        || i.status === 'task_created'
        || i.status === 'revenue_candidate'
        || !i.relatedLeadId
        || !i.relatedWorkOrderId
      )
      .slice(0, 8);
  },

  rankPriorityItems(items) {
    return (items || []).slice().sort((a, b) => {
      const pa = Number(a.rank) || 99;
      const pb = Number(b.rank) || 99;
      if (pa !== pb) return pa - pb;
      return (a.title || '').localeCompare(b.title || '');
    });
  },

  buildTopPriorities(ctx) {
    const c = ctx || {};
    const today = c.today;
    const items = [];
    const seen = new Set();
    const add = item => {
      const key = item.dedupeKey || item.id || item.title;
      if (!item.title || seen.has(key)) return;
      seen.add(key);
      items.push(item);
    };

    (c.todayWork || []).forEach(wo => {
      add({
        id: 'wo-' + wo.id,
        rank: 1,
        title: `作業予定：${wo.customerName || 'お客様'} ${wo.serviceText || ''}`.trim(),
        reason: wo.startTime
          ? `今日${wo.startTime}〜の確定作業。作業後に売上登録まで行う`
          : '今日の確定作業。作業後に売上登録まで行う',
        source: '作業予定',
        sourceKey: 'work-order',
        workOrderId: wo.id,
        dedupeKey: ['exec-priority', today, 'work-order', wo.id].join('|'),
        taskDedupeKey: ['work-order', today, wo.id, '作業予定'].join('|')
      });
    });

    (c.pendingReceptions || []).slice(0, 3).forEach(intake => {
      const needsLead = !intake.relatedLeadId;
      const needsSchedule = intake.status === 'new' || /日程|希望日/.test(
        [intake.preferredDatesText, intake.handlingStatus].join('')
      );
      add({
        id: 'intake-' + intake.id,
        rank: 2,
        title: needsLead
          ? `受付対応：${intake.customerName || 'お客様'}（営業先未作成）`
          : `受付対応：${intake.customerName || 'お客様'}`,
        reason: needsSchedule
          ? `新規受付。${intake.serviceText || '作業内容'}の日程調整が必要`
          : `新規受付。${intake.source || '依頼元'}からの問い合わせ`,
        source: '受付・予約',
        sourceKey: 'reception',
        intakeId: intake.id,
        dedupeKey: ['exec-priority', today, 'intake', intake.id].join('|'),
        taskDedupeKey: ['intake', today, intake.id, intake.customerName].join('|')
      });
    });

    (c.followTargets || []).filter(t => t.needsReview || t.needsThanks).slice(0, 2).forEach(target => {
      const type = target.needsThanks ? 'thanks' : 'review';
      const label = target.needsThanks ? 'お礼LINE' : '口コミ依頼';
      add({
        id: 'follow-' + target.id + '-' + type,
        rank: 3,
        title: `${label}：${target.customerName || target.leadName || 'お客様'}`,
        reason: target.needsThanks
          ? '作業完了済み・お礼未送信'
          : '作業完了済み・口コミ依頼未対応',
        source: 'フォロー',
        sourceKey: 'follow-up',
        followTargetId: target.id,
        followType: type,
        dedupeKey: ['exec-priority', today, 'follow', target.id, type].join('|')
      });
    });

    const analyticsPages = (c.analyticsCtx && c.analyticsCtx.highBounce) || [];
    analyticsPages.slice(0, 2).forEach(page => {
      if (Number(page.views) < 10) return;
      add({
        id: 'analytics-' + (page.id || page.pageName),
        rank: 4,
        title: `LP改善：${page.pageName}`,
        reason: `閲覧${page.views}・直帰率${page.bounceRate}%。CTAとファーストビュー改善を優先`,
        source: 'アナリティクス',
        sourceKey: 'analytics',
        analyticsId: page.id,
        dedupeKey: ['exec-priority', today, 'analytics', page.id || page.pageName].join('|')
      });
    });

    const profitHints = (c.profitCtx && c.profitCtx.hints) || [];
    profitHints.slice(0, 1).forEach(hint => {
      add({
        id: 'profit-' + (hint.type || 'hint'),
        rank: 5,
        title: hint.title || '利益改善を確認',
        reason: hint.detail || '支出・粗利の注意点を確認',
        source: '利益サマリー',
        sourceKey: 'profit',
        dedupeKey: ['exec-priority', today, 'profit', hint.type].join('|')
      });
    });

    const focusRecs = typeof DemandBrain !== 'undefined' && c.perfCtx
      ? DemandBrain.getFocusRecommendations(c.pickups, c.revCtx.records, c.leads, 2, today)
      : [];
    focusRecs.forEach(rec => {
      add({
        id: 'demand-' + (rec.pickupId || rec.topic),
        rank: 6,
        title: `需要：${rec.topic}`,
        reason: rec.nextStep || rec.reason || '需要ピックアップの高優先アクション',
        source: '需要ピックアップ',
        sourceKey: 'pickup',
        pickupId: rec.pickupId,
        dedupeKey: ['exec-priority', today, 'demand', rec.topic].join('|')
      });
    });

    (c.dailyTasks || []).filter(t => t.status !== 'done').slice(0, 2).forEach(task => {
      add({
        id: 'task-' + task.id,
        rank: 7,
        title: task.title,
        reason: task.reason || task.action || '今日やること',
        source: '今日やること',
        sourceKey: 'task',
        taskId: task.id,
        dedupeKey: ['exec-priority', today, 'task', task.id].join('|')
      });
    });

    return this.rankPriorityItems(items).slice(0, 3);
  },

  buildTodayWorkSection(ctx) {
    const orders = (ctx.todayWork || []).map(wo => {
      const area = WorkOrderBrain.getWorkOrderArea(wo);
      const warnings = [];
      if (!WorkOrderBrain.isValidTime(wo.startTime)) warnings.push('時間未設定');
      if (!(wo.address || '').trim()) warnings.push('住所未入力');
      if (wo.status === 'completed' && !wo.actualRevenueId) warnings.push('売上未登録');
      const cal = WorkOrderBrain.buildGoogleCalendarUrl(wo);
      return {
        ...wo,
        area,
        warnings,
        calendarUrl: cal.url,
        calendarReady: cal.ready,
        statusLabel: WorkOrderBrain.STATUS_LABELS[wo.status] || wo.status
      };
    });
    return {
      items: orders,
      count: orders.length,
      totalAmount: WorkOrderBrain.sumEstimate(orders),
      completedNoRevenue: (ctx.forecast && ctx.forecast.completedNoRevenueCount) || 0
    };
  },

  buildReceptionSection(ctx) {
    const items = (ctx.pendingReceptions || []).map(intake => {
      const area = typeof MapBrain !== 'undefined' ? MapBrain.getIntakeArea(intake) : (intake.area || '不明');
      let nextAction = '内容を確認';
      if (!intake.relatedLeadId) nextAction = '営業先を作成';
      else if (!intake.relatedWorkOrderId) nextAction = '作業予定を作成';
      else if (intake.status === 'revenue_candidate') nextAction = '売上候補を反映';
      else if (/日程|希望日/.test([intake.preferredDatesText, intake.handlingStatus].join(''))) {
        nextAction = '日程調整';
      }
      return { ...intake, area, nextAction };
    });
    return {
      items,
      count: items.length,
      newCount: (ctx.receptionSummary && ctx.receptionSummary.newCount) || 0
    };
  },

  buildRevenueProfitSection(ctx) {
    const rev = ctx.revCtx || {};
    const summary = rev.summary || {};
    const ps = (ctx.profitCtx && ctx.profitCtx.summary) || {};
    const forecast = ctx.forecast || {};
    const usesMonthly = !!ps.usesMonthlyResult;
    const monthRevenue = usesMonthly ? (ps.monthRevenue || 0) : (summary.planned || 0);
    const achievementRate = summary.monthlyTarget > 0
      ? Math.round((monthRevenue / summary.monthlyTarget) * 1000) / 10
      : (summary.achievementRate || 0);
    const cautions = [];
    if (!usesMonthly && summary.monthlyTarget > 0 && summary.achievementRate < 50) {
      cautions.push('月間目標に対して不足気味です');
    }
    if (usesMonthly && summary.monthlyTarget > 0 && achievementRate < 50) {
      cautions.push('月間目標に対して不足気味です');
    }
    if (ps.monthExpense > 0 && ps.monthGrossProfit < 0) cautions.push('今月は赤字注意です');
    if (!usesMonthly && ps.adExpense > 0 && summary.planned < ps.adExpense * 4) cautions.push('広告費注意');
    if (!usesMonthly && ps.unlinkedCount > 0) cautions.push(`未紐付け支出${ps.unlinkedCount}件`);
    if (!usesMonthly) {
      const deficitCount = ((ctx.profitCtx && ctx.profitCtx.revenueRows) || [])
        .filter(r => r.label === '赤字注意').length;
      if (deficitCount) cautions.push(`赤字注意の売上${deficitCount}件`);
    }
    if (!usesMonthly && rev.salesOutcome && rev.salesOutcome.unlinkedTotal > 0) {
      cautions.push('未紐付け売上あり');
    }
    const revenueAggregation = rev.revenueSummary || (typeof RevenueSummaryBrain !== 'undefined'
      ? RevenueSummaryBrain.buildFullSummary(rev.records || [], { year: (ctx.today || '').slice(0, 4) }, ctx.today, {
        workOrders: ctx.workOrders || [],
        intakes: ctx.intakes || []
      })
      : null);
    return {
      monthRevenue,
      monthlyTarget: summary.monthlyTarget || 0,
      achievementRate,
      monthExpense: ps.monthExpense || 0,
      grossProfit: ps.monthGrossProfit || 0,
      grossRate: ps.monthGrossRate || 0,
      weekForecast: forecast.weekAmount || 0,
      completedNoRevenue: forecast.completedNoRevenueCount || 0,
      cautions,
      revenueAggregation,
      usesMonthlyResult: usesMonthly,
      aggregationSourceNote: ps.aggregationSourceNote || ''
    };
  },

  buildFollowUpSection(ctx) {
    const targets = ctx.followTargets || [];
    const thanks = targets.filter(t => t.needsThanks);
    const review = targets.filter(t => t.needsReview);
    const repeat = targets.filter(t => t.needsRepeat);
    const todayItems = targets.filter(t =>
      t.needsThanks || t.needsReview || (t.maintenanceNear && t.needsRepeat)
    ).slice(0, 5);
    return {
      thanksCount: thanks.length,
      reviewCount: review.length,
      repeatCount: repeat.length,
      todayItems
    };
  },

  buildAnalyticsDemandSection(ctx) {
    const ac = ctx.analyticsCtx || {};
    const bb = ac.browserBantou || {};
    const lines = [];
    if (bb.hasTodayImport) {
      if (bb.overallComment) lines.push(bb.overallComment);
      if (bb.adDecision) lines.push(bb.adDecision);
    } else if (ac.todayConclusion) {
      lines.push(ac.todayConclusion);
    }
    const top = (ac.topDemand || []).slice(0, 2);
    top.forEach(p => lines.push(`${p.pageName}：需要スコア${p.demandScore}（${p.scoreLabel}）`));
    const bounce = (ac.highBounce || []).slice(0, 2);
    bounce.forEach(p => lines.push(`離脱注意：${p.pageName}（直帰${p.bounceRate}%）`));
    const ideas = (ac.contentIdeas || []).slice(0, 2);
    ideas.forEach(i => lines.push(i.idea));
    const adLabel = bb.adDecision || (ac.adReadiness && ac.adReadiness.label) || '';
    if (adLabel && !lines.some(l => l.includes(adLabel))) {
      lines.push(`広告判断：${adLabel}`);
    }
    const demandTop = typeof DemandBrain !== 'undefined'
      ? DemandBrain.buildMorningDemandLines(ctx.pickups, ctx.today).slice(0, 2)
      : [];
    return {
      lines: lines.slice(0, 6),
      demandLines: demandTop,
      browserImported: bb.hasTodayImport,
      strongCount: ac.strongCount || 0,
      bounceCount: ac.bounceCount || 0,
      adDecision: adLabel
    };
  },

  buildWarnings(ctx) {
    const warnings = [];
    const add = (level, text, sourceKey) => {
      if (!text) return;
      warnings.push({ level: level || '注意', text, sourceKey: sourceKey || '' });
    };
    const today = ctx.today;

    if (ctx.diagnosticLevels) {
      (ctx.diagnosticLevels.critical || []).forEach(t =>
        add('重大', t, 'diagnostic')
      );
      (ctx.diagnosticLevels.review || []).slice(0, 3).forEach(t =>
        add('確認', t, 'diagnostic')
      );
      (ctx.diagnosticLevels.caution || []).slice(0, 3).forEach(t =>
        add('注意', t, 'diagnostic')
      );
    }

    if ((ctx.pendingReceptions || []).length) {
      add('注意', `新規受付未対応：${ctx.pendingReceptions.length}件`, 'reception');
    }

    WorkOrderBrain.buildWorkOrderWarnings(
      ctx.workOrders, ctx.leads, ctx.intakes, ctx.revCtx.records, today
    ).forEach(w => add('注意', w, 'work-order'));

    if (typeof FollowUpBrain !== 'undefined') {
      FollowUpBrain.buildWarnings(ctx.followTargets, today).forEach(w => add('注意', w, 'follow-up'));
    }

    if (typeof ProfitBrain !== 'undefined') {
      ProfitBrain.buildWarnings(ctx.profitCtx).forEach(w => add('注意', w, 'profit'));
    }

    if (typeof AnalyticsBrain !== 'undefined') {
      AnalyticsBrain.buildWarnings(ctx.analyticsCtx).forEach(w => add('注意', w, 'analytics'));
    }

    ReceptionBrain.getReceptionWarnings(ctx.intakes).forEach(w => add('注意', w, 'reception'));

    if (typeof CalendarCandidateBrain !== 'undefined') {
      CalendarCandidateBrain.buildWarnings(
        CalendarCandidateBrain.summarizeCandidates(ctx.workOrders, today)
      ).forEach(w => add('注意', w, 'calendar-candidate'));
    }
    if (typeof WorkCompletionBrain !== 'undefined') {
      WorkCompletionBrain.buildWarnings(ctx.workOrders, ctx.revCtx.records || [], today)
        .forEach(w => add('注意', w, 'work-completion'));
    }

    (ctx.mapCtx.warnings || []).forEach(w => {
      if (w.type === 'far' && w.items && w.items[0]) {
        add('注意', `遠方・移動注意：${w.items[0].area} ${w.items[0].name}`, 'area');
      }
      if (w.type === 'no-address' && w.items) {
        const n = w.items.length;
        if (n) add('注意', `住所未入力：${n}件`, 'area');
      }
    });

    if (!ctx.settings.lastBackupAt) {
      add('確認', 'バックアップ未実施です', 'backup');
    }

    const seen = new Set();
    const unique = [];
    warnings.forEach(w => {
      const key = w.level + '|' + w.text;
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(w);
    });

    const order = { '重大': 0, '注意': 1, '確認': 2 };
    return unique.sort((a, b) => (order[a.level] || 9) - (order[b.level] || 9)).slice(0, 10);
  },

  buildMorningExecutiveReport(ctx) {
    const c = ctx || {};
    const sections = [];
    sections.push({
      title: '今日の結論',
      lines: (c.summary && c.summary.lines) || []
    });
    sections.push({
      title: '今日の最優先3つ',
      lines: (c.topPriorities || []).map((p, i) =>
        `${i + 1}. ${p.title} — ${p.reason}`
      )
    });
    const workLines = (c.workSection.items || []).map(wo =>
      `・${wo.startTime || '—'} ${wo.customerName} ${wo.serviceText}（${wo.area}）`
    );
    sections.push({ title: '作業予定', lines: workLines.length ? workLines : ['なし'] });
    const recLines = (c.receptionSection.items || []).map(i =>
      `・${i.customerName}：${i.serviceText || '—'}（${i.nextAction}）`
    );
    sections.push({ title: '新規受付', lines: recLines.length ? recLines : ['なし'] });
    if (typeof CalendarCandidateBrain !== 'undefined') {
      const calLines = CalendarCandidateBrain.buildMorningReport(
        CalendarCandidateBrain.summarizeCandidates(c.workOrders, c.today)
      );
      if (calLines.length) sections.push({ title: '予定候補', lines: calLines.slice(1) });
    }
    if (typeof WorkCompletionBrain !== 'undefined') {
      const completionLines = WorkCompletionBrain.buildMorningReport(c.completionSummary);
      if (completionLines.length) sections.push({ title: '作業後確定', lines: completionLines.slice(1) });
    }
    const rp = c.revenueProfitSection || {};
    sections.push({
      title: '売上・利益',
      lines: [
        `今月売上 ${RevenueBrain.formatYen(rp.monthRevenue)} / 目標 ${RevenueBrain.formatYen(rp.monthlyTarget)}（${rp.achievementRate}%）`,
        `支出 ${ProfitBrain.formatYen(rp.monthExpense)} / 粗利 ${ProfitBrain.formatYen(rp.grossProfit)}（${ProfitBrain.formatRate(rp.grossRate)}）`,
        rp.completedNoRevenue ? `作業完了・売上未登録 ${rp.completedNoRevenue}件` : ''
      ].filter(Boolean)
    });
    const fu = c.followUpSection || {};
    sections.push({
      title: 'フォロー・口コミ',
      lines: [
        fu.thanksCount ? `お礼未送信 ${fu.thanksCount}件` : '',
        fu.reviewCount ? `口コミ依頼未送信 ${fu.reviewCount}件` : '',
        fu.repeatCount ? `リピート確認 ${fu.repeatCount}件` : ''
      ].filter(Boolean)
    });
    sections.push({
      title: 'アナリティクス・需要',
      lines: [
        ...(c.analyticsDemandSection.lines || []),
        ...(c.analyticsDemandSection.demandLines || [])
      ]
    });
    sections.push({
      title: '注意・保留',
      lines: (c.warnings || []).map(w => `・[${w.level}] ${w.text}`)
    });
    return sections;
  },

  getQuickLinks() {
    return this.QUICK_LINKS.slice();
  },

  getPrimaryQuickLinks() {
    return this.QUICK_LINKS.filter(l => l.tier === 'primary');
  },

  getSecondaryQuickLinks() {
    return this.QUICK_LINKS.filter(l => l.tier !== 'primary');
  },

  splitWarningsForDisplay(warnings) {
    const list = warnings || [];
    const primary = list.filter(w => w.level === '重大' || w.level === '注意');
    const review = list.filter(w => w.level === '確認');
    return {
      visible: primary.slice(0, 3),
      more: primary.slice(3),
      review
    };
  },

  normalizeCheckState(raw) {
    const items = {};
    this.CHECK_ITEMS.forEach(item => {
      items[item.id] = !!(raw && raw.items && raw.items[item.id]);
    });
    return {
      checkedAt: (raw && raw.checkedAt) || '',
      memo: (raw && raw.memo) || '',
      version: (raw && raw.version) || this.VERSION,
      items
    };
  },

  buildCheckPayload(existing, updates) {
    const prev = this.normalizeCheckState(existing);
    const nextItems = { ...prev.items, ...(updates && updates.items ? updates.items : {}) };
    const allChecked = this.CHECK_ITEMS.every(item => nextItems[item.id]);
    return {
      checkedAt: allChecked ? new Date().toISOString() : (prev.checkedAt || ''),
      memo: updates && updates.memo != null ? updates.memo : prev.memo,
      version: this.VERSION,
      items: nextItems
    };
  }
};
