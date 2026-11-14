'use strict';
// Production database port: caller supplies an authenticated transaction client.
// This module contains no connection string, client constructor, or network call.
const code=x=>Object.assign(new Error(x),{code:x});
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
class AtomicLedger {
  constructor(tx){if(!tx||typeof tx.query!=='function')throw code('TX_REQUIRED');this.tx=tx;}
  async claim({tenantId,operation,idempotencyKey,digest,workOrderId,calendarId,eventId}){
    if(!tenantId||!['booking','reschedule'].includes(operation)||!hex(idempotencyKey)||
      !hex(digest)||!workOrderId||!calendarId||!eventId)throw code('CLAIM_INVALID');
    const inserted=await this.tx.query(`INSERT INTO budil_calendar_attempts
      (tenant_id, operation, idempotency_key, snapshot_sha256, work_order_id, calendar_id, event_id, state)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'claimed')
      ON CONFLICT (tenant_id, operation, idempotency_key) DO NOTHING
      RETURNING state, snapshot_sha256, event_id`,
      [tenantId,operation,idempotencyKey,digest,workOrderId,calendarId,eventId]);
    if(inserted.rows.length===1)return {claimedNew:true,...inserted.rows[0]};
    const existing=await this.tx.query(`SELECT state, snapshot_sha256, event_id
      FROM budil_calendar_attempts
      WHERE tenant_id=$1 AND operation=$2 AND idempotency_key=$3 FOR UPDATE`,
      [tenantId,operation,idempotencyKey]);
    if(existing.rows.length!==1||existing.rows[0].snapshot_sha256!==digest)
      throw code('KEY_HASH_CONFLICT');
    return {claimedNew:false,...existing.rows[0]};
  }
  async setState({tenantId,operation,idempotencyKey,from,to}){
    if(!['claimed','indeterminate','conflict','verified'].includes(from)||
      !['indeterminate','conflict','verified'].includes(to))throw code('STATE_INVALID');
    const r=await this.tx.query(`UPDATE budil_calendar_attempts SET state=$4, updated_at=now()
      WHERE tenant_id=$1 AND operation=$2 AND idempotency_key=$3 AND state=$5
      RETURNING state`,[tenantId,operation,idempotencyKey,to,from]);
    if(r.rows.length!==1)throw code('STATE_CHANGED');
  }
}
module.exports={AtomicLedger};
