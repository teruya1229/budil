/** Budil GPT chat client guards. Pure functions; no storage, network or mutations. */
const BudilGptChat=(()=>{
  'use strict';
  const allowed=Object.freeze(['none','work.date','work.search','customer.search',
    'customer.timeline','document.period','document.search','receivables.summary',
    'profit.summary','proposal']);
  const deny=code=>({ok:false,code});
  // Fail closed: only known business vocabulary and local aliases leave the device.
  // Unknown names, company names, addresses, and free-text notes are never forwarded.
  const APPROVED_OUTBOUND_TERMS=Object.freeze(["ありがとうございます","ハウスクリーニング","Google","お願いします","クリーニング","してください","スケジュール","Budil","ありがとう","カレンダー","くださいね","こんにちは","こんばんは","してほしい","すみません","パソコン用","埋まってる","教わりたい","空いている","LINE","いします","エアコン","おしえて","おつかれ","おはよう","ください","クラウド","サーバー","だったら","チャット","できない","できます","できれば","でしたら","どうして","ドラム式","について","パソコン","パターン","ましたら","よろしく","リセット","ローカル","作業内容","使いたい","割り引き","取り付け","取り消し","完全分解","対応可能","現場環境","申し込み","登録して","知ってる","知りたい","確かめて","空いてる","試したい","読み取り","間違って","BFC","GPT","PDF","いくら","いてる","エラー","お客様","お願い","シート","したい","してる","しない","スマホ","タイプ","データ","できた","できる","でした","テスト","どうも","どちら","どんな","なんで","ほしい","ました","やって","ライン","リスト","わかる","一昨日","下さい","乾燥機","今すぐ","今まで","今年度","今日中","作って","元請け","入れて","出して","分かる","午前中","午後中","取引先","土曜日","変えて","大丈夫","室外機","家庭用","担当者","探して","換気扇","支払い","教えて","日曜日","明後日","昨年度","時間帯","時間枠","月曜日","木曜日","未入金","本当に","業務用","欲しい","正しい","水曜日","洗濯機","消費税","火曜日","直して","納品書","行ける","見せて","見たい","見積書","調べて","請求書","送って","金曜日","間違い","非対応","領収書","AI","PC","あの","ある","あれ","いつ","いて","いる","えて","かな","かも","から","こと","この","これ","さま","さん","した","して","せて","その","それ","だけ","って","です","でも","どう","どこ","どの","どれ","ない","なぜ","なに","なら","ねぇ","ねえ","ほど","ます","まだ","まで","メモ","もう","もの","やる","より","一回","一度","一覧","不明","不要","不足","中止","予定","予約","二回","二度","交換","今年","今度","今後","今日","今月","今週","件数","会社","会話","何人","何件","何円","何分","何台","何日","何時","作成","作業","保存","修正","修理","値段","先日","先月","先生","先週","入力","入金","全件","全体","全部","内容","内訳","冷房","出力","分解","利益","削除","前回","前後","割引","午前","午後","印刷","原価","原因","厨房","去年","収益","取付","取消","台所","台数","合計","名前","品目","問題","回答","土曜","型番","売上","変更","夕方","安全","完了","室内","家電","対応","少し","履歴","工事","平日","年月","年次","建物","建築","当日","後日","御中","復元","必要","担当","掃除","提案","撤去","支払","数量","料金","新規","施工","日付","日時","日曜","日程","明日","昨日","時刻","時間","暖房","曜日","更新","書込","最初","最後","月曜","月次","期間","木曜","本日","来年","来月","来週","案件","検品","検索","検証","業務","業者","概要","機種","次回","毎年","毎日","毎月","毎週","氏名","水曜","洗浄","活動","浴室","清掃","火曜","照会","照明","状態","現場","理由","環境","申込","発行","登録","相談","確定","確認","祝日","移動","税別","税抜","税込","種類","空き","空調","粗利","終了","経費","結果","継続","縦型","翌日","表示","見積","訂正","計算","記録","訪問","設置","試験","詳細","認証","説明","読取","調査","請求","費用","質問","返信","追加","送信","通常","連絡","違う","部屋","配線","重複","金曜","金額","開始","集計","電気","顧客","、","！","？","。","い","お","か","が","さ","だ","で","と","に","ね","の","は","へ","も","や","よ","を","ん","一","七","万","三","九","二","五","人","件","個","先","八","六","円","分","前","十","千","台","四","夜","年","床","後","日","昼","時","月","朝","本","様","次","氏","百","秒","空","窓","願"]);
  function approvedHiraganaRuns(value){
    const safeMulti=APPROVED_OUTBOUND_TERMS.filter(x=>/^[ぁ-ん]{2,}$/u.test(x));
    for(const run of value.match(/[ぁ-ん]{2,}/gu)||[]){
      let rest=run;
      for(const word of safeMulti)rest=rest.split(word).join('');
      if(rest && !/^[のはがをにでともへやか]$/u.test(rest))return false;
    }
    return true;
  }
  function approvedOutbound(value){
    if(typeof value!=='string'||!value.trim()||value.length>550)return false;
    let remainder=value.replace(/顧客[A-H](?:さん|様)?/gu,'');
    for(const word of APPROVED_OUTBOUND_TERMS)remainder=remainder.split(word).join('');
    remainder=remainder.replace(/[0-9０-９\s.,、。!?！？:：\-‐‑–〜～\/／()（）「」『』【】\[\]{}［］・→+＋%％¥￥]/gu,'');
    return remainder.length===0 && approvedHiraganaRuns(value);
  }
  function validDate(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const d=new Date(value+'T00:00:00Z');
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
  }
  const escapeRe=s=>s.replace(/[.*+?^$()|[\]{}]/g,'\\$&');
  function prepare(raw,leads,previousAliases){
    if(typeof raw!=='string'||!raw.trim()||raw.length>550)return deny('MESSAGE_INVALID');
    const original=raw.trim();
    if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(original))return deny('MESSAGE_INVALID');
    if(/[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+81|0)\d[\d\s-]{8,}|(?:電話番号|住所|口座番号|〒|パスワード|APIキー|秘密鍵|振込先)/iu.test(original))
      return deny('SENSITIVE_INPUT');
    if(!Array.isArray(leads))return deny('LOCAL_DATA_UNAVAILABLE');
    let message=original;
    const aliases=Object.assign(Object.create(null),previousAliases||{});
    let aliasIndex=Object.keys(aliases).length;
    const keyFor=name=>{
      for(const [key,value] of Object.entries(aliases))if(value===name)return key;
      if(aliasIndex>=8)return '';
      const key='顧客'+String.fromCharCode(65+aliasIndex++);
      aliases[key]=name;
      return key;
    };
    const replaceName=name=>{
      if(!name||name.length<2||name.length>60||!message.includes(name))return;
      const key=keyFor(name);
      if(!key)return;
      message=message.replace(new RegExp(escapeRe(name),'gu'),key);
    };
    const names=[...new Set(leads.flatMap(x=>{
      if(!x||typeof x!=='object')return[];
      return [x.name,x.customerName,x.company,x.contact]
        .filter(v=>typeof v==='string'&&v.trim().length>=2)
        .map(v=>v.trim());
    }))].sort((a,b)=>b.length-a.length);
    for(const name of names)replaceName(name);
    // A surname search such as 田中さん is a candidate lookup, never an
    // automatic identity match. Keep that surname locally behind the alias.
    for(const surname of new Set(names.filter(v=>v.length>=3).map(v=>v.slice(0,2)))){
      if(message.includes(surname+'さん')||message.includes(surname+'様'))replaceName(surname);
    }
    message=message.replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{2,12})(さん|様)/gu,
      (whole,name,suffix)=>{
        if(name.startsWith('顧客')&&/^顧客[A-H]$/.test(name))return whole;
        const key=keyFor(name);
        return key?key+suffix:whole;
      });
    if(/[\p{Script=Han}]{2,12}(?:さん|様)/u.test(message.replace(/顧客[A-H](?:さん|様)?/g,'')))
      return deny('SENSITIVE_INPUT');
    // If the alias limit is reached, never send leftover known names.
    if(names.some(name=>name.length>=3&&message.includes(name)))
      return deny('SENSITIVE_INPUT');
    if(/(?:https?:\/\/|www\.|@|(?:\d{2,4}-){2}\d{3,4})/i.test(message))
      return deny('SENSITIVE_INPUT');
    if(!approvedOutbound(message))return deny('UNAPPROVED_TEXT');
    return {ok:true,message,aliases};
  }
  function verify(response,aliases){
    if(!response||typeof response!=='object'||response.ok!==true||
       response.phase!=='chat_plan_only'||response.can_execute!==false||
       response.persisted!==false||response.customer_records_sent!==false)
      return deny('UNSAFE_CHAT_RESPONSE');
    const action=response.action;
    if(!allowed.includes(action)||typeof response.reply!=='string'||response.reply.length>800||
       typeof response.query!=='string'||response.query.length>100||
       typeof response.date!=='string'||response.date.length>10||
       typeof response.month!=='string'||response.month.length>7||
       !['none','estimate','invoice'].includes(response.docType)||
       typeof response.needs_confirmation!=='boolean')
      return deny('INVALID_CHAT_RESPONSE');
    if(action==='proposal'){
      if(!response.needs_confirmation)return deny('APPROVAL_REQUIRED');
      return {ok:true,action,reply:response.reply,request:null,proposal:true};
    }
    if(response.needs_confirmation)return deny('UNEXPECTED_APPROVAL');
    if(action==='none')return {ok:true,action,reply:response.reply,request:null};
    const date=response.date;
    if(['work.date','receivables.summary','profit.summary'].includes(action)&&!validDate(date))
      return deny('INVALID_DATE');
    if(action==='work.date')return {ok:true,action,reply:response.reply,request:{action,date,limit:10}};
    if(action==='receivables.summary'||action==='profit.summary')
      return {ok:true,action,reply:response.reply,request:{action,date}};
    if(action==='document.period'){
      if(!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(response.month)||response.docType==='none')
        return deny('INVALID_PERIOD');
      return {ok:true,action,reply:response.reply,request:{action,month:response.month,docType:response.docType,limit:10}};
    }
    if(!response.query.trim())return deny('QUERY_REQUIRED');
    let query=response.query.trim();
    const token=query.match(/^顧客[A-H]$/u);
    if(token){
      if(!Object.prototype.hasOwnProperty.call(aliases,query))return deny('UNKNOWN_CUSTOMER_ALIAS');
      query=aliases[query];
    }else if(['customer.search','customer.timeline','work.search'].includes(action)){
      return deny('UNKNOWN_CUSTOMER_ALIAS');
    }
    return {ok:true,action,reply:response.reply,request:{action,query,limit:10}};
  }
  /**
   * Summarize only start/end windows from an authenticated, read-only Google
   * calendar result. Never expose event titles, locations, IDs or customer data.
   * Google all-day end dates are exclusive, and a zero count is NOT a free-day
   * guarantee (other calendars and unsynced work orders may exist).
   */
  // The desktop's existing local Google READ worker may be used only when
  // the authenticated cloud Google service credential failed. Never bypass a
  // failed Budil user session, owner authorization or forbidden operation.
  function shouldUseLocalCalendarFallback(response){
    return !!(response&&response.ok===false&&
      ['secret_invalid','secret_not_configured','token_exchange_failed']
        .includes(response.code));
  }
  function summarizeCalendarRead(response,date){
    if(!validDate(date)||!response||response.ok!==true||
       response.readOnly!==true||response.calendarWritePerformed!==false||
       !Array.isArray(response.events)||response.events.length>1000)
      return deny('CALENDAR_READ_UNVERIFIED');
    const dayStart=Date.parse(date+'T00:00:00+09:00');
    const dayEnd=dayStart+86400000;
    const asMs=value=>{
      if(typeof value!=='string'||value.length>45)return NaN;
      if(validDate(value))return Date.parse(value+'T00:00:00+09:00');
      if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||
         !validDate(value.slice(0,10)))return NaN;
      return Date.parse(value);
    };
    const intervals=[];
    for(const event of response.events){
      if(!event||typeof event!=='object'||Array.isArray(event)||
         typeof event.start!=='string'||typeof event.end!=='string')
        return deny('CALENDAR_READ_INVALID');
      const start=asMs(event.start),end=asMs(event.end);
      if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)
        return deny('CALENDAR_READ_INVALID');
      if(start<dayEnd&&end>dayStart)
        intervals.push({start:Math.max(start,dayStart),end:Math.min(end,dayEnd)});
    }
    intervals.sort((a,b)=>a.start-b.start||a.end-b.end);
    const merged=[];
    for(const item of intervals){
      const last=merged[merged.length-1];
      if(last&&item.start<=last.end)last.end=Math.max(last.end,item.end);
      else merged.push({start:item.start,end:item.end});
    }
    const fmt=ms=>ms===dayEnd?'24:00':new Date(ms+9*3600000).toISOString().slice(11,16);
    const windows=Object.freeze(merged.slice(0,12).map(item=>
      Object.freeze({start:fmt(item.start),end:fmt(item.end)})));
    return Object.freeze({ok:true,date,source:response.source==='pc_local_calendar'?
      'pc_local_calendar':'active_google_calendar_binding',
      busyEventCount:response.events.length,busySlotCount:merged.length,
      windows,hasMore:merged.length>windows.length,confirmedFree:false,
      customerDataSent:false,writePerformed:false});
  }
  function safeHistory(history){
    if(!Array.isArray(history))return[];
    return history.filter(x=>x&&['user','assistant'].includes(x.role)&&
      typeof x.content==='string'&&x.content.length<=550)
      .slice(-8).map(x=>({role:x.role,content:x.content}));
  }
  return Object.freeze({prepare,verify,safeHistory,validDate,summarizeCalendarRead,approvedOutbound,
    shouldUseLocalCalendarFallback,actions:allowed});
})();
if(typeof module!=='undefined'&&module.exports)module.exports={BudilGptChat};
