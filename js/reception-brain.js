/**
 * Budil v3.4 - 受付・予約番頭（AI番頭連携入口）
 */
const ReceptionBrain = {
  STATUSES: ['new', 'lead_created', 'task_created', 'revenue_candidate', 'done', 'archived'],

  STATUS_LABELS: {
    new: '新規受付',
    lead_created: '営業先作成済み',
    task_created: 'タスク作成済み',
    revenue_candidate: '売上候補',
    done: '対応済み',
    archived: '保管'
  },

  PASTE_LABELS: [
    { key: 'source', labels: ['依頼元：', '依頼元:', 'source：', 'source:'] },
    { key: 'customerName', labels: ['お客様名：', 'お客様名:', '顧客名：', '顧客名:', 'customerName：', 'customerName:'] },
    { key: 'phone', labels: ['電話番号：', '電話番号:', '電話：', '電話:', 'phone：', 'phone:'] },
    { key: 'address', labels: ['住所：', '住所:', 'address：', 'address:'] },
    { key: 'serviceText', labels: ['作業内容：', '作業内容:', 'サービス：', 'サービス:', 'serviceText：', 'serviceText:'] },
    { key: 'preferredDatesText', labels: ['希望日：', '希望日:', 'preferredDatesText：', 'preferredDatesText:'] },
    { key: 'memo', labels: ['受付メモ：', '受付メモ:', 'メモ：', 'メモ:', 'memo：', 'memo:'] },
    { key: 'estimateAmount', labels: ['概算金額：', '概算金額:', '金額：', '金額:', 'estimateAmount：', 'estimateAmount:'] },
    { key: 'handlingStatus', labels: ['対応状況：', '対応状況:', 'handlingStatus：', 'handlingStatus:'] }
  ],

  normalizeIntake(raw) {
    const now = new Date().toISOString();
    const item = raw && typeof raw === 'object' ? { ...raw } : {};
    const amount = item.estimateAmount;
    let estimateAmount = 0;
    if (typeof amount === 'number' && !Number.isNaN(amount)) {
      estimateAmount = amount;
    } else if (amount != null && amount !== '') {
      const parsed = parseInt(String(amount).replace(/[^\d]/g, ''), 10);
      estimateAmount = Number.isNaN(parsed) ? 0 : parsed;
    }
    const status = this.STATUSES.includes(item.status) ? item.status : 'new';
    return {
      id: item.id || '',
      source: String(item.source || '').trim(),
      customerName: String(item.customerName || '').trim(),
      phone: String(item.phone || '').trim(),
      address: String(item.address || '').trim(),
      serviceText: String(item.serviceText || '').trim(),
      preferredDatesText: String(item.preferredDatesText || '').trim(),
      memo: String(item.memo || '').trim(),
      estimateAmount,
      handlingStatus: String(item.handlingStatus || '').trim(),
      status,
      relatedLeadId: String(item.relatedLeadId || '').trim(),
      relatedRevenueId: String(item.relatedRevenueId || '').trim(),
      relatedTaskIds: Array.isArray(item.relatedTaskIds) ? item.relatedTaskIds.map(String) : [],
      createdAt: item.createdAt || now,
      updatedAt: item.updatedAt || now,
      isDemo: item.isDemo === true,
      isTest: item.isTest === true
    };
  },

  parseAiBantouPaste(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return this.normalizeIntake({});

    const jsonResult = this._tryParseJson(trimmed);
    if (jsonResult) return this.normalizeIntake(jsonResult);

    const parsed = {};
    const lines = trimmed.split(/\r?\n/);
    lines.forEach(line => {
      const row = line.trim();
      if (!row) return;
      this.PASTE_LABELS.forEach(({ key, labels }) => {
        labels.forEach(label => {
          if (row.startsWith(label)) {
            parsed[key] = row.slice(label.length).trim();
          }
        });
      });
    });
    return this.normalizeIntake(parsed);
  },

  _tryParseJson(text) {
    if (!text.startsWith('{') && !text.startsWith('[')) return null;
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data) && data[0]) return data[0];
      if (data && typeof data === 'object') return data;
    } catch {
      return null;
    }
    return null;
  },

  suggestNextAction(intake) {
    const ctx = [intake.memo, intake.serviceText, intake.handlingStatus].join(' ');
    if (/写真|型番|画像/.test(ctx)) return '写真・型番の確認';
    if (/日程|希望日|調整/.test(ctx) || intake.preferredDatesText) return '日程調整・空き確認';
    if (/見積|金額|概算/.test(ctx) || intake.estimateAmount > 0) return '見積内容の確認';
    if (intake.handlingStatus) return intake.handlingStatus;
    return '受付内容の確認・返信';
  },

  mapHandlingToSalesStatus(handlingStatus) {
    const h = handlingStatus || '';
    if (/日程|調整/.test(h)) return '日程調整中';
    if (/見積|提案/.test(h)) return '見積り・提案中';
    if (/興味|検討/.test(h)) return '興味あり';
    return '未営業';
  },

  buildLeadMemo(intake) {
    const parts = [];
    if (intake.serviceText) parts.push('作業：' + intake.serviceText);
    if (intake.preferredDatesText) parts.push('希望日：' + intake.preferredDatesText);
    if (intake.memo) parts.push(intake.memo);
    if (intake.handlingStatus) parts.push('対応状況：' + intake.handlingStatus);
    return parts.join('\n');
  },

  buildActivityLogText(intake) {
    const parts = ['AI番頭受付'];
    if (intake.serviceText) parts.push(intake.serviceText);
    if (intake.preferredDatesText) parts.push('希望日 ' + intake.preferredDatesText);
    if (intake.memo) parts.push(intake.memo);
    return parts.filter(Boolean).join('：').replace(/^AI番頭受付：/, 'AI番頭受付：');
  },

  createLeadFromIntake(intake, today) {
    const normalized = this.normalizeIntake(intake);
    const nextAction = this.suggestNextAction(normalized);
    const salesStatus = this.mapHandlingToSalesStatus(normalized.handlingStatus);
    const priority = /写真|型番|完全分解|日程/.test(
      [normalized.memo, normalized.serviceText, normalized.handlingStatus].join(' ')
    ) ? 'A' : 'B';
    const legacyStatus = salesStatus === '未営業' ? '未接触' : '商談中';

    return {
      company: normalized.customerName || '（名前未入力）',
      phone: normalized.phone,
      address: normalized.address,
      region: normalized.address ? normalized.address.slice(0, 20) : '',
      source: normalized.source,
      memo: this.buildLeadMemo(normalized),
      salesStatus,
      status: legacyStatus,
      priority,
      nextAction,
      nextActionDate: today || new Date().toISOString().slice(0, 10),
      nextContact: today || new Date().toISOString().slice(0, 10),
      service: normalized.serviceText || '',
      intakeSourceId: normalized.id
    };
  },

  buildTaskVariants(intake) {
    const name = intake.customerName || 'お客様';
    const tasks = [];
    const scheduleTitle = `受付対応：${name}の日程確認`;
    tasks.push({
      title: scheduleTitle,
      reason: 'AI番頭受付データから',
      priority: '高'
    });
    if (/写真|型番|画像/.test([intake.memo, intake.serviceText].join(''))) {
      const svc = intake.serviceText ? intake.serviceText.slice(0, 24) : '作業内容';
      tasks.push({
        title: `写真確認：${name}の${svc}`,
        reason: '型番・写真確認が必要',
        priority: '高'
      });
    }
    return tasks;
  },

  buildTaskDedupeKey(date, intakeId, title) {
    return ['intake', date, intakeId, title].join('|');
  },

  createTaskFromIntake(intake, today, variantIndex) {
    const normalized = this.normalizeIntake(intake);
    const variants = this.buildTaskVariants(normalized);
    const variant = variants[variantIndex != null ? variantIndex : 0] || variants[0];
    if (!variant) return null;
    const date = today || new Date().toISOString().slice(0, 10);
    return {
      title: variant.title,
      targetName: normalized.customerName || '—',
      priority: variant.priority,
      action: variant.title,
      memo: normalized.memo || '',
      dueDate: date,
      status: 'open',
      reason: variant.reason,
      leadId: normalized.relatedLeadId || '',
      leadName: normalized.customerName || '',
      pickupDedupeKey: this.buildTaskDedupeKey(date, normalized.id, variant.title),
      intakeId: normalized.id
    };
  },

  buildRevenueCandidate(intake) {
    const normalized = this.normalizeIntake(intake);
    return {
      customerName: normalized.customerName,
      service: normalized.serviceText,
      source: normalized.source,
      amount: normalized.estimateAmount,
      memo: [normalized.memo, normalized.preferredDatesText ? '希望日：' + normalized.preferredDatesText : '']
        .filter(Boolean).join(' / '),
      leadId: normalized.relatedLeadId || '',
      intakeId: normalized.id,
      status: 'revenue_candidate'
    };
  },

  matchRevenueService(serviceText) {
    const text = serviceText || '';
    if (typeof RevenueBrain === 'undefined') return 'その他';
    const services = RevenueBrain.SERVICES || [];
    const hit = services.find(s => s !== 'その他' && text.includes(s));
    if (hit) return hit;
    if (/完全分解/.test(text)) return 'エアコン完全分解';
    if (/お掃除機能/.test(text)) return 'お掃除機能付きエアコン';
    if (/エアコン/.test(text)) return 'エアコン通常';
    if (/洗濯/.test(text)) return '洗濯機クリーニング';
    if (/レンジ|換気/.test(text)) return 'レンジフード';
    if (/浴室|風呂/.test(text)) return '浴室';
    if (/キッチン/.test(text)) return 'キッチン';
    return 'その他';
  },

  matchRevenueSource(source) {
    const s = source || '';
    if (typeof RevenueBrain === 'undefined') return 'その他';
    const sources = RevenueBrain.SOURCES || [];
    if (sources.includes(s)) return s;
    if (/くらしのマーケット|ココナラ|おてがる/.test(s)) return 'くらしのマーケット';
    if (/LINE/i.test(s)) return 'LINE';
    if (/紹介/.test(s)) return '紹介';
    if (/Google|GBP|ビジネスプロフィール/.test(s)) return 'Googleビジネスプロフィール';
    return 'その他';
  },

  getReceptionSummary(intakes, today) {
    const list = (intakes || []).map(i => this.normalizeIntake(i));
    const active = list.filter(i => i.status !== 'archived' && i.status !== 'done');
    const newCount = active.filter(i => i.status === 'new').length;
    const noLeadCount = active.filter(i => !i.relatedLeadId).length;
    const revenuePending = active.filter(i =>
      i.estimateAmount > 0 && i.status !== 'revenue_candidate' && !i.relatedRevenueId
    ).length;
    const scheduleTasks = list.filter(i =>
      i.status !== 'done' && i.status !== 'archived' &&
      (/日程|希望日/.test([i.preferredDatesText, i.memo, i.serviceText].join('')) || i.handlingStatus.includes('日程'))
    ).length;
    return {
      total: list.length,
      active: active.length,
      newCount,
      noLeadCount,
      revenuePending,
      scheduleTasks,
      today: today || new Date().toISOString().slice(0, 10)
    };
  },

  buildReceptionHomeComment(summary) {
    if (!summary || !summary.active) return '';
    const parts = [];
    if (summary.newCount > 0) {
      parts.push(`新規受付が${summary.newCount}件あります`);
    }
    const actions = [];
    if (summary.scheduleTasks > 0) actions.push('日程確認');
    if (summary.noLeadCount > 0 && summary.newCount > 0) actions.push('営業先作成');
    if (summary.revenuePending > 0) actions.push('売上候補の反映');
    if (/写真|型番/.test('')) { /* placeholder */ }
    if (summary.newCount > 0) {
      actions.push('写真確認');
    }
    const uniqueActions = [...new Set(actions)].slice(0, 3);
    if (parts.length && uniqueActions.length) {
      return parts[0] + '。' + uniqueActions.join('と') + 'を優先してください。';
    }
    if (parts.length) return parts[0] + '。内容を確認してください。';
    if (summary.noLeadCount > 0) {
      return `営業先未作成の受付が${summary.noLeadCount}件あります。`;
    }
    return '';
  },

  buildReceptionHomeCommentFromIntakes(intakes) {
    const summary = this.getReceptionSummary(intakes);
    if (!summary.active) return '';
    const list = (intakes || []).map(i => this.normalizeIntake(i))
      .filter(i => i.status !== 'archived' && i.status !== 'done');
    const needsPhoto = list.some(i => /写真|型番|画像/.test([i.memo, i.serviceText].join('')));
    const needsSchedule = list.some(i =>
      i.status === 'new' || /日程|希望日/.test([i.preferredDatesText, i.handlingStatus].join(''))
    );
    const parts = [];
    if (summary.newCount > 0) {
      parts.push(`新規受付が${summary.newCount}件あります`);
    }
    const actions = [];
    if (needsSchedule) actions.push('日程確認');
    if (needsPhoto) actions.push('写真確認');
    if (summary.noLeadCount > 0) actions.push('営業先作成');
    if (summary.revenuePending > 0) actions.push('売上候補の反映');
    const uniq = [...new Set(actions)].slice(0, 3);
    if (parts.length && uniq.length) return parts[0] + '。' + uniq.join('と') + 'を優先してください。';
    if (parts.length) return parts[0] + '。';
    if (summary.noLeadCount > 0) return `営業先未作成の受付が${summary.noLeadCount}件あります。`;
    return '';
  },

  buildMorningReceptionLines(summary) {
    if (!summary || !summary.active) return [];
    const lines = ['受付・予約：'];
    if (summary.newCount > 0) lines.push(`・新規受付 ${summary.newCount}件`);
    if (summary.noLeadCount > 0) lines.push(`・営業先未作成 ${summary.noLeadCount}件`);
    if (summary.scheduleTasks > 0) lines.push(`・今日の日程確認 ${summary.scheduleTasks}件`);
    if (summary.revenuePending > 0) lines.push(`・売上候補未反映 ${summary.revenuePending}件`);
    return lines.length > 1 ? lines : [];
  },

  getReceptionWarnings(intakes) {
    const summary = this.getReceptionSummary(intakes);
    const warnings = [];
    if (summary.newCount > 0) warnings.push('新規受付あり');
    if (summary.noLeadCount > 0) warnings.push('営業先未作成の受付あり');
    if (summary.revenuePending > 0) warnings.push('売上候補未反映の受付あり');
    return warnings;
  },

  getNextActionsFromIntakes(intakes, limit) {
    const list = (intakes || []).map(i => this.normalizeIntake(i))
      .filter(i => i.status !== 'archived' && i.status !== 'done')
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const actions = [];
    list.forEach(intake => {
      if (!intake.relatedLeadId && actions.length < (limit || 5)) {
        actions.push({
          intakeId: intake.id,
          title: `${intake.customerName || '受付'}：営業先を作成`,
          reason: intake.serviceText || '受付データから営業先へ変換',
          kind: 'create-lead'
        });
      }
      if (/写真|型番/.test([intake.memo, intake.serviceText].join('')) && actions.length < (limit || 5)) {
        actions.push({
          intakeId: intake.id,
          title: `写真確認：${intake.customerName || 'お客様'}`,
          reason: '型番・写真確認が必要',
          kind: 'photo-check'
        });
      }
      if ((intake.preferredDatesText || /日程/.test(intake.handlingStatus)) && actions.length < (limit || 5)) {
        actions.push({
          intakeId: intake.id,
          title: `日程確認：${intake.customerName || 'お客様'}`,
          reason: intake.preferredDatesText || '希望日の調整',
          kind: 'schedule'
        });
      }
    });
    const seen = new Set();
    return actions.filter(a => {
      if (seen.has(a.title)) return false;
      seen.add(a.title);
      return true;
    }).slice(0, limit || 5);
  }
};
