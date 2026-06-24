/**
 * Budil v4.4.4 - 月次実績（過去月まとめ入力）
 * budil_revenue_records とは独立。経営判断・実績補正用。
 */
const MonthlyResultsBrain = {
  CSV_HEADERS: ['月', '売上', '手数料', '材料費', '人件費', 'その他費用', '利益', 'メモ'],

  formatYen(amount) {
    return Number(amount || 0).toLocaleString('ja-JP') + '円';
  },

  formatRate(profit, sales) {
    const s = Number(sales);
    if (!Number.isFinite(s) || s <= 0) return '—';
    const p = Number(profit);
    if (!Number.isFinite(p)) return '—';
    return (Math.round((p / s) * 1000) / 10).toFixed(1) + '%';
  },

  parseAmount(val) {
    if (val == null || val === '') return 0;
    const n = Number(String(val).replace(/[,，]/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  },

  normalizeMonth(raw) {
    const s = String(raw || '').trim();
    const m = s.match(/^(\d{4})[-/年.](\d{1,2})/);
    if (!m) return '';
    const month = String(m[2]).padStart(2, '0');
    return `${m[1]}-${month}`;
  },

  computeProfit(sales, brokerFee, materialCost, laborCost, otherCost) {
    return this.parseAmount(sales)
      - this.parseAmount(brokerFee)
      - this.parseAmount(materialCost)
      - this.parseAmount(laborCost)
      - this.parseAmount(otherCost);
  },

  normalizeRecord(raw) {
    const item = raw && typeof raw === 'object' ? { ...raw } : {};
    const month = this.normalizeMonth(item.month || item.id);
    return {
      id: month || item.id || '',
      month,
      sales: this.parseAmount(item.sales),
      brokerFee: this.parseAmount(item.brokerFee),
      materialCost: this.parseAmount(item.materialCost),
      laborCost: this.parseAmount(item.laborCost),
      otherCost: this.parseAmount(item.otherCost),
      profit: this.parseAmount(item.profit),
      memo: String(item.memo || '').trim()
    };
  },

  sortByMonthDesc(records) {
    return (records || []).slice().sort((a, b) => (b.month || '').localeCompare(a.month || ''));
  },

  getLatest(records) {
    const sorted = this.sortByMonthDesc(records);
    return sorted.length ? sorted[0] : null;
  },

  getTotals(records) {
    const list = records || [];
    return list.reduce((acc, r) => {
      acc.sales += Number(r.sales) || 0;
      acc.brokerFee += Number(r.brokerFee) || 0;
      acc.materialCost += Number(r.materialCost) || 0;
      acc.laborCost += Number(r.laborCost) || 0;
      acc.otherCost += Number(r.otherCost) || 0;
      acc.profit += Number(r.profit) || 0;
      acc.count += 1;
      return acc;
    }, {
      sales: 0, brokerFee: 0, materialCost: 0, laborCost: 0, otherCost: 0, profit: 0, count: 0
    });
  },

  splitCsvLine(line) {
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if ((ch === ',' || ch === '\t') && !inQuotes) {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  },

  parseCsv(text) {
    const lines = String(text || '')
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
    if (!lines.length) {
      return { records: [], errors: ['CSVデータが空です'], warnings: [] };
    }

    const errors = [];
    const warnings = [];
    const records = [];
    let startIdx = 0;
    const firstCells = this.splitCsvLine(lines[0]);
    const headerMap = {};
    const headerAliases = {
      '月': 'month', month: 'month',
      '売上': 'sales', sales: 'sales',
      '手数料': 'brokerFee', '仲介料': 'brokerFee', brokerfee: 'brokerFee',
      '材料費': 'materialCost', materialcost: 'materialCost',
      '人件費': 'laborCost', laborcost: 'laborCost',
      'その他費用': 'otherCost', othercost: 'otherCost',
      '利益': 'profit', profit: 'profit',
      'メモ': 'memo', memo: 'memo'
    };
    const looksLikeHeader = firstCells.some(c => headerAliases[String(c).toLowerCase()] || headerAliases[c]);
    if (looksLikeHeader) {
      firstCells.forEach((h, i) => {
        const key = headerAliases[h] || headerAliases[String(h).toLowerCase()];
        if (key) headerMap[i] = key;
      });
      startIdx = 1;
    } else {
      [0, 1, 2, 3, 4, 5, 6, 7].forEach((idx, i) => {
        const keys = ['month', 'sales', 'brokerFee', 'materialCost', 'laborCost', 'otherCost', 'profit', 'memo'];
        headerMap[idx] = keys[i];
      });
    }

    for (let li = startIdx; li < lines.length; li++) {
      const cells = this.splitCsvLine(lines[li]);
      if (!cells.length || cells.every(c => !c)) continue;
      const row = {};
      Object.keys(headerMap).forEach(idx => {
        row[headerMap[idx]] = cells[Number(idx)] != null ? cells[Number(idx)] : '';
      });
      const month = this.normalizeMonth(row.month);
      if (!month) {
        errors.push(`${li + 1}行目: 月の形式が不正です（YYYY-MM）`);
        continue;
      }
      const profitRaw = row.profit;
      const hasProfitInput = profitRaw != null && String(profitRaw).trim() !== '';
      const normalized = this.normalizeRecord({ ...row, month, id: month });
      if (!hasProfitInput && normalized.sales) {
        normalized.profit = this.computeProfit(
          normalized.sales, normalized.brokerFee, normalized.materialCost,
          normalized.laborCost, normalized.otherCost
        );
        warnings.push(`${month}: 利益を自動計算しました`);
      }
      records.push(normalized);
    }

    return { records, errors, warnings };
  }
};
