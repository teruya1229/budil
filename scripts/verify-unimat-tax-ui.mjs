/**
 * ユニマット税抜発注額の計上テスト（DOM相当の隔離環境）。
 * 顧客情報・本番保存・予約送信は行わない。
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const js=readFileSync(new URL('../js/unimat-tax-ui.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../css/unimat-tax-ui.css',import.meta.url),'utf8');
const prefixes=['work-order','revenue','work-completion'];
function fakeElement(id) {
  return {
    id, value:'', hidden:false, textContent:'', handlers:{},
    addEventListener(type,callback){(this.handlers[type]??=[]).push(callback);},
    dispatchEvent(event){ for(const cb of this.handlers[event.type]||[])cb(event);return true; }
  };
}
const els={};
for(const p of prefixes){
  for(const id of [p+'-source',p+'-amount','unimat-'+p+'-net','unimat-'+p+'-wrap','unimat-'+p+'-note'])
    els[id]=fakeElement(id);
}
els['work-order-source'].value='コープ';
els['revenue-source'].value='コープ';
els['work-completion-source'].value='コープ';
const doc={readyState:'complete',getElementById(id){return els[id]||null;},handlers:{},addEventListener(type,fn){(this.handlers[type]??=[]).push(fn);}};
const win={};
const sandbox={window:win,document:doc,Event:class{constructor(type){this.type=type;}},queueMicrotask:fn=>fn()};
vm.createContext(sandbox);
vm.runInContext(js,sandbox);
const tax=win.BudilUnimatTax;
assert.ok(tax);
for (const [n,amount] of [[12000,13200],[12345,13580],[1,1],[0,0]]) {
  assert.equal(tax.toTaxInclusive(String(n)),amount);
}
for(const bad of ['','abc','12,000','-10','1.2','999999999999'])
  assert.equal(tax.toTaxInclusive(bad),null,'invalid tax-exclusive amount: '+bad);
for(const p of prefixes){
  assert.equal(els['unimat-'+p+'-wrap'].hidden,true,'other sources hide: '+p);
  els[p+'-source'].value='ユニマット';
  els[p+'-source'].dispatchEvent({type:'change'});
  assert.equal(els['unimat-'+p+'-wrap'].hidden,false,'Unimat helper shown: '+p);
  let events=0;
  els[p+'-amount'].addEventListener('input',()=>events++);
  els['unimat-'+p+'-net'].value='12000';
  els['unimat-'+p+'-net'].dispatchEvent({type:'input'});
  assert.equal(els[p+'-amount'].value,'13200','gross applied: '+p);
  assert.equal(events,1,'app gets input event: '+p);
  assert.ok(els['unimat-'+p+'-note'].textContent.includes('13,200円'),'tax preview: '+p);
  els['unimat-'+p+'-net'].dispatchEvent({type:'input'});
  assert.equal(els[p+'-amount'].value,'13200','repeat is idempotent: '+p);
  els[p+'-amount'].value='14500';
  els[p+'-amount'].dispatchEvent({type:'input'});
  assert.equal(els['unimat-'+p+'-net'].value,'','manual gross edit resets old net: '+p);
  els[p+'-source'].value='コープ';
  els[p+'-source'].dispatchEvent({type:'change'});
  assert.equal(els['unimat-'+p+'-wrap'].hidden,true,'other source hides helper: '+p);
  assert.equal(els[p+'-amount'].value,'14500','switch source never modifies existing gross: '+p);
  els[p+'-source'].value='ユニマット';
  els[p+'-source'].dispatchEvent({type:'change'});
  assert.equal(els[p+'-amount'].value,'14500','open existing recorded gross no re-tax: '+p);
  assert.ok(html.includes('id="unimat-'+p+'-net"'));
  assert.ok(html.includes('id="unimat-'+p+'-wrap"'));
}
assert.ok(html.includes('js/unimat-tax-ui.js?v=20261113vat1'));
assert.ok(html.includes('css/unimat-tax-ui.css?v=20261113vat1'));
assert.ok(css.includes('.unimat-tax-entry[hidden]'));
console.log('UNIMAT_BUDIL_TAX_3_FORMS=PASS');
