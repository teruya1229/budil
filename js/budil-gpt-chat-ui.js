/** Budil GPT chat view. Actual provider reasoning + local consent-gated read tools. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const button=$('budil-gpt-chat-send'),historyBox=$('budil-gpt-chat-history'),
   clear=$('budil-gpt-chat-clear'),statusBox=$('budil-gpt-chat-status');
 if(!button||!historyBox||!statusBox)return;
 const Chat=typeof BudilGptChat!=='undefined'?BudilGptChat:null;
 const Source=typeof BudilGptLocalSource!=='undefined'?BudilGptLocalSource:null;
 const ReadOnly=typeof BudilGptReadOnly!=='undefined'?BudilGptReadOnly:null;
 const Data=typeof Storage!=='undefined'?Storage:null;
 const Resolver=typeof CustomerResolveEntrypoint!=='undefined'?CustomerResolveEntrypoint:null;
 const Payment=typeof PaymentBrain!=='undefined'?PaymentBrain:null;
 const Profit=typeof ProfitBrain!=='undefined'?ProfitBrain:null;
 const DateTool=typeof BudilGptLocalCommands!=='undefined'?BudilGptLocalCommands:null;
 let sanitizedHistory=[],aliasMap=Object.create(null),busy=false,seq=0;
 const node=(tag,content,className)=>{
  const el=document.createElement(tag);
  if(content!==undefined)el.textContent=String(content);
  if(className)el.className=className;
  return el;
 };
 const note=(message,error=false)=>{
  statusBox.textContent=message;statusBox.classList.toggle('budil-gpt-error',error);
 };
 // A BudilCloud session is scoped to the CURRENT tab. Keep the existing
 // authenticated gateway; never use localStorage or copy tokens across tabs.
 const authPanel=$('budil-gpt-chat-auth'),authBtn=$('budil-gpt-chat-login'),
   authEmail=$('budil-gpt-chat-email'),authPassword=$('budil-gpt-chat-password'),
   authStatus=$('budil-gpt-chat-auth-status');
 let authBusy=false;
 function signedIn(){
  try{
   const Cloud=window.BudilCloud;
   return !!(Cloud&&typeof Cloud.getAuthState==='function'&&Cloud.getAuthState().signedIn===true);
  }catch(_){return false;}
 }
 function syncAuth(){
  const ready=signedIn();
  if(authPanel)authPanel.hidden=ready;
  return ready;
 }
 function showLogin(message){
  if(authPanel){
   authPanel.hidden=false;
   if(typeof authPanel.scrollIntoView==='function')
    authPanel.scrollIntoView({block:'nearest'});
  }
  note(message||'このタブでBudilにログインしてからGPTを利用してください。ログインだけでは業務データを送信しません。',true);
 }
 async function freeReadiness(){
  const Cloud=window.BudilCloud;
  if(!Cloud||typeof Cloud.getGptChatReadiness!=='function')
   return note('GPT会話の接続機能が読み込まれていません。',true);
  if(!syncAuth())return showLogin();
  const b=$('budil-gpt-chat-readiness');
  if(b)b.disabled=true;
  note('GPT会話の接続状態を確認中です。有料のGPT送信はしません。');
  try{
   const r=await Cloud.getGptChatReadiness();
   if(!r||r.ok!==true){
    if(r&&['not_signed_in','unauthorized'].includes(r.code))
     return showLogin('Budilのログイン認証が必要です。このタブでログインしてください。');
    return note('GPT接続状態を確認できません（'+(r&&r.code||'unavailable')+'）。',true);
   }
   note(r.ready?'GPTの認証・接続準備ができました。①②の同意を入れて質問を送信してください。':
    'Budilにはログインできましたが、GPTのサーバー設定は未準備です。管理者による確認が必要です。',!r.ready);
  }catch(_){note('GPT接続状態の確認に失敗しました。',true)}
  finally{if(b)b.disabled=false;}
 }
 if(authBtn)authBtn.addEventListener('click',async()=>{
  if(authBusy)return;
  const Cloud=window.BudilCloud;
  if(!Cloud||typeof Cloud.login!=='function')
   return note('Budilログイン機能が読み込まれていません。',true);
  const email=String(authEmail&&authEmail.value||'').trim();
  const password=String(authPassword&&authPassword.value||'');
  if(!email||!password){
   if(authStatus)authStatus.textContent='Budil登録済みのメールアドレスとパスワードを入力してください。';
   return;
  }
  authBusy=true;authBtn.disabled=true;
  if(authStatus)authStatus.textContent='Budilにログイン中…';
  let result;
  try{result=await Cloud.login(email,password);}
  catch(_){result={ok:false,message:'ログインの通信に失敗しました。'}}
  finally{
   if(authPassword)authPassword.value='';
   authBusy=false;authBtn.disabled=false;
  }
  if(!result||result.ok!==true){
   if(authStatus)authStatus.textContent=String(result&&result.message||'ログインに失敗しました。');
   return note('Budilにログインできませんでした。メールアドレスとパスワードを確認してください。',true);
  }
  if(!syncAuth()){
   if(authStatus)authStatus.textContent='ログイン状態を確認できませんでした。';
   return showLogin('Budilのログイン状態が確認できません。');
  }
  if(authStatus)authStatus.textContent='';
  if($('budil-gpt-input'))$('budil-gpt-input').focus();
  await freeReadiness();
 });
 $('budil-gpt-open')?.addEventListener('click',()=>syncAuth());
 function bubble(role,message){
  const div=node('div',undefined,'budil-gpt-chat-bubble');
  div.append(node('strong',role==='user'?'あなた':'Budil GPT'));
  div.append(node('p',message));
  historyBox.append(div);
  if(historyBox.scrollTo)historyBox.scrollTo({top:historyBox.scrollHeight,behavior:'smooth'});
  return div;
 }
 // GPT selects a read-only tool, but has never seen its result.
 // Never display the model's pre-read question as a final answer.
 function localAnswer(result,action,today){
  if(!result||result.ok!==true)
   return 'Budilの端末内データを読み取れませんでした。情報が0件とは判断できません。';
  if(action==='work.date'){
   const v=result.view||{};
   const date=typeof v.date==='string'?v.date:'指定日';
   const label=date===today?'今日（'+date+'）':date;
   const count=Number.isInteger(v.count)&&v.count>=0?String(v.count)+'件':'件数未確認';
   const calendar=' Googleカレンダーの照合結果は続けて表示します。照合できない場合は空き未確定です。';
   return label+'の、この端末に登録された作業予定は'+count+'です。'+calendar;
  }
  return 'Budil内の依頼された情報を確認しました。結果を下に表示します。';
 }
 function renderLocal(result,action){
  const div=node('div',undefined,'budil-gpt-chat-local');
  if(!result||result.ok!==true){
   div.append(node('p','端末内の情報を取得できませんでした。データは変更していません。'));
   historyBox.append(div);return;
  }
  const v=result.view||{}, rows=[];
  if(action==='work.date'){
   rows.push('対象日：'+v.date+'／端末内の作業予定 '+(v.count||0)+'件');
   for(const w of v.workOrders||[])rows.push(
    [w.scheduledDate,w.startTime||'',w.customerName||'',w.status||''].filter(Boolean).join(' ／ '));
   rows.push('Googleカレンダーの照合結果は別枠で表示します。空き確定ではありません。');
  }else if(action==='work.search'){
   rows.push('作業予定 '+(v.count||0)+'件');
   for(const w of v.workOrders||[])rows.push(
    [w.scheduledDate,w.customerName,w.status].filter(Boolean).join(' ／ '));
  }else if(action==='customer.search'||action==='customer.timeline'){
   rows.push('顧客候補 '+(v.candidateCount||0)+'件。氏名だけで同一人物を確定しません。');
   for(const c of v.candidates||[])rows.push([c.displayName,c.municipality].filter(Boolean).join(' ／ '));
  }else if(action==='document.search'||action==='document.period'){
   rows.push('帳票の検索結果（端末内）');
   for(const d of v.documents||[])rows.push([d.number,d.customerName,d.total].filter(x=>x!==null&&x!==undefined).join(' ／ '));
   rows.push('帳票の発行や保存は行っていません。');
  }else if(action==='receivables.summary'){
   rows.push('未入金合計：'+Number(v.pendingTotal||0).toLocaleString('ja-JP')+'円');
   rows.push('未入金件数：'+(v.count||0)+'件（銀行照合ではありません）');
  }else if(action==='profit.summary'){
   rows.push('当月の概算利益：'+Number(v.monthGrossProfit||0).toLocaleString('ja-JP')+'円');
   rows.push('未登録経費などにより変動します。');
  }else rows.push('端末内の読取処理が完了しました。');
  div.append(node('strong','Budil内の確認結果'));
  for(const line of rows.slice(0,13))div.append(node('p',line));
  if(v.tooMany||v.hasMore)div.append(node('p','結果の一部のみ表示しています。'));
  historyBox.append(div);
  if(action==='customer.timeline'&&result.ok===true&&Array.isArray(v.candidates)){
   for(const c of v.candidates.slice(0,10)){
    if(!c.customerId)continue;
    const select=node('button','この顧客の履歴を確認：'+String(c.displayName||'候補'),
      'budil-gpt-btn budil-gpt-btn-secondary');
    select.type='button';
    select.addEventListener('click',()=>{
     select.disabled=true;
     const source=Source.make({storage:Data,readonly:ReadOnly,
       customerResolver:Resolver,paymentBrain:Payment,profitBrain:Profit});
     const detail=source.query({action:'customer.timeline.detail',
       customerId:String(c.customerId),limit:10},true);
     const card=node('div',undefined,'budil-gpt-chat-local');
     if(!detail.ok)card.append(node('p','紐付け済みの履歴を取得できませんでした。'));
     else {
      const d=detail.view;
      card.append(node('strong',String(d.customerName||'選択した顧客')+'の作業・連絡履歴'));
      card.append(node('p','紐付け作業：'+String(d.linkedWorkCount||0)+'件'));
      for(const h of d.records||[])
       card.append(node('p',[h.date,h.kind,h.label,h.status].filter(Boolean).join(' ／ ')));
      card.append(node('p','氏名だけで未紐付け記録を推測していません。GPTへの顧客データ送信なし。'));
     }
     historyBox.append(card);
    });
    historyBox.append(select);
   }
  }
 }
 async function send(){
  if(busy)return;
  const Cloud=window.BudilCloud;
  if(!Chat||!Source||!ReadOnly||!Data||!DateTool||
     !Cloud||typeof Cloud.sendGptChat!=='function')
    return note('GPT会話のモジュールが読み込まれていません。',true);
  const raw=$('budil-gpt-input').value;
  if(!raw.trim())return note('まずGPTへの質問を入力してください。',true);
  if(!signedIn())return showLogin();
  if($('budil-gpt-consent').checked!==true||
     $('budil-gpt-chat-consent').checked!==true){
    note('GPT会話には①端末内データの読取と②匿名化した文章の外部送信、両方の同意が必要です。',true);
    const missing=$('budil-gpt-consent').checked!==true?
     $('budil-gpt-consent'):$('budil-gpt-chat-consent');
    if(missing)missing.focus();
    return;
  }
  let leads;
  try{leads=Data.getLeads()}catch{return note('顧客情報の匿名化に必要な端末データを読み取れません。',true)}
  const prepared=Chat.prepare(raw,leads,aliasMap);
  if(!prepared.ok)return note('この文章は外部送信できません（'+prepared.code+'）。住所・電話等を除き、1件ずつ入力してください。',true);
  for(const [k,v] of Object.entries(prepared.aliases)){
   if(aliasMap[k]&&aliasMap[k]!==v)return note('別の顧客を同じ呼称で参照しないため、会話をリセットしてください。',true);
  }
  const today=DateTool.todayTokyo();
  const queryHistory=Chat.safeHistory(sanitizedHistory);
  const token=++seq;
  busy=true;button.disabled=true;
  $('budil-gpt-consent').checked=false;
  $('budil-gpt-chat-consent').checked=false;
  note('GPTが内容を理解し、適切なBudil操作を検討しています。');
  try{
   const answer=await Cloud.sendGptChat(prepared.message,queryHistory,today);
   if(token!==seq)return;
   if(!answer||answer.ok!==true){
    const code=answer&&answer.code;
    if(code==='not_signed_in'||code==='unauthorized')
     return showLogin('Budilの認証が切れています。このタブでログインし直してください。データは変更していません。');
    return note('GPT接続に失敗しました（'+(code||'unavailable')+'）。データは変更していません。',true);
   }
   const merged={...aliasMap,...prepared.aliases};
   const verified=Chat.verify(answer,merged);
   if(!verified.ok)return note('GPTの操作案を安全に確認できませんでした（'+verified.code+'）。データは変更していません。',true);
   aliasMap=merged;
   bubble('user',raw.trim());
   let historyReply=verified.reply||'確認しました。';
   let localReadState=null;
   if(verified.request){
    const gateway=Source.make({storage:Data,readonly:ReadOnly,
      customerResolver:Resolver,paymentBrain:Payment,profitBrain:Profit});
    const local=gateway.query(verified.request,true);
    localReadState=local&&local.ok===true?'ok':'failed';
    bubble('assistant',localAnswer(local,verified.action,today));
    if(local&&local.ok===true)renderLocal(local,verified.action);
    historyReply=local&&local.ok===true?
      'Budil端末内で'+verified.action+'の読取処理を行いました。'+
      (verified.request.date||'')+' 詳細な顧客・作業情報は外部GPTへ共有していません。':
      '端末内データの読取に失敗しました。詳細な顧客・作業情報は取得も外部共有もしていません。';
    note(local&&local.ok===true?
      '端末内データを確認しました。Googleの時間枠は別枠で照合します。':
      '端末内データの読取に失敗しました。情報がないと断定していません。',!(local&&local.ok===true));
   }else{
    bubble('assistant',historyReply);
   }
   // The verified model chooses a read-only work date. Only then use the
   // existing authenticated Google binding to read busy times, without
   // sending event titles, locations or customer data to GPT.
   let googleState=null;
   if(verified.action==='work.date'&&verified.request&&
      typeof Chat.summarizeCalendarRead==='function'){
    const date=verified.request.date;
    const panel=node('div',undefined,'budil-gpt-chat-local');
    panel.append(node('strong','Googleカレンダー照合（連携済みのカレンダー・読取のみ）'));
    const message=node('p','対象日 '+date+' の時間枠を確認中です。');
    panel.append(message);historyBox.append(panel);
    try{
     const response=typeof Cloud.fetchScheduleBlocks==='function'?
      await Cloud.fetchScheduleBlocks(date,date):{ok:false,code:'calendar_read_unavailable'};
     if(token!==seq)return; // conversation reset or closed during the read
     const summary=Chat.summarizeCalendarRead(response,date);
     if(summary.ok){
      googleState='ok';
      message.textContent='連携済みGoogleカレンダーの忙しい時間枠は'+
       summary.busySlotCount+'枠です。予定の件数や空き確定ではありません。';
      for(const w of summary.windows)
       panel.append(node('p',w.start+'〜'+w.end+'（JST・予定詳細は非表示）'));
      if(summary.hasMore)panel.append(node('p','表示は先頭12枠。残りの時間枠があります。'));
      panel.append(node('p','別カレンダー・未登録の予定は未照合です。予約可能とは判断しません。'));
     }else{
      googleState='unknown';
      const raw=response&&typeof response.code==='string'?response.code:'';
      const code=/^[a-z_]{2,45}$/i.test(raw)?raw:'unavailable';
      message.textContent='Googleカレンダーは未照合です（'+code+
        '）。端末内の予定が0件でも空き確定ではありません。';
     }
    }catch(_){
     if(token!==seq)return;
     googleState='unknown';
     message.textContent='Googleカレンダーの読取に失敗しました。空き確定ではありません。';
    }
   }
   sanitizedHistory.push({role:'user',content:prepared.message},
                         {role:'assistant',content:historyReply});
   sanitizedHistory=Chat.safeHistory(sanitizedHistory);
   if(verified.proposal){
    const div=node('p','これは操作案です。予約・帳票・顧客データは変更していません。正式な確認・承認画面が必要です。');
    historyBox.append(div);note('変更操作は未実行です。');
   }else if(googleState==='ok'&&localReadState==='failed')
    note('Googleの時間枠は取得できましたが、Budil端末内データは取得できませんでした。作業予定・空きの確定には使えません。',true);
   else if(googleState==='ok')
    note('Budil端末の予定とGoogleの時間枠を確認しました。業務データの書込なし。');
   else if(googleState==='unknown')
    note('端末内の結果は表示しましたが、Googleの予定は未照合です。空き確定ではありません。',true);
   else note('GPTとの会話を表示しました。業務データの変更は行っていません。');
   $('budil-gpt-input').value='';
  }catch(_){if(token===seq)note('GPTに接続できませんでした。データは変更していません。',true)}
  finally{busy=false;button.disabled=false;}
 }
 button.addEventListener('click',send);

 const readyButton=$('budil-gpt-chat-readiness');
 if(readyButton)readyButton.addEventListener('click',freeReadiness);

 clear.addEventListener('click',()=>{
  seq++;sanitizedHistory=[];aliasMap=Object.create(null);
  historyBox.replaceChildren();$('budil-gpt-chat-consent').checked=false;
  note('会話をリセットしました。保存済み業務データは変更していません。');
 });
 $('budil-gpt-close')?.addEventListener('click',()=>{
  seq++;sanitizedHistory=[];aliasMap=Object.create(null);
  historyBox.replaceChildren();$('budil-gpt-chat-consent').checked=false;
 });
})();
