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
      setIfExists('lead-next-contact', addDaysFromToday(preset.nextContactOffsetDays));
    }
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
    salesEl.innerHTML = `
      <p class="mgmt-highlight"><strong>${esc(report.todaySales.company)}</strong></p>
      <p class="mgmt-meta">${esc(report.todaySales.product)} — ${esc(report.todaySales.action)}</p>
      <textarea class="mgmt-copy-text" id="mgmt-sales-text" readonly rows="3">${esc(report.todaySales.copyText)}</textarea>
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
      targetsEl.innerHTML = targets.map(l => `
        <div class="sales-target-card sales-target-clickable" data-open-lead="${esc(l.id)}" role="button" tabindex="0">
          <div class="sales-target-header">
            <strong class="sales-target-company">${esc(l.company)}</strong>
            <span class="priority-badge priority-${l.effectivePriority}">${l.effectivePriority}ランク</span>
          </div>
          <p class="sales-target-product">${esc(l.productLabel)}</p>
          <p class="sales-target-reason"><span>理由：</span>${esc(l.displayReason)}</p>
          <p class="sales-target-action">次の行動: <strong>${esc(l.suggestedAction)}</strong></p>
          <p class="sales-target-open-hint">タップして営業文面を表示 →</p>
        </div>`).join('');

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
    const list = enriched.slice().sort((a, b) => priorityOrder(a.effectivePriority) - priorityOrder(b.effectivePriority));

    if (!list.length && !Storage.getLeads().length) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state">営業先が登録されていません</td></tr>';
      return;
    }

    const allLeads = Storage.getLeads();
    const closed = allLeads.filter(l => ['NG', '見送り', '成約'].includes(l.status));
    const displayList = [...list, ...closed.map(l => SalesBrain.enrichLead(l, Storage.getGeneratedPosts(), settings, TODAY()))];

    const today = TODAY();
    tbody.innerHTML = displayList.map(l => {
      const aiBadge = settings.aiPriorityEnabled !== false && !l.priorityManual && l.aiPriority !== l.priority
        ? `<span class="ai-badge" title="AI判定">AI</span>` : '';
      return `
      <tr class="${l.nextContact && l.nextContact < today && !CLOSED_STATUSES.includes(l.status) ? 'row-overdue' : ''}">
        <td>
          <span class="priority-badge priority-${l.effectivePriority}">${l.effectivePriority}</span>
          ${aiBadge}
        </td>
        <td><button type="button" class="lead-company-link" data-open-lead="${esc(l.id)}">${esc(l.company)}</button></td>
        <td>${esc(l.recommendedProduct || '—')}</td>
        <td>${esc(l.suggestedAction || '—')}</td>
        <td>${esc(l.region || '—')}</td>
        <td>${esc(l.industry || '—')}</td>
        <td><span class="status-badge status-${esc(l.status)}">${esc(l.status)}</span></td>
        <td>${esc(l.nextContact || '—')}</td>
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

    if (id) Storage.updateLead(id, data);
    else Storage.addLead(data);

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
    if (lead && lead.status === '未接触' && type !== '電話') {
      Storage.updateLead(currentMessageLeadId, { status: 'アプローチ中', lastContact: TODAY() });
      renderLeadsTable();
    } else if (lead && type === '電話') {
      Storage.updateLead(currentMessageLeadId, { lastContact: TODAY() });
      renderLeadsTable();
    }
    renderSalesHistory(currentMessageLeadId);
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
    priEl.textContent = enriched.effectivePriority + 'ランク';
    priEl.className = 'priority-badge priority-' + enriched.effectivePriority;
    document.getElementById('sales-detail-reason').textContent = enriched.displayReason || '—';

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
      if (e.target.id !== 'card-preview') fileInput.click();
    });
    uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', e => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      if (e.dataTransfer.files[0]?.type.startsWith('image/')) handleCardImage(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleCardImage(fileInput.files[0]); });

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
    Storage.saveCardDraft({
      fields: getCardFormFields(),
      imageData: preview.classList.contains('hidden') ? '' : preview.src
    });
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
    const reader = new FileReader();
    reader.onload = async e => {
      const preview = document.getElementById('card-preview');
      preview.src = e.target.result;
      preview.classList.remove('hidden');
      document.querySelector('#card-upload-area .upload-placeholder').style.display = 'none';

      const statusEl = document.getElementById('card-ocr-status');
      statusEl.textContent = '名刺画像を読み込み中...';

      const result = await CardOCR.extractFromImage(file);
      statusEl.textContent = result.message;

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
    };
    reader.readAsDataURL(file);
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
    syncTodayDemandFromLog();
    initNavigation();
    initDashboard();
    initDemandRadar();
    initDemandSearch();
    initLeads();
    initCardParser();
    initFollowup();
    initDataManagement();
  });
})();
