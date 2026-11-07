/**
 * Budil×GPT: usable offline-first business assistant in Budil itself.
 * No external API. Reads real *on-device* Budil data only after an explicit
 * consent checkbox and a Run click. Quote drafts are unsaved until a user
 * approves; even approval only enables a local PDF, not a business write.
 */
(function () {
  'use strict';
  const $=id=>document.getElementById(id);
  const shell=$('budil-gpt-shell'),openButton=$('budil-gpt-open');
  if(!shell||!openButton)return;
  // Classic non-module Budil scripts expose lexical const bindings, not
  // necessarily window props. Test them directly, no eval/network access.
  const Commands=typeof BudilGptLocalCommands!=='undefined'?BudilGptLocalCommands:null;
  const PublicRead=typeof BudilGptPublicRead!=='undefined'?BudilGptPublicRead:null;
  const Conversation=typeof BudilGptConversation!=='undefined'?BudilGptConversation:null;
  const Source=typeof BudilGptLocalSource!=='undefined'?BudilGptLocalSource:null;
  const ReadOnly=typeof BudilGptReadOnly!=='undefined'?BudilGptReadOnly:null;
  const Anon=typeof BudilGptAnonymize!=='undefined'?BudilGptAnonymize:null;
  const Core=window.BudilGptFixtureCore||null;
  const Resolver=typeof CustomerResolveEntrypoint!=='undefined'?CustomerResolveEntrypoint:null;
  const Docs=typeof DocumentsBrain!=='undefined'?DocumentsBrain:null;
  const Payment=typeof PaymentBrain!=='undefined'?PaymentBrain:null;
  const Profit=typeof ProfitBrain!=='undefined'?ProfitBrain:null;
  const Data=typeof Storage!=='undefined'?Storage:null;
  const Booking=typeof BudilGptBooking!=='undefined'?BudilGptBooking:null;
  const Invoice=typeof BudilGptInvoiceLifecycle!=='undefined'?BudilGptInvoiceLifecycle:null;
  const Bank=typeof BudilGptBankReconcile!=='undefined'?BudilGptBankReconcile:null;
  const Completion=typeof WorkCompletionBrain!=='undefined'?WorkCompletionBrain:null;
  let session=Core?Core.createSession():null;
  let quoteDeps=null,focusedBefore=null,voice=null,exporting=false,pdfDone=false;
  let pendingQuoteFields=null;
  let pendingNewCustomer=null;
  let pendingCustomerSurname='';
  let bookingDraft=null,bookingSaving=false;
  let googleReadTarget=null,googleReadResult=null,googleReadBusy=false,googleReadSeq=0;
  let invoiceKind='',invoiceOrderId='',invoicePrepared=null,completionPrepared=null,invoiceSaving=false;
  let invoiceIssuePrepared=null;
  let bankPreview=null,bankBusy=false;
  const resultBox=$('budil-gpt-result'),statusBox=$('budil-gpt-status');
  function hide(id,yes){$(id).hidden=!!yes;}
  function status(message,error=false){
    statusBox.textContent=message;
    statusBox.classList.toggle('budil-gpt-error',!!error);
  }
  function resetQuote(){
    bankPreview=null;hide('budil-gpt-bank',true);
    $('budil-gpt-bank-results').replaceChildren();$('budil-gpt-bank-file').value='';
    invoiceKind='';invoiceOrderId='';invoicePrepared=null;completionPrepared=null;invoiceSaving=false;
    resetInvoiceIssue();
    hide('budil-gpt-invoice',true);hide('budil-gpt-invoice-confirm',true);hide('budil-gpt-completion-confirm',true);
    $('budil-gpt-invoice-orders').replaceChildren();
    $('budil-gpt-invoice-preview-box').replaceChildren();
    for(const id of ['work-date','amount','tax','issue','due','method','expected'])
      $('budil-gpt-invoice-'+id).value='';
    bookingDraft=null;bookingSaving=false;
    resetGoogleRead();
    hide('budil-gpt-booking',true);hide('budil-gpt-booking-fields',true);
    hide('budil-gpt-booking-save',true);
    $('budil-gpt-booking-preview').replaceChildren();
    $('budil-gpt-booking-orders').replaceChildren();
    $('budil-gpt-booking-tax').value='';$('budil-gpt-booking-end').value='';
    pendingQuoteFields=null;pendingNewCustomer=null;pendingCustomerSurname='';
    hide('budil-gpt-customer-create',true);
    $('budil-gpt-customer-create-preview').replaceChildren();
    if(Core)session=Core.createSession();
    quoteDeps=null;pdfDone=false;exporting=false;
    $('budil-gpt-pdf').disabled=false;
    hide('budil-gpt-candidates',true);hide('budil-gpt-draft',true);
    hide('budil-gpt-approved',true);
    $('budil-gpt-candidate-list').replaceChildren();
    $('budil-gpt-draft-preview').replaceChildren();
    $('budil-gpt-approved-preview').replaceChildren();
  }
  function resetVisible(){
    resetQuote();resultBox.replaceChildren();
    $('budil-gpt-input').value='';$('budil-gpt-revision').value='';
    $('budil-gpt-consent').checked=false;
    $('budil-gpt-voice-consent').checked=false;
    $('budil-gpt-remote-consent').checked=false;
    $('budil-gpt-public-consent').checked=false;
  }
  function open(){
    focusedBefore=document.activeElement;
    shell.hidden=false;
    status('まず操作内容を入力してください。読み取りや保存はまだ行っていません。');
    $('budil-gpt-input').focus();
  }
  function close(){
    if(voice){try{voice.abort();}catch(_){/* browser voice */}voice=null;}
    readinessSeq++;interpretSeq++;publicReadSeq++;resetVisible();shell.hidden=true;
    if(focusedBefore&&typeof focusedBefore.focus==='function')focusedBefore.focus();
  }
  function node(tag,text,cls){
    const el=document.createElement(tag);
    if(text!==undefined)el.textContent=String(text);
    if(cls)el.className=cls;
    return el;
  }
  function title(text){resultBox.append(node('h3',text));}
  function item(entries){
    const card=node('div',undefined,'budil-gpt-item');
    const dl=node('dl');
    for(const [key,value] of entries){
      const dt=node('dt',key),dd=node('dd',value==null?'':value);
      dl.append(dt,dd);
    }
    card.append(dl);resultBox.append(card);
  }
  function yen(value){
    return typeof value==='number'&&Number.isFinite(value)
      ?value.toLocaleString('ja-JP')+'円':'未確定';
  }
  function renderQuote(id,doc){
    const el=$(id);el.replaceChildren();
    const card=node('div',undefined,'budil-gpt-item');
    const dl=node('dl');
    for(const [key,val] of [
      ['お客様',doc.customerName||''],
      ['品目',(doc.items||[]).map(x=>x.name+' × '+x.quantity).join('、')],
      ['税込合計',yen(doc.total)],['状態','未発行・端末内の下書き']
    ]){
      dl.append(node('dt',key),node('dd',val));
    }
    card.append(dl);el.append(card);
  }
  function queryResult(parsed,answer){
    resultBox.replaceChildren();
    if(!answer||!answer.ok){
      return status('端末内検索ができません：'+(answer&&answer.code||'READ_UNAVAILABLE'),true);
    }
    const view=answer.view||{};
    if(parsed.action==='customer.search'){
      title('顧客候補：'+(view.candidateCount||0)+'件（自動確定しません）');
      if(view.candidateCount>10)return status('候補が多いため、さらに具体的な名前で検索してください。',true);
      for(const c of view.candidates||[]){
        item([['顧客名',c.displayName],['地域',c.municipality||'不明'],
          ['電話',c.maskedPhone||'非表示'],['照合','本人確認が必要']]);
      }
      return status('端末のBudil顧客だけを読み取りました。外部送信はしていません。');
    }
    if(parsed.action==='document.period'){
      title((parsed.periodLabel||view.month)+'の'+
        (view.documentType==='invoice'?'請求書':'見積書')+'：'+
        (view.count||0)+'件');
      for(const d of view.documents||[]){
        item([['種類',d.type==='invoice'?'請求書':'見積書'],
          ['番号',d.number],['顧客',d.customerName],['合計',yen(d.total)],
          ['発行日',d.issueDate],['状態',d.status]]);
      }
      if(view.tooMany)return status('該当が10件を超えました。先頭10件を表示しています。',true);
      if(view.undatedCount)return status('発行日が未設定の帳票'+view.undatedCount+
        '件は期間検索の対象外です。端末内の保存済み帳票だけを検索しました。');
      return status('発行年月で検索しました。帳票の変更・外部送信はしていません。');
    }
    if(parsed.action==='document.search'){
      if(view.tooMany)return status('帳票が10件を超えました。より具体的な条件で探してください。',true);
      const docs=(view.documents||[]).filter(d=>!parsed.filterType||d.type===parsed.filterType);
      title('帳票：'+docs.length+'件（閲覧のみ）');
      for(const d of docs)item([['種類',d.type==='invoice'?'請求書':'見積書'],
        ['番号',d.number],['顧客',d.customerName],['合計',yen(d.total)],
        ['発行日',d.issueDate],['状態',d.status]]);
      return status('この操作では帳票の変更・発行・外部送信をしていません。');
    }
    if(parsed.action==='work.search'){
      if(view.tooMany)return status('予定が多いため、顧客名を詳しく指定してください。',true);
      title('作業予定：'+(view.workOrders||[]).length+'件');
      for(const w of view.workOrders||[])item([['顧客',w.customerName],
        ['日付',w.scheduledDate],['状態',w.status],
        ['カレンダー','Googleへの登録・変更なし']]);
      return status('作業予定の表示のみです。Googleの空き状況とは照合していません。');
    }
    if(parsed.action==='profit.summary'){
      title('今月の利益（Budil端末内・概算）');
      item([['対象月',view.month],['当月の売上集計',yen(view.monthRevenue)],
        ['当月の経費集計',yen(view.monthExpense)],
        ['概算利益',yen(view.monthGrossProfit)],
        ['確定売上',yen(view.confirmedRevenue)],
        ['確定利益（紐付け済み経費反映）',yen(view.confirmedProfit)],
        ['作業予定の利益見込み',yen(view.plannedForecastProfit)]]);
      return status('既存ProfitBrainの計算結果です。月次実績・売上明細の差や未登録経費で変動します。確定申告用利益ではありません。');
    }
    if(parsed.action==='receivables.summary'){
      const monthly=parsed.scope==='this_month_expected';
      title(monthly?'今月入金予定の未入金':'Budil端末内の未入金集計');
      item(monthly ? [
        ['今月入金予定・未入金',yen(view.thisMonthExpected)],
        ['未入金全体の合計',yen(view.pendingTotal)],
        ['期日超過件数',view.overdueCount],
        ['対象','保存済みレコードの入金予定月']
      ] : [
        ['未入金合計',yen(view.pendingTotal)],
        ['未入金件数',view.count],['期日超過件数',view.overdueCount],
        ['入金判定','銀行明細による照合は行っていません']
      ]);
      return status(monthly?
        '「今月分」は入金予定日が今月の未入金を意味します。銀行照合・入金確定はしていません。':
        '既存のPaymentBrainで集計。入金済みへの更新はしていません。');
    }
    status('未対応の操作です。',true);
  }
  function quoteCandidates(result){
    hide('budil-gpt-candidates',false);
    const list=$('budil-gpt-candidate-list');list.replaceChildren();
    result.candidates.forEach(c=>{
      const b=node('button',c.displayName+'（'+(c.municipality||'地域未設定')+'）',
        'budil-gpt-btn budil-gpt-btn-secondary');
      b.type='button';
      b.addEventListener('click',()=>{
        const chosen=Core.selectCustomer(session,c.customerId,quoteDeps);
        if(!chosen.ok)return status(chosen.message||chosen.code,true);
        hide('budil-gpt-candidates',true);
        hide('budil-gpt-draft',false);
        renderQuote('budil-gpt-draft-preview',chosen.doc);
        if(bookingDraft && bookingDraft.action==='booking'){
          bookingDraft.customerName=chosen.doc.customerName;
          bookingDraft.customerId=c.customerId;
          renderBookingPreview();
        }
        status('端末内の見積下書きができました。まだ保存・発行・送信していません。');
      });
      list.append(b);
    });
    status('同姓同名の場合は地域を確認し、本人が顧客候補を選択してください。');
  }
  function bookingNote(message){
    const box=$('budil-gpt-booking-preview');box.append(node('p',message));
  }
  function invoiceFields(){
    const val=id=>$('budil-gpt-invoice-'+id).value;
    return {workDate:val('work-date'),amount:val('amount'),tax:val('tax'),
      issueDate:val('issue'),dueDate:val('due'),paymentMethod:val('method'),
      expectedPaymentDate:val('expected')};
  }
  function startWorkInvoice(raw){
    if(!Invoice)return status('請求書機能を利用できません。',true);
    if(!$('budil-gpt-consent').checked)return status('作業予定を読む前に確認欄にチェックしてください。',true);
    const name=raw.match(/^(.+?)の作業を完了にして請求書を作って[。！!]?$/)?.[1];
    if(!name)return false;
    $('budil-gpt-consent').checked=false;
    invoiceKind='work';invoicePrepared=null;completionPrepared=null;invoiceOrderId='';
    hide('budil-gpt-invoice',false);hide('budil-gpt-invoice-confirm',true);hide('budil-gpt-completion-confirm',true);
    const list=$('budil-gpt-invoice-orders');list.replaceChildren();
    const matches=Data.getWorkOrders().filter(w=>w && !['cancelled','archived'].includes(w.status) &&
      Completion.isOperationalWorkOrder(w) && Invoice.stage(w,Data)!=='invoiced' &&
      String(w.customerName||'').replace(/\s|様|御中/g,'').includes(name.replace(/\s|さん|様|御中/g,'')));
    for(const w of matches){
      const b=node('button',w.customerName+' / '+(w.scheduledDate||'日付不明')+' / '+(w.serviceText||'作業内容不明'),
        'budil-gpt-btn budil-gpt-btn-secondary');b.type='button';
      b.addEventListener('click',()=>{
        invoiceOrderId=w.id;invoicePrepared=null;completionPrepared=null;
        hide('budil-gpt-invoice-confirm',true);hide('budil-gpt-completion-confirm',true);
        const current=Data.getWorkOrders().find(x=>String(x.id)===String(w.id));
        status(Invoice.stage(current,Data)==='pending_invoice'
          ?'作業完了と売上は保存済みです。請求書の入力と承認が残っています。'
          :'対象作業を選択しました。実際の作業日・金額・税区分を入力し、最初に作業完了と売上を承認してください。');
      });list.append(b);
    }
    status(matches.length?'対象の作業予定を1件選んでください。':'対象作業がないか、請求書がすでに保存されています。',!matches.length);
    return true;
  }
  function previewInvoice(){
    if(!Invoice||!invoiceKind)return status('対象の作業または承認済み見積を選んでください。',true);
    invoicePrepared=null;completionPrepared=null;resetInvoiceIssue();hide('budil-gpt-invoice-confirm',true);hide('budil-gpt-completion-confirm',true);
    const fields=invoiceFields();let result;
    try{
      if(invoiceKind==='work'){
        const order=Data.getWorkOrders().find(w=>String(w.id)===invoiceOrderId);
        if(Invoice.stage(order,Data)==='pending_completion'){
          const missing=[!fields.workDate&&'実際の作業日はいつですか',!fields.amount&&'実際の金額はいくらですか',
            !fields.tax&&'金額は税込ですか、税抜ですか'].filter(Boolean);
          if(missing.length)return status(missing.join('。')+'。',true);
          result=Invoice.prepareCompletion(order,fields,{storage:Data,workCompletion:Completion,documents:Docs});
          if(!result.ok)return status('作業完了の確認に必要な内容を入力してください（'+result.code+'）。',true);
          completionPrepared=result;
          const box=$('budil-gpt-invoice-preview-box');box.replaceChildren();
          box.append(node('p',result.preview.customerName+' / '+result.preview.service+' / '+
            result.preview.workDate+' / '+yen(result.preview.amount)+' / '+result.preview.tax));
          hide('budil-gpt-completion-confirm',false);
          return status('作業完了と売上の保存内容を確認し、最初の承認をしてください。請求書は次の承認で保存します。');
        }
        if(Invoice.stage(order,Data)==='invoiced')return status('この作業の請求書は保存済みです。',true);
        const missing=[!fields.issueDate&&'請求日はいつですか',!fields.dueDate&&'支払期限はいつですか',
          !fields.paymentMethod&&'支払方法は何ですか',!fields.expectedPaymentDate&&'入金予定日はいつですか'].filter(Boolean);
        if(missing.length)return status(missing.join('。')+'。',true);
        result=Invoice.prepareWork(order,fields,{storage:Data,documents:Docs,
          entrypoint:InvoiceStructuredEntrypoint});
      }else{
        const approved=Core.getApprovedForPdf(session);
        result=approved.ok?Invoice.prepareQuote(approved.doc,session.selectedCustomerId,fields,
          {storage:Data,documents:Docs}):{ok:false,code:'QUOTE_NOT_APPROVED'};
      }
    }catch(_){result={ok:false,code:'PREVIEW_FAILED'};}
    if(!result.ok)return status('請求書を準備できません（'+result.code+'）。入力と元データを確認してください。',true);
    invoicePrepared=result;
    const p=result.preview, box=$('budil-gpt-invoice-preview-box');box.replaceChildren();
    const card=node('div',undefined,'budil-gpt-item');
    for(const line of [p.customerName+' / '+p.service,'請求書 '+p.number,
      '合計 '+yen(p.total)+'（税 '+yen(p.tax)+'）',
      '請求日 '+p.issueDate+' / 支払期限 '+p.dueDate,
      '銀行振込 / 入金予定日 '+p.expectedPaymentDate,
      '未入金の下書きとして端末内に保存。Googleへの書込・送信なし。'])card.append(node('p',line));
    box.append(card);hide('budil-gpt-invoice-confirm',false);
    status('内容を確認し、別の確定ボタンで保存してください。');
  }
  function saveCompletion(){
    if(invoiceSaving||!completionPrepared)return;
    invoiceSaving=true;const btn=$('budil-gpt-completion-confirm');btn.disabled=true;
    try{
      const result=Invoice.applyCompletion(completionPrepared,{storage:Data,confirm:true});
      if(!result.ok)throw Error(result.code);
      completionPrepared=null;hide('budil-gpt-completion-confirm',true);
      $('budil-gpt-invoice-preview-box').replaceChildren();
      status('作業完了と売上を保存しました。請求書は未作成です。請求日・支払期限・入金予定日を入力して請求書をプレビューしてください。');
    }catch(e){completionPrepared=null;hide('budil-gpt-completion-confirm',true);
      status('作業完了の保存を確認できません（'+e.message+'）。同じ作業を選び直して再試行してください。',true);
    }finally{invoiceSaving=false;btn.disabled=false;}
  }
  function saveInvoice(){
    if(invoiceSaving||!invoicePrepared)return;
    invoiceSaving=true;const btn=$('budil-gpt-invoice-confirm');btn.disabled=true;
    try{
      const approved=invoiceKind==='quote'?Core.getApprovedForPdf(session):null;
      const result=Invoice.apply(invoicePrepared,{storage:Data,confirm:true,
        approvedQuote:approved&&approved.ok?approved.doc:null});
      if(!result.ok)throw Error(result.code);
      invoicePrepared=null;hide('budil-gpt-invoice-confirm',true);
      showInvoiceIssue(result.invoice.id);
    }catch(e){invoicePrepared=null;hide('budil-gpt-invoice-confirm',true);
      status(invoiceKind==='work'?'作業完了と売上は保存済みです。請求書は未作成で、承認待ちです（'+e.message+'）。内容を確認して再プレビューしてください。'
        :'保存を停止しました（'+e.message+'）。元データとバックアップを確認してください。',true);
    }finally{invoiceSaving=false;btn.disabled=false;}
  }

  // The issuer changes only local draft status, never sends mail or marks payment.
  function resetInvoiceIssue(){
    invoiceIssuePrepared=null;
    hide('budil-gpt-invoice-issue-panel',true);
    $('budil-gpt-invoice-issue-ack').checked=false;
    $('budil-gpt-invoice-issue-preview').replaceChildren();
  }
  function showInvoiceIssue(documentId){
    resetInvoiceIssue();
    if(!Invoice||typeof Invoice.prepareIssue!=='function')
      return status('請求書の確定機能を読み込めません。',true);
    let preview;
    try{preview=Invoice.prepareIssue(String(documentId),Data);}
    catch(_){return status('請求書の内容を確認できませんでした。',true);}
    if(!preview.ok)
      return status('請求書は端末に保存済みですが、確定条件に不足があります（'+preview.code+'）。帳票管理で内容を点検してください。',true);
    invoiceIssuePrepared=preview;
    const p=preview.preview;
    const box=$('budil-gpt-invoice-issue-preview');
    for(const row of ['番号 '+p.number+' / '+p.customerName,
        '合計 '+yen(p.total)+'（税 '+yen(p.tax)+'）',
        '請求日 '+p.issueDate+' / 支払期限 '+p.dueDate,
        '確定はこの端末の帳票状態のみ。PDF保存・顧客送信は実行しません。'])
      box.append(node('p',row));
    hide('budil-gpt-invoice-issue-panel',false);
    status('請求下書きの保存が完了しました。請求確定は別の確認操作が必要です。');
  }
  function startSavedInvoiceIssue(){
    if(!Invoice||!Data) return status('請求書機能を利用できません。',true);
    if(invoiceKind || (session && session.stage!=='idle'))
      return status('進行中の作業をクリアしてから、請求書下書きを選んでください。',true);
    if($('budil-gpt-consent').checked!==true)
      return status('保存済み請求書を読む前に端末データの読取にチェックしてください。',true);
    $('budil-gpt-consent').checked=false;
    let drafts;
    try{drafts=Data.getDocuments().filter(d=>d&&d.type==='invoice'&&d.status==='draft');}
    catch(_){return status('請求下書きを取得できません。',true);}
    if(!drafts.length)return status('端末に未確定の請求書下書きはありません。',true);
    if(drafts.length>20)return status('請求下書きが20件を超えています。帳票管理で対象を絞ってください。',true);
    invoiceKind='issue';
    hide('budil-gpt-invoice',false);
    hide('budil-gpt-invoice-confirm',true);
    hide('budil-gpt-completion-confirm',true);
    resetInvoiceIssue();
    const list=$('budil-gpt-invoice-orders');list.replaceChildren();
    for(const doc of drafts){
      const b=node('button',(doc.number||'番号不明')+' / '+(doc.customerName||'宛名不明')+
        ' / '+yen(doc.total)+' / '+(doc.issueDate||'請求日なし'),
        'budil-gpt-btn budil-gpt-btn-secondary');
      b.type='button';
      b.addEventListener('click',()=>showInvoiceIssue(doc.id));
      list.append(b);
    }
    status('確定する請求下書きを1件選んでください。内容を確認するまで状態は変更しません。');
  }
  function confirmInvoiceIssue(){
    if(invoiceSaving||!invoiceIssuePrepared)return;
    if($('budil-gpt-invoice-issue-ack').checked!==true)
      return status('宛名・金額・日付と未送信であることを確認し、チェックしてください。',true);
    invoiceSaving=true;const btn=$('budil-gpt-invoice-issue-confirm');btn.disabled=true;
    try{
      const result=Invoice.applyIssue(invoiceIssuePrepared,{
        storage:Data,confirm:true,notSentAcknowledged:true
      });
      if(!result.ok)throw Error(result.code);
      resetInvoiceIssue();
      $('budil-gpt-invoice-orders').replaceChildren();
      status('請求書 '+result.number+' を端末内で請求済みに変更しました。顧客には未送信です。帳票管理でPDFを確認し、必要な相手へ本人が送付してください。');
    }catch(e){
      resetInvoiceIssue();
      status('請求確定を停止しました（'+e.message+'）。帳票管理で保存状態を点検してください。',true);
    }finally{invoiceSaving=false;btn.disabled=false;}
  }


  function resetGoogleRead(){
    googleReadSeq++;
    googleReadTarget=null;googleReadResult=null;
    hide('budil-gpt-google-read',true);
    $('budil-gpt-google-consent').checked=false;
    $('budil-gpt-google-status').textContent='';
  }
  function setGoogleReadTarget(date,startTime,endTime=''){
    resetGoogleRead();
    if(!Booking||!Booking.validDate(date)||!Booking.validTime(startTime)||
       (endTime&&(!Booking.validTime(endTime)||endTime<=startTime)))return;
    googleReadTarget={date,startTime,endTime};
    hide('budil-gpt-google-read',false);
    $('budil-gpt-google-status').textContent=
      endTime?'Googleの照会範囲：'+date+' '+startTime+'〜'+endTime+
        '（予約書込は行いません）':
        'Googleの照会時刻：'+date+' '+startTime+'時点（予約書込は行いません）';
  }
  async function runGoogleRead(){
    if(googleReadBusy||!googleReadTarget)return;
    if($('budil-gpt-google-consent').checked!==true)
      return status('Googleカレンダー読取の同意欄にチェックしてください。',true);
    const cloud=window.BudilCloud;
    if(!cloud||typeof cloud.fetchScheduleBlocks!=='function')
      return status('Googleカレンダーの安全な読取処理が利用できません。',true);
    const target={...googleReadTarget},key=JSON.stringify(target);
    const seq=++googleReadSeq;
    googleReadBusy=true;googleReadResult=null;
    $('budil-gpt-google-consent').checked=false;
    const button=$('budil-gpt-google-check');button.disabled=true;
    $('budil-gpt-google-status').textContent='接続済みカレンダーの時間重複を確認中です。';
    try{
      const loaded=await cloud.fetchScheduleBlocks(target.date,target.date);
      if(seq!==googleReadSeq||!googleReadTarget||
         JSON.stringify(googleReadTarget)!==key)return;
      if(!loaded||!loaded.ok)
        return $('budil-gpt-google-status').textContent=
          'Googleの読取を確認できません（'+String(loaded&&loaded.code||'unavailable')+
          '）。端末内予定だけでは空き確定できません。';
      const review=Booking.googleScheduleReview(loaded.events,target.date,
        target.startTime,target.endTime);
      if(!review.ok)
        return $('budil-gpt-google-status').textContent=
          'Google予定の日時を検証できません。空き不明として扱います（'+review.code+'）。';
      googleReadResult={key,...review};
      $('budil-gpt-google-status').textContent=review.hasConflict
        ? 'Googleカレンダーに重なる予定が'+review.overlapCount+
          '件あります。重複する予約の保存を停止します。'
        : 'Googleカレンダーの指定'+(review.pointOnly?'時刻':'時間帯')+
          'に重なる予定は照会時点で見つかりませんでした。予定の追加・変更は行っていません。';
    }catch(_){
      if(seq===googleReadSeq)$('budil-gpt-google-status').textContent=
        'Google読取に失敗しました。空き確定ではありません。';
    }finally{googleReadBusy=false;button.disabled=false;}
  }

  function startBooking(intent){
    if(!Data||!Booking||typeof Data.getWorkOrders!=='function')return status('作業予定を読み取れません。',true);
    let orders;
    try{orders=Data.getWorkOrders();}catch(_){return status('作業予定を読み取れません。',true);}
    resultBox.replaceChildren();
    resetGoogleRead();
    if(intent.action==='availability'){
      const review=Booking.scheduleReview(orders,intent.date,intent.startTime);
      if(!review.ok)return status('日時を確認できません。',true);
      title(intent.date+' '+intent.startTime+' の端末内予定');
      item([['重なる作業予定',review.overlaps.length+'件'],['時刻不明の予定',review.unknown.length+'件'],
        ['照合範囲','端末内予定のみ・Google Calendarの空き確定ではない']]);
      setGoogleReadTarget(intent.date,intent.startTime);
      for(const w of [...review.overlaps,...review.unknown])item([['予定',w.customerName||'名称未設定'],
        ['日時',w.scheduledDate+' '+(w.startTime||'時刻未設定')+'〜'+(w.endTime||'')],['内容',w.serviceText||'未設定']]);
      return status(review.overlaps.length||review.unknown.length?'端末内に要確認の予定があります。':'端末内には重なる作業予定が見つかりません。Google Calendarは未確認です。');
    }
    bookingDraft={...intent,customerName:'',customerId:'',workOrderId:'',snapshot:''};
    hide('budil-gpt-booking',false);
    if(intent.action==='booking'){
      if(Booking.isPast(intent.date,intent.startTime)){
        bookingDraft=null;hide('budil-gpt-booking',true);
        return status('指定時刻は過去です。日付と時刻を確認してください。',true);
      }
      hide('budil-gpt-booking-fields',false);
      $('budil-gpt-booking-tax').value=intent.tax||'';
      bookingNote(intent.date+' '+intent.startTime+'開始 / '+intent.name+'さん / '+intent.service+intent.quantity+'台 / '+yen(intent.amount));
      bookingNote('税込・税抜と終了時刻を指定してください。自動で金額や作業時間を補いません。');
      return status('不足項目を入力してください。まだ顧客・予定・見積は保存していません。');
    }
    const matches=orders.filter(w=>w&&String(w.id||'')&&['tentative','confirmed'].includes(w.status)&&
      !w.candidateMeta&&!w.isAllDay&&(!w.scheduledEndDate||w.scheduledEndDate===w.scheduledDate)&&
      typeof w.customerName==='string'&&
      (w.customerName===intent.name||w.customerName.startsWith(intent.name)));
    if(!matches.length)return status('変更対象の端末内作業予定が見つかりません。',true);
    if(matches.length>10)return status('候補が10件を超えます。フルネームで指定してください。',true);
    bookingNote('変更先：'+intent.date+'。変更する作業予定を1件選んでください。');
    const list=$('budil-gpt-booking-orders');
    for(const w of matches){
      const b=node('button',w.customerName+' / '+w.scheduledDate+' '+(w.startTime||'時刻未設定')+'〜'+(w.endTime||'')+' / '+(w.serviceText||'内容未設定')+' / ID '+w.id,'budil-gpt-btn budil-gpt-btn-secondary');
      b.type='button';b.addEventListener('click',()=>{
        bookingDraft.workOrderId=String(w.id||'');bookingDraft.snapshot=JSON.stringify(w);
        bookingDraft.customerName=w.customerName;bookingDraft.startTime=w.startTime;
        bookingDraft.endTime=w.endTime;bookingDraft.serviceText=w.serviceText;
        list.replaceChildren();renderBookingPreview();
      });list.append(b);
    }
    status('顧客名だけで変更対象を推測しません。正確な予定を選んでください。');
  }
  function renderBookingPreview(){
    resetGoogleRead();
    const d=bookingDraft;if(!d)return;
    const box=$('budil-gpt-booking-preview');box.replaceChildren();
    const save=$('budil-gpt-booking-save');hide('budil-gpt-booking-save',true);
    if(!d.customerName)return;
    const orders=Data.getWorkOrders();
    const review=Booking.scheduleReview(orders,d.date,d.startTime,d.endTime,d.workOrderId);
    const duplicate=Booking.duplicates(orders,{...d,serviceText:d.action==='booking'?d.service+' '+d.quantity+'台':d.serviceText},d.workOrderId);
    const calendarDuplicates=d.action==='booking' && typeof CalendarCandidateBrain!=='undefined'
      ? CalendarCandidateBrain.detectDuplicates({scheduledDate:d.date,startTime:d.startTime,
        customerName:d.customerName,serviceText:d.service+' '+d.quantity+'台',estimateAmount:session.draft&&session.draft.total||0},orders,[])
      : [];
    bookingNote(d.action==='booking'?'未保存の予約下書き':'未保存の変更下書き');
    bookingNote(d.customerName+' / '+d.date+' '+d.startTime+'〜'+d.endTime+' / '+
      (d.action==='booking'?d.service+d.quantity+'台 / 見積合計 '+yen(session.draft&&session.draft.total):d.serviceText));
    bookingNote('端末内予定のみ・Google Calendarの空き確定ではない。保存後もGoogle Calendarは未同期です。');
    if(!review.ok||!Booking.validTime(d.endTime)||d.endTime<=d.startTime||Booking.isPast(d.date,d.startTime)){
      bookingNote('日時が不正または過去です。保存できません。');return;
    }
    if(review.overlaps.length||review.unknown.length||duplicate.length||calendarDuplicates.length){
      bookingNote('重複・時刻不明の予定があります。重複 '+(review.overlaps.length+duplicate.length+calendarDuplicates.length)+'件、時刻不明 '+review.unknown.length+'件。保存は停止します。');
      return;
    }
    if(d.action==='booking' && (!session.draft||!Number.isSafeInteger(session.draft.total)))return;
    if(d.action==='reschedule' && (!d.workOrderId||d.date===JSON.parse(d.snapshot).scheduledDate)){
      bookingNote('変更対象と変更先を確認してください。');return;
    }
    hide('budil-gpt-booking-save',false);
    setGoogleReadTarget(d.date,d.startTime,d.endTime);
    status('端末内予定では重複なし。Googleカレンダーは必要に応じて読取確認してください。保存は別操作です。');
  }
  function continueBooking(){
    const d=bookingDraft;
    if(!d||d.action!=='booking'||d.customerName)return status('進行中の新規予約がありません。',true);
    const tax=$('budil-gpt-booking-tax').value,end=$('budil-gpt-booking-end').value;
    if(!['included','excluded'].includes(tax))return status('税込・税抜を選択してください。',true);
    if(!Booking.validTime(end)||end<=d.startTime)return status('終了時刻を開始より後に指定してください。',true);
    const canonical=d.name+'さんの'+d.service+d.quantity+'台を'+(tax==='included'?'税込':'税抜')+d.amount+'円で見積して';
    const deps={documentsBrain:Docs,customerResolver:Resolver,anonymizer:Anon,
      localAccessConsent:true,localLeads:Data.getLeads()};
    const started=Core.startLocalParsed(session,canonical,deps);
    if(!started.ok)return status(started.message||started.code,true);
    quoteDeps=deps;d.tax=tax;d.endTime=end;
    hide('budil-gpt-booking-fields',true);
    quoteCandidates(started);
  }
  function saveBooking(){
    if(bookingSaving||!bookingDraft||!bookingDraft.customerName)return;
    const d=bookingDraft,btn=$('budil-gpt-booking-save');
    bookingSaving=true;btn.disabled=true;
    try{
      const googleKey=JSON.stringify({date:d.date,startTime:d.startTime,endTime:d.endTime||''});
      if(googleReadResult&&googleReadResult.key===googleKey&&googleReadResult.hasConflict)
        throw Error('GOOGLE_CALENDAR_CONFLICT');
      const orders=Data.getWorkOrders();
      const review=Booking.scheduleReview(orders,d.date,d.startTime,d.endTime,d.workOrderId);
      if(!review.ok||review.overlaps.length||review.unknown.length||Booking.isPast(d.date,d.startTime))throw Error('SCHEDULE_CHANGED');
      let result;
      if(d.action==='booking'){
        if(!session.draft||session.draft.customerName!==d.customerName)throw Error('QUOTE_CHANGED');
        const lead=Data.getLeads().find(c=>String(c&&c.id||'')===d.customerId);
        if(!lead||Resolver.leadDisplayName(lead)!==d.customerName)throw Error('CUSTOMER_CHANGED');
        const serviceText=d.service+' '+d.quantity+'台';
        if(Booking.duplicates(orders,{...d,serviceText}).length)throw Error('DUPLICATE');
        if(typeof CalendarCandidateBrain!=='undefined'&&CalendarCandidateBrain.detectDuplicates({
          scheduledDate:d.date,startTime:d.startTime,customerName:d.customerName,
          serviceText,estimateAmount:session.draft.total},orders,[]).length)throw Error('DUPLICATE');
        if(typeof Data.addWorkOrder!=='function')throw Error('STORAGE_UNAVAILABLE');
        const backup=Data.createSafetyBackup({reason:'budil_gpt_booking_create',
          targetKey:Data.KEYS.WORK_ORDERS,data:orders,beforeCount:orders.length});
        if(!backup||!backup.id)throw Error('BACKUP_FAILED');
        result=Data.addWorkOrder({customerName:d.customerName,serviceText,
          scheduledDate:d.date,startTime:d.startTime,endTime:d.endTime,
          estimateAmount:session.draft.total,status:'tentative',calendarAdded:false});
      }else{
        const target=orders.find(w=>String(w&&w.id||'')===d.workOrderId);
        if(!target||JSON.stringify(target)!==d.snapshot||!['tentative','confirmed'].includes(target.status)||
          target.candidateMeta||target.isAllDay||(target.scheduledEndDate&&target.scheduledEndDate!==target.scheduledDate))throw Error('TARGET_CHANGED');
        if(Booking.duplicates(orders,{...d,serviceText:d.serviceText},d.workOrderId).length)throw Error('DUPLICATE');
        if(typeof Data.updateWorkOrder!=='function')throw Error('STORAGE_UNAVAILABLE');
        const backup=Data.createSafetyBackup({reason:'budil_gpt_booking_reschedule',
          targetKey:Data.KEYS.WORK_ORDERS,targetId:d.workOrderId,data:orders,beforeCount:orders.length});
        if(!backup||!backup.id)throw Error('BACKUP_FAILED');
        result=Data.updateWorkOrder(d.workOrderId,{scheduledDate:d.date,
          scheduledEndDate:target.scheduledEndDate?d.date:'',calendarAdded:false});
      }
      if(!result||!result.id)throw Error('SAVE_FAILED');
      hide('budil-gpt-booking-save',true);bookingDraft=null;
      resetGoogleRead();
      $('budil-gpt-booking-preview').replaceChildren(node('p','端末内の作業予定を保存しました。Google Calendarは未同期です。'));
      status('端末内の作業予定を保存しました。Google Calendarは未同期です。');
    }catch(e){
      // Keep the save control available for a fresh, explicit Google recheck;
      // a busy result itself always prevents this save from changing data.
      if(e.message!=='GOOGLE_CALENDAR_CONFLICT')hide('budil-gpt-booking-save',true);
      status('保存を停止しました（'+e.message+'）。最新の予定を確認してからやり直してください。',true);
    }finally{bookingSaving=false;btn.disabled=false;}
  }
  function run(){
    if(!Commands||!Source||!ReadOnly||!Anon||!Core||!Resolver||!Docs||!Payment||!Data)
      return status('Budilの必要なモジュールが読み込まれていません。',true);
    const raw=$('budil-gpt-input').value;
    if(pendingCustomerSurname){
      if(/^(?:キャンセル|中止)[。！!]?$/u.test(raw.trim())){
        pendingCustomerSurname='';
        return status('新規顧客の入力を中止しました。保存はしていません。');
      }
      const fullName=raw.trim().replace(/(?:です|と申します|でお願いします)[。！!]?$/u,'')
        .replace(/(?:さん|様)$/u,'');
      if(!/^[一-龯々ぁ-んァ-ヶー・A-Za-z]{3,32}$/u.test(fullName) ||
         fullName.length<=pendingCustomerSurname.length ||
         !fullName.startsWith(pendingCustomerSurname))
        return status(pendingCustomerSurname+'さんのフルネームを教えてください（例：'+
          pendingCustomerSurname+'太郎です）。まだ保存していません。',true);
      return stageNewCustomerName(fullName);
    }
    if(/^銀行明細と請求書を照合して[。！!]?$/u.test(raw)){
      if(!Bank)return status('CSV照合機能を利用できません。',true);
      if(!$('budil-gpt-consent').checked)return status('端末内の請求書を読む前に確認欄にチェックしてください。',true);
      $('budil-gpt-consent').checked=false;
      hide('budil-gpt-bank',false);
      return status('CSVファイルと文字コード、口座の識別名を指定してプレビューしてください。');
    }
    if(/^(?:請求書の下書き|保存済み請求書)を確定して[。！!]?$/u.test(raw))
      return startSavedInvoiceIssue();
    if(/^その見積を請求書にして[。！!]?$/u.test(raw) && session && session.stage==='approved')
      return startQuoteInvoice();
    if(/^.+?の作業を完了にして請求書を作って[。！!]?$/u.test(raw))
      return startWorkInvoice(raw);
    if(invoiceKind)return status('請求書の確認中です。入力をクリアしてから別の操作を始めてください。',true);
    if(bookingDraft)return status('予約の確認中です。候補を選ぶか「入力をクリア」で開始し直してください。',true);
    if(Booking){
      const booking=Booking.parse(raw,Commands.todayTokyo());
      if(booking.ok){
        if($('budil-gpt-consent').checked!==true)return status('端末内予定を読む前に確認欄にチェックしてください。',true);
        $('budil-gpt-consent').checked=false;
        return startBooking(booking);
      }
      if(booking.code!=='UNSUPPORTED_COMMAND'&&booking.code!=='INPUT_INVALID'&&
         /予約|空いてる/.test(raw))return status('予約指示を確認してください（'+booking.code+'）。',true);
    }
    // Never discard a customer selection or an unsaved quote before deciding
    // whether the next utterance is a correction to the existing draft.
    if(session && session.stage==='draft'){
      const change=Core.parseCorrection(raw);
      if(!change.ok)return status('見積下書きは保持しています。修正は「金額を税込20,000円に変更」と入力してください。別の操作をする場合は「クリア」を押してください。',true);
      const amended=Core.revise(session,raw,quoteDeps);
      if(!amended.ok)return status((amended.message||amended.code)+'。元の見積下書きは保持しています。',true);
      renderQuote('budil-gpt-draft-preview',amended.doc);
      $('budil-gpt-consent').checked=false;
      status('見積を'+yen(amended.doc.total)+'に修正しました。承認まで保存・発行しません。');
      return;
    }
    if(session && session.stage!=='idle'){
      return status('進行中の見積を保持しています。顧客候補を選択するか、クリアして新しい指示を入力してください。',true);
    }
    // A multi-turn input only gathers explicit missing fields. No access to
    // Budil customer records occurs until user approval and a full quote.
    if(pendingQuoteFields){
      if(!Conversation)return status('見積の会話機能を利用できません。',true);
      const follow=Conversation.reply(pendingQuoteFields,raw);
      if(follow.cancelled){
        pendingQuoteFields=null;status('見積の入力を中止しました。');return;
      }
      if(!follow.ok)return status('不足項目を確認してください（'+follow.code+'）。入力済みの項目は保持しています。',true);
      if(follow.pending){
        pendingQuoteFields=follow.fields;
        status(follow.prompt);return;
      }
      if($('budil-gpt-consent').checked!==true)
        return status('見積の顧客候補を探す前に、端末データの読取にチェックしてください。',true);
      pendingQuoteFields=null;
      const ready=follow.canonical;
      const prepared=Anon.prepare(ready);
      if(!prepared.ok)return status('見積の内容を確認できませんでした。',true);
      try{
        const localLeads=Data.getLeads();
        quoteDeps={documentsBrain:Docs,customerResolver:Resolver,anonymizer:Anon,
          localAccessConsent:true,localLeads};
        const started=Core.startLocalParsed(session,ready,quoteDeps);
        $('budil-gpt-consent').checked=false;
        if(!started.ok){quoteDeps=null;return status(started.message||started.code,true);}
        quoteCandidates(started);return;
      }catch(_){
        quoteDeps=null;return status('顧客候補を取得できません。',true);
      }
    }
    const parsed=Commands.parse(raw,{
      today:Commands.todayTokyo(),anonymizer:Anon
    });
    // A surname is not a safe new-customer identity. Ask for the actual
    // full name in the next turn; do not read or persist any record yet.
    if(!parsed.ok){
      const nameOnly=raw.trim().match(
        /^([一-龯々ぁ-んァ-ヶー・]{2,4})(?:さん|様)を新規顧客として登録して[。！!]?$/u);
      if(nameOnly){
        pendingCustomerSurname=nameOnly[1];
        return status(pendingCustomerSurname+
          'さんのフルネームを教えてください。氏名を確認するまで顧客登録しません。');
      }
    }

    if(!parsed.ok && Conversation){
      const candidate=Conversation.start(raw);
      if(candidate.ok){
        if(candidate.pending){
          pendingQuoteFields=candidate.fields;
          status(candidate.prompt);
          return;
        }
        const canonical=Anon.prepare(candidate.canonical);
        if(canonical.ok){
          if($('budil-gpt-consent').checked!==true)
            return status('顧客候補を探す前に端末データの読取にチェックしてください。',true);
          try{
            const localLeads=Data.getLeads();
            quoteDeps={documentsBrain:Docs,customerResolver:Resolver,anonymizer:Anon,
              localAccessConsent:true,localLeads};
            const started=Core.startLocalParsed(session,candidate.canonical,quoteDeps);
            $('budil-gpt-consent').checked=false;
            if(!started.ok){quoteDeps=null;return status(started.message||started.code,true);}
            quoteCandidates(started);return;
          }catch(_){quoteDeps=null;return status('顧客候補を取得できません。',true);}
        }
      }
    }
    if(parsed.ok && parsed.action==='customer.create.preview')
      return stageNewCustomerName(parsed.request.name);
    if(!parsed.ok)return status('指示を確認してください（'+parsed.code+'）。元の下書きは変更していません。',true);
    if($('budil-gpt-consent').checked!==true)
      return status('端末内の顧客・帳票データを読む場合は、確認欄にチェックしてください。',true);
    // Clear results only after parsing and consent. Do not erase in-progress
    // data when a command is unsupported or authorization was not given.
    resultBox.replaceChildren();
    $('budil-gpt-consent').checked=false;
    if(parsed.action==='quote.draft'){
      try{
        const localLeads=Data.getLeads(); // ONLY after explicit user click+consent
        quoteDeps={documentsBrain:Docs,customerResolver:Resolver,anonymizer:Anon,
          localAccessConsent:true,localLeads};
        const result=Core.startLocalParsed(session,parsed.original,quoteDeps);
        if(!result.ok){quoteDeps=null;return status(result.message||result.code,true);}
        quoteCandidates(result);
      }catch(_){quoteDeps=null;status('端末内の顧客を読み取れません。',true);}
      return;
    }
    const gateway=Source.make({storage:Data,readonly:ReadOnly,
      customerResolver:Resolver,paymentBrain:Payment,profitBrain:Profit});
    const answer=gateway.query(parsed.request,true);
    queryResult(parsed,answer);
  }
  function revise(){
    if(!Core||!session||session.stage!=='draft')
      return status('まず顧客を選択し、見積下書きを作成してください。',true);
    const result=Core.revise(session,$('budil-gpt-revision').value,quoteDeps);
    if(!result.ok)return status(result.message||result.code,true);
    renderQuote('budil-gpt-draft-preview',result.doc);
    if(bookingDraft&&bookingDraft.action==='booking')renderBookingPreview();
    $('budil-gpt-revision').value='';
    status('端末内で金額を修正しました。最新の下書きを確認して承認してください。');
  }
  function approve(){
    if(!Core||!session||session.stage!=='draft')
      return status('未承認の下書きがありません。',true);
    const result=Core.approve(session,session.revision);
    if(!result.ok)return status(result.message||result.code,true);
    hide('budil-gpt-draft',true);hide('budil-gpt-approved',false);
    renderQuote('budil-gpt-approved-preview',result.doc);
    status('見積内容を承認しました。正式発行やデータ保存はしていません。');
  }
  function startQuoteInvoice(){
    if(!Core||!session||session.stage!=='approved')return status('先に実際の見積を承認してください。',true);
    invoiceKind='quote';invoicePrepared=null;invoiceOrderId='';
    hide('budil-gpt-invoice',false);hide('budil-gpt-invoice-confirm',true);
    $('budil-gpt-invoice-orders').replaceChildren();
    status('見積から請求書を作ります。請求日・支払期限・支払方法・入金予定日を入力し、別に承認してください。');
  }
  async function savePdf(){
    if(exporting||pdfDone)return;
    if(!Core||!session)return status('見積がありません。',true);
    const result=Core.getApprovedForPdf(session);
    if(!result.ok)return status(result.message||result.code,true);
    if(!window.BudilDocExport)return status('PDF出力機能を利用できません。',true);
    exporting=true;$('budil-gpt-pdf').disabled=true;
    try{
      // A single-line, unsaved assistant draft uses the existing 1110px A4
      // rounding guard; all normal Budil PDFs retain their original settings.
      const out=await window.BudilDocExport.downloadDocumentPdf(result.doc,{fixtureSinglePage:true});
      if(!out||out.ok!==true)throw Error('PDF_NOT_SAVED');
      pdfDone=true;
      status('未発行の見積PDF保存処理が完了しました。端末の保存先をご確認ください。');
    }catch(_){
      $('budil-gpt-pdf').disabled=false;
      status('PDF保存に失敗しました。端末の設定を確認してください。',true);
    }finally{exporting=false;}
  }
  function speech(){
    if(!$('budil-gpt-voice-consent').checked)
      return status('音声認識はブラウザの外部音声処理を使う場合があります。利用を許可してから開始してください。',true);
    const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Speech)return status('このブラウザは音声入力非対応です。テキスト入力をご利用ください。',true);
    if(voice)return status('現在音声を認識しています。',true);
    try{
      voice=new Speech();voice.lang='ja-JP';voice.interimResults=false;voice.maxAlternatives=1;
      voice.onresult=e=>{
        $('budil-gpt-input').value=String(e.results[0][0].transcript||'').slice(0,220);
        status('音声を文字にしました。内容を確認し、読取同意の後に「実行」を押してください。');
      };
      voice.onerror=()=>status('音声入力に失敗しました。テキストで入力できます。',true);
      voice.onend=()=>{voice=null;};
      voice.start();
    }catch(_){voice=null;status('音声入力を開始できません。',true);}
  }

  // Readiness is explicitly initiated by the user, never on page load.
  // One request at a time. No raw instruction, customer, document or amount
  // is included in the request: the shared login is handled inside BudilCloud.
  let readinessBusy=false,readinessSeq=0;
  async function checkGptReadiness(){
    if(readinessBusy)return;
    const output=$('budil-gpt-readiness-status');
    const cloud=window.BudilCloud;
    if(!cloud || typeof cloud.getGptReadiness!=='function'){
      output.textContent='GPT接続機能は利用できません。';
      return;
    }
    const seq=++readinessSeq;
    readinessBusy=true;
    const button=$('budil-gpt-readiness');button.disabled=true;
    output.textContent='GPT接続設定を確認しています（AIへの有料通信なし）。';
    try{
      const result=await cloud.getGptReadiness();
      if(seq!==readinessSeq || shell.hidden)return;
      if(!result || result.ok!==true){
        const code=result && result.code || 'unavailable';
        output.textContent=code==='not_signed_in'
          ? '設定画面のクラウドバックアップでログインしてから、再度ご確認ください。'
          : 'GPT接続状態を確認できませんでした（'+code+'）。';
      }else{
        output.textContent=result.readonlyReady
          ? '匿名の集計質問をGPTで分類できます。外部送信と端末読取の同意が毎回必要です。'
          : result.anonymizedReady
          ? '匿名の見積指示GPT解析が使用可能です。集計質問のGPTはまだ無効です。'
          : result.ready
          ? 'GPT基盤は準備済みですが、会話解析の個別機能はまだ無効です。'
          : 'GPTはまだ利用開始できません。APIキーや試験許可の設定状況を確認してください。';
      }
    }catch(_){
      if(seq===readinessSeq && !shell.hidden)
        output.textContent='GPT接続状態を確認できませんでした。';
    }finally{
      readinessBusy=false;button.disabled=false;
    }
  }


  let interpretBusy=false,interpretSeq=0;
  async function interpretQuoteWithGpt(){
    if(interpretBusy)return;
    if(!Core||!Anon||!Resolver||!Docs||!Data)
      return status('見積機能が利用できません。',true);
    if(session && session.stage!=='idle')
      return status('進行中の見積を保持しています。別の見積はクリアしてから実行してください。',true);
    if($('budil-gpt-consent').checked!==true ||
       $('budil-gpt-remote-consent').checked!==true)
      return status('端末データの読取と匿名化データの外部送信の両方にチェックが必要です。',true);
    const raw=$('budil-gpt-input').value;
    const prepared=Anon.prepare(raw);
    if(!prepared.ok || !Anon.acceptsWire(prepared.wire))
      return status('このGPT試験は顧客名・作業・台数・税込/税抜・合計金額を明示したエアコン見積のみ対応です。',true);
    const cloud=window.BudilCloud;
    if(!cloud || typeof cloud.interpretAnonymizedQuote!=='function')
      return status('GPT接続機能が利用できません。',true);
    const seq=++interpretSeq;
    interpretBusy=true;
    const button=$('budil-gpt-interpret');button.disabled=true;
    $('budil-gpt-consent').checked=false;
    $('budil-gpt-remote-consent').checked=false;
    status('顧客名を除いた見積指示をGPTで解析しています。');
    try {
      const answer=await cloud.interpretAnonymizedQuote(raw);
      if(seq!==interpretSeq || shell.hidden)return;
      if(!answer || answer.ok!==true || answer.verified!==true ||
         answer.phase!=='interpret_only')
        return status('GPT解析は完了できませんでした（'+(answer&&answer.code||'unavailable')+'）。端末の見積は変更していません。',true);
      // Read local records only after explicit prior consent, and only after
      // the server result has passed the original local-instruction check.
      const localLeads=Data.getLeads();
      quoteDeps={documentsBrain:Docs,customerResolver:Resolver,anonymizer:Anon,
        localAccessConsent:true,localLeads};
      const started=Core.startAnonymized(session,raw,answer.intent,quoteDeps);
      if(!started.ok){
        quoteDeps=null;
        return status(started.message||started.code,true);
      }
      resultBox.replaceChildren();
      quoteCandidates(started);
      status('GPTの解析結果を端末で再確認しました。顧客候補を選択してください。見積は未保存です。');
    }catch(_){
      if(seq===interpretSeq && !shell.hidden)
        status('GPT解析または端末データ読取に失敗しました。見積は保存していません。',true);
    }finally{
      interpretBusy=false;button.disabled=false;
    }
  }

  async function previewBank(){
    if(bankBusy||!Bank)return;
    bankPreview=null;$('budil-gpt-bank-results').replaceChildren();
    const file=$('budil-gpt-bank-file').files[0];
    const source=$('budil-gpt-bank-source').value.trim();
    if(!file||!source||source.length>80||/[\x00-\x1f]/.test(source))
      return status('CSVファイルと80文字以内の金融機関・口座識別名を指定してください。',true);
    if(file.size>2*1024*1024)return status('CSVは2MB以下にしてください。',true);
    bankBusy=true;
    try{
      const bytes=await file.arrayBuffer();
      const encoding=$('budil-gpt-bank-encoding').value;
      const content=new TextDecoder(encoding,{fatal:true}).decode(bytes);
      if(content.includes('\uFFFD'))throw Error('ENCODING_AMBIGUOUS');
      const parsed=Bank.parse(content);
      if(!parsed.ok)throw Error(parsed.code);
      const rows=Bank.candidates(parsed.deposits,Data.getDocuments(),source,Payment,Data.getRevenueRecords());
      bankPreview={source,rows};
      const box=$('budil-gpt-bank-results');
      box.append(node('p','入金候補 '+rows.length+'件 / 除外 '+parsed.rejected.length+'件。保存・入金確定はまだ行っていません。'));
      for(const reject of parsed.rejected)box.append(node('p','CSV '+reject.line+'行：除外（'+reject.code+'）'));
      for(const dep of rows){
        const card=node('div',undefined,'budil-gpt-item');
        card.append(node('p','CSV '+dep.line+'行 / '+dep.date+' / '+yen(dep.amount)+' / '+dep.description));
        card.append(node('p','取引ID '+(dep.id||'なし')+' / 候補 '+dep.candidates.length+'件 / 確信度 '+dep.confidence));
        if(dep.duplicate)card.append(node('p','この取引IDは同じ口座の請求書に割当済みです。'));
        for(const match of dep.candidates){
          card.append(node('p','請求書 '+match.number+' / '+match.customerName+' / 根拠 '+match.evidence.join('、')));
          if(match.linkedRevenue)card.append(node('p','紐付け売上があるためCSVからは更新できません。Budilで手動確認してください。'));
          if(dep.candidates.length!==1||dep.duplicate||!dep.id||match.linkedRevenue)continue;
          const label=node('label');
          const check=node('input');check.type='checkbox';
          label.append(check,node('span',' この入金と請求書を確認した'));
          const button=node('button','この1件を入金済みにする','budil-gpt-btn');button.type='button';
          button.addEventListener('click',()=>{
            if(!check.checked)return status('入金行と請求書を確認してチェックしてください。',true);
            if(!bankPreview||bankPreview.source!==source||
              $('budil-gpt-bank-source').value.trim()!==source||!bankPreview.rows.includes(dep))
              return status('プレビューが無効です。再読み込みしてください。',true);
            button.disabled=true;
            const result=Bank.apply({deposit:dep,invoiceId:match.id,source,
              storage:Data,payment:Payment,confirm:true});
            if(!result.ok){button.disabled=false;return status('入金更新を停止しました（'+result.code+'）。再プレビューしてください。',true);}
            bankPreview=null;box.replaceChildren(node('p','請求書 '+match.number+' を入金済みに更新し、端末で読取確認しました。再照合するにはCSVを再プレビューしてください。'));
            status('選択した1件だけを入金済みにしました。');
          });
          card.append(label,button);
        }
        box.append(card);
      }
      status('明細と発行済み未入金請求書を照合しました。候補の根拠と取引IDを確認してください。');
    }catch(e){status('CSVを照合できません（'+(e.message||'READ_FAILED')+'）。文字コードと列を確認してください。',true);}
    finally{bankBusy=false;}
  }

  let publicReadBusy=false,publicReadSeq=0;
  async function runPublicRead(){
    if(publicReadBusy)return;
    if(!PublicRead||!Commands||!Source||!ReadOnly||!Data||
       typeof PublicRead.localRequest!=='function')
      return status('集計質問の機能を読み込めません。',true);
    if(session&&session.stage!=='idle')
      return status('見積下書きや顧客候補を保持しています。別操作はクリアしてから実行してください。',true);
    if($('budil-gpt-consent').checked!==true ||
       $('budil-gpt-public-consent').checked!==true)
      return status('端末データの読取と匿名質問の外部送信の両方にチェックしてください。',true);
    const raw=$('budil-gpt-input').value;
    const safe=PublicRead.prepare(raw);
    if(!safe.ok)
      return status('氏名などを含まない、未入金・利益・今月/先月の帳票集計質問だけが対象です。',true);
    const cloud=window.BudilCloud;
    if(!cloud||typeof cloud.interpretPiiFreeRead!=='function')
      return status('GPT接続機能を利用できません。',true);
    const button=$('budil-gpt-public-read');
    const seq=++publicReadSeq;
    publicReadBusy=true;button.disabled=true;
    $('budil-gpt-consent').checked=false;
    $('budil-gpt-public-consent').checked=false;
    status('顧客情報を含まない質問文だけをGPTに送って分類しています。');
    try{
      const answer=await cloud.interpretPiiFreeRead(raw);
      if(seq!==publicReadSeq||shell.hidden)return;
      if(!answer||answer.ok!==true||answer.verified!==true)
        return status('GPT分類できませんでした（'+(answer&&answer.code||'unavailable')+'）。端末のデータは変更していません。',true);
      const parsed=answer.parsed;
      const req=PublicRead.localRequest(parsed,Commands.todayTokyo());
      if(!req.ok)return status('この質問はまだ端末内検索へ接続できません。',true);
      const query={...parsed,request:req.request};
      const gateway=Source.make({storage:Data,readonly:ReadOnly,
        customerResolver:Resolver,paymentBrain:Payment,profitBrain:Profit});
      queryResult(query,gateway.query(query.request,true));
      status(statusBox.textContent+' ※質問文だけをGPTに送信。業務データは端末内で検索しました。');
    }catch(_){
      if(seq===publicReadSeq&&!shell.hidden)
        status('GPT分類または端末検索に失敗しました。データ変更はしていません。',true);
    }finally{
      publicReadBusy=false;button.disabled=false;
    }
  }

  openButton.addEventListener('click',open);
  $('budil-gpt-public-read').addEventListener('click',runPublicRead);
  $('budil-gpt-interpret').addEventListener('click',interpretQuoteWithGpt);
  $('budil-gpt-readiness').addEventListener('click',checkGptReadiness);
  $('budil-gpt-close').addEventListener('click',close);
  $('budil-gpt-backdrop').addEventListener('click',close);


  function stageNewCustomerName(fullName){
    if($('budil-gpt-consent').checked!==true)
      return status('新規顧客を重複照合する前に端末データの読取にチェックしてください。',true);
    if(!/^[一-龯々ぁ-んァ-ヶー・A-Za-z]{3,32}$/u.test(fullName))
      return status('氏名を確認できません。フルネームを入力してください。',true);
    try{
      const leads=Data.getLeads();
      const duplicate=leads.some(c=>
        Resolver.normalizeName(Resolver.leadDisplayName(c))===
        Resolver.normalizeName(fullName));
      $('budil-gpt-consent').checked=false;
      pendingCustomerSurname='';
      if(duplicate)
        return status('同じ名前の顧客が登録済みです。誤登録防止のため追加しません。',true);
      pendingNewCustomer=fullName;
      const preview=$('budil-gpt-customer-create-preview');
      preview.replaceChildren();
      const card=node('div',undefined,'budil-gpt-item');
      card.append(node('p','登録予定の氏名：'+fullName));
      card.append(node('p','電話・住所は未入力。本人が登録ボタンを押すまで保存しません。'));
      preview.append(card);
      hide('budil-gpt-customer-create',false);
      status('登録内容を確認してください。確定ボタンを押すまで保存しません。');
    }catch(_){status('顧客データの重複確認に失敗しました。',true);}
  }

  function confirmNewCustomer(){
    const name=pendingNewCustomer;
    if(!name||!Data||!Resolver||
       typeof Data.addLead!=='function'||typeof Data.getLeads!=='function')
      return status('承認待ちの顧客登録がありません。',true);
    const btn=$('budil-gpt-customer-create-confirm');
    btn.disabled=true;
    try{
      const leads=Data.getLeads();
      if(leads.some(c=>Resolver.normalizeName(Resolver.leadDisplayName(c))===
          Resolver.normalizeName(name))){
        pendingNewCustomer=null;hide('budil-gpt-customer-create',true);
        return status('登録直前に同名の顧客を検出しました。追加しません。',true);
      }
      // Preserve the original data before applying a user-approved write.
      if(typeof Data.createSafetyBackup==='function' && Data.KEYS &&
         Data.KEYS.LEADS){
        Data.createSafetyBackup({reason:'budil_gpt_customer_create',
          targetKey:Data.KEYS.LEADS,data:leads,beforeCount:leads.length});
      }
      const created=Data.addLead({name,source:'Budil AI業務番頭'});
      if(!created||!created.id)throw Error('SAVE_FAILED');
      pendingNewCustomer=null;
      hide('budil-gpt-customer-create',true);
      resultBox.replaceChildren();
      title('顧客登録完了');
      item([['氏名',created.name],['登録先','この端末のBudil顧客管理'],
        ['電話・住所','未登録'],['クラウド同期','未実施']]);
      status('氏名を端末に保存しました。住所・電話は顧客管理で追記してください。');
    }catch(_){return status('顧客を保存できませんでした。追加状態を顧客管理で確認してください。',true);}
    finally{btn.disabled=false;}
  }

  $('budil-gpt-run').addEventListener('click',run);
  $('budil-gpt-bank-preview').addEventListener('click',previewBank);
  for(const id of ['source','encoding','file'])$('budil-gpt-bank-'+id).addEventListener('change',()=>{
    bankPreview=null;$('budil-gpt-bank-results').replaceChildren();
  });
  $('budil-gpt-booking-continue').addEventListener('click',continueBooking);
  $('budil-gpt-booking-save').addEventListener('click',saveBooking);
  $('budil-gpt-google-check').addEventListener('click',runGoogleRead);
  $('budil-gpt-customer-create-confirm').addEventListener('click',confirmNewCustomer);
  $('budil-gpt-speech').addEventListener('click',speech);
  $('budil-gpt-revise').addEventListener('click',revise);
  $('budil-gpt-approve').addEventListener('click',approve);
  $('budil-gpt-pdf').addEventListener('click',savePdf);
  $('budil-gpt-quote-invoice').addEventListener('click',startQuoteInvoice);
  $('budil-gpt-invoice-preview').addEventListener('click',previewInvoice);
  $('budil-gpt-completion-confirm').addEventListener('click',saveCompletion);
  $('budil-gpt-invoice-confirm').addEventListener('click',saveInvoice);
  $('budil-gpt-invoice-issue-confirm').addEventListener('click',confirmInvoiceIssue);
  for(const id of ['work-date','amount','tax','issue','due','method','expected'])
    $('budil-gpt-invoice-'+id).addEventListener('input',()=>{
      invoicePrepared=null;completionPrepared=null;resetInvoiceIssue();hide('budil-gpt-invoice-confirm',true);hide('budil-gpt-completion-confirm',true);
    });
  $('budil-gpt-clear').addEventListener('click',()=>{
    resetVisible();status('入力をクリアしました。');
  });
  document.addEventListener('keydown',e=>{
    if(!shell.hidden&&e.key==='Escape'){e.preventDefault();close();}
  });
})();
