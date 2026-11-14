/**
 * Diagnostic HTTP boundary for Budil Calendar WRITE service account.
 * Owner JWT is verified again by the probe. Only a fixed first-party Origin.
 * Never registers/updates/deletes Google events; response contains stage+code ONLY.
 */
import {cleanBearer} from './authority.mjs';
import {probeGoogleWriteCredential} from './diagnostic.mjs';
const fixedOrigin='https://teruya1229.github.io';
const response=(status,body,origin='')=>new Response(JSON.stringify(body),{
 status,headers:{'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store',...(origin===fixedOrigin?{
    'Access-Control-Allow-Origin':fixedOrigin,'Vary':'Origin',
    'Access-Control-Allow-Headers':'authorization,apikey,content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS'}:{})}
});
const deny=(status,code,origin)=>response(status,{ok:false,stage:'boundary',code,
 writeEnabled:false,calendarWritePerformed:false},origin);
export function createDiagnosticHttpHandler({ports,readSecret,
 probe=probeGoogleWriteCredential}={}){
 if(!ports||typeof readSecret!=='function'||typeof probe!=='function')
   throw Error('DIAGNOSTIC_CONFIGURATION_INVALID');
 return async req=>{
  const origin=req.headers.get('Origin');
  if(origin!==fixedOrigin)return deny(403,'ORIGIN_NOT_ALLOWED','');
  const url=new URL(req.url);
  if(!url.pathname.endsWith('/diagnostic'))
    return deny(404,'DIAGNOSTIC_ROUTE_NOT_FOUND',origin);
  if(req.method==='OPTIONS')
    return new Response(null,{status:204,headers:{
      'Cache-Control':'no-store','Access-Control-Allow-Origin':fixedOrigin,
      'Access-Control-Allow-Methods':'POST, OPTIONS',
      'Access-Control-Allow-Headers':'authorization,apikey,content-type',
      Vary:'Origin'
    }});
  if(req.method!=='POST')return deny(405,'METHOD_NOT_ALLOWED',origin);
  const token=cleanBearer(req.headers.get('Authorization'));
  if(!token)return deny(401,'OWNER_AUTH_REQUIRED',origin);
  // No body is read: customer data and client-provided authority are ignored.
  let result;
  try{result=await probe({token,ports,readSecret});}
  catch{return deny(503,'DIAGNOSTIC_UNAVAILABLE',origin);}
  if(!result||typeof result.ok!=='boolean'||typeof result.stage!=='string'||
    typeof result.code!=='string')
    return deny(503,'DIAGNOSTIC_UNAVAILABLE',origin);
  const status=result.ok?200:
    ['owner','binding'].includes(result.stage)?403:503;
  // Strict output whitelist; never spread the result of a secret-consuming call.
  return response(status,{ok:result.ok,stage:result.stage,code:result.code,
    writeEnabled:false,calendarWritePerformed:false},origin);
 };
}
