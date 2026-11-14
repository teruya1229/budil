/**
 * Disposable PostgreSQL connection-race proof: two independent SQL sessions.
 * First writes and holds a transaction. Second tries an overlapping booking.
 * Must not run against production.
 */
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
const tenant='11111111-1111-4111-8111-111111111111';
const owner='33333333-3333-4333-8333-333333333333';
const calendar='fictional-calendar@example.com';
function insert(id,order,request,start,end){
 return "INSERT INTO public.budil_calendar_write_slots "+
 "(id,tenant_id,owner_user_id,calendar_id,work_order_id,request_id,start_at,end_at) VALUES ('"+
 [id,tenant,owner,calendar,order,request,start,end].join("','")+"');";
}
const one=insert('00000000-0000-4000-8000-0000000000a1','work-order-race-one',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa0a1','2099-12-20T09:00:00+09:00',
 '2099-12-20T10:00:00+09:00');
const two=insert('00000000-0000-4000-8000-0000000000a2','work-order-race-two',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa0a2','2099-12-20T09:30:00+09:00',
 '2099-12-20T10:30:00+09:00');
function run(sql,{onData}={}){
 const proc=spawn('psql',['-X','-q','-v','ON_ERROR_STOP=1','-A','-t'],
  {stdio:['pipe','pipe','pipe']});
 let out='',err='';
 let settle;
 const result=new Promise(resolve=>settle=resolve);
 proc.stdout.on('data',b=>{const s=b.toString();out+=s;onData?.(s);});
 proc.stderr.on('data',b=>err+=b.toString());
 proc.on('close',(code,signal)=>settle({code,signal,out,err}));
 proc.on('error',e=>settle({code:-1,error:e.message,out,err}));
 proc.stdin.end(sql+'\n');
 return {result};
}
let mark;
const ready=new Promise(resolve=>mark=resolve);
const first=run('BEGIN;\n'+one+'\n\\echo FIRST_SLOT_ACQUIRED\nSELECT pg_sleep(3);\nCOMMIT;',
 {onData:s=>{if(s.includes('FIRST_SLOT_ACQUIRED'))mark();}});
const timeout=sleep(18000).then(()=>{throw Error('POSTGRES_RACE_TIMEOUT')});
await Promise.race([ready,first.result.then(x=>{throw Error('FIRST_FAILED_EARLY '+JSON.stringify(x));}),timeout]);
const second=run("SET statement_timeout='8000ms';\n"+two);
const results=await Promise.race([Promise.all([first.result,second.result]),timeout]);
const a=results[0],b=results[1];
assert.equal(a.code,0,'first slot must commit');
assert.notEqual(b.code,0,'overlapping second slot must fail');
assert.match(b.err,/exclusion constraint|conflicting key value violates exclusion constraint/i);
const verify=run("SELECT count(*) FROM public.budil_calendar_write_slots "+
 "WHERE tenant_id='"+tenant+"' AND calendar_id='"+calendar+"' "+
 "AND work_order_id IN ('work-order-race-one','work-order-race-two');");
const observed=await verify.result;
assert.equal(observed.code,0);
assert.equal(observed.out.trim(),'1','no second booking persisted');
console.log('BUDIL_CALENDAR_CONCURRENT_POSTGRES_SLOT PASS first=committed second=blocked');
