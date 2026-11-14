-- Run AFTER the slot proposal in a disposable PostgreSQL 16 database.
-- SQL assertions fail the GitHub Actions job if any safety property breaks.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.tenants(id) VALUES
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');

-- First verified record; same workOrder may reserve overlapping new range.
INSERT INTO public.budil_calendar_write_slots
(id,tenant_id,owner_user_id,calendar_id,work_order_id,request_id,start_at,end_at,
 status,google_event_id,google_etag,verified_at) VALUES
('00000000-0000-4000-8000-000000000001',
 '11111111-1111-4111-8111-111111111111',
 '33333333-3333-4333-8333-333333333333',
 'fictional-calendar@example.com','work-order-1',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
 '2099-11-20T10:00:00+09:00','2099-11-20T11:00:00+09:00',
 'verified','b'||repeat('a',64),'"etag-1"',now());

-- Old slot 10:00-11:00 remains active, new target 10:30-11:30 of SAME order
-- can be tentatively held without releasing the old protected time.
INSERT INTO public.budil_calendar_write_slots
(id,tenant_id,owner_user_id,calendar_id,work_order_id,request_id,start_at,end_at)
VALUES
('00000000-0000-4000-8000-000000000002',
 '11111111-1111-4111-8111-111111111111',
 '33333333-3333-4333-8333-333333333333',
 'fictional-calendar@example.com','work-order-1',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
 '2099-11-20T10:30:00+09:00','2099-11-20T11:30:00+09:00');

DO $t$
DECLARE caught boolean;
BEGIN
  -- Different customer cannot reserve old or new overlap.
  caught:=false;
  BEGIN
    INSERT INTO public.budil_calendar_write_slots
    (id,tenant_id,owner_user_id,calendar_id,work_order_id,request_id,start_at,end_at)
    VALUES('00000000-0000-4000-8000-000000000003',
    '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333',
    'fictional-calendar@example.com','work-order-2',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    '2099-11-20T10:45:00+09:00','2099-11-20T11:15:00+09:00');
  EXCEPTION WHEN exclusion_violation THEN caught:=true; END;
  IF NOT caught THEN RAISE EXCEPTION 'OVERLAP_NOT_BLOCKED'; END IF;

  -- Same work order: only one in-flight reschedule.
  caught:=false;
  BEGIN
    INSERT INTO public.budil_calendar_write_slots
    (id,tenant_id,owner_user_id,calendar_id,work_order_id,request_id,start_at,end_at)
    VALUES('00000000-0000-4000-8000-000000000004',
    '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333',
    'fictional-calendar@example.com','work-order-1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
    '2099-11-21T10:00:00+09:00','2099-11-21T11:00:00+09:00');
  EXCEPTION WHEN unique_violation THEN caught:=true; END;
  IF NOT caught THEN RAISE EXCEPTION 'SECOND_PENDING_NOT_BLOCKED'; END IF;

  -- Calendar same, different tenant does NOT expose other tenant rows.
  INSERT INTO public.budil_calendar_write_slots
  (id,tenant_id,owner_user_id,calendar_id,work_order_id,request_id,start_at,end_at)
  VALUES('00000000-0000-4000-8000-000000000005',
   '22222222-2222-4222-8222-222222222222',
   '44444444-4444-4444-8444-444444444444',
   'fictional-calendar@example.com','work-order-foreign',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5',
   '2099-11-20T10:00:00+09:00','2099-11-20T11:00:00+09:00');

  -- A different work order may book an adjacent time with no overlap.
  INSERT INTO public.budil_calendar_write_slots
  (id,tenant_id,owner_user_id,calendar_id,work_order_id,request_id,start_at,end_at)
  VALUES('00000000-0000-4000-8000-000000000006',
   '11111111-1111-4111-8111-111111111111',
   '33333333-3333-4333-8333-333333333333',
   'fictional-calendar@example.com','work-order-adjacent',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',
   '2099-11-20T11:30:00+09:00','2099-11-20T12:30:00+09:00');

  -- Other owner cannot bypass: tenant/calendar exclusion still applies.
  caught:=false;
  BEGIN
    INSERT INTO public.budil_calendar_write_slots
    (id,tenant_id,owner_user_id,calendar_id,work_order_id,request_id,start_at,end_at)
    VALUES('00000000-0000-4000-8000-000000000007',
    '11111111-1111-4111-8111-111111111111',
    '99999999-9999-4999-8999-999999999999',
    'fictional-calendar@example.com','work-order-other-owner',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7',
    '2099-11-20T10:45:00+09:00','2099-11-20T11:00:00+09:00');
  EXCEPTION WHEN exclusion_violation THEN caught:=true; END;
  IF NOT caught THEN RAISE EXCEPTION 'OTHER_OWNER_CONFLICT_NOT_BLOCKED'; END IF;
