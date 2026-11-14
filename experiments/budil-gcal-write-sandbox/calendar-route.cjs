'use strict';
// Mount only behind BudilCloud JWT verification. No schema migration or Google
// credential loading occurs here. The caller supplies the durable SQL-backed db
// and server-only Google provider; MemoryDb is suitable for tests only.
const crypto=require('node:crypto');
const {CalendarTransaction}=require('./transaction.cjs');
const serverIdentity=Symbol('verified-server-identity');
function createCalendarRoute({db,provider,verifyJwt,lookupMember,resolveCustomer,enabled=false,clock=()=>Date.now()}){
  if(!db||!provider||typeof verifyJwt!=='function'||typeof lookupMember!=='function'||typeof resolveCustomer!=='function')throw Error('CONFIG_INVALID');
  const challenges=new Map();
  const transaction=new CalendarTransaction({db,provider,resolveCustomer,clock,enabled,
    authenticate:s=>s?.[serverIdentity]||null,
    verifyApproval:({proof,ownerId,tenantId,draftId,digest})=>{
      const c=challenges.get(draftId);challenges.delete(draftId);
      return !!c&&c.ownerId===ownerId&&c.tenantId===tenantId&&c.digest===digest&&
        clock()<=c.expiresAt&&proof?.digest===digest&&proof?.challenge===c.nonce;
    }});
  async function route(req,res){
    const path=new URL(req.url,'http://localhost').pathname.replace(/^\/api\/calendar-write\/v1/,'');
    const write=['/prepare','/approve','/commit','/result'].includes(path);
    const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    if(!((path==='/capability'&&req.method==='GET')||(write&&req.method==='POST')))
      return send(404,{code:'ROUTE_INVALID'});
    try{
      const authorization=String(req.headers.authorization||'');
      if(!/^Bearer [^\s]+$/.test(authorization))throw Object.assign(Error('AUTH_REQUIRED'),{code:'AUTH_REQUIRED'});
      const claims=await verifyJwt(authorization.slice(7));
      if(!claims?.sub||!claims?.exp||claims.exp*1000<=clock())throw Object.assign(Error('AUTH_REQUIRED'),{code:'AUTH_REQUIRED'});
      const identity=await lookupMember(claims.sub); // tenant/owner derive only from server membership
      if(!identity?.authenticated||!identity.memberActive||!identity.tenantActive||
        !identity.memberId||!identity.ownerId||!identity.tenantId)
        throw Object.assign(Error('AUTH_REQUIRED'),{code:'AUTH_REQUIRED'});
      const session=Object.freeze({[serverIdentity]:Object.freeze({...identity})});
      if(path==='/capability')return send(200,{enabled:enabled===true,authenticated:true,tenantBound:true});
      let input='';for await(const chunk of req){input+=chunk;if(input.length>12000)throw Object.assign(Error('REQUEST_TOO_LARGE'),{code:'REQUEST_TOO_LARGE'});}
      let body;try{body=JSON.parse(input);}catch{throw Object.assign(Error('JSON_INVALID'),{code:'JSON_INVALID'});}
      if(!body||typeof body!=='object'||Array.isArray(body)||body.session||body.tenantId||body.ownerId)
        throw Object.assign(Error('REQUEST_INVALID'),{code:'REQUEST_INVALID'});
      if(path==='/prepare'){
        const r=await transaction.prepare({session,candidate:body.candidate});
        const nonce=crypto.randomUUID();challenges.set(r.draftId,{nonce,digest:r.digest,
          ownerId:identity.ownerId,tenantId:identity.tenantId,expiresAt:r.expiresAt});
        return send(200,{status:'prepared',...r,challenge:nonce});
      }
      if(path==='/approve'){
        const snapshotDigest=body.snapshot&&typeof body.snapshot==='object'&&!Array.isArray(body.snapshot)
          ?crypto.createHash('sha256').update(JSON.stringify(body.snapshot)).digest('hex'):'';
        if(typeof body.draftId!=='string'||typeof body.digest!=='string'||typeof body.challenge!=='string'||
          snapshotDigest!==body.digest||body.confirmation!=='I_APPROVE_CALENDAR_CHANGE')
          throw Object.assign(Error('OWNER_APPROVAL_REQUIRED'),{code:'OWNER_APPROVAL_REQUIRED'});
        const r=await transaction.approve({session,draftId:body.draftId,
          proof:{digest:body.digest,challenge:body.challenge}});
        return send(200,{status:'approved',...r});
      }
      if(path==='/commit')return send(200,await transaction.commit({session,approvalId:body.approvalId}));
      if(path==='/result'){
        const r=transaction.result({session,approvalId:body.approvalId});
        const order=r.status==='verified'?db.orders.get(r.workOrderId):null;
        return send(200,{...r,order:order||null});
      }
    }catch(e){
      const code=String(e?.code||'SERVER_UNVERIFIED');
      return send(code==='AUTH_REQUIRED'?403:code==='TARGET_CHANGED'?412:409,{code,saved:false});
    }
  }
  return {route,transaction};
}
module.exports={createCalendarRoute};
