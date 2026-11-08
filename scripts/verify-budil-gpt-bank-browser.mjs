/** Actual Windows Chrome 390px, fictional CSV via File input, no external requests. */
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('verify-budil-gpt-booking-browser.mjs',import.meta.url));
const generated=fileURLToPath(new URL('.bank-browser-generated.mjs',import.meta.url));
const template=readFileSync(source,'utf8').replace("Error('EVAL '+r.exceptionDetails.text)","Error('EVAL '+r.exceptionDetails.text+' '+(r.exceptionDetails.exception?.description||''))");
const start=template.indexOf('  await ev("localStorage.setItem');
const end=template.indexOf("  console.log('BUDIL_BOOKING_CHROME_390_WINDOWS PASS');",start);
if(start<0||end<0)throw Error('BROWSER_HARNESS_CHANGED');
const cases=`  await ev("localStorage.setItem('budil_documents',JSON.stringify([{id:'fictional-i1',type:'invoice',number:'INV-1',customerName:'田中太郎',total:18000,status:'issued',paymentMethod:'bank_transfer',paymentStatus:'pending',paidAmount:0,issueDate:'2026-11-06',dueDate:'2026-12-06'}]))");
  await ev("document.getElementById('budil-gpt-open').click();document.getElementById('budil-gpt-input').value='銀行明細と請求書を照合して';document.getElementById('budil-gpt-run').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-bank').hidden"),true,'consent gate');
  await ev("document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-bank').hidden"),false);
  await ev("document.getElementById('budil-gpt-bank-source').value='fictional-account';const f=new File(['取引日,入金額,出金額,摘要,取引ID'+String.fromCharCode(10)+'2026/11/07,18000,,田中太郎 INV-1,TX-1'+String.fromCharCode(10)+'2026/11/08,123,,<img src=x onerror=alert(1)>,TX-2'+String.fromCharCode(10)+'2026/11/09,18000,500,田中太郎,TX-3'+String.fromCharCode(10)],'fictional.csv',{type:'text/csv'});const d=new DataTransfer();d.items.add(f);document.getElementById('budil-gpt-bank-file').files=d.files;document.getElementById('budil-gpt-bank-preview').click()");
  for(let i=0;i<50;i++){if(await ev("document.querySelectorAll('#budil-gpt-bank-results button').length"))break;await sleep(100);}
  assert.equal(await ev("document.querySelectorAll('#budil-gpt-bank-results button').length"),1,'candidate');
  assert.equal(await ev("document.querySelectorAll('#budil-gpt-bank-results img').length"),0,'CSV injection displayed as text');
  assert.equal(await ev("document.getElementById('budil-gpt-bank-results').textContent.includes('NOT_EXPLICIT_CREDIT')"),true,'mixed debit rejected');
  assert.equal(await ev("Storage.getDocuments()[0].paymentStatus"),'pending','preview read only');
  await ev("document.querySelector('#budil-gpt-bank-results button').click()");
  assert.equal(await ev("Storage.getDocuments()[0].paymentStatus"),'pending','approval checkbox required');
  await ev("document.querySelector('#budil-gpt-bank-results input[type=checkbox]').checked=true;document.querySelector('#budil-gpt-bank-results button').click()");
  assert.equal(await ev("Storage.getDocuments()[0].paymentStatus"),'paid');
  assert.equal(await ev("Storage.getDocuments()[0].bankMatch.transactionId"),'TX-1');
  assert.equal(await ev("Storage.getSafetyBackups().length>=1"),true);
  await cmd('Page.reload');
  for(let i=0;i<150;i++){if(await ev("document.readyState==='complete'&&typeof BudilGptBankReconcile!=='undefined'"))break;await sleep(100);}
  assert.equal(await ev("Storage.getDocuments()[0].paymentStatus"),'paid','payment survives reload');
  assert.equal(await ev("BudilGptBankReconcile.candidates([{id:'TX-1',date:'2026-11-07',amount:18000,description:'田中太郎 INV-1'}],Storage.getDocuments(),'fictional-account',PaymentBrain)[0].duplicate"),true,'assigned transaction survives reload');
  await ev("document.getElementById('budil-gpt-open').click();document.getElementById('budil-gpt-input').value='銀行明細と請求書を突合して';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  await ev("document.getElementById('budil-gpt-bank-source').value='fictional-account';const f=new File(['取引日,入金額,出金額,摘要,取引ID'+String.fromCharCode(10)+'2026/11/07,18000,,田中太郎 INV-1,TX-1'+String.fromCharCode(10)],'fictional-reimport.csv',{type:'text/csv'});const d=new DataTransfer();d.items.add(f);document.getElementById('budil-gpt-bank-file').files=d.files");
  await ev("document.getElementById('budil-gpt-bank-preview').click()");
  for(let i=0;i<50;i++){if(await ev("document.getElementById('budil-gpt-bank-results').textContent.includes('割当済み')"))break;await sleep(100);}
  assert.equal(await ev("document.querySelectorAll('#budil-gpt-bank-results button').length"),0,'duplicate import guard');
  assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth+2'),true);
  console.log('BUDIL_BANK_CHROME_390_WINDOWS PASS');
`;
writeFileSync(generated,template.slice(0,start)+cases+template.slice(end).replace("  console.log('BUDIL_BOOKING_CHROME_390_WINDOWS PASS');\n",''));
try{const result=spawnSync(process.execPath,[generated],{encoding:'utf8',timeout:90000,env:process.env,maxBuffer:1024*1024});
  process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
  if(result.error)throw result.error;process.exitCode=result.status||0;
}finally{unlinkSync(generated);}
