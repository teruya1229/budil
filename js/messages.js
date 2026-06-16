/**
 * Budil v1.5 - 営業文面テンプレート生成
 * 思想: 相手を評価・指摘しない。敬意と提案型。沖縄の現場業向け。
 */
const MessageTemplates = {
  PRODUCTS: ['AI帳票番頭', '広告番頭', 'AI導入コンサル', 'BCサービス'],

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

  generateAll(lead, product) {
    const company = lead.company || '御社';
    const contact = lead.contact ? lead.contact + '様' : 'ご担当者様';
    const region = lead.region ? lead.region + 'の' : '沖縄の';
    const productKey = this.resolveProduct(product || lead.service);
    const copy = this.PRODUCT_COPY[productKey];

    return {
      product: productKey,
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
