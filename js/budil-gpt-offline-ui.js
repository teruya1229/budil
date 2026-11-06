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
  const ready=[
    'BudilGptLocalCommands','BudilGptLocalSource','BudilGptReadOnly',
    'BudilGptAnonymize','BudilGptFixtureCore','CustomerResolveEntrypoint',
    'DocumentsBrain','PaymentBrain','Storage'
  ].every(name=>{
    try{return typeof window[name]!=='undefined'||
      typeof eval === 'undefined' ? false : true;}catch(_){return false;}
  });
  // Classic non-module Budil scripts expose lexical const bindings, not
  // necessarily window props. Test them directly, no eval/network access.
  const Commands=typeof BudilGptLocalCommands!=='undefined'?BudilGptLocalCommands:null;
  const Source=typeof BudilGptLocalSource!=='undefined'?BudilGptLocalSource:null;
  const ReadOnly=typeof BudilGptReadOnly!=='undefined'?BudilGptReadOnly:null;
  const Anon=typeof BudilGptAnonymize!=='undefined'?BudilGptAnonymize:null;
  const Core=window.BudilGptFixtureCore||null;
  const Resolver=typeof CustomerResolveEntrypoint!=='undefined'?CustomerResolveEntrypoint:null;
  const Docs=typeof DocumentsBrain!=='undefined'?DocumentsBrain:null;
  const Payment=typeof PaymentBrain!=='undefined'?PaymentBrain:null;
  const Data=typeof Storage!=='undefined'?Storage:null;
  let session=Core?Core.createSession():null;
  let quoteDeps=null,focusedBefore=null,voice=null,exporting=false,pdfDone=false;
  const resultBox=$('budil-gpt-result'),statusBox=$('budil-gpt-status');
  function hide(id,yes){$(id).hidden=!!yes;}
  function status(message,error=false){
    statusBox.textContent=message;
    statusBox.classList.toggle('budil-gpt-error',!!error);
  }
  function resetQuote(){
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
  }
  function open(){
    focusedBefore=document.activeElement;
    shell.hidden=false;
    status('まず操作内容を入力してください。読み取りや保存はまだ行っていません。');
    $('budil-gpt-input').focus();
  }
  function close(){
    if(voice){try{voice.abort();}catch(_){/* browser voice */}voice=null;}
    resetVisible();shell.hidden=true;
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
    if(parsed.action==='receivables.summary'){
      title('Budil端末内の未入金集計');
      item([['未入金合計',yen(view.pendingTotal)],
        ['未入金件数',view.count],['期日超過件数',view.overdueCount],
        ['入金判定','銀行明細による照合は行っていません']]);
      return status('既存のPaymentBrainで集計。入金済みへの更新はしていません。');
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
        status('端末内の見積下書きができました。まだ保存・発行・送信していません。');
      });
      list.append(b);
    });
    status('同姓同名の場合は地域を確認し、本人が顧客候補を選択してください。');
  }
  function run(){
    resetQuote();resultBox.replaceChildren();
    if(!Commands||!Source||!ReadOnly||!Anon||!Core||!Resolver||!Docs||!Payment||!Data)
      return status('Budilの必要なモジュールが読み込まれていません。',true);
    const parsed=Commands.parse($('budil-gpt-input').value,{
      today:Commands.todayTokyo(),anonymizer:Anon
    });
    if(!parsed.ok)return status('指示を確認してください（'+parsed.code+'）。下の例をご利用ください。',true);
    if($('budil-gpt-consent').checked!==true)
      return status('端末内の顧客・帳票データを読む場合は、確認欄にチェックしてください。',true);
    // Consent applies to ONE command. Clearing it prevents an unintentional
    // follow-on read and blocks replay of the same operation.
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
      customerResolver:Resolver,paymentBrain:Payment});
    const answer=gateway.query(parsed.request,true);
    queryResult(parsed,answer);
  }
  function revise(){
    if(!Core||!session||session.stage!=='draft')
      return status('まず顧客を選択し、見積下書きを作成してください。',true);
    const result=Core.revise(session,$('budil-gpt-revision').value,quoteDeps);
    if(!result.ok)return status(result.message||result.code,true);
    renderQuote('budil-gpt-draft-preview',result.doc);
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
  async function savePdf(){
    if(exporting||pdfDone)return;
    if(!Core||!session)return status('見積がありません。',true);
    const result=Core.getApprovedForPdf(session);
    if(!result.ok)return status(result.message||result.code,true);
    if(!window.BudilDocExport)return status('PDF出力機能を利用できません。',true);
    exporting=true;$('budil-gpt-pdf').disabled=true;
    try{
      const out=await window.BudilDocExport.downloadDocumentPdf(result.doc);
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
  openButton.addEventListener('click',open);
  $('budil-gpt-close').addEventListener('click',close);
  $('budil-gpt-backdrop').addEventListener('click',close);
  $('budil-gpt-run').addEventListener('click',run);
  $('budil-gpt-speech').addEventListener('click',speech);
  $('budil-gpt-revise').addEventListener('click',revise);
  $('budil-gpt-approve').addEventListener('click',approve);
  $('budil-gpt-pdf').addEventListener('click',savePdf);
  $('budil-gpt-clear').addEventListener('click',()=>{
    resetVisible();status('入力をクリアしました。');
  });
  document.addEventListener('keydown',e=>{
    if(!shell.hidden&&e.key==='Escape'){e.preventDefault();close();}
  });
})();
