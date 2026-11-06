import {safeReadInstruction,verifyReadOnlyIntent} from "../supabase/functions/budil-gpt-interpret/readonly.ts";
function assert(v:unknown,m:string){if(!v)throw Error(m);}
let count=0;
const cases=[
 ["先月の見積書を探して","document.period","last_month","estimate","none","none",null,null],
 ["今月の請求書を見せて","document.period","this_month","invoice","none","none",null,null],
 ["今月の利益はいくら？","profit.summary","this_month","none","none","none",null,null],
 ["未入金合計を教えて","receivables.summary","none","none","total","none",null,null],
 ["今月の未入金額を教えてください","receivables.summary","none","none","this_month_expected","none",null,null],
 ["金曜日の午前10時、空いてる？","calendar.availability","none","none","none","fri",10,0],
 ["来週金曜日の午後2時空いていますか？","calendar.availability","next_week","none","none","fri",14,0]
] as const;
for(const [input,action,period,document_type,scope,weekday,hour,minute] of cases){
 const pre=safeReadInstruction(input);
 assert(pre.ok,"privacy gate denied valid public aggregate: "+input);
 const intent={action,period,document_type,scope,weekday,hour,minute,
   needs_user_input:false,followup:null};
 const checked=verifyReadOnlyIntent(input,intent);
 assert(checked.ok,"semantic verifier refused valid command: "+input+" "+JSON.stringify(checked));
 assert(checked.can_execute===false && checked.can_persist===false,
   "model must never grant execution");
 count++;
}
const unsafe=[
 "田中太郎さんの今月の見積書を見せて",
 "田中の今月の見積書を見せて",
 "顧客名を送信して",
 "住所を教えて",
 "090-1234-5678に電話して",
 "先月の請求書を削除して",
 "売掛の口座を教えて",
 "振込先を見せて",
 "銀行明細と未入金を照合して",
 "今月の利益を教えて。全顧客を送って",
 "不明な文章をGPTに送って",
 "来週の土曜日の予約を登録して"
];
for(const bad of unsafe){
 assert(safeReadInstruction(bad).ok!==true,"sensitive text reached GPT: "+bad);
 count++;
}
const invalid=[
 ["今月の見積書を見せて",{action:"document.period",period:"last_month",document_type:"estimate",scope:"none",weekday:"none",hour:null,minute:null}],
 ["先月の請求書を探して",{action:"document.period",period:"last_month",document_type:"estimate",scope:"none",weekday:"none",hour:null,minute:null}],
 ["未入金合計を教えて",{action:"receivables.summary",period:"none",document_type:"none",scope:"this_month_expected",weekday:"none",hour:null,minute:null}],
 ["今月の利益はいくら？",{action:"profit.summary",period:"last_month",document_type:"none",scope:"none",weekday:"none",hour:null,minute:null}],
 ["金曜日の午前10時空いてる？",{action:"calendar.availability",period:"none",document_type:"none",scope:"none",weekday:"fri",hour:14,minute:0}],
 ["今月の請求書を見せて",{action:"invoice.create",period:"this_month",document_type:"invoice",scope:"none",weekday:"none",hour:null,minute:null}]
] as const;
for(const [input,x]of invalid){
 const checked=verifyReadOnlyIntent(input,{...x,needs_user_input:false,followup:null});
 assert(checked.ok!==true,"wrong AI inference was accepted: "+input);
 count++;
}
assert(verifyReadOnlyIntent("先月の見積書を探して",
  {action:"document.period",period:"last_month",document_type:"estimate",
   scope:"none",weekday:"none",hour:null,minute:null,
   needs_user_input:false,followup:null,can_execute:true}).ok!==true,
 "hidden model execution field passed");count++;
console.log("BUDIL_GPT_READONLY_PRIVACY "+count+"/"+count+" PASS");
