# Budil×GPT Phase 1 — isolated fixture (2026-11-05)

## Scope
Mobile-friendly demo of text / browser speech transcription → fictional customer search → explicit customer selection → estimate draft → correction → explicit approval → existing Budil PDF export. **The natural-language parser is deterministic MOCK, NOT GPT**. No production customer data, storage writes, Google Calendar updates, or OpenAI API connection.

## Files
- budil-gpt-phase1-demo.html — standalone preview page at repo root so the original document CSS/seal paths resolve.
- experiments/budil-gpt-phase1/fixture-core.js — fictional leads and approval state machine; reuses existing CustomerResolveEntrypoint and DocumentsBrain.
- experiments/budil-gpt-phase1/fixture-ui.js — mobile UI with optional SpeechRecognition text transcription, DOM-safe rendering, confirmation, and BudilDocExport.downloadDocumentPdf.
- scripts/verify-budil-gpt-phase1-fixture.mjs — 16 regression tests.

## Local preview (isolated workstation only)
From the Budil repository root, start a local server on loopback, e.g. python -m http.server 8765 --bind 127.0.0.1, and open http://127.0.0.1:8765/budil-gpt-phase1-demo.html on the same host. Do not use real customer information. Browser speech recognition may process audio using external browser-provider services: speak fictional data only. Text input is always available. Do not open a new tunnel.

Example input: 比嘉清子さんのエアコン洗浄2台を税込18,000円で見積して
One candidate still requires human selection. The total is 18,000 yen tax-included. Correction example: 金額を税込20,000円に変更. Then explicitly approve and request PDF. The test PDF is visibly labeled as a fictional demo.
田中太郎さん yields two fictional candidates. 田中さん yields no exact match and requests a full name. Missing 税込/税抜 triggers clarification. No prices or customers are inferred.

## Test commands
node --check experiments/budil-gpt-phase1/fixture-core.js
node --check experiments/budil-gpt-phase1/fixture-ui.js
node --check scripts/verify-budil-gpt-phase1-fixture.mjs
node scripts/verify-budil-gpt-phase1-fixture.mjs

Evidence: 2026-11-05, **16/16 PASS under isolated JS execution of exact GitHub sources with Node-compatible in-memory shims**. Actual Windows Node process, whole verify-current suite, local browser PDF download and real smartphone speech/PDF share remain **unverified**. The existing verify-current requires a sibling calendar-sync-worker and hub/functions dependencies; avoid root npm install.

## Safety
Production main and GitHub Pages remain unchanged. Original tax, rounding, estimate/PDF design, company master, localStorage, Supabase, customer information, and Calendar are untouched. No API keys in the frontend. Approval is fixture memory only and is never persisted. Actual GPT authentication, authorization and multi-tenant isolation are NOT implemented.

## Next milestones
1. Verify on canonical Windows runner and localhost browser, including actual PDF bytes and 390px render.
2. Design authenticated server-side GPT tool gateway using existing infrastructure, strict allowlisted operations, user/tenant authority and approval receipts. No secrets in Pages.
3. Integrate real GPT with customer search and quote draft first, then Calendar writes, jobs, revenue, invoices and payment matches with explicit approval and idempotency.
4. Complete iOS/Android voice, PDF save/share, errors, relogin, backup/recovery before production adoption.
