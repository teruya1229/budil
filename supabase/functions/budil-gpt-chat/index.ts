/**
 * Budil GPT conversation gateway — no business execution.
 * Uses the existing authenticated tenant boundary and a separate default-OFF
 * enable flag. Never returns local records or issues calendar writes.
 */
import { createSupabaseContext } from "npm:@supabase/server@1.3.0";

const ORIGINS=new Set(["https://teruya1229.github.io","http://localhost:5500","http://127.0.0.1:5500","http://localhost:8765","http://127.0.0.1:8765"]);
const ACTIONS=["none","work.date","work.search","customer.search","customer.timeline","document.period","document.search","receivables.summary","profit.summary","proposal"] as const;
const MAX_BYTES=6000;
function reply(status:number,data:Record<string,unknown>,origin:string|null){
  const h:Record<string,string>={"Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin"};
  if(origin&&ORIGINS.has(origin)){h["Access-Control-Allow-Origin"]=origin;h["Access-Control-Allow-Headers"]="authorization,apikey,content-type,x-client-info";h["Access-Control-Allow-Methods"]="GET,POST,OPTIONS";}
  return new Response(JSON.stringify(data),{status,headers:h});
}
const bad=(status:number,code:string,origin:string|null)=>reply(status,{ok:false,code},origin);
function isObj(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==="object"&&!Array.isArray(v)}
function validDate(v:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+"T00:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v}
function sanitizeText(v:unknown,max=500){
  if(typeof v!=="string"||!v.trim()||v.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v))return "";
  return v.trim();
}
// Defense in depth: a forged browser request cannot bypass the outbound privacy gate.
  const APPROVED_OUTBOUND_TERMS=Object.freeze(["ありがとうございます","ハウスクリーニング","かしこまりました","Google","ありがとうね","お願いします","クリーニング","してください","スケジュール","どうなってる","Budil","ありがとう","カレンダー","くださいね","こんにちは","こんばんは","してほしい","すみません","できますか","どれくらい","パソコン用","埋まってる","教わりたい","空いている","LINE","あさって","いします","エアコン","おしえて","おつかれ","おねがい","おはよう","ください","クラウド","サーバー","だったら","チャット","できない","できます","できれば","でしたら","どうして","ドラム式","について","のちほど","パソコン","パターン","ましたら","よろしく","リセット","ローカル","作業内容","作業履歴","使いたい","割り引き","取り付け","取り消し","完全分解","対応可能","日時指定","現場情報","現場環境","申し込み","登録して","登録済み","知ってる","知りたい","確かめて","空いてる","見積もり","試したい","読み取り","間違って","BFC","GPT","PDF","あした","いくら","いてる","エラー","お客様","お願い","くらい","シート","したい","してる","しない","じゃあ","スマホ","タイプ","データ","できた","できる","でした","テスト","どうも","どちら","どんな","なんで","ほしい","ました","やって","ライン","リスト","わかる","一昨日","下さい","乾燥機","予定日","今すぐ","今まで","今年度","今日中","作って","元請け","入れて","出して","分かる","午前中","午後中","取引先","土曜日","変えて","大丈夫","室外機","家庭用","担当者","探して","換気扇","支払い","教えて","日曜日","明後日","昨年度","時間帯","時間枠","月曜日","木曜日","未入金","本当に","業務用","欲しい","正しい","水曜日","洗濯機","消費税","火曜日","直して","確認中","納品書","行ける","見せて","見たい","見積書","調べて","請求書","送って","金曜日","間違い","非対応","領収書","AI","PC","あの","ある","あれ","いつ","いて","いる","えて","かな","かも","から","こと","この","これ","さま","さん","した","して","せて","その","それ","だけ","って","です","でも","どう","どこ","どの","どれ","ない","なぜ","なに","なら","ねぇ","ねえ","ほど","ます","まだ","まで","メモ","もう","もの","やる","より","一回","一度","一覧","不明","不要","不足","中止","予定","予約","二回","二度","交換","今年","今度","今後","今日","今月","今週","以前","以降","件数","会社","会話","何人","何件","何円","何分","何台","何日","何時","作成","作業","保存","修正","修理","値段","先日","先月","先生","先週","入力","入金","全件","全体","全部","内容","内訳","冷房","出力","分解","利益","削除","前回","前後","割引","午前","午後","印刷","原価","原因","厨房","去年","収益","取付","取消","台所","台数","合計","名前","品目","問題","回答","土曜","型番","売上","変更","夕方","安全","完了","室内","家電","対応","少し","履歴","工事","平日","年月","年次","建物","建築","当日","後日","御中","復元","必要","担当","掃除","提案","撤去","支払","教え","数量","料金","新規","施工","日付","日時","日曜","日程","明日","昨日","時刻","時間","暖房","曜日","更新","書込","最初","最後","月曜","月次","期間","木曜","本日","来年","来月","来週","案件","検品","検索","検証","業務","業者","概要","機種","次回","毎年","毎日","毎月","毎週","氏名","水曜","洗浄","活動","浴室","清掃","火曜","照会","照明","状態","現場","理由","環境","申請","申込","発行","登録","相談","確定","確認","祝日","移動","税別","税抜","税込","種類","空き","空調","粗利","納期","終了","経費","結果","継続","縦型","翌日","表示","見積","訂正","計算","記録","訪問","設置","試験","詳細","認証","説明","読取","調査","請求","費用","質問","返信","追加","送信","通常","連絡","過去","違う","部屋","配線","重複","金曜","金額","開始","集計","電気","顧客","、","！","？","。","い","お","か","が","さ","だ","で","と","に","ね","の","は","へ","も","や","よ","を","ん","一","七","万","三","九","二","五","人","件","何","個","先","八","六","円","分","前","十","千","台","四","夜","年","床","後","日","昼","時","月","朝","本","様","次","氏","百","秒","空","窓","願"]);
  function approvedHiraganaRuns(value:string){
    const safeMulti=APPROVED_OUTBOUND_TERMS.filter(x=>/^[ぁ-ん]{2,}$/u.test(x));
    for(const run of value.match(/[ぁ-ん]{2,}/gu)||[]){
      let rest=run;
      for(const word of safeMulti)rest=rest.split(word).join('');
      if(rest && !/^[のはがをにでともへやか]$/u.test(rest))return false;
    }
    return true;
  }
  function approvedOutbound(value:unknown){
    if(typeof value!=='string'||!value.trim()||value.length>550)return false;
    let remainder=value.replace(/顧客[A-H](?:さん|様)?/gu,'');
    for(const word of APPROVED_OUTBOUND_TERMS)remainder=remainder.split(word).join('');
    remainder=remainder.replace(/[0-9０-９\s.,、。!?！？:：\-‐‑–〜～\/／()（）「」『』【】\[\]{}［］・→+＋%％¥￥]/gu,'');
    return remainder.length===0 && approvedHiraganaRuns(value);
  }
