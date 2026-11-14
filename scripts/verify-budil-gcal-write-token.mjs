import assert from 'node:assert/strict';
import {generateKeyPairSync,webcrypto,verify} from 'node:crypto';
import {GOOGLE_WRITE_EVENTS_SCOPE,GOOGLE_TOKEN_ENDPOINT,
  signCalendarWriteAssertion,exchangeCalendarWriteToken} from '../supabase/functions/budil-calendar-write/google-write-token.mjs';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048,
  publicKeyEncoding:{type:'spki',format:'pem'},
  privateKeyEncoding:{type:'pkcs8',format:'pem'}});
const credential={type:'service_account',client_email:'fictional@sample-project.iam.gserviceaccount.com',
  private_key:privateKey,token_uri:'https://evil.example/ignored'};
const now=1800000000;
let passed=0;
async function test(name,fn){await fn();console.log('PASS',name);passed++;}
const decode=x=>JSON.parse(Buffer.from(x.replace(/-/g,'+').replace(/_/g,'/'),'base64url').toString('utf8'));
await test('JWT uses the dedicated write events scope only',async()=>{
 const jwt=await signCalendarWriteAssertion(credential,{cryptography:webcrypto,nowSeconds:now});
 const [head,payload,sig]=jwt.split('.');assert.equal(decode(head).alg,'RS256');
 const claims=decode(payload);assert.equal(claims.scope,GOOGLE_WRITE_EVENTS_SCOPE);
 assert.equal(claims.aud,GOOGLE_TOKEN_ENDPOINT);assert.equal(claims.exp-claims.iat,900);
 assert.ok(!('sub' in claims));assert.ok(!claims.scope.endsWith('readonly'));
 const ok=verify('RSA-SHA256',Buffer.from(head+'.'+payload),
  publicKey,Buffer.from(sig,'base64url'));assert.equal(ok,true);
});
await test('token exchange ignores credential token_uri',async()=>{
 let requests=0;
 const fetcher=async(url,opt)=>{
  requests++;assert.equal(url,GOOGLE_TOKEN_ENDPOINT);assert.equal(opt.method,'POST');
  assert.equal(opt.redirect,'error');
  const body=new URLSearchParams(opt.body);assert.equal(body.get('grant_type'),
    'urn:ietf:params:oauth:grant-type:jwt-bearer');
  assert.equal(decode(body.get('assertion').split('.')[1]).scope,GOOGLE_WRITE_EVENTS_SCOPE);
  return {status:200,json:async()=>({token_type:'Bearer',access_token:'fictional-bearer-xyz',expires_in:900})};
 };
 const token=await exchangeCalendarWriteToken({credential,fetcher,cryptography:webcrypto,nowSeconds:now});
 assert.equal(token,'fictional-bearer-xyz');assert.equal(requests,1);
});
await test('no domain-wide delegation impersonation',async()=>{const t=await signCalendarWriteAssertion(credential,{cryptography:webcrypto,nowSeconds:now});assert.ok(!('sub' in decode(t.split('.')[1])));});
await test('reject invalid service-account email before network',async()=>{await assert.rejects(signCalendarWriteAssertion({...credential,client_email:'bad@example.com'},{cryptography:webcrypto,nowSeconds:now}));});
await test('reject credential private key omission',async()=>{await assert.rejects(signCalendarWriteAssertion({...credential,private_key:''},{cryptography:webcrypto,nowSeconds:now}));});
await test('reject wrong credential type',async()=>{await assert.rejects(signCalendarWriteAssertion({...credential,type:'authorized_user'},{cryptography:webcrypto,nowSeconds:now}));});
await test('reject readonly OAuth token response',async()=>{await assert.rejects(exchangeCalendarWriteToken({credential,fetcher:async()=>({status:403}),cryptography:webcrypto,nowSeconds:now}),e=>e.code==='WRITE_TOKEN_DENIED');});
await test('reject malformed OAuth response',async()=>{await assert.rejects(exchangeCalendarWriteToken({credential,fetcher:async()=>({status:200,json:async()=>({access_token:'too-short',expires_in:3600})}),cryptography:webcrypto,nowSeconds:now}),e=>e.code==='WRITE_TOKEN_INVALID');});
await test('network failure never retries automatically',async()=>{
 let n=0;await assert.rejects(exchangeCalendarWriteToken({credential,
  fetcher:async()=>{n++;throw Error('network')},cryptography:webcrypto,nowSeconds:now}),
  e=>e.code==='WRITE_TOKEN_OUTCOME_UNKNOWN');assert.equal(n,1);
});
console.log('BUDIL_GOOGLE_WRITE_TOKEN PASS',passed,'FAIL 0');
