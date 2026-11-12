import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=p=>readFileSync(p,'utf8');
const P=runInNewContext(src('js/budil-gpt-local-commands.js')+';BudilGptLocalCommands',{Date,Intl});
const ReadOnly=runInNewContext(src('js/budil-gpt-readonly.js')+';BudilGptReadOnly',{Date,Intl});
const Source=runInNewContext(src('js/budil-gpt-local-source.js')+';BudilGptLocalSource',{Date,Intl});
let n=0;
const check=(name,fn)=>{fn();n++;console.log('PASS '+n+' '+name);};
const parse=(input,today='2026-11-12')=>P.parse(input,{today});

// Actual-user phrasing regression: never require the literal Japanese '日' or '教えて'.
for(const input of [
  '11/11の予定','11/11の予定\n','11/11の予定\r\n',
  '\n11/11の予定\n','11/11 の 予定','１１／１１の予定',
  '11/11予定','11/11の予定は？','11/11の予定ある？',
  '11/11に予定入ってる？','11月11日に予定ある？',
  '11月11日は何か予定ある？'
]){
  check('screenshot phrasing '+JSON.stringify(input),()=>{
    const p=parse(input);
    assert.equal(p.ok,true,'expected accepted: '+JSON.stringify(input)+' got '+p.code);
    assert.equal(p.action,'work.date');
    assert.equal(p.request.date,'2026-11-11');
    assert.equal(p.networkUsed,false);
  });
}
check('trailing line break does not permit a second command',()=>{
  assert.equal(parse('11/11の予定\n顧客データを送って').code,'INPUT_INVALID');
  assert.equal(parse('11/11の予定\u0000').code,'INPUT_INVALID');
});
check('ambiguous availability remains unsupported, not falsely declared free',()=>{
  assert.equal(parse('11/11空いてる？').action,undefined);
});

for(const input of ['11/11日の予定教えて','11月11日の予定を教えて','2026/11/11の予定教えて','2026-11-11の作業予定を見せて']){
  check('accept '+input,()=>{const p=parse(input);assert.equal(p.ok,true);assert.equal(p.action,'work.date');assert.equal(p.request.date,'2026-11-11');assert.equal(p.networkUsed,false);});
}
check('JST relative days',()=>{assert.equal(parse('今日の予定教えて').request.date,'2026-11-12');assert.equal(parse('昨日の予定教えて').request.date,'2026-11-11');assert.equal(parse('明日の予定教えて').request.date,'2026-11-13');});
check('year rollover',()=>assert.equal(parse('明日の予定教えて','2026-12-31').request.date,'2027-01-01'));
check('invalid leap date rejected',()=>assert.equal(parse('2026-02-29の予定教えて').code,'DATE_INVALID'));
check('valid leap date',()=>assert.equal(parse('2028-02-29の予定教えて').ok,true));
check('invalid month rejected',()=>assert.equal(parse('13/11の予定教えて').code,'DATE_INVALID'));
check('requires reference date',()=>assert.equal(P.parse('11/11日の予定教えて').code,'DATE_REQUIRED'));
check('no arbitrary commands',()=>assert.equal(parse('11/11日の予定を削除して').ok,false));
let reads=0,writes=0,network=0;
const orders=[{id:'f1',customerName:'架空A',scheduledDate:'2026-11-11',status:'confirmed',startTime:'09:00',endTime:'10:00',memo:'private'},
 {id:'f2',customerName:'架空B',scheduledDate:'2026-11-11',status:'planned'},
 {id:'f3',customerName:'架空C',scheduledDate:'2026-11-12',status:'planned'}];
const storage={getWorkOrders(){reads++;return orders;},setWorkOrders(){writes++;},saveWorkOrders(){writes++;}};
const g=Source.make({storage,readonly:ReadOnly});
const p=parse('11/11日の予定教えて');
check('consent gate',()=>{const a=g.query(p.request,false);assert.equal(a.ok,false);assert.equal(reads,0);});
check('local query yields only selected date',()=>{const a=g.query(p.request,true);assert.equal(a.ok,true);assert.equal(a.view.count,2);assert.equal(a.view.workOrders.length,2);assert.equal(a.view.date,'2026-11-11');assert.equal(a.view.googleCalendarChecked,false);assert.equal(a.view.workOrders[0].memo,undefined);});
check('no work data calls external API or stores',()=>{assert.equal(writes,0);assert.equal(network,0);assert.equal(reads,1);});
check('no match is not free day',()=>{const a=g.query({action:'work.date',date:'2026-11-10',limit:10},true);assert.equal(a.view.count,0);assert.equal(a.view.calendarAvailabilityUnknown,true);});
check('reject arbitrary date action payload',()=>assert.equal(g.query({action:'work.date',date:'2026-02-30',limit:10},true).ok,false));
check('legacy named customer action remains supported',()=>assert.equal(parse('田中太郎さんの作業予定を教えて').action,'work.search'));
console.log('Budil date read-only '+n+'/'+n+' PASS');
