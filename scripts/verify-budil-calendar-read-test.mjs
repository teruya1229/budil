/** Browser-independent contract for the production-origin Google calendar busy-only check page. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../calendar-read-test.html',import.meta.url),'utf8');
const match=html.match(/<script id="calendar-check-controller">([\s\S]*?)<\/script>/);
assert.ok(match,'Calendar check controller is present');
assert.ok(html.includes('<meta name="robots" content="noindex,nofollow,noarchive">'));
assert.ok(html.includes('js/budil-cloud.js?'));
assert.ok(/<input[^>]+id="login-password"[^>]+type="password"/i.test(html));
assert.ok(html.includes('autocomplete="current-password"'));
assert.ok(html.includes('id="login-form"'));
assert.ok(!html.includes('type="password" value='));
assert.ok(!/localStorage\.(?:setItem|clear|removeItem)/.test(html));
assert.ok(!/getAccessToken|refresh_token|access_token|authorization\s*:/.test(match[1]));
assert.ok(!/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/.test(match[1]));

function harness(fetchScheduleBlocks,auth={signedIn:true},login=async()=>({ok:true})) {
  const names=['read-button','read-result','read-consent','calendar-date','auth-status','login-panel','login-form','login-email','login-password','login-button','login-result'];
  const elements=Object.fromEntries(names.map(name=>[name,{
    textContent:'',checked:false,value:name==='calendar-date'?'2026-11-08':'',
    disabled:false,listeners:{},
    addEventListener(event,fn){this.listeners[event]=fn;}
  }]));
  let readCount=0, loginCount=0;
  const cloud={
    whenReady:()=>Promise.resolve(),
    getAuthState:()=>auth,
    login:async(email,password)=>{
      loginCount++;
      const response=await login(email,password);
      if(response.ok)auth.signedIn=true;
      return response;
    },
    fetchScheduleBlocks:async(...args)=>{
      readCount++;
      return fetchScheduleBlocks(...args);
    }
  };
  const context={document:{getElementById:id=>elements[id]},
    BudilCloud:cloud,Date,Promise,String,Number};
  runInNewContext(match[1],context,{filename:'calendar-read-test-inline.js'});
  return {
    elements, readCount:()=>readCount,loginCount:()=>loginCount,
    async click(){await elements['read-button'].listeners.click();},
    async submit(){await elements['login-form'].listeners.submit({preventDefault(){}});},
    consent(){elements['read-consent'].checked=true;},
    date(value){elements['calendar-date'].value=value;},
    output(){return elements['read-result'].textContent;}
  };
}
const results={
  ok:true,readOnly:true,calendarWritePerformed:false,
  events:[{start:'2026-11-08T09:00:00+09:00',end:'2026-11-08T09:15:00+09:00',
    summary:'Fictional sensitive title',location:'Fictional private address'}]
};
const unsigned=harness(async()=>results,{available:true,signedIn:false});
await Promise.resolve();
assert.equal(unsigned.elements['read-button'].disabled,true,'not signed in => read disabled');
assert.equal(unsigned.elements['login-panel'].hidden,false,'in-page login shown');
unsigned.consent();
await unsigned.click();
assert.equal(unsigned.readCount(),0,'no calendar read for unsigned user');
unsigned.elements['login-email'].value='fixture@example.invalid';
unsigned.elements['login-password'].value='fictional-credential';
await unsigned.submit();
assert.equal(unsigned.loginCount(),1);
assert.equal(unsigned.elements['login-password'].value,'','password cleared after attempt');
assert.equal(unsigned.elements['read-button'].disabled,false,'login enables read');
assert.equal(unsigned.elements['login-panel'].hidden,true);
assert.equal(unsigned.elements['read-consent'].checked,false,'new explicit consent after login');
await unsigned.click();
assert.equal(unsigned.readCount(),0,'login itself never reads calendar');
unsigned.consent();await unsigned.click();
assert.equal(unsigned.readCount(),1,'explicit one-time calendar read after login');
const invalid=harness(async()=>results,{available:true,signedIn:false},
  async()=>({ok:false,code:'invalid_credentials'}));
await Promise.resolve();
invalid.elements['login-email'].value='fixture@example.invalid';
invalid.elements['login-password'].value='incorrect-fixture';
await invalid.submit();
assert.equal(invalid.elements['login-password'].value,'');
assert.equal(invalid.elements['read-button'].disabled,true,'failed login cannot unlock calendar');
assert.equal(invalid.elements['login-panel'].hidden,false);
invalid.consent();await invalid.click();
assert.equal(invalid.readCount(),0,'failed login does not read');
const h=harness(async()=>results);
assert.equal(h.readCount(),0,'no request before explicit click');
await h.click();
assert.equal(h.readCount(),0,'consent required');
h.consent();await h.click();
assert.equal(h.readCount(),1);
assert.ok(h.output().includes('取得予定件数：1件'));
assert.ok(h.output().includes('重なる予定：1件'));
assert.ok(!h.output().includes('Fictional'));
assert.equal(h.elements['read-consent'].checked,false,'one-use consent reset');
await h.click();assert.equal(h.readCount(),1,'no implicit second request');
h.consent();h.date('2026-02-30');await h.click();
assert.equal(h.readCount(),1,'invalid date rejected');
const rejected=harness(async()=>({ok:false,code:'calendar_not_allowed'}));
rejected.consent();await rejected.click();
assert.ok(rejected.output().includes('calendar_not_allowed'));
assert.ok(!rejected.output().includes('読取成功'));
const noWrite=harness(async()=>({
  ok:true,readOnly:true,calendarWritePerformed:true,events:results.events
}));
noWrite.consent();await noWrite.click();
assert.ok(!noWrite.output().includes('読取成功'),'calendar write result is invalid');
const missing=harness(async()=>({ok:true,events:results.events}));
missing.consent();await missing.click();
assert.ok(!missing.output().includes('読取成功'),'read-only proof must be explicit');
let resolve;
const pending=new Promise(r=>{resolve=r;});
const concurrent=harness(async()=>pending);
concurrent.consent();
const initial=concurrent.click();
await concurrent.click();
assert.equal(concurrent.readCount(),1,'no concurrent duplicate requests');
resolve(results);await initial;
assert.equal(concurrent.readCount(),1);
console.log('BUDIL_CALENDAR_READ_TEST_PASS direct-login, session-isolation, consent, date, privacy, readonly, replay, concurrency');
