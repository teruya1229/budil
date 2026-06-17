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

  const SALES_TAB_FIELDS = { email: 'msg-email', form: 'msg-form', dm: 'msg-dm', phone: 'msg-phone' };
  const SALES_TAB_LOG = { email: 'メール送信', form: 'フォーム送信', dm: 'DM', phone: '電話' };

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
    renderBackupStatus();
    renderMorningReport();
    renderDemandInsights();
    renderSalesInsights();
    renderDashboardLists();
    renderDashRevenueSummary();
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
    return { today, records, settings, leads, monthKey, summary, comment, salesOutcome };
  }

  function renderSalesOutcomeHtml(outcome, options) {
    const opts = options || {};
    if (!outcome) return '';
    const lines = [
      `<div class="revenue-outcome-grid">`,
      `<div class="revenue-outcome-item"><span>紐付け売上</span><strong>${esc(RevenueBrain.formatYen(outcome.linkedTotal))}</strong></div>`,
      `<div class="revenue-outcome-item"><span>未紐付け売上</span><strong>${esc(RevenueBrain.formatYen(outcome.unlinkedTotal))}</strong></div>`,
      `<div class="revenue-outcome-item"><span>売上発生営業先</span><strong>${outcome.leadCount}件</strong></div>`,
      `<div class="revenue-outcome-item"><span>今月成約営業先</span><strong>${outcome.contractedCount}件</strong></div>`,
      `</div>`
    ];
    if (outcome.topLeads && outcome.topLeads.length) {
      lines.push('<p class="label-muted">売上上位営業先</p>');
      lines.push('<ul class="revenue-outcome-list">');
      outcome.topLeads.forEach(l => {
        lines.push(`<li><span>${esc(l.leadName)}</span><strong>${esc(RevenueBrain.formatYen(l.total))}</strong></li>`);
      });
      lines.push('</ul>');
    }
    if (outcome.unpaidLeads && outcome.unpaidLeads.length) {
      lines.push('<p class="label-muted">未入金がある営業先</p>');
      lines.push('<ul class="revenue-outcome-list">');
      outcome.unpaidLeads.forEach(l => {
        lines.push(`<li><span>${esc(l.leadName)}</span><strong>${esc(RevenueBrain.formatYen(l.unpaid))}</strong></li>`);
      });
      lines.push('</ul>');
    }
    if (opts.showComments) {
      const comments = RevenueBrain.buildSalesOutcomeComment(outcome);
      comments.forEach(c => lines.push(`<p class="revenue-outcome-comment">${esc(c)}</p>`));
    }
    return lines.join('');
  }

  function renderRevenueSummaryHtml(summary, comment, options) {
    const opts = options || {};
    const lines = [
      `<p class="revenue-summary-line">売上予定：<strong>${esc(RevenueBrain.formatYen(summary.planned))}</strong></p>`,
      `<p class="revenue-summary-line">入金済み：${esc(RevenueBrain.formatYen(summary.paid))}</p>`,
      `<p class="revenue-summary-line">未入金：${esc(RevenueBrain.formatYen(summary.unpaid))}</p>`,
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
      outcomeEl.innerHTML = renderSalesOutcomeHtml(salesOutcome, { showComments: true });
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
    return items;
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
      const ok = confirm('バックアップデータで現在のBudilデータを上書き復元します。よろしいですか？');
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
      mgmtOutcomeEl.innerHTML = renderSalesOutcomeHtml(rev.salesOutcome, { showComments: true });
    }

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
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">営業先が登録されていません</td></tr>';
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
    tbody.innerHTML = displayList.map(l => {
      const overdue = l.nextActionDate && l.nextActionDate < today && !l.salesPriorityExcluded;
      const nextActionNote = !l.nextAction ? ' <small class="sales-priority-warning">未設定</small>' : '';
      const revSummary = RevenueBrain.getLeadRevenueSummary(l.id, Storage.getRevenueRecords());
      const revenueHint = revSummary.count
        ? `<small class="lead-revenue-hint">売上: ${esc(RevenueBrain.formatYen(revSummary.total))}${revSummary.latestDate ? ' / 最新: ' + esc(revSummary.latestDate) : ''}</small>`
        : '';
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
        <td>${esc(l.nextAction || l.suggestedAction || '—')}${nextActionNote}</td>
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
      listEl.innerHTML = '<li class="placeholder-text">営業履歴はまだありません</li>';
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
    renderLeadRevenuePanel(leadId);

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
      container.innerHTML = '<p class="placeholder-text">この営業先に紐付いた売上はまだありません</p>';
      return;
    }
    const historyHtml = summary.records
      .filter(r => r.status !== 'キャンセル')
      .map(r => `
        <li>
          <strong>${esc(RevenueBrain.formatYen(r.amount))}</strong>
          <div class="lead-revenue-history-meta">
            <span>${esc(r.workDate || '—')}</span>
            <span>${esc(r.service || '—')}</span>
            <span class="revenue-status-badge revenue-status-${esc(r.status)}">${esc(r.status)}</span>
            <span class="revenue-status-badge revenue-payment-${esc(r.paymentStatus)}">${esc(r.paymentStatus)}</span>
          </div>
        </li>`).join('');
    container.innerHTML = `
      <div class="lead-revenue-summary">
        <div class="lead-revenue-summary-item"><span>売上合計</span><strong>${esc(RevenueBrain.formatYen(summary.total))}</strong></div>
        <div class="lead-revenue-summary-item"><span>入金済み</span><strong>${esc(RevenueBrain.formatYen(summary.paid))}</strong></div>
        <div class="lead-revenue-summary-item"><span>未入金</span><strong>${esc(RevenueBrain.formatYen(summary.unpaid))}</strong></div>
        <div class="lead-revenue-summary-item"><span>最新売上日</span><strong>${esc(summary.latestDate || '—')}</strong></div>
      </div>
      <ul class="lead-revenue-history">${historyHtml}</ul>`;
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
    document.getElementById('revenue-mark-won').checked = false;
    fillRevenueLeadSelect('');
    toggleRevenueLeadOptions();
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
      el.innerHTML = '<li class="placeholder-text">今月のデータがありません</li>';
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
      const empty = '<tr><td colspan="9" class="empty-state">今月の売上がありません</td></tr>';
      if (tbody) tbody.innerHTML = empty;
      if (cardList) cardList.innerHTML = '<p class="empty-state">今月の売上がありません</p>';
      return;
    }

    if (tbody) {
      tbody.innerHTML = records.map(r => `
        <tr>
          <td>${esc(r.workDate)}</td>
          <td>${esc(r.customerName)}</td>
          <td class="revenue-lead-label">${esc(RevenueBrain.resolveLeadLabel(r, leads))}</td>
          <td>${esc(r.service)}</td>
          <td>${esc(r.source)}</td>
          <td>${esc(RevenueBrain.formatYen(r.amount))}</td>
          <td><span class="revenue-status-badge revenue-status-${esc(r.status)}">${esc(r.status)}</span></td>
          <td><span class="revenue-status-badge revenue-payment-${esc(r.paymentStatus)}">${esc(r.paymentStatus)}</span></td>
          <td class="actions">${renderRevenueRowActions(r.id)}</td>
        </tr>`).join('');
    }

    if (cardList) {
      cardList.innerHTML = records.map(r => `
        <div class="revenue-card">
          <div class="revenue-card-header">
            <strong>${esc(r.customerName)}</strong>
            <span class="revenue-card-amount">${esc(RevenueBrain.formatYen(r.amount))}</span>
          </div>
          <p class="revenue-card-meta">${esc(r.workDate)} ｜ ${esc(r.service)} ｜ ${esc(r.source)}</p>
          <p class="revenue-card-meta">紐付け営業先: ${esc(RevenueBrain.resolveLeadLabel(r, leads))}</p>
          <p class="revenue-card-meta">
            <span class="revenue-status-badge revenue-status-${esc(r.status)}">${esc(r.status)}</span>
            <span class="revenue-status-badge revenue-payment-${esc(r.paymentStatus)}">${esc(r.paymentStatus)}</span>
          </p>
          ${r.memo ? `<p class="revenue-card-meta">${esc(r.memo)}</p>` : ''}
          <div class="revenue-card-actions">${renderRevenueRowActions(r.id)}</div>
        </div>`).join('');
    }

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
    const { summary, comment, settings, salesOutcome } = getRevenueContext();
    const summaryEl = document.getElementById('revenue-summary');
    const commentEl = document.getElementById('revenue-bantou-comment');
    const targetEl = document.getElementById('revenue-monthly-target');
    const outcomeEl = document.getElementById('revenue-sales-outcome');

    if (summaryEl) {
      summaryEl.innerHTML = [
        { label: '売上予定', value: RevenueBrain.formatYen(summary.planned) },
        { label: '確定', value: RevenueBrain.formatYen(summary.confirmed) },
        { label: '完了', value: RevenueBrain.formatYen(summary.completed) },
        { label: '入金済み', value: RevenueBrain.formatYen(summary.paid) },
        { label: '未入金', value: RevenueBrain.formatYen(summary.unpaid) },
        { label: '月間目標', value: RevenueBrain.formatYen(summary.monthlyTarget) },
        { label: '目標まで残り', value: RevenueBrain.formatYen(summary.remainingToTarget) },
        { label: '達成率', value: summary.achievementRate + '%' },
        { label: '残り日数', value: summary.daysLeft + '日' },
        { label: '1日あたり必要', value: RevenueBrain.formatYen(summary.dailyNeeded) }
      ].map(item => `
        <div class="revenue-summary-item">
          <span>${esc(item.label)}</span>
          <strong>${esc(item.value)}</strong>
        </div>`).join('');
    }
    if (commentEl) commentEl.textContent = comment;
    if (targetEl) targetEl.value = settings.monthlyTarget || '';
    if (outcomeEl) outcomeEl.innerHTML = renderSalesOutcomeHtml(salesOutcome);
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
    if (currentMessageLeadId === leadId) renderLeadRevenuePanel(leadId);
  }

  function initRevenue() {
    fillRevenueSelects();
    fillRevenueLeadSelect('');
    toggleRevenueLeadOptions();
    document.getElementById('revenue-form').addEventListener('submit', handleRevenueSubmit);
    document.getElementById('btn-revenue-cancel').addEventListener('click', resetRevenueForm);
    document.getElementById('revenue-lead').addEventListener('change', () => {
      toggleRevenueLeadOptions();
      document.getElementById('revenue-mark-won').checked = false;
    });
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
    initDemandRadar();
    initDemandSearch();
    initLeads();
    initRevenue();
    initCardParser();
    initFollowup();
    initDataManagement();
  });
})();
