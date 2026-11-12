/**
 * Google service-account JWT exchange for a future dedicated Calendar WRITE integration.
 * Separate from Budil's currently deployed calendar.events.readonly token exchanger.
 * Uses an explicitly provided server secret; never accepts user-scoped token settings.
 * This is not deployed and is not called by the default-OFF Edge entrypoint.
 */
export const GOOGLE_WRITE_EVENTS_SCOPE='https://www.googleapis.com/auth/calendar.events';
export const GOOGLE_TOKEN_ENDPOINT='https://oauth2.googleapis.com/token';
const fail=code=>Object.assign(new Error(code),{code});
const encodeJson=value=>btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const emailPattern=/^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.iam\.gserviceaccount\.com$/;
function pemBytes(pem){
  if(typeof pem!=='string'||pem.length<100||pem.length>12000||
    !pem.startsWith('-----BEGIN PRIVATE KEY-----')||
    !pem.trimEnd().endsWith('-----END PRIVATE KEY-----'))throw fail('WRITE_SECRET_INVALID');
  const content=pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  if(!/^[a-zA-Z0-9+/]+={0,2}$/.test(content))throw fail('WRITE_SECRET_INVALID');
  try{
    const raw=atob(content);
    return Uint8Array.from(raw,c=>c.charCodeAt(0));
  }catch{throw fail('WRITE_SECRET_INVALID');}
}
export async function signCalendarWriteAssertion(credential,
 {cryptography=globalThis.crypto,nowSeconds=Math.floor(Date.now()/1000)}={}){
  if(!credential||typeof credential!=='object'||Array.isArray(credential)||
    credential.type!=='service_account'||!emailPattern.test(credential.client_email||'')||
    !Number.isSafeInteger(nowSeconds)||nowSeconds<1700000000)
    throw fail('WRITE_SECRET_INVALID');
  if(!cryptography?.subtle?.importKey||!cryptography?.subtle?.sign)
    throw fail('CRYPTO_UNAVAILABLE');
  const bytes=pemBytes(credential.private_key);
  let privateKey;
  try{
    privateKey=await cryptography.subtle.importKey('pkcs8',bytes,
      {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  }catch{throw fail('WRITE_SECRET_INVALID');}
  const header={alg:'RS256',typ:'JWT'};
  const claims={iss:credential.client_email,scope:GOOGLE_WRITE_EVENTS_SCOPE,
    aud:GOOGLE_TOKEN_ENDPOINT,iat:nowSeconds,exp:nowSeconds+900};
  const unsigned=encodeJson(header)+'.'+encodeJson(claims);
  let signature;
  try{signature=await cryptography.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,
    new TextEncoder().encode(unsigned));}
  catch{throw fail('SIGNING_FAILED');}
  const signBytes=new Uint8Array(signature);
  const encodedSignature=btoa(String.fromCharCode(...signBytes))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return unsigned+'.'+encodedSignature;
}
export async function exchangeCalendarWriteToken({
  credential,fetcher=fetch,cryptography=globalThis.crypto,
  nowSeconds=Math.floor(Date.now()/1000),timeoutMs=12000
}={}){
  if(typeof fetcher!=='function'||!Number.isSafeInteger(timeoutMs)||
    timeoutMs<500||timeoutMs>30000)throw fail('WRITE_TOKEN_CONFIG_INVALID');
  const assertion=await signCalendarWriteAssertion(credential,{cryptography,nowSeconds});
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  let response;
  try{
    response=await fetcher(GOOGLE_TOKEN_ENDPOINT,{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',
        Accept:'application/json'},
      body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion}).toString(),
      redirect:'error',cache:'no-store',signal:controller.signal
    });
  }catch{throw fail('WRITE_TOKEN_OUTCOME_UNKNOWN');}
  finally{clearTimeout(timer);}
  if(!response||response.status!==200)throw fail('WRITE_TOKEN_DENIED');
  let data;
  try{data=await response.json();}catch{throw fail('WRITE_TOKEN_INVALID');}
  if(!data||data.token_type!=='Bearer'||typeof data.access_token!=='string'||
    data.access_token.length<8||/\s/.test(data.access_token)||
    !Number.isSafeInteger(data.expires_in)||data.expires_in<60||data.expires_in>3600)
    throw fail('WRITE_TOKEN_INVALID');
  return data.access_token;
}
