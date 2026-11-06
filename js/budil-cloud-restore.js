/**
 * Budil Cloud Restore: explicit 2-phase restore of immutable cloud snapshots.
 * Preview/download alone never changes local data. Only an additional explicit
 * confirmation permits writes to existing DataBackup.BACKUP_KEYS, with rollback.
 */
const BudilCloudRestore=(()=>{
  'use strict';
  const fail=code=>Object.freeze({ok:false,code,persisted:false});
  function stableSort(value){
    if(value===null||typeof value!=='object')return value;
    if(Array.isArray(value))return value.map(stableSort);
    const out=Object.create(null);
    for(const key of Object.keys(value).sort())out[key]=stableSort(value[key]);
    return out;
  }
  function canonical(value){return JSON.stringify(stableSort(value));}
  async function digest(value,webCrypto){
    const bytes=new TextEncoder().encode(canonical(value));
    const raw=await webCrypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(raw)).map(v=>v.toString(16).padStart(2,'0')).join('');
  }
  function make({dataBackup,localStorage,webCrypto}={}){
    if(!dataBackup || typeof dataBackup.exportPayload!=='function' ||
       typeof dataBackup.validatePayload!=='function' ||
       !Array.isArray(dataBackup.BACKUP_KEYS) ||
       !localStorage || typeof localStorage.getItem!=='function' ||
       typeof localStorage.setItem!=='function' ||
       !webCrypto || !webCrypto.subtle)
      return Object.freeze({
        preview:async()=>fail('dependency_missing'),
        apply:async()=>fail('dependency_missing'),
        clear:()=>{}
      });
    const allowed=new Set(dataBackup.BACKUP_KEYS);
    let pending=null;
    let busy=false;
    function clear(){pending=null;}
    async function localFingerprint(){
      const result=dataBackup.exportPayload();
      if(!result||!result.data||typeof result.data!=='object')
        throw Error('local_export_unavailable');
      return digest(result.data,webCrypto);
    }
    async function preview(latest){
      if(busy)return fail('operation_busy');
      busy=true;
      pending=null;
      try{
        if(!latest||typeof latest!=='object'||Array.isArray(latest) ||
           typeof latest.snapshotId!=='string'||!latest.snapshotId ||
           !/^[0-9a-f]{64}$/.test(String(latest.contentHash||'')) ||
           !latest.payload||typeof latest.payload!=='object' ||
           Array.isArray(latest.payload))
          return fail('invalid_snapshot');
        const payload=latest.payload;
        if(payload.app!=='Budil'||payload.version!=='4.0' ||
           !payload.data||typeof payload.data!=='object'||Array.isArray(payload.data))
          return fail('unsupported_snapshot');
        const keys=Object.keys(payload.data);
        if(!keys.length||keys.length>allowed.size||
           !keys.every(k=>allowed.has(k)))
          return fail('unsafe_backup_keys');
        const validated=dataBackup.validatePayload(payload);
        if(!validated || validated.valid!==true)return fail('invalid_backup');
        if(canonical(payload).length>8*1024*1024)return fail('snapshot_too_large');
        const expected=String(latest.contentHash);
        const computed=await digest(payload,webCrypto);
        if(computed!==expected)return fail('snapshot_hash_mismatch');
        const localHash=await localFingerprint();
        // Retain the source object only in volatile memory until user chooses
        // to apply, never localStorage/sessionStorage or hidden elements.
        pending={snapshotId:latest.snapshotId,payload,keys,hash:expected,localHash};
        const before=dataBackup.exportPayload().data;
        const remoteCount=keys.reduce((n,k)=>n+(Array.isArray(payload.data[k])?payload.data[k].length:0),0);
        const localCount=keys.reduce((n,k)=>n+(Array.isArray(before[k])?before[k].length:0),0);
        return Object.freeze({
          ok:true,snapshotId:latest.snapshotId,
          createdAt:String(latest.createdAt||''),
          backupVersion:String(payload.backupVersion||''),
          changed:computed!==(await digest(dataBackup.exportPayload(),webCrypto)),
          keyCount:keys.length,remoteItems:remoteCount,localItems:localCount,
          requiresSavedLocalBackup:true,requiresConfirmation:true,
          persisted:false,networkUsed:false
        });
      }catch(_){pending=null;return fail('preview_failed');}
      finally{busy=false;}
    }
    async function apply({snapshotId,permit,backupSaved}={}){
      if(busy)return fail('operation_busy');
      if(permit!==true||backupSaved!==true)return fail('explicit_confirmation_required');
      if(!pending||snapshotId!==pending.snapshotId)return fail('preview_required');
      busy=true;
      try{
        if((await localFingerprint())!==pending.localHash)return fail('local_data_changed');
        const keys=pending.keys;
        const before=keys.map(k=>({key:k,value:localStorage.getItem(k)}));
        const values=keys.map(k=>({
          key:k,raw:JSON.stringify(pending.payload.data[k])
        }));
        if(values.some(x=>x.raw===undefined))return fail('invalid_restore_value');
        try{
          for(const item of values)localStorage.setItem(item.key,item.raw);
          for(const item of values){
            if(localStorage.getItem(item.key)!==item.raw)
              throw Error('readback_mismatch');
          }
        }catch(_){
          let rolledBack=true;
          for(const old of before){
            try{
              if(old.value===null)localStorage.removeItem(old.key);
              else localStorage.setItem(old.key,old.value);
            }catch(_){rolledBack=false;}
          }
          return Object.freeze({ok:false,code:rolledBack?'restore_rolled_back':'rollback_failed',
            persisted:!rolledBack,rollbackSucceeded:rolledBack});
        }
        const accepted=pending.snapshotId;
        pending=null;
        return Object.freeze({ok:true,code:'restored_local',
          snapshotId:accepted,restoredKeys:keys.length,requiresReload:true,
          cloudWritePerformed:false,externalSendPerformed:false});
      }catch(_){return fail('restore_failed');}
      finally{busy=false;}
    }
    return Object.freeze({preview,apply,clear});
  }
  return Object.freeze({make,canonical,digest});
})();
if(typeof module!=='undefined'&&module.exports)module.exports={BudilCloudRestore};
