/**
 * Budil MVP v0.1 - メインアプリケーション
 */
(function () {
  'use strict';

  let currentFollowupFilter = 'all';
  let currentMessageLeadId = null;
  let pendingImport = null;
  let pendingRevenueWorkOrderId = '';
  let pendingRevenueIntakeId = '';
  let pendingLinkedDocumentId = '';
  let pendingLinkedRevenueId = '';
  let selectedFollowUpTargetId = null;
  let currentSalesTab = 'email';
  let currentSalesMessages = null;
  let pickupBulkPreview = [];
  let selectedPickupContentId = null;
  let weeklyStrategyPeriod = '7d';
  let businessReportPeriod = '7d';
  let lastBusinessReportContext = null;
  let revenueAggregationFilter = { year: '', month: '', source: '', service: '' };
  let currentDocPreviewId = null;
  let documentsFormDirty = false;
  let receivablesFilter = 'all';

  const PAST_RECOVERY_UI_ENABLED = false;
  const SCHEDULE_IMPORT_VIEW = 'calendar-candidate';

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
      label: '広告・集客支援を売る',
      service: '広告・集客支援',
      priority: 'B',
      status: '未接触',
      nextContactOffsetDays: 5,
      memoTemplate: '【広告・集客支援を売る】\n・問い合わせ導線の整理\n・最初の一歩から相談'
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

  function showAppToast(message) {
    const el = document.getElementById('app-toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 2200);
  }

  function scrollToTopOrTarget(selector) {
    if (selector) {
      scrollNavTarget(selector);
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const ACTION_NAV_TARGETS = {
    'calendar-import-save': { targetView: 'revenue', targetSelector: '#revenue-upcoming-schedule' },
    'revenue-confirm': { targetView: 'dashboard', targetSelector: '#executive-home' },
    'revenue-save': { targetView: 'revenue', targetSelector: '#revenue-list-section' },
    'expense-save': { targetView: 'profit', targetSelector: '#profit-summary' },
    'monthly-results-save': { targetView: 'revenue', targetSelector: '#revenue-monthly-reconciliation' },
    'monthly-adjustment-save': { targetView: 'revenue', targetSelector: '#revenue-monthly-reconciliation' }
  };

  function showActionResult(message, options) {
    const opts = options || {};
    showAppToast(message);
    if (opts.targetView) {
      navigateToView(opts.targetView, opts.targetSelector || null);
    } else if (opts.targetSelector) {
      scrollToTopOrTarget(opts.targetSelector);
    } else if (opts.scrollTop !== false) {
      scrollToTopOrTarget(null);
    }
  }

  function navigateAfterAction(actionType, message) {
    const target = ACTION_NAV_TARGETS[actionType];
    if (target) {
      showActionResult(message, {
        targetView: target.targetView,
        targetSelector: target.targetSelector,
        scrollTop: false
      });
    } else {
      showActionResult(message, { scrollTop: true });
    }
  }

  function formatRevenueStatusLabel(status) {
    return typeof RevenueBrain !== 'undefined' && RevenueBrain.displayRevenueStatus
      ? RevenueBrain.displayRevenueStatus(status)
      : (status === '完了' ? '確定' : (status || '予定'));
  }

  function formatRevenueStatusBadge(status) {
    const label = formatRevenueStatusLabel(status);
    return `<span class="revenue-status-badge revenue-status-${esc(label)}">${esc(label)}</span>`;
  }

  function fillAreaSelectOptions(selectEl, selected) {
    if (!selectEl) return;
    const areas = MapBrain.AREAS;
    const cur = selected || '';
    selectEl.innerHTML = '<option value="">住所から自動推定</option>'
      + areas.map(a => `<option value="${esc(a)}"${a === cur ? ' selected' : ''}>${esc(a)}</option>`).join('');
  }

  function getSourceOptions() {
    return Array.isArray(RevenueBrain.SOURCES) ? RevenueBrain.SOURCES : ['LP', '110番', 'くらしのマーケット', 'ヤマダ', 'コープ', 'その他'];
  }

  function fillSourceSelectOptions(selectEl, selected, options) {
    if (!selectEl) return;
    const opts = options || {};
    const cur = String(arguments.length >= 2 ? (selected || '') : (selectEl.value || '')).trim();
    const sourceOptions = [...getSourceOptions()];
    if (cur && !sourceOptions.includes(cur)) sourceOptions.push(cur);
    const blank = opts.blankLabel ? `<option value=""${cur ? '' : ' selected'}>${esc(opts.blankLabel)}</option>` : '';
    selectEl.innerHTML = blank + sourceOptions.map(s =>
      `<option value="${esc(s)}"${s === cur ? ' selected' : ''}>${esc(s)}</option>`
    ).join('');
  }

  function getDefaultGrossProfitRateBySource(source) {
    if (typeof RevenueBrain !== 'undefined' && RevenueBrain.getDefaultGrossProfitRateBySource) {
      return RevenueBrain.getDefaultGrossProfitRateBySource(source);
    }
    const map = { 'ヤマダ': 60, 'くらしのマーケット': 80, 'LP': 100 };
    return Object.prototype.hasOwnProperty.call(map, source) ? map[source] : null;
  }

  function applyGrossMarginDefault(sourceEl, rateEl, options) {
    if (!sourceEl || !rateEl) return;
    const opts = options || {};
    const nextRate = getDefaultGrossProfitRateBySource(sourceEl.value);
    const current = String(rateEl.value || '').trim();
    const previousAuto = String(rateEl.dataset.autoGrossMarginRate || '').trim();
    const isManual = rateEl.dataset.manualGrossMarginRate === '1';
    const matchesPreviousAuto = previousAuto && Number(current) === Number(previousAuto);
    const canUpdate = opts.force || !current || (!isManual && matchesPreviousAuto);

    if (nextRate == null) {
      if (canUpdate && matchesPreviousAuto) rateEl.value = '';
      rateEl.dataset.autoGrossMarginRate = '';
      return;
    }

    if (!canUpdate) return;
    rateEl.dataset.applyingGrossMarginDefault = '1';
    rateEl.value = String(nextRate);
    rateEl.dataset.autoGrossMarginRate = String(nextRate);
    rateEl.dataset.manualGrossMarginRate = '';
    rateEl.dataset.applyingGrossMarginDefault = '';
  }

  function bindGrossMarginManualTracking(rateEl) {
    if (!rateEl || rateEl.dataset.grossMarginManualBound === '1') return;
    rateEl.dataset.grossMarginManualBound = '1';
    rateEl.addEventListener('input', () => {
      if (rateEl.dataset.applyingGrossMarginDefault === '1') return;
      rateEl.dataset.manualGrossMarginRate = String(rateEl.value || '').trim() ? '1' : '';
      if (!rateEl.dataset.manualGrossMarginRate) rateEl.dataset.autoGrossMarginRate = '';
    });
  }

  function applyRevenueGrossMarginDefault(options) {
    applyGrossMarginDefault(
      document.getElementById('revenue-source'),
      document.getElementById('revenue-gross-margin-rate'),
      options
    );
  }

  function applyWorkCompletionGrossMarginDefault(options) {
    applyGrossMarginDefault(
      document.getElementById('work-completion-source'),
      document.getElementById('work-completion-gross-rate'),
      options
    );
  }

  function getCombinedAddress(address, region) {
    const a = (address || '').trim();
    const r = (region || '').trim();
    if (a && r && a !== r) return a.length >= r.length ? a : r;
    return a || r;
  }

  function renderAreaDistanceBadge(area, address) {
    const dist = MapBrain.classifyAreaDistance(area, address);
    const label = MapBrain.getDistanceLabel(dist);
    if (!label) return '';
    const cls = dist === 'far' ? 'area-badge-far' : (dist === 'no-address' ? 'area-badge-no-address' : 'area-badge-caution');
    return `<span class="area-distance-badge ${cls}">${esc(label)}</span>`;
  }

  function renderMapActionsHtml(address, options) {
    const opts = options || {};
    const addr = (address || '').trim();
    if (!addr) {
      return opts.showNoAddress !== false
        ? '<span class="map-no-address label-muted">住所未入力</span>'
        : '';
    }
    const url = MapBrain.buildGoogleMapSearchUrl(addr);
    const parts = [
      `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-secondary map-open-btn">Googleマップで開く</a>`,
      `<button type="button" class="btn btn-sm btn-secondary map-copy-btn" data-copy-address="${esc(addr)}">住所コピー</button>`
    ];
    if (opts.area) {
      parts.unshift(`<span class="area-label-badge">${esc(opts.area)}</span>`);
      parts.unshift(renderAreaDistanceBadge(opts.area, addr));
    }
    return `<div class="map-actions-inline">${parts.join('')}</div>`;
  }

  function bindMapActionEvents(container) {
    if (!container) return;
    container.querySelectorAll('[data-copy-address]').forEach(btn => {
      btn.addEventListener('click', () => {
        copyText(btn.dataset.copyAddress || '')
          .then(() => showAppToast('住所をコピーしました'))
          .catch(() => alert('コピーに失敗しました'));
      });
    });
  }

  function getMapContext() {
    const today = TODAY();
    const leads = Storage.getLeads();
    const intakes = Storage.getReceptionIntakes();
    const revenues = Storage.getRevenueRecords();
    const workOrders = Storage.getWorkOrders();
    const summary = MapBrain.buildAreaSummary({ leads, intakes, revenues, workOrders, today });
    const warnings = MapBrain.getAreaWarnings({ leads, intakes, revenues, workOrders, today });
    return { today, leads, intakes, revenues, workOrders, summary, warnings };
  }

  function goToAreaView() {
    navigateToView('area');
  }

  function syncLeadAreaFromAddress() {
    const address = getCombinedAddress(
      document.getElementById('lead-address')?.value,
      document.getElementById('lead-region')?.value
    );
    const areaEl = document.getElementById('lead-area');
    if (!areaEl || areaEl.dataset.manual === '1') return;
    const detected = MapBrain.detectAreaFromAddress(address);
    fillAreaSelectOptions(areaEl, detected);
    const mapEl = document.getElementById('lead-map-actions');
    if (mapEl) {
      mapEl.innerHTML = renderMapActionsHtml(address, { area: detected });
      bindMapActionEvents(mapEl);
    }
  }

  function syncReceptionAreaFromAddress() {
    const address = (document.getElementById('reception-address')?.value || '').trim();
    const areaEl = document.getElementById('reception-area');
    if (!areaEl || areaEl.dataset.manual === '1') return;
    const detected = MapBrain.detectAreaFromAddress(address);
    fillAreaSelectOptions(areaEl, detected);
    const mapEl = document.getElementById('reception-form-map-actions');
    if (mapEl) {
      mapEl.innerHTML = renderMapActionsHtml(address, { area: detected });
      bindMapActionEvents(mapEl);
    }
  }

  function syncWorkOrderAreaFromAddress() {
    const address = (document.getElementById('work-order-address')?.value || '').trim();
    const areaEl = document.getElementById('work-order-area');
    if (!areaEl || areaEl.dataset.manual === '1') return;
    const detected = MapBrain.detectAreaFromAddress(address);
    fillAreaSelectOptions(areaEl, detected);
    const mapEl = document.getElementById('work-order-form-map-actions');
    if (mapEl) {
      mapEl.innerHTML = renderMapActionsHtml(address, { area: detected });
      bindMapActionEvents(mapEl);
    }
    updateWorkOrderCalendarHint();
  }

  function getWorkOrderFormData() {
    const startRaw = document.getElementById('work-order-start')?.value || '';
    const endRaw = document.getElementById('work-order-end')?.value || '';
    const address = (document.getElementById('work-order-address')?.value || '').trim();
    const area = (document.getElementById('work-order-area')?.value || '').trim()
      || MapBrain.detectAreaFromAddress(address);
    return WorkOrderBrain.normalizeWorkOrder({
      customerName: document.getElementById('work-order-customer')?.value || '',
      phone: document.getElementById('work-order-phone')?.value || '',
      address,
      area,
      source: document.getElementById('work-order-source')?.value || '',
      serviceText: document.getElementById('work-order-service')?.value || '',
      scheduledDate: document.getElementById('work-order-date')?.value || '',
      startTime: startRaw ? startRaw.slice(0, 5) : '',
      endTime: endRaw ? endRaw.slice(0, 5) : '',
      status: document.getElementById('work-order-status')?.value || 'tentative',
      estimateAmount: document.getElementById('work-order-amount')?.value || '',
      memo: document.getElementById('work-order-memo')?.value || '',
      intakeId: document.getElementById('work-order-intake')?.value || '',
      leadId: document.getElementById('work-order-lead')?.value || ''
    });
  }

  function updateWorkOrderCalendarHint() {
    const hintEl = document.getElementById('work-order-calendar-hint');
    const calBtn = document.getElementById('btn-work-order-calendar');
    if (!hintEl || !calBtn) return;
    const data = getWorkOrderFormData();
    const cal = WorkOrderBrain.buildGoogleCalendarUrl(data);
    if (cal.ready) {
      hintEl.classList.add('hidden');
      hintEl.textContent = '';
      calBtn.disabled = false;
    } else {
      hintEl.classList.remove('hidden');
      hintEl.textContent = cal.reason || '予定日または時間を入力してください';
      calBtn.disabled = true;
    }
  }
  const CLOSED_STATUSES = ['成約', '見送り', 'NG'];
  const ACTIVE_LEAD_STATUSES = ['未接触', 'アプローチ中', '商談中'];

  // ── ナビゲーション ──
  const STRATEGY_MEMO_VIEWS = ['strategy-memo', 'radar', 'pickup', 'demand'];
  const DAILY_TASKS_UI_LABEL = '毎日やること';
  const EMPTY_DAILY_TASKS_COPY = '毎日やることはまだありません。予定取り込み・改善リスト・経営ホームから追加できます。';
  const EMPTY_SCHEDULE_COPY = '直近予定はありません。予定取り込みから読み込めます。';
  const CALENDAR_REGISTRATION_VIEWS = ['calendar-registration', 'reception', 'work-order'];
  const NAV_VIEW_ALIASES = {
    reception: 'calendar-registration',
    'work-order': 'calendar-registration',
    'revenue-analysis': 'revenue',
    radar: 'strategy-memo',
    pickup: 'strategy-memo',
    demand: 'strategy-memo'
  };

  function resolveNavView(viewName) {
    if (STRATEGY_MEMO_VIEWS.includes(viewName)) return 'strategy-memo';
    return NAV_VIEW_ALIASES[viewName] || viewName;
  }

  function resolveViewElement(view) {
    return view;
  }

  function setNavActive(viewName) {
    const activeView = resolveNavView(viewName);
    document.querySelectorAll('.nav-item-main').forEach(n => {
      n.classList.toggle('active', n.dataset.view === activeView);
    });
  }

  function scrollNavTarget(selector) {
    if (!selector) return;
    const target = document.querySelector(selector);
    if (!target) return;
    let node = target;
    while (node) {
      if (node.tagName === 'DETAILS' && !node.open) node.open = true;
      node = node.parentElement;
    }
    setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  function switchView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const viewEl = resolveViewElement(view);
    const target = document.getElementById('view-' + viewEl);
    if (target) target.classList.add('active');
    if (view === 'dashboard') renderDashboard();
    if (view === 'strategy-memo') renderStrategyMemoHub();
    if (view === 'radar') renderDemandRadar();
    if (view === 'pickup') renderDemandPickup();
    if (view === 'demand') {
      const saved = Storage.getGeneratedPosts();
      if (saved) renderDemandOutput(saved);
      renderDemandLogHistory();
    }
    if (view === 'sales') renderLeadsTable();
    if (view === 'followup') {
      renderFollowupTable();
      renderFollowupOverdue();
    }
    if (CALENDAR_REGISTRATION_VIEWS.includes(view)) {
      renderReceptionView();
      renderWorkOrderView();
    }
    if (view === 'calendar-candidate') renderCalendarCandidateView();
    if (view === 'external-check') renderExternalCheckView();
    if (view === 'follow-up') renderFollowUpView();
    if (view === 'profit') renderProfitView();
    if (view === 'monthly-results') renderMonthlyResultsView();
    if (view === 'analytics') renderAnalyticsView();
    if (view === 'area') renderAreaView();
    if (view === 'revenue') renderRevenueView();
    if (view === 'revenue-analysis') renderRevenueAnalysisView();
    if (view === 'receivables') renderReceivablesView();
    if (view === 'documents') renderDocumentsView();
    if (view === 'data') renderDataManagement();
  }

  function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        setNavActive(view);
        switchView(view);
        scrollNavTarget(btn.dataset.scroll);
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

  function safeRenderSection(containerId, renderFn, label) {
    try {
      renderFn();
    } catch (err) {
      console.error('[Budil] render error:', label || containerId || 'section', err);
      if (containerId) {
        const el = document.getElementById(containerId);
        if (el) {
          el.innerHTML = '<p class="section-render-error">このセクションの表示中にエラーが発生しました。バックアップ後、データ診断を実行してください。</p>';
        }
      }
    }
  }

  function renderDashboard() {
    renderStartGuide();
    safeRenderSection('executive-home', () => renderExecutiveHome(), '経営司令塔ホーム');
    safeRenderSection('dash-external-check', () => renderDashExternalCheck(), '外部確認');
    safeRenderSection('dash-action-candidates', () => renderDashActionCandidates(), '改善リスト');
    safeRenderSection(null, () => renderBackupStatus(), 'バックアップ状況');
    safeRenderSection('morning-report', () => renderMorningReport(), '朝レポート');
    safeRenderSection(null, () => renderDemandInsights(), '需要インサイト');
    safeRenderSection('dash-sales-targets', () => renderSalesInsights(), '営業インサイト');
    safeRenderSection('dash-followups', () => renderDashboardLists(), 'ダッシュボードリスト');
    safeRenderSection('dash-revenue-summary', () => renderDashRevenueSummary(), '売上サマリー');
    safeRenderSection('dash-monthly-results', () => renderDashMonthlyResults(), '月次実績');
    safeRenderSection('dash-management-comment', () => renderManagementComments(), '経営番頭コメント');
    safeRenderSection('dash-today-execution', () => renderDashTodayExecutionPlan(), '今日の投稿・広告予定');
    safeRenderSection('dash-improvement-hints', () => renderDashImprovementHints(), '改善ヒント');
    safeRenderSection('dash-weekly-performance', () => renderDashWeeklyPerformance(), '今週の施策成果');
    safeRenderSection('dash-weekly-focus', () => renderDashWeeklyFocus(), '今週の集中先');
    safeRenderSection('dash-stop-improve', () => renderDashStopImprove(), '改善・停止候補');
    safeRenderSection('dash-weekly-strategy', () => renderWeeklyStrategyBoard(), '週間作戦ボード');
    safeRenderSection('dash-action-calendar', () => renderActionCalendar(), '投稿・広告カレンダー');
    safeRenderSection('dash-daily-action-tasks', () => renderDailyActionTasks(), DAILY_TASKS_UI_LABEL);
    safeRenderSection(null, () => renderMorningDailyTasksBrief(), '朝レポートタスク');
    safeRenderSection('business-report-dash', () => renderBusinessReport('compact'), '経営メモ');
    safeRenderSection('onboarding-guide-dash', () => renderOnboardingGuide('compact'), 'はじめてガイド');
    safeRenderSection('product-overview-dash', () => renderProductOverview('compact'), 'Budilでできること');
    safeRenderSection('recommended-ops-dash', () => renderRecommendedOperations('compact'), 'おすすめ運用');
  }

  function hasExecutiveHomeData() {
    if (typeof ExecutiveBrain === 'undefined') {
      const store = Storage.getDailyActionTasksData();
      return Storage.getDemandPickups().length > 0
        || Storage.getReceptionIntakes().length > 0
        || Storage.getLeads().length > 0
        || Storage.getRevenueRecords().length > 0
        || (store.manualTasks && store.manualTasks.length > 0);
    }
    return ExecutiveBrain.hasHomeData({
      workOrders: Storage.getWorkOrders(),
      intakes: Storage.getReceptionIntakes(),
      revenues: Storage.getRevenueRecords(),
      expenses: Storage.getExpenseRecords(),
      pickups: Storage.getDemandPickups(),
      analyticsRecords: Storage.getAnalyticsRecords(),
      leads: Storage.getLeads(),
      dailyTasks: getDailyActionTasksWithState()
    });
  }

  function buildExecutiveContext() {
    const today = TODAY();
    const followCtx = getFollowUpContext();
    const ctx = ExecutiveBrain.buildContext({
      today,
      workOrders: Storage.getWorkOrders(),
      intakes: Storage.getReceptionIntakes(),
      revenues: Storage.getRevenueRecords(),
      documents: Storage.getDocuments(),
      expenses: Storage.getExpenseRecords(),
      leads: Storage.getLeads(),
      pickups: Storage.getDemandPickups(),
      analyticsRecords: Storage.getAnalyticsRecords(),
      dailyTasks: getDailyActionTasksWithState(),
      revCtx: getRevenueContext(),
      profitCtx: getProfitContext(),
      analyticsCtx: getAnalyticsContext(),
      followUpTargets: followCtx.targets,
      mapCtx: getMapContext(),
      perfCtx: getPerformanceContext(),
      settings: Storage.getSettings(),
      checkState: Storage.getTodayCheckState(today),
      diagnosticLevels: lastDiagnosticResult ? lastDiagnosticResult.levels : null
    });
    ctx.topPriorities = (ctx.topPriorities || []).filter(p => {
      const key = (p && (p.dedupeKey || p.id)) || '';
      const state = Storage.getActionCandidateState(key);
      return !(state && state.state === 'not_needed');
    });
    return ctx;
  }

  function formatDailyTaskTypeLabel(task) {
    if (!task) return 'その他';
    if (task.type === 'manual') return '手動';
    if (task.workOrderId || (task.pickupDedupeKey && String(task.pickupDedupeKey).startsWith('work-order|'))) {
      return '作業予定';
    }
    if (task.followUpType || (task.pickupDedupeKey && String(task.pickupDedupeKey).startsWith('follow-up|'))) {
      return '作業後フォロー';
    }
    const map = {
      'sales-hold': '営業保留',
      'next-action': '営業連絡',
      'next-sales': '営業提案',
      'target-remaining': '売上目標',
      repeat: 'リピート',
      'register-revenue': '売上明細を手入力',
      'maintain-relationship': '関係維持'
    };
    if (task.pickupActionType) {
      if (task.pickupActionType.startsWith('decision-grow')) return '増やす';
      if (task.pickupActionType.startsWith('decision-improve')) return '改善';
      if (task.pickupActionType.startsWith('calendar-')) return '投稿・広告';
      if (task.pickupActionType.startsWith('weekly-')) return '週間作戦';
      if (task.pickupActionType.startsWith('improve-')) return '改善';
    }
    return map[task.type] || 'その他';
  }

  function getExecutiveHomeTaskBucket(task, today) {
    if (!task || task.status === 'done' || task.status === 'snoozed' || isDailyTaskSnoozedAway(task, today)) {
      return 99;
    }
    if (task.dueDate && task.dueDate < today) return 0;
    if (task.type === 'next-action') {
      const due = task.dueDate || today;
      if (due < today) return 0;
    }
    if (task.pickupActionType && task.pickupActionType.startsWith('decision-grow')) return 2;
    if (task.pickupDedupeKey && String(task.pickupDedupeKey).startsWith('follow-up|')) return 0;
    if (task.pickupDedupeKey && String(task.pickupDedupeKey).startsWith('work-order|')) return 1;
    if (task.pickupDedupeKey && String(task.pickupDedupeKey).startsWith('intake|')) return 1;
    if (task.pickupActionType && task.pickupActionType.startsWith('decision-improve')) return 3;
    if (task.dueDate === today) return 1;
    if (task.type === 'next-action' || task.type === 'next-sales') return 4;
    if (task.type === 'manual') return 6;
    return 7;
  }

  function sortExecutiveHomeTasks(tasks) {
    const today = TODAY();
    const priorityOrder = { '高': 0, '中': 1, '低': 2 };
    return tasks.slice().sort((a, b) => {
      const ba = getExecutiveHomeTaskBucket(a, today) - getExecutiveHomeTaskBucket(b, today);
      if (ba !== 0) return ba;
      const po = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (po !== 0) return po;
      return (a.dueDate || '').localeCompare(b.dueDate || '');
    });
  }

  function getExecutiveHomeTasks(limit) {
    const today = TODAY();
    const tasks = getDailyActionTasksWithState().filter(t =>
      t.status !== 'done' && !isDailyTaskSnoozedAway(t, today) && t.status !== 'snoozed'
    );
    return sortExecutiveHomeTasks(tasks).slice(0, limit || 5);
  }

  function getExecutiveHomeFocusItems() {
    const ctx = getPerformanceContext();
    return DemandBrain.getFocusRecommendations(ctx.pickups, ctx.revenues, ctx.leads, 3, ctx.today);
  }

  function getExecutiveHomeSalesActions() {
    const today = TODAY();
    const rev = getRevenueContext();
    const actions = [];
    const seen = new Set();

    getSalesContext().enriched.forEach(lead => {
      if (seen.has(lead.id)) return;
      const nextDate = lead.nextActionDate || lead.nextContact;
      if (!nextDate || nextDate > today) return;
      if (CLOSED_STATUSES.includes(lead.status)) return;
      const hold = RevenueBrain.getLeadSalesHold(lead.id, rev.records, rev.leads);
      if (hold) return;
      seen.add(lead.id);
      actions.push({
        leadId: lead.id,
        leadName: lead.company,
        action: lead.nextAction || '予定していた営業アクションを実行',
        reason: nextDate < today ? `次回連絡日が過ぎています（${nextDate}）` : '次回連絡日が今日です',
        kind: 'next-contact'
      });
    });

    (rev.nextSalesCandidates || []).forEach(c => {
      if (seen.has(c.leadId) || actions.length >= 3) return;
      seen.add(c.leadId);
      actions.push({
        leadId: c.leadId,
        leadName: c.leadName,
        action: c.action,
        reason: c.reason,
        kind: 'next-sales'
      });
    });

    return actions.slice(0, 3);
  }

  function getExecutiveHomeWarnings() {
    const ctx = buildExecutiveContext();
    return (ctx.warnings || []).map(w => w.text);
  }

  function buildExecutiveHomeSummary() {
    return buildExecutiveContext().summary;
  }

  function formatCheckTimeLabel(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function getTodayCheckState() {
    return Storage.getTodayCheckState(TODAY());
  }

  function saveTodayCheckState(memo, checkUpdates) {
    const today = TODAY();
    const existing = Storage.getTodayCheckState(today);
    const payload = ExecutiveBrain.buildCheckPayload(existing, {
      memo: memo != null ? memo : (existing && existing.memo) || '',
      items: checkUpdates || (existing && existing.items) || {}
    });
    return Storage.saveTodayCheckState(today, payload);
  }

  function renderExecutiveTopPriorityCard(item, index) {
    const p = item || {};
    const taskBtn = p.taskId
      ? `<button type="button" class="btn btn-sm btn-primary" data-exec-priority-done="${esc(p.taskId)}">完了</button>`
      : `<button type="button" class="btn btn-sm btn-primary" data-exec-priority-add-task="${esc(p.id)}">毎日やることに追加</button>`;
    return `
      <div class="exec-priority-item" data-priority-id="${esc(p.id)}">
        <div class="exec-priority-header">
          <span class="exec-priority-rank">${index + 1}</span>
          <strong class="exec-priority-title">${esc(p.title)}</strong>
          <span class="exec-source-badge">${esc(p.source)}</span>
        </div>
        <p class="exec-priority-reason">${esc(p.reason)}</p>
        <div class="exec-priority-actions">
          ${taskBtn}
          <button type="button" class="btn btn-sm btn-not-needed" data-exec-priority-not-needed="${esc(p.dedupeKey || p.id)}" data-exec-priority-title="${esc(p.title)}" data-exec-priority-source="${esc(p.source)}" data-exec-priority-source-key="${esc(p.sourceKey)}">必要無し</button>
          <button type="button" class="btn btn-sm btn-secondary" data-exec-priority-nav="${esc(p.sourceKey)}">詳細へ</button>
        </div>
      </div>`;
  }

  function renderExecutiveWorkOrdersHtml(section) {
    const sec = section || { items: [] };
    if (!sec.items.length) {
      return '<p class="placeholder-text">今日の予定はありません。<br>予定取り込みから読み込めます。</p>';
    }
    return sec.items.map(wo => `
      <div class="exec-work-item" data-work-order-id="${esc(wo.id)}">
        <div class="exec-work-header">
          <strong>${esc(wo.startTime || '—')} ${esc(wo.customerName)}</strong>
          <span class="exec-work-status">${esc(wo.statusLabel)}</span>
        </div>
        <p class="exec-work-meta">${esc(wo.serviceText || '—')} / ${esc(wo.area)} / 見込み${WorkOrderBrain.formatYen(wo.estimateAmount)}</p>
        ${wo.warnings.length ? `<p class="exec-work-warn">${wo.warnings.map(w => esc(w)).join(' · ')}</p>` : ''}
        <div class="exec-work-actions">
          <button type="button" class="btn btn-sm btn-primary" data-exec-wo-completion="${esc(wo.id)}">売上確定</button>
          <details class="exec-work-detail-actions">
            <summary>詳細操作</summary>
            <div class="exec-work-actions-secondary">
              ${renderMapActionsHtml(wo.address, { area: wo.area, showNoAddress: true })}
              ${wo.calendarReady ? `<a class="btn btn-sm btn-secondary" href="${esc(wo.calendarUrl)}" target="_blank" rel="noopener noreferrer">Googleカレンダー</a>` : ''}
            </div>
          </details>
        </div>
      </div>`).join('');
  }

  function renderExecutiveReceptionHtml(section) {
    const sec = section || { items: [] };
    if (!sec.items.length) {
      return '<p class="placeholder-text">未対応の受付はありません。</p>';
    }
    return sec.items.slice(0, 5).map(intake => `
      <div class="exec-reception-item" data-intake-id="${esc(intake.id)}">
        <strong>${esc(intake.customerName || '（名前なし）')}</strong>
        <span class="exec-reception-source">${esc(intake.source || '—')}</span>
        <p class="exec-work-meta">${esc(intake.serviceText || '—')} / 希望：${esc(intake.preferredDatesText || '—')} / ${esc(intake.area)}</p>
        <p class="exec-work-meta">次の一手：${esc(intake.nextAction)}</p>
        <div class="exec-work-actions">
          <button type="button" class="btn btn-sm btn-secondary" data-exec-intake-task="${esc(intake.id)}">毎日やること追加</button>
          <details class="exec-reception-detail-actions">
            <summary>詳細操作</summary>
            <div class="exec-work-actions-secondary">
              <button type="button" class="btn btn-sm btn-secondary" data-exec-intake-lead="${esc(intake.id)}">営業先作成</button>
              <button type="button" class="btn btn-sm btn-secondary" data-exec-intake-wo="${esc(intake.id)}">この受付から作業予定を作る</button>
            </div>
          </details>
        </div>
      </div>`).join('');
  }

  function renderExecutiveRevenueProfitHtml(section, options) {
    const opts = options || {};
    const isCompact = !!opts.compact;
    const s = section || {};
    const agg = s.revenueAggregation || {};
    const aggCompact = agg.compact || {};
    const thisMonthView = aggCompact.thisMonthView || {};
    const diffClass = aggCompact.monthDiff > 0 ? 'revenue-agg-diff-up' : (aggCompact.monthDiff < 0 ? 'revenue-agg-diff-down' : '');
    const diffSign = aggCompact.monthDiff > 0 ? '+' : '';
    const topSource = (aggCompact.topSources || [])[0];
    const topService = (aggCompact.topServices || [])[0];
    const monthlyNote = isCompact ? '' : (s.usesMonthlyResult && s.aggregationSourceNote
      ? `<p class="profit-monthly-source-note">${esc(s.aggregationSourceNote)}</p>`
      : (aggCompact.usesMonthlyResultThisMonth && aggCompact.monthlySourceNote
        ? `<p class="profit-monthly-source-note">${esc(aggCompact.monthlySourceNote)}</p>`
        : ''));
    const thisMonthLabel = aggCompact.usesMonthlyResultThisMonth ? '今月実績（月次実績ベース）' : '今月確定売上';
    const breakdownNote = !isCompact && aggCompact.usesMonthlyResultThisMonth
      ? `<p class="reconciliation-brief-line">明細売上合計：${esc(RevenueBrain.formatYen(thisMonthView.detailTotal || 0))} / 差額：${esc(RevenueBrain.formatYen(thisMonthView.diff || 0))}</p>`
      : '';
    const breakdownWarn = !isCompact && aggCompact.usesMonthlyResultThisMonth && thisMonthView.status === '差額あり'
      ? '<p class="reconciliation-brief-warn">※この月は月次実績と売上明細が一致していません。</p>'
      : '';
    const sourceBreakdownNote = !isCompact && aggCompact.usesMonthlyResultThisMonth
      ? '<p class="revenue-agg-scope-note">月次実績ベース分は依頼元別・サービス別の内訳には含まれません。</p>'
      : '';
    const summaryBlock = isCompact ? '' : `
      <div class="exec-home-revenue-summary">
        <p class="exec-home-revenue-scope">売上集計${aggCompact.usesMonthlyResultThisMonth ? '（月次実績を優先）' : '（確定売上のみ）'}</p>
        <p>${esc(thisMonthLabel)}：${esc(RevenueBrain.formatYen(aggCompact.thisMonthTotal || 0))}</p>
        ${breakdownNote}
        ${breakdownWarn}
        <p>先月比：<span class="${diffClass}">${diffSign}${esc(RevenueBrain.formatYen(aggCompact.monthDiff || 0))}</span></p>
        <p>今年売上合計：${esc(RevenueBrain.formatYen(aggCompact.yearTotal || 0))}</p>
        <p>今月の主力：${esc(topSource ? topSource.name : '—')} / ${esc(topService ? topService.name : '—')}</p>
        ${sourceBreakdownNote}
      </div>`;
    const receivablesBlock = isCompact || !s.receivables ? '' : `
      <div class="exec-home-receivables">
        <div><span>入金待ち合計</span><strong>${esc(PaymentBrain.formatYen(s.receivables.pendingTotal || 0))}</strong></div>
        <div><span>今月入金予定</span><strong>${esc(PaymentBrain.formatYen(s.receivables.thisMonthExpected || 0))}</strong></div>
        <div><span>来月入金予定</span><strong>${esc(PaymentBrain.formatYen(s.receivables.nextMonthExpected || 0))}</strong></div>
        <div class="${s.receivables.overdueCount ? 'exec-home-receivables-warn' : ''}"><span>入金遅れ</span><strong>${s.receivables.overdueCount || 0}件</strong></div>
      </div>`;
    const cautionsBlock = isCompact ? '' : (s.cautions || []).map(c => `<p class="exec-work-warn">${esc(c)}</p>`).join('');
    return `
      ${monthlyNote}
      <div class="exec-home-revenue-grid${isCompact ? ' exec-home-revenue-grid-compact' : ''}">
        <div><span>今月売上</span><strong>${esc(RevenueBrain.formatYen(s.monthRevenue))}</strong></div>
        ${isCompact ? '' : `<div><span>月間目標</span><strong>${esc(RevenueBrain.formatYen(s.monthlyTarget))}</strong></div>
        <div><span>達成率</span><strong>${s.achievementRate}%</strong></div>`}
        <div><span>今月経費</span><strong>${esc(ProfitBrain.formatYen(s.monthExpense))}</strong></div>
        <div><span>今月利益</span><strong>${esc(ProfitBrain.formatYen(s.grossProfit))}</strong></div>
        <div><span>利益率</span><strong>${esc(ProfitBrain.formatRate(s.grossRate))}</strong></div>
        ${isCompact ? '' : `<div><span>今週見込み</span><strong>${esc(WorkOrderBrain.formatYen(s.weekForecast))}</strong></div>
        <div><span>売上未登録</span><strong>${s.completedNoRevenue || 0}件</strong></div>`}
      </div>
      ${summaryBlock}
      ${cautionsBlock}
      ${receivablesBlock}
      <div class="exec-work-actions">
        <button type="button" class="btn btn-sm btn-secondary exec-home-revenue-link">売上管理</button>
        ${isCompact ? '' : '<button type="button" class="btn btn-sm btn-secondary exec-home-receivables-link">入金予定</button>'}
        <button type="button" class="btn btn-sm btn-secondary exec-home-profit-link">利益管理</button>
      </div>`;
  }

  function renderExecutiveFollowUpHtml(section) {
    const s = section || {};
    if (!s.thanksCount && !s.reviewCount && !s.repeatCount) {
      return '<p class="placeholder-text">対応が必要なフォローはありません。</p>';
    }
    const summary = [
      s.thanksCount ? `お礼未送信 ${s.thanksCount}件` : '',
      s.reviewCount ? `口コミ依頼未送信 ${s.reviewCount}件` : '',
      s.repeatCount ? `リピート確認 ${s.repeatCount}件` : ''
    ].filter(Boolean).join(' / ');
    const items = (s.todayItems || []).slice(0, 3).map(t => `
      <div class="exec-follow-item" data-follow-target="${esc(t.id)}">
        <strong>${esc(t.customerName || t.leadName || 'お客様')}</strong>
        <p class="exec-work-meta">${t.needsThanks ? 'お礼未送信' : ''}${t.needsReview ? '口コミ依頼未送信' : ''}</p>
        <div class="exec-work-actions">
          ${t.needsThanks ? `<button type="button" class="btn btn-sm btn-secondary" data-exec-follow-thanks="${esc(t.id)}">お礼文コピー</button>` : ''}
          ${t.needsReview ? `<button type="button" class="btn btn-sm btn-secondary" data-exec-follow-review="${esc(t.id)}">口コミ依頼文コピー</button>` : ''}
          <button type="button" class="btn btn-sm btn-secondary" data-exec-follow-task="${esc(t.id)}">毎日やること追加</button>
        </div>
      </div>`).join('');
    return `
      <p class="exec-follow-summary">${esc(summary)}</p>
      ${items}
      <button type="button" class="btn btn-sm btn-secondary exec-home-follow-link">フォローへ</button>`;
  }

  function renderExecutiveAnalyticsDemandHtml(section) {
    const s = section || {};
    const lines = s.lines || [];
    if (!lines.length && !(s.demandLines || []).length) {
      return '<p class="placeholder-text">アナリティクスデータを入力すると判断が表示されます。</p>';
    }
    return `
      ${lines.length ? `<div class="exec-analytics-lines">${lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>` : ''}
      ${(s.demandLines || []).length ? `<ul class="exec-demand-lines">${s.demandLines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
      <div class="exec-work-actions">
        <button type="button" class="btn btn-sm btn-secondary exec-home-analytics-link">アクセス分析</button>
        <button type="button" class="btn btn-sm btn-secondary exec-home-pickup-link">集客施策メモ</button>
        <button type="button" class="btn btn-sm btn-secondary" id="btn-exec-browser-prompt">アクセス確認用の文をコピー</button>
      </div>`;
  }

  function renderExecutiveWarningsHtml(warnings) {
    const split = ExecutiveBrain.splitWarningsForDisplay(warnings);
    const { visible, more, review } = split;
    if (!visible.length && !more.length && !review.length) {
      return '<p class="placeholder-text">今のところ注意・保留はありません。</p>';
    }
    const renderItem = w => `
      <li class="exec-warning exec-warning-${w.level === '重大' ? 'critical' : (w.level === '確認' ? 'review' : 'caution')}">
        <span class="exec-warning-level">${esc(w.level)}</span>
        <span class="exec-warning-text">${esc(w.text)}</span>
        ${w.sourceKey === 'diagnostic' ? '<button type="button" class="btn btn-sm btn-secondary exec-home-diagnostic-link">データ診断</button>' : ''}
        ${w.sourceKey === 'backup' ? '<button type="button" class="btn btn-sm btn-secondary exec-home-backup-link">バックアップ</button>' : ''}
      </li>`;
    let html = `<ul class="exec-warnings-list">${visible.map(renderItem).join('')}</ul>`;
    if (more.length || review.length) {
      html += `<details class="exec-warnings-more">
        <summary>すべて見る（${more.length + review.length}件）</summary>
        <ul class="exec-warnings-list">${more.map(renderItem).join('')}${review.map(renderItem).join('')}</ul>
      </details>`;
    }
    return html;
  }

  function renderExecutiveHomeCheckHtml() {
    const check = ExecutiveBrain.normalizeCheckState(getTodayCheckState());
    const allDone = ExecutiveBrain.CHECK_ITEMS.every(item => check.items[item.id]);
    const checksHtml = ExecutiveBrain.CHECK_ITEMS.map(item => `
      <label class="exec-check-item">
        <input type="checkbox" class="exec-check-box" data-check-item="${esc(item.id)}"${check.items[item.id] ? ' checked' : ''}>
        <span>${esc(item.label)}</span>
      </label>`).join('');
    const timeLabel = check.checkedAt ? formatCheckTimeLabel(check.checkedAt) : '';
    return `
      <div class="exec-home-check-form">
        <div class="exec-check-list">${checksHtml}</div>
        <div class="form-group">
          <label for="exec-check-memo">メモ（任意）</label>
          <input type="text" id="exec-check-memo" value="${esc(check.memo)}" placeholder="朝の確認メモ">
        </div>
        ${allDone && timeLabel ? `<p class="exec-home-check-done">今日 ${esc(timeLabel)} 確認済み</p>` : ''}
        <button type="button" class="btn btn-primary btn-sm" id="btn-exec-check-save">確認状態を保存</button>
      </div>`;
  }

  function renderExecutiveQuickActionButtons(links, btnClass) {
    return (links || []).map(link =>
      `<button type="button" class="btn btn-sm ${btnClass || 'btn-secondary'}" data-exec-quick="${esc(link.id)}">${esc(link.label)}</button>`
    ).join('');
  }

  function bindExecutiveQuickActionButtons(container) {
    if (!container) return;
    container.querySelectorAll('[data-exec-quick]').forEach(btn => {
      btn.addEventListener('click', () => handleExecutiveHomeQuickAction(btn.dataset.execQuick));
    });
  }

  function renderExecutiveHomeQuickActions() {
    const primaryEl = document.getElementById('exec-home-quick-actions-primary');
    const secondaryEl = document.getElementById('exec-home-quick-actions-secondary');
    if (primaryEl) {
      primaryEl.innerHTML = renderExecutiveQuickActionButtons(
        ExecutiveBrain.getPrimaryQuickLinks(),
        'btn-primary exec-quick-btn-primary'
      );
      bindExecutiveQuickActionButtons(primaryEl);
    }
    if (secondaryEl) {
      secondaryEl.innerHTML = renderExecutiveQuickActionButtons(
        ExecutiveBrain.getSecondaryQuickLinks(),
        'btn-secondary'
      );
      bindExecutiveQuickActionButtons(secondaryEl);
    }
  }

  function handleExecutiveHomeQuickAction(action) {
    const map = {
      reception: goToReception,
      'work-order': goToWorkOrder,
      revenue: goToAddRevenue,
      tasks: () => scrollToElement('.card-daily-action-tasks'),
      profit: goToProfit,
      'follow-up': goToFollowUp,
      analytics: goToAnalytics,
      pickup: goToDemandPickup,
      area: goToAreaView,
      sales: () => navigateToView('sales'),
      report: () => scrollToElement('#business-report-dash'),
      'morning-report': () => scrollToElement('#morning-report'),
      'monthly-results': () => navigateToView('monthly-results'),
      'external-check': () => navigateToView('external-check'),
      'strategy-memo': () => navigateToView('strategy-memo'),
      diagnostic: () => { navigateToView('data'); setTimeout(() => scrollToElement('#btn-run-diagnostics'), 120); },
      backup: goToDataBackup,
      kurokuro: goToKurokuroPrompt
    };
    const fn = map[action];
    if (fn) fn();
  }

  function goToKurokuroPrompt() {
    navigateToView('pickup');
    setTimeout(() => scrollToElement('#pickup-cloclo-prompt'), 120);
  }

  function goToDemandPickup() {
    navigateToView('strategy-memo');
  }

  function goToReception() {
    navigateToView('calendar-registration');
    setTimeout(() => scrollToElement('#reception-paste-area'), 120);
  }

  function goToWorkOrder() {
    navigateToView('calendar-registration');
    setTimeout(() => scrollToElement('#work-order-form'), 120);
  }

  function goToFollowUp() {
    navigateToView('follow-up');
    setTimeout(() => scrollToElement('#follow-up-targets-list'), 120);
  }

  function goToProfit() {
    navigateToView('profit');
    setTimeout(() => scrollToElement('#profit-summary'), 120);
  }

  function goToAnalytics() {
    navigateToView('analytics');
    setTimeout(() => scrollToElement('#analytics-summary'), 120);
  }

  function goToDataBackup() {
    navigateToView('data');
    setTimeout(() => scrollToElement('#btn-export-data'), 120);
  }

  function addExecutiveSalesTask(leadId) {
    const lead = Storage.getLeads().find(l => l.id === leadId);
    if (!lead) return;
    const rev = getRevenueContext();
    const candidate = (rev.nextSalesCandidates || []).find(c => c.leadId === leadId);
    const today = TODAY();
    const title = candidate ? candidate.action : (lead.nextAction || '営業アクションを実行');
    const key = ['exec-sales', today, leadId, title].join('|');
    if (Storage.getDailyActionTasksData().manualTasks.some(t => t.pickupDedupeKey === key)) {
      alert('すでに毎日やることに追加済みです');
      return;
    }
    Storage.addManualDailyTask({
      title,
      targetName: lead.company,
      priority: '高',
      action: candidate ? candidate.action : (lead.nextAction || title),
      memo: candidate ? candidate.reason : '',
      dueDate: today,
      status: 'open',
      reason: candidate ? candidate.reason : '営業の次の一手から追加',
      leadId: lead.id,
      leadName: lead.company,
      pickupDedupeKey: key
    });
    renderExecutiveHome();
    renderDailyActionTasks();
    renderMorningDailyTasksBrief();
    alert('毎日やることに追加しました。');
  }

  let lastExecutiveContext = null;

  function completeExecutivePriorityTask(taskId) {
    const task = getDailyActionTasksWithState().find(t => t.id === taskId);
    if (!task) return;
    if (task.type === 'manual') {
      completeManualDailyTask(task.id, '');
    } else {
      updateDailyActionTaskState(taskId, 'done', '');
    }
    renderExecutiveHome();
    renderDailyActionTasks();
    renderMorningDailyTasksBrief();
  }

  function addExecutivePriorityTask(priorityId) {
    const item = (lastExecutiveContext && lastExecutiveContext.topPriorities || [])
      .find(p => p.id === priorityId);
    if (!item) return;
    const today = TODAY();
    const key = item.taskDedupeKey || item.dedupeKey;
    if (Storage.getDailyActionTasksData().manualTasks.some(t => t.pickupDedupeKey === key)) {
      alert('すでに毎日やることに追加済みです');
      return;
    }
    Storage.addManualDailyTask({
      id: 'manual_' + Storage.generateId(),
      title: item.title,
      targetName: item.source,
      priority: item.rank <= 2 ? '高' : '中',
      action: item.title,
      memo: item.reason,
      dueDate: today,
      status: 'open',
      reason: item.source + 'から追加',
      pickupDedupeKey: key,
      workOrderId: item.workOrderId || '',
      intakeId: item.intakeId || ''
    });
    renderExecutiveHome();
    renderDailyActionTasks();
    alert('毎日やることに追加しました。');
  }

  function navigateExecutivePriority(sourceKey) {
    const nav = {
      'work-order': goToWorkOrder,
      reception: goToReception,
      'follow-up': goToFollowUp,
      analytics: goToAnalytics,
      profit: goToProfit,
      pickup: goToDemandPickup,
      task: () => scrollToElement('.card-daily-action-tasks')
    };
    const fn = nav[sourceKey];
    if (fn) fn();
  }

  function markExecutivePriorityNotNeeded(key, meta) {
    if (!key) return;
    Storage.setActionCandidateState(key, 'not_needed', meta || {});
    renderExecutiveHome();
    renderMorningExecutiveSections();
    showAppToast('必要無しにしました');
  }

  function copyExecutiveFollowMessage(targetId, kind) {
    const target = findFollowUpTarget(targetId);
    if (!target) return;
    const profile = Storage.getBusinessProfile() || {};
    const text = kind === 'thanks'
      ? FollowUpBrain.generateThanksMessage(target, profile)
      : FollowUpBrain.generateReviewRequest(target, profile);
    copyText(text).then(() => alert('コピーしました')).catch(() => alert('コピーに失敗しました'));
  }

  function simplifyExecutiveReceptionActions(root) {
    if (!root) return;
    root.querySelectorAll('.exec-reception-item').forEach(item => {
      if (item.querySelector('.exec-reception-actions-v484')) return;
      const intakeId = item.dataset.intakeId;
      const intake = Storage.getReceptionIntakes().find(i => i.id === intakeId);
      if (!intake) return;
      const actions = item.querySelector('.exec-work-actions');
      if (!actions) return;
      const state = getReceptionWorkflowState(intake);
      actions.querySelectorAll('[data-exec-intake-lead], [data-exec-intake-wo], [data-exec-intake-task]').forEach(btn => {
        btn.classList.add('hidden');
      });
      actions.insertAdjacentHTML('afterbegin', `
        <span class="exec-reception-actions-v484">
          ${renderReceptionPrimaryAction(intake.id, state, { compact: true })}
          <button type="button" class="btn btn-sm btn-secondary" data-reception-open="${esc(intake.id)}">受付を開く</button>
        </span>`);
      item.insertAdjacentHTML('beforeend', renderReceptionStateLabels(state));
    });
  }

  function bindExecutiveHomeEvents() {
    const root = document.getElementById('executive-home');
    if (!root) return;

    bindDailyActionTaskEvents(root);
    bindMapActionEvents(root);
    bindSalesOutcomeLeadLinks(root);
    simplifyExecutiveReceptionActions(root);
    bindReceptionListEvents(root);

    root.querySelectorAll('[data-exec-priority-add-task]').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => addExecutivePriorityTask(btn.dataset.execPriorityAddTask));
    });
    root.querySelectorAll('[data-exec-priority-done]').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => completeExecutivePriorityTask(btn.dataset.execPriorityDone));
    });
    root.querySelectorAll('[data-exec-priority-nav]').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => navigateExecutivePriority(btn.dataset.execPriorityNav));
    });
    root.querySelectorAll('[data-exec-priority-not-needed]').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => markExecutivePriorityNotNeeded(btn.dataset.execPriorityNotNeeded, {
        title: btn.dataset.execPriorityTitle || '',
        source: btn.dataset.execPrioritySource || '',
        sourceKey: btn.dataset.execPrioritySourceKey || ''
      }));
    });
    root.querySelectorAll('[data-exec-wo-complete]').forEach(btn => {
      btn.addEventListener('click', () => completeWorkOrder(btn.dataset.execWoComplete));
    });
    root.querySelectorAll('[data-exec-wo-completion]').forEach(btn => {
      btn.addEventListener('click', () => openWorkCompletionModal(btn.dataset.execWoCompletion));
    });
    root.querySelectorAll('[data-exec-wo-revenue]').forEach(btn => {
      btn.addEventListener('click', () => openWorkCompletionModal(btn.dataset.execWoRevenue));
    });
    root.querySelectorAll('[data-exec-intake-lead]').forEach(btn => {
      btn.addEventListener('click', () => createLeadFromReceptionIntake(btn.dataset.execIntakeLead));
    });
    root.querySelectorAll('[data-exec-intake-wo]').forEach(btn => {
      btn.addEventListener('click', () => createWorkOrderFromIntake(btn.dataset.execIntakeWo));
    });
    root.querySelectorAll('[data-exec-intake-task]').forEach(btn => {
      btn.addEventListener('click', () => addTaskFromReceptionIntake(btn.dataset.execIntakeTask));
    });
    root.querySelectorAll('[data-exec-follow-thanks]').forEach(btn => {
      btn.addEventListener('click', () => copyExecutiveFollowMessage(btn.dataset.execFollowThanks, 'thanks'));
    });
    root.querySelectorAll('[data-exec-follow-review]').forEach(btn => {
      btn.addEventListener('click', () => copyExecutiveFollowMessage(btn.dataset.execFollowReview, 'review'));
    });
    root.querySelectorAll('[data-exec-follow-task]').forEach(btn => {
      btn.addEventListener('click', () => addFollowUpTask(btn.dataset.execFollowTask, 'thanks'));
    });

    const revLink = root.querySelector('.exec-home-revenue-link');
    if (revLink) revLink.addEventListener('click', () => navigateToView('revenue'));
    const receivablesLink = root.querySelector('.exec-home-receivables-link');
    if (receivablesLink) receivablesLink.addEventListener('click', () => navigateToView('receivables'));
    const profitLink = root.querySelector('.exec-home-profit-link');
    if (profitLink) profitLink.addEventListener('click', goToProfit);
    const followLink = root.querySelector('.exec-home-follow-link');
    if (followLink) followLink.addEventListener('click', goToFollowUp);
    root.querySelectorAll('.daily-go-calendar').forEach(btn => {
      btn.addEventListener('click', () => goToReception());
    });
    root.querySelectorAll('.upcoming-go-schedule-import').forEach(btn => {
      btn.addEventListener('click', () => navigateToView('calendar-candidate'));
    });
    const analyticsLink = root.querySelector('.exec-home-analytics-link');
    if (analyticsLink) analyticsLink.addEventListener('click', goToAnalytics);
    const pickupLink = root.querySelector('.exec-home-pickup-link');
    if (pickupLink) pickupLink.addEventListener('click', goToDemandPickup);
    const diagnosticLink = root.querySelector('.exec-home-diagnostic-link');
    if (diagnosticLink) diagnosticLink.addEventListener('click', () => handleExecutiveHomeQuickAction('diagnostic'));
    const backupLink = root.querySelector('.exec-home-backup-link');
    if (backupLink) backupLink.addEventListener('click', goToDataBackup);
    const browserPromptBtn = root.querySelector('#btn-exec-browser-prompt');
    if (browserPromptBtn) {
      browserPromptBtn.addEventListener('click', () => {
        copyText(AnalyticsBrain.buildBrowserBantouPrompt(Storage.getSettings()))
          .then(() => alert('アクセス確認用の文をコピーしました'))
          .catch(() => alert('コピーに失敗しました'));
      });
    }

    const saveCheckBtn = root.querySelector('#btn-exec-check-save');
    if (saveCheckBtn) {
      saveCheckBtn.addEventListener('click', () => {
        const memoEl = document.getElementById('exec-check-memo');
        const items = {};
        root.querySelectorAll('.exec-check-box').forEach(box => {
          items[box.dataset.checkItem] = box.checked;
        });
        saveTodayCheckState(memoEl ? memoEl.value.trim() : '', items);
        renderExecutiveHomeCheck();
        alert('確認状態を保存しました');
      });
    }
  }

  function renderExecutiveHomeCheck() {
    const el = document.getElementById('exec-home-check');
    if (!el) return;
    el.innerHTML = renderExecutiveHomeCheckHtml();
    bindExecutiveHomeEvents();
  }

  function renderExecutiveHomeStartGuide(isEmpty) {
    const el = document.getElementById('exec-home-start-guide');
    const collapse = document.getElementById('exec-home-start-collapse');
    if (!el) return;
    const status = Storage.getOnboardingStatus();
    const doneCount = ONBOARDING_STEPS.filter(s => status[s.key]).length;
    const showGuide = isEmpty || doneCount < 3;
    if (!showGuide) {
      el.innerHTML = '';
      if (collapse) collapse.classList.add('hidden');
      return;
    }
    if (collapse) collapse.classList.remove('hidden');
    const quickSteps = [
      { n: 1, text: 'デモデータを作成して全体の流れを確認', action: 'demo', btn: 'デモ作成' },
      { n: 2, text: '経営ホームで今日の結論と最優先3つを見る', action: 'home', btn: 'この画面を見る' },
      { n: 3, text: 'カレンダー登録から受付・日程・売上登録まで試す', action: 'reception', btn: 'カレンダー登録へ' }
    ];
    el.innerHTML = `
      <div class="exec-start-guide-inner">
        <ol class="exec-start-guide-steps">
          ${quickSteps.map(s => `<li><span class="exec-start-num">${s.n}</span><span>${esc(s.text)}</span>
            <button type="button" class="btn btn-sm btn-secondary" data-exec-start="${esc(s.action)}">${esc(s.btn)}</button></li>`).join('')}
        </ol>
        <details class="exec-start-guide-more">
          <summary>詳しい使い方を見る</summary>
          <ol class="exec-start-guide-full" start="4">
            <li>日程を入れてカレンダー登録 → 作業後に売上登録</li>
            <li>フォロー・口コミ依頼を確認</li>
            <li>アクセス分析で改善点を見る</li>
          </ol>
        </details>
      </div>`;
    el.querySelectorAll('[data-exec-start]').forEach(btn => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.execStart;
        if (a === 'demo') scrollToElement('#demo-data-panel');
        else if (a === 'home') scrollToElement('#executive-home');
        else if (a === 'reception') goToReception();
      });
    });
  }

  function updateExecutiveSectionBadges(ctx) {
    const followBadge = document.getElementById('exec-follow-badge');
    const analyticsBadge = document.getElementById('exec-analytics-badge');
    const follow = ctx.followUpSection || {};
    const followCount = (follow.thanksCount || 0) + (follow.reviewCount || 0);
    if (followBadge) {
      followBadge.textContent = followCount ? ` ${followCount}件` : '';
      followBadge.classList.toggle('exec-section-badge-active', followCount > 0);
    }
    const analyticsLines = (ctx.analyticsDemandSection && ctx.analyticsDemandSection.lines || []).length
      + (ctx.analyticsDemandSection && ctx.analyticsDemandSection.demandLines || []).length;
    if (analyticsBadge) {
      analyticsBadge.textContent = analyticsLines ? ' あり' : '';
      analyticsBadge.classList.toggle('exec-section-badge-active', analyticsLines > 0);
    }
  }

  function renderExecutiveHome() {
    const ctx = buildExecutiveContext();
    lastExecutiveContext = ctx;
    const summary = ctx.summary;
    const emptyEl = document.getElementById('exec-home-empty-guide');
    if (emptyEl) {
      if (summary.isEmpty) {
        emptyEl.classList.remove('hidden');
        emptyEl.innerHTML = `<p>${esc((summary.lines || [])[0] || '')}</p>`;
      } else {
        emptyEl.classList.add('hidden');
        emptyEl.innerHTML = '';
      }
    }

    renderExecutiveHomeStartGuide(summary.isEmpty);
    renderExecutiveHomeQuickActions();
    updateExecutiveSectionBadges(ctx);

    renderExecutivePriorityAction();
    renderExecutiveNextAction();

    const conclusionEl = document.getElementById('exec-home-conclusion');
    if (conclusionEl) {
      conclusionEl.innerHTML = (summary.lines || [])
        .map(line => `<p>${esc(line)}</p>`)
        .join('');
    }

    const prioritiesEl = document.getElementById('exec-home-top-priorities');
    if (prioritiesEl) {
      const priorities = ctx.topPriorities || [];
      prioritiesEl.innerHTML = priorities.length
        ? priorities.map((p, i) => renderExecutiveTopPriorityCard(p, i)).join('')
        : '<p class="placeholder-text">今日の最優先はまだありません。予定取り込み・改善リスト・経営ホームから追加できます。</p>';
    }

    const upcomingMainEl = document.getElementById('exec-home-upcoming-schedule-main');
    if (upcomingMainEl) {
      upcomingMainEl.innerHTML = renderUpcomingRevenueScheduleHtml({ compact: true, limit: 5, emptyText: EMPTY_SCHEDULE_COPY });
    }

    renderRevenueConfirmationQueueBlock('exec-home-revenue-queue-list', { limit: 3 });

    const workEl = document.getElementById('exec-home-work-orders');
    if (workEl) workEl.innerHTML = renderExecutiveWorkOrdersHtml(ctx.workSection);

    const receptionEl = document.getElementById('exec-home-reception');
    if (receptionEl) receptionEl.innerHTML = renderExecutiveReceptionHtml(ctx.receptionSection);

    const revenueEl = document.getElementById('exec-home-revenue-profit');
    if (revenueEl) revenueEl.innerHTML = renderExecutiveRevenueProfitHtml(ctx.revenueProfitSection, { compact: true });

    const followEl = document.getElementById('exec-home-follow-up');
    if (followEl) followEl.innerHTML = renderExecutiveFollowUpHtml(ctx.followUpSection);

    const analyticsEl = document.getElementById('exec-home-analytics-demand');
    if (analyticsEl) analyticsEl.innerHTML = renderExecutiveAnalyticsDemandHtml(ctx.analyticsDemandSection);

    const warningsEl = document.getElementById('exec-home-warnings');
    if (warningsEl) warningsEl.innerHTML = renderExecutiveWarningsHtml(ctx.warnings);

    renderOperationsStartCheck();
    renderMonthlyClosingCheck('exec-home-monthly-closing-check', { compact: true, suppressAction: true });
    renderDataConsistencyCheck('exec-home-data-consistency-check', { compact: true });

    const profitCtx = getProfitContext();
    renderProfitOperationsDiagnostics(profitCtx, { targetId: 'exec-home-profit-diagnostics', compact: true });
    renderProfitExpenseBreakdown(profitCtx, { targetId: 'exec-home-expense-breakdown' });

    renderExecutiveHomeCheck();
    bindExecutiveHomeEvents();
    bindExecutiveMarketingLinks();
    const dailyBtn = document.getElementById('btn-exec-go-daily-tasks');
    if (dailyBtn && !dailyBtn.dataset.bound) {
      dailyBtn.dataset.bound = '1';
      dailyBtn.addEventListener('click', () => scrollToElement('.card-daily-action-tasks'));
    }
  }

  function bindExecutiveMarketingLinks() {
    const root = document.getElementById('exec-home-marketing-links');
    if (!root) return;
    root.querySelectorAll('[data-exec-quick]').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => handleExecutiveHomeQuickAction(btn.dataset.execQuick));
    });
  }

  function renderMorningExecutiveSections() {
    const ctx = buildExecutiveContext();
    lastExecutiveContext = ctx;

    const conclusionEl = document.getElementById('mgmt-exec-conclusion');
    if (conclusionEl) {
      conclusionEl.innerHTML = (ctx.summary.lines || []).map(line => `<p>${esc(line)}</p>`).join('');
    }

    const tasksEl = document.getElementById('mgmt-tasks');
    if (tasksEl) {
      const priorities = ctx.topPriorities || [];
      tasksEl.innerHTML = priorities.length
        ? priorities.map((p, i) => `<li><span class="top3-num">${i + 1}</span> <strong>${esc(p.title)}</strong> — ${esc(p.reason)}</li>`).join('')
        : '<li class="placeholder-text">今日の最優先はまだありません</li>';
    }

    const workOrderMorningEl = document.getElementById('mgmt-work-orders');
    if (workOrderMorningEl) {
      const items = ctx.workSection.items || [];
      workOrderMorningEl.innerHTML = items.length
        ? `<ul class="mgmt-work-orders-list">${items.map(wo =>
          `<li>${esc(wo.startTime || '—')} ${esc(wo.customerName)} ${esc(wo.serviceText)}（${esc(wo.area)}）</li>`
        ).join('')}</ul>`
        : '<p class="placeholder-text">今日の作業予定はありません</p>';
    }

    const receptionMorningEl = document.getElementById('mgmt-reception-intake');
    if (receptionMorningEl) {
      const items = ctx.receptionSection.items || [];
      receptionMorningEl.innerHTML = items.length
        ? `<ul class="mgmt-reception-list">${items.slice(0, 5).map(i =>
          `<li>${esc(i.customerName)}：${esc(i.serviceText || '—')}（${esc(i.nextAction)}）</li>`
        ).join('')}</ul>`
        : '<p class="placeholder-text">未対応の受付はありません</p>';
    }

    const profitMorningEl = document.getElementById('mgmt-profit');
    if (profitMorningEl) {
      const rp = ctx.revenueProfitSection || {};
      const monthlyNote = rp.usesMonthlyResult && rp.aggregationSourceNote
        ? `<p class="profit-monthly-source-note">${esc(rp.aggregationSourceNote)}</p>`
        : '';
      profitMorningEl.innerHTML = `
        ${monthlyNote}
        <p class="mgmt-profit-label">売上・利益：</p>
        <ul class="mgmt-profit-list">
          <li>今月売上 ${esc(RevenueBrain.formatYen(rp.monthRevenue))} / 目標 ${esc(RevenueBrain.formatYen(rp.monthlyTarget))}（${rp.achievementRate}%）</li>
          <li>支出 ${esc(ProfitBrain.formatYen(rp.monthExpense))} / 粗利 ${esc(ProfitBrain.formatYen(rp.grossProfit))}（${esc(ProfitBrain.formatRate(rp.grossRate))}）</li>
          ${rp.completedNoRevenue ? `<li>作業完了・売上未登録 ${rp.completedNoRevenue}件</li>` : ''}
        </ul>`;
    }

    const revenueMorningEl = document.getElementById('mgmt-revenue');
    if (revenueMorningEl) {
      const rev = getRevenueContext();
      const overlay = rev.monthlyOverlay;
      const monthlyNote = overlay && overlay.usesMonthlyResult
        ? ' <span class="revenue-monthly-badge">月次実績ベース</span>'
        : '';
      revenueMorningEl.innerHTML = `<p>今月売上：${esc(RevenueBrain.formatYen(rev.summary.planned))}${monthlyNote} / 達成率 ${rev.summary.achievementRate}%</p>`;
    }

    const followUpMorningEl = document.getElementById('mgmt-follow-up');
    if (followUpMorningEl) {
      const fu = ctx.followUpSection || {};
      const lines = FollowUpBrain.buildMorningLines(ctx.followTargets);
      followUpMorningEl.innerHTML = lines.length
        ? `<ul class="mgmt-follow-up-list">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
        : '<p class="placeholder-text">フォロー対応はありません</p>';
    }

    const analyticsMorningEl = document.getElementById('mgmt-analytics');
    if (analyticsMorningEl) {
      const ad = ctx.analyticsDemandSection || {};
      const lines = ad.lines || [];
      analyticsMorningEl.innerHTML = lines.length
        ? `<p class="mgmt-analytics-label">アナリティクス：</p><ul class="mgmt-analytics-list">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
        : '<p class="placeholder-text">アナリティクス判断はまだありません</p>';
    }

    const calendarMorningEl = document.getElementById('mgmt-calendar-candidates');
    if (calendarMorningEl) {
      calendarMorningEl.innerHTML = '';
    }

    const completionMorningEl = document.getElementById('mgmt-work-completion');
    if (completionMorningEl && typeof WorkCompletionBrain !== 'undefined') {
      const completionLines = WorkCompletionBrain.buildMorningReport(
        WorkCompletionBrain.summarizeTargets(Storage.getWorkOrders(), Storage.getRevenueRecords(), TODAY())
      );
      completionMorningEl.innerHTML = completionLines.length
        ? `<ul class="mgmt-work-completion-list">${completionLines.slice(1).map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
        : '<p class="placeholder-text">売上確定待ちはありません</p>';
    }

    const demandTopEl = document.getElementById('mgmt-demand-top');
    if (demandTopEl) {
      const demandLines = (ctx.analyticsDemandSection.demandLines || [])
        .concat(DemandBrain.buildMorningDemandLines(ctx.pickups, ctx.today).slice(0, 2));
      demandTopEl.innerHTML = demandLines.length
        ? `<p class="mgmt-demand-label">需要：</p><ul class="mgmt-demand-list">${[...new Set(demandLines)].map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
        : '';
    }

    const warningsEl = document.getElementById('mgmt-exec-warnings');
    if (warningsEl) {
      warningsEl.innerHTML = (ctx.warnings || []).length
        ? ctx.warnings.map(w => `<li class="caution-item">[${esc(w.level)}] ${esc(w.text)}</li>`).join('')
        : '<li class="placeholder-text">注意・保留はありません</li>';
    }
  }

  function getRevenueSummaryExtra() {
    return {
      workOrders: Storage.getWorkOrders(),
      intakes: Storage.getReceptionIntakes(),
      monthlyResults: Storage.getMonthlyResults()
    };
  }

  function applyMonthlyResultToRevenueSummary(summary, monthKey, monthlyResults) {
    const base = summary && typeof summary === 'object' ? { ...summary } : {};
    if (typeof MonthlyResultsBrain === 'undefined') {
      return { summary: base, monthlyOverlay: null };
    }
    const monthly = MonthlyResultsBrain.findForMonth(monthlyResults, monthKey);
    if (!monthly) return { summary: base, monthlyOverlay: null };
    const detail = MonthlyResultsBrain.sumDetailRevenueForMonth(Storage.getRevenueRecords(), monthKey);
    const monthRevenue = monthly.sales;
    const monthlyTarget = Number(base.monthlyTarget) || 0;
    const achievementRate = monthlyTarget > 0
      ? Math.round((monthRevenue / monthlyTarget) * 100)
      : base.achievementRate;
    const status = MonthlyResultsBrain.classifyReconciliationStatus(
      monthly.sales,
      detail.total,
      true,
      detail.count > 0 || detail.total > 0
    );
    return {
      summary: {
        ...base,
        planned: monthRevenue,
        confirmed: monthRevenue,
        completed: monthRevenue,
        achievementRate,
        remainingToTarget: Math.max(0, monthlyTarget - monthRevenue)
      },
      monthlyOverlay: {
        usesMonthlyResult: true,
        aggregationSourceNote: MonthlyResultsBrain.AGGREGATION_SOURCE_NOTE,
        monthlySales: monthly.sales,
        detailTotal: detail.total,
        detailCount: detail.count,
        diff: monthly.sales - detail.total,
        status
      }
    };
  }

  function renderMonthlyReconciliationHtml(rows, options) {
    const list = Array.isArray(rows) ? rows : [];
    const opts = options || {};
    if (!list.length) {
      return '<p class="placeholder-text">整合チェック対象の月がありません。</p>';
    }
    const statusClass = status => {
      if (status === '一致') return 'reconciliation-status-ok';
      if (status === '差額あり') return 'reconciliation-status-warn';
      return '';
    };
    const note = opts.note
      ? `<p class="reconciliation-note">${esc(opts.note)}</p>`
      : '';
    return `${note}
      <table class="reconciliation-table revenue-agg-table">
        <thead><tr>
          <th>月</th><th class="num">月次実績</th><th class="num">明細合計</th><th class="num">差額</th><th>状態</th>
        </tr></thead>
        <tbody>${list.map(row => `<tr>
          <td>${esc(row.month)}</td>
          <td class="num">${row.monthlySales != null ? esc(MonthlyResultsBrain.formatYen(row.monthlySales)) : '—'}</td>
          <td class="num">${esc(RevenueSummaryBrain.formatYen(row.detailTotal || 0))}</td>
          <td class="num">${row.monthlySales != null ? esc(RevenueSummaryBrain.formatYen(row.diff || 0)) : '—'}</td>
          <td><span class="reconciliation-status ${statusClass(row.status)}">${esc(row.status)}</span></td>
        </tr>`).join('')}</tbody>
      </table>`;
  }

  function renderMonthlyReconciliationActionCard(monthKey, monthlyOverlay) {
    if (!monthlyOverlay || !monthlyOverlay.usesMonthlyResult) return '';
    const diff = Number(monthlyOverlay.diff) || 0;
    const key = monthKey || '';
    if (monthlyOverlay.status !== '差額あり') {
      return `
        <div class="reconciliation-brief reconciliation-brief-ok">
          <p class="reconciliation-brief-line">月次実績と売上明細は一致しています。</p>
        </div>`;
    }
    if (diff > 0) {
      const amountLabel = RevenueBrain.formatYen(diff);
      return `
        <div class="reconciliation-action-card" data-month-key="${esc(key)}">
          <p class="reconciliation-action-title"><strong>差額あり：${esc(amountLabel)}</strong></p>
          <p class="reconciliation-action-lead">月次実績を正として、差額分を売上明細に追加できます。</p>
          <div class="reconciliation-action-buttons">
            <button type="button" class="btn btn-sm btn-primary btn-monthly-reconciliation-add">＋${esc(amountLabel)}を売上明細に追加</button>
            <button type="button" class="btn btn-sm btn-secondary btn-monthly-reconciliation-edit">月次実績を編集</button>
            <button type="button" class="btn btn-sm btn-secondary btn-monthly-reconciliation-detail">詳細を見る</button>
          </div>
        </div>`;
    }
    const excess = Math.abs(diff);
    return `
      <div class="reconciliation-action-card reconciliation-action-card-negative" data-month-key="${esc(key)}">
        <p class="reconciliation-action-title">売上明細の方が ${esc(RevenueBrain.formatYen(excess))} 多いです。</p>
        <div class="reconciliation-action-buttons">
          <button type="button" class="btn btn-sm btn-secondary btn-monthly-reconciliation-edit">月次実績を編集</button>
          <button type="button" class="btn btn-sm btn-secondary btn-monthly-reconciliation-detail">詳細を見る</button>
        </div>
      </div>`;
  }

  function bindMonthlyReconciliationActionCard(root) {
    if (!root) return;
    root.querySelector('.btn-monthly-reconciliation-add')?.addEventListener('click', () => {
      const monthKey = root.dataset.monthKey || RevenueBrain.currentMonthKey(TODAY());
      applyMonthlyReconciliationAdjustment(monthKey);
    });
    root.querySelector('.btn-monthly-reconciliation-edit')?.addEventListener('click', () => {
      navigateToView('monthly-results', '#monthly-results-form-card');
    });
    root.querySelector('.btn-monthly-reconciliation-detail')?.addEventListener('click', () => {
      navigateToView('revenue-analysis', '#revenue-reconciliation-check');
    });
  }

  function applyMonthlyReconciliationAdjustment(monthKey) {
    if (typeof MonthlyResultsBrain === 'undefined') return;
    const key = MonthlyResultsBrain.normalizeMonth(monthKey);
    const monthlyResults = Storage.getMonthlyResults();
    const revenues = Storage.getRevenueRecords();
    const row = MonthlyResultsBrain.buildReconciliationRow(key, monthlyResults, revenues);
    if (row.status !== '差額あり' || Number(row.diff) <= 0) {
      alert('追加できる差額がありません。');
      return;
    }
    const amountLabel = RevenueBrain.formatYen(row.diff);
    if (!window.confirm(`月次実績との差額 ${amountLabel} を売上明細に1件追加します。よろしいですか？`)) return;
    const payload = MonthlyResultsBrain.buildMonthlyAdjustmentPayload(key, row.diff);
    if (!payload) {
      alert('差額の追加に失敗しました。');
      return;
    }
    Storage.addRevenueRecord(payload);
    navigateAfterAction('monthly-adjustment-save', '差額分を売上明細に追加しました。');
  }

  function renderCurrentMonthReconciliationBrief(monthKey, monthlyOverlay) {
    return renderMonthlyReconciliationActionCard(monthKey, monthlyOverlay);
  }

  function getRevenueContext() {
    const today = TODAY();
    const records = RevenueBrain.normalizeRevenueRecords(Storage.getRevenueRecords());
    const settings = Storage.getRevenueSettings();
    const leads = Storage.getLeads();
    const monthKey = RevenueBrain.currentMonthKey(today);
    const monthlyResults = Storage.getMonthlyResults();
    const baseSummary = RevenueBrain.summarize(records, settings, monthKey);
    const { summary, monthlyOverlay } = applyMonthlyResultToRevenueSummary(baseSummary, monthKey, monthlyResults);
    const comment = RevenueBrain.buildBantouComment(summary);
    const salesOutcome = RevenueBrain.getLinkedRevenueSummary(records, leads, monthKey);
    const nextSalesCandidates = RevenueBrain.getNextSalesCandidates(records, leads, today);
    const salesHoldCandidates = RevenueBrain.getSalesHoldCandidates(records, leads, today);
    const managementComment = RevenueBrain.buildManagementComment({
      summary, salesOutcome, nextSalesCandidates, salesHoldCandidates
    });
    const revenueSummary = typeof RevenueSummaryBrain !== 'undefined'
      ? RevenueSummaryBrain.buildFullSummary(records, getRevenueAggregationFilter(), today, getRevenueSummaryExtra())
      : null;
    return {
      today, records, settings, leads, monthKey, summary, comment, salesOutcome,
      nextSalesCandidates, salesHoldCandidates, managementComment, revenueSummary,
      monthlyOverlay, monthlyResults
    };
  }

  function getRevenueAggregationFilter() {
    const filter = { ...revenueAggregationFilter };
    if (!filter.year && !filter.month && !filter.source && !filter.service) {
      filter.year = TODAY().slice(0, 4);
    }
    return filter;
  }

  function resetRevenueAggregationFilter() {
    revenueAggregationFilter = { year: TODAY().slice(0, 4), month: '', source: '', service: '' };
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
      listEl.innerHTML = '<p class="placeholder-text">活動履歴はまだありません。活動を追加するか、毎日やることのタスクを完了するとここに残ります。</p>';
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
    const hold = RevenueBrain.getLeadSalesHold(leadId, records, leads);
    const priority = normalized.priority || enriched.priorityLabel || '—';
    const lastContact = normalized.lastContactAt || normalized.lastContact || '—';
    const nextContact = normalized.nextActionDate || normalized.nextContact || '—';
    const statusLine = hold
      ? `<p class="lead-status-line lead-status-hold"><span class="label-muted">状態</span> 営業保留</p>
         <p class="lead-status-line lead-status-hold-reason"><span class="label-muted">理由</span> ${esc(hold.reason)}</p>`
      : `<p class="lead-status-line"><span class="label-muted">状態</span> 通常営業OK</p>`;
    el.innerHTML = `
      <h3 class="lead-status-company">${esc(lead.company)}</h3>
      <p class="lead-status-line lead-status-main">${esc(normalized.salesStatus || '—')} / 優先度${esc(priority)}</p>
      <p class="lead-status-line"><span class="label-muted">最終連絡</span> ${esc(lastContact)}</p>
      <p class="lead-status-line"><span class="label-muted">次回連絡</span> ${esc(nextContact)}</p>
      ${statusLine}`;
  }

  function renderLeadRevenueCompact(leadId) {
    const el = document.getElementById('lead-revenue-compact');
    if (!el) return;
    el.innerHTML = '';
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
      <p class="lead-daily-tasks-title">毎日やることあり</p>
      <ul class="lead-daily-tasks-list">
        ${active.map(t => `<li>${esc(t.title || t.action || 'タスク')}</li>`).join('')}
      </ul>`;
  }

  function renderLeadDetailSubpanels(leadId) {
    const lead = Storage.getLeads().find(l => l.id === leadId);
    if (!lead) return;
    renderLeadStatusSummary(leadId);
    renderLeadFollowUpSummary(leadId);
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
      ${isUrgent ? '<p class="sales-next-action-alert">次回連絡日が今日以前です。毎日やることに反映されます。</p>' : ''}`;
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
    renderExecutiveHome();
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
    renderExecutiveHome();
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
    renderExecutiveHome();
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
    renderExecutiveHome();
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
    renderExecutiveHome();
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

  function getDailyTaskOriginLabel(task) {
    if (!task) return '手動';
    const reason = String(task.reason || '');
    const target = String(task.targetName || '');
    const key = String(task.pickupDedupeKey || '');
    if (/外部確認|外部チェック|external-check|サイト確認/i.test(reason + target + key)) return 'サイト確認記録';
    if (/アナリティクス|アクセス分析|外部確認\/アナリティクス|ブラウザー番頭/i.test(reason + target)) return 'アクセス分析';
    if (/経営レポート|経営メモ|経営ホーム|次の一手/i.test(reason + target)) return '経営ホーム';
    if (task.intakeId) return '受付';
    if (task.workOrderId || key.startsWith('work-order|')) return 'カレンダー登録';
    if (task.leadId) return '営業先';
    if (task.pickupDedupeKey) return '施策メモ';
    if (task.type === 'manual') return '手動';
    return '売上';
  }

  function getDailyTaskSourceLabel(task) {
    return getDailyTaskOriginLabel(task);
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
    const originLabel = getDailyTaskOriginLabel(task);
    const reasonLine = (task.reason || task.action || '').slice(0, 80);
    const openBtn = task.type !== 'manual' && task.openTarget
      ? `<button type="button" class="btn btn-sm btn-secondary" data-daily-task-open="${esc(task.id)}">開く</button>` : '';
    const actionsHtml = showActions ? `
      <div class="daily-task-actions">
        <button type="button" class="btn btn-sm btn-primary" data-daily-task-done="${esc(task.id)}">完了</button>
        <button type="button" class="btn btn-sm btn-secondary" data-daily-task-tomorrow="${esc(task.id)}">明日</button>
        ${openBtn}
        <button type="button" class="btn btn-sm btn-secondary" data-daily-task-edit="${esc(task.id)}">編集</button>
      </div>` : '';
    const memoHtml = opts.compact
      ? (task.memo ? `<p class="daily-task-memo-text">${esc(task.memo)}</p>` : '')
      : (!isDone && !isSnoozedAway
        ? `<input type="text" class="daily-task-memo" data-daily-task-memo="${esc(task.id)}" value="${esc(task.memo)}" placeholder="メモ（任意）">`
        : (task.memo ? `<p class="daily-task-memo-text">${esc(task.memo)}</p>` : ''));
    const doneMeta = isDone && opts.showCompletedAt
      ? `<p class="daily-task-done-time">完了：${esc(formatTaskCompletedAt(task.completedAt))}</p>` : '';
    return `
      <div class="daily-task-card daily-task-v2 daily-task-${priorityClass}${isDone ? ' daily-task-done' : ''}${isSnoozed || isSnoozedAway ? ' daily-task-snoozed' : ''}" data-task-id="${esc(task.id)}">
        <div class="daily-task-header">
          <strong class="daily-task-title">${esc(task.title)}</strong>
          <span class="exec-source-badge daily-task-source-badge">出どころ：${esc(originLabel)}</span>
          ${statusLabel ? `<span class="daily-task-status">${esc(statusLabel)}</span>` : ''}
        </div>
        ${reasonLine ? `<p class="daily-task-reason">${esc(reasonLine)}</p>` : ''}
        ${task.targetName ? `<p class="daily-task-target">対象：${esc(task.targetName)}</p>` : ''}
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

  function formatUpcomingDayLabel(scheduledDate, today) {
    if (!scheduledDate) return '—';
    if (scheduledDate === today) return '今日';
    if (scheduledDate === addDaysToDate(today, 1)) return '明日';
    const d = new Date(scheduledDate + 'T12:00:00');
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function getUpcomingRevenueScheduleSummary() {
    if (typeof RevenueSummaryBrain === 'undefined') {
      return { monthCount: 0, monthTotal: 0, upcoming: [], upcomingCount: 0, label: '売上予定（未確定）', scopeNote: '', hint: '' };
    }
    return RevenueSummaryBrain.buildUpcomingRevenueScheduleSummary(Storage.getWorkOrders(), TODAY());
  }

  function renderUpcomingRevenueScheduleHtml(options) {
    const opts = options || {};
    const summary = opts.summary || getUpcomingRevenueScheduleSummary();
    const limit = opts.limit || 3;
    const upcoming = (summary.upcoming || []).slice(0, limit);
    const monthAmount = RevenueBrain.formatYen(summary.monthTotal || 0);
    if (!summary.monthCount && !upcoming.length) {
      return `<p class="placeholder-text upcoming-revenue-schedule-empty">${esc(opts.emptyText || '今日以降の売上予定はありません。予定取り込みから読み込めます。')}</p>`;
    }
    const head = `<p class="upcoming-revenue-schedule-head">今月の売上予定：<strong>${summary.monthCount || 0}件 / ${esc(monthAmount)}</strong></p>`;
    const note = `<p class="upcoming-revenue-schedule-note">${esc(summary.label || '売上予定（未確定）')}：${esc(monthAmount)}</p>`;
    const scope = summary.scopeNote
      ? `<p class="upcoming-revenue-schedule-scope">${esc(summary.scopeNote)}</p>`
      : '';
    const hint = summary.hint
      ? `<p class="upcoming-revenue-schedule-hint">${esc(summary.hint)}</p>`
      : '';
    const flow = opts.showFlowNote && summary.flowNote
      ? `<p class="upcoming-revenue-schedule-flow">${esc(summary.flowNote)}</p>`
      : '';
    const list = upcoming.length
      ? `<ul class="upcoming-revenue-schedule-list">${upcoming.map(item => `
          <li class="upcoming-revenue-schedule-item">
            <span class="upcoming-revenue-schedule-date">${esc(item.dateLabel || '—')}</span>
            <span class="upcoming-revenue-schedule-name">${esc(item.customerName || '—')}</span>
            <span class="upcoming-revenue-schedule-service">${esc((item.serviceText || '').slice(0, 24))}</span>
            <span class="upcoming-revenue-schedule-amount">${esc(WorkOrderBrain.formatYen(item.amount))}</span>
            <span class="upcoming-revenue-schedule-status">${esc(item.statusLabel || '予定')}</span>
          </li>`).join('')}</ul>`
      : '';
    const nearest = upcoming[0]
      ? `<p class="upcoming-revenue-schedule-nearest">直近予定：${esc(upcoming[0].dateLabel)} ${esc((upcoming[0].serviceText || '').slice(0, 20))} ${esc(WorkOrderBrain.formatYen(upcoming[0].amount))}</p>`
      : '';
    const more = summary.upcomingCount > limit
      ? `<p class="upcoming-revenue-schedule-more">ほか${summary.upcomingCount - limit}件</p>`
      : '';
    const actions = opts.showScheduleImportBtn
      ? `<button type="button" class="btn btn-sm btn-secondary upcoming-go-schedule-import">予定取り込みを見る</button>`
      : (opts.compact
        ? `<button type="button" class="btn btn-sm btn-secondary daily-go-calendar">受付・予定確認を見る</button>`
        : '');
    return `${head}${note}${scope}${hint}${flow}${nearest}${list}${more}${actions}`;
  }

  function renderDailyUpcomingScheduleHtml(options) {
    return renderUpcomingRevenueScheduleHtml({
      ...(options || {}),
      showScheduleImportBtn: !(options && options.compact),
      showFlowNote: !(options && options.compact)
    });
  }

  function getRevenueConfirmationWorkOrderIds(today) {
    const ids = new Set();
    if (typeof WorkCompletionBrain === 'undefined') return ids;
    (Storage.getWorkOrders() || []).forEach(raw => {
      const wo = typeof WorkOrderBrain !== 'undefined'
        ? WorkOrderBrain.normalizeWorkOrder(raw)
        : raw;
      if (WorkCompletionBrain.needsCompletionConfirm(wo, today)) ids.add(wo.id);
    });
    return ids;
  }

  function isDailyTaskLinkedToRevenueQueueWorkOrder(task, revenueConfirmWoIds) {
    if (!task || !revenueConfirmWoIds || !revenueConfirmWoIds.size) return false;
    if (task.workOrderId && revenueConfirmWoIds.has(task.workOrderId)) return true;
    const key = String(task.pickupDedupeKey || '');
    if (key.startsWith('work-order|')) {
      const parts = key.split('|');
      if (parts[2] && revenueConfirmWoIds.has(parts[2])) return true;
    }
    return false;
  }

  function collectDailyPriorityItems() {
    const today = TODAY();
    const items = [];
    const seen = new Set();
    const revenueConfirmWoIds = getRevenueConfirmationWorkOrderIds(today);
    const push = (title, reason, kind, meta) => {
      const key = [kind, title, reason].join('|');
      if (!title || seen.has(key)) return;
      seen.add(key);
      items.push({ title, reason, kind, ...(meta || {}) });
    };

    const ctx = buildExecutiveContext();
    (ctx.topPriorities || []).slice(0, 3).forEach(p => {
      if (p.workOrderId && revenueConfirmWoIds.has(p.workOrderId)) return;
      if (p.sourceKey === 'profit') return;
      push(p.title, p.reason, 'priority', { priorityId: p.id, taskId: p.taskId });
    });

    if (typeof ActionBrain !== 'undefined') {
      Storage.getActionCandidates()
        .map(c => ActionBrain.normalizeCandidate(c))
        .filter(c => c.status === ActionBrain.STATUS_TODO)
        .slice(0, 2)
        .forEach(c => push(c.title, '改善リスト', 'improvement', { candidateId: c.id }));
    }

    const urgentTasks = sortDailyTasksForDisplay(
      getDailyActionTasksWithState().filter(t =>
        t.status !== 'done' && !isDailyTaskSnoozedAway(t, today) && t.priority === '高'
      )
    ).slice(0, 2);
    urgentTasks.forEach(t => {
      if (isDailyTaskLinkedToRevenueQueueWorkOrder(t, revenueConfirmWoIds)) return;
      push(t.title, t.reason || t.targetName || '緊急確認', 'task', { taskId: t.id });
    });

    return items;
  }

  function collectRevenueConfirmationQueue() {
    const today = TODAY();
    const workOrders = Storage.getWorkOrders();
    const revenues = Storage.getRevenueRecords();
    const workOrderItems = [];

    (workOrders || []).forEach(raw => {
      const wo = typeof WorkOrderBrain !== 'undefined'
        ? WorkOrderBrain.normalizeWorkOrder(raw)
        : raw;
      if (typeof WorkCompletionBrain === 'undefined' || !WorkCompletionBrain.isOperationalWorkOrder(wo)) return;
      if (wo.status === 'cancelled' || wo.status === 'archived') return;
      if (wo.actualRevenueId) return;
      if (wo.scheduledDate && wo.scheduledDate > today) return;

      const isCompleted = wo.status === 'completed';
      const isPastScheduled = WorkCompletionBrain.isPastScheduledActive(wo, today);
      if (!isCompleted && !isPastScheduled && !(wo.completion && wo.completion.needsReview)) return;

      let statusLabel = '売上未確定';
      if (isCompleted) statusLabel = '売上未確定';
      else if (isPastScheduled || (wo.completion && wo.completion.needsReview)) statusLabel = '売上確定待ち';

      workOrderItems.push({
        type: 'work-order',
        id: wo.id,
        scheduledDate: wo.scheduledDate || '',
        startTime: wo.startTime || '',
        endTime: wo.endTime || '',
        createdAt: wo.createdAt || '',
        customerName: wo.customerName || 'お客様',
        serviceText: wo.serviceText || '',
        amount: wo.estimateAmount,
        statusLabel
      });
    });

    const workOrderIds = new Set(workOrderItems.map(item => item.id));
    const pastRecoveryItems = [];

    if (PAST_RECOVERY_UI_ENABLED && typeof CalendarCandidateBrain !== 'undefined') {
      const options = { today };
      (workOrders || []).forEach(raw => {
        const wo = typeof WorkOrderBrain !== 'undefined'
          ? WorkOrderBrain.normalizeWorkOrder(raw)
          : raw;
        if (workOrderIds.has(wo.id)) return;
        if (!CalendarCandidateBrain.isCalendarCandidateWorkOrder(wo)) return;
        if ((wo.candidateMeta && wo.candidateMeta.importSource) !== CalendarCandidateBrain.IMPORT_SOURCE) return;
        if (CalendarCandidateBrain.getCandidateStatus(wo) === CalendarCandidateBrain.PAST_RECOVERY_CONVERTED) return;
        if (wo.actualRevenueId) return;
        if (wo.scheduledDate && wo.scheduledDate > today) return;

        const classification = CalendarCandidateBrain.classifyPastRecoveryCandidate(wo, revenues, options);
        if (classification.status !== CalendarCandidateBrain.PAST_RECOVERY_REVENUE_CANDIDATE) return;

        pastRecoveryItems.push({
          type: 'past-recovery',
          id: wo.id,
          scheduledDate: wo.scheduledDate || '',
          startTime: wo.startTime || '',
          endTime: wo.endTime || '',
          createdAt: wo.createdAt || '',
          customerName: wo.customerName || 'お客様',
          serviceText: wo.serviceText || '',
          amount: wo.estimateAmount,
          statusLabel: '過去売上復元'
        });
      });
    }

    const allItems = WorkOrderBrain.sortByScheduledDateTimeAsc([...workOrderItems, ...pastRecoveryItems]);
    return {
      visible: allItems.slice(0, 3),
      hiddenCount: Math.max(0, allItems.length - 3),
      totalCount: allItems.length,
      workOrderCount: workOrderItems.length,
      pastRecoveryCount: pastRecoveryItems.length
    };
  }

  function formatRevenueQueueDate(dateStr) {
    if (!dateStr) return '—';
    const parts = String(dateStr).split('-');
    if (parts.length === 3) return `${Number(parts[1])}/${Number(parts[2])}`;
    return dateStr;
  }

  function renderRevenueConfirmationQueueCard(item, options) {
    const opts = options || {};
    const amountLabel = item.amount ? WorkOrderBrain.formatYen(item.amount) : '—';
    const detailBtn = item.type === 'past-recovery'
      ? `<button type="button" class="btn btn-sm btn-secondary" data-daily-revenue-go-past-recovery>詳細を見る</button>`
      : `<button type="button" class="btn btn-sm btn-secondary" data-daily-revenue-go-calendar>詳細を見る</button>`;
  const confirmBtn = opts.hideConfirm
      ? ''
      : `<button type="button" class="btn btn-sm btn-primary" data-daily-revenue-confirm="${esc(item.id)}" data-daily-revenue-source="${esc(item.type)}">売上確定</button>`;
    return `<div class="daily-revenue-queue-card daily-revenue-queue-${esc(item.type)}">
      <div class="daily-revenue-queue-meta">
        <span class="daily-revenue-queue-date">${esc(formatRevenueQueueDate(item.scheduledDate))}</span>
        <span class="daily-revenue-queue-name">${esc(item.customerName)}</span>
        <span class="daily-revenue-queue-service">${esc((item.serviceText || '').slice(0, 24))}</span>
        <span class="daily-revenue-queue-amount">${esc(amountLabel)}</span>
        <span class="daily-revenue-queue-status">${esc(item.statusLabel)}</span>
      </div>
      <div class="daily-revenue-queue-actions">
        ${confirmBtn}
        ${detailBtn}
      </div>
    </div>`;
  }

  function copyReviewMessageForRevenue(revenueId) {
    const rev = Storage.getRevenueRecords().find(r => r && r.id === revenueId);
    if (!rev || typeof FollowUpBrain === 'undefined') return;
    const profile = Storage.getBusinessProfile() || {};
    const target = {
      customerName: rev.customerName,
      workDate: rev.workDate,
      serviceText: rev.service,
      amount: rev.amount
    };
    const text = FollowUpBrain.generateReviewRequest(target, profile);
    copyText(text).then(() => showAppToast('口コミ依頼文をコピーしました')).catch(() => alert('コピーに失敗しました'));
  }

  function showRevenueConfirmedNotice(revenueRecord) {
    if (!revenueRecord) return;
    navigateAfterAction('revenue-confirm', '売上を確定しました。次にやることを確認してください。');
  }

  function bindDailyRevenueQueueEvents(root) {
    if (!root) return;
    root.querySelectorAll('[data-daily-revenue-confirm]').forEach(btn => {
      btn.addEventListener('click', () => {
        openWorkCompletionModalFromQueue(btn.dataset.dailyRevenueConfirm, btn.dataset.dailyRevenueSource || 'work-order');
      });
    });
    root.querySelectorAll('[data-daily-revenue-go-calendar]').forEach(btn => {
      btn.addEventListener('click', () => goToReception());
    });
    root.querySelectorAll('[data-daily-revenue-go-past-recovery]').forEach(btn => {
      btn.addEventListener('click', () => navigateToView('calendar-candidate'));
    });
  }

  function renderRevenueConfirmationQueueBlock(targetId, options) {
    const el = typeof targetId === 'string' ? document.getElementById(targetId) : targetId;
    if (!el) return;
    const opts = options || {};
    const limit = opts.limit || 3;
    const queue = collectRevenueConfirmationQueue();
    if (!queue.totalCount) {
      el.innerHTML = `<p class="placeholder-text">${esc(opts.emptyText || '売上確定待ちはありません。作業日当日以降で、まだ売上確定していない予定がここに表示されます。')}</p>`;
      bindDailyRevenueQueueEvents(el);
      return;
    }
    const visible = queue.visible.slice(0, limit);
    const hiddenCount = Math.max(0, queue.totalCount - visible.length);
    const cards = visible.map(item => renderRevenueConfirmationQueueCard(item, opts)).join('');
    const more = hiddenCount
      ? `<p class="daily-revenue-queue-more">ほか${hiddenCount}件あります</p>
         <div class="daily-revenue-queue-more-actions">
           <button type="button" class="btn btn-sm btn-secondary" data-daily-revenue-go-daily>毎日やることを見る</button>
         </div>`
      : '';
    el.innerHTML = `<div class="daily-revenue-queue-cards">${cards}</div>${more}`;
    bindDailyRevenueQueueEvents(el);
    el.querySelectorAll('[data-daily-revenue-go-daily]').forEach(btn => {
      btn.addEventListener('click', () => scrollToElement('.card-daily-action-tasks'));
    });
  }

  function renderDailyRevenueConfirmationQueue() {
    renderRevenueConfirmationQueueBlock('daily-revenue-queue-list');
  }

  function renderDailyPrioritySection() {
    const el = document.getElementById('daily-priority-list');
    if (!el) return;
    const items = collectDailyPriorityItems();
    if (!items.length) {
      el.innerHTML = '<p class="placeholder-text">今日の最優先はまだありません。</p>';
      return;
    }
    const visible = items.slice(0, 3);
    const hidden = items.slice(3);
    el.innerHTML = `
      <ul class="daily-priority-items">
        ${visible.map(it => `<li class="daily-priority-item daily-priority-${esc(it.kind)}">
          <strong>${esc(it.title)}</strong>
          <span class="daily-priority-reason">${esc(it.reason)}</span>
        </li>`).join('')}
      </ul>
      ${hidden.length ? `<details class="daily-priority-more"><summary>ほか${hidden.length}件</summary><ul class="daily-priority-items">${hidden.map(it => `<li class="daily-priority-item"><strong>${esc(it.title)}</strong> — ${esc(it.reason)}</li>`).join('')}</ul></details>` : ''}`;
  }

  function renderDailyImprovementSection() {
    const el = document.getElementById('daily-improvement-list');
    if (!el || typeof ActionBrain === 'undefined') return;
    const candidates = Storage.getActionCandidates()
      .map(c => ActionBrain.normalizeCandidate(c))
      .filter(c => c.status === ActionBrain.STATUS_TODO);
    if (!candidates.length) {
      el.innerHTML = '<p class="placeholder-text">改善リストはまだありません。<br>アクセス分析・サイト確認記録・経営ホームから追加できます。</p>';
      return;
    }
    const visible = candidates.slice(0, 3);
    const hiddenCount = Math.max(0, candidates.length - 3);
    el.innerHTML = `
      <ul class="daily-improvement-items">
        ${visible.map(c => {
          const dailyKey = ActionBrain.makeDailyTaskDedupeKey(c.sourceReportId, c.title);
          const inDaily = Storage.getDailyActionTasksData().manualTasks.some(t => t.pickupDedupeKey === dailyKey);
          return `<li class="daily-improvement-item">
            <p class="daily-improvement-title">${esc(c.title)}</p>
            <div class="daily-improvement-actions">
              <button type="button" class="btn btn-sm btn-secondary" data-act-done="${esc(c.id)}">対応済み</button>
              <button type="button" class="btn btn-sm btn-not-needed" data-act-not-needed="${esc(c.id)}">必要無し</button>
              <button type="button" class="btn btn-sm btn-secondary" data-act-snooze="${esc(c.id)}">後で見る</button>
              ${inDaily ? '' : `<button type="button" class="btn btn-sm btn-primary" data-act-daily="${esc(c.sourceReportId)}" data-act-title="${esc(c.title)}">${esc(DAILY_TASKS_UI_LABEL)}へ</button>`}
            </div>
          </li>`;
        }).join('')}
      </ul>
      ${hiddenCount ? `<p class="daily-improvement-more">ほか${hiddenCount}件</p>` : ''}
      <button type="button" class="btn btn-sm btn-secondary daily-go-improvement-list">改善リストを見る</button>`;
    bindActionCandidateButtons(el);
    el.querySelectorAll('[data-act-snooze]').forEach(btn => {
      btn.addEventListener('click', () => showAppToast('改善リストに残しました'));
    });
    const listBtn = el.querySelector('.daily-go-improvement-list');
    if (listBtn) {
      listBtn.addEventListener('click', () => navigateToView('external-check', '.card-external-check-unified'));
    }
  }

  function showDailyExpenseSavedNotice() {
    const el = document.getElementById('daily-expense-notice');
    if (!el) return;
    el.classList.remove('hidden');
    el.innerHTML = `
      <p class="daily-expense-notice-text">経費を登録しました。利益管理で確認できます。</p>
      <div class="daily-expense-notice-actions">
        <button type="button" class="btn btn-sm btn-primary" data-daily-expense-go-profit>利益管理を見る</button>
        <button type="button" class="btn btn-sm btn-secondary" data-daily-expense-stay>この画面に残る</button>
      </div>`;
    el.querySelector('[data-daily-expense-go-profit]').addEventListener('click', () => {
      navigateToView('profit', '#profit-expense-form');
    });
    el.querySelector('[data-daily-expense-stay]').addEventListener('click', () => {
      el.classList.add('hidden');
    });
  }

  function buildDailyExpenseMemo(content, memo) {
    const c = (content || '').trim();
    const m = (memo || '').trim();
    if (c && m) return `内容：${c}\nメモ：${m}`;
    if (c) return c;
    return m;
  }

  function populateDailyExpenseCategorySelect() {
    const catEl = document.getElementById('daily-expense-category');
    if (!catEl || catEl.options.length) return;
    const categories = typeof ProfitBrain !== 'undefined' && ProfitBrain.DAILY_EXPENSE_CATEGORIES
      ? ProfitBrain.DAILY_EXPENSE_CATEGORIES
      : ['人件費', '薬剤・材料', '交通・燃料', '外注費', '広告費', '消耗品', 'その他'];
    catEl.innerHTML = categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  }

  function clearDailyExpenseForm() {
    const form = document.getElementById('daily-expense-quick-form');
    if (form) form.reset();
    const dateEl = document.getElementById('daily-expense-date');
    if (dateEl) dateEl.value = TODAY();
    populateDailyExpenseCategorySelect();
  }

  function handleDailyExpenseQuickSubmit(e) {
    e.preventDefault();
    const date = document.getElementById('daily-expense-date').value || TODAY();
    const category = document.getElementById('daily-expense-category').value || 'その他';
    const content = document.getElementById('daily-expense-content').value.trim();
    const amount = Number(document.getElementById('daily-expense-amount').value) || 0;
    const memoExtra = document.getElementById('daily-expense-memo').value.trim();
    if (!amount || amount <= 0) {
      alert('金額を入力してください（0円以下は登録できません）。');
      return;
    }
    const memo = buildDailyExpenseMemo(content, memoExtra);
    Storage.addExpenseRecord({
      date,
      category,
      amount,
      paymentMethod: '現金',
      memo,
      taxIncluded: true,
      isRecurring: false,
      source: 'daily-action-expense'
    });
    clearDailyExpenseForm();
    showDailyExpenseSavedNotice();
    renderExecutiveHome();
    renderProfitView();
  }

  function showDailyRevenueSavedNotice() {
    const el = document.getElementById('daily-revenue-notice');
    if (!el) return;
    el.classList.remove('hidden');
    el.innerHTML = `
      <p class="daily-revenue-notice-text">売上を登録しました。売上一覧で確認できます。</p>
      <div class="daily-revenue-notice-actions">
        <button type="button" class="btn btn-sm btn-primary" data-daily-revenue-go-list>売上一覧を見る</button>
        <button type="button" class="btn btn-sm btn-secondary" data-daily-revenue-stay>この画面に残る</button>
      </div>`;
    el.querySelector('[data-daily-revenue-go-list]').addEventListener('click', () => {
      navigateToView('revenue', '#revenue-aggregation-card');
    });
    el.querySelector('[data-daily-revenue-stay]').addEventListener('click', () => {
      el.classList.add('hidden');
    });
  }

  function handleDailyRevenueQuickSubmit(e) {
    e.preventDefault();
    const workDate = document.getElementById('daily-revenue-date').value;
    const customerName = document.getElementById('daily-revenue-customer').value.trim();
    const serviceText = document.getElementById('daily-revenue-service').value.trim();
    const amount = Number(document.getElementById('daily-revenue-amount').value) || 0;
    const memo = document.getElementById('daily-revenue-memo').value.trim();
    if (!customerName || !serviceText || !amount) {
      alert('お客様名・作業内容・金額は必須です');
      return;
    }
    Storage.addRevenueRecord({
      workDate: workDate || TODAY(),
      customerName,
      service: serviceText,
      source: RevenueBrain.SOURCES[0],
      amount,
      grossMarginRate: '',
      status: '確定',
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      paymentDate: workDate || TODAY(),
      paymentConcern: false,
      memo
    });
    document.getElementById('daily-revenue-quick-form').reset();
    document.getElementById('daily-revenue-date').value = TODAY();
    showDailyRevenueSavedNotice();
    renderExecutiveHome();
    renderRevenueView();
  }

  function initDailyFlowStrip() {
    document.querySelectorAll('[data-daily-flow]').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        const flow = btn.dataset.dailyFlow;
        if (flow === 'calendar') goToReception();
        else if (flow === 'revenue') goToAddRevenue();
        else if (flow === 'revenue-list') navigateToView('revenue', '#revenue-aggregation-card');
      });
    });
    document.querySelectorAll('.daily-go-calendar').forEach(btn => {
      btn.addEventListener('click', () => goToReception());
    });
    document.querySelectorAll('.upcoming-go-schedule-import').forEach(btn => {
      btn.addEventListener('click', () => navigateToView('calendar-candidate'));
    });
  }

  function renderDailyActionTasks() {
    renderDailyPrioritySection();
    renderDailyRevenueConfirmationQueue();
    populateDailyExpenseCategorySelect();
    const scheduleEl = document.getElementById('daily-upcoming-schedule');
    if (scheduleEl) {
      scheduleEl.innerHTML = renderDailyUpcomingScheduleHtml({ compact: false, limit: 3 });
      initDailyFlowStrip();
    }
    renderDailyImprovementSection();
    const dateEl = document.getElementById('daily-revenue-date');
    if (dateEl && !dateEl.value) dateEl.value = TODAY();
    const expenseDateEl = document.getElementById('daily-expense-date');
    if (expenseDateEl && !expenseDateEl.value) expenseDateEl.value = TODAY();

    const el = document.getElementById('dash-daily-action-tasks');
    if (!el) return;
    const today = TODAY();
    const allTasks = getDailyActionTasksWithState();
    const sorted = sortDailyTasksForDisplay(allTasks);
    const priorityKeys = new Set(collectDailyPriorityItems().map(it => it.title));
    const active = sorted.filter(t =>
      t.status !== 'done' && !isDailyTaskSnoozedAway(t, today) && !priorityKeys.has(t.title)
    );
    const snoozedAway = sorted.filter(t => isDailyTaskSnoozedAway(t, today));
    const snoozedToday = sorted.filter(t => t.status === 'snoozed' && !isDailyTaskSnoozedAway(t, today));
    const done = sorted.filter(t => t.status === 'done');
    const parts = [];

    if (!allTasks.length) {
      parts.push(`<p class="placeholder-text">${esc(EMPTY_DAILY_TASKS_COPY)}</p>`);
    } else {
      if (active.length) {
        const visible = active.slice(0, 5);
        const hidden = active.slice(5);
        visible.forEach(t => parts.push(renderDailyActionTaskCard(t, { showActions: true, compact: true })));
        if (hidden.length) {
          parts.push(`<details class="daily-tasks-more"><summary>すべて見る（あと${hidden.length}件）</summary>`);
          hidden.forEach(t => parts.push(renderDailyActionTaskCard(t, { showActions: true, compact: true })));
          parts.push('</details>');
        }
      } else if (!snoozedToday.length && !snoozedAway.length && !done.length) {
        parts.push('<p class="placeholder-text">追加タスクはありません。</p>');
      }
      if (snoozedToday.length || snoozedAway.length) {
        parts.push('<details class="daily-tasks-snoozed-collapse"><summary>後回し / 明日に回し済み</summary>');
        parts.push('<div class="daily-task-snoozed-section">');
        snoozedToday.forEach(t => parts.push(renderDailyActionTaskCard(t, { showActions: true, compact: true })));
        snoozedAway.forEach(t => parts.push(renderDailyActionTaskCard(t, { showActions: false, compact: true })));
        parts.push('</div></details>');
      }
      if (done.length) {
        parts.push('<details class="daily-tasks-done-collapse"><summary>完了済み（' + done.length + '件）</summary>');
        parts.push('<div class="daily-task-done-section">');
        done.slice(0, 5).forEach(t => parts.push(renderDailyActionTaskCard(t, {
          showActions: false,
          compact: true,
          showCompletedAt: true
        })));
        parts.push('</div></details>');
      }
    }
    el.innerHTML = parts.join('');
    bindDailyActionTaskEvents(el);
    initDailyFlowStrip();
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
      <p class="daily-tasks-brief-title">${esc(DAILY_TASKS_UI_LABEL)}：</p>
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
    const revenueForm = document.getElementById('daily-revenue-quick-form');
    if (revenueForm && !revenueForm.dataset.bound) {
      revenueForm.dataset.bound = '1';
      revenueForm.addEventListener('submit', handleDailyRevenueQuickSubmit);
    }
    const expenseForm = document.getElementById('daily-expense-quick-form');
    if (expenseForm && !expenseForm.dataset.bound) {
      expenseForm.dataset.bound = '1';
      expenseForm.addEventListener('submit', handleDailyExpenseQuickSubmit);
    }
    populateDailyExpenseCategorySelect();
    const saveBtn = document.getElementById('btn-daily-task-edit-save');
    if (saveBtn) saveBtn.addEventListener('click', handleDailyTaskEditSave);
    const cancelBtn = document.getElementById('btn-daily-task-edit-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeDailyTaskEditPanel);
    initDailyFlowStrip();
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
      el.innerHTML = '<p class="placeholder-text">次に売るべき営業先はまだありません。営業画面で営業先を登録すると、ここに提案が出ます。</p>';
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

  function renderSalesOutcomeHtml() {
    return '';
  }

  function renderRevenueUnlinkedBanner(salesOutcome) {
    const banner = document.getElementById('revenue-unlinked-banner');
    if (!banner) return;
    banner.classList.add('hidden');
  }

  function renderRevenueSummaryHtml(summary, comment, options) {
    const opts = options || {};
    const overlay = opts.monthlyOverlay;
    const monthlyBrief = overlay && overlay.usesMonthlyResult
      ? renderCurrentMonthReconciliationBrief(summary.monthKey, overlay)
      : '';
    const plannedLabel = overlay && overlay.usesMonthlyResult ? '今月実績' : '売上予定';
    const lines = [
      monthlyBrief,
      `<p class="revenue-summary-line">${plannedLabel}：<strong>${esc(RevenueBrain.formatYen(summary.planned))}</strong>${overlay && overlay.usesMonthlyResult ? ' <span class="revenue-monthly-badge">月次実績ベース</span>' : ''}</p>`,
      `<p class="revenue-summary-line">入金済み：${esc(RevenueBrain.formatYen(summary.paid))}</p>`,
      `<p class="revenue-summary-line">入金待ち：${esc(RevenueBrain.formatYen(summary.unpaid))}</p>`,
      `<p class="revenue-summary-line">月間目標：${esc(RevenueBrain.formatYen(summary.monthlyTarget))}</p>`,
      `<p class="revenue-summary-line">目標まで残り：${esc(RevenueBrain.formatYen(summary.remainingToTarget))}</p>`,
      `<p class="revenue-summary-line">達成率：${summary.achievementRate}%</p>`
    ];
    if (opts.showExtra) {
      lines.push(
        `<p class="revenue-summary-line">確定：${esc(RevenueBrain.formatYen(summary.confirmed))}</p>`,
        `<p class="revenue-summary-line">残り日数：${summary.daysLeft}日 / 1日あたり必要：${esc(RevenueBrain.formatYen(summary.dailyNeeded))}</p>`
      );
    }
    if (comment) {
      lines.push(`<p class="revenue-bantou-comment">${esc(comment)}</p>`);
    }
    if (opts.showLink) {
      lines.push('<button type="button" class="btn btn-sm btn-secondary" id="btn-go-revenue">売上明細を手入力</button>');
    }
    return lines.join('');
  }

  function renderDashRevenueSummary() {
    const el = document.getElementById('dash-revenue-summary');
    if (!el) return;
    const { summary, comment, salesOutcome, monthlyOverlay } = getRevenueContext();
    el.innerHTML = renderRevenueSummaryHtml(summary, comment, { showLink: true, monthlyOverlay });
    const btn = el.querySelector('#btn-go-revenue');
    if (btn) btn.addEventListener('click', () => navigateToView('revenue'));
    const scheduleEl = document.getElementById('dash-upcoming-revenue-schedule');
    if (scheduleEl) {
      scheduleEl.innerHTML = renderUpcomingRevenueScheduleHtml({ limit: 3, showScheduleImportBtn: true });
      const importBtn = scheduleEl.querySelector('.upcoming-go-schedule-import');
      if (importBtn) importBtn.addEventListener('click', () => navigateToView('calendar-candidate'));
    }
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
    if (summary.revenueRecords) items.push('売上明細 ' + summary.revenueRecords + '件');
    if (summary.hasRevenueSettings) items.push('売上目標 あり');
    if (summary.dailyTaskStates) items.push('タスク状態 ' + summary.dailyTaskStates + '件');
    if (summary.manualTasks) items.push('手動タスク ' + summary.manualTasks + '件');
    if (summary.demandPickups) items.push('需要ピックアップ ' + summary.demandPickups + '件');
    if (summary.receptionIntakes) items.push('受付データ ' + summary.receptionIntakes + '件');
    if (summary.workOrders) items.push('作業予定 ' + summary.workOrders + '件');
    if (summary.expenseRecords) items.push('経費入力 ' + summary.expenseRecords + '件');
    if (summary.analyticsRecords) items.push('アナリティクス ' + summary.analyticsRecords + '件');
    if (summary.monthlyResults) items.push('月次実績 ' + summary.monthlyResults + '件');
    if (summary.documents) items.push('請求書・見積書 ' + summary.documents + '件');
    if (summary.externalCheck) items.push('外部チェック ' + summary.externalCheck + '件');
    if (summary.actionCandidates) items.push('改善リスト ' + summary.actionCandidates + '件');
    if (summary.actionCandidateStates) items.push('候補状態 ' + summary.actionCandidateStates + '件');
    if (summary.safetyBackups) items.push('安全バックアップ ' + summary.safetyBackups + '件');
    if (summary.operationLogs) items.push('操作ログ ' + summary.operationLogs + '件');
    if (summary.integrity) {
      const ig = summary.integrity;
      if (ig.linkedCount) items.push('linked ID あり ' + ig.linkedCount + '件');
      if (ig.linkedBrokenCount) items.push('linked切れ ' + ig.linkedBrokenCount + '件');
      items.push('payment fields（売上 ' + (ig.revenueWithPaymentFields || 0) + ' / 請求書 ' + (ig.documentsWithPaymentFields || 0) + '）');
      if (ig.documentsWithTaxSettings) items.push('taxSettings あり ' + ig.documentsWithTaxSettings + '件');
    }
    return items;
  }

  function shouldShowStartGuide() {
    return !hasExecutiveHomeData() && !Storage.getOnboardingStatus().businessProfile;
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

  function goToBusinessProfile() {
    navigateToView('data');
    setTimeout(() => scrollToElement('#business-profile-settings'), 120);
  }

  function goToRevenueTarget() {
    navigateToView('revenue');
    setTimeout(() => scrollToElement('#revenue-monthly-target'), 120);
  }

  function goToBusinessReportSection() {
    navigateToView('dashboard');
    setTimeout(() => scrollToElement('#business-report-dash'), 120);
  }

  function refreshKurokuroPrompt() {
    const promptEl = document.getElementById('pickup-cloclo-prompt');
    if (promptEl) {
      promptEl.value = DemandBrain.buildKurokuroMorningPrompt(Storage.getBusinessProfile());
    }
  }

  const ONBOARDING_STEPS = [
    { key: 'businessProfile', label: '事業プロフィールを設定', btn: '設定する', action: 'profile' },
    { key: 'monthlyTarget', label: '月間売上目標を設定', btn: '設定する', action: 'target' },
    { key: 'leads', label: '営業先を1件登録', btn: '登録する', action: 'lead' },
    { key: 'revenue', label: '売上を1件登録', btn: '登録する', action: 'revenue' },
    { key: 'pickups', label: 'クロクロ需要を3件取り込み', btn: '開く', action: 'pickup' },
    { key: 'reception', label: 'AI番頭受付を1件取り込む', btn: '開く', action: 'reception' },
    { key: 'taskCompleted', label: '毎日やることを1件完了', btn: '開く', action: 'task' },
    { key: 'reportGenerated', label: '経営レポートをコピー', btn: 'コピーする', action: 'report' }
  ];

  const PRODUCT_OVERVIEW_ITEMS = [
    { title: '売上を見える化', desc: '月間目標・達成率・売上明細を確認', action: 'revenue' },
    { title: '営業先を管理', desc: '次の一手・保留・活動履歴を整理', action: 'sales' },
    { title: '毎日やることを整理', desc: '優先タスクを毎朝確認', action: 'task' },
    { title: '集客施策メモ', desc: 'クロクロ調査結果を集客施策メモに取り込み', action: 'pickup' },
    { title: '受付・予定確認', desc: '受付内容を整理し、Googleカレンダー登録後の予定を確認', action: 'reception' },
    { title: '直近予定を確認', desc: '今日/今週の予定から毎日やること・売上確定へ', action: 'work-order' },
    { title: '作業後フォローをつなぐ', desc: 'お礼・口コミ依頼・リピート提案を文面生成', action: 'follow-up' },
    { title: 'エリアで移動を判断', desc: 'エリア別サマリーとGoogleマップ導線', action: 'area' },
    { title: '投稿・広告文案を作る', desc: '需要から投稿・広告案を生成', action: 'pickup' },
    { title: '投稿・広告予定を管理', desc: 'カレンダーで今週の予定を把握', action: 'calendar' },
    { title: '施策成果を見る', desc: 'LINE相談・予約・売上を入力', action: 'pickup' },
    { title: '続ける/改善/停止を判断', desc: '施策判断で次の打ち手を決める', action: 'pickup' },
    { title: '週次・月次レポートを出す', desc: '経営レポートをコピーして分析', action: 'report' },
    { title: 'データ診断で安全確認', desc: '紐付け切れや形式をチェック', action: 'diagnostics' }
  ];

  function handleOnboardingAction(action) {
    if (action === 'profile') return goToBusinessProfile();
    if (action === 'target') return goToRevenueTarget();
    if (action === 'lead') return goToAddLead();
    if (action === 'revenue') return goToAddRevenue();
    if (action === 'pickup') return goToDemandPickup();
    if (action === 'reception') return goToReception();
    if (action === 'task') return goToAddDailyTask();
    if (action === 'report') {
      generateBusinessReport();
      copyBusinessReport();
      return;
    }
  }

  function handleProductOverviewAction(action) {
    if (action === 'revenue') return navigateToView('revenue');
    if (action === 'sales') return navigateToView('sales');
    if (action === 'task') return goToAddDailyTask();
    if (action === 'pickup') return goToDemandPickup();
    if (action === 'reception') return goToReception();
    if (action === 'work-order') return goToWorkOrder();
    if (action === 'follow-up') return goToFollowUp();
    if (action === 'area') return goToAreaView();
    if (action === 'calendar') {
      navigateToView('dashboard');
      setTimeout(() => {
        const details = document.querySelector('.dash-detail-sections');
        if (details && !details.open) details.open = true;
        scrollToElement('#dash-action-calendar');
      }, 120);
      return;
    }
    if (action === 'report') return goToBusinessReportSection();
    if (action === 'diagnostics') {
      navigateToView('data');
      setTimeout(() => scrollToElement('#btn-run-diagnostics'), 120);
    }
  }

  function renderOnboardingGuide(mode) {
    const containerId = mode === 'detail' ? 'onboarding-guide-data' : 'onboarding-guide-dash';
    const el = document.getElementById(containerId);
    if (!el) return;
    const status = Storage.getOnboardingStatus();
    const profile = Storage.getBusinessProfile();
    const doneCount = ONBOARDING_STEPS.filter(s => status[s.key]).length;
    const profileHint = profile && profile.businessName
      ? `<p class="onboarding-profile-hint">${esc(profile.businessName)}${profile.area ? '（' + esc(profile.area) + '）' : ''}</p>`
      : '<p class="onboarding-profile-hint onboarding-profile-missing">事業プロフィール未設定 — まず設定するとプロンプトやレポートが自分向けになります</p>';

    el.innerHTML = `
      <div class="onboarding-header">
        <h2>はじめてガイド</h2>
        <span class="onboarding-progress">${doneCount}/${ONBOARDING_STEPS.length} 完了</span>
      </div>
      <p class="onboarding-lead">${mode === 'detail'
        ? 'Budilを初めて使う方・デモを見る方向けのセットアップ手順です。'
        : 'まずはこの順番で進めると、Budilの流れがつかめます。'}</p>
      ${profileHint}
      <div class="onboarding-demo-hint">
        <strong>初めて見る方へ：</strong>まずデモデータを作成すると、Budil全体の流れを確認できます。
        <details class="onboarding-demo-order-details">
          <summary>おすすめ確認順を見る</summary>
          <ol class="onboarding-demo-order">
            <li>経営ホーム</li>
            <li>カレンダー登録</li>
            <li>売上明細を手入力</li>
            <li>フォロー</li>
            <li>利益管理</li>
            <li>アナリティクス</li>
            <li>経営レポート</li>
            <li>データ診断</li>
          </ol>
        </details>
      </div>
      <p class="onboarding-sales-link"><a href="sales.html" class="view-header-link">Budilについて · 1ヶ月無料体験の案内</a></p>
      <h3 class="onboarding-subtitle">まずやること（3ステップ）</h3>
      <ol class="onboarding-steps">${ONBOARDING_STEPS.slice(0, 3).map((step, i) => {
        const done = status[step.key];
        return `<li class="onboarding-step ${done ? 'onboarding-step-done' : ''}">
          <span class="onboarding-step-num">${i + 1}</span>
          <span class="onboarding-step-label">${esc(step.label)}</span>
          <span class="onboarding-step-status">${done ? '済み ✓' : '未完了'}</span>
          ${done ? '' : `<button type="button" class="btn btn-sm ${i === 0 ? 'btn-primary' : 'btn-secondary'}" data-onboarding-action="${esc(step.action)}">${esc(step.btn)}</button>`}
        </li>`;
      }).join('')}</ol>
      ${mode !== 'detail' ? `<details class="onboarding-more-steps">
        <summary>残りのステップを見る</summary>
        <ol class="onboarding-steps" start="4">${ONBOARDING_STEPS.slice(3).map((step, i) => {
          const done = status[step.key];
          return `<li class="onboarding-step ${done ? 'onboarding-step-done' : ''}">
            <span class="onboarding-step-num">${i + 4}</span>
            <span class="onboarding-step-label">${esc(step.label)}</span>
            <span class="onboarding-step-status">${done ? '済み ✓' : '未完了'}</span>
            ${done ? '' : `<button type="button" class="btn btn-sm btn-secondary" data-onboarding-action="${esc(step.action)}">${esc(step.btn)}</button>`}
          </li>`;
        }).join('')}</ol>
      </details>` : `<ol class="onboarding-steps" start="4">${ONBOARDING_STEPS.slice(3).map((step, i) => {
        const done = status[step.key];
        return `<li class="onboarding-step ${done ? 'onboarding-step-done' : ''}">
          <span class="onboarding-step-num">${i + 4}</span>
          <span class="onboarding-step-label">${esc(step.label)}</span>
          <span class="onboarding-step-status">${done ? '済み ✓' : '未完了'}</span>
          ${done ? '' : `<button type="button" class="btn btn-sm btn-secondary" data-onboarding-action="${esc(step.action)}">${esc(step.btn)}</button>`}
        </li>`;
      }).join('')}</ol>`}
      <div class="onboarding-workflow-hint">
        <h3 class="onboarding-subtitle">カレンダー〜売上の流れ</h3>
        <ul class="onboarding-workflow-list">
          <li>カレンダー登録でAI番頭の結果を取り込み、日程を入れてカレンダー登録</li>
          <li>作業完了後はフォローでお礼LINE・口コミ依頼・リピート提案</li>
          <li>作業後に売上確定</li>
        </ul>
      </div>
      ${mode === 'detail' ? `
      <div class="onboarding-extra-actions">
        <button type="button" class="btn btn-sm btn-secondary" data-onboarding-nav="demo">デモデータを作成</button>
        <button type="button" class="btn btn-sm btn-secondary" data-onboarding-nav="profile">事業プロフィールを開く</button>
      </div>` : ''}`;

    el.querySelectorAll('[data-onboarding-action]').forEach(btn => {
      btn.addEventListener('click', () => handleOnboardingAction(btn.dataset.onboardingAction));
    });
    el.querySelectorAll('[data-onboarding-nav]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.onboardingNav === 'demo') scrollToElement('#demo-data-panel');
        if (btn.dataset.onboardingNav === 'profile') goToBusinessProfile();
      });
    });
  }

  function renderBusinessProfileSettings() {
    const el = document.getElementById('business-profile-settings');
    if (!el) return;
    const p = Storage.getBusinessProfile() || {};
    el.innerHTML = `
      <h2>事業プロフィール</h2>
      <p class="data-mgmt-desc">事業情報はプロンプト・経営レポート・はじめてガイドに反映されます。localStorageの設定（budil_settings）に保存されます。</p>
      <form id="business-profile-form" class="business-profile-form">
        <div class="form-row form-row-2">
          <div class="form-group">
            <label for="bp-business-name">事業名</label>
            <input type="text" id="bp-business-name" placeholder="例：BCサービス" value="${esc(p.businessName || '')}">
          </div>
          <div class="form-group">
            <label for="bp-area">地域</label>
            <input type="text" id="bp-area" placeholder="例：沖縄南部" value="${esc(p.area || '')}">
          </div>
        </div>
        <div class="form-row form-row-2">
          <div class="form-group">
            <label for="bp-industry">業種</label>
            <input type="text" id="bp-industry" placeholder="例：清掃業" value="${esc(p.industry || '')}">
          </div>
          <div class="form-group">
            <label for="bp-line-url">LINE URL</label>
            <input type="url" id="bp-line-url" placeholder="https://..." value="${esc(p.lineUrl || '')}">
          </div>
        </div>
        <div class="form-group">
          <label for="bp-google-review-url">Google口コミURL</label>
          <input type="url" id="bp-google-review-url" placeholder="https://g.page/..." value="${esc(p.googleReviewUrl || '')}">
        </div>
        <div class="form-group">
          <label for="bp-follow-up-memo">フォロー文面メモ（任意）</label>
          <input type="text" id="bp-follow-up-memo" placeholder="お礼文に足す一言など" value="${esc(p.followUpMemo || '')}">
        </div>
        <div class="form-group">
          <label for="bp-main-services">主力サービス（カンマ区切り）</label>
          <input type="text" id="bp-main-services" placeholder="エアコンクリーニング、洗濯機クリーニング" value="${esc((p.mainServices || []).join('、'))}">
        </div>
        <div class="form-group">
          <label for="bp-main-channels">主な集客経路（カンマ区切り）</label>
          <input type="text" id="bp-main-channels" placeholder="Instagram、Google広告、LINE" value="${esc((p.mainChannels || []).join('、'))}">
        </div>
        <div class="form-group">
          <label for="bp-memo">メモ</label>
          <textarea id="bp-memo" rows="2" placeholder="デモ用メモなど">${esc(p.memo || '')}</textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-sm">事業プロフィールを保存</button>
      </form>`;

    const form = el.querySelector('#business-profile-form');
    if (form && !form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', e => {
        e.preventDefault();
        Storage.saveBusinessProfile({
          businessName: document.getElementById('bp-business-name').value.trim(),
          area: document.getElementById('bp-area').value.trim(),
          industry: document.getElementById('bp-industry').value.trim(),
          lineUrl: document.getElementById('bp-line-url').value.trim(),
          googleReviewUrl: document.getElementById('bp-google-review-url').value.trim(),
          followUpMemo: document.getElementById('bp-follow-up-memo').value.trim(),
          mainServices: document.getElementById('bp-main-services').value.trim(),
          mainChannels: document.getElementById('bp-main-channels').value.trim(),
          memo: document.getElementById('bp-memo').value.trim()
        });
        refreshKurokuroPrompt();
        renderOnboardingGuide('compact');
        renderOnboardingGuide('detail');
        alert('事業プロフィールを保存しました');
      });
    }
  }

  let demoGuideVisible = false;

  function renderDemoDataPanel() {
    const el = document.getElementById('demo-data-panel');
    if (!el) return;
    const hasDemo = Storage.hasDemoData();
    el.innerHTML = `
      <h2>デモデータ</h2>
      <p class="data-mgmt-desc">販売・デモ用のサンプルデータです。すべて <code>isDemo</code> フラグ付きで、削除時も本番データは触りません。</p>
      <ul class="demo-data-scope-list">
        <li>営業先 3件 / 売上 2件 / 集客施策メモ 3件 / 受付 2件 / 予定 2件</li>
        <li>投稿・広告予定 2件 / 施策成果 1件</li>
        <li>毎日やること 3件 / 確認完了 1件</li>
      </ul>
      <div class="data-mgmt-actions">
        <button type="button" id="btn-create-demo-data" class="btn btn-primary" ${hasDemo ? 'disabled' : ''}>デモデータを作成</button>
        <button type="button" id="btn-delete-demo-data" class="btn btn-secondary" ${hasDemo ? '' : 'disabled'}>デモデータを削除</button>
      </div>
      <div id="demo-data-guide" class="demo-data-guide ${demoGuideVisible ? '' : 'hidden'}">
        <p class="demo-data-guide-text">デモデータを作成しました。<br>初めて見る方は、まず<strong>経営ホーム</strong>で全体像を確認してください。おすすめの確認順は下のとおりです。</p>
        <ol class="demo-data-guide-order">
          <li>経営ホーム</li>
          <li>カレンダー登録</li>
          <li>売上登録</li>
          <li>売上登録</li>
          <li>フォロー</li>
          <li>利益管理</li>
          <li>アナリティクス</li>
          <li>経営レポート</li>
          <li>データ診断</li>
        </ol>
        <div class="demo-data-guide-actions">
          <button type="button" class="btn btn-sm btn-primary" data-demo-nav="home">経営ホームを見る</button>
          <button type="button" class="btn btn-sm btn-secondary" data-demo-nav="pickup">集客施策メモを見る</button>
          <button type="button" class="btn btn-sm btn-secondary" data-demo-nav="report">経営レポートを見る</button>
          <button type="button" class="btn btn-sm btn-secondary" data-demo-nav="diagnostics">データ診断を実行</button>
        </div>
      </div>`;

    const createBtn = el.querySelector('#btn-create-demo-data');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        const result = Storage.createDemoData();
        if (!result.ok) {
          alert(result.error === 'exists'
            ? 'デモデータはすでにあります。「デモデータを削除」で消してから再度作成してください。'
            : 'デモデータの作成に失敗しました');
          return;
        }
        demoGuideVisible = true;
        refreshAllViews();
        renderDemoDataPanel();
      });
    }
    const deleteBtn = el.querySelector('#btn-delete-demo-data');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (!Storage.hasDemoData()) {
          alert('削除できるデモデータがありません');
          return;
        }
        const ok = confirm('デモデータ（isDemo / isTest）だけを削除します。本番データは残ります。よろしいですか？');
        if (!ok) return;
        const result = Storage.deleteDemoData();
        if (!result.ok) {
          alert('安全ガードによりデモデータ削除を停止しました。データ診断で安全バックアップと操作ログを確認してください。');
          return;
        }
        demoGuideVisible = false;
        refreshAllViews();
        alert('デモデータを削除しました');
      });
    }
    el.querySelectorAll('[data-demo-nav]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nav = btn.dataset.demoNav;
        if (nav === 'home') {
          navigateToView('dashboard');
          setTimeout(() => scrollToElement('#executive-home'), 120);
        } else if (nav === 'pickup') {
          goToDemandPickup();
        } else if (nav === 'report') {
          navigateToView('data');
          setTimeout(() => scrollToElement('#business-report-data'), 120);
        } else if (nav === 'diagnostics') {
          runDataDiagnosticsUI();
          scrollToElement('#data-diagnostics-result');
        }
      });
    });
  }

  function renderDataSafetyNotice() {
    const el = document.getElementById('data-safety-notice');
    if (!el) return;
    el.innerHTML = `
      <h2>データの保存について</h2>
      <ul class="data-safety-list">
        <li>Budilは現在、ブラウザの <strong>localStorage</strong> にデータを保存します</li>
        <li>別の端末・別ブラウザでは、同じデータは自動では見えません</li>
        <li>保護対象：売上明細・月次実績・作業予定・経費入力・設定</li>
        <li>機種変更や誤操作に備え、<strong>定期的なバックアップ</strong>を推奨します</li>
        <li>本番データを誤って消さない設計です（デモ削除は <code>isDemo</code> / <code>isTest</code> のみ）</li>
        <li>販売・複数端末での本格運用には、将来のクラウド保存が必要です</li>
        <li><a href="sales.html" class="view-header-link">Budilについて · 1ヶ月無料体験の案内</a></li>
      </ul>`;
  }

  function renderProductOverview(mode) {
    const containerId = mode === 'detail' ? 'product-overview-data' : 'product-overview-dash';
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `
      <h2>Budilでできること</h2>
      <p class="product-overview-lead">${mode === 'detail'
        ? 'Budilの主要機能一覧です。デモや説明時にご利用ください。'
        : 'このツールでできることをまとめています。'}</p>
      <div class="product-overview-grid">${PRODUCT_OVERVIEW_ITEMS.map((item, i) => `
        <div class="product-overview-card">
          <span class="product-overview-num">${i + 1}</span>
          <strong>${esc(item.title)}</strong>
          <p>${esc(item.desc)}</p>
          <button type="button" class="btn btn-sm btn-secondary" data-product-action="${esc(item.action)}">開く</button>
        </div>`).join('')}</div>`;
    el.querySelectorAll('[data-product-action]').forEach(btn => {
      btn.addEventListener('click', () => handleProductOverviewAction(btn.dataset.productAction));
    });
  }

  function renderRecommendedOperations(mode) {
    const containerId = mode === 'detail' ? 'recommended-ops-data' : 'recommended-ops-dash';
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `
      <h2>おすすめ運用</h2>
      <div class="recommended-ops-grid">
        <div class="recommended-ops-block">
          <h3>毎朝5分</h3>
          <ol>
            <li>経営ホームを見る</li>
            <li>クロクロ調査結果を集客施策メモに入れる</li>
            <li>毎日やることを確認</li>
            <li>今日の確認完了を押す</li>
          </ol>
        </div>
        <div class="recommended-ops-block">
          <h3>週1回</h3>
          <ol>
            <li>週間作戦ボードを見る</li>
            <li>投稿・広告カレンダーを確認</li>
            <li>施策成果を入力</li>
            <li>経営レポートをコピーしてChatGPTに分析させる</li>
          </ol>
        </div>
        <div class="recommended-ops-block">
          <h3>月1回</h3>
          <ol>
            <li>売上目標の達成率を見る</li>
            <li>勝ちパターンを見る</li>
            <li>改善・停止候補を見る</li>
            <li>来月の重点サービスを決める</li>
          </ol>
        </div>
      </div>`;
  }

  function renderSalesDemoSections() {
    renderOnboardingGuide('compact');
    renderOnboardingGuide('detail');
    renderBusinessProfileSettings();
    renderDemoDataPanel();
    renderDataSafetyNotice();
    renderProductOverview('compact');
    renderProductOverview('detail');
    renderRecommendedOperations('compact');
    renderRecommendedOperations('detail');
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
    const isTestLike = item => item && (item.isTest === true || String(item.testRunId || '').trim());
    const leads = Storage.getLeads().some(isTestLike);
    const revenue = Storage.getRevenueRecords().some(isTestLike);
    const manual = Storage.getDailyActionTasksData().manualTasks.some(isTestLike);
    return leads || revenue || manual;
  }

  function createBudilTestData() {
    if (hasBudilTestData()) {
      alert('テストデータはすでにあります。「テストデータを削除」で消してから再度作成してください。');
      return;
    }
    const today = TODAY();
    const nextContact = addDaysToDate(today, 30);
    const testRunId = 'v488-' + Storage.generateId();
    const leadId = 'test_' + Storage.generateId();
    const leads = Storage.getLeads();
    leads.push({
      id: leadId,
      company: 'テスト工務店',
      isTest: true,
      testRunId,
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
        testRunId,
        createdAt: new Date().toISOString()
      }]
    });
    Storage.saveLeads(leads);

    Storage.addRevenueRecord({
      isTest: true,
      testRunId,
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
      testRunId,
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
    alert('テストデータを作成しました（テスト工務店・売上1件・活動履歴・毎日やること）');
  }

  function deleteBudilTestData() {
    if (!hasBudilTestData()) {
      alert('削除できるテストデータがありません');
      return;
    }
    const ok = confirm('テストデータ（isTest）だけを削除します。本番データは残ります。よろしいですか？');
    if (!ok) return;

    const isTestLike = item => item && (item.isTest === true || String(item.testRunId || '').trim());
    const testManualIds = Storage.getDailyActionTasksData().manualTasks
      .filter(isTestLike)
      .map(t => t.id);

    const revenueResult = Storage.deleteTestRecordsByKey(Storage.KEYS.REVENUE_RECORDS, {
      reason: 'before_delete_ui_test_revenue',
      action: 'delete_ui_test_revenue'
    });
    if (!revenueResult.ok) {
      alert('安全ガードによりテスト売上の削除を停止しました。データ診断で安全バックアップと操作ログを確認してください。');
      return;
    }

    Storage.saveLeads(Storage.getLeads().filter(l => !isTestLike(l)));

    const store = Storage.getDailyActionTasksData();
    Storage.createSafetyBackup({
      reason: 'before_delete_ui_test_daily_tasks',
      targetKey: Storage.KEYS.DAILY_ACTION_TASKS,
      beforeCount: (store.manualTasks || []).length + (store.states || []).length,
      data: store
    });
    store.manualTasks = store.manualTasks.filter(t => !isTestLike(t));
    store.states = store.states.filter(s => !isTestLike(s) && !testManualIds.includes(s.taskId));
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

  let lastDiagnosticResult = null;

  function formatDiagnosticDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('ja-JP', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return iso;
    }
  }

  function renderDiagnosticCounts(counts) {
    const el = document.getElementById('data-diagnostics-counts');
    if (!el || !counts) return;
    const items = [
      ['営業先', counts.leads],
      ['売上', counts.revenue],
      ['請求書/見積書', counts.documents],
      ['月次実績', counts.monthlyResults],
      ['外部チェック', counts.externalChecks],
      ['入金待ち', counts.receivablesPending],
      ['linked済み', counts.linkedCount],
      ['linked切れ', counts.linkedBroken],
      ['毎日やること', counts.dailyTasks],
      ['需要ピックアップ', counts.pickups],
      ['受付データ', counts.receptionIntakes],
      ['作業予定', counts.workOrders],
      ['支出', counts.expenseRecords],
      ['アナリティクス', counts.analyticsRecords],
      ['活動履歴', counts.activityLogs],
      ['成果入力済み', counts.performanceEntered],
      ['dailyChecks', counts.dailyChecks],
      ['候補状態', counts.actionCandidateStates],
      ['安全バックアップ', counts.safetyBackups],
      ['操作ログ', counts.operationLogs]
    ];
    el.innerHTML = items.map(([label, val]) =>
      `<div class="data-diagnostics-count-item"><span>${esc(label)}</span><strong>${val != null ? val : '—'}</strong></div>`
    ).join('');
  }

  function renderDiagnosticBackupKeys(backupKeys) {
    const el = document.getElementById('data-diagnostics-backup-keys');
    if (!el) return;
    const critical = Storage.CRITICAL_BACKUP_KEYS || [];
    const list = (backupKeys || []).filter(b => critical.includes(b.key));
    el.innerHTML = `
      <p class="label-muted">バックアップ対象キー（主要${critical.length}件）</p>
      <ul>${list.map(b => {
        const status = !b.exists ? '未保存' : (b.parseOk ? 'OK' : '読込エラー');
        return `<li><code>${esc(b.key)}</code> — ${esc(status)}</li>`;
      }).join('')}</ul>`;
  }

  function renderDiagnosticLevels(levels) {
    const el = document.getElementById('data-diagnostics-levels');
    if (!el || !levels) return;
    const config = [
      { key: 'ok', label: '正常', cls: 'ok' },
      { key: 'caution', label: '注意', cls: 'caution' },
      { key: 'review', label: '要確認', cls: 'review' },
      { key: 'critical', label: '重大', cls: 'critical' }
    ];
    el.innerHTML = config.map(c => {
      const items = levels[c.key] || [];
      if (!items.length) return '';
      return `
        <div class="data-diagnostics-level data-diagnostics-level-${c.cls}">
          <h4>${esc(c.label)}：</h4>
          <ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
        </div>`;
    }).join('');
  }

  function renderDataDiagnosticsSummary() {
    const usage = Storage.getLocalStorageUsage();
    const usageEl = document.getElementById('data-storage-usage');
    if (usageEl) usageEl.textContent = '保存データ目安：' + (usage.label || '—');

    const settings = Storage.getSettings();
    const diagEl = document.getElementById('data-last-diagnostic');
    if (diagEl) {
      diagEl.textContent = '最終診断日時：' + formatDiagnosticDate(settings.lastDiagnosticAt);
    }

    if (lastDiagnosticResult) {
      renderDiagnosticCounts(lastDiagnosticResult.counts);
      renderDiagnosticBackupKeys(lastDiagnosticResult.backupKeys);
      renderDiagnosticLevels(lastDiagnosticResult.levels);
      const resultWrap = document.getElementById('data-diagnostics-result');
      if (resultWrap) resultWrap.classList.remove('hidden');
      const copyBtn = document.getElementById('btn-copy-diagnostics');
      if (copyBtn) copyBtn.disabled = false;
    }
  }

  function runDataDiagnosticsUI() {
    lastDiagnosticResult = Storage.runDataDiagnostics();
    renderDataDiagnosticsSummary();
  }

  function copyDiagnosticReport() {
    if (!lastDiagnosticResult) {
      alert('先にデータ診断を実行してください');
      return;
    }
    const text = Storage.buildDiagnosticReportText(lastDiagnosticResult);
    copyText(text).then(() => {
      alert('診断結果をコピーしました');
    }).catch(() => alert('コピーに失敗しました'));
  }

  function runSafeFormatCorrectionUI() {
    const ok = confirm(
      '安全な形式補正を実行します。\n\n' +
      '実行前に必ずバックアップしてください。\n' +
      '削除は行わず、足りない配列や項目だけを補います。\n\n続行しますか？'
    );
    if (!ok) return;
    const result = Storage.runSafeFormatCorrection();
    alert(`補正完了：${result.total}件の項目を補正しました（タスク${result.dailyTasks} / 営業先${result.leads} / 需要${result.pickups}）`);
    runDataDiagnosticsUI();
    refreshAllViews();
  }

  function renderDataManagement() {
    renderBackupStatus();
    const summary = DataBackup.getCurrentSummary();
    const listEl = document.getElementById('data-summary-list');
    if (listEl) {
      listEl.innerHTML = buildDataSummaryItems(summary)
        .map(t => '<li>' + esc(t) + '</li>').join('');
    }
    renderDataDiagnosticsSummary();
    renderDataConsistencyCheck('data-consistency-check');
    renderBusinessReport('detail');
    renderSalesDemoSections();
  }

  const BUSINESS_REPORT_PERIOD_LABELS = {
    today: '今日',
    '7d': '直近7日',
    month: '今月',
    all: 'すべて'
  };

  function resolveBusinessReportPeriod(period, today) {
    const t = today || TODAY();
    const p = period || businessReportPeriod || '7d';
    if (p === 'today') {
      return { period: 'today', startDate: t, endDate: t, label: BUSINESS_REPORT_PERIOD_LABELS.today };
    }
    if (p === 'month') {
      return { period: 'month', startDate: t.slice(0, 7) + '-01', endDate: t, label: BUSINESS_REPORT_PERIOD_LABELS.month };
    }
    if (p === 'all') {
      return { period: 'all', startDate: null, endDate: null, label: BUSINESS_REPORT_PERIOD_LABELS.all };
    }
    return {
      period: '7d',
      startDate: DemandBrain._addDays(t, -6),
      endDate: t,
      label: BUSINESS_REPORT_PERIOD_LABELS['7d']
    };
  }

  function filterRecordsByReportPeriod(records, range) {
    const list = RevenueBrain.activeRecords(RevenueBrain.normalizeRevenueRecords(records));
    if (!range.startDate || !range.endDate) return list;
    return list.filter(r => r.workDate && r.workDate >= range.startDate && r.workDate <= range.endDate);
  }

  function filterPickupsByReportPeriod(pickups, range, today) {
    if (range.period === 'all') return pickups || [];
    if (range.period === 'today') {
      return (pickups || []).filter(p => (p.date || '') === range.endDate);
    }
    return DemandBrain.filterPickupsByPeriod(pickups, today || TODAY(), range.period === 'month' ? 'month' : '7d');
  }

  function countMissingPerformanceInPickups(pickups) {
    let count = 0;
    (pickups || []).forEach(raw => {
      DemandBrain.EXECUTION_TYPES.forEach(type => {
        const exec = DemandBrain.normalizeExecutionStatus(raw);
        const item = exec[type];
        if (DemandBrain.isExecutionDone(type, item.status) && !DemandBrain.hasPerformanceInput(item)) {
          count++;
        }
      });
    });
    return count;
  }

  function buildBusinessReportDiagnosticNotes() {
    const notes = [];
    const records = RevenueBrain.normalizeRevenueRecords(Storage.getRevenueRecords());
    const leads = Storage.getLeads();
    const leadIds = new Set(leads.map(l => l.id));
    const badLeadRef = records.filter(r => r.leadId && !leadIds.has(r.leadId)).length;
    const missingPerf = countMissingPerformanceInPickups(Storage.getDemandPickups());
    const usage = Storage.getLocalStorageUsage();
    const backupOk = Storage.CRITICAL_BACKUP_KEYS.every(key => {
      try {
        const raw = localStorage.getItem(key);
        return raw !== null;
      } catch {
        return false;
      }
    });
    const revWarnings = typeof RevenueSummaryBrain !== 'undefined'
      ? RevenueSummaryBrain.getRevenueWarnings(records)
      : null;

    if (badLeadRef) notes.push(`紐付け切れ ${badLeadRef}件`);
    if (revWarnings) {
      if (revWarnings.noDate) notes.push(`日付不明の確定売上 ${revWarnings.noDate}件`);
      if (revWarnings.badAmount) notes.push(`金額不明/数値不正の売上 ${revWarnings.badAmount}件`);
      if (revWarnings.plannedCount) notes.push(`未確定の売上予定 ${revWarnings.plannedCount}件（集計対象外）`);
      if (revWarnings.unknownSource) notes.push(`依頼元不明の売上 ${revWarnings.unknownSource}件`);
      if (revWarnings.unknownService) notes.push(`サービス不明の売上 ${revWarnings.unknownService}件`);
    }
    if (typeof CalendarCandidateBrain !== 'undefined') {
      const calDiag = CalendarCandidateBrain.getDiagnosticsCounts(Storage.getWorkOrders());
      if (calDiag.pendingCount) notes.push(`作業予定未反映の候補 ${calDiag.pendingCount}件`);
      if (calDiag.withAmountNoRevenueCount) notes.push(`予定金額あり・売上未確定候補 ${calDiag.withAmountNoRevenueCount}件`);
    }
    if (missingPerf) notes.push(`成果未入力 ${missingPerf}件`);
    notes.push(backupOk ? 'バックアップ対象キー確認済み' : 'バックアップ対象キーに未保存あり');
    notes.push(`localStorage使用量 ${usage.label || '—'}`);
    return notes;
  }

  function collectBusinessReportTasks(range) {
    const today = TODAY();
    const all = getDailyActionTasksWithState();
    const inRange = task => {
      if (!range.startDate || !range.endDate) return true;
      const due = task.dueDate || today;
      const doneAt = (task.completedAt || task.updatedAt || '').slice(0, 10);
      if (task.status === 'done' && doneAt) return doneAt >= range.startDate && doneAt <= range.endDate;
      return due >= range.startDate && due <= range.endDate;
    };
    const scoped = all.filter(inRange);
    const open = scoped.filter(t => t.status !== 'done' && !isDailyTaskSnoozedAway(t, today) && t.status !== 'snoozed');
    const done = scoped.filter(t => t.status === 'done');
    const snoozed = scoped.filter(t => t.status === 'snoozed' || isDailyTaskSnoozedAway(t, today));
    const important = open.filter(t => t.priority === '高');
    return { open, done, snoozed, important, all: scoped };
  }

  function hasBusinessReportData() {
    return hasExecutiveHomeData();
  }

  function buildBusinessReportContext(period) {
    const today = TODAY();
    const range = resolveBusinessReportPeriod(period, today);
    const revCtx = getRevenueContext();
    const perfCtx = getPerformanceContext();
    const salesCtx = getSalesContext();
    const pickupsAll = perfCtx.pickups;
    const pickups = filterPickupsByReportPeriod(pickupsAll, range, today);
    const periodRecords = filterRecordsByReportPeriod(revCtx.records, range);
    const periodRevenue = RevenueBrain.sumAmount(periodRecords);
    const strategy = DemandBrain.buildWeeklyStrategy({
      today,
      period: range.period === 'today' ? '7d' : (range.period === 'all' ? 'all' : range.period),
      pickups: pickupsAll,
      records: revCtx.records,
      leads: revCtx.leads,
      enriched: salesCtx.enriched
    });
    const decisionInsights = DemandBrain.getActionDecisionInsights(pickups, revCtx.records, revCtx.leads, today);
    const focusRecs = DemandBrain.getFocusRecommendations(pickups, revCtx.records, revCtx.leads, 5, today);
    const stopImprove = DemandBrain.getStopOrImproveCandidates(pickups, revCtx.records, revCtx.leads);
    const perfSummary = DemandBrain.getWeeklyPerformanceSummary(pickupsAll, today, revCtx.records, revCtx.leads);
    const execSummary = buildExecutiveHomeSummary();
    const salesActions = getExecutiveHomeSalesActions();
    const warnings = getExecutiveHomeWarnings();
    const tasks = collectBusinessReportTasks(range);
    const scheduleItems = getTodayScheduleItems();
    const demandLines = DemandBrain.buildMorningDemandLines(pickupsAll, today);
    const diagnosticNotes = buildBusinessReportDiagnosticNotes();
    const improveCount = stopImprove.filter(c => c.decision === 'improve').length
      + (strategy.improvementCandidates || []).length
      + (strategy.performanceImprovements || []).length;
    const growEntries = (decisionInsights.entries || []).filter(e => e.decision === 'grow');
    const improveEntries = (decisionInsights.entries || []).filter(e => e.decision === 'improve');
    const stopEntries = (decisionInsights.entries || []).filter(e => e.decision === 'stop');
    const executedCount = pickups.reduce((n, raw) => {
      const exec = DemandBrain.normalizeExecutionStatus(raw);
      return n + DemandBrain.EXECUTION_TYPES.filter(type =>
        DemandBrain.isExecutionDone(type, exec[type].status)
      ).length;
    }, 0);
    const activeLeads = salesCtx.leads.filter(l => !CLOSED_STATUSES.includes(l.status));
    const nextLeads = salesActions.map(a => `${a.leadName}：${a.action}`);
    const revenueLeads = revCtx.records
      .filter(r => r.leadId && r.workDate && (!range.startDate || (r.workDate >= range.startDate && r.workDate <= range.endDate)))
      .map(r => RevenueBrain.resolveLeadLabel(r, revCtx.leads))
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .slice(0, 5);
    const paymentConcern = revCtx.records.filter(r =>
      r.status !== 'キャンセル' && RevenueBrain.recordHasPaymentConcern(r)
    );
    const profitCtx = getProfitContext({ period: range });
    const analyticsCtx = getAnalyticsContext({ period: range });
    const revenueSummary = typeof RevenueSummaryBrain !== 'undefined'
      ? RevenueSummaryBrain.buildFullSummary(revCtx.records, { year: today.slice(0, 4) }, today, getRevenueSummaryExtra())
      : null;

    const context = {
      today,
      range,
      hasData: hasBusinessReportData(),
      isEmpty: !hasBusinessReportData(),
      summary: {
        periodRevenue,
        monthAchievementRate: revCtx.summary.achievementRate,
        pickupCount: pickups.length,
        executedCount,
        growCount: growEntries.length,
        improveCount,
        openTaskCount: tasks.open.length,
        profitGrossProfit: profitCtx.summary ? profitCtx.summary.monthGrossProfit : 0,
        analyticsCount: (analyticsCtx.records || []).length
      },
      execSummary,
      revCtx,
      periodRecords,
      perfSummary,
      decisionInsights,
      focusRecs,
      stopImprove,
      strategy,
      salesActions,
      warnings,
      tasks,
      scheduleItems,
      demandLines,
      diagnosticNotes,
      growEntries,
      improveEntries,
      stopEntries,
      activeLeads,
      nextLeads,
      revenueLeads,
      paymentConcern,
      profitCtx,
      analyticsCtx,
      revenueSummary,
      nextActions: []
    };
    context.nextActions = buildNextActionsFromReport(context);
    context.reportText = buildBusinessReportText(context);
    context.chatGptPrompt = buildChatGptAnalysisPrompt(context);
    context.nextActionsText = buildNextActionsText(context.nextActions);
    return context;
  }

  function buildNextActionsFromReport(context) {
    const actions = [];
    const seen = new Set();
    const push = (title, reason, extra) => {
      const t = (title || '').trim();
      if (!t || seen.has(t)) return;
      seen.add(t);
      actions.push({ title: t, reason: reason || '', ...(extra || {}) });
    };

    (context.focusRecs || []).slice(0, 2).forEach(item => {
      push(item.nextStep || `${item.topic}を${item.decisionLabel || '継続'}`, item.reason, { source: 'focus' });
    });
    (context.strategy.actionTasks || []).slice(0, 2).forEach(task => {
      push(task.title, task.reason, { source: 'weekly' });
    });
    (context.salesActions || []).slice(0, 2).forEach(a => {
      push(a.action, a.reason, { source: 'sales', leadId: a.leadId, leadName: a.leadName });
    });
    (context.stopImprove || []).slice(0, 2).forEach(c => {
      push(c.nextStep || `${c.topic}を見直す`, c.reason, { source: 'decision' });
    });
    (context.growEntries || []).slice(0, 1).forEach(e => {
      push(e.nextStep, e.reason, { source: 'grow' });
    });
    if (!actions.length && context.execSummary && context.execSummary.lines && context.execSummary.lines[0]) {
      push('毎日やることを1件完了する', context.execSummary.lines[0], { source: 'exec' });
    }
    return actions.slice(0, 5);
  }

  function buildNextActionsText(actions) {
    const list = actions || [];
    if (!list.length) return '次の一手はまだありません。';
    return list.map((a, i) => `${i + 1}. ${a.title}`).join('\n');
  }

  function lineOrDash(value, fallback) {
    if (value === 0) return '0';
    if (value === '' || value == null) return fallback || '—';
    return String(value);
  }

  function buildBusinessReportText(context) {
    if (!context || context.isEmpty) {
      return [
        'まだレポートに使えるデータが少ないです。',
        'まずは以下を保存すると、週次レポートが作れます。',
        '',
        '1. 売上を1件登録',
        '2. クロクロ需要を3件取り込み',
        '3. 毎日やることを1件完了',
        '4. 投稿・広告の成果メモを1件入力'
      ].join('\n');
    }

    const c = context;
    const r = c.range;
    const rev = c.revCtx.summary;
    const periodLabel = r.startDate && r.endDate ? `${r.startDate}〜${r.endDate}` : 'すべて';
    const lines = [];

    lines.push('【Budil 経営レポート】');
    lines.push(`期間：${periodLabel}`);
    const profileBlock = Storage.formatBusinessProfileText(Storage.getBusinessProfile());
    if (profileBlock) {
      lines.push('');
      lines.push(profileBlock);
    }
    lines.push('');

    lines.push('■ 1. 全体まとめ');
    (c.execSummary.lines || []).forEach(l => lines.push(l));
    if (rev.monthlyTarget > 0) {
      lines.push(`売上は${RevenueBrain.formatYen(c.summary.periodRevenue)}、今月達成率は${rev.achievementRate}%です。`);
    } else {
      lines.push(`期間内売上は${RevenueBrain.formatYen(c.summary.periodRevenue)}です。`);
    }
    const perfBits = [];
    if (c.growEntries.length) perfBits.push(`${c.growEntries[0].topic}が成果あり`);
    if (c.improveEntries.length) perfBits.push(`${c.improveEntries[0].topic}は改善候補`);
    if (perfBits.length) lines.push(`投稿・広告施策では${perfBits.join('、')}です。`);
    lines.push('');

    lines.push('■ 2. 売上状況');
    lines.push(`今月売上：${RevenueBrain.formatYen(rev.planned)}`);
    lines.push(`期間内売上：${RevenueBrain.formatYen(c.summary.periodRevenue)}`);
    lines.push(`目標：${RevenueBrain.formatYen(rev.monthlyTarget)}`);
    lines.push(`達成率：${rev.achievementRate}%`);
    const holdNames = (c.revCtx.salesHoldCandidates || []).map(h => h.leadName).join('、');
    lines.push(`入金確認・保留：${holdNames || (c.paymentConcern.length ? `${c.paymentConcern.length}件` : 'なし')}`);
    if (c.revenueSummary && c.revenueSummary.compact) {
      const agg = c.revenueSummary;
      const compact = agg.compact;
      const diffSign = compact.monthDiff > 0 ? '+' : '';
      lines.push('（売上集計：確定売上のみ。見込み・候補は含みません）');
      lines.push(`今月確定売上：${RevenueBrain.formatYen(compact.thisMonthTotal)}`);
      lines.push(`先月比：${diffSign}${RevenueBrain.formatYen(compact.monthDiff)}`);
      lines.push(`今年確定売上：${RevenueBrain.formatYen(compact.yearTotal)}`);
      lines.push(`今年月平均：${RevenueBrain.formatYen(compact.yearMonthAvg)}`);
      const topSrc = (compact.topSources || [])[0];
      const topSvc = (compact.topServices || [])[0];
      lines.push(`今月の主力依頼元：${topSrc ? topSrc.name : '—'}`);
      lines.push(`今月の主力サービス：${topSvc ? topSvc.name : '—'}`);
      if (agg.monthly && agg.monthly.length) {
        lines.push('月別確定売上：');
        agg.monthly.slice(0, 6).forEach(m => {
          lines.push(`  ${m.label}：${RevenueBrain.formatYen(m.total)} / ${m.count}件`);
        });
      }
      if (agg.yearly && agg.yearly.length) {
        lines.push('年別確定売上：');
        agg.yearly.slice(0, 3).forEach(y => {
          lines.push(`  ${y.label}：${RevenueBrain.formatYen(y.total)} / ${y.count}件`);
        });
      }
      if (agg.sources && agg.sources.length) {
        lines.push('依頼元別：');
        agg.sources.slice(0, 5).forEach(s => {
          lines.push(`  ${s.name}：${RevenueBrain.formatYen(s.total)} / ${s.count}件（${s.judgment}）`);
        });
      }
      if (agg.services && agg.services.length) {
        lines.push('サービス別：');
        agg.services.slice(0, 5).forEach(s => {
          lines.push(`  ${s.name}：${RevenueBrain.formatYen(s.total)} / ${s.count}件（${s.judgment}）`);
        });
      }
    }
    if (c.profitCtx && c.profitCtx.summary) {
      const ps = c.profitCtx.summary;
      lines.push(`期間内支出：${ProfitBrain.formatYen(ps.monthExpense)}`);
      lines.push(`概算粗利：${ProfitBrain.formatYen(ps.monthGrossProfit)}`);
      lines.push(`粗利率：${ProfitBrain.formatRate(ps.monthGrossRate)}`);
    }
    lines.push('');

    if (c.profitCtx) {
      const profitSection = ProfitBrain.buildReportSection(c.profitCtx, periodLabel);
      if (profitSection) {
        lines.push(profitSection);
        lines.push('');
      }
    }

    if (c.analyticsCtx) {
      const analyticsSection = AnalyticsBrain.buildReportSection(c.analyticsCtx, periodLabel);
      if (analyticsSection) {
        lines.push(analyticsSection);
        const browserPickups = (Storage.getDemandPickups() || []).filter(p =>
          p.source === 'ブラウザー番頭/アナリティクス'
          || p.source === '外部確認/アナリティクス'
        );
        const browserTasks = (Storage.getDailyActionTasksData().manualTasks || []).filter(t =>
          (t.pickupDedupeKey || '').startsWith('browser-bantou|')
          || (t.reason || '') === 'ブラウザー番頭/アナリティクス'
          || (t.reason || '') === '外部確認/アナリティクス'
        );
        if (browserPickups.length) {
          lines.push('需要ピックアップへ送った候補（外部確認）：');
          browserPickups.slice(0, 5).forEach(p => lines.push(`・${p.topic}`));
        }
        if (browserTasks.length) {
          lines.push('毎日やること化した候補（外部確認）：');
          browserTasks.slice(0, 5).forEach(t => lines.push(`・${t.title}`));
        }
        lines.push('');
      }
    }

    lines.push('■ 3. 営業状況');
    lines.push(`営業先件数：${c.activeLeads.length}件（全体${c.revCtx.leads.length}件）`);
    lines.push(`次に動くべき営業先：${c.nextLeads.length ? c.nextLeads.join(' / ') : '—'}`);
    const holdList = (c.revCtx.salesHoldCandidates || []).map(h => h.leadName);
    lines.push(`営業保留：${holdList.length ? holdList.join('、') : 'なし'}`);
    lines.push(`売上につながった営業先：${c.revenueLeads.length ? c.revenueLeads.join('、') : '—'}`);
    lines.push('');

    lines.push('■ 4. 需要・投稿・広告');
    lines.push(`需要ピックアップ件数：${c.summary.pickupCount}件`);
    const demandTop = (c.demandLines || []).slice(0, 3).join(' / ') || '—';
    lines.push(`需要トップ：${demandTop}`);
    const focusText = (c.focusRecs || []).map((f, i) => `${i + 1}.${f.topic}（${f.decisionLabel}）`).join(' / ') || '—';
    lines.push(`今週の集中先：${focusText}`);
    const scheduleText = (c.scheduleItems || []).map(s => s.label || s.title).join(' / ') || '—';
    lines.push(`投稿・広告予定：${scheduleText}`);
    const executed = (c.strategy.postPlan || []).concat(c.strategy.adPlan || []).map(p => p.text).slice(0, 3);
    lines.push(`実行済み施策：${executed.length ? executed.join(' / ') : `${c.summary.executedCount}件`}`);
    lines.push('');

    lines.push('■ 5. 施策成果');
    lines.push(`LINE相談：${lineOrDash(c.perfSummary.lineInquiries, '0')}件`);
    lines.push(`予約：${lineOrDash(c.perfSummary.reservations, '0')}件`);
    lines.push(`施策経由売上：${c.perfSummary.salesAmount ? RevenueBrain.formatYen(c.perfSummary.salesAmount) : '—'}`);
    const growText = c.growEntries.slice(0, 3).map(e => `${e.topic}${e.shortLabel || ''}`).join('、') || '—';
    lines.push(`成果あり施策：${growText}`);
    const improveText = c.improveEntries.slice(0, 3).map(e => `${e.topic}${e.shortLabel || ''}`).join('、') || '—';
    lines.push(`改善必要施策：${improveText}`);
    const stopText = c.stopEntries.slice(0, 3).map(e => `${e.topic}${e.shortLabel || ''}`).join('、') || '—';
    lines.push(`停止候補：${stopText}`);
    lines.push('');

    lines.push('■ 6. 毎日やること・完了状況');
    lines.push(`未完了：${c.tasks.open.map(t => t.title).join('、') || '—'}`);
    lines.push(`完了：${c.tasks.done.map(t => t.title).join('、') || '—'}`);
    lines.push(`明日に回したもの：${c.tasks.snoozed.map(t => t.title).join('、') || '—'}`);
    lines.push(`重要タスク：${c.tasks.important.map(t => t.title).join('、') || '—'}`);
    lines.push('');

    lines.push('■ 7. 注意点');
    const warn = [...c.warnings];
    (c.diagnosticNotes || []).forEach(n => {
      if (!warn.some(w => w.includes(n.split(' ')[0]))) warn.push(n);
    });
    if (!warn.length) {
      lines.push('特になし');
    } else {
      warn.slice(0, 8).forEach(w => lines.push(`・${w}`));
    }
    lines.push('');

    lines.push('■ 8. 次の一手');
    (c.nextActions || []).forEach((a, i) => lines.push(`${i + 1}. ${a.title}`));
    if (!c.nextActions.length) lines.push('1. データを追加してレポートを再生成してください');

    return lines.join('\n');
  }

  function buildChatGptAnalysisPrompt(context) {
    const report = (context && context.reportText) || buildBusinessReportText(context);
    const profile = Storage.getBusinessProfile();
    const areaIndustry = profile && profile.area
      ? `${profile.area}の${profile.industry || '清掃業'}`
      : '沖縄南部の清掃業';
    const profileBlock = Storage.formatBusinessProfileText(profile);
    const intro = [
      '以下はBudilの経営レポートです。',
      `${areaIndustry}として、売上・営業・需要・投稿・広告の状況を見て、次の7日間で優先すべき行動を3〜5個に絞って提案してください。`,
      '売上だけでなく、粗利・支出・広告費・遠方案件も見て、次の7日間の優先行動を提案してください。',
      'GA4/Search Consoleの手入力データから、どのLPを改善すべきか、どの記事・SNS投稿を出すべきか、広告を使うべきかを判断してください。',
      '外部確認レポートのGA4/Search Console/GBPの出力も踏まえて、LP改善・記事/SNS・広告判断をしてください。',
      '毎朝5分で見るべき優先順位として、作業予定・受付・売上/利益・フォロー・アナリティクス需要・注意点を統合して判断してください。',
      '月別・年別・依頼元別・サービス別の売上から、伸ばすべき集客経路とサービスを判断してください。'
    ];
    if (profileBlock) {
      intro.push('');
      intro.push(profileBlock);
    }
    return [
      ...intro,
      '',
      '条件：',
      '- 現場作業があるため、作業量は増やしすぎない',
      '- 売上につながりやすい順に優先',
      '- 投稿・広告・営業を分けて提案',
      '- 無理な値引き前提にしない',
      '- 営業保留や入金注意の案件には追加営業しない',
      '',
      report
    ].join('\n');
  }

  function buildReportTaskDedupeKey(date, period, title) {
    return ['report-action', date, period, title].join('|');
  }

  function isReportActionTaskDuplicate(date, period, title) {
    const key = buildReportTaskDedupeKey(date, period, title);
    return Storage.getDailyActionTasksData().manualTasks.some(t => t.pickupDedupeKey === key);
  }

  function addReportActionTask(actionIndex) {
    const ctx = lastBusinessReportContext || buildBusinessReportContext(businessReportPeriod);
    const action = (ctx.nextActions || [])[actionIndex];
    if (!action) return;
    const date = TODAY();
    const key = buildReportTaskDedupeKey(date, ctx.range.period, action.title);
    if (isReportActionTaskDuplicate(date, ctx.range.period, action.title)) {
      showBusinessReportToast('すでに毎日やることに追加済みです');
      return;
    }
    Storage.addManualDailyTask({
      title: action.title,
      targetName: action.leadName || '—',
      priority: '高',
      action: action.reason || action.title,
      memo: action.reason || '',
      dueDate: date,
      status: 'open',
      reason: action.reason || '経営レポートの次の一手から追加',
      leadId: action.leadId || '',
      leadName: action.leadName || '',
      pickupDedupeKey: key
    });
    renderDailyActionTasks();
    renderExecutiveHome();
    renderMorningDailyTasksBrief();
    renderBusinessReport(document.getElementById('business-report-data') ? 'detail' : 'compact');
    showBusinessReportToast('毎日やることに追加しました');
  }

  function addAllReportActionTasks() {
    const ctx = lastBusinessReportContext || buildBusinessReportContext(businessReportPeriod);
    let added = 0;
    let skipped = 0;
    (ctx.nextActions || []).forEach((action, i) => {
      const date = TODAY();
      const key = buildReportTaskDedupeKey(date, ctx.range.period, action.title);
      if (isReportActionTaskDuplicate(date, ctx.range.period, action.title)) {
        skipped++;
        return;
      }
      Storage.addManualDailyTask({
        title: action.title,
        targetName: action.leadName || '—',
        priority: '高',
        action: action.reason || action.title,
        memo: action.reason || '',
        dueDate: date,
        status: 'open',
        reason: action.reason || '経営レポートの次の一手から追加',
        leadId: action.leadId || '',
        leadName: action.leadName || '',
        pickupDedupeKey: key
      });
      added++;
    });
    renderDailyActionTasks();
    renderExecutiveHome();
    renderMorningDailyTasksBrief();
    renderBusinessReport(document.getElementById('business-report-data') ? 'detail' : 'compact');
    showBusinessReportToast(`追加：${added}件${skipped ? ` / スキップ：${skipped}件` : ''}`);
  }

  function recordBusinessReportGenerated() {
    const settings = Storage.getSettings();
    settings.lastReportGeneratedAt = new Date().toISOString();
    Storage.saveSettings(settings);
  }

  function generateBusinessReport() {
    lastBusinessReportContext = buildBusinessReportContext(businessReportPeriod);
    recordBusinessReportGenerated();
    renderBusinessReport(document.getElementById('business-report-data') ? 'detail' : 'compact');
    if (document.getElementById('business-report-data')) renderBusinessReport('detail');
    if (document.getElementById('business-report-dash')) renderBusinessReport('compact');
  }

  function showBusinessReportToast(message) {
    document.querySelectorAll('.business-report-toast').forEach(el => {
      el.textContent = message;
      el.classList.add('visible');
      setTimeout(() => el.classList.remove('visible'), 2200);
    });
  }

  function copyBusinessReport() {
    const ctx = lastBusinessReportContext || buildBusinessReportContext(businessReportPeriod);
    copyText(ctx.reportText).then(() => showBusinessReportToast('レポートをコピーしました')).catch(() => alert('コピーに失敗しました'));
  }

  function copyChatGptReportPrompt() {
    const ctx = lastBusinessReportContext || buildBusinessReportContext(businessReportPeriod);
    copyText(ctx.chatGptPrompt).then(() => showBusinessReportToast('ChatGPT分析用をコピーしました')).catch(() => alert('コピーに失敗しました'));
  }

  function copyNextActionsOnly() {
    const ctx = lastBusinessReportContext || buildBusinessReportContext(businessReportPeriod);
    copyText(ctx.nextActionsText).then(() => showBusinessReportToast('次の一手をコピーしました')).catch(() => alert('コピーに失敗しました'));
  }

  function renderBusinessReportSummaryCards(summary, revenueSummary) {
    const s = summary || {};
    const compact = revenueSummary && revenueSummary.compact ? revenueSummary.compact : {};
    const cards = [
      { label: '期間内売上', value: RevenueBrain.formatYen(s.periodRevenue || 0) },
      { label: '今月確定売上', value: RevenueBrain.formatYen(compact.thisMonthTotal || 0) },
      { label: '先月比', value: (compact.monthDiff > 0 ? '+' : '') + RevenueBrain.formatYen(compact.monthDiff || 0) },
      { label: '今年確定売上', value: RevenueBrain.formatYen(compact.yearTotal || 0) },
      { label: '今月達成率', value: `${s.monthAchievementRate || 0}%` },
      { label: '需要ピックアップ数', value: s.pickupCount ?? 0 },
      { label: '実行済み施策数', value: s.executedCount ?? 0 },
      { label: '成果あり施策数', value: s.growCount ?? 0 },
      { label: '改善候補数', value: s.improveCount ?? 0 },
      { label: '未完了タスク数', value: s.openTaskCount ?? 0 },
      { label: '概算粗利', value: ProfitBrain.formatYen((s.profitGrossProfit != null ? s.profitGrossProfit : 0)) },
      { label: 'アナリティクス件数', value: s.analyticsCount ?? 0 }
    ];
    return `<div class="business-report-summary-grid">${cards.map(c =>
      `<div class="business-report-summary-card"><span>${esc(c.label)}</span><strong>${esc(String(c.value))}</strong></div>`
    ).join('')}</div>`;
  }

  function renderBusinessReportNextActions(actions, mode) {
    const list = actions || [];
    if (!list.length) {
      return '<p class="placeholder-text">次の一手はまだありません。レポートを生成すると提案が出ます。</p>';
    }
    return `<ol class="business-report-next-actions">${list.map((a, i) => `
      <li class="business-report-next-item">
        <span class="business-report-next-title">${esc(a.title)}</span>
        ${a.reason ? `<span class="business-report-next-reason">${esc(a.reason)}</span>` : ''}
        <button type="button" class="btn btn-sm btn-secondary" data-report-add-action="${i}">この一手を追加</button>
      </li>`).join('')}</ol>
      ${mode === 'detail' ? '<button type="button" class="btn btn-sm btn-primary" id="btn-report-add-all-actions">次の一手を全部追加</button>' : ''}`;
  }

  function renderBusinessReport(mode) {
    const isDetail = mode === 'detail';
    const containerId = isDetail ? 'business-report-data' : 'business-report-dash';
    const el = document.getElementById(containerId);
    if (!el) return;

    if (!lastBusinessReportContext || lastBusinessReportContext.range.period !== businessReportPeriod) {
      lastBusinessReportContext = buildBusinessReportContext(businessReportPeriod);
    }
    const ctx = lastBusinessReportContext;
    const periodBtns = ['today', '7d', 'month', 'all'].map(p =>
      `<button type="button" class="btn btn-sm ${businessReportPeriod === p ? 'btn-primary' : 'btn-secondary'}" data-report-period="${p}">${esc(BUSINESS_REPORT_PERIOD_LABELS[p])}</button>`
    ).join('');

    const reportRows = isDetail ? 22 : 10;
    const reportText = ctx.reportText || buildBusinessReportText(ctx);

    el.innerHTML = `
      <div class="business-report-header">
        <h2>経営メモ</h2>
        <span class="business-report-version">v4.10.1</span>
      </div>
      <p class="business-report-desc">${isDetail
        ? '週次・月次の振り返りと次の作戦をテキストで出力します。ChatGPT / クロクロ / Cursor に貼って追加分析できます。'
        : '直近の経営状況を要約します。詳細はデータ管理画面の経営レポートをご利用ください。'}</p>
      <div class="business-report-period-row">
        <span class="business-report-period-label">レポート期間：</span>
        ${periodBtns}
      </div>
      <button type="button" class="btn btn-primary btn-sm" id="${isDetail ? 'btn-generate-report-detail' : 'btn-generate-report-dash'}">レポート生成</button>
      ${renderBusinessReportSummaryCards(ctx.summary, ctx.revenueSummary)}
      <div class="business-report-next-block">
        <h3>次の一手</h3>
        ${renderBusinessReportNextActions(ctx.nextActions, isDetail ? 'detail' : 'compact')}
      </div>
      <div class="business-report-body-block">
        <h3>レポート本文</h3>
        <textarea class="business-report-text" id="${isDetail ? 'business-report-text-detail' : 'business-report-text-dash'}" readonly rows="${reportRows}">${esc(reportText)}</textarea>
      </div>
      <div class="business-report-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-report-copy="report">レポートをコピー</button>
        <button type="button" class="btn btn-secondary btn-sm" data-report-copy="chatgpt">ChatGPT分析用にコピー</button>
        <button type="button" class="btn btn-secondary btn-sm" data-report-copy="actions">次の一手だけコピー</button>
      </div>
      <p class="business-report-toast" aria-live="polite"></p>
      ${isDetail ? '' : '<p class="business-report-detail-link"><button type="button" class="btn btn-sm btn-secondary" id="btn-go-report-detail">データ管理で詳細を見る</button></p>'}`;

    el.querySelectorAll('[data-report-period]').forEach(btn => {
      btn.addEventListener('click', () => {
        businessReportPeriod = btn.dataset.reportPeriod;
        lastBusinessReportContext = buildBusinessReportContext(businessReportPeriod);
        renderBusinessReport('compact');
        renderBusinessReport('detail');
      });
    });

    const genBtn = el.querySelector(isDetail ? '#btn-generate-report-detail' : '#btn-generate-report-dash');
    if (genBtn) genBtn.addEventListener('click', generateBusinessReport);

    el.querySelectorAll('[data-report-copy]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.reportCopy === 'report') copyBusinessReport();
        else if (btn.dataset.reportCopy === 'chatgpt') copyChatGptReportPrompt();
        else copyNextActionsOnly();
      });
    });

    el.querySelectorAll('[data-report-add-action]').forEach(btn => {
      btn.addEventListener('click', () => addReportActionTask(Number(btn.dataset.reportAddAction)));
    });

    const addAllBtn = el.querySelector('#btn-report-add-all-actions');
    if (addAllBtn) addAllBtn.addEventListener('click', addAllReportActionTasks);

    const goDetailBtn = el.querySelector('#btn-go-report-detail');
    if (goDetailBtn) {
      goDetailBtn.addEventListener('click', () => {
        navigateToView('data');
        setTimeout(() => scrollToElement('#business-report-data'), 120);
      });
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
      const version = result.backupVersion || result.appVersion || '';
      const versionLabel = version ? ' / バックアップ版: ' + version : '';
      meta.textContent = exported + versionLabel + ' / 復元キー: ' + result.keys.length + '件';
    }
    const integrityLines = result.integrity
      ? DataBackup.buildIntegritySummaryLines(result.integrity)
      : [];
    if (list) {
      list.innerHTML = buildDataSummaryItems(summary).concat(integrityLines)
        .map(t => '<li>' + esc(t) + '</li>').join('');
    }
    if (result.integrity) {
      DataBackup.inspectBackupData(result.data, 'restore-preview');
    }
    if (preview) preview.classList.remove('hidden');
  }

  function exportBudilData() {
    const payload = DataBackup.exportPayload();
    DataBackup.inspectBackupData(payload.data, 'export');
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
    renderReceivablesView();
    renderDocumentsView();
    renderProfitView();
    renderMonthlyResultsView();
    renderExternalCheckView();
    renderReceptionView();
    renderWorkOrderView();
    renderFollowUpView();
    renderAreaView();
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
        'このバックアップを復元します。\n' +
        '現在のデータは上書きされます（売上明細・月次実績・作業予定・経費入力を含む）。\n' +
        '必要なら先に現在データをバックアップしてください。\n\n' +
        'よろしいですか？'
      );
      if (!ok) return;

      const beforeIntegrity = DataBackup.inspectCurrentData('pre-restore');
      DataBackup.importData(pendingImport.data, pendingImport.keys);
      const afterIntegrity = DataBackup.inspectCurrentData('post-restore');
      console.info('[Budil Backup] restore compare', { before: beforeIntegrity, after: afterIntegrity });
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
      const ok = confirm(
        '全Budilデータを削除します。売上明細・月次実績・作業予定・経費入力も消えます。\n' +
        'この操作は取り消せません。実行前にバックアップしましたか？\n\n' +
        '本当に実行しますか？'
      );
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

    const runDiagBtn = document.getElementById('btn-run-diagnostics');
    if (runDiagBtn) runDiagBtn.addEventListener('click', runDataDiagnosticsUI);
    const copyDiagBtn = document.getElementById('btn-copy-diagnostics');
    if (copyDiagBtn) copyDiagBtn.addEventListener('click', copyDiagnosticReport);
    const safeNormBtn = document.getElementById('btn-safe-normalize');
    if (safeNormBtn) safeNormBtn.addEventListener('click', runSafeFormatCorrectionUI);

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
    if (greeting) {
      greeting.innerHTML = `
        <div class="budil-avatar">B</div>
        <div class="budil-message">
          <strong>Budilからのメッセージ</strong>
          <p>${esc(report.budilMessage).replace(/\n/g, '<br>')}</p>
        </div>`;
    }

    renderMorningExecutiveSections();

    const decisionsEl = document.getElementById('mgmt-decisions');
    if (decisionsEl) {
      decisionsEl.innerHTML = report.decisions.map(d => `
        <li class="mgmt-decision-item">
          <span class="mgmt-rank">${d.rank}</span>
          <div class="mgmt-decision-body">
            <strong>${esc(d.title)}</strong>
            <span class="mgmt-action-badge">${esc(d.action)}</span>
            ${d.detail ? `<small>${esc(d.detail)}</small>` : ''}
          </div>
        </li>`).join('');
    }

    const areaMorningEl = document.getElementById('mgmt-area-warnings');
    if (areaMorningEl) {
      const mapCtx = getMapContext();
      const lines = MapBrain.buildMorningAreaLines(mapCtx.warnings);
      areaMorningEl.innerHTML = lines.length
        ? `<ul class="mgmt-area-list">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
        : '<p class="placeholder-text">エリア上の注意はありません。</p>';
    }

    const improveTodayEl = document.getElementById('mgmt-improvement-today');
    if (improveTodayEl) {
      const improveLines = DemandBrain.buildMorningImprovementLines(Storage.getDemandPickups(), 2);
      improveTodayEl.innerHTML = improveLines.length
        ? `<p class="mgmt-improvement-label">今日の改善：</p><ul class="mgmt-improvement-list">${improveLines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
        : '';
    }

    const perfTodayEl = document.getElementById('mgmt-performance-today');
    if (perfTodayEl) {
      const ctx = getPerformanceContext();
      const perfLines = DemandBrain.buildMorningPerformanceLines(ctx.pickups, ctx.revenues, ctx.leads, 3);
      perfTodayEl.innerHTML = perfLines.length
        ? `<p class="mgmt-performance-label">施策成果：</p><ul class="mgmt-performance-list">${perfLines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
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
    if (postEl) {
      postEl.innerHTML = `
        <p class="mgmt-highlight">${esc(report.todayPost.theme)}</p>
        <textarea class="mgmt-copy-text" id="mgmt-post-text" readonly rows="4">${esc(report.todayPost.copyText)}</textarea>
        <button class="btn btn-sm btn-copy" data-copy-target="mgmt-post-text">コピー</button>`;
      postEl.querySelector('[data-copy-target]').addEventListener('click', handleMgmtCopy);
    }

    const salesEl = document.getElementById('mgmt-sales');
    if (salesEl) {
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
      salesEl.querySelector('[data-copy-target]').addEventListener('click', handleMgmtCopy);
      const mgmtOpen = salesEl.querySelector('.mgmt-sales-open');
      if (mgmtOpen) {
        mgmtOpen.addEventListener('click', () => openSalesDetail(mgmtOpen.dataset.openLead, { navigate: true }));
      }
    }

    const cautionsEl = document.getElementById('mgmt-cautions');
    if (cautionsEl) {
      cautionsEl.innerHTML = report.cautions.map(c =>
        `<li class="caution-item">⚠ ${esc(c)}</li>`).join('');
    }

    const skipEl = document.getElementById('mgmt-skip');
    if (skipEl) {
      skipEl.innerHTML = report.skipList.map(s =>
        `<li class="skip-item"><strong>${esc(s.item)}</strong><span>理由: ${esc(s.reason)}</span></li>`).join('');
    }

    const revenueEl = document.getElementById('mgmt-revenue');
    if (revenueEl && !revenueEl.innerHTML.trim()) {
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
      const tasks = getExecutiveHomeTasks(3);
      top3Legacy.innerHTML = tasks.length
        ? tasks.map((t, i) => `<li><span class="top3-num">${i + 1}</span> ${esc(t.title)}</li>`).join('')
        : report.tasks.map((t, i) => `<li><span class="top3-num">${i + 1}</span> ${esc(t)}</li>`).join('');
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
      alert('すでに毎日やることに追加済みです');
      return;
    }
    if (!added) {
      alert('追加できるアクション案がありません。投稿・営業・広告案を入力してください。');
      return;
    }
    renderDailyActionTasks();
    renderMorningDailyTasksBrief();
    renderMorningReport();
    let msg = '毎日やることに' + added + '件追加しました。';
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
      alert('すでに毎日やることに追加済みです');
      return;
    }
    if (result === 'empty') {
      alert('追加できるアクション案がありません。');
      return;
    }
    renderDailyActionTasks();
    renderMorningDailyTasksBrief();
    renderMorningReport();
    alert('毎日やることに追加しました。');
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
      alert('すでに毎日やることに追加済みです');
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
    alert('毎日やることに追加しました。');
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
              <button type="button" class="btn btn-sm btn-primary" data-add-content-task="${b.taskType}">毎日やることへ追加</button>
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
      alert('すでに毎日やることに追加済みです');
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
    alert('毎日やることに追加しました。');
  }

  function getPerformanceContext() {
    return {
      pickups: Storage.getDemandPickups(),
      revenues: RevenueBrain.normalizeRevenueRecords(Storage.getRevenueRecords()),
      leads: Storage.getLeads(),
      today: TODAY()
    };
  }

  function formatRevenueRecordLabel(record) {
    if (!record) return '—';
    return `${record.workDate || '—'} / ${RevenueBrain.formatYen(record.amount)} / ${record.service || '—'}`;
  }

  function formatRelatedLeadsText(ids, leads) {
    if (!ids || !ids.length) return '未選択';
    return ids.map(id => {
      const lead = (leads || []).find(l => l.id === id);
      return lead ? lead.company : '削除済み';
    }).join('、');
  }

  function formatRelatedRevenuesText(ids, revenues) {
    if (!ids || !ids.length) return '—';
    return ids.map(id => {
      const rev = (revenues || []).find(r => r.id === id);
      return rev ? formatRevenueRecordLabel(rev) : '削除済み';
    }).join(' / ');
  }

  function performanceJudgmentClassName(judgment) {
    if (judgment === 'has_result') return 'performance-judgment-result';
    if (judgment === 'has_reaction') return 'performance-judgment-reaction';
    if (judgment === 'needs_improvement') return 'performance-judgment-needs';
    return 'performance-judgment-empty';
  }

  function buildLeadSelectOptions(leads, selectedIds) {
    const selected = new Set(selectedIds || []);
    return (leads || []).map(lead =>
      `<option value="${esc(lead.id)}"${selected.has(lead.id) ? ' selected' : ''}>${esc(lead.company)}</option>`
    ).join('');
  }

  function buildRevenueSelectOptions(revenues, selectedIds) {
    const selected = new Set(selectedIds || []);
    return (revenues || []).slice().sort((a, b) => (b.workDate || '').localeCompare(a.workDate || '')).map(rev =>
      `<option value="${esc(rev.id)}"${selected.has(rev.id) ? ' selected' : ''}>${esc(formatRevenueRecordLabel(rev))}</option>`
    ).join('');
  }

  function updatePickupExecution(id, type, patch) {
    const pickup = getPickupRawById(id);
    if (!pickup) return;
    const exec = DemandBrain.normalizeExecutionStatus(pickup);
    const prev = { ...exec[type] };
    const next = { ...prev, ...patch };
    if (patch.metrics) {
      next.metrics = {
        ...DemandBrain.normalizePerformanceMetrics(prev),
        ...patch.metrics,
        updatedAt: new Date().toISOString()
      };
    }
    if (patch.relatedLeadIds) next.relatedLeadIds = patch.relatedLeadIds;
    if (patch.relatedRevenueIds) next.relatedRevenueIds = patch.relatedRevenueIds;
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
    renderPickupPerformanceSections();
    renderPickupDecisionSections();
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
    const perfTodayEl = document.getElementById('mgmt-performance-today');
    if (perfTodayEl) {
      const ctx = getPerformanceContext();
      const perfLines = DemandBrain.buildMorningPerformanceLines(ctx.pickups, ctx.revenues, ctx.leads, 3);
      perfTodayEl.innerHTML = perfLines.length
        ? `<p class="mgmt-performance-label">施策成果：</p><ul class="mgmt-performance-list">${perfLines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
        : '';
    }
    const focusTodayEl = document.getElementById('mgmt-focus-today');
    if (focusTodayEl) {
      const ctx = getPerformanceContext();
      const focusLines = DemandBrain.buildMorningFocusLines(ctx.pickups, ctx.revenues, ctx.leads, 3);
      focusTodayEl.innerHTML = focusLines.length
        ? `<p class="mgmt-focus-label">今週の集中先：</p><ul class="mgmt-focus-list">${focusLines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
        : '';
    }
    renderDashWeeklyPerformance();
    renderDashWeeklyFocus();
    renderDashStopImprove();
    renderWeeklyStrategyBoard();
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
      alert('すでに毎日やることに追加済みです');
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
    alert('毎日やることに追加しました。');
  }

  function isPerformanceTaskDuplicate(date, topic, type, taskKind, title) {
    const key = DemandBrain.buildPerformanceTaskDedupeKey(date, topic, type, taskKind, title);
    return Storage.getDailyActionTasksData().manualTasks.some(t => t.pickupDedupeKey === key);
  }

  function addPerformanceTask(pickupId, type, judgment) {
    const pickup = getPickupRawById(pickupId);
    if (!pickup) return;
    const task = DemandBrain.createPerformanceTaskPayload(pickup, type, judgment);
    if (!task) return;
    const date = TODAY();
    const key = DemandBrain.buildPerformanceTaskDedupeKey(date, task.topic, type, task.taskKind, task.title);
    if (isPerformanceTaskDuplicate(date, task.topic, type, task.taskKind, task.title)) {
      alert('すでに毎日やることに追加済みです');
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
      pickupActionType: 'performance-' + task.taskKind + '-' + type
    });
    renderDailyActionTasks();
    renderMorningDailyTasksBrief();
    renderMorningReport();
    renderDashWeeklyPerformance();
    renderPickupPerformanceSections();
    renderPickupSavedList();
    alert('毎日やることに追加しました。');
  }

  function bindPickupPerformanceEvents(container) {
    if (!container) return;
    container.querySelectorAll('[data-perf-sequel]').forEach(btn => {
      btn.addEventListener('click', () => addPerformanceTask(btn.dataset.perfSequel, btn.dataset.perfType, 'has_result'));
    });
    container.querySelectorAll('[data-perf-improve]').forEach(btn => {
      btn.addEventListener('click', () => addPerformanceTask(btn.dataset.perfImprove, btn.dataset.perfType, 'needs_improvement'));
    });
  }

  function renderPickupPerformanceList() {
    const el = document.getElementById('pickup-performance-list');
    if (!el) return;
    const ctx = getPerformanceContext();
    const insights = DemandBrain.getPerformanceInsights(ctx.pickups, ctx.revenues, ctx.leads, ctx.today);
    if (!insights.total) {
      el.innerHTML = '<p class="placeholder-text">施策成果はまだありません。<br>投稿・LINE・広告を実行したあと、LINE相談数・予約数・売上金額を入れると、勝ちパターンが見えてきます。</p>';
      return;
    }
    el.innerHTML = insights.entries.map(item => `
      <div class="pickup-performance-item ${performanceJudgmentClassName(item.judgment)}">
        <div class="pickup-performance-header">
          <strong>${esc(item.topic)}</strong>
          <span class="pickup-performance-channel">${esc(item.channelLabel)}</span>
          <span class="pickup-performance-judgment ${performanceJudgmentClassName(item.judgment)}">${esc(item.judgmentLabel)}</span>
        </div>
        <p class="pickup-performance-meta">実行日：${esc((item.executedAt || '').slice(0, 10) || '—')}</p>
        <p class="pickup-performance-meta">数値成果：${esc(DemandBrain.formatPerformanceMetricsSummary(item.metrics))}</p>
        ${item.resultMemo ? `<p class="pickup-performance-memo"><span class="reflection-label">反応メモ</span>${esc(item.resultMemo)}</p>` : ''}
        <p class="pickup-performance-meta">関連営業先：${esc(formatRelatedLeadsText(item.relatedLeadIds, ctx.leads))}</p>
        <p class="pickup-performance-meta">関連売上：${esc(formatRelatedRevenuesText(item.relatedRevenueIds, ctx.revenues))}</p>
        ${item.totalSalesAmount ? `<p class="pickup-performance-meta">売上合計：${esc(RevenueBrain.formatYen(item.totalSalesAmount))}</p>` : ''}
        <p class="pickup-performance-comment">${esc(item.recommendation)}</p>
        <p class="pickup-performance-action"><span class="reflection-label">次回アクション</span>${esc(item.nextAction)}</p>
        <div class="pickup-performance-actions">
          ${item.judgment === 'has_result' ? `<button type="button" class="btn btn-sm btn-primary" data-perf-sequel="${esc(item.pickupId)}" data-perf-type="${esc(item.type)}">続編タスクを追加</button>` : ''}
          ${item.judgment === 'needs_improvement' ? `<button type="button" class="btn btn-sm btn-secondary" data-perf-improve="${esc(item.pickupId)}" data-perf-type="${esc(item.type)}">改善タスクを追加</button>` : ''}
        </div>
      </div>`).join('');
    bindPickupPerformanceEvents(el);
  }

  function renderPickupPerformanceRanking() {
    const el = document.getElementById('pickup-performance-ranking');
    if (!el) return;
    const ctx = getPerformanceContext();
    const ranking = DemandBrain.getTopPerformanceRanking(ctx.pickups, ctx.revenues, ctx.leads, 5);
    if (!ranking.length) {
      el.innerHTML = '<p class="placeholder-text">成果が出た施策はまだありません。実行後に数値成果を入力してください。</p>';
      return;
    }
    el.innerHTML = ranking.map((item, i) => `
      <div class="pickup-performance-rank-item">
        <span class="pickup-performance-rank-num">${i + 1}</span>
        <div class="pickup-performance-rank-body">
          <strong>${esc(item.topic)}</strong>
          <span class="pickup-performance-channel">${esc(item.channelLabel)}</span>
          <p class="pickup-performance-meta">LINE相談：${esc(item.metrics?.lineInquiries ?? '—')} / 予約：${esc(item.metrics?.reservations ?? '—')} / 売上：${esc(item.totalSalesAmount ? RevenueBrain.formatYen(item.totalSalesAmount) : (item.metrics?.salesAmount ? RevenueBrain.formatYen(item.metrics.salesAmount) : '—'))}</p>
          <p class="pickup-performance-meta">関連営業先：${esc(formatRelatedLeadsText(item.relatedLeadIds, ctx.leads))}</p>
          <p class="pickup-performance-meta">関連売上：${esc(formatRelatedRevenuesText(item.relatedRevenueIds, ctx.revenues))}</p>
          <p class="pickup-performance-next">次に増やす案：${esc(item.nextGrowPlan)}</p>
        </div>
      </div>`).join('');
  }

  function renderPickupRevenueLinked() {
    const el = document.getElementById('pickup-revenue-linked');
    if (!el) return;
    const ctx = getPerformanceContext();
    const linked = DemandBrain.getRevenueLinkedActions(ctx.pickups, ctx.revenues, ctx.leads);
    if (!linked.length) {
      el.innerHTML = '<p class="placeholder-text">売上につながった施策はまだありません。売上金額または関連売上を紐付けると表示されます。</p>';
      return;
    }
    el.innerHTML = linked.map(item => {
      const revText = formatRelatedRevenuesText(item.relatedRevenueIds, ctx.revenues);
      const revLine = revText !== '—' ? revText.split(' / ')[0] : '';
      return `
      <div class="pickup-revenue-linked-item">
        <strong>${esc(item.topic)} ${esc(item.shortLabel)}</strong>
        <p class="pickup-performance-meta">売上：${esc(RevenueBrain.formatYen(item.totalSalesAmount || 0))}</p>
        ${revLine ? `<p class="pickup-performance-meta">関連売上：${esc(revLine)}</p>` : ''}
        <p class="pickup-performance-next">次：${esc(item.nextAction)}</p>
      </div>`;
    }).join('');
  }

  function renderPickupPerformanceImprove() {
    const el = document.getElementById('pickup-performance-improve');
    if (!el) return;
    const ctx = getPerformanceContext();
    const candidates = DemandBrain.getPerformanceImprovementCandidates(ctx.pickups, ctx.revenues, ctx.leads);
    if (!candidates.length) {
      el.innerHTML = '<p class="placeholder-text">改善が必要な施策はまだありません。実行後の成果を入力すると判定されます。</p>';
      return;
    }
    el.innerHTML = candidates.map(c => `
      <div class="pickup-performance-improve-item">
        <strong>${esc(c.topic)} ${c.type === 'ad' ? esc(c.channelLabel) : esc(c.shortLabel)}</strong>
        <p class="pickup-performance-meta">結果：${esc(c.resultSummary)}</p>
        <p class="pickup-performance-next">改善：${esc(c.improvePlan)}</p>
        <button type="button" class="btn btn-sm btn-primary" data-perf-improve="${esc(c.pickupId)}" data-perf-type="${esc(c.type)}">改善タスクを追加</button>
      </div>`).join('');
    bindPickupPerformanceEvents(el);
  }

  function renderPickupPerformanceSections() {
    renderPickupPerformanceList();
    renderPickupPerformanceRanking();
    renderPickupRevenueLinked();
    renderPickupPerformanceImprove();
  }

  function decisionJudgmentClassName(decision) {
    if (decision === 'grow') return 'decision-judgment-grow';
    if (decision === 'continue') return 'decision-judgment-continue';
    if (decision === 'improve') return 'decision-judgment-improve';
    if (decision === 'stop') return 'decision-judgment-stop';
    return 'decision-judgment-watch';
  }

  function formatDecisionSalesText(item) {
    const total = item.totalSalesAmount || 0;
    if (total > 0) return RevenueBrain.formatYen(total);
    const m = item.metrics || {};
    if (m.salesAmount) return RevenueBrain.formatYen(m.salesAmount);
    return '—';
  }

  function isDecisionTaskDuplicate(date, topic, type, decisionLabel, title) {
    const key = DemandBrain.buildDecisionTaskDedupeKey(date, topic, type, decisionLabel, title);
    return Storage.getDailyActionTasksData().manualTasks.some(t => t.pickupDedupeKey === key);
  }

  function addDecisionTask(pickupId, type) {
    const pickup = getPickupRawById(pickupId);
    if (!pickup) return;
    const ctx = getPerformanceContext();
    const decision = DemandBrain.evaluateActionDecision(pickup, type, ctx.revenues, ctx.leads);
    const task = DemandBrain.createDecisionTaskPayload(decision);
    if (!task) {
      alert('この判断からはタスクを作成できません');
      return;
    }
    const date = TODAY();
    const key = DemandBrain.buildDecisionTaskDedupeKey(date, task.topic, type, task.decisionLabel, task.title);
    if (isDecisionTaskDuplicate(date, task.topic, type, task.decisionLabel, task.title)) {
      alert('すでに毎日やることに追加済みです');
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
      pickupActionType: 'decision-' + decision.decision + '-' + type
    });
    renderDailyActionTasks();
    renderMorningDailyTasksBrief();
    renderMorningReport();
    renderDashWeeklyFocus();
    renderDashStopImprove();
    renderPickupDecisionSections();
    renderPickupSavedList();
    alert('毎日やることに追加しました。');
  }

  function bindPickupDecisionEvents(container) {
    if (!container) return;
    container.querySelectorAll('[data-decision-task]').forEach(btn => {
      btn.addEventListener('click', () => addDecisionTask(btn.dataset.decisionTask, btn.dataset.decisionType));
    });
  }

  function renderPickupDecisionList() {
    const el = document.getElementById('pickup-decision-list');
    if (!el) return;
    const ctx = getPerformanceContext();
    const insights = DemandBrain.getActionDecisionInsights(ctx.pickups, ctx.revenues, ctx.leads, ctx.today);
    if (!insights.total) {
      el.innerHTML = '<p class="placeholder-text">施策判断はまだありません。<br>投稿・LINE・広告の成果を入力すると、「増やす / 続ける / 改善 / 停止候補」が表示されます。</p>';
      return;
    }
    el.innerHTML = insights.entries.map(item => `
      <div class="pickup-decision-item ${decisionJudgmentClassName(item.decision)}">
        <div class="pickup-decision-header">
          <strong>${esc(item.topic)}</strong>
          <span class="pickup-decision-channel">${esc(item.channelLabel)}</span>
          <span class="pickup-decision-label ${decisionJudgmentClassName(item.decision)}">${esc(item.decisionLabel)}</span>
          <span class="pickup-decision-score">スコア ${item.focusScore}</span>
        </div>
        <p class="pickup-decision-meta">関連サービス：${esc((item.relatedServices || []).join('、') || '—')}</p>
        <p class="pickup-decision-meta">成果：${esc(item.performanceSummary)}</p>
        <p class="pickup-decision-meta">売上：${esc(formatDecisionSalesText(item))}</p>
        <p class="pickup-decision-reason"><span class="reflection-label">理由</span>${esc(item.reason)}</p>
        <p class="pickup-decision-next"><span class="reflection-label">次の一手</span>${esc(item.nextStep)}</p>
        ${['grow', 'improve', 'stop', 'continue'].includes(item.decision) ? `
        <div class="pickup-decision-actions">
          <button type="button" class="btn btn-sm btn-primary" data-decision-task="${esc(item.pickupId)}" data-decision-type="${esc(item.type)}">毎日やることに追加</button>
        </div>` : ''}
      </div>`).join('');
    bindPickupDecisionEvents(el);
  }

  function renderPickupServiceFocus() {
    const el = document.getElementById('pickup-service-focus');
    if (!el) return;
    const ctx = getPerformanceContext();
    const services = DemandBrain.getServiceFocusInsights(ctx.pickups, ctx.revenues, ctx.leads);
    if (!services.length) {
      el.innerHTML = '<p class="placeholder-text">サービス別の勝ち筋はまだありません。施策成果を入力すると集計されます。</p>';
      return;
    }
    el.innerHTML = services.map(s => `
      <div class="pickup-service-focus-item ${decisionJudgmentClassName(s.decision)}">
        <strong class="pickup-service-focus-name">${esc(s.service)}</strong>
        <span class="pickup-decision-label ${decisionJudgmentClassName(s.decision)}">${esc(s.decisionLabel)}</span>
        <p class="pickup-decision-meta">施策数：${s.actionCount} / LINE相談：${s.lineInquiries}件 / 予約：${s.reservations}件</p>
        <p class="pickup-decision-meta">売上：${esc(s.salesAmount ? RevenueBrain.formatYen(s.salesAmount) : '—')}</p>
        <p class="pickup-decision-next">次：${esc(s.nextStep)}</p>
      </div>`).join('');
  }

  function renderPickupDecisionSections() {
    renderPickupDecisionList();
    renderPickupServiceFocus();
  }

  function renderDashWeeklyFocus() {
    const el = document.getElementById('dash-weekly-focus');
    if (!el) return;
    const ctx = getPerformanceContext();
    const recs = DemandBrain.getFocusRecommendations(ctx.pickups, ctx.revenues, ctx.leads, 3, ctx.today);
    if (!recs.length) {
      el.innerHTML = '<p class="placeholder-text">投稿・広告の成果を入力すると、今週の集中先が表示されます。</p>';
      return;
    }
    el.innerHTML = recs.map((item, i) => {
      const svc = (item.relatedServices || [])[0] || '';
      const svcPart = svc ? ` × ${svc}` : '';
      return `
      <div class="dash-focus-item">
        <span class="dash-focus-rank">${i + 1}</span>
        <div class="dash-focus-body">
          <strong>${esc(item.topic)}${esc(svcPart)}</strong>
          <p class="dash-focus-meta">判断：<span class="pickup-decision-label ${decisionJudgmentClassName(item.decision)}">${esc(item.decisionLabel)}</span> / スコア ${item.focusScore}</p>
          <p class="dash-focus-meta">理由：${esc(item.reason)}</p>
          <p class="dash-focus-next">次：${esc(item.nextStep)}</p>
        </div>
      </div>`;
    }).join('');
  }

  function renderDashStopImprove() {
    const el = document.getElementById('dash-stop-improve');
    if (!el) return;
    const ctx = getPerformanceContext();
    const candidates = DemandBrain.getStopOrImproveCandidates(ctx.pickups, ctx.revenues, ctx.leads);
    if (!candidates.length) {
      el.innerHTML = '<p class="placeholder-text">改善・停止候補はまだありません。</p>';
      return;
    }
    el.innerHTML = candidates.slice(0, 5).map(c => `
      <div class="dash-stop-improve-item ${decisionJudgmentClassName(c.decision)}">
        <strong>${esc(c.topic)} ${c.type === 'ad' ? esc(c.channelLabel) : esc(c.shortLabel)}</strong>
        <p class="dash-focus-meta">判断：<span class="pickup-decision-label ${decisionJudgmentClassName(c.decision)}">${esc(c.decisionLabel)}</span></p>
        <p class="dash-focus-meta">理由：${esc(c.reason)}</p>
        <p class="dash-focus-next">次：${esc(c.nextStep)}</p>
        <button type="button" class="btn btn-sm btn-secondary" data-decision-task="${esc(c.pickupId)}" data-decision-type="${esc(c.type)}">毎日やることに追加</button>
      </div>`).join('');
    bindPickupDecisionEvents(el);
  }

  function renderDashWeeklyPerformance() {
    const el = document.getElementById('dash-weekly-performance');
    if (!el) return;
    const ctx = getPerformanceContext();
    const summary = DemandBrain.getWeeklyPerformanceSummary(ctx.pickups, ctx.today, ctx.revenues, ctx.leads);
    if (!summary.hasData) {
      el.innerHTML = '<p class="placeholder-text">投稿・広告の成果を入れると、ここに今週の反応が出ます。</p>';
      return;
    }
    const lines = [];
    if (summary.lineInquiries) lines.push(`LINE相談 ${summary.lineInquiries}件`);
    if (summary.reservations) lines.push(`予約 ${summary.reservations}件`);
    if (summary.salesAmount) lines.push(`施策経由売上 ${summary.salesAmount.toLocaleString('ja-JP')}円`);
    summary.highlights.forEach(h => lines.push(`成果あり：${h}`));
    el.innerHTML = `<ul class="dash-weekly-performance-list">${lines.map(l => `<li>・${esc(l)}</li>`).join('')}</ul>`;
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
      alert('毎日やることに追加しました。');
    } else {
      alert('すでに毎日やることに追加済みです');
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

    const winningHtml = (strategy.winningPatterns || []).length || (strategy.revenueLinked || []).length
      ? `<div class="weekly-strategy-block weekly-strategy-sub">
          <h3>勝ちパターン候補</h3>
          <ul class="weekly-strategy-bullets">${[
            ...(strategy.winningPatterns || []).slice(0, 2).map(w =>
              `<li>・${esc(w.topic)}（${esc(w.channelLabel)}）— ${esc(w.resultMemo || '反応あり')}</li>`
            ),
            ...(strategy.revenueLinked || []).slice(0, 2).map(r =>
              `<li>・${esc(r.topic)}（${esc(r.shortLabel)}）— 売上${esc(RevenueBrain.formatYen(r.totalSalesAmount || 0))}</li>`
            )
          ].join('')}</ul>
        </div>`
      : '';

    const improveHtml = (strategy.improvementCandidates || []).length || (strategy.performanceImprovements || []).length || (strategy.stopOrImproveCandidates || []).length
      ? `<div class="weekly-strategy-block weekly-strategy-sub">
          <h3>改善が必要なもの</h3>
          <ul class="weekly-strategy-bullets">${[
            ...(strategy.improvementCandidates || []).slice(0, 2).map(c =>
              `<li>・${esc(c.topic)}（${esc(c.channelLabel)}）— ${esc(c.resultMemo || '改善必要')}</li>`
            ),
            ...(strategy.performanceImprovements || []).slice(0, 2).map(c =>
              `<li>・${esc(c.topic)}（${esc(c.shortLabel)}）— ${esc(c.resultSummary || '改善必要')}</li>`
            ),
            ...(strategy.stopOrImproveCandidates || []).filter(c => c.decision === 'improve').slice(0, 2).map(c =>
              `<li>・${esc(c.topic)}（${esc(c.shortLabel)}）— ${esc(c.decisionLabel)}：${esc(c.reason.split('。')[0])}</li>`
            )
          ].join('')}</ul>
        </div>`
      : '';

    const skipHtml = (strategy.stopOrImproveCandidates || []).filter(c => c.decision === 'stop').length
      ? `<div class="weekly-strategy-block weekly-strategy-sub">
          <h3>今週やらない候補</h3>
          <ul class="weekly-strategy-bullets">${strategy.stopOrImproveCandidates.filter(c => c.decision === 'stop').slice(0, 3).map(c =>
            `<li>・${esc(c.topic)}（${esc(c.shortLabel)}）— ${esc(c.reason.split('。')[0])}</li>`
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
              <button type="button" class="btn btn-sm btn-secondary" data-weekly-task-add="${i}">毎日やることに追加</button>
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
        ${skipHtml}
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
    const ctx = getPerformanceContext();
    const hasOutput = DemandBrain.hasGeneratedOutput(pickup, type);
    const statusLabel = DemandBrain.getExecutionStatusLabel(type, execItem.status);
    const statusOptions = meta.statuses.map(s =>
      `<option value="${s.value}"${execItem.status === s.value ? ' selected' : ''}>${esc(s.label)}</option>`
    ).join('');
    const outputHint = hasOutput
      ? '<span class="exec-row-has-output">文案あり</span>'
      : '<span class="exec-row-no-output">文案未生成</span>';
    const showResultFields = DemandBrain.isExecutionDone(type, execItem.status);
    const metrics = DemandBrain.normalizePerformanceMetrics(execItem);
    const metricField = (key, label, placeholder) => `
      <div class="pickup-exec-field">
        <label>${esc(label)}</label>
        <input type="number" min="0" data-exec-metric="${key}" value="${metrics[key] !== null ? metrics[key] : ''}" placeholder="${esc(placeholder)}">
      </div>`;
    const leadOptions = buildLeadSelectOptions(ctx.leads, execItem.relatedLeadIds);
    const revenueOptions = buildRevenueSelectOptions(ctx.revenues, execItem.relatedRevenueIds);

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
          <div class="pickup-exec-metrics-grid">
            ${metricField('views', '表示数 / 再生数', '1200')}
            ${metricField('reactions', 'いいね / 保存 / 反応数', '25')}
            ${metricField('clicks', 'クリック数', '8')}
            ${metricField('lineInquiries', 'LINE相談数', '1')}
            ${metricField('reservations', '予約数', '1')}
            ${metricField('salesAmount', '売上金額', '14000')}
          </div>
          <div class="pickup-exec-field pickup-exec-field-wide">
            <label>成果メモ</label>
            <input type="text" data-exec-field="resultMemo" value="${esc(execItem.resultMemo || '')}" placeholder="例：反応あり、LINE相談1件">
          </div>
          <div class="pickup-exec-field pickup-exec-field-wide">
            <label>次回改善メモ</label>
            <input type="text" data-exec-field="nextImproveMemo" value="${esc(execItem.nextImproveMemo || '')}" placeholder="例：次回は実写多め">
          </div>
          <div class="pickup-exec-field pickup-exec-field-wide">
            <label>関連営業先（Ctrl+クリックで複数選択）</label>
            <select multiple data-exec-field="relatedLeadIds" class="pickup-exec-multiselect">${leadOptions || '<option disabled>営業先未登録</option>'}</select>
          </div>
          <div class="pickup-exec-field pickup-exec-field-wide">
            <label>関連売上（Ctrl+クリックで複数選択）</label>
            <select multiple data-exec-field="relatedRevenueIds" class="pickup-exec-multiselect">${revenueOptions || '<option disabled>売上未登録</option>'}</select>
          </div>` : ''}
        </div>
        <div class="pickup-exec-row-actions">
          <span class="pickup-exec-status-label">${esc(statusLabel)}</span>
          ${execItem.executedAt ? `<span class="pickup-exec-done-date">実行日：${esc(execItem.executedAt)}</span>` : ''}
          <button type="button" class="btn btn-sm btn-primary" data-exec-add-task="${type}">毎日やることに追加</button>
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
        if (field === 'relatedLeadIds' || field === 'relatedRevenueIds') {
          input.addEventListener('change', () => {
            const values = Array.from(input.selectedOptions).map(o => o.value).filter(Boolean);
            saveField(field, values);
          });
          return;
        }
        const eventName = input.tagName === 'SELECT' ? 'change' : 'change';
        input.addEventListener(eventName, () => {
          saveField(field, input.value);
          if (field === 'status') {
            renderPickupExecutionManagement();
          }
        });
        if (input.tagName === 'INPUT' && (input.type === 'text' || input.type === 'date')) {
          input.addEventListener('blur', () => saveField(field, input.value));
        }
      });
      row.querySelectorAll('[data-exec-metric]').forEach(input => {
        const metricKey = input.dataset.execMetric;
        const saveMetric = () => {
          const raw = input.value.trim();
          const val = raw === '' ? null : Number(raw);
          updatePickupExecution(pickupId, type, {
            metrics: { [metricKey]: Number.isFinite(val) ? val : null }
          });
        };
        input.addEventListener('change', saveMetric);
        input.addEventListener('blur', saveMetric);
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
      alert('毎日やることに追加しました。');
    } else {
      alert('すでに毎日やることに追加済みです');
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
              ${!item.completed ? `<button type="button" class="btn btn-sm btn-primary" data-cal-add-daily="${esc(item.id)}">毎日やることに追加</button>` : ''}
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
            <button type="button" class="btn btn-sm btn-primary" data-pickup-add-all="${esc(p.id)}">毎日やることに追加</button>
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

  // ── 予約・作業予定番頭 ──
  function fillWorkOrderSelects() {
    const intakeEl = document.getElementById('work-order-intake');
    const leadEl = document.getElementById('work-order-lead');
    const areaEl = document.getElementById('work-order-area');
    const sourceEl = document.getElementById('work-order-source');
    if (areaEl && !areaEl.options.length) fillAreaSelectOptions(areaEl, '');
    fillSourceSelectOptions(sourceEl, sourceEl ? sourceEl.value : '', { blankLabel: '未選択' });
    if (intakeEl) {
      const selected = intakeEl.value;
      const intakes = Storage.getReceptionIntakes();
      intakeEl.innerHTML = '<option value="">なし</option>' +
        intakes.map(i => `<option value="${esc(i.id)}">${esc(i.customerName || i.id)}</option>`).join('');
      if (selected) intakeEl.value = selected;
    }
    if (leadEl) {
      const selected = leadEl.value;
      const leads = Storage.getLeads().slice().sort((a, b) => (a.company || '').localeCompare(b.company || '', 'ja'));
      leadEl.innerHTML = '<option value="">なし</option>' +
        leads.map(l => `<option value="${esc(l.id)}">${esc(l.company)}</option>`).join('');
      if (selected) leadEl.value = selected;
    }
  }

  function setWorkOrderFormData(workOrder) {
    fillWorkOrderSelects();
    const wo = WorkOrderBrain.normalizeWorkOrder(workOrder);
    document.getElementById('work-order-edit-id').value = wo.id || '';
    document.getElementById('work-order-customer').value = wo.customerName || '';
    document.getElementById('work-order-phone').value = wo.phone || '';
    document.getElementById('work-order-address').value = wo.address || '';
    fillAreaSelectOptions(document.getElementById('work-order-area'), wo.area || MapBrain.detectAreaFromAddress(wo.address));
    fillSourceSelectOptions(document.getElementById('work-order-source'), wo.source || '', { blankLabel: '未選択' });
    document.getElementById('work-order-service').value = wo.serviceText || '';
    document.getElementById('work-order-date').value = wo.scheduledDate || '';
    document.getElementById('work-order-start').value = wo.startTime || '';
    document.getElementById('work-order-end').value = wo.endTime || '';
    document.getElementById('work-order-status').value = wo.status || 'tentative';
    document.getElementById('work-order-amount').value = wo.estimateAmount || '';
    document.getElementById('work-order-memo').value = wo.memo || '';
    document.getElementById('work-order-intake').value = wo.intakeId || '';
    document.getElementById('work-order-lead').value = wo.leadId || '';
    const mapEl = document.getElementById('work-order-form-map-actions');
    if (mapEl) {
      mapEl.innerHTML = renderMapActionsHtml(wo.address, { area: wo.area });
      bindMapActionEvents(mapEl);
    }
    updateWorkOrderCalendarHint();
  }

  function clearWorkOrderForm() {
    document.getElementById('work-order-edit-id').value = '';
    document.getElementById('work-order-form').reset();
    fillWorkOrderSelects();
    const areaEl = document.getElementById('work-order-area');
    if (areaEl) areaEl.dataset.manual = '';
    syncWorkOrderAreaFromAddress();
  }

  function saveWorkOrderFromForm() {
    const id = document.getElementById('work-order-edit-id').value;
    const data = getWorkOrderFormData();
    if (!data.customerName) {
      alert('お客様名を入力してください');
      return null;
    }
    if (id) {
      Storage.updateWorkOrder(id, data);
      const saved = Storage.getWorkOrders().find(w => w.id === id);
      if (saved && saved.intakeId) linkReceptionToWorkOrder(saved.intakeId, saved.id);
      return saved;
    }
    const saved = Storage.addWorkOrder(data);
    if (saved && saved.intakeId) linkReceptionToWorkOrder(saved.intakeId, saved.id);
    return saved;
  }

  function createWorkOrderFromIntake(intakeId) {
    const intake = Storage.getReceptionIntakes().find(i => i.id === intakeId);
    if (!intake) return;
    const existingState = getReceptionWorkflowState(intake);
    if (existingState.workOrder) {
      openWorkOrderFromReceptionIntake(intakeId);
      alert('この受付には既に作業予定があります。既存の作業予定を開きます。');
      return;
    }
    const payload = WorkOrderBrain.createFromIntake(intake);
    const workOrder = Storage.addWorkOrder(payload);
    linkReceptionToWorkOrder(intakeId, workOrder.id);
    navigateToView('calendar-registration');
    setTimeout(() => scrollToElement('#work-order-form'), 120);
    setWorkOrderFormData(workOrder);
    clearReceptionDraftInputs({ renderNext: false });
    renderReceptionView();
    renderWorkOrderView();
    renderDashboard();
    alert('作業予定を作成しました。内容を確認して保存してください。');
  }

  function createWorkOrderFromLead(leadId) {
    const lead = Storage.getLeads().find(l => l.id === leadId);
    if (!lead) return;
    const payload = WorkOrderBrain.createFromLead(lead);
    navigateToView('calendar-registration');
    setTimeout(() => scrollToElement('#work-order-form'), 120);
    setWorkOrderFormData(payload);
    scrollToElement('#work-order-form');
    alert('営業先の情報を作業予定フォームに反映しました。');
  }

  function getCalendarCandidateSummary() {
    if (typeof CalendarCandidateBrain === 'undefined') return null;
    return CalendarCandidateBrain.summarizeCandidates(Storage.getWorkOrders(), TODAY());
  }

  function getCalendarPastRecoveryOptions() {
    const enabled = PAST_RECOVERY_UI_ENABLED
      && document.getElementById('calendar-past-recovery-mode')?.checked === true;
    return {
      enabled,
      startDate: document.getElementById('calendar-past-recovery-start')?.value || '',
      endDate: document.getElementById('calendar-past-recovery-end')?.value || '',
      today: TODAY()
    };
  }

  function getCalendarPastRecoveryReport(includePreview) {
    if (typeof CalendarCandidateBrain === 'undefined') return null;
    const options = getCalendarPastRecoveryOptions();
    const revenues = Storage.getRevenueRecords();
    const savedReport = CalendarCandidateBrain.buildPastRecoveryReport(
      Storage.getWorkOrders(),
      revenues,
      options
    );
    if (!includePreview || !options.enabled) return savedReport;
    if (!lastCalendarCandidatePreview || !(lastCalendarCandidatePreview.items || []).length) {
      return savedReport;
    }
    return CalendarCandidateBrain.mergePastRecoveryReports(
      savedReport,
      CalendarCandidateBrain.buildPastRecoveryReportFromPreview(
        lastCalendarCandidatePreview,
        revenues,
        options
      )
    );
  }

  function renderCalendarCandidatePrompt() {
    const el = document.getElementById('calendar-candidate-prompt-preview');
    if (!el || typeof CalendarCandidateBrain === 'undefined') return;
    const past = getCalendarPastRecoveryOptions();
    const periodLabel = past.enabled
      ? `${past.startDate || '開始未指定'}〜${past.endDate || '終了未指定'}（過去分復元モード）`
      : '今日以降（今週と来週を中心）';
    const prompt = CalendarCandidateBrain.buildBrowserPrompt({
      periodLabel,
      pastRecoveryMode: past.enabled
    });
    el.textContent = prompt;
  }

  function resolveCalendarCandidateSaveExtras(item, preview) {
    const dedupeKey = (item.pastRecovery && item.pastRecovery.calendarDedupeKey)
      || (item.candidate && item.candidate.calendarDedupeKey)
      || '';
    const importSource = preview && preview.sourceFormat === 'budil-calendar-json'
      ? CalendarCandidateBrain.JSON_IMPORT_SOURCE
      : CalendarCandidateBrain.IMPORT_SOURCE;
    return {
      originalText: preview ? preview.rawText : '',
      candidateStatus: getCalendarImportCandidateStatus(item),
      calendarDedupeKey: dedupeKey,
      importSource
    };
  }

  function applyCalendarCandidateParsed(parsed) {
    if (typeof CalendarCandidateBrain === 'undefined') return;
    lastCalendarCandidateImportResult = null;
    lastCalendarCandidatePreview = CalendarCandidateBrain.buildImportPreview(parsed, Storage.getWorkOrders());
    const past = getCalendarPastRecoveryOptions();
    if (past.enabled) {
      lastCalendarCandidatePreview = CalendarCandidateBrain.attachPastRecoveryPreview(
        lastCalendarCandidatePreview,
        Storage.getRevenueRecords(),
        past
      );
      renderCalendarCandidateImportResult(null);
    } else {
      lastCalendarCandidatePreview = CalendarCandidateBrain.attachFutureImportPreview(
        lastCalendarCandidatePreview,
        TODAY()
      );
      const summary = getCalendarFutureImportSummary(lastCalendarCandidatePreview);
      renderCalendarCandidateImportResult(summary, { phase: 'preview' });
    }
    renderCalendarCandidatePreview();
  }

  function parseCalendarCandidatePaste() {
    const text = document.getElementById('calendar-candidate-paste')?.value || '';
    if (typeof CalendarCandidateBrain === 'undefined') return;
    const parsed = CalendarCandidateBrain.parseCalendarText(text);
    applyCalendarCandidateParsed(parsed);
  }

  function handleCalendarCandidateJsonFile(file) {
    if (!file || typeof CalendarCandidateBrain === 'undefined') return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = CalendarCandidateBrain.parseBudilCalendarEventsJson(reader.result);
      if ((parsed.errors || []).length) {
        alert(parsed.errors.join('\n'));
        return;
      }
      applyCalendarCandidateParsed(parsed);
    };
    reader.onerror = () => alert('JSONファイルの読み込みに失敗しました');
    reader.readAsText(file, 'utf-8');
  }

  function renderCalendarCandidatePreview() {
    const previewPanel = document.getElementById('calendar-candidate-preview');
    const errorsEl = document.getElementById('calendar-candidate-errors');
    const listEl = document.getElementById('calendar-candidate-preview-list');
    const saveAllBtn = document.getElementById('btn-calendar-candidate-save-all');
    const preview = lastCalendarCandidatePreview;
    if (!previewPanel || !preview) return;
    previewPanel.classList.remove('hidden');
    const past = getCalendarPastRecoveryOptions();
    const msgs = [...(preview.warnings || []), ...(preview.errors || [])];
    if (errorsEl) {
      errorsEl.innerHTML = msgs.length
        ? `<ul class="calendar-candidate-error-list">${msgs.map(m =>
          `<li class="${(preview.errors || []).includes(m) ? 'is-error' : 'is-warning'}">${esc(m)}</li>`
        ).join('')}</ul>`
        : '';
    }
    if (listEl) {
      const previewItems = (preview.items || [])
        .map((item, originalIndex) => ({ item, originalIndex }))
        .sort((a, b) => {
          const ca = (a.item.candidate || {});
          const cb = (b.item.candidate || {});
          return WorkOrderBrain.compareScheduledDateTimeAsc(
            { scheduledDate: ca.scheduledDate, startTime: ca.startTime, endTime: ca.endTime, createdAt: ca.createdAt },
            { scheduledDate: cb.scheduledDate, startTime: cb.startTime, endTime: cb.endTime, createdAt: cb.createdAt }
          );
        });
      listEl.innerHTML = previewItems.length
        ? previewItems.map(({ item, originalIndex }) => {
          const c = item.candidate;
          const isExcluded = item.futureImport && item.futureImport.status === 'excluded';
          const dup = item.isDuplicate
            ? `<p class="calendar-candidate-dup">${esc((item.duplicates[0] && item.duplicates[0].reason) || '重複の可能性')}</p>`
            : '';
          const excluded = isExcluded
            ? `<p class="calendar-candidate-dup">${esc((item.futureImport.reasons || []).join(' / '))}（保存対象外）</p>`
            : '';
          const past = item.pastRecovery;
          const pastStatus = past
            ? `<span class="calendar-past-recovery-badge">${esc(past.label)}</span>
              ${(past.reasons || []).length ? `<p class="calendar-candidate-dup">${esc(past.reasons.join(' / '))}</p>` : ''}`
            : '';
          const notice = past && past.status === CalendarCandidateBrain.PAST_RECOVERY_REVENUE_CANDIDATE
            ? '過去分復元モード：売上実績候補です（一括登録前は売上ではありません）'
            : '作業予定として保存されます（売上確定は作業後）';
          const itemWarnings = (item.warnings || []).length
            ? `<p class="calendar-candidate-dup">${esc(item.warnings.join(' / '))}</p>`
            : '';
          const saveDisabled = item.isDuplicate || isExcluded;
          return `<div class="calendar-candidate-preview-item${item.isDuplicate ? ' is-duplicate' : ''}${isExcluded ? ' is-excluded' : ''}">
            <p class="calendar-candidate-preview-title"><strong>${esc(c.customerName || '（名前なし）')}</strong> / ${esc(c.serviceText || '—')}</p>
            <p class="calendar-candidate-preview-meta">${esc(c.scheduledDate || '日付不明')} ${esc(c.startTime || '')}〜${esc(c.endTime || '')} / ${esc(c.source || '—')} / 見込み ${esc(WorkOrderBrain.formatYen(c.estimateAmount))}</p>
            <p class="calendar-candidate-not-sale">${esc(notice)}</p>
            ${pastStatus}
            ${itemWarnings}
            ${excluded}
            ${dup}
            <button type="button" class="btn btn-sm btn-primary" data-cal-save-one="${originalIndex}"${saveDisabled ? ' disabled' : ''}>作業予定として保存</button>
          </div>`;
        }).join('')
        : '<p class="placeholder-text">解析結果がありません</p>';
      listEl.querySelectorAll('[data-cal-save-one]').forEach(btn => {
        btn.addEventListener('click', () => saveCalendarCandidateOne(Number(btn.dataset.calSaveOne)));
      });
    }
    if (saveAllBtn) {
      const summary = getCalendarFutureImportSummary(preview);
      const hasSavable = past.enabled
        ? (preview.items || []).length > 0
        : summary.savableCount > 0;
      saveAllBtn.disabled = !hasSavable || (preview.errors || []).length > 0;
    }
  }

  function getCalendarImportCandidateStatus(item) {
    if (item.pastRecovery && item.pastRecovery.status) return item.pastRecovery.status;
    return '作業予定に追加済み';
  }

  function saveCalendarCandidateOne(index, force) {
    const preview = lastCalendarCandidatePreview;
    const item = preview && preview.items ? preview.items[index] : null;
    if (!item) return;
    const past = getCalendarPastRecoveryOptions();
    if (!past.enabled && item.futureImport && item.futureImport.status === 'excluded') {
      alert(`対象外のため保存しません（${(item.futureImport.reasons || []).join(' / ')}）`);
      return;
    }
    if (item.isDuplicate && !force) {
      if (!confirm('重複の可能性があります。それでも候補として保存しますか？')) return;
    }
    const payload = CalendarCandidateBrain.createWorkOrderPayload(
      item.candidate,
      resolveCalendarCandidateSaveExtras(item, preview)
    );
    Storage.addWorkOrder(payload);
    const summary = getCalendarFutureImportSummary(preview);
    summary.savedCount = 1;
    lastCalendarCandidateImportResult = summary;
    lastCalendarCandidatePreview = null;
    const pasteEl = document.getElementById('calendar-candidate-paste');
    if (pasteEl) pasteEl.value = '';
    const previewPanel = document.getElementById('calendar-candidate-preview');
    if (previewPanel) previewPanel.classList.add('hidden');
    renderCalendarCandidateImportResult(summary, { phase: 'result' });
    refreshCalendarCandidateViews();
    navigateAfterAction('calendar-import-save', '作業予定に保存しました。売上予定を確認してください。');
  }

  function saveAllCalendarCandidates(force) {
    const preview = lastCalendarCandidatePreview;
    if (!preview || !(preview.items || []).length) return;
    const past = getCalendarPastRecoveryOptions();
    const summary = past.enabled
      ? { readCount: preview.items.length, savedCount: 0, duplicateCount: 0, excludedCount: 0, savableCount: preview.items.length, revenueRegistered: false }
      : getCalendarFutureImportSummary(preview);
    const savableItems = past.enabled
      ? preview.items
      : preview.items.filter(item => CalendarCandidateBrain.isFutureImportSavable(item, force));
    let saved = 0;
    savableItems.forEach(item => {
      if (!past.enabled && !CalendarCandidateBrain.isFutureImportSavable(item, force)) return;
      if (item.isDuplicate && !force) return;
      const payload = CalendarCandidateBrain.createWorkOrderPayload(
        item.candidate,
        resolveCalendarCandidateSaveExtras(item, preview)
      );
      Storage.addWorkOrder(payload);
      saved += 1;
    });
    summary.savedCount = saved;
    summary.revenueRegistered = false;
    lastCalendarCandidateImportResult = summary;
    lastCalendarCandidatePreview = null;
    const pasteEl = document.getElementById('calendar-candidate-paste');
    if (pasteEl) pasteEl.value = '';
    const previewPanel = document.getElementById('calendar-candidate-preview');
    if (previewPanel) previewPanel.classList.add('hidden');
    renderCalendarCandidateImportResult(summary, { phase: 'result' });
    refreshCalendarCandidateViews();
    if (saved > 0) {
      navigateAfterAction('calendar-import-save', `作業予定に${saved}件保存しました。売上予定を確認してください。`);
    } else {
      showAppToast('保存対象がありませんでした');
      scrollToTopOrTarget(null);
    }
  }

  function refreshCalendarCandidateViews() {
    renderCalendarPastRecoverySummary();
    renderCalendarCandidateSavedList();
    renderWorkOrderCalendarBrief();
    renderWorkOrderView();
    renderDashboard();
    renderExecutiveHome();
    renderMorningExecutiveSections();
    renderRevenueView();
  }

  function renderCalendarCandidateBadge(workOrder) {
    if (typeof CalendarCandidateBrain === 'undefined' || !CalendarCandidateBrain.isCalendarCandidateWorkOrder(workOrder)) {
      return '';
    }
    const st = CalendarCandidateBrain.getCandidateStatus(workOrder);
    const revenueNote = workOrder.actualRevenueId ? '' : ' / 売上未確定';
    return `<span class="work-order-candidate-badge">カレンダー候補由来${revenueNote}（${esc(st)}）</span>`;
  }

  function renderCalendarCandidateSavedList() {
    const el = document.getElementById('calendar-candidate-saved-list');
    if (!el || typeof CalendarCandidateBrain === 'undefined') return;
    const list = WorkOrderBrain.sortByScheduledDateTimeAsc(
      Storage.getWorkOrders()
        .filter(w => CalendarCandidateBrain.isCalendarCandidateWorkOrder(w))
        .map(w => WorkOrderBrain.normalizeWorkOrder(w))
    );
    if (!list.length) {
      el.innerHTML = '<p class="placeholder-text">取り込み済みの作業予定はありません。上のカレンダーJSON取り込みから今日以降の予定を読み込んでください。</p>';
      return;
    }
    el.innerHTML = `<p class="calendar-candidate-not-sale-list">作業予定として保存済みです。確定売上集計には含まれません。作業日後は売上確定待ちから売上化できます。</p>
      ${list.map(wo => {
        const st = CalendarCandidateBrain.getCandidateStatus(wo);
        const timeLabel = wo.startTime && wo.endTime ? `${wo.startTime}〜${wo.endTime}` : (wo.startTime || '時間未設定');
        return `<div class="calendar-candidate-saved-item" data-cal-wo-id="${esc(wo.id)}">
          <div class="calendar-candidate-saved-header">
            <strong>${esc(wo.customerName || '（名前なし）')}</strong>
            <span class="calendar-candidate-status-badge status-${esc(st)}">${esc(st)}</span>
          </div>
          <p class="calendar-candidate-saved-meta">${esc(wo.scheduledDate || '日付不明')} ${esc(timeLabel)} / ${esc(wo.serviceText || '—')} / ${esc(wo.address || '—')}</p>
          <p class="calendar-candidate-saved-meta">依頼元：${esc(wo.source || '—')} / 見込み：${esc(WorkOrderBrain.formatYen(wo.estimateAmount))} / 確度：${esc((wo.candidateMeta && wo.candidateMeta.confidence) || '—')}</p>
          ${wo.candidateMeta && wo.candidateMeta.cautionNote ? `<p class="calendar-candidate-saved-warn">注意：${esc(wo.candidateMeta.cautionNote)}</p>` : ''}
          <div class="calendar-candidate-saved-actions">
            ${st === '候補' || st === '要確認' ? `<button type="button" class="btn btn-sm btn-primary" data-cal-promote="${esc(wo.id)}">作業予定に追加</button>` : ''}
            <button type="button" class="btn btn-sm btn-secondary" data-cal-task="${esc(wo.id)}">毎日やることに追加</button>
            ${st !== 'スキップ' ? `<button type="button" class="btn btn-sm btn-secondary" data-cal-review="${esc(wo.id)}">要確認にする</button>` : ''}
            ${st !== 'スキップ' ? `<button type="button" class="btn btn-sm btn-secondary" data-cal-skip="${esc(wo.id)}">このまま保持</button>` : ''}
          </div>
        </div>`;
      }).join('')}`;
    el.querySelectorAll('[data-cal-promote]').forEach(btn => {
      btn.addEventListener('click', () => promoteCalendarCandidate(btn.dataset.calPromote));
    });
    el.querySelectorAll('[data-cal-task]').forEach(btn => {
      btn.addEventListener('click', () => addCalendarCandidateTask(btn.dataset.calTask));
    });
    el.querySelectorAll('[data-cal-review]').forEach(btn => {
      btn.addEventListener('click', () => markCalendarCandidateReview(btn.dataset.calReview));
    });
    el.querySelectorAll('[data-cal-skip]').forEach(btn => {
      btn.addEventListener('click', () => skipCalendarCandidate(btn.dataset.calSkip));
    });
  }

  function renderCalendarPastRecoverySummary() {
    const el = document.getElementById('calendar-past-recovery-summary');
    const btn = document.getElementById('btn-calendar-past-bulk-convert');
    if (!el || typeof CalendarCandidateBrain === 'undefined') return;
    const options = getCalendarPastRecoveryOptions();
    if (!options.enabled) {
      el.innerHTML = '';
      if (btn) btn.disabled = true;
      return;
    }
    const report = getCalendarPastRecoveryReport(true);
    const eligible = report ? report.eligibleCount : 0;
    const amount = report ? report.totalAmount : 0;
    const excluded = report ? report.excludedCount : 0;
    const duplicate = report ? report.duplicateSuspectCount : 0;
    el.innerHTML = `
      <p><strong>登録対象：${eligible}件 / ${esc(WorkOrderBrain.formatYen(amount))}</strong></p>
      <p>対象外：${excluded}件 / 重複疑い：${duplicate}件</p>
    `;
    if (btn) btn.disabled = eligible <= 0;
  }

  function bulkConvertCalendarPastCandidatesToRevenue() {
    const options = getCalendarPastRecoveryOptions();
    if (!options.enabled) {
      alert('過去分復元モードをONにしてください。');
      return;
    }
    const report = getCalendarPastRecoveryReport(false);
    const ids = report ? report.eligible.map(item => item.workOrder.id).filter(Boolean) : [];
    if (!ids.length) {
      alert('一括売上登録できる登録対象がありません。');
      return;
    }
    const amountLabel = WorkOrderBrain.formatYen(report.totalAmount);
    if (!confirm(`売上実績候補 ${ids.length}件 / ${amountLabel} を一括で確定売上に登録します。\n既存売上は上書きせず、重複疑いは除外します。よろしいですか？`)) return;
    const result = Storage.bulkConvertCalendarPastCandidatesToRevenue(ids, options);
    if (!result || !result.ok) {
      alert('一括売上登録に失敗しました。売上データは更新していません。');
      return;
    }
    refreshCalendarCandidateViews();
    renderRevenueView();
    alert(`一括売上登録が完了しました。\n追加：${result.added}件 / ${WorkOrderBrain.formatYen(result.addedAmount || 0)}\n重複・対象外スキップ：${result.skipped}件\n売上件数：${result.beforeCount}件 → ${result.afterCount}件`);
  }

  function promoteCalendarCandidate(workOrderId) {
    const wo = Storage.getWorkOrders().find(w => w.id === workOrderId);
    if (!wo || !wo.candidateMeta) return;
    Storage.updateWorkOrder(workOrderId, {
      status: 'tentative',
      candidateMeta: {
        ...wo.candidateMeta,
        candidateStatus: '作業予定に追加済み',
        confirmedRevenue: false
      }
    });
    refreshCalendarCandidateViews();
    alert('作業予定に反映しました。売上は売上登録で確定してください。');
  }

  function skipCalendarCandidate(workOrderId) {
    const wo = Storage.getWorkOrders().find(w => w.id === workOrderId);
    if (!wo || !wo.candidateMeta) return;
    Storage.updateWorkOrder(workOrderId, {
      candidateMeta: { ...wo.candidateMeta, candidateStatus: 'スキップ' }
    });
    refreshCalendarCandidateViews();
  }

  function markCalendarCandidateReview(workOrderId) {
    const wo = Storage.getWorkOrders().find(w => w.id === workOrderId);
    if (!wo || !wo.candidateMeta) return;
    Storage.updateWorkOrder(workOrderId, {
      candidateMeta: { ...wo.candidateMeta, candidateStatus: '要確認', confidence: '要確認' }
    });
    refreshCalendarCandidateViews();
  }

  function addCalendarCandidateTask(workOrderId) {
    const wo = Storage.getWorkOrders().find(w => w.id === workOrderId);
    if (!wo || typeof CalendarCandidateBrain === 'undefined') return;
    const today = TODAY();
    const payload = CalendarCandidateBrain.createTaskPayload(wo, 'review', today);
    const store = Storage.getDailyActionTasksData();
    if (store.manualTasks.some(t => t.pickupDedupeKey === payload.pickupDedupeKey)) {
      alert('同じ毎日やることはすでに追加済みです。');
      return;
    }
    Storage.addManualDailyTask(payload);
    renderDailyActionTasks();
    renderExecutiveHome();
    alert('毎日やることに追加しました。');
  }

  function renderCalendarCandidateView() {
    renderCalendarCandidatePrompt();
    renderCalendarPastRecoverySummary();
    renderCalendarCandidateSavedList();
    if (lastCalendarCandidateImportResult) {
      renderCalendarCandidateImportResult(lastCalendarCandidateImportResult, { phase: 'result' });
    } else if (lastCalendarCandidatePreview && !getCalendarPastRecoveryOptions().enabled) {
      renderCalendarCandidateImportResult(getCalendarFutureImportSummary(lastCalendarCandidatePreview), { phase: 'preview' });
    } else {
      renderCalendarCandidateImportResult(null);
    }
    renderCalendarCandidatePreview();
  }

  function renderWorkOrderCalendarBrief() {
    const el = document.getElementById('work-order-calendar-candidates-brief');
    if (!el || typeof CalendarCandidateBrain === 'undefined') return;
    const summary = getCalendarCandidateSummary();
    if (!summary || !summary.pendingCount) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `<p>取り込み済み予定（未反映）：${summary.pendingCount}件 / 要確認：${summary.reviewCount}件 — <button type="button" class="btn btn-sm btn-secondary" id="btn-work-order-open-calendar-candidates">予定取り込みを見る</button></p>`;
    const btn = document.getElementById('btn-work-order-open-calendar-candidates');
    if (btn) btn.addEventListener('click', () => navigateToView(SCHEDULE_IMPORT_VIEW));
  }

  function initCalendarCandidate() {
    renderCalendarCandidatePrompt();
    const copyBtn = document.getElementById('btn-calendar-candidate-copy-prompt');
    if (copyBtn && !copyBtn.dataset.bound) {
      copyBtn.dataset.bound = '1';
      copyBtn.addEventListener('click', () => {
        const past = getCalendarPastRecoveryOptions();
        const periodLabel = past.enabled
          ? `${past.startDate || '開始未指定'}〜${past.endDate || '終了未指定'}（過去分復元モード）`
          : '今日以降（今週と来週を中心）';
        const prompt = CalendarCandidateBrain.buildBrowserPrompt({
          periodLabel,
          pastRecoveryMode: past.enabled
        });
        copyText(prompt).then(() => alert('取り込み用フォーマットをコピーしました')).catch(() => alert('コピーに失敗しました'));
      });
    }
    const parseBtn = document.getElementById('btn-calendar-candidate-parse');
    if (parseBtn && !parseBtn.dataset.bound) {
      parseBtn.dataset.bound = '1';
      parseBtn.addEventListener('click', parseCalendarCandidatePaste);
    }
    const saveAllBtn = document.getElementById('btn-calendar-candidate-save-all');
    if (saveAllBtn && !saveAllBtn.dataset.bound) {
      saveAllBtn.dataset.bound = '1';
      saveAllBtn.addEventListener('click', () => saveAllCalendarCandidates(false));
    }
    const jsonImportBtn = document.getElementById('btn-calendar-candidate-json-import');
    const jsonInput = document.getElementById('calendar-candidate-json-input');
    if (jsonImportBtn && jsonInput && !jsonImportBtn.dataset.bound) {
      jsonImportBtn.dataset.bound = '1';
      jsonImportBtn.addEventListener('click', () => jsonInput.click());
      jsonInput.addEventListener('change', () => {
        const file = jsonInput.files && jsonInput.files[0];
        if (file) handleCalendarCandidateJsonFile(file);
        jsonInput.value = '';
      });
    }
    ['calendar-past-recovery-mode', 'calendar-past-recovery-start', 'calendar-past-recovery-end'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.dataset.bound) {
        el.dataset.bound = '1';
        el.addEventListener('change', () => {
          renderCalendarCandidatePrompt();
          renderCalendarPastRecoverySummary();
          if (lastCalendarCandidatePreview) parseCalendarCandidatePaste();
        });
      }
    });
    const bulkBtn = document.getElementById('btn-calendar-past-bulk-convert');
    if (bulkBtn && !bulkBtn.dataset.bound) {
      bulkBtn.dataset.bound = '1';
      bulkBtn.addEventListener('click', bulkConvertCalendarPastCandidatesToRevenue);
    }
    const goBtn = document.getElementById('btn-go-calendar-candidate');
    if (goBtn && !goBtn.dataset.bound) {
      goBtn.dataset.bound = '1';
      goBtn.addEventListener('click', () => navigateToView('calendar-candidate'));
    }
  }

  // ── 外部チェック（Browser番頭貼り付け）──
  function getExternalCheckActionItems(summary) {
    const actions = summary && summary.todayActions ? summary.todayActions : [];
    return actions.filter(i => i && i !== ExternalCheckBrain.UNCONFIRMED);
  }

  function renderExternalCheckListItems(items) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length || (list.length === 1 && list[0] === ExternalCheckBrain.UNCONFIRMED)) {
      return `<p class="external-check-unconfirmed">${esc(ExternalCheckBrain.UNCONFIRMED)}</p>`;
    }
    return `<ul class="external-check-item-list">${list.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
  }

  function renderExternalCheckSaveId(report) {
    if (!report || !report.id) return '';
    return `<p class="external-check-save-id">保存ID：${esc(report.id)}</p>`;
  }

  function renderExternalCheckNoiseSection(report, compact) {
    if (!report) return '';
    const s = report.summary || {};
    const allNoise = (s.noiseCandidates || []).filter(i => i && i !== ExternalCheckBrain.UNCONFIRMED);
    const displayNoise = compact ? ExternalCheckBrain.topItems(allNoise, 3) : allNoise;
    const count = allNoise.length;

    return `
      <div class="external-check-noise-card">
        <div class="external-check-noise-header">
          <h3>注意・ノイズ候補</h3>
          <span class="external-check-count-badge external-check-count-badge-noise">${count || 0}件</span>
        </div>
        ${count ? renderExternalCheckListItems(displayNoise) : `<p class="external-check-unconfirmed">${esc(ExternalCheckBrain.UNCONFIRMED)}</p>`}
      </div>
    `;
  }

  function renderActionCandidateButtons(reportId, title) {
    if (!reportId || !title || typeof ActionBrain === 'undefined') return '';
    const candidates = Storage.getActionCandidates();
    const state = ActionBrain.getCandidateState(candidates, reportId, title);
    const found = ActionBrain.findByDedupeKey(candidates, ActionBrain.makeDedupeKey(reportId, title));
    const dailyKey = ActionBrain.makeDailyTaskDedupeKey(reportId, title);
    const inDaily = Storage.getDailyActionTasksData().manualTasks.some(t => t.pickupDedupeKey === dailyKey);

    if (state === 'done') {
      return `<span class="action-candidate-badge action-candidate-badge-done">対応済み</span>`;
    }
    if (state === 'not_needed') {
      return `<span class="action-candidate-badge action-candidate-badge-not-needed">必要無し</span>`;
    }
    if (state === 'added') {
      return `
        <span class="action-candidate-badge action-candidate-badge-added">追加済み</span>
        <button type="button" class="btn btn-sm btn-secondary" data-act-done="${esc(found.id)}">対応済みにする</button>
        <button type="button" class="btn btn-sm btn-not-needed" data-act-not-needed="${esc(found.id)}">必要無し</button>
        ${inDaily ? '<span class="action-candidate-badge action-candidate-badge-daily">毎日やることに追加済み</span>' : `<button type="button" class="btn btn-sm btn-secondary" data-act-daily="${esc(reportId)}" data-act-title="${esc(title)}">毎日やることへ追加</button>`}
      `;
    }
    return `
      <button type="button" class="btn btn-sm btn-primary" data-act-add="${esc(reportId)}" data-act-title="${esc(title)}">改善リストに追加</button>
      <button type="button" class="btn btn-sm btn-not-needed" data-act-not-needed-report="${esc(reportId)}" data-act-title="${esc(title)}">必要無し</button>
      ${inDaily ? '<span class="action-candidate-badge action-candidate-badge-daily">毎日やることに追加済み</span>' : `<button type="button" class="btn btn-sm btn-secondary" data-act-daily="${esc(reportId)}" data-act-title="${esc(title)}">毎日やることへ追加</button>`}
    `;
  }

  function renderExternalCheckTodayActionsSection(report, compact) {
    if (!report) return '';
    const s = report.summary || {};
    const savedCandidates = Storage.getActionCandidates();
    const allActions = getExternalCheckActionItems(s)
      .filter(title => ActionBrain.isVisibleCandidateState(savedCandidates, report.id, title));
    const displayActions = compact ? ExternalCheckBrain.topItems(allActions, 3) : allActions;
    const count = allActions.length;

    if (!count) {
      return `
        <div class="external-check-today-actions-card">
          <div class="external-check-today-actions-header">
            <h3>改善リストへ追加</h3>
            <span class="external-check-count-badge">0件</span>
          </div>
          <p class="external-check-unconfirmed">${esc(ExternalCheckBrain.UNCONFIRMED)}</p>
        </div>
      `;
    }

    const itemsHtml = displayActions.map(title => `
      <li class="external-check-today-action-item">
        <p class="external-check-today-action-title">${esc(title)}</p>
        <div class="external-check-today-action-buttons">
          ${compact
            ? `<button type="button" class="btn btn-sm btn-not-needed" data-act-not-needed-report="${esc(report.id)}" data-act-title="${esc(title)}">必要無し</button>`
            : renderActionCandidateButtons(report.id, title)}
        </div>
      </li>
    `).join('');

    return `
      <div class="external-check-today-actions-card">
        <div class="external-check-today-actions-header">
          <h3>改善リストへ追加</h3>
          <span class="external-check-count-badge">${count}件</span>
        </div>
        <ul class="external-check-today-action-list">${itemsHtml}</ul>
        ${compact && count > 3 ? `<p class="external-check-more-note">他 ${count - 3} 件 — 外部確認画面で全件確認</p>` : ''}
        <p class="external-check-not-sale">外部確認由来の改善アクションです。売上確定ではありません。</p>
      </div>
    `;
  }

  function renderExternalCheckCautionsSection(report, compact) {
    if (!report) return '';
    const s = report.summary || {};
    const allCautions = (s.cautions || []).filter(i => i && i !== ExternalCheckBrain.UNCONFIRMED);
    const displayCautions = compact ? ExternalCheckBrain.topItems(allCautions, 3) : allCautions;
    const count = allCautions.length;

    return `
      <div class="external-check-cautions-card">
        <div class="external-check-cautions-header">
          <h3>注意・未確認</h3>
          <span class="external-check-count-badge external-check-count-badge-caution">${count || 0}件</span>
        </div>
        ${count ? renderExternalCheckListItems(displayCautions) : `<p class="external-check-unconfirmed">${esc(ExternalCheckBrain.UNCONFIRMED)}</p>`}
      </div>
    `;
  }

  function renderExternalCheckSummaryBlock(report, compact) {
    if (!report) return '<p class="placeholder-text">まだ外部確認は保存されていません。</p>';
    const s = report.summary || {};

    if (compact) {
      return `
        <div class="external-check-dash-meta">
          <p><strong>保存日時：</strong>${esc(ExternalCheckBrain.formatCreatedAt(report.createdAt))}</p>
          <p><strong>確認日：</strong>${esc(s.date || ExternalCheckBrain.UNCONFIRMED)}</p>
          <p><strong>確認対象：</strong>${esc(s.targets || ExternalCheckBrain.UNCONFIRMED)}</p>
          ${renderExternalCheckSaveId(report)}
        </div>
        ${renderExternalCheckTodayActionsSection(report, true)}
        ${renderExternalCheckNoiseSection(report, true)}
        ${renderExternalCheckCautionsSection(report, true)}
        <p class="external-check-not-sale">復元対象・GBP反応は売上確定ではありません。</p>
      `;
    }

    const linked = typeof ActionBrain !== 'undefined'
      ? ActionBrain.getByReportId(Storage.getActionCandidates(), report.id)
      : [];

    return `
      <div class="external-check-latest-meta">
        <p><strong>保存日時：</strong>${esc(ExternalCheckBrain.formatCreatedAt(report.createdAt))}</p>
        <p><strong>確認日：</strong>${esc(s.date || ExternalCheckBrain.UNCONFIRMED)}</p>
        <p><strong>確認対象：</strong>${esc(s.targets || ExternalCheckBrain.UNCONFIRMED)}</p>
        <p><strong>ソース：</strong>${esc(report.source || 'browser-bantou')}</p>
        ${renderExternalCheckSaveId(report)}
        ${linked.length ? `<p><strong>改善リスト：</strong>${linked.filter(c => c.status === ActionBrain.STATUS_TODO).length}件未対応 / ${linked.filter(c => c.status === ActionBrain.STATUS_DONE).length}件対応済み / ${linked.filter(c => c.status === ActionBrain.STATUS_NOT_NEEDED).length}件必要無し</p>` : ''}
      </div>
      ${renderExternalCheckTodayActionsSection(report, false)}
      ${renderExternalCheckNoiseSection(report, false)}
      ${renderExternalCheckCautionsSection(report, false)}
      <div class="external-check-section-grid">
        <div class="external-check-section"><h3>予定</h3>${renderExternalCheckListItems(s.scheduleCandidates)}<p class="external-check-not-sale">作業予定の参考情報であり売上確定ではありません。</p></div>
        <div class="external-check-section"><h3>需要候補</h3>${renderExternalCheckListItems(s.demandCandidates)}</div>
        <div class="external-check-section"><h3>アナリティクス候補</h3>${renderExternalCheckListItems(s.analyticsCandidates)}</div>
        <div class="external-check-section"><h3>GBP反応</h3>${renderExternalCheckListItems(s.gbpSignals)}<p class="external-check-not-sale">集客情報であり売上確定ではありません。</p></div>
        <div class="external-check-section"><h3>広告異常</h3>${renderExternalCheckListItems(s.adAnomalies)}</div>
      </div>
      <details class="external-check-raw-collapse">
        <summary>貼り付け原文を表示</summary>
        <pre class="external-check-raw-text">${esc(report.rawText || '')}</pre>
      </details>
    `;
  }

  function renderDashActionCandidates() {
    const el = document.getElementById('dash-action-candidates');
    if (!el || typeof ActionBrain === 'undefined') return;
    const candidates = Storage.getActionCandidates();
    const todo = ActionBrain.getTodoCandidates(candidates);
    const top = ActionBrain.topTodo(candidates, 3);

    if (!todo.length) {
      el.innerHTML = `
        <h2>改善リスト</h2>
        <p class="placeholder-text">改善リストはまだありません。<br>アクセス分析・サイト確認記録・経営ホームの提案から追加できます。</p>
        <button type="button" class="btn btn-sm btn-secondary" id="btn-dash-go-action-candidates">サイト確認記録を見る</button>
      `;
    } else {
      el.innerHTML = `
        <div class="action-candidates-dash-header">
          <h2>改善リスト <span class="external-check-count-badge">${todo.length}件未対応</span></h2>
          <button type="button" class="btn btn-sm btn-secondary" id="btn-dash-go-action-candidates">改善リストを見る</button>
        </div>
        <p class="action-candidates-source-note">由来：サイト確認記録（売上確定ではありません）</p>
        <ul class="action-candidates-dash-list">
          ${top.map(c => `
            <li class="action-candidate-dash-item">
              <p>${esc(c.title)}</p>
              <div class="action-candidate-dash-actions">
                <button type="button" class="btn btn-sm btn-secondary" data-act-done="${esc(c.id)}">対応済みにする</button>
                <button type="button" class="btn btn-sm btn-not-needed" data-act-not-needed="${esc(c.id)}">必要無し</button>
              </div>
            </li>
          `).join('')}
        </ul>
        ${todo.length > 3 ? `<p class="external-check-more-note">他 ${todo.length - 3} 件</p>` : ''}
      `;
    }

    const btn = document.getElementById('btn-dash-go-action-candidates');
    if (btn) {
      btn.addEventListener('click', () => {
        navigateToView('external-check');
        scrollToElement('.card-external-check-unified');
      });
    }
    bindActionCandidateButtons(el);
  }

  function renderExternalCheckActionCandidatesList() {
    const el = document.getElementById('external-check-action-candidates');
    if (!el || typeof ActionBrain === 'undefined') return;
    const candidates = Storage.getActionCandidates()
      .map(c => ActionBrain.normalizeCandidate(c))
      .filter(c => c.source === ActionBrain.SOURCE_EXTERNAL_CHECK);

    if (!candidates.length) {
      el.innerHTML = '<p class="placeholder-text">改善リストはまだありません。<br>アクセス分析・サイト確認記録・経営ホームの提案から追加できます。</p>';
      return;
    }

    const todo = candidates.filter(c => c.status === ActionBrain.STATUS_TODO);
    const done = candidates.filter(c => c.status === ActionBrain.STATUS_DONE);
    const notNeeded = candidates.filter(c => c.status === ActionBrain.STATUS_NOT_NEEDED);

    const reports = Storage.getExternalCheckReports();
    const renderItem = c => {
      const orphaned = ActionBrain.isOrphanedSource(c.sourceReportId, reports);
      const dailyKey = ActionBrain.makeDailyTaskDedupeKey(c.sourceReportId, c.title);
      const inDaily = Storage.getDailyActionTasksData().manualTasks.some(t => t.pickupDedupeKey === dailyKey);
      return `
      <div class="action-candidate-list-item${c.status === ActionBrain.STATUS_DONE ? ' is-done' : ''}${c.status === ActionBrain.STATUS_NOT_NEEDED ? ' is-not-needed' : ''}${orphaned ? ' is-orphaned' : ''}">
        <p class="action-candidate-list-title">${esc(c.title)}${orphaned ? ' <span class="action-candidate-badge action-candidate-badge-orphan">元レポート削除済み</span>' : ''}</p>
        <p class="action-candidate-list-meta">レポート: ${esc(c.sourceReportId)} / 追加: ${esc(ActionBrain.formatCreatedAt(c.createdAt))}</p>
        <div class="action-candidate-list-buttons">
          ${c.status === ActionBrain.STATUS_DONE
            ? '<span class="action-candidate-badge action-candidate-badge-done">対応済み</span>'
            : c.status === ActionBrain.STATUS_NOT_NEEDED
              ? '<span class="action-candidate-badge action-candidate-badge-not-needed">必要無し</span>'
            : `${inDaily
              ? '<span class="action-candidate-badge action-candidate-badge-daily">毎日やることに追加済み</span>'
              : `<button type="button" class="btn btn-sm btn-secondary" data-act-daily="${esc(c.sourceReportId)}" data-act-title="${esc(c.title)}">毎日やることへ追加</button>`}
               <button type="button" class="btn btn-sm btn-secondary" data-act-done="${esc(c.id)}">対応済み</button>
               <button type="button" class="btn btn-sm btn-not-needed" data-act-not-needed="${esc(c.id)}">必要無し</button>`}
        </div>
      </div>
    `;
    };

    el.innerHTML = `
      <p class="action-candidates-summary">未対応 ${todo.length}件 / 対応済み ${done.length}件 / 必要無し ${notNeeded.length}件</p>
      <div class="action-candidate-list-group">
        <h3>未対応</h3>
        ${todo.length ? todo.map(renderItem).join('') : '<p class="placeholder-text">未対応の改善項目はありません。</p>'}
      </div>
      ${done.length ? `<div class="action-candidate-list-group"><h3>対応済み</h3>${done.map(renderItem).join('')}</div>` : ''}
      ${notNeeded.length ? `<div class="action-candidate-list-group"><h3>必要無し</h3>${notNeeded.map(renderItem).join('')}</div>` : ''}
    `;
    bindActionCandidateButtons(el);
  }

  function showImprovementListAddedNotice(mountEl) {
    const host = mountEl || document.querySelector('.card-analytics-kpi-snapshot')
      || document.querySelector('.card-external-check-latest')
      || document.body;
    let el = document.getElementById('improvement-list-save-notice');
    if (!el) {
      el = document.createElement('div');
      el.id = 'improvement-list-save-notice';
      el.className = 'improvement-list-save-notice card card-wide';
      if (host && host.parentNode) host.parentNode.insertBefore(el, host.nextSibling);
      else document.querySelector('.main')?.prepend(el);
    }
    el.classList.remove('hidden');
    el.innerHTML = `
      <p class="improvement-list-save-message"><strong>改善リストに追加しました。</strong><br>
      次は「毎日やること」に入れるか、「改善リスト」で確認できます。</p>
      <div class="improvement-list-save-actions">
        <button type="button" class="btn btn-sm btn-primary" data-improvement-go-daily>毎日やることへ</button>
        <button type="button" class="btn btn-sm btn-secondary" data-improvement-go-list>改善リストを見る</button>
        <button type="button" class="btn btn-sm btn-secondary" data-improvement-stay>この画面に残る</button>
      </div>`;
    el.querySelector('[data-improvement-go-daily]').addEventListener('click', () => {
      navigateToView('dashboard', '.card-daily-action-tasks');
    });
    el.querySelector('[data-improvement-go-list]').addEventListener('click', () => {
      navigateToView('external-check', '.card-external-check-unified');
    });
    el.querySelector('[data-improvement-stay]').addEventListener('click', () => {
      el.classList.add('hidden');
    });
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderStrategyMemoHub() {
    const overviewEl = document.getElementById('strategy-memo-overview');
    if (overviewEl) {
      const pickups = (Storage.getDemandPickups && Storage.getDemandPickups()) || [];
      const radar = Storage.getDemandRadar ? Storage.getDemandRadar() : {};
      const keywords = (radar.keywords || []).length;
      overviewEl.innerHTML = '<p class="strategy-memo-intro">集客のネタや施策メモの概要です。詳細は各カードから開けます。</p>';
    }
    document.querySelectorAll('[data-strategy-summary]').forEach(el => {
      const kind = el.dataset.strategySummary;
      if (kind === 'radar') {
        const radar = Storage.getDemandRadar ? Storage.getDemandRadar() : {};
        const n = (radar.keywords || []).length;
        el.textContent = n ? `キーワード ${n}件` : '未登録';
      } else if (kind === 'pickup') {
        const n = ((Storage.getDemandPickups && Storage.getDemandPickups()) || []).length;
        el.textContent = n ? `ネタ ${n}件` : '未登録';
      } else if (kind === 'demand') {
        el.textContent = '調査メモ';
      } else if (kind === 'ad') {
        el.textContent = '広告文案';
      }
    });
    document.querySelectorAll('[data-strategy-open]').forEach(btn => {
      if (btn.dataset.strategyBound) return;
      btn.dataset.strategyBound = '1';
      btn.addEventListener('click', () => {
        const view = btn.dataset.strategyOpen;
        navigateToView(view, btn.dataset.strategyScroll || '');
      });
    });
  }

  function initStrategyMemoHub() {
    renderStrategyMemoHub();
  }

  function addExternalCheckActionCandidate(reportId, title) {
    if (!reportId || !title) return;
    const result = Storage.addActionCandidate(ActionBrain.createFromExternalCheck(reportId, title));
    if (result.duplicate) {
      showAppToast('この項目は既に改善リストに追加済みです');
      return;
    }
    refreshActionCandidateViews();
    showImprovementListAddedNotice(document.getElementById('analytics-kpi-snapshot')
      || document.querySelector('.card-external-check-latest'));
  }

  function addExternalCheckToDailyTask(reportId, title) {
    if (!reportId || !title) return;
    const key = ActionBrain.makeDailyTaskDedupeKey(reportId, title);
    if (Storage.getDailyActionTasksData().manualTasks.some(t => t.pickupDedupeKey === key)) {
      showAppToast('既に毎日やることに追加済みです');
      return;
    }
    Storage.addManualDailyTask({
      title,
      targetName: '外部確認',
      priority: '中',
      action: title,
      dueDate: TODAY(),
      memo: `外部確認レポート(${reportId})より。売上確定ではありません。`,
      pickupDedupeKey: key,
      reason: '外部確認',
      status: 'open'
    });
    refreshActionCandidateViews();
    showAppToast('毎日やることに追加しました');
  }

  function syncDailyTaskFromActionCandidate(candidate) {
    if (!candidate || !candidate.sourceReportId || !candidate.title) return;
    const key = ActionBrain.makeDailyTaskDedupeKey(candidate.sourceReportId, candidate.title);
    const manual = Storage.getDailyActionTasksData().manualTasks.find(t => t.pickupDedupeKey === key);
    if (manual && manual.status !== 'done') {
      Storage.updateManualDailyTask(manual.id, {
        status: 'done',
        completedAt: new Date().toISOString()
      });
    }
  }

  function markActionCandidateDone(id) {
    if (!id) return;
    const updated = Storage.markActionCandidateDone(id);
    if (!updated) {
      showAppToast('改善リストの項目が見つかりません');
      return;
    }
    syncDailyTaskFromActionCandidate(updated);
    refreshActionCandidateViews();
    showAppToast('対応済みにしました');
  }

  function markActionCandidateNotNeeded(id, reportId, title) {
    const updated = Storage.markActionCandidateNotNeeded(id, { sourceReportId: reportId, title });
    if (!updated) {
      showAppToast('改善リストの項目が見つかりません');
      return;
    }
    refreshActionCandidateViews();
    showAppToast('必要無しにしました');
  }

  function refreshActionCandidateViews() {
    renderExternalCheckView();
    renderAnalyticsView();
    renderDashboard();
  }

  function bindActionCandidateButtons(root) {
    if (!root) return;
    root.querySelectorAll('[data-act-add]').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => addExternalCheckActionCandidate(btn.dataset.actAdd, btn.dataset.actTitle));
    });
    root.querySelectorAll('[data-act-daily]').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => addExternalCheckToDailyTask(btn.dataset.actDaily, btn.dataset.actTitle));
    });
    root.querySelectorAll('[data-act-done]').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => markActionCandidateDone(btn.dataset.actDone));
    });
    root.querySelectorAll('[data-act-not-needed]').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => markActionCandidateNotNeeded(btn.dataset.actNotNeeded, '', ''));
    });
    root.querySelectorAll('[data-act-not-needed-report]').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => markActionCandidateNotNeeded('', btn.dataset.actNotNeededReport, btn.dataset.actTitle));
    });
  }

  function countDashExternalCheckUnconfirmed(report) {
    if (!report) return 0;
    const s = report.summary || {};
    return (s.cautions || []).filter(i => i && i !== ExternalCheckBrain.UNCONFIRMED).length;
  }

  function countDashExternalCheckImprovementItems(report) {
    if (!report || typeof ActionBrain === 'undefined') return 0;
    const s = report.summary || {};
    const savedCandidates = Storage.getActionCandidates();
    return getExternalCheckActionItems(s)
      .filter(title => ActionBrain.isVisibleCandidateState(savedCandidates, report.id, title)).length;
  }

  function renderDashExternalCheckSavedReportsList(reports) {
    if (!reports.length) return '<p class="placeholder-text">なし</p>';
    return reports.map(r => {
      const s = r.summary || {};
      return `<div class="external-check-dash-saved-item">
        <p><strong>保存日時：</strong>${esc(ExternalCheckBrain.formatCreatedAt(r.createdAt))}</p>
        <p><strong>確認日：</strong>${esc(s.date || ExternalCheckBrain.UNCONFIRMED)} / <strong>確認対象：</strong>${esc(s.targets || ExternalCheckBrain.UNCONFIRMED)}</p>
        ${renderExternalCheckSaveId(r)}
      </div>`;
    }).join('');
  }

  function renderDashExternalCheckLatestDetail(report) {
    if (!report) return '';
    const s = report.summary || {};
    return `
      <div class="external-check-dash-meta">
        <p><strong>保存日時：</strong>${esc(ExternalCheckBrain.formatCreatedAt(report.createdAt))}</p>
        <p><strong>確認日：</strong>${esc(s.date || ExternalCheckBrain.UNCONFIRMED)}</p>
        <p><strong>確認対象：</strong>${esc(s.targets || ExternalCheckBrain.UNCONFIRMED)}</p>
        ${renderExternalCheckSaveId(report)}
      </div>
      ${renderExternalCheckNoiseSection(report, false)}
      <p class="external-check-not-sale">復元対象・GBP反応は売上確定ではありません。</p>
    `;
  }

  function renderDashExternalCheckDetailsBody(latest, reports) {
    return `
      <div class="external-check-dash-section">
        <h3>保存済みレポート</h3>
        ${renderDashExternalCheckSavedReportsList(reports)}
      </div>
      ${renderExternalCheckCautionsSection(latest, false)}
      ${renderExternalCheckTodayActionsSection(latest, false)}
      <div class="external-check-dash-section">
        <h3>最新レポート詳細</h3>
        ${renderDashExternalCheckLatestDetail(latest)}
      </div>
    `;
  }

  function renderDashExternalCheck() {
    const el = document.getElementById('dash-external-check');
    if (!el || typeof ExternalCheckBrain === 'undefined') return;
    const reports = Storage.getExternalCheckReports();
    const latest = Storage.getLatestExternalCheckReport();
    const savedCount = reports.length;
    if (!latest) {
      el.innerHTML = `
        <h2>外部確認</h2>
        <div class="external-check-dash-brief">
          <p class="external-check-dash-summary-line">保存済み：0件</p>
        </div>
        <p class="placeholder-text">【Budil貼り付け用】レポートはまだ保存されていません。</p>
        <button type="button" class="btn btn-sm btn-primary" id="btn-dash-go-external-check">サイト確認記録を見る</button>
      `;
    } else {
      const unconfirmedCount = countDashExternalCheckUnconfirmed(latest);
      const improvementCount = countDashExternalCheckImprovementItems(latest);
      el.innerHTML = `
        <div class="external-check-dash-header">
          <h2>外部確認</h2>
        </div>
        <div class="external-check-dash-brief">
          <p class="external-check-dash-summary-line">保存済み：${savedCount}件</p>
          <p class="external-check-dash-summary-line">未確認：${unconfirmedCount}件</p>
          <p class="external-check-dash-summary-line">改善リスト：${improvementCount}件</p>
        </div>
        <button type="button" class="btn btn-sm btn-primary" id="btn-dash-go-external-check">サイト確認記録を見る</button>
        <details class="external-check-dash-details">
          <summary>外部確認の詳細を開く</summary>
          <div class="external-check-dash-details-body">
            ${renderDashExternalCheckDetailsBody(latest, reports)}
          </div>
        </details>
      `;
      const detailsBody = el.querySelector('.external-check-dash-details-body');
      if (detailsBody) bindActionCandidateButtons(detailsBody);
    }
    const btn = document.getElementById('btn-dash-go-external-check');
    if (btn) btn.addEventListener('click', () => navigateToView('external-check'));
  }

  function renderExternalCheckLatest() {
    const el = document.getElementById('external-check-latest');
    if (!el || typeof ExternalCheckBrain === 'undefined') return;
    const latest = Storage.getLatestExternalCheckReport();
    el.innerHTML = renderExternalCheckSummaryBlock(latest, false);
    bindActionCandidateButtons(el);
  }

  function renderExternalCheckHistory() {
    const el = document.getElementById('external-check-history');
    if (!el || typeof ExternalCheckBrain === 'undefined') return;
    const reports = Storage.getExternalCheckReports();
    if (!reports.length) {
      el.innerHTML = '<p class="placeholder-text">保存履歴はまだありません。</p>';
      return;
    }
    el.innerHTML = reports.map(r => {
      const s = r.summary || {};
      const actionCount = ExternalCheckBrain.countActionItems(s);
      const detailId = `extchk-detail-${r.id}`;
      return `
        <div class="external-check-history-item" data-report-id="${esc(r.id)}">
          <div class="external-check-history-head">
            <div>
              <p><strong>保存日時：</strong>${esc(ExternalCheckBrain.formatCreatedAt(r.createdAt))}</p>
              <p><strong>確認日：</strong>${esc(s.date || ExternalCheckBrain.UNCONFIRMED)} / <strong>確認対象：</strong>${esc(s.targets || ExternalCheckBrain.UNCONFIRMED)}</p>
              <p><strong>改善リスト：</strong>${actionCount}件</p>
              ${renderExternalCheckSaveId(r)}
            </div>
            <div class="external-check-history-actions">
              <button type="button" class="btn btn-sm btn-secondary" data-extchk-toggle="${esc(r.id)}">詳細表示</button>
              <button type="button" class="btn btn-sm btn-danger" data-extchk-delete="${esc(r.id)}">削除</button>
            </div>
          </div>
          <div id="${detailId}" class="external-check-history-detail hidden">
            ${renderExternalCheckSummaryBlock(r, false)}
          </div>
        </div>
      `;
    }).join('');

    el.querySelectorAll('[data-extchk-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.extchkToggle;
        const panel = document.getElementById(`extchk-detail-${id}`);
        if (!panel) return;
        const open = panel.classList.toggle('hidden');
        btn.textContent = open ? '詳細表示' : '詳細を閉じる';
      });
    });
    el.querySelectorAll('[data-extchk-delete]').forEach(btn => {
      btn.addEventListener('click', () => deleteExternalCheckReport(btn.dataset.extchkDelete));
    });
    el.querySelectorAll('.external-check-history-detail').forEach(panel => bindActionCandidateButtons(panel));
  }

  function saveExternalCheckPaste() {
    const pasteEl = document.getElementById('external-check-paste');
    const warningsEl = document.getElementById('external-check-parse-warnings');
    const text = pasteEl ? pasteEl.value.trim() : '';
    if (!text) {
      alert('貼り付け本文を入力してください');
      return;
    }
    const parsed = ExternalCheckBrain.parseReport(text);
    const report = ExternalCheckBrain.createReport(text);
    Storage.addExternalCheckReport(report);

    if (warningsEl) {
      const msgs = parsed.warnings || [];
      warningsEl.innerHTML = msgs.length
        ? `<ul class="external-check-warning-list">${msgs.map(m => `<li>${esc(m)}</li>`).join('')}</ul>`
        : '<p class="external-check-save-ok">保存しました（復元対象・GBP反応は売上確定ではありません）。</p>';
    }
    if (pasteEl) pasteEl.value = '';
    renderExternalCheckView();
    renderDashboard();
    showAppToast('サイト確認記録を保存しました');
  }

  function clearExternalCheckPaste() {
    const pasteEl = document.getElementById('external-check-paste');
    const warningsEl = document.getElementById('external-check-parse-warnings');
    if (pasteEl) pasteEl.value = '';
    if (warningsEl) warningsEl.innerHTML = '';
  }

  function deleteExternalCheckReport(id) {
    if (!id) return;
    if (!confirm('この外部確認レポートを削除しますか？')) return;
    Storage.deleteExternalCheckReport(id);
    renderExternalCheckView();
    renderDashboard();
    showAppToast('サイト確認記録を削除しました');
  }

  function renderExternalCheckView() {
    renderExternalCheckLatest();
    renderExternalCheckActionCandidatesList();
    renderExternalCheckHistory();
  }

  function initExternalCheck() {
    const saveBtn = document.getElementById('btn-external-check-save');
    if (saveBtn && !saveBtn.dataset.bound) {
      saveBtn.dataset.bound = '1';
      saveBtn.addEventListener('click', saveExternalCheckPaste);
    }
    const clearBtn = document.getElementById('btn-external-check-clear');
    if (clearBtn && !clearBtn.dataset.bound) {
      clearBtn.dataset.bound = '1';
      clearBtn.addEventListener('click', clearExternalCheckPaste);
    }
  }

  function renderWorkCompletionStatusBadge(workOrder) {
    if (typeof WorkCompletionBrain === 'undefined') return '';
    const revenues = Storage.getRevenueRecords();
    const label = WorkCompletionBrain.getDisplayStatus(workOrder, revenues);
    const cls = {
      '売上確定済み': 'status-confirmed',
      '作業完了・入金待ち': 'status-unpaid',
      '売上未確定': 'status-pending',
      'キャンセル': 'status-cancelled',
      '要確認': 'status-review'
    }[label] || 'status-pending';
    return `<span class="work-completion-status-badge ${cls}">${esc(label)}</span>`;
  }

  function fillWorkCompletionSelects() {
    const serviceEl = document.getElementById('work-completion-service');
    const sourceEl = document.getElementById('work-completion-source');
    const methodEl = document.getElementById('work-completion-payment-method');
    if (serviceEl && !serviceEl.options.length) {
      serviceEl.innerHTML = RevenueBrain.SERVICES.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    }
    fillSourceSelectOptions(sourceEl);
    if (methodEl && methodEl.options.length <= 1) {
      methodEl.innerHTML = '<option value="">未選択</option>'
        + WorkCompletionBrain.PAYMENT_METHODS.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
    }
  }

  function isWorkOrderRevenueLocked(wo) {
    return !!(wo && wo.actualRevenueId);
  }

  function openWorkCompletionModalFromQueue(workOrderId, source) {
    openWorkCompletionModal(workOrderId);
    const sourceEl = document.getElementById('work-completion-queue-source');
    if (sourceEl) sourceEl.value = source === 'past-recovery' ? 'past-recovery' : 'work-order';
  }

  function openWorkCompletionModal(workOrderId) {
    const wo = Storage.getWorkOrders().find(w => w.id === workOrderId);
    if (!wo) return;
    const sourceEl = document.getElementById('work-completion-queue-source');
    if (sourceEl) sourceEl.value = 'work-order';
    if (isWorkOrderRevenueLocked(wo)) {
      alert('この作業予定はすでに売上確定済みです。二重登録はできません。');
      return;
    }
    if (wo.status === 'cancelled') {
      alert('キャンセル済みの作業予定です。');
      return;
    }
    fillWorkCompletionSelects();
    const defaults = WorkCompletionBrain.buildCompletionFormDefaults(wo);
    document.getElementById('work-completion-wo-id').value = wo.id;
    document.getElementById('work-completion-date').value = defaults.workDate;
    document.getElementById('work-completion-customer').value = defaults.customerName;
    document.getElementById('work-completion-actual-service').value = defaults.actualService;
    document.getElementById('work-completion-service').value = defaults.service || RevenueBrain.SERVICES[0];
    fillSourceSelectOptions(document.getElementById('work-completion-source'), defaults.source || RevenueBrain.SOURCES[0]);
    document.getElementById('work-completion-amount').value = defaults.amount;
    document.getElementById('work-completion-gross-rate').value = defaults.grossMarginRate;
    document.getElementById('work-completion-gross-rate').dataset.manualGrossMarginRate = defaults.grossMarginRate ? '1' : '';
    document.getElementById('work-completion-gross-rate').dataset.autoGrossMarginRate = '';
    applyWorkCompletionGrossMarginDefault();
    document.getElementById('work-completion-payment-status').value = defaults.paymentStatus;
    document.getElementById('work-completion-payment-date').value = defaults.paymentDate;
    document.getElementById('work-completion-payment-method').value = defaults.paymentMethod;
    document.getElementById('work-completion-payment-concern').checked = defaults.paymentConcern;
    document.getElementById('work-completion-actual-memo').value = defaults.additionalMemo;
    document.getElementById('work-completion-follow-memo').value = defaults.followMemo;
    const hint = document.getElementById('work-completion-estimate-hint');
    if (hint) {
      hint.textContent = wo.estimateAmount
        ? `予定金額（見込み）：${WorkOrderBrain.formatYen(wo.estimateAmount)} — 実績と違う場合は修正してください`
        : '';
    }
    document.getElementById('work-completion-modal').classList.remove('hidden');
  }

  function closeWorkCompletionModal() {
    document.getElementById('work-completion-modal').classList.add('hidden');
  }

  function openWorkCancelModal(workOrderId) {
    const wo = Storage.getWorkOrders().find(w => w.id === workOrderId);
    if (!wo) return;
    if (isWorkOrderRevenueLocked(wo)) {
      alert('売上確定済みの作業予定はキャンセルできません。売上登録で対応してください。');
      return;
    }
    if (wo.status === 'cancelled') {
      alert('すでにキャンセル済みです。');
      return;
    }
    document.getElementById('work-cancel-wo-id').value = wo.id;
    document.getElementById('work-cancel-reason').value = (wo.cancel && wo.cancel.reason) || '';
    document.getElementById('work-cancel-date').value = TODAY();
    document.getElementById('work-cancel-propose-again').checked = !!(wo.cancel && wo.cancel.proposeAgain);
    document.getElementById('work-cancel-add-task').checked = false;
    document.getElementById('work-cancel-modal').classList.remove('hidden');
  }

  function closeWorkCancelModal() {
    document.getElementById('work-cancel-modal').classList.add('hidden');
  }

  function submitPastRecoveryFromModal(wo, input) {
    const estimate = wo.estimateAmount || 0;
    const diffMsg = estimate && estimate !== input.amount
      ? `\n予定金額 ${WorkOrderBrain.formatYen(estimate)} → 実績 ${WorkOrderBrain.formatYen(input.amount)}`
      : '';
    if (!confirm(`過去売上復元から確定売上として登録します。${diffMsg}\n\n既存売上は上書きしません。よろしいですか？`)) return false;

    const result = Storage.convertCalendarPastCandidateToRevenue(wo.id, {
      today: TODAY(),
      override: {
        workDate: input.workDate,
        customerName: input.customerName,
        service: input.service || input.actualService,
        actualService: input.actualService,
        source: input.source,
        amount: input.amount,
        memo: input.actualMemo,
        paymentStatus: input.paymentStatus,
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod,
        paymentConcern: input.paymentConcern,
        grossMarginRate: input.grossMarginRate,
        followMemo: input.followMemo,
        singleConvert: true
      }
    });
    if (!result || !result.ok || !result.added) {
      alert(result && result.skipped
        ? '登録できませんでした。重複疑い・対象外・金額なしの可能性があります。'
        : '売上確定に失敗しました。売上データは更新していません。');
      return false;
    }
    const newRecord = (result.addedRecords && result.addedRecords[0]) || null;
    closeWorkCompletionModal();
    refreshAfterWorkCompletion();
    renderDailyRevenueConfirmationQueue();
    if (newRecord) showRevenueConfirmedNotice(newRecord);
    return true;
  }

  function submitWorkCompletion(e) {
    e.preventDefault();
    const workOrderId = document.getElementById('work-completion-wo-id').value;
    const wo = Storage.getWorkOrders().find(w => w.id === workOrderId);
    if (!wo) return;
    if (isWorkOrderRevenueLocked(wo)) {
      alert('この作業予定はすでに売上確定済みです。二重登録はできません。');
      return;
    }
    if (wo.status === 'cancelled') {
      alert('キャンセル済みの作業予定です。');
      return;
    }
    const input = {
      workDate: document.getElementById('work-completion-date').value,
      customerName: document.getElementById('work-completion-customer').value.trim(),
      actualService: document.getElementById('work-completion-actual-service').value.trim(),
      service: document.getElementById('work-completion-service').value,
      source: document.getElementById('work-completion-source').value,
      amount: Number(document.getElementById('work-completion-amount').value) || 0,
      grossMarginRate: document.getElementById('work-completion-gross-rate').value,
      paymentStatus: document.getElementById('work-completion-payment-status').value,
      paymentDate: document.getElementById('work-completion-payment-date').value,
      paymentMethod: document.getElementById('work-completion-payment-method').value,
      paymentConcern: document.getElementById('work-completion-payment-concern').checked,
      actualMemo: document.getElementById('work-completion-actual-memo').value.trim(),
      additionalMemo: '',
      followMemo: document.getElementById('work-completion-follow-memo').value.trim()
    };
    if (!input.customerName || !input.amount) {
      alert('お客様名と実際の売上金額は必須です。');
      return;
    }
    const queueSource = document.getElementById('work-completion-queue-source')?.value || 'work-order';
    if (queueSource === 'past-recovery') {
      submitPastRecoveryFromModal(wo, input);
      return;
    }
    const estimate = wo.estimateAmount || 0;
    const diffMsg = estimate && estimate !== input.amount
      ? `\n予定金額 ${WorkOrderBrain.formatYen(estimate)} → 実績 ${WorkOrderBrain.formatYen(input.amount)}`
      : '';
    if (!confirm(`確定売上として登録します。${diffMsg}\n\nこの操作は売上集計に反映されます。よろしいですか？`)) return;

    const revenuePayload = WorkCompletionBrain.createRevenuePayloadFromWorkOrder(wo, input);
    const newRecord = Storage.addRevenueRecord(revenuePayload);
    const woPatch = WorkCompletionBrain.markWorkOrderCompleted(wo, newRecord, input);
    Storage.updateWorkOrder(workOrderId, woPatch);
    const intakeId = getWorkOrderReceptionId(wo);
    if (intakeId) linkReceptionToRevenue(intakeId, newRecord.id, workOrderId);
    closeWorkCompletionModal();
    refreshAfterWorkCompletion();
    renderDailyRevenueConfirmationQueue();
    showRevenueConfirmedNotice(newRecord);
  }

  function submitWorkCancel(e) {
    e.preventDefault();
    const workOrderId = document.getElementById('work-cancel-wo-id').value;
    const wo = Storage.getWorkOrders().find(w => w.id === workOrderId);
    if (!wo) return;
    if (isWorkOrderRevenueLocked(wo)) {
      alert('売上確定済みの作業予定はキャンセルできません。');
      return;
    }
    if (wo.status === 'cancelled') {
      alert('すでにキャンセル済みです。');
      return;
    }
    const cancelInput = {
      reason: document.getElementById('work-cancel-reason').value.trim(),
      canceledAt: document.getElementById('work-cancel-date').value || TODAY(),
      proposeAgain: document.getElementById('work-cancel-propose-again').checked,
      memo: ''
    };
    if (!cancelInput.reason) {
      alert('キャンセル理由を入力してください。');
      return;
    }
    if (!confirm('この作業予定をキャンセルします。売上には登録されません。よろしいですか？')) return;
    const patch = WorkCompletionBrain.markWorkOrderCanceled(wo, cancelInput);
    Storage.updateWorkOrder(workOrderId, patch);
    if (document.getElementById('work-cancel-add-task').checked) {
      addTaskFromWorkCompletion(workOrderId, 'cancelFollow');
    }
    closeWorkCancelModal();
    refreshAfterWorkCompletion();
    alert('キャンセルしました。');
  }

  function markWorkOrderNeedsReview(workOrderId) {
    const wo = Storage.getWorkOrders().find(w => w.id === workOrderId);
    if (!wo) return;
    const note = prompt('要確認の内容を入力してください（任意）', (wo.completion && wo.completion.reviewNote) || '');
    if (note === null) return;
    Storage.updateWorkOrder(workOrderId, WorkCompletionBrain.markWorkOrderNeedsReview(wo, note));
    refreshAfterWorkCompletion();
    alert('要確認にしました。');
  }

  function addTaskFromWorkCompletion(workOrderId, type) {
    const wo = Storage.getWorkOrders().find(w => w.id === workOrderId);
    if (!wo) return;
    const taskPayload = WorkCompletionBrain.createTaskPayload(wo, type || 'confirm', TODAY());
    const store = Storage.getDailyActionTasksData();
    if (store.manualTasks.some(t => t.pickupDedupeKey === taskPayload.pickupDedupeKey)) {
      alert('同じ毎日やることはすでに追加済みです。');
      return;
    }
    Storage.addManualDailyTask(taskPayload);
    renderDailyActionTasks();
    renderExecutiveHome();
    alert('毎日やることに追加しました。');
  }

  function refreshAfterWorkCompletion() {
    renderWorkOrderView();
    renderRevenueView();
    renderReceptionView();
    renderDashboard();
    renderFollowUpView();
    renderAreaView();
    renderMorningExecutiveSections();
  }

  function renderWorkOrderPendingCompletionList() {
    renderRevenueConfirmationQueueBlock('work-order-pending-completion-list', { limit: 5 });
  }

  function renderWorkOrderItemActions(workOrder) {
    const wo = WorkOrderBrain.normalizeWorkOrder(workOrder);
    const cal = WorkOrderBrain.buildGoogleCalendarUrl(wo);
    const mapUrl = MapBrain.buildGoogleMapSearchUrl(wo.address);
    const completed = wo.status === 'completed';
    const hasRevenue = !!wo.actualRevenueId;
    const isCancelled = wo.status === 'cancelled';
    const canConfirm = !hasRevenue && !isCancelled && typeof WorkCompletionBrain !== 'undefined'
      && WorkCompletionBrain.isOperationalWorkOrder(wo);
    const primary = [
      canConfirm ? `<button type="button" class="btn btn-sm btn-primary" data-wo-completion="${esc(wo.id)}">売上確定</button>` : '',
      hasRevenue ? `<button type="button" class="btn btn-sm btn-secondary" data-wo-open-revenue="${esc(wo.id)}">売上明細を開く</button>` : ''
    ].filter(Boolean).join('');
    const secondary = [
      mapUrl ? `<a href="${esc(mapUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-secondary">Googleマップで開く</a>` : '',
      cal.ready ? `<a href="${esc(cal.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-secondary" data-wo-calendar="${esc(wo.id)}">Googleカレンダーに追加</a>` : '',
      `<button type="button" class="btn btn-sm btn-secondary" data-wo-add-task="${esc(wo.id)}">毎日やることに追加</button>`,
      canConfirm ? `<button type="button" class="btn btn-sm btn-secondary" data-wo-needs-review="${esc(wo.id)}">要確認</button>` : '',
      hasRevenue ? `<button type="button" class="btn btn-sm btn-secondary" data-wo-goto-follow="${esc(wo.id)}">フォローへ</button>` : '',
      `<button type="button" class="btn btn-sm btn-secondary" data-wo-edit="${esc(wo.id)}">編集</button>`,
      canConfirm ? `<button type="button" class="btn btn-sm btn-secondary btn-danger-outline" data-wo-cancel-open="${esc(wo.id)}">キャンセル</button>` : ''
    ].filter(Boolean).join('');
    return `
      <div class="work-order-item-actions-primary">${primary || '<span class="work-order-item-no-primary">—</span>'}</div>
      <details class="work-order-item-actions-details">
        <summary>詳細操作</summary>
        <div class="work-order-item-actions-secondary">${secondary}</div>
      </details>`;
  }

  function renderWorkOrderItemCard(workOrder, options) {
    const opts = options || {};
    const wo = WorkOrderBrain.normalizeWorkOrder(workOrder);
    const area = WorkOrderBrain.getWorkOrderArea(wo);
    const timeLabel = wo.startTime && wo.endTime ? `${wo.startTime}〜${wo.endTime}` : (wo.startTime || '時間未設定');
    const todayClass = opts.isToday ? ' is-today' : '';
    return `
      <div class="work-order-item${todayClass}" data-work-order-id="${esc(wo.id)}">
        <div class="work-order-item-header">
          <strong>${esc(timeLabel)}</strong>
          <span class="work-order-status-badge work-order-status-${esc(wo.status)}">${esc(WorkOrderBrain.formatStatus(wo.status))}</span>
          ${renderCalendarCandidateBadge(wo)}
          ${renderWorkCompletionStatusBadge(wo)}
        </div>
        <p class="work-order-item-meta"><strong>${esc(wo.customerName || '（名前なし）')}</strong> / ${esc(wo.serviceText || '—')}</p>
        <p class="work-order-item-meta">エリア：${esc(area)} ${renderAreaDistanceBadge(area, wo.address)} / 見込み：${esc(WorkOrderBrain.formatYen(wo.estimateAmount))}${typeof CalendarCandidateBrain !== 'undefined' && CalendarCandidateBrain.isCalendarCandidateWorkOrder(wo) && !wo.actualRevenueId ? ' <span class="work-order-not-revenue">（売上未確定）</span>' : ''}</p>
        <div class="work-order-item-actions">
          ${renderWorkOrderItemActions(wo)}
        </div>
      </div>`;
  }

  function bindWorkOrderItemEvents(container) {
    if (!container) return;
    bindMapActionEvents(container);
    container.querySelectorAll('[data-wo-calendar]').forEach(link => {
      link.addEventListener('click', () => {
        Storage.updateWorkOrder(link.dataset.woCalendar, { calendarAdded: true });
      });
    });
    container.querySelectorAll('[data-wo-add-task]').forEach(btn => {
      btn.addEventListener('click', () => addTaskFromWorkOrder(btn.dataset.woAddTask));
    });
    container.querySelectorAll('[data-wo-complete]').forEach(btn => {
      btn.addEventListener('click', () => completeWorkOrder(btn.dataset.woComplete));
    });
    container.querySelectorAll('[data-wo-completion], [data-wo-completion-open]').forEach(btn => {
      btn.addEventListener('click', () => openWorkCompletionModal(btn.dataset.woCompletion || btn.dataset.woCompletionOpen));
    });
    container.querySelectorAll('[data-wo-cancel-open]').forEach(btn => {
      btn.addEventListener('click', () => openWorkCancelModal(btn.dataset.woCancelOpen));
    });
    container.querySelectorAll('[data-wo-needs-review]').forEach(btn => {
      btn.addEventListener('click', () => markWorkOrderNeedsReview(btn.dataset.woNeedsReview));
    });
    container.querySelectorAll('[data-wo-goto-follow]').forEach(btn => {
      btn.addEventListener('click', () => navigateToView('follow-up'));
    });
    container.querySelectorAll('[data-wo-open-revenue]').forEach(btn => {
      btn.addEventListener('click', () => {
        const wo = Storage.getWorkOrders().find(w => w.id === btn.dataset.woOpenRevenue);
        if (!wo || !wo.actualRevenueId) return;
        navigateToView('revenue');
        openRevenueEdit(wo.actualRevenueId);
      });
    });
    container.querySelectorAll('[data-wo-fill-revenue]').forEach(btn => {
      btn.addEventListener('click', () => fillRevenueFromWorkOrder(btn.dataset.woFillRevenue));
    });
    container.querySelectorAll('[data-wo-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const wo = Storage.getWorkOrders().find(w => w.id === btn.dataset.woEdit);
        if (wo) {
          setWorkOrderFormData(wo);
          scrollToElement('#work-order-form');
        }
      });
    });
  }

  function addTaskFromWorkOrder(workOrderId) {
    const wo = Storage.getWorkOrders().find(w => w.id === workOrderId);
    if (!wo) return;
    const today = TODAY();
    const taskPayload = WorkOrderBrain.createTaskPayload(wo, today);
    const store = Storage.getDailyActionTasksData();
    if (store.manualTasks.some(t => t.pickupDedupeKey === taskPayload.pickupDedupeKey)) {
      alert('同じ毎日やることはすでに追加済みです。');
      return;
    }
    Storage.addManualDailyTask(taskPayload);
    renderWorkOrderView();
    renderDailyActionTasks();
    renderExecutiveHome();
    renderMorningDailyTasksBrief();
    alert('毎日やることに追加しました。');
  }

  function completeWorkOrder(workOrderId) {
    Storage.updateWorkOrder(workOrderId, {
      status: 'completed',
      completedAt: new Date().toISOString()
    });
    renderWorkOrderView();
    renderReceptionView();
    renderDashboard();
    renderAreaView();
    alert('作業を完了にしました。売上フォームへ反映して登録してください。');
  }

  function fillRevenueFromWorkOrder(workOrderId) {
    const wo = Storage.getWorkOrders().find(w => w.id === workOrderId);
    if (!wo) return;
    if (isWorkOrderRevenueLocked(wo)) {
      alert('この作業予定はすでに売上確定済みです。');
      return;
    }
    const candidate = WorkOrderBrain.buildRevenueFormPayload(wo);
    pendingRevenueWorkOrderId = workOrderId;
    pendingRevenueIntakeId = candidate.intakeId || getWorkOrderReceptionId(wo);
    fillRevenueSelects();
    navigateToView('revenue');
    resetRevenueForm();
    pendingRevenueWorkOrderId = workOrderId;
    document.getElementById('revenue-work-date').value = candidate.workDate || TODAY();
    document.getElementById('revenue-customer').value = candidate.customerName || '';
    const serviceEl = document.getElementById('revenue-service');
    if (serviceEl) serviceEl.value = candidate.service || serviceEl.value;
    const sourceEl = document.getElementById('revenue-source');
    if (sourceEl) fillSourceSelectOptions(sourceEl, candidate.source || sourceEl.value);
    applyRevenueGrossMarginDefault({ force: true });
    document.getElementById('revenue-amount').value = candidate.amount || '';
    document.getElementById('revenue-memo').value = candidate.memo || '';
    document.getElementById('revenue-status').value = '予定';
    fillRevenueLeadSelect(candidate.leadId || '');
    toggleRevenueLeadOptions();
    if (pendingRevenueIntakeId) clearReceptionDraftInputs({ renderNext: false });
    setTimeout(() => scrollToElement('#revenue-form'), 120);
    alert('売上フォームに反映しました。内容を確認して保存してください。');
  }

  function renderWorkOrderForecast() {
    const el = document.getElementById('work-order-forecast');
    if (!el) return;
    const forecast = WorkOrderBrain.getSalesForecast(Storage.getWorkOrders(), Storage.getRevenueRecords(), TODAY());
    const cards = [
      { label: '今日の売上見込み', value: WorkOrderBrain.formatYen(forecast.todayAmount), sub: `${forecast.todayCount}件` },
      { label: '今週の売上見込み', value: WorkOrderBrain.formatYen(forecast.weekAmount), sub: `${forecast.weekCount}件` },
      { label: '今月の売上見込み', value: WorkOrderBrain.formatYen(forecast.monthAmount), sub: `${forecast.monthCount}件` },
      { label: '仮予定の見込み', value: WorkOrderBrain.formatYen(forecast.tentativeAmount), sub: `${forecast.tentativeCount}件` },
      { label: '確定予定の見込み', value: WorkOrderBrain.formatYen(forecast.confirmedAmount), sub: `${forecast.confirmedCount}件` },
      { label: '完了・売上未登録', value: `${forecast.completedNoRevenueCount}件`, sub: '要対応' }
    ];
    el.innerHTML = cards.map(c =>
      `<div class="work-order-forecast-item"><span>${esc(c.label)}</span><strong>${esc(c.value)}</strong><small>${esc(c.sub)}</small></div>`
    ).join('');
  }

  function renderWorkOrderTodayList() {
    const el = document.getElementById('work-order-today-list');
    if (!el) return;
    const today = TODAY();
    const items = WorkOrderBrain.getTodayWorkOrders(Storage.getWorkOrders(), today);
    if (!items.length) {
      el.innerHTML = '<p class="placeholder-text">今日の作業予定はありません。</p>';
      return;
    }
    el.innerHTML = items.map(wo => renderWorkOrderItemCard(wo)).join('');
    bindWorkOrderItemEvents(el);
  }

  function renderWorkOrderWeekList() {
    const el = document.getElementById('work-order-week-list');
    if (!el) return;
    const today = TODAY();
    const items = WorkOrderBrain.getWeekWorkOrders(Storage.getWorkOrders(), today);
    if (!items.length) {
      el.innerHTML = '<p class="placeholder-text">今週の作業予定はありません。</p>';
      return;
    }
    const groups = WorkOrderBrain.groupByDate(items);
    el.innerHTML = groups.map(g => `
      <div class="work-order-day-group">
        <p class="work-order-day-label">${esc(g.date === today ? '今日 ' + g.date : g.date)}</p>
        ${g.items.map(wo => renderWorkOrderItemCard(wo, { isToday: g.date === today })).join('')}
      </div>`).join('');
    bindWorkOrderItemEvents(el);
  }

  function renderWorkOrderFromIntakeList() {
    const el = document.getElementById('work-order-from-intake-list');
    if (!el) return;
    const linked = Storage.getWorkOrders().filter(w => w.intakeId);
    if (!linked.length) {
      el.innerHTML = '<p class="placeholder-text">受付から作成した作業予定はまだありません。</p>';
      return;
    }
    el.innerHTML = linked.map(wo => renderWorkOrderItemCard(wo)).join('');
    bindWorkOrderItemEvents(el);
  }

  function renderWorkOrderView() {
    try {
      safeRenderSection(null, () => renderWorkOrderCalendarBrief(), '過去売上復元');
      safeRenderSection('work-order-pending-completion-list', () => renderWorkOrderPendingCompletionList(), '売上確定待ち');
      if (document.getElementById('work-order-forecast')) {
        safeRenderSection('work-order-forecast', () => renderWorkOrderForecast(), '売上見込み');
      }
      safeRenderSection('work-order-week-list', () => renderWorkOrderWeekList(), '今週の作業予定');
      safeRenderSection('work-order-today-list', () => renderWorkOrderTodayList(), '今日の作業予定');
      safeRenderSection('work-order-from-intake-list', () => renderWorkOrderFromIntakeList(), '受付から作業予定化');
      fillWorkOrderSelects();
      updateWorkOrderCalendarHint();
    } catch (err) {
      console.error('[Budil] render error: 作業予定番頭', err);
      const el = document.getElementById('work-order-today-list');
      if (el) {
        el.innerHTML = '<p class="section-render-error">このセクションの表示中にエラーが発生しました。バックアップ後、データ診断を実行してください。</p>';
      }
    }
  }

  function initWorkOrder() {
    const form = document.getElementById('work-order-form');
    if (!form) return;
    fillWorkOrderSelects();
    ['work-order-address'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', debounce(syncWorkOrderAreaFromAddress, 300));
    });
    ['work-order-date', 'work-order-start', 'work-order-end'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', updateWorkOrderCalendarHint);
    });
    const areaEl = document.getElementById('work-order-area');
    if (areaEl) {
      areaEl.addEventListener('change', () => {
        areaEl.dataset.manual = areaEl.value ? '1' : '';
        syncWorkOrderAreaFromAddress();
      });
    }
    form.addEventListener('submit', e => {
      e.preventDefault();
      const saved = saveWorkOrderFromForm();
      if (!saved) return;
      renderWorkOrderView();
      renderDashboard();
      renderAreaView();
      alert('作業予定を保存しました。');
    });
    const clearBtn = document.getElementById('btn-work-order-clear');
    if (clearBtn) clearBtn.addEventListener('click', clearWorkOrderForm);
    const gmapBtn = document.getElementById('btn-work-order-gmap');
    if (gmapBtn) {
      gmapBtn.addEventListener('click', () => {
        const url = MapBrain.buildGoogleMapSearchUrl(getWorkOrderFormData().address);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
        else alert('住所を入力してください');
      });
    }
    const calBtn = document.getElementById('btn-work-order-calendar');
    if (calBtn) {
      calBtn.addEventListener('click', () => {
        const cal = WorkOrderBrain.buildGoogleCalendarUrl(getWorkOrderFormData());
        if (!cal.ready) {
          alert(cal.reason || '予定日または時間を入力してください');
          return;
        }
        window.open(cal.url, '_blank', 'noopener,noreferrer');
        const id = document.getElementById('work-order-edit-id').value;
        if (id) Storage.updateWorkOrder(id, { calendarAdded: true });
      });
    }
    initWorkCompletion();
  }

  function initWorkCompletion() {
    fillWorkCompletionSelects();
    const completionForm = document.getElementById('work-completion-form');
    if (completionForm && !completionForm.dataset.bound) {
      completionForm.dataset.bound = '1';
      completionForm.addEventListener('submit', submitWorkCompletion);
    }
    const cancelForm = document.getElementById('work-cancel-form');
    if (cancelForm && !cancelForm.dataset.bound) {
      cancelForm.dataset.bound = '1';
      cancelForm.addEventListener('submit', submitWorkCancel);
    }
    const closeBtn = document.getElementById('btn-work-completion-cancel-modal');
    if (closeBtn) closeBtn.addEventListener('click', closeWorkCompletionModal);
    const cancelCloseBtn = document.getElementById('btn-work-cancel-close');
    if (cancelCloseBtn) cancelCloseBtn.addEventListener('click', closeWorkCancelModal);
    const addTaskBtn = document.getElementById('btn-work-completion-add-task');
    if (addTaskBtn) {
      addTaskBtn.addEventListener('click', () => {
        const id = document.getElementById('work-completion-wo-id').value;
        if (id) addTaskFromWorkCompletion(id, 'confirm');
      });
    }
    bindGrossMarginManualTracking(document.getElementById('work-completion-gross-rate'));
    document.getElementById('work-completion-source')?.addEventListener('change', () => applyWorkCompletionGrossMarginDefault());
    document.querySelectorAll('#work-completion-modal, #work-cancel-modal').forEach(modal => {
      modal.addEventListener('click', e => {
        if (e.target === modal) modal.classList.add('hidden');
      });
    });
  }

  // ── 作業後フォロー番頭 ──
  function getFollowUpContext() {
    const today = TODAY();
    const workOrders = Storage.getWorkOrders();
    const revenues = Storage.getRevenueRecords();
    const leads = Storage.getLeads();
    const targets = FollowUpBrain.getFollowUpTargets({ workOrders, revenues, leads, today });
    return { today, workOrders, revenues, leads, targets };
  }

  function findFollowUpTarget(targetId) {
    if (!targetId) return null;
    return getFollowUpContext().targets.find(t => t.id === targetId) || null;
  }

  function saveFollowUpForTarget(target, partialFollowUp) {
    if (!target) return;
    const now = new Date().toISOString();
    const nextFollowUp = FollowUpBrain.normalizeFollowUp({
      ...target.followUp,
      ...partialFollowUp,
      updatedAt: now
    });
    if (target.workOrderId) {
      Storage.updateWorkOrder(target.workOrderId, { followUp: nextFollowUp });
    }
    if (target.revenueId) {
      Storage.updateRevenueRecord(target.revenueId, { followUp: nextFollowUp });
    }
    return nextFollowUp;
  }

  function addLeadFollowUpActivity(target, type, extra) {
    if (!target.leadId) return;
    const log = FollowUpBrain.buildLeadActivityLog(target, type, extra);
    Storage.addLeadActivityLog(target.leadId, log);
    if (extra && extra.nextAction) {
      Storage.updateLead(target.leadId, {
        nextAction: extra.nextAction,
        nextActionDate: extra.nextActionDate || '',
        nextContact: extra.nextActionDate || ''
      });
    }
    if (extra && extra.salesStatus) {
      Storage.updateLead(target.leadId, { salesStatus: extra.salesStatus, priority: extra.priority || 'B' });
    }
  }

  function renderFollowUpTargetCard(target, selected) {
    const lead = target.leadId ? Storage.getLeads().find(l => l.id === target.leadId) : null;
    const leadLabel = lead ? lead.company : (target.leadId ? '（削除済み）' : '—');
    return `
      <div class="follow-up-target-card ${selected ? 'selected' : ''}" data-follow-up-target="${esc(target.id)}">
        <div class="follow-up-target-header">
          <strong>${esc(target.customerName || '（名前なし）')}</strong>
          ${FollowUpBrain.formatFollowUpBadges(target.followUp)}
        </div>
        <p class="follow-up-target-meta">作業日：${esc(target.workDate || '—')} / ${esc(target.serviceText || '—')}</p>
        <p class="follow-up-target-meta">売上：${esc(RevenueBrain.formatYen(target.amount))} / 依頼元：${esc(target.source || '—')} / 営業先：${esc(leadLabel)}</p>
        <p class="follow-up-target-meta">状態：${esc(FollowUpBrain.formatFollowUpStatus(target))}</p>
        <p class="follow-up-target-meta">次回メンテ目安：${esc(target.followUp.nextMaintenanceDate || '—')}（${esc(target.maintenanceLabel || '—')}）</p>
      </div>`;
  }

  function renderFollowUpDetail(target) {
    const panel = document.getElementById('follow-up-detail-panel');
    const el = document.getElementById('follow-up-detail');
    if (!panel || !el || !target) {
      if (panel) panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');
    const profile = Storage.getBusinessProfile() || {};
    const thanksMsg = FollowUpBrain.generateThanksMessage(target, profile);
    const reviewMsg = FollowUpBrain.generateReviewRequest(target, profile);
    const repeatMsg = FollowUpBrain.generateRepeatProposal(target, profile);
    const nextMaint = target.followUp.nextMaintenanceDate
      || FollowUpBrain.estimateNextMaintenanceDate(target, TODAY());

    el.innerHTML = `
      <p class="follow-up-target-meta"><strong>${esc(target.customerName)}</strong> / ${esc(target.serviceText || '')} / ${esc(target.workDate || '')}</p>
      <div class="follow-up-detail-block">
        <h3>お礼LINE文</h3>
        <textarea class="follow-up-message-text" id="follow-up-thanks-text" readonly>${esc(thanksMsg)}</textarea>
        <div class="follow-up-actions">
          <button type="button" class="btn btn-sm btn-secondary" data-follow-copy="thanks">お礼文コピー</button>
          <button type="button" class="btn btn-sm btn-primary" data-follow-mark="thanks">お礼済みにする</button>
          <button type="button" class="btn btn-sm btn-secondary" data-follow-task="thanks">毎日やることに追加</button>
        </div>
      </div>
      <div class="follow-up-detail-block">
        <h3>口コミ依頼文</h3>
        <textarea class="follow-up-message-text" id="follow-up-review-text" readonly>${esc(reviewMsg)}</textarea>
        <div class="follow-up-actions">
          <button type="button" class="btn btn-sm btn-secondary" data-follow-copy="review">口コミ依頼文コピー</button>
          <button type="button" class="btn btn-sm btn-primary" data-follow-mark="review">口コミ依頼済みにする</button>
          <button type="button" class="btn btn-sm btn-secondary" data-follow-task="review">毎日やることに追加</button>
        </div>
      </div>
      <div class="follow-up-detail-block">
        <h3>次回メンテナンス提案</h3>
        <p class="follow-up-target-meta">次回目安：${esc(target.maintenanceLabel || '—')} / 予定日：<input type="date" id="follow-up-next-maint-date" value="${esc(nextMaint)}"></p>
        <textarea class="follow-up-message-text" id="follow-up-repeat-text" readonly>${esc(repeatMsg)}</textarea>
        <div class="form-group">
          <label for="follow-up-memo">フォローメモ</label>
          <input type="text" id="follow-up-memo" value="${esc(target.followUp.memo || '')}" placeholder="任意メモ">
        </div>
        <div class="follow-up-actions">
          <button type="button" class="btn btn-sm btn-secondary" data-follow-copy="repeat">提案文コピー</button>
          <button type="button" class="btn btn-sm btn-primary" data-follow-mark="repeat">リピート予定にする</button>
          <button type="button" class="btn btn-sm btn-secondary" data-follow-task="repeat">毎日やることに追加</button>
          <button type="button" class="btn btn-sm btn-secondary" data-follow-save-memo>メモ保存</button>
        </div>
      </div>`;

    bindFollowUpDetailEvents(target);
  }

  function bindFollowUpDetailEvents(target) {
    const root = document.getElementById('follow-up-detail');
    if (!root) return;
    root.querySelectorAll('[data-follow-copy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.followCopy;
        const id = kind === 'thanks' ? 'follow-up-thanks-text'
          : kind === 'review' ? 'follow-up-review-text' : 'follow-up-repeat-text';
        const text = document.getElementById(id)?.value || '';
        copyText(text).then(() => showAppToast('コピーしました')).catch(() => alert('コピーに失敗しました'));
      });
    });
    root.querySelectorAll('[data-follow-mark]').forEach(btn => {
      btn.addEventListener('click', () => markFollowUpDone(target.id, btn.dataset.followMark));
    });
    root.querySelectorAll('[data-follow-task]').forEach(btn => {
      btn.addEventListener('click', () => addFollowUpTask(target.id, btn.dataset.followTask));
    });
    const memoBtn = root.querySelector('[data-follow-save-memo]');
    if (memoBtn) {
      memoBtn.addEventListener('click', () => {
        const t = findFollowUpTarget(target.id);
        if (!t) return;
        const memo = document.getElementById('follow-up-memo')?.value.trim() || '';
        saveFollowUpForTarget(t, { memo });
        addLeadFollowUpActivity(t, 'memo', { memo });
        renderFollowUpView();
        alert('フォローメモを保存しました。');
      });
    }
  }

  function markFollowUpDone(targetId, type) {
    const target = findFollowUpTarget(targetId);
    if (!target) return;
    const now = new Date().toISOString();
    const today = TODAY();
    if (type === 'thanks') {
      saveFollowUpForTarget(target, { thanksStatus: 'done', thanksSentAt: now });
      addLeadFollowUpActivity(target, 'thanks');
    } else if (type === 'review') {
      saveFollowUpForTarget(target, { reviewStatus: 'done', reviewRequestedAt: now });
      addLeadFollowUpActivity(target, 'review');
    } else if (type === 'repeat') {
      const nextDate = document.getElementById('follow-up-next-maint-date')?.value
        || FollowUpBrain.estimateNextMaintenanceDate(target, today);
      const memo = document.getElementById('follow-up-memo')?.value.trim() || '';
      saveFollowUpForTarget(target, {
        repeatStatus: 'planned',
        nextMaintenanceDate: nextDate,
        memo
      });
      addLeadFollowUpActivity(target, 'repeat', {
        nextMaintenanceDate: nextDate,
        memo,
        nextAction: '次回メンテナンス確認',
        nextActionDate: nextDate,
        salesStatus: 'リピート候補',
        priority: 'B'
      });
    }
    renderFollowUpView();
    renderDashboard();
    renderLeadsTable();
    if (currentMessageLeadId === target.leadId) renderLeadDetailSubpanels(target.leadId);
    renderRevenueView();
    alert('フォロー状態を更新しました。');
  }

  function addFollowUpTask(targetId, type) {
    const target = findFollowUpTarget(targetId);
    if (!target) return;
    const today = TODAY();
    const payload = FollowUpBrain.createFollowUpTaskPayload(target, type, today);
    const store = Storage.getDailyActionTasksData();
    if (store.manualTasks.some(t => t.pickupDedupeKey === payload.pickupDedupeKey)) {
      alert('同じ毎日やることはすでに追加済みです。');
      return;
    }
    Storage.addManualDailyTask(payload);
    renderDailyActionTasks();
    renderExecutiveHome();
    renderMorningDailyTasksBrief();
    alert('毎日やることに追加しました。');
  }

  function renderFollowUpTargetsList() {
    const el = document.getElementById('follow-up-targets-list');
    if (!el) return;
    const { targets } = getFollowUpContext();
    const actionable = targets.filter(t => t.needsThanks || t.needsReview || t.maintenanceNear);
    const list = actionable;
    if (!list.length) {
      el.innerHTML = '<p class="placeholder-text">フォローが必要な作業はありません。作業完了・売上登録後に表示されます。</p>';
      selectedFollowUpTargetId = null;
      const panel = document.getElementById('follow-up-detail-panel');
      if (panel) panel.classList.add('hidden');
      return;
    }
    if (!selectedFollowUpTargetId || !list.some(t => t.id === selectedFollowUpTargetId)) {
      selectedFollowUpTargetId = list[0].id;
    }
    el.innerHTML = list.map(t => renderFollowUpTargetCard(t, t.id === selectedFollowUpTargetId)).join('');
    el.querySelectorAll('[data-follow-up-target]').forEach(card => {
      card.addEventListener('click', () => {
        selectedFollowUpTargetId = card.dataset.followUpTarget;
        renderFollowUpTargetsList();
        renderFollowUpDetail(findFollowUpTarget(selectedFollowUpTargetId));
      });
    });
    renderFollowUpDetail(findFollowUpTarget(selectedFollowUpTargetId));
  }

  function renderFollowUpRepeatList() {
    const el = document.getElementById('follow-up-repeat-list');
    if (!el) return;
    const { targets, leads } = getFollowUpContext();
    const repeatTargets = targets.filter(t => t.needsRepeat && (t.maintenanceNear || t.followUp.repeatStatus === 'planned'));
    const leadRepeats = leads.filter(l => l.salesStatus === 'リピート候補');
    if (!repeatTargets.length && !leadRepeats.length) {
      el.innerHTML = '<p class="placeholder-text">リピート候補はまだありません。</p>';
      return;
    }
    const parts = [];
    repeatTargets.forEach(t => {
      parts.push(`<div class="follow-up-target-card"><strong>${esc(t.customerName)}</strong>
        <p class="follow-up-target-meta">次回：${esc(t.followUp.nextMaintenanceDate || '—')} / ${esc(t.serviceText || '')}</p></div>`);
    });
    leadRepeats.forEach(l => {
      if (repeatTargets.some(t => t.leadId === l.id)) return;
      parts.push(`<div class="follow-up-target-card"><strong>${esc(l.company)}</strong>
        <p class="follow-up-target-meta">次回連絡：${esc(l.nextActionDate || l.nextContact || '—')} / ${esc(l.nextAction || '')}</p></div>`);
    });
    el.innerHTML = parts.join('');
  }

  function renderFollowUpHistoryList() {
    const el = document.getElementById('follow-up-history-list');
    if (!el) return;
    const history = FollowUpBrain.getFollowUpHistory(getFollowUpContext().targets);
    if (!history.length) {
      el.innerHTML = '<p class="placeholder-text">フォロー履歴はまだありません。</p>';
      return;
    }
    el.innerHTML = history.map(t => `
      <div class="follow-up-target-card">
        <strong>${esc(t.customerName)}</strong> ${FollowUpBrain.formatFollowUpBadges(t.followUp)}
        <p class="follow-up-target-meta">${esc(t.workDate || '—')} / ${esc(t.serviceText || '')}</p>
        <p class="follow-up-target-meta">${esc(FollowUpBrain.formatFollowUpStatus(t))}</p>
      </div>`).join('');
  }

  function renderFollowUpView() {
    try {
      safeRenderSection('follow-up-targets-list', () => renderFollowUpTargetsList(), 'フォロー対象');
      safeRenderSection('follow-up-repeat-list', () => renderFollowUpRepeatList(), 'リピート候補');
      safeRenderSection('follow-up-history-list', () => renderFollowUpHistoryList(), 'フォロー履歴');
    } catch (err) {
      console.error('[Budil] render error: 作業後フォロー番頭', err);
      const el = document.getElementById('follow-up-targets-list');
      if (el) {
        el.innerHTML = '<p class="section-render-error">このセクションの表示中にエラーが発生しました。</p>';
      }
    }
  }

  function renderLeadFollowUpSummary(leadId) {
    const el = document.getElementById('lead-follow-up-summary');
    if (!el) return;
    const lead = Storage.getLeads().find(l => l.id === leadId);
    if (!lead) {
      el.innerHTML = '';
      return;
    }
    const { targets } = getFollowUpContext();
    const related = targets.filter(t => t.leadId === leadId);
    const latest = related[0];
    const isRepeat = lead.salesStatus === 'リピート候補';
    const nextMaint = lead.nextActionDate || lead.nextContact || (latest && latest.followUp.nextMaintenanceDate) || '';
    if (!latest && !isRepeat) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `
      <h3>作業後フォロー${isRepeat ? '<span class="lead-repeat-badge">リピート候補</span>' : ''}</h3>
      ${latest ? `<p class="follow-up-target-meta">最新：${esc(latest.serviceText || '—')}（${esc(latest.workDate || '—')}）</p>
        <p class="follow-up-target-meta">${FollowUpBrain.formatFollowUpBadges(latest.followUp)}</p>
        <p class="follow-up-target-meta">状態：${esc(FollowUpBrain.formatFollowUpStatus(latest))}</p>` : ''}
      ${nextMaint ? `<p class="follow-up-target-meta">次回メンテナンス予定：${esc(nextMaint)}</p>` : ''}
      <button type="button" class="btn btn-sm btn-secondary" data-lead-open-follow-up>フォローを開く</button>`;
    const btn = el.querySelector('[data-lead-open-follow-up]');
    if (btn) btn.addEventListener('click', goToFollowUp);
  }

  function renderRevenueFollowUpBadges(record) {
    if (!record || !record.followUp) return '';
    const badges = FollowUpBrain.formatFollowUpBadges(record.followUp);
    return badges ? `<div class="revenue-follow-up-badges">${badges}</div>` : '';
  }

  function getRevenueFollowUpFromWorkOrder(record) {
    if (!record) return null;
    if (record.followUp) return FollowUpBrain.normalizeFollowUp(record.followUp);
    if (!record.id) return null;
    const wo = Storage.getWorkOrders().find(w => w.actualRevenueId === record.id);
    if (wo && wo.followUp) return FollowUpBrain.normalizeFollowUp(wo.followUp);
    return null;
  }

  function initFollowUp() {
    /* イベントは renderFollowUpView 内で都度バインド */
  }

  // ── 利益管理 ──
  function getProfitContext(opts) {
    const today = TODAY();
    const revenues = Storage.getRevenueRecords();
    const expenses = Storage.getExpenseRecords();
    const workOrders = Storage.getWorkOrders();
    const leads = Storage.getLeads();
    const intakes = Storage.getReceptionIntakes();
    let filteredRevenues = revenues;
    let filteredExpenses = expenses;
    const range = opts && opts.period;
    if (range && range.startDate && range.endDate) {
      filteredRevenues = revenues.filter(r =>
        r && r.workDate && r.workDate >= range.startDate && r.workDate <= range.endDate
      );
      filteredExpenses = expenses.filter(e =>
        e && e.date && e.date >= range.startDate && e.date <= range.endDate
      );
    }
    return ProfitBrain.buildProfitContext({
      today,
      revenues: filteredRevenues,
      expenses: filteredExpenses,
      workOrders,
      leads,
      intakes,
      monthlyResults: Storage.getMonthlyResults(),
      monthKey: opts && opts.monthKey
    });
  }

  function renderProfitSummary(ctx) {
    const el = document.getElementById('profit-summary');
    if (!el) return;
    const s = ctx.summary;
    const expenseCount = ProfitBrain.filterMonthExpenses(ctx.expenses || [], s.monthKey).length;
    const monthlyNote = s.usesMonthlyResult && s.aggregationSourceNote
      ? `<p class="profit-monthly-source-note">${esc(s.aggregationSourceNote)}</p>`
      : '';
    const flowNote = `<p class="profit-flow-note">利益は「売上 − 経費」で確認します。月次実績がある月は月次実績ベースの経営数字を優先表示します。日々の経費入力は支出明細として保存されます。</p>`;
    const aggBadge = `<p class="profit-aggregation-label">集計：<strong>${esc(s.usesMonthlyResult ? '月次実績ベース' : '明細ベース')}</strong></p>`;
    let monthlyBrief = '';
    if (!s.usesMonthlyResult && typeof RevenueSummaryBrain !== 'undefined') {
      const monthly = RevenueSummaryBrain.buildMonthlySummary(
        RevenueSummaryBrain.confirmedRecords(Storage.getRevenueRecords())
      ).slice(0, 3);
      if (monthly.length) {
        monthlyBrief = `<div class="profit-monthly-brief"><p class="profit-monthly-brief-title">月別確定売上（直近）</p>${monthly.map(m =>
          `<p class="profit-monthly-brief-line">${esc(m.label)}：${esc(RevenueSummaryBrain.formatYen(m.total))} / ${m.count}件</p>`
        ).join('')}</div>`;
      }
    }
    el.innerHTML = `
      ${flowNote}
      ${aggBadge}
      ${monthlyNote}
      ${s.usesMonthlyResult && typeof MonthlyResultsBrain !== 'undefined'
        ? renderCurrentMonthReconciliationBrief(s.monthKey, {
          usesMonthlyResult: true,
          monthlySales: s.monthRevenue,
          detailTotal: MonthlyResultsBrain.sumDetailRevenueForMonth(Storage.getRevenueRecords(), s.monthKey).total,
          diff: s.monthRevenue - MonthlyResultsBrain.sumDetailRevenueForMonth(Storage.getRevenueRecords(), s.monthKey).total,
          status: MonthlyResultsBrain.classifyReconciliationStatus(
            s.monthRevenue,
            MonthlyResultsBrain.sumDetailRevenueForMonth(Storage.getRevenueRecords(), s.monthKey).total,
            true,
            MonthlyResultsBrain.sumDetailRevenueForMonth(Storage.getRevenueRecords(), s.monthKey).count > 0
          )
        })
        : ''}
      <div class="profit-summary-item profit-summary-highlight"><span>今月利益</span><strong>${esc(ProfitBrain.formatYen(s.monthGrossProfit))}</strong></div>
      <div class="profit-summary-item"><span>利益率</span><strong>${esc(ProfitBrain.formatRate(s.monthGrossRate))}</strong></div>
      <div class="profit-summary-item"><span>今月売上</span><strong>${esc(ProfitBrain.formatYen(s.monthRevenue))}</strong></div>
      <div class="profit-summary-item"><span>今月経費</span><strong>${esc(ProfitBrain.formatYen(s.monthExpense))}</strong></div>
      <div class="profit-summary-item"><span>経費入力</span><strong>今月${expenseCount}件</strong></div>
      <div class="profit-summary-item"><span>作業予定見込み売上</span><strong>${esc(ProfitBrain.formatYen(s.workOrderEstimate))}</strong></div>
      <div class="profit-summary-item"><span>見込み利益</span><strong>${esc(ProfitBrain.formatYen(s.forecastProfit))}</strong></div>
      <div class="profit-summary-item"><span>広告費</span><strong>${esc(ProfitBrain.formatYen(s.adExpense))}</strong></div>
      <div class="profit-summary-item"><span>手数料</span><strong>${esc(ProfitBrain.formatYen(s.feeExpense))}</strong></div>
      <div class="profit-summary-item"><span>外注費</span><strong>${esc(ProfitBrain.formatYen(s.outsourceExpense))}</strong></div>
      <div class="profit-summary-item"><span>未紐付け支出</span><strong>${s.usesMonthlyResult ? '—' : `${s.unlinkedCount}件（${esc(ProfitBrain.formatYen(s.unlinkedTotal))}）`}</strong></div>
      ${monthlyBrief}`;
  }

  function renderProfitExpenseBreakdown(ctx, options) {
    const opts = options || {};
    const el = document.getElementById(opts.targetId || 'profit-expense-breakdown');
    if (!el || typeof ProfitBrain === 'undefined') return;
    const monthKey = (ctx.summary && ctx.summary.monthKey) || ProfitBrain.currentMonthKey(TODAY());
    const breakdown = ProfitBrain.buildMonthExpenseBreakdown(ctx.expenses || [], monthKey);
    if (breakdown.isEmpty) {
      el.innerHTML = `
        <div class="profit-expense-breakdown">
          <h3 class="profit-expense-breakdown-title">今月の経費内訳</h3>
          <p class="profit-expense-breakdown-empty">今月の経費入力はまだありません。</p>
          <p class="profit-expense-breakdown-hint">使ったお金があれば、経費入力に記録してください。</p>
        </div>`;
      return;
    }
    const rows = breakdown.rows.map(row =>
      `<li><span>${esc(row.category)}</span><strong>${esc(ProfitBrain.formatYen(row.amount))}</strong></li>`
    ).join('');
    el.innerHTML = `
      <div class="profit-expense-breakdown">
        <h3 class="profit-expense-breakdown-title">今月の経費内訳</h3>
        <ul class="profit-expense-breakdown-list">${rows}</ul>
        <p class="profit-expense-breakdown-total">合計：<strong>${esc(ProfitBrain.formatYen(breakdown.total))}</strong></p>
      </div>`;
  }

  function handleProfitDiagnosticAction(action) {
    if (!action || !action.view) return;
    navigateToView(action.view, action.scrollSelector || null);
  }

  function handleMonthlyClosingAction(action) {
    if (!action || !action.view) return;
    navigateToView(action.view, action.scrollSelector || null);
  }

  function handleExecutivePriorityAction(action) {
    if (!action || !action.view) return;
    navigateToView(action.view, action.scrollSelector || null);
  }

  function handleOperationsStartAction(action) {
    if (!action || !action.view) return;
    navigateToView(action.view, action.scrollSelector || null);
  }

  function getExecutivePriorityActionLabel() {
    const el = document.getElementById('exec-home-priority-action');
    const btn = el && el.querySelector('.exec-home-priority-action-btn');
    return btn ? btn.textContent.trim() : '';
  }

  function renderExecutiveNextAction() {
    const el = document.getElementById('exec-home-next-action');
    if (!el || typeof ProfitBrain === 'undefined') return;
    const today = TODAY();
    const profitCtx = getProfitContext();
    const check = ProfitBrain.buildMonthlyClosingCheck({
      today,
      profitCtx,
      workOrders: Storage.getWorkOrders(),
      revenues: Storage.getRevenueRecords(),
      monthlyResults: Storage.getMonthlyResults(),
      expenses: Storage.getExpenseRecords()
    });
    const action = check.primaryAction;
    const priorityLabel = getExecutivePriorityActionLabel();
    const duplicateCta = action && priorityLabel && action.label === priorityLabel;
    const actionBtn = action && !duplicateCta
      ? `<button type="button" class="btn btn-sm btn-primary exec-next-action-btn">${esc(action.label)}</button>`
      : '';
    el.innerHTML = `
      <p class="exec-next-action-message">${esc(check.nextAction)}</p>
      ${actionBtn}`;
    const btn = el.querySelector('.exec-next-action-btn');
    if (btn && action) {
      btn.addEventListener('click', () => handleMonthlyClosingAction(action));
    }
  }

  function renderOperationsStartCheck() {
    const el = document.getElementById('exec-home-operations-start-check');
    if (!el || typeof ProfitBrain === 'undefined') return;
    const check = ProfitBrain.buildOperationsStartCheck({
      today: TODAY(),
      workOrders: Storage.getWorkOrders(),
      revenues: Storage.getRevenueRecords(),
      expenses: Storage.getExpenseRecords(),
      monthlyResults: Storage.getMonthlyResults(),
      settings: Storage.getSettings()
    });
    const statusClass = check.statusKey === 'ok'
      ? 'is-ok'
      : (check.statusKey === 'test_data' || check.statusKey === 'backup' ? 'is-warn' : 'is-info');
    const action = check.primaryAction;
    const actionBtn = action
      ? `<div class="exec-home-operations-start-action-wrap"><button type="button" class="btn btn-sm btn-primary exec-home-operations-start-action-btn">${esc(action.label)}</button></div>`
      : '';
    const testDataLabel = check.testLikeCount > 0
      ? `${check.testLikeCount}件`
      : 'なし';
    el.innerHTML = `
      <div class="exec-home-operations-start-check ${statusClass}">
        <h3 class="exec-home-operations-start-title">実運用開始チェック</h3>
        <p class="exec-home-operations-start-status">${esc(check.statusLabel)}</p>
        <ul class="exec-home-operations-start-stats">
          <li><span>バックアップ：</span><strong>${esc(check.backupLabel)}</strong></li>
          <li><span>売上予定：</span><strong>${check.upcomingCount}件</strong></li>
          <li><span>売上確定待ち：</span><strong>${check.revenueQueueCount}件</strong></li>
          <li><span>今月の経費入力：</span><strong>${check.monthExpenseCount}件</strong></li>
          <li><span>月次実績：</span><strong>${esc(check.monthlyLabel)}</strong></li>
          <li><span>データ整合チェック：</span><strong>${esc(check.consistencyLabel)}</strong></li>
          <li><span>テストデータらしき予定：</span><strong>${esc(testDataLabel)}</strong></li>
        </ul>
        <p class="exec-home-operations-start-next">次にやること：${esc(check.nextAction)}</p>
        ${actionBtn}
      </div>`;
    const btn = el.querySelector('.exec-home-operations-start-action-btn');
    if (btn && action) {
      btn.addEventListener('click', () => handleOperationsStartAction(action));
    }
  }

  function renderExecutivePriorityAction() {
    const el = document.getElementById('exec-home-priority-action');
    if (!el || typeof ProfitBrain === 'undefined') return;
    const today = TODAY();
    const priority = ProfitBrain.buildExecutivePriorityAction({
      today,
      workOrders: Storage.getWorkOrders(),
      revenues: Storage.getRevenueRecords(),
      monthlyResults: Storage.getMonthlyResults(),
      expenses: Storage.getExpenseRecords()
    });
    const statusClass = priority.statusKey === 'ok'
      ? 'is-ok'
      : (priority.statusKey === 'reconciliation_gap' || priority.statusKey === 'revenue_queue' ? 'is-warn' : 'is-info');
    const action = priority.primaryAction;
    const actionBtn = action
      ? `<div class="exec-home-priority-action-btn-wrap"><button type="button" class="btn btn-sm btn-primary exec-home-priority-action-btn">${esc(action.label)}</button></div>`
      : '';
    el.innerHTML = `
      <div class="exec-home-priority-action ${statusClass}">
        <h3 class="exec-home-priority-action-title">今日の最優先アクション</h3>
        <p class="exec-home-priority-action-lead">今すぐ確認する項目です。</p>
        <p class="exec-home-priority-action-message">${esc(priority.message)}</p>
        ${actionBtn}
      </div>`;
    const btn = el.querySelector('.exec-home-priority-action-btn');
    if (btn && action) {
      btn.addEventListener('click', () => handleExecutivePriorityAction(action));
    }
  }

  function handleDataConsistencyAction(action) {
    if (!action || !action.view) return;
    navigateToView(action.view, action.scrollSelector || null);
  }

  function renderDataConsistencyCheck(containerId, options) {
    const el = document.getElementById(containerId);
    if (!el || typeof ProfitBrain === 'undefined') return;
    const opts = options || {};
    const isCompact = !!opts.compact;
    const check = ProfitBrain.buildDataConsistencyCheck({
      today: TODAY(),
      revenues: Storage.getRevenueRecords(),
      expenses: Storage.getExpenseRecords(),
      workOrders: Storage.getWorkOrders(),
      monthlyResults: Storage.getMonthlyResults(),
      settings: Storage.getSettings()
    });
    const statusClass = check.statusKey === 'ok'
      ? 'is-ok'
      : (check.statusKey === 'reconciliation_gap' || check.statusKey === 'input_leaks' ? 'is-warn' : 'is-info');
    const monthlyLabel = check.monthlyResultsMonthCount > 0
      ? `${check.monthlyResultsMonthCount}ヶ月分`
      : 'なし';
    const noticeItems = (check.notices || [])
      .slice(0, isCompact ? 3 : 8)
      .map(msg => `<li>${esc(msg)}</li>`)
      .join('');
    const action = check.primaryAction;
    const actionBtn = action
      ? `<div class="revenue-flow-diagnostics-action-wrap"><button type="button" class="btn btn-sm btn-primary data-consistency-check-action">${esc(action.label)}</button></div>`
      : '';
    const titleBlock = isCompact ? '' : '<h3 class="revenue-flow-diagnostics-title">データ整合チェック</h3>';
    const noteBlock = isCompact
      ? ''
      : '<p class="revenue-flow-diagnostics-note">読み取り専用です。データの修正・削除・自動同期は行いません。</p>';
    const backupBlock = check.backupWarning
      ? `<p class="data-consistency-backup-hint">${esc(check.backupWarning)}</p>`
      : '';
    const reviewBlock = check.reviewCount > 0
      ? `<p class="data-consistency-review-count">確認が必要な項目：${check.reviewCount}件</p>`
      : '';
    el.innerHTML = `
      <div class="revenue-flow-diagnostics data-consistency-check${isCompact ? ' data-consistency-check-compact' : ''}">
        ${titleBlock}
        ${noteBlock}
        <ul class="revenue-flow-diagnostics-stats">
          <li><span>売上明細：</span><strong>${check.revenueCount}件</strong></li>
          <li><span>作業予定：</span><strong>${check.workOrderCount}件</strong></li>
          <li><span>経費入力：</span><strong>${check.expenseCount}件</strong></li>
          <li><span>月次実績：</span><strong>${esc(monthlyLabel)}</strong></li>
        </ul>
        ${noticeItems ? `<ul class="data-consistency-notices ${statusClass}">${noticeItems}</ul>` : ''}
        <p class="revenue-flow-diagnostics-status ${statusClass}">${esc(check.statusLabel)}</p>
        ${reviewBlock}
        <p class="revenue-flow-diagnostics-next">次にやること：${esc(check.nextAction)}</p>
        ${backupBlock}
        ${actionBtn}
      </div>`;
    const btn = el.querySelector('.data-consistency-check-action');
    if (btn && action) {
      btn.addEventListener('click', () => handleDataConsistencyAction(action));
    }
  }

  function renderMonthlyClosingCheck(containerId, options) {
    const el = document.getElementById(containerId);
    if (!el || typeof ProfitBrain === 'undefined') return;
    const opts = options || {};
    const isCompact = !!opts.compact;
    const today = TODAY();
    const profitCtx = getProfitContext();
    const check = ProfitBrain.buildMonthlyClosingCheck({
      today,
      profitCtx,
      workOrders: Storage.getWorkOrders(),
      revenues: Storage.getRevenueRecords(),
      monthlyResults: Storage.getMonthlyResults(),
      expenses: Storage.getExpenseRecords()
    });
    const statusClass = check.statusKey === 'ready'
      ? 'is-ok'
      : (check.statusKey === 'reconciliation_gap' || check.statusKey === 'revenue_queue' ? 'is-warn' : 'is-info');
    const queueLabel = check.revenueConfirmationQueueCount > 0
      ? `${check.revenueConfirmationQueueCount}件`
      : 'なし';
    const upcomingLabel = check.upcomingScheduleCount > 0
      ? `${check.upcomingScheduleCount}件`
      : 'なし';
    const statusList = (check.statusMessages || [])
      .map(msg => `<li>${esc(msg)}</li>`)
      .join('');
    const action = check.primaryAction;
    const suppressAction = isCompact || opts.suppressAction;
    const actionBtn = !suppressAction && action
      ? `<div class="revenue-flow-diagnostics-action-wrap"><button type="button" class="btn btn-sm btn-primary monthly-closing-check-action">${esc(action.label)}</button></div>`
      : '';
    const titleBlock = isCompact ? '' : '<h3 class="revenue-flow-diagnostics-title">月次締めチェック</h3>';
    const noteBlock = isCompact
      ? ''
      : '<p class="revenue-flow-diagnostics-note">読み取り専用です。データの修正・削除・自動同期は行いません。</p>';
    const nextBlock = suppressAction
      ? ''
      : `<p class="revenue-flow-diagnostics-next">次にやること：${esc(check.nextAction)}</p>`;
    const flowBlock = isCompact
      ? ''
      : `<p class="revenue-flow-diagnostics-flow">${esc(check.flowNote)}</p>`;
    const statusBlock = isCompact
      ? `<p class="monthly-closing-check-status-brief ${statusClass}">${esc(check.statusMessages[0] || '確認できます')}</p>`
      : `<ul class="monthly-closing-check-status-list ${statusClass}">${statusList}</ul>`;
    el.innerHTML = `
      <div class="revenue-flow-diagnostics monthly-closing-check${isCompact ? ' monthly-closing-check-compact' : ''}">
        ${titleBlock}
        ${noteBlock}
        <ul class="revenue-flow-diagnostics-stats">
          <li><span>今月売上：</span><strong>${esc(ProfitBrain.formatYen(check.monthRevenue))}</strong></li>
          <li><span>今月経費：</span><strong>${esc(ProfitBrain.formatYen(check.monthExpense))}</strong></li>
          <li><span>今月利益：</span><strong>${esc(ProfitBrain.formatYen(check.monthProfit))}</strong></li>
          <li><span>売上確定待ち：</span><strong>${esc(queueLabel)}</strong></li>
          <li><span>売上予定：</span><strong>${esc(upcomingLabel)}</strong></li>
          <li><span>月次実績：</span><strong>${esc(check.monthlyResultLabel)}</strong></li>
          <li><span>整合チェック：</span><strong>${esc(check.reconciliationLabel)}</strong></li>
        </ul>
        ${statusBlock}
        ${nextBlock}
        ${actionBtn}
        ${flowBlock}
      </div>`;
    const btn = el.querySelector('.monthly-closing-check-action');
    if (btn && action) {
      btn.addEventListener('click', () => handleMonthlyClosingAction(action));
    }
  }

  function renderProfitOperationsDiagnostics(ctx, options) {
    const opts = options || {};
    const el = document.getElementById(opts.targetId || 'profit-operations-diagnostics');
    if (!el || typeof ProfitBrain === 'undefined') return;
    const isCompact = !!opts.compact;
    const diagnostics = ProfitBrain.buildProfitOperationsDiagnostics(ctx, {
      today: TODAY(),
      monthlyResults: Storage.getMonthlyResults(),
      revenues: Storage.getRevenueRecords()
    });
    const monthExpenses = ProfitBrain.filterMonthExpenses(ctx.expenses || [], diagnostics.monthKey);
    const expenseCount = monthExpenses.length;
    const statusClass = diagnostics.statusKey === 'ok'
      ? 'is-ok'
      : (diagnostics.statusKey === 'deficit' || diagnostics.statusKey === 'reconciliation_gap' ? 'is-warn' : 'is-info');
    const action = diagnostics.primaryAction;
    const suppressAction = isCompact || opts.suppressAction;
    const hideRevenueCta = opts.suppressRevenueLink && action && action.label === '売上予定を見る';
    const actionBtn = !suppressAction && action && !hideRevenueCta
      ? `<div class="revenue-flow-diagnostics-action-wrap"><button type="button" class="btn btn-sm btn-primary profit-operations-diagnostics-action">${esc(action.label)}</button></div>`
      : '';
    const titleBlock = isCompact ? '' : '<h3 class="revenue-flow-diagnostics-title">利益状態</h3>';
    const noteBlock = isCompact
      ? ''
      : '<p class="revenue-flow-diagnostics-note">読み取り専用です。データの修正・削除・自動同期は行いません。</p>';
    const defsBlock = isCompact ? '' : `
        <dl class="revenue-flow-diagnostics-defs">
          <div><dt>売上</dt><dd>確定売上明細、または月次実績の売上です。</dd></div>
          <div><dt>経費</dt><dd>経費入力で保存した支出明細です。</dd></div>
          <div><dt>利益</dt><dd>売上 − 経費で確認します。</dd></div>
          <div><dt>月次実績</dt><dd>ある月は月次実績ベースを優先表示します（売上明細とは別管理）。</dd></div>
        </dl>`;
    const nextBlock = suppressAction
      ? `<p class="revenue-flow-diagnostics-status ${statusClass}">状態：${esc(diagnostics.statusMessage)}</p>`
      : `<p class="revenue-flow-diagnostics-status ${statusClass}">状態：${esc(diagnostics.statusMessage)}</p>
        <p class="revenue-flow-diagnostics-next">次にやること：${esc(diagnostics.nextAction)}</p>`;
    const flowBlock = isCompact
      ? ''
      : `<p class="revenue-flow-diagnostics-flow">${esc(diagnostics.flowNote)}</p>`;
    el.innerHTML = `
      <div class="revenue-flow-diagnostics profit-operations-diagnostics${isCompact ? ' profit-operations-diagnostics-compact' : ''}">
        ${titleBlock}
        ${noteBlock}
        <ul class="revenue-flow-diagnostics-stats">
          <li><span>今月利益：</span><strong>${esc(ProfitBrain.formatYen(diagnostics.monthProfit))}</strong></li>
          <li><span>利益率：</span><strong>${esc(ProfitBrain.formatRate(diagnostics.monthProfitRate))}</strong></li>
          <li><span>今月売上：</span><strong>${esc(ProfitBrain.formatYen(diagnostics.monthRevenue))}</strong></li>
          <li><span>今月経費：</span><strong>${esc(ProfitBrain.formatYen(diagnostics.monthExpense))}</strong></li>
          <li><span>経費入力：</span><strong>今月${expenseCount}件</strong></li>
          ${isCompact ? '' : `<li><span>集計：</span><strong>${esc(diagnostics.aggregationLabel)}</strong></li>
          <li><span>整合チェック：</span><strong>${esc(diagnostics.reconciliationLabel)}</strong></li>`}
        </ul>
        ${defsBlock}
        ${nextBlock}
        ${actionBtn}
        ${flowBlock}
      </div>`;
    const btn = el.querySelector('.profit-operations-diagnostics-action');
    if (btn && action) {
      btn.addEventListener('click', () => handleProfitDiagnosticAction(action));
    }
  }

  function renderProfitExpenseList(ctx) {
    const el = document.getElementById('profit-expense-list');
    if (!el) return;
    const list = (ctx.expenses || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (!list.length) {
      el.innerHTML = '<p class="placeholder-text">支出はまだ登録されていません。</p>';
      return;
    }
    el.innerHTML = `<table class="profit-table"><thead><tr>
      <th>日付</th><th>カテゴリ</th><th>金額</th><th>支払先</th><th>紐付け</th><th></th>
    </tr></thead><tbody>${list.map(e => {
      const links = [
        e.relatedRevenueId ? '売上' : '',
        e.relatedWorkOrderId ? '作業' : '',
        e.relatedLeadId ? '営業先' : ''
      ].filter(Boolean).join('・') || '未紐付け';
      return `<tr>
        <td>${esc(e.date || '—')}</td>
        <td>${esc(e.category || '—')}</td>
        <td>${esc(ProfitBrain.formatYen(e.amount))}</td>
        <td>${esc(e.vendor || '—')}</td>
        <td>${esc(links)}</td>
        <td><button type="button" class="btn btn-sm btn-secondary" data-profit-edit-expense="${esc(e.id)}">編集</button></td>
      </tr>`;
    }).join('')}</tbody></table>`;
    el.querySelectorAll('[data-profit-edit-expense]').forEach(btn => {
      btn.addEventListener('click', () => fillProfitExpenseForm(btn.dataset.profitEditExpense));
    });
  }

  function renderProfitRevenueRows(ctx) {
    const el = document.getElementById('profit-revenue-rows');
    if (!el) return;
    const rows = ctx.revenueRows || [];
    if (!rows.length) {
      el.innerHTML = '<p class="placeholder-text">売上データがありません。</p>';
      return;
    }
    el.innerHTML = `<table class="profit-table"><thead><tr>
      <th>売上日</th><th>顧客名</th><th>サービス</th><th>売上</th><th>支出</th><th>粗利</th><th>粗利率</th><th>注意</th>
    </tr></thead><tbody>${rows.map(r => `<tr>
      <td>${esc(r.workDate || '—')}</td>
      <td>${esc(r.customerName || '—')}</td>
      <td>${esc(r.service || '—')}</td>
      <td>${esc(ProfitBrain.formatYen(r.revenueAmount))}</td>
      <td>${esc(ProfitBrain.formatYen(r.expenseTotal))}</td>
      <td>${esc(ProfitBrain.formatYen(r.grossProfit))}</td>
      <td>${esc(ProfitBrain.formatRate(r.grossRate))}</td>
      <td>${r.label ? `<span class="profit-label profit-label-${esc({ '粗利良好': 'good', '原価注意': 'caution', '赤字注意': 'deficit', '支出未紐付け': 'unlinked' }[r.label] || 'default')}">${esc(r.label)}</span>` : '—'}</td>
    </tr>`).join('')}</tbody></table>`;
  }

  function renderProfitWorkOrderRows(ctx) {
    const el = document.getElementById('profit-work-order-rows');
    if (!el) return;
    const rows = ctx.workOrderRows || [];
    if (!rows.length) {
      el.innerHTML = '<p class="placeholder-text">見込み利益のある作業予定はありません。</p>';
      return;
    }
    el.innerHTML = rows.map(r => `
      <div class="profit-work-order-card">
        <div class="profit-work-order-header">
          <strong>${esc(r.customerName || '—')}</strong>
          <span>${esc(r.scheduledDate || '—')}</span>
          ${r.distanceLabel ? `<span class="profit-distance-badge">${esc(r.distanceLabel)}</span>` : ''}
        </div>
        <p class="profit-meta">${esc(r.serviceText || '—')} / 見込み${esc(ProfitBrain.formatYen(r.estimate))} / 支出${esc(ProfitBrain.formatYen(r.expenseTotal))} / 利益${esc(ProfitBrain.formatYen(r.forecastProfit))}</p>
        <p class="profit-meta">エリア：${esc(r.area || '—')}</p>
        ${r.cautionText ? `<p class="profit-caution">${esc(r.cautionText)}</p>` : ''}
        ${r.mapUrl ? `<a href="${esc(r.mapUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-secondary">Googleマップで開く</a>` : ''}
      </div>`).join('');
  }

  function renderProfitServiceRows(ctx) {
    const el = document.getElementById('profit-service-rows');
    if (!el) return;
    const rows = ctx.serviceRows || [];
    if (!rows.length) {
      el.innerHTML = '<p class="placeholder-text">サービス別データがありません。</p>';
      return;
    }
    el.innerHTML = `<table class="profit-table"><thead><tr>
      <th>サービス</th><th>件数</th><th>売上合計</th><th>支出</th><th>粗利</th><th>粗利率</th><th>判断</th>
    </tr></thead><tbody>${rows.map(r => `<tr>
      <td>${esc(r.service)}</td>
      <td>${r.revenueCount || 0}</td>
      <td>${esc(ProfitBrain.formatYen(r.revenueTotal))}</td>
      <td>${esc(ProfitBrain.formatYen(r.expenseTotal))}</td>
      <td>${esc(ProfitBrain.formatYen(r.grossProfit))}</td>
      <td>${esc(ProfitBrain.formatRate(r.grossRate))}</td>
      <td><span class="profit-judgment profit-judgment-${esc(r.judgment)}">${esc(r.judgment)}</span></td>
    </tr>`).join('')}</tbody></table>`;
  }

  function renderProfitAreaRows(ctx) {
    const el = document.getElementById('profit-area-rows');
    if (!el) return;
    const rows = ctx.areaRows || [];
    if (!rows.length) {
      el.innerHTML = '<p class="placeholder-text">エリア別データがありません。</p>';
      return;
    }
    el.innerHTML = rows.map(r => `
      <div class="profit-area-card">
        <div class="profit-area-header">
          <strong>${esc(r.area)}</strong>
          <span class="profit-judgment profit-judgment-${esc(r.judgment)}">${esc(r.judgment)}</span>
          ${r.farCaution ? '<span class="profit-distance-badge">遠方注意</span>' : ''}
        </div>
        <p class="profit-meta">売上${esc(ProfitBrain.formatYen(r.revenueTotal))} / 支出${esc(ProfitBrain.formatYen(r.expenseTotal))} / 粗利${esc(ProfitBrain.formatYen(r.grossProfit))}</p>
        <p class="profit-meta">作業予定見込み：${esc(ProfitBrain.formatYen(r.workOrderEstimate))}</p>
        <p class="profit-comment">${esc(r.comment || '')}</p>
      </div>`).join('');
  }

  function renderProfitSourceRows(ctx) {
    const el = document.getElementById('profit-source-rows');
    if (!el) return;
    const rows = ctx.sourceRows || [];
    if (!rows.length) {
      el.innerHTML = '<p class="placeholder-text">集客経路別データがありません。</p>';
      return;
    }
    el.innerHTML = rows.map(r => `
      <div class="profit-source-card">
        <div class="profit-source-header">
          <strong>${esc(r.source)}</strong>
          <span class="profit-judgment profit-judgment-${esc(r.judgment)}">${esc(r.judgment)}</span>
        </div>
        <p class="profit-meta">売上${esc(ProfitBrain.formatYen(r.revenueTotal))} / 支出${esc(ProfitBrain.formatYen(r.expenseTotal))} / 手数料・広告${esc(ProfitBrain.formatYen(r.adFeeTotal))} / 粗利${esc(ProfitBrain.formatYen(r.grossProfit))}</p>
        <p class="profit-comment">${esc(r.comment || '')}</p>
      </div>`).join('');
  }

  function renderProfitHints(ctx) {
    const el = document.getElementById('profit-hints');
    if (!el) return;
    const hints = ctx.hints || [];
    if (!hints.length) {
      el.innerHTML = '<p class="placeholder-text">利益改善ヒントはありません。データが増えると提案が出ます。</p>';
      return;
    }
    el.innerHTML = hints.map((h, i) => `
      <div class="profit-hint-card">
        <p><strong>${esc(h.title)}</strong></p>
        ${h.detail ? `<p class="profit-meta">${esc(h.detail)}</p>` : ''}
        <button type="button" class="btn btn-sm btn-secondary" data-profit-add-task="${i}">毎日やることに追加</button>
      </div>`).join('');
    el.querySelectorAll('[data-profit-add-task]').forEach(btn => {
      btn.addEventListener('click', () => addProfitHintTask(Number(btn.dataset.profitAddTask)));
    });
  }

  function addProfitHintTask(index) {
    const ctx = getProfitContext();
    const hint = (ctx.hints || [])[index];
    if (!hint) return;
    const payload = ProfitBrain.createProfitTaskPayload(hint, TODAY());
    const exists = Storage.getDailyActionTasksData().manualTasks.some(
      t => t.pickupDedupeKey === payload.pickupDedupeKey
    );
    if (exists) {
      alert('同じタスクは既に毎日やることにあります。');
      return;
    }
    Storage.addManualDailyTask({
      id: 'manual_' + Storage.generateId(),
      ...payload
    });
    renderDashboard();
    alert('毎日やることに追加しました。');
  }

  function populateProfitExpenseSelects() {
    const catEl = document.getElementById('profit-expense-category');
    if (catEl && !catEl.options.length) {
      catEl.innerHTML = ProfitBrain.CATEGORIES.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    }
    const payEl = document.getElementById('profit-expense-payment');
    if (payEl && payEl.options.length <= 1) {
      payEl.innerHTML = '<option value="">未選択</option>' + ProfitBrain.PAYMENT_METHODS.map(p =>
        `<option value="${esc(p)}">${esc(p)}</option>`
      ).join('');
    }
    const revEl = document.getElementById('profit-expense-revenue');
    if (revEl) {
      const cur = revEl.value;
      const records = Storage.getRevenueRecords().slice().sort((a, b) => (b.workDate || '').localeCompare(a.workDate || ''));
      revEl.innerHTML = '<option value="">未選択</option>' + records.map(r =>
        `<option value="${esc(r.id)}">${esc((r.workDate || '') + ' ' + (r.customerName || '') + ' ' + ProfitBrain.formatYen(r.amount))}</option>`
      ).join('');
      revEl.value = cur;
    }
    const woEl = document.getElementById('profit-expense-work-order');
    if (woEl) {
      const cur = woEl.value;
      const orders = Storage.getWorkOrders().slice().sort((a, b) => (b.scheduledDate || '').localeCompare(a.scheduledDate || ''));
      woEl.innerHTML = '<option value="">未選択</option>' + orders.map(w =>
        `<option value="${esc(w.id)}">${esc((w.scheduledDate || '') + ' ' + (w.customerName || '') + ' ' + (w.serviceText || ''))}</option>`
      ).join('');
      woEl.value = cur;
    }
    const leadEl = document.getElementById('profit-expense-lead');
    if (leadEl) {
      const cur = leadEl.value;
      const leads = Storage.getLeads().slice().sort((a, b) => (a.company || '').localeCompare(b.company || ''));
      leadEl.innerHTML = '<option value="">未選択</option>' + leads.map(l =>
        `<option value="${esc(l.id)}">${esc(l.company || '—')}</option>`
      ).join('');
      leadEl.value = cur;
    }
  }

  function clearProfitExpenseForm() {
    const today = TODAY();
    const dateEl = document.getElementById('profit-expense-date');
    if (dateEl) dateEl.value = today;
    const editId = document.getElementById('profit-expense-edit-id');
    if (editId) editId.value = '';
    const amountEl = document.getElementById('profit-expense-amount');
    if (amountEl) amountEl.value = '';
    const vendorEl = document.getElementById('profit-expense-vendor');
    if (vendorEl) vendorEl.value = '';
    const memoEl = document.getElementById('profit-expense-memo');
    if (memoEl) memoEl.value = '';
    const recurringEl = document.getElementById('profit-expense-recurring');
    if (recurringEl) recurringEl.checked = false;
    ['profit-expense-revenue', 'profit-expense-work-order', 'profit-expense-lead', 'profit-expense-payment'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const catEl = document.getElementById('profit-expense-category');
    if (catEl && catEl.options.length) catEl.selectedIndex = 0;
  }

  function fillProfitExpenseForm(id) {
    const record = Storage.getExpenseRecords().find(e => e.id === id);
    if (!record) return;
    populateProfitExpenseSelects();
    const editId = document.getElementById('profit-expense-edit-id');
    if (editId) editId.value = record.id;
    const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ''; };
    set('profit-expense-date', record.date);
    set('profit-expense-category', record.category);
    set('profit-expense-amount', record.amount);
    set('profit-expense-vendor', record.vendor);
    set('profit-expense-payment', record.paymentMethod);
    set('profit-expense-revenue', record.relatedRevenueId);
    set('profit-expense-work-order', record.relatedWorkOrderId);
    set('profit-expense-lead', record.relatedLeadId);
    set('profit-expense-memo', record.memo);
    const recurringEl = document.getElementById('profit-expense-recurring');
    if (recurringEl) recurringEl.checked = !!record.isRecurring;
    scrollToElement('#profit-expense-form');
  }

  function saveProfitExpenseFromForm(e) {
    if (e) e.preventDefault();
    const editId = document.getElementById('profit-expense-edit-id')?.value || '';
    const payload = {
      date: document.getElementById('profit-expense-date')?.value || TODAY(),
      category: document.getElementById('profit-expense-category')?.value || 'その他',
      amount: Number(document.getElementById('profit-expense-amount')?.value || 0),
      vendor: document.getElementById('profit-expense-vendor')?.value.trim() || '',
      paymentMethod: document.getElementById('profit-expense-payment')?.value || '',
      relatedRevenueId: document.getElementById('profit-expense-revenue')?.value || '',
      relatedWorkOrderId: document.getElementById('profit-expense-work-order')?.value || '',
      relatedLeadId: document.getElementById('profit-expense-lead')?.value || '',
      memo: document.getElementById('profit-expense-memo')?.value.trim() || '',
      isRecurring: !!document.getElementById('profit-expense-recurring')?.checked,
      source: 'manual'
    };
    if (!payload.amount || payload.amount <= 0) {
      alert('金額を入力してください。');
      return;
    }
    if (editId) Storage.updateExpenseRecord(editId, payload);
    else Storage.addExpenseRecord(payload);
    clearProfitExpenseForm();
    renderProfitView();
    renderDashboard();
    navigateAfterAction('expense-save', '経費を入力しました。利益管理に反映しました。');
  }

  function renderProfitView() {
    try {
      populateProfitExpenseSelects();
      const dateEl = document.getElementById('profit-expense-date');
      if (dateEl && !dateEl.value) dateEl.value = TODAY();
      const ctx = getProfitContext();
      renderMonthlyClosingCheck('profit-monthly-closing-check');
      renderProfitOperationsDiagnostics(ctx, { suppressRevenueLink: true });
      renderProfitExpenseBreakdown(ctx);
      renderProfitSummary(ctx);
      renderProfitExpenseList(ctx);
      renderProfitRevenueRows(ctx);
      renderProfitWorkOrderRows(ctx);
      renderProfitServiceRows(ctx);
      renderProfitAreaRows(ctx);
      renderProfitSourceRows(ctx);
      renderProfitHints(ctx);
    } catch (err) {
      console.error('[Budil] renderProfitView', err);
    }
  }

  function initProfit() {
    const form = document.getElementById('profit-expense-form');
    if (form && !form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', saveProfitExpenseFromForm);
    }
    const clearBtn = document.getElementById('profit-expense-clear');
    if (clearBtn && !clearBtn.dataset.bound) {
      clearBtn.dataset.bound = '1';
      clearBtn.addEventListener('click', clearProfitExpenseForm);
    }
  }

  // ── 月次実績 ──
  let monthlyResultsCsvPreview = [];

  function readMonthlyResultsFormPayload() {
    const month = document.getElementById('monthly-results-month')?.value || '';
    return {
      month,
      sales: Number(document.getElementById('monthly-results-sales')?.value || 0),
      brokerFee: Number(document.getElementById('monthly-results-broker-fee')?.value || 0),
      materialCost: Number(document.getElementById('monthly-results-material-cost')?.value || 0),
      laborCost: Number(document.getElementById('monthly-results-labor-cost')?.value || 0),
      outsourcingCost: Number(document.getElementById('monthly-results-outsourcing-cost')?.value || 0),
      otherCost: Number(document.getElementById('monthly-results-other-cost')?.value || 0),
      profit: Number(document.getElementById('monthly-results-profit')?.value || 0),
      memo: document.getElementById('monthly-results-memo')?.value.trim() || ''
    };
  }

  function clearMonthlyResultsForm() {
    const editId = document.getElementById('monthly-results-edit-id');
    if (editId) editId.value = '';
    const title = document.getElementById('monthly-results-form-title');
    if (title) title.textContent = '月次実績入力';
    ['monthly-results-sales', 'monthly-results-broker-fee', 'monthly-results-material-cost',
      'monthly-results-labor-cost', 'monthly-results-memo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const outsourcing = document.getElementById('monthly-results-outsourcing-cost');
    if (outsourcing) outsourcing.value = '0';
    const other = document.getElementById('monthly-results-other-cost');
    if (other) other.value = '0';
    const profit = document.getElementById('monthly-results-profit');
    if (profit) profit.value = '';
    const monthEl = document.getElementById('monthly-results-month');
    if (monthEl) {
      monthEl.value = '';
      monthEl.removeAttribute('readonly');
    }
  }

  function fillMonthlyResultsForm(id) {
    const record = Storage.getMonthlyResults().find(r => r.id === id);
    if (!record) return;
    const set = (elId, val) => {
      const el = document.getElementById(elId);
      if (el) el.value = val != null ? val : '';
    };
    document.getElementById('monthly-results-edit-id').value = record.id;
    const title = document.getElementById('monthly-results-form-title');
    if (title) title.textContent = '月次実績編集（' + record.month + '）';
    set('monthly-results-month', record.month);
    const monthEl = document.getElementById('monthly-results-month');
    if (monthEl) monthEl.setAttribute('readonly', 'readonly');
    set('monthly-results-sales', record.sales);
    set('monthly-results-broker-fee', record.brokerFee);
    set('monthly-results-material-cost', record.materialCost);
    set('monthly-results-labor-cost', record.laborCost);
    set('monthly-results-outsourcing-cost', record.outsourcingCost != null ? record.outsourcingCost : 0);
    set('monthly-results-other-cost', record.otherCost);
    set('monthly-results-profit', record.profit);
    set('monthly-results-memo', record.memo);
    scrollToElement('#monthly-results-form-card');
  }

  function applyMonthlyResultsProfitCalc() {
    const payload = readMonthlyResultsFormPayload();
    const profit = MonthlyResultsBrain.computeProfit(
      payload.sales, payload.brokerFee, payload.materialCost,
      payload.laborCost, payload.outsourcingCost, payload.otherCost
    );
    const el = document.getElementById('monthly-results-profit');
    if (el) el.value = String(profit);
    showAppToast('利益を自動計算しました');
  }

  function saveMonthlyResultsFromForm(e) {
    if (e) e.preventDefault();
    const editId = document.getElementById('monthly-results-edit-id')?.value || '';
    const payload = readMonthlyResultsFormPayload();
    if (!payload.month) {
      alert('対象月を選択してください。');
      return;
    }
    if (!editId) {
      const existing = Storage.getMonthlyResultByMonth(payload.month);
      if (existing && !confirm(payload.month + ' の実績は既に登録されています。上書き保存しますか？')) {
        return;
      }
    }
    const result = Storage.upsertMonthlyResult({
      ...payload,
      id: editId || payload.month
    });
    if (!result.ok) {
      alert('保存に失敗しました。');
      return;
    }
    clearMonthlyResultsForm();
    renderMonthlyResultsView();
    renderProfitView();
    renderDashboard();
    const msg = editId || !result.created
      ? '月次実績を更新しました。月次締めチェックを確認してください。'
      : '月次実績を保存しました。月次締めチェックを確認してください。';
    navigateAfterAction('monthly-results-save', msg);
  }

  function renderMonthlyResultsSummary(records) {
    const el = document.getElementById('monthly-results-summary');
    if (!el) return;
    const sorted = MonthlyResultsBrain.sortByMonthDesc(records);
    if (!sorted.length) {
      el.innerHTML = '<p class="empty-hint">まだ月次実績がありません。上のフォームまたはCSVから登録してください。</p>';
      return;
    }
    const totals = MonthlyResultsBrain.getTotals(sorted);
    const latest = sorted[0];
    el.innerHTML = `
      <div class="monthly-results-summary-item">
        <span>登録月数</span><strong>${sorted.length}ヶ月</strong>
      </div>
      <div class="monthly-results-summary-item">
        <span>最新月</span><strong>${esc(latest.month)}</strong>
      </div>
      <div class="monthly-results-summary-item">
        <span>累計売上</span><strong>${esc(MonthlyResultsBrain.formatYen(totals.sales))}</strong>
      </div>
      <div class="monthly-results-summary-item">
        <span>累計利益</span><strong>${esc(MonthlyResultsBrain.formatYen(totals.profit))}</strong>
      </div>
      <div class="monthly-results-summary-item">
        <span>累計利益率</span><strong>${esc(MonthlyResultsBrain.formatRate(totals.profit, totals.sales))}</strong>
      </div>
    `;
  }

  function renderMonthlyResultsList(records) {
    const el = document.getElementById('monthly-results-list');
    if (!el) return;
    const sorted = MonthlyResultsBrain.sortByMonthDesc(records);
    if (!sorted.length) {
      el.innerHTML = '<p class="empty-hint">登録済みの月次実績はありません。</p>';
      return;
    }
    const rows = sorted.map(r => {
      const n = MonthlyResultsBrain.normalizeRecord(r);
      return `
      <tr data-monthly-id="${esc(n.id)}">
        <td>${esc(n.month)}</td>
        <td class="num">${esc(MonthlyResultsBrain.formatYen(n.sales))}</td>
        <td class="num">${esc(MonthlyResultsBrain.formatYen(n.brokerFee))}</td>
        <td class="num">${esc(MonthlyResultsBrain.formatYen(n.materialCost))}</td>
        <td class="num">${esc(MonthlyResultsBrain.formatYen(n.laborCost))}</td>
        <td class="num">${esc(MonthlyResultsBrain.formatYen(n.outsourcingCost))}</td>
        <td class="num">${esc(MonthlyResultsBrain.formatYen(n.otherCost))}</td>
        <td class="num">${esc(MonthlyResultsBrain.formatYen(n.profit))}</td>
        <td class="num">${esc(MonthlyResultsBrain.formatRate(n.profit, n.sales))}</td>
        <td>${esc(n.memo || '—')}</td>
        <td class="actions">
          <button type="button" class="btn btn-sm btn-secondary" data-monthly-edit="${esc(n.id)}">編集</button>
          <button type="button" class="btn btn-sm btn-danger" data-monthly-delete="${esc(n.id)}">削除</button>
        </td>
      </tr>
    `;
    }).join('');
    el.innerHTML = `
      <div class="table-wrap monthly-results-table-wrap">
        <table class="data-table monthly-results-table">
          <thead>
            <tr>
              <th>月</th><th>売上</th><th>手数料</th><th>材料費</th><th>人件費</th><th>外注費</th><th>その他</th><th>利益</th><th>利益率</th><th>メモ</th><th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
    el.querySelectorAll('[data-monthly-edit]').forEach(btn => {
      btn.addEventListener('click', () => fillMonthlyResultsForm(btn.dataset.monthlyEdit));
    });
    el.querySelectorAll('[data-monthly-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.monthlyDelete;
        const rec = Storage.getMonthlyResults().find(r => r.id === id);
        if (!rec) return;
        if (!confirm(rec.month + ' の月次実績を削除しますか？')) return;
        Storage.deleteMonthlyResult(id);
        renderMonthlyResultsView();
        renderProfitView();
        renderDashboard();
        showAppToast('月次実績を削除しました');
      });
    });
  }

  function renderMonthlyResultsCsvPreview() {
    const previewEl = document.getElementById('monthly-results-csv-preview');
    const saveBtn = document.getElementById('monthly-results-csv-save');
    const errEl = document.getElementById('monthly-results-csv-errors');
    if (!previewEl) return;
    if (!monthlyResultsCsvPreview.length) {
      previewEl.classList.add('hidden');
      previewEl.innerHTML = '';
      if (saveBtn) saveBtn.disabled = true;
      return;
    }
    const existing = Storage.getMonthlyResults();
    const rows = monthlyResultsCsvPreview.map(r => {
      const dup = existing.some(e => e.month === r.month);
      return `<tr><td>${esc(r.month)}</td><td>${esc(MonthlyResultsBrain.formatYen(r.sales))}</td><td>${esc(MonthlyResultsBrain.formatYen(r.profit))}</td><td>${dup ? '上書き' : '新規'}</td><td>${esc(r.memo || '—')}</td></tr>`;
    }).join('');
    previewEl.classList.remove('hidden');
    previewEl.innerHTML = `
      <h3>取り込みプレビュー（${monthlyResultsCsvPreview.length}件）</h3>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>月</th><th>売上</th><th>利益</th><th>操作</th><th>メモ</th></tr></thead><tbody>${rows}</tbody></table></div>
    `;
    if (saveBtn) saveBtn.disabled = false;
    if (errEl) errEl.classList.add('hidden');
  }

  function parseMonthlyResultsCsv() {
    const text = document.getElementById('monthly-results-csv-paste')?.value || '';
    const parsed = MonthlyResultsBrain.parseCsv(text);
    const errEl = document.getElementById('monthly-results-csv-errors');
    if (parsed.errors.length) {
      monthlyResultsCsvPreview = [];
      renderMonthlyResultsCsvPreview();
      if (errEl) {
        errEl.classList.remove('hidden');
        errEl.innerHTML = '<ul class="error-list">' + parsed.errors.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>';
      }
      return;
    }
    if (!parsed.records.length) {
      alert('取り込めるデータがありません。');
      return;
    }
    monthlyResultsCsvPreview = parsed.records;
    renderMonthlyResultsCsvPreview();
    if (parsed.warnings.length && errEl) {
      errEl.classList.remove('hidden');
      errEl.innerHTML = '<ul class="caution-list">' + parsed.warnings.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul>';
    }
    showAppToast(parsed.records.length + '件を解析しました');
  }

  function saveMonthlyResultsCsv() {
    if (!monthlyResultsCsvPreview.length) return;
    const overwriteMonths = monthlyResultsCsvPreview
      .filter(r => Storage.getMonthlyResultByMonth(r.month))
      .map(r => r.month);
    if (overwriteMonths.length && !confirm(overwriteMonths.join(', ') + ' は既存データを上書きします。続行しますか？')) {
      return;
    }
    monthlyResultsCsvPreview.forEach(r => Storage.upsertMonthlyResult(r));
    monthlyResultsCsvPreview = [];
    const paste = document.getElementById('monthly-results-csv-paste');
    if (paste) paste.value = '';
    renderMonthlyResultsCsvPreview();
    renderMonthlyResultsView();
    renderProfitView();
    renderDashboard();
    showAppToast('CSV一括取り込みを保存しました');
  }

  function renderMonthlyResultsView() {
    try {
      const records = Storage.getMonthlyResults();
      renderMonthlyResultsSummary(records);
      renderMonthlyResultsList(records);
      const reconciliationEl = document.getElementById('monthly-results-reconciliation');
      if (reconciliationEl && typeof MonthlyResultsBrain !== 'undefined') {
        const report = MonthlyResultsBrain.buildReconciliationReport(records, Storage.getRevenueRecords());
        reconciliationEl.innerHTML = renderMonthlyReconciliationHtml(report, {
          note: '月次実績と売上明細の差額を確認します。自動同期はしません（読み取り専用）。'
        });
      }
    } catch (err) {
      console.error('[Budil] renderMonthlyResultsView', err);
    }
  }

  function renderDashMonthlyResults() {
    const el = document.getElementById('dash-monthly-results');
    if (!el) return;
    const records = Storage.getMonthlyResults();
    const latest = MonthlyResultsBrain.getLatest(records);
    if (!latest) {
      el.innerHTML = `
        <p class="empty-hint">過去月の実績がまだありません。</p>
        <button type="button" class="btn btn-sm btn-primary" id="btn-go-monthly-results">月次実績を入力</button>
      `;
    } else {
      el.innerHTML = `
        <div class="monthly-results-dash-grid">
          <div><span>最新月</span><strong>${esc(latest.month)}</strong></div>
          <div><span>売上</span><strong>${esc(MonthlyResultsBrain.formatYen(latest.sales))}</strong></div>
          <div><span>利益</span><strong>${esc(MonthlyResultsBrain.formatYen(latest.profit))}</strong></div>
          <div><span>利益率</span><strong>${esc(MonthlyResultsBrain.formatRate(latest.profit, latest.sales))}</strong></div>
        </div>
        <button type="button" class="btn btn-sm btn-secondary" id="btn-go-monthly-results">月次実績を開く</button>
      `;
    }
    const btn = el.querySelector('#btn-go-monthly-results');
    if (btn) btn.addEventListener('click', () => navigateToView('monthly-results'));
  }

  function initMonthlyResults() {
    const form = document.getElementById('monthly-results-form');
    if (form && !form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', saveMonthlyResultsFromForm);
    }
    const clearBtn = document.getElementById('monthly-results-clear');
    if (clearBtn && !clearBtn.dataset.bound) {
      clearBtn.dataset.bound = '1';
      clearBtn.addEventListener('click', clearMonthlyResultsForm);
    }
    const calcBtn = document.getElementById('monthly-results-calc-profit');
    if (calcBtn && !calcBtn.dataset.bound) {
      calcBtn.dataset.bound = '1';
      calcBtn.addEventListener('click', applyMonthlyResultsProfitCalc);
    }
    const parseBtn = document.getElementById('monthly-results-csv-parse');
    if (parseBtn && !parseBtn.dataset.bound) {
      parseBtn.dataset.bound = '1';
      parseBtn.addEventListener('click', parseMonthlyResultsCsv);
    }
    const csvSaveBtn = document.getElementById('monthly-results-csv-save');
    if (csvSaveBtn && !csvSaveBtn.dataset.bound) {
      csvSaveBtn.dataset.bound = '1';
      csvSaveBtn.addEventListener('click', saveMonthlyResultsCsv);
    }
    const csvClearBtn = document.getElementById('monthly-results-csv-clear');
    if (csvClearBtn && !csvClearBtn.dataset.bound) {
      csvClearBtn.dataset.bound = '1';
      csvClearBtn.addEventListener('click', () => {
        const paste = document.getElementById('monthly-results-csv-paste');
        if (paste) paste.value = '';
        monthlyResultsCsvPreview = [];
        renderMonthlyResultsCsvPreview();
        const errEl = document.getElementById('monthly-results-csv-errors');
        if (errEl) { errEl.classList.add('hidden'); errEl.innerHTML = ''; }
      });
    }
  }

  // ── アナリティクス番頭 ──
  let selectedAnalyticsId = null;
  let lastBrowserBantouPreview = null;
  let lastCalendarCandidatePreview = null;
  let lastCalendarCandidateImportResult = null;

  function getCalendarFutureImportSummary(preview) {
    if (!preview || typeof CalendarCandidateBrain === 'undefined') {
      return { readCount: 0, savedCount: 0, duplicateCount: 0, excludedCount: 0, savableCount: 0, revenueRegistered: false };
    }
    return preview.futureImportSummary
      ? { ...preview.futureImportSummary }
      : CalendarCandidateBrain.summarizeFutureImportPreview(preview);
  }

  function renderCalendarCandidateImportSummaryHtml(summary, options) {
    const opts = options || {};
    const phase = opts.phase || 'result';
    const zeroGuidance = `
          <ul class="calendar-import-result-checks">
            <li>今日以降の予定が含まれていますか？</li>
            <li>日付が読み取れる形式ですか？</li>
            <li>金額が入っていますか？</li>
            <li>キャンセル・見積・日程調整中だけになっていませんか？</li>
          </ul>`;
    if (!summary || summary.readCount === 0) {
      return `
        <div class="calendar-import-result calendar-import-result-zero">
          <h3>予定取り込み結果</h3>
          <p class="calendar-import-result-lead">取り込み対象が見つかりませんでした。</p>
          <p class="calendar-import-result-checks-title">確認してください：</p>
          ${zeroGuidance}
        </div>`;
    }
    const saveLabel = phase === 'result'
      ? `<li><span class="calendar-import-stat-label">作業予定に保存：</span><strong>${summary.savedCount}件</strong></li>`
      : `<li><span class="calendar-import-stat-label">保存予定：</span><strong>${summary.savableCount}件</strong></li>`;
    const revenueNote = phase === 'result'
      ? '<p class="calendar-import-result-revenue-note"><span class="calendar-import-stat-label">売上明細への登録：</span><strong>なし</strong></p>'
      : '';
    const nextBlock = phase === 'result'
      ? `<p class="calendar-import-result-next">次の確認先：<strong>売上予定（未確定）</strong></p>
         <div class="calendar-import-result-actions">
           <button type="button" class="btn btn-sm btn-primary calendar-import-go-revenue">売上予定を見る</button>
           <button type="button" class="btn btn-sm btn-secondary calendar-import-go-daily">毎日やることを見る</button>
         </div>`
      : `<p class="calendar-import-result-hint">※予定取り込みだけでは売上明細には登録されません。作業後に「売上確定待ち」から確定してください。</p>`;
    const zeroSavableHint = summary.savableCount === 0
      ? `<p class="calendar-import-result-warn">${phase === 'result' ? '作業予定に保存できる候補がありませんでした。' : '保存できる候補がありません。'}重複・対象外・金額なし・過去日付を確認してください。</p>
         <p class="calendar-import-result-checks-title">確認してください：</p>
         ${zeroGuidance}`
      : '';
    return `
      <div class="calendar-import-result">
        <h3>予定取り込み結果</h3>
        <ul class="calendar-import-result-stats">
          <li><span class="calendar-import-stat-label">読み取り：</span><strong>${summary.readCount}件</strong></li>
          ${saveLabel}
          <li><span class="calendar-import-stat-label">重複：</span><strong>${summary.duplicateCount}件</strong></li>
          <li><span class="calendar-import-stat-label">対象外：</span><strong>${summary.excludedCount}件</strong></li>
        </ul>
        ${revenueNote}
        <p class="calendar-import-result-separation">予定取り込みは作業予定への保存です。確定売上にはまだ反映されません。</p>
        ${zeroSavableHint}
        ${nextBlock}
      </div>`;
  }

  function bindCalendarImportResultActions(root) {
    if (!root) return;
    const revenueBtn = root.querySelector('.calendar-import-go-revenue');
    if (revenueBtn && !revenueBtn.dataset.bound) {
      revenueBtn.dataset.bound = '1';
      revenueBtn.addEventListener('click', () => {
        navigateToView('revenue', '#revenue-upcoming-schedule');
      });
    }
    const dailyBtn = root.querySelector('.calendar-import-go-daily');
    if (dailyBtn && !dailyBtn.dataset.bound) {
      dailyBtn.dataset.bound = '1';
      dailyBtn.addEventListener('click', () => {
        navigateToView('dashboard', '.card-daily-action-tasks');
      });
    }
  }

  function renderCalendarCandidateImportResult(summary, options) {
    const el = document.getElementById('calendar-candidate-import-result');
    if (!el) return;
    if (!summary) {
      el.innerHTML = '';
      el.classList.add('hidden');
      return;
    }
    el.innerHTML = renderCalendarCandidateImportSummaryHtml(summary, options);
    el.classList.remove('hidden');
    bindCalendarImportResultActions(el);
  }

  function getAnalyticsContext(opts) {
    const today = TODAY();
    const allRecords = Storage.getAnalyticsRecords();
    let records = allRecords;
    const range = opts && opts.period;
    if (range && range.startDate && range.endDate) {
      records = allRecords.filter(r =>
        r && r.date && r.date >= range.startDate && r.date <= range.endDate
      );
    }
    const activeAll = AnalyticsBrain.filterActive(range ? records : allRecords);
    const ctx = AnalyticsBrain.buildContext(activeAll, today);
    ctx.browserBantou = AnalyticsBrain.getBrowserBantouMeta(
      range ? records : allRecords, today
    );
    if (!range) {
      const displayRecords = AnalyticsBrain.selectRecordsForDisplay(allRecords, today);
      const displayCtx = AnalyticsBrain.buildContext(displayRecords, today);
      ctx.todayConclusion = displayCtx.todayConclusion;
      ctx.strongCount = displayCtx.strongCount;
      ctx.bounceCount = displayCtx.bounceCount;
      ctx.priority = displayCtx.priority;
      ctx.adReadiness = displayCtx.adReadiness;
      ctx.topDemand = displayCtx.topDemand;
      ctx.highBounce = displayCtx.highBounce;
    }
    return ctx;
  }

  function findAnalyticsRecord(id) {
    if (!id) return null;
    const raw = Storage.getAnalyticsRecords().find(r => r && r.id === id);
    if (!raw) return null;
    return AnalyticsBrain.enrichRecord(raw);
  }

  function populateAnalyticsFormSelects() {
    const typeEl = document.getElementById('analytics-page-type');
    if (typeEl && typeEl.options.length <= 1) {
      typeEl.innerHTML = AnalyticsBrain.PAGE_TYPES.map(t =>
        `<option value="${esc(t)}">${esc(t)}</option>`
      ).join('');
    }
    const svcEl = document.getElementById('analytics-service-tag');
    if (svcEl && svcEl.options.length <= 1) {
      svcEl.innerHTML = AnalyticsBrain.SERVICE_TAGS.map(s =>
        `<option value="${esc(s)}">${esc(s)}</option>`
      ).join('');
    }
  }

  function clearAnalyticsForm() {
    const today = TODAY();
    const dateEl = document.getElementById('analytics-date');
    if (dateEl) dateEl.value = today;
    const editId = document.getElementById('analytics-edit-id');
    if (editId) editId.value = '';
    selectedAnalyticsId = null;
    ['analytics-page-name', 'analytics-url', 'analytics-source-memo', 'analytics-memo', 'analytics-search-queries'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    ['analytics-views', 'analytics-active-users', 'analytics-engagement', 'analytics-events',
      'analytics-bounce', 'analytics-cta', 'analytics-line', 'analytics-booking', 'analytics-phone'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '0';
    });
    const panel = document.getElementById('analytics-detail-panel');
    if (panel) panel.classList.add('hidden');
  }

  function fillAnalyticsForm(id) {
    const record = findAnalyticsRecord(id);
    if (!record) return;
    selectedAnalyticsId = id;
    populateAnalyticsFormSelects();
    const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val != null ? val : ''; };
    document.getElementById('analytics-edit-id').value = record.id;
    set('analytics-date', record.date);
    set('analytics-page-name', record.pageName);
    set('analytics-url', record.url);
    set('analytics-page-type', record.pageType);
    set('analytics-service-tag', record.serviceTag);
    set('analytics-views', record.views);
    set('analytics-active-users', record.activeUsers);
    set('analytics-engagement', record.avgEngagementSeconds);
    set('analytics-events', record.eventCount);
    set('analytics-bounce', record.bounceRate);
    set('analytics-cta', record.ctaClicks);
    set('analytics-line', record.lineClicks);
    set('analytics-booking', record.bookingClicks);
    set('analytics-phone', record.phoneClicks);
    set('analytics-search-queries', record.searchQueriesText);
    set('analytics-source-memo', record.sourceMemo);
    set('analytics-memo', record.memo);
    renderAnalyticsDetail(record);
    scrollToElement('#analytics-record-form');
  }

  function readAnalyticsFormPayload() {
    const val = id => {
      const el = document.getElementById(id);
      return el ? el.value : '';
    };
    return {
      date: val('analytics-date') || TODAY(),
      pageName: val('analytics-page-name').trim(),
      url: val('analytics-url').trim(),
      pageType: val('analytics-page-type'),
      serviceTag: val('analytics-service-tag'),
      views: Number(val('analytics-views')) || 0,
      activeUsers: Number(val('analytics-active-users')) || 0,
      avgEngagementSeconds: Number(val('analytics-engagement')) || 0,
      eventCount: Number(val('analytics-events')) || 0,
      bounceRate: Number(val('analytics-bounce')) || 0,
      ctaClicks: Number(val('analytics-cta')) || 0,
      lineClicks: Number(val('analytics-line')) || 0,
      bookingClicks: Number(val('analytics-booking')) || 0,
      phoneClicks: Number(val('analytics-phone')) || 0,
      searchQueriesText: val('analytics-search-queries').trim(),
      sourceMemo: val('analytics-source-memo').trim(),
      memo: val('analytics-memo').trim(),
      status: 'open'
    };
  }

  function saveAnalyticsFromForm(e) {
    if (e) e.preventDefault();
    const payload = readAnalyticsFormPayload();
    if (!payload.pageName) {
      alert('ページ名を入力してください。');
      return;
    }
    const editId = document.getElementById('analytics-edit-id')?.value || '';
    if (editId) Storage.updateAnalyticsRecord(editId, payload);
    else Storage.addAnalyticsRecord(payload);
    clearAnalyticsForm();
    renderAnalyticsView();
    renderDashboard();
    alert('アナリティクスデータを保存しました。');
  }

  function kpiMetricValue(value, suffix = '') {
    if (value === null || value === undefined || value === '') return '未確認';
    const n = Number(value);
    if (!Number.isFinite(n)) return esc(String(value));
    const text = Number.isInteger(n) ? n.toLocaleString('ja-JP') : n.toLocaleString('ja-JP', { maximumFractionDigits: 1 });
    return esc(text + suffix);
  }

  function snapshotHasKpiData(snapshot) {
    if (!snapshot) return false;
    if (snapshot.hasData) return true;
    const metrics = snapshot.metrics || {};
    return Object.values(metrics).some(v => v !== null && v !== undefined && v !== '')
      || (snapshot.pages || []).length > 0;
  }

  function renderKpiMetricRows(snapshot) {
    const m = (snapshot && snapshot.metrics) || {};
    const rows = [
      ['アクセス数', m.accessCount],
      ['ユーザー数', m.users],
      ['新規ユーザー', m.newUsers],
      ['セッション数', m.sessions],
      ['検索流入', m.searchTraffic],
      ['LINEクリック', m.lineClicks],
      ['電話タップ', m.phoneTaps],
      ['フォームクリック', m.formClicks],
      ['問い合わせ導線クリック', m.inquiryClicks],
      ['SC表示回数', m.searchImpressions],
      ['SCクリック数', m.searchClicks],
      ['検索CTR', m.searchCtr, '%'],
      ['GBP表示', m.gbpViews],
      ['GBPクリック', m.gbpClicks],
      ['GBP電話', m.gbpPhone]
    ];
    return rows.map(([label, value, suffix]) => `
      <div class="analytics-kpi-row">
        <span>${esc(label)}</span>
        <strong>${kpiMetricValue(value, suffix || '')}</strong>
      </div>
    `).join('');
  }

  function renderKpiTopPages(snapshot) {
    const pages = (snapshot && snapshot.pages) || [];
    if (!pages.length) return '<p class="placeholder-text">LP別アクセスは未確認です。</p>';
    return `<ol class="analytics-kpi-page-list">${pages.slice(0, 3).map(p => `
      <li>
        <span>${esc(p.pageName || p.url || 'LP')}</span>
        <strong>${kpiMetricValue(p.views)}</strong>
      </li>
    `).join('')}</ol>`;
  }

  function buildRevenueGoalKpiHtml() {
    if (typeof RevenueBrain === 'undefined') return '';
    const rev = getRevenueContext();
    const s = rev.summary || {};
    if (!s.monthlyTarget) {
      return '<p class="analytics-kpi-goal-note">売上目標を設定すると、必要問い合わせ数の目安を表示できます。</p>';
    }
    const registeredSales = Number(s.planned || 0);
    const shortage = Math.max(0, Number(s.monthlyTarget || 0) - registeredSales);
    const activeCount = Number(s.recordCount || 0);
    const averageUnit = activeCount > 0 ? Math.max(1, Math.round(registeredSales / activeCount)) : 15000;
    const neededOrders = shortage > 0 ? Math.ceil(shortage / averageUnit) : 0;
    const assumedCloseRate = 0.5;
    const neededInquiries = neededOrders > 0 ? Math.ceil(neededOrders / assumedCloseRate) : 0;
    return `
      <div class="analytics-kpi-goal">
        <p>今月目標まであと <strong>${esc(RevenueBrain.formatYen(shortage))}</strong>。</p>
        <p>平均単価 ${esc(RevenueBrain.formatYen(averageUnit))}${activeCount ? '' : '（仮定）'}なら、あと${neededOrders}件の受注が目安です。</p>
        <p>問い合わせ成約率50%（仮定）で見ると、あと${neededInquiries}件の問い合わせが目安です。</p>
        <p class="analytics-kpi-goal-note">売上データは読み取り専用で参照しています。</p>
      </div>
    `;
  }

  function renderKpiInsights(snapshot) {
    const insights = (snapshot && snapshot.insights) || [];
    if (!insights.length) return '<p class="placeholder-text">分析はまだありません。</p>';
    return `<ul class="analytics-kpi-insights">${insights.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
  }

  function renderKpiActionCandidates(snapshot) {
    const actions = (snapshot && snapshot.actionCandidates) || [];
    if (!snapshot || !snapshot.id || !actions.length) {
      return '<p class="placeholder-text">改善リストへ追加できる分析はまだありません。</p>';
    }
    return `<ul class="analytics-kpi-action-list">${actions.map(title => `
      <li>
        <span>${esc(title)}</span>
        <div class="analytics-kpi-action-buttons">${renderActionCandidateButtons(snapshot.id, title)}</div>
      </li>
    `).join('')}</ul>`;
  }

  function renderAnalyticsKpiSnapshot() {
    const el = document.getElementById('analytics-kpi-snapshot');
    if (!el) return;
    const snapshot = Storage.getLatestAnalyticsSnapshot();
    if (!snapshot) {
      el.innerHTML = `
        <p class="placeholder-text">外部レポートを貼り付けて保存すると、アクセスKPIがここに表示されます。</p>
        <p class="analytics-kpi-note">未確認の項目は0ではありません。貼り付け内容から抽出できた範囲のみ表示します。</p>
      `;
      return;
    }
    const m = snapshot.metrics || {};
    const anomaly = (snapshot.insights || []).some(i => /異常|ノイズ|減少|少ない|確認/.test(i));
    el.innerHTML = `
      <div class="analytics-kpi-meta">
        <p><strong>対象期間：</strong>${esc(snapshot.periodLabel || snapshot.periodStart || snapshot.periodEnd || '未確認')}</p>
        <p><strong>保存日時：</strong>${esc((snapshot.importedAt || snapshot.createdAt || '').slice(0, 16).replace('T', ' ') || '—')}</p>
      </div>
      <div class="analytics-kpi-card-grid">
        <div class="analytics-kpi-card"><span>対象期間アクセス</span><strong>${kpiMetricValue(m.accessCount)}</strong></div>
        <div class="analytics-kpi-card"><span>検索流入</span><strong>${kpiMetricValue(m.searchTraffic)}</strong></div>
        <div class="analytics-kpi-card"><span>問い合わせ導線クリック</span><strong>${kpiMetricValue(m.inquiryClicks)}</strong></div>
        <div class="analytics-kpi-card"><span>GBP電話タップ</span><strong>${kpiMetricValue(m.gbpPhone)}</strong></div>
        <div class="analytics-kpi-card"><span>異常あり/なし</span><strong>${anomaly ? '要確認' : '大きな異常なし'}</strong></div>
      </div>
      <div class="analytics-kpi-subgrid">
        <div class="analytics-kpi-block">
          <h3>LP別上位</h3>
          ${renderKpiTopPages(snapshot)}
        </div>
        <div class="analytics-kpi-block">
          <h3>抽出KPI</h3>
          <div class="analytics-kpi-rows">${renderKpiMetricRows(snapshot)}</div>
        </div>
      </div>
      <div class="analytics-kpi-block">
        <h3>簡易分析</h3>
        ${renderKpiInsights(snapshot)}
      </div>
      <div class="analytics-kpi-block">
        <h3>売上目標との目安</h3>
        ${buildRevenueGoalKpiHtml()}
      </div>
      <div class="analytics-kpi-block">
        <h3>改善リストへ追加</h3>
        ${renderKpiActionCandidates(snapshot)}
      </div>
      <p class="analytics-kpi-note">未確認の項目は0ではありません。貼り付け内容から抽出できた範囲のみ表示しています。</p>
    `;
    bindActionCandidateButtons(el);
  }

  function renderAnalyticsSummary(ctx) {
    const conclusionEl = document.getElementById('analytics-today-conclusion');
    if (conclusionEl) {
      const conclusion = ctx.todayConclusion || '';
      conclusionEl.innerHTML = conclusion
        ? `<strong>今日の結論：</strong>${esc(conclusion)}`
        : '';
    }
    const el = document.getElementById('analytics-summary');
    if (!el) return;
    const ad = ctx.adReadiness || {};
    const bb = ctx.browserBantou || {};
    const adLabel = bb.adDecision || ad.label || '—';
    el.innerHTML = `
      <div class="analytics-summary-item"><span>登録ページ</span><strong>${(ctx.records || []).length}件</strong></div>
      <div class="analytics-summary-item"><span>需要強い</span><strong>${ctx.strongCount || 0}件</strong></div>
      <div class="analytics-summary-item"><span>離脱注意</span><strong>${ctx.bounceCount || 0}件</strong></div>
      <div class="analytics-summary-item"><span>広告判断</span><strong>${esc(adLabel)}</strong></div>
      ${bb.hasTodayImport ? `<div class="analytics-summary-item"><span>外部レポート</span><strong>今日取り込み済</strong></div>` : ''}
      ${ctx.priority ? `<p class="analytics-summary-priority">${esc(ctx.priority.actionSummary || ctx.priority.pageName)}</p>` : ''}`;
  }

  function renderBrowserBantouPrompt() {
    const prompt = AnalyticsBrain.buildBrowserBantouPrompt(Storage.getSettings());
    const previewEl = document.getElementById('browser-bantou-prompt-preview');
    const sampleEl = document.getElementById('browser-bantou-sample-text');
    const shortPreview = prompt.length > 600 ? prompt.slice(0, 600) + '\n…（コピーで全文）' : prompt;
    if (previewEl) previewEl.textContent = shortPreview;
    if (sampleEl) sampleEl.textContent = AnalyticsBrain.BROWSER_BANTOU_SAMPLE;
    return prompt;
  }

  function copyBrowserBantouPrompt() {
    const prompt = AnalyticsBrain.buildBrowserBantouPrompt(Storage.getSettings());
    copyText(prompt).then(() => {
      alert('アクセス確認用の文をコピーしました。');
    }).catch(() => alert('コピーに失敗しました。'));
  }

  function parseBrowserBantouPaste() {
    const text = document.getElementById('browser-bantou-paste')?.value || '';
    const parsed = AnalyticsBrain.parseBrowserBantouReport(text);
    parsed.rawText = text;
    const preview = AnalyticsBrain.buildImportPreview(parsed, Storage.getAnalyticsRecords());
    if (preview.snapshot && preview.snapshot.rawTextHash) {
      preview.duplicateSnapshot = Storage.findAnalyticsSnapshotDuplicate(
        preview.snapshot.rawTextHash,
        preview.snapshot.periodLabel
      );
      if (preview.duplicateSnapshot) {
        preview.warnings.push('同じ貼り付け内容のKPIスナップショットが既に保存されています');
      }
    }
    lastBrowserBantouPreview = preview;
    renderBrowserBantouPreview(preview);
    const saveBtn = document.getElementById('btn-browser-bantou-save');
    if (saveBtn) saveBtn.disabled = (!preview.pages.length && !snapshotHasKpiData(preview.snapshot)) || preview.errors.length > 0;
    return preview;
  }

  function renderBrowserBantouKpiPreview(preview) {
    const el = document.getElementById('browser-bantou-preview-kpi');
    if (!el) return;
    const snapshot = preview && preview.snapshot;
    if (!snapshotHasKpiData(snapshot)) {
      el.innerHTML = `
        <div class="analytics-kpi-preview-empty">
          <p>主要KPIはまだ抽出できていません。</p>
          <p class="analytics-kpi-note">未確認の項目は0ではありません。貼り付け内容から抽出できた範囲のみ表示しています。</p>
        </div>
      `;
      return;
    }
    const duplicate = preview && preview.duplicateSnapshot;
    el.innerHTML = `
      <div class="analytics-kpi-preview">
        <div class="analytics-kpi-preview-header">
          <h4>日次KPIプレビュー</h4>
          ${duplicate ? '<span class="analytics-kpi-dup-label">重複候補あり</span>' : ''}
        </div>
        <p><strong>対象期間：</strong>${esc(snapshot.periodLabel || snapshot.periodStart || snapshot.periodEnd || '未確認')}</p>
        <div class="analytics-kpi-preview-grid">
          ${renderKpiMetricRows(snapshot)}
        </div>
        <div class="analytics-kpi-preview-pages">
          <h5>LP別上位</h5>
          ${renderKpiTopPages(snapshot)}
        </div>
        <div class="analytics-kpi-preview-insights">
          <h5>簡易分析</h5>
          ${renderKpiInsights(snapshot)}
        </div>
        <p class="analytics-kpi-note">未確認の項目は0ではありません。貼り付け内容から抽出できた範囲のみ表示しています。</p>
      </div>
    `;
  }

  function renderBrowserBantouPreview(preview) {
    const previewPanel = document.getElementById('browser-bantou-preview');
    const errorsEl = document.getElementById('browser-bantou-errors');
    if (!preview) {
      if (previewPanel) previewPanel.classList.add('hidden');
      if (errorsEl) errorsEl.classList.add('hidden');
      return;
    }

    const dupIds = new Set((preview.duplicates || []).map(d => d.record.pageName + '|' + d.record.date));

    if (errorsEl) {
      const msgs = [...(preview.errors || []), ...(preview.warnings || [])];
      if (msgs.length) {
        errorsEl.classList.remove('hidden');
        errorsEl.classList.toggle('is-warning', !preview.errors.length);
        errorsEl.innerHTML = `<strong>${preview.errors.length ? '解析エラー' : '注意'}</strong><ul>${msgs.map(m => `<li>${esc(m)}</li>`).join('')}</ul>`;
      } else {
        errorsEl.classList.add('hidden');
        errorsEl.innerHTML = '';
      }
    }

    if (previewPanel) previewPanel.classList.remove('hidden');
    renderBrowserBantouKpiPreview(preview);

    const summaryEl = document.getElementById('browser-bantou-preview-summary');
    if (summaryEl) {
      summaryEl.innerHTML = `
        <p><strong>取り込み日：</strong>${esc(preview.date || '—')}</p>
        <p><strong>全体コメント：</strong>${esc(preview.overallComment || '—')}</p>
        <p><strong>広告判断：</strong>${esc(preview.adDecision || '—')}</p>
        <p><strong>ページ件数：</strong>${preview.pageCount || 0}件（形式：${esc(preview.sourceFormat || '—')}）</p>`;
    }

    const pagesEl = document.getElementById('browser-bantou-preview-pages');
    if (pagesEl) {
      pagesEl.innerHTML = (preview.pages || []).map(r => {
        const isDup = dupIds.has(r.pageName + '|' + r.date);
        const action = (r.recommendedActions || [])[0]?.text || r.recommendedActionText || '—';
        return `<div class="browser-bantou-preview-page${isDup ? ' is-duplicate' : ''}">
          <strong>${esc(r.pageName)}</strong>${isDup ? '<span class="browser-bantou-dup-label">重複候補</span>' : ''}
          <p class="analytics-meta">表示${r.views} / 直帰${r.bounceRate}% / スコア${r.demandScore}（${esc(r.scoreLabel)}）</p>
          <p class="analytics-meta">診断：${esc((r.diagnosis || '').split('\n')[0])}</p>
          <p class="analytics-meta">推奨：${esc(action)}</p>
        </div>`;
      }).join('') || '<p class="placeholder-text">ページデータがありません。</p>';
    }

    const tasksEl = document.getElementById('browser-bantou-preview-tasks');
    if (tasksEl) {
      const tasks = preview.todayTasks || [];
      tasksEl.innerHTML = tasks.length ? `
        <h4>改善リストへ追加</h4>
        <ul class="browser-bantou-candidate-list">${tasks.map((t, i) => `
          <li><span>${esc(t)}</span>
            <button type="button" class="btn btn-sm btn-secondary" data-browser-task="${i}">毎日やることに追加</button>
          </li>`).join('')}</ul>
        <button type="button" class="btn btn-sm btn-secondary" id="btn-browser-bantou-add-all-tasks">候補をすべて追加</button>`
        : '';
      tasksEl.querySelectorAll('[data-browser-task]').forEach(btn => {
        btn.addEventListener('click', () => addBrowserBantouTask(Number(btn.dataset.browserTask)));
      });
      const allTasksBtn = document.getElementById('btn-browser-bantou-add-all-tasks');
      if (allTasksBtn) allTasksBtn.addEventListener('click', addAllBrowserBantouTasks);
    }

    const demandEl = document.getElementById('browser-bantou-preview-demand');
    if (demandEl) {
      const candidates = preview.demandCandidates || [];
      demandEl.innerHTML = candidates.length ? `
        <h4>需要番頭に送る候補</h4>
        <ul class="browser-bantou-candidate-list">${candidates.map((t, i) => `
          <li><span>${esc(t)}</span>
            <button type="button" class="btn btn-sm btn-primary" data-browser-demand="${i}">需要番頭に送る</button>
          </li>`).join('')}</ul>
        <button type="button" class="btn btn-sm btn-primary" id="btn-browser-bantou-send-all-demand">候補をすべて送る</button>`
        : '';
      demandEl.querySelectorAll('[data-browser-demand]').forEach(btn => {
        btn.addEventListener('click', () => sendBrowserBantouDemand(Number(btn.dataset.browserDemand)));
      });
      const allDemandBtn = document.getElementById('btn-browser-bantou-send-all-demand');
      if (allDemandBtn) allDemandBtn.addEventListener('click', sendAllBrowserBantouDemand);
    }
  }

  function saveBrowserBantouImport() {
    const preview = lastBrowserBantouPreview;
    if (!preview || (!preview.pages.length && !snapshotHasKpiData(preview.snapshot))) {
      alert('先にレポートを解析してください。');
      return;
    }
    if (preview.errors.length) {
      alert('解析エラーがあるため保存できません。');
      return;
    }
    if (preview.duplicates && preview.duplicates.length) {
      const ok = confirm(`既存あり：上書きせず追加しますか？\n重複候補 ${preview.duplicates.length}件`);
      if (!ok) return;
    }
    if (preview.duplicateSnapshot) {
      const ok = confirm('同じ貼り付け内容のKPIスナップショットが既にあります。上書きせず新規保存しますか？');
      if (!ok) return;
    }
    const text = document.getElementById('browser-bantou-paste')?.value || '';
    preview.pages.forEach(page => {
      Storage.addAnalyticsRecord({
        ...page,
        browserReportText: text.length > 500 ? text.slice(0, 500) + '…' : text
      });
    });
    let savedSnapshot = null;
    if (snapshotHasKpiData(preview.snapshot)) {
      savedSnapshot = Storage.addAnalyticsSnapshot({
        ...preview.snapshot,
        createdActionCandidateIds: []
      });
    }
    lastBrowserBantouPreview = null;
    const saveBtn = document.getElementById('btn-browser-bantou-save');
    if (saveBtn) saveBtn.disabled = true;
    renderAnalyticsView();
    renderDashboard();
    const parts = [];
    if (preview.pages.length) parts.push(`${preview.pages.length}件のアナリティクスデータ`);
    if (savedSnapshot) parts.push('KPIスナップショット1件');
    alert(`${parts.join(' / ')}を保存しました。`);
  }

  function addBrowserBantouTask(index) {
    const preview = lastBrowserBantouPreview;
    if (!preview) return;
    const title = (preview.todayTasks || [])[index];
    if (!title) return;
    const payload = AnalyticsBrain.createBrowserBantouTaskPayload(title, preview.date || TODAY());
    const exists = Storage.getDailyActionTasksData().manualTasks.some(
      t => t.pickupDedupeKey === payload.pickupDedupeKey
    );
    if (exists) {
      alert('同じタスクは既に毎日やることにあります。');
      return;
    }
    Storage.addManualDailyTask({ id: 'manual_' + Storage.generateId(), ...payload });
    renderDashboard();
    alert('毎日やることに追加しました。');
  }

  function addAllBrowserBantouTasks() {
    const preview = lastBrowserBantouPreview;
    if (!preview) return;
    let added = 0;
    (preview.todayTasks || []).forEach((title, i) => {
      const payload = AnalyticsBrain.createBrowserBantouTaskPayload(title, preview.date || TODAY());
      const exists = Storage.getDailyActionTasksData().manualTasks.some(
        t => t.pickupDedupeKey === payload.pickupDedupeKey
      );
      if (!exists) {
        Storage.addManualDailyTask({ id: 'manual_' + Storage.generateId(), ...payload });
        added++;
      }
    });
    renderDashboard();
    alert(added ? `${added}件を毎日やることに追加しました。` : '追加できる新しい候補はありませんでした。');
  }

  function sendBrowserBantouDemand(index) {
    const preview = lastBrowserBantouPreview;
    if (!preview) return;
    const candidate = (preview.demandCandidates || [])[index];
    if (!candidate) return;
    const payload = AnalyticsBrain.createBrowserBantouDemandPayload(candidate, preview.date || TODAY());
    const exists = Storage.getDemandPickups().some(p =>
      p.source === payload.source && p.topic === payload.topic && p.date === payload.date
    );
    if (exists) {
      alert('同じ需要候補は既に送付済みです。');
      return;
    }
    Storage.addDemandPickup(payload);
    renderAnalyticsView();
    renderDashboard();
    alert('需要番頭に送りました。');
  }

  function sendAllBrowserBantouDemand() {
    const preview = lastBrowserBantouPreview;
    if (!preview) return;
    let sent = 0;
    (preview.demandCandidates || []).forEach(candidate => {
      const payload = AnalyticsBrain.createBrowserBantouDemandPayload(candidate, preview.date || TODAY());
      const exists = Storage.getDemandPickups().some(p =>
        p.source === payload.source && p.topic === payload.topic && p.date === payload.date
      );
      if (!exists) {
        Storage.addDemandPickup(payload);
        sent++;
      }
    });
    renderAnalyticsView();
    renderDashboard();
    alert(sent ? `${sent}件を需要番頭に送りました。` : '送れる新しい候補はありませんでした。');
  }

  function fillBrowserBantouSample() {
    const el = document.getElementById('browser-bantou-paste');
    if (el) el.value = AnalyticsBrain.BROWSER_BANTOU_SAMPLE;
  }

  function clearBrowserBantouPaste() {
    const el = document.getElementById('browser-bantou-paste');
    if (el) el.value = '';
    lastBrowserBantouPreview = null;
    const saveBtn = document.getElementById('btn-browser-bantou-save');
    if (saveBtn) saveBtn.disabled = true;
    renderBrowserBantouPreview(null);
  }

  function renderAnalyticsRecordsList(ctx) {
    const el = document.getElementById('analytics-records-list');
    if (!el) return;
    const list = (ctx.records || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (!list.length) {
      el.innerHTML = '<p class="placeholder-text">ページ別データはまだありません。GA4から手入力してください。</p>';
      return;
    }
    el.innerHTML = `<table class="analytics-table"><thead><tr>
      <th>日付</th><th>ページ</th><th>表示</th><th>直帰率</th><th>スコア</th><th>ラベル</th><th></th>
    </tr></thead><tbody>${list.map(r => `<tr class="${selectedAnalyticsId === r.id ? 'selected' : ''}">
      <td>${esc(r.date || '—')}</td>
      <td>${esc(r.pageName)}</td>
      <td>${r.views}</td>
      <td>${r.bounceRate}%</td>
      <td>${r.demandScore}</td>
      <td><span class="analytics-score-label">${esc(r.scoreLabel || '—')}</span></td>
      <td><button type="button" class="btn btn-sm btn-secondary" data-analytics-open="${esc(r.id)}">詳細</button></td>
    </tr>`).join('')}</tbody></table>`;
    el.querySelectorAll('[data-analytics-open]').forEach(btn => {
      btn.addEventListener('click', () => fillAnalyticsForm(btn.dataset.analyticsOpen));
    });
  }

  function renderAnalyticsDetail(record) {
    const panel = document.getElementById('analytics-detail-panel');
    const el = document.getElementById('analytics-detail');
    if (!panel || !el || !record) {
      if (panel) panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');
    const clicks = AnalyticsBrain.totalClicks(record);
    el.innerHTML = `
      <p class="analytics-meta"><strong>${esc(record.pageName)}</strong> / ${esc(record.pageType)} / ${esc(record.serviceTag)}</p>
      <p class="analytics-meta">URL：${record.url ? `<a href="${esc(record.url)}" target="_blank" rel="noopener noreferrer">${esc(record.url)}</a>` : '—'}</p>
      <p class="analytics-meta">表示${record.views} / ユーザー${record.activeUsers} / エンゲージ${record.avgEngagementSeconds}秒 / イベント${record.eventCount} / クリック${clicks}</p>
      <div class="analytics-detail-block">
        <h3>需要スコア：${record.demandScore}点（${esc(record.scoreLabel)}）</h3>
      </div>
      <div class="analytics-detail-block">
        <h3>ページ別診断</h3>
        <p class="analytics-diagnosis">${esc(record.diagnosis || '').replace(/\n/g, '<br>')}</p>
      </div>
      <div class="analytics-detail-block">
        <h3>次の打ち手</h3>
        <p>${esc(record.actionSummary || '')}</p>
        <ul class="analytics-action-btns">${(record.recommendedActions || []).map((a, i) =>
          `<li><button type="button" class="btn btn-sm btn-secondary" data-analytics-task="${esc(record.id)}" data-analytics-action="${i}">${esc(a.text)}を毎日やることに</button></li>`
        ).join('')}</ul>
      </div>
      <div class="analytics-detail-actions">
        <button type="button" class="btn btn-sm btn-primary" data-analytics-pickup="${esc(record.id)}">需要番頭に送る</button>
        <button type="button" class="btn btn-sm btn-secondary" data-analytics-status="${esc(record.id)}" data-status="actioned">打ち手実行済み</button>
        <button type="button" class="btn btn-sm btn-secondary" data-analytics-status="${esc(record.id)}" data-status="watching">様子見</button>
      </div>`;
    bindAnalyticsDetailEvents(record);
  }

  function bindAnalyticsDetailEvents(record) {
    const root = document.getElementById('analytics-detail');
    if (!root) return;
    root.querySelectorAll('[data-analytics-task]').forEach(btn => {
      btn.addEventListener('click', () => {
        addAnalyticsTask(btn.dataset.analyticsTask, Number(btn.dataset.analyticsAction));
      });
    });
    const pickupBtn = root.querySelector('[data-analytics-pickup]');
    if (pickupBtn) pickupBtn.addEventListener('click', () => sendAnalyticsToPickup(pickupBtn.dataset.analyticsPickup));
    root.querySelectorAll('[data-analytics-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        Storage.updateAnalyticsRecord(btn.dataset.analyticsStatus, { status: btn.dataset.status });
        renderAnalyticsView();
        renderDashboard();
        alert('ステータスを更新しました。');
      });
    });
  }

  function addAnalyticsTask(recordId, actionIndex) {
    const record = findAnalyticsRecord(recordId);
    if (!record) return;
    const action = (record.recommendedActions || [])[actionIndex];
    if (!action) return;
    const payload = AnalyticsBrain.createTaskPayload(record, action, TODAY());
    const exists = Storage.getDailyActionTasksData().manualTasks.some(
      t => t.pickupDedupeKey === payload.pickupDedupeKey
    );
    if (exists) {
      alert('同じタスクは既に毎日やることにあります。');
      return;
    }
    Storage.addManualDailyTask({ id: 'manual_' + Storage.generateId(), ...payload });
    renderDashboard();
    alert('毎日やることに追加しました。');
  }

  function sendAnalyticsToPickup(recordId) {
    const record = findAnalyticsRecord(recordId);
    if (!record) return;
    const payload = AnalyticsBrain.createDemandPickupPayload(record);
    const exists = Storage.getDemandPickups().some(p =>
      p.memo && p.memo.includes(record.id) && p.source === 'GA4手入力'
    );
    if (exists) {
      alert('同じページの需要ピックアップが既にあります。');
      return;
    }
    Storage.addDemandPickup({ ...payload, isDemo: record.isDemo, isTest: record.isTest });
    renderAnalyticsView();
    renderDashboard();
    alert('需要番頭に送りました。');
  }

  function renderAnalyticsTopDemand(ctx) {
    const el = document.getElementById('analytics-top-demand');
    if (!el) return;
    const top = ctx.topDemand || [];
    if (!top.length) {
      el.innerHTML = '<p class="placeholder-text">需要スコア上位はまだありません。</p>';
      return;
    }
    el.innerHTML = top.map(r => `
      <div class="analytics-top-card">
        <strong>${esc(r.pageName)}</strong>
        <span class="analytics-score-badge">${r.demandScore}点</span>
        <span class="analytics-score-label">${esc(r.scoreLabel)}</span>
        <p class="analytics-meta">表示${r.views} / 直帰${r.bounceRate}%</p>
      </div>`).join('');
  }

  function renderAnalyticsActionsList(ctx) {
    const el = document.getElementById('analytics-actions-list');
    if (!el) return;
    const items = (ctx.records || []).filter(r => r.status === 'open').slice(0, 8);
    if (!items.length) {
      el.innerHTML = '<p class="placeholder-text">次の打ち手はありません。</p>';
      return;
    }
    el.innerHTML = items.map(r => `
      <div class="analytics-action-card">
        <p><strong>${esc(r.pageName)}</strong></p>
        <p class="analytics-meta">${esc(r.actionSummary || '')}</p>
        <button type="button" class="btn btn-sm btn-secondary" data-analytics-open-action="${esc(r.id)}">詳細・タスク追加</button>
      </div>`).join('');
    el.querySelectorAll('[data-analytics-open-action]').forEach(btn => {
      btn.addEventListener('click', () => fillAnalyticsForm(btn.dataset.analyticsOpenAction));
    });
  }

  function renderAnalyticsPickupBridge(ctx) {
    const el = document.getElementById('analytics-pickup-bridge');
    if (!el) return;
    const candidates = (ctx.highBounce || []).concat(ctx.topDemand || []).slice(0, 4);
    const unique = [];
    const seen = new Set();
    candidates.forEach(r => {
      if (r && r.id && !seen.has(r.id)) { seen.add(r.id); unique.push(r); }
    });
    if (!unique.length) {
      el.innerHTML = '<p class="placeholder-text">需要番頭に送れるページはまだありません。</p>';
      return;
    }
    el.innerHTML = unique.map(r => `
      <div class="analytics-pickup-card">
        <strong>${esc(r.pageName)}</strong>
        <p class="analytics-meta">${esc(r.actionSummary || r.diagnosis || '')}</p>
        <button type="button" class="btn btn-sm btn-primary" data-analytics-pickup-bridge="${esc(r.id)}">需要番頭に送る</button>
      </div>`).join('');
    el.querySelectorAll('[data-analytics-pickup-bridge]').forEach(btn => {
      btn.addEventListener('click', () => sendAnalyticsToPickup(btn.dataset.analyticsPickupBridge));
    });
  }

  function renderAnalyticsView() {
    try {
      const policyEl = document.getElementById('analytics-policy-text');
      if (policyEl) policyEl.textContent = AnalyticsBrain.POLICY_TEXT;
      populateAnalyticsFormSelects();
      const dateEl = document.getElementById('analytics-date');
      if (dateEl && !dateEl.value) dateEl.value = TODAY();
      const ctx = getAnalyticsContext();
      renderAnalyticsKpiSnapshot();
      renderAnalyticsSummary(ctx);
      renderAnalyticsRecordsList(ctx);
      if (selectedAnalyticsId) {
        const rec = findAnalyticsRecord(selectedAnalyticsId);
        if (rec) renderAnalyticsDetail(rec);
      }
      renderAnalyticsTopDemand(ctx);
      renderAnalyticsActionsList(ctx);
      renderAnalyticsPickupBridge(ctx);
      renderBrowserBantouPrompt();
    } catch (err) {
      console.error('[Budil] renderAnalyticsView', err);
    }
  }

  function initAnalytics() {
    const form = document.getElementById('analytics-record-form');
    if (form && !form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', saveAnalyticsFromForm);
    }
    const clearBtn = document.getElementById('analytics-form-clear');
    if (clearBtn && !clearBtn.dataset.bound) {
      clearBtn.dataset.bound = '1';
      clearBtn.addEventListener('click', clearAnalyticsForm);
    }
    const copyPromptBtn = document.getElementById('btn-browser-bantou-copy-prompt');
    if (copyPromptBtn && !copyPromptBtn.dataset.bound) {
      copyPromptBtn.dataset.bound = '1';
      copyPromptBtn.addEventListener('click', copyBrowserBantouPrompt);
    }
    const parseBtn = document.getElementById('btn-browser-bantou-parse');
    if (parseBtn && !parseBtn.dataset.bound) {
      parseBtn.dataset.bound = '1';
      parseBtn.addEventListener('click', parseBrowserBantouPaste);
    }
    const saveBtn = document.getElementById('btn-browser-bantou-save');
    if (saveBtn && !saveBtn.dataset.bound) {
      saveBtn.dataset.bound = '1';
      saveBtn.addEventListener('click', saveBrowserBantouImport);
    }
    const clearPasteBtn = document.getElementById('btn-browser-bantou-clear-paste');
    if (clearPasteBtn && !clearPasteBtn.dataset.bound) {
      clearPasteBtn.dataset.bound = '1';
      clearPasteBtn.addEventListener('click', clearBrowserBantouPaste);
    }
    const sampleBtn = document.getElementById('btn-browser-bantou-sample');
    if (sampleBtn && !sampleBtn.dataset.bound) {
      sampleBtn.dataset.bound = '1';
      sampleBtn.addEventListener('click', fillBrowserBantouSample);
    }
  }

  // ── エリア番頭 ──
  function renderAreaTodaySummary() {
    const el = document.getElementById('area-today-summary');
    if (!el) return;
    const mapCtx = getMapContext();
    const comments = MapBrain.buildAreaHomeComment(mapCtx.summary, mapCtx.warnings);
    if (!mapCtx.summary.length) {
      el.innerHTML = '<p class="placeholder-text">エリア別データはまだありません。営業先・受付に住所を登録すると集計されます。</p>';
      return;
    }
    el.innerHTML = comments.length
      ? comments.map(c => `<p>${esc(c)}</p>`).join('')
      : `<p>エリア ${mapCtx.summary.length}件を管理中。営業先・受付・売上をエリア別に確認できます。</p>`;
  }

  function renderAreaWarningsList() {
    const el = document.getElementById('area-warnings-list');
    if (!el) return;
    const mapCtx = getMapContext();
    const parts = [];
    mapCtx.warnings.forEach(w => {
      if (w.type === 'far' && w.items) {
        parts.push('<h3 class="area-warnings-subtitle">遠方案件・要確認</h3><ul class="area-warnings-items">');
        w.items.forEach(item => {
          parts.push(`<li><strong>${esc(item.area)} ${esc(item.name)}</strong>：${esc(item.message)}</li>`);
        });
        parts.push('</ul>');
      }
      if (w.type === 'no-address' && w.items) {
        parts.push('<h3 class="area-warnings-subtitle">住所未入力</h3><ul class="area-warnings-items">');
        w.items.forEach(item => {
          const kind = item.kind === 'intake' ? '受付' : (item.kind === 'work-order' ? '作業予定' : '営業先');
          parts.push(`<li>${esc(kind)}：${esc(item.name)} — Googleマップ確認不可</li>`);
        });
        parts.push('</ul>');
      }
      if (w.type === 'revenue-unknown' && w.count) {
        parts.push(`<p class="area-warnings-meta">エリア不明の売上：${w.count}件</p>`);
      }
    });
    el.innerHTML = parts.length ? parts.join('') : '<p class="placeholder-text">遠方案件・住所未入力はありません。</p>';
  }

  function renderAreaSummaryList() {
    const el = document.getElementById('area-summary-list');
    if (!el) return;
    const mapCtx = getMapContext();
    if (!mapCtx.summary.length) {
      el.innerHTML = '<p class="placeholder-text">エリア別サマリーはまだありません。</p>';
      return;
    }
    el.innerHTML = mapCtx.summary.map(row => {
      const areaUrl = MapBrain.buildAreaSearchUrl(row.area);
      const nextParts = [];
      if (row.openIntakes) nextParts.push(`未対応受付${row.openIntakes}件`);
      if (row.nextContactLeads) nextParts.push(`次回連絡${row.nextContactLeads}件`);
      return `
      <div class="area-summary-card">
        <div class="area-summary-header">
          <strong>${esc(row.area)}</strong>
          ${renderAreaDistanceBadge(row.area, row.area)}
        </div>
        <p class="area-summary-meta">営業先：${row.leadCount}件 / 受付：${row.intakeCount}件 / 作業予定：${row.workOrderCount || 0}件 / 売上：${esc(RevenueBrain.formatYen(row.revenueTotal))}</p>
        <p class="area-summary-meta">今日の作業：${row.todayWorkOrders || 0}件 / 今週：${row.weekWorkOrders || 0}件 / 見込み：${esc(RevenueBrain.formatYen(row.workOrderEstimate || 0))}</p>
        <p class="area-summary-meta">次：${nextParts.length ? esc(nextParts.join('、')) : '—'}</p>
        <div class="map-actions-inline">
          ${areaUrl ? `<a href="${esc(areaUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-secondary">Googleマップでエリア検索</a>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  function renderAreaRevenueList() {
    const el = document.getElementById('area-revenue-list');
    if (!el) return;
    const { summary } = getMapContext();
    const rows = summary.filter(r => r.revenueCount > 0);
    if (!rows.length) {
      el.innerHTML = '<p class="placeholder-text">エリア別売上はまだありません。</p>';
      return;
    }
    el.innerHTML = `<ul class="area-revenue-breakdown">${rows.map(r =>
      `<li><strong>${esc(r.area)}</strong>：${r.revenueCount}件 / ${esc(RevenueBrain.formatYen(r.revenueTotal))}</li>`
    ).join('')}</ul>`;
  }

  function renderAreaLeadsList() {
    const el = document.getElementById('area-leads-list');
    if (!el) return;
    const { leads, today } = getMapContext();
    const groups = {};
    leads.forEach(lead => {
      const area = MapBrain.getLeadArea(lead);
      if (!groups[area]) groups[area] = [];
      groups[area].push(lead);
    });
    const keys = Object.keys(groups).sort();
    if (!keys.length) {
      el.innerHTML = '<p class="placeholder-text">営業先がありません。</p>';
      return;
    }
    el.innerHTML = keys.map(area => `
      <div class="area-group-block">
        <h3 class="area-group-title">${esc(area)}（${groups[area].length}件）</h3>
        <ul class="area-group-list">${groups[area].slice(0, 8).map(lead => {
          const addr = MapBrain.getLeadAddress(lead);
          return `<li>
            <button type="button" class="lead-company-link" data-open-lead="${esc(lead.id)}">${esc(lead.company)}</button>
            ${renderAreaDistanceBadge(area, addr)}
            <div class="area-group-map">${renderMapActionsHtml(addr, { area, showNoAddress: true })}</div>
          </li>`;
        }).join('')}</ul>
      </div>`).join('');
    el.querySelectorAll('[data-open-lead]').forEach(btn => {
      btn.addEventListener('click', () => openSalesDetail(btn.dataset.openLead, { navigate: true }));
    });
    bindMapActionEvents(el);
  }

  function renderAreaIntakesList() {
    const el = document.getElementById('area-intakes-list');
    if (!el) return;
    const { intakes } = getMapContext();
    const active = intakes.filter(i => i.status !== 'archived' && i.status !== 'done');
    const groups = {};
    active.forEach(intake => {
      const area = MapBrain.getIntakeArea(intake);
      if (!groups[area]) groups[area] = [];
      groups[area].push(intake);
    });
    const keys = Object.keys(groups).sort();
    if (!keys.length) {
      el.innerHTML = '<p class="placeholder-text">有効な受付データはありません。</p>';
      return;
    }
    el.innerHTML = keys.map(area => `
      <div class="area-group-block">
        <h3 class="area-group-title">${esc(area)}（${groups[area].length}件）</h3>
        <ul class="area-group-list">${groups[area].slice(0, 8).map(intake => {
          const addr = (intake.address || '').trim();
          return `<li>
            <strong>${esc(intake.customerName || '—')}</strong>
            ${renderAreaDistanceBadge(area, addr)}
            <div class="area-group-map">${renderMapActionsHtml(addr, { area, showNoAddress: true })}</div>
          </li>`;
        }).join('')}</ul>
      </div>`).join('');
    bindMapActionEvents(el);
  }

  function renderAreaWorkOrdersList() {
    const el = document.getElementById('area-work-orders-list');
    if (!el) return;
    const { workOrders, today } = getMapContext();
    const active = WorkOrderBrain.filterActive(workOrders);
    if (!active.length) {
      el.innerHTML = '<p class="placeholder-text">作業予定はまだありません。<br>予定取り込みから読み込めます。</p>';
      return;
    }
    const weekEnd = WorkOrderBrain.addDays(today, 6);
    const byArea = {};
    active.forEach(wo => {
      const area = WorkOrderBrain.getWorkOrderArea(wo);
      if (!byArea[area]) byArea[area] = [];
      byArea[area].push(wo);
    });
    el.innerHTML = Object.keys(byArea).sort().map(area => {
      const list = byArea[area];
      const todayCount = list.filter(w => w.scheduledDate === today).length;
      const weekCount = list.filter(w => w.scheduledDate >= today && w.scheduledDate <= weekEnd).length;
      const estimate = WorkOrderBrain.sumEstimate(list);
      return `
      <div class="area-summary-card">
        <strong>${esc(area)}</strong> ${renderAreaDistanceBadge(area, area)}
        <p class="area-summary-meta">作業予定 ${list.length}件 / 今日 ${todayCount}件 / 今週 ${weekCount}件 / 見込み ${esc(WorkOrderBrain.formatYen(estimate))}</p>
      </div>`;
    }).join('');
  }

  function renderAreaView() {
    try {
      safeRenderSection(null, () => renderAreaTodaySummary(), 'エリアサマリー');
      safeRenderSection('area-warnings-list', () => renderAreaWarningsList(), 'エリア注意');
      safeRenderSection('area-summary-list', () => renderAreaSummaryList(), 'エリア別サマリー');
      safeRenderSection('area-revenue-list', () => renderAreaRevenueList(), 'エリア別売上');
      safeRenderSection('area-leads-list', () => renderAreaLeadsList(), 'エリア別営業先');
      safeRenderSection('area-intakes-list', () => renderAreaIntakesList(), 'エリア別受付');
      safeRenderSection('area-work-orders-list', () => renderAreaWorkOrdersList(), 'エリア別作業予定');
    } catch (err) {
      console.error('[Budil] render error: エリア番頭', err);
    }
  }

  // ── 受付・予約番頭 ──
  function getReceptionFormData() {
    const address = document.getElementById('reception-address').value;
    const areaVal = document.getElementById('reception-area').value;
    return ReceptionBrain.normalizeIntake({
      id: document.getElementById('reception-edit-id').value || '',
      source: document.getElementById('reception-source').value,
      customerName: document.getElementById('reception-customer').value,
      phone: document.getElementById('reception-phone').value,
      address,
      area: areaVal || MapBrain.detectAreaFromAddress(address),
      serviceText: document.getElementById('reception-service').value,
      preferredDatesText: document.getElementById('reception-dates').value,
      memo: document.getElementById('reception-memo').value,
      estimateAmount: document.getElementById('reception-amount').value,
      handlingStatus: document.getElementById('reception-handling').value
    });
  }

  function setReceptionFormData(data) {
    const item = ReceptionBrain.normalizeIntake(data || {});
    document.getElementById('reception-edit-id').value = item.id || '';
    fillSourceSelectOptions(document.getElementById('reception-source'), item.source || '', { blankLabel: '未選択' });
    document.getElementById('reception-customer').value = item.customerName || '';
    document.getElementById('reception-phone').value = item.phone || '';
    document.getElementById('reception-address').value = item.address || '';
    document.getElementById('reception-service').value = item.serviceText || '';
    document.getElementById('reception-dates').value = item.preferredDatesText || '';
    document.getElementById('reception-memo').value = item.memo || '';
    document.getElementById('reception-amount').value = item.estimateAmount || '';
    document.getElementById('reception-handling').value = item.handlingStatus || '';
    const areaEl = document.getElementById('reception-area');
    if (areaEl) {
      fillAreaSelectOptions(areaEl, item.area || MapBrain.getIntakeArea(item));
      if (item.area) areaEl.dataset.manual = '1';
    }
    syncReceptionAreaFromAddress();
    if (item.area && areaEl) {
      areaEl.value = item.area;
      areaEl.dataset.manual = '1';
    }
  }

  function clearReceptionForm() {
    const areaEl = document.getElementById('reception-area');
    if (areaEl) areaEl.dataset.manual = '';
    setReceptionFormData({});
  }

  function clearReceptionDraftInputs(options) {
    const opts = options || {};
    clearReceptionForm();
    const pasteEl = document.getElementById('reception-paste-area');
    if (pasteEl) pasteEl.value = '';
    const nextEl = document.getElementById('reception-next-actions');
    if (nextEl) nextEl.innerHTML = '';
    if (opts.renderNext !== false) renderReceptionNextActionsV484();
  }

  function applyReceptionPaste() {
    const text = document.getElementById('reception-paste-area').value;
    const parsed = ReceptionBrain.parseAiBantouPaste(text);
    setReceptionFormData(parsed);
    syncReceptionAreaFromAddress();
    renderReceptionNextActionsV484();
  }

  function saveReceptionFromForm() {
    const data = getReceptionFormData();
    if (!(data.customerName || data.serviceText || data.source)) {
      alert('お客様名・作業内容・依頼元のいずれかを入力してください。');
      return null;
    }
    const editId = document.getElementById('reception-edit-id').value;
    if (editId) {
      return Storage.updateReceptionIntake(editId, data);
    }
    return Storage.addReceptionIntake(data);
  }

  function saveReceptionFromPaste() {
    applyReceptionPaste();
    const saved = saveReceptionFromForm();
    if (!saved) return;
    clearReceptionDraftInputs({ renderNext: false });
    renderReceptionView();
    renderDashboard();
    alert('受付データを保存しました。');
  }

  function formatReceptionStatus(status) {
    return ReceptionBrain.STATUS_LABELS[status] || status || '—';
  }

  function formatReceptionDate(iso) {
    if (!iso) return '—';
    return iso.slice(0, 10);
  }

  function renderReceptionTodaySummary() {
    const el = document.getElementById('reception-today-summary');
    if (!el) return;
    const summary = ReceptionBrain.getReceptionSummary(Storage.getReceptionIntakes(), TODAY());
    const comment = ReceptionBrain.buildReceptionHomeCommentFromIntakes(Storage.getReceptionIntakes());
    if (!summary.total) {
      el.innerHTML = '<p class="placeholder-text">受付データはまだありません。AI番頭の結果を貼り付けて取り込みましょう。</p>';
      return;
    }
    el.innerHTML = `
      <p class="reception-summary-line">受付 ${summary.active}件（新規 ${summary.newCount}件 / 営業先未作成 ${summary.noLeadCount}件）</p>
      ${comment ? `<p class="reception-summary-comment">${esc(comment)}</p>` : ''}`;
  }

  function getReceptionFormDraftIntake() {
    const data = getReceptionFormData();
    if (!(data.customerName || data.address || data.serviceText || data.source || data.phone)) {
      return null;
    }
    return ReceptionBrain.normalizeIntake(data);
  }

  function getReceptionWorkflowState(intake) {
    return ReceptionBrain.getWorkflowState(intake, {
      leads: Storage.getLeads(),
      workOrders: Storage.getWorkOrders(),
      revenues: Storage.getRevenueRecords()
    });
  }

  function renderReceptionStateLabels(state) {
    const labels = state && state.labels ? state.labels : [];
    return `<div class="reception-state-labels">${labels.map(label =>
      `<span class="reception-state-label">${esc(label)}</span>`
    ).join('')}</div>`;
  }

  function renderReceptionPrimaryAction(intakeId, state, options) {
    const opts = options || {};
    const action = state && state.primaryAction || 'case';
    const label = state && state.primaryLabel || '案件化する';
    const attr = {
      openRevenue: 'data-reception-open-revenue',
      fillRevenue: 'data-reception-fill-revenue',
      openWorkOrder: 'data-reception-open-work-order',
      createWorkOrder: 'data-reception-create-work-order',
      case: 'data-reception-main-case'
    }[action] || 'data-reception-main-case';
    const cls = opts.compact ? 'btn btn-sm btn-primary reception-primary-action' : 'btn btn-primary reception-primary-action';
    return `<button type="button" class="${cls}" ${attr}="${esc(intakeId)}">${esc(label)}</button>`;
  }

  function renderReceptionDetailActions(intake, state) {
    const id = intake.id;
    const leadAction = state.hasLead
      ? `<button type="button" class="btn btn-sm btn-secondary" data-reception-open-lead="${esc(id)}">営業先を開く</button>`
      : `<button type="button" class="btn btn-sm btn-secondary" data-reception-create-lead="${esc(id)}">営業先を作成</button>`;
    const workAction = state.hasWorkOrder
      ? `<button type="button" class="btn btn-sm btn-secondary" data-reception-open-work-order="${esc(id)}">作業予定を開く</button>`
      : `<button type="button" class="btn btn-sm btn-secondary" data-reception-create-work-order="${esc(id)}">この受付から作業予定を作る</button>`;
    const revenueAction = state.hasRevenue
      ? `<button type="button" class="btn btn-sm btn-secondary" data-reception-open-revenue="${esc(id)}">売上を開く</button>`
      : `<button type="button" class="btn btn-sm btn-secondary" data-reception-fill-revenue="${esc(id)}">売上フォームに反映</button>`;
    return `
      <details class="reception-detail-actions">
        <summary>詳細操作</summary>
        <div class="reception-detail-action-buttons">
          ${leadAction}
          ${workAction}
          <button type="button" class="btn btn-sm btn-secondary" data-reception-add-task="${esc(id)}">毎日やることに追加</button>
          ${revenueAction}
          <button type="button" class="btn btn-sm btn-secondary" data-reception-done="${esc(id)}">対応済みにする</button>
          <button type="button" class="btn btn-sm btn-secondary" data-reception-archive="${esc(id)}">保管</button>
          <button type="button" class="btn btn-sm btn-secondary" data-reception-edit="${esc(id)}">編集</button>
        </div>
      </details>`;
  }

  function renderReceptionActionBlock(intake, options) {
    const state = getReceptionWorkflowState(intake);
    const action = state && state.primaryAction;
    const hidePrimary = action === 'openWorkOrder' || action === 'createWorkOrder';
    return `
      <div class="reception-action-block">
        ${hidePrimary ? '' : renderReceptionPrimaryAction(intake.id, state, options)}
        ${hidePrimary ? '' : renderReceptionStateLabels(state)}
        ${renderReceptionDetailActions(intake, state)}
      </div>`;
  }

  function renderReceptionNextActions() {
    const el = document.getElementById('reception-next-actions');
    if (!el) return;
    const savedActions = ReceptionBrain.getNextActionsFromIntakes(Storage.getReceptionIntakes(), 5);
    const draft = getReceptionFormDraftIntake();
    const draftActions = draft ? ReceptionBrain.getNextActionsFromDraft(draft, 3) : [];
    const actions = savedActions.length ? savedActions : draftActions;
    if (!actions.length) {
      el.innerHTML = '<p class="placeholder-text reception-placeholder">次の一手はありません。AI番頭の結果を貼り付けてフォームに反映してください。</p>';
      return;
    }
    const draftBanner = savedActions.length === 0 && draft
      ? '<p class="reception-next-draft-note">入力中の受付データからの提案です。保存すると一覧にも反映されます。</p>'
      : '';
    el.innerHTML = draftBanner + actions.map(a => {
      let mapHtml = '';
      const intake = a.intakeId
        ? Storage.getReceptionIntakes().find(i => i.id === a.intakeId)
        : (a.isDraft ? draft : null);
      if (intake) {
        const area = MapBrain.getIntakeArea(intake);
        mapHtml = renderMapActionsHtml(intake.address, { area, showNoAddress: true });
      }
      const openBtn = a.intakeId
        ? `<button type="button" class="btn btn-sm btn-secondary" data-reception-open="${esc(a.intakeId)}">受付を開く</button>`
        : '';
      return `
      <div class="reception-next-item">
        <strong class="reception-next-title">${esc(a.title)}</strong>
        <p class="reception-next-meta">${esc(a.reason)}</p>
        <div class="reception-next-actions">
          ${mapHtml}
          ${openBtn}
        </div>
      </div>`;
    }).join('');
    bindMapActionEvents(el);
    el.querySelectorAll('[data-reception-open]').forEach(btn => {
      btn.addEventListener('click', () => {
        const intake = Storage.getReceptionIntakes().find(i => i.id === btn.dataset.receptionOpen);
        if (intake) setReceptionFormData(intake);
        scrollToElement('#reception-form');
      });
    });
  }

  function renderReceptionNextActionsV484() {
    const el = document.getElementById('reception-next-actions');
    if (!el) return;
    const savedActions = ReceptionBrain.getNextActionsFromIntakes(Storage.getReceptionIntakes(), 5);
    const draft = getReceptionFormDraftIntake();
    const draftActions = draft ? ReceptionBrain.getNextActionsFromDraft(draft, 3) : [];
    const actions = savedActions.length ? savedActions : draftActions;
    if (!actions.length) {
      el.innerHTML = '<p class="placeholder-text reception-placeholder">次の一手はありません。AI番頭の結果を貼り付けてフォームに反映してください。</p>';
      return;
    }
    const draftBanner = savedActions.length === 0 && draft
      ? '<p class="reception-next-draft-note">入力中の受付データからの提案です。保存すると一覧にも反映されます。</p>'
      : '';
    el.innerHTML = draftBanner + actions.map(a => {
      let mapHtml = '';
      const intake = a.intakeId
        ? Storage.getReceptionIntakes().find(i => i.id === a.intakeId)
        : (a.isDraft ? draft : null);
      if (intake) {
        const area = MapBrain.getIntakeArea(intake);
        mapHtml = renderMapActionsHtml(intake.address, { area, showNoAddress: true });
      }
      const primaryAction = a.intakeId && intake
        ? renderReceptionPrimaryAction(a.intakeId, getReceptionWorkflowState(intake), { compact: true })
        : '<button type="button" class="btn btn-sm btn-primary" data-reception-save-draft>受付を保存</button>';
      const openBtn = a.intakeId
        ? `<button type="button" class="btn btn-sm btn-secondary" data-reception-open="${esc(a.intakeId)}">受付を開く</button>`
        : '';
      return `
      <div class="reception-next-item">
        <strong class="reception-next-title">${esc(a.title)}</strong>
        <p class="reception-next-meta">${esc(a.reason)}</p>
        <div class="reception-next-actions">
          ${primaryAction}
          ${mapHtml}
          ${openBtn}
        </div>
        ${a.intakeId && intake ? renderReceptionStateLabels(getReceptionWorkflowState(intake)) : ''}
      </div>`;
    }).join('');
    bindMapActionEvents(el);
    bindReceptionListEvents(el);
    el.querySelectorAll('[data-reception-save-draft]').forEach(btn => {
      btn.addEventListener('click', () => {
        const saved = saveReceptionFromForm();
        if (!saved) return;
        clearReceptionDraftInputs({ renderNext: false });
        renderReceptionView();
        renderDashboard();
        alert('受付データを保存しました。');
      });
    });
    bindReceptionOpenButtons(el);
  }

  function renderReceptionSavedList() {
    const el = document.getElementById('reception-saved-list');
    if (!el) return;
    const intakes = Storage.getReceptionIntakes();
    const leads = Storage.getLeads();
    if (!intakes.length) {
      el.innerHTML = '<p class="placeholder-text">保存済み受付はありません。</p>';
      return;
    }
    el.innerHTML = intakes.map(intake => {
      const lead = intake.relatedLeadId ? leads.find(l => l.id === intake.relatedLeadId) : null;
      const leadLabel = lead ? lead.company : (intake.relatedLeadId ? '（削除済み）' : '—');
      const revLabel = intake.relatedRevenueId ? 'あり' : (intake.status === 'revenue_candidate' ? '候補' : '—');
      const area = MapBrain.getIntakeArea(intake);
      const addr = (intake.address || '').trim();
      const workflow = getReceptionWorkflowState(intake);
      const hasWorkOrder = workflow.hasWorkOrder;
      const handling = (intake.handlingStatus || intake.handling || '—').trim() || '—';
      const serviceSummary = (intake.serviceText || '—').slice(0, 48) + ((intake.serviceText || '').length > 48 ? '…' : '');
      return `
      <div class="reception-saved-item reception-saved-item-compact" data-intake-id="${esc(intake.id)}">
        <div class="reception-saved-header">
          <span class="reception-saved-date">${esc(formatReceptionDate(intake.createdAt))}</span>
          <span class="reception-status-badge reception-status-${esc(intake.status)}">${esc(formatReceptionStatus(intake.status))}</span>
          ${hasWorkOrder ? '<span class="reception-work-order-badge">作業予定あり</span>' : ''}
        </div>
        <p class="reception-saved-title"><strong>${esc(intake.customerName || '（名前なし）')}</strong></p>
        <p class="reception-saved-meta reception-saved-summary">${esc(serviceSummary)} / 対応：${esc(handling)}</p>
        <details class="reception-item-details">
          <summary>詳細を見る</summary>
          <p class="reception-saved-meta">依頼元：${esc(intake.source || '—')}</p>
          <p class="reception-saved-meta">電話：${esc(intake.phone || '—')}</p>
          <p class="reception-saved-meta">住所：${esc(addr || '—')}</p>
          <p class="reception-saved-meta">エリア：${esc(area)} ${renderAreaDistanceBadge(area, addr)}</p>
          <p class="reception-saved-meta">希望日：${esc(intake.preferredDatesText || '—')}</p>
          <p class="reception-saved-meta">概算金額：${intake.estimateAmount ? esc(RevenueBrain.formatYen(intake.estimateAmount)) : '—'}</p>
          ${intake.memo ? `<p class="reception-saved-meta reception-saved-memo">受付メモ：${esc(intake.memo)}</p>` : ''}
          <p class="reception-saved-meta">関連営業先：${esc(leadLabel)} / 売上：${esc(revLabel)}</p>
          <p class="reception-calendar-note">日程確定後はGoogleカレンダーに登録し、予定取り込みから読み込んでください。</p>
          <div class="reception-saved-map">${renderMapActionsHtml(addr, { area, showNoAddress: true })}</div>
        </details>
        ${renderReceptionActionBlock(intake)}
        <div class="reception-saved-actions reception-legacy-actions hidden">
          <button type="button" class="btn btn-sm btn-primary" data-reception-create-lead="${esc(intake.id)}">営業先を作成</button>
          <button type="button" class="btn btn-sm btn-secondary" data-reception-create-work-order="${esc(intake.id)}">この受付から作業予定を作る</button>
          <button type="button" class="btn btn-sm btn-secondary" data-reception-add-task="${esc(intake.id)}">毎日やることに追加</button>
          <button type="button" class="btn btn-sm btn-secondary" data-reception-fill-revenue="${esc(intake.id)}">売上フォームに反映</button>
          <button type="button" class="btn btn-sm btn-secondary" data-reception-revenue-candidate="${esc(intake.id)}">売上候補にする</button>
          <button type="button" class="btn btn-sm btn-secondary" data-reception-done="${esc(intake.id)}">対応済みにする</button>
          <button type="button" class="btn btn-sm btn-secondary" data-reception-archive="${esc(intake.id)}">保管</button>
          <button type="button" class="btn btn-sm btn-secondary" data-reception-edit="${esc(intake.id)}">編集</button>
        </div>
      </div>`;
    }).join('');
    bindReceptionListEvents(el);
  }

  function bindReceptionListEvents(container) {
    if (!container) return;
    bindMapActionEvents(container);
    bindReceptionOpenButtons(container);
    container.querySelectorAll('[data-reception-main-case]').forEach(btn => {
      btn.addEventListener('click', () => advanceReceptionIntake(btn.dataset.receptionMainCase));
    });
    container.querySelectorAll('[data-reception-open-work-order]').forEach(btn => {
      btn.addEventListener('click', () => openWorkOrderFromReceptionIntake(btn.dataset.receptionOpenWorkOrder));
    });
    container.querySelectorAll('[data-reception-open-revenue]').forEach(btn => {
      btn.addEventListener('click', () => openRevenueFromReceptionIntake(btn.dataset.receptionOpenRevenue));
    });
    container.querySelectorAll('[data-reception-open-lead]').forEach(btn => {
      btn.addEventListener('click', () => openLeadFromReceptionIntake(btn.dataset.receptionOpenLead));
    });
    container.querySelectorAll('[data-reception-create-lead]').forEach(btn => {
      btn.addEventListener('click', () => createLeadFromReceptionIntake(btn.dataset.receptionCreateLead));
    });
    container.querySelectorAll('[data-reception-create-work-order]').forEach(btn => {
      btn.addEventListener('click', () => createWorkOrderFromIntake(btn.dataset.receptionCreateWorkOrder));
    });
    container.querySelectorAll('[data-reception-add-task]').forEach(btn => {
      btn.addEventListener('click', () => addTaskFromReceptionIntake(btn.dataset.receptionAddTask));
    });
    container.querySelectorAll('[data-reception-fill-revenue]').forEach(btn => {
      btn.addEventListener('click', () => openRevenueFromReceptionIntake(btn.dataset.receptionFillRevenue));
    });
    container.querySelectorAll('[data-reception-revenue-candidate]').forEach(btn => {
      btn.addEventListener('click', () => markReceptionRevenueCandidate(btn.dataset.receptionRevenueCandidate));
    });
    container.querySelectorAll('[data-reception-done]').forEach(btn => {
      btn.addEventListener('click', () => updateReceptionIntakeStatus(btn.dataset.receptionDone, 'done'));
    });
    container.querySelectorAll('[data-reception-archive]').forEach(btn => {
      btn.addEventListener('click', () => updateReceptionIntakeStatus(btn.dataset.receptionArchive, 'archived'));
    });
    container.querySelectorAll('[data-reception-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const intake = Storage.getReceptionIntakes().find(i => i.id === btn.dataset.receptionEdit);
        if (intake) {
          setReceptionFormData(intake);
          scrollToElement('#reception-form');
        }
      });
    });
  }

  function bindReceptionOpenButtons(container) {
    if (!container) return;
    container.querySelectorAll('[data-reception-open]').forEach(btn => {
      if (btn.dataset.receptionOpenBound === '1') return;
      btn.dataset.receptionOpenBound = '1';
      btn.addEventListener('click', () => {
        const intake = Storage.getReceptionIntakes().find(i => i.id === btn.dataset.receptionOpen);
        if (intake) setReceptionFormData(intake);
        navigateToView('calendar-registration');
        setTimeout(() => scrollToElement('#reception-form'), 120);
      });
    });
  }

  function getWorkOrderReceptionId(workOrder) {
    const wo = WorkOrderBrain.normalizeWorkOrder(workOrder);
    return wo.intakeId || wo.receptionIntakeId || wo.sourceIntakeId || '';
  }

  function getRevenueReceptionId(revenue) {
    const r = revenue || {};
    return String(r.intakeId || r.receptionIntakeId || r.sourceIntakeId || '').trim();
  }

  function getReceptionLinkedRevenue(intakeId) {
    const id = String(intakeId || '').trim();
    if (!id) return null;
    const intake = Storage.getReceptionIntakes().find(i => i.id === id);
    const revenues = Storage.getRevenueRecords();
    if (intake && intake.relatedRevenueId) {
      const linked = revenues.find(r => r.id === intake.relatedRevenueId);
      if (linked) return linked;
    }
    return revenues.find(r => getRevenueReceptionId(r) === id) || null;
  }

  function linkReceptionToWorkOrder(intakeId, workOrderId) {
    const intake = Storage.getReceptionIntakes().find(i => i.id === intakeId);
    if (!intake || !workOrderId) return null;
    const ids = Array.isArray(intake.relatedWorkOrderIds) ? [...intake.relatedWorkOrderIds] : [];
    if (!ids.includes(workOrderId)) ids.push(workOrderId);
    const nextStatus = ['new', 'lead_created', 'task_created'].includes(intake.status)
      ? 'work_scheduled'
      : intake.status;
    return Storage.updateReceptionIntake(intakeId, {
      relatedWorkOrderId: workOrderId,
      relatedWorkOrderIds: ids,
      status: nextStatus
    });
  }

  function linkReceptionToRevenue(intakeId, revenueId, workOrderId) {
    const intake = Storage.getReceptionIntakes().find(i => i.id === intakeId);
    if (!intake || !revenueId) return null;
    const patch = {
      relatedRevenueId: revenueId,
      status: intake.status === 'archived' ? intake.status : 'done'
    };
    if (workOrderId) {
      const ids = Array.isArray(intake.relatedWorkOrderIds) ? [...intake.relatedWorkOrderIds] : [];
      if (!ids.includes(workOrderId)) ids.push(workOrderId);
      patch.relatedWorkOrderId = workOrderId;
      patch.relatedWorkOrderIds = ids;
    }
    return Storage.updateReceptionIntake(intakeId, patch);
  }

  function advanceReceptionIntake(intakeId) {
    const intake = Storage.getReceptionIntakes().find(i => i.id === intakeId);
    if (!intake) return;
    const state = getReceptionWorkflowState(intake);
    if (state.hasLead && !state.hasWorkOrder) {
      createWorkOrderFromIntake(intakeId);
      return;
    }
    if (!state.hasLead) {
      createLeadFromReceptionIntake(intakeId);
      return;
    }
    createWorkOrderFromIntake(intakeId);
  }

  function openLeadFromReceptionIntake(intakeId) {
    const intake = Storage.getReceptionIntakes().find(i => i.id === intakeId);
    if (!intake) return;
    const state = getReceptionWorkflowState(intake);
    if (state.lead) {
      openSalesDetail(state.lead.id, { navigate: true });
      return;
    }
    createLeadFromReceptionIntake(intakeId);
  }

  function openWorkOrderFromReceptionIntake(intakeId) {
    const intake = Storage.getReceptionIntakes().find(i => i.id === intakeId);
    if (!intake) return;
    const state = getReceptionWorkflowState(intake);
    if (!state.workOrder) {
      createWorkOrderFromIntake(intakeId);
      return;
    }
    navigateToView('calendar-registration');
    setTimeout(() => scrollToElement('#work-order-form'), 120);
    setWorkOrderFormData(state.workOrder);
    setTimeout(() => scrollToElement('#work-order-form'), 120);
  }

  function openRevenueFromReceptionIntake(intakeId) {
    const intake = Storage.getReceptionIntakes().find(i => i.id === intakeId);
    if (!intake) return;
    const state = getReceptionWorkflowState(intake);
    if (state.revenue) {
      navigateToView('revenue');
      openRevenueEdit(state.revenue.id);
      return;
    }
    if (state.workOrder) {
      fillRevenueFromWorkOrder(state.workOrder.id);
      return;
    }
    fillRevenueFromReceptionIntake(intakeId);
  }

  function updateReceptionIntakeStatus(intakeId, status) {
    Storage.updateReceptionIntake(intakeId, { status });
    renderReceptionView();
    renderDashboard();
  }

  function createLeadFromReceptionIntake(intakeId) {
    const intake = Storage.getReceptionIntakes().find(i => i.id === intakeId);
    if (!intake) return;
    if (intake.relatedLeadId && Storage.getLeads().some(l => l.id === intake.relatedLeadId)) {
      alert('すでに営業先が作成済みです。');
      return;
    }
    const today = TODAY();
    const leadPayload = ReceptionBrain.createLeadFromIntake(intake, today);
    const lead = Storage.addLead(leadPayload);
    const normalized = SalesBrain.normalizeLead(lead);
    const pri = SalesBrain.computeSalesPriority(normalized, today);
    Storage.updateLead(lead.id, {
      priorityScore: pri.score,
      priorityReason: pri.reasons.join('、')
    });
    Storage.addLeadActivityLog(lead.id, {
      type: 'contact',
      date: today,
      title: '受付データから作成',
      memo: ReceptionBrain.buildActivityLogText(intake),
      targetName: intake.customerName || ''
    });
    const nextStatus = intake.status === 'new' ? 'lead_created' : intake.status;
    Storage.updateReceptionIntake(intakeId, { relatedLeadId: lead.id, status: nextStatus });
    renderReceptionView();
    renderLeadsTable();
    renderDashboard();
    alert(`営業先「${lead.company}」を作成しました。`);
  }

  function addTaskFromReceptionIntake(intakeId, variantIndex) {
    const intake = Storage.getReceptionIntakes().find(i => i.id === intakeId);
    if (!intake) return;
    const today = TODAY();
    const taskPayload = ReceptionBrain.createTaskFromIntake(intake, today, variantIndex);
    if (!taskPayload) return;
    const store = Storage.getDailyActionTasksData();
    if (store.manualTasks.some(t => t.pickupDedupeKey === taskPayload.pickupDedupeKey)) {
      alert('同じ毎日やることはすでに追加済みです。');
      return;
    }
    const task = Storage.addManualDailyTask(taskPayload);
    const relatedTaskIds = Array.isArray(intake.relatedTaskIds) ? [...intake.relatedTaskIds] : [];
    if (task && task.id && !relatedTaskIds.includes(task.id)) relatedTaskIds.push(task.id);
    const nextStatus = ['new', 'lead_created'].includes(intake.status) ? 'task_created' : intake.status;
    Storage.updateReceptionIntake(intakeId, { relatedTaskIds, status: nextStatus });
    if (intake.relatedLeadId) {
      Storage.addLeadActivityLog(intake.relatedLeadId, {
        type: 'task-created',
        date: today,
        title: task.title,
        memo: task.reason,
        taskId: task.id,
        targetName: intake.customerName || ''
      });
    }
    renderReceptionView();
    renderDailyActionTasks();
    renderExecutiveHome();
    renderMorningDailyTasksBrief();
    alert('毎日やることに追加しました。');
  }

  function fillRevenueFromReceptionIntake(intakeId) {
    const intake = Storage.getReceptionIntakes().find(i => i.id === intakeId);
    if (!intake) return;
    const candidate = ReceptionBrain.buildRevenueCandidate(intake);
    pendingRevenueIntakeId = intakeId;
    fillRevenueSelects();
    navigateToView('revenue');
    resetRevenueForm();
    document.getElementById('revenue-customer').value = candidate.customerName || '';
    const serviceEl = document.getElementById('revenue-service');
    const serviceVal = ReceptionBrain.matchRevenueService(candidate.service);
    if (serviceEl) serviceEl.value = serviceVal;
    const sourceEl = document.getElementById('revenue-source');
    const sourceVal = ReceptionBrain.matchRevenueSource(candidate.source);
    if (sourceEl) fillSourceSelectOptions(sourceEl, sourceVal);
    applyRevenueGrossMarginDefault({ force: true });
    document.getElementById('revenue-amount').value = candidate.amount || '';
    document.getElementById('revenue-memo').value = candidate.memo || '';
    document.getElementById('revenue-status').value = '予定';
    fillRevenueLeadSelect(candidate.leadId || '');
    toggleRevenueLeadOptions();
    setTimeout(() => scrollToElement('#revenue-form'), 120);
    alert('売上フォームに反映しました。内容を確認して保存してください。');
  }

  function markReceptionRevenueCandidate(intakeId) {
    Storage.updateReceptionIntake(intakeId, { status: 'revenue_candidate' });
    renderReceptionView();
    renderDashboard();
    alert('売上候補としてマークしました。売上フォームに反映して登録できます。');
  }

  function renderReceptionView() {
    try {
      safeRenderSection(null, () => renderReceptionTodaySummary(), '受付サマリー');
      const nextEl = document.getElementById('reception-next-actions');
      if (nextEl) nextEl.innerHTML = '';
      safeRenderSection('reception-saved-list', () => renderReceptionSavedList(), '受付一覧');
    } catch (err) {
      console.error('[Budil] render error: 受付番頭', err);
      const el = document.getElementById('reception-saved-list');
      if (el) {
        el.innerHTML = '<p class="section-render-error">このセクションの表示中にエラーが発生しました。バックアップ後、データ診断を実行してください。</p>';
      }
    }
  }

  function initReception() {
    const form = document.getElementById('reception-form');
    if (!form) return;
    fillSourceSelectOptions(document.getElementById('reception-source'), '', { blankLabel: '未選択' });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const saved = saveReceptionFromForm();
      if (!saved) return;
      clearReceptionDraftInputs({ renderNext: false });
      renderReceptionView();
      renderDashboard();
      alert('受付データを保存しました。');
    });
    const applyBtn = document.getElementById('btn-reception-apply-paste');
    if (applyBtn) applyBtn.addEventListener('click', applyReceptionPaste);
    const savePasteBtn = document.getElementById('btn-reception-save-paste');
    if (savePasteBtn) savePasteBtn.addEventListener('click', saveReceptionFromPaste);
    const clearBtn = document.getElementById('btn-reception-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      clearReceptionDraftInputs({ renderNext: false });
      renderReceptionNextActionsV484();
    });
    ['reception-customer', 'reception-phone', 'reception-address', 'reception-service', 'reception-dates', 'reception-memo', 'reception-source'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        if (id === 'reception-address') syncReceptionAreaFromAddress();
        renderReceptionNextActionsV484();
      });
      if (id === 'reception-source') {
        el.addEventListener('change', () => renderReceptionNextActionsV484());
      }
    });
    const areaEl = document.getElementById('reception-area');
    if (areaEl) {
      areaEl.addEventListener('change', () => {
        areaEl.dataset.manual = areaEl.value ? '1' : '';
        renderReceptionNextActionsV484();
      });
    }
  }

  function renderDemandPickup() {
    refreshKurokuroPrompt();
    try {
      safeRenderSection(null, () => renderPickupTodaySummary(), '需要番頭サマリー');
      safeRenderSection('pickup-decision-list', () => renderPickupDecisionSections(), '施策判断');
      safeRenderSection('pickup-performance-list', () => renderPickupPerformanceSections(), '施策成果');
      safeRenderSection(null, () => renderPickupInsightsSections(), '効果ふり返り');
      safeRenderSection(null, () => renderPickupMorningTop3(), '需要朝トップ3');
      safeRenderSection(null, () => renderPickupUsedToday(), '需要今日採用');
      safeRenderSection(null, () => renderPickupBulkPreview(), '一括取り込み');
      safeRenderSection(null, () => renderPickupContentPanel(), '文案パネル');
      safeRenderSection(null, () => renderPickupExecutionManagement(), '実行管理');
      safeRenderSection(null, () => renderPickupCandidates(), '候補');
      safeRenderSection('pickup-saved-list', () => renderPickupSavedList(), '保存済みリスト');
    } catch (err) {
      console.error('[Budil] render error: 需要番頭', err);
      const el = document.getElementById('pickup-saved-list');
      if (el) {
        el.innerHTML = '<p class="section-render-error">このセクションの表示中にエラーが発生しました。バックアップ後、データ診断を実行してください。</p>';
      }
    }
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
    if (promptEl) refreshKurokuroPrompt();

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
        copyText(DemandBrain.buildKurokuroMorningPrompt(Storage.getBusinessProfile()))
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
    fillAreaSelectOptions(document.getElementById('lead-area'), '');
    fillAreaSelectOptions(document.getElementById('reception-area'), '');
    fillAreaSelectOptions(document.getElementById('work-order-area'), '');
    ['lead-address', 'lead-region'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', debounce(syncLeadAreaFromAddress, 300));
    });
    const leadAreaEl = document.getElementById('lead-area');
    if (leadAreaEl) {
      leadAreaEl.addEventListener('change', () => {
        leadAreaEl.dataset.manual = leadAreaEl.value ? '1' : '';
        syncLeadAreaFromAddress();
      });
    }
    ['reception-address'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', debounce(syncReceptionAreaFromAddress, 300));
    });
    const receptionAreaEl = document.getElementById('reception-area');
    if (receptionAreaEl) {
      receptionAreaEl.addEventListener('change', () => {
        receptionAreaEl.dataset.manual = receptionAreaEl.value ? '1' : '';
        syncReceptionAreaFromAddress();
      });
    }

    document.getElementById('btn-add-lead').addEventListener('click', () => openLeadModal());
    document.getElementById('btn-lead-cancel').addEventListener('click', closeLeadModal);
    document.getElementById('lead-form').addEventListener('submit', handleLeadSubmit);
    document.getElementById('btn-close-sales-detail').addEventListener('click', closeSalesDetail);
    document.getElementById('btn-save-sales-mgmt').addEventListener('click', saveSalesMgmt);
    document.getElementById('btn-lead-add-revenue').addEventListener('click', () => {
      if (!currentMessageLeadId) return;
      openRevenueFormForLead(currentMessageLeadId);
    });
    const leadWoBtn = document.getElementById('btn-lead-create-work-order');
    if (leadWoBtn) {
      leadWoBtn.addEventListener('click', () => {
        if (currentMessageLeadId) createWorkOrderFromLead(currentMessageLeadId);
      });
    }

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
      const leadAddr = MapBrain.getLeadAddress(l);
      const leadArea = MapBrain.getLeadArea(l);
      const areaBadge = `<span class="area-label-badge area-label-compact">${esc(leadArea)}</span>`
        + renderAreaDistanceBadge(leadArea, leadAddr);
      const mapMini = leadAddr
        ? `<div class="lead-row-map">${renderMapActionsHtml(leadAddr, { area: leadArea, showNoAddress: false })}</div>`
        : '<span class="map-no-address label-muted">住所未入力</span>';
      return `
      <tr class="${overdue ? 'row-overdue' : ''}">
        <td><span class="sales-priority-label priority-${l.priorityLevel || 'low'}">${esc(l.priorityLabel || '低')}</span></td>
        <td>
          <button type="button" class="lead-company-link" data-open-lead="${esc(l.id)}">${esc(l.company)}</button>${wonBadge}
          <div class="lead-row-area">${areaBadge}</div>
          ${mapMini}
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
    bindMapActionEvents(tbody);
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
      const fields = ['company', 'region', 'address', 'area', 'industry', 'url', 'contact', 'email', 'phone',
        'contactForm', 'sns', 'service', 'priority', 'status', 'lastContact', 'nextContact', 'ngReason', 'memo'];
      fields.forEach(f => {
        const el = document.getElementById('lead-' + f.replace(/([A-Z])/g, '-$1').toLowerCase());
        if (el) el.value = item[f] || '';
      });
      const areaEl = document.getElementById('lead-area');
      if (areaEl) {
        fillAreaSelectOptions(areaEl, item.area || MapBrain.getLeadArea(item));
        areaEl.dataset.manual = item.area ? '1' : '';
      }
      syncLeadAreaFromAddress();
      if (item.area && areaEl) {
        areaEl.value = item.area;
        areaEl.dataset.manual = '1';
      }
      toggleNgReason();
    } else {
      document.getElementById('lead-modal-title').textContent = '営業先を追加';
      const hiddenPreset = document.getElementById('lead-sales-preset');
      if (hiddenPreset) hiddenPreset.value = currentSalesPreset;
      fillAreaSelectOptions(document.getElementById('lead-area'), '');
      applySalesPresetToLeadForm(currentSalesPreset);
      syncLeadAreaFromAddress();
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
      address: document.getElementById('lead-address').value,
      area: document.getElementById('lead-area').value
        || MapBrain.detectAreaFromAddress(getCombinedAddress(
          document.getElementById('lead-address').value,
          document.getElementById('lead-region').value
        )),
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

  function navigateToView(viewName, scrollSelector) {
    setNavActive(viewName);
    switchView(viewName);
    scrollNavTarget(scrollSelector);
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
    const leadAddr = MapBrain.getLeadAddress(lead);
    const leadArea = MapBrain.getLeadArea(lead);
    if (leadAddr) links.push('住所: ' + leadAddr);
    if (leadArea) links.push('エリア: ' + leadArea);
    if (lead.industry) links.push('業種: ' + lead.industry);
    document.getElementById('sales-detail-links').textContent = links.join(' ｜ ');

    const mapAreaEl = document.getElementById('sales-detail-map-area');
    if (mapAreaEl) {
      mapAreaEl.innerHTML = renderMapActionsHtml(leadAddr, { area: leadArea })
        + (leadArea ? renderAreaDistanceBadge(leadArea, leadAddr) : '');
      bindMapActionEvents(mapAreaEl);
    }

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

  function fillRevenuePaymentSelects() {
    const methodEl = document.getElementById('revenue-payment-method');
    const statusEl = document.getElementById('revenue-payment-status');
    if (methodEl && !methodEl.options.length) {
      methodEl.innerHTML = PaymentBrain.PAYMENT_METHODS
        .map(m => `<option value="${esc(m.value)}">${esc(m.label)}</option>`).join('');
    }
    if (statusEl && !statusEl.options.length) {
      statusEl.innerHTML = PaymentBrain.PAYMENT_STATUSES
        .map(s => `<option value="${esc(s.value)}">${esc(s.label)}</option>`).join('');
    }
  }

  function fillDocumentPaymentSelects() {
    const methodEl = document.getElementById('doc-payment-method');
    const statusEl = document.getElementById('doc-payment-status');
    if (methodEl && !methodEl.options.length) {
      methodEl.innerHTML = PaymentBrain.PAYMENT_METHODS
        .map(m => `<option value="${esc(m.value)}">${esc(m.label)}</option>`).join('');
    }
    if (statusEl && !statusEl.options.length) {
      statusEl.innerHTML = PaymentBrain.PAYMENT_STATUSES
        .map(s => `<option value="${esc(s.value)}">${esc(s.label)}</option>`).join('');
    }
  }

  function readRevenuePaymentFieldsFromForm() {
    return {
      paymentMethod: document.getElementById('revenue-payment-method')?.value || 'cash',
      paymentStatus: document.getElementById('revenue-payment-status')?.value || 'paid',
      expectedPaymentDate: document.getElementById('revenue-expected-payment-date')?.value || '',
      paidDate: document.getElementById('revenue-paid-date')?.value || '',
      paidAmount: Number(document.getElementById('revenue-paid-amount')?.value) || 0,
      unpaidAmount: Number(document.getElementById('revenue-unpaid-amount')?.value) || 0,
      paymentMemo: document.getElementById('revenue-payment-memo')?.value?.trim() || ''
    };
  }

  function writeRevenuePaymentFieldsToForm(record) {
    const r = RevenueBrain.normalizeRevenueRecord(record || {});
    fillRevenuePaymentSelects();
    const methodEl = document.getElementById('revenue-payment-method');
    const statusEl = document.getElementById('revenue-payment-status');
    if (methodEl) methodEl.value = r.paymentMethod || 'cash';
    if (statusEl) statusEl.value = r.paymentStatus || 'paid';
    const legacy = document.getElementById('revenue-payment');
    if (legacy) legacy.value = r.paymentStatus || 'paid';
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val != null && val !== '' ? val : '';
    };
    set('revenue-expected-payment-date', r.expectedPaymentDate);
    set('revenue-paid-date', r.paidDate);
    set('revenue-paid-amount', r.paidAmount);
    set('revenue-unpaid-amount', r.unpaidAmount);
    set('revenue-payment-memo', r.paymentMemo);
    updateRevenuePaymentRuleHint(r.paymentMethod);
  }

  function updateRevenuePaymentRuleHint(method) {
    const el = document.getElementById('revenue-payment-rule-hint');
    if (!el) return;
    el.textContent = PaymentBrain.getPaymentMethodRuleLabel(method || document.getElementById('revenue-payment-method')?.value || 'cash');
  }

  function suggestRevenuePaymentFromMethod(preserveUserInput, forceStatusDefault) {
    const amount = Number(document.getElementById('revenue-amount')?.value) || 0;
    const workDate = document.getElementById('revenue-work-date')?.value || TODAY();
    const method = document.getElementById('revenue-payment-method')?.value || 'cash';
    const current = preserveUserInput ? readRevenuePaymentFieldsFromForm() : {};
    const next = PaymentBrain.applyMethodChange(current, method, amount, workDate, {
      forceStatusDefault: forceStatusDefault === true,
      forceExpectedDate: true
    });
    writeRevenuePaymentFieldsToForm({ ...current, ...next, amount, workDate });
  }

  function recalculateRevenueExpectedPaymentDate() {
    const amount = Number(document.getElementById('revenue-amount')?.value) || 0;
    const workDate = document.getElementById('revenue-work-date')?.value || TODAY();
    const method = document.getElementById('revenue-payment-method')?.value || 'cash';
    const current = readRevenuePaymentFieldsFromForm();
    const next = PaymentBrain.applyMethodChange(current, method, amount, workDate, {
      forceStatusDefault: false,
      forceExpectedDate: true
    });
    writeRevenuePaymentFieldsToForm({ ...current, ...next, amount, workDate });
  }

  function applyRevenuePaymentStatusDefaults() {
    const amount = Number(document.getElementById('revenue-amount')?.value) || 0;
    const workDate = document.getElementById('revenue-work-date')?.value || TODAY();
    const current = readRevenuePaymentFieldsFromForm();
    const next = PaymentBrain.applyPaymentStatusDefaults(current, amount, workDate);
    writeRevenuePaymentFieldsToForm({ ...current, ...next, amount, workDate });
  }

  function readDocumentPaymentFieldsFromForm() {
    return {
      paymentMethod: document.getElementById('doc-payment-method')?.value || 'bank_transfer',
      paymentStatus: document.getElementById('doc-payment-status')?.value || 'pending',
      expectedPaymentDate: document.getElementById('doc-expected-payment-date')?.value || '',
      paidDate: document.getElementById('doc-paid-date')?.value || '',
      paidAmount: Number(document.getElementById('doc-paid-amount')?.value) || 0,
      unpaidAmount: Number(document.getElementById('doc-unpaid-amount')?.value) || 0,
      paymentMemo: document.getElementById('doc-payment-memo')?.value?.trim() || ''
    };
  }

  function writeDocumentPaymentFieldsToForm(doc) {
    const d = DocumentsBrain.normalizeDocument(doc || {});
    fillDocumentPaymentSelects();
    const methodEl = document.getElementById('doc-payment-method');
    const statusEl = document.getElementById('doc-payment-status');
    if (methodEl) methodEl.value = d.paymentMethod || 'bank_transfer';
    if (statusEl) statusEl.value = d.paymentStatus || 'pending';
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val != null && val !== '' ? val : '';
    };
    set('doc-expected-payment-date', d.expectedPaymentDate);
    set('doc-paid-date', d.paidDate);
    set('doc-paid-amount', d.paidAmount);
    set('doc-unpaid-amount', d.unpaidAmount);
    set('doc-payment-memo', d.paymentMemo);
    updateDocPaymentStatusDisplay(d);
    updateDocumentPaymentRuleHint(d.paymentMethod);
    toggleDocPaymentFields(d.type);
  }

  function updateDocumentPaymentRuleHint(method) {
    const el = document.getElementById('doc-payment-rule-hint');
    if (!el) return;
    el.textContent = PaymentBrain.getPaymentMethodRuleLabel(method || document.getElementById('doc-payment-method')?.value || 'bank_transfer');
  }

  function updateDocPaymentStatusDisplay(doc) {
    const el = document.getElementById('doc-payment-status-display');
    if (!el) return;
    const d = DocumentsBrain.normalizeDocument(doc || {});
    if (d.type !== 'invoice') {
      el.textContent = '';
      return;
    }
    const display = PaymentBrain.getCombinedStatusDisplay(d);
    el.textContent = display.combined;
  }

  function toggleDocPaymentFields(type) {
    const show = type === 'invoice';
    document.querySelectorAll('.doc-invoice-payment-row, .doc-payment-details, #doc-payment-status-display')
      .forEach(node => {
        if (node) node.classList.toggle('hidden', !show);
      });
  }

  function suggestDocumentPaymentFromMethod(preserveUserInput, forceStatusDefault) {
    const items = readDocItemsFromForm();
    const taxSettings = readTaxSettingsFromForm();
    const calc = DocumentsBrain.calcFromItems(items, taxSettings);
    const issueDate = document.getElementById('doc-issue-date')?.value || TODAY();
    const method = document.getElementById('doc-payment-method')?.value || 'bank_transfer';
    const current = preserveUserInput ? readDocumentPaymentFieldsFromForm() : {};
    const next = PaymentBrain.applyMethodChange(current, method, calc.total, issueDate, {
      forceStatusDefault: forceStatusDefault === true,
      forceExpectedDate: true
    });
    writeDocumentPaymentFieldsToForm({ ...collectDocumentFormData(), ...current, ...next, total: calc.total, issueDate });
  }

  function recalculateDocumentExpectedPaymentDate() {
    const items = readDocItemsFromForm();
    const taxSettings = readTaxSettingsFromForm();
    const calc = DocumentsBrain.calcFromItems(items, taxSettings);
    const issueDate = document.getElementById('doc-issue-date')?.value || TODAY();
    const method = document.getElementById('doc-payment-method')?.value || 'bank_transfer';
    const current = readDocumentPaymentFieldsFromForm();
    const next = PaymentBrain.applyMethodChange(current, method, calc.total, issueDate, {
      forceStatusDefault: false,
      forceExpectedDate: true
    });
    writeDocumentPaymentFieldsToForm({ ...collectDocumentFormData(), ...current, ...next, total: calc.total, issueDate });
  }

  function applyDocumentPaymentStatusDefaults() {
    const items = readDocItemsFromForm();
    const taxSettings = readTaxSettingsFromForm();
    const calc = DocumentsBrain.calcFromItems(items, taxSettings);
    const issueDate = document.getElementById('doc-issue-date')?.value || TODAY();
    const current = readDocumentPaymentFieldsFromForm();
    const next = PaymentBrain.applyPaymentStatusDefaults(current, calc.total, issueDate);
    writeDocumentPaymentFieldsToForm({ ...collectDocumentFormData(), ...current, ...next, total: calc.total, issueDate });
    updateDocPaymentStatusDisplay(collectDocumentFormData());
  }

  function normalizeRevenueFormPayment(data) {
    const amount = Number(data.amount) || 0;
    const payment = PaymentBrain.normalizeRevenuePayment({
      ...data,
      paymentMethod: data.paymentMethod,
      paymentStatus: data.paymentStatus,
      expectedPaymentDate: data.expectedPaymentDate,
      paidDate: data.paidDate,
      paidAmount: data.paidAmount,
      unpaidAmount: data.unpaidAmount,
      paymentMemo: data.paymentMemo,
      linkedDocumentId: data.linkedDocumentId || pendingLinkedDocumentId || ''
    }, { total: amount, defaultDate: data.workDate });
    Object.assign(payment, PaymentBrain.applyPaymentStatusDefaults(payment, amount, payment.paidDate || data.workDate || TODAY()));
    return payment;
  }

  function markReceivablePaid(item) {
    if (!item || !item.primaryId) return;
    const today = TODAY();
    if (item.primaryKind === 'revenue') {
      const rev = Storage.getRevenueRecords().find(r => r.id === item.primaryId);
      if (!rev) return;
      const patch = PaymentBrain.buildPaidPatch(rev.amount, today);
      Storage.updateRevenueRecord(item.primaryId, patch);
      PaymentBrain.syncLinkedPayment({
        sourceType: 'revenue',
        sourceId: item.primaryId,
        paymentPatch: patch,
        storage: Storage
      });
    } else {
      const doc = Storage.getDocumentById(item.primaryId);
      if (!doc) return;
      const patch = PaymentBrain.buildPaidPatch(doc.total, today);
      Storage.updateDocument(item.primaryId, patch);
      PaymentBrain.syncLinkedPayment({
        sourceType: 'document',
        sourceId: item.primaryId,
        paymentPatch: patch,
        storage: Storage
      });
    }
    renderReceivablesView();
    renderRevenueView();
    renderDocumentsView();
    renderDashboard();
    showAppToast('入金済みにしました');
  }

  function renderPaymentStatusBadge(record) {
    const status = PaymentBrain.migratePaymentStatus(record.paymentStatus, 'pending');
    const label = PaymentBrain.getPaymentStatusLabel(record);
    const concern = RevenueBrain.recordHasPaymentConcern(record)
      ? ' <span class="revenue-payment-concern-badge">入金注意</span>' : '';
    return `<span class="revenue-status-badge revenue-payment-${esc(status)}">${esc(label)}</span>${concern}`;
  }

  function renderPaymentMethodBadge(record) {
    const label = PaymentBrain.getPaymentMethodLabel(record);
    return `<span class="revenue-payment-method-badge">${esc(label)}</span>`;
  }

  const LINK_UNLINK_CONFIRM = 'リンクだけ解除します。売上・請求書データは削除されません。よろしいですか？';

  function renderReceivableBrokenLinkButtons(item) {
    if (!item.linkedBroken) return '';
    if (item.linkedBroken === 'document' && item.primaryKind === 'revenue') {
      return `
        <button type="button" class="btn btn-sm btn-secondary" data-unlink-revenue-link="${esc(item.primaryId)}">リンク解除</button>
        <button type="button" class="btn btn-sm btn-secondary" data-recreate-invoice-revenue="${esc(item.primaryId)}">請求書を再作成</button>`;
    }
    if (item.linkedBroken === 'revenue' && item.primaryKind === 'document') {
      return `
        <button type="button" class="btn btn-sm btn-secondary" data-unlink-document-link="${esc(item.primaryId)}">リンク解除</button>
        <button type="button" class="btn btn-sm btn-secondary" data-reflect-doc-revenue="${esc(item.primaryId)}">売上登録に反映</button>`;
    }
    return '';
  }

  function unlinkReceivableLink(item) {
    if (!item || !item.linkedBroken) return;
    if (!confirm(LINK_UNLINK_CONFIRM)) return;
    if (item.linkedBroken === 'document' && item.primaryKind === 'revenue') {
      PaymentBrain.unlinkRevenueDocument(item.primaryId, Storage);
    } else if (item.linkedBroken === 'revenue' && item.primaryKind === 'document') {
      PaymentBrain.unlinkDocumentRevenue(item.primaryId, Storage);
    } else {
      return;
    }
    renderReceivablesView();
    renderRevenueView();
    renderDocumentsView();
    renderDashboard();
    showAppToast('リンクを解除しました');
  }

  function recreateInvoiceFromBrokenLink(revenueId) {
    if (!revenueId) return;
    PaymentBrain.unlinkRevenueDocument(revenueId, Storage);
    createInvoiceFromRevenue(revenueId);
  }

  function reflectDocumentToRevenueForm(docId) {
    const doc = Storage.getDocumentById(docId);
    const linked = getDocumentLinkedRevenueState(doc);
    if (linked.state === 'linked') {
      navigateToView('revenue');
      openRevenueEdit(linked.rev.id);
      showAppToast('linked売上を開きました');
      return;
    }
    if (linked.state === 'missing') {
      alert('linked売上が見つかりません。入金予定一覧またはデータ診断からリンク解除してから売上登録に反映してください。');
      return;
    }
    const prefill = DocumentsBrain.toRevenuePrefill(doc);
    if (!prefill) return;
    navigateToView('revenue');
    resetRevenueForm();
    pendingLinkedDocumentId = docId;
    document.getElementById('revenue-work-date').value = prefill.workDate;
    document.getElementById('revenue-customer').value = prefill.customerName;
    const serviceEl = document.getElementById('revenue-service');
    if (serviceEl) {
      const exists = Array.from(serviceEl.options).some(o => o.value === prefill.service);
      if (!exists && prefill.service) {
        const opt = document.createElement('option');
        opt.value = prefill.service;
        opt.textContent = prefill.service;
        serviceEl.appendChild(opt);
      }
      serviceEl.value = prefill.service;
    }
    document.getElementById('revenue-amount').value = prefill.amount;
    document.getElementById('revenue-status').value = prefill.status;
    writeRevenuePaymentFieldsToForm(prefill);
    document.getElementById('revenue-memo').value = prefill.memo;
    document.getElementById('revenue-form-title').textContent = '売上明細を手入力（請求書から反映）';
    showAppToast('売上登録フォームに反映しました。保存すると請求書とリンクされます。');
    document.getElementById('revenue-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function reflectBrokenDocumentToRevenue(docId) {
    if (!docId) return;
    PaymentBrain.unlinkDocumentRevenue(docId, Storage);
    reflectDocumentToRevenueForm(docId);
  }

  function renderReceivableActionButtons(item) {
    const buttons = [];
    buttons.push(`<button type="button" class="btn btn-sm btn-primary" data-mark-paid="${esc(item.primaryKind)}:${esc(item.primaryId)}">入金済み</button>`);
    buttons.push(`<button type="button" class="btn btn-sm btn-secondary" data-receivable-detail="${esc(item.primaryKind)}:${esc(item.primaryId)}">詳細</button>`);
    if (item.linkedBroken) {
      buttons.push(renderReceivableBrokenLinkButtons(item));
    } else {
      if (item.document && item.document.id) {
        buttons.push(`<button type="button" class="btn btn-sm btn-secondary" data-open-document="${esc(item.document.id)}">請求書を開く</button>`);
      } else if (item.primaryKind === 'document' && item.primaryId) {
        buttons.push(`<button type="button" class="btn btn-sm btn-secondary" data-open-document="${esc(item.primaryId)}">請求書を開く</button>`);
      }
      if (item.revenue && item.revenue.id) {
        buttons.push(`<button type="button" class="btn btn-sm btn-secondary" data-open-revenue="${esc(item.revenue.id)}">売上を開く</button>`);
      } else if (item.primaryKind === 'revenue' && item.primaryId) {
        buttons.push(`<button type="button" class="btn btn-sm btn-secondary" data-open-revenue="${esc(item.primaryId)}">売上を開く</button>`);
      }
    }
    return `<div class="receivables-card-actions">${buttons.join('')}</div>`;
  }

  function bindReceivableListActions(items) {
    document.querySelectorAll('[data-mark-paid]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [kind, id] = (btn.dataset.markPaid || '').split(':');
        const hit = items.find(i => i.primaryKind === kind && i.primaryId === id);
        if (hit) markReceivablePaid(hit);
      });
    });
    document.querySelectorAll('[data-receivable-detail]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [kind, id] = (btn.dataset.receivableDetail || '').split(':');
        const hit = items.find(i => i.primaryKind === kind && i.primaryId === id);
        if (!hit) return;
        if (kind === 'document') {
          navigateToView('documents');
          openDocumentPreview(id);
        } else {
          navigateToView('revenue');
          openRevenueEdit(id);
        }
      });
    });
    document.querySelectorAll('[data-open-document]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.openDocument;
        if (!id) return;
        navigateToView('documents');
        openDocumentPreview(id);
      });
    });
    document.querySelectorAll('[data-open-revenue]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.openRevenue;
        if (!id) return;
        navigateToView('revenue');
        openRevenueEdit(id);
      });
    });
    document.querySelectorAll('[data-unlink-revenue-link]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.unlinkRevenueLink;
        const hit = items.find(i => i.linkedBroken === 'document' && i.primaryKind === 'revenue' && i.primaryId === id);
        if (hit) unlinkReceivableLink(hit);
      });
    });
    document.querySelectorAll('[data-unlink-document-link]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.unlinkDocumentLink;
        const hit = items.find(i => i.linkedBroken === 'revenue' && i.primaryKind === 'document' && i.primaryId === id);
        if (hit) unlinkReceivableLink(hit);
      });
    });
    document.querySelectorAll('[data-recreate-invoice-revenue]').forEach(btn => {
      btn.addEventListener('click', () => recreateInvoiceFromBrokenLink(btn.dataset.recreateInvoiceRevenue));
    });
    document.querySelectorAll('[data-reflect-doc-revenue]').forEach(btn => {
      btn.addEventListener('click', () => reflectBrokenDocumentToRevenue(btn.dataset.reflectDocRevenue));
    });
  }

  function renderReceivablesView() {
    try {
      const today = TODAY();
      const summary = PaymentBrain.summarizeReceivables(
        Storage.getRevenueRecords(),
        Storage.getDocuments(),
        today
      );
      const summaryEl = document.getElementById('receivables-summary');
      if (summaryEl) {
        summaryEl.innerHTML = [
          { label: '入金待ち合計', value: PaymentBrain.formatYen(summary.pendingTotal), warn: false },
          { label: '今月入金予定', value: PaymentBrain.formatYen(summary.thisMonthExpected), warn: false },
          { label: '来月入金予定', value: PaymentBrain.formatYen(summary.nextMonthExpected), warn: false },
          { label: '入金遅れ', value: (summary.overdueCount || 0) + '件', warn: summary.overdueCount > 0 }
        ].map(item => `
          <div class="receivables-summary-item${item.warn ? ' warn' : ''}">
            <span>${esc(item.label)}</span>
            <strong>${esc(item.value)}</strong>
          </div>`).join('');
      }

      document.querySelectorAll('[data-receivables-filter]').forEach(btn => {
        btn.classList.toggle('active', (btn.dataset.receivablesFilter || 'all') === receivablesFilter);
      });

      const allItems = summary.items || [];
      const items = PaymentBrain.filterReceivables(allItems, receivablesFilter, today);

      const tbody = document.getElementById('receivables-tbody');
      const cardList = document.getElementById('receivables-card-list');

      if (!items.length) {
        const emptyMsg = allItems.length
          ? 'この条件に該当する入金予定はありません。'
          : '入金待ちの案件はありません。';
        const empty = `<tr><td colspan="9" class="empty-state">${esc(emptyMsg)}</td></tr>`;
        if (tbody) tbody.innerHTML = empty;
        if (cardList) cardList.innerHTML = `<p class="empty-state">${esc(emptyMsg)}</p>`;
        return;
      }

      const rowHtml = item => {
        const delay = PaymentBrain.getDelayLabel(item.expectedPaymentDate, today);
        const delayClass = PaymentBrain.isOverdue(item.record, today) ? 'receivable-overdue' : '';
        const breakLabel = PaymentBrain.getLinkedBreakLabel(item);
        const sourceLabel = PaymentBrain.getSourceDisplayLabel(item);
        return `
        <tr data-receivable-key="${esc(item.key)}">
          <td>${esc(item.counterparty)}</td>
          <td>${esc(item.subject)}</td>
          <td class="num">${esc(PaymentBrain.formatYen(item.unpaidAmount))}</td>
          <td>${esc(PaymentBrain.getPaymentMethodLabel(item.record))}</td>
          <td>${esc(item.expectedPaymentDate || '—')}</td>
          <td>${renderPaymentStatusBadge(item.record)}</td>
          <td class="${delayClass}">${esc(delay)}</td>
          <td>
            <span class="receivables-source-label">${esc(sourceLabel)}</span>
            ${breakLabel ? `<span class="receivables-linked-break">${esc(breakLabel)}</span>` : ''}
          </td>
          <td class="actions receivables-actions-cell">${renderReceivableActionButtons(item)}</td>
        </tr>`;
      };

      if (tbody) tbody.innerHTML = items.map(rowHtml).join('');

      if (cardList) {
        cardList.innerHTML = items.map(item => {
          const delay = PaymentBrain.getDelayLabel(item.expectedPaymentDate, today);
          const delayClass = PaymentBrain.isOverdue(item.record, today) ? 'receivable-overdue' : '';
          const breakLabel = PaymentBrain.getLinkedBreakLabel(item);
          return `
          <article class="receivables-card" data-receivable-key="${esc(item.key)}">
            <div class="receivables-card-head">
              <strong class="receivables-card-counterparty">${esc(item.counterparty)}</strong>
              <span class="receivables-card-amount">${esc(PaymentBrain.formatYen(item.unpaidAmount))}</span>
            </div>
            <p class="receivables-card-subject">${esc(item.subject)}</p>
            <div class="receivables-card-meta">
              <span>${esc(PaymentBrain.getPaymentMethodLabel(item.record))}</span>
              <span>入金予定：${esc(item.expectedPaymentDate || '—')}</span>
            </div>
            <p class="receivables-card-delay ${delayClass}">${esc(delay)}</p>
            <p class="receivables-card-status">${renderPaymentStatusBadge(item.record)}</p>
            <p class="receivables-card-source">${esc(PaymentBrain.getSourceDisplayLabel(item))}</p>
            ${breakLabel ? `<p class="receivables-linked-break">${esc(breakLabel)}</p>` : ''}
            ${renderReceivableActionButtons(item)}
          </article>`;
        }).join('');
      }

      bindReceivableListActions(items);
    } catch (err) {
      console.error('[Budil] render error: 入金予定', err);
      const tbody = document.getElementById('receivables-tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="section-render-error">表示中にエラーが発生しました。</td></tr>';
    }
  }

  function openRevenueFormForLead(leadId) {
    const lead = Storage.getLeads().find(l => l.id === leadId);
    if (!lead) return;
    navigateToView('revenue');
    fillRevenueSelects();
    fillRevenuePaymentSelects();
    document.getElementById('revenue-edit-id').value = '';
    document.getElementById('revenue-form-title').textContent = '売上明細を手入力';
    document.getElementById('btn-revenue-cancel').classList.add('hidden');
    document.getElementById('revenue-work-date').value = TODAY();
    document.getElementById('revenue-customer').value = lead.company || '';
    document.getElementById('revenue-service').value = matchRevenueService(lead.service);
    document.getElementById('revenue-source').value = RevenueBrain.SOURCES[0];
    applyRevenueGrossMarginDefault({ force: true });
    document.getElementById('revenue-amount').value = '';
    document.getElementById('revenue-status').value = '予定';
    writeRevenuePaymentFieldsToForm({ paymentMethod: 'cash', paymentStatus: 'paid', workDate: TODAY() });
    suggestRevenuePaymentFromMethod(false);
    document.getElementById('revenue-payment-concern').checked = false;
    document.getElementById('revenue-memo').value = '';
    pendingLinkedDocumentId = '';
    fillRevenueLeadSelect(leadId);
    document.getElementById('revenue-mark-won').checked = true;
    toggleRevenueLeadOptions();
    document.getElementById('revenue-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderRevenueLeadLinkHtml(record, leads) {
    return '';
  }

  function bindRevenueLeadListActions() {
    /* 売上と営業の紐づけUIは v4.10.4 で通常表示から外した */
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
    container.innerHTML = '';
  }

  function fillRevenueSelects() {
    const serviceEl = document.getElementById('revenue-service');
    const sourceEl = document.getElementById('revenue-source');
    if (serviceEl && !serviceEl.options.length) {
      serviceEl.innerHTML = RevenueBrain.SERVICES.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    }
    fillSourceSelectOptions(sourceEl);
  }

  function resetRevenueForm() {
    document.getElementById('revenue-edit-id').value = '';
    document.getElementById('revenue-form').reset();
    pendingRevenueWorkOrderId = '';
    pendingRevenueIntakeId = '';
    pendingLinkedDocumentId = '';
    document.getElementById('revenue-work-date').value = TODAY();
    document.getElementById('revenue-status').value = '予定';
    fillSourceSelectOptions(document.getElementById('revenue-source'), RevenueBrain.SOURCES[0]);
    fillRevenuePaymentSelects();
    const grossEl = document.getElementById('revenue-gross-margin-rate');
    if (grossEl) {
      grossEl.value = '';
      grossEl.dataset.manualGrossMarginRate = '';
      grossEl.dataset.autoGrossMarginRate = '';
    }
    applyRevenueGrossMarginDefault({ force: true });
    writeRevenuePaymentFieldsToForm({ paymentMethod: 'cash', paymentStatus: 'paid', workDate: TODAY() });
    suggestRevenuePaymentFromMethod(false);
    document.getElementById('revenue-payment-concern').checked = false;
    document.getElementById('revenue-mark-won').checked = false;
    fillRevenueLeadSelect('');
    toggleRevenueLeadOptions();
    toggleRevenueOpenLeadButton();
    document.getElementById('revenue-form-title').textContent = '売上明細を手入力';
    document.getElementById('btn-revenue-cancel').classList.add('hidden');
  }

  function openRevenueEdit(id) {
    const record = RevenueBrain.normalizeRevenueRecord(Storage.getRevenueRecords().find(r => r.id === id));
    if (!record) return;
    fillRevenueSelects();
    fillRevenuePaymentSelects();
    document.getElementById('revenue-edit-id').value = id;
    document.getElementById('revenue-work-date').value = record.workDate || '';
    document.getElementById('revenue-customer').value = record.customerName || '';
    document.getElementById('revenue-service').value = record.service || RevenueBrain.SERVICES[0];
    fillSourceSelectOptions(document.getElementById('revenue-source'), record.source || RevenueBrain.SOURCES[0]);
    document.getElementById('revenue-amount').value = record.amount || '';
    const grossEl = document.getElementById('revenue-gross-margin-rate');
    if (grossEl) {
      grossEl.value = record.grossMarginRate != null && record.grossMarginRate !== '' ? record.grossMarginRate : '';
      grossEl.dataset.manualGrossMarginRate = grossEl.value ? '1' : '';
      grossEl.dataset.autoGrossMarginRate = '';
    }
    document.getElementById('revenue-status').value = formatRevenueStatusLabel(record.status || '予定');
    writeRevenuePaymentFieldsToForm(record);
    document.getElementById('revenue-payment-concern').checked = record.paymentConcern === true;
    document.getElementById('revenue-memo').value = record.memo || '';
    pendingRevenueWorkOrderId = record.sourceWorkOrderId || record.workOrderId || '';
    pendingRevenueIntakeId = getRevenueReceptionId(record);
    pendingLinkedDocumentId = record.linkedDocumentId || '';
    fillRevenueLeadSelect(record.leadId || '');
    document.getElementById('revenue-mark-won').checked = false;
    toggleRevenueLeadOptions();
    document.getElementById('revenue-form-title').textContent = '売上編集';
    document.getElementById('btn-revenue-cancel').classList.remove('hidden');
    document.getElementById('revenue-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function getRevenueFormData() {
    const editId = document.getElementById('revenue-edit-id').value;
    const paymentFields = readRevenuePaymentFieldsFromForm();
    const grossMarginRateInput = String(document.getElementById('revenue-gross-margin-rate')?.value || '').trim();
    const data = {
      workDate: document.getElementById('revenue-work-date').value,
      customerName: document.getElementById('revenue-customer').value.trim(),
      service: document.getElementById('revenue-service').value,
      source: document.getElementById('revenue-source').value,
      amount: Number(document.getElementById('revenue-amount').value) || 0,
      grossMarginRate: grossMarginRateInput === '' ? '' : Number(grossMarginRateInput),
      status: RevenueBrain.normalizeRevenueStatusForSave(document.getElementById('revenue-status').value),
      paymentConcern: document.getElementById('revenue-payment-concern').checked,
      memo: document.getElementById('revenue-memo').value.trim(),
      ...paymentFields,
      linkedDocumentId: pendingLinkedDocumentId || ''
    };
    const normalizedPayment = normalizeRevenueFormPayment(data);
    Object.assign(data, normalizedPayment);
    if (editId) {
      const existing = Storage.getRevenueRecords().find(r => r.id === editId);
      if (existing && existing.leadId) {
        data.leadId = existing.leadId;
        data.leadName = existing.leadName || '';
      }
    }
    if (pendingRevenueWorkOrderId) data.sourceWorkOrderId = pendingRevenueWorkOrderId;
    if (pendingRevenueIntakeId) {
      data.intakeId = pendingRevenueIntakeId;
      data.receptionIntakeId = pendingRevenueIntakeId;
      data.sourceIntakeId = pendingRevenueIntakeId;
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

  function getRevenueLinkedDocumentState(revenue) {
    const linkedId = String(revenue && revenue.linkedDocumentId || '').trim();
    if (!linkedId) return { state: 'none' };
    const doc = Storage.getDocumentById(linkedId);
    if (!doc || doc.type !== 'invoice') return { state: 'missing', linkedId };
    return { state: 'linked', doc: DocumentsBrain.normalizeDocument(doc), linkedId };
  }

  function getDocumentLinkedRevenueState(doc) {
    const linkedId = String(doc && doc.linkedRevenueId || '').trim();
    if (!linkedId) return { state: 'none' };
    const rev = Storage.getRevenueRecords().find(r => r.id === linkedId);
    if (!rev) return { state: 'missing', linkedId };
    return { state: 'linked', rev: RevenueBrain.normalizeRevenueRecord(rev), linkedId };
  }

  function renderRevenueInvoiceAction(revenue) {
    const link = getRevenueLinkedDocumentState(revenue);
    if (link.state === 'linked') {
      return `
        <button type="button" class="btn btn-sm btn-secondary" data-open-linked-invoice="${esc(link.doc.id)}">請求書を開く</button>
        <span class="revenue-linked-badge">請求書 linked済み</span>`;
    }
    if (link.state === 'missing') {
      return `
        <span class="revenue-linked-missing">linked先の請求書が見つかりません</span>
        <button type="button" class="btn btn-sm btn-secondary" data-unlink-revenue-link="${esc(revenue.id)}">リンク解除</button>
        <button type="button" class="btn btn-sm btn-secondary" data-recreate-invoice-revenue="${esc(revenue.id)}">請求書を再作成</button>`;
    }
    return `<button type="button" class="btn btn-sm btn-primary" data-create-invoice-revenue="${esc(revenue.id)}" title="この売上データをもとに請求書を作成します。売上金額は変更されません。">請求書作成</button>`;
  }

  function updateDocFromRevenueNotice(revenue) {
    const notice = document.getElementById('doc-from-revenue-notice');
    const hint = document.getElementById('doc-from-revenue-hint');
    if (!notice) return;
    const rev = revenue || (pendingLinkedRevenueId
      ? Storage.getRevenueRecords().find(r => r.id === pendingLinkedRevenueId)
      : null);
    if (!rev || !pendingLinkedRevenueId) {
      notice.classList.add('hidden');
      hint?.classList.add('hidden');
      return;
    }
    const normalized = RevenueBrain.normalizeRevenueRecord(rev);
    notice.classList.remove('hidden');
    notice.innerHTML = `売上から作成中（${esc(normalized.customerName || '—')} / ${esc(RevenueBrain.formatYen(normalized.amount))}）：保存すると売上と請求書が linked されます。この売上データをもとに請求書を作成します。売上金額は変更されません。`;
    if (hint) {
      hint.classList.remove('hidden');
      hint.textContent = '売上金額を請求合計として初期反映しています。外税にしたい場合は税・端数設定を変更してください。';
    }
    updateDocFromRevenueAmountWarn();
  }

  function updateDocFromRevenueAmountWarn() {
    const warn = document.getElementById('doc-from-revenue-amount-warn');
    if (!warn) return;
    if (!pendingLinkedRevenueId) {
      warn.classList.add('hidden');
      return;
    }
    const rev = Storage.getRevenueRecords().find(r => r.id === pendingLinkedRevenueId);
    if (!rev) {
      warn.classList.add('hidden');
      return;
    }
    const revAmount = Number(rev.amount) || 0;
    const items = readDocItemsFromForm();
    const taxSettings = readTaxSettingsFromForm();
    const calc = DocumentsBrain.calcFromItems(items, taxSettings);
    if (calc.total !== revAmount) {
      warn.classList.remove('hidden');
      warn.textContent = `売上金額（${RevenueBrain.formatYen(revAmount)}）と請求合計（${DocumentsBrain.formatYen(calc.total)}）が異なります。`;
    } else {
      warn.classList.add('hidden');
    }
  }

  function createInvoiceFromRevenue(revenueId) {
    const revenue = Storage.getRevenueRecords().find(r => r.id === revenueId);
    if (!revenue) return;
    const normalized = RevenueBrain.normalizeRevenueRecord(revenue);
    const link = getRevenueLinkedDocumentState(normalized);
    if (link.state === 'linked') {
      openLinkedInvoiceFromRevenue(link.doc.id);
      return;
    }
    if (link.state === 'missing') {
      PaymentBrain.unlinkRevenueDocument(revenueId, Storage);
    }
    const draft = DocumentsBrain.buildInvoiceFromRevenue(normalized, Storage.getDocuments());
    if (!draft) {
      alert('請求書を作成できません。売上金額を確認してください。');
      return;
    }
    pendingLinkedRevenueId = revenueId;
    navigateToView('documents');
    openDocumentForm('invoice', draft, { fromRevenue: true });
    showAppToast('請求書フォームに売上データを反映しました。保存するとリンクされます。');
  }

  function openLinkedInvoiceFromRevenue(docId) {
    const doc = Storage.getDocumentById(docId);
    if (!doc) {
      alert('linked請求書が見つかりません。');
      return;
    }
    navigateToView('documents');
    openDocumentPreview(docId);
  }

  function bindRevenueInvoiceActions() {
    document.querySelectorAll('[data-create-invoice-revenue]').forEach(btn => {
      btn.addEventListener('click', () => createInvoiceFromRevenue(btn.dataset.createInvoiceRevenue));
    });
    document.querySelectorAll('[data-open-linked-invoice]').forEach(btn => {
      btn.addEventListener('click', () => openLinkedInvoiceFromRevenue(btn.dataset.openLinkedInvoice));
    });
    document.querySelectorAll('[data-unlink-revenue-link]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm(LINK_UNLINK_CONFIRM)) return;
        PaymentBrain.unlinkRevenueDocument(btn.dataset.unlinkRevenueLink, Storage);
        renderRevenueView();
        renderReceivablesView();
        renderDocumentsView();
        renderDashboard();
        showAppToast('リンクを解除しました');
      });
    });
    document.querySelectorAll('[data-recreate-invoice-revenue]').forEach(btn => {
      btn.addEventListener('click', () => recreateInvoiceFromBrokenLink(btn.dataset.recreateInvoiceRevenue));
    });
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
      tbody.innerHTML = records.map(r => {
        const area = MapBrain.getRevenueArea(r, leads);
        const fu = getRevenueFollowUpFromWorkOrder(r);
        const fuBadges = fu ? FollowUpBrain.formatFollowUpBadges(fu) : '';
        return `
        <tr>
          <td>${esc(r.workDate)}</td>
          <td>${esc(r.customerName)}${fuBadges ? `<div class="revenue-follow-up-badges">${fuBadges}</div>` : ''}</td>
          <td>${esc(r.service)}<br><small class="area-label-compact">${esc(area)}</small></td>
          <td>${esc(r.source)}</td>
          <td>${esc(RevenueBrain.formatYen(r.amount))}</td>
          <td>${formatRevenueStatusBadge(r.status)}</td>
          <td>${renderPaymentMethodBadge(r)}</td>
          <td>${renderPaymentStatusBadge(r)}</td>
          <td class="actions revenue-actions-cell">
            <div class="revenue-invoice-action">${renderRevenueInvoiceAction(r)}</div>
            ${renderRevenueRowActions(r.id)}
          </td>
        </tr>`;
      }).join('');
    }

    if (cardList) {
      cardList.innerHTML = records.map(r => {
        const area = MapBrain.getRevenueArea(r, leads);
        const fu = getRevenueFollowUpFromWorkOrder(r);
        const fuBadges = fu ? FollowUpBrain.formatFollowUpBadges(fu) : '';
        return `
        <div class="revenue-card">
          <div class="revenue-card-header">
            <strong>${esc(r.customerName)}</strong>
            <span class="revenue-card-amount">${esc(RevenueBrain.formatYen(r.amount))}</span>
          </div>
          ${fuBadges ? `<div class="revenue-follow-up-badges">${fuBadges}</div>` : ''}
          <p class="revenue-card-meta">${esc(r.workDate)} ｜ ${esc(r.service)} ｜ ${esc(r.source)} ｜ ${esc(area)}</p>
          <p class="revenue-card-meta">
            ${formatRevenueStatusBadge(r.status)}
            ${renderPaymentMethodBadge(r)}
            ${renderPaymentStatusBadge(r)}
          </p>
          ${r.memo ? `<p class="revenue-card-meta">${esc(r.memo)}</p>` : ''}
          <div class="revenue-card-invoice-action">${renderRevenueInvoiceAction(r)}</div>
          <div class="revenue-card-actions">${renderRevenueRowActions(r.id)}</div>
        </div>`;
      }).join('');
    }

    bindRevenueLeadListActions();
    bindRevenueInvoiceActions();

    document.querySelectorAll('[data-edit-revenue]').forEach(btn => {
      btn.addEventListener('click', () => openRevenueEdit(btn.dataset.editRevenue));
    });
    document.querySelectorAll('[data-delete-revenue]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('この売上記録を削除しますか？')) {
          Storage.deleteRevenueRecord(btn.dataset.deleteRevenue);
          renderRevenueView();
          renderReceivablesView();
          renderDocumentsView();
          renderDashboard();
        }
      });
    });
  }

  function renderRevenueAreaBrief() {
    const el = document.getElementById('revenue-area-brief');
    if (!el) return;
    const { leads, revenues } = getMapContext();
    const monthKey = RevenueBrain.currentMonthKey(TODAY());
    const monthRecords = revenues.filter(r => r.workDate && r.workDate.startsWith(monthKey) && r.status !== 'キャンセル');
    let unknownCount = 0;
    const byArea = {};
    monthRecords.forEach(r => {
      const area = MapBrain.getRevenueArea(r, leads);
      if (area === '不明') unknownCount++;
      if (!byArea[area]) byArea[area] = 0;
      byArea[area] += Number(r.amount) || 0;
    });
    const topAreas = Object.entries(byArea)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    if (!topAreas.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `
      <p class="revenue-area-brief-title">エリア別売上（今月）</p>
      <ul class="revenue-area-brief-list">${topAreas.map(([area, total]) =>
        `<li>${esc(area)}：${esc(RevenueBrain.formatYen(total))}</li>`
      ).join('')}</ul>
      ${unknownCount ? `<p class="revenue-area-brief-warn">エリア不明の売上：${unknownCount}件</p>` : ''}
      <button type="button" class="btn btn-sm btn-secondary" id="btn-revenue-go-area">エリアを開く</button>`;
    const btn = el.querySelector('#btn-revenue-go-area');
    if (btn) btn.addEventListener('click', goToAreaView);
  }

  function renderRevenueAggMonthlyTable(rows) {
    if (!rows.length) return '<p class="placeholder-text">データがありません</p>';
    return `<table class="revenue-agg-table"><thead><tr>
      <th>月</th><th class="num">売上件数</th><th class="num">売上合計</th><th class="num">平均単価</th><th>根拠</th><th>整合</th>
    </tr></thead><tbody>${rows.map(r => {
      const sourceLabel = r.source === 'monthly-result' ? '月次実績' : (r.source === 'detail' ? '明細' : '—');
      return `<tr>
      <td>${esc(r.label)}</td>
      <td class="num">${r.count}件</td>
      <td class="num">${esc(RevenueSummaryBrain.formatYen(r.total))}</td>
      <td class="num">${esc(RevenueSummaryBrain.formatYen(r.avg))}</td>
      <td>${esc(sourceLabel)}</td>
      <td>${esc(r.status || '—')}</td>
    </tr>`;
    }).join('')}</tbody></table>`;
  }

  function renderRevenueAggYearlyTable(rows) {
    if (!rows.length) return '<p class="placeholder-text">データがありません</p>';
    return `<table class="revenue-agg-table"><thead><tr>
      <th>年</th><th class="num">売上件数</th><th class="num">売上合計</th><th class="num">月平均</th>
    </tr></thead><tbody>${rows.map(r => `<tr>
      <td>${esc(r.label)}</td>
      <td class="num">${r.count}件</td>
      <td class="num">${esc(RevenueSummaryBrain.formatYen(r.total))}</td>
      <td class="num">${esc(RevenueSummaryBrain.formatYen(r.monthAvg))}</td>
    </tr>`).join('')}</tbody></table>`;
  }

  function renderRevenueAggDimensionTable(rows, labelCol) {
    if (!rows.length) return '<p class="placeholder-text">データがありません</p>';
    return `<table class="revenue-agg-table"><thead><tr>
      <th>${esc(labelCol)}</th><th class="num">件数</th><th class="num">売上合計</th><th class="num">平均単価</th><th class="num">構成比</th><th>判断</th>
    </tr></thead><tbody>${rows.map(r => `<tr>
      <td>${esc(r.name)}</td>
      <td class="num">${r.count}件</td>
      <td class="num">${esc(RevenueSummaryBrain.formatYen(r.total))}</td>
      <td class="num">${esc(RevenueSummaryBrain.formatYen(r.avg))}</td>
      <td class="num">${r.share}%</td>
      <td>${esc(r.judgment)}</td>
    </tr>`).join('')}</tbody></table>`;
  }

  function renderRevenueAggMonthBlocks(blocks, field) {
    if (!blocks.length) return '<p class="placeholder-text">データがありません</p>';
    return blocks.map(b => `
      <div class="revenue-agg-month-block">
        <h4>${esc(b.label)}</h4>
        <table class="revenue-agg-table"><thead><tr>
          <th>${field === 'sources' ? '依頼元' : 'サービス'}</th><th class="num">件数</th><th class="num">売上</th>
        </tr></thead><tbody>${(b[field] || []).map(r => `<tr>
          <td>${esc(r.name)}</td>
          <td class="num">${r.count}件</td>
          <td class="num">${esc(RevenueSummaryBrain.formatYen(r.total))}</td>
        </tr>`).join('')}</tbody></table>
      </div>`).join('');
  }

  function renderRevenueAggSeparateHtml(separate) {
    const s = separate || {};
    const rows = [
      { label: s.forecast && s.forecast.label, count: s.forecast && s.forecast.count, total: s.forecast && s.forecast.total },
      { label: s.receptionCandidates && s.receptionCandidates.label, count: s.receptionCandidates && s.receptionCandidates.count, total: s.receptionCandidates && s.receptionCandidates.total },
      { label: s.plannedRevenue && s.plannedRevenue.label, count: s.plannedRevenue && s.plannedRevenue.count, total: s.plannedRevenue && s.plannedRevenue.total },
      { label: s.noDateConfirmed && s.noDateConfirmed.label, count: s.noDateConfirmed && s.noDateConfirmed.count, total: s.noDateConfirmed && s.noDateConfirmed.total }
    ];
    const filtered = rows.filter(r => r.label && ((r.count > 0) || (r.total > 0)));
    if (!filtered.length) return '';
    return `<div class="revenue-agg-separate">
      <p class="revenue-agg-separate-title">集計対象外（別表示）※確定売上には含まれません</p>
      ${filtered.map(r =>
        `<p class="revenue-agg-separate-line"><span>${esc(r.label)}</span><strong>${r.count}件 / ${esc(RevenueSummaryBrain.formatYen(r.total))}${r.link ? ` <button type="button" class="btn btn-sm btn-secondary revenue-agg-goto-candidate">見る</button>` : ''}</strong></p>`
      ).join('')}
    </div>`;
  }

  function handleSalesFlowDiagnosticAction(action) {
    if (!action || !action.view) return;
    navigateToView(action.view, action.scrollSelector || null);
  }

  function renderRevenueFlowDiagnostics() {
    const el = document.getElementById('revenue-flow-diagnostics');
    if (!el || typeof RevenueSummaryBrain === 'undefined') return;
    const today = TODAY();
    const diagnostics = RevenueSummaryBrain.buildSalesFlowDiagnostics(
      Storage.getWorkOrders(),
      Storage.getRevenueRecords(),
      Storage.getMonthlyResults(),
      today
    );
    const monthlyLabel = diagnostics.monthlyMonthCount === 1
      ? '1ヶ月分'
      : `${diagnostics.monthlyMonthCount}ヶ月分`;
    const statusClass = diagnostics.statusKey === 'ok'
      ? 'is-ok'
      : (diagnostics.statusKey === 'reconciliation_gap' ? 'is-warn' : 'is-info');
    const action = diagnostics.primaryAction;
    const actionBtn = action
      ? `<div class="revenue-flow-diagnostics-action-wrap"><button type="button" class="btn btn-sm btn-primary revenue-flow-diagnostics-action">${esc(action.label)}</button></div>`
      : '';
    el.innerHTML = `
      <div class="revenue-flow-diagnostics">
        <h3 class="revenue-flow-diagnostics-title">売上フロー診断</h3>
        <ul class="revenue-flow-diagnostics-stats">
          <li><span>月次実績：</span><strong>${esc(monthlyLabel)}</strong></li>
          <li><span>売上明細：</span><strong>${diagnostics.confirmedRevenueCount}件</strong></li>
          <li><span>作業予定：</span><strong>${diagnostics.workOrderCount}件</strong></li>
          <li><span>売上予定（未確定）：</span><strong>${diagnostics.upcomingScheduleCount}件</strong></li>
          <li><span>売上確定待ち：</span><strong>${diagnostics.revenueConfirmationQueueCount}件</strong></li>
          <li><span>整合チェック：</span><strong>${esc(diagnostics.reconciliationLabel)}</strong></li>
        </ul>
        <details class="revenue-flow-diagnostics-details">
          <summary>この表示について</summary>
          <p class="revenue-flow-diagnostics-note">読み取り専用です。データの修正・削除・自動同期は行いません。</p>
          <dl class="revenue-flow-diagnostics-defs">
            <div><dt>月次実績</dt><dd>月単位の確定経営数字です。売上明細とは別管理です。</dd></div>
            <div><dt>売上明細</dt><dd>作業後に売上確定した明細です。</dd></div>
            <div><dt>作業予定</dt><dd>予定取り込みなどで保存された予定です。</dd></div>
            <div><dt>売上予定</dt><dd>未来の未確定予定です。確定売上・月次実績とは合算しません。</dd></div>
            <div><dt>売上確定待ち</dt><dd>作業日当日以降で、まだ売上確定していない予定です。</dd></div>
            <div><dt>整合チェック</dt><dd>月次実績と売上明細の差額を確認します。自動同期はしません。</dd></div>
          </dl>
          <p class="revenue-flow-diagnostics-flow">${esc(diagnostics.flowNote)}</p>
        </details>
        <p class="revenue-flow-diagnostics-status ${statusClass}">状態：${esc(diagnostics.statusMessage)}</p>
        <p class="revenue-flow-diagnostics-next">次にやること：${esc(diagnostics.nextAction)}</p>
        ${actionBtn}
      </div>`;
    const btn = el.querySelector('.revenue-flow-diagnostics-action');
    if (btn && action) {
      btn.addEventListener('click', () => handleSalesFlowDiagnosticAction(action));
    }
  }

  function renderRevenueAggregationPanel() {
    const el = document.getElementById('revenue-aggregation-panel');
    if (!el || typeof RevenueSummaryBrain === 'undefined') return;

    const { records, today } = getRevenueContext();
    const filter = getRevenueAggregationFilter();
    const summary = RevenueSummaryBrain.buildFullSummary(records, filter, today, getRevenueSummaryExtra());
    const options = RevenueSummaryBrain.getFilterOptions(records);
    const compact = summary.compact;
    const separate = summary.separate || {};

    const yearOpts = ['<option value="">すべて</option>']
      .concat(options.years.map(y => `<option value="${esc(y)}"${filter.year === y ? ' selected' : ''}>${esc(y)}年</option>`));
    const monthOpts = ['<option value="">すべて</option>']
      .concat(options.months
        .filter(m => !filter.year || m.startsWith(filter.year))
        .map(m => `<option value="${esc(m)}"${filter.month === m ? ' selected' : ''}>${esc(RevenueSummaryBrain.formatMonthLabel(m))}</option>`));
    const sourceOpts = ['<option value="">すべて</option>']
      .concat(options.sources.map(s => `<option value="${esc(s)}"${filter.source === s ? ' selected' : ''}>${esc(s)}</option>`));
    const serviceOpts = ['<option value="">すべて</option>']
      .concat(options.services.map(s => `<option value="${esc(s)}"${filter.service === s ? ' selected' : ''}>${esc(s)}</option>`));

    const topSourceNames = (compact.topSources || []).map(s => s.name).join(' / ') || '—';
    const topServiceNames = (compact.topServices || []).map(s => s.name).join(' / ') || '—';
    const thisMonthView = compact.thisMonthView || {};
    const thisMonthLabel = compact.usesMonthlyResultThisMonth ? '今月実績（月次実績ベース）' : '今月確定売上';
    const scopeNote = compact.usesMonthlyResultThisMonth
      ? '月次実績がある月は月次実績ベースで表示します。明細売上とは別管理です。'
      : '確定売上のみ集計（売上登録で「確定」登録済み）。見込み・候補は含みません。';
    const monthlyBreakdown = compact.usesMonthlyResultThisMonth
      ? `<p class="reconciliation-brief-line">明細売上合計：${esc(RevenueSummaryBrain.formatYen(thisMonthView.detailTotal || 0))} / 差額：${esc(RevenueSummaryBrain.formatYen(thisMonthView.diff || 0))}</p>
         ${thisMonthView.status === '差額あり' ? '<p class="reconciliation-brief-warn">※この月は月次実績と売上明細が一致していません。</p>' : ''}
         <p class="revenue-agg-scope-note">月次実績ベース分は依頼元別・サービス別の内訳には含まれません。</p>`
      : '';
    const reconciliationHtml = renderMonthlyReconciliationHtml(summary.reconciliation || [], {
      note: '月次実績と売上明細の差額を確認します。自動同期はしません（読み取り専用）。'
    });

    el.innerHTML = `
      <p class="revenue-agg-scope-note">${esc(scopeNote)}</p>
      <div class="revenue-agg-compact">
        <div class="revenue-agg-compact-item revenue-agg-highlight">
          <span>${esc(thisMonthLabel)}</span>
          <strong>${esc(RevenueSummaryBrain.formatYen(compact.thisMonthTotal))}</strong>
        </div>
        <div class="revenue-agg-compact-item">
          <span>先月売上</span>
          <strong>${esc(RevenueSummaryBrain.formatYen(compact.prevMonthTotal))}</strong>
        </div>
        <div class="revenue-agg-compact-item revenue-agg-highlight">
          <span>今年売上合計</span>
          <strong>${esc(RevenueSummaryBrain.formatYen(compact.yearTotal))}</strong>
        </div>
        <div class="revenue-agg-compact-item">
          <span>今年の月平均</span>
          <strong>${esc(RevenueSummaryBrain.formatYen(compact.yearMonthAvg))}</strong>
        </div>
        <div class="revenue-agg-compact-item">
          <span>上位依頼元（今月明細）</span>
          <p class="revenue-agg-top-list">${esc(topSourceNames)}</p>
        </div>
        <div class="revenue-agg-compact-item">
          <span>上位サービス（今月明細）</span>
          <p class="revenue-agg-top-list">${esc(topServiceNames)}</p>
        </div>
      </div>
      ${monthlyBreakdown}

      <details class="revenue-agg-collapse" id="revenue-reconciliation-check">
        <summary>売上明細と月次実績の整合チェック（詳細）</summary>
        <div class="revenue-agg-collapse-body">${reconciliationHtml}</div>
      </details>

      ${renderRevenueAggSeparateHtml(separate)}

      <div class="revenue-agg-filters">
        <div class="form-group">
          <label for="revenue-agg-filter-year">年</label>
          <select id="revenue-agg-filter-year">${yearOpts.join('')}</select>
        </div>
        <div class="form-group">
          <label for="revenue-agg-filter-month">月</label>
          <select id="revenue-agg-filter-month">${monthOpts.join('')}</select>
        </div>
        <div class="form-group">
          <label for="revenue-agg-filter-source">依頼元</label>
          <select id="revenue-agg-filter-source">${sourceOpts.join('')}</select>
        </div>
        <div class="form-group">
          <label for="revenue-agg-filter-service">サービス</label>
          <select id="revenue-agg-filter-service">${serviceOpts.join('')}</select>
        </div>
        <button type="button" class="btn btn-sm btn-secondary" id="btn-revenue-agg-reset-filter">リセット</button>
      </div>

      <details class="revenue-agg-collapse">
        <summary>月別を見る</summary>
        <div class="revenue-agg-collapse-body">${renderRevenueAggMonthlyTable(summary.monthly)}</div>
      </details>
      <details class="revenue-agg-collapse">
        <summary>年別を見る</summary>
        <div class="revenue-agg-collapse-body">${renderRevenueAggYearlyTable(summary.yearly)}</div>
      </details>
      <details class="revenue-agg-collapse">
        <summary>依頼元別を見る</summary>
        <div class="revenue-agg-collapse-body">${renderRevenueAggDimensionTable(summary.sources, '依頼元')}</div>
      </details>
      <details class="revenue-agg-collapse">
        <summary>サービス別を見る</summary>
        <div class="revenue-agg-collapse-body">${renderRevenueAggDimensionTable(summary.services, 'サービス')}</div>
      </details>
      <details class="revenue-agg-collapse">
        <summary>詳細集計を開く（月別×依頼元 / 月別×サービス / 年別内訳）</summary>
        <div class="revenue-agg-collapse-body">
          <h4>月別 × 依頼元</h4>
          ${renderRevenueAggMonthBlocks(summary.monthlySources, 'sources')}
          <h4>月別 × サービス</h4>
          ${renderRevenueAggMonthBlocks(summary.monthlyServices, 'services')}
          <h4>年別 × 依頼元</h4>
          ${renderRevenueAggMonthBlocks(summary.yearlySources.map(b => ({ label: b.label, sources: b.sources })), 'sources')}
          <h4>年別 × サービス</h4>
          ${renderRevenueAggMonthBlocks(summary.yearlyServices.map(b => ({ label: b.label, services: b.services })), 'services')}
        </div>
      </details>

      <div class="revenue-agg-actions">
        <button type="button" class="btn btn-sm btn-primary" id="btn-revenue-agg-copy">売上集計をコピー</button>
      </div>`;

    const bindFilter = (id, key) => {
      const sel = el.querySelector(id);
      if (sel) sel.addEventListener('change', () => {
        revenueAggregationFilter[key] = sel.value;
        if (key === 'year' && revenueAggregationFilter.month && !revenueAggregationFilter.month.startsWith(sel.value)) {
          revenueAggregationFilter.month = '';
        }
        renderRevenueAggregationPanel();
      });
    };
    bindFilter('#revenue-agg-filter-year', 'year');
    bindFilter('#revenue-agg-filter-month', 'month');
    bindFilter('#revenue-agg-filter-source', 'source');
    bindFilter('#revenue-agg-filter-service', 'service');

    const resetBtn = el.querySelector('#btn-revenue-agg-reset-filter');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      resetRevenueAggregationFilter();
      renderRevenueAggregationPanel();
    });

    const copyBtn = el.querySelector('#btn-revenue-agg-copy');
    if (copyBtn) copyBtn.addEventListener('click', () => {
      const text = RevenueSummaryBrain.buildCopyText(summary, filter);
      copyText(text).then(() => alert('売上集計をコピーしました')).catch(() => alert('コピーに失敗しました'));
    });
    el.querySelectorAll('.revenue-agg-goto-candidate').forEach(btn => {
      btn.addEventListener('click', () => navigateToView('calendar-candidate'));
    });
  }

  function renderRevenueSummaryPanel() {
    const { summary, comment, settings, salesOutcome, leads, monthlyOverlay } = getRevenueContext();
    const summaryEl = document.getElementById('revenue-summary');
    const commentEl = document.getElementById('revenue-bantou-comment');
    const targetEl = document.getElementById('revenue-monthly-target');
    const outcomeEl = document.getElementById('revenue-sales-outcome');
    const reconciliationEl = document.getElementById('revenue-monthly-reconciliation');

    renderRevenueUnlinkedBanner(salesOutcome);

    if (reconciliationEl) {
      reconciliationEl.innerHTML = monthlyOverlay && monthlyOverlay.usesMonthlyResult
        ? renderCurrentMonthReconciliationBrief(summary.monthKey, monthlyOverlay)
        : '';
      const actionCard = reconciliationEl.querySelector('.reconciliation-action-card');
      if (actionCard) bindMonthlyReconciliationActionCard(actionCard);
    }

    if (summaryEl) {
      const plannedLabel = monthlyOverlay && monthlyOverlay.usesMonthlyResult ? '今月実績' : '売上予定';
      const baseItems = [
        { label: plannedLabel, value: RevenueBrain.formatYen(summary.planned) + (monthlyOverlay && monthlyOverlay.usesMonthlyResult ? '（月次実績）' : '') },
        { label: '確定', value: RevenueBrain.formatYen(summary.confirmed) },
        { label: '入金済み', value: RevenueBrain.formatYen(summary.paid) },
        { label: '入金待ち', value: RevenueBrain.formatYen(summary.unpaid) },
        { label: '月間目標', value: RevenueBrain.formatYen(summary.monthlyTarget) },
        { label: '目標まで残り', value: RevenueBrain.formatYen(summary.remainingToTarget) },
        { label: '達成率', value: summary.achievementRate + '%' },
        { label: '残り日数', value: summary.daysLeft + '日' },
        { label: '1日あたり必要', value: RevenueBrain.formatYen(summary.dailyNeeded) }
      ];
      summaryEl.innerHTML = baseItems.map(item => `
        <div class="revenue-summary-item ${item.extraClass || ''}">
          <span>${esc(item.label)}</span>
          <strong>${esc(item.value)}</strong>
        </div>`).join('');
    }
    if (commentEl) commentEl.textContent = comment;
    if (targetEl) targetEl.value = settings.monthlyTarget || '';
    if (outcomeEl) outcomeEl.innerHTML = '';
    renderManagementComment('revenue-management-comment');
  }

  function renderRevenueAnalysisView() {
    try {
      safeRenderSection('revenue-flow-diagnostics', () => renderRevenueFlowDiagnostics(), '売上フロー診断');
      safeRenderSection('revenue-aggregation-panel', () => renderRevenueAggregationPanel(), '売上集計');
      safeRenderSection(null, () => renderRevenueAreaBrief(), '売上エリア');
      const { summary } = getRevenueContext();
      renderRevenueBreakdown('revenue-by-service', summary.byService);
      renderRevenueBreakdown('revenue-by-source', summary.bySource);
    } catch (err) {
      console.error('[Budil] render error: 売上分析', err);
    }
  }

  function renderRevenueView() {
    try {
      fillRevenueSelects();
      const leadEl = document.getElementById('revenue-lead');
      fillRevenueLeadSelect(leadEl ? leadEl.value : '');
      toggleRevenueLeadOptions();
      safeRenderSection('revenue-confirmation-queue-list', () => renderRevenueConfirmationQueueBlock('revenue-confirmation-queue-list', { limit: 5 }), '売上確定待ち');
      safeRenderSection('revenue-upcoming-schedule', () => {
        const upcomingScheduleEl = document.getElementById('revenue-upcoming-schedule');
        if (upcomingScheduleEl) {
          upcomingScheduleEl.innerHTML = renderUpcomingRevenueScheduleHtml({ limit: 5, showScheduleImportBtn: true });
          const importBtn = upcomingScheduleEl.querySelector('.upcoming-go-schedule-import');
          if (importBtn) importBtn.addEventListener('click', () => navigateToView('calendar-candidate'));
        }
      }, '売上予定');
      safeRenderSection('revenue-summary', () => renderRevenueSummaryPanel(), '売上サマリー');
      safeRenderSection('revenue-monthly-closing-check', () => renderMonthlyClosingCheck('revenue-monthly-closing-check', { compact: true }), '月次締めチェック');
      safeRenderSection('revenue-tbody', () => renderRevenueList(), '売上一覧');
    } catch (err) {
      console.error('[Budil] render error: 売上番頭', err);
      const el = document.getElementById('revenue-tbody');
      if (el) {
        el.innerHTML = '<p class="section-render-error">このセクションの表示中にエラーが発生しました。バックアップ後、データ診断を実行してください。</p>';
      }
    }
  }

  function handleRevenueSubmit(e) {
    e.preventDefault();
    const data = getRevenueFormData();
    if (!data.customerName) {
      alert('顧客名は必須です');
      return;
    }
    const markWon = false;
    const leadId = data.leadId;
    const id = document.getElementById('revenue-edit-id').value;
    const workOrderId = pendingRevenueWorkOrderId;
    let intakeId = pendingRevenueIntakeId;
    if (!intakeId && workOrderId) {
      const wo = Storage.getWorkOrders().find(w => w.id === workOrderId);
      intakeId = wo ? getWorkOrderReceptionId(wo) : '';
    }
    if (!id && intakeId) {
      const existingRevenue = getReceptionLinkedRevenue(intakeId);
      if (existingRevenue) {
        alert('この受付には既に売上が登録されています。既存の売上を開きます。');
        navigateToView('revenue');
        openRevenueEdit(existingRevenue.id);
        return;
      }
    }
    if (workOrderId) {
      const wo = Storage.getWorkOrders().find(w => w.id === workOrderId);
      if (wo && wo.actualRevenueId && wo.actualRevenueId !== id) {
        alert('この作業予定はすでに別の売上と紐付いています。二重登録はできません。');
        pendingRevenueWorkOrderId = '';
        pendingRevenueIntakeId = '';
        return;
      }
    }
    if (workOrderId && !data.sourceWorkOrderId) data.sourceWorkOrderId = workOrderId;
    if (intakeId && !data.intakeId) {
      data.intakeId = intakeId;
      data.receptionIntakeId = intakeId;
      data.sourceIntakeId = intakeId;
    }
    const linkedDocId = pendingLinkedDocumentId || data.linkedDocumentId || '';
    let newRecord = null;
    if (id) {
      Storage.updateRevenueRecord(id, data);
    } else {
      newRecord = Storage.addRevenueRecord(data);
    }
    const revId = id || (newRecord && newRecord.id);
    if (linkedDocId && revId) {
      PaymentBrain.linkRevenueAndDocument(revId, linkedDocId, Storage);
    }
    if (revId) {
      PaymentBrain.syncLinkedPayment({
        sourceType: 'revenue',
        sourceId: revId,
        paymentPatch: data,
        storage: Storage
      });
    }
    if (workOrderId && revId) {
      Storage.updateWorkOrder(workOrderId, { actualRevenueId: revId });
      pendingRevenueWorkOrderId = '';
    }
    if (revId && intakeId) linkReceptionToRevenue(intakeId, revId, workOrderId);
    pendingRevenueIntakeId = '';
    pendingLinkedDocumentId = '';
    if (markWon && leadId) {
      const updated = updateLeadStatusFromRevenue(leadId);
      if (updated) renderLeadsTable();
    }
    resetRevenueForm();
    renderRevenueView();
    renderReceivablesView();
    renderDocumentsView();
    renderWorkOrderView();
    renderReceptionView();
    renderDashboard();
    const saveMsg = id ? '売上を更新しました。売上集計を確認してください。' : '売上を保存しました。売上集計を確認してください。';
    navigateAfterAction('revenue-save', saveMsg);
  }

  function initRevenue() {
    fillRevenueSelects();
    fillRevenuePaymentSelects();
    fillRevenueLeadSelect('');
    toggleRevenueLeadOptions();
    toggleRevenueOpenLeadButton();
    document.getElementById('revenue-form').addEventListener('submit', handleRevenueSubmit);
    document.getElementById('btn-revenue-cancel').addEventListener('click', resetRevenueForm);
    document.getElementById('revenue-payment-method')?.addEventListener('change', () => suggestRevenuePaymentFromMethod(true, true));
    document.getElementById('btn-revenue-recalc-payment-date')?.addEventListener('click', recalculateRevenueExpectedPaymentDate);
    document.getElementById('revenue-amount')?.addEventListener('change', applyRevenuePaymentStatusDefaults);
    document.getElementById('revenue-payment-status')?.addEventListener('change', applyRevenuePaymentStatusDefaults);
    bindGrossMarginManualTracking(document.getElementById('revenue-gross-margin-rate'));
    document.getElementById('revenue-source')?.addEventListener('change', () => applyRevenueGrossMarginDefault());
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
    if (!revenueAggregationFilter.year) {
      resetRevenueAggregationFilter();
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

  // ── 請求書・見積書 ──
  function showDocumentsPanel(panel) {
    const list = document.getElementById('documents-list-panel');
    const form = document.getElementById('documents-form-panel');
    const preview = document.getElementById('documents-preview-panel');
    const backList = document.getElementById('btn-doc-back-list');
    if (!list || !form || !preview) return;
    list.classList.toggle('hidden', panel !== 'list');
    form.classList.toggle('hidden', panel !== 'form');
    preview.classList.toggle('hidden', panel !== 'preview');
    if (backList) backList.classList.toggle('hidden', panel === 'list');
  }

  function fillDocStatusOptions(type, selected) {
    const sel = document.getElementById('doc-status');
    if (!sel) return;
    const list = type === 'invoice' ? DocumentsBrain.INVOICE_STATUSES : DocumentsBrain.ESTIMATE_STATUSES;
    sel.innerHTML = list.map(s => `<option value="${esc(s.value)}">${esc(s.label)}</option>`).join('');
    sel.value = selected || 'draft';
  }

  function toggleDocFormFields(type) {
    const isInvoice = type === 'invoice';
    const dueGroup = document.querySelector('.doc-due-group');
    const bankGroup = document.querySelector('.doc-bank-group');
    if (dueGroup) dueGroup.classList.toggle('hidden', !isInvoice);
    if (bankGroup) bankGroup.classList.toggle('hidden', !isInvoice);
    toggleDocPaymentFields(type);
  }

  function initReceivables() {
    document.querySelectorAll('[data-receivables-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        receivablesFilter = btn.dataset.receivablesFilter || 'all';
        renderReceivablesView();
      });
    });
    renderReceivablesView();
  }

  function fillDocTaxCategoryOptions(selected) {
    const sel = document.getElementById('doc-tax-category');
    if (!sel) return;
    sel.innerHTML = DocumentsBrain.TAX_CATEGORY_OPTIONS
      .map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
    sel.value = selected || 'taxable10';
  }

  function readTaxSettingsFromForm() {
    return DocumentsBrain.normalizeTaxSettings({
      taxSettings: {
        taxDisplayMode: document.getElementById('doc-tax-display-mode')?.value || 'taxExcluded',
        taxCategory: document.getElementById('doc-tax-category')?.value || 'taxable10',
        taxRounding: document.getElementById('doc-tax-rounding')?.value || 'floor',
        lineRounding: document.getElementById('doc-line-rounding')?.value || 'floor',
        showUnit: document.getElementById('doc-show-unit')?.checked === true,
        showZeroTax: document.getElementById('doc-show-zero-tax')?.checked === true,
        showTaxBreakdown: document.getElementById('doc-show-tax-breakdown')?.checked !== false
      }
    });
  }

  function fillTaxSettingsForm(taxSettings) {
    const ts = DocumentsBrain.normalizeTaxSettings({ taxSettings });
    fillDocTaxCategoryOptions(ts.taxCategory);
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };
    set('doc-tax-display-mode', ts.taxDisplayMode);
    set('doc-tax-rounding', ts.taxRounding);
    set('doc-line-rounding', ts.lineRounding);
    const showUnit = document.getElementById('doc-show-unit');
    const showZeroTax = document.getElementById('doc-show-zero-tax');
    const showBreakdown = document.getElementById('doc-show-tax-breakdown');
    if (showUnit) showUnit.checked = ts.showUnit;
    if (showZeroTax) showZeroTax.checked = ts.showZeroTax;
    if (showBreakdown) showBreakdown.checked = ts.showTaxBreakdown;
    const panel = document.getElementById('doc-tax-settings-panel');
    if (panel && !documentsFormDirty) panel.open = false;
  }

  function readDocItemsFromForm() {
    const showUnit = document.getElementById('doc-show-unit')?.checked === true;
    const rows = document.querySelectorAll('#doc-items-editor .doc-item-row');
    return Array.from(rows).map(row => {
      const item = {
        date: row.querySelector('.doc-item-date')?.value || '',
        name: row.querySelector('.doc-item-name')?.value.trim() || '',
        unitPrice: Number(row.querySelector('.doc-item-unit')?.value) || 0,
        quantity: Number(row.querySelector('.doc-item-qty')?.value) || 1,
        amount: Number(row.querySelector('.doc-item-amount')?.value) || 0
      };
      if (showUnit) item.unit = row.querySelector('.doc-item-unit-label')?.value.trim() || '';
      return item;
    });
  }

  function updateDocItemRowAmount(row) {
    const ts = readTaxSettingsFromForm();
    const unit = Number(row.querySelector('.doc-item-unit')?.value) || 0;
    const qty = Number(row.querySelector('.doc-item-qty')?.value) || 1;
    const amountEl = row.querySelector('.doc-item-amount');
    if (!amountEl) return;
    amountEl.value = DocumentsBrain.roundBySetting(unit * qty, ts.lineRounding);
    updateDocTaxPreview();
  }

  function updateDocTaxPreview() {
    const preview = document.getElementById('doc-tax-preview');
    if (!preview) return;
    const ts = readTaxSettingsFromForm();
    const items = readDocItemsFromForm();
    const calc = DocumentsBrain.calcFromItems(items, ts);
    const modeLabel = ts.taxDisplayMode === 'taxIncluded' ? '内税' : '外税';
    const catLabel = DocumentsBrain.taxCategoryLabel(ts.taxCategory);
    preview.textContent = `${modeLabel} / ${catLabel} / 小計 ${DocumentsBrain.formatYen(calc.subtotal)} / 税 ${DocumentsBrain.formatYen(calc.tax)} / 合計 ${DocumentsBrain.formatYen(calc.total)}`;
    updateDocFromRevenueAmountWarn();
  }

  function buildDocItemRow(item, showDate, showUnit) {
    const row = document.createElement('div');
    row.className = 'doc-item-row' + (showUnit ? ' doc-item-row-with-unit' : '');
    row.innerHTML = `
      ${showDate ? '<input type="date" class="doc-item-date" value="' + esc(item.date || '') + '">' : '<input type="hidden" class="doc-item-date" value="">'}
      <input type="text" class="doc-item-name" placeholder="品目" value="${esc(item.name || '')}">
      <input type="number" class="doc-item-unit" min="0" step="1" placeholder="単価" value="${item.unitPrice != null ? item.unitPrice : ''}">
      <input type="number" class="doc-item-qty" min="0" step="1" placeholder="数量" value="${item.quantity != null ? item.quantity : 1}">
      ${showUnit ? '<input type="text" class="doc-item-unit-label" placeholder="単位" value="' + esc(item.unit || '') + '">' : ''}
      <input type="number" class="doc-item-amount" min="0" step="1" placeholder="価格" value="${item.amount != null ? item.amount : ''}">
      <button type="button" class="btn btn-secondary btn-sm btn-remove-item" title="行削除">×</button>`;
    row.querySelectorAll('.doc-item-unit, .doc-item-qty').forEach(el => {
      el.addEventListener('input', () => updateDocItemRowAmount(row));
    });
    row.querySelector('.doc-item-amount')?.addEventListener('input', updateDocTaxPreview);
    row.querySelector('.btn-remove-item')?.addEventListener('click', () => {
      const editor = document.getElementById('doc-items-editor');
      if (editor && editor.querySelectorAll('.doc-item-row').length > 1) {
        row.remove();
        updateDocTaxPreview();
      }
    });
    return row;
  }

  function renderDocItemsEditor(items, type) {
    const editor = document.getElementById('doc-items-editor');
    if (!editor) return;
    const showUnit = document.getElementById('doc-show-unit')?.checked === true;
    editor.innerHTML = '';
    const showDate = type === 'invoice';
    const list = (items && items.length) ? items : [{ name: '', unitPrice: 0, quantity: 1, amount: 0 }];
    list.forEach(item => editor.appendChild(buildDocItemRow(item, showDate, showUnit)));
    updateDocTaxPreview();
  }

  function onDocTaxSettingsChange() {
    documentsFormDirty = true;
    const type = document.getElementById('doc-type')?.value || 'invoice';
    renderDocItemsEditor(readDocItemsFromForm(), type);
  }

  function resetDocumentsForm() {
    documentsFormDirty = false;
    document.getElementById('doc-edit-id').value = '';
    document.getElementById('documents-form')?.reset();
    currentDocPreviewId = null;
    pendingLinkedRevenueId = '';
    updateDocFromRevenueNotice(null);
  }

  function openDocumentForm(type, doc, options) {
    const opts = options || {};
    const documents = Storage.getDocuments();
    const base = doc
      ? DocumentsBrain.normalizeDocument(doc)
      : DocumentsBrain.buildDefaultDocument(type, documents);
    documentsFormDirty = false;
    showDocumentsPanel('form');
    document.getElementById('doc-edit-id').value = base.id || '';
    document.getElementById('doc-type').value = base.type;
    const fromRevenue = opts.fromRevenue === true || (!!base.linkedRevenueId && !base.id);
    document.getElementById('documents-form-title').textContent = fromRevenue && !base.id
      ? '請求書作成（売上から）'
      : (base.id
        ? DocumentsBrain.typeLabel(base.type) + '編集'
        : '新規' + DocumentsBrain.typeLabel(base.type));
    document.getElementById('doc-number').value = base.number;
    document.getElementById('doc-issue-date').value = base.issueDate;
    document.getElementById('doc-due-date').value = base.dueDate || '';
    document.getElementById('doc-customer').value = (base.customerName || '').replace(/\s*(様|御中)$/, '');
    document.getElementById('doc-honorific').value = base.customerHonorific || '様';
    fillDocStatusOptions(base.type, base.status);
    document.getElementById('doc-title').value = base.title;
    fillTaxSettingsForm(base.taxSettings);
    document.getElementById('doc-bank-info').value = base.bankInfo || '';
    document.getElementById('doc-note').value = base.note || '';
    writeDocumentPaymentFieldsToForm(base);
    toggleDocFormFields(base.type);
    renderDocItemsEditor(base.items, base.type);
    if (fromRevenue && base.linkedRevenueId) {
      pendingLinkedRevenueId = base.linkedRevenueId;
      const rev = Storage.getRevenueRecords().find(r => r.id === base.linkedRevenueId);
      updateDocFromRevenueNotice(rev || null);
    } else if (!opts.fromRevenue) {
      pendingLinkedRevenueId = '';
      updateDocFromRevenueNotice(null);
    }
    if (!doc && !fromRevenue) {
      recalculateDocumentExpectedPaymentDate();
    }
    document.getElementById('documents-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function collectDocumentFormData() {
    const type = document.getElementById('doc-type').value;
    const taxSettings = readTaxSettingsFromForm();
    const items = readDocItemsFromForm();
    const calc = DocumentsBrain.calcFromItems(items, taxSettings);
    return DocumentsBrain.normalizeDocument({
      id: document.getElementById('doc-edit-id').value,
      type,
      number: document.getElementById('doc-number').value.trim(),
      issueDate: document.getElementById('doc-issue-date').value,
      dueDate: document.getElementById('doc-due-date').value,
      customerName: document.getElementById('doc-customer').value.trim(),
      customerHonorific: document.getElementById('doc-honorific').value,
      title: document.getElementById('doc-title').value.trim(),
      status: document.getElementById('doc-status').value,
      items: calc.items,
      subtotal: calc.subtotal,
      tax: calc.tax,
      total: calc.total,
      taxSettings: calc.taxSettings,
      note: document.getElementById('doc-note').value.trim(),
      bankInfo: document.getElementById('doc-bank-info').value.trim(),
      issuer: DocumentsBrain.defaultIssuer(),
      ...readDocumentPaymentFieldsFromForm()
    });
  }

  function normalizeDocumentFormPayment(data) {
    const payment = PaymentBrain.normalizeDocumentPayment(data, {
      total: data.total,
      defaultDate: data.issueDate
    });
    Object.assign(payment, PaymentBrain.applyPaymentStatusDefaults(payment, data.total, payment.paidDate || data.issueDate || TODAY()));
    return payment;
  }

  function handleDocumentSubmit(e) {
    e.preventDefault();
    const data = collectDocumentFormData();
    if (!data.customerName) {
      alert('宛名を入力してください');
      return;
    }
    if (!data.number) {
      alert('番号を入力してください');
      return;
    }
    const payment = normalizeDocumentFormPayment(data);
    Object.assign(data, payment);
    const id = document.getElementById('doc-edit-id').value;
    const linkedRevId = pendingLinkedRevenueId || data.linkedRevenueId || '';
    if (linkedRevId) data.linkedRevenueId = linkedRevId;
    let saved;
    if (id) {
      saved = Storage.updateDocument(id, data);
      PaymentBrain.syncLinkedPayment({
        sourceType: 'document',
        sourceId: id,
        paymentPatch: payment,
        storage: Storage
      });
    } else {
      saved = Storage.addDocument(data);
      if (saved) {
        PaymentBrain.syncLinkedPayment({
          sourceType: 'document',
          sourceId: saved.id,
          paymentPatch: payment,
          storage: Storage
        });
      }
    }
    if (!saved) {
      alert('保存に失敗しました');
      return;
    }
    if (linkedRevId && saved.type === 'invoice') {
      const rev = Storage.getRevenueRecords().find(r => r.id === linkedRevId);
      if (rev) {
        PaymentBrain.linkRevenueAndDocument(linkedRevId, saved.id, Storage);
        PaymentBrain.syncLinkedPayment('document', saved.id, payment, Storage);
      }
    }
    pendingLinkedRevenueId = '';
    updateDocFromRevenueNotice(null);
    showAppToast(id ? '書類を更新しました' : '書類を保存しました');
    openDocumentPreview(saved.id);
    renderDocumentsList();
    renderReceivablesView();
    renderRevenueView();
    renderDashboard();
  }

  function openDocumentPreview(id) {
    const doc = Storage.getDocumentById(id);
    if (!doc) return;
    currentDocPreviewId = id;
    showDocumentsPanel('preview');
    const body = document.getElementById('documents-preview-body');
    if (body) body.innerHTML = DocumentsBrain.renderDocumentSheet(doc, esc);
    const convertBtn = document.getElementById('btn-doc-convert-invoice');
    const revenueBtn = document.getElementById('btn-doc-reflect-revenue');
    const normalized = DocumentsBrain.normalizeDocument(doc);
    if (convertBtn) {
      const showConvert = normalized.type === 'estimate' && normalized.status !== 'converted';
      convertBtn.classList.toggle('hidden', !showConvert);
    }
    if (revenueBtn) {
      revenueBtn.classList.toggle('hidden', normalized.type !== 'invoice');
      if (normalized.type === 'invoice') {
        const linked = getDocumentLinkedRevenueState(normalized);
        revenueBtn.textContent = linked.state === 'linked' ? 'linked売上を開く' : '売上登録に反映';
      }
    }
    document.getElementById('documents-preview-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderDocumentsList() {
    const wrap = document.getElementById('documents-list-wrap');
    if (!wrap) return;
    const docs = DocumentsBrain.sortDocuments(Storage.getDocuments());
    if (!docs.length) {
      wrap.innerHTML = '<p class="placeholder-text">請求書・見積書はまだありません。「新規請求書」または「新規見積書」から作成できます。</p>';
      return;
    }
    wrap.innerHTML = `
      <table class="documents-table">
        <thead>
          <tr>
            <th>種別</th><th>番号</th><th>宛名</th><th>件名</th><th>発行日</th><th>金額</th><th>書類状態</th><th>入金状態</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${docs.map(d => {
            const n = DocumentsBrain.normalizeDocument(d);
            return `<tr>
              <td>${esc(DocumentsBrain.typeLabel(n.type))}</td>
              <td>${esc(n.number)}</td>
              <td>${esc(DocumentsBrain.customerDisplay(n))}</td>
              <td>${esc(n.title || '—')}</td>
              <td>${esc(n.issueDate)}</td>
              <td class="num">${esc(DocumentsBrain.formatYen(n.total))}</td>
              <td><span class="doc-status-badge status-${esc(n.status)}">${esc(DocumentsBrain.statusLabel(n.type, n.status))}</span></td>
              <td>${n.type === 'invoice' ? renderPaymentStatusBadge(n) : '—'}</td>
              <td class="actions">
                <button type="button" class="btn btn-secondary btn-sm" data-doc-action="edit" data-doc-id="${esc(n.id)}">編集</button>
                <button type="button" class="btn btn-secondary btn-sm" data-doc-action="preview" data-doc-id="${esc(n.id)}">プレビュー</button>
                <button type="button" class="btn btn-secondary btn-sm" data-doc-action="print" data-doc-id="${esc(n.id)}">印刷/PDF</button>
                ${n.type === 'estimate' && n.status !== 'converted' ? `<button type="button" class="btn btn-secondary btn-sm" data-doc-action="convert" data-doc-id="${esc(n.id)}">請求書へ変換</button>` : ''}
                <button type="button" class="btn btn-secondary btn-sm" data-doc-action="delete" data-doc-id="${esc(n.id)}">削除</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
    wrap.querySelectorAll('[data-doc-action]').forEach(btn => {
      btn.addEventListener('click', () => handleDocumentListAction(btn.dataset.docAction, btn.dataset.docId));
    });
  }

  function handleDocumentListAction(action, id) {
    const doc = Storage.getDocumentById(id);
    if (!doc) return;
    if (action === 'edit') openDocumentForm(doc.type, doc);
    else if (action === 'preview') openDocumentPreview(id);
    else if (action === 'print') {
      openDocumentPreview(id);
      setTimeout(() => printDocument(), 200);
    } else if (action === 'convert') convertEstimateToInvoice(id);
    else if (action === 'delete') {
      if (!confirm('この書類を削除しますか？')) return;
      Storage.deleteDocument(id);
      if (currentDocPreviewId === id) {
        currentDocPreviewId = null;
        showDocumentsPanel('list');
      }
      renderDocumentsList();
      renderReceivablesView();
      renderRevenueView();
      renderDashboard();
      showAppToast('削除しました');
    }
  }

  function convertEstimateToInvoice(estimateId) {
    const estimate = Storage.getDocumentById(estimateId);
    if (!estimate) return;
    if (!confirm('この見積書を請求書に変換しますか？\n元の見積書は「請求書へ変換済み」になります。')) return;
    const documents = Storage.getDocuments();
    const invoiceData = DocumentsBrain.convertEstimateToInvoice(estimate, documents);
    if (!invoiceData) return;
    const saved = Storage.addDocument(invoiceData);
    Storage.updateDocument(estimateId, { status: 'converted' });
    showAppToast('請求書に変換しました（No.' + saved.number + '）');
    openDocumentPreview(saved.id);
    renderDocumentsList();
  }

  function reflectDocumentToRevenue() {
    if (!currentDocPreviewId) return;
    reflectDocumentToRevenueForm(currentDocPreviewId);
  }

  function printDocument() {
    document.body.classList.add('doc-printing');
    const cleanup = () => {
      document.body.classList.remove('doc-printing');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 1000);
  }

  function renderDocumentsView() {
    try {
      renderDocumentsList();
      if (!currentDocPreviewId) showDocumentsPanel('list');
    } catch (err) {
      console.error('[Budil] render error: 請求書・見積書', err);
      const wrap = document.getElementById('documents-list-wrap');
      if (wrap) wrap.innerHTML = '<p class="section-render-error">表示中にエラーが発生しました。</p>';
    }
  }

  function initDocuments() {
    fillDocumentPaymentSelects();
    document.getElementById('btn-doc-new-invoice')?.addEventListener('click', () => {
      pendingLinkedRevenueId = '';
      updateDocFromRevenueNotice(null);
      openDocumentForm('invoice');
    });
    document.getElementById('btn-doc-new-estimate')?.addEventListener('click', () => openDocumentForm('estimate'));
    document.getElementById('btn-doc-back-list')?.addEventListener('click', () => {
      currentDocPreviewId = null;
      showDocumentsPanel('list');
    });
    document.getElementById('btn-doc-cancel')?.addEventListener('click', () => {
      resetDocumentsForm();
      showDocumentsPanel('list');
    });
    document.getElementById('btn-doc-back-from-preview')?.addEventListener('click', () => {
      currentDocPreviewId = null;
      showDocumentsPanel('list');
    });
    document.getElementById('btn-doc-preview-from-form')?.addEventListener('click', () => {
      const data = collectDocumentFormData();
      const body = document.getElementById('documents-preview-body');
      if (body) body.innerHTML = DocumentsBrain.renderDocumentSheet(data, esc);
      showDocumentsPanel('preview');
    });
    document.getElementById('btn-doc-edit-from-preview')?.addEventListener('click', () => {
      if (!currentDocPreviewId) return;
      const doc = Storage.getDocumentById(currentDocPreviewId);
      if (doc) openDocumentForm(doc.type, doc);
    });
    document.getElementById('btn-doc-print')?.addEventListener('click', printDocument);
    document.getElementById('btn-doc-convert-invoice')?.addEventListener('click', () => {
      if (currentDocPreviewId) convertEstimateToInvoice(currentDocPreviewId);
    });
    document.getElementById('btn-doc-reflect-revenue')?.addEventListener('click', reflectDocumentToRevenue);
    document.getElementById('btn-doc-add-item')?.addEventListener('click', () => {
      const type = document.getElementById('doc-type')?.value || 'invoice';
      const showUnit = document.getElementById('doc-show-unit')?.checked === true;
      const editor = document.getElementById('doc-items-editor');
      if (editor) {
        editor.appendChild(buildDocItemRow(
          { date: TODAY(), name: '', unitPrice: 0, quantity: 1, amount: 0, unit: '' },
          type === 'invoice',
          showUnit
        ));
      }
      updateDocTaxPreview();
    });
    document.getElementById('documents-form')?.addEventListener('submit', handleDocumentSubmit);
    ['doc-tax-display-mode', 'doc-tax-category', 'doc-tax-rounding', 'doc-line-rounding'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', onDocTaxSettingsChange);
    });
    ['doc-show-unit', 'doc-show-zero-tax', 'doc-show-tax-breakdown'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', onDocTaxSettingsChange);
    });
    document.getElementById('doc-type')?.addEventListener('change', (e) => {
      toggleDocFormFields(e.target.value);
      toggleDocPaymentFields(e.target.value);
      fillDocStatusOptions(e.target.value, 'draft');
    });
    document.getElementById('doc-payment-method')?.addEventListener('change', () => suggestDocumentPaymentFromMethod(true, true));
    document.getElementById('btn-doc-recalc-payment-date')?.addEventListener('click', recalculateDocumentExpectedPaymentDate);
    document.getElementById('doc-payment-status')?.addEventListener('change', () => {
      applyDocumentPaymentStatusDefaults();
    });
    ['doc-issue-date', 'doc-paid-amount'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', applyDocumentPaymentStatusDefaults);
    });
    fillDocTaxCategoryOptions('taxable10');
    renderDocumentsView();
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
    initStrategyMemoHub();
    initDashboard();
    initDailyActionTasks();
    initDemandRadar();
    initDemandPickup();
    initReception();
    initWorkOrder();
    initCalendarCandidate();
    initExternalCheck();
    initFollowUp();
    initProfit();
    initMonthlyResults();
    initAnalytics();
    initDemandSearch();
    initLeads();
    initRevenue();
    initReceivables();
    initDocuments();
    initCardParser();
    initFollowup();
    initDataManagement();
    initStartGuide();
  });
})();