END;
$t$;

-- Wrong Google event id must not retire old slot or mark new saved.
DO $t$
DECLARE ok boolean;
BEGIN
 SELECT public.budil_calendar_slots_finalize(
 '11111111-1111-4111-8111-111111111111',
 '00000000-0000-4000-8000-000000000002',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
 'work-order-1', 'b'||repeat('f',64),'"etag-fake"',
 '00000000-0000-4000-8000-000000000001') INTO ok;
 IF ok THEN RAISE EXCEPTION 'FOREIGN_EVENT_ALLOWED'; END IF;
 IF (SELECT status FROM public.budil_calendar_write_slots
 WHERE id='00000000-0000-4000-8000-000000000001') <> 'verified' THEN
   RAISE EXCEPTION 'ORIGINAL_EVENT_RELEASED_TOO_EARLY'; END IF;
END;
$t$;

-- Successful Google GET readback permits atomic transition from old to new.
DO $t$
DECLARE ok boolean;
BEGIN
 SELECT public.budil_calendar_slots_finalize(
 '11111111-1111-4111-8111-111111111111',
 '00000000-0000-4000-8000-000000000002',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
 'work-order-1', 'b'||repeat('a',64),'"etag-2"',
 '00000000-0000-4000-8000-000000000001') INTO ok;
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'VALID_FINALIZE_FAILED'; END IF;
 IF (SELECT status FROM public.budil_calendar_write_slots
 WHERE id='00000000-0000-4000-8000-000000000001') <> 'released' THEN
   RAISE EXCEPTION 'OLD_SLOT_NOT_RELEASED'; END IF;
 IF (SELECT status FROM public.budil_calendar_write_slots
 WHERE id='00000000-0000-4000-8000-000000000002') <> 'verified' THEN
   RAISE EXCEPTION 'NEW_SLOT_NOT_VERIFIED'; END IF;
END;
$t$;

-- No new overlap with the confirmed changed slot.
DO $t$
DECLARE caught boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.budil_calendar_write_slots
    (id,tenant_id,owner_user_id,calendar_id,work_order_id,request_id,start_at,end_at)
    VALUES('00000000-0000-4000-8000-000000000008',
    '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333',
    'fictional-calendar@example.com','work-order-3',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8',
    '2099-11-20T11:15:00+09:00','2099-11-20T11:45:00+09:00');
  EXCEPTION WHEN exclusion_violation THEN caught:=true; END;
  IF NOT caught THEN RAISE EXCEPTION 'POST_FINALIZE_OVERLAP_NOT_BLOCKED'; END IF;
END;
$t$;

-- RLS is active and a normal authenticated/anon client can neither read
-- nor write directly, and cannot invoke finalize as RPC.
DO $t$
DECLARE grants int;
BEGIN
 IF (SELECT relrowsecurity FROM pg_class WHERE oid='public.budil_calendar_write_slots'::regclass)
 IS DISTINCT FROM true THEN RAISE EXCEPTION 'RLS_DISABLED'; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
   SELECT count(*) INTO grants FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='budil_calendar_write_slots'
     AND grantee='authenticated';
   IF grants<>0 THEN RAISE EXCEPTION 'AUTHENTICATED_GRANT_PRESENT'; END IF;
 END IF;
END;
$t$;
COMMIT;
SELECT 'BUDIL_CALENDAR_SLOT_SQL_PASS' as result;
