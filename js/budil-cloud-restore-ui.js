/**
 * Manual cloud restore UI. A separate human click is required for each phase:
 * download authenticated snapshot -> preview -> save current JSON -> attest
 * saved backup -> apply -> reload. Never runs automatically.
 */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const previewBtn=$('btn-cloud-restore-preview');
  const downloadBtn=$('btn-cloud-restore-download');
  const applyBtn=$('btn-cloud-restore-apply');
  const reloadBtn=$('btn-cloud-restore-reload');
  const saved=$('cloud-restore-saved');
  const status=$('cloud-restore-summary');
  const loginStatus=$('cloud-backup-login-status');
  if(!previewBtn||!downloadBtn||!applyBtn||!reloadBtn||!saved||!status||
     typeof BudilCloud==='undefined'||typeof DataBackup==='undefined'||
     typeof BudilCloudRestore==='undefined')return;
  const engine=BudilCloudRestore.make({
    dataBackup:DataBackup,localStorage,webCrypto:crypto
  });
  let pendingId=null,busy=false,applied=false;
  function message(text,error){
    status.textContent=text;
    status.classList.toggle('cloud-backup-result-error',!!error);
    status.classList.toggle('cloud-backup-result-ok',!error&&!!text);
  }
  function signedIn(){
    return BudilCloud.isAvailable() &&
      BudilCloud.getAuthState().signedIn===true;
  }
  function reset(clearMsg){
    engine.clear();pendingId=null;applied=false;
    saved.checked=false;saved.disabled=true;
    downloadBtn.disabled=true;applyBtn.disabled=true;
    reloadBtn.classList.add('hidden');
    if(clearMsg)message('',false);
  }
  function update(){
    const allowed=signedIn();
    previewBtn.classList.toggle('hidden',!allowed);
    previewBtn.disabled=!allowed||busy;
    if(!allowed)reset(false);
  }
  if(loginStatus && typeof MutationObserver!=='undefined'){
    new MutationObserver(update).observe(loginStatus,{
      childList:true,characterData:true,subtree:true
    });
  }
  $('btn-cloud-logout')?.addEventListener('click',()=>reset(true));
  $('btn-cloud-backup')?.addEventListener('click',()=>reset(true));
  previewBtn.addEventListener('click',async()=>{
    if(busy||!signedIn())return;
    busy=true;reset(true);update();
    message('ログイン済みアカウントの最新バックアップを確認中…',false);
    try{
      const response=await BudilCloud.fetchLatestPayload();
      if(!signedIn())return reset(true);
      if(!response||!response.ok){
        return message('クラウドから取得できません（'+
          String(response&&response.code||'unavailable')+
          '）。復元APIの公開状態とログインを確認してください。',true);
      }
      if(!response.latest)return message('このアカウントにはクラウドバックアップがありません。',true);
      const checked=await engine.preview(response.latest);
      if(!checked.ok)return message('バックアップの安全性を確認できません（'+checked.code+'）。復元を拒否しました。',true);
      pendingId=checked.snapshotId;
      saved.disabled=false;downloadBtn.disabled=false;
      message('復元候補: '+checked.createdAt+
        ' / 対象'+checked.keyCount+'項目 / 保存先レコード'+
        checked.remoteItems+'件 / この端末'+checked.localItems+
        '件。現在の端末のJSONを保存してから復元してください。',false);
    }catch(_){message('バックアップの取得・検証に失敗しました。データは変更していません。',true);}
    finally{busy=false;update();}
  });
  downloadBtn.addEventListener('click',()=>{
    if(!pendingId||busy||!signedIn())return;
    try{
      const data=DataBackup.exportPayload();
      const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement('a');
      anchor.href=url;
      anchor.download='budil-before-cloud-restore-'+new Date().toISOString().slice(0,10)+'.json';
      document.body.append(anchor);
      anchor.click();anchor.remove();
      setTimeout(()=>URL.revokeObjectURL(url),5000);
      message('現在の端末のバックアップJSONの保存操作を開始しました。保存したファイルを確認してからチェックを入れてください。',false);
    }catch(_){message('バックアップJSONを保存できませんでした。復元は開始しません。',true);}
  });
  saved.addEventListener('change',()=>{
    applyBtn.disabled=!pendingId||!signedIn()||saved.checked!==true||busy||applied;
  });
  applyBtn.addEventListener('click',async()=>{
    if(!pendingId||busy||!signedIn()||saved.checked!==true||applied)return;
    busy=true;applyBtn.disabled=true;previewBtn.disabled=true;
    message('安全性を再検証して、この端末へ復元中…',false);
    try{
      const result=await engine.apply({
        snapshotId:pendingId,permit:true,backupSaved:true
      });
      if(!result.ok){
        return message('復元を中止しました（'+result.code+'）。'+
          (result.rollbackSucceeded?'変更前にロールバックしました。':''),true);
      }
      applied=true;pendingId=null;downloadBtn.disabled=true;
      saved.disabled=true;reloadBtn.classList.remove('hidden');
      message('この端末への復元が完了しました（対象'+result.restoredKeys+
        '項目）。クラウドや他端末には書き込んでいません。画面を再読み込みして確認してください。',false);
    }catch(_){message('復元中にエラーが発生しました。データを確認してください。',true);}
    finally{busy=false;update();}
  });
  reloadBtn.addEventListener('click',()=>location.reload());
  update();
})();
