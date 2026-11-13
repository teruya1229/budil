/**
 * Unimat's order form lists BC's tax-exclusive contract amount.
 * Accept exclusive amounts only via a separate input; keep existing amount
 * fields and imported/calculated records tax-inclusive and unchanged.
 * Never mutates stored records or submits forms.
 */
(function (global) {
  'use strict';

  const VAT_PERCENT = 10;
  const configs = [
    { sourceId: 'work-order-source', amountId: 'work-order-amount', netId: 'unimat-work-order-net', wrapId: 'unimat-work-order-wrap', noteId: 'unimat-work-order-note' },
    { sourceId: 'revenue-source', amountId: 'revenue-amount', netId: 'unimat-revenue-net', wrapId: 'unimat-revenue-wrap', noteId: 'unimat-revenue-note' },
    { sourceId: 'work-completion-source', amountId: 'work-completion-amount', netId: 'unimat-work-completion-net', wrapId: 'unimat-work-completion-wrap', noteId: 'unimat-work-completion-note' }
  ];

  function toTaxInclusive(net) {
    const value = String(net == null ? '' : net).trim();
    if (!/^\d+$/.test(value)) return null;
    const amount = Number(value);
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 999999999) return null;
    return Math.round(amount * (100 + VAT_PERCENT) / 100);
  }

  function yen(amount) {
    return Number(amount).toLocaleString('ja-JP') + '円';
  }

  function setup() {
    configs.forEach(function (cfg) {
      const source = document.getElementById(cfg.sourceId);
      const amount = document.getElementById(cfg.amountId);
      const net = document.getElementById(cfg.netId);
      const wrap = document.getElementById(cfg.wrapId);
      const note = document.getElementById(cfg.noteId);
      if (!source || !amount || !net || !wrap || !note) return;
      let applying = false;

      function active() {
        return source.value === 'ユニマット';
      }
      function refresh() {
        wrap.hidden = !active();
        if (!active()) {
          net.value = '';
          return;
        }
        // When an existing record is loaded programmatically, never re-tax it.
        if (net.value && String(toTaxInclusive(net.value)) !== amount.value) {
          net.value = '';
        }
        if (!net.value) {
          note.textContent = '税抜の発注額を入力すると、上の金額に税込10％を反映します。上の金額が既に税込なら入力不要です。';
        }
      }
      function applyNet() {
        if (!active()) return;
        if (!net.value.trim()) {
          note.textContent = '税抜額を入力してください。税込の計上金額は変更していません。';
          return;
        }
        const inclusive = toTaxInclusive(net.value);
        if (inclusive === null) {
          note.textContent = '税抜額は0以上の整数円で入力してください。';
          return;
        }
        applying = true;
        amount.value = String(inclusive);
        // Preserve existing app validation and required-user-input tracking.
        amount.dispatchEvent(new Event('input', { bubbles: true }));
        amount.dispatchEvent(new Event('change', { bubbles: true }));
        applying = false;
        note.textContent = yen(Number(net.value)) + '（税抜）→ ' + yen(inclusive) + '（税込・計上金額）';
      }
      source.addEventListener('change', function () {
        net.value = '';
        refresh();
      });
      net.addEventListener('input', applyNet);
      amount.addEventListener('input', function () {
        if (applying) return;
        net.value = '';
        refresh();
      });
      // Forms are often filled by app.js without firing input events.
      amount.addEventListener('focus', refresh);
      net.addEventListener('focus', refresh);
      source.addEventListener('focus', refresh);
      document.addEventListener('click', function (ev) {
        if (ev.target && ev.target.closest && ev.target.closest('button')) {
          queueMicrotask(refresh);
        }
      });
      refresh();
    });
  }
  global.BudilUnimatTax = Object.freeze({ toTaxInclusive });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})(window);
