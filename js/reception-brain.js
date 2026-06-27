/**
 * Budil v4.8.5 - 受付・予約番頭（AI番頭連携入口）
 */
const ReceptionBrain = {
  STATUSES: ['new', 'lead_created', 'task_created', 'work_scheduled', 'revenue_candidate', 'done', 'archived'],

  STATUS_LABELS: {
    new: '新規受付',
    lead_created: '営業先作成済み',
    task_created: 'タスク作成済み',
    work_scheduled: '作業予定作成済み',
    revenue_candidate: '売上候補',
    done: '対応済み',
    archived: '保管'
  },

  PASTE_FIELD_DEFS: [
    { key: 'source', labels: ['依頼元', 'source'] },
    { key: 'customerName', labels: ['氏名', '名前', 'お客様名', '顧客名', 'customerName'] },
    { key: 'phone', labels: ['電話番号', '電話', 'phone'] },
    { key: 'address', labels: ['住所', 'address'], multiline: true },
    { key: 'serviceText', labels: ['作業内容', 'サービス', 'serviceText'] },
    { key: 'preferredDatesText', labels: ['希望日', 'preferredDatesText'] },
    { key: 'memo', labels: ['補足', '受付メモ', 'メモ', 'memo'], multiline: true },
    { key: 'estimateAmount', labels: ['概算金額', '金額', 'estimateAmount'] },
    { key: 'handlingStatus', labels: ['対応状況', 'handlingStatus'] },
    { key: '_date', labels: ['日付', '作業日', '予約日'] },
    { key: '_time', labels: ['時間', '開始時間'] }
  ],

  PASTE_MULTILINE_KEYS: new Set(['address', 'memo']),

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
    const address = String(item.address || '').trim();
    const area = String(item.area || '').trim()
      || (typeof MapBrain !== 'undefined' ? MapBrain.detectAreaFromAddress(address) : '');
    return {
      id: item.id || '',
      source: typeof RevenueBrain !== 'undefined'
        ? RevenueBrain.normalizeSourceForForm(item.source)
        : String(item.source || '').trim(),
      customerName: String(item.customerName || '').trim(),
      phone: String(item.phone || '').trim(),
      address,
      area,
      serviceText: String(item.serviceText || '').trim(),
      preferredDatesText: String(item.preferredDatesText || '').trim(),
      memo: String(item.memo || '').trim(),
      estimateAmount,
      handlingStatus: String(item.handlingStatus || '').trim(),
      status,
      relatedLeadId: String(item.relatedLeadId || '').trim(),
      relatedRevenueId: String(item.relatedRevenueId || '').trim(),
      relatedTaskIds: Array.isArray(item.relatedTaskIds) ? item.relatedTaskIds.map(String) : [],
      relatedWorkOrderId: String(item.relatedWorkOrderId || '').trim(),
      relatedWorkOrderIds: Array.isArray(item.relatedWorkOrderIds) ? item.relatedWorkOrderIds.map(String) : [],
      createdAt: item.createdAt || now,
      updatedAt: item.updatedAt || now,
      isDemo: item.isDemo === true,
      isTest: item.isTest === true
    };
  },

  inferSourceFromText(text) {
    const t = String(text || '');
    if (!t.trim()) return 'その他';
    if (/ヤマダ電機|ヤマダ|YAMADA/i.test(t)) return 'ヤマダ';
    if (/コープ|生協|\bcoop\b|COOP/i.test(t)) return 'コープ';
    if (/くらしのマーケット|くらし/.test(t)) return 'くらしのマーケット';
    if (/エアコン110番|生活110番|110番/.test(t)) return '110番';
    if (/\bLP\b|ホームページ|\bHP\b|\bWeb\b|\bWEB\b|サイト/i.test(t)) return 'LP';
    return 'その他';
  },

  _resolvePasteSource(fields, fullText) {
    const labeled = String(fields.source || '').trim();
    if (labeled) return this.matchRevenueSource(labeled);
    return this.inferSourceFromText(fullText);
  },

  parseAiBantouPaste(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return this.normalizeIntake({});

    const jsonResult = this._tryParseJson(trimmed);
    if (jsonResult) {
      jsonResult.source = this._resolvePasteSource(jsonResult, trimmed);
      return this.normalizeIntake(jsonResult);
    }

    const extracted = this._extractLabeledFields(trimmed);
    extracted.source = this._resolvePasteSource(extracted, trimmed);
    return this.normalizeIntake(extracted);
  },

  _matchPasteFieldLine(line) {
    const trimmed = (line || '').trim();
    if (!trimmed) return null;
    const defs = [...this.PASTE_FIELD_DEFS].sort((a, b) => {
      const al = Math.max(...a.labels.map(l => l.length));
      const bl = Math.max(...b.labels.map(l => l.length));
      return bl - al;
    });
    for (const def of defs) {
      for (const label of def.labels) {
        const fullColon = label + '：';
        const halfColon = label + ':';
        if (trimmed.startsWith(fullColon)) {
          return {
            key: def.key,
            value: trimmed.slice(fullColon.length).trim(),
            multiline: !!def.multiline
          };
        }
        if (trimmed.startsWith(halfColon)) {
          return {
            key: def.key,
            value: trimmed.slice(halfColon.length).trim(),
            multiline: !!def.multiline
          };
        }
      }
    }
    return null;
  },

  _extractLabeledFields(text) {
    const lines = text.split(/\r?\n/);
    const fields = {};
    let currentKey = null;
    let currentLines = [];
    let currentMultiline = false;

    const flush = () => {
      if (!currentKey) return;
      const joined = currentLines.map(l => l.trim()).filter((l, idx, arr) => {
        if (currentKey === 'memo') return true;
        return l !== '' || (idx > 0 && idx < arr.length - 1);
      });
      let value = joined.join(currentKey === 'memo' ? '\n' : ' ').trim();
      if (currentKey === 'memo') {
        value = joined
          .map(l => l.replace(/^[・•\-]\s*/, '').trim())
          .filter(Boolean)
          .join('\n');
      }
      if (value || currentKey === 'memo') {
        fields[currentKey] = value;
      }
      currentKey = null;
      currentLines = [];
      currentMultiline = false;
    };

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const match = this._matchPasteFieldLine(rawLine);

      if (match) {
        flush();
        currentKey = match.key;
        currentMultiline = match.multiline;
        currentLines = match.value ? [match.value] : [];
        continue;
      }

      if (!currentKey) continue;

      const trimmed = rawLine.trim();
      if (!currentMultiline) {
        flush();
        i -= 1;
        continue;
      }

      if (currentKey === 'address' && trimmed === '') {
        flush();
        continue;
      }

      if (currentKey === 'memo' && trimmed === '' && currentLines.length === 0) {
        continue;
      }

      currentLines.push(rawLine);
    }

    flush();

    const datePart = fields._date || '';
    const timePart = fields._time || '';
    if (datePart || timePart) {
      fields.preferredDatesText = [datePart, timePart].filter(Boolean).join(' ');
    }
    delete fields._date;
    delete fields._time;

    return fields;
  },

  getIntakeMissingFields(intake) {
    const n = this.normalizeIntake(intake);
    const missing = [];
    if (!n.customerName) missing.push('お客様名');
    if (!n.address) missing.push('住所');
    if (!n.phone) missing.push('電話番号');
    if (!n.serviceText) missing.push('作業内容');
    if (!n.id) missing.push('受付保存');
    return missing;
  },

  buildActionReason(intake, options) {
    const opts = options || {};
    const n = this.normalizeIntake(intake);
    const parts = [];
    if (n.serviceText) parts.push(n.serviceText);
    const missing = this.getIntakeMissingFields(n).filter(item => {
      if (item === '受付保存' && opts.includeSaveHint === false) return false;
      return true;
    });
    if (missing.length) parts.push('不足：' + missing.join(' / '));
    if (!parts.length) return opts.fallback || '受付データから営業先へ変換';
    return parts.join(' — ');
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
      area: normalized.area || (typeof MapBrain !== 'undefined'
        ? MapBrain.detectAreaFromAddress(normalized.address) : ''),
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

  getWorkflowState(intake, context) {
    const normalized = this.normalizeIntake(intake);
    const ctx = context || {};
    const leads = Array.isArray(ctx.leads) ? ctx.leads : [];
    const workOrders = Array.isArray(ctx.workOrders) ? ctx.workOrders : [];
    const revenues = Array.isArray(ctx.revenues) ? ctx.revenues : [];
    const lead = normalized.relatedLeadId
      ? leads.find(l => l && l.id === normalized.relatedLeadId)
      : null;
    const workIds = [
      normalized.relatedWorkOrderId,
      ...(Array.isArray(normalized.relatedWorkOrderIds) ? normalized.relatedWorkOrderIds : [])
    ].filter(Boolean);
    const relatedWorkOrders = workOrders.filter(w =>
      w && (workIds.includes(w.id) || (normalized.id && w.intakeId === normalized.id))
    );
    const primaryWorkOrder = relatedWorkOrders.find(w => w.id === normalized.relatedWorkOrderId)
      || relatedWorkOrders[0]
      || null;
    const revenueId = normalized.relatedRevenueId
      || (primaryWorkOrder && primaryWorkOrder.actualRevenueId)
      || '';
    const revenue = revenueId ? revenues.find(r => r && r.id === revenueId) : null;
    const hasLead = !!lead;
    const hasWorkOrder = !!primaryWorkOrder;
    const hasRevenue = !!revenue;
    const completedNoRevenue = hasWorkOrder && primaryWorkOrder.status === 'completed' && !hasRevenue;
    let primaryAction = 'case';
    let primaryLabel = '案件化する';
    if (hasRevenue) {
      primaryAction = 'openRevenue';
      primaryLabel = '売上を開く';
    } else if (completedNoRevenue) {
      primaryAction = 'fillRevenue';
      primaryLabel = '売上登録へ進む';
    } else if (hasWorkOrder) {
      primaryAction = 'openWorkOrder';
      primaryLabel = '作業予定を開く';
    } else if (hasLead) {
      primaryAction = 'createWorkOrder';
      primaryLabel = '作業予定を作成';
    }
    return {
      intake: normalized,
      lead,
      workOrder: primaryWorkOrder,
      revenue,
      relatedWorkOrders,
      hasLead,
      hasWorkOrder,
      hasRevenue,
      completedNoRevenue,
      primaryAction,
      primaryLabel,
      labels: [
        '受付保存済み',
        hasLead ? '営業先あり' : '未案件化',
        hasWorkOrder ? '作業予定あり' : '予定未作成',
        hasRevenue ? '売上登録済み' : '売上未登録'
      ]
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
    if (typeof RevenueBrain !== 'undefined') {
      return RevenueBrain.normalizeSourceForForm(source);
    }
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
          reason: this.buildActionReason(intake, { includeSaveHint: false }),
          kind: 'create-lead'
        });
      }
      if (/写真|型番/.test([intake.memo, intake.serviceText].join('')) && actions.length < (limit || 5)) {
        actions.push({
          intakeId: intake.id,
          title: `写真確認：${intake.customerName || 'お客様'}`,
          reason: this.buildActionReason(intake, {
            includeSaveHint: false,
            fallback: '型番・写真確認が必要'
          }),
          kind: 'photo-check'
        });
      }
      if ((intake.preferredDatesText || /日程/.test(intake.handlingStatus)) && actions.length < (limit || 5)) {
        actions.push({
          intakeId: intake.id,
          title: `日程確認：${intake.customerName || 'お客様'}`,
          reason: intake.preferredDatesText
            ? this.buildActionReason(intake, { includeSaveHint: false, fallback: intake.preferredDatesText })
            : this.buildActionReason(intake, { includeSaveHint: false, fallback: '希望日の調整' }),
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
  },

  getNextActionsFromDraft(intake, limit) {
    const normalized = this.normalizeIntake(intake);
    if (!(normalized.customerName || normalized.address || normalized.serviceText || normalized.source)) {
      return [];
    }
    const actions = [];
    actions.push({
      intakeId: '',
      title: `${normalized.customerName || '受付'}：営業先を作成`,
      reason: this.buildActionReason(normalized),
      kind: 'create-lead',
      isDraft: true
    });
    if (normalized.address && actions.length < (limit || 5)) {
      actions.push({
        intakeId: '',
        title: `${normalized.customerName || '受付'}：住所を確認`,
        reason: this.buildActionReason(normalized, { fallback: normalized.address }),
        kind: 'address-check',
        isDraft: true
      });
    }
    if ((normalized.preferredDatesText || /日程/.test(normalized.handlingStatus)) && actions.length < (limit || 5)) {
      actions.push({
        intakeId: '',
        title: `日程確認：${normalized.customerName || 'お客様'}`,
        reason: normalized.preferredDatesText || this.buildActionReason(normalized, { fallback: '希望日の調整' }),
        kind: 'schedule',
        isDraft: true
      });
    }
    return actions.slice(0, limit || 5);
  }
};
