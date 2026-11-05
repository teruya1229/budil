/**
 * Manual step-by-step UI for fixture workflow. No real Calendar/Bank calls.
 * Every mutating action requires a user button press.
 */
(function () {
  'use strict';
  const $=id=>document.getElementById(id);
  const Flow=window.BudilGptFixtureWorkflow;
  let session=null,previewToken='',pdfDone=false,exporting=false;
  function show(id,yes){$(id).classList.toggle('fixture-hidden',!yes);}
  function info(message,error){
    $('fixture-workflow-status').textContent=message;
    $('fixture-workflow-status').classList.toggle('error',!!error);
  }
  function printSummary(id,lines){
    $(id).replaceChildren();
    const dl=document.createElement('dl');
    Object.entries(lines).forEach(([k,v])=>{
      const dt=document.createElement('dt'),dd=document.createElement('dd');
      dt.textContent=k;dd.textContent=String(v==null?'':v);dl.append(dt,dd);
    });
    $(id).append(dl);
  }
  function amount(v){return Number(v||0).toLocaleString('ja-JP')+'円';}
  function focusSection(id){$(id).scrollIntoView({behavior:'smooth',block:'start'});}
  function begin() {
    const bridge=window.BudilGptFixtureBridge;
    const approved=bridge&&bridge.getApprovedQuoteSession();
    if(!approved) return info('架空見積書の承認が先に必要です。',true);
    const result=Flow.makeSession(approved,{
      documentsBrain:window.DocumentsBrain,
      workOrderBrain:window.WorkOrderBrain,
      paymentBrain:window.PaymentBrain
    });
    if(!result.ok) return info(result.message,true);
    session=result;previewToken='';pdfDone=false;
    show('fixture-workflow',true);
    show('fixture-workflow-review',false);
    show('fixture-workflow-completed',false);
    show('fixture-workflow-invoice',false);
    show('fixture-workflow-bank',false);
    show('fixture-workflow-invoice-approved',false);
    printSummary('fixture-workflow-quote-summary',{
      '架空顧客':session.estimate.customerName,
      '見積合計':amount(session.estimate.total),
      'カレンダー':'架空予定のみ・Google未連携'
    });
    info('日付と作業時間を指定し、まず架空の予約枠を確認してください。');
    focusSection('fixture-workflow');
  }
  function checkSlot(){
    if(!session)return info('先に見積書を承認してください。',true);
    const r=Flow.prepareAppointment(session,$('fixture-work-date').value,
      $('fixture-work-start').value,$('fixture-work-end').value);
    previewToken=r.ok?r.slot.token:'';
    show('fixture-workflow-review',r.ok);
    if(!r.ok)return info(r.message,true);
    printSummary('fixture-workflow-slot-summary',{
      '日付':r.slot.date,'開始':r.slot.start,'終了':r.slot.end,
      '空き確認':'架空カレンダーのデータのみ'
    });
    info('架空予定では空いています。日時を確認し、登録案を承認してください。');
  }
  function book(){
    if(!session)return;
    const r=Flow.confirmAppointment(session,previewToken,true);
    if(!r.ok)return info(r.message,true);
    show('fixture-workflow-review',false);
    show('fixture-workflow-completed',true);
    printSummary('fixture-workflow-booked-summary',{
      '予定日':r.workOrder.scheduledDate,
      '時間':r.workOrder.startTime+'〜'+r.workOrder.endTime,
      '作業':r.workOrder.serviceText,
      '予定の状態':'架空デモ内の確定（Google未登録）'
    });
    info('架空の予定だけ確定しました。実際のGoogleカレンダーには登録していません。');
  }
  function complete(){
    if(!session)return;
    const r=Flow.completeWorkOrder(session,true);
    if(!r.ok)return info(r.message,true);
    $('fixture-complete').disabled=true;
    $('fixture-invoice-preview').disabled=false;
    info('架空案件を作業完了にしました。本人操作で請求下書きへ進めます。');
  }
  function draftInvoice(){
    if(!session)return;
    const r=Flow.prepareInvoice(session);
    if(!r.ok)return info(r.message,true);
    show('fixture-workflow-invoice',true);
    printSummary('fixture-workflow-invoice-summary',{
      '種類':'架空デモ請求書（未発行）',
      '顧客':r.invoice.customerName,
      '請求合計':amount(r.invoice.total),
      '入金状態':'未入金（架空）',
      '銀行口座':'振込禁止の架空デモ表示'
    });
    info('請求下書きができました。本人承認後、別操作でPDFを出力できます。');
  }
  function approveInvoice(){
    if(!session)return;
    const r=Flow.approveInvoice(session,true);
    if(!r.ok)return info(r.message,true);
    show('fixture-workflow-invoice-approved',true);
    show('fixture-workflow-bank',true);
    info('請求書のPDF内容を承認しました。実際の請求書発行・送信・保存はしていません。');
  }
  async function invoicePdf(){
    if(exporting||pdfDone||!session)return;
    const r=Flow.approvedInvoiceForPdf(session);
    if(!r.ok)return info(r.message,true);
    exporting=true;$('fixture-invoice-pdf').disabled=true;
    try{
      const result=await window.BudilDocExport.downloadDocumentPdf(r.invoice,{fixtureSinglePage:true});
      if(!result||result.ok!==true)throw new Error('pdf_failed');
      pdfDone=true;
      info('架空請求書のPDF保存処理が完了：'+result.filename+'。内容を確認してください。');
    }catch(_){
      info('PDF保存に失敗しました。端末の保存設定を確認してください。',true);
      $('fixture-invoice-pdf').disabled=false;
    }finally{exporting=false;}
  }
  function unpaid(){
    if(!session)return;
    const r=Flow.unpaidSummary(session);
    if(!r.ok)return info(r.message,true);
    printSummary('fixture-workflow-bank-summary',{
      '未入金合計':amount(r.summary.pendingTotal),
      '未入金件数':r.summary.count,
      '銀行入金確定':'いいえ。実際の銀行明細ではありません。'
    });
    info('既存BudilのPaymentBrainで架空未入金を集計しました。');
  }
  function match(){
    if(!session)return;
    const r=Flow.matchFictionalBankEntry(session,{
      fixture:true,amount:Number($('fixture-bank-amount').value)
    });
    if(!r.ok)return info(r.message,true);
    info(r.message+' 状態は未入金のままです。');
  }
  function search(){
    if(!session)return;
    const r=Flow.findDocuments(session,$('fixture-search-query').value);
    if(!r.ok)return info(r.message,true);
    const names=r.documents.map(d=>(d.type==='estimate'?'見積':'請求')+' '+amount(d.total));
    $('fixture-workflow-search-result').textContent=
      '架空データの検索結果：'+r.documents.length+'件 / '+(names.join('、')||'該当なし');
    info('実顧客の検索やサーバー送信は行っていません。');
  }
  function reset(){
    session=null;previewToken='';pdfDone=false;exporting=false;
    show('fixture-workflow',false);
    $('fixture-complete').disabled=false;
    $('fixture-invoice-preview').disabled=true;
    $('fixture-invoice-pdf').disabled=false;
  }
  $('fixture-continue').addEventListener('click',begin);
  $('fixture-work-check').addEventListener('click',checkSlot);
  $('fixture-work-book').addEventListener('click',book);
  $('fixture-complete').addEventListener('click',complete);
  $('fixture-invoice-preview').addEventListener('click',draftInvoice);
  $('fixture-invoice-approve').addEventListener('click',approveInvoice);
  $('fixture-invoice-pdf').addEventListener('click',invoicePdf);
  $('fixture-unpaid').addEventListener('click',unpaid);
  $('fixture-bank-match').addEventListener('click',match);
  $('fixture-search').addEventListener('click',search);
  document.addEventListener('budil-fixture-reset',reset);
})();
