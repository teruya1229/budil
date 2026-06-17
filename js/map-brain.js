/**
 * Budil v3.5 - 地図リンク・エリア判断（Google Maps API不使用）
 */
const MapBrain = {
  AREAS: [
    '南城市', '八重瀬町', '与那原町', '南風原町', '豊見城市', '糸満市', '那覇市',
    '浦添市', '宜野湾市', '沖縄市', 'うるま市', '北谷町', '読谷村', '中城村', '北中城村',
    'その他南部', '中部', '北部', '不明'
  ],

  AREA_PATTERNS: [
    { area: '南城市', patterns: ['南城市', '南城'] },
    { area: '八重瀬町', patterns: ['八重瀬町', '八重瀬'] },
    { area: '与那原町', patterns: ['与那原町', '与那原'] },
    { area: '南風原町', patterns: ['南風原町', '南風原'] },
    { area: '豊見城市', patterns: ['豊見城市', '豊見城'] },
    { area: '糸満市', patterns: ['糸満市', '糸満'] },
    { area: '那覇市', patterns: ['那覇市', '那覇'] },
    { area: '浦添市', patterns: ['浦添市', '浦添'] },
    { area: '宜野湾市', patterns: ['宜野湾市', '宜野湾'] },
    { area: '沖縄市', patterns: ['沖縄市'] },
    { area: 'うるま市', patterns: ['うるま市', 'うるま'] },
    { area: '北谷町', patterns: ['北谷町', '北谷'] },
    { area: '読谷村', patterns: ['読谷村', '読谷'] },
    { area: '中城村', patterns: ['中城村', '中城'] },
    { area: '北中城村', patterns: ['北中城村', '北中城'] },
    { area: '名護市', patterns: ['名護市', '名護'] },
    { area: '本部町', patterns: ['本部町', '本部'] },
    { area: '今帰仁村', patterns: ['今帰仁村', '今帰仁'] },
    { area: '恩納村', patterns: ['恩納村', '恩納'] },
    { area: '金武町', patterns: ['金武町', '金武'] },
    { area: '宜野座村', patterns: ['宜野座村', '宜野座'] }
  ],

  NEAR_AREAS: new Set([
    '南城市', '八重瀬町', '与那原町', '南風原町', '豊見城市', '糸満市', '那覇市', 'その他南部'
  ]),

  CAUTION_AREAS: new Set([
    '浦添市', '宜野湾市', '沖縄市', 'うるま市', '北谷町', '読谷村', '中城村', '北中城村', '中部'
  ]),

  FAR_AREAS: new Set([
    '名護市', '本部町', '今帰仁村', '恩納村', '金武町', '宜野座村', '北部'
  ]),

  buildGoogleMapSearchUrl(address) {
    const addr = (address || '').trim();
    if (!addr) return '';
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr);
  },

  buildAreaSearchUrl(area, keyword) {
    const a = (area || '').trim();
    if (!a || a === '不明') return '';
    const q = [a, keyword || 'エアコンクリーニング'].filter(Boolean).join(' ');
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  },

  detectAreaFromAddress(address) {
    const text = (address || '').trim();
    if (!text) return '不明';
    for (const item of this.AREA_PATTERNS) {
      if (item.patterns.some(p => text.includes(p))) return item.area;
    }
    if (/沖縄県/.test(text) && /南部|南城|糸満|豊見城|南風原|与那原|八重瀬/.test(text)) {
      return 'その他南部';
    }
    if (/沖縄県/.test(text) && /中部|浦添|宜野湾|沖縄市|うるま|北谷|読谷|中城|北中城/.test(text)) {
      return '中部';
    }
    if (/沖縄県/.test(text) && /北部|名護|本部|今帰仁|恩納|金武|宜野座|国頭|大宜味|東村/.test(text)) {
      return '北部';
    }
    if (text.length > 30) return '不明';
    return '不明';
  },

  classifyAreaDistance(area, address) {
    const a = (area || '').trim();
    const addr = (address || '').trim();
    if (!addr) return 'no-address';
    if (this.FAR_AREAS.has(a)) return 'far';
    if (/名護|本部|今帰仁|恩納|金武|宜野座|国頭|大宜味|東村|伊江|久米島/.test(addr)) return 'far';
    if (a === '不明' && addr.length > 28) return 'far';
    if (this.CAUTION_AREAS.has(a)) return 'caution';
    if (this.NEAR_AREAS.has(a)) return 'near';
    if (a === '不明') return 'unknown';
    return 'caution';
  },

  getDistanceLabel(distanceClass) {
    const map = {
      near: '',
      caution: '移動注意',
      far: '遠方・要確認',
      unknown: '',
      'no-address': '住所未入力'
    };
    return map[distanceClass] || '';
  },

  getLeadAddress(lead) {
    if (!lead) return '';
    return String(lead.address || lead.region || '').trim();
  },

  getLeadArea(lead) {
    if (!lead) return '不明';
    if (lead.area && lead.area.trim()) return lead.area.trim();
    return this.detectAreaFromAddress(this.getLeadAddress(lead));
  },

  getIntakeArea(intake) {
    if (!intake) return '不明';
    if (intake.area && intake.area.trim()) return intake.area.trim();
    return this.detectAreaFromAddress(intake.address || '');
  },

  getRevenueArea(record, leads) {
    if (!record) return '不明';
    const list = leads || [];
    if (record.leadId) {
      const lead = list.find(l => l.id === record.leadId);
      if (lead) {
        const area = this.getLeadArea(lead);
        if (area !== '不明') return area;
        const addr = this.getLeadAddress(lead);
        if (addr) return this.detectAreaFromAddress(addr);
      }
    }
    const memoText = [record.memo, record.customerName].filter(Boolean).join(' ');
    const fromMemo = this.detectAreaFromAddress(memoText);
    if (fromMemo !== '不明') return fromMemo;
    return '不明';
  },

  getWorkOrderArea(workOrder) {
    if (!workOrder) return '不明';
    if (workOrder.area && workOrder.area.trim()) return workOrder.area.trim();
    return this.detectAreaFromAddress(workOrder.address || '');
  },

  buildAreaSummary(ctx) {
    const { leads, intakes, revenues, workOrders, today } = ctx;
    const t = today || new Date().toISOString().slice(0, 10);
    const areaMap = {};

    const ensure = (area) => {
      const key = area || '不明';
      if (!areaMap[key]) {
        areaMap[key] = {
          area: key,
          leadCount: 0,
          intakeCount: 0,
          revenueCount: 0,
          revenueTotal: 0,
          openIntakes: 0,
          nextContactLeads: 0,
          workOrderCount: 0,
          todayWorkOrders: 0,
          weekWorkOrders: 0,
          workOrderEstimate: 0,
          distanceClass: this.classifyAreaDistance(key, key)
        };
      }
      return areaMap[key];
    };

    (leads || []).forEach(lead => {
      const area = this.getLeadArea(lead);
      const bucket = ensure(area);
      bucket.leadCount++;
      const nd = lead.nextActionDate || lead.nextContact;
      const closed = ['成約', '見送り', 'NG'].includes(lead.status)
        || (lead.salesStatus && ['成約', '見送り'].includes(lead.salesStatus));
      if (nd && nd <= t && !closed) bucket.nextContactLeads++;
    });

    (intakes || []).forEach(intake => {
      if (intake.status === 'archived' || intake.status === 'done') return;
      const area = this.getIntakeArea(intake);
      const bucket = ensure(area);
      bucket.intakeCount++;
      if (intake.status === 'new' || !intake.relatedLeadId) bucket.openIntakes++;
    });

    (revenues || []).forEach(rec => {
      if (rec.status === 'キャンセル') return;
      const area = this.getRevenueArea(rec, leads);
      const bucket = ensure(area);
      bucket.revenueCount++;
      bucket.revenueTotal += Number(rec.amount) || 0;
    });

    const weekEnd = typeof WorkOrderBrain !== 'undefined'
      ? WorkOrderBrain.addDays(t, 6)
      : t;
    (workOrders || []).forEach(wo => {
      if (!wo || wo.status === 'archived' || wo.status === 'cancelled') return;
      if (!['tentative', 'confirmed'].includes(wo.status)) return;
      const area = typeof WorkOrderBrain !== 'undefined'
        ? WorkOrderBrain.getWorkOrderArea(wo)
        : this.getWorkOrderArea(wo);
      const bucket = ensure(area);
      bucket.workOrderCount++;
      bucket.workOrderEstimate += Number(wo.estimateAmount) || 0;
      if (wo.scheduledDate === t) bucket.todayWorkOrders++;
      if (wo.scheduledDate && wo.scheduledDate >= t && wo.scheduledDate <= weekEnd) {
        bucket.weekWorkOrders++;
      }
    });

    const rows = Object.values(areaMap).filter(r =>
      r.leadCount || r.intakeCount || r.revenueCount || r.workOrderCount
    );
    rows.sort((a, b) => {
      const score = r => r.revenueTotal + r.intakeCount * 10000 + r.leadCount * 100;
      return score(b) - score(a);
    });
    return rows;
  },

  getAreaWarnings(ctx) {
    const { leads, intakes, revenues, workOrders, today } = ctx;
    const t = today || new Date().toISOString().slice(0, 10);
    const warnings = [];
    const farItems = [];
    const noAddressItems = [];

    (intakes || []).forEach(intake => {
      if (intake.status === 'archived' || intake.status === 'done') return;
      const addr = (intake.address || '').trim();
      const area = this.getIntakeArea(intake);
      const dist = this.classifyAreaDistance(area, addr);
      const name = intake.customerName || '（名前なし）';
      if (!addr) {
        noAddressItems.push({ kind: 'intake', name, area, id: intake.id });
      } else if (dist === 'far' || dist === 'caution') {
        farItems.push({
          kind: 'intake',
          area,
          name,
          message: dist === 'far'
            ? '移動距離が長いため、最低金額や日程調整を確認'
            : '移動距離に注意。最低金額や日程調整を確認',
          id: intake.id
        });
      }
    });

    (leads || []).forEach(lead => {
      const addr = this.getLeadAddress(lead);
      const area = this.getLeadArea(lead);
      const dist = this.classifyAreaDistance(area, addr);
      const closed = ['成約', '見送り', 'NG'].includes(lead.status);
      if (!addr && !closed) {
        noAddressItems.push({ kind: 'lead', name: lead.company, area, id: lead.id });
      } else if (!closed && (dist === 'far' || dist === 'caution')) {
        const nd = lead.nextActionDate || lead.nextContact;
        if (!nd || nd <= t) {
          farItems.push({
            kind: 'lead',
            area,
            name: lead.company,
            message: dist === 'far'
              ? '遠方案件。移動距離と最低金額を確認'
              : '移動注意。日程と最低金額を確認',
            id: lead.id
          });
        }
      }
    });

    (workOrders || []).forEach(wo => {
      if (!wo || wo.status === 'archived' || wo.status === 'cancelled') return;
      if (!['tentative', 'confirmed'].includes(wo.status)) return;
      const addr = (wo.address || '').trim();
      const area = typeof WorkOrderBrain !== 'undefined'
        ? WorkOrderBrain.getWorkOrderArea(wo)
        : this.getWorkOrderArea(wo);
      const dist = this.classifyAreaDistance(area, addr);
      const name = wo.customerName || '（名前なし）';
      if (!addr) {
        noAddressItems.push({ kind: 'work-order', name, area, id: wo.id });
      } else if (dist === 'far' || dist === 'caution') {
        farItems.push({
          kind: 'work-order',
          area,
          name,
          message: dist === 'far'
            ? '作業予定：遠方。移動距離と最低金額を確認'
            : '作業予定：移動注意。日程と最低金額を確認',
          id: wo.id
        });
      }
    });

    let revenueNoArea = 0;
    (revenues || []).forEach(rec => {
      if (rec.status === 'キャンセル') return;
      if (rec.leadId && this.getRevenueArea(rec, leads) === '不明') revenueNoArea++;
    });

    if (farItems.length) warnings.push({ type: 'far', items: farItems.slice(0, 8) });
    if (noAddressItems.length) warnings.push({ type: 'no-address', items: noAddressItems.slice(0, 8) });
    if (revenueNoArea) warnings.push({ type: 'revenue-unknown', count: revenueNoArea });

    return warnings;
  },

  buildAreaHomeComment(summary, warnings) {
    const lines = [];
    const w = warnings || [];
    const farW = w.find(x => x.type === 'far');
    const noAddrW = w.find(x => x.type === 'no-address');

    if (farW && farW.items && farW.items.length) {
      const first = farW.items[0];
      if (first.kind === 'intake') {
        lines.push(`${first.area}の受付があります。移動距離と最低金額を確認してください。`);
      } else {
        lines.push(`${first.area}の営業先があります。移動距離を確認してください。`);
      }
    }

    if (noAddrW && noAddrW.items) {
      const leadCount = noAddrW.items.filter(i => i.kind === 'lead').length;
      if (leadCount) {
        lines.push(`住所未入力の営業先が${leadCount}件あります。地図確認のため住所を補完してください。`);
      }
      const intakeCount = noAddrW.items.filter(i => i.kind === 'intake').length;
      if (intakeCount && !lines.length) {
        lines.push(`住所未入力の受付が${intakeCount}件あります。Googleマップ確認のため住所を補完してください。`);
      }
    }

    if (!lines.length && summary && summary.length) {
      const top = summary.find(s => s.openIntakes > 0) || summary[0];
      if (top && top.openIntakes) {
        lines.push(`${top.area}を中心に未対応受付が${top.openIntakes}件あります。`);
      }
    }

    return lines.slice(0, 2);
  },

  buildMorningAreaLines(warnings) {
    const lines = ['エリア注意：'];
    const w = warnings || [];
    let has = false;

    const farW = w.find(x => x.type === 'far');
    if (farW && farW.items) {
      const intakeFar = farW.items.filter(i => i.kind === 'intake');
      const woFar = farW.items.filter(i => i.kind === 'work-order');
      if (intakeFar.length) {
        lines.push(`・${intakeFar[0].area}の受付${intakeFar.length}件、移動距離確認`);
        has = true;
      }
      if (woFar.length) {
        lines.push(`・${woFar[0].area}の作業予定${woFar.length}件、移動距離確認`);
        has = true;
      }
    }

    const noAddrW = w.find(x => x.type === 'no-address');
    if (noAddrW && noAddrW.items) {
      const leadCount = noAddrW.items.filter(i => i.kind === 'lead').length;
      const woCount = noAddrW.items.filter(i => i.kind === 'work-order').length;
      if (leadCount) {
        lines.push(`・住所未入力の営業先${leadCount}件`);
        has = true;
      }
      if (woCount) {
        lines.push(`・住所未入力の作業予定${woCount}件`);
        has = true;
      }
    }

    const revW = w.find(x => x.type === 'revenue-unknown');
    if (revW && revW.count) {
      lines.push(`・エリア不明の売上${revW.count}件`);
      has = true;
    }

    return has ? lines : [];
  },

  getDiagnosticsCounts(leads, intakes, revenues, workOrders) {
    let leadsNoAddress = 0;
    let intakesNoAddress = 0;
    let leadsUnknownArea = 0;
    let intakesUnknownArea = 0;
    let revenueNoAreaWithLead = 0;
    let workOrdersNoAddress = 0;
    let workOrdersUnknownArea = 0;

    (leads || []).forEach(lead => {
      if (!this.getLeadAddress(lead)) leadsNoAddress++;
      if (this.getLeadArea(lead) === '不明' && this.getLeadAddress(lead)) leadsUnknownArea++;
    });

    (intakes || []).forEach(intake => {
      if (intake.status === 'archived') return;
      if (!(intake.address || '').trim()) intakesNoAddress++;
      if (this.getIntakeArea(intake) === '不明' && (intake.address || '').trim()) intakesUnknownArea++;
    });

    (revenues || []).forEach(rec => {
      if (rec.status === 'キャンセル' || !rec.leadId) return;
      const lead = (leads || []).find(l => l.id === rec.leadId);
      if (!lead) return;
      if (!this.getLeadAddress(lead) && this.getLeadArea(lead) === '不明') revenueNoAreaWithLead++;
    });

    (workOrders || []).forEach(wo => {
      if (!wo || wo.status === 'archived' || wo.status === 'cancelled') return;
      if (!(wo.address || '').trim()) workOrdersNoAddress++;
      const area = typeof WorkOrderBrain !== 'undefined'
        ? WorkOrderBrain.getWorkOrderArea(wo)
        : this.getWorkOrderArea(wo);
      if (area === '不明' && (wo.address || '').trim()) workOrdersUnknownArea++;
    });

    return {
      leadsNoAddress,
      intakesNoAddress,
      leadsUnknownArea,
      intakesUnknownArea,
      revenueNoAreaWithLead,
      workOrdersNoAddress,
      workOrdersUnknownArea
    };
  }
};
