/**
 * Budil on-device command parser — STRICT, NON-GPT.
 * Never sends private customer details to a service.
 * The only accepted commands are fully matched read-only lookups or a
 * carefully bounded quote draft, which still requires customer confirmation.
 */
const BudilGptLocalCommands = (() => {
  'use strict';
  const NAME = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z・ー ]{2,40}$/u;
  const deny = code => Object.freeze({ok:false,code});
  const safeName = raw => {
    const name=String(raw||'').replace(/\s/g,'').replace(/(さん|様|御中)$/,'');
    return NAME.test(name) && !/^(?:お客様|今月|先月|来月|先々月|今週|先週|来週|今年|去年|昨年|来年|今日|昨日|明日|今期|前期)$/.test(name) ? name : '';
  };
  function parse(raw, {today,anonymizer}={}) {
    if (typeof raw!=='string'||!raw.trim()||raw.length>220||
        /[\x00-\x1f]/.test(raw)) return deny('INPUT_INVALID');
    const text=raw.replace(/[　\s]+/g,'').trim()
      .replace(/[。．！!？?]+$/u,'');
    // Bounded conversational variants only. Never treat arbitrary prose as
    // a command; every accepted sentence still must full-match a known read.
    const readVerb='(?:教えて|確認して|見せて|教えてください|確認してください|見せてください|確認したい)';
    const searchVerb='(?:探して|検索して|見せて|探してください|検索してください|見せてください|一覧を見せて|一覧を出して|確認して|確認したい)';
    // Quote drafts are parsed on-device and never activate external GPT.
    if (anonymizer && typeof anonymizer.prepare==='function') {
      const quote=anonymizer.prepare(raw);
      if (quote.ok) return Object.freeze({
        ok:true,action:'quote.draft',original:raw,
        readOnly:false,persisted:false,requiresCustomerConfirmation:true,
        requiresDocumentApproval:true,networkUsed:false
      });
    }
    const endAnchor=String.fromCharCode(36);
    const unpaidAll=new RegExp('^(?:現在の)?未入金(?:合計|の合計|額|の金額)?を'+readVerb+endAnchor).test(text) ||
      new RegExp('^(?:現在の)?未入金(?:合計|の合計|額|の金額)?はいくら(?:ですか)?'+endAnchor).test(text);
    const unpaidMonth=new RegExp('^今月の未入金(?:合計|の合計|額|の金額)?を'+readVerb+endAnchor).test(text) ||
      new RegExp('^今月の未入金(?:合計|の合計|額|の金額)?はいくら(?:ですか)?'+endAnchor).test(text);
    if (unpaidAll || unpaidMonth) {
      if(typeof today!=='string'||!/^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-\d{2}$/.test(today))
        return deny('DATE_REQUIRED');
      return Object.freeze({
        ok:true,action:'receivables.summary',request:{action:'receivables.summary',date:today},
        scope:unpaidMonth?'this_month_expected':'all',
        readOnly:true,networkUsed:false
      });
    }
    // A period is NOT a customer. Lookup issueDate in Budil's local documents.
    const period=text.match(new RegExp('^(今月|先月)の(見積書|請求書)(?:を'+searchVerb+'|一覧(?:を見せて|を出して|を確認して))'+endAnchor));
    if(period){
      if(typeof today!=='string'||!/^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-\d{2}$/.test(today))
        return deny('DATE_REQUIRED');
      const [year,month]=today.split('-').map(Number);
      const first=new Date(Date.UTC(year,month-1-(period[1]==='先月'?1:0),1));
      const monthKey=first.getUTCFullYear()+'-'+String(first.getUTCMonth()+1).padStart(2,'0');
      return Object.freeze({
        ok:true,action:'document.period',
        request:{action:'document.period',month:monthKey,
          docType:period[2]==='見積書'?'estimate':'invoice',limit:10},
        periodLabel:period[1],readOnly:true,networkUsed:false
      });
    }
    const document=text.match(new RegExp('^(.+?)の(見積書|請求書)を'+searchVerb+endAnchor));
    if (document) {
      const name=safeName(document[1]);
      if(!name)return deny('NAME_INVALID');
      return Object.freeze({
        ok:true,action:'document.search',
        request:{action:'document.search',query:name,limit:10},
        filterType:document[2]==='見積書'?'estimate':'invoice',
        readOnly:true,networkUsed:false
      });
    }
    const work=text.match(new RegExp('^(.+?)の作業予定を(?:'+readVerb+'|探して|検索して|探してください|検索してください)'+endAnchor));
    if(work){
      const name=safeName(work[1]);if(!name)return deny('NAME_INVALID');
      return Object.freeze({
        ok:true,action:'work.search',request:{action:'work.search',query:name,limit:10},
        readOnly:true,networkUsed:false
      });
    }
    const customer=text.match(new RegExp('^(.+?)(?:さん|様)を(?:探して|検索して|探してください|検索してください|見せて|確認して)'+endAnchor)) ||
      text.match(new RegExp('^([一-龯々]{2,6})を(?:探して|検索して|探してください|検索してください|見せて|確認して)'+endAnchor));
    if(customer){
      const name=safeName(customer[1]);if(!name)return deny('NAME_INVALID');
      return Object.freeze({
        ok:true,action:'customer.search',
        request:{action:'customer.search',query:name,limit:10},
        readOnly:true,networkUsed:false
      });
    }
    return deny('UNSUPPORTED_COMMAND');
  }
  function todayTokyo(now=new Date()){
    const parts=new Intl.DateTimeFormat('en-US',{
      timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(now);
    const get=type=>(parts.find(p=>p.type===type)||{}).value||'';
    return get('year')+'-'+get('month')+'-'+get('day');
  }
  return Object.freeze({parse,todayTokyo});
})();
if(typeof module!=='undefined'&&module.exports)module.exports={BudilGptLocalCommands};
