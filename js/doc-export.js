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

  measurePdfSheetGeometry(sheet) {
    if (!sheet || !sheet.getBoundingClientRect) {
      return { ok: false, error: 'sheet_missing' };
    }
    const rect = sheet.getBoundingClientRect();
    const cs = (sheet.ownerDocument && sheet.ownerDocument.defaultView)
      ? sheet.ownerDocument.defaultView.getComputedStyle(sheet)
      : window.getComputedStyle(sheet);
    return {
      ok: true,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      scrollWidth: sheet.scrollWidth,
      offsetWidth: sheet.offsetWidth,
      computedWidth: cs.width,
      computedLeft: cs.left,
      computedTransform: cs.transform,
      computedPosition: cs.position,
      computedMarginLeft: cs.marginLeft
    };
  },

  createPdfRenderFrame() {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('data-budil-doc-pdf-frame', '1');
    iframe.setAttribute('title', 'budil-doc-pdf-render');
    iframe.setAttribute('aria-hidden', 'true');
    // 画面外の巨大マイナス座標ホストは使わない。原点(0,0)の A4 ピクセル枠に置く。
    iframe.style.cssText = [
      'position: fixed',
      'left: 0',
      'top: 0',
      'width: 794px',
      'height: 1123px',
      'border: 0',
      'margin: 0',
      'padding: 0',
      'opacity: 1',
      'pointer-events: none',
      'z-index: -2147483648',
      'background: #fff',
      'overflow: hidden',
      'transform: none'
    ].join(';');
    document.body.appendChild(iframe);
    return iframe;
  },

  writeHtmlToFrame(iframe, html) {
    return new Promise((resolve, reject) => {
      const doc = iframe.contentDocument;
      const win = iframe.contentWindow;
      if (!doc || !win) {
        reject(new Error('pdf_frame_unavailable'));
        return;
      }
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve({ doc, win });
      };
      iframe.addEventListener('load', finish, { once: true });
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        if (doc.readyState === 'complete') finish();
      }, 30);
    });
  },

  async downloadDocumentPdf(doc) {
    if (!doc) throw new Error('document_required');
    const filename = DocumentsBrain.buildDocumentExportFilename(doc, 'pdf');
    const html2pdfFactory = await this.ensureHtml2Pdf();
    const html = await this.buildCurrentStandaloneHtml(doc, false);
    const iframe = this.createPdfRenderFrame();
    let geometry = null;

    try {
      const { doc: frameDoc } = await this.writeHtmlToFrame(iframe, html);
      const sheet = frameDoc.querySelector('.doc-sheet');
      if (!sheet) throw new Error('doc_sheet_missing');

      // iframe 内でも mm 依存を避け、A4 ピクセルで固定する
      sheet.style.boxShadow = 'none';
      sheet.style.margin = '0';
      sheet.style.transform = 'none';
      sheet.style.position = 'relative';
      sheet.style.left = '0';
      sheet.style.top = '0';
      sheet.style.width = '794px';
      sheet.style.minHeight = '1123px';
      sheet.style.maxWidth = '794px';
      sheet.style.background = '#fff';
      sheet.style.color = '#111';

      await this.waitForImages(sheet);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      geometry = this.measurePdfSheetGeometry(sheet);
      if (!geometry.ok) throw new Error('sheet_geometry_unavailable');
      if (geometry.left < -1 || geometry.left > 40) {
        throw new Error('pdf_sheet_not_origin_aligned');
      }
      if (geometry.width < 700 || geometry.width > 900) {
        throw new Error('pdf_sheet_width_not_a4');
      }

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
          scrollX: 0,
          scrollY: 0,
          onclone: (clonedDoc) => {
            const clonedSheet = clonedDoc.querySelector('.doc-sheet');
            const clonedBody = clonedDoc.body;
            const clonedHtml = clonedDoc.documentElement;
            if (clonedHtml) {
              clonedHtml.style.margin = '0';
              clonedHtml.style.padding = '0';
              clonedHtml.style.background = '#fff';
              clonedHtml.style.width = '794px';
            }
            if (clonedBody) {
              clonedBody.style.margin = '0';
              clonedBody.style.padding = '0';
              clonedBody.style.background = '#fff';
              clonedBody.style.transform = 'none';
              clonedBody.style.left = '0';
              clonedBody.style.top = '0';
              clonedBody.style.position = 'static';
              clonedBody.style.width = '794px';
              clonedBody.style.overflow = 'hidden';
            }
            if (clonedSheet) {
              clonedSheet.style.position = 'relative';
              clonedSheet.style.left = '0';
              clonedSheet.style.top = '0';
              clonedSheet.style.margin = '0';
              clonedSheet.style.transform = 'none';
              clonedSheet.style.boxShadow = 'none';
              clonedSheet.style.width = '794px';
              clonedSheet.style.maxWidth = '794px';
              clonedSheet.style.minHeight = '1123px';
              clonedSheet.style.background = '#fff';
              clonedSheet.style.color = '#111';
            }
          }
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait',
          compress: true
        },
        image: { type: 'jpeg', quality: 0.98 }
      }).from(sheet).save();

      return { ok: true, filename, geometry };
    } finally {
      iframe.remove();
    }
  }
};

if (typeof window !== 'undefined') {
  window.BudilDocExport = BudilDocExport;
}
