/**
 * Budil×GPT fictional-data booking→work→invoice→receivables rehearsal.
 * All operations mutate only this page's volatile fixture session.
 * No Calendar API, Storage, bank provider, localStorage or cloud writes.
 */
(function (scope) {
  'use strict';
  const DEMO_BUSY = Object.freeze([
    { date: '2026-11-13', start: '10:00', end: '11:00' },
    { date: '2026-11-16', start: '09:00', end: '10:00' }
  ]);
  function fail(code, message) { return {ok:false,code,message}; }
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function dateOk(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
    const [y,m,d] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(y,m-1,d));
    return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m-1 && parsed.getUTCDate() === d;
  }
  function toMinutes(v) {
    if (!/^(?:0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/.test(String(v))) return -1;
    return Number(v.slice(0,2))*60+Number(v.slice(3));
  }
  function validSlot(date,start,end) {
    if (!dateOk(date)) return fail('DATE_INVALID','有効な日付を選んでください。');
    const a=toMinutes(start),b=toMinutes(end);
    if(a<0||b<0||b<=a||b-a>480) return fail('TIME_INVALID','終了は開始より後、作業時間は8時間以内に指定してください。');
    return {ok:true,date,start,end};
  }
  // Narrow grammar for offline voice transcription — not GPT and no arbitrary
  // instruction execution. Absolute date must be supplied; never infer "Friday".
  function parseVoiceCommand(raw) {
    if(typeof raw!=='string'||!raw.trim()||raw.length>180) {
      return fail('COMMAND_INVALID','180文字以内で話してください。');
    }
    const str=raw.replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0))
      .replace(/[\s　]/g,'').trim();
    const appointment=str.match(/^([0-9]{4})年([0-9]{1,2})月([0-9]{1,2})日([0-9]{1,2})時(?:([0-9]{1,2})分)?から([0-9]{1,2})時(?:([0-9]{1,2})分)?まで(?:に)?予約(?:案)?(?:を)?(?:作って|して|お願い)?$/);
    if(appointment){
      const [,y,m,d,h,mm,eh,emm]=appointment;
      const date=y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0');
      const start=h.padStart(2,'0')+':'+(mm||'00').padStart(2,'0');
      const end=eh.padStart(2,'0')+':'+(emm||'00').padStart(2,'0');
      const validation=validSlot(date,start,end);
      return validation.ok ? {ok:true,action:'slot_preview',date,start,end,
        requiresConfirmation:true} : validation;
    }
    if(/^(?:作業を|作業)?完了(?:にして|にする|して)$/.test(str)) {
      return {ok:true,action:'request_completion',requiresConfirmation:true};
    }
    if(/^(?:請求書を|請求書)(?:作って|作成して)$/.test(str)) {
      return {ok:true,action:'invoice_draft',requiresConfirmation:true};
    }
    if(/^(?:今月の)?未入金(?:を)?(?:教えて|確認して)$/.test(str)) {
      return {ok:true,action:'read_receivables',requiresConfirmation:false};
    }
    if(/^比嘉清子(?:さん|様)?の(?:請求書|見積書)を(?:探して|検索して)$/.test(str)){
      return {ok:true,action:'fixture_search',query:'比嘉清子',
        requiresConfirmation:false};
    }
    if(/(?:金曜|金曜日|明日|来週|[0-9]{1,2}月[0-9]{1,2}日)/.test(str)) {
      return fail('ABSOLUTE_DATE_REQUIRED','予約は年・月・日・開始・終了時刻を指定してください。');
    }
    return fail('COMMAND_UNSUPPORTED','架空デモで対応していない指示です。登録・入金確定は実行しません。');
  }
  function makeSession(quoteCoreSession, deps) {
    const source = quoteCoreSession && quoteCoreSession.approved;
    const id = quoteCoreSession && quoteCoreSession.selectedCustomerId;
    if(!source || !id || quoteCoreSession.stage !== 'approved' || !String(id).startsWith('fixture-')) {
      return fail('QUOTE_NOT_APPROVED','先に架空の見積書を承認してください。');
    }
    const d=deps&&deps.documentsBrain;
    const w=deps&&deps.workOrderBrain;
    const p=deps&&deps.paymentBrain;
    if(!d||!w||!p) return fail('DEPENDENCY_MISSING','既存Budilの帳票・予定・入金モジュールが必要です。');
    return {
      ok:true,stage:'ready',customerId:id,estimate:copy(source),
      workOrder:null,appointment:null,invoice:null,approvedInvoice:null,
      seq:0,calendarChecked:false,invoicePrepared:false,
      deps:{documentsBrain:d,workOrderBrain:w,paymentBrain:p}
    };
  }
  function prepareAppointment(session, date,start,end) {
    if(!session||!session.ok||session.stage!=='ready') return fail('WORKFLOW_NOT_READY','見積を承認してから予定を作成してください。');
    const slot=validSlot(date,start,end);
    if(!slot.ok) return slot;
    // Demonstration slots only. Not a Google Calendar availability check.
    const overlaps=DEMO_BUSY.filter(b=>b.date===date &&
      toMinutes(start)<toMinutes(b.end) && toMinutes(end)>toMinutes(b.start));
    session.calendarChecked=true;
    session.seq++;
    if(overlaps.length){
      session.appointment=null;
      return fail('DEMO_SLOT_BUSY','架空カレンダーでは既に予約がある時間帯です。別の日時を選択してください。');
    }
    const token='fixture-slot-'+session.seq;
    session.appointment={date,start,end,token,source:'DEMO_CALENDAR_ONLY'};
    return {ok:true,code:'APPOINTMENT_PREVIEW',slot:copy(session.appointment),
      message:'架空カレンダーで空きあり。Googleカレンダーの実際の空きではありません。'};
  }
  function confirmAppointment(session, token, permit) {
    if(!session||session.stage!=='ready'||!session.appointment){
      return fail('PREVIEW_REQUIRED','日時の空き確認を先に行ってください。');
    }
    if(permit!==true) return fail('PERMIT_REQUIRED','予定の確認・承認が必要です。');
    if(token!==session.appointment.token) return fail('STALE_PREVIEW','古い予定案のため、空き確認をやり直してください。');
    const d=session.appointment, brain=session.deps.workOrderBrain;
    const wo=brain.normalizeWorkOrder({
      id:'fixture-work-'+session.seq,leadId:session.customerId,
      customerName:session.estimate.customerName,
      serviceText:session.estimate.items.map(i=>i.name).join('・'),
      scheduledDate:d.date,startTime:d.start,endTime:d.end,
      estimateAmount:session.estimate.total,status:'confirmed',
      isDemo:true,calendarAdded:false,
      memo:'【架空検証用】Googleカレンダー未登録'
    });
    session.workOrder=copy(wo);
    session.stage='scheduled';
    return {ok:true,code:'FIXTURE_WORK_SCHEDULED',workOrder:copy(wo),
      externalCalendarWritten:false};
  }
  function completeWorkOrder(session, permit) {
    if(!session||session.stage!=='scheduled'||!session.workOrder)
      return fail('WORK_NOT_SCHEDULED','架空予定を先に承認してください。');
    if(permit!==true) return fail('PERMIT_REQUIRED','本人の作業完了承認が必要です。');
    session.workOrder=session.deps.workOrderBrain.normalizeWorkOrder({
      ...session.workOrder,status:'completed',completedAt:session.workOrder.scheduledDate+'T'+session.workOrder.endTime+':00+09:00'
    });
    session.stage='completed';
    return {ok:true,code:'FIXTURE_WORK_COMPLETED',workOrder:copy(session.workOrder)};
  }
  function prepareInvoice(session) {
    if(!session||session.stage!=='completed'||!session.workOrder)
      return fail('COMPLETION_REQUIRED','作業完了後に請求書を作成できます。');
    const brain=session.deps.documentsBrain;
    const estimate=copy(session.estimate);
    const draft=brain.convertEstimateToInvoice(estimate,[]);
    if(!draft) return fail('INVOICE_INVALID','既存Budilの請求書変換に失敗しました。');
    const invoice=brain.normalizeDocument({
      ...draft,
      id:'fixture-invoice-1',
      number:'DEMO-INV-001',
      status:'draft',
      note:'【架空デモ・未発行】実際の請求・送付・入金依頼は禁止。',
      bankInfo:'【架空デモ】振込禁止・実際の振込先情報ではありません。',
      paymentStatus:'pending',paidAmount:0,paidDate:'',
      unpaidAmount:estimate.total,expectedPaymentDate:draft.dueDate,
      linkedDocumentId:'',linkedRevenueId:''
    });
    if(invoice.total!==estimate.total||invoice.customerName!==estimate.customerName)
      return fail('INVOICE_TOTAL_MISMATCH','見積と請求書の整合性が合いません。');
    session.invoice=copy(invoice);
    session.stage='invoice_review';
    return {ok:true,code:'FIXTURE_INVOICE_DRAFT',invoice:copy(invoice)};
  }
  function approveInvoice(session,permit) {
    if(!session||session.stage!=='invoice_review'||!session.invoice)
      return fail('INVOICE_REVIEW_REQUIRED','請求書の下書きを確認してください。');
    if(permit!==true) return fail('PERMIT_REQUIRED','本人の請求書承認が必要です。');
    // Remain DRAFT; PDF download must be an additional explicit user gesture.
    session.approvedInvoice=copy(session.invoice);
    session.stage='invoice_approved';
    return {ok:true,code:'FIXTURE_INVOICE_APPROVED',invoice:copy(session.approvedInvoice),
      issued:false,persisted:false};
  }
  function approvedInvoiceForPdf(session) {
    if(!session||session.stage!=='invoice_approved'||!session.approvedInvoice)
      return fail('INVOICE_NOT_APPROVED','本人が請求書を承認してからPDFを出力してください。');
    return {ok:true,invoice:copy(session.approvedInvoice)};
  }
  function unpaidSummary(session, date) {
    if(!session||!session.ok)return fail('WORKFLOW_REQUIRED','架空の案件がありません。');
    const documents=session.invoice?[copy(session.invoice)]:[];
    const result=session.deps.paymentBrain.summarizeReceivables([],documents,date||'2026-11-13');
    return {ok:true,code:'FIXTURE_RECEIVABLES',summary:copy(result),
      confirmedBankPayment:false};
  }
  function matchFictionalBankEntry(session,entry) {
    // Merely a candidate for human verification. NEVER mark records paid here.
    if(!session||!session.invoice)return fail('INVOICE_REQUIRED','請求書が必要です。');
    const amount=entry&&entry.amount;
    const isDemo=entry&&entry.fixture===true;
    if(!isDemo||!Number.isSafeInteger(amount)||amount<=0)
      return fail('BANK_EVIDENCE_REQUIRED','確認済みの架空銀行明細を指定してください。');
    const match=amount===session.invoice.total;
    return {ok:true,code:match?'POSSIBLE_MATCH':'UNMATCHED',matchCandidate:match,
      bankPaymentConfirmed:false,paymentStatus:'pending',
      message:'金額一致は入金確定ではありません。照合結果を人間が確認してください。'};
  }
  function findDocuments(session,text) {
    if(!session||!session.ok)return fail('WORKFLOW_REQUIRED','架空案件が必要です。');
    const q=String(text||'').trim();
    if(!q||q.length>120)return fail('QUERY_INVALID','検索文字を入力してください。');
    const docs=[session.estimate,session.invoice].filter(Boolean);
    const result=docs.filter(doc=>[doc.customerName,doc.title,doc.number,
      doc.type==='invoice'?'請求書':'見積書'].some(v=>String(v||'').includes(q)));
    return {ok:true,code:'FIXTURE_SEARCH',documents:copy(result)};
  }
  const api=Object.freeze({
    DEMO_BUSY,validSlot,parseVoiceCommand,makeSession,prepareAppointment,confirmAppointment,
    completeWorkOrder,prepareInvoice,approveInvoice,approvedInvoiceForPdf,
    unpaidSummary,matchFictionalBankEntry,findDocuments
  });
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  scope.BudilGptFixtureWorkflow=api;
})(typeof window!=='undefined'?window:globalThis);
