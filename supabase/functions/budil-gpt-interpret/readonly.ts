/** Pure privacy gate and post-model verification for PII-free read requests. */
export const READ_ONLY_ACTIONS=[
  "document.period","receivables.summary","profit.summary",
  "calendar.availability","unsupported"
] as const;
export const READ_ONLY_SCHEMA={
  type:"object",
  additionalProperties:false,
  required:["action","period","document_type","scope","weekday",
    "hour","minute","needs_user_input","followup"],
  properties:{
    action:{type:"string",enum:[...READ_ONLY_ACTIONS]},
    period:{type:"string",enum:["none","this_month","last_month","this_week","next_week"]},
    document_type:{type:"string",enum:["none","estimate","invoice"]},
    scope:{type:"string",enum:["none","total","this_month_expected"]},
    weekday:{type:"string",enum:["none","mon","tue","wed","thu","fri","sat","sun"]},
    hour:{type:["integer","null"]},
    minute:{type:["integer","null"]},
    needs_user_input:{type:"boolean"},
    followup:{type:["string","null"]}
  }
};
type Obj=Record<string,unknown>;
function isObj(v:unknown):v is Obj{
  return !!v && typeof v==="object" && !Array.isArray(v);
}
const deny=(code:string)=>({ok:false,code});
export function safeReadInstruction(raw:unknown){
  if(typeof raw!=="string"||raw.length<2||raw.length>180)return deny("read_input_invalid");
  const text=raw.trim();
  if(!text||/[^一-龯々ぁ-んァ-ヶー０-９0-9　\s。、？！!?、・：:〜～\/\-]/u.test(text))
    return deny("read_input_invalid");
  if(/[\x00-\x1f]/.test(text)||/さん|様|御中|顧客名|氏名|住所|電話|メール|口座|〒|秘密|メモ|銀行明細|削除|変更|登録|送信|発行|入金済|支払い|支払済|振込先/.test(text))
    return deny("read_input_sensitive_or_write");
  // No arbitrary paragraphs, instructions or person names.
  if(/[。\n]/.test(text)&&/[。]/.test(text.slice(0,-1)))
    return deny("read_multiple_instructions");
  const flat=text.replace(/[　\\s]/g,"").replace(/[。？！!?]+$/u,"");
  // Only bounded non-identifying business aggregates and bare weekday/time
  // requests may go to GPT. This is deliberately NOT a generic privacy
  // redactor: unknown sentences fail closed before any billable request.
  const monthDocs=/^(?:今月|先月)の(?:見積書|請求書)(?:の?一覧|の?件数)?(?:を)?(?:教えて|見せて|探して|検索して|確認して|表示して|教えてください|見せてください|検索してください|表示してください|確認したい)?$/u;
  const unpaid=/^(?:今月の|現在の)?(?:未入金|売掛)(?:合計|の合計|額|金額|の金額)?(?:(?:を)(?:教えて|見せて|確認して|教えてください|確認したい)|(?:はいくら(?:ですか)?))?$/u;
  const profit=/^今月の利益(?:はいくら(?:ですか)?|(?:を)(?:教えて|見せて|確認して|教えてください|確認したい))?$/u;
  const availability=/^(?:今週|来週)?(?:の)?[月火水木金土日]曜(?:日)?の?(?:午前|午後)?[０-９0-9]{1,2}時(?:[０-９0-9]{1,2}分)?(?:、)?(?:空いてる|空いていますか|空きある|空きはありますか|予約できる|予約可能ですか)?$/u;
  if(![monthDocs,unpaid,profit,availability].some(re=>re.test(flat)))
    return deny("read_topic_not_allowlisted");
  return {ok:true,input:text};
}
const dayCodes=["mon","tue","wed","thu","fri","sat","sun"];
const dayChars=["月","火","水","木","金","土","日"];
const punct=(v:unknown):string=>typeof v==="string"&&v.length<=100?v:"";
function explicitClock(text:string){
  const normalized=text.replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0));
  const day=normalized.match(/(月|火|水|木|金|土|日)曜(?:日)?/);
  const tm=normalized.match(/(午前|午後)?\s*(\d{1,2})時(?:(\d{1,2})分)?/);
  if(!day||!tm)return null;
  let hour=Number(tm[2]),minute=tm[3]?Number(tm[3]):0;
  if(hour>23||minute>59)return null;
  if(tm[1]==="午後"&&hour>=1&&hour<=11)hour+=12;
  if(tm[1]==="午前"&&hour===12)hour=0;
  return {weekday:dayCodes[dayChars.indexOf(day[1])],hour,minute};
}
export function verifyReadOnlyIntent(input:unknown,model:unknown){
  const pre=safeReadInstruction(input);
  if(!pre.ok||!pre.input)return pre;
  if(!isObj(model)||Object.keys(model).some(k=>
    !["action","period","document_type","scope","weekday","hour",
      "minute","needs_user_input","followup"].includes(k)))
    return deny("read_model_shape_invalid");
  const a=model.action;
  if(typeof a!=="string"||!READ_ONLY_ACTIONS.includes(a as typeof READ_ONLY_ACTIONS[number]))
    return deny("read_action_forbidden");
  const period=model.period,doc=model.document_type,scope=model.scope;
  const weekday=model.weekday;
  if(typeof period!=="string"||!READ_ONLY_SCHEMA.properties.period.enum.includes(period)||
    typeof doc!=="string"||!READ_ONLY_SCHEMA.properties.document_type.enum.includes(doc)||
    typeof scope!=="string"||!READ_ONLY_SCHEMA.properties.scope.enum.includes(scope)||
    typeof weekday!=="string"||!READ_ONLY_SCHEMA.properties.weekday.enum.includes(weekday)||
    (model.hour!==null&&(!Number.isInteger(model.hour)||Number(model.hour)<0||Number(model.hour)>23))||
    (model.minute!==null&&(!Number.isInteger(model.minute)||Number(model.minute)<0||Number(model.minute)>59))||
    typeof model.needs_user_input!=="boolean" ||
    !(model.followup===null||typeof model.followup==="string"))
    return deny("read_model_shape_invalid");
  const text=pre.input;
  if(a==="document.period"){
    const expectedPeriod=/先月/.test(text)?"last_month":/今月/.test(text)?"this_month":null;
    const expectedDoc=/見積書/.test(text)?"estimate":/請求書/.test(text)?"invoice":null;
    if(!expectedPeriod||!expectedDoc||period!==expectedPeriod||doc!==expectedDoc ||
      scope!=="none"||weekday!=="none"||model.hour!==null||model.minute!==null)
      return deny("read_document_mismatch");
  }else if(a==="receivables.summary"){
    const expected=/今月/.test(text)?"this_month_expected":"total";
    if(!/未入金|売掛/.test(text)||scope!==expected||period!=="none"||
      doc!=="none"||weekday!=="none"||model.hour!==null||model.minute!==null)
      return deny("read_receivables_mismatch");
  }else if(a==="profit.summary"){
    if(!/今月/.test(text)||!/利益/.test(text)||scope!=="none"||
      period!=="this_month"||doc!=="none"||weekday!=="none"||
      model.hour!==null||model.minute!==null)
      return deny("read_profit_mismatch");
  }else if(a==="calendar.availability"){
    const tm=explicitClock(text);
    const week=/来週/.test(text)?"next_week":/今週/.test(text)?"this_week":"none";
    if(!tm||weekday!==tm.weekday||model.hour!==tm.hour||
      model.minute!==tm.minute||doc!=="none"||scope!=="none"||period!==week)
      return deny("read_calendar_mismatch");
  }else {
    // Unsupported cannot return executable fields.
    if(doc!=="none"||scope!=="none"||weekday!=="none"||
      model.hour!==null||model.minute!==null)
      return deny("read_unsupported_shape_invalid");
  }
  return {ok:true,action:a,period,document_type:doc,scope,weekday,
    hour:model.hour,minute:model.minute,
    needs_user_input:Boolean(model.needs_user_input||a==="unsupported"),
    followup:punct(model.followup),
    can_execute:false,can_persist:false,has_private_data:false};
}
