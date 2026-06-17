/**
 * Budil MVP v0.1 - メインアプリケーション
 */
(function () {
  'use strict';

  let currentFollowupFilter = 'all';
  let currentMessageLeadId = null;
  let pendingImport = null;
  let currentSalesTab = 'email';
  let currentSalesMessages = null;
  let pickupBulkPreview = [];
  let selectedPickupContentId = null;
  let weeklyStrategyPeriod = '7d';

  const SALES_TAB_FIELDS = { email: 'msg-email', form: 'msg-form', dm: 'msg-dm', phone: 'msg-phone' };
  const SALES_TAB_LOG = { email: 'メール送信', form: 'フォーム送信', dm: 'DM', phone: '電話' };
  const ACTIVITY_TYPE_LABELS = {
    'task-done': 'タスク完了',
    contact: '連絡',
    proposal: '提案',
    'payment-check': '入金確認',
    'work-memo': '作業メモ',
    other: 'その他'
  };
  const SALES_STATUS_TO_LEGACY = {
    '未営業': '未接触',
    '初回連絡済み': 'アプローチ中',
    '興味あり': '商談中',
    '見積り・提案中': '商談中',
    '日程調整中': '商談中',
    '成約': '成約',
    '見送り': '見送り'
  };

  // ── 営業プリセット（v1.6）──
  // 目的: 営業先登録の最初に「何を売るか」を選ぶだけで、入力/提案/文面生成を揃える
  let currentSalesPreset = 'ai_docs';

  const SALES_PRESETS = {
    ai_docs: {
      label: 'AI帳票番頭を売る',
      service: 'AI帳票番頭',
      priority: 'A',
      status: '未接触',
      nextContactOffsetDays: 3,
      memoTemplate: '【AI帳票番頭を売る】\n・受付〜請求〜帳票の手間を減らす\n・まず現状ヒアリングから提案'
    },
    ads: {
      label: '広告番頭を売る',
      service: '広告番頭',
      priority: 'B',
      status: '未接触',
      nextContactOffsetDays: 5,
      memoTemplate: '【広告番頭を売る】\n・問い合わせ導線の整理\n・最初の一歩から相談'
    },
    ai_consult: {
      label: 'AI導入コンサルを売る',
      service: 'AI導入コンサル',
      priority: 'B',
      status: '未接触',
      nextContactOffsetDays: 7,
      memoTemplate: '【AI導入コンサルを売る】\n・業務棚卸しから無理のないAI導入\n・何から始めるかを一緒に整理'
    },
    bc_clean: {
      label: 'BCサービス清掃営業',
      service: 'BCサービス',
      priority: 'B',
      status: '未接触',
      nextContactOffsetDays: 7,
      memoTemplate: '【BCサービス清掃営業】\n・店舗/施設の品質を安定維持\n・定期対応の提案'
    },
    washer: {
      label: '洗濯機クリーニング営業',
      service: '洗濯機クリーニング',
      priority: 'B',
      status: '未接触',
      nextContactOffsetDays: 5,
      memoTemplate: '【洗濯機クリーニング営業】\n・カビ臭い/乾燥不良の改善\n・まず現場の状況を確認して提案'
    },
    ac_corp: {
      label: 'エアコンクリーニング法人営業',
      service: 'エアコンクリーニング',
      priority: 'A',
      status: '未接触',
      nextContactOffsetDays: 3,
      memoTemplate: '【エアコンクリーニング法人営業】\n・法人向けに定期対応で品質維持\n・運用に合わせた清掃提案'
    }
  };

  function toISODateLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function addDaysFromToday(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + Number(offsetDays || 0));
    return toISODateLocal(d);
  }

  function applySalesPresetToLeadForm(presetKey) {
    const preset = SALES_PRESETS[presetKey] || SALES_PRESETS.ai_docs;

    const hidden = document.getElementById('lead-sales-preset');
    if (hidden) hidden.value = presetKey;

    const setIfExists = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value;
    };

    setIfExists('lead-service', preset.service);
    setIfExists('lead-priority', preset.priority);
    setIfExists('lead-status', preset.status);
    setIfExists('lead-memo', preset.memoTemplate);
    setIfExists('lead-last-contact', '');

    if (preset.nextContactOffsetDays !== undefined && preset.nextContactOffsetDays !== null) {
      const nextDate = addDaysFromToday(preset.nextContactOffsetDays);
      setIfExists('lead-next-contact', nextDate);
    }
  }

  function migrateV17Leads() {
    Storage.migrateV17();
  }

  function salesStatusClass(status) {
    const map = {
      '未営業': 'not-started',
      '初回連絡済み': 'contacted',
      '興味あり': 'interested',
      '見積り・提案中': 'proposal',
      '日程調整中': 'scheduling',
      '成約': 'won',
      '見送り': 'lost'
    };
    return map[status] || 'not-started';
  }

  function renderSalesMgmtPreview(lead) {
    const enriched = SalesBrain.enrichLead(lead, Storage.getGeneratedPosts(), Storage.getSettings(), TODAY());
    const priEl = document.getElementById('sales-mgmt-priority');
    const reasonEl = document.getElementById('sales-mgmt-priority-reason');
    if (priEl) {
      priEl.textContent = enriched.priorityLabel || '—';
      priEl.className = 'sales-priority-label priority-' + (enriched.priorityLevel || 'low');
    }
    if (reasonEl) {
      reasonEl.textContent = enriched.priorityReason || '';
      reasonEl.classList.toggle('sales-priority-warning', !lead.nextAction && !enriched.nextAction);
    }
    const detailPri = document.getElementById('sales-detail-priority');
    const detailReason = document.getElementById('sales-detail-reason');
    if (detailPri) {
      detailPri.textContent = enriched.priorityLabel || '—';
      detailPri.className = 'sales-priority-label priority-' + (enriched.priorityLevel || 'low');
    }
    if (detailReason) {
      detailReason.textContent = enriched.priorityReason || '—';
    }
  }

  function populateSalesMgmtForm(lead) {
    const statusEl = document.getElementById('sales-mgmt-status');
    const nextDateEl = document.getElementById('sales-mgmt-next-date');
    const nextActionEl = document.getElementById('sales-mgmt-next-action');
    const lastContactEl = document.getElementById('sales-mgmt-last-contact');
    const normalized = SalesBrain.normalizeLead(lead);
    if (statusEl) statusEl.value = normalized.salesStatus;
    if (nextDateEl) nextDateEl.value = normalized.nextActionDate || '';
    if (nextActionEl) nextActionEl.value = normalized.nextAction || '';
    if (lastContactEl) lastContactEl.value = normalized.lastContactAt || '';
    renderSalesMgmtPreview(normalized);
  }

  function saveSalesMgmt() {
    if (!currentMessageLeadId) return;
    const salesStatus = document.getElementById('sales-mgmt-status').value;
    const nextActionDate = document.getElementById('sales-mgmt-next-date').value;
    const nextAction = document.getElementById('sales-mgmt-next-action').value.trim();
    const lastContactAt = document.getElementById('sales-mgmt-last-contact').value;
    const lead = Storage.getLeads().find(l => l.id === currentMessageLeadId);
    if (!lead) return;
    const draft = SalesBrain.normalizeLead({
      ...lead,
      salesStatus,
      nextAction,
      nextActionDate,
      lastContactAt,
      nextContact: nextActionDate || lead.nextContact,
      lastContact: lastContactAt || lead.lastContact
    });
    const pri = SalesBrain.computeSalesPriority(draft, TODAY());
    Storage.updateLead(currentMessageLeadId, {
      salesStatus,
      nextAction,
      nextActionDate,
      lastContactAt,
      nextContact: nextActionDate,
      lastContact: lastContactAt,
      priorityScore: pri.score,
      priorityReason: pri.reasons.join('、')
    });
    populateSalesMgmtForm(draft);
    renderLeadDetailSubpanels(currentMessageLeadId);
    renderLeadsTable();
    renderDashboard();
    alert('営業管理情報を保存しました');
  }

  const TODAY = () => new Date().toISOString().slice(0, 10);
  const CLOSED_STATUSES = ['成約', '見送り', 'NG'];
  const ACTIVE_LEAD_STATUSES = ['未接触', 'アプローチ中', '商談中'];

  // ── ナビゲーション ──
  function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById('view-' + view).classList.add('active');
        if (view === 'dashboard') renderDashboard();
        if (view === 'radar') renderDemandRadar();
        if (view === 'pickup') renderDemandPickup();
        if (view === 'revenue') renderRevenueView();
        if (view === 'data') renderDataManagement();
      });
    });
  }

  // ── ダッシュボード ──
  function initDashboard() {
    const priority = document.getElementById('dash-priority');
    const postTheme = document.getElementById('dash-post-theme');
    const memo = document.getElementById('dash-memo');
    const data = Storage.getSettings();

    priority.value = data.priority || '';
    postTheme.value = data.postTheme || '';
    memo.value = data.memo || '';

    function save() {
      const current = Storage.getSettings();
      Storage.saveSettings({
        ...current,
        priority: priority.value,
        postTheme: postTheme.value,
        memo: memo.value
      });
    }

    [priority, postTheme, memo].forEach(el => {
      el.addEventListener('input', debounce(save, 500));
    });

    renderDashboard();
  }

  function renderDashboard() {
    renderStartGuide();
    renderBackupStatus();
    renderMorningReport();
    renderDemandInsights();
    renderSalesInsights();
    renderDashboardLists();
    renderDashRevenueSummary();
    renderManagementComments();
    renderDashTodayExecutionPlan();
    renderDashImprovementHints();
    renderWeeklyStrategyBoard();
    renderActionCalendar();
    renderDailyActionTasks();
    renderMorningDailyTasksBrief();
  }

  function getRevenueContext() {
    const today = TODAY();
    const records = RevenueBrain.normalizeRevenueRecords(Storage.getRevenueRecords());
    const settings = Storage.getRevenueSettings();
    const leads = Storage.getLeads();
    const monthKey = RevenueBrain.currentMonthKey(today);
    const summary = RevenueBrain.summarize(records, settings, monthKey);
    const comment = RevenueBrain.buildBantouComment(summary);
    const salesOutcome = RevenueBrain.getLinkedRevenueSummary(records, leads, monthKey);
    const nextSalesCandidates = RevenueBrain.getNextSalesCandidates(records, leads, today);
    const salesHoldCandidates = RevenueBrain.getSalesHoldCandidates(records, leads, today);
    const managementComment = RevenueBrain.buildManagementComment({
      summary, salesOutcome, nextSalesCandidates, salesHoldCandidates
    });
    return { today, records, settings, leads, monthKey, summary, comment, salesOutcome, nextSalesCandidates, salesHoldCandidates, managementComment };
  }

  function renderManagementComment(containerId, options) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const { managementComment } = getRevenueContext();
    const opts = options || {};
    const demandLine = DemandBrain.buildManagementDemandLine(Storage.getDemandPickups(), TODAY());
    let lines = managementComment && managementComment.lines ? [...managementComment.lines] : [];
    let brief = managementComment ? managementComment.brief : '';
    if (demandLine) {
      lines = [demandLine, ...lines].slice(0, 3);
      brief = demandLine + (brief ? ' ' + brief : '');
    }
    if (!lines.length) {
      if (!opts.brief) {
        el.innerHTML = '<p class="placeholder-text">データが揃うと、今月の状況と優先アクションをここに表示します。まずは営業先と売上を1件ずつ登録してみましょう。</p>';
      } else {
        el.innerHTML = '';
      }
      return;
    }
    if (opts.brief) {
      el.innerHTML = `<p class="management-comment-line">${esc(brief)}</p>`;
      return;
    }
    el.innerHTML = lines
      .map(line => `<p class="management-comment-line">${esc(line)}</p>`)
      .join('');
  }

  function formatActivityLogType(type) {
    return ACTIVITY_TYPE_LABELS[type] || type;
  }

  function mapSalesStatusToLegacyStatus(salesStatus) {
    return SALES_STATUS_TO_LEGACY[salesStatus] || '';
  }

  function buildLeadUpdateFromNextActionInput(lead, input) {
    const patch = {};
    const nextAction = (input.nextAction || '').trim();
    const nextContact = input.nextContact || '';
    const salesStatus = input.salesStatus || '';
    const priority = input.priority || '';
    const activityDate = input.activityDate || TODAY();
    if (activityDate) {
      patch.lastContact = activityDate;
      patch.lastContactAt = activityDate;
    }
    if (nextAction) patch.nextAction = nextAction;
    if (nextContact) {
      patch.nextContact = nextContact;
      patch.nextActionDate = nextContact;
    }
    if (salesStatus) {
      patch.salesStatus = salesStatus;
      const legacy = mapSalesStatusToLegacyStatus(salesStatus);
      if (legacy) patch.status = legacy;
    }
    if (priority) patch.priority = priority;
    const normalized = SalesBrain.normalizeLead({ ...lead, ...patch });
    const pri = SalesBrain.computeSalesPriority(normalized, TODAY());
    patch.priorityScore = pri.score;
    patch.priorityReason = pri.reasons.join('、');
    return patch;
  }

  function applyLeadNextActionUpdate(leadId, input) {
    const lead = Storage.getLeads().find(l => l.id === leadId);
    if (!lead) return null;
    const updates = buildLeadUpdateFromNextActionInput(lead, input || {});
    Storage.updateLead(leadId, updates);
    const updated = Storage.getLeads().find(l => l.id === leadId) || null;
    if (updated && currentMessageLeadId === leadId) {
      populateSalesMgmtForm(updated);
      renderLeadDetailSubpanels(leadId);
    }
    return updated;
  }

  function recordTaskCompletionActivity(task) {
    if (!task || !task.leadId) return;
    const lead = Storage.getLeads().find(l => l.id === task.leadId);
    if (!lead) return;
    const added = Storage.addLeadActivityLog(task.leadId, {
      type: 'task-done',
      date: TODAY(),
      title: task.title || '',
      memo: task.memo || '',
      taskId: task.id,
      taskKind: task.type || 'auto',
      priority: task.priority || '',
      reason: task.reason || '',
      action: task.action || '',
      targetName: task.targetName || lead.company,
      nextAction: task.nextAction || '',
      nextContact: task.nextContact || ''
    });
    if (added && currentMessageLeadId === task.leadId) {
      renderLeadActivityLogs(task.leadId);
    }
  }

  function getRecentCompletedActivityLogs(max) {
    const today = TODAY();
    const yesterday = addDaysToDate(today, -1);
    const all = [];
    Storage.getLeads().forEach(lead => {
      (lead.activityLogs || []).forEach(log => {
        if (log.type === 'task-done' && (log.date === today || log.date === yesterday)) {
          all.push({ ...log, leadName: lead.company });
        }
      });
    });
    return all
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, max || 3);
  }

  function renderMorningRecentActivities() {
    const el = document.getElementById('mgmt-recent-activities');
    if (!el) return;
    const recent = getRecentCompletedActivityLogs(3);
    if (!recent.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `
      <p class="daily-tasks-brief-title">最近の完了活動：</p>
      <ul class="daily-tasks-brief-list">
        ${recent.map(l => `<li>${esc(l.leadName || l.targetName)}：${esc(l.title)}を完了</li>`).join('')}
      </ul>`;
  }

  function renderLeadActivityLogs(leadId) {
    const listEl = document.getElementById('lead-activity-logs-list');
    if (!listEl) return;
    const logs = Storage.getLeadActivityLogs(leadId).slice(0, 5);
    if (!logs.length) {
      listEl.innerHTML = '<p class="placeholder-text">活動履歴はまだありません。活動を追加するか、今日やることのタスクを完了するとここに残ります。</p>';
      return;
    }
    listEl.innerHTML = logs.map((log, index) => {
      const typeLabel = formatActivityLogType(log.type);
      const created = log.createdAt ? log.createdAt.slice(0, 16).replace('T', ' ') : '';
      const extra = [
        log.type === 'task-done' && log.reason ? `<p class="activity-log-meta">理由：${esc(log.reason)}</p>` : '',
        (log.nextAction || log.nextContact) ? `<p class="activity-log-meta">次回：${esc(log.nextAction || '—')}${log.nextContact ? `（${esc(log.nextContact)}）` : ''}</p>` : '',
        log.memo ? `<p class="activity-log-meta">メモ：${esc(log.memo)}</p>` : ''
      ].filter(Boolean).join('');
      const recentClass = index < 3 ? ' activity-log-recent' : ' activity-log-older';
      return `
        <div class="activity-log-item${recentClass}">
          <div class="activity-log-header">
            <span class="activity-log-date">${esc(log.date)}</span>
            <span class="activity-log-type">${esc(typeLabel)}</span>
          </div>
          <strong class="activity-log-title">${esc(log.title)}</strong>
          ${extra}
          <small class="activity-log-created">作成：${esc(created)}</small>
        </div>`;
    }).join('');
  }

  function resetLeadActivityForm() {
    const form = document.getElementById('lead-activity-add-form');
    const dateEl = document.getElementById('lead-activity-date');
    if (form) form.reset();
    if (dateEl) dateEl.value = TODAY();
  }

  function handleLeadActivityAddSubmit(e) {
    e.preventDefault();
    if (!currentMessageLeadId) return;
    const date = document.getElementById('lead-activity-date').value || TODAY();
    const type = document.getElementById('lead-activity-type').value;
    const title = document.getElementById('lead-activity-title').value.trim();
    const memo = document.getElementById('lead-activity-memo').value.trim();
    const nextAction = document.getElementById('lead-activity-next-action').value.trim();
    const nextContact = document.getElementById('lead-activity-next-contact').value;
    const salesStatus = document.getElementById('lead-activity-status').value;
    const priority = document.getElementById('lead-activity-priority').value;
    if (!title) return;
    Storage.addLeadActivityLog(currentMessageLeadId, {
      type,
      date,
      title,
      memo,
      nextAction,
      nextContact
    });
    applyLeadNextActionUpdate(currentMessageLeadId, {
      activityDate: date,
      nextAction,
      nextContact,
      salesStatus,
      priority
    });
    resetLeadActivityForm();
    const updated = Storage.getLeads().find(l => l.id === currentMessageLeadId);
    if (updated) {
      populateSalesMgmtForm(updated);
      renderLeadDetailSubpanels(currentMessageLeadId);
    }
    renderLeadsTable();
    renderDashboard();
    renderMorningRecentActivities();
  }

  function getNextContactDueStatus(nextDate, today) {
    const t = today || TODAY();
    if (!nextDate) return { label: '未設定', className: 'due-status-unset' };
    if (nextDate === t) return { label: '今日対応', className: 'due-status-today' };
    if (nextDate < t) return { label: '期限超過', className: 'due-status-overdue' };
    return { label: '予定あり', className: 'due-status-scheduled' };
  }

  function renderLeadStatusSummary(leadId) {
    const el = document.getElementById('lead-status-summary');
    if (!el) return;
    const lead = Storage.getLeads().find(l => l.id === leadId);
    if (!lead) {
      el.innerHTML = '';
      return;
    }
    const normalized = SalesBrain.normalizeLead(lead);
    const enriched = getEnrichedLead(leadId) || normalized;
    const { records, leads } = getRevenueContext();
    const revSummary = RevenueBrain.getLeadRevenueSummary(leadId, records);
    const hold = RevenueBrain.getLeadSalesHold(leadId, records, leads);
    const priority = normalized.priority || enriched.priorityLabel || '—';
    const lastContact = normalized.lastContactAt || normalized.lastContact || '—';
    const nextContact = normalized.nextActionDate || normalized.nextContact || '—';
    const totalText = revSummary.count ? RevenueBrain.formatYen(revSummary.total) : '—';
    const statusLine = hold
      ? `<p class="lead-status-line lead-status-hold"><span class="label-muted">状態</span> 営業保留</p>
         <p class="lead-status-line lead-status-hold-reason"><span class="label-muted">理由</span> ${esc(hold.reason)}</p>`
      : `<p class="lead-status-line"><span class="label-muted">状態</span> 通常営業OK</p>`;
    el.innerHTML = `
      <h3 class="lead-status-company">${esc(lead.company)}</h3>
      <p class="lead-status-line lead-status-main">${esc(normalized.salesStatus || '—')} / 優先度${esc(priority)}</p>
      <p class="lead-status-line"><span class="label-muted">最終連絡</span> ${esc(lastContact)}</p>
      <p class="lead-status-line"><span class="label-muted">次回連絡</span> ${esc(nextContact)}</p>
      <p class="lead-status-line"><span class="label-muted">累計売上</span> ${esc(totalText)}</p>
      ${statusLine}`;
  }

  function renderLeadRevenueCompact(leadId) {
    const el = document.getElementById('lead-revenue-compact');
    if (!el) return;
    const summary = RevenueBrain.getLeadRevenueSummary(leadId, Storage.getRevenueRecords());
    if (!summary.count) {
      el.innerHTML = `
        <h3>累計売上</h3>
        <p class="placeholder-text">この営業先に紐付いた売上はまだありません。作業が終わったら売上番頭から登録できます。</p>`;
      return;
    }
    el.innerHTML = `
      <h3>累計売上</h3>
      <div class="lead-revenue-compact-grid">
        <div class="lead-revenue-compact-item"><span>累計売上</span><strong>${esc(RevenueBrain.formatYen(summary.total))}</strong></div>
        <div class="lead-revenue-compact-item"><span>入金済み</span><strong>${esc(RevenueBrain.formatYen(summary.paid))}</strong></div>
        <div class="lead-revenue-compact-item${summary.unpaid > 0 ? ' lead-revenue-pending-cell' : ''}"><span>入金待ち</span><strong>${esc(RevenueBrain.formatYen(summary.unpaid))}</strong></div>
        <div class="lead-revenue-compact-item"><span>売上件数</span><strong>${summary.count}件</strong></div>
        <div class="lead-revenue-compact-item lead-revenue-compact-wide"><span>最終売上日</span><strong>${esc(summary.latestDate || '—')}</strong></div>
      </div>`;
  }

  function renderLeadDailyTasks(leadId) {
    const el = document.getElementById('lead-daily-tasks');
    if (!el) return;
    const tasks = getDailyActionTasksWithState().filter(t => t.leadId === leadId);
    if (!tasks.length) {
      el.innerHTML = '';
      el.classList.add('hidden');
      return;
    }
    const active = tasks.filter(t => t.status !== 'done' && !isDailyTaskSnoozedAway(t, TODAY()));
    const doneToday = tasks.filter(t => t.status === 'done');
    if (!active.length && doneToday.length) {
      el.classList.remove('hidden');
      el.innerHTML = `<p class="lead-daily-tasks-title">今日のタスク完了済み</p>`;
      return;
    }
    if (!active.length) {
      el.innerHTML = '';
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = `
      <p class="lead-daily-tasks-title">今日やることあり</p>
      <ul class="lead-daily-tasks-list">
        ${active.map(t => `<li>${esc(t.title || t.action || 'タスク')}</li>`).join('')}
      </ul>`;
  }

  function renderLeadDetailSubpanels(leadId) {
    const lead = Storage.getLeads().find(l => l.id === leadId);
    if (!lead) return;
    renderLeadStatusSummary(leadId);
    renderLeadActionSummary(lead);
    renderLeadRevenueCompact(leadId);
    renderLeadDailyTasks(leadId);
    renderLeadNextSalesAction(leadId);
    renderLeadActivityLogs(leadId);
    renderLeadRevenuePanel(leadId);
  }

  function renderLeadActionSummary(lead) {
    const el = document.getElementById('sales-next-action-summary');
    if (!el || !lead) return;
    const normalized = SalesBrain.normalizeLead(lead);
    const nextDate = normalized.nextActionDate || normalized.nextContact || '';
    const nextAction = (normalized.nextAction || '').trim();
    const due = getNextContactDueStatus(nextDate, TODAY());
    if (!nextAction && !nextDate) {
      el.className = 'lead-detail-block sales-next-action-summary unset';
      el.innerHTML = `
        <h3>次回アクション</h3>
        <p class="sales-next-action-empty">次回アクション未設定</p>
        <p class="sales-next-action-hint">活動履歴から次回アクションを設定できます</p>`;
      return;
    }
    const isUrgent = due.className === 'due-status-today' || due.className === 'due-status-overdue';
    el.className = 'lead-detail-block sales-next-action-summary' + (isUrgent ? ' urgent' : '');
    el.innerHTML = `
      <h3>次回アクション</h3>
      <p class="sales-next-action-main"><span class="label-muted">次回アクション</span> ${esc(nextAction || '—')}</p>
      <p class="sales-next-action-main"><span class="label-muted">次回連絡日</span> ${esc(nextDate || '—')}</p>
      <p class="sales-next-action-main">
        <span class="label-muted">状態</span>
        <span class="next-contact-due-badge ${due.className}">${esc(due.label)}</span>
      </p>
      ${isUrgent ? '<p class="sales-next-action-alert">次回連絡日が今日以前です。今日やることに反映されます。</p>' : ''}`;
  }

  function fillDailyTaskLeadSelect() {
    const el = document.getElementById('daily-task-add-lead');
    if (!el) return;
    const selected = el.value;
    const leads = Storage.getLeads().slice().sort((a, b) => (a.company || '').localeCompare(b.company || '', 'ja'));
    el.innerHTML = '<option value="">未選択</option>' +
      leads.map(l => `<option value="${esc(l.id)}">${esc(l.company)}</option>`).join('');
    if (selected && leads.some(l => l.id === selected)) el.value = selected;
  }

  function addDaysToDate(dateStr, offsetDays) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + Number(offsetDays || 0));
    return toISODateLocal(d);
  }

  function formatTaskCompletedAt(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function getDailyActionTaskStateForToday(taskId, today, states) {
    const todayState = states.find(s => s.taskId === taskId && s.date === today);
    if (todayState) return todayState;
    const resumed = states
      .filter(s => s.taskId === taskId && s.status === 'snoozed' && s.snoozedUntil === today)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    if (resumed) return { ...resumed, status: 'active', date: today };
    return null;
  }

  function applyDailyTaskState(task, state, today) {
    const base = {
      ...task,
      type: task.type || 'auto',
      dueDate: task.dueDate || today,
      memo: '',
      status: 'active',
      snoozedUntil: '',
      completedAt: ''
    };
    if (!state) return base;
    const merged = {
      ...base,
      status: state.status === 'done' ? 'done' : state.status === 'snoozed' ? 'snoozed' : 'active',
      memo: state.memo || '',
      snoozedUntil: state.snoozedUntil || '',
      completedAt: state.completedAt || '',
      dueDate: state.dueDate || base.dueDate,
      nextAction: state.nextAction || base.nextAction || '',
      nextContact: state.nextContact || base.nextContact || ''
    };
    if (state.title) merged.title = state.title;
    if (state.priority) merged.priority = state.priority;
    if (state.targetName != null && state.targetName !== '') merged.targetName = state.targetName;
    if (state.action) merged.action = state.action;
    return merged;
  }

  function isDailyTaskSnoozedAway(task, today) {
    return task.status === 'snoozed' && task.snoozedUntil && task.snoozedUntil > today;
  }

  function normalizeManualDailyTask(task, today) {
    let status = task.status === 'done' ? 'done' : task.status === 'snoozed' ? 'snoozed' : 'active';
    if (status === 'snoozed' && task.snoozedUntil === today) status = 'active';
    return {
      ...task,
      type: 'manual',
      reason: task.reason || '手動追加',
      action: task.action || task.memo || task.title,
      targetName: task.targetName || '—',
      dueDate: task.dueDate || today,
      status,
      snoozedUntil: task.snoozedUntil || '',
      completedAt: task.completedAt || '',
      nextAction: task.nextAction || '',
      nextContact: task.nextContact || ''
    };
  }

  function isManualTaskVisibleToday(task, today) {
    if (task.dueDate === today) return true;
    if (task.status === 'snoozed' && task.snoozedUntil === today) return true;
    if (task.status === 'done' && task.dueDate === today) return true;
    return false;
  }

  function getDailyActionTasksWithState() {
    const ctx = getRevenueContext();
    const today = ctx.today;
    const store = Storage.getDailyActionTasksData();
    const { enriched } = getSalesContext();
    const generated = RevenueBrain.buildDailyActionTasks({
      ...ctx,
      enrichedLeads: enriched
    });

    const autoTasks = generated.map(task => {
      const state = getDailyActionTaskStateForToday(task.id, today, store.states);
      return applyDailyTaskState(task, state, today);
    });

    const manualTasks = store.manualTasks
      .map(t => normalizeManualDailyTask(t, today))
      .filter(t => isManualTaskVisibleToday(t, today));

    return [...autoTasks, ...manualTasks];
  }

  function sortDailyTasksForDisplay(tasks) {
    const priorityOrder = { '高': 0, '中': 1, '低': 2 };
    const bucket = task => {
      if (task.status === 'done') return 3;
      if (isDailyTaskSnoozedAway(task, TODAY())) return 2;
      if (task.status === 'snoozed') return 2;
      return 0;
    };
    return tasks.slice().sort((a, b) => {
      const bb = bucket(a) - bucket(b);
      if (bb !== 0) return bb;
      const po = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (po !== 0) return po;
      const manualA = a.type === 'manual' ? 0 : 1;
      const manualB = b.type === 'manual' ? 0 : 1;
      return manualA - manualB;
    });
  }

  function openDailyActionTask(task) {
    if (!task) return;
    if (task.openTarget === 'lead' && task.leadId) {
      openSalesDetail(task.leadId, { navigate: true });
      return;
    }
    if (task.openTarget === 'revenue') {
      navigateToView('revenue');
      const section = document.getElementById('revenue-list-section');
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (task.openTarget === 'sales') {
      navigateToView('sales');
    }
  }

  function saveDailyTaskState(taskId, data) {
    const today = TODAY();
    Storage.upsertDailyActionTaskState(taskId, today, data);
    renderDailyActionTasks();
    renderMorningDailyTasksBrief();
    if (currentMessageLeadId) renderLeadDailyTasks(currentMessageLeadId);
  }

  function updateDailyActionTaskState(taskId, status, memo, extra) {
    const today = TODAY();
    const store = Storage.getDailyActionTasksData();
    const existing = store.states.find(s => s.taskId === taskId && s.date === today)
      || store.states.find(s => s.taskId === taskId);
    const payload = {
      status,
      memo: memo != null ? memo : (existing ? existing.memo : ''),
      ...(extra || {})
    };
    if (status === 'done') {
      payload.completedAt = new Date().toISOString();
      payload.snoozedUntil = '';
    }
    saveDailyTaskState(taskId, payload);
    if (status === 'done') {
      const task = getDailyActionTasksWithState().find(t => t.id === taskId);
      if (task) {
        if (task.leadId && (task.nextAction || task.nextContact)) {
          applyLeadNextActionUpdate(task.leadId, {
            activityDate: TODAY(),
            nextAction: task.nextAction || '',
            nextContact: task.nextContact || ''
          });
        }
        recordTaskCompletionActivity(task);
      }
      renderMorningRecentActivities();
    }
  }

  function snoozeDailyTaskUntilTomorrow(taskId, memo) {
    const today = TODAY();
    const tomorrow = addDaysToDate(today, 1);
    updateDailyActionTaskState(taskId, 'snoozed', memo, { snoozedUntil: tomorrow });
  }

  function snoozeManualTaskUntilTomorrow(taskId, memo) {
    const tomorrow = addDaysToDate(TODAY(), 1);
    Storage.updateManualDailyTask(taskId, {
      status: 'snoozed',
      snoozedUntil: tomorrow,
      dueDate: tomorrow,
      memo: memo || ''
    });
    renderDailyActionTasks();
    renderMorningDailyTasksBrief();
    if (currentMessageLeadId) renderLeadDailyTasks(currentMessageLeadId);
  }

  function completeManualDailyTask(taskId, memo) {
    const store = Storage.getDailyActionTasksData();
    const raw = store.manualTasks.find(t => t.id === taskId);
    Storage.updateManualDailyTask(taskId, {
      status: 'done',
      completedAt: new Date().toISOString(),
      snoozedUntil: '',
      memo: memo || ''
    });
    if (raw) {
      const task = normalizeManualDailyTask({
        ...raw,
        status: 'done',
        memo: memo || '',
        completedAt: new Date().toISOString()
      }, TODAY());
      if (task.leadId && (task.nextAction || task.nextContact)) {
        applyLeadNextActionUpdate(task.leadId, {
          activityDate: TODAY(),
          nextAction: task.nextAction || '',
          nextContact: task.nextContact || ''
        });
      }
      recordTaskCompletionActivity(task);
    }
    renderDailyActionTasks();
    renderMorningDailyTasksBrief();
    renderMorningRecentActivities();
    if (currentMessageLeadId) renderLeadDailyTasks(currentMessageLeadId);
  }

  function snoozeManualTaskToday(taskId, memo) {
    Storage.updateManualDailyTask(taskId, {
      status: 'snoozed',
      snoozedUntil: '',
      memo: memo || ''
    });
    renderDailyActionTasks();
    renderMorningDailyTasksBrief();
  }

  function resetDailyTaskAddForm() {
    const dueEl = document.getElementById('daily-task-add-due');
    document.getElementById('daily-task-add-form').reset();
    if (dueEl) dueEl.value = TODAY();
    document.getElementById('daily-task-add-priority').value = '中';
    fillDailyTaskLeadSelect();
  }

  function handleDailyTaskAddSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('daily-task-add-title').value.trim();
    if (!title) return;
    const targetName = document.getElementById('daily-task-add-target').value.trim();
    const priority = document.getElementById('daily-task-add-priority').value;
    const dueDate = document.getElementById('daily-task-add-due').value || TODAY();
    const memo = document.getElementById('daily-task-add-memo').value.trim();
    const leadId = document.getElementById('daily-task-add-lead').value;
    const lead = leadId ? Storage.getLeads().find(l => l.id === leadId) : null;
    Storage.addManualDailyTask({
      title,
      targetName: targetName || (lead ? lead.company : '—'),
      priority,
      action: memo || title,
      memo,
      dueDate,
      status: 'open',
      leadId: lead ? lead.id : '',
      leadName: lead ? lead.company : ''
    });
    resetDailyTaskAddForm();
    renderDailyActionTasks();
    renderMorningDailyTasksBrief();
  }

  function openDailyTaskEditPanel(task) {
    const panel = document.getElementById('daily-task-edit-panel');
    if (!panel || !task) return;
    document.getElementById('daily-task-edit-id').value = task.id;
    document.getElementById('daily-task-edit-kind').value = task.type === 'manual' ? 'manual' : 'auto';
    document.getElementById('daily-task-edit-title').value = task.title || '';
    document.getElementById('daily-task-edit-target').value = task.targetName === '—' ? '' : (task.targetName || '');
    document.getElementById('daily-task-edit-priority').value = task.priority || '中';
    document.getElementById('daily-task-edit-due').value = task.dueDate || TODAY();
    document.getElementById('daily-task-edit-memo').value = task.memo || '';
    document.getElementById('daily-task-edit-next-action').value = task.nextAction || '';
    document.getElementById('daily-task-edit-next-contact').value = task.nextContact || '';
    panel.classList.remove('hidden');
  }

  function closeDailyTaskEditPanel() {
    const panel = document.getElementById('daily-task-edit-panel');
    if (panel) panel.classList.add('hidden');
  }

  function handleDailyTaskEditSave() {
    const id = document.getElementById('daily-task-edit-id').value;
    const kind = document.getElementById('daily-task-edit-kind').value;
    const title = document.getElementById('daily-task-edit-title').value.trim();
    if (!title) return;
    const targetName = document.getElementById('daily-task-edit-target').value.trim() || '—';
    const priority = document.getElementById('daily-task-edit-priority').value;
    const dueDate = document.getElementById('daily-task-edit-due').value || TODAY();
    const memo = document.getElementById('daily-task-edit-memo').value.trim();
    const nextAction = document.getElementById('daily-task-edit-next-action').value.trim();
    const nextContact = document.getElementById('daily-task-edit-next-contact').value;
    if (kind === 'manual') {
      Storage.updateManualDailyTask(id, {
        title,
        targetName,
        priority,
        dueDate,
        memo,
        action: memo || title,
        nextAction,
        nextContact
      });
    } else {
      const task = getDailyActionTasksWithState().find(t => t.id === id);
      const status = task && task.status !== 'active' ? task.status : 'active';
      saveDailyTaskState(id, {
        status,
        title,
        targetName,
        priority,
        dueDate,
        memo,
        action: memo || title,
        nextAction,
        nextContact
      });
    }
    closeDailyTaskEditPanel();
    renderDailyActionTasks();
    renderMorningDailyTasksBrief();
  }

  function getDailyTaskStatusLabel(task, today) {
    if (task.status === 'done') return '完了';
    if (isDailyTaskSnoozedAway(task, today)) return '明日に回し済み';
    if (task.status === 'snoozed') return '後回し';
    return '';
  }

  function renderDailyActionTaskCard(task, options) {
    const opts = options || {};
    const today = TODAY();
    const isDone = task.status === 'done';
    const isSnoozedAway = isDailyTaskSnoozedAway(task, today);
    const isSnoozed = task.status === 'snoozed' && !isSnoozedAway;
    const priorityClass = task.priority === '高' ? 'high' : task.priority === '中' ? 'mid' : 'low';
    const statusLabel = getDailyTaskStatusLabel(task, today);
    const showActions = !isDone && !isSnoozedAway && opts.showActions !== false;
    const openBtn = task.type !== 'manual' && task.openTarget
      ? `<button type="button" class="btn btn-sm btn-secondary" data-daily-task-open="${esc(task.id)}">開く</button>` : '';
    const actionsHtml = showActions ? `
      <div class="daily-task-actions">
        ${openBtn}
        <button type="button" class="btn btn-sm btn-secondary" data-daily-task-edit="${esc(task.id)}">編集</button>
        <button type="button" class="btn btn-sm btn-primary" data-daily-task-done="${esc(task.id)}">完了</button>
        <button type="button" class="btn btn-sm btn-secondary" data-daily-task-snooze="${esc(task.id)}">後回し</button>
        <button type="button" class="btn btn-sm btn-secondary" data-daily-task-tomorrow="${esc(task.id)}">明日に回す</button>
      </div>` : '';
    const memoHtml = opts.compact
      ? (task.memo ? `<p class="daily-task-memo-text">${esc(task.memo)}</p>` : '')
      : (!isDone && !isSnoozedAway
        ? `<input type="text" class="daily-task-memo" data-daily-task-memo="${esc(task.id)}" value="${esc(task.memo)}" placeholder="メモ（任意）">`
        : (task.memo ? `<p class="daily-task-memo-text">${esc(task.memo)}</p>` : ''));
    const doneMeta = isDone && opts.showCompletedAt
      ? `<p class="daily-task-done-time">完了：${esc(formatTaskCompletedAt(task.completedAt))}</p>` : '';
    return `
      <div class="daily-task-card daily-task-${priorityClass}${isDone ? ' daily-task-done' : ''}${isSnoozed || isSnoozedAway ? ' daily-task-snoozed' : ''}" data-task-id="${esc(task.id)}">
        <div class="daily-task-header">
          <span class="daily-task-priority priority-${priorityClass}">${esc(task.priority)}</span>
          <strong class="daily-task-title">${esc(task.title)}</strong>
          ${task.type === 'manual' ? '<span class="daily-task-manual-badge">手動</span>' : ''}
          ${statusLabel ? `<span class="daily-task-status">${esc(statusLabel)}</span>` : ''}
        </div>
        <p class="daily-task-meta">対象：${esc(task.targetName)}</p>
        <p class="daily-task-meta">理由：${esc(task.reason)}</p>
        <p class="daily-task-meta">やること：${esc(task.action)}</p>
        ${memoHtml}
        ${doneMeta}
        ${actionsHtml}
      </div>`;
  }

  function bindDailyActionTaskEvents(container) {
    if (!container) return;
    container.querySelectorAll('[data-daily-task-open]').forEach(btn => {
      btn.addEventListener('click', () => {
        const task = getDailyActionTasksWithState().find(t => t.id === btn.dataset.dailyTaskOpen);
        openDailyActionTask(task);
      });
    });
    container.querySelectorAll('[data-daily-task-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const task = getDailyActionTasksWithState().find(t => t.id === btn.dataset.dailyTaskEdit);
        openDailyTaskEditPanel(task);
      });
    });
    container.querySelectorAll('[data-daily-task-done]').forEach(btn => {
      btn.addEventListener('click', () => {
        const task = getDailyActionTasksWithState().find(t => t.id === btn.dataset.dailyTaskDone);
        const memoInput = container.querySelector(`[data-daily-task-memo="${btn.dataset.dailyTaskDone}"]`);
        const memo = memoInput ? memoInput.value.trim() : (task ? task.memo : '');
        if (task && task.type === 'manual') {
          completeManualDailyTask(task.id, memo);
        } else {
          updateDailyActionTaskState(btn.dataset.dailyTaskDone, 'done', memo);
        }
      });
    });
    container.querySelectorAll('[data-daily-task-snooze]').forEach(btn => {
      btn.addEventListener('click', () => {
        const task = getDailyActionTasksWithState().find(t => t.id === btn.dataset.dailyTaskSnooze);
        const memoInput = container.querySelector(`[data-daily-task-memo="${btn.dataset.dailyTaskSnooze}"]`);
        const memo = memoInput ? memoInput.value.trim() : (task ? task.memo : '');
        if (task && task.type === 'manual') {
          snoozeManualTaskToday(task.id, memo);
        } else {
          updateDailyActionTaskState(btn.dataset.dailyTaskSnooze, 'snoozed', memo, { snoozedUntil: '' });
        }
      });
    });
    container.querySelectorAll('[data-daily-task-tomorrow]').forEach(btn => {
      btn.addEventListener('click', () => {
        const task = getDailyActionTasksWithState().find(t => t.id === btn.dataset.dailyTaskTomorrow);
        const memoInput = container.querySelector(`[data-daily-task-memo="${btn.dataset.dailyTaskTomorrow}"]`);
        const memo = memoInput ? memoInput.value.trim() : (task ? task.memo : '');
        if (task && task.type === 'manual') {
          snoozeManualTaskUntilTomorrow(task.id, memo);
        } else {
          snoozeDailyTaskUntilTomorrow(btn.dataset.dailyTaskTomorrow, memo);
        }
      });
    });
    container.querySelectorAll('[data-daily-task-memo]').forEach(input => {
      input.addEventListener('change', () => {
        const task = getDailyActionTasksWithState().find(t => t.id === input.dataset.dailyTaskMemo);
        if (!task) return;
        if (task.type === 'manual') {
          Storage.updateManualDailyTask(task.id, { memo: input.value.trim(), action: input.value.trim() || task.title });
        } else {
          const status = task.status === 'active' ? 'active' : task.status;
          saveDailyTaskState(task.id, { status, memo: input.value.trim() });
        }
        renderMorningDailyTasksBrief();
      });
    });
  }

  function renderDailyActionTasks() {
    const el = document.getElementById('dash-daily-action-tasks');
    if (!el) return;
    const today = TODAY();
    const allTasks = getDailyActionTasksWithState();
    const sorted = sortDailyTasksForDisplay(allTasks);
    const active = sorted.filter(t => t.status !== 'done' && !isDailyTaskSnoozedAway(t, today));
    const snoozedAway = sorted.filter(t => isDailyTaskSnoozedAway(t, today));
    const snoozedToday = sorted.filter(t => t.status === 'snoozed' && !isDailyTaskSnoozedAway(t, today));
    const done = sorted.filter(t => t.status === 'done');
    const parts = [];

    if (!allTasks.length) {
      parts.push('<p class="placeholder-text">今日のタスクはまだありません。上のフォームから1件追加するか、売上・営業先を登録すると自動で出ます。</p>');
    } else {
      if (active.length) {
        active.slice(0, 8).forEach(t => parts.push(renderDailyActionTaskCard(t, { showActions: true })));
      } else if (!snoozedToday.length && !snoozedAway.length && !done.length) {
        parts.push('<p class="placeholder-text">今日対応のタスクはありません。期限が来たタスクや手動追加がここに表示されます。</p>');
      }
      if (snoozedToday.length || snoozedAway.length) {
        parts.push('<div class="daily-task-snoozed-section">');
        parts.push('<p class="daily-task-snoozed-heading label-muted">後回し / 明日に回し済み</p>');
        snoozedToday.forEach(t => parts.push(renderDailyActionTaskCard(t, { showActions: true })));
        snoozedAway.forEach(t => parts.push(renderDailyActionTaskCard(t, { showActions: false, compact: true })));
        parts.push('</div>');
      }
      if (done.length) {
        parts.push('<div class="daily-task-done-section">');
        parts.push('<p class="daily-task-done-heading label-muted">完了済み</p>');
        done.slice(0, 3).forEach(t => parts.push(renderDailyActionTaskCard(t, {
          showActions: false,
          compact: true,
          showCompletedAt: true
        })));
        parts.push('</div>');
      }
    }
    el.innerHTML = parts.join('');
    bindDailyActionTaskEvents(el);
  }

  function renderMorningDailyTasksBrief() {
    const el = document.getElementById('mgmt-daily-tasks');
    if (!el) return;
    const today = TODAY();
    const tasks = sortDailyTasksForDisplay(
      getDailyActionTasksWithState().filter(t =>
        t.status !== 'done' && !isDailyTaskSnoozedAway(t, today) && t.status !== 'snoozed'
      )
    ).slice(0, 3);
    if (!tasks.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `
      <p class="daily-tasks-brief-title">今日やること：</p>
      <ol class="daily-tasks-brief-list">
        ${tasks.map(t => `<li>${esc(t.title)}：${esc(t.targetName)}</li>`).join('')}
      </ol>`;
  }

  function initDailyActionTasks() {
    const addForm = document.getElementById('daily-task-add-form');
    if (addForm) {
      addForm.addEventListener('submit', handleDailyTaskAddSubmit);
      resetDailyTaskAddForm();
    }
    const saveBtn = document.getElementById('btn-daily-task-edit-save');
    if (saveBtn) saveBtn.addEventListener('click', handleDailyTaskEditSave);
    const cancelBtn = document.getElementById('btn-daily-task-edit-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeDailyTaskEditPanel);
  }

  function renderManagementComments() {
    renderManagementComment('dash-management-comment');
    renderManagementComment('revenue-management-comment');
    renderManagementComment('mgmt-management-comment', { brief: true });
  }

  function renderNextSalesCandidatesList(containerId, limit) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const { nextSalesCandidates } = getRevenueContext();
    const candidates = (nextSalesCandidates || []).slice(0, limit || 5);
    if (!candidates.length) {
      el.innerHTML = '<p class="placeholder-text">次に売るべき営業先はまだありません。売上を営業先に紐付けて登録すると、ここに提案が出ます。</p>';
      return;
    }
    el.innerHTML = candidates.map(c => `
      <div class="next-sales-card next-sales-priority-${esc(c.priority)}">
        <div class="next-sales-card-header">
          <strong>${esc(c.leadName)}</strong>
          <span class="sales-priority-label priority-${c.priority === 'high' ? 'high' : c.priority === 'mid' ? 'mid' : 'low'}">${esc(c.priorityLabel)}</span>
        </div>
        <p class="next-sales-meta">理由：${esc(c.reason)}</p>
        <p class="next-sales-meta">推奨：${esc(c.action)}</p>
        <p class="next-sales-meta">累計売上：${esc(RevenueBrain.formatYen(c.total))}${c.latestDate ? ' / 最終売上：' + esc(c.latestDate) : ''}</p>
        <button type="button" class="btn btn-sm btn-secondary" data-outcome-open-lead="${esc(c.leadId)}">営業先を開く</button>
      </div>`).join('');
    bindSalesOutcomeLeadLinks(el);
  }

  function renderSalesHoldCandidatesList(containerId, limit) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const { salesHoldCandidates } = getRevenueContext();
    const holds = (salesHoldCandidates || []).slice(0, limit || 5);
    if (!holds.length) {
      el.innerHTML = '<p class="placeholder-text">営業保留中の案件はありません。入金注意タグがある売上だけがここに表示されます。</p>';
      return;
    }
    el.innerHTML = holds.map(h => `
      <div class="next-sales-card sales-hold-card">
        <div class="next-sales-card-header">
          <strong>${esc(h.leadName)}</strong>
          <span class="sales-hold-label">営業保留</span>
        </div>
        <p class="next-sales-meta">理由：${esc(h.reason)}</p>
        <p class="next-sales-meta">対応：${esc(h.action)}</p>
        <p class="next-sales-meta">対象売上：${esc(RevenueBrain.formatYen(h.concernAmount))}${h.latestDate ? ' / 最終売上：' + esc(h.latestDate) : ''}</p>
        <button type="button" class="btn btn-sm btn-secondary" data-outcome-open-lead="${esc(h.leadId)}">営業先を開く</button>
      </div>`).join('');
    bindSalesOutcomeLeadLinks(el);
  }

  function renderLeadNextSalesAction(leadId) {
    const el = document.getElementById('lead-next-sales-action');
    if (!el) return;
    const { records, leads, today } = getRevenueContext();
    const hold = RevenueBrain.getLeadSalesHold(leadId, records, leads);
    if (hold) {
      el.classList.remove('hidden');
      el.innerHTML = `
        <h3>営業状況</h3>
        <div class="lead-next-sales-card sales-hold-card">
          <p class="lead-next-sales-title">営業保留：入金予定を確認。確認できるまで追加営業は保留</p>
          <p class="next-sales-meta">理由：${esc(hold.reason)}</p>
          <p class="next-sales-meta">対象売上：${esc(RevenueBrain.formatYen(hold.concernAmount))}${hold.latestDate ? ' / 最終売上：' + esc(hold.latestDate) : ''}</p>
        </div>`;
      return;
    }
    const action = RevenueBrain.getLeadNextSalesAction(leadId, records, leads, today);
    if (!action) {
      el.innerHTML = '';
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = `
      <h3>次の一手</h3>
      <div class="lead-next-sales-card next-sales-priority-${esc(action.priority)}">
        <p class="lead-next-sales-title">次の一手：${esc(action.actionTitle)}</p>
        <p class="next-sales-meta">理由：${esc(action.reason)}</p>
        <p class="next-sales-meta">優先度：${esc(action.priorityLabel)}</p>
        ${action.nextActionUnset ? '<p class="sales-priority-warning">次アクション日が未設定です</p>' : ''}
      </div>`;
  }

  function renderMorningSalesCandidateHtml() {
    const { nextSalesCandidates, salesHoldCandidates } = getRevenueContext();
    const parts = [];
    const top = (nextSalesCandidates || [])[0];
    if (top) {
      parts.push(`<p class="sales-candidate-brief"><strong>今日の営業候補：${esc(top.leadName)}</strong></p>`);
      parts.push(`<p class="sales-candidate-brief">理由：${esc(top.reason)}</p>`);
      parts.push(`<p class="sales-candidate-brief">やること：${esc(top.action)}</p>`);
      parts.push(`<button type="button" class="btn btn-sm btn-secondary" data-outcome-open-lead="${esc(top.leadId)}">営業先を開く</button>`);
    } else {
      parts.push('<p class="sales-candidate-brief">売上後の緊急営業アクションはありません</p>');
    }
    (salesHoldCandidates || []).forEach(h => {
      parts.push(`<p class="sales-hold-brief"><strong>営業保留：${esc(h.leadName)}</strong></p>`);
      parts.push(`<p class="sales-hold-brief">理由：${esc(h.reason)}。追加営業は保留</p>`);
    });
    return parts.join('');
  }

  function renderOutcomeLeadName(lead, leads) {
    if (lead.leadId && (leads || Storage.getLeads()).find(l => l.id === lead.leadId)) {
      return `<button type="button" class="revenue-lead-link" data-outcome-open-lead="${esc(lead.leadId)}">${esc(lead.leadName)}</button>`;
    }
    return esc(lead.leadName);
  }

  function bindSalesOutcomeLeadLinks(container) {
    if (!container) return;
    container.querySelectorAll('[data-outcome-open-lead]').forEach(btn => {
      btn.addEventListener('click', () => openSalesDetail(btn.dataset.outcomeOpenLead, { navigate: true }));
    });
  }

  function renderSalesOutcomeHtml(outcome, options) {
    const opts = options || {};
    if (!outcome) return '';

    if (opts.brief) {
      return RevenueBrain.buildMorningSalesOutcomeLines(outcome)
        .map(l => `<p class="revenue-outcome-brief-line">${esc(l)}</p>`)
        .join('');
    }

    const unlinkedClass = outcome.unlinkedTotal > 0 ? 'revenue-outcome-item-warn' : 'revenue-outcome-item-ok';
    const linkedClass = outcome.linkedTotal > 0 ? 'revenue-outcome-item-highlight' : '';
    const leads = opts.leads || Storage.getLeads();

    const lines = [
      `<div class="revenue-outcome-grid">`,
      `<div class="revenue-outcome-item ${linkedClass}"><span>紐付け売上</span><strong>${esc(RevenueBrain.formatYen(outcome.linkedTotal))}</strong></div>`,
      `<div class="revenue-outcome-item ${unlinkedClass}"><span>未紐付け売上</span><strong>${outcome.unlinkedTotal > 0 ? esc(RevenueBrain.formatYen(outcome.unlinkedTotal)) : 'なし ✓'}</strong></div>`,
      `<div class="revenue-outcome-item"><span>売上発生営業先</span><strong>${outcome.leadCount}件</strong></div>`,
      `<div class="revenue-outcome-item"><span>成約営業先</span><strong>${outcome.contractedCount}件</strong></div>`,
      `</div>`
    ];

    if (outcome.topLeads && outcome.topLeads.length) {
      lines.push('<p class="revenue-outcome-section-title label-muted">売上上位営業先</p>');
      lines.push('<ul class="revenue-outcome-list">');
      outcome.topLeads.forEach(l => {
        lines.push(`<li><span>${renderOutcomeLeadName(l, leads)}</span><strong>${esc(RevenueBrain.formatYen(l.total))}</strong></li>`);
      });
      lines.push('</ul>');
    }

    if (outcome.paymentConcernLeads && outcome.paymentConcernLeads.length) {
      lines.push('<p class="revenue-outcome-section-title label-muted">入金注意がある営業先</p>');
      lines.push('<ul class="revenue-outcome-list revenue-outcome-list-warn">');
      outcome.paymentConcernLeads.forEach(l => {
        lines.push(`<li><span>${renderOutcomeLeadName(l, leads)}</span><strong>${esc(RevenueBrain.formatYen(l.paymentConcernAmount))}</strong></li>`);
      });
      lines.push('</ul>');
    }

    if (opts.showComments) {
      const comments = RevenueBrain.buildSalesOutcomeComment(outcome);
      comments.forEach(c => lines.push(`<p class="revenue-outcome-comment">${esc(c)}</p>`));
    }
    return lines.join('');
  }

  function renderRevenueUnlinkedBanner(salesOutcome) {
    const banner = document.getElementById('revenue-unlinked-banner');
    if (!banner) return;
    banner.classList.toggle('hidden', !(salesOutcome && salesOutcome.unlinkedTotal > 0));
  }

  function renderRevenueSummaryHtml(summary, comment, options) {
    const opts = options || {};
    const lines = [
      `<p class="revenue-summary-line">売上予定：<strong>${esc(RevenueBrain.formatYen(summary.planned))}</strong></p>`,
      `<p class="revenue-summary-line">入金済み：${esc(RevenueBrain.formatYen(summary.paid))}</p>`,
      `<p class="revenue-summary-line">入金待ち：${esc(RevenueBrain.formatYen(summary.unpaid))}</p>`,
      `<p class="revenue-summary-line">月間目標：${esc(RevenueBrain.formatYen(summary.monthlyTarget))}</p>`,
      `<p class="revenue-summary-line">目標まで残り：${esc(RevenueBrain.formatYen(summary.remainingToTarget))}</p>`,
      `<p class="revenue-summary-line">達成率：${summary.achievementRate}%</p>`
    ];
    if (opts.showExtra) {
      lines.push(
        `<p class="revenue-summary-line">確定：${esc(RevenueBrain.formatYen(summary.confirmed))}</p>`,
        `<p class="revenue-summary-line">完了：${esc(RevenueBrain.formatYen(summary.completed))}</p>`,
        `<p class="revenue-summary-line">残り日数：${summary.daysLeft}日 / 1日あたり必要：${esc(RevenueBrain.formatYen(summary.dailyNeeded))}</p>`
      );
    }
    if (comment) {
      lines.push(`<p class="revenue-bantou-comment">${esc(comment)}</p>`);
    }
    if (opts.showLink) {
      lines.push('<button type="button" class="btn btn-sm btn-secondary" id="btn-go-revenue">売上番頭を開く</button>');
    }
    return lines.join('');
  }

  function renderDashRevenueSummary() {
    const el = document.getElementById('dash-revenue-summary');
    if (!el) return;
    const { summary, comment, salesOutcome } = getRevenueContext();
    el.innerHTML = renderRevenueSummaryHtml(summary, comment, { showLink: true });
    const btn = el.querySelector('#btn-go-revenue');
    if (btn) btn.addEventListener('click', () => navigateToView('revenue'));
    const outcomeEl = document.getElementById('dash-sales-outcome');
    if (outcomeEl) {
      outcomeEl.innerHTML = renderSalesOutcomeHtml(salesOutcome, { brief: true });
    }
  }

  function renderBackupStatus() {
    const settings = Storage.getSettings();
    const label = DataBackup.formatBackupDate(settings.lastBackupAt);
    const warn = !settings.lastBackupAt;
    const html = warn
      ? '⚠ 最終バックアップ: <strong>未バックアップ</strong> — データ管理からエクスポートを推奨'
      : '💾 最終バックアップ: <strong>' + esc(label) + '</strong>';

    const dashEl = document.getElementById('dash-backup-status');
    if (dashEl) {
      dashEl.innerHTML = html;
      dashEl.classList.toggle('backup-status-warn', warn);
    }

    const dataEl = document.getElementById('data-last-backup');
    if (dataEl) {
      dataEl.textContent = '最終バックアップ: ' + label;
      dataEl.classList.toggle('backup-status-warn', warn);
    }
  }

  function buildDataSummaryItems(summary) {
    const items = [
      '営業先 ' + summary.leads + '件',
      '追客 ' + summary.followups + '件',
      '需要ログ ' + summary.demandLogs + '日分',
      'レーダーキーワード ' + summary.radarKw + '件',
      '営業文面 ' + summary.messages + '件'
    ];
    if (summary.hasPosts) items.push('需要分析結果 あり');
    if (summary.hasCardDraft) items.push('名刺ドラフト あり');
    if (summary.hasDemandNotes) items.push('需要メモ あり');
    if (summary.hasSettings) items.push('設定 あり');
    if (summary.revenueRecords) items.push('売上記録 ' + summary.revenueRecords + '件');
    if (summary.hasRevenueSettings) items.push('売上目標 あり');
    if (summary.dailyTaskStates) items.push('タスク状態 ' + summary.dailyTaskStates + '件');
    if (summary.manualTasks) items.push('手動タスク ' + summary.manualTasks + '件');
    if (summary.demandPickups) items.push('需要ピックアップ ' + summary.demandPickups + '件');
    return items;
  }

  function shouldShowStartGuide() {
    return !Storage.getLeads().length
      && !Storage.getRevenueRecords().length
      && !getDailyActionTasksWithState().length;
  }

  function renderStartGuide() {
    const el = document.getElementById('dash-start-guide');
    if (!el) return;
    el.classList.toggle('hidden', !shouldShowStartGuide());
  }

  function scrollToElement(selector) {
    const el = document.querySelector(selector);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function goToAddLead() {
    navigateToView('sales');
    setTimeout(() => {
      scrollToElement('#btn-add-lead');
      if (typeof openLeadModal === 'function') openLeadModal();
    }, 120);
  }

  function goToAddRevenue() {
    navigateToView('revenue');
    setTimeout(() => scrollToElement('#revenue-form'), 120);
  }

  function goToAddDailyTask() {
    navigateToView('dashboard');
    setTimeout(() => {
      scrollToElement('#daily-task-add-form');
      const titleEl = document.getElementById('daily-task-add-title');
      if (titleEl) titleEl.focus();
    }, 120);
  }

  function hasBudilTestData() {
    const leads = Storage.getLeads().some(l => l.isTest === true);
    const revenue = Storage.getRevenueRecords().some(r => r.isTest === true);
    const manual = Storage.getDailyActionTasksData().manualTasks.some(t => t.isTest === true);
    return leads || revenue || manual;
  }

  function createBudilTestData() {
    if (hasBudilTestData()) {
      alert('テストデータはすでにあります。「テストデータを削除」で消してから再度作成してください。');
      return;
    }
    const today = TODAY();
    const nextContact = addDaysToDate(today, 30);
    const leadId = 'test_' + Storage.generateId();
    const leads = Storage.getLeads();
    leads.push({
      id: leadId,
      company: 'テスト工務店',
      isTest: true,
      createdAt: new Date().toISOString(),
      salesStatus: '成約',
      status: '成約',
      priority: 'B',
      lastContact: today,
      lastContactAt: today,
      nextAction: '1ヶ月後に再提案',
      nextContact,
      nextActionDate: nextContact,
      activityLogs: [{
        id: 'test_activity_' + Storage.generateId(),
        date: today,
        type: 'contact',
        title: 'LINEでお礼連絡',
        isTest: true,
        createdAt: new Date().toISOString()
      }]
    });
    Storage.saveLeads(leads);

    Storage.addRevenueRecord({
      isTest: true,
      workDate: today,
      customerName: 'テスト工務店',
      service: RevenueBrain.SERVICES[0],
      source: RevenueBrain.SOURCES[0],
      amount: 10000,
      status: '完了',
      paymentStatus: '入金済み',
      leadId,
      leadName: 'テスト工務店',
      memo: 'テストデータ'
    });

    Storage.addManualDailyTask({
      isTest: true,
      id: 'test_manual_' + Storage.generateId(),
      title: 'テスト確認タスク',
      targetName: 'テスト工務店',
      leadId,
      leadName: 'テスト工務店',
      dueDate: today,
      priority: '中',
      action: 'テスト確認タスク',
      status: 'open',
      reason: '手動追加'
    });

    refreshAllViews();
    alert('テストデータを作成しました（テスト工務店・売上1件・活動履歴・今日やること）');
  }

  function deleteBudilTestData() {
    if (!hasBudilTestData()) {
      alert('削除できるテストデータがありません');
      return;
    }
    const ok = confirm('テストデータ（isTest）だけを削除します。本番データは残ります。よろしいですか？');
    if (!ok) return;

    const testManualIds = Storage.getDailyActionTasksData().manualTasks
      .filter(t => t.isTest === true)
      .map(t => t.id);

    Storage.saveLeads(Storage.getLeads().filter(l => l.isTest !== true));
    Storage.saveRevenueRecords(Storage.getRevenueRecords().filter(r => r.isTest !== true));

    const store = Storage.getDailyActionTasksData();
    store.manualTasks = store.manualTasks.filter(t => t.isTest !== true);
    store.states = store.states.filter(s => s.isTest !== true && !testManualIds.includes(s.taskId));
    Storage.saveDailyActionTasksData(store);

    refreshAllViews();
    alert('テストデータを削除しました');
  }

  function initStartGuide() {
    const leadBtn = document.getElementById('btn-start-add-lead');
    const revBtn = document.getElementById('btn-start-add-revenue');
    const taskBtn = document.getElementById('btn-start-add-task');
    if (leadBtn) leadBtn.addEventListener('click', goToAddLead);
    if (revBtn) revBtn.addEventListener('click', goToAddRevenue);
    if (taskBtn) taskBtn.addEventListener('click', goToAddDailyTask);
  }

  function renderDataManagement() {
    renderBackupStatus();
    const summary = DataBackup.getCurrentSummary();
    const listEl = document.getElementById('data-summary-list');
    if (listEl) {
      listEl.innerHTML = buildDataSummaryItems(summary)
        .map(t => '<li>' + esc(t) + '</li>').join('');
    }
  }

  function hideImportPreview() {
    pendingImport = null;
    const preview = document.getElementById('import-preview');
    if (preview) preview.classList.add('hidden');
    const input = document.getElementById('import-file-input');
    if (input) input.value = '';
  }

  function showImportPreview(result) {
    const summary = DataBackup.getSummaryFromData(result.data);
    const meta = document.getElementById('import-preview-meta');
    const list = document.getElementById('import-preview-list');
    const preview = document.getElementById('import-preview');

    if (meta) {
      const exported = result.exportedAt
        ? 'エクスポート日時: ' + DataBackup.formatBackupDate(result.exportedAt)
        : 'エクスポート日時: 不明';
      meta.textContent = exported + ' / 復元キー: ' + result.keys.length + '件';
    }
    if (list) {
      list.innerHTML = buildDataSummaryItems(summary)
        .map(t => '<li>' + esc(t) + '</li>').join('');
    }
    if (preview) preview.classList.remove('hidden');
  }

  function exportBudilData() {
    const payload = DataBackup.exportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = DataBackup.filename();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    DataBackup.recordBackupTime();
    renderBackupStatus();
    renderDataManagement();
  }

  function reloadFormsFromStorage() {
    const settings = Storage.getSettings();
    const dashPriority = document.getElementById('dash-priority');
    if (dashPriority) {
      dashPriority.value = settings.priority || '';
      document.getElementById('dash-post-theme').value = settings.postTheme || '';
      document.getElementById('dash-memo').value = settings.memo || '';
    }

    const notes = Storage.getDemandNotes();
    const demandMap = {
      trends: 'demand-trends', ads: 'demand-ads', gsc: 'demand-gsc',
      instagram: 'demand-instagram', fieldNotes: 'demand-field'
    };
    Object.entries(demandMap).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el) el.value = notes[key] || '';
    });

    const dateEl = document.getElementById('demand-date');
    if (dateEl) dateEl.value = TODAY();

    const radar = Storage.getDemandRadar();
    const memos = radar.marketMemos || {};
    const radarMemoIds = {
      news: 'radar-memo-news',
      voices: 'radar-memo-voices',
      competitor: 'radar-memo-competitor',
      field: 'radar-memo-field'
    };
    Object.entries(radarMemoIds).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el) el.value = memos[key] || '';
    });
    if (typeof renderRadarKeywordList === 'function') renderRadarKeywordList();
  }

  function refreshAllViews() {
    syncTodayDemandFromLog();
    reloadFormsFromStorage();
    renderDashboard();
    renderDemandRadar();
    renderDemandPickup();
    const saved = Storage.getGeneratedPosts();
    if (saved) renderDemandOutput(saved);
    renderDemandInsights();
    renderDemandLogHistory();
    renderLeadsTable();
    renderFollowupTable();
    renderFollowupOverdue();
    renderRevenueView();
    renderDataManagement();
  }

  function initDataManagement() {
    document.getElementById('btn-export-data').addEventListener('click', exportBudilData);

    const fileInput = document.getElementById('import-file-input');
    document.getElementById('btn-import-select').addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const payload = JSON.parse(reader.result);
          const result = DataBackup.validatePayload(payload);
          if (!result.valid) {
            alert('インポートできません: ' + result.error);
            hideImportPreview();
            return;
          }
          pendingImport = result;
          showImportPreview(result);
        } catch {
          alert('JSONファイルの読み込みに失敗しました');
          hideImportPreview();
        }
      };
      reader.readAsText(file);
    });

    document.getElementById('btn-import-cancel').addEventListener('click', hideImportPreview);

    document.getElementById('btn-import-confirm').addEventListener('click', () => {
      if (!pendingImport) return;
      const ok = confirm(
        'バックアップデータで現在のBudilデータを上書き復元します。\n\n' +
        '対象：営業先・売上・タスク・活動履歴・設定など\n' +
        '本番データがある場合は、先にエクスポートしてください。\n\nよろしいですか？'
      );
      if (!ok) return;

      DataBackup.importData(pendingImport.data, pendingImport.keys);
      hideImportPreview();
      refreshAllViews();
      alert('データを復元しました');
    });

    const resetInput = document.getElementById('reset-confirm-input');
    const resetBtn = document.getElementById('btn-reset-all');
    resetInput.addEventListener('input', () => {
      resetBtn.disabled = resetInput.value.trim() !== 'BUDIL DELETE';
    });

    resetBtn.addEventListener('click', () => {
      if (resetInput.value.trim() !== 'BUDIL DELETE') return;
      const ok = confirm('全Budilデータを削除します。この操作は取り消せません。本当に実行しますか？');
      if (!ok) return;

      DataBackup.clearAllData();
      resetInput.value = '';
      resetBtn.disabled = true;
      hideImportPreview();
      refreshAllViews();
      alert('全データを初期化しました');
    });

    const createTestBtn = document.getElementById('btn-create-test-data');
    if (createTestBtn) createTestBtn.addEventListener('click', createBudilTestData);
    const deleteTestBtn = document.getElementById('btn-delete-test-data');
    if (deleteTestBtn) deleteTestBtn.addEventListener('click', deleteBudilTestData);

    renderDataManagement();
  }

  function getRadarSnapshot() {
    const radarData = Storage.getDemandRadar();
    const dailyLogs = Storage.getRecentDemandLogs(7);
    const demand = Storage.getGeneratedPosts();
    return DemandRadar.analyze(radarData, dailyLogs, demand);
  }

  function getManagementContext() {
    const salesCtx = getSalesContext();
    const warnings = SalesBrain.collectWarnings(salesCtx.leads, salesCtx.followups, salesCtx.today);
    const radar = getRadarSnapshot();
    const report = ManagementBrain.generate({ ...salesCtx, warnings, radar });
    return { ...salesCtx, warnings, radar, report };
  }

  function renderMorningReport() {
    const { report } = getManagementContext();

    const greeting = document.getElementById('budil-greeting');
    greeting.innerHTML = `
      <div class="budil-avatar">B</div>
      <div class="budil-message">
        <strong>Budilからのメッセージ</strong>
        <p>${esc(report.budilMessage).replace(/\n/g, '<br>')}</p>
      </div>`;

    const decisionsEl = document.getElementById('mgmt-decisions');
    decisionsEl.innerHTML = report.decisions.map(d => `
      <li class="mgmt-decision-item">
        <span class="mgmt-rank">${d.rank}</span>
        <div class="mgmt-decision-body">
          <strong>${esc(d.title)}</strong>
          <span class="mgmt-action-badge">${esc(d.action)}</span>
          ${d.detail ? `<small>${esc(d.detail)}</small>` : ''}
        </div>
      </li>`).join('');

    const tasksEl = document.getElementById('mgmt-tasks');
    tasksEl.innerHTML = report.tasks.map((t, i) => `
      <li><span class="top3-num">${i + 1}</span> ${esc(t)}</li>`).join('');

    const demandTopEl = document.getElementById('mgmt-demand-top');
    if (demandTopEl) {
      const demandLines = DemandBrain.buildMorningDemandLines(Storage.getDemandPickups(), TODAY());
      demandTopEl.innerHTML = demandLines.length
        ? `<p class="mgmt-demand-label">今日の需要：</p><ul class="mgmt-demand-list">${demandLines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
        : '<p class="placeholder-text">需要ピックアップ未登録。需要番頭でクロクロ調査結果を取り込んでください。</p>';
    }

    const execTodayEl = document.getElementById('mgmt-execution-today');
    if (execTodayEl) {
      const scheduleItems = getTodayScheduleItems();
      const execLines = DemandBrain.buildMorningScheduleLines(scheduleItems);
      execTodayEl.innerHTML = execLines.length
        ? `<p class="mgmt-execution-label">今日の投稿・広告：</p><ol class="mgmt-execution-list">${execLines.map(l => `<li>${esc(l)}</li>`).join('')}</ol>`
        : '';
    }

    const improveTodayEl = document.getElementById('mgmt-improvement-today');
    if (improveTodayEl) {
      const improveLines = DemandBrain.buildMorningImprovementLines(Storage.getDemandPickups(), 2);
      improveTodayEl.innerHTML = improveLines.length
        ? `<p class="mgmt-improvement-label">今日の改善：</p><ul class="mgmt-improvement-list">${improveLines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
        : '';
    }

    const weeklyTodayEl = document.getElementById('mgmt-weekly-strategy');
    if (weeklyTodayEl) {
      const strategy = getWeeklyStrategy();
      const lines = strategy.morningLines || [];
      weeklyTodayEl.innerHTML = lines.length
        ? `<p class="mgmt-weekly-label">今週の作戦：</p><ul class="mgmt-weekly-list">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
        : '';
    }

    const postEl = document.getElementById('mgmt-post');
    postEl.innerHTML = `
      <p class="mgmt-highlight">${esc(report.todayPost.theme)}</p>
      <textarea class="mgmt-copy-text" id="mgmt-post-text" readonly rows="4">${esc(report.todayPost.copyText)}</textarea>
      <button class="btn btn-sm btn-copy" data-copy-target="mgmt-post-text">コピー</button>`;

    const salesEl = document.getElementById('mgmt-sales');
    const topTarget = SalesBrain.getTodayTargets(getSalesContext().enriched)[0];
    const salesOpenBtn = topTarget
      ? `<button type="button" class="btn btn-sm btn-primary mgmt-sales-open" data-open-lead="${esc(topTarget.id)}">営業文面を開く</button>`
      : '';
    const ts = report.todaySales;
    const priClass = topTarget ? 'priority-' + (topTarget.priorityLevel || 'low') : 'priority-low';
    salesEl.innerHTML = `
      <p class="mgmt-highlight">
        <span class="sales-priority-label ${priClass}">優先度${esc(ts.priorityLabel || '—')}</span>：
        <strong>${esc(ts.company)}</strong>
      </p>
      <p class="mgmt-meta">理由：${esc(ts.priorityReason || '—')}</p>
      <p class="mgmt-meta">次アクション：${esc(ts.nextAction || ts.action || '—')}</p>
      ${ts.presetLabel ? `<p class="mgmt-meta">プリセット：${esc(ts.presetLabel)}</p>` : ''}
      ${ts.salesStatus ? `<p class="mgmt-meta">営業ステータス：${esc(ts.salesStatus)}</p>` : ''}
      <textarea class="mgmt-copy-text" id="mgmt-sales-text" readonly rows="4">${esc(ts.copyText)}</textarea>
      <div class="mgmt-sales-actions">
        <button class="btn btn-sm btn-copy" data-copy-target="mgmt-sales-text">コピー</button>
        ${salesOpenBtn}
      </div>`;

    document.getElementById('mgmt-cautions').innerHTML = report.cautions.map(c =>
      `<li class="caution-item">⚠ ${esc(c)}</li>`).join('');

    document.getElementById('mgmt-skip').innerHTML = report.skipList.map(s =>
      `<li class="skip-item"><strong>${esc(s.item)}</strong><span>理由: ${esc(s.reason)}</span></li>`).join('');

    postEl.querySelector('[data-copy-target]').addEventListener('click', handleMgmtCopy);
    salesEl.querySelector('[data-copy-target]').addEventListener('click', handleMgmtCopy);
    const mgmtOpen = salesEl.querySelector('.mgmt-sales-open');
    if (mgmtOpen) {
      mgmtOpen.addEventListener('click', () => openSalesDetail(mgmtOpen.dataset.openLead, { navigate: true }));
    }

    const revenueEl = document.getElementById('mgmt-revenue');
    if (revenueEl) {
      const rev = getRevenueContext();
      revenueEl.innerHTML = renderRevenueSummaryHtml(rev.summary, rev.comment);
    }
    const mgmtOutcomeEl = document.getElementById('mgmt-sales-outcome');
    if (mgmtOutcomeEl) {
      const rev = getRevenueContext();
      mgmtOutcomeEl.innerHTML = renderSalesOutcomeHtml(rev.salesOutcome, { brief: true });
    }
    const mgmtCandidateEl = document.getElementById('mgmt-sales-candidate');
    if (mgmtCandidateEl) {
      mgmtCandidateEl.innerHTML = renderMorningSalesCandidateHtml();
      bindSalesOutcomeLeadLinks(mgmtCandidateEl);
    }
    renderManagementComment('mgmt-management-comment', { brief: true });
    renderMorningDailyTasksBrief();
    renderMorningRecentActivities();

    const top3Legacy = document.getElementById('dash-top3');
    if (top3Legacy) {
      top3Legacy.innerHTML = report.tasks.map((t, i) =>
        `<li><span class="top3-num">${i + 1}</span> ${esc(t)}</li>`).join('');
    }

    const settings = Storage.getSettings();
    settings.lastManagementReport = report;
    Storage.saveSettings(settings);
  }

  function handleMgmtCopy(e) {
    const id = e.currentTarget.dataset.copyTarget;
    const text = document.getElementById(id).value;
    copyText(text).then(() => {
      e.currentTarget.textContent = 'コピー済み';
      setTimeout(() => { e.currentTarget.textContent = 'コピー'; }, 1500);
    }).catch(() => alert('コピーに失敗しました'));
  }

  function getSalesContext() {
    const today = TODAY();
    const settings = Storage.getSettings();
    const demand = Storage.getGeneratedPosts();
    const leads = Storage.getLeads();
    const followups = Storage.getFollowups();
    const enriched = SalesBrain.enrichLeads(leads, demand, settings, today);
    return { today, settings, demand, leads, followups, enriched };
  }

  function renderSalesWarnings() {
    const container = document.getElementById('dash-sales-warnings');
    const { today, leads, followups } = getSalesContext();
    const warnings = SalesBrain.collectWarnings(leads, followups, today);
    if (!warnings.length) {
      container.innerHTML = '';
      container.classList.add('hidden');
      return;
    }
    container.classList.remove('hidden');
    container.innerHTML = warnings.map(w =>
      `<div class="alert-item alert-${w.type}">⚠ ${esc(w.text)}</div>`
    ).join('');
  }

  function renderSalesInsights() {
    const { enriched, demand } = getSalesContext();
    const targets = SalesBrain.getTodayTargets(enriched);
    const missions = SalesBrain.buildMissions(enriched, demand);

    const targetsEl = document.getElementById('dash-sales-targets');
    if (!targets.length) {
      targetsEl.innerHTML = '<p class="empty-state">営業先を登録すると、今日営業すべき会社が表示されます</p>';
    } else {
      targetsEl.innerHTML = targets.map(l => {
        const nextActionWarn = !l.nextAction ? '<span class="sales-priority-warning">次アクション未設定</span>' : '';
        const revSummary = RevenueBrain.getLeadRevenueSummary(l.id, Storage.getRevenueRecords());
        const revenueLine = revSummary.count
          ? `<p class="sales-target-meta">売上: ${esc(RevenueBrain.formatYen(revSummary.total))}${revSummary.latestDate ? '（最新: ' + esc(revSummary.latestDate) + '）' : ''}</p>`
          : '';
        return `
        <div class="sales-target-card sales-target-clickable" data-open-lead="${esc(l.id)}" role="button" tabindex="0">
          <div class="sales-target-header">
            <strong class="sales-target-company">${esc(l.company)}</strong>
            <span class="sales-priority-label priority-${l.priorityLevel || 'low'}">${esc(l.priorityLabel || '低')}</span>
          </div>
          <p class="sales-target-meta">
            <span class="sales-status-badge sales-status-${salesStatusClass(l.salesStatus)}">${esc(l.salesStatus)}</span>
            ${l.nextActionDate ? `<span class="sales-target-date">次アクション日: ${esc(l.nextActionDate)}</span>` : ''}
          </p>
          ${revenueLine}
          <p class="sales-target-product">${esc(l.productLabel)}</p>
          <p class="sales-target-reason"><span>理由：</span>${esc(l.priorityReason || l.displayReason)}</p>
          <p class="sales-target-action">次アクション: <strong>${esc(l.nextAction || l.suggestedAction || '—')}</strong> ${nextActionWarn}</p>
          <p class="sales-target-open-hint">タップして営業文面を表示 →</p>
        </div>`;
      }).join('');

      targetsEl.querySelectorAll('[data-open-lead]').forEach(card => {
        card.addEventListener('click', () => openSalesDetail(card.dataset.openLead, { navigate: true }));
        card.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openSalesDetail(card.dataset.openLead, { navigate: true });
          }
        });
      });
    }

    const missionsEl = document.getElementById('dash-sales-missions');
    missionsEl.innerHTML = missions.map(m =>
      `<li class="mission-item ${m.highlight ? 'mission-highlight' : ''} ${m.type === 'empty' ? 'placeholder-text' : ''}">${esc(m.text)}</li>`
    ).join('');
  }

  function renderAlerts() {
    const container = document.getElementById('dash-alerts');
    const alerts = collectAlerts();
    if (!alerts.length) {
      container.innerHTML = '';
      container.classList.add('hidden');
      return;
    }
    container.classList.remove('hidden');
    container.innerHTML = alerts.map(a =>
      `<div class="alert-item alert-${a.type}">${esc(a.text)}</div>`
    ).join('');
  }

  function collectAlerts() {
    const alerts = [];
    const today = TODAY();
    const leads = Storage.getLeads();
    const followups = Storage.getFollowups();

    leads.filter(l => l.nextContact && l.nextContact < today && !CLOSED_STATUSES.includes(l.status))
      .forEach(l => alerts.push({ type: 'warning', text: `【営業】${l.company} — 次回連絡日 ${l.nextContact} が過ぎています` }));

    followups.filter(f => f.nextContact && f.nextContact < today && !CLOSED_STATUSES.includes(f.status))
      .forEach(f => alerts.push({ type: 'danger', text: `【追客】${f.company} — フォロー漏れ（次回連絡日: ${f.nextContact}）` }));

    const aPriority = getSalesContext().enriched.filter(l => l.effectivePriority === 'A' && l.status === '未接触');
    if (aPriority.length > 0) {
      alerts.push({ type: 'info', text: `A優先の未接触リードが ${aPriority.length} 件あります` });
    }

    const posts = Storage.getGeneratedPosts();
    if (!posts || !posts.keywords || !posts.keywords.length) {
      alerts.push({ type: 'info', text: '需要サーチ番頭でキーワード分析を実行すると、投稿テーマが自動提案されます' });
    }

    return alerts.slice(0, 5);
  }

  function renderTop3() {
    /* 朝レポートと同期 — renderMorningReport で更新 */
  }

  function computeTop3Actions() {
    const actions = [];
    const today = TODAY();
    const leads = Storage.getLeads();
    const followups = Storage.getFollowups();
    const settings = Storage.getSettings();

    const overdueFollowups = followups
      .filter(f => f.nextContact && f.nextContact <= today && !CLOSED_STATUSES.includes(f.status))
      .sort((a, b) => (a.nextContact || '').localeCompare(b.nextContact || ''));
    if (overdueFollowups.length) {
      actions.push(`${overdueFollowups[0].company} にフォロー連絡（期限: ${overdueFollowups[0].nextContact}）`);
    }

    const aLeads = getSalesContext().enriched.filter(l => l.effectivePriority === 'A');
    if (aLeads.length > 0) {
      actions.push(`A優先: ${aLeads[0].company} へ${aLeads[0].suggestedAction}`);
    }

    const posts = Storage.getGeneratedPosts();
    if (posts && posts.postThemes && posts.postThemes[0]) {
      actions.push(`投稿作成: ${posts.postThemes[0]}`);
    } else if (posts && posts.themes && posts.themes[0]) {
      actions.push(`投稿作成: 「${posts.themes[0].replace(/「|」/g, '')}」`);
    } else if (settings.postTheme) {
      actions.push(`投稿作成: ${settings.postTheme}`);
    }

    const pending = followups.filter(f => f.status === '未送信' || f.status === '送信済み');
    if (actions.length < 3 && pending.length) {
      actions.push(`${pending[0].company} の追客ステータスを更新`);
    }

    const untouched = leads.filter(l => l.status === '未接触');
    if (actions.length < 3 && untouched.length) {
      actions.push(`新規アプローチ: ${untouched[0].company}`);
    }

    if (actions.length < 3) {
      actions.push('需要サーチ番頭でトレンドデータを貼り付けて分析');
    }

    return actions.slice(0, 3);
  }

  function renderDashboardLists() {
    const followupsEl = document.getElementById('dash-followups');
    const today = TODAY();

    const recontact = Storage.getFollowups()
      .filter(f => !CLOSED_STATUSES.includes(f.status) &&
        (f.nextContact && f.nextContact <= today || f.status === '返信あり' || f.status === '商談中'))
      .slice(0, 5);

    followupsEl.innerHTML = recontact.length
      ? recontact.map(f => `
        <div class="dash-list-item ${f.nextContact && f.nextContact < today ? 'overdue' : ''}">
          <span><strong>${esc(f.company)}</strong> — ${esc(f.nextAction || '次回アクション未設定')}</span>
          <span class="status-badge status-${esc(f.status)}">${esc(f.status)}</span>
        </div>`).join('')
      : '<p class="empty-state">再連絡すべき案件がありません</p>';
  }

  // ── 需要レーダー ──
  function saveRadarFromForm() {
    const data = Storage.getDemandRadar();
    Storage.saveDemandRadar({
      ...data,
      marketMemos: {
        news: document.getElementById('radar-memo-news').value,
        voices: document.getElementById('radar-memo-voices').value,
        competitor: document.getElementById('radar-memo-competitor').value,
        field: document.getElementById('radar-memo-field').value
      }
    });
  }

  function addRadarKeyword(text) {
    const kw = (text || '').trim();
    if (!kw) return;
    const data = Storage.getDemandRadar();
    if (!data.watchedKeywords) data.watchedKeywords = [];
    if (data.watchedKeywords.includes(kw)) return;
    data.watchedKeywords.push(kw);
    Storage.saveDemandRadar(data);
    renderRadarKeywordList();
    renderDemandRadar();
  }

  function removeRadarKeyword(kw) {
    const data = Storage.getDemandRadar();
    data.watchedKeywords = (data.watchedKeywords || []).filter(k => k !== kw);
    Storage.saveDemandRadar(data);
    renderRadarKeywordList();
    renderDemandRadar();
  }

  function renderRadarKeywordList() {
    const el = document.getElementById('radar-keyword-list');
    if (!el) return;
    const keywords = Storage.getDemandRadar().watchedKeywords || [];
    if (!keywords.length) {
      el.innerHTML = '<li class="placeholder-text">キーワードを追加してください</li>';
      return;
    }
    el.innerHTML = keywords.map(kw => `
      <li class="radar-keyword-item">
        <span>${esc(kw)}</span>
        <button type="button" class="btn btn-sm btn-danger radar-kw-remove" data-kw="${esc(kw)}">削除</button>
      </li>`).join('');
    el.querySelectorAll('.radar-kw-remove').forEach(btn => {
      btn.addEventListener('click', () => removeRadarKeyword(btn.dataset.kw));
    });
  }

  function renderDemandRadar() {
    saveRadarFromForm();
    const snapshot = getRadarSnapshot();

    const focusEl = document.getElementById('radar-weekly-focus');
    if (focusEl) focusEl.textContent = snapshot.weeklyFocus || '—';

    const servicesEl = document.getElementById('radar-services');
    if (servicesEl) {
      const maxScore = snapshot.serviceScores[0] && snapshot.serviceScores[0].score || 1;
      servicesEl.innerHTML = snapshot.serviceScores.map(svc => {
        const active = svc.score > 0;
        const pct = maxScore > 0 ? Math.round((svc.score / maxScore) * 100) : 0;
        return `
          <div class="radar-service-item ${active ? 'radar-service-active' : ''}">
            <strong>${esc(svc.name)}</strong>
            <div class="radar-service-bar"><span style="width:${pct}%"></span></div>
            ${svc.matched.length ? `<small>${esc(svc.matched.slice(0, 2).join('・'))}</small>` : '<small class="label-muted">—</small>'}
          </div>`;
      }).join('');
    }

    const upEl = document.getElementById('radar-trend-up');
    const downEl = document.getElementById('radar-trend-down');
    if (upEl) {
      upEl.innerHTML = snapshot.increasingTrends.length
        ? snapshot.increasingTrends.map(t =>
          `<li><strong>${esc(t.label)}</strong> <span class="trend-badge trend-up">${esc(t.change)}</span></li>`
        ).join('')
        : '<li class="placeholder-text">増加傾向はまだありません</li>';
    }
    if (downEl) {
      downEl.innerHTML = snapshot.decreasingTrends.length
        ? snapshot.decreasingTrends.map(t =>
          `<li><strong>${esc(t.label)}</strong> <span class="trend-badge trend-down">${esc(t.change)}</span></li>`
        ).join('')
        : '<li class="placeholder-text">減少傾向はまだありません</li>';
    }
  }

  function initDemandRadar() {
    const data = Storage.getDemandRadar();
    const memos = data.marketMemos || {};
    document.getElementById('radar-memo-news').value = memos.news || '';
    document.getElementById('radar-memo-voices').value = memos.voices || '';
    document.getElementById('radar-memo-competitor').value = memos.competitor || '';
    document.getElementById('radar-memo-field').value = memos.field || '';

    ['radar-memo-news', 'radar-memo-voices', 'radar-memo-competitor', 'radar-memo-field'].forEach(id => {
      document.getElementById(id).addEventListener('input', debounce(() => {
        saveRadarFromForm();
        renderDemandRadar();
      }, 500));
    });

    document.getElementById('btn-radar-add-keyword').addEventListener('click', () => {
      addRadarKeyword(document.getElementById('radar-keyword-input').value);
      document.getElementById('radar-keyword-input').value = '';
    });

    document.getElementById('radar-keyword-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addRadarKeyword(e.target.value);
        e.target.value = '';
      }
    });

    document.querySelectorAll('.radar-suggest-chip').forEach(chip => {
      chip.addEventListener('click', () => addRadarKeyword(chip.textContent.trim()));
    });

    document.getElementById('btn-radar-refresh').addEventListener('click', () => {
      saveRadarFromForm();
      renderDemandRadar();
      renderDashboard();
    });

    renderRadarKeywordList();
    renderDemandRadar();
  }

  // ── 需要サーチ ──
  function getDemandInputText() {
    const notes = Storage.getDemandNotes();
    return [
      document.getElementById('demand-trends').value,
      document.getElementById('demand-ads').value,
      document.getElementById('demand-gsc').value,
      document.getElementById('demand-field').value,
      document.getElementById('demand-instagram').value,
      notes.ga4 || ''
    ].join('\n');
  }

  function saveDemandNotesFromForm() {
    const notes = Storage.getDemandNotes();
    Storage.saveDemandNotes({
      ...notes,
      trends: document.getElementById('demand-trends').value,
      ads: document.getElementById('demand-ads').value,
      gsc: document.getElementById('demand-gsc').value,
      instagram: document.getElementById('demand-instagram').value,
      fieldNotes: document.getElementById('demand-field').value
    });
  }

  function syncTodayDemandFromLog() {
    const today = TODAY();
    const log = Storage.getDailyDemandLog(today);
    if (!log || !log.analysis) return;

    const posts = Storage.getGeneratedPosts();
    if (!posts || !posts.analyzedAt || (log.analyzedAt && log.analyzedAt >= posts.analyzedAt)) {
      Storage.saveGeneratedPosts(log.analysis);
    }
  }

  function appendDemandChip(targetId, text) {
    const el = document.getElementById(targetId);
    if (!el) return;
    const cur = el.value.trim();
    el.value = cur ? cur + '、' + text : text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function renderDemandLogHistory() {
    const el = document.getElementById('demand-log-history');
    if (!el) return;

    const logs = Storage.getRecentDemandLogs(7);
    if (!logs.length) {
      el.innerHTML = '<p class="empty-state">分析を実行すると、日別の需要ログがここに表示されます</p>';
      return;
    }

    el.innerHTML = logs.map(log => {
      const keywords = (log.keywords && log.keywords.length)
        ? log.keywords.slice(0, 5).join('・')
        : '—';
      const service = log.recommendedService
        || (log.analysis && log.analysis.recommendedServices && log.analysis.recommendedServices[0]
          && log.analysis.recommendedServices[0].name)
        || '—';
      const move = log.todayMove
        || (log.analysis && log.analysis.todayMove);
      const moveText = move
        ? esc(move.service) + ' — ' + esc(move.action || move.reason || '')
        : '—';

      return `
        <div class="demand-log-item">
          <div class="demand-log-header">
            <strong>${esc(log.date)}</strong>
            ${log.analyzedAt ? `<small>${esc(log.analyzedAt.slice(0, 16).replace('T', ' '))}</small>` : ''}
          </div>
          <p><span class="label-muted">主要キーワード:</span> ${keywords}</p>
          <p><span class="label-muted">推奨サービス:</span> ${esc(service)}</p>
          <p><span class="label-muted">今日の一手:</span> ${moveText}</p>
        </div>`;
    }).join('');
  }

  function initDemandSearch() {
    syncTodayDemandFromLog();

    const data = Storage.getDemandNotes();
    const dateEl = document.getElementById('demand-date');
    dateEl.value = TODAY();

    const map = {
      trends: 'demand-trends',
      ads: 'demand-ads',
      gsc: 'demand-gsc',
      instagram: 'demand-instagram',
      fieldNotes: 'demand-field'
    };

    Object.entries(map).forEach(([key, id]) => {
      const el = document.getElementById(id);
      el.value = data[key] || '';
      el.addEventListener('input', debounce(saveDemandNotesFromForm, 500));
    });

    document.querySelectorAll('#demand-quick-chips .memo-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        appendDemandChip(chip.dataset.target, chip.textContent.trim());
      });
    });

    document.getElementById('btn-analyze-demand').addEventListener('click', analyzeDemand);

    const saved = Storage.getGeneratedPosts();
    if (saved) renderDemandOutput(saved);
    renderDemandInsights();
    renderDemandLogHistory();
  }

  // ── 需要番頭（需要ピックアップ受信箱） ──
  function renderPickupServiceChips(selected) {
    const container = document.getElementById('pickup-services');
    if (!container) return;
    const sel = selected || [];
    container.innerHTML = DemandBrain.PICKUP_SERVICES.map(svc => `
      <label class="pickup-service-chip">
        <input type="checkbox" value="${esc(svc)}"${sel.includes(svc) ? ' checked' : ''}>
        <span>${esc(svc)}</span>
      </label>`).join('');
  }

  function getPickupFormData() {
    const services = [];
    document.querySelectorAll('#pickup-services input[type="checkbox"]:checked').forEach(cb => {
      services.push(cb.value);
    });
    const score = parseInt(document.getElementById('pickup-score').value, 10);
    return {
      date: document.getElementById('pickup-date').value || TODAY(),
      source: document.getElementById('pickup-source').value,
      topic: document.getElementById('pickup-topic').value.trim(),
      summary: document.getElementById('pickup-summary').value.trim(),
      demandScore: isNaN(score) ? 0 : Math.min(100, Math.max(0, score)),
      relatedServices: services,
      postAction: document.getElementById('pickup-post-action').value.trim(),
      salesAction: document.getElementById('pickup-sales-action').value.trim(),
      adAction: document.getElementById('pickup-ad-action').value.trim(),
      memo: document.getElementById('pickup-memo').value.trim()
    };
  }

  function setPickupFormData(data) {
    if (!data) return;
    if (data.date) document.getElementById('pickup-date').value = data.date;
    if (data.source) document.getElementById('pickup-source').value = data.source;
    if (data.topic != null) document.getElementById('pickup-topic').value = data.topic;
    if (data.summary != null) document.getElementById('pickup-summary').value = data.summary;
    if (data.demandScore != null) document.getElementById('pickup-score').value = data.demandScore;
    if (data.postAction != null) document.getElementById('pickup-post-action').value = data.postAction;
    if (data.salesAction != null) document.getElementById('pickup-sales-action').value = data.salesAction;
    if (data.adAction != null) document.getElementById('pickup-ad-action').value = data.adAction;
    if (data.memo != null) document.getElementById('pickup-memo').value = data.memo;
    renderPickupServiceChips(data.relatedServices || []);
  }

  function clearPickupForm() {
    document.getElementById('pickup-form').reset();
    document.getElementById('pickup-date').value = TODAY();
    document.getElementById('pickup-score').value = 50;
    document.getElementById('pickup-source').value = 'クロクロ';
    renderPickupServiceChips([]);
    const paste = document.getElementById('pickup-paste-area');
    if (paste) paste.value = '';
    pickupBulkPreview = [];
    renderPickupBulkPreview();
  }

  function isPickupTaskDuplicate(date, topic, actionType, rawTitle) {
    if (!rawTitle) return false;
    const key = DemandBrain.buildPickupTaskDedupeKey(date, topic, actionType, rawTitle);
    return Storage.getDailyActionTasksData().manualTasks.some(t => t.pickupDedupeKey === key);
  }

  function addPickupTaskSingle(pickup, actionType, today) {
    const task = DemandBrain.buildDailyTaskFromPickup(pickup, actionType);
    if (!task) return 'empty';
    const date = today || TODAY();
    if (isPickupTaskDuplicate(date, task.topic, task.actionType, task.rawTitle)) {
      return 'duplicate';
    }
    Storage.addManualDailyTask({
      title: task.title,
      targetName: '—',
      priority: task.priority,
      action: task.reason,
      memo: task.reason,
      dueDate: date,
      status: 'open',
      reason: task.reason,
      pickupDedupeKey: DemandBrain.buildPickupTaskDedupeKey(date, task.topic, task.actionType, task.rawTitle),
      pickupTopic: task.topic,
      pickupActionType: task.actionType
    });
    return 'added';
  }

  function reportPickupTaskResults(results) {
    const added = results.filter(r => r === 'added').length;
    const duplicate = results.filter(r => r === 'duplicate').length;
    if (!added && duplicate) {
      alert('すでに今日やることに追加済みです');
      return;
    }
    if (!added) {
      alert('追加できるアクション案がありません。投稿・営業・広告案を入力してください。');
      return;
    }
    renderDailyActionTasks();
    renderMorningDailyTasksBrief();
    renderMorningReport();
    let msg = '今日やることに' + added + '件追加しました。';
    if (duplicate) msg += '（' + duplicate + '件は追加済みのためスキップ）';
    alert(msg);
  }

  function addPickupTasksToDaily(pickup, actionTypes) {
    const types = actionTypes || ['post', 'sales', 'ad'];
    const results = types.map(type => addPickupTaskSingle(pickup, type, TODAY()));
    reportPickupTaskResults(results);
  }

  function addPickupTaskById(id, actionType) {
    const pickup = Storage.getDemandPickups().find(p => p.id === id);
    if (!pickup) return;
    const result = addPickupTaskSingle(pickup, actionType, TODAY());
    if (result === 'duplicate') {
      alert('すでに今日やることに追加済みです');
      return;
    }
    if (result === 'empty') {
      alert('追加できるアクション案がありません。');
      return;
    }
    renderDailyActionTasks();
    renderMorningDailyTasksBrief();
    renderMorningReport();
    alert('今日やることに追加しました。');
  }

  function addAllPickupTasksById(id) {
    const pickup = Storage.getDemandPickups().find(p => p.id === id);
    if (!pickup) return;
    addPickupTasksToDaily(pickup);
  }

  function addTop3AllTasks() {
    const top3 = DemandBrain.getTopDemandPickups(Storage.getDemandPickups(), TODAY());
    if (!top3.length) {
      alert('今日の需要トップ3がありません。');
      return;
    }
    const results = [];
    top3.forEach(p => {
      ['post', 'sales', 'ad'].forEach(type => results.push(addPickupTaskSingle(p, type, TODAY())));
    });
    reportPickupTaskResults(results);
  }

  function applyPickupPaste() {
    const text = document.getElementById('pickup-paste-area').value;
    if (DemandBrain.isBulkPasteFormat(text)) {
      const items = DemandBrain.parseKurokuroBulkPaste(text);
      if (!items.length) {
        alert('3件形式の貼り付け内容を読み取れませんでした。ラベルを確認してください。');
        return;
      }
      pickupBulkPreview = items.map((item, index) => ({ ...item, included: true, index }));
      renderPickupBulkPreview();
      return;
    }
    pickupBulkPreview = [];
    renderPickupBulkPreview();
    const parsed = DemandBrain.parseKurokuroPaste(text);
    if (!Object.keys(parsed).length) {
      alert('貼り付け内容から項目を読み取れませんでした。テーマ・要約などのラベルを確認してください。');
      return;
    }
    const current = getPickupFormData();
    setPickupFormData({
      ...current,
      topic: parsed.topic || current.topic,
      summary: parsed.summary || current.summary,
      demandScore: parsed.demandScore != null ? parsed.demandScore : current.demandScore,
      relatedServices: parsed.relatedServices && parsed.relatedServices.length
        ? parsed.relatedServices : current.relatedServices,
      postAction: parsed.postAction || current.postAction,
      salesAction: parsed.salesAction || current.salesAction,
      adAction: parsed.adAction || current.adAction,
      memo: parsed.memo || current.memo
    });
  }

  function renderPickupBulkPreview() {
    const wrap = document.getElementById('pickup-bulk-preview');
    const list = document.getElementById('pickup-bulk-preview-list');
    const saveBtn = document.getElementById('btn-pickup-save-bulk');
    if (!wrap || !list) return;
    const hasPreview = pickupBulkPreview.length > 0;
    wrap.classList.toggle('hidden', !hasPreview);
    if (saveBtn) saveBtn.classList.toggle('hidden', !hasPreview);
    if (!hasPreview) {
      list.innerHTML = '';
      return;
    }
    list.innerHTML = pickupBulkPreview.map((item, i) => {
      const services = (item.relatedServices || []).join('、') || '—';
      return `
        <div class="pickup-preview-card${item.included ? '' : ' pickup-preview-excluded'}">
          <label class="pickup-preview-include">
            <input type="checkbox" data-pickup-preview-toggle="${i}"${item.included ? ' checked' : ''}>
            <span>保存対象</span>
          </label>
          <div class="pickup-preview-body">
            <p><strong>テーマ：</strong>${esc(item.topic || '—')}</p>
            <p><strong>需要スコア：</strong>${item.demandScore != null ? item.demandScore : '—'}</p>
            <p><strong>要約：</strong>${esc(item.summary || '—')}</p>
            <p><strong>関連サービス：</strong>${esc(services)}</p>
            <p><strong>投稿案：</strong>${esc(item.postAction || '—')}</p>
            <p><strong>営業案：</strong>${esc(item.salesAction || '—')}</p>
            <p><strong>広告案：</strong>${esc(item.adAction || '—')}</p>
          </div>
        </div>`;
    }).join('');
    list.querySelectorAll('[data-pickup-preview-toggle]').forEach(cb => {
      cb.addEventListener('change', () => {
        const idx = parseInt(cb.dataset.pickupPreviewToggle, 10);
        if (pickupBulkPreview[idx]) {
          pickupBulkPreview[idx].included = cb.checked;
          renderPickupBulkPreview();
        }
      });
    });
  }

  function saveBulkPickups() {
    const selected = pickupBulkPreview.filter(item => item.included);
    if (!selected.length) {
      alert('保存対象が選ばれていません。');
      return;
    }
    const defaults = {
      date: document.getElementById('pickup-date').value || TODAY(),
      source: document.getElementById('pickup-source').value || 'クロクロ'
    };
    selected.forEach(item => {
      Storage.addDemandPickup(DemandBrain.buildPickupFromParsed(item, defaults));
    });
    pickupBulkPreview = [];
    renderPickupBulkPreview();
    renderDemandPickup();
    renderManagementComments();
    renderMorningReport();
    alert(selected.length + '件の需要ピックアップを保存しました。');
  }

  function savePickupFromForm() {
    const form = getPickupFormData();
    if (!form.topic) {
      alert('需要テーマを入力してください。');
      return null;
    }
    const record = Storage.addDemandPickup(DemandBrain.buildPickupFromForm(form));
    renderDemandPickup();
    renderManagementComments();
    renderMorningReport();
    return record;
  }

  function addPickupTasksFromForm() {
    const form = getPickupFormData();
    if (!form.topic) {
      alert('需要テーマを入力してください。');
      return;
    }
    const pickup = DemandBrain.buildPickupFromForm(form);
    addPickupTasksToDaily(pickup);
  }

  function updatePickupStatus(id, status) {
    Storage.updateDemandPickup(id, { status });
    renderDemandPickup();
    renderManagementComments();
    renderMorningReport();
    renderDashTodayExecutionPlan();
    renderActionCalendar();
  }

  function pickupContentButtonsHtml(id) {
    if (!id) return '';
    const types = [
      ['reel', 'リール案を作る'],
      ['instagram', '投稿文を作る'],
      ['line', 'LINE文を作る'],
      ['gbp', 'GBP投稿を作る'],
      ['ad', '広告文を作る'],
      ['all', '全部作る']
    ];
    return `<div class="pickup-content-quick-actions">
      ${types.map(([type, label]) =>
        `<button type="button" class="btn btn-sm btn-secondary" data-pickup-gen-card="${esc(id)}" data-gen-type="${type}">${label}</button>`
      ).join('')}
    </div>`;
  }

  function getPickupRawById(id) {
    return Storage.getDemandPickups().find(p => p.id === id) || null;
  }

  function savePickupGeneratedOutputs(id, outputs) {
    Storage.updateDemandPickup(id, {
      generatedOutputs: DemandBrain.formatGeneratedOutputsForSave(outputs)
    });
  }

  function generatePickupContentForId(id, type) {
    const pickup = getPickupRawById(id);
    if (!pickup) {
      alert('需要ピックアップが見つかりません。');
      return;
    }
    const prev = pickup.generatedOutputs || {};
    let outputs = { ...prev };
    if (type === 'all') {
      outputs = DemandBrain.generateAllOutputs(pickup);
    } else if (type === 'reel') {
      outputs.reel = DemandBrain.generateReelPlan(pickup);
      outputs.updatedAt = new Date().toISOString();
    } else if (type === 'instagram') {
      outputs.instagram = DemandBrain.generateInstagramCaption(pickup).fullText;
      outputs.updatedAt = new Date().toISOString();
    } else if (type === 'line') {
      outputs.line = DemandBrain.generateLineMessage(pickup);
      outputs.updatedAt = new Date().toISOString();
    } else if (type === 'gbp') {
      outputs.gbp = DemandBrain.generateGbpPost(pickup);
      outputs.updatedAt = new Date().toISOString();
    } else if (type === 'ad') {
      outputs.ad = DemandBrain.generateAdCopy(pickup).fullText;
      outputs.updatedAt = new Date().toISOString();
    }
    savePickupGeneratedOutputs(id, outputs);
    selectedPickupContentId = id;
    const selectEl = document.getElementById('pickup-content-select');
    if (selectEl) selectEl.value = id;
    renderPickupContentPanel();
    renderPickupExecutionManagement();
    renderPickupSavedList();
    const panel = document.querySelector('.card-pickup-content');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function isPickupContentTaskDuplicate(date, topic, contentType) {
    const key = DemandBrain.buildContentTaskDedupeKey(date, topic, contentType);
    return Storage.getDailyActionTasksData().manualTasks.some(t => t.pickupDedupeKey === key);
  }

  function addPickupContentTask(id, contentType) {
    const pickup = getPickupRawById(id);
    if (!pickup) return;
    const task = DemandBrain.buildContentDailyTask(pickup, contentType);
    if (!task) return;
    const date = TODAY();
    const key = DemandBrain.buildContentTaskDedupeKey(date, task.topic, contentType);
    if (isPickupContentTaskDuplicate(date, task.topic, contentType)) {
      alert('すでに今日やることに追加済みです');
      return;
    }
    Storage.addManualDailyTask({
      title: task.title,
      targetName: '—',
      priority: task.priority,
      action: task.reason,
      memo: task.reason,
      dueDate: date,
      status: 'open',
      reason: task.reason,
      pickupDedupeKey: key,
      pickupTopic: task.topic,
      pickupActionType: 'content-' + contentType
    });
    renderDailyActionTasks();
    renderMorningDailyTasksBrief();
    renderMorningReport();
    alert('今日やることに追加しました。');
  }

  function copyPickupContentText(text, label) {
    if (!text) {
      alert((label || '文案') + 'がまだ生成されていません。');
      return;
    }
    copyText(text)
      .then(() => alert((label || '文案') + 'をコピーしました。'))
      .catch(() => alert('コピーに失敗しました。'));
  }

  function renderPickupContentSelect() {
    const selectEl = document.getElementById('pickup-content-select');
    if (!selectEl) return;
    const today = TODAY();
    const list = Storage.getDemandPickups()
      .filter(p => p.date === today && p.status !== 'ignored' && p.status !== 'archived')
      .map(p => DemandBrain.normalizePickup(p))
      .sort((a, b) => b.demandScore - a.demandScore);
    const current = selectedPickupContentId || selectEl.value;
    selectEl.innerHTML = '<option value="">需要を選択してください</option>' +
      list.map(p => `<option value="${esc(p.id)}"${p.id === current ? ' selected' : ''}>${esc(p.topic)}（${p.demandScore}点）</option>`).join('');
    if (!current && list.length) {
      selectedPickupContentId = list[0].id;
      selectEl.value = list[0].id;
    } else if (current) {
      selectedPickupContentId = current;
    }
  }

  function renderPickupContentOutputs() {
    const el = document.getElementById('pickup-content-outputs');
    if (!el) return;
    const id = selectedPickupContentId || document.getElementById('pickup-content-select')?.value;
    if (!id) {
      el.innerHTML = '<p class="placeholder-text">需要を選んで「リール案を作る」などを押すと、ここに生成文案が表示されます。</p>';
      return;
    }
    const pickup = getPickupRawById(id);
    if (!pickup) {
      el.innerHTML = '<p class="placeholder-text">需要ピックアップが見つかりません。</p>';
      return;
    }
    const p = DemandBrain.normalizePickup(pickup);
    const out = pickup.generatedOutputs || {};
    const blocks = [
      { key: 'reel', title: 'Instagramリール構成', copyLabel: 'リール案コピー', taskType: 'reel' },
      { key: 'instagram', title: 'Instagram投稿文', copyLabel: '投稿文コピー', taskType: 'instagram' },
      { key: 'line', title: 'LINE配信文', copyLabel: 'LINE文コピー', taskType: 'line' },
      { key: 'gbp', title: 'Googleビジネスプロフィール投稿', copyLabel: 'GBP投稿コピー', taskType: 'gbp' },
      { key: 'ad', title: 'Google広告文案', copyLabel: '広告文コピー', taskType: 'ad' }
    ];
    const hasAny = blocks.some(b => out[b.key]);
    if (!hasAny) {
      el.innerHTML = `<p class="pickup-content-selected">選択中：<strong>${esc(p.topic)}</strong></p>
        <p class="placeholder-text">まだ生成文案がありません。上のボタンから作成してください。</p>`;
      return;
    }
    el.innerHTML = `
      <p class="pickup-content-selected">選択中：<strong>${esc(p.topic)}</strong>
        ${out.updatedAt ? `<span class="pickup-content-updated">更新：${esc(new Date(out.updatedAt).toLocaleString('ja-JP'))}</span>` : ''}
      </p>
      ${blocks.filter(b => out[b.key]).map(b => `
        <div class="pickup-content-block" data-content-key="${b.key}">
          <div class="pickup-content-block-header">
            <h3>${esc(b.title)}</h3>
            <div class="pickup-content-block-actions">
              <button type="button" class="btn btn-sm btn-secondary" data-copy-content="${b.key}">${esc(b.copyLabel)}</button>
              <button type="button" class="btn btn-sm btn-primary" data-add-content-task="${b.taskType}">今日やることへ追加</button>
            </div>
          </div>
          <textarea class="pickup-content-text" readonly rows="8">${esc(out[b.key])}</textarea>
        </div>`).join('')}`;
    el.querySelectorAll('[data-copy-content]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.copyContent;
        const labels = { reel: 'リール案', instagram: '投稿文', line: 'LINE文', gbp: 'GBP投稿', ad: '広告文' };
        copyPickupContentText(out[key], labels[key]);
      });
    });
    el.querySelectorAll('[data-add-content-task]').forEach(btn => {
      btn.addEventListener('click', () => addPickupContentTask(id, btn.dataset.addContentTask));
    });
  }

  function renderPickupContentPanel() {
    renderPickupContentSelect();
    renderPickupContentOutputs();
  }

  function isExecutionTaskDuplicate(date, topic, type, title) {
    const key = DemandBrain.buildExecutionTaskDedupeKey(date, topic, type, title);
    return Storage.getDailyActionTasksData().manualTasks.some(t => t.pickupDedupeKey === key);
  }

  function addExecutionTask(pickupId, type) {
    const pickup = getPickupRawById(pickupId);
    if (!pickup) return;
    const task = DemandBrain.createExecutionTaskPayload(pickup, type);
    if (!task) return;
    const date = TODAY();
    const key = DemandBrain.buildExecutionTaskDedupeKey(date, task.topic, type, task.title);
    if (isExecutionTaskDuplicate(date, task.topic, type, task.title)) {
      alert('すでに今日やることに追加済みです');
      return;
    }
    Storage.addManualDailyTask({
      title: task.title,
      targetName: '—',
      priority: task.priority,
      action: task.reason,
      memo: task.reason,
      dueDate: date,
      status: 'open',
      reason: task.reason,
      pickupDedupeKey: key,
      pickupTopic: task.topic,
      pickupActionType: 'execution-' + type
    });
    renderDailyActionTasks();
    renderMorningDailyTasksBrief();
    renderMorningReport();
    renderDashTodayExecutionPlan();
    renderActionCalendar();
    alert('今日やることに追加しました。');
  }

  function updatePickupExecution(id, type, patch) {
    const pickup = getPickupRawById(id);
    if (!pickup) return;
    const exec = DemandBrain.normalizeExecutionStatus(pickup);
    const prev = { ...exec[type] };
    const next = { ...prev, ...patch };
    exec[type] = next;
    const updates = { executionStatus: exec };

    if (patch.status === 'posted' && prev.status !== 'posted') {
      if (!next.executedAt) {
        next.executedAt = TODAY();
        exec[type] = next;
        updates.executionStatus = exec;
      }
      const meta = DemandBrain.EXECUTION_META[type];
      const logs = Array.isArray(pickup.executionLogs) ? [...pickup.executionLogs] : [];
      logs.unshift(DemandBrain.createExecutionLog(pickup, type, next.memo || (meta ? meta.doneLog : '')));
      updates.executionLogs = logs;
    }

    Storage.updateDemandPickup(id, updates);
    renderPickupExecutionManagement();
    renderPickupInsightsSections();
    renderPickupSavedList();
    renderDashTodayExecutionPlan();
    renderDashImprovementHints();
    renderActionCalendar();
    const execTodayEl = document.getElementById('mgmt-execution-today');
    if (execTodayEl) {
      const scheduleItems = getTodayScheduleItems();
      const execLines = DemandBrain.buildMorningScheduleLines(scheduleItems);
      execTodayEl.innerHTML = execLines.length
        ? `<p class="mgmt-execution-label">今日の投稿・広告：</p><ol class="mgmt-execution-list">${execLines.map(l => `<li>${esc(l)}</li>`).join('')}</ol>`
        : '';
    }
    const improveTodayEl = document.getElementById('mgmt-improvement-today');
    if (improveTodayEl) {
      const improveLines = DemandBrain.buildMorningImprovementLines(Storage.getDemandPickups(), 2);
      improveTodayEl.innerHTML = improveLines.length
        ? `<p class="mgmt-improvement-label">今日の改善：</p><ul class="mgmt-improvement-list">${improveLines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
        : '';
    }
  }

  function getInsightBadgesForPickup(pickup) {
    const badges = DemandBrain.buildExecutionSummary(pickup);
    const topic = DemandBrain.normalizePickup(pickup).topic;
    const hasImproveTask = Storage.getDailyActionTasksData().manualTasks.some(t =>
      t.pickupTopic === topic && t.pickupActionType && /^improve-/.test(t.pickupActionType)
    );
    if (hasImproveTask && !badges.some(b => b.key === 'improve-task')) {
      badges.push({ key: 'improve-task', label: '改善タスクあり', className: 'insight-badge-improve-task' });
    }
    return badges;
  }

  function isImprovementTaskDuplicate(date, topic, type, taskKind, title) {
    const key = DemandBrain.buildImprovementTaskDedupeKey(date, topic, type, taskKind, title);
    return Storage.getDailyActionTasksData().manualTasks.some(t => t.pickupDedupeKey === key);
  }

  function addImprovementTask(pickupId, type, judgment) {
    const pickup = getPickupRawById(pickupId);
    if (!pickup) return;
    const task = DemandBrain.createImprovementTaskPayload(pickup, type, judgment);
    if (!task) return;
    const date = TODAY();
    const key = DemandBrain.buildImprovementTaskDedupeKey(date, task.topic, type, task.taskKind, task.title);
    if (isImprovementTaskDuplicate(date, task.topic, type, task.taskKind, task.title)) {
      alert('すでに今日やることに追加済みです');
      return;
    }
    Storage.addManualDailyTask({
      title: task.title,
      targetName: '—',
      priority: task.priority,
      action: task.reason,
      memo: task.reason,
      dueDate: date,
      status: 'open',
      reason: task.reason,
      pickupDedupeKey: key,
      pickupTopic: task.topic,
      pickupActionType: 'improve-' + task.taskKind + '-' + type
    });
    renderDailyActionTasks();
    renderMorningDailyTasksBrief();
    renderMorningReport();
    renderDashImprovementHints();
    renderPickupInsightsSections();
    renderPickupSavedList();
    alert('今日やることに追加しました。');
  }

  function judgmentClassName(judgment) {
    if (judgment === 'good') return 'reflection-judgment-good';
    if (judgment === 'needs_improvement') return 'reflection-judgment-needs';
    return 'reflection-judgment-neutral';
  }

  function renderPickupInsightsSummary() {
    const el = document.getElementById('pickup-insights-summary');
    if (!el) return;
    const pickups = Storage.getDemandPickups();
    const insights = DemandBrain.getExecutionInsights(pickups);
    if (!insights.total) {
      el.innerHTML = '<p class="placeholder-text">効果メモや実行済み記録がまだありません。投稿・広告アクション管理で効果を記録すると、ここに集計が表示されます。</p>';
      return;
    }
    el.innerHTML = `
      <div class="pickup-insights-stats">
        <span class="insight-stat insight-stat-good">良い反応 <strong>${insights.goodCount}</strong>件</span>
        <span class="insight-stat insight-stat-needs">改善必要 <strong>${insights.needsImprovementCount}</strong>件</span>
        <span class="insight-stat insight-stat-memo">効果メモあり <strong>${insights.hasResultMemoCount}</strong>件</span>
      </div>`;
  }

  function renderPickupReflectionList() {
    const el = document.getElementById('pickup-reflection-list');
    if (!el) return;
    const items = DemandBrain.getReflectionItems(Storage.getDemandPickups());
    if (!items.length) {
      el.innerHTML = '<p class="placeholder-text">ふり返り対象はまだありません。実行済みにして効果メモを入力してください。</p>';
      return;
    }
    el.innerHTML = items.map(item => `
      <div class="pickup-reflection-item ${judgmentClassName(item.judgment)}">
        <div class="pickup-reflection-header">
          <strong>${esc(item.topic)}</strong>
          <span class="pickup-reflection-channel">${esc(item.channelLabel)}</span>
          <span class="pickup-reflection-judgment ${judgmentClassName(item.judgment)}">${esc(item.judgmentLabel)}</span>
        </div>
        <p class="pickup-reflection-meta">実行日：${esc(item.executedAt || '—')}</p>
        ${item.resultMemo ? `<p class="pickup-reflection-memo"><span class="reflection-label">効果メモ</span>${esc(item.resultMemo)}</p>` : ''}
        ${item.nextImproveMemo ? `<p class="pickup-reflection-memo"><span class="reflection-label">次回改善</span>${esc(item.nextImproveMemo)}</p>` : ''}
        <p class="pickup-reflection-action"><span class="reflection-label">次回アクション</span>${esc(item.nextAction)}</p>
        <div class="pickup-reflection-actions">
          ${item.judgment === 'good' ? `<button type="button" class="btn btn-sm btn-primary" data-reflection-sequel="${esc(item.pickupId)}" data-reflection-type="${esc(item.type)}">続編タスクを追加</button>` : ''}
          ${item.judgment === 'needs_improvement' ? `<button type="button" class="btn btn-sm btn-secondary" data-reflection-improve="${esc(item.pickupId)}" data-reflection-type="${esc(item.type)}">改善タスクを追加</button>` : ''}
        </div>
      </div>`).join('');
    bindPickupReflectionEvents(el);
  }

  function renderPickupWinningList() {
    const el = document.getElementById('pickup-winning-list');
    if (!el) return;
    const patterns = DemandBrain.getWinningPatterns(Storage.getDemandPickups());
    if (!patterns.length) {
      el.innerHTML = '<p class="placeholder-text">勝ちパターン候補はまだありません。効果メモに「反応あり」などを記録すると表示されます。</p>';
      return;
    }
    el.innerHTML = patterns.map(p => `
      <div class="pickup-winning-item">
        <strong class="pickup-winning-topic">${esc(p.topic)}</strong>
        <p class="pickup-winning-meta">関連：${esc(p.relatedServices.join(' / ') || '—')}</p>
        <p class="pickup-winning-meta">良かった：${esc(p.channelLabel)}</p>
        <p class="pickup-winning-meta">効果：${esc(p.resultMemo || '—')}</p>
        <p class="pickup-winning-next">次：${esc(p.nextGrowPlan)}</p>
        <button type="button" class="btn btn-sm btn-primary" data-reflection-sequel="${esc(p.pickupId)}" data-reflection-type="${esc(p.type)}">続編タスクを追加</button>
      </div>`).join('');
    bindPickupReflectionEvents(el);
  }

  function renderPickupImprovementList() {
    const el = document.getElementById('pickup-improvement-list');
    if (!el) return;
    const candidates = DemandBrain.getImprovementCandidates(Storage.getDemandPickups());
    if (!candidates.length) {
      el.innerHTML = '<p class="placeholder-text">改善が必要な投稿・広告はまだありません。効果メモに「反応薄い」などを記録すると表示されます。</p>';
      return;
    }
    el.innerHTML = candidates.map(c => `
      <div class="pickup-improvement-item">
        <strong class="pickup-improvement-topic">${esc(c.topic)}${c.type === 'ad' ? ' ' + esc(c.channelLabel) : ''}</strong>
        <p class="pickup-improvement-meta">チャネル：${esc(c.channelLabel)}</p>
        <p class="pickup-improvement-meta">効果：${esc(c.resultMemo || '—')}</p>
        ${c.nextImproveMemo ? `<p class="pickup-improvement-meta">次回改善：${esc(c.nextImproveMemo)}</p>` : ''}
        <p class="pickup-improvement-plan">改善：${esc(c.improvePlan)}</p>
        <button type="button" class="btn btn-sm btn-primary" data-reflection-improve="${esc(c.pickupId)}" data-reflection-type="${esc(c.type)}">改善タスクを追加</button>
      </div>`).join('');
    bindPickupReflectionEvents(el);
  }

  function bindPickupReflectionEvents(container) {
    if (!container) return;
    container.querySelectorAll('[data-reflection-sequel]').forEach(btn => {
      btn.addEventListener('click', () => addImprovementTask(btn.dataset.reflectionSequel, btn.dataset.reflectionType, 'good'));
    });
    container.querySelectorAll('[data-reflection-improve]').forEach(btn => {
      btn.addEventListener('click', () => addImprovementTask(btn.dataset.reflectionImprove, btn.dataset.reflectionType, 'needs_improvement'));
    });
  }

  function renderPickupInsightsSections() {
    renderPickupInsightsSummary();
    renderPickupReflectionList();
    renderPickupWinningList();
    renderPickupImprovementList();
  }

  function renderDashImprovementHints() {
    const el = document.getElementById('dash-improvement-hints');
    if (!el) return;
    const hints = DemandBrain.buildImprovementHints(Storage.getDemandPickups(), 2);
    if (!hints.length) {
      el.innerHTML = '<p class="placeholder-text">効果メモを入れると、ここに改善ヒントが出ます。</p>';
      return;
    }
    el.innerHTML = `<ul class="dash-improvement-hints-list">${hints.map(h => `<li>${esc(h.text)}</li>`).join('')}</ul>`;
  }

  function getWeeklyStrategyContext() {
    const today = TODAY();
    const rev = getRevenueContext();
    const sales = getSalesContext();
    return {
      today,
      period: weeklyStrategyPeriod,
      pickups: Storage.getDemandPickups(),
      records: rev.records,
      leads: rev.leads,
      enriched: sales.enriched
    };
  }

  function getWeeklyStrategy() {
    return DemandBrain.buildWeeklyStrategy(getWeeklyStrategyContext());
  }

  function isWeeklyTaskDuplicate(date, taskKind, title) {
    const key = DemandBrain.buildWeeklyTaskDedupeKey(date, taskKind, title);
    return Storage.getDailyActionTasksData().manualTasks.some(t => t.pickupDedupeKey === key);
  }

  function addWeeklyStrategyTask(task) {
    if (!task || !task.title) return false;
    const date = TODAY();
    const key = DemandBrain.buildWeeklyTaskDedupeKey(date, task.taskKind, task.title);
    if (isWeeklyTaskDuplicate(date, task.taskKind, task.title)) return false;
    Storage.addManualDailyTask({
      title: task.title,
      targetName: '—',
      priority: task.priority || '中',
      action: task.reason,
      memo: task.reason,
      dueDate: date,
      status: 'open',
      reason: task.reason,
      pickupDedupeKey: key,
      pickupTopic: task.topic || '',
      pickupActionType: 'weekly-' + (task.taskKind || 'action')
    });
    return true;
  }

  function addWeeklyStrategyTaskByIndex(index) {
    const strategy = getWeeklyStrategy();
    const task = (strategy.actionTasks || [])[index];
    if (!task) return;
    if (addWeeklyStrategyTask(task)) {
      renderDailyActionTasks();
      renderMorningDailyTasksBrief();
      renderWeeklyStrategyBoard();
      renderActionCalendar();
      alert('今日やることに追加しました。');
    } else {
      alert('すでに今日やることに追加済みです');
    }
  }

  function addAllWeeklyStrategyTasks() {
    const strategy = getWeeklyStrategy();
    let added = 0;
    let skipped = 0;
    (strategy.actionTasks || []).forEach(task => {
      if (addWeeklyStrategyTask(task)) added++;
      else skipped++;
    });
    renderDailyActionTasks();
    renderMorningDailyTasksBrief();
    renderWeeklyStrategyBoard();
    renderActionCalendar();
    alert(`追加：${added}件${skipped ? ` / スキップ（重複）：${skipped}件` : ''}`);
  }

  function renderWeeklyStrategyBoard() {
    const el = document.getElementById('dash-weekly-strategy');
    if (!el) return;
    const strategy = getWeeklyStrategy();
    const periodLabels = { '7d': '直近7日', month: '今月', all: 'すべて' };

    if (!strategy.hasData) {
      el.innerHTML = `
        <p class="weekly-strategy-empty">週間作戦を出すには、需要ピックアップ・実行メモ・効果メモを少しずつ保存してください。<br>まずはクロクロ調査結果を3件取り込むところから始めましょう。</p>`;
      return;
    }

    const commentHtml = (strategy.comment || []).length
      ? `<div class="weekly-strategy-comment">${strategy.comment.map(l => `<p>${esc(l)}</p>`).join('')}</div>`
      : '';

    const serviceHtml = (strategy.serviceFocus || []).length
      ? `<div class="weekly-strategy-block">
          <h3>今週の重点サービス</h3>
          <ol class="weekly-strategy-list">${strategy.serviceFocus.slice(0, 3).map((s, i) =>
            `<li><strong>${esc(s.service)}</strong><br><span class="weekly-strategy-reason">理由：${esc(s.reasonText)}</span></li>`
          ).join('')}</ol>
        </div>`
      : '';

    const postHtml = (strategy.postPlan || []).length
      ? `<div class="weekly-strategy-block">
          <h3>今週の投稿方針</h3>
          <ul class="weekly-strategy-bullets">${strategy.postPlan.map(p =>
            `<li>・${esc(p.text)}</li>`
          ).join('')}</ul>
        </div>`
      : '';

    const adHtml = (strategy.adPlan || []).length
      ? `<div class="weekly-strategy-block">
          <h3>今週の広告方針</h3>
          <ul class="weekly-strategy-bullets">${strategy.adPlan.map(a =>
            `<li>・${esc(a.text)}</li>`
          ).join('')}</ul>
        </div>`
      : '';

    const salesHtml = (strategy.salesPlan || []).length
      ? `<div class="weekly-strategy-block">
          <h3>今週の営業方針</h3>
          <ul class="weekly-strategy-bullets">${strategy.salesPlan.map(s =>
            `<li>・${esc(s)}</li>`
          ).join('')}</ul>
        </div>`
      : '';

    const winningHtml = (strategy.winningPatterns || []).length
      ? `<div class="weekly-strategy-block weekly-strategy-sub">
          <h3>勝ちパターン候補</h3>
          <ul class="weekly-strategy-bullets">${strategy.winningPatterns.slice(0, 3).map(w =>
            `<li>・${esc(w.topic)}（${esc(w.channelLabel)}）— ${esc(w.resultMemo || '反応あり')}</li>`
          ).join('')}</ul>
        </div>`
      : '';

    const improveHtml = (strategy.improvementCandidates || []).length
      ? `<div class="weekly-strategy-block weekly-strategy-sub">
          <h3>改善が必要なもの</h3>
          <ul class="weekly-strategy-bullets">${strategy.improvementCandidates.slice(0, 3).map(c =>
            `<li>・${esc(c.topic)}（${esc(c.channelLabel)}）— ${esc(c.resultMemo || '改善必要')}</li>`
          ).join('')}</ul>
        </div>`
      : '';

    const tasks = strategy.actionTasks || [];
    const tasksHtml = tasks.length
      ? `<div class="weekly-strategy-block">
          <h3>今週やること候補</h3>
          <ul class="weekly-strategy-tasks">${tasks.map((t, i) => `
            <li class="weekly-strategy-task-item">
              <span>${esc(t.title)}</span>
              <button type="button" class="btn btn-sm btn-secondary" data-weekly-task-add="${i}">今日やることに追加</button>
            </li>`).join('')}</ul>
          <button type="button" id="btn-weekly-task-add-all" class="btn btn-sm btn-primary">今週候補を全部追加</button>
        </div>`
      : '';

    el.innerHTML = `
      <div class="weekly-strategy-period-row">
        <span class="weekly-strategy-period-label">集計期間：</span>
        ${['7d', 'month', 'all'].map(p =>
          `<button type="button" class="btn btn-sm ${weeklyStrategyPeriod === p ? 'btn-primary' : 'btn-secondary'}" data-weekly-period="${p}">${esc(periodLabels[p])}</button>`
        ).join('')}
      </div>
      ${commentHtml}
      <div class="weekly-strategy-grid">
        ${serviceHtml}
        ${postHtml}
        ${adHtml}
        ${salesHtml}
        ${winningHtml}
        ${improveHtml}
      </div>
      ${tasksHtml}`;

    el.querySelectorAll('[data-weekly-period]').forEach(btn => {
      btn.addEventListener('click', () => {
        weeklyStrategyPeriod = btn.dataset.weeklyPeriod;
        renderWeeklyStrategyBoard();
        const weeklyTodayEl = document.getElementById('mgmt-weekly-strategy');
        if (weeklyTodayEl) {
          const s = getWeeklyStrategy();
          const lines = s.morningLines || [];
          weeklyTodayEl.innerHTML = lines.length
            ? `<p class="mgmt-weekly-label">今週の作戦：</p><ul class="mgmt-weekly-list">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
            : '';
        }
      });
    });
    el.querySelectorAll('[data-weekly-task-add]').forEach(btn => {
      btn.addEventListener('click', () => addWeeklyStrategyTaskByIndex(parseInt(btn.dataset.weeklyTaskAdd, 10)));
    });
    const addAllBtn = document.getElementById('btn-weekly-task-add-all');
    if (addAllBtn) addAllBtn.addEventListener('click', addAllWeeklyStrategyTasks);
  }

  function renderExecutionBadgesHtml(pickup) {
    const badges = getInsightBadgesForPickup(pickup);
    if (!badges.length) return '';
    return `<div class="pickup-exec-badges">${badges.map(b =>
      `<span class="pickup-exec-badge ${b.className}">${esc(b.label)}</span>`
    ).join('')}</div>`;
  }

  function renderPickupExecutionRow(pickupId, type, pickup, execItem) {
    const meta = DemandBrain.EXECUTION_META[type];
    const hasOutput = DemandBrain.hasGeneratedOutput(pickup, type);
    const statusLabel = DemandBrain.getExecutionStatusLabel(type, execItem.status);
    const statusOptions = meta.statuses.map(s =>
      `<option value="${s.value}"${execItem.status === s.value ? ' selected' : ''}>${esc(s.label)}</option>`
    ).join('');
    const outputHint = hasOutput
      ? '<span class="exec-row-has-output">文案あり</span>'
      : '<span class="exec-row-no-output">文案未生成</span>';
    const showResultFields = DemandBrain.isExecutionDone(type, execItem.status);

    return `
      <div class="pickup-exec-row" data-exec-pickup="${esc(pickupId)}" data-exec-type="${type}">
        <div class="pickup-exec-row-header">
          <strong>${esc(meta.label)}</strong>
          ${outputHint}
        </div>
        <div class="pickup-exec-row-fields">
          <div class="pickup-exec-field">
            <label>実行ステータス</label>
            <select data-exec-field="status">${statusOptions}</select>
          </div>
          <div class="pickup-exec-field">
            <label>${esc(meta.scheduledDateLabel)}</label>
            <input type="date" data-exec-field="scheduledDate" value="${esc(execItem.scheduledDate || '')}">
          </div>
          <div class="pickup-exec-field pickup-exec-field-wide">
            <label>実行メモ</label>
            <input type="text" data-exec-field="memo" value="${esc(execItem.memo || '')}" placeholder="例：午前中に投稿予定">
          </div>
          ${showResultFields ? `
          <div class="pickup-exec-field pickup-exec-field-wide">
            <label>効果メモ</label>
            <input type="text" data-exec-field="resultMemo" value="${esc(execItem.resultMemo || '')}" placeholder="例：反応あり、LINE相談1件">
          </div>
          <div class="pickup-exec-field pickup-exec-field-wide">
            <label>次回改善</label>
            <input type="text" data-exec-field="nextImproveMemo" value="${esc(execItem.nextImproveMemo || '')}" placeholder="例：次回は実写多め">
          </div>` : ''}
        </div>
        <div class="pickup-exec-row-actions">
          <span class="pickup-exec-status-label">${esc(statusLabel)}</span>
          ${execItem.executedAt ? `<span class="pickup-exec-done-date">実行日：${esc(execItem.executedAt)}</span>` : ''}
          <button type="button" class="btn btn-sm btn-primary" data-exec-add-task="${type}">今日やることに追加</button>
        </div>
      </div>`;
  }

  function bindPickupExecutionEvents(container) {
    if (!container) return;
    container.querySelectorAll('.pickup-exec-row').forEach(row => {
      const pickupId = row.dataset.execPickup;
      const type = row.dataset.execType;
      const saveField = (field, value) => {
        const patch = {};
        patch[field] = value;
        updatePickupExecution(pickupId, type, patch);
      };
      row.querySelectorAll('[data-exec-field]').forEach(input => {
        const field = input.dataset.execField;
        const eventName = input.tagName === 'SELECT' ? 'change' : 'change';
        input.addEventListener(eventName, () => {
          saveField(field, input.value);
          if (field === 'status') {
            renderPickupExecutionManagement();
          }
        });
        if (input.tagName === 'INPUT' && input.type === 'text') {
          input.addEventListener('blur', () => saveField(field, input.value));
        }
      });
      const taskBtn = row.querySelector('[data-exec-add-task]');
      if (taskBtn) {
        taskBtn.addEventListener('click', () => addExecutionTask(pickupId, taskBtn.dataset.execAddTask));
      }
    });
  }

  function renderPickupExecutionManagement() {
    const el = document.getElementById('pickup-execution-list');
    if (!el) return;
    const pickups = Storage.getDemandPickups();
    const manualTasks = Storage.getDailyActionTasksData().manualTasks;
    const list = DemandBrain.getExecutionManagementPickups(pickups, manualTasks);
    if (!list.length) {
      el.innerHTML = '<p class="placeholder-text">管理対象の需要ピックアップはまだありません。文案を生成するか、需要を保存してください。</p>';
      return;
    }
    el.innerHTML = list.map(p => {
      const raw = pickups.find(x => x.id === p.id) || p;
      const exec = DemandBrain.normalizeExecutionStatus(raw);
      const outputs = raw.generatedOutputs || {};
      const outputKeys = DemandBrain.EXECUTION_TYPES.filter(t =>
        DemandBrain.hasGeneratedOutput(raw, t) || exec[t].status !== 'draft' || exec[t].scheduledDate
      );
      const typesToShow = outputKeys.length ? outputKeys : DemandBrain.EXECUTION_TYPES.filter(t => outputs[t]);
      const rows = (typesToShow.length ? typesToShow : DemandBrain.EXECUTION_TYPES).map(type =>
        renderPickupExecutionRow(p.id, type, raw, exec[type])
      ).join('');
      const logs = Array.isArray(raw.executionLogs) ? raw.executionLogs.slice(0, 3) : [];
      const logsHtml = logs.length
        ? `<div class="pickup-exec-logs"><p class="pickup-exec-logs-title">実行履歴（直近）</p><ul>${logs.map(l =>
            `<li>${esc(l.date)} — ${esc(DemandBrain.EXECUTION_META[l.type]?.shortLabel || l.type)}：${esc(l.memo)}</li>`
          ).join('')}</ul></div>`
        : '';
      return `
        <div class="pickup-exec-card" data-pickup-exec-id="${esc(p.id)}">
          <div class="pickup-exec-card-header">
            <strong>${esc(p.topic)}</strong>
            <span class="pickup-score-badge">${p.demandScore}</span>
            ${renderExecutionBadgesHtml(raw)}
          </div>
          <p class="pickup-meta pickup-meta-sub">関連サービス：${esc(p.relatedServices.join('、') || '—')}</p>
          <div class="pickup-exec-generated-hint">
            生成済み：${DemandBrain.EXECUTION_TYPES.filter(t => DemandBrain.hasGeneratedOutput(raw, t))
              .map(t => DemandBrain.EXECUTION_META[t].label).join('、') || '—'}
          </div>
          <div class="pickup-exec-rows">${rows}</div>
          ${logsHtml}
        </div>`;
    }).join('');
    bindPickupExecutionEvents(el);
  }

  function renderDashTodayExecutionPlan() {
    const el = document.getElementById('dash-today-execution');
    if (!el) return;
    const items = getTodayScheduleItems();
    const lines = DemandBrain.buildDashboardScheduleLines(items);
    if (!lines.length) {
      const msg = DemandBrain.buildTodayScheduleComment(items);
      el.innerHTML = `<p class="placeholder-text">${esc(msg || '今日の投稿・広告予定はありません。需要番頭で予定日を設定してください。')}</p>`;
      return;
    }
    el.innerHTML = `<ul class="dash-today-execution-list">${lines.map(l => `<li>・${esc(l)}</li>`).join('')}</ul>`;
  }

  function getCalendarData() {
    const today = TODAY();
    const pickups = Storage.getDemandPickups();
    const store = Storage.getDailyActionTasksData();
    const manualTasks = store.manualTasks || [];
    const taskStates = store.states || [];
    const strategy = getWeeklyStrategy();
    const days = DemandBrain.getSevenDayCalendar(today);
    const items = DemandBrain.getActionCalendarItems(pickups, manualTasks, taskStates, today);
    const dailyTaskKeys = new Set(manualTasks.filter(mt => mt.pickupDedupeKey).map(mt => mt.pickupDedupeKey));
    const byDay = DemandBrain.groupCalendarItemsByDay(items, days, pickups, today, dailyTaskKeys);
    const unscheduled = DemandBrain.getUnscheduledWeeklyCandidates(strategy, manualTasks, pickups, today);
    return { today, days, items, byDay, unscheduled, pickups, manualTasks, taskStates, strategy };
  }

  function getTodayScheduleItems() {
    const { pickups, manualTasks, taskStates, today } = getCalendarData();
    return DemandBrain.getTodayScheduleItems(pickups, manualTasks, taskStates, today);
  }

  function isCalendarTaskDuplicate(date, title, kind, topic) {
    const key = DemandBrain.buildCalendarTaskDedupeKey(date, title, kind, topic || '');
    return Storage.getDailyActionTasksData().manualTasks.some(t => t.pickupDedupeKey === key);
  }

  function addCalendarItemToDailyTasks(item) {
    if (!item || item.completed) return false;
    const date = TODAY();
    const payload = DemandBrain.createCalendarTaskPayload(item);
    const kind = item.kind === 'execution' ? 'execution-' + (item.execType || '') : item.kind;
    const key = DemandBrain.buildCalendarTaskDedupeKey(date, item.title, kind, item.topic || '');
    if (isCalendarTaskDuplicate(date, item.title, kind, item.topic || '')) return false;
    Storage.addManualDailyTask({
      title: item.title,
      targetName: '—',
      priority: payload.priority,
      action: payload.reason,
      memo: payload.reason,
      dueDate: item.date || date,
      status: 'open',
      reason: payload.reason,
      pickupDedupeKey: key,
      pickupTopic: item.topic || '',
      pickupActionType: 'calendar-' + kind
    });
    return true;
  }

  function addCalendarItemToDailyById(itemId) {
    const data = getCalendarData();
    let item = null;
    Object.values(data.byDay).forEach(dayItems => {
      dayItems.forEach(i => { if (i.id === itemId) item = i; });
    });
    if (!item) return;
    if (addCalendarItemToDailyTasks(item)) {
      renderDailyActionTasks();
      renderMorningDailyTasksBrief();
      renderActionCalendar();
      renderDashTodayExecutionPlan();
      renderMorningReport();
      alert('今日やることに追加しました。');
    } else {
      alert('すでに今日やることに追加済みです');
    }
  }

  function addAllTodayScheduleToDaily() {
    const items = getTodayScheduleItems();
    let added = 0;
    let skipped = 0;
    items.forEach(item => {
      if (addCalendarItemToDailyTasks(item)) added++;
      else skipped++;
    });
    renderDailyActionTasks();
    renderMorningDailyTasksBrief();
    renderActionCalendar();
    renderDashTodayExecutionPlan();
    renderMorningReport();
    alert(`追加：${added}件${skipped ? ` / スキップ（重複）：${skipped}件` : ''}`);
  }

  function scheduleExecutionToDate(pickupId, execType, date) {
    const pickup = Storage.getDemandPickups().find(p => p.id === pickupId);
    if (!pickup) return;
    const exec = DemandBrain.normalizeExecutionStatus(pickup);
    const prev = exec[execType] || {};
    const patch = { scheduledDate: date };
    if (prev.status === 'draft') patch.status = 'scheduled';
    exec[execType] = { ...prev, ...patch };
    Storage.updateDemandPickup(pickupId, { executionStatus: exec });
  }

  function scheduleManualTaskToDate(taskId, date) {
    Storage.updateManualDailyTask(taskId, { dueDate: date });
  }

  function scheduleWeeklyCandidateToDate(index, date) {
    const strategy = getWeeklyStrategy();
    const task = (strategy.actionTasks || [])[index];
    if (!task) return;
    const key = DemandBrain.buildWeeklyTaskDedupeKey(date, task.taskKind, task.title);
    if (Storage.getDailyActionTasksData().manualTasks.some(t => t.pickupDedupeKey === key)) {
      alert('すでに同じ予定が登録されています');
      return;
    }
    Storage.addManualDailyTask({
      title: task.title,
      targetName: '—',
      priority: task.priority || '中',
      action: task.reason,
      memo: task.reason,
      dueDate: date,
      status: 'open',
      reason: task.reason,
      pickupDedupeKey: key,
      pickupTopic: task.topic || '',
      pickupActionType: 'weekly-' + (task.taskKind || 'action')
    });
  }

  function handleCalendarSchedule(action, payload) {
    const today = TODAY();
    const tomorrow = addDaysToDate(today, 1);
    let date = payload.date || today;
    if (action === 'today') date = today;
    if (action === 'tomorrow') date = tomorrow;

    if (payload.kind === 'execution') {
      scheduleExecutionToDate(payload.pickupId, payload.execType, date);
    } else if (payload.kind === 'manual' && payload.taskId) {
      scheduleManualTaskToDate(payload.taskId, date);
    } else if (payload.kind === 'weekly') {
      scheduleWeeklyCandidateToDate(parseInt(payload.index, 10), date);
    }
    renderActionCalendar();
    renderDashTodayExecutionPlan();
    renderWeeklyStrategyBoard();
    renderPickupExecutionManagement();
    renderMorningReport();
  }

  function renderCalendarDayCard(day, dayItems) {
    const isToday = day.isToday;
    const emptyMsg = isToday
      ? DemandBrain.buildTodayScheduleComment(dayItems)
      : '';
    const itemsHtml = dayItems.length
      ? dayItems.map(item => `
          <div class="calendar-item ${item.completed ? 'calendar-item-done' : ''} ${item.overdue ? 'calendar-item-overdue' : ''}">
            <div class="calendar-item-header">
              <span class="calendar-item-title">${esc(item.title)}</span>
              <span class="calendar-item-status">${esc(item.statusLabel)}</span>
            </div>
            ${item.overdue && item.scheduledDate ? `<p class="calendar-item-meta">予定日：${esc(item.scheduledDate)}（期限超過）</p>` : ''}
            <div class="calendar-item-actions">
              ${!item.completed ? `<button type="button" class="btn btn-sm btn-primary" data-cal-add-daily="${esc(item.id)}">今日やることに追加</button>` : ''}
              ${item.kind === 'execution' && !item.completed ? `
                <button type="button" class="btn btn-sm btn-secondary" data-cal-schedule="today" data-cal-pickup="${esc(item.pickupId)}" data-cal-type="${esc(item.execType)}" data-cal-kind="execution">今日に入れる</button>
                <button type="button" class="btn btn-sm btn-secondary" data-cal-schedule="tomorrow" data-cal-pickup="${esc(item.pickupId)}" data-cal-type="${esc(item.execType)}" data-cal-kind="execution">明日に入れる</button>
              ` : ''}
            </div>
          </div>`).join('')
      : (emptyMsg ? `<p class="calendar-day-empty">${esc(emptyMsg)}</p>` : '<p class="calendar-day-empty">予定なし</p>');

    return `
      <div class="calendar-day-card ${isToday ? 'calendar-day-today' : ''}">
        <div class="calendar-day-header">
          <span class="calendar-day-date">${esc(day.date)}</span>
          <span class="calendar-day-weekday">${esc(day.weekday)}</span>
          ${isToday ? '<span class="calendar-day-badge">今日</span>' : ''}
        </div>
        <div class="calendar-day-items">${itemsHtml}</div>
      </div>`;
  }

  function bindActionCalendarEvents(container) {
    if (!container) return;
    container.querySelectorAll('[data-cal-add-daily]').forEach(btn => {
      btn.addEventListener('click', () => addCalendarItemToDailyById(btn.dataset.calAddDaily));
    });
    container.querySelectorAll('[data-cal-schedule]').forEach(btn => {
      btn.addEventListener('click', () => {
        handleCalendarSchedule(btn.dataset.calSchedule, {
          kind: btn.dataset.calKind,
          pickupId: btn.dataset.calPickup,
          execType: btn.dataset.calType,
          taskId: btn.dataset.calTask,
          index: btn.dataset.calIndex,
          date: btn.dataset.calDate
        });
      });
    });
    container.querySelectorAll('[data-cal-pick-date]').forEach(input => {
      input.addEventListener('change', () => {
        const wrap = input.closest('[data-cal-candidate]');
        if (!wrap || !input.value) return;
        handleCalendarSchedule('date', {
          kind: wrap.dataset.calKind || 'weekly',
          index: wrap.dataset.calCandidate,
          date: input.value
        });
      });
    });
    const addAllBtn = document.getElementById('btn-cal-add-all-today');
    if (addAllBtn) addAllBtn.addEventListener('click', addAllTodayScheduleToDaily);
  }

  function renderActionCalendar() {
    const el = document.getElementById('dash-action-calendar');
    if (!el) return;
    const data = getCalendarData();
    const hasAny = data.items.length || data.unscheduled.length;

    if (!hasAny) {
      el.innerHTML = `
        <p class="calendar-empty">まだ投稿・広告予定はありません。<br>需要番頭で文案を作成し、予定日を入れるとここに表示されます。</p>
        <p class="calendar-empty-sub">週間作戦や需要ピックアップを保存すると、ここに候補が出ます。</p>`;
      return;
    }

    const daysHtml = data.days.map(day =>
      renderCalendarDayCard(day, data.byDay[day.date] || [])
    ).join('');

    const unscheduledHtml = data.unscheduled.length
      ? `<div class="calendar-unscheduled">
          <h3>未予定の今週候補</h3>
          <ul class="calendar-unscheduled-list">${data.unscheduled.map(c => `
            <li class="calendar-unscheduled-item">
              <span>${esc(c.title)}</span>
              <div class="calendar-unscheduled-actions">
                <button type="button" class="btn btn-sm btn-secondary" data-cal-schedule="today" data-cal-kind="weekly" data-cal-index="${c.index}">今日に入れる</button>
                <button type="button" class="btn btn-sm btn-secondary" data-cal-schedule="tomorrow" data-cal-kind="weekly" data-cal-index="${c.index}">明日に入れる</button>
                <span data-cal-candidate="${c.index}" data-cal-kind="weekly">
                  <input type="date" class="calendar-date-input" data-cal-pick-date min="${esc(data.today)}" value="${esc(data.today)}" title="日付を選んで入れる">
                </span>
              </div>
            </li>`).join('')}</ul>
        </div>`
      : '';

    const todayCount = (data.byDay[data.today] || []).filter(i => !i.completed).length;
    const addAllBtn = todayCount
      ? `<button type="button" id="btn-cal-add-all-today" class="btn btn-sm btn-primary">今日の予定を全部追加</button>`
      : '';

    el.innerHTML = `
      <div class="calendar-toolbar">${addAllBtn}</div>
      <div class="calendar-days-grid">${daysHtml}</div>
      ${unscheduledHtml}`;
    bindActionCalendarEvents(el);
  }

  function bindPickupContentGenActions(container) {
    if (!container) return;
    container.querySelectorAll('[data-pickup-gen-card]').forEach(btn => {
      btn.addEventListener('click', () => {
        generatePickupContentForId(btn.dataset.pickupGenCard, btn.dataset.genType);
      });
    });
  }

  function renderPickupTodaySummary() {
    const el = document.getElementById('pickup-today-summary');
    if (!el) return;
    const comment = DemandBrain.buildDemandComment(Storage.getDemandPickups(), TODAY());
    el.innerHTML = `<p class="pickup-summary-line pickup-summary-highlight">${esc(comment)}</p>`;
  }

  function renderPickupMorningTop3Card(p, rank) {
    const judgment = DemandBrain.getScoreJudgment(p.demandScore);
    const idAttr = p.id ? esc(p.id) : '';
    return `
      <div class="pickup-morning-card ${judgment.className}" data-pickup-id="${idAttr}">
        <div class="pickup-morning-header">
          <span class="pickup-rank">${rank}位</span>
          <strong class="pickup-morning-topic">${esc(p.topic)}</strong>
          <span class="pickup-score-badge">${p.demandScore}点</span>
          <span class="pickup-judgment ${judgment.className}">${esc(judgment.label)}</span>
        </div>
        <p class="pickup-meta">${esc(p.summary)}</p>
        ${p.postTitle ? `<p class="pickup-morning-action"><span class="pickup-action-label">投稿</span>${esc(p.postTitle)}</p>` : ''}
        ${p.adTitle ? `<p class="pickup-morning-action"><span class="pickup-action-label">広告</span>${esc(p.adTitle)}</p>` : ''}
        <div class="pickup-card-actions pickup-morning-actions">
          ${p.postTitle ? `<button type="button" class="btn btn-sm btn-secondary" data-pickup-add-post="${idAttr}">投稿をタスク追加</button>` : ''}
          ${p.salesTitle ? `<button type="button" class="btn btn-sm btn-secondary" data-pickup-add-sales="${idAttr}">営業をタスク追加</button>` : ''}
          ${p.adTitle ? `<button type="button" class="btn btn-sm btn-secondary" data-pickup-add-ad="${idAttr}">広告をタスク追加</button>` : ''}
          ${idAttr ? `<button type="button" class="btn btn-sm btn-primary" data-pickup-add-all="${idAttr}">この需要のアクションを全部追加</button>` : ''}
          ${idAttr ? `
            <button type="button" class="btn btn-sm btn-secondary" data-pickup-used="${idAttr}">採用済み</button>
            <button type="button" class="btn btn-sm btn-secondary" data-pickup-ignore="${idAttr}">無視</button>
            <button type="button" class="btn btn-sm btn-secondary" data-pickup-archive="${idAttr}">保管</button>
          ` : ''}
        </div>
        ${idAttr ? pickupContentButtonsHtml(idAttr) : ''}
      </div>`;
  }

  function renderPickupMorningTop3() {
    const el = document.getElementById('pickup-morning-top3');
    if (!el) return;
    const top3 = DemandBrain.getTopDemandPickups(Storage.getDemandPickups(), TODAY());
    if (!top3.length) {
      el.innerHTML = '<p class="placeholder-text">今日の需要ピックアップはまだありません。クロクロで調査した結果を貼り付けると、投稿案・営業案・広告案に変換できます。</p>';
      return;
    }
    el.innerHTML = top3.map((p, i) => renderPickupMorningTop3Card(p, i + 1)).join('');
    bindPickupCardActions(el);
    bindPickupContentGenActions(el);
  }

  function renderPickupUsedToday() {
    const el = document.getElementById('pickup-used-today');
    if (!el) return;
    const used = DemandBrain.getTodayUsedPickups(Storage.getDemandPickups(), TODAY());
    if (!used.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `
      <p class="pickup-used-title">採用済み（今日）</p>
      <ul class="pickup-used-list">
        ${used.map(p => `<li>${esc(p.topic)}（${p.demandScore}点）— ${esc(p.postTitle || p.summary.slice(0, 30))}</li>`).join('')}
      </ul>`;
  }

  function renderPickupCandidates() {
    const todayPickups = DemandBrain.getTodayPickups(Storage.getDemandPickups(), TODAY());
    const postEl = document.getElementById('pickup-post-candidates');
    const salesEl = document.getElementById('pickup-sales-candidates');
    const adEl = document.getElementById('pickup-ad-candidates');
    if (!postEl || !salesEl || !adEl) return;

    const posts = todayPickups.filter(p => p.postTitle).map(p => ({ topic: p.topic, title: p.postTitle, id: p.id }));
    const sales = todayPickups.filter(p => p.salesTitle).map(p => ({ topic: p.topic, title: p.salesTitle, id: p.id }));
    const ads = todayPickups.filter(p => p.adTitle).map(p => ({ topic: p.topic, title: p.adTitle, id: p.id }));

    const renderList = (items, emptyMsg) => {
      if (!items.length) return `<p class="placeholder-text">${emptyMsg}</p>`;
      return `<ul class="pickup-candidate-items">${items.map(item => `
        <li>
          <strong>${esc(item.title)}</strong>
          <span class="pickup-candidate-topic">（${esc(item.topic)}）</span>
        </li>`).join('')}</ul>`;
    };

    postEl.innerHTML = renderList(posts, '投稿ネタ候補はまだありません。');
    salesEl.innerHTML = renderList(sales, '営業アクション候補はまだありません。');
    adEl.innerHTML = renderList(ads, '広告アクション候補はまだありません。');
  }

  function renderPickupSavedList() {
    const el = document.getElementById('pickup-saved-list');
    if (!el) return;
    const list = Storage.getDemandPickups()
      .map(p => DemandBrain.normalizePickup(p))
      .sort((a, b) => (b.date + b.updatedAt).localeCompare(a.date + a.updatedAt));
    if (!list.length) {
      el.innerHTML = '<p class="placeholder-text">保存済みの需要メモはまだありません。</p>';
      return;
    }
    const statusLabel = { open: '未対応', used: '採用済み', ignored: '無視', archived: '保管' };
    el.innerHTML = list.map(p => `
      <div class="pickup-saved-item pickup-status-${esc(p.status)}">
        <div class="pickup-saved-header">
          <strong>${esc(p.date)} — ${esc(p.topic)}</strong>
          <span class="pickup-score-badge">${p.demandScore}</span>
          <span class="pickup-status-label">${esc(statusLabel[p.status] || p.status)}</span>
          ${p.isTest ? '<span class="pickup-test-badge">テスト</span>' : ''}
        </div>
        ${renderExecutionBadgesHtml(Storage.getDemandPickups().find(x => x.id === p.id) || p)}
        <p class="pickup-meta">${esc(p.summary)}</p>
        <p class="pickup-meta pickup-meta-sub">情報元：${esc(p.source)} / 関連：${esc(p.relatedServices.join('、') || '—')}</p>
        <div class="pickup-card-actions">
          ${p.status === 'open' ? `
            <button type="button" class="btn btn-sm btn-primary" data-pickup-add-all="${esc(p.id)}">今日やることに追加</button>
            <button type="button" class="btn btn-sm btn-secondary" data-pickup-used="${esc(p.id)}">採用済み</button>
            <button type="button" class="btn btn-sm btn-secondary" data-pickup-ignore="${esc(p.id)}">無視</button>
            <button type="button" class="btn btn-sm btn-secondary" data-pickup-archive="${esc(p.id)}">保管</button>
          ` : ''}
        </div>
        ${pickupContentButtonsHtml(p.id)}
      </div>`).join('');
    bindPickupCardActions(el);
    bindPickupContentGenActions(el);
  }

  function bindPickupCardActions(container) {
    container.querySelectorAll('[data-pickup-add-all]').forEach(btn => {
      btn.addEventListener('click', () => addAllPickupTasksById(btn.dataset.pickupAddAll));
    });
    container.querySelectorAll('[data-pickup-add-post]').forEach(btn => {
      btn.addEventListener('click', () => addPickupTaskById(btn.dataset.pickupAddPost, 'post'));
    });
    container.querySelectorAll('[data-pickup-add-sales]').forEach(btn => {
      btn.addEventListener('click', () => addPickupTaskById(btn.dataset.pickupAddSales, 'sales'));
    });
    container.querySelectorAll('[data-pickup-add-ad]').forEach(btn => {
      btn.addEventListener('click', () => addPickupTaskById(btn.dataset.pickupAddAd, 'ad'));
    });
    container.querySelectorAll('[data-pickup-used]').forEach(btn => {
      btn.addEventListener('click', () => updatePickupStatus(btn.dataset.pickupUsed, 'used'));
    });
    container.querySelectorAll('[data-pickup-ignore]').forEach(btn => {
      btn.addEventListener('click', () => updatePickupStatus(btn.dataset.pickupIgnore, 'ignored'));
    });
    container.querySelectorAll('[data-pickup-archive]').forEach(btn => {
      btn.addEventListener('click', () => updatePickupStatus(btn.dataset.pickupArchive, 'archived'));
    });
  }

  function renderDemandPickup() {
    renderPickupTodaySummary();
    renderPickupInsightsSections();
    renderPickupMorningTop3();
    renderPickupUsedToday();
    renderPickupBulkPreview();
    renderPickupContentPanel();
    renderPickupExecutionManagement();
    renderPickupCandidates();
    renderPickupSavedList();
  }

  function hasPickupTestData() {
    return Storage.getDemandPickups().some(p => p.isTest === true);
  }

  function createPickupTestData() {
    if (hasPickupTestData()) {
      alert('需要テストデータはすでにあります。削除してから再度作成してください。');
      return;
    }
    Storage.addDemandPickup(DemandBrain.createTestPickup(TODAY()));
    renderDemandPickup();
    renderManagementComments();
    renderMorningReport();
    alert('需要テストデータを作成しました。');
  }

  function deletePickupTestData() {
    if (!hasPickupTestData()) {
      alert('削除できる需要テストデータがありません。');
      return;
    }
    const ok = confirm('需要テストデータ（isTest）だけを削除します。本番データは残ります。よろしいですか？');
    if (!ok) return;
    const filtered = Storage.getDemandPickups().filter(p => p.isTest !== true);
    Storage.saveDemandPickups(filtered);
    renderDemandPickup();
    renderManagementComments();
    renderMorningReport();
    alert('需要テストデータを削除しました。');
  }

  function initDemandPickup() {
    const dateEl = document.getElementById('pickup-date');
    if (!dateEl) return;
    dateEl.value = TODAY();
    renderPickupServiceChips([]);

    const promptEl = document.getElementById('pickup-cloclo-prompt');
    if (promptEl) promptEl.value = DemandBrain.KUROKURO_MORNING_PROMPT;

    document.getElementById('pickup-form').addEventListener('submit', e => {
      e.preventDefault();
      if (savePickupFromForm()) alert('需要ピックアップを保存しました。');
    });

    document.getElementById('btn-pickup-apply-paste').addEventListener('click', applyPickupPaste);
    const saveBulkBtn = document.getElementById('btn-pickup-save-bulk');
    if (saveBulkBtn) saveBulkBtn.addEventListener('click', saveBulkPickups);
    document.getElementById('btn-pickup-add-tasks').addEventListener('click', addPickupTasksFromForm);
    document.getElementById('btn-pickup-clear').addEventListener('click', clearPickupForm);

    const taskifyTop3Btn = document.getElementById('btn-pickup-taskify-top3');
    if (taskifyTop3Btn) taskifyTop3Btn.addEventListener('click', addTop3AllTasks);

    const copyPromptBtn = document.getElementById('btn-pickup-copy-prompt');
    if (copyPromptBtn) {
      copyPromptBtn.addEventListener('click', () => {
        copyText(DemandBrain.KUROKURO_MORNING_PROMPT)
          .then(() => alert('プロンプトをコピーしました。'))
          .catch(() => alert('コピーに失敗しました。'));
      });
    }

    document.getElementById('btn-pickup-copy-post').addEventListener('click', () => {
      const text = document.getElementById('pickup-post-action').value.trim();
      if (!text) { alert('投稿案が空です。'); return; }
      copyText(text).then(() => alert('投稿案をコピーしました。')).catch(() => alert('コピーに失敗しました。'));
    });

    document.getElementById('btn-pickup-copy-ad').addEventListener('click', () => {
      const text = document.getElementById('pickup-ad-action').value.trim();
      if (!text) { alert('広告案が空です。'); return; }
      copyText(text).then(() => alert('広告案をコピーしました。')).catch(() => alert('コピーに失敗しました。'));
    });

    const createBtn = document.getElementById('btn-pickup-create-test');
    if (createBtn) createBtn.addEventListener('click', createPickupTestData);
    const deleteBtn = document.getElementById('btn-pickup-delete-test');
    if (deleteBtn) deleteBtn.addEventListener('click', deletePickupTestData);

    const contentSelect = document.getElementById('pickup-content-select');
    if (contentSelect) {
      contentSelect.addEventListener('change', () => {
        selectedPickupContentId = contentSelect.value || null;
        renderPickupContentOutputs();
      });
    }
    document.querySelectorAll('[data-pickup-gen]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = selectedPickupContentId || document.getElementById('pickup-content-select')?.value;
        if (!id) {
          alert('先に需要テーマを選択してください。');
          return;
        }
        generatePickupContentForId(id, btn.dataset.pickupGen);
      });
    });

    renderDemandPickup();
  }

  function analyzeDemand() {
    saveDemandNotesFromForm();
    const text = getDemandInputText();
    const logDate = document.getElementById('demand-date').value || TODAY();

    const keywords = extractKeywords(text);
    const brain = DemandBrain.analyze(text, keywords);
    const services = detectServices(text, keywords);
    const themes = keywords.slice(0, 5).map(k => `「${k}」に関する最新トレンド解説`);
    if (keywords.length > 3) themes.push(`「${keywords.slice(0, 3).join('・')}」の比較まとめ`);

    const instagram = (brain.postThemes.length ? brain.postThemes : keywords.slice(0, 4)).map(k =>
      typeof k === 'string' && k.startsWith('📌') ? k :
      `📌 ${k}\n\n#${String(k).replace(/\s+/g, '').slice(0, 20)} #沖縄 #現場業`
    );
    const stories = keywords.slice(0, 3).map(k =>
      `「${k}、気になりませんか？」→ 投票 → 詳細は投稿で解説`
    );
    const adKeywords = keywords.slice(0, 10);
    const salesIdeas = brain.salesThemes.length
      ? [...brain.salesThemes]
      : keywords.slice(0, 5).map(k => `「${k}」の検索需要増加をフックに、関連サービスの提案`);
    if (!brain.salesThemes.length) salesIdeas.push('沖縄の現場業向けに作った仕組みの事例紹介を配信');

    const analyzedAt = new Date().toISOString();
    const output = {
      keywords,
      keywordScores: brain.keywordScores,
      recommendedServices: brain.recommendedServices,
      todayMove: brain.todayMove,
      postThemes: brain.postThemes,
      salesThemes: brain.salesThemes,
      services,
      themes,
      instagram,
      stories,
      adKeywords,
      salesIdeas,
      analyzedAt,
      demandLogDate: logDate
    };

    Storage.saveGeneratedPosts(output);
    Storage.saveDailyDemandLog(logDate, {
      input: {
        ads: document.getElementById('demand-ads').value,
        gsc: document.getElementById('demand-gsc').value,
        trends: document.getElementById('demand-trends').value,
        instagram: document.getElementById('demand-instagram').value,
        fieldNotes: document.getElementById('demand-field').value
      },
      keywords: keywords.slice(0, 5),
      recommendedService: brain.recommendedServices[0] && brain.recommendedServices[0].name,
      todayMove: brain.todayMove,
      analysis: output,
      analyzedAt
    });

    renderDemandOutput(output);
    renderDemandInsights();
    renderDemandLogHistory();

    const settings = Storage.getSettings();
    const themeText = brain.postThemes[0] || (themes[0] ? themes[0].replace(/「|」/g, '') : '');
    if (themeText) {
      settings.postTheme = themeText;
      Storage.saveSettings(settings);
      document.getElementById('dash-post-theme').value = settings.postTheme;
    }
    renderDashboard();
    if (document.getElementById('view-radar').classList.contains('active')) {
      renderDemandRadar();
    }
  }

  function renderDemandInsights() {
    const data = Storage.getGeneratedPosts();
    renderTodayMove('dash-today-move', data);
    renderServiceRank('dash-recommended-services', data);
    renderThemeList('dash-post-themes', data && data.postThemes);
    renderThemeList('dash-sales-themes', data && data.salesThemes);
  }

  function renderTodayMove(containerId, data, withTitle) {
    const el = document.getElementById(containerId);
    const showTitle = withTitle !== false && containerId === 'dash-today-move';
    const move = data && data.todayMove;
    const title = showTitle ? '<h2>今日の一手</h2>' : '';
    if (!move) {
      el.innerHTML = `${title}
        <div class="today-move-content today-move-sample">
          <p class="today-move-service">${esc(DemandBrain.SAMPLE.todayMove.service)}</p>
          <p class="today-move-reason">${esc(DemandBrain.SAMPLE.todayMove.reason)}</p>
          <p class="today-move-action">${esc(DemandBrain.SAMPLE.todayMove.action)}</p>
          <p class="placeholder-text">需要サーチ番頭で「今日の需要を分析」を実行すると、実データに切り替わります</p>
        </div>`;
      return;
    }
    el.innerHTML = `${title}
      <div class="today-move-content">
        <p class="today-move-service">${esc(move.service)}</p>
        <p class="today-move-reason">${esc(move.reason)}</p>
        <p class="today-move-action">${esc(move.action)}</p>
      </div>`;
  }

  function renderServiceRank(containerId, data) {
    const el = document.getElementById(containerId);
    const list = data && data.recommendedServices && data.recommendedServices.length
      ? data.recommendedServices
      : DemandBrain.SAMPLE.recommendedServices;
    const isSample = !(data && data.recommendedServices && data.recommendedServices.length);

    el.innerHTML = list.map((s, i) => `
      <div class="service-rank-item">
        <span class="service-rank-num">${i + 1}</span>
        <div class="service-rank-body">
          <strong>${esc(s.name)}</strong>
          ${s.matchedKeywords && s.matchedKeywords.length
            ? `<small>関連: ${esc(s.matchedKeywords.slice(0, 3).join('・'))}</small>` : ''}
        </div>
        <span class="score-badge score-up">スコア ${s.score}</span>
      </div>`).join('') + (isSample ? '<p class="placeholder-text">サンプル表示中</p>' : '');
  }

  function renderThemeList(containerId, themes) {
    const el = document.getElementById(containerId);
    const list = themes && themes.length ? themes : DemandBrain.SAMPLE[
      containerId.includes('post') ? 'postThemes' : 'salesThemes'
    ];
    const isSample = !(themes && themes.length);
    el.innerHTML = list.map(t => `<li>${esc(t)}</li>`).join('')
      + (isSample ? '<li class="placeholder-text">サンプル表示中 — 需要サーチで分析してください</li>' : '');
  }

  function renderKeywordScores(containerId, data) {
    const el = document.getElementById(containerId);
    const scores = data && data.keywordScores && data.keywordScores.length
      ? data.keywordScores
      : [];
    if (!scores.length) {
      el.innerHTML = '<p class="placeholder-text">キーワードが見つかりませんでした</p>';
      return;
    }
    el.innerHTML = scores.map(ks => `
      <span class="keyword-score-item">
        <span class="tag">${esc(ks.keyword)}</span>
        <span class="demand-score demand-score-${scoreClass(ks.level)}">${esc(ks.level)}</span>
      </span>`).join('');
  }

  function scoreClass(level) {
    return { '急上昇': 'hot', '上昇': 'up', '横ばい': 'flat', '下降': 'down' }[level] || 'flat';
  }

  function renderDemandOutput(data) {
    renderTodayMove('output-today-move', data, false);
    renderKeywordScores('output-keywords', data);
    renderServiceRank('output-recommended-services', data);
    renderThemeList('output-post-themes', data.postThemes);
    renderThemeList('output-sales-themes', data.salesThemes);

    renderList('output-services', data.services || []);
    renderList('output-themes', data.themes || []);
    renderList('output-instagram', data.instagram || []);
    renderList('output-stories', data.stories || []);

    const adKw = document.getElementById('output-ad-keywords');
    const adKeywords = data.adKeywords || [];
    adKw.innerHTML = adKeywords.length
      ? adKeywords.map(k => `<span class="tag tag-ad">${esc(k)}</span>`).join('')
      : '<p class="placeholder-text">—</p>';

    renderList('output-sales-ideas', data.salesIdeas || []);
  }

  function detectServices(text, keywords) {
    const brainServices = DemandBrain.recommendServices(
      DemandBrain.scoreKeywords(keywords, text), text
    ).map(s => s.name);
    if (brainServices.length) return brainServices;

    const servicePatterns = [
      'ホームページ', 'Web制作', '広告運用', 'SEO', 'MEO', 'SNS運用',
      'LINE公式', '集客', 'リスティング', 'Instagram', '動画制作', '採用'
    ];
    const found = servicePatterns.filter(s =>
      text.includes(s) || keywords.some(k => k.includes(s) || s.includes(k))
    );
    if (!found.length && keywords.length) {
      return keywords.slice(0, 3).map(k => `${k}関連サービス`);
    }
    return found.length ? found : ['データからサービス傾向を検出できませんでした'];
  }

  function extractKeywords(text) {
    if (!text.trim()) return [];
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const wordCount = {};
    const stopWords = new Set([
      'の', 'に', 'は', 'を', 'た', 'が', 'で', 'て', 'と', 'し', 'れ', 'さ', 'ある', 'いる', 'も',
      'する', 'から', 'な', 'こと', 'として', 'い', 'や', 'など', 'この', 'ため', 'その', 'また',
      'the', 'and', 'for', 'with', 'query', 'clicks', 'impressions', 'ctr', 'position',
      '合計', '平均', 'クリック', '表示', '回数', '費用', 'コンバージョン', '沖縄'
    ]);

    lines.forEach(line => {
      const candidate = line.split(/[\t,|]/)[0].trim();
      const words = candidate.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]{2,}|[a-zA-Z]{3,}/g) || [];
      words.forEach(w => {
        if (!stopWords.has(w.toLowerCase()) && w.length >= 2) {
          wordCount[w] = (wordCount[w] || 0) + 1;
        }
      });
      if (candidate.length >= 2 && candidate.length <= 30) {
        const cleaned = candidate.replace(/[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFFa-zA-Z0-9\s\-_.]/g, '').trim();
        if (cleaned.length >= 2) wordCount[cleaned] = (wordCount[cleaned] || 0) + 2;
      }
    });

    return Object.entries(wordCount).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([w]) => w);
  }

  function renderList(id, items) {
    const el = document.getElementById(id);
    el.innerHTML = items.length
      ? items.map(i => '<li>' + esc(i).replace(/\n/g, '<br>') + '</li>').join('')
      : '<li class="placeholder-text">データがありません</li>';
  }

  // ── 営業番頭 ──
  function initLeads() {
    document.getElementById('btn-add-lead').addEventListener('click', () => openLeadModal());
    document.getElementById('btn-lead-cancel').addEventListener('click', closeLeadModal);
    document.getElementById('lead-form').addEventListener('submit', handleLeadSubmit);
    document.getElementById('btn-close-sales-detail').addEventListener('click', closeSalesDetail);
    document.getElementById('btn-save-sales-mgmt').addEventListener('click', saveSalesMgmt);
    document.getElementById('btn-lead-add-revenue').addEventListener('click', () => {
      if (!currentMessageLeadId) return;
      openRevenueFormForLead(currentMessageLeadId);
    });

    ['sales-mgmt-status', 'sales-mgmt-next-date', 'sales-mgmt-next-action', 'sales-mgmt-last-contact'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => {
        if (!currentMessageLeadId) return;
        const lead = Storage.getLeads().find(l => l.id === currentMessageLeadId);
        if (!lead) return;
        const draft = SalesBrain.normalizeLead({
          ...lead,
          salesStatus: document.getElementById('sales-mgmt-status').value,
          nextActionDate: document.getElementById('sales-mgmt-next-date').value,
          nextAction: document.getElementById('sales-mgmt-next-action').value.trim(),
          lastContactAt: document.getElementById('sales-mgmt-last-contact').value
        });
        renderSalesMgmtPreview(draft);
      });
      if (el && el.tagName === 'TEXTAREA') {
        el.addEventListener('input', () => {
          if (!currentMessageLeadId) return;
          const lead = Storage.getLeads().find(l => l.id === currentMessageLeadId);
          if (!lead) return;
          const draft = { ...lead, nextAction: el.value.trim() };
          renderSalesMgmtPreview(SalesBrain.normalizeLead(draft));
        });
      }
    });

    document.querySelectorAll('.sales-tab').forEach(tab => {
      tab.addEventListener('click', () => switchSalesTab(tab.dataset.tab));
    });

    document.getElementById('sales-tab-copy').addEventListener('click', e => {
      const text = document.getElementById('sales-tab-content').value;
      copyText(text).then(() => {
        e.currentTarget.textContent = 'コピー済み';
        setTimeout(() => { e.currentTarget.textContent = 'コピー'; }, 1500);
      }).catch(() => alert('コピーに失敗しました'));
    });

    document.getElementById('sales-tab-log').addEventListener('click', () => {
      recordSalesActivity(SALES_TAB_LOG[currentSalesTab]);
    });

    document.querySelectorAll('.sales-log-btn').forEach(btn => {
      btn.addEventListener('click', () => recordSalesActivity(btn.dataset.logType));
    });

    const activityForm = document.getElementById('lead-activity-add-form');
    if (activityForm) {
      activityForm.addEventListener('submit', handleLeadActivityAddSubmit);
      resetLeadActivityForm();
    }
    document.querySelectorAll('.lead-activity-next-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const nextActionInput = document.getElementById('lead-activity-next-action');
        if (!nextActionInput) return;
        nextActionInput.value = btn.dataset.nextAction || '';
      });
    });

    const aiToggle = document.getElementById('ai-priority-toggle');
    const settings = Storage.getSettings();
    aiToggle.checked = settings.aiPriorityEnabled !== false;
    aiToggle.addEventListener('change', () => {
      const s = Storage.getSettings();
      s.aiPriorityEnabled = aiToggle.checked;
      Storage.saveSettings(s);
      renderLeadsTable();
      renderDashboard();
    });

    const presetSelect = document.getElementById('sales-preset-select');
    if (presetSelect) {
      currentSalesPreset = presetSelect.value || currentSalesPreset;
      presetSelect.addEventListener('change', () => {
        currentSalesPreset = presetSelect.value || currentSalesPreset;
        const leadModal = document.getElementById('lead-modal');
        const isOpen = leadModal && !leadModal.classList.contains('hidden');
        const editingId = document.getElementById('lead-edit-id').value;
        // 編集（既存）中は上書きしない。追加（新規）中だけプリセットを反映する。
        if (isOpen && !editingId) applySalesPresetToLeadForm(currentSalesPreset);
      });
    }

    document.getElementById('lead-priority').addEventListener('change', () => {
      document.getElementById('lead-edit-id').dataset.priorityTouched = '1';
    });

    document.getElementById('lead-status').addEventListener('change', toggleNgReason);

    initModals();
    renderLeadsTable();
  }

  function initModals() {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', e => {
        if (e.target === modal) modal.classList.add('hidden');
      });
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
    });
  }

  function toggleNgReason() {
    const status = document.getElementById('lead-status').value;
    document.getElementById('lead-ng-reason-group').style.display =
      (status === 'NG' || status === '見送り') ? 'block' : 'none';
  }

  function renderLeadsTable() {
    const tbody = document.getElementById('leads-tbody');
    const { enriched, settings } = getSalesContext();
    const order = { high: 0, mid: 1, low: 2 };
    const list = enriched.slice().sort((a, b) => {
      const pl = (order[a.priorityLevel] ?? 2) - (order[b.priorityLevel] ?? 2);
      if (pl !== 0) return pl;
      return (b.priorityScore || 0) - (a.priorityScore || 0);
    });

    if (!list.length && !Storage.getLeads().length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">まだ営業先がありません。名刺登録または「+ 新規追加」から追加できます。</td></tr>';
      return;
    }

    const allLeads = Storage.getLeads();
    const closed = allLeads.filter(l => {
      const ss = l.salesStatus || SalesBrain.mapLegacyStatus(l.status);
      return ['NG', '見送り', '成約'].includes(l.status) || SalesBrain.CLOSED_SALES_STATUSES.includes(ss);
    });
    const closedIds = new Set(closed.map(l => l.id));
    const activeList = list.filter(l => !closedIds.has(l.id));
    const displayList = [...activeList, ...closed.map(l => SalesBrain.enrichLead(l, Storage.getGeneratedPosts(), settings, TODAY()))];

    const today = TODAY();
    const records = Storage.getRevenueRecords();
    tbody.innerHTML = displayList.map(l => {
      const overdue = l.nextActionDate && l.nextActionDate < today && !l.salesPriorityExcluded;
      const nextActionNote = !l.nextAction ? ' <small class="sales-priority-warning">未設定</small>' : '';
      const revSummary = RevenueBrain.getLeadRevenueSummary(l.id, records);
      let revenueHint = '';
      if (revSummary.count) {
        revenueHint = `<small class="lead-revenue-hint">売上：${esc(RevenueBrain.formatYen(revSummary.total))}</small>`;
        if (revSummary.latestDate) {
          revenueHint += `<small class="lead-revenue-hint">最新：${esc(revSummary.latestDate)}</small>`;
        }
        if (revSummary.paymentConcern) {
          revenueHint += `<small class="lead-revenue-hint lead-revenue-concern-warn">入金注意</small>`;
        }
      }
      const salesHold = RevenueBrain.getLeadSalesHold(l.id, records, allLeads);
      const salesCandidate = salesHold ? null : RevenueBrain.getLeadNextSalesAction(l.id, records, allLeads, today);
      let salesTag = '';
      if (salesHold) {
        salesTag = '<small class="lead-sales-candidate-tag lead-sales-tag-hold">営業保留</small>';
      } else if (salesCandidate) {
        salesTag = `<small class="lead-sales-candidate-tag lead-sales-tag-${salesCandidate.priority}">${esc(salesCandidate.shortTag)}</small>`;
      }
      const wonBadge = l.salesStatus === '成約'
        ? ' <span class="sales-status-badge sales-status-won">成約</span>' : '';
      return `
      <tr class="${overdue ? 'row-overdue' : ''}">
        <td><span class="sales-priority-label priority-${l.priorityLevel || 'low'}">${esc(l.priorityLabel || '低')}</span></td>
        <td>
          <button type="button" class="lead-company-link" data-open-lead="${esc(l.id)}">${esc(l.company)}</button>${wonBadge}
          ${revenueHint}
        </td>
        <td><span class="sales-status-badge sales-status-${salesStatusClass(l.salesStatus)}">${esc(l.salesStatus)}</span></td>
        <td>${esc(l.nextActionDate || '—')}</td>
        <td>${esc(l.recommendedProduct || '—')}</td>
        <td>${esc(l.nextAction || l.suggestedAction || '—')}${nextActionNote}${salesTag}</td>
        <td class="actions">
          <button class="btn-edit" data-edit-lead="${l.id}">編集</button>
          <button class="btn-edit" data-open-lead="${l.id}">営業準備</button>
          <button class="btn-danger" data-delete-lead="${l.id}">削除</button>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-edit-lead]').forEach(b =>
      b.addEventListener('click', () => openLeadModal(b.dataset.editLead)));
    tbody.querySelectorAll('[data-open-lead]').forEach(b =>
      b.addEventListener('click', () => openSalesDetail(b.dataset.openLead)));
    tbody.querySelectorAll('[data-delete-lead]').forEach(b =>
      b.addEventListener('click', () => {
        if (confirm('この営業先を削除しますか？')) {
          Storage.deleteLead(b.dataset.deleteLead);
          renderLeadsTable();
          renderDashboard();
        }
      }));
  }

  function openLeadModal(id) {
    document.getElementById('lead-form').reset();
    document.getElementById('lead-edit-id').value = '';
    document.getElementById('lead-edit-id').dataset.priorityTouched = '';
    document.getElementById('lead-ng-reason-group').style.display = 'none';

    if (id) {
      const item = Storage.getLeads().find(l => l.id === id);
      if (!item) return;
      document.getElementById('lead-modal-title').textContent = '営業先を編集';
      document.getElementById('lead-edit-id').value = id;
      if (item.priorityManual) document.getElementById('lead-edit-id').dataset.priorityTouched = '1';
      const presetValue = item.salesPreset || currentSalesPreset;
      const hiddenPreset = document.getElementById('lead-sales-preset');
      if (hiddenPreset) hiddenPreset.value = presetValue;
      const fields = ['company', 'region', 'industry', 'url', 'contact', 'email', 'phone',
        'contactForm', 'sns', 'service', 'priority', 'status', 'lastContact', 'nextContact', 'ngReason', 'memo'];
      fields.forEach(f => {
        const el = document.getElementById('lead-' + f.replace(/([A-Z])/g, '-$1').toLowerCase());
        if (el) el.value = item[f] || '';
      });
      toggleNgReason();
    } else {
      document.getElementById('lead-modal-title').textContent = '営業先を追加';
      const hiddenPreset = document.getElementById('lead-sales-preset');
      if (hiddenPreset) hiddenPreset.value = currentSalesPreset;
      applySalesPresetToLeadForm(currentSalesPreset);
    }
    document.getElementById('lead-modal').classList.remove('hidden');
  }

  function closeLeadModal() {
    document.getElementById('lead-modal').classList.add('hidden');
  }

  function handleLeadSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('lead-edit-id').value;
    const priorityTouched = document.getElementById('lead-edit-id').dataset.priorityTouched === '1';
    const data = {
      company: document.getElementById('lead-company').value,
      region: document.getElementById('lead-region').value,
      industry: document.getElementById('lead-industry').value,
      url: document.getElementById('lead-url').value,
      contact: document.getElementById('lead-contact').value,
      email: document.getElementById('lead-email').value,
      phone: document.getElementById('lead-phone').value,
      contactForm: document.getElementById('lead-contact-form').value,
      sns: document.getElementById('lead-sns').value,
      service: document.getElementById('lead-service').value,
      priority: document.getElementById('lead-priority').value,
      status: document.getElementById('lead-status').value,
      lastContact: document.getElementById('lead-last-contact').value,
      nextContact: document.getElementById('lead-next-contact').value,
      ngReason: document.getElementById('lead-ng-reason').value,
      memo: document.getElementById('lead-memo').value,
      salesPreset: document.getElementById('lead-sales-preset').value,
      priorityManual: priorityTouched || (!id && document.getElementById('lead-priority').value !== 'B')
    };

    if (id) {
      const normalized = SalesBrain.normalizeLead({
        ...data,
        salesStatus: SalesBrain.mapLegacyStatus(data.status),
        nextActionDate: data.nextContact,
        lastContactAt: data.lastContact
      });
      const pri = SalesBrain.computeSalesPriority(normalized, TODAY());
      Storage.updateLead(id, {
        ...data,
        salesStatus: normalized.salesStatus,
        nextActionDate: normalized.nextActionDate,
        lastContactAt: normalized.lastContactAt,
        priorityScore: pri.score,
        priorityReason: pri.reasons.join('、')
      });
    } else {
      const normalized = SalesBrain.normalizeLead({
        ...data,
        salesStatus: SalesBrain.mapLegacyStatus(data.status),
        nextActionDate: data.nextContact,
        lastContactAt: data.lastContact
      });
      const pri = SalesBrain.computeSalesPriority(normalized, TODAY());
      Storage.addLead({
        ...normalized,
        priorityScore: pri.score,
        priorityReason: pri.reasons.join('、')
      });
    }

    closeLeadModal();
    renderLeadsTable();
    renderDashboard();
  }

  function navigateToView(viewName) {
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.view === viewName);
    });
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + viewName).classList.add('active');
    if (viewName === 'dashboard') renderDashboard();
    if (viewName === 'radar') renderDemandRadar();
    if (viewName === 'pickup') renderDemandPickup();
    if (viewName === 'revenue') renderRevenueView();
    if (viewName === 'data') renderDataManagement();
  }

  function getEnrichedLead(leadId) {
    const { enriched, settings, demand, today } = getSalesContext();
    let item = enriched.find(l => l.id === leadId);
    if (!item) {
      const lead = Storage.getLeads().find(l => l.id === leadId);
      if (!lead) return null;
      item = SalesBrain.enrichLead(lead, demand, settings, today);
    }
    return item;
  }

  function switchSalesTab(tab) {
    currentSalesTab = tab;
    document.querySelectorAll('.sales-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    const fieldId = SALES_TAB_FIELDS[tab];
    const content = document.getElementById('sales-tab-content');
    const hidden = document.getElementById(fieldId);
    if (content && hidden) content.value = hidden.value;
    const logBtn = document.getElementById('sales-tab-log');
    if (logBtn) logBtn.textContent = SALES_TAB_LOG[tab] + 'を記録';
  }

  function renderSalesHistory(leadId) {
    const listEl = document.getElementById('sales-history-list');
    if (!listEl) return;
    const lead = Storage.getLeads().find(l => l.id === leadId);
    const history = (lead && lead.salesHistory) || [];
    if (!history.length) {
      listEl.innerHTML = '<li class="placeholder-text">送信記録はまだありません。メールや電話の記録ボタンから残せます。</li>';
      return;
    }
    listEl.innerHTML = history.slice(0, 20).map(h => {
      const when = h.at ? h.at.slice(0, 16).replace('T', ' ') : '';
      return `<li><strong>${esc(h.type)}</strong><span>${esc(when)}</span>${h.note ? '<small>' + esc(h.note) + '</small>' : ''}</li>`;
    }).join('');
  }

  function recordSalesActivity(type) {
    if (!currentMessageLeadId) return;
    Storage.addSalesHistory(currentMessageLeadId, { type });
    const lead = Storage.getLeads().find(l => l.id === currentMessageLeadId);
    if (!lead) return;
    const today = TODAY();
    const updates = { lastContactAt: today, lastContact: today };
    const normalized = SalesBrain.normalizeLead(lead);
    if (normalized.salesStatus === '未営業') {
      updates.salesStatus = '初回連絡済み';
      if (lead.status === '未接触') updates.status = 'アプローチ中';
    }
    Storage.updateLead(currentMessageLeadId, updates);
    renderLeadsTable();
    renderSalesHistory(currentMessageLeadId);
    const updated = Storage.getLeads().find(l => l.id === currentMessageLeadId);
    if (updated) populateSalesMgmtForm(updated);
    renderDashboard();
  }

  function openSalesDetail(leadId, options) {
    const opts = options || {};
    const lead = Storage.getLeads().find(l => l.id === leadId);
    if (!lead) return;

    const presetKey = lead.salesPreset || currentSalesPreset;
    const enriched = getEnrichedLead(leadId);
    const product = enriched.recommendedProduct || SalesBrain.recommendProduct(lead, Storage.getGeneratedPosts());
    const msgs = MessageTemplates.generateAll(lead, product, presetKey);
    currentMessageLeadId = leadId;
    currentSalesMessages = msgs;

    document.getElementById('sales-detail-company').textContent = lead.company;
    document.getElementById('sales-detail-product').textContent = msgs.product;
    const presetEl = document.getElementById('sales-detail-preset');
    if (presetEl) {
      presetEl.textContent = MessageTemplates.getPresetLabel(presetKey) || '—';
    }
    const priEl = document.getElementById('sales-detail-priority');
    if (priEl) {
      priEl.textContent = enriched.priorityLabel || '—';
      priEl.className = 'sales-priority-label priority-' + (enriched.priorityLevel || 'low');
    }
    document.getElementById('sales-detail-reason').textContent = enriched.priorityReason || enriched.displayReason || '—';

    populateSalesMgmtForm(lead);

    const contactParts = [];
    if (lead.contact) contactParts.push(lead.contact);
    if (lead.email) contactParts.push(lead.email);
    if (lead.phone) contactParts.push(lead.phone);
    document.getElementById('sales-detail-contact').textContent = contactParts.length
      ? contactParts.join(' / ') : '連絡先未登録';

    const links = [];
    if (lead.url) links.push('URL: ' + lead.url);
    if (lead.region) links.push('地域: ' + lead.region);
    if (lead.industry) links.push('業種: ' + lead.industry);
    document.getElementById('sales-detail-links').textContent = links.join(' ｜ ');

    const memoEl = document.getElementById('sales-detail-memo');
    if (lead.memo) {
      memoEl.textContent = 'メモ: ' + lead.memo;
      memoEl.classList.remove('hidden');
    } else {
      memoEl.textContent = '';
      memoEl.classList.add('hidden');
    }

    document.getElementById('msg-email').value = msgs.email;
    document.getElementById('msg-form').value = msgs.form;
    document.getElementById('msg-dm').value = msgs.dm;
    document.getElementById('msg-phone').value = msgs.phone;

    const allMsgs = Storage.getGeneratedMessages();
    allMsgs[leadId] = msgs;
    Storage.saveGeneratedMessages(allMsgs);

    switchSalesTab(currentSalesTab || 'email');
    renderSalesHistory(leadId);
    renderLeadDetailSubpanels(leadId);
    resetLeadActivityForm();

    if (opts.navigate) navigateToView('sales');
    document.getElementById('sales-detail-panel').classList.remove('hidden');
    document.getElementById('sales-detail-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeSalesDetail() {
    document.getElementById('sales-detail-panel').classList.add('hidden');
    currentMessageLeadId = null;
    currentSalesMessages = null;
  }

  function showMessages(leadId) {
    openSalesDetail(leadId);
  }

  // ── 名刺登録 ──
  const CARD_FIELD_IDS = [
    'card-company', 'card-contact', 'card-title', 'card-email',
    'card-phone', 'card-url', 'card-address', 'card-exchange-memo',
    'card-memo', 'card-next-contact'
  ];

  function initCardParser() {
    const uploadArea = document.getElementById('card-upload-area');
    const fileInput = document.getElementById('card-file-input');
    const form = document.getElementById('card-register-form');

    uploadArea.addEventListener('click', e => {
      const labelTap = e.target && e.target.closest && e.target.closest('label[for="card-file-input"]');
      if (labelTap) return;
      if (e.target.id !== 'card-preview') fileInput.click();
    });
    uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', e => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      if (e.dataTransfer.files[0]?.type.startsWith('image/')) handleCardImage(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      handleCardImage(file);
      // Allow selecting the same file again.
      fileInput.value = '';
    });

    form.addEventListener('submit', e => { e.preventDefault(); addCardToLeads(); });

    CARD_FIELD_IDS.forEach(id => {
      document.getElementById(id).addEventListener('input', debounce(() => {
        updateCardProductSuggest();
        saveCardDraftFromForm();
        document.getElementById('btn-add-to-leads').disabled = !getCardFormFields().company.trim();
      }, 300));
    });

    document.querySelectorAll('#card-memo-chips .memo-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const ta = document.getElementById('card-exchange-memo');
        const text = chip.dataset.chip;
        ta.value = ta.value ? ta.value + '、' + text : text;
        updateCardProductSuggest();
        saveCardDraftFromForm();
        document.getElementById('btn-add-to-leads').disabled = !getCardFormFields().company.trim();
      });
    });

    loadCardDraft();
  }

  function getCardFormFields() {
    return {
      company: document.getElementById('card-company').value,
      contact: document.getElementById('card-contact').value,
      title: document.getElementById('card-title').value,
      email: document.getElementById('card-email').value,
      phone: document.getElementById('card-phone').value,
      url: document.getElementById('card-url').value,
      address: document.getElementById('card-address').value,
      exchangeMemo: document.getElementById('card-exchange-memo').value,
      memo: document.getElementById('card-memo').value,
      nextContact: document.getElementById('card-next-contact').value
    };
  }

  function setCardFormFields(fields) {
    const map = {
      company: 'card-company', contact: 'card-contact', title: 'card-title',
      email: 'card-email', phone: 'card-phone', url: 'card-url',
      address: 'card-address', exchangeMemo: 'card-exchange-memo',
      memo: 'card-memo', nextContact: 'card-next-contact'
    };
    Object.entries(map).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el) el.value = fields[key] || '';
    });
  }

  function saveCardDraftFromForm() {
    const preview = document.getElementById('card-preview');
    try {
      Storage.saveCardDraft({
        fields: getCardFormFields(),
        imageData: preview.classList.contains('hidden') ? '' : preview.src
      });
    } catch (e) {
      const statusEl = document.getElementById('card-ocr-status');
      if (statusEl) {
        statusEl.textContent = '保存に失敗しました（画像が大きすぎる可能性があります）';
      }
    }
  }

  function loadCardDraft() {
    const draft = Storage.getCardDraft();
    if (!draft || !draft.fields) return;
    setCardFormFields(draft.fields);
    if (draft.imageData) {
      const preview = document.getElementById('card-preview');
      preview.src = draft.imageData;
      preview.classList.remove('hidden');
      document.querySelector('#card-upload-area .upload-placeholder').style.display = 'none';
      document.getElementById('btn-add-to-leads').disabled = !draft.fields.company?.trim();
    }
    updateCardProductSuggest();
  }

  async function handleCardImage(file) {
    const preview = document.getElementById('card-preview');
    const statusEl = document.getElementById('card-ocr-status');
    if (statusEl) statusEl.textContent = '名刺画像を読み込み中...';

    const readFileAsDataURL = (f) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('FileReader failed'));
      reader.readAsDataURL(f);
    });

    const compressImageDataUrl = async (dataUrl) => {
      const MAX_WIDTH = 1200;
      const QUALITY = 0.82;

      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          try {
            const w = img.naturalWidth || img.width;
            const h = img.naturalHeight || img.height;
            if (!w || !h) return resolve(dataUrl);

            const scale = Math.min(1, MAX_WIDTH / w);
            const shouldReencode = dataUrl.length > 1000000; // おおよそ1MB目安（base64長）
            if (scale === 1 && !shouldReencode) return resolve(dataUrl);

            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(w * scale));
            canvas.height = Math.max(1, Math.round(h * scale));
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(dataUrl);

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', QUALITY));
          } catch (e) {
            resolve(dataUrl);
          }
        };
        img.onerror = () => resolve(dataUrl); // HEIC等でデコードできない場合は元のデータで続行
        img.src = dataUrl;
      });
    };

    try {
      const originalDataUrl = await readFileAsDataURL(file);
      const compressedDataUrl = await compressImageDataUrl(originalDataUrl);

      preview.src = compressedDataUrl || originalDataUrl;
      preview.classList.remove('hidden');

      const placeholder = document.querySelector('#card-upload-area .upload-placeholder');
      if (placeholder) placeholder.style.display = 'none';

      if (statusEl) statusEl.textContent = '名刺画像を読み込み中...';
      const result = await CardOCR.extractFromImage(file);
      if (statusEl) statusEl.textContent = result.message;

      if (result.fields) {
        const current = getCardFormFields();
        const merged = { ...CardOCR.emptyFields(), ...current };
        Object.keys(result.fields).forEach(k => {
          if (result.fields[k] && !merged[k]) merged[k] = result.fields[k];
        });
        setCardFormFields(merged);
      }

      document.getElementById('btn-add-to-leads').disabled = !getCardFormFields().company.trim();
      updateCardProductSuggest();
      saveCardDraftFromForm();
    } catch (e) {
      if (statusEl) {
        statusEl.textContent = '画像の読み込みに失敗しました。スクリーンショットまたはJPEGで再選択してください。';
      }
    }
  }

  function updateCardProductSuggest() {
    const fields = getCardFormFields();
    const draftLead = {
      company: fields.company,
      contact: fields.contact,
      memo: [fields.exchangeMemo, fields.memo, fields.title, fields.address].filter(Boolean).join(' '),
      url: fields.url,
      industry: '',
      region: fields.address ? fields.address.slice(0, 10) : '',
      service: ''
    };
    const demand = Storage.getGeneratedPosts();
    const product = SalesBrain.recommendProduct(draftLead, demand);
    document.getElementById('card-recommended-product').textContent = product;
  }

  function addCardToLeads() {
    const fields = getCardFormFields();
    const validation = CardOCR.validate(fields);
    if (!validation.valid) {
      alert(validation.errors.join('\n'));
      return;
    }

    const product = document.getElementById('card-recommended-product').textContent;
    const payload = CardOCR.toLeadPayload(fields, product === '—' ? '' : product);
    Storage.addLead(payload);
    Storage.clearCardDraft();

    const successEl = document.getElementById('card-register-success');
    successEl.classList.remove('hidden');
    successEl.scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => successEl.classList.add('hidden'), 5000);

    renderLeadsTable();
    renderDashboard();
  }

  // ── 売上番頭 ──
  function fillRevenueLeadSelect(selectedId) {
    const el = document.getElementById('revenue-lead');
    if (!el) return;
    const leads = Storage.getLeads().slice().sort((a, b) => (a.company || '').localeCompare(b.company || '', 'ja'));
    let options = '<option value="">未紐付け</option>';
    options += leads.map(l => `<option value="${esc(l.id)}">${esc(l.company)}</option>`).join('');
    if (selectedId && !leads.find(l => l.id === selectedId)) {
      const record = Storage.getRevenueRecords().find(r => r.leadId === selectedId);
      const name = (record && record.leadName) || '削除済み営業先';
      options += `<option value="${esc(selectedId)}">${esc(name)}（削除済み）</option>`;
    }
    el.innerHTML = options;
    el.value = selectedId || '';
  }

  function toggleRevenueLeadOptions() {
    const leadId = document.getElementById('revenue-lead').value;
    const wrap = document.getElementById('revenue-mark-won-wrap');
    if (wrap) wrap.classList.toggle('hidden', !leadId);
    toggleRevenueOpenLeadButton();
  }

  function toggleRevenueOpenLeadButton() {
    const leadId = document.getElementById('revenue-lead').value;
    const btn = document.getElementById('btn-revenue-open-lead');
    if (!btn) return;
    btn.disabled = !(leadId && Storage.getLeads().find(l => l.id === leadId));
  }

  function showRevenueLeadNotice(message) {
    const el = document.getElementById('revenue-lead-notice');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
    clearTimeout(showRevenueLeadNotice._timer);
    showRevenueLeadNotice._timer = setTimeout(() => el.classList.add('hidden'), 4000);
  }

  function matchRevenueService(leadService) {
    if (!leadService) return RevenueBrain.SERVICES[0];
    if (RevenueBrain.SERVICES.includes(leadService)) return leadService;
    const found = RevenueBrain.SERVICES.find(s => leadService.includes(s) || s.includes(leadService));
    return found || RevenueBrain.SERVICES[0];
  }

  function buildLeadPayloadFromRevenueFields(fields) {
    const company = (fields.customerName || '').trim();
    if (!company) return null;
    const workDate = fields.workDate || TODAY();
    const memoParts = ['【売上登録から作成】'];
    if (fields.source) memoParts.push('依頼元: ' + fields.source);
    if (fields.amount) memoParts.push('金額: ' + RevenueBrain.formatYen(fields.amount));
    if (fields.memo) memoParts.push(fields.memo);

    const draft = SalesBrain.normalizeLead({
      company,
      service: fields.service || '',
      priority: 'B',
      status: '成約',
      salesStatus: '成約',
      lastContact: workDate,
      lastContactAt: workDate,
      memo: memoParts.join('\n')
    });
    const pri = SalesBrain.computeSalesPriority(draft, TODAY());
    return {
      ...draft,
      priorityScore: pri.score,
      priorityReason: pri.reasons.join('、')
    };
  }

  function createLeadFromRevenueForm() {
    const customerName = document.getElementById('revenue-customer').value.trim();
    if (!customerName) {
      alert('顧客名を入力してください');
      return null;
    }
    const fields = {
      workDate: document.getElementById('revenue-work-date').value || TODAY(),
      customerName,
      service: document.getElementById('revenue-service').value,
      source: document.getElementById('revenue-source').value,
      amount: Number(document.getElementById('revenue-amount').value) || 0,
      memo: document.getElementById('revenue-memo').value.trim()
    };
    const payload = buildLeadPayloadFromRevenueFields(fields);
    if (!payload) return null;
    const lead = Storage.addLead(payload);
    fillRevenueLeadSelect(lead.id);
    toggleRevenueLeadOptions();
    document.getElementById('revenue-mark-won').checked = true;
    showRevenueLeadNotice('営業先「' + lead.company + '」を作成して紐付けました');
    renderLeadsTable();
    renderDashboard();
    return lead;
  }

  function createLeadFromRevenueRecord(revenueId) {
    const record = RevenueBrain.normalizeRevenueRecord(
      Storage.getRevenueRecords().find(r => r.id === revenueId)
    );
    if (!record) return null;
    if (record.leadId && Storage.getLeads().find(l => l.id === record.leadId)) {
      alert('すでに営業先が紐付いています');
      return null;
    }
    const fields = {
      workDate: record.workDate || TODAY(),
      customerName: record.customerName,
      service: record.service,
      source: record.source,
      amount: record.amount,
      memo: record.memo
    };
    const payload = buildLeadPayloadFromRevenueFields(fields);
    if (!payload) return null;
    const lead = Storage.addLead(payload);
    Storage.updateRevenueRecord(revenueId, { leadId: lead.id, leadName: lead.company });
    showRevenueLeadNotice('営業先「' + lead.company + '」を作成して売上に紐付けました');
    renderLeadsTable();
    renderRevenueView();
    renderDashboard();
    if (currentMessageLeadId === lead.id) {
      renderLeadDetailSubpanels(lead.id);
    }
    return lead;
  }

  function openSelectedRevenueLead() {
    const leadId = document.getElementById('revenue-lead').value;
    if (!leadId) {
      alert('営業先を選択してください');
      return;
    }
    if (!Storage.getLeads().find(l => l.id === leadId)) {
      alert('この営業先は削除されています');
      return;
    }
    openSalesDetail(leadId, { navigate: true });
  }

  function renderPaymentStatusBadge(record) {
    const status = record.paymentStatus || '未入金';
    const label = RevenueBrain.formatPaymentStatusLabel(status);
    const concern = RevenueBrain.recordHasPaymentConcern(record)
      ? ' <span class="revenue-payment-concern-badge">入金注意</span>' : '';
    return `<span class="revenue-status-badge revenue-payment-${esc(status)}">${esc(label)}</span>${concern}`;
  }

  function openRevenueFormForLead(leadId) {
    const lead = Storage.getLeads().find(l => l.id === leadId);
    if (!lead) return;
    navigateToView('revenue');
    fillRevenueSelects();
    document.getElementById('revenue-edit-id').value = '';
    document.getElementById('revenue-form-title').textContent = '売上登録';
    document.getElementById('btn-revenue-cancel').classList.add('hidden');
    document.getElementById('revenue-work-date').value = TODAY();
    document.getElementById('revenue-customer').value = lead.company || '';
    document.getElementById('revenue-service').value = matchRevenueService(lead.service);
    document.getElementById('revenue-source').value = RevenueBrain.SOURCES[0];
    document.getElementById('revenue-amount').value = '';
    document.getElementById('revenue-status').value = '予定';
    document.getElementById('revenue-payment').value = '未入金';
    document.getElementById('revenue-payment-concern').checked = false;
    document.getElementById('revenue-memo').value = '';
    fillRevenueLeadSelect(leadId);
    document.getElementById('revenue-mark-won').checked = true;
    toggleRevenueLeadOptions();
    document.getElementById('revenue-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderRevenueLeadLinkHtml(record, leads) {
    if (!record.leadId) {
      return `<div class="revenue-lead-cell">
        <span class="revenue-lead-unlinked">未紐付け</span>
        <button type="button" class="btn btn-sm btn-secondary" data-create-lead-revenue="${esc(record.id)}">営業先作成</button>
      </div>`;
    }
    const label = RevenueBrain.resolveLeadLabel(record, leads);
    if (leads.find(l => l.id === record.leadId)) {
      return `<button type="button" class="revenue-lead-link" data-revenue-open-lead="${esc(record.leadId)}">${esc(label)}</button>`;
    }
    return `<span class="revenue-lead-deleted">${esc(label)}</span>`;
  }

  function bindRevenueLeadListActions() {
    document.querySelectorAll('[data-revenue-open-lead]').forEach(btn => {
      btn.addEventListener('click', () => openSalesDetail(btn.dataset.revenueOpenLead, { navigate: true }));
    });
    document.querySelectorAll('[data-create-lead-revenue]').forEach(btn => {
      btn.addEventListener('click', () => createLeadFromRevenueRecord(btn.dataset.createLeadRevenue));
    });
  }

  function updateLeadStatusFromRevenue(leadId) {
    const lead = Storage.getLeads().find(l => l.id === leadId);
    if (!lead) return false;
    const normalized = SalesBrain.normalizeLead(lead);
    if (normalized.salesStatus === '見送り' || normalized.salesStatus === '成約') return false;
    const today = TODAY();
    Storage.updateLead(leadId, {
      salesStatus: '成約',
      status: '成約',
      lastContactAt: today,
      lastContact: today
    });
    return true;
  }

  function renderLeadRevenuePanel(leadId) {
    const container = document.getElementById('lead-revenue-panel');
    if (!container) return;
    const summary = RevenueBrain.getLeadRevenueSummary(leadId, Storage.getRevenueRecords());
    if (!summary.count) {
      container.innerHTML = '<p class="placeholder-text">この営業先の売上履歴はまだありません。作業が終わったら「売上を登録」から追加できます。</p>';
      return;
    }
    const historyHtml = summary.records
      .filter(r => r.status !== 'キャンセル')
      .slice(0, 5)
      .map(r => `
        <li>
          <strong>${esc(RevenueBrain.formatYen(r.amount))}</strong>
          <div class="lead-revenue-history-meta">
            <span>${esc(r.workDate || '—')}</span>
            <span>${esc(r.service || '—')}</span>
            <span class="revenue-status-badge revenue-status-${esc(r.status)}">${esc(r.status)}</span>
            ${renderPaymentStatusBadge(r)}
          </div>
        </li>`).join('');
    container.innerHTML = `<ul class="lead-revenue-history">${historyHtml}</ul>`;
  }

  function fillRevenueSelects() {
    const serviceEl = document.getElementById('revenue-service');
    const sourceEl = document.getElementById('revenue-source');
    if (serviceEl && !serviceEl.options.length) {
      serviceEl.innerHTML = RevenueBrain.SERVICES.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    }
    if (sourceEl && !sourceEl.options.length) {
      sourceEl.innerHTML = RevenueBrain.SOURCES.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    }
  }

  function resetRevenueForm() {
    document.getElementById('revenue-edit-id').value = '';
    document.getElementById('revenue-form').reset();
    document.getElementById('revenue-work-date').value = TODAY();
    document.getElementById('revenue-status').value = '予定';
    document.getElementById('revenue-payment').value = '未入金';
    document.getElementById('revenue-payment-concern').checked = false;
    document.getElementById('revenue-mark-won').checked = false;
    fillRevenueLeadSelect('');
    toggleRevenueLeadOptions();
    toggleRevenueOpenLeadButton();
    document.getElementById('revenue-form-title').textContent = '売上登録';
    document.getElementById('btn-revenue-cancel').classList.add('hidden');
  }

  function openRevenueEdit(id) {
    const record = RevenueBrain.normalizeRevenueRecord(Storage.getRevenueRecords().find(r => r.id === id));
    if (!record) return;
    fillRevenueSelects();
    document.getElementById('revenue-edit-id').value = id;
    document.getElementById('revenue-work-date').value = record.workDate || '';
    document.getElementById('revenue-customer').value = record.customerName || '';
    document.getElementById('revenue-service').value = record.service || RevenueBrain.SERVICES[0];
    document.getElementById('revenue-source').value = record.source || RevenueBrain.SOURCES[0];
    document.getElementById('revenue-amount').value = record.amount || '';
    document.getElementById('revenue-status').value = record.status || '予定';
    document.getElementById('revenue-payment').value = record.paymentStatus || '未入金';
    document.getElementById('revenue-payment-concern').checked = record.paymentConcern === true;
    document.getElementById('revenue-memo').value = record.memo || '';
    fillRevenueLeadSelect(record.leadId || '');
    document.getElementById('revenue-mark-won').checked = false;
    toggleRevenueLeadOptions();
    document.getElementById('revenue-form-title').textContent = '売上編集';
    document.getElementById('btn-revenue-cancel').classList.remove('hidden');
    document.getElementById('revenue-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function getRevenueFormData() {
    const leadId = document.getElementById('revenue-lead').value;
    const leads = Storage.getLeads();
    const data = {
      workDate: document.getElementById('revenue-work-date').value,
      customerName: document.getElementById('revenue-customer').value.trim(),
      service: document.getElementById('revenue-service').value,
      source: document.getElementById('revenue-source').value,
      amount: Number(document.getElementById('revenue-amount').value) || 0,
      status: document.getElementById('revenue-status').value,
      paymentStatus: document.getElementById('revenue-payment').value,
      paymentConcern: document.getElementById('revenue-payment-concern').checked,
      memo: document.getElementById('revenue-memo').value.trim()
    };
    if (leadId) {
      const lead = leads.find(l => l.id === leadId);
      data.leadId = leadId;
      data.leadName = lead ? lead.company : (Storage.getRevenueRecords().find(r => r.leadId === leadId)?.leadName || '');
    } else {
      data.leadId = '';
      data.leadName = '';
    }
    return data;
  }

  function renderRevenueBreakdown(id, items) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!items.length) {
      el.innerHTML = '<li class="placeholder-text">今月の内訳データはまだありません。売上を登録すると表示されます。</li>';
      return;
    }
    el.innerHTML = items.map(item =>
      `<li><span>${esc(item.name)}</span><strong>${esc(RevenueBrain.formatYen(item.amount))}</strong></li>`
    ).join('');
  }

  function renderRevenueRowActions(id) {
    return `
      <button type="button" class="btn-edit" data-edit-revenue="${esc(id)}">編集</button>
      <button type="button" class="btn-danger" data-delete-revenue="${esc(id)}">削除</button>`;
  }

  function renderRevenueList() {
    const { monthKey, leads } = getRevenueContext();
    const records = Storage.getRevenueRecords()
      .map(r => RevenueBrain.normalizeRevenueRecord(r))
      .filter(r => r.workDate && r.workDate.startsWith(monthKey))
      .slice()
      .sort((a, b) => (b.workDate || '').localeCompare(a.workDate || ''));

    const tbody = document.getElementById('revenue-tbody');
    const cardList = document.getElementById('revenue-card-list');

    if (!records.length) {
      const empty = '<tr><td colspan="9" class="empty-state">今月の売上登録がまだありません。作業が終わったら1件登録してみましょう。</td></tr>';
      if (tbody) tbody.innerHTML = empty;
      if (cardList) cardList.innerHTML = '<p class="empty-state">今月の売上登録がまだありません。作業が終わったら1件登録してみましょう。</p>';
      return;
    }

    if (tbody) {
      tbody.innerHTML = records.map(r => `
        <tr>
          <td>${esc(r.workDate)}</td>
          <td>${esc(r.customerName)}</td>
          <td class="revenue-lead-label">${renderRevenueLeadLinkHtml(r, leads)}</td>
          <td>${esc(r.service)}</td>
          <td>${esc(r.source)}</td>
          <td>${esc(RevenueBrain.formatYen(r.amount))}</td>
          <td><span class="revenue-status-badge revenue-status-${esc(r.status)}">${esc(r.status)}</span></td>
          <td>${renderPaymentStatusBadge(r)}</td>
          <td class="actions">${renderRevenueRowActions(r.id)}</td>
        </tr>`).join('');
    }

    if (cardList) {
      cardList.innerHTML = records.map(r => {
        let cardLeadHtml;
        if (!r.leadId) {
          cardLeadHtml = `<span class="revenue-lead-unlinked">未紐付け</span>
            <button type="button" class="btn btn-sm btn-secondary" data-create-lead-revenue="${esc(r.id)}">営業先作成</button>`;
        } else if (leads.find(l => l.id === r.leadId)) {
          cardLeadHtml = `<span>${esc(RevenueBrain.resolveLeadLabel(r, leads))}</span>
            <button type="button" class="btn btn-sm btn-secondary" data-revenue-open-lead="${esc(r.leadId)}">営業先を開く</button>`;
        } else {
          cardLeadHtml = `<span class="revenue-lead-deleted">${esc(RevenueBrain.resolveLeadLabel(r, leads))}</span>`;
        }
        return `
        <div class="revenue-card">
          <div class="revenue-card-header">
            <strong>${esc(r.customerName)}</strong>
            <span class="revenue-card-amount">${esc(RevenueBrain.formatYen(r.amount))}</span>
          </div>
          <p class="revenue-card-meta">${esc(r.workDate)} ｜ ${esc(r.service)} ｜ ${esc(r.source)}</p>
          <div class="revenue-card-meta revenue-card-lead-row">
            <span>紐付け:</span> ${cardLeadHtml}
          </div>
          <p class="revenue-card-meta">
            <span class="revenue-status-badge revenue-status-${esc(r.status)}">${esc(r.status)}</span>
            ${renderPaymentStatusBadge(r)}
          </p>
          ${r.memo ? `<p class="revenue-card-meta">${esc(r.memo)}</p>` : ''}
          <div class="revenue-card-actions">${renderRevenueRowActions(r.id)}</div>
        </div>`;
      }).join('');
    }

    bindRevenueLeadListActions();

    document.querySelectorAll('[data-edit-revenue]').forEach(btn => {
      btn.addEventListener('click', () => openRevenueEdit(btn.dataset.editRevenue));
    });
    document.querySelectorAll('[data-delete-revenue]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('この売上記録を削除しますか？')) {
          Storage.deleteRevenueRecord(btn.dataset.deleteRevenue);
          renderRevenueView();
          renderDashboard();
        }
      });
    });
  }

  function renderRevenueSummaryPanel() {
    const { summary, comment, settings, salesOutcome, leads } = getRevenueContext();
    const summaryEl = document.getElementById('revenue-summary');
    const commentEl = document.getElementById('revenue-bantou-comment');
    const targetEl = document.getElementById('revenue-monthly-target');
    const outcomeEl = document.getElementById('revenue-sales-outcome');

    renderRevenueUnlinkedBanner(salesOutcome);

    if (summaryEl) {
      const baseItems = [
        { label: '売上予定', value: RevenueBrain.formatYen(summary.planned) },
        { label: '確定', value: RevenueBrain.formatYen(summary.confirmed) },
        { label: '完了', value: RevenueBrain.formatYen(summary.completed) },
        { label: '入金済み', value: RevenueBrain.formatYen(summary.paid) },
        { label: '入金待ち', value: RevenueBrain.formatYen(summary.unpaid) },
        { label: '月間目標', value: RevenueBrain.formatYen(summary.monthlyTarget) },
        { label: '目標まで残り', value: RevenueBrain.formatYen(summary.remainingToTarget) },
        { label: '達成率', value: summary.achievementRate + '%' },
        { label: '残り日数', value: summary.daysLeft + '日' },
        { label: '1日あたり必要', value: RevenueBrain.formatYen(summary.dailyNeeded) }
      ];
      const outcomeItems = [
        { label: '紐付け売上', value: RevenueBrain.formatYen(salesOutcome.linkedTotal), extraClass: 'revenue-summary-outcome revenue-summary-outcome-linked' },
        { label: '未紐付け売上', value: salesOutcome.unlinkedTotal > 0 ? RevenueBrain.formatYen(salesOutcome.unlinkedTotal) : 'なし ✓', extraClass: 'revenue-summary-outcome ' + (salesOutcome.unlinkedTotal > 0 ? 'revenue-summary-outcome-warn' : 'revenue-summary-outcome-ok') },
        { label: '売上発生営業先', value: salesOutcome.leadCount + '件', extraClass: 'revenue-summary-outcome' },
        { label: '成約営業先', value: salesOutcome.contractedCount + '件', extraClass: 'revenue-summary-outcome' }
      ];
      summaryEl.innerHTML = [...baseItems, ...outcomeItems].map(item => `
        <div class="revenue-summary-item ${item.extraClass || ''}">
          <span>${esc(item.label)}</span>
          <strong>${esc(item.value)}</strong>
        </div>`).join('');
    }
    if (commentEl) commentEl.textContent = comment;
    if (targetEl) targetEl.value = settings.monthlyTarget || '';
    if (outcomeEl) {
      outcomeEl.innerHTML = renderSalesOutcomeHtml(salesOutcome, { leads });
      bindSalesOutcomeLeadLinks(outcomeEl);
    }
    renderNextSalesCandidatesList('revenue-next-sales', 5);
    renderSalesHoldCandidatesList('revenue-sales-hold', 5);
    renderManagementComment('revenue-management-comment');
    renderRevenueBreakdown('revenue-by-service', summary.byService);
    renderRevenueBreakdown('revenue-by-source', summary.bySource);
  }

  function renderRevenueView() {
    fillRevenueSelects();
    const leadEl = document.getElementById('revenue-lead');
    fillRevenueLeadSelect(leadEl ? leadEl.value : '');
    toggleRevenueLeadOptions();
    renderRevenueSummaryPanel();
    renderRevenueList();
  }

  function handleRevenueSubmit(e) {
    e.preventDefault();
    const data = getRevenueFormData();
    if (!data.customerName) {
      alert('顧客名は必須です');
      return;
    }
    const markWon = document.getElementById('revenue-mark-won').checked;
    const leadId = data.leadId;
    const id = document.getElementById('revenue-edit-id').value;
    if (id) Storage.updateRevenueRecord(id, data);
    else Storage.addRevenueRecord(data);
    if (markWon && leadId) {
      const updated = updateLeadStatusFromRevenue(leadId);
      if (updated) renderLeadsTable();
    }
    resetRevenueForm();
    renderRevenueView();
    renderDashboard();
    if (currentMessageLeadId === leadId) {
      renderLeadDetailSubpanels(leadId);
    }
  }

  function initRevenue() {
    fillRevenueSelects();
    fillRevenueLeadSelect('');
    toggleRevenueLeadOptions();
    toggleRevenueOpenLeadButton();
    document.getElementById('revenue-form').addEventListener('submit', handleRevenueSubmit);
    document.getElementById('btn-revenue-cancel').addEventListener('click', resetRevenueForm);
    document.getElementById('revenue-lead').addEventListener('change', () => {
      toggleRevenueLeadOptions();
      document.getElementById('revenue-mark-won').checked = false;
    });
    document.getElementById('btn-revenue-create-lead').addEventListener('click', createLeadFromRevenueForm);
    document.getElementById('btn-revenue-open-lead').addEventListener('click', openSelectedRevenueLead);
    document.getElementById('btn-revenue-new').addEventListener('click', () => {
      resetRevenueForm();
      document.getElementById('revenue-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.getElementById('btn-save-revenue-target').addEventListener('click', () => {
      const monthlyTarget = Number(document.getElementById('revenue-monthly-target').value) || 0;
      Storage.saveRevenueSettings({ monthlyTarget });
      renderRevenueView();
      renderDashboard();
    });
    const scrollUnlinkedBtn = document.getElementById('btn-scroll-unlinked-revenue');
    if (scrollUnlinkedBtn) {
      scrollUnlinkedBtn.addEventListener('click', () => {
        const section = document.getElementById('revenue-list-section');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    resetRevenueForm();
    renderRevenueView();
  }

  // ── 追客管理 ──
  function initFollowup() {
    document.getElementById('btn-add-followup').addEventListener('click', () => openFollowupModal());
    document.getElementById('btn-followup-cancel').addEventListener('click', closeFollowupModal);
    document.getElementById('followup-form').addEventListener('submit', handleFollowupSubmit);
    document.getElementById('followup-status').addEventListener('change', toggleFollowupNgReason);

    document.querySelectorAll('#followup-filters .filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#followup-filters .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFollowupFilter = btn.dataset.status;
        renderFollowupTable();
      });
    });

    renderFollowupTable();
  }

  function toggleFollowupNgReason() {
    const status = document.getElementById('followup-status').value;
    document.getElementById('followup-ng-reason-group').style.display =
      (status === 'NG' || status === '見送り') ? 'block' : 'none';
  }

  function renderFollowupOverdue() {
    const container = document.getElementById('followup-overdue');
    const today = TODAY();
    const overdue = Storage.getFollowups().filter(f =>
      f.nextContact && f.nextContact < today && !CLOSED_STATUSES.includes(f.status)
    );
    if (!overdue.length) {
      container.innerHTML = '';
      container.classList.add('hidden');
      return;
    }
    container.classList.remove('hidden');
    container.innerHTML = overdue.map(f =>
      `<div class="alert-item alert-danger">フォロー漏れ: ${esc(f.company)}（次回連絡日: ${esc(f.nextContact)}）</div>`
    ).join('');
  }

  function renderFollowupTable() {
    renderFollowupOverdue();
    const tbody = document.getElementById('followup-tbody');
    let list = Storage.getFollowups();

    if (currentFollowupFilter === 'ng-list') {
      list = list.filter(f => f.status === 'NG' || f.status === '見送り');
    } else if (currentFollowupFilter !== 'all') {
      list = list.filter(f => f.status === currentFollowupFilter);
    }

    const today = TODAY();
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">追客データがありません</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(f => `
      <tr class="${f.nextContact && f.nextContact < today && !CLOSED_STATUSES.includes(f.status) ? 'row-overdue' : ''}">
        <td><strong>${esc(f.company)}</strong></td>
        <td>${esc(f.contact || '—')}</td>
        <td>${esc(f.email || f.phone || '—')}</td>
        <td><span class="status-badge status-${esc(f.status)}">${esc(f.status)}</span></td>
        <td>${esc(f.lastContact || '—')}</td>
        <td>${esc(f.nextContact || '—')}</td>
        <td>${esc(f.nextAction || '—')}</td>
        <td class="actions">
          <button class="btn-edit" data-edit-followup="${f.id}">編集</button>
          <button class="btn-danger" data-delete-followup="${f.id}">削除</button>
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('[data-edit-followup]').forEach(b =>
      b.addEventListener('click', () => openFollowupModal(b.dataset.editFollowup)));
    tbody.querySelectorAll('[data-delete-followup]').forEach(b =>
      b.addEventListener('click', () => {
        if (confirm('この追客データを削除しますか？')) {
          Storage.deleteFollowup(b.dataset.deleteFollowup);
          renderFollowupTable();
          renderDashboard();
        }
      }));
  }

  function openFollowupModal(id) {
    document.getElementById('followup-form').reset();
    document.getElementById('followup-edit-id').value = '';
    document.getElementById('followup-ng-reason-group').style.display = 'none';

    if (id) {
      const item = Storage.getFollowups().find(f => f.id === id);
      if (!item) return;
      document.getElementById('followup-modal-title').textContent = '追客を編集';
      document.getElementById('followup-edit-id').value = id;
      ['company', 'contact', 'email', 'phone', 'status', 'lastContact',
        'nextContact', 'nextAction', 'ngReason', 'memo'].forEach(f => {
        const el = document.getElementById('followup-' + f.replace(/([A-Z])/g, '-$1').toLowerCase());
        if (el) el.value = item[f] || '';
      });
      toggleFollowupNgReason();
    } else {
      document.getElementById('followup-modal-title').textContent = '追客を追加';
    }
    document.getElementById('followup-modal').classList.remove('hidden');
  }

  function closeFollowupModal() {
    document.getElementById('followup-modal').classList.add('hidden');
  }

  function handleFollowupSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('followup-edit-id').value;
    const data = {
      company: document.getElementById('followup-company').value,
      contact: document.getElementById('followup-contact').value,
      email: document.getElementById('followup-email').value,
      phone: document.getElementById('followup-phone').value,
      status: document.getElementById('followup-status').value,
      lastContact: document.getElementById('followup-last-contact').value,
      nextContact: document.getElementById('followup-next-contact').value,
      nextAction: document.getElementById('followup-next-action').value,
      ngReason: document.getElementById('followup-ng-reason').value,
      memo: document.getElementById('followup-memo').value
    };

    if (id) Storage.updateFollowup(id, data);
    else Storage.addFollowup(data);

    closeFollowupModal();
    renderFollowupTable();
    renderDashboard();
  }

  // ── ユーティリティ ──
  function priorityOrder(p) {
    return { A: 0, B: 1, C: 2 }[p || 'B'] ?? 1;
  }

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy') ? resolve() : reject();
      } catch (e) {
        reject(e);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    migrateV17Leads();
    syncTodayDemandFromLog();
    initNavigation();
    initDashboard();
    initDailyActionTasks();
    initDemandRadar();
    initDemandPickup();
    initDemandSearch();
    initLeads();
    initRevenue();
    initCardParser();
    initFollowup();
    initDataManagement();
    initStartGuide();
  });
})();
