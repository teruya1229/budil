/** Local bank CSV preview. Raw statement data is never persisted or sent. */
const BudilGptBankReconcile = (() => {
  'use strict';
  const fail = code => ({ok:false,code});
  const aliases = {
    date:['日付','取引日','お取引日','入出金日','年月日'],
    credit:['入金','入金額','お預入れ','預入金額','貸方金額'],
    debit:['出金','出金額','お引出し','払出金額','借方金額'],
    direction:['入出金区分','取引区分','区分'],
    amount:['金額','取引金額'],
    description:['摘要','取引内容','お取引内容','依頼人名','振込依頼人'],
    id:['取引ID','取引番号','明細番号','取引識別番号']
  };
  const norm = s => String(s||'').normalize('NFKC').replace(/[\s　]/g,'').toLowerCase();
  const invoiceNumberIn = (description,number) => {
    const n=norm(number), text=String(description||'').normalize('NFKC').toLowerCase();
    if(!n)return false;
    const escaped=n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    return new RegExp('(^|[^a-z0-9])'+escaped+'($|[^a-z0-9])').test(text);
  };
  function csv(text) {
    if (text.charCodeAt(0)===0xfeff) text=text.slice(1);
    if (!text || /\0/.test(text)) return fail('CSV_INVALID');
    const rows=[];let row=[],field='',quote=false,closed=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(quote){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"'){quote=false;closed=true;}else field+=c;continue;}
      if(closed&&c!==','&&c!=='\r'&&c!=='\n')return fail('CSV_QUOTE_INVALID');
      if(c==='"'){if(field||closed)return fail('CSV_QUOTE_INVALID');quote=true;continue;}
      if(c===','){row.push(field);field='';closed=false;continue;}
      if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);field='';closed=false;
        if(row.some(x=>x!==''))rows.push(row);row=[];continue;}
      field+=c;closed=false;
    }
    if(quote)return fail('CSV_QUOTE_INVALID');
    if(field||row.length){row.push(field);rows.push(row);}
    return {ok:true,rows};
  }
  function mapping(header) {
    const map={};
    for(const [key,names] of Object.entries(aliases)){
      const hits=header.map((h,i)=>names.some(n=>norm(h)===norm(n))?i:-1).filter(i=>i>=0);
      if(hits.length>1)return fail('DUPLICATE_HEADER_'+key);
      map[key]=hits[0]??-1;
    }
    if(map.date<0||map.description<0||(!(map.credit>=0)&&
      !(map.direction>=0&&map.amount>=0)))return fail('HEADERS_REQUIRED');
    return {ok:true,map};
  }
  function date(s){
    const v=String(s||'').trim().normalize('NFKC').replace(/年|月/g,'/').replace(/日/g,'');
    const m=v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if(!m)return '';
    const iso=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
    const d=new Date(iso+'T00:00:00Z');
    return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===iso?iso:'';
  }
  function money(s){
    const v=String(s||'').trim().normalize('NFKC').replace(/[円,，\s]/g,'');
    return /^\+?\d+$/.test(v)&&Number.isSafeInteger(Number(v))?Number(v):null;
  }
  function parse(text){
    const parsed=csv(text);if(!parsed.ok)return parsed;
    if(parsed.rows.length<2)return fail('ROWS_REQUIRED');
    const header=parsed.rows[0], mapped=mapping(header);if(!mapped.ok)return mapped;
    const m=mapped.map, deposits=[],rejected=[],seen=new Set();
    parsed.rows.slice(1).forEach((r,index)=>{
      const line=index+2;
      if(r.length!==header.length){rejected.push({line,code:'COLUMN_COUNT'});return;}
      const get=k=>m[k]>=0?r[m[k]]:'';
      const day=date(get('date')), description=get('description').trim();
      if(!day||!description){rejected.push({line,code:'DATE_OR_DESCRIPTION'});return;}
      let amount;
      if(m.credit>=0){
        if(get('debit').trim()||!get('credit').trim()||
          (m.direction>=0&&!['入金','預入','credit','deposit'].includes(norm(get('direction'))))){
          rejected.push({line,code:'NOT_EXPLICIT_CREDIT'});return;}
        amount=money(get('credit'));
      }else{
        if(!['入金','預入','credit','deposit'].includes(norm(get('direction')))){
          rejected.push({line,code:'NOT_EXPLICIT_CREDIT'});return;}
        amount=money(get('amount'));
      }
      if(!amount||amount<=0){rejected.push({line,code:'AMOUNT_INVALID'});return;}
      const id=get('id').trim();
      if(id&&seen.has(id)){rejected.push({line,code:'DUPLICATE_TRANSACTION_ID'});return;}
      if(id)seen.add(id);
      deposits.push({line,date:day,amount,description,id});
    });
    if(rejected.some(r=>r.code==='DUPLICATE_TRANSACTION_ID'))return fail('DUPLICATE_TRANSACTION_ID');
    return {ok:true,deposits,rejected,mapping:m};
  }
  function candidates(deposits,documents,source,payment,revenues=[]){
    const assigned=new Set(documents.map(d=>d.bankMatch&&d.bankMatch.source===source?d.bankMatch.transactionId:'').filter(Boolean));
    return deposits.map(dep=>{
      const matches=documents.filter(d=>d.type==='invoice'&&d.status==='issued'&&
        d.paymentMethod==='bank_transfer'&&
        ['pending','未入金'].includes(d.paymentStatus)&&
        payment.migratePaymentStatus(d.paymentStatus,'')==='pending'&&
        Number.isSafeInteger(d.total)&&d.total===dep.amount&&
        Number(d.paidAmount||0)===0&&d.issueDate&&dep.date>=d.issueDate&&
        (d.unpaidAmount==null||d.unpaidAmount===''||Number(d.unpaidAmount)===d.total)&&
        !d.paidDate&&!d.bankMatch&&
        Number.isFinite(Date.parse((d.dueDate||d.issueDate)+'T00:00:00Z'))&&
        dep.date<=new Date(Date.parse((d.dueDate||d.issueDate)+'T00:00:00Z')+90*86400000).toISOString().slice(0,10)&&
        !d.linkedRevenueId)
        .map(d=>({id:d.id,number:d.number||'',customerName:d.customerName||'',
          linkedRevenue:revenues.some(r=>r.linkedDocumentId===d.id||
            (d.sourceWorkOrderId&&String(r.sourceWorkOrderId||r.workOrderId||'')===String(d.sourceWorkOrderId))),
          evidence:[d.number&&invoiceNumberIn(dep.description,d.number)?'請求書番号一致':'',
            d.customerName&&norm(dep.description).includes(norm(d.customerName))?'顧客名一致':''].filter(Boolean)}))
        .filter(c=>c.evidence.length);
      return {...dep,duplicate:!!dep.id&&assigned.has(dep.id),candidates:matches,
        confidence:matches.length===1&&matches[0].evidence.includes('請求書番号一致')?'高':
          matches.length===1?'要確認':'曖昧'};
    });
  }
  function apply({deposit,invoiceId,source,storage,payment,confirm}){
    if(confirm!==true)return fail('CONFIRM_REQUIRED');
    if(!source||!deposit||!deposit.id)return fail('TRANSACTION_ID_REQUIRED');
    const before=storage.getDocuments();
    const reviewed=candidates([deposit],before,source,payment)[0];
    if(reviewed.duplicate)return fail('DEPOSIT_ALREADY_ASSIGNED');
    if(reviewed.candidates.length!==1||reviewed.candidates[0].id!==invoiceId)
      return fail('MATCH_CHANGED_OR_AMBIGUOUS');
    const target=before.find(d=>d.id===invoiceId);
    if(!target)return fail('INVOICE_CHANGED');
    if(storage.getRevenueRecords().some(r=>r.linkedDocumentId===invoiceId||
      (target.sourceWorkOrderId&&String(r.sourceWorkOrderId||r.workOrderId||'')===String(target.sourceWorkOrderId))))
      return fail('LINKED_REVENUE_REQUIRES_MANUAL_UPDATE');
    const patch=payment.buildPaidPatch(target.total,deposit.date);
    const next=before.map(d=>d.id===invoiceId?{...d,...patch,
      bankMatch:{source,transactionId:deposit.id,date:deposit.date,amount:deposit.amount}}:d);
    try{const backup=storage.createSafetyBackup({reason:'budil_gpt_bank_csv_payment',
      targetKey:storage.KEYS.DOCUMENTS,targetId:invoiceId,data:before,beforeCount:before.length});
      if(!backup||!backup.id)return fail('BACKUP_FAILED');}
    catch(_){return fail('BACKUP_FAILED');}
    try{storage.saveDocuments(next);
      const read=storage.getDocuments();
      if(JSON.stringify(read)!==JSON.stringify(next))throw Error('READBACK_FAILED');
    }catch(_){try{storage.saveDocuments(before);}catch(_){return fail('ROLLBACK_FAILED');}
      return fail('SAVE_FAILED_ROLLED_BACK');}
    return {ok:true,invoiceId};
  }
  return Object.freeze({csv,parse,candidates,apply});
})();
if(typeof module!=='undefined'&&module.exports)module.exports={BudilGptBankReconcile};
