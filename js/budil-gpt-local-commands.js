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
    return NAME.test(name) && !/^お客様$/.test(name) ? name : '';
  };
  function parse(raw, {today,anonymizer}={}) {
    if (typeof raw!=='string'||!raw.trim()||raw.length>220||
        /[\x00-\x1f]/.test(raw)) return deny('INPUT_INVALID');
    const text=raw.replace(/[　\s]+/g,'').trim();
    // Quote drafts are parsed on-device and never activate external GPT.
    if (anonymizer && typeof anonymizer.prepare==='function') {
      const quote=anonymizer.prepare(raw);
      if (quote.ok) return Object.freeze({
        ok:true,action:'quote.draft',original:raw,
        readOnly:false,persisted:false,requiresCustomerConfirmation:true,
        requiresDocumentApproval:true,networkUsed:false
      });
    }
    if (/^(?:現在の)?未入金(?:合計|の合計)?を(?:教えて|確認して|見せて)$/.test(text)) {
      if(typeof today!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(today))
        return deny('DATE_REQUIRED');
      return Object.freeze({
        ok:true,action:'receivables.summary',request:{action:'receivables.summary',date:today},
        readOnly:true,networkUsed:false
      });
    }
    const document=text.match(/^(.+?)の(見積書|請求書)を(?:探して|検索して|見せて)$/);
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
    const work=text.match(/^(.+?)の作業予定を(?:教えて|探して|検索して|見せて)$/);
    if(work){
      const name=safeName(work[1]);if(!name)return deny('NAME_INVALID');
      return Object.freeze({
        ok:true,action:'work.search',request:{action:'work.search',query:name,limit:10},
        readOnly:true,networkUsed:false
      });
    }
    const customer=text.match(/^(.+?)(?:さん|様)を(?:探して|検索して)$/);
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
