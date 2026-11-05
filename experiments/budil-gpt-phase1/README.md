# Budil×GPT Phase 1–3 — isolated fictional-data rehearsal (2026-11-05)

## Scope
Mobile-friendly demo of text / browser speech transcription → fictional customer search → explicit customer selection → estimate draft → correction → explicit approval → existing Budil PDF export. Default parser is deterministic MOCK. A separately gated client for authenticated **GPT interpretation only** has been implemented but is not deployed or enabled. No production customer-data, calendar, revenue, or invoice writes.

## Files
- budil-gpt-phase1-demo.html — standalone preview page at repo root so the original document CSS/seal paths resolve.
- experiments/budil-gpt-phase1/fixture-core.js — fictional leads and approval state machine; reuses existing CustomerResolveEntrypoint and DocumentsBrain.
- experiments/budil-gpt-phase1/fixture-ui.js — mobile UI with optional SpeechRecognition text transcription, DOM-safe rendering, confirmation, and BudilDocExport.downloadDocumentPdf.
- scripts/verify-budil-gpt-phase1-fixture.mjs — 24 quote/GPT-client regression tests, 28 workflow regression tests, and `scripts/verify-budil-gpt-phase1-browser.mjs` for Chromium 390px and real estimate/invoice PDFs.

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

Evidence: 2026-11-05 GitHub Linux runner Node 22 tests; quote 24 cases and workflow 28 cases. Chromium CDP 390px: fictional lead matching, 18,000→20,000 revision, explicit approval, appointment check/confirmation, work completion, invoice draft/approval, invoice PDF, receivables, candidate bank match without updating paid status. Estimate **A4 1 page 184,476 bytes**; invoice **A4 1 page 225,896 bytes**. Run `41997499331` includes the strict downstream conversational commands. Windows runner, whole verify-current, live GPT service, actual Calendar/bank and physical iOS/Android speech/share remain **unverified**. The existing verify-current requires a sibling calendar-sync-worker and hub/functions dependencies; avoid root npm install.

## Safety
Production main and GitHub Pages remain unchanged. Original tax, rounding, estimate/PDF design, company master, localStorage, Supabase, customer information, and Calendar are untouched. No API keys in the frontend. Approval is fixture memory only and is never persisted. Server-side JWT, server-derived tenant checks, atomic rate limit, schema validation, and fixture-only OpenAI proxy are in separate DRAFT PR `teruya1229/ai-bantou-app#5`, **not deployed**; no real GPT request made.

## Next milestones
1. Verify on canonical Windows runner and whole verify-current; Linux browser/PDF verification is complete.
2. Verify the prepared JWT/tenant/rate-limited GPT interpretation gateway with a real, explicitly authorized API key and sandbox calls. No secret in Pages.
3. Integrate authenticated GPT with customer search and quote draft first. The booking→work→invoice→receivables flow is currently an isolated in-memory REHEARSAL. Real Calendar write, case/revenue storage, invoice issuance and verified bank matching remain separate future integrations requiring approval and idempotency.
4. Complete iOS/Android voice, PDF save/share, errors, relogin, backup/recovery before production adoption.

## Visual QA
- First Ubuntu PDF had absent Japanese fonts and a blank second page. Test CI installs CJK fonts and fixture-only PDF height uses 1110px; production/default PDF path remains 1123px.
- Isolated browser proof is attached to GitHub Actions run 41994258861 as `budil-gpt-fixture-browser-proof` (one-page PDF, 390px screenshot, A4 preview).
- A real phone has NOT been tested; SpeechRecognition availability differs between browsers.

## 2026-11-05 conversational fixture expansion

- `experiments/budil-gpt-phase1/fixture-workflow.js` uses existing `WorkOrderBrain`, `DocumentsBrain.convertEstimateToInvoice` and `PaymentBrain.summarizeReceivables`. All state is ephemeral and fictional.
- `experiments/budil-gpt-phase1/fixture-workflow-ui.js` adds mobile confirmation steps for slot preview, booking, completion, invoice draft/approval/PDF, unpaid status and fictional bank candidate matching.
- A narrow offline parser handles explicit utterances such as `2026年11月13日13時から15時まで予約して`, `作業完了にして`, `請求書を作って`, and `未入金を教えて`. It is NOT broad AI natural language and cannot use real calendar/bank records.
- `js/budil-cloud.js` now blocks non-fixture input BEFORE sending any instruction to the authenticated server; the server independently enforces a full-match fixture grammar. The OpenAI server-side gateway remains disabled and undeployed.
- Never infer a time from `金曜日` or conclude paid from matching amounts alone.