const SCHEMA={
 type:"object",additionalProperties:false,required:["reply","action","query","date","month","docType","needs_confirmation"],
 properties:{
  reply:{type:"string"},action:{type:"string",enum:ACTIONS},
  query:{type:"string"},date:{type:"string"},month:{type:"string"},
  docType:{type:"string",enum:["none","estimate","invoice"]},
  needs_confirmation:{type:"boolean"}
 }
};
function contentOf(json:unknown):string{
 if(!isObj(json)||!Array.isArray(json.output))return "";
 const output:string[]=[];
 for(const item of json.output){
  if(!isObj(item)||item.type!=="message"||!Array.isArray(item.content))continue;
  for(const p of item.content)if(isObj(p)&&p.type==="output_text"&&typeof p.text==="string")output.push(p.text);
 }
 return output.join("");
}
function validateOutput(v:unknown){
 if(!isObj(v)||Object.keys(v).sort().join(",")!=="action,date,docType,month,needs_confirmation,query,reply")return null;
 const action=v.action, date=v.date,month=v.month,query=v.query,docType=v.docType;
 if(typeof action!=="string"||!ACTIONS.includes(action as typeof ACTIONS[number])||
    typeof v.reply!=="string"||v.reply.length>800||
    typeof query!=="string"||query.length>100||
    typeof date!=="string"||date.length>10||
    typeof month!=="string"||month.length>7||
    (date!==""&&!validDate(date))||(month!==""&&!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month))||
    !["none","estimate","invoice"].includes(String(docType))||
    typeof v.needs_confirmation!=="boolean")return null;
 if(action==="work.date"&&!validDate(date))return null;
 if(action==="document.period"&&(!month||docType==="none"))return null;
 if(["work.search","customer.search","customer.timeline","document.search"].includes(action)&&!query)return null;
 if(action==="proposal"&&v.needs_confirmation!==true)return null;
 if(action!=="proposal"&&v.needs_confirmation===true)return null;
 return {reply:v.reply,action,query,date,month,docType,needs_confirmation:v.needs_confirmation};
}
/**
 * The provider's strict JSON schema cannot express all cross-field business
 * invariants. If the model violates one, do NOT run a tool, approve a write,
 * or bill a second provider request: ask the owner to clarify safely.
 */
