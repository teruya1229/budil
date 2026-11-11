'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const {preview}=require('./booking-preview.cjs');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const err=code=>Object.assign(new Error(code),{code});
const copy=x=>structuredClone(x);
const same=(a,b)=>hash(a)===hash(b);
const durableFlush=db=>{const result=db.flush();if(result instanceof Error||result===false)throw err('LOCAL_PERSIST_FAILED');};
// Hex is a subset of Google's lowercase base32hex alphabet (0-9, a-v).
const eventIdFor=(tenantId,workOrderId,idempotencyId)=>'b'+crypto.createHash('sha256').update(JSON.stringify([tenantId,workOrderId,idempotencyId])).digest('hex');
const eventProof=(event,{eventId,tenantId,ownerId,workOrderId,calendarId})=>!!event&&event.eventId===eventId&&event.calendarId===calendarId&&same(event.metadata,{tenantId,ownerId,workOrderId});
const hasEtag=e=>typeof e?.etag==='string'&&e.etag.length>0;
const eventMatchesOrder=(e,w)=>e.start===w.scheduledDate+'T'+w.startTime+':00+09:00'&&e.end===w.scheduledDate+'T'+w.endTime+':00+09:00'&&e.timeZone==='Asia/Tokyo';
class MemoryDb {
  constructor(){this.drafts=new Map();this.ops=new Map();this.orders=new Map();this.bindings=new Map();this.hits=new Map();this.tail=Promise.resolve();}
  async locked(fn){const prior=this.tail;let done;this.tail=new Promise(r=>done=r);await prior;try{return await fn();}finally{done();}}
  flush(){}
}
class JsonFileDb extends MemoryDb {
  constructor(path){super();this.path=path;if(fs.existsSync(path)){const data=JSON.parse(fs.readFileSync(path,'utf8'));for(const k of ['drafts','ops','orders','bindings','hits'])this[k]=new Map(data[k]||[]);}}
  flush(){const data={};for(const k of ['drafts','ops','orders','bindings','hits'])data[k]=[...this[k]];const tmp=this.path+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data),{encoding:'utf8',flag:'w',mode:0o600});fs.renameSync(tmp,this.path);}
}
class CalendarTransaction {
  constructor({db,provider,authenticate,verifyApproval,resolveCustomer,clock=()=>Date.now(),enabled=false}){
    if(!db||!provider||typeof authenticate!=='function'||typeof verifyApproval!=='function'||typeof resolveCustomer!=='function')throw err('CONFIG_INVALID');
    Object.assign(this,{db,provider,authenticate,verifyApproval,resolveCustomer,clock,enabled});
  }
  identity(session){const p=this.authenticate(session);if(!p||!p.authenticated||p.memberActive!==true||p.tenantActive!==true||!p.memberId||!p.ownerId||!p.tenantId)throw err('AUTH_REQUIRED');return p;}
  binding(p){const b=this.db.bindings.get(p.tenantId);if(!b||b.ownerId!==p.ownerId||b.tenantId!==p.tenantId||!b.calendarId||b.active!==true)throw err('OWNER_REQUIRED');if(b.readOnly||!b.writeEnabled)throw err('READ_ONLY_BINDING');return b;}
  rate(p){const now=this.clock(),key=p.tenantId+':'+p.ownerId,old=(this.db.hits.get(key)||[]).filter(t=>now-t<60000);if(old.length>=20)throw err('RATE_LIMITED');old.push(now);this.db.hits.set(key,old);}
  async prepare({session,candidate}){
    const p=this.identity(session),b=this.binding(p);this.rate(p);
    if(!candidate||typeof candidate!=='object'||candidate.ownerId!==undefined||candidate.tenantId!==undefined||candidate.writeTargetId!==undefined||candidate.targetEventId!==undefined||candidate.targetEtag!==undefined)throw err('CANDIDATE_INVALID');
    const now=this.clock(),c={...copy(candidate),ownerId:p.ownerId,tenantId:p.tenantId,writeTargetId:b.calendarId};
    const customer=await this.resolveCustomer({tenantId:p.tenantId,customerId:c.customerId});
    if(!customer||customer.id!==c.customerId||customer.name!==c.customerName||customer.active!==true)
      throw err('CUSTOMER_SELECTION_REQUIRED');
    const orders=[...this.db.orders.values()].filter(w=>w.tenantId===p.tenantId).map(w=>copy(w));
    if(c.action==='reschedule'){
      const w=this.db.orders.get(c.workOrderId);
      if(!w||w.tenantId!==p.tenantId||w.ownerId!==p.ownerId||w.calendarId!==b.calendarId||!w.eventId||!hasEtag(w)||w.eventSource!=='transaction')throw err('TARGET_UNOWNED');
      let event;try{event=await this.provider.get(b.calendarId,w.eventId);}catch{throw err('TARGET_UNVERIFIED');}
      if(!eventProof(event,{eventId:w.eventId,tenantId:p.tenantId,ownerId:p.ownerId,workOrderId:w.id,calendarId:b.calendarId}))throw err('TARGET_UNOWNED');
      if(!hasEtag(event)||event.etag!==w.etag||!eventMatchesOrder(event,w))throw err('TARGET_CHANGED');
      c.targetEventId=w.eventId;c.targetEtag=event.etag;
    }
    const busy=await this.provider.busy(b.calendarId,c.date,now);
    if(busy?.events?.length)busy.events=busy.events.filter(e=>c.action!=='reschedule'||e.eventId!==c.targetEventId).map(e=>({start:e.start,end:e.end}));
    const review=preview({candidate:c,orders,busy,nowMs:now,authorization:{ownerId:p.ownerId,tenantId:p.tenantId,writeTargetId:b.calendarId,canWrite:true}});
    if(!review.ok)throw err(review.code);
    const id=crypto.randomUUID(),draft=copy(review.draft),digest=hash(draft);
    this.db.drafts.set(id,{id,draft,digest,status:'prepared',createdAt:now});durableFlush(this.db);
    return {draftId:id,draft:copy(draft),digest,expiresAt:now+120000};
  }
  async approve({session,draftId,proof}){
    const p=this.identity(session),b=this.binding(p);this.rate(p);
    return this.db.locked(async()=>{
      const d=this.db.drafts.get(draftId);if(!d||d.status!=='prepared')throw err('DRAFT_INVALID');
      if(this.clock()-d.createdAt>120000||this.clock()<d.createdAt)throw err('APPROVAL_EXPIRED');
      if(d.digest!==hash(d.draft)||d.draft.ownerId!==p.ownerId||d.draft.tenantId!==p.tenantId||d.draft.writeTargetId!==b.calendarId)throw err('DRAFT_CHANGED');
      if(!await this.verifyApproval({proof,ownerId:p.ownerId,tenantId:p.tenantId,draftId,digest:d.digest}))throw err('OWNER_APPROVAL_REQUIRED');
      d.status='approved';d.approvedAt=this.clock();durableFlush(this.db);return {approvalId:d.id,expiresAt:d.approvedAt+120000};
    });
  }
  async commit({session,approvalId}){
    const p=this.identity(session),b=this.binding(p);this.rate(p);
    return this.db.locked(async()=>{
      if(!this.enabled)throw err('FEATURE_OFF');
      const d=this.db.drafts.get(approvalId);if(!d||d.status!=='approved')throw err('APPROVAL_INVALID');
      if(this.clock()-d.approvedAt>120000||this.clock()<d.approvedAt)throw err('APPROVAL_EXPIRED');
      if(d.digest!==hash(d.draft)||d.draft.ownerId!==p.ownerId||d.draft.tenantId!==p.tenantId||d.draft.writeTargetId!==b.calendarId)throw err('DRAFT_CHANGED');
      if(this.db.ops.has(d.id))throw err('ALREADY_ATTEMPTED');
      const c=d.draft,original=c.action==='reschedule'?this.db.orders.get(c.workOrderId):null;
      if(c.action==='reschedule'&&(!original||original.tenantId!==p.tenantId||original.ownerId!==p.ownerId||original.calendarId!==b.calendarId||original.eventSource!=='transaction'||!original.eventId||!hasEtag(original)||original.eventId!==c.targetEventId||original.etag!==c.targetEtag||!same(JSON.parse(c.targetSnapshot),original)))throw err('TARGET_CHANGED');
      if(c.action==='reschedule'){
        let current;try{current=await this.provider.get(b.calendarId,original.eventId);}catch{throw err('TARGET_UNVERIFIED');}
        if(!eventProof(current,{eventId:original.eventId,tenantId:p.tenantId,ownerId:p.ownerId,workOrderId:original.id,calendarId:b.calendarId}))throw err('TARGET_UNOWNED');
        if(!hasEtag(current)||current.etag!==c.targetEtag||!eventMatchesOrder(current,original))throw err('TARGET_CHANGED');
      }
      const orders=[...this.db.orders.values()].filter(w=>w.tenantId===p.tenantId).map(w=>copy(w));
      const now=this.clock(),busy=await this.provider.busy(b.calendarId,c.date,now);
      // For reschedule the current event may be returned by busy; exclude only the verified owned event.
      if(c.action==='reschedule'&&busy?.events?.length){
        if(!Array.isArray(busy.events))throw err('BUSY_UNVERIFIED_OR_STALE');
        busy.events=busy.events.filter(e=>e.eventId!==original.eventId).map(e=>({start:e.start,end:e.end}));
      }else if(busy?.events?.length){
        busy.events=busy.events.map(e=>({start:e.start,end:e.end}));
      }
      const review=preview({candidate:c,orders,busy,nowMs:now,authorization:{ownerId:p.ownerId,tenantId:p.tenantId,writeTargetId:b.calendarId,canWrite:true}});
      if(!review.ok)throw err(review.code);
      // Durable state must be committed before the external call. Unknown outcomes never retry automatically.
      const workOrderId=c.action==='booking'?'fictional-work-'+d.id:c.workOrderId;
      const eventId=c.action==='booking'?eventIdFor(p.tenantId,workOrderId,d.id):original.eventId;
      const metadata={tenantId:p.tenantId,ownerId:p.ownerId,workOrderId};
      const op={id:d.id,status:'indeterminate',action:c.action,ownerId:p.ownerId,tenantId:p.tenantId,calendarId:b.calendarId,eventId,workOrderId,expected:{start:c.date+'T'+c.startTime+':00+09:00',end:c.date+'T'+c.endTime+':00+09:00',timeZone:'Asia/Tokyo',metadata}};this.db.ops.set(d.id,op);d.status='attempted';try{durableFlush(this.db);}catch{this.db.ops.delete(d.id);d.status='approved';throw err('ATTEMPT_PERSIST_FAILED');}
      let response;
      try{
        response=c.action==='booking'?await this.provider.create(b.calendarId,{eventId,...op.expected},d.id):await this.provider.update(b.calendarId,eventId,op.expected,{ifMatch:c.targetEtag,idempotencyId:d.id});
      }catch(e){op.status=e?.status===412||e?.code===412||e?.code==='PRECONDITION_FAILED'||e?.code==='CONFLICT_ETAG'?'conflict':'indeterminate';try{durableFlush(this.db);}catch{op.status='indeterminate';}throw err(op.status==='conflict'?'TARGET_CHANGED':'PROVIDER_OUTCOME_UNKNOWN');}
      if(response?.eventId!==eventId){op.status='indeterminate';try{durableFlush(this.db);}catch{}throw err('PROVIDER_RESPONSE_UNVERIFIED');}
      let actual;try{actual=await this.provider.get(b.calendarId,eventId);}catch{op.status='indeterminate';try{durableFlush(this.db);}catch{}throw err('READBACK_UNKNOWN');}
      if(!eventProof(actual,{eventId,tenantId:p.tenantId,ownerId:p.ownerId,workOrderId,calendarId:b.calendarId})||!same(op.expected,{start:actual.start,end:actual.end,timeZone:actual.timeZone,metadata:actual.metadata})||!hasEtag(actual)||(c.action==='reschedule'&&actual.etag===c.targetEtag)){op.status='mismatch';try{durableFlush(this.db);}catch{op.status='indeterminate';}throw err('READBACK_MISMATCH');}
      const order={id:workOrderId,tenantId:p.tenantId,ownerId:p.ownerId,calendarId:b.calendarId,eventId,etag:actual.etag,eventSource:'transaction',customerId:c.customerId,customerName:c.customerName,serviceText:c.serviceText,scheduledDate:c.date,startTime:c.startTime,endTime:c.endTime,status:'confirmed'};
      const previous=this.db.orders.get(workOrderId);this.db.orders.set(workOrderId,order);op.status='verified';try{durableFlush(this.db);}catch{op.status='indeterminate';if(previous)this.db.orders.set(workOrderId,previous);else this.db.orders.delete(workOrderId);try{durableFlush(this.db);}catch{}throw err('LOCAL_PERSIST_UNKNOWN');}
      return {status:'verified',workOrderId,eventId,etag:actual.etag,order:copy(order),calendarUpdated:true,readbackVerified:true,unsynced:false};
    });
  }
  async reconcile({session,approvalId}){
    const p=this.identity(session),b=this.binding(p);
    return this.db.locked(async()=>{
      const op=this.db.ops.get(approvalId);
      if(!op||!['booking','reschedule'].includes(op.action)||op.status!=='indeterminate'||op.ownerId!==p.ownerId||op.tenantId!==p.tenantId||op.calendarId!==b.calendarId)throw err('RECONCILE_UNAVAILABLE');
      let actual;try{actual=await this.provider.get(b.calendarId,op.eventId);}catch{return {status:'indeterminate',operatorInspectionRequired:true};}
      if(!eventProof(actual,{eventId:op.eventId,tenantId:p.tenantId,ownerId:p.ownerId,workOrderId:op.workOrderId,calendarId:b.calendarId})||!same(op.expected,{start:actual.start,end:actual.end,timeZone:actual.timeZone,metadata:actual.metadata})||!hasEtag(actual))return {status:'indeterminate',operatorInspectionRequired:true};
      const d=this.db.drafts.get(approvalId);if(!d||d.digest!==hash(d.draft))return {status:'indeterminate',operatorInspectionRequired:true};
      const c=d.draft;
      const prior=this.db.orders.get(op.workOrderId);
      if(op.action==='reschedule'&&(!prior||prior.tenantId!==p.tenantId||prior.ownerId!==p.ownerId||prior.calendarId!==b.calendarId||prior.eventId!==op.eventId||prior.etag!==c.targetEtag))return {status:'indeterminate',operatorInspectionRequired:true};
      this.db.orders.set(op.workOrderId,{id:op.workOrderId,tenantId:p.tenantId,ownerId:p.ownerId,calendarId:b.calendarId,eventId:op.eventId,etag:actual.etag,eventSource:'transaction',customerId:c.customerId,customerName:c.customerName,serviceText:c.serviceText,scheduledDate:c.date,startTime:c.startTime,endTime:c.endTime,status:'confirmed'});
      op.status='verified';try{durableFlush(this.db);}catch{op.status='indeterminate';if(prior)this.db.orders.set(op.workOrderId,prior);else this.db.orders.delete(op.workOrderId);try{durableFlush(this.db);}catch{}throw err('LOCAL_PERSIST_UNKNOWN');}return {status:'verified',workOrderId:op.workOrderId,eventId:op.eventId,etag:actual.etag,order:copy(this.db.orders.get(op.workOrderId)),calendarUpdated:true,readbackVerified:true,unsynced:false};
    });
  }
  result({session,approvalId}){const p=this.identity(session),op=this.db.ops.get(approvalId);if(!op||op.tenantId!==p.tenantId||op.ownerId!==p.ownerId)throw err('RESULT_UNAVAILABLE');return copy({status:op.status,workOrderId:op.workOrderId||null,eventId:op.eventId||null,calendarUpdated:op.status==='verified',readbackVerified:op.status==='verified',unsynced:op.status!=='verified'});}
}
module.exports={CalendarTransaction,MemoryDb,JsonFileDb,eventIdFor};
