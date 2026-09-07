/**
 * Budil - 請求書・見積書の独立印刷 / PDFダウンロード
 * BudilアプリUIを含まない standalone HTML を使う。
 */
const BudilDocExport = {
  _cssTextPromise: null,
  _html2pdfPromise: null,

  getStyleHref() {
    const link = document.querySelector('link[href*="css/style.css"]');
    if (link && link.href) return link.href;
    return new URL('css/style.css', location.href).href;
  },

  getVendorHtml2PdfSrc() {
    return new URL('js/vendor/html2pdf.bundle.min.js', location.href).href;
  },

  async loadDocumentCssText() {
    if (this._cssTextPromise) return this._cssTextPromise;
    this._cssTextPromise = (async () => {
      const res = await fetch(this.getStyleHref(), { cache: 'force-cache' });
      if (!res.ok) throw new Error('doc_css_fetch_failed');
      const css = await res.text();
      return DocumentsBrain.extractDocumentCss(css);
    })().catch(err => {
      this._cssTextPromise = null;
      throw err;
    });
    return this._cssTextPromise;
  },

  ensureHtml2Pdf() {
    if (typeof window.html2pdf === 'function') {
      return Promise.resolve(window.html2pdf);
    }
    if (this._html2pdfPromise) return this._html2pdfPromise;
    this._html2pdfPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-budil-html2pdf="1"]');
      if (existing) {
        existing.addEventListener('load', () => {
          if (typeof window.html2pdf === 'function') resolve(window.html2pdf);
          else reject(new Error('pdf_library_unavailable'));
        }, { once: true });
        existing.addEventListener('error', () => reject(new Error('pdf_library_load_failed')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = this.getVendorHtml2PdfSrc();
      script.async = true;
      script.dataset.budilHtml2pdf = '1';
      script.onload = () => {
        if (typeof window.html2pdf === 'function') resolve(window.html2pdf);
        else reject(new Error('pdf_library_unavailable'));
      };
      script.onerror = () => reject(new Error('pdf_library_load_failed'));
      document.head.appendChild(script);
    }).catch(err => {
      this._html2pdfPromise = null;
      throw err;
    });
    return this._html2pdfPromise;
  },

  waitForImages(root) {
    const imgs = Array.from((root && root.querySelectorAll) ? root.querySelectorAll('img') : []);
    return Promise.all(imgs.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    }));
  },

  async buildCurrentStandaloneHtml(doc, autoPrint) {
    const cssText = await this.loadDocumentCssText();
    const escFn = typeof esc === 'function'
      ? esc
      : (s => String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;'));
    return DocumentsBrain.buildStandaloneDocumentHtml(doc, {
      escFn,
      cssText,
      baseHref: location.href,
      autoPrint: !!autoPrint
    });
  },

  async printDocumentStandalone(doc) {
    if (!doc) throw new Error('document_required');
    const html = await this.buildCurrentStandaloneHtml(doc, true);
    const win = window.open('', '_blank');
    if (!win) {
      throw new Error('popup_blocked');
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    try { win.focus(); } catch (_) { /* ignore */ }
    return true;
  },

  async downloadDocumentPdf(doc) {
    if (!doc) throw new Error('document_required');
    const filename = DocumentsBrain.buildDocumentExportFilename(doc, 'pdf');
    const html2pdfFactory = await this.ensureHtml2Pdf();
    const cssText = await this.loadDocumentCssText();
    const escFn = typeof esc === 'function'
      ? esc
      : (s => String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;'));
    const sheetHtml = DocumentsBrain.renderDocumentSheet(doc, escFn);
    const sealAbs = DocumentsBrain.resolveDocumentAssetUrl(DocumentsBrain.SEAL_IMAGE, location.href);
    const htmlWithSeal = sheetHtml.replace(
      /src="assets\/bc-service-seal\.jpg"/g,
      `src="${sealAbs.replace(/"/g, '&quot;')}"`
    );

    const host = document.createElement('div');
    host.setAttribute('data-budil-doc-pdf-host', '1');
    host.style.cssText = [
      'position: fixed',
      'left: -12000px',
      'top: 0',
      'width: 210mm',
      'background: #fff',
      'color: #111',
      'z-index: -1',
      'pointer-events: none',
      'opacity: 1'
    ].join(';');
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      [data-budil-doc-pdf-host="1"], [data-budil-doc-pdf-host="1"] * {
        font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", YuGothic, Meiryo, sans-serif !important;
      }
      ${cssText}
      [data-budil-doc-pdf-host="1"] .doc-sheet {
        box-shadow: none !important;
        margin: 0 !important;
        width: 210mm !important;
        min-height: 297mm !important;
        background: #fff !important;
        color: #111 !important;
      }
    `;
    host.appendChild(styleEl);
    const mount = document.createElement('div');
    mount.className = 'doc-print-area';
    mount.innerHTML = htmlWithSeal;
    host.appendChild(mount);
    document.body.appendChild(host);

    try {
      const sheet = host.querySelector('.doc-sheet');
      if (!sheet) throw new Error('doc_sheet_missing');
      await this.waitForImages(sheet);
      await html2pdfFactory().set({
        margin: 0,
        filename,
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
          imageTimeout: 15000,
          windowWidth: sheet.scrollWidth || 794
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait',
          compress: true
        },
        image: { type: 'jpeg', quality: 0.98 }
      }).from(sheet).save();
      return { ok: true, filename };
    } finally {
      host.remove();
    }
  }
};

if (typeof window !== 'undefined') {
  window.BudilDocExport = BudilDocExport;
}
