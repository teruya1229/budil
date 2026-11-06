/** Isolated checks for the no-cost authenticated Budil GPT readiness probe. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('js/budil-cloud.js','utf8');
const html=readFileSync('index.html','utf8');
const ui=readFileSync('js/budil-gpt-offline-ui.js','utf8');
let count=0;
async function check(label,fn){await fn();count++;console.log('PASS '+label);}
function create(host='teruya1229.github.io',{loggedIn=true,status=200,body}={}){
  let calls=[];
  const store=new Map();
  if(loggedIn)store.set('budil-cloud.auth.v1.session',JSON.stringify({
    access_token:'fixture-access-only',refresh_token:'fixture-refresh-only',
    env:'production',expires_at:Math.floor(Date.now()/1000)+3600
  }));
  const ctx={window:null,URL,TextEncoder,Date,Math,JSON,Promise,
    location:{hostname:host},
    sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),
      removeItem:k=>store.delete(k)},
    fetch:async (url,init)=>{
      calls.push({url,init});
      return {status,text:async()=>JSON.stringify(body===undefined?{
        ok:true,phase:'readiness_only',enabled:false,key_configured:true,
        model_supported:true,ready:false,anonymized_ready:false,
        external_request_sent:false,persisted:false
      }:body)};
    },
    AbortController,setTimeout,clearTimeout
  };
  ctx.window=ctx;vm.runInNewContext(source,ctx);
  return {cloud:ctx.BudilCloud,calls,store};
}
await check('no eager network when loading the cloud client',async()=>{
  const {cloud,calls}=create();assert.equal(typeof cloud.getGptReadiness,'function');
  assert.equal(calls.length,0);
});
await check('single explicit authenticated GET with no business input',async()=>{
  const {cloud,calls}=create();
  const r=await cloud.getGptReadiness();
  assert.equal(r.ok,true);assert.equal(r.ready,false);
  assert.equal(calls.length,1);
  assert.equal(calls[0].init.method,'GET');
  assert.equal(calls[0].init.body,undefined);
  assert.match(calls[0].url,/\/functions\/v1\/budil-gpt-interpret$/);
  assert.equal(calls[0].init.headers.Authorization,'Bearer fixture-access-only');
  assert.ok(!JSON.stringify(r).includes('fixture-access'));
  assert.equal(r.externalRequestSent,false);
});
await check('login required before any request',async()=>{
  const {cloud,calls}=create('teruya1229.github.io',{loggedIn:false});
  const r=await cloud.getGptReadiness();assert.equal(r.ok,false);
  assert.equal(r.code,'not_signed_in');assert.equal(calls.length,0);
});
await check('localhost and unknown host fail closed',async()=>{
  for(const host of ['localhost','example.com']){
    const {cloud,calls}=create(host);
    const r=await cloud.getGptReadiness();assert.equal(r.ok,false);
    assert.equal(calls.length,0);
  }
});
await check('backend safety flags and response shape validated',async()=>{
  const {cloud,calls}=create('teruya1229.github.io',{body:{
    ok:true,phase:'readiness_only',enabled:true,key_configured:true,
    model_supported:true,ready:true,anonymized_ready:true,
    external_request_sent:true,persisted:false
  }});
  const r=await cloud.getGptReadiness();assert.equal(r.ok,false);
  assert.equal(calls.length,1);
});
await check('ready status may be reported but never enables a POST',async()=>{
  const {cloud,calls}=create('teruya1229.github.io',{body:{
    ok:true,phase:'readiness_only',enabled:true,key_configured:true,
    model_supported:true,ready:true,anonymized_ready:true,
    external_request_sent:false,persisted:false
  }});
  const r=await cloud.getGptReadiness();assert.equal(r.ready,true);
  assert.equal(r.anonymizedReady,true);assert.equal(calls[0].init.method,'GET');
});
await check('UI contains explicit probe with no auto-call',async()=>{
  assert.match(html,/id="budil-gpt-readiness"/);
  assert.match(html,/id="budil-gpt-readiness-status"/);
  assert.match(ui,/addEventListener\('click',checkGptReadiness\)/);
  assert.ok(!ui.includes('interpretAnonymizedQuote('));
});
console.log('BUDIL_GPT_READINESS '+count+'/7 PASS');
