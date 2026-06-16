/**
 * Budil - 営業文面テンプレート生成
 * 思想: 相手を評価・指摘しない。敬意と提案型の文面。
 */
const MessageTemplates = {
  generateAll(lead) {
    const company = lead.company || '御社';
    const contact = lead.contact ? `${lead.contact}様` : 'ご担当者様';
    const service = lead.service || 'Web集客・広告運用';
    const region = lead.region ? `${lead.region}の` : '沖縄の';

    return {
      email: this.email(company, contact, service, region),
      form: this.contactForm(company, contact, service, region),
      dm: this.dm(company, contact, service),
      phone: this.phone(company, contact, service, region)
    };
  },

  email(company, contact, service, region) {
    return `件名：${region}現場業向けの仕組みのご案内

${company}
${contact}

お世話になっております。
照屋と申します。

${region}現場業向けに、${service}の仕組みを作っており、
御社と相性が良さそうだったため、ご連絡いたしました。

もしご興味があれば、15分ほどオンラインで
概要をお伝えできればと思います。

ご多忙のところ恐れ入りますが、
ご検討のほどよろしくお願いいたします。`;
  },

  contactForm(company, contact, service, region) {
    return `お世話になっております。照屋と申します。

${region}現場業向けに${service}の仕組みを作っており、
御社と相性が良さそうだったため、お問い合わせいたしました。

15分ほど概要をお伝えできればと思います。
ご検討のほど、よろしくお願いいたします。`;
  },

  dm(company, contact, service) {
    return `${contact}、はじめまして。照屋です。

名刺交換のお礼と、参考になりそうな仕組みのご案内です。
${service}について、御社のお役に立てそうな内容をまとめました。

もしよければ、詳細をお送りします。`;
  },

  phone(company, contact, service, region) {
    return `【電話トーク例】

「お世話になっております。照屋と申します。
${company}の${contact}でしょうか。

${region}現場業向けに${service}の仕組みを作っており、
御社と相性が良さそうだったため、ご連絡しました。

今お時間よろしいでしょうか？
もし今は難しければ、改めてお電話させていただいてもよろしいでしょうか。」`;
  }
};
