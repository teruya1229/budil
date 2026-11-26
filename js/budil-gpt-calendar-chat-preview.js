/** Budil GPT: local-only calendar preview conversation. No write endpoints. */
const BudilGptCalendarChatPreview=(()=>{
 'use strict';
 let pending=null,version=0;
 const $=id=>document.getElementById(id);
 const get=name=>typeof window!=='undefined'?window[name]:null;
 const panel=()=>$('budil-gpt-chat-history');
 const clearComposer=()=>{const input=$('budil-gpt-input');if(input)input.value='';};
 const result=(message,error=false)=>{
  const status=$('budil-gpt-chat-status');
  if(status){status.textContent=message;status.classList.toggle('budil-gpt-error',error);}
 };
 function node(tag,text,cls){
  const e=document.createElement(tag);
  if(text!==undefined)e.textContent=String(text);
  if(cls)e.className=cls;
  return e;
 }
 function say(text){
  const box=node('div',undefined,'budil-gpt-chat-local');
  box.append(node('p',text));panel()?.append(box);
  return box;
 }
 const isValidTime=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
 function parseEnd(raw){
  const v=String(raw||'').trim().replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0)).replace(/[　\s]/g,'');
  let m=v.match(/^(\d{1,2}):(\d{2})(?:まで)?$/);
  if(m){const s=m[1].padStart(2,'0')+':'+m[2];return isValidTime(s)?s:'';}
  m=v.match(/^(午前|午後)?(\d{1,2})時(?:(\d{1,2})分)?(?:まで)?$/);
  if(!m)return '';
  let h=Number(m[2]),minute=Number(m[3]||0);
  if(!Number.isInteger(minute)||minute>59||h>23)return '';
  if(m[1]){if(h<1||h>12)return '';if(m[1]==='午後'&&h<12)h+=12;if(m[1]==='午前'&&h===12)h=0;}
  const s=String(h).padStart(2,'0')+':'+String(minute).padStart(2,'0');
  return isValidTime(s)?s:'';
 }
 function reset(){
  if(pending?.googleButton)pending.googleButton.disabled=true;
  version++;pending=null;
 }
 function ensureScope(scope){
  if(!scope)return false;
  if(pending&&pending.scope!==scope){reset();return false;}
  return true;
 }
 function freshOrders(){
  const Store=typeof Storage!=='undefined'?Storage:null;
  const list=Store&&typeof Store.getWorkOrders==='function'?Store.getWorkOrders():null;
  if(!Array.isArray(list))throw Error('WORK_READ_FAILED');
  return list;
 }
 function displayPlan(){
  if(!pending)return;
  const d=pending.intent;
  const name=d.customerName||'顧客未指定';
  say((d.action==='booking'?'新規予約':'予定変更')+'の仮確認：'+d.date+' '+d.startTime+'開始 / '+name+
   (d.serviceText?' / '+d.serviceText:'')+
   '。顧客・予定を本人が選択し、終了時刻を入力してください。Google予定の登録・変更、Budil保存は行いません。');
 }
 function finishIfReady(){
  const p=pending;if(!p||!p.endTime||!(p.selectedCustomer||p.selectedOrder))return;
  // A changed end time or a new preview invalidates previous Google checks.
  if(p.googleButton)p.googleButton.disabled=true;
  p.googleButton=null;
  p.reviewEpoch=(p.reviewEpoch||0)+1;
  const reviewEpoch=p.reviewEpoch;
  const Preview=typeof BudilGptCalendarPreview!=='undefined'?BudilGptCalendarPreview:null;
  const Booking=typeof BudilGptBooking!=='undefined'?BudilGptBooking:null;
  if(!Preview||!Booking)return result('予約プレビュー機能を読み込めません。',true);
  try{
   const orders=freshOrders();
   if(p.selectedOrder&&JSON.stringify(orders.find(w=>String(w&&w.id)===p.selectedOrder.id))!==p.orderSnapshot)
    return result('選択した予定が変更されました。最初から確認してください。',true);
   if(p.selectedCustomer){
    const Store=typeof Storage!=='undefined'?Storage:null;
    const Resolver=typeof CustomerResolveEntrypoint!=='undefined'?CustomerResolveEntrypoint:null;
    const matches=Store?.getLeads?.().filter(l=>String(Resolver?.leadCustomerId(l)||'')===p.selectedCustomer.id)||[];
    if(matches.length!==1||Resolver.leadDisplayName(matches[0])!==p.selectedCustomer.name)
     return result('顧客データが変更されました。選択をやり直してください。',true);
   }
   const plan=Preview.review(p.intent,{orders,selectedCustomer:p.selectedCustomer,
    selectedOrder:p.selectedOrder,endTime:p.endTime,bookingBrain:Booking});
   if(!plan.ok){
    say('端末内プレビューは停止しました（'+plan.code+'）。重複や日時を確認してください。業務データは変更していません。');
    return result('端末内で安全な予約枠を確認できませんでした。',true);
   }
   const card=say(plan.date+' '+plan.startTime+'〜'+plan.endTime+
    ' / '+plan.customerName+' / '+plan.serviceText+'。端末内の予定に重複は見つかりません。ただしGoogleは未照合で、予約確定ではありません。');
   const google=node('button','Googleの予定を照合（読取のみ）','budil-gpt-btn budil-gpt-btn-secondary');
   google.type='button';card.append(google);
   p.googleButton=google;
   google.addEventListener('click',async()=>{
    const Cloud=get('BudilCloud'),Chat=typeof BudilGptChat!=='undefined'?BudilGptChat:null;
    const liveScope=String(Cloud?.getGptSessionScope?.()||'');
    if(!pending||pending!==p||p.reviewEpoch!==reviewEpoch||
       pending.scope!==liveScope||!google.isConnected||google.disabled)return;
    google.disabled=true;
    const requestVersion=version;
    let response=null;
    try{
     response=Cloud?.fetchScheduleBlocks?await Cloud.fetchScheduleBlocks(plan.date,plan.date):null;
     if(Chat?.shouldUseLocalCalendarFallback?.(response)&&Cloud?.fetchLocalScheduleBlocks)
      response=await Cloud.fetchLocalScheduleBlocks(plan.date,plan.date);
     if(requestVersion!==version||pending!==p||p.reviewEpoch!==reviewEpoch||
        pending.scope!==String(Cloud?.getGptSessionScope?.()||'')||!google.isConnected)return;
     if(response?.ok!==true||response.readOnly!==true||
        response.calendarWritePerformed!==false||!Array.isArray(response.events))
      throw Error('READ_UNVERIFIED');
     const check=Booking.googleScheduleReview(response.events,plan.date,plan.startTime,plan.endTime);
     if(!check.ok)throw Error('GOOGLE_UNVERIFIED');
     if(check.hasConflict){say('Googleに重なる予定が'+check.overlapCount+'件あります。予約作成・変更は停止してください。');result('Google予定に重複があります。保存しません。',true);}
     else {say('連携済みGoogleの対象時間帯に重複は見つかりませんでした。ただし他カレンダーや未登録予定は未照合です。予約の確定・Google登録は未実施です。');result('Google読取成功（重複0）。予約確定ではありません。');}
    }catch(_){
     if(requestVersion===version&&pending===p&&p.reviewEpoch===reviewEpoch&&
        pending.scope===String(Cloud?.getGptSessionScope?.()||'')){
      say('Google読取に失敗しました。空き確定ではありません。');
      result('Google未照合。予約確定ではありません。',true);
     }
    }finally{
     if(requestVersion===version&&pending===p&&p.reviewEpoch===reviewEpoch&&
        pending.scope===String(Cloud?.getGptSessionScope?.()||''))google.disabled=false;
    }
   });
   result('端末内予約プレビュー成功。Google登録・WorkOrder保存は行っていません。');
  }catch(_){result('端末内予約プレビューを確認できません。業務データは変更していません。',true);}
 }
 function chooseCustomer(customer,scope){
  if(!pending||pending.scope!==scope)return;
  pending.selectedCustomer={id:String(customer.customerId),name:String(customer.displayName),explicitlySelected:true};
  say('顧客の候補を選択しました：'+customer.displayName+'（端末内IDを使い確認）。');
  finishIfReady();
 }
 function chooseOrder(order,scope){
  if(!pending||pending.scope!==scope)return;
  pending.selectedOrder={id:String(order.id),explicitlySelected:true};
  pending.orderSnapshot=JSON.stringify(order);
  say('変更対象を選択しました：'+String(order.customerName)+' / '+String(order.scheduledDate)+' '+String(order.startTime||'時刻不明')+' / ID '+order.id);
  finishIfReady();
 }
 function showChoices(scope){
  const p=pending,intent=p.intent,selectionVersion=version;
  const Store=typeof Storage!=='undefined'?Storage:null;
  if(intent.action==='booking'){
   if(!intent.customerName){say('新規予約には登録済み顧客の氏名が必要です。氏名を含めて再入力してください。');reset();return;}
   const Resolver=typeof CustomerResolveEntrypoint!=='undefined'?CustomerResolveEntrypoint:null;
   let leads,match;
   try{leads=Store?.getLeads?.();match=Array.isArray(leads)&&Resolver?.resolve?.({name:intent.customerName,limit:10},{leads});}
   catch(_){result('顧客候補を読み取れません。',true);reset();return;}
   if(!Array.isArray(leads)||!Resolver){
    say('登録済み顧客を読み取れません。端末内データを確認してください。');reset();return;
   }
   let candidates=match?.ok&&Array.isArray(match.candidates)?match.candidates:[];
   // The canonical resolver intentionally requires an EXACT full name.
   // Only this unsaved preview may present Japanese surname-prefix matches.
   // Never auto-pick, even if just one; the exact customer ID is mandatory.
   if(!candidates.length&&match?.status==='not_found'&&
      /^[一-龯々]{2,6}$/u.test(intent.customerName)){
    const norm=Resolver.normalizeName(intent.customerName),seen=new Set();
    const found=[];
    for(const lead of leads){
     const id=Resolver.leadCustomerId(lead);
     const display=Resolver.leadDisplayName(lead);
     if(!id||seen.has(id)||!Resolver.normalizeName(display).startsWith(norm))continue;
     seen.add(id);
     found.push(Resolver.toCandidate(lead,'surname_preview'));
     if(found.length>10)break;
    }
    if(found.length>10){
     say('同じ姓の登録顧客が10件を超えるため候補を表示しません。フルネームを指定してください。');
     reset();return;
    }
    candidates=found;
   }
   if(!candidates.length){
    say('登録名と完全一致する顧客が見つかりません。姓だけの場合は候補10件以内に限り表示します。フルネームを確認してください。');
    reset();return;
   }
   const box=say('登録済み顧客の候補を本人が1件選択してください。同姓でも自動確定しません。');
   for(const c of candidates){
    const b=node('button',String(c.displayName)+'（'+String(c.municipality||'地域未登録')+'）',
     'budil-gpt-btn budil-gpt-btn-secondary');
    b.type='button';b.addEventListener('click',()=>{
     if(!pending||pending!==p||version!==selectionVersion||pending.scope!==scope)return;
     for(const x of box.querySelectorAll('button'))x.disabled=true;
     chooseCustomer(c,scope);
    });box.append(b);
   }
   return;
  }
  if(!intent.customerName){say('日時変更には顧客名を指定してください。対象となる予定を推測して一覧にしません。');reset();return;}
  let matches;
  try{
   matches=freshOrders().filter(w=>w&&String(w.id||'')&&
    ['tentative','confirmed'].includes(w.status)&&!w.candidateMeta&&!w.isAllDay&&
    (!w.scheduledEndDate||w.scheduledEndDate===w.scheduledDate)&&
    (!intent.customerName||w.customerName===intent.customerName||w.customerName?.startsWith(intent.customerName)));
  }catch(_){result('作業予定を読み取れません。',true);reset();return;}
  if(matches.length>10){say('変更候補が10件を超えます。顧客名を指定して絞り込んでください。');reset();return;}
  if(!matches.length){say('変更対象の作業予定が見つかりません。');reset();return;}
  const box=say('日時変更の対象を本人が1件選択してください。氏名だけで変更対象を決めません。');
  for(const w of matches){
   const b=node('button',String(w.customerName||'名称なし')+' / '+w.scheduledDate+
    ' '+String(w.startTime||'時間未設定')+' / ID '+w.id,'budil-gpt-btn budil-gpt-btn-secondary');
   b.type='button';b.addEventListener('click',()=>{
    if(!pending||pending!==p||version!==selectionVersion||pending.scope!==scope)return;
    for(const x of box.querySelectorAll('button'))x.disabled=true;
    chooseOrder(w,scope);
   });box.append(b);
  }
 }
 function tryHandle(raw,{today,scope}={}){
  if(!ensureScope(scope))return false;
  const text=String(raw||'').trim();
  if(pending){
   if(/^(?:キャンセル|中止|プレビュー中止)[。！!]?$/u.test(text)){
    reset();clearComposer();say('予約・日時変更の仮確認を中止しました。保存やGoogle書込みはしていません。');
    result('仮確認を中止しました。');return true;
   }
   const end=parseEnd(text);
   if(end){
    pending.endTime=end;
    clearComposer();
    say('終了時刻：'+end+'。');
    finishIfReady();
    if(!(pending.selectedCustomer||pending.selectedOrder))
     result('顧客または変更対象を選択してください。');
    return true;
   }
   const Preview=typeof BudilGptCalendarPreview!=='undefined'?BudilGptCalendarPreview:null;
   if(Preview?.parse(text,today)?.ok===true){reset();return tryHandle(text,{today,scope});}
   result('予約プレビューを確認中です。終了時刻（例：11:00）を入力するか、「中止」と送信してください。',true);
   return true;
  }
  const Preview=typeof BudilGptCalendarPreview!=='undefined'?BudilGptCalendarPreview:null;
  const intent=Preview?.parse(text,today);
  if(!intent?.ok)return false;
  pending={scope,intent,selectedCustomer:null,selectedOrder:null,endTime:'',orderSnapshot:'',
   reviewEpoch:0,googleButton:null};
  say('入力：'+text);
  displayPlan();showChoices(scope);
  if(pending)result('顧客・予定を選択し、終了時刻を入力してください。登録・変更は行っていません。');
  clearComposer();
  return true;
 }
 return Object.freeze({tryHandle,reset,parseEnd});
})();
if(typeof module!=='undefined'&&module.exports)module.exports={BudilGptCalendarChatPreview};
