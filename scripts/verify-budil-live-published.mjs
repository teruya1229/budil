/**
 * Public GitHub Pages release gate. No credentials, accounts or writes.
 * Queries only expected static paths and waits for Pages cache propagation.
 */
import assert from 'node:assert/strict';

const origin='https://teruya1229.github.io/budil/';
const fingerprint=String(process.env.GITHUB_SHA||'').slice(0,12);
const pages=[
  {path:'',label:'Budil index',markers:['id="budil-gpt-open"','js/budil-gpt-offline-ui.js?v=20261108history1']},
  {path:'js/budil-gpt-offline-ui.js',label:'GPT UI',markers:["customer.timeline.detail","googleReadTarget"]},
  {path:'js/budil-cloud.js',label:'Authenticated calendar bridge',markers:['function fetchScheduleBlocks','schedule_blocks_list']},
  {path:'calendar-read-test.html',label:'Read-only test page',markers:['calendar-check-controller','read-consent','09:00〜09:15']},
];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function inspect(page,iteration){
  const url=origin+page.path+'?verify='+encodeURIComponent(fingerprint||'main')+'-'+iteration;
  const response=await fetch(url,{headers:{'Cache-Control':'no-cache','Accept':'text/html,application/javascript,*/*'},
    signal:AbortSignal.timeout(15000),redirect:'follow'});
  if(response.status!==200)return {ok:false,label:page.label,status:response.status,missing:[]};
  const content=await response.text();
  const missing=page.markers.filter(m=>!content.includes(m));
  return {ok:!missing.length,label:page.label,status:response.status,missing,bytes:content.length};
}
let details=[];
for(let attempt=1;attempt<=24;attempt++){
  try{
    details=await Promise.all(pages.map(p=>inspect(p,attempt)));
    if(details.every(x=>x.ok))break;
  }catch(error){
    details=[{ok:false,label:'network',status:'network_error',error:error instanceof Error?error.name:'UNKNOWN'}];
  }
  if(attempt<24)await delay(10000);
}
for(const x of details)console.log(JSON.stringify(x));
assert.equal(details.length,pages.length,'all live public files reachable');
assert.ok(details.every(x=>x.ok),'main public release content must include latest GPT and test page');
console.log('BUDIL_LIVE_PUBLIC_PAGES_PASS '+pages.length+' files');
