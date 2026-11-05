# Budil×GPT Phase 1 — isolated fixture (2026-11-05)

## Scope
Mobile-friendly demo of text / browser speech transcription → fictional customer search → explicit customer selection → estimate draft → correction → explicit approval → existing Budil PDF export. Default parser is deterministic MOCK. A separately gated client for authenticated **GPT interpretation only** has been implemented but is not deployed or enabled. No production customer-data, calendar, revenue, or invoice writes.

## Files
- budil-gpt-phase1-demo.html — standalone preview page at repo root so the original document CSS/seal paths resolve.
- experiments/budil-gpt-phase1/fixture-core.js — fictional leads and approval state machine; reuses existing CustomerResolveEntrypoint and DocumentsBrain.
- experiments/budil-gpt-phase1/fixture-ui.js — mobile UI with optional SpeechRecognition text transcription, DOM-safe rendering, confirmation, and BudilDocExport.downloadDocumentPdf.
- scripts/verify-budil-gpt-phase1-fixture.mjs — 22 regression tests; scripts/verify-budil-gpt-phase1-browser.mjs exercises Chromium 390px and actual PDF.

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

Evidence: 2026-11-05 GitHub Linux runner Node 22 **22/22 PASS**, Chromium CDP 390px no overflow, fictional lead matching, 18,000→20,000 revision, explicit approval, PDF **A4 1 page 184,476 bytes**, Japanese text visually inspected. GitHub run `41994258861`. Windows runner, whole verify-current, live GPT service and physical iOS/Android speech/share remain **unverified**. The existing verify-current requires a sibling calendar-sync-worker and hub/functions dependencies; avoid root npm install.

## Safety
Production main and GitHub Pages remain unchanged. Original tax, rounding, estimate/PDF design, company master, localStorage, Supabase, customer information, and Calendar are untouched. No API keys in the frontend. Approval is fixture memory only and is never persisted. Server-side JWT, server-derived tenant checks, atomic rate limit, schema validation, and fixture-only OpenAI proxy are in separate DRAFT PR `teruya1229/ai-bantou-app#5`, **not deployed**; no real GPT request made.

## Next milestones
1. Verify on canonical Windows runner and whole verify-current; Linux browser/PDF verification is complete.
2. Verify the prepared JWT/tenant/rate-limited GPT interpretation gateway with a real, explicitly authorized API key and sandbox calls. No secret in Pages.
3. Integrate real GPT with customer search and quote draft first, then Calendar writes, jobs, revenue, invoices and payment matches with explicit approval and idempotency.
4. Complete iOS/Android voice, PDF save/share, errors, relogin, backup/recovery before production adoption.

## Visual QA
- First Ubuntu PDF had absent Japanese fonts and a blank second page. Test CI installs CJK fonts and fixture-only PDF height uses 1110px; production/default PDF path remains 1123px.
- Isolated browser proof is attached to GitHub Actions run 41994258861 as `budil-gpt-fixture-browser-proof` (one-page PDF, 390px screenshot, A4 preview).
- A real phone has NOT been tested; SpeechRecognition availability differs between browsers.
