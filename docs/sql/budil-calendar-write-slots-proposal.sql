-- PROPOSAL ONLY. 2026-11-12. NEVER auto-run this against production.
-- Budil calendar-write exclusive reservations for the existing Supabase project.
-- Requires explicit permission before applying to BC Service production.
-- Setup: public.tenants(id uuid primary key) already exists on BC Supabase.
-- PostgreSQL 15+ and btree_gist are required. In isolated CI these are ephemeral.
BEGIN;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_catalog;

CREATE TABLE public.budil_calendar_write_slots (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL,
  calendar_id text NOT NULL
    CHECK (length(calendar_id) BETWEEN 3 AND 254 AND calendar_id <> 'primary'),
  work_order_id text NOT NULL CHECK (length(work_order_id) BETWEEN 3 AND 256),
  request_id uuid NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  span tstzrange GENERATED ALWAYS AS (tstzrange(start_at,end_at,'[)')) STORED,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','indeterminate','verified','released')),
  google_event_id text,
  google_etag text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_at < end_at),
  CHECK (end_at - start_at <= interval '24 hours'),
  CHECK (
    status <> 'verified'
    OR (google_event_id ~ '^[0-9a-v]{65}$'
        AND google_etag ~ '^"[^"]+"$' AND verified_at IS NOT NULL)
  ),
  CONSTRAINT budil_calendar_write_slots_no_other_order_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    calendar_id WITH =,
    span WITH &&,
    work_order_id WITH <>
  ) WHERE (status IN ('pending','indeterminate','verified'))
    DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT budil_calendar_write_slots_tenant_request_unique
    UNIQUE (tenant_id,request_id)
);
-- Old verified + new pending of SAME work order may coexist; both block
-- a DIFFERENT work order. Allow only one pending reschedule per work order.
CREATE UNIQUE INDEX budil_calendar_write_slots_single_pending
ON public.budil_calendar_write_slots (tenant_id,calendar_id,work_order_id)
WHERE status IN ('pending','indeterminate');
CREATE UNIQUE INDEX budil_calendar_write_slots_single_verified
ON public.budil_calendar_write_slots (tenant_id,calendar_id,work_order_id)
WHERE status='verified';
CREATE INDEX budil_calendar_write_slots_owner_lookup
ON public.budil_calendar_write_slots (tenant_id,owner_user_id,work_order_id);

-- Service-only table. Public clients must NOT be able to submit a slot request
-- directly, even with their normal authenticated JWT.
ALTER TABLE public.budil_calendar_write_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.budil_calendar_write_slots FROM PUBLIC;
DO $roles$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.budil_calendar_write_slots FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.budil_calendar_write_slots FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    EXECUTE 'GRANT SELECT,INSERT,UPDATE ON TABLE public.budil_calendar_write_slots TO service_role';
  END IF;
END;
$roles$;

-- Atomic transition AFTER Google PATCH/insert GET readback was independently
-- verified by the server. If an existing confirmed slot is supplied,
-- release it and confirm the new one in the SAME database transaction.
CREATE FUNCTION public.budil_calendar_slots_finalize(
  p_tenant_id uuid,
  p_slot_id uuid,
  p_request_id uuid,
  p_work_order_id text,
  p_event_id text,
  p_event_etag text,
  p_old_slot_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $func$
DECLARE
  v_new public.budil_calendar_write_slots%ROWTYPE;
  v_old public.budil_calendar_write_slots%ROWTYPE;
BEGIN
  -- SERVER-ONLY CONTRACT: caller must have verified matching Google GET
  -- event id, private tenant/work-order metadata, start/end, and ETag.
  -- No user/client role receives EXECUTE rights.
  IF p_event_id !~ '^[0-9a-v]{65}$'
    OR p_event_etag !~ '^"[^"]+"$'
    OR p_old_slot_id = p_slot_id THEN RETURN false; END IF;

  SELECT * INTO v_new FROM public.budil_calendar_write_slots
  WHERE id=p_slot_id AND tenant_id=p_tenant_id AND request_id=p_request_id
    AND work_order_id=p_work_order_id AND status IN ('pending','indeterminate')
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF p_old_slot_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.budil_calendar_write_slots
    WHERE id=p_old_slot_id AND tenant_id=p_tenant_id
      AND calendar_id=v_new.calendar_id AND owner_user_id=v_new.owner_user_id
      AND work_order_id=v_new.work_order_id
      AND status='verified' AND google_event_id=p_event_id
    FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;

    UPDATE public.budil_calendar_write_slots
    SET status='released',updated_at=now()
    WHERE id=v_old.id;
  ELSE
    -- A fresh booking cannot masquerade as a reschedule to replace a
    -- previously verified work order. Do not release any old slot.
    IF EXISTS (SELECT 1 FROM public.budil_calendar_write_slots
       WHERE tenant_id=p_tenant_id AND calendar_id=v_new.calendar_id
         AND work_order_id=v_new.work_order_id AND status='verified') THEN
      RETURN false;
    END IF;
  END IF;

  UPDATE public.budil_calendar_write_slots
  SET status='verified',google_event_id=p_event_id,google_etag=p_event_etag,
      verified_at=now(),updated_at=now()
  WHERE id=p_slot_id;

  RETURN true;
END;
$func$;

REVOKE ALL ON FUNCTION public.budil_calendar_slots_finalize(
  uuid,uuid,uuid,text,text,text,uuid) FROM PUBLIC;
DO $roles$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.budil_calendar_slots_finalize(uuid,uuid,uuid,text,text,text,uuid) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.budil_calendar_slots_finalize(uuid,uuid,uuid,text,text,text,uuid) FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.budil_calendar_slots_finalize(uuid,uuid,uuid,text,text,text,uuid) TO service_role';
  END IF;
END;
$roles$;
COMMIT;
