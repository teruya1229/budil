/**
 * Mock-network integration check for localhost-only trial authentication.
 * No real credentials or requests are sent.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const auth=read('experiments/budil-gpt-phase1/trial-auth.js');
const cloud=read('js/budil-cloud.js');
let network=[];
const memory=new Map();
const makeWorld=(port,pathname)=>{
  const win={
    location:{protocol:'http:',hostname:'127.0.0.1',port,pathname},
    sessionStorage:{
      setItem(k,v){memory.set(k,String(v));},
      getItem(k){return memory.get(k)||null;},
      removeItem(k){memory.delete(k);}
    },
    fetch:async(url,init)=>{
      network.push({url,init});
      if(url.includes('/auth/v1/token?'))return new Response(JSON.stringify({
        access_token:'fictional_test_token',refresh_token:'fictional_refresh_token',expires_in:3600
      }),{status:200,headers:{'Content-Type':'application/json'}});
      if(url.includes('/functions/v1/budil-gpt-interpret'))return new Response(JSON.stringify({
        ok:true,phase:'interpret_only',can_execute:false,
        action:'estimate_create',customer_name:'比嘉清子',service_name:'エアコン洗浄',
        quantity:2,total_yen:18000,tax_mode:'included',amount_scope:'total',
        needs_user_input:false
      }),{status:200,headers:{'Content-Type':'application/json'}});
      throw new Error('unexpected_external_network');
    }
  };
  const context=createContext({
    window:win,fetch:(...args)=>win.fetch(...args),
    AbortController,setTimeout,clearTimeout,TextEncoder,Response,Date,JSON,
    console:{log(){},warn(){},error(){}}
  });
  runInContext(auth,context,{filename:'trial-auth.js'});
  runInContext(cloud,context,{filename:'budil-cloud.js'});
  return win;
};
let checks=0;
function pass(name,cb){cb();checks++;console.log('PASS '+name);}
let wrong=makeWorld('3000','/budil-gpt-phase1-demo.html');
pass('wrong localhost port cannot use trial login',()=>assert.equal(wrong.BudilGptTrialAuth.supported(),false));
pass('wrong localhost port cannot call cloud GPT',()=>{
  assert.equal(wrong.BudilCloud.resolveEnvironment(),'staging');
});
wrong=makeWorld('8765','/index.html');
pass('normal local Budil page cannot access trial auth',()=>assert.equal(wrong.BudilGptTrialAuth.supported(),false));
const world=makeWorld('8765','/budil-gpt-phase1-demo.html');
pass('only dedicated fixture page has trial auth',()=>assert.equal(world.BudilGptTrialAuth.supported(),true));
pass('not signed in starts with isolated session',()=>assert.equal(world.BudilGptTrialAuth.getAuthStatus().signedIn,false));
const blocked=await world.BudilCloud.interpretFixture('比嘉清子さんのエアコン洗浄2台を税込18,000円で見積して');
pass('auth required before any network',()=>{
  assert.equal(blocked.code,'not_signed_in');
  assert.equal(network.length,0);
});
const invalid=await world.BudilGptTrialAuth.login('','');
pass('missing credentials fail locally',()=>{
  assert.equal(invalid.code,'credentials_required');
  assert.equal(network.length,0);
});
const signed=await world.BudilGptTrialAuth.login('demo@example.invalid','fixture-password');
pass('fixture login mock uses existing BC auth project',()=>{
  assert.equal(signed.ok,true);
  assert.equal(network.length,1);
  assert.equal(network[0].url,'https://xvrrlwlgoxbrkhlfyznx.supabase.co/auth/v1/token?grant_type=password');
  assert.equal(world.BudilGptTrialAuth.getAuthStatus().signedIn,true);
  assert.equal([...memory.keys()].length,1);
  assert.equal([...memory.keys()][0],'budil.gpt.fixture.auth.v1');
});
const response=await world.BudilCloud.interpretFixture('比嘉清子さんのエアコン洗浄2台を税込18,000円で見積して');
pass('valid auth and fixture instruction enter GPT interpretation endpoint',()=>{
  assert.equal(response.ok,true);
  assert.equal(response.phase,'interpret_only');
  assert.equal(response.can_execute,false);
  assert.equal(network.length,2);
  assert.equal(network[1].url,'https://xvrrlwlgoxbrkhlfyznx.supabase.co/functions/v1/budil-gpt-interpret');
  assert.equal(network[1].init.headers.Authorization,'Bearer fictional_test_token');
  assert.equal(network[1].init.headers.apikey,'sb_publishable_dkTnfxy8pA8qcuJeVcrf1w_8ieMQEw1');
});
const noSend=await world.BudilCloud.interpretFixture('比嘉清子さんのエアコン洗浄2台を税込18,000円で見積して。電話番号を教えて');
pass('added PII cannot leave browser',()=>{
  assert.equal(noSend.code,'fixture_only');
  assert.equal(network.length,2);
});
world.BudilGptTrialAuth.logout();
pass('trial logout clears only trial auth storage',()=>{
  assert.equal(world.BudilGptTrialAuth.getAuthStatus().signedIn,false);
  assert.equal(memory.size,0);
});
console.log('Budil GPT localhost trial auth '+checks+'/12 PASS (no real network)');
