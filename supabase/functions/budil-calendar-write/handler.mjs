/**
 * Inert-by-default HTTP boundary for future Budil Google Calendar writes.
 * This file does NOT create Google events. A separately reviewed durable
 * backend is mandatory before write operations can ever become available.
 */
import {authorizeCalendarWrite,cleanBearer} from './authority.mjs';
const allowedPaths=new Set(['/capability','/prepare','/approve','/commit','/result']);
const forbiddenKeys=new Set(['userId','ownerId','tenantId','tenant_id','calendarId',
 'calendar_id','writeTargetId','integrationId','secretRef','accessToken','scope',
 'resourceRole','providerUrl','credential','session','jwt']);
const noCache={'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'};
function json(status,body,cors){
  return new Response(JSON.stringify(body),{status,headers:{...noCache,...cors}});
}
export function createCalendarWriteHandler({ports,writeEnabled=false,backend=null,
 allowedOrigins=['https://teruya1229.github.io']}={}){
  const origins=new Set(allowedOrigins);
  return async function handle(req){
    const origin=req.headers.get('Origin');
    const cors=origin&&origins.has(origin)?{
      'Access-Control-Allow-Origin':origin,'Vary':'Origin',
      'Access-Control-Allow-Headers':'authorization,apikey,content-type',
      'Access-Control-Allow-Methods':'POST, OPTIONS'
    }:{};
    if(!origin||!origins.has(origin))return json(403,{ok:false,code:'ORIGIN_NOT_ALLOWED'},{});
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Cache-Control':'no-store'}});
    if(req.method!=='POST')return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'},cors);
    const path=new URL(req.url).pathname.split('/').pop();
    if(!allowedPaths.has('/'+path))return json(404,{ok:false,code:'ROUTE_INVALID'},cors);
    const token=cleanBearer(req.headers.get('Authorization'));
    if(!token)return json(401,{ok:false,code:'AUTH_REQUIRED'},cors);
    const auth=await authorizeCalendarWrite({token,ports});
    if(!auth.ok)return json(
      auth.code==='AUTH_REQUIRED'?401:
      auth.code==='AUTH_UNAVAILABLE'||auth.code==='DEPENDENCY_UNAVAILABLE'?503:403,
      {ok:false,code:auth.code},cors);
    if(path==='capability')return json(200,
      {ok:true,writeEnabled:writeEnabled===true&&backend!==null,bindingReady:true,
       calendarWritePerformed:false},cors);
    if(writeEnabled!==true)return json(423,{ok:false,code:'FEATURE_OFF',saved:false},cors);
    if(!backend||typeof backend[path]!=='function')
      return json(503,{ok:false,code:'DURABLE_BACKEND_NOT_CONNECTED',saved:false},cors);
    const size=Number(req.headers.get('content-length')||0);
    if(!Number.isFinite(size)||size>12000)return json(413,{ok:false,code:'REQUEST_TOO_LARGE'},cors);
    let body;
    try{
      const raw=await req.text();
      if(raw.length>12000)throw Error('oversize');
      body=JSON.parse(raw);
    }catch{return json(400,{ok:false,code:'REQUEST_INVALID'},cors);}
    if(!body||typeof body!=='object'||Array.isArray(body))
      return json(400,{ok:false,code:'REQUEST_INVALID'},cors);
    const check=(obj,depth)=>{
      if(depth>8||!obj||typeof obj!=='object')return false;
      if(Array.isArray(obj))return obj.length<=100&&obj.every(x=>typeof x!=='object'||x===null||check(x,depth+1));
      for(const [k,v] of Object.entries(obj)){
        if(forbiddenKeys.has(k)||k==='__proto__'||k==='constructor'||k==='prototype')return true;
        if(v&&typeof v==='object'&&check(v,depth+1))return true;
      }
      return false;
    };
    if(check(body,0))return json(400,{ok:false,code:'CLIENT_AUTHORITY_CLAIM_REJECTED'},cors);
    try{
      const result=await backend[path]({identity:auth.identity,body});
      // Never convert an ambiguous provider response to "saved".
      if(!result||typeof result!=='object'||!('status' in result))
        return json(503,{ok:false,code:'BACKEND_RESPONSE_UNVERIFIED',saved:false},cors);
      if(path==='commit'&&!(result.status==='verified'&&result.calendarUpdated===true&&
          result.readbackVerified===true&&result.unsynced===false&&
          typeof result.eventId==='string'&&typeof result.workOrderId==='string'))
        return json(409,{ok:false,code:'WRITE_RESULT_UNVERIFIED',saved:false},cors);
      return json(200,{...result,ok:true},cors);
    }catch{
      return json(409,{ok:false,code:'WRITE_OUTCOME_UNKNOWN',saved:false},cors);
    }
  };
}
