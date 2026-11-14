# Budil Google Calendar write: approved production preparation

Date: 2026-11-12 JST. Supabase project: `xvrrlwlgoxbrkhlfyznx` (`ai-bantou-dev`).
Tenant: `mi-bcs`. Scope: authorized DB schema + **disabled** Google write binding.
Production `main`, existing Google read binding, Google calendar events, and deployed Edge Functions were not changed.

## Applied and read back
- Supabase schema migration `20261112004514_budil_calendar_write_slots_exclusive_v1`.
  Source: [docs/sql/budil-calendar-write-slots-proposal.sql](sql/budil-calendar-write-slots-proposal.sql).
  DB: `public.budil_calendar_write_slots`, exclusion constraint `budil_calendar_write_slots_no_other_order_overlap`,
  RLS enabled, `btree_gist` installed, `public.budil_calendar_slots_finalize(...)` exists.
  Owner-approved DB modification performed; verified table has 0 rows.
- Supabase migration `20261112004551_budil_calendar_write_integration_disabled_v1`.
  Created **separate** `tenant_integrations` row:
  `provider=google_calendar`, `auth_mode=service_account_share`,
  `secret_ref=BUDIL_GOOGLE_CALENDAR_WRITE_SERVICE_ACCOUNT_JSON`,
  `status=disabled`. This `secret_ref` is a *name*, not a credential.
  Created separate `tenant_operation_bindings` row:
  `operation=calendar_event_write`, `resource_role=calendar_target`,
  `access_mode=write`, `status=disabled`,
  `config.allowCalendarEventWrite=false`,
  pointing at the same exact Google calendar **identifier** as the existing read binding.
  **No Google credential was configured, read, copied or changed**.
- Existing `schedule_blocks_list/calendar_source` remains `active/read`.
- New slot table: `anon`/`authenticated` cannot SELECT/INSERT/UPDATE/DELETE/TRUNCATE;
  `service_role` only SELECT/INSERT/UPDATE, not DELETE/TRUNCATE.
  `public.budil_calendar_slots_finalize` EXECUTE only for `service_role`/DB owner.
- Supabase Security Advisor reports `rls_enabled_no_policy` for the new slot table.
  This is **intentional deny-by-default**; only the trusted server service role can access it.
  Other security advisor warnings predate this change and are outside this task.
- Edge Function list unchanged: no `budil-calendar-write` deployed. `make-proxy` stays v25.
- Draft PR #16 remains unmerged; GitHub `main` unchanged.
- Disposable PostgreSQL 16 concurrency test and existing contract/Chrome tests previously passed.

## Critical blockers before any real Google event creation
1. A separately managed Google service account credential with the **write** OAuth scope,
   calendar ACL granted to this account, and a server-side secret corresponding to
   `BUDIL_GOOGLE_CALENDAR_WRITE_SERVICE_ACCOUNT_JSON`. The existing read-only
   credential MUST NOT be repurposed.
2. Complete server-side durable transaction wiring, user/tenant/customer/order validation,
   and exact Google GET readback. Existing Edge entrypoint remains hard OFF and un-deployed.
3. A new explicit approval for Edge deployment, activating the binding, real test-event
   creation/change/delete, and any public release or merging to `main`.
4. End-to-end synchronization of genuine Budil WorkOrder state; no customer records
   or actual Google calendar entries have been touched.

Do not activate the disabled binding or copy credentials automatically.
