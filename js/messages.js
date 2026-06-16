/**
 * Budil v1.5 - 営業文面テンプレート生成
 * 思想: 相手を評価・指摘しない。敬意と提案型。沖縄の現場業向け。
 */
const MessageTemplates = {
  PRODUCTS: ['AI帳票番頭', '広告番頭', 'AI導入コンサル', 'BCサービス'],

  PRESETS: {
    ai_docs: {
      label: 'AI帳票番頭を売る',
      product: 'AI帳票番頭',
      copyOverride: {
        hook: '現場業の受付・請求・帳票作業を減らす提案',
        benefit: '受付〜請求〜帳票まわりで起きがちな転記・確認の手間を軽くし、必要な情報が届く状態へ',
        offer: '御社の運用に合わせた導入イメージを、15分ほどオンラインでお伝え'
      }
    },
    ads: {
      label: '広告番頭を売る',
      product: '広告番頭',
      copyOverride: {
        hook: 'Google広告やLP改善の判断を助ける提案',
        benefit: '検索やMEOなどから問い合わせにつながる導線を整え、成果に近づく動きを整理',
        offer: '現状の集客の整理と、取り組みやすい第一歩を一緒に考えるお時間'
      }
    },
    ai_consult: {
      label: 'AI導入コンサルを売る',
      product: 'AI導入コンサル',
      copyOverride: {
        hook: '現場業の業務に合わせたAI活用の整理と設計',
        benefit: 'いきなり導入ではなく、何から始めるかを明確にして無理のない形へ',
        offer: '業務の棚卸しから入って、無理のないAI導入の進め方を提案'
      }
    },
    bc_clean: {
      label: 'BCサービス清掃営業',
      product: 'BCサービス',
      copyOverride: {
        hook: '店舗・施設・管理会社向けに清掃品質を安定させる仕組み',
        benefit: '現場目線で定期対応・品質維持・再発予防を支援',
        offer: '物件や現場の状況に合わせた清掃メニューのご案内'
      }
    },
    washer: {
      label: '洗濯機クリーニング営業',
      product: 'BCサービス',
      copyOverride: {
        hook: '洗濯機クリーニングで「カビ臭い・乾燥不良」を減らす提案',
        benefit: '現場で多い「洗濯機のにおい・状態」を起点に、再発しにくい運用へ',
        offer: '洗濯機の状況に合わせた対応手順を15分ほどご一緒にお伝え'
      }
    },
    ac_corp: {
      label: 'エアコンクリーニング法人営業',
      product: 'BCサービス',
      copyOverride: {
        hook: '法人向けにエアコン臭・黒カビを減らす提案',
        benefit: '現場の運用に合わせて、定期対応で品質を守り続ける仕組みへ',
        offer: '法人様の運用に合わせた清掃メニューのご提案をお送りします'
      }
    }
  },

  PRODUCT_COPY: {
    'AI帳票番頭': {
      label: 'AI帳票番頭',
      hook: '帳票・請求まわりの事務負担を軽くする仕組み',
      benefit: '現場と事務の間で起きがちな転記・確認の手間を減らす',
      offer: '御社の帳票フローに合わせた導入イメージを、15分ほどオンラインでお伝え'
    },
    '広告番頭': {
      label: '広告番頭',
      hook: '沖縄の現場業向けに設計した集客・広告の仕組み',
      benefit: '検索やMEOを含め、問い合わせにつながる導線づくりを支援',
      offer: '現状の集客の整理と、取り組みやすい第一歩をご一緒に考えるお時間'
    },
    'AI導入コンサル': {
      label: 'AI導入コンサル',
      hook: '現場業の業務に合わせたAI活用の整理・設計',
      benefit: 'いきなり導入ではなく、何から始めるかを一緒に整理',
      offer: '業務の棚卸しから入れる、無理のないAI導入の進め方をご提案'
    },
    'BCサービス': {
      label: 'BCサービス',
      hook: 'エアコン・洗濯機・浴室など、現場クリーニングの定期対応',
      benefit: '管理物件や施設のクオリティ維持に、現場目線で伴走',
      offer: '物件や現場の状況に合わせた清掃メニューのご案内'
    }
  },

  resolveProduct(product) {
    if (product && this.PRODUCT_COPY[product]) return product;
    const keys = Object.keys(this.PRODUCT_COPY);
    for (let i = 0; i < keys.length; i++) {
      if (product && (product.includes(keys[i]) || keys[i].includes(product))) return keys[i];
    }
    return 'AI帳票番頭';
  },

  getPresetLabel(presetKey) {
    return (presetKey && this.PRESETS[presetKey] && this.PRESETS[presetKey].label) || null;
  },

  resolveProductWithPreset(product, presetKey, lead) {
    const preset = presetKey ? this.PRESETS[presetKey] : null;
    if (preset && preset.product && this.PRODUCT_COPY[preset.product]) return preset.product;
    return this.resolveProduct(product || (lead ? lead.service : null));
  },

  getCopyFor(productKey, presetKey) {
    const base = this.PRODUCT_COPY[productKey] || this.PRODUCT_COPY['AI帳票番頭'];
    const preset = presetKey ? this.PRESETS[presetKey] : null;
    if (!preset || !preset.copyOverride) return base;
    return { ...base, ...preset.copyOverride, label: base.label };
  },

  generateAll(lead, product, presetKey) {
    const company = lead.company || '御社';
    const contact = lead.contact ? lead.contact + '様' : 'ご担当者様';
    const region = lead.region ? lead.region + 'の' : '沖縄の';
    const productKey = this.resolveProductWithPreset(product, presetKey, lead);
    const copy = this.getCopyFor(productKey, presetKey);

    return {
      product: productKey,
      preset: presetKey,
      email: this.email(company, contact, region, copy),
      form: this.contactForm(company, contact, region, copy),
      dm: this.dm(company, contact, copy),
      phone: this.phone(company, contact, region, copy)
    };
  },

  email(company, contact, region, copy) {
    return '件名：' + region + '現場業向け「' + copy.label + '」のご案内\n\n'
      + company + '\n'
      + contact + '\n\n'
      + 'お世話になっております。\n'
      + '照屋と申します。\n\n'
      + region + '現場業向けに、' + copy.hook + 'をご支援しており、\n'
      + '御社の状況と相性が良さそうだったため、ご連絡いたしました。\n\n'
      + copy.benefit + 'お役に立てるかもしれないと感じております。\n\n'
      + 'もしご興味があれば、' + copy.offer + 'できればと思います。\n\n'
      + 'ご多忙のところ恐れ入りますが、\n'
      + 'ご検討のほどよろしくお願いいたします。';
  },

  contactForm(company, contact, region, copy) {
    return 'お世話になっております。照屋と申します。\n\n'
      + region + '現場業向けに「' + copy.label + '」（' + copy.hook + '）をご支援しており、\n'
      + '御社の状況と相性が良さそうだったため、お問い合わせいたしました。\n\n'
      + copy.benefit + '点について、参考になれば幸いです。\n\n'
      + 'ご興味があれば、' + copy.offer + 'させていただければと思います。\n'
      + 'ご検討のほど、よろしくお願いいたします。';
  },

  dm(company, contact, copy) {
    return contact + '、はじめまして。照屋です。\n\n'
      + '名刺交換のお礼と、参考になりそうなご案内です。\n'
      + '「' + copy.label + '」について、' + copy.benefit + '内容をまとめました。\n\n'
      + 'もしよければ、詳細をお送りします。';
  },

  phone(company, contact, region, copy) {
    return '【電話トーク例】\n\n'
      + '「お世話になっております。照屋と申します。\n'
      + company + 'の' + contact + 'でしょうか。\n\n'
      + region + '現場業向けに「' + copy.label + '」のご支援をしており、\n'
      + '御社の状況と相性が良さそうだったため、ご連絡しました。\n\n'
      + '帳票や集客、現場まわりでお困りのことがあれば、\n'
      + '無理のない形でお役に立てるかもしれないと思いまして。\n\n'
      + '今お時間よろしいでしょうか？\n'
      + 'もし今は難しければ、改めてお電話させていただいてもよろしいでしょうか。」';
  }
};
