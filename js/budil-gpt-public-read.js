/** Privacy-first, deliberately bounded external GPT read-only prompts. */
const BudilGptPublicRead=(()=>{
 'use strict';
 const deny=code=>Object.freeze({ok:false,code});
 const words='(?:教えて|見せて|探して|検索して|確認して|表示して|教えてください|見せてください|検索してください|表示してください|確認したい)';
 function normalize(raw){
   if(typeof raw!=='string'||raw.length<2||raw.length>180||
      /[\x00-\x1f]/.test(raw))return '';
   return raw.replace(/[　\s]/g,'').replace(/[。？！!?]+$/u,'');
 }
 function intentFromText(raw){
   const text=normalize(raw);
   if(!text||/さん|様|顧客名|氏名|住所|電話|メール|口座|秘密|メモ|銀行明細|削除|変更|登録|送信|発行|入金済|支払|振込先/.test(text) ||
      /[^一-龯々ぁ-んァ-ヶー０-９0-9。、？！!?・：:〜～\/\-]/u.test(text))
     return deny('private_or_unsupported_input');
   let m=text.match(new RegExp('^(今月|先月)の(見積書|請求書)(?:の?一覧|の?件数)?(?:を)?'+words+'$'));
   if(m)return Object.freeze({ok:true,input:text,action:'document.period',
     period:m[1]==='先月'?'last_month':'this_month',
     document_type:m[2]==='見積書'?'estimate':'invoice',scope:'none'});
   m=text.match(new RegExp('^(今月の|現在の)?(?:未入金|売掛)(?:合計|の合計|額|金額|の金額)?(?:を'+words+'|はいくら(?:ですか)?)$'));
   if(m)return Object.freeze({ok:true,input:text,action:'receivables.summary',
     period:'none',document_type:'none',scope:m[1]==='今月の'?'this_month_expected':'total'});
   if(new RegExp('^今月の利益(?:を'+words+'|はいくら(?:ですか)?)$').test(text))
     return Object.freeze({ok:true,input:text,action:'profit.summary',
       period:'this_month',document_type:'none',scope:'none'});
   return deny('topic_not_allowlisted');
 }
 function prepare(raw){
   const s=intentFromText(raw);
   if(!s.ok)return s;
   return Object.freeze({ok:true,wire:{mode:'read_only_intent',instruction:s.input}});
 }
 function verify(raw,response){
   const expected=intentFromText(raw);
   if(!expected.ok)return expected;
   if(!response||typeof response!=='object'||response.ok!==true||
      response.phase!=='interpret_only'||response.input_mode!=='read_only_intent'||
      response.can_execute!==false||response.persisted!==false ||
      response.requires_human_approval!==true ||
      response.requires_local_consent!==true ||
      response.needs_user_input!==false)
     return deny('unsafe_gpt_response');
   if(response.action!==expected.action||response.period!==expected.period||
      response.document_type!==expected.document_type||
      response.scope!==expected.scope||
      response.weekday!=='none'||response.hour!==null||response.minute!==null)
     return deny('model_result_mismatch');
   return Object.freeze({ok:true,parsed:{
      ok:true,action:expected.action,
      periodLabel:expected.period==='last_month'?'先月':'今月',
      scope:expected.scope==='this_month_expected'?'this_month_expected':'all',
      readOnly:true,networkUsed:true
   }});
 }
 function localRequest(parsed,today){
   if(!parsed||!parsed.ok||typeof today!=='string'||
      !/^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-\d{2}$/.test(today))
     return deny('invalid_date_or_intent');
   if(parsed.action==='document.period'){
     const origMonth=Number(today.slice(5,7)),origYear=Number(today.slice(0,4));
     const d=new Date(Date.UTC(origYear,origMonth-1-(parsed.periodLabel==='先月'?1:0),1));
     const month=d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');
     return Object.freeze({ok:true,request:{
       action:'document.period',month,
       docType:parsed.document_type||'estimate',limit:10
     }});
   }
   if(parsed.action==='receivables.summary')
     return Object.freeze({ok:true,request:{action:'receivables.summary',date:today}});
   if(parsed.action==='profit.summary')
     return Object.freeze({ok:true,request:{action:'profit.summary',date:today}});
   return deny('unsupported_read_action');
 }
 return Object.freeze({prepare,verify,intentFromText,localRequest});
})();
if(typeof module!=='undefined'&&module.exports)module.exports={BudilGptPublicRead};
