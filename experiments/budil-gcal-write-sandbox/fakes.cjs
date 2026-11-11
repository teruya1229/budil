'use strict';
const {MemoryDb}=require('./transaction.cjs');
class FakeProvider {
  constructor(){this.events=new Map();this.calls={create:0,update:0,get:0,busy:0,delete:0};this.fault=null;this.sequence=0;this.beforeUpdate=null;}
  async busy(calendarId,date,now){this.calls.busy++;if(this.fault==='busyUnknown')return {ok:false};const events=[...this.events.values()].filter(e=>e.calendarId===calendarId&&e.start.slice(0,10)===date).map(({eventId,start,end})=>({eventId,start,end}));return {ok:true,readOnly:true,calendarWritePerformed:false,customerRecordsSent:false,date,checkedAtMs:now,events};}
  async create(calendarId,payload){this.calls.create++;if(this.fault==='network')throw Error('network');const {eventId}=payload;if(!/^[0-9a-v]{5,1024}$/.test(eventId))throw Error('invalid event id');if(this.events.has(eventId))throw Object.assign(Error('conflict'),{status:409});const event={calendarId,...payload,etag:'"fake-'+(++this.sequence)+'"'};this.events.set(eventId,event);if(this.fault==='responseLost')throw Error('response lost');return {eventId};}
  async update(calendarId,eventId,payload,options){this.calls.update++;if(this.beforeUpdate)await this.beforeUpdate(eventId,this);if(this.fault==='network')throw Error('network');const old=this.events.get(eventId);if(!old||old.calendarId!==calendarId)throw Error('unknown event');if(!options?.ifMatch||old.etag!==options.ifMatch||this.fault==='precondition')throw Object.assign(Error('precondition'),{status:412});this.events.set(eventId,{calendarId,eventId,...payload,etag:'"fake-'+(++this.sequence)+'"'});if(this.fault==='responseLost')throw Error('response lost');return {eventId};}
  async get(calendarId,eventId){this.calls.get++;if(this.fault==='readError')throw Error('read error');const e=this.events.get(eventId);if(!e||e.calendarId!==calendarId)return null;if(this.fault==='mismatch')return {...e,start:'2099-01-03T09:00:00+09:00'};return {...e};}
  async delete(calendarId,eventId){this.calls.delete++;const e=this.events.get(eventId);if(!e||e.calendarId!==calendarId)return false;return this.events.delete(eventId);}
}
class FaultDb extends MemoryDb {
  constructor(){super();this.flushCount=0;this.failAt=new Set();this.failureMode='throw';}
  flush(){this.flushCount++;if(this.failAt.has(this.flushCount)){this.failAt.delete(this.flushCount);if(this.failureMode==='return')return Error('fictional flush failure');throw Error('fictional flush failure');}}
}
function fixture({enabled=true,now=Date.parse('2099-01-01T00:00:00+09:00')}={}){
  const db=new MemoryDb(),provider=new FakeProvider(),sessions=new Map([['owner',{authenticated:true,memberActive:true,tenantActive:true,memberId:'member-owner',ownerId:'owner-fake',tenantId:'tenant-fake'}],['other',{authenticated:true,memberActive:true,tenantActive:true,memberId:'member-other',ownerId:'other-fake',tenantId:'tenant-fake'}],['foreign',{authenticated:true,memberActive:true,tenantActive:true,memberId:'member-foreign',ownerId:'owner-fake',tenantId:'foreign-fake'}]]),proofs=new Map();
  db.bindings.set('tenant-fake',{tenantId:'tenant-fake',ownerId:'owner-fake',calendarId:'calendar-fake',active:true,writeEnabled:true,readOnly:false});
  const {CalendarTransaction}=require('./transaction.cjs');let tick=now;
  const service=new CalendarTransaction({db,provider,enabled,clock:()=>tick,authenticate:s=>sessions.get(s),resolveCustomer:({tenantId,customerId})=>tenantId==='tenant-fake'&&customerId==='fictional-customer-1'?{id:customerId,name:'Fictional Customer',active:true}:null,verifyApproval:({proof,ownerId,tenantId,draftId,digest})=>{const x=proofs.get(proof);return !!x&&x.ownerId===ownerId&&x.tenantId===tenantId&&x.draftId===draftId&&x.digest===digest;}});
  return {db,provider,service,sessions,proofs,setTime:n=>{tick=n},advance:n=>{tick+=n},getTime:()=>tick,grant:d=>{const proof='server-proof-'+d.draftId;proofs.set(proof,{ownerId:'owner-fake',tenantId:'tenant-fake',draftId:d.draftId,digest:d.digest});return proof}};
}
module.exports={FakeProvider,FaultDb,fixture};
