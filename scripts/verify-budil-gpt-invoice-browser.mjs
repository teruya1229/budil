/** Actual Windows Chrome, 390px, disposable profile and fictional local records. */
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('verify-budil-gpt-booking-browser.mjs',import.meta.url));
const generated=fileURLToPath(new URL('.invoice-browser-generated.mjs',import.meta.url));
const template=readFileSync(source,'utf8');
const start=template.indexOf('  await ev("localStorage.setItem');
const end=template.indexOf("  console.log('BUDIL_BOOKING_CHROME_390_WINDOWS PASS');",start);
if(start<0||end<0)throw Error('BROWSER_HARNESS_CHANGED');
const cases=`  await ev("localStorage.setItem('budil_leads',JSON.stringify([{id:'c1',name:'田中太郎'}]));localStorage.setItem('budil_work_orders',JSON.stringify([{id:'w1',customerName:'田中太郎',serviceText:'エアコン洗浄2台',scheduledDate:'2026-11-06',status:'confirmed'},{id:'w2',customerName:'田中花子',serviceText:'架空の点検',scheduledDate:'2026-11-07',status:'confirmed'}]))");
  await ev("document.getElementById('budil-gpt-open').click()");
  await ev("window.__workReads=0;window.__getWork=Storage.getWorkOrders;Storage.getWorkOrders=function(){window.__workReads++;return window.__getWork.apply(this,arguments)}");
  await ev("document.getElementById('budil-gpt-input').value='田中さんの作業を完了にして請求書を作って';document.getElementById('budil-gpt-run').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-invoice').hidden"),true,'consent before reading');
  assert.equal(await ev('window.__workReads'),0,'no work-order read without consent');
  await ev("document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  assert.equal(await ev("document.querySelectorAll('#budil-gpt-invoice-orders button').length"),2,'exact work-order choice');
  assert.equal(await ev('Storage.getDocuments().length'),0);
  await ev("[...document.querySelectorAll('#budil-gpt-invoice-orders button')].find(b=>b.textContent.includes('エアコン洗浄2台')).click();document.getElementById('budil-gpt-invoice-preview').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-invoice-confirm').hidden"),true,'missing fields');
  await ev("document.getElementById('budil-gpt-invoice-work-date').value='2026-11-06';document.getElementById('budil-gpt-invoice-amount').value='18000';document.getElementById('budil-gpt-invoice-tax').value='included';document.getElementById('budil-gpt-invoice-issue').value='2026-11-06';document.getElementById('budil-gpt-invoice-due').value='2026-12-06';document.getElementById('budil-gpt-invoice-method').value='bank_transfer';document.getElementById('budil-gpt-invoice-expected').value='2026-12-06';document.getElementById('budil-gpt-invoice-preview').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-completion-confirm').hidden"),false);
  assert.equal(await ev('Storage.getDocuments().length'),0,'completion preview has no write');
  await ev("document.getElementById('budil-gpt-completion-confirm').click();document.getElementById('budil-gpt-completion-confirm').click()");
  assert.equal(await ev("Storage.getWorkOrders().find(w=>w.id==='w1').status"),'completed');
  assert.equal(await ev("Storage.getWorkOrders().find(w=>w.id==='w2').status"),'confirmed');
  assert.equal(await ev('Storage.getRevenueRecords().length'),1);
  assert.equal(await ev('Storage.getDocuments().length'),0,'invoice still pending');
  await ev("document.getElementById('budil-gpt-invoice-preview').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-invoice-confirm').hidden"),false);
  await ev("window.__saveDocs=Storage.saveDocuments;Storage.saveDocuments=function(){throw Error('fictional quota')};document.getElementById('budil-gpt-invoice-confirm').click();Storage.saveDocuments=window.__saveDocs");
  assert.equal(await ev('Storage.getDocuments().length'),0,'invoice failure stays pending');
  assert.equal(await ev("document.getElementById('budil-gpt-status').textContent.includes('請求書は未作成')"),true);
  await cmd('Page.reload',{ignoreCache:true});
  for(let i=0;i<150;i++){if(await ev("document.readyState==='complete'&&!!document.getElementById('budil-gpt-open')"))break;await sleep(100);}
  await ev("document.getElementById('budil-gpt-open').click();document.getElementById('budil-gpt-input').value='田中さんの作業を完了にして請求書を作って';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click();[...document.querySelectorAll('#budil-gpt-invoice-orders button')].find(b=>b.textContent.includes('エアコン洗浄2台')).click()");
  assert.equal(await ev("document.getElementById('budil-gpt-status').textContent.includes('請求書の入力と承認が残っています')"),true);
  await ev("document.getElementById('budil-gpt-invoice-work-date').value='2026-11-06';document.getElementById('budil-gpt-invoice-amount').value='18000';document.getElementById('budil-gpt-invoice-tax').value='included';document.getElementById('budil-gpt-invoice-issue').value='2026-11-06';document.getElementById('budil-gpt-invoice-due').value='2026-12-06';document.getElementById('budil-gpt-invoice-method').value='bank_transfer';document.getElementById('budil-gpt-invoice-expected').value='2026-12-06';document.getElementById('budil-gpt-invoice-preview').click();document.getElementById('budil-gpt-invoice-confirm').click();document.getElementById('budil-gpt-invoice-confirm').click()");
  assert.equal(await ev('Storage.getDocuments().length'),1,'one invoice');
  assert.equal(await ev("document.getElementById('budil-gpt-invoice-issue-panel').hidden"),false,
    'saved invoice is presented for separate issue approval');
  assert.equal(await ev("document.getElementById('budil-gpt-invoice-issue-panel').getClientRects().length > 0"),true,
    'issue approval panel is actually rendered, not only a date input');
  await ev("document.getElementById('budil-gpt-invoice-issue-confirm').click()");
  assert.equal(await ev("Storage.getDocuments()[0].status"),'draft','issue needs separate acknowledgement');
  await ev("document.getElementById('budil-gpt-invoice-issue-ack').checked=true;document.getElementById('budil-gpt-invoice-issue-confirm').click()");
  assert.equal(await ev("Storage.getDocuments()[0].status"),'issued');
  assert.equal(await ev("Storage.getDocuments()[0].paymentStatus"),'pending');
  assert.equal(await ev("Storage.getDocuments()[0].paidAmount"),0);

  assert.equal(await ev("Storage.getDocuments()[0].paymentStatus"),'pending');
  assert.equal(await ev("Storage.getDocuments()[0].sourceWorkOrderId"),'w1');
  assert.equal(await ev("Storage.getWorkOrders().find(w=>w.id==='w2').status"),'confirmed');
  assert.equal(await ev('Storage.getSafetyBackups().length>=3'),true);
  await ev("document.getElementById('budil-gpt-clear').click();document.getElementById('budil-gpt-input').value='田中太郎さんのエアコン洗浄2台を税込18,000円で見積して';document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  assert.equal(await ev("document.querySelectorAll('#budil-gpt-candidate-list button').length"),1);
  await ev("document.querySelector('#budil-gpt-candidate-list button').click();document.getElementById('budil-gpt-approve').click();document.getElementById('budil-gpt-input').value='その見積を請求書にして';document.getElementById('budil-gpt-run').click()");
  assert.equal(await ev('Storage.getDocuments().length'),1,'quote approval is not invoice approval');
  await ev("document.getElementById('budil-gpt-invoice-issue').value='2026-11-06';document.getElementById('budil-gpt-invoice-due').value='2026-12-06';document.getElementById('budil-gpt-invoice-method').value='bank_transfer';document.getElementById('budil-gpt-invoice-expected').value='2026-12-06';document.getElementById('budil-gpt-invoice-preview').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-invoice-confirm').hidden"),false);
  assert.equal(await ev('Storage.getDocuments().length'),1);
  await ev("document.getElementById('budil-gpt-invoice-confirm').click()");
  assert.equal(await ev('Storage.getDocuments().length'),3,'quote and invoice in one document write');
  assert.equal(await ev("Storage.getDocuments()[0].status"),'draft',
    'quote invoice remains a draft until separate issue');
  await cmd('Page.reload',{ignoreCache:true});
  for(let i=0;i<150;i++){
    if(await ev("document.readyState==='complete'&&!!document.getElementById('budil-gpt-open')"))break;
    await sleep(100);
  }
  await ev("document.getElementById('budil-gpt-open').click();document.getElementById('budil-gpt-input').value='請求書の下書きを確定して';document.getElementById('budil-gpt-run').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-invoice').hidden"),true,
    'reloaded client must ask for consent before listing invoices');
  await ev("document.getElementById('budil-gpt-consent').checked=true;document.getElementById('budil-gpt-run').click()");
  assert.equal(await ev("document.querySelectorAll('#budil-gpt-invoice-orders button').length"),1);
  await ev("document.querySelector('#budil-gpt-invoice-orders button').click()");
  assert.equal(await ev("document.getElementById('budil-gpt-invoice-issue-panel').hidden"),false);
  assert.equal(await ev("Storage.getDocuments()[0].status"),'draft');
  await ev("document.getElementById('budil-gpt-invoice-issue-ack').checked=true;document.getElementById('budil-gpt-invoice-issue-confirm').click()");
  assert.equal(await ev("Storage.getDocuments()[0].status"),'issued');
  assert.equal(await ev("Storage.getDocuments()[0].paymentStatus"),'pending');
  assert.equal(await ev('Storage.getDocuments().length'),3,'no duplicate invoices');
  console.log('BUDIL_INVOICE_ISSUE_BROWSER_PASS: separate confirmation and restore from reload; no remote send');

  assert.equal(await ev("Storage.getDocuments()[0].sourceEstimateId===Storage.getDocuments()[1].id"),true);
  assert.equal(await ev("Storage.getDocuments()[0].tax===Storage.getDocuments()[1].tax"),true);
  assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth+2'),true);
  await ev("document.getElementById('budil-gpt-invoice').scrollIntoView({block:'start'})");
  const shot=await cmd('Page.captureScreenshot',{format:'png'});
  if(process.env.BUDIL_TEST_OUTPUT_DIR)writeFileSync(join(output,'budil-invoice-390.png'),Buffer.from(shot.data,'base64'));
  console.log('BUDIL_INVOICE_CHROME_390_WINDOWS PASS');
`;
writeFileSync(generated,template.slice(0,start)+cases+template.slice(end).replace("  console.log('BUDIL_BOOKING_CHROME_390_WINDOWS PASS');\n",''));
try{
  const result=spawnSync(process.execPath,[generated],{encoding:'utf8',timeout:90000,
    env:process.env,maxBuffer:1024*1024});
  process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
  if(result.error)throw result.error;
  process.exitCode=result.status||0;
}finally{unlinkSync(generated);}