function safeModelClarification(v:unknown):string{
 const action=isObj(v)&&typeof v.action==="string"?v.action:"";
 if(action==="work.date")return "予定を確認する日付が確定できませんでした。何月何日の予定か教えてください。";
 if(action==="document.period")return "帳票の対象年月と、見積書・請求書のどちらかを教えてください。まだ取得していません。";
 if(["work.search","customer.search","customer.timeline","document.search"].includes(action))
  return "検索する顧客・作業・帳票の条件をもう少し具体的に教えてください。まだ取得していません。";
 if(action==="proposal")return "登録・変更・送信・確定は行っていません。実施したい内容を確認させてください。";
 return "内容を安全に判定できませんでした。日付や対象をもう少し具体的に入力してください。データは変更していません。";
}
export default {async fetch(request:Request):Promise<Response>{
 const origin=request.headers.get("Origin");
 if(origin&&!ORIGINS.has(origin))return bad(403,"origin_not_allowed",null);
 if(request.method==="OPTIONS"){
  if(!origin)return bad(403,"origin_required",null);
  return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Vary":"Origin"}});
 }
 if(!["GET","POST"].includes(request.method))return bad(405,"method_not_allowed",origin);
 try{
  const {data:ctx,error:authError}=await createSupabaseContext(request,{auth:"user"});
  if(authError||!ctx?.userClaims?.id)return bad(401,"unauthorized",origin);
  const userId=ctx.userClaims.id;
  const admin=ctx.supabaseAdmin as any;
  const {data:memberships,error:membershipError}=await admin.from("tenant_memberships").select("tenant_id,role").eq("user_id",userId).eq("status","active").limit(2);
  if(membershipError)return bad(503,"membership_unavailable",origin);
  if(!Array.isArray(memberships)||memberships.length!==1)return bad(403,"active_membership_required",origin);
  const {data:tenant,error:tenantError}=await admin.from("tenants").select("id,code").eq("id",memberships[0].tenant_id).eq("status","active").maybeSingle();
  if(tenantError||!tenant?.id)return bad(403,"active_tenant_required",origin);
  // Owner-only pilot for the sole verified real Budil tenant. The other
  // two active AI-bantou E2E tenants remain excluded, even if an
  // environment-wide GPT flag was previously enabled.
  // An explicit "false" remains an emergency kill switch.
  const ownerPilot=tenant.code==="mi-bcs"&&memberships[0].role==="owner";
  const enabled=ownerPilot&&Deno.env.get("BUDIL_GPT_CHAT_ENABLED")!=="false";
  const key=Deno.env.get("OPENAI_API_KEY");
  const model=Deno.env.get("BUDIL_GPT_MODEL")||"gpt-4.1-mini";
  const supported=["gpt-4.1-mini","gpt-5-mini"].includes(model);
  if(request.method==="GET")return reply(200,{ok:true,enabled,key_configured:Boolean(key),model_supported:supported,ready:enabled&&Boolean(key)&&supported,external_request_sent:false},origin);
  if(!enabled)return bad(503,"chat_disabled",origin);
  if(!key)return bad(503,"gpt_key_not_configured",origin);
  if(!supported)return bad(503,"model_not_supported",origin);
  const raw=await request.text();
  if(new TextEncoder().encode(raw).length>MAX_BYTES)return bad(413,"request_too_large",origin);
  let payload:unknown;
  try{payload=JSON.parse(raw)}catch{return bad(400,"invalid_json",origin)}
  if(!isObj(payload)||Object.keys(payload).sort().join(",")!=="history,message,today")return bad(400,"invalid_request",origin);
  const msg=sanitizeText(payload.message,550);
  const today=payload.today;
  if(!msg||typeof today!=="string"||!validDate(today))return bad(400,"input_invalid",origin);
  if(!Array.isArray(payload.history)||payload.history.length>8)return bad(400,"history_invalid",origin);
  const history:{role:"user"|"assistant";content:string}[]=[];
  for(const h of payload.history){
   if(!isObj(h)||(h.role!=="user"&&h.role!=="assistant")||!sanitizeText(h.content,550))
     return bad(400,"history_invalid",origin);
   history.push({role:h.role,content:(h.content as string).trim()});
  }
  // The browser must anonymize customer names. Reject high-risk raw tokens here too.
  for(const item of [msg,...history.map(h=>h.content)]){
   if(/[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+81|0)\d[\d\s-]{8,}|(?:住所|電話番号|口座番号|〒|パスワード|APIキー|秘密鍵|振込先)/iu.test(item))
     return bad(400,"sensitive_input_rejected",origin);
   // Block unmasked honorific names even when the browser privacy guard fails.
   const withoutAliases=item.replace(/顧客[A-H](?:さん|様)?|お客様/g,"");
   if(/[一-龯々]{2,10}(?:さん|様)/u.test(withoutAliases))
     return bad(400,"unmasked_customer_rejected",origin);
  }
  // Client screening is never trusted. Reject unknown names or notes before
  // consuming the tenant's paid GPT budget.
  if(!approvedOutbound(msg)||history.some(h=>h.role==="user"&&!approvedOutbound(h.content)))
   return bad(400,"unapproved_text",origin);
  const minute=new Date();minute.setUTCSeconds(0,0);
  const {data:count,error:rateError}=await admin.rpc("try_consume_tenant_operation_rate_limit",{
   p_tenant_id:tenant.id,p_user_id:userId,p_operation:"budil.gpt.chat.v1",
   p_window_start:minute.toISOString(),p_max_requests:3
  });
  if(rateError)return bad(503,"rate_limit_unavailable",origin);
  if(count===null)return bad(429,"rate_limit_exceeded",origin);
  if(!Number.isInteger(Number(count))||Number(count)<1||Number(count)>3)
   return bad(503,"rate_limit_unverifiable",origin);
  // A separate tenant/user daily budget avoids unattended cost growth.
  const dayStart=new Date();dayStart.setUTCHours(0,0,0,0);
  const {data:dailyCount,error:dailyError}=await admin.rpc("try_consume_tenant_operation_rate_limit",{
   p_tenant_id:tenant.id,p_user_id:userId,p_operation:"budil.gpt.chat.v1.daily",
   p_window_start:dayStart.toISOString(),p_max_requests:60
  });
  if(dailyError)return bad(503,"daily_limit_unavailable",origin);
  if(dailyCount===null)return bad(429,"daily_limit_exceeded",origin);
  if(!Number.isInteger(Number(dailyCount))||Number(dailyCount)<1||Number(dailyCount)>60)
   return bad(503,"daily_limit_unverifiable",origin);
  const instructions=[
   "あなたはBCサービスのBudil内で働く日本語GPT業務アシスタント。",
   "ユーザーと自然に会話し、あいまいな意図は追加質問する。応答は簡潔で実用的に。",
   "Budilに接続できる読取アクション: work.date, work.search, customer.search, customer.timeline, document.period, document.search, receivables.summary, profit.summary。",
   "端末の実データを見る権限はあなたにない。データを見たと主張しない。実行結果はブラウザが別途取得する。",
   "予定日は現在日付を基準に判断する。ただし月日や年があいまいな場合は質問し、勝手に確定しない。",
   "登録、予約、変更、削除、請求確定など書込指示はaction=proposal,needs_confirmation=trueで安全な確認提案のみ。実行できないと明記する。",
   "顧客名のプレースホルダー（顧客A等）はそのままqueryに残す。個人名を推測しない。",
   "work.dateはYYYY-MM-DDの日付が確定している場合だけ。receivables.summaryとprofit.summaryはdateに当日日付を入れる。",
   "document.periodはYYYY-MMとestimateまたはinvoiceを設定する。",
   "Action none は通常の自由な会話と質問に使う。回答不能な場合は理由を具体的に。",
   "出力は厳格なJSONスキーマに一致させ、操作の承認は絶対に捏造しない。",
   "needs_confirmation=trueはaction=proposalの場合だけ。それ以外は必ずfalse。操作に必要な情報が欠けるときはaction=noneで追加質問する。",
   "work.dateは実在するYYYY-MM-DDの日付を指定する。検索アクションはqueryを空にしない。document.periodは有効なYYYY-MMとestimateかinvoiceが必須。",
   "現在の日本時間の日付: "+today
  ].join("\n");
  const messages=[...history,{role:"user" as const,content:msg}];
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),18000);
  let response:Response;
  try{
   response=await fetch("https://api.openai.com/v1/responses",{method:"POST",
    headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify({model,instructions,input:messages,max_output_tokens:360,store:false,
     text:{format:{type:"json_schema",name:"budil_chat_v1",strict:true,schema:SCHEMA}}}),
    signal:controller.signal});
  }catch{return bad(503,"provider_unavailable",origin)}finally{clearTimeout(timer)}
  if(!response.ok)return bad(503,"provider_rejected",origin);
  let json:unknown;try{json=await response.json()}catch{return bad(502,"provider_invalid_json",origin)}
  const content=contentOf(json);
  if(!content||content.length>2500)return bad(502,"provider_output_invalid",origin);
  let parsed:unknown;try{parsed=JSON.parse(content)}catch{return bad(502,"model_json_invalid",origin)}
  const result=validateOutput(parsed);
  if(!result){
   return reply(200,{ok:true,phase:"chat_plan_only",reply:safeModelClarification(parsed),
    action:"none",query:"",date:"",month:"",docType:"none",
    needs_confirmation:false,can_execute:false,persisted:false,
    customer_records_sent:false,clarification_required:true},origin);
  }
  return reply(200,{ok:true,phase:"chat_plan_only",...result,can_execute:false,persisted:false,customer_records_sent:false},origin);
 }catch{return bad(503,"dependency_unavailable",origin)}
}};
