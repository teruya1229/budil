/**
 * Budil v1.0 - 経営番頭（需要×営業統合判断）
 */
const ManagementBrain = {
  generate(ctx) {
    const { today, demand, enriched, followups, leads, warnings, radar } = ctx;
    const decisions = this.buildDecisions(demand, enriched, followups, radar);
    const tasks = this.buildTasks(demand, enriched, followups, today, radar);
    const todayPost = this.buildTodayPost(demand, radar);
    const todaySales = this.buildTodaySales(enriched);
    const cautions = this.buildCautions(warnings, leads, followups, today);
    const skipList = this.buildSkipList(demand, enriched, leads, radar);
    const budilMessage = this.buildGreeting(demand, enriched, decisions, radar);

    return {
      decisions: decisions.slice(0, 5),
      tasks: tasks.slice(0, 3),
      todayPost,
      todaySales,
      cautions,
      skipList,
      budilMessage,
      generatedAt: today
    };
  },

  buildDecisions(demand, enriched, followups, radar) {
    const decisions = [];
    let rank = 1;

    if (radar && radar.weeklyFocus && radar.topService && radar.topService.score > 0) {
      decisions.push({
        rank: rank++,
        title: '需要レーダー: ' + radar.weeklyFocus,
        action: radar.topService.name + '優先',
        detail: '外部需要メモ・過去ログからの週次判断'
      });
    }

    if (demand && demand.todayMove) {
      const m = demand.todayMove;
      decisions.push({
        rank: rank++,
        title: m.service + '需要上昇',
        action: '投稿優先',
        detail: m.action || m.reason
      });
    } else if (demand && demand.recommendedServices && demand.recommendedServices[0]) {
      const s = demand.recommendedServices[0];
      decisions.push({
        rank: rank++,
        title: s.name + 'の需要が注目',
        action: '需要サーチ結果を活用',
        detail: 'キーワード分析に基づく優先テーマ'
      });
    }

    const topLead = SalesBrain.getTodayTargets(enriched)[0];
    if (topLead) {
      const missionType = /管理|民泊|工務|設備/.test(topLead.industry || topLead.memo || '')
        ? topLead.industry || '営業先'
        : topLead.recommendedProduct;
      decisions.push({
        rank: rank++,
        title: missionType + '営業',
        action: topLead.suggestedAction,
        detail: topLead.company + ' — ' + topLead.displayReason
      });
    }

    const reProposal = enriched.find(l =>
      l.effectivePriority === 'A' && (l.status === 'アプローチ中' || l.status === '商談中') &&
      l.recommendedProduct === 'AI帳票番頭'
    );
    if (reProposal) {
      decisions.push({
        rank: rank++,
        title: 'AI帳票番頭再提案',
        action: '再連絡',
        detail: reProposal.company + ' — ' + reProposal.displayReason
      });
    } else {
      const aLeads = enriched.filter(l => l.effectivePriority === 'A' && l.status !== '未接触');
      if (aLeads[0] && decisions.length < 5) {
        decisions.push({
          rank: rank++,
          title: aLeads[0].recommendedProduct + 'フォロー',
          action: aLeads[0].suggestedAction,
          detail: aLeads[0].company
        });
      }
    }

    const overdue = followups.find(f =>
      f.nextContact && f.nextContact <= new Date().toISOString().slice(0, 10) &&
      !['成約', '見送り', 'NG'].includes(f.status)
    );
    if (overdue && decisions.length < 5) {
      decisions.push({
        rank: rank++,
        title: overdue.company + 'への追客',
        action: 'フォロー連絡',
        detail: '次回連絡日超過'
      });
    }

    if (!decisions.length) {
      decisions.push({
        rank: 1,
        title: '需要サーチを実行',
        action: 'データ入力',
        detail: '分析データを貼り付けて今日の判断を更新'
      });
    }

    return decisions.map((d, i) => ({ ...d, rank: i + 1 }));
  },

  buildTasks(demand, enriched, followups, today, radar) {
    const tasks = [];

    if (radar && radar.weeklyFocus && radar.topService && radar.topService.score > 0) {
      tasks.push(radar.weeklyFocus.replace(/^今週は/, '') + 'に注力');
    }

    const postTheme = (demand && demand.postThemes && demand.postThemes[0])
      || (demand && demand.todayMove && demand.todayMove.action)
      || 'SNS投稿';
    const postShort = postTheme.replace(/今日は「|」投稿を優先してください。?/g, '').slice(0, 30);
    tasks.push(postShort.includes('投稿') ? postShort : postShort + '投稿');

    const topLead = SalesBrain.getTodayTargets(enriched)[0];
    if (topLead) {
      tasks.push(topLead.company + 'へ営業');
    }

    const overdueFu = followups
      .filter(f => f.nextContact && f.nextContact <= today && !['成約', '見送り', 'NG'].includes(f.status))
      .sort((a, b) => (a.nextContact || '').localeCompare(b.nextContact || ''))[0];
    const recontactLead = enriched.find(l => l.suggestedAction === '再連絡' && l.effectivePriority !== 'C');
    if (overdueFu) {
      tasks.push(overdueFu.company + 'へ再連絡');
    } else if (recontactLead) {
      tasks.push(recontactLead.company + 'へ再連絡');
    }

    if (tasks.length < 3 && topLead && !tasks.includes(topLead.company + 'へ営業')) {
      const second = enriched[1];
      if (second) tasks.push(second.company + 'へ' + second.suggestedAction);
    }

    while (tasks.length < 3) {
      const fillers = ['需要サーチデータを更新', '営業リストを見直す', '追客ステータスを更新'];
      tasks.push(fillers[tasks.length] || 'メモを整理');
    }

    return tasks.slice(0, 3);
  },

  buildTodayPost(demand, radar) {
    const theme = (demand && demand.postThemes && demand.postThemes[0])
      || (radar && radar.topService && radar.topService.score > 0 && radar.topService.name + 'の需要チェック')
      || (demand && demand.todayMove && demand.todayMove.action && demand.todayMove.action.replace(/今日は「|」投稿を優先してください。/g, ''))
      || (demand && demand.themes && demand.themes[0] && demand.themes[0].replace(/「|」/g, ''))
      || '需要サーチでテーマを分析してください';

    const copyText = typeof theme === 'string' && theme.startsWith('📌')
      ? theme
      : `📌 ${theme}\n\n沖縄の現場業向けに、今日のトレンドを発信します。\n\n#沖縄 #現場業 #${String(theme).replace(/\s+/g, '').slice(0, 15)}`;

    return { theme: theme.replace(/^📌\s*/, '').split('\n')[0], copyText };
  },

  buildTodaySales(enriched) {
    const top = SalesBrain.getTodayTargets(enriched)[0];
    if (!top) {
      return {
        company: '（営業先未登録）',
        product: '—',
        action: '営業先を追加してください',
        priorityLabel: '—',
        priorityReason: '',
        salesStatus: '',
        nextAction: '',
        nextActionDate: '',
        presetLabel: '',
        copyText: ''
      };
    }
    const presetLabel = top.salesPreset && typeof MessageTemplates !== 'undefined' && MessageTemplates.getPresetLabel
      ? (MessageTemplates.getPresetLabel(top.salesPreset) || '')
      : '';
    const productText = presetLabel ? `本日は「${presetLabel}」で営業` : top.recommendedProduct;
    const nextActionText = top.nextAction || top.suggestedAction || '（未設定）';
    const copyText = [
      `【本日の営業先】${top.company}`,
      `優先度${top.priorityLabel}：${top.company}`,
      `理由：${top.priorityReason}`,
      `次アクション：${nextActionText}`,
      presetLabel ? `プリセット：${presetLabel}` : '',
      `営業ステータス：${top.salesStatus}`,
      `推奨商品: ${top.recommendedProduct}`
    ].filter(Boolean).join('\n');

    return {
      company: top.company,
      product: productText,
      action: nextActionText,
      priorityLabel: top.priorityLabel,
      priorityReason: top.priorityReason,
      salesStatus: top.salesStatus,
      nextAction: top.nextAction || top.suggestedAction || '',
      nextActionDate: top.nextActionDate || '',
      presetLabel,
      copyText
    };
  },

  buildCautions(warnings, leads, followups, today) {
    const cautions = warnings.map(w => w.text);

    const ngRecent = leads.filter(l => l.status === 'NG').length;
    const ngFollowup = followups.filter(f => f.status === 'NG').length;
    const totalNg = ngRecent + ngFollowup;
    if (totalNg >= 3) {
      cautions.push('NG・見送り案件が ' + totalNg + ' 件 — 提案方針の見直しを検討');
    }

    const stale = leads.filter(l => {
      const d = SalesBrain.daysSince(l.lastContact, today);
      return d !== null && d >= 14 && !['NG', '見送り', '成約'].includes(l.status);
    });
    if (stale.length && !cautions.some(c => c.includes('日以上連絡なし'))) {
      cautions.push('長期未接触の営業先が ' + stale.length + ' 件');
    }

    const stalled = leads.filter(l => l.status === '商談中' && SalesBrain.daysSince(l.lastContact, today) >= 7);
    if (stalled.length && !cautions.some(c => c.includes('商談中'))) {
      cautions.push('商談停滞が ' + stalled.length + ' 件');
    }

    if (!cautions.length) {
      cautions.push('重大な注意点はありません — 計画通り進めましょう');
    }

    return cautions.slice(0, 8);
  },

  buildSkipList(demand, enriched, leads, radar) {
    const skip = [];

    if (radar && radar.decreasingTrends && radar.decreasingTrends.length) {
      radar.decreasingTrends.slice(0, 2).forEach(t => {
        skip.push({ item: '「' + t.label + '」関連の強化施策', reason: '需要トレンドが減少傾向' });
      });
    }

    const hasDemand = demand && demand.keywords && demand.keywords.length;
    const acDemand = demand && demand.recommendedServices &&
      demand.recommendedServices.some(s => /エアコン/.test(s.name));
    if (!acDemand) {
      skip.push({ item: 'エアコン広告調整', reason: '需要データでエアコン上昇が確認できない' });
    }

    if (!hasDemand) {
      skip.push({ item: '新規広告キャンペーン開始', reason: '需要サーチデータが未分析' });
    }

    const downKeywords = (demand && demand.keywordScores || [])
      .filter(k => k.level === '下降')
      .slice(0, 2);
    downKeywords.forEach(k => {
      skip.push({ item: '「' + k.keyword + '」関連の投稿・広告', reason: '需要スコアが下降' });
    });

    const cOnly = enriched.filter(l => l.effectivePriority === 'C').length;
    if (cOnly > 3) {
      skip.push({ item: 'C優先リードへの新規アプローチ', reason: 'A・B優先案件を先に処理' });
    }

    const ngCount = leads.filter(l => l.status === 'NG').length;
    if (ngCount > 0) {
      skip.push({ item: 'NGリストへの再アプローチ', reason: 'NG案件は ' + ngCount + ' 件（方針見直しまで保留）' });
    }

    if (!skip.length) {
      skip.push({ item: '特になし', reason: '今日は計画通りに進めて問題ありません' });
    }

    return skip.slice(0, 5);
  },

  buildGreeting(demand, enriched, decisions, radar) {
    const lines = ['おはようございます。'];
    const topDecision = decisions[0];

    if (radar && radar.weeklyFocus && radar.topService && radar.topService.score > 0) {
      lines.push('需要レーダーでは「' + radar.weeklyFocus + '」が今週の狙いです。');
    }

    if (demand && demand.todayMove) {
      const svc = demand.todayMove.service;
      lines.push('本日は' + svc + 'の需要が上昇しています。');
      if (/管理|民泊/.test(demand.todayMove.action || '')) {
        lines.push('管理会社向け営業を優先してください。');
      } else if (/洗濯|ドラム/.test(svc)) {
        lines.push('管理会社向け営業と洗濯機投稿を優先してください。');
      } else {
        lines.push((demand.todayMove.action || '投稿を優先').replace(/今日は/, ''));
      }
    } else if (topDecision) {
      lines.push('本日の最優先は「' + topDecision.title + '」です。');
      lines.push(topDecision.action + 'から始めましょう。');
    } else {
      lines.push('まず需要サーチ番頭でデータを分析し、今日の判断を更新しましょう。');
    }

    const aCount = enriched.filter(l => l.effectivePriority === 'A').length;
    if (aCount > 0) {
      lines.push('A優先の営業先が ' + aCount + ' 件あります。');
    }

    return lines.join('\n');
  }
};
