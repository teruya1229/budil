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
  if(!result)return bad(422,"model_schema_invalid",origin);
  return reply(200,{ok:true,phase:"chat_plan_only",...result,can_execute:false,persisted:false,customer_records_sent:false},origin);
 }catch{return bad(503,"dependency_unavailable",origin)}
}};
