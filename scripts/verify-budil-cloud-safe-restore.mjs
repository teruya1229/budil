import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {BudilCloudRestore:R}=require('../js/budil-cloud-restore.js');
const keys=['budil_leads','budil_documents'];
const oldLeads=[{id:'old',name:'架空・既存'}],newLeads=[{id:'new',name:'架空・復元'}];
const oldDocs=[{id:'old-doc'}],newDocs=[{id:'new-doc'}];
function fixture(){
  const map=new Map([
    ['budil_leads',JSON.stringify(oldLeads)],
    ['budil_documents',JSON.stringify(oldDocs)]
  ]);
  let setCount=0,failAt=-1;
  const storage={
    getItem:k=>map.has(k)?map.get(k):null,
    setItem(k,v){setCount++;if(setCount===failAt)throw Error('fixture_quota');map.set(k,v);},
    removeItem:k=>map.delete(k)
  };
  const backup={
    BACKUP_KEYS:keys,
    exportPayload(){
      const data={};
      for(const k of keys){const v=storage.getItem(k);if(v!==null)data[k]=JSON.parse(v);}
      return {app:'Budil',version:'4.0',appVersion:'v4.13.20',backupVersion:'v4.13.20',
        exportedAt:'2026-11-06T00:00:00.000Z',dataKeys:Object.keys(data),data};
    },
    validatePayload(p){
      if(!p || !p.data || Object.keys(p.data).some(k=>!keys.includes(k)))
        return {valid:false};
      return {valid:true,keys:Object.keys(p.data)};
    }
  };
  const engine=R.make({dataBackup:backup,localStorage:storage,webCrypto:webcrypto});
  return {storage,backup,engine,map,failNext(n){failAt=setCount+n;}};
}
async function remote(extra){
  const payload={
    app:'Budil',version:'4.0',appVersion:'v4.13.20',backupVersion:'v4.13.20',
    exportedAt:'2026-11-06T09:00:00.000Z',dataKeys:keys,
    data:{budil_leads:newLeads,budil_documents:newDocs}
  };
  const original={snapshotId:'b32c7fea-3a82-4628-b7cc-10e185d3e7b0',
    createdAt:'2026-11-06T09:01:00.000Z',
    contentHash:await R.digest(payload,webcrypto),payload};
  return {...original,...extra};
}
let passed=0;async function check(name,fn){await fn();passed++;console.log('PASS '+name);}
await check('preview returns only aggregate with zero writes',async()=>{
  const f=fixture(),o=await f.engine.preview(await remote());
  assert.equal(o.ok,true);assert.equal(o.keyCount,2);assert.equal(o.changed,true);
  assert.equal(o.localItems,2);assert.equal(o.remoteItems,2);
  assert.equal(f.storage.getItem('budil_leads'),JSON.stringify(oldLeads));
  assert.equal(JSON.stringify(o).includes('架空'),false);
});
await check('explicit permit AND current JSON backup confirmation required',async()=>{
  const f=fixture(),latest=await remote();
  await f.engine.preview(latest);
  assert.equal((await f.engine.apply({snapshotId:latest.snapshotId,permit:false,backupSaved:true})).ok,false);
  assert.equal((await f.engine.apply({snapshotId:latest.snapshotId,permit:true,backupSaved:false})).ok,false);
  assert.equal(f.storage.getItem('budil_leads'),JSON.stringify(oldLeads));
});
await check('confirmed apply writes only allowlisted keys and reads them back',async()=>{
  const f=fixture(),latest=await remote();
  assert.equal((await f.engine.preview(latest)).ok,true);
  const a=await f.engine.apply({snapshotId:latest.snapshotId,permit:true,backupSaved:true});
  assert.equal(a.ok,true);assert.equal(a.restoredKeys,2);assert.equal(a.cloudWritePerformed,false);
  assert.equal(f.storage.getItem('budil_leads'),JSON.stringify(newLeads));
  assert.equal(f.storage.getItem('budil_documents'),JSON.stringify(newDocs));
  assert.equal((await f.engine.apply({snapshotId:latest.snapshotId,permit:true,backupSaved:true})).ok,false);
});
await check('remote content SHA mismatch never reaches writes',async()=>{
  const f=fixture(),latest=await remote({contentHash:'0'.repeat(64)});
  const o=await f.engine.preview(latest);
  assert.equal(o.code,'snapshot_hash_mismatch');
  assert.equal(f.storage.getItem('budil_leads'),JSON.stringify(oldLeads));
});
await check('malicious or unknown storage key refused',async()=>{
  const f=fixture(),latest=await remote();
  latest.payload.data.__proto__ = null;
  latest.payload.data.budil_unknown = [{unsafe:true}];
  latest.contentHash=await R.digest(latest.payload,webcrypto);
  assert.equal((await f.engine.preview(latest)).code,'unsafe_backup_keys');
});
await check('changed local records stop stale preview from clobbering',async()=>{
  const f=fixture(),latest=await remote();
  await f.engine.preview(latest);
  f.storage.setItem('budil_leads',JSON.stringify([{id:'new-local'}]));
  const a=await f.engine.apply({snapshotId:latest.snapshotId,permit:true,backupSaved:true});
  assert.equal(a.code,'local_data_changed');
  assert.equal(JSON.parse(f.storage.getItem('budil_leads'))[0].id,'new-local');
});
await check('partial quota failure rolls back all prior keys',async()=>{
  const f=fixture(),latest=await remote();
  await f.engine.preview(latest);f.failNext(2);
  const a=await f.engine.apply({snapshotId:latest.snapshotId,permit:true,backupSaved:true});
  assert.equal(a.code,'restore_rolled_back');assert.equal(a.rollbackSucceeded,true);
  assert.equal(f.storage.getItem('budil_leads'),JSON.stringify(oldLeads));
  assert.equal(f.storage.getItem('budil_documents'),JSON.stringify(oldDocs));
});
await check('clearing preview invalidates confirmation',async()=>{
  const f=fixture(),latest=await remote();
  await f.engine.preview(latest);f.engine.clear();
  assert.equal((await f.engine.apply({snapshotId:latest.snapshotId,permit:true,backupSaved:true})).code,'preview_required');
});
await check('no backup means fail closed',async()=>{
  const f=fixture();assert.equal((await f.engine.preview(null)).ok,false);
});
await check('cloud request authenticated GET only and no local write',async()=>{
  const source=readFileSync('js/budil-cloud.js','utf8');
  const calls=[];
  const session=new Map([['budil-cloud.auth.v1.session',
    JSON.stringify({access_token:'fixture-token',refresh_token:'fixture-refresh',
      env:'production',expires_at:Math.floor(Date.now()/1000)+3600})]]);
  const latest=await remote();
  const ctx={window:null,Date,Math,JSON,Promise,URL,TextEncoder,AbortController,
    location:{hostname:'teruya1229.github.io'},
    setTimeout,clearTimeout,
    sessionStorage:{getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v),
      removeItem:k=>session.delete(k)},
    fetch:async (url,init)=>{
      calls.push({url,init});
      return {status:200,text:async()=>JSON.stringify({ok:true,latest})};
    }};
  ctx.window=ctx;vm.runInNewContext(source,ctx);
  const got=await ctx.BudilCloud.fetchLatestPayload();
  assert.equal(got.ok,true);assert.equal(got.latest.snapshotId,latest.snapshotId);
  assert.equal(calls.length,1);assert.equal(calls[0].init.method,'GET');
  assert.equal(calls[0].init.body,undefined);
  assert.ok(calls[0].url.endsWith('/budil-backups/latest/payload'));
  assert.equal(calls[0].init.headers.Authorization,'Bearer fixture-token');
  assert.ok(!JSON.stringify(got).includes('fixture-token'));
});
console.log('BUDIL_CLOUD_SAFE_RESTORE '+passed+'/10 PASS');
