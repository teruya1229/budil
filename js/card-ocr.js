/**
 * Budil v1.1 - 名刺OCRアダプター（API未接続・将来拡張用）
 *
 * 将来の接続例:
 *   CardOCR.setProvider('google-vision');
 *   const result = await CardOCR.extractFromImage(file);
 */
const CardOCR = {
  _provider: 'manual',

  setProvider(name) {
    this._provider = name;
  },

  getProvider() {
    return this._provider;
  },

  /**
   * 画像から名刺情報を抽出する（将来API差し替えポイント）
   * @returns {Promise<{provider, confidence, fields, rawText, message}>}
   */
  async extractFromImage(file) {
    if (this._provider !== 'manual' && typeof this._providers[this._provider] === 'function') {
      return this._providers[this._provider](file);
    }
    return this._manualExtract(file);
  },

  _providers: {
    // 将来: 'google-vision': async (file) => { ... },
    // 将来: 'tesseract': async (file) => { ... },
  },

  async _manualExtract(file) {
    return {
      provider: 'manual',
      confidence: 0,
      fields: {
        company: '',
        contact: '',
        title: '',
        email: '',
        phone: '',
        url: '',
        address: ''
      },
      rawText: '',
      imageName: file.name || '',
      message: 'OCR API未接続です。画像を確認し、下のフォームに入力してください。'
    };
  },

  emptyFields() {
    return {
      company: '', contact: '', title: '', email: '',
      phone: '', url: '', address: '', exchangeMemo: '', memo: ''
    };
  },

  validate(fields) {
    const errors = [];
    if (!fields.company || !fields.company.trim()) {
      errors.push('会社名は必須です');
    }
    return { valid: errors.length === 0, errors };
  },

  toLeadPayload(fields, recommendedProduct) {
    const today = new Date().toISOString().slice(0, 10);
    const memoParts = [];
    if (fields.title) memoParts.push('役職: ' + fields.title);
    if (fields.address) memoParts.push('住所: ' + fields.address);
    if (fields.exchangeMemo) memoParts.push('名刺交換メモ: ' + fields.exchangeMemo);
    if (fields.memo) memoParts.push(fields.memo);
    memoParts.push('名刺登録（' + today + '）');

    const priority = /興味|相談|フォロー|再連絡/.test(fields.exchangeMemo || '') ? 'A' : 'B';

    return {
      company: fields.company.trim(),
      contact: fields.contact || '',
      email: fields.email || '',
      phone: fields.phone || '',
      url: fields.url || '',
      address: fields.address || '',
      service: recommendedProduct || '',
      priority,
      priorityManual: false,
      status: '未接触',
      lastContact: today,
      nextContact: fields.nextContact || '',
      memo: memoParts.join(' / ')
    };
  }
};
