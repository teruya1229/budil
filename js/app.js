/**
 * Budil MVP v0.1 - メインアプリケーション
 */
(function () {
  'use strict';

  let currentFollowupFilter = 'all';
  let currentMessageLeadId = null;

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
    renderMorningReport();
    renderDemandInsights();
    renderSalesInsights();
    renderDashboardLists();
  }

  function getManagementContext() {
    const salesCtx = getSalesContext();
    const warnings = SalesBrain.collectWarnings(salesCtx.leads, salesCtx.followups, salesCtx.today);
    const report = ManagementBrain.generate({ ...salesCtx, warnings });
    return { ...salesCtx, warnings, report };
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
    salesEl.innerHTML = `
      <p class="mgmt-highlight"><strong>${esc(report.todaySales.company)}</strong></p>
      <p class="mgmt-meta">${esc(report.todaySales.product)} — ${esc(report.todaySales.action)}</p>
      <textarea class="mgmt-copy-text" id="mgmt-sales-text" readonly rows="3">${esc(report.todaySales.copyText)}</textarea>
      <button class="btn btn-sm btn-copy" data-copy-target="mgmt-sales-text">コピー</button>`;

    document.getElementById('mgmt-cautions').innerHTML = report.cautions.map(c =>
      `<li class="caution-item">⚠ ${esc(c)}</li>`).join('');

    document.getElementById('mgmt-skip').innerHTML = report.skipList.map(s =>
      `<li class="skip-item"><strong>${esc(s.item)}</strong><span>理由: ${esc(s.reason)}</span></li>`).join('');

    postEl.querySelector('[data-copy-target]').addEventListener('click', handleMgmtCopy);
    salesEl.querySelector('[data-copy-target]').addEventListener('click', handleMgmtCopy);

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
        <div class="sales-target-card">
          <div class="sales-target-header">
            <strong class="sales-target-company">${esc(l.company)}</strong>
            <span class="priority-badge priority-${l.effectivePriority}">${l.effectivePriority}ランク</span>
          </div>
          <p class="sales-target-product">${esc(l.productLabel)}</p>
          <p class="sales-target-reason"><span>理由：</span>${esc(l.displayReason)}</p>
          <p class="sales-target-action">次の行動: <strong>${esc(l.suggestedAction)}</strong></p>
        </div>`).join('');
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

  // ── 需要サーチ ──
  function initDemandSearch() {
    const fields = ['demand-trends', 'demand-ads', 'demand-gsc', 'demand-ga4', 'demand-instagram'];
    const data = Storage.getDemandNotes();
    const map = { trends: 'demand-trends', ads: 'demand-ads', gsc: 'demand-gsc', ga4: 'demand-ga4', instagram: 'demand-instagram' };

    Object.entries(map).forEach(([key, id]) => {
      const el = document.getElementById(id);
      el.value = data[key] || '';
      el.addEventListener('input', debounce(() => {
        Storage.saveDemandNotes({
          trends: document.getElementById('demand-trends').value,
          ads: document.getElementById('demand-ads').value,
          gsc: document.getElementById('demand-gsc').value,
          ga4: document.getElementById('demand-ga4').value,
          instagram: document.getElementById('demand-instagram').value
        });
      }, 500));
    });

    document.getElementById('btn-analyze-demand').addEventListener('click', analyzeDemand);

    const saved = Storage.getGeneratedPosts();
    if (saved) renderDemandOutput(saved);
    renderDemandInsights();
  }

  function analyzeDemand() {
    const text = ['demand-trends', 'demand-ads', 'demand-gsc', 'demand-ga4', 'demand-instagram']
      .map(id => document.getElementById(id).value).join('\n');

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
      analyzedAt: new Date().toISOString()
    };
    Storage.saveGeneratedPosts(output);
    renderDemandOutput(output);
    renderDemandInsights();

    const settings = Storage.getSettings();
    const themeText = brain.postThemes[0] || (themes[0] ? themes[0].replace(/「|」/g, '') : '');
    if (themeText) {
      settings.postTheme = themeText;
      Storage.saveSettings(settings);
      document.getElementById('dash-post-theme').value = settings.postTheme;
    }
    renderDashboard();
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
          <p class="placeholder-text">需要サーチ番頭で「分析する」を実行すると、実データに切り替わります</p>
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
    document.getElementById('btn-close-messages').addEventListener('click', () => {
      document.getElementById('messages-panel').classList.add('hidden');
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

    document.getElementById('lead-priority').addEventListener('change', () => {
      document.getElementById('lead-edit-id').dataset.priorityTouched = '1';
    });

    document.getElementById('lead-status').addEventListener('change', toggleNgReason);
    document.querySelectorAll('.btn-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const ta = document.getElementById(btn.dataset.copy);
        copyText(ta.value).then(() => {
          btn.textContent = 'コピー済み';
          setTimeout(() => { btn.textContent = 'コピー'; }, 1500);
        }).catch(() => alert('コピーに失敗しました。テキストを手動で選択してください。'));
      });
    });

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
        <td><strong>${esc(l.company)}</strong></td>
        <td>${esc(l.recommendedProduct || '—')}</td>
        <td>${esc(l.suggestedAction || '—')}</td>
        <td>${esc(l.region || '—')}</td>
        <td>${esc(l.industry || '—')}</td>
        <td><span class="status-badge status-${esc(l.status)}">${esc(l.status)}</span></td>
        <td>${esc(l.nextContact || '—')}</td>
        <td class="actions">
          <button class="btn-edit" data-edit-lead="${l.id}">編集</button>
          <button class="btn-edit" data-msg-lead="${l.id}">文面</button>
          <button class="btn-danger" data-delete-lead="${l.id}">削除</button>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-edit-lead]').forEach(b =>
      b.addEventListener('click', () => openLeadModal(b.dataset.editLead)));
    tbody.querySelectorAll('[data-msg-lead]').forEach(b =>
      b.addEventListener('click', () => showMessages(b.dataset.msgLead)));
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
      const fields = ['company', 'region', 'industry', 'url', 'contact', 'email', 'phone',
        'contactForm', 'sns', 'service', 'priority', 'status', 'lastContact', 'nextContact', 'ngReason', 'memo'];
      fields.forEach(f => {
        const el = document.getElementById('lead-' + f.replace(/([A-Z])/g, '-$1').toLowerCase());
        if (el) el.value = item[f] || '';
      });
      toggleNgReason();
    } else {
      document.getElementById('lead-modal-title').textContent = '営業先を追加';
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
      priorityManual: priorityTouched || (!id && document.getElementById('lead-priority').value !== 'B')
    };

    if (id) Storage.updateLead(id, data);
    else Storage.addLead(data);

    closeLeadModal();
    renderLeadsTable();
    renderDashboard();
  }

  function showMessages(leadId) {
    const lead = Storage.getLeads().find(l => l.id === leadId);
    if (!lead) return;
    currentMessageLeadId = leadId;

    const msgs = MessageTemplates.generateAll(lead);
    document.getElementById('messages-company-name').textContent = lead.company;
    document.getElementById('msg-email').value = msgs.email;
    document.getElementById('msg-form').value = msgs.form;
    document.getElementById('msg-dm').value = msgs.dm;
    document.getElementById('msg-phone').value = msgs.phone;

    const allMsgs = Storage.getGeneratedMessages();
    allMsgs[leadId] = msgs;
    Storage.saveGeneratedMessages(allMsgs);

    document.getElementById('messages-panel').classList.remove('hidden');
    document.getElementById('messages-panel').scrollIntoView({ behavior: 'smooth' });
  }

  // ── 名刺解析 ──
  function initCardParser() {
    const uploadArea = document.getElementById('card-upload-area');
    const fileInput = document.getElementById('card-file-input');

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', e => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      if (e.dataTransfer.files[0]?.type.startsWith('image/')) handleCardImage(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleCardImage(fileInput.files[0]); });
    document.getElementById('btn-add-to-leads').addEventListener('click', addCardToLeads);
  }

  function handleCardImage(file) {
    const reader = new FileReader();
    reader.onload = e => {
      const preview = document.getElementById('card-preview');
      preview.src = e.target.result;
      preview.classList.remove('hidden');
      document.querySelector('.upload-placeholder').style.display = 'none';
      showCardPlaceholder();
    };
    reader.readAsDataURL(file);
  }

  function showCardPlaceholder() {
    const placeholder = '（OCR連携後に自動入力）';
    ['extract-company', 'extract-name', 'extract-title', 'extract-email',
      'extract-phone', 'extract-url', 'extract-memo'].forEach(id => {
      document.getElementById(id).value = placeholder;
    });
    document.getElementById('btn-add-to-leads').disabled = true;
  }

  function addCardToLeads() {
    const company = document.getElementById('extract-company').value;
    if (!company || company.includes('OCR')) return;
    Storage.addLead({
      company,
      contact: document.getElementById('extract-name').value,
      url: document.getElementById('extract-url').value,
      email: document.getElementById('extract-email').value,
      phone: document.getElementById('extract-phone').value,
      service: '',
      priority: 'B',
      status: '未接触',
      memo: '名刺解析から追加（役職: ' + document.getElementById('extract-title').value + '）'
    });
    alert('営業リストに追加しました。');
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
    initNavigation();
    initDashboard();
    initDemandSearch();
    initLeads();
    initCardParser();
    initFollowup();
  });
})();
