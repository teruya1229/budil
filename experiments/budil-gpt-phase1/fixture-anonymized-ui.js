/**
 * Dedicated *fictional lead only* UI rehearsal for the future local-private
 * customer workflow. Never reads Storage, Cloud backups, actual customers or
 * bank/calendar data. Always ask for manual selection and approval.
 */
(function () {
  'use strict';
  const Core = window.BudilGptFixtureCore;
  const Anon = window.BudilGptAnonymize ||
    (typeof BudilGptAnonymize !== 'undefined' ? BudilGptAnonymize : null);
  const $ = id => document.getElementById(id);
  if (!Core || !Anon || !window.BudilCloud) return;
  const demoLeads = Object.freeze([
    Object.freeze({id:'privacy-fake-001',name:'山田花子',area:'与那原町',isDemo:true}),
    Object.freeze({id:'privacy-fake-002',name:'田中太郎',area:'南城市',isDemo:true}),
    Object.freeze({id:'privacy-fake-003',name:'田中太郎',area:'八重瀬町',isDemo:true})
  ]);
  const deps = {
    customerResolver: typeof CustomerResolveEntrypoint !== 'undefined'
      ? CustomerResolveEntrypoint : null,
    documentsBrain: typeof DocumentsBrain !== 'undefined' ? DocumentsBrain : null,
    anonymizer:Anon,
    localAccessConsent:true,
    localLeads:demoLeads
  };
  let session=Core.createSession(),requesting=false,pdfInFlight=false,pdfDone=false;
  let generation=0,voice=null;

  function show(id,value){$(id).classList.toggle('fixture-hidden',!value);}
  function status(text,error){
    $('privacy-status').textContent=String(text);
    $('privacy-status').classList.toggle('error',!!error);
  }
  function htmlSafeSummary(id,doc,version){
    const dl=document.createElement('dl');
    for (const [key,value] of [
      ['顧客',doc.customerName+'（架空）'],
      ['書類',doc.status==='draft'?'未発行の見積下書き':'承認済み・未発行'],
      ['品目',(doc.items||[]).map(i=>i.name+' × '+i.quantity+'台').join('、')],
      ['合計',Number(doc.total).toLocaleString('ja-JP')+'円'],
      ['下書き版',version==null?'承認済み':String(version)]
    ]) {
      const dt=document.createElement('dt');dt.textContent=key;
      const dd=document.createElement('dd');dd.textContent=value;
      if(key==='合計')dd.className='fixture-total';
      dl.append(dt,dd);
    }
    $(id).replaceChildren(dl);
  }
  function hideFuture(){
    show('privacy-candidates',false);
    show('privacy-draft',false);
    show('privacy-approved',false);
  }
  function allowOnlyFictional(input){
    const parsed=Anon.prepare(input);
    if(!parsed.ok)return parsed;
    // The normal application will use LOCAL Budil leads after explicit consent.
    // This independent demo must never touch real names or live Storage.
    const name=parsed.local.customerName;
    if(!demoLeads.some(l=>l.name===name))return {
      ok:false,code:'fictional_names_only'
    };
    return parsed;
  }
  function preview(){
    const parsed=allowOnlyFictional($('privacy-instruction').value);
    hideFuture();
    if(!parsed.ok){
      $('privacy-wire').textContent='';
      return status('架空顧客だけを使用してください（'+parsed.code+'）。',true);
    }
    $('privacy-wire').textContent='GPTへ送る内容（顧客名は含まれません）：'+
      parsed.wire.instruction;
    status('氏名は端末内にだけ残し、作業・台数・合計・税区分を確認しました。実際の通信はしていません。');
  }
  function choose(result){
    hideFuture();
    const wrap=$('privacy-candidate-list');wrap.replaceChildren();
    result.candidates.forEach(c=>{
      const b=document.createElement('button');
      b.type='button';b.className='fixture-choice';
      b.textContent=c.displayName+'（架空）／'+(c.municipality||'地域未設定');
      b.addEventListener('click',()=>{
        const r=Core.selectCustomer(session,c.customerId,deps);
        if(!r.ok)return status(r.message||r.code,true);
        show('privacy-candidates',false);
        show('privacy-draft',true);
        htmlSafeSummary('privacy-draft-summary',r.doc,r.revision);
        $('privacy-revision').value='';
        status('候補を選択しました。修正・承認するまで保存やPDF生成はしません。');
      });
      wrap.append(b);
    });
    show('privacy-candidates',true);
    status('候補'+result.candidates.length+'件。氏名が一致しても本人が候補を選んでください。');
  }
  async function send(){
    if(requesting)return;
    if(session.stage!=='idle')return status('現在の操作を完了するかリセットしてください。',true);
    const input=$('privacy-instruction').value;
    const parsed=allowOnlyFictional(input);
    if(!parsed.ok)return status('架空顧客だけを使用してください（'+parsed.code+'）。',true);
    if(!Anon.acceptsWire(parsed.wire))return status('匿名化した送信文を確認できません。',true);
    // Explicit click is the sole network trigger. No auto-submit on input.
    const id=generation;
    requesting=true;$('privacy-send').disabled=true;
    $('privacy-wire').textContent='送信予定：'+parsed.wire.instruction;
    status('認証付きGPTへ匿名の架空指示だけを送ります（有効化されている場合）。');
    try{
      const output=await window.BudilCloud.interpretAnonymizedQuote(input);
      if(id!==generation||session.stage!=='idle')return;
      if(!output||!output.ok)return status('GPT試験未利用：'+
        (output&&output.code||'unknown')+'。外部データを保存していません。',true);
      const result=Core.startAnonymized(session,input,output,deps);
      if(!result.ok)return status(result.message||result.code,true);
      choose(result);
    }catch(_){status('GPT接続に失敗しました。下書きは保存されていません。',true);}
    finally{requesting=false;$('privacy-send').disabled=false;}
  }
  function revise(){
    const r=Core.revise(session,$('privacy-revision').value,deps);
    if(!r.ok)return status(r.message||r.code,true);
    htmlSafeSummary('privacy-draft-summary',r.doc,r.revision);
    $('privacy-revision').value='';
    status('端末内で金額を修正しました。最新の下書きを承認してください。');
  }
  function approve(){
    const r=Core.approve(session,session.revision);
    if(!r.ok)return status(r.message||r.code,true);
    pdfDone=false;
    $('privacy-pdf').disabled=false;
    show('privacy-draft',false);show('privacy-approved',true);
    htmlSafeSummary('privacy-approved-summary',r.doc,null);
    status('架空の見積下書きを本人が承認しました。まだ正式発行・送信・保存はしていません。');
  }
  async function pdf(){
    if(pdfInFlight||pdfDone)return;
    const r=Core.getApprovedForPdf(session);
    if(!r.ok)return status(r.message||r.code,true);
    if(!window.BudilDocExport)return status('PDF出力が使えません。',true);
    pdfInFlight=true;
    $('privacy-pdf').disabled=true;
    status('既存Budilの帳票形式で、未発行の架空見積PDFを出力します。');
    try{
      const out=await window.BudilDocExport.downloadDocumentPdf(r.doc,{fixtureSinglePage:true});
      if(!out||out.ok!==true)throw Error('pdf_unavailable');
      pdfDone=true;
      status('架空・未発行の見積PDF保存を要求しました：'+out.filename);
    }catch(_){
      $('privacy-pdf').disabled=false;
      status('PDF保存に失敗しました。ブラウザの保存設定を確認してください。',true);
    }finally{pdfInFlight=false;}
  }
  function reset(){
    generation++;
    if(voice){try{voice.abort();}catch(_){}voice=null;}
    session=Core.createSession();pdfDone=false;pdfInFlight=false;
    hideFuture();
    $('privacy-wire').textContent='';
    $('privacy-revision').value='';
    $('privacy-pdf').disabled=false;
    status('リセットしました。架空顧客のデータ以外には触れていません。');
  }
  function listen(){
    const Recognizer=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Recognizer)return status('このブラウザは音声認識非対応です。テキスト入力をご利用ください。',true);
    if(voice)return status('音声入力中です。',true);
    try{
      voice=new Recognizer();voice.lang='ja-JP';
      voice.interimResults=false;voice.maxAlternatives=1;
      voice.onresult=e=>{
        $('privacy-instruction').value=String(e.results[0][0].transcript||'').slice(0,220);
        status('音声を入力欄に転記しました。送信前に架空顧客だけか確認してください。');
      };
      voice.onerror=()=>status('音声入力が使えません。テキストを入力してください。',true);
      voice.onend=()=>{voice=null;};
      voice.start();
    }catch(_){voice=null;status('音声入力を開始できません。',true);}
  }
  $('privacy-preview').addEventListener('click',preview);
  $('privacy-send').addEventListener('click',send);
  $('privacy-revise').addEventListener('click',revise);
  $('privacy-approve').addEventListener('click',approve);
  $('privacy-pdf').addEventListener('click',pdf);
  $('privacy-reset').addEventListener('click',reset);
  $('privacy-speak').addEventListener('click',listen);
})();
