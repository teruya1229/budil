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
  // Strict date-only local work lookup; no Google or other network call.
  const validWorkDate=(year,month,day)=>{
    if(year<1900||year>2099||month<1||month>12||day<1||day>31)return false;
    const d=new Date(Date.UTC(year,month-1,day));
    return d.getUTCFullYear()===year&&d.getUTCMonth()+1===month&&d.getUTCDate()===day;
  };
  const workDateFromPhrase=(phrase,today)=>{
    const tm=typeof today==='string'&&today.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const validToday=!!tm&&validWorkDate(+tm[1],+tm[2],+tm[3]);
    if(/^(今日|昨日|明日)$/.test(phrase)){
      if(!validToday)return null;
      const d=new Date(Date.UTC(+tm[1],+tm[2]-1,+tm[3]+(phrase==='昨日'?-1:phrase==='明日'?1:0)));
      return d.toISOString().slice(0,10);
    }
    const match=phrase.match(/^(?:(\d{4})[-/])?(\d{1,2})(?:[-/]|月)(\d{1,2})日?$/u);
    if(!match)return '';
    if(!match[1]&&!validToday)return null;
    const y=match[1]?+match[1]:+tm[1],m=+match[2],d=+match[3];
    if(!validWorkDate(y,m,d))return '';
    return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
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
    const datedWork=text.match(/^(今日|昨日|明日|(?:\d{4}[-/])?\d{1,2}(?:[-/]|月)\d{1,2}日?)の(?:作業)?予定(?:を|は)?(?:教えて|教えてください|確認して|確認してください|見せて|見せてください|検索して|検索してください|探して|探してください|[?？])?$/u);
    if(datedWork){
      const date=workDateFromPhrase(datedWork[1],today);
      if(date===null)return deny('DATE_REQUIRED');
      if(!date)return deny('DATE_INVALID');
      return Object.freeze({ok:true,action:'work.date',
        request:{action:'work.date',date,limit:10},
        interpretedDate:date,readOnly:true,networkUsed:false});
    }

    // Customer creation is never automatic. This is a preview-only intent;
    // the UI performs exact-name duplicate rechecks and a separate approve.
    const newCustomer=text.match(/^([一-龯々ぁ-んァ-ヶA-Za-z・ー]{3,32})(?:さん|様)を新規顧客として登録して$/u);
    const newName=newCustomer ? newCustomer[1].replace(/(さん|様)$/,'') : '';
    if(newCustomer && newName.length>=3 && !/(?:秘密|メモ|個人情報|削除|変更)/.test(newName)){
      return Object.freeze({
        ok:true,action:'customer.create.preview',
        request:{name:newName},readOnly:false,persisted:false,
        requiresUserConfirmation:true,networkUsed:false
      });
    }

    const profitMonthly=new RegExp('^今月の利益(?:はいくら(?:ですか)?|を'+readVerb+')'+endAnchor).test(text);
    if(profitMonthly){
      if(typeof today!=='string'||!/^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-\d{2}$/.test(today))
        return deny('DATE_REQUIRED');
      return Object.freeze({
        ok:true,action:'profit.summary',
        request:{action:'profit.summary',date:today},
        scope:'current_month_estimate',readOnly:true,networkUsed:false
      });
    }
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
    // Existing customer asset memo and linked job history are READ on this
    // device, never sent to GPT. Name lookup only suggests candidates; the
    // operator explicitly selects an exact customer ID before any details.
    const record=text.match(new RegExp('^(.+?)(?:さん|様)?の(過去の作業履歴|過去の作業|作業履歴|施工履歴|対応履歴|訪問履歴|作業実績|顧客タイプ|お客様タイプ|現場環境|作業環境|現場の環境|注意点|顧客メモ|お客様メモ|顧客情報|お客様情報|登録情報)(?:を(?:'+readVerb+'|'+searchVerb+'|出して|一覧で見せて)|は(?:何|どう|どんな感じ)(?:ですか)?)'+endAnchor)) ||
      text.match(new RegExp('^(.+?)(?:さん|様)の(履歴|メモ|環境|タイプ)(?:を(?:'+readVerb+'|'+searchVerb+'|出して))'+endAnchor));
    const recordAbout=!record&&text.match(/^(.+?)(?:さん|様)ってどんな(?:お客さん|お客様)(?:ですか)?$/u);
    if(record||recordAbout){
      const name=safeName((record||recordAbout)[1]);
      if(!name)return deny('NAME_INVALID');
      const topic=record?record[2]:'顧客情報';
      return Object.freeze({
        ok:true,action:'customer.timeline',
        request:{action:'customer.timeline',query:name,limit:10},
        recordTopic:topic,readOnly:true,networkUsed:false
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
