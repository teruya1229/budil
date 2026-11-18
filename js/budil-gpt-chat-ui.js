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
 let sanitizedHistory=[],aliasMap=Object.create(null),busy=false,seq=0,activeScope='';
 const CHAT_CONSENT_KEY='budil-gpt.chat-consent.v1';
 const CHAT_HISTORY_KEY='budil-gpt.safe-history.v2';
 const LEGACY_HISTORY_KEY='budil-gpt.safe-history.v1';
 const CHAT_HISTORY_TTL_MS=24*60*60*1000;
 let chatConsentAccepted=false;
 function readChatConsent(){
  try{return localStorage.getItem(CHAT_CONSENT_KEY)==='accepted';}
  catch(_){return false;}
 }
 function persistChatConsent(){
  chatConsentAccepted=true;
  try{localStorage.setItem(CHAT_CONSENT_KEY,'accepted');}catch(_){/* current page still stays accepted */}
 }
 function syncChatConsent(){
  chatConsentAccepted=chatConsentAccepted||readChatConsent();
  const panel=$('budil-gpt-chat-consent-panel');
  if(panel)panel.hidden=chatConsentAccepted;
  const box=$('budil-gpt-chat-consent');
  if(box&&chatConsentAccepted)box.checked=true;
  return chatConsentAccepted;
 }
 function ensureChatConsent(){
  if(syncChatConsent())return true;
  const box=$('budil-gpt-chat-consent');
  if(box&&box.checked===true){
   persistChatConsent();
   syncChatConsent();
   return true;
  }
  note('初回だけ①の同意が必要です。一度同意すれば、この端末では通常のGPT会話ごとに再チェックしません。',true);
  if(box)box.focus();
  return false;
 }
 const node=(tag,content,className)=>{
  const el=document.createElement(tag);
  if(content!==undefined)el.textContent=String(content);
  if(className)el.className=className;
  return el;
 };
 const note=(message,error=false)=>{
  statusBox.textContent=message;statusBox.classList.toggle('budil-gpt-error',error);
 };
 // BudilCloud keeps the authenticated Supabase session for this browser so
 // normal GPT conversation does not require a fresh login in every tab.
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
 function currentScope(){
  try{
   const Cloud=window.BudilCloud;
   return signedIn()&&Cloud&&typeof Cloud.getGptSessionScope==='function'?
     String(Cloud.getGptSessionScope()||''):'';
  }catch(_){return '';}
 }
 function syncAccountScope(){
  const scope=currentScope();
  if(!scope||(activeScope&&activeScope!==scope))forgetSafeHistory();
  activeScope=scope;
  return scope;
 }
 function syncAuth(){
  const ready=Boolean(syncAccountScope());
  if(authPanel)authPanel.hidden=ready;
  return ready;
 }
 function showLogin(message){
  if(authPanel){
   authPanel.hidden=false;
   if(typeof authPanel.scrollIntoView==='function')
    authPanel.scrollIntoView({block:'nearest'});
  }
  note(message||'Budilに一度ログインすると、ログアウトまたは認証失効まで通常はそのままGPTを利用できます。',true);
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
   note(r.ready?(syncChatConsent()?'GPTを利用できます。そのまま会話してください。':'GPTの接続準備ができました。初回だけ①に同意して送信してください。'):
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
 $('budil-gpt-open')?.addEventListener('click',()=>{syncAuth();syncChatConsent();});
 function bubble(role,message){
  const div=node('div',undefined,'budil-gpt-chat-bubble');
  div.append(node('strong',role==='user'?'あなた':'Budil GPT'));
  div.append(node('p',message));
  historyBox.append(div);
  if(historyBox.scrollTo)historyBox.scrollTo({top:historyBox.scrollHeight,behavior:'smooth'});
  return div;
 }
 // Only the anonymized provider history survives a page reload in this tab.
 // Original customer names, aliasMap, local records and Google event data NEVER
 // enter this cache. A new tab or a logged-out page cannot recover the record.
 function forgetSafeHistory(){
  try{
   sessionStorage.removeItem(CHAT_HISTORY_KEY);
   sessionStorage.removeItem(LEGACY_HISTORY_KEY);
  }catch(_){/* storage unavailable */}
  sanitizedHistory=[];aliasMap=Object.create(null);
  historyBox.replaceChildren();
 }
 function persistSafeHistory(){
  const scope=syncAccountScope();
  if(!scope||!Chat||typeof Chat.safeHistory!=='function')return;
  const history=Chat.safeHistory(sanitizedHistory);
  if(!history.length)return;
  try{sessionStorage.setItem(CHAT_HISTORY_KEY,
   JSON.stringify({savedAt:Date.now(),scope,history}));}
  catch(_){/* private mode: this tab still works in memory */}
 }
 function restoreSafeHistory(){
  const scope=syncAccountScope();
  if(!scope)return;
  let saved;
  try{
   const raw=sessionStorage.getItem(CHAT_HISTORY_KEY);
   if(!raw)return;
   saved=JSON.parse(raw);
   if(!saved||saved.scope!==scope||!Number.isFinite(saved.savedAt)||
      Date.now()-saved.savedAt>CHAT_HISTORY_TTL_MS||
      saved.savedAt>Date.now()||
      !Array.isArray(saved.history)||saved.history.length>8)throw Error('invalid');
   const history=Chat&&Chat.safeHistory(saved.history);
   if(!history||history.length!==saved.history.length||history.some((h,i)=>
      h.role!==saved.history[i].role||h.content!==saved.history[i].content))throw Error('invalid');
   sanitizedHistory=history;
   for(const h of history)bubble(h.role,h.content);
   if(history.length)note('匿名化済みの前回会話を復元しました。顧客名・作業明細・Google予定は再照合してください。');
  }catch(_){forgetSafeHistory();}
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
      const typeLabels={A:'安心重視型',B:'仕上がり重視型',C:'効率重視型',
        D:'防御型合理モード',E:'監査型',F:'確認安心型'};
      const typeLabel=v=>v?(typeLabels[v]?v+'：'+typeLabels[v]:String(v)):'';
      const customerTypes=[typeLabel(d.customerTypeMajor),typeLabel(d.customerTypeMinor)]
        .filter(Boolean).join(' / ');
      card.append(node('p','お客様タイプ：'+(customerTypes||'未登録')));
      card.append(node('p','現場環境・対応メモ：'+String(d.customerMemo||'未登録')));
      card.append(node('p','紐付け作業：'+String(d.linkedWorkCount||0)+'件'));
      card.append(node('p','紐付け売上：'+String(d.linkedRevenueCount||0)+'件'));
      // Every field remains on the already authenticated Budil browser.
      // Exact lead ID was chosen by the user; notes never enter GPT history.
      for(const h of d.records||[])
       card.append(node('p',[h.date,h.kind,h.label,h.status,h.note].filter(Boolean).join(' ／ ')));
      card.append(node('p','氏名だけで未紐付け記録を推測していません。GPTへの顧客データ送信なし。'));
     }
     historyBox.append(card);
    });
    historyBox.append(select);
   }
  }
 }
 // Fast local-first path: strict booking/quote grammar prepares the existing
 // Budil review screen. It sends NO customer data or prompt to a provider and
 // never presses an actual save/issue/confirm button.
 function legacyPreviewType(raw,today){
  const Booking=typeof BudilGptBooking!=='undefined'?BudilGptBooking:null;
  const Anon=typeof BudilGptAnonymize!=='undefined'?BudilGptAnonymize:null;
  try{
   const booking=Booking&&Booking.parse(raw,today);
   if(booking&&booking.ok&&['booking','reschedule'].includes(booking.action))return '予約';
   const QuoteCore=window.BudilGptFixtureCore;
   if($('budil-gpt-draft')?.hidden===false&&QuoteCore&&typeof QuoteCore.parseCorrection==='function'&&
      QuoteCore.parseCorrection(raw)?.ok===true)return '見積修正';
   const command=DateTool&&Anon&&DateTool.parse(raw,{today,anonymizer:Anon});
   if(command&&command.ok&&command.action==='quote.draft')return '見積';
   if(command&&command.ok&&command.action==='customer.create.preview')return '顧客';
   // Existing legacy UI only opens the payment or invoice preparation panel.
   // CSV matching, invoice issue and completion have separate owner checks.
   if(/^銀行明細と請求書を照合して[。！!]?$/u.test(raw))return '入金';
   if(/^(?:請求書の下書き|保存済み請求書)を確定して[。！!]?$/u.test(raw))return '請求';
   if(/^その見積を請求書にして[。！!]?$/u.test(raw))return '請求';
   if(/^.+?の作業を完了にして請求書を作って[。！!]?$/u.test(raw))return '請求';
  }catch(_){/* unsupported instructions go to the normal GPT planning path */}
  return '';
 }
 function startSafeLocalPreview(raw,today){
  const kind=legacyPreviewType(raw,today);
  if(!kind)return false;
  const legacy=$('budil-gpt-run'),consent=$('budil-gpt-consent');
  if(!legacy||!consent||legacy.disabled)return false;
  // User already accepted this exact device-local read consent for GPT.
  consent.checked=true;
  try{legacy.click();}finally{consent.checked=false;}
  const originalStatus=String($('budil-gpt-status')?.textContent||'');
  const details=document.querySelector('.budil-gpt-legacy-tools');
  if(details)details.open=true;
  const panels={予約:['budil-gpt-booking'],見積:['budil-gpt-candidates','budil-gpt-draft'],見積修正:['budil-gpt-draft'],
    顧客:['budil-gpt-customer-create'],請求:['budil-gpt-invoice'],入金:['budil-gpt-bank']};
  const panelReady=(panels[kind]||[]).some(id=>$(id)&&$(id).hidden===false);
  const stopped=/確認中です|見つかりません|準備できません|できません|停止しました|まだ対応していない/u.test(originalStatus);
  bubble('user',raw);
  if(!panelReady||stopped){
   bubble('assistant','端末内の'+kind+'準備を完了できませんでした。'+originalStatus+'　データは変更していません。');
   note('端末内の'+kind+'準備は未完了です。入力を確認してください。',true);
   return true;
  }
  bubble('assistant',kind+'の端末内確認画面を開きました。'+originalStatus+'　承認前に業務データを保存・発行しません。');
  sanitizedHistory.push({role:'user',content:kind+'確認'},
    {role:'assistant',content:kind+'の提案'});
  sanitizedHistory=Chat.safeHistory(sanitizedHistory);
  persistSafeHistory();
  $('budil-gpt-input').value='';
  note('端末内の'+kind+'確認画面へ進みました。顧客候補・金額・日時を確認してから承認してください。');
  return true;
 }
 async function send(){
  if(busy)return;
  const Cloud=window.BudilCloud;
  if(!Chat||!Source||!ReadOnly||!Data||!DateTool||
     !Cloud||typeof Cloud.sendGptChat!=='function')
    return note('GPT会話のモジュールが読み込まれていません。',true);
  const raw=$('budil-gpt-input').value;
  if(!raw.trim())return note('まずGPTへの質問を入力してください。',true);
  if(!syncAuth())return showLogin();
  if(!ensureChatConsent())return;
  const localToday=DateTool.todayTokyo();
  if(startSafeLocalPreview(raw,localToday))return;
  let leads;
  try{leads=Data.getLeads()}catch{return note('顧客情報の匿名化に必要な端末データを読み取れません。',true)}
  const prepared=Chat.prepare(raw,leads,aliasMap);
  if(!prepared.ok){
   if(prepared.code==='UNAPPROVED_TEXT')
    return note('個別の氏名・会社名・住所や未確認の語句が含まれる可能性があるため、外部AIへ送信しません。顧客はBudilの登録名で指定し、個人情報を含む現場メモは入力しないでください。',true);
   return note('この文章は外部送信できません（'+prepared.code+'）。住所・電話等を除き、1件ずつ入力してください。',true);
  }
  for(const [k,v] of Object.entries(prepared.aliases)){
   if(aliasMap[k]&&aliasMap[k]!==v)return note('別の顧客を同じ呼称で参照しないため、会話をリセットしてください。',true);
  }
  const today=DateTool.todayTokyo();
  const queryHistory=Chat.safeHistory(sanitizedHistory);
  const token=++seq;
  busy=true;button.disabled=true;
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
     let response=typeof Cloud.fetchScheduleBlocks==='function'?
      await Cloud.fetchScheduleBlocks(date,date):{ok:false,code:'calendar_read_unavailable'};
     if(token!==seq)return; // conversation reset or closed during the read
     // The existing authorized PC worker works without the broken cloud
     // service-account secret. It reads ONLY this day and returns busy times.
     // Authorization failures never take this fallback path.
     if(typeof Chat.shouldUseLocalCalendarFallback==='function'&&
        Chat.shouldUseLocalCalendarFallback(response)&&
        typeof Cloud.fetchLocalScheduleBlocks==='function'){
      const pc=await Cloud.fetchLocalScheduleBlocks(date,date);
      if(token!==seq)return;
      response=pc&&pc.ok===true&&pc.readOnly===true&&
        pc.calendarWritePerformed===false&&pc.source==='pc_local_calendar'?
        pc:{ok:false,code:'pc_local_calendar_unavailable'};
     }
     const summary=Chat.summarizeCalendarRead(response,date);
     if(summary.ok){
      googleState='ok';
      const reader=summary.source==='pc_local_calendar'?
       'PCローカル連携で取得したGoogleカレンダー':'連携済みGoogleカレンダー';
      message.textContent=reader+'の忙しい時間枠は'+
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
   persistSafeHistory();
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
 const chatInput=$('budil-gpt-input');
 if(chatInput)chatInput.addEventListener('keydown',event=>{
  if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){
   event.preventDefault();
   send();
  }
 });
 syncChatConsent();
 try{sessionStorage.removeItem(LEGACY_HISTORY_KEY);}catch(_){/* old unscoped cache removed */}
 restoreSafeHistory();
 window.addEventListener('budil-cloud-auth-changed',syncAuth);
 window.addEventListener('storage',event=>{
  if(event.key==='budil-cloud.auth.v1.session')syncAuth();
 });

 const readyButton=$('budil-gpt-chat-readiness');
 if(readyButton)readyButton.addEventListener('click',freeReadiness);

 clear.addEventListener('click',()=>{
  seq++;forgetSafeHistory();
  note('会話をリセットしました。GPT利用同意とログイン状態は維持しています。');
 });
 $('budil-gpt-close')?.addEventListener('click',()=>{ /* closing the panel keeps GPT conversation context */ });
})();
