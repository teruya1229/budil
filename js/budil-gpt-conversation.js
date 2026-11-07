/**
 * Budil local multi-turn estimate intake.
 * This is NOT a free-form agent or an executor. It fills only missing
 * price/tax fields for explicit AC-cleaning quotes, without reading data.
 */
const BudilGptConversation=(()=>{
  'use strict';
  const MAX_YEN=100000000;
  const nameRe=/^[一-龯々ぁ-んァ-ヶｦ-ﾟー・A-Za-z]{2,40}$/u;
  const deny=code=>Object.freeze({ok:false,code});
  function normalize(raw){
    if(typeof raw!=='string'||!raw.trim()||raw.length>220||
       /[\x00-\x1f]/.test(raw))return '';
    return raw.replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0))
      .replace(/[　\s]/g,'').replace(/[。．！!？?]+$/u,'');
  }
  function price(text){
    if(typeof text!=='string'||!(/^[1-9][0-9]{0,8}$/.test(text)||
      /^[1-9][0-9]{0,2}(?:,[0-9]{3})+$/.test(text)))return null;
    const yen=Number(text.replace(/,/g,''));
    return Number.isSafeInteger(yen)&&yen>0&&yen<=MAX_YEN?yen:null;
  }
  function validated(fields){
    if(!fields || typeof fields!=='object'||Array.isArray(fields)||
      Object.keys(fields).some(k=>!['name','quantity','amount','tax'].includes(k)))return false;
    return nameRe.test(fields.name||'')&&
      !/^(お客様|先月|今月|明日|今日|来月)$/.test(fields.name)&&
      Number.isInteger(fields.quantity)&&fields.quantity>=1&&fields.quantity<=30&&
      (fields.amount===null||(Number.isSafeInteger(fields.amount)&&
        fields.amount>0&&fields.amount<=MAX_YEN))&&
      (fields.tax===null||fields.tax==='included'||fields.tax==='excluded');
  }
  function next(fields){
    if(!validated(fields))return deny('INVALID_FIELDS');
    if(fields.amount===null)return Object.freeze({ok:true,pending:true,
      prompt:'合計金額を教えてください。例：税込18,000円、または18,000円',
      fields:Object.freeze({...fields})});
    if(fields.tax===null)return Object.freeze({ok:true,pending:true,
      prompt:'金額は税込ですか、税抜ですか？ 「税込」か「税抜」と入力してください。',
      fields:Object.freeze({...fields})});
    const sentence=fields.name+'さんのエアコン洗浄'+fields.quantity+'台を'+
      (fields.tax==='included'?'税込':'税抜')+fields.amount+'円で見積して';
    return Object.freeze({ok:true,pending:false,canonical:sentence,
      fields:Object.freeze({...fields})});
  }
  function start(raw){
    const text=normalize(raw);
    if(!text)return deny('INPUT_INVALID');
    let m=text.match(/^(.+?)(?:さん|様)?[、,]?エアコン(?:洗浄|クリーニング)([0-9]{1,2})台で(?:(税込|税抜))?([0-9][0-9,]*)円の見積(?:書)?(?:お願い|作って|して)$/);
    if(m) {
      const amount=price(m[4]);if(amount===null)return deny('AMOUNT_INVALID');
      const fields={name:m[1],quantity:Number(m[2]),amount,
        tax:m[3]?(m[3]==='税込'?'included':'excluded'):null};
      return next(fields);
    }
    m=text.match(/^(.+?)(?:さん|様)?のエアコン(?:洗浄|クリーニング)([0-9]{1,2})台で見積(?:書)?(?:を)?(?:作って|お願い|して)$/);
    if(m)return next({name:m[1],quantity:Number(m[2]),amount:null,tax:null});
    m=text.match(/^(.+?)(?:さん|様)?のエアコン(?:洗浄|クリーニング)([0-9]{1,2})台を(?:(税込|税抜))?([0-9][0-9,]*)円で見積(?:書)?(?:を)?(?:作って|お願い|して)$/);
    if(m){
      const amount=price(m[4]);if(amount===null)return deny('AMOUNT_INVALID');
      return next({name:m[1],quantity:Number(m[2]),amount,
        tax:m[3]?(m[3]==='税込'?'included':'excluded'):null});
    }
    return deny('UNSUPPORTED_COMMAND');
  }
  function reply(fields,raw){
    if(!validated(fields))return deny('INVALID_FIELDS');
    const text=normalize(raw);
    if(!text)return deny('INPUT_INVALID');
    if(text==='中止'||text==='キャンセル')return Object.freeze({ok:false,cancelled:true,code:'CANCELLED'});
    if(fields.amount===null){
      const m=text.match(/^(?:(税込|税抜))?([0-9][0-9,]*)円(?:です|でお願いします)?$/);
      if(!m)return deny('AMOUNT_REQUIRED');
      const amount=price(m[2]);if(amount===null)return deny('AMOUNT_INVALID');
      return next({...fields,amount,tax:m[1]?(m[1]==='税込'?'included':'excluded'):fields.tax});
    }
    if(fields.tax===null){
      if(/^(税込|税込です|税込でお願いします)$/.test(text))return next({...fields,tax:'included'});
      if(/^(税抜|税抜です|税抜でお願いします)$/.test(text))return next({...fields,tax:'excluded'});
      return deny('TAX_REQUIRED');
    }
    return deny('ALREADY_COMPLETE');
  }
  return Object.freeze({start,reply});
})();
if(typeof module!=='undefined'&&module.exports)module.exports={BudilGptConversation};
