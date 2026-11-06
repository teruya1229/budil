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

## 2026-11-05 evening: separate GPT trial Auth compatibility

- The old Budil backup client points local origins at a different Supabase staging project. That project is not present in the current connected Supabase account. **Do not change the existing backup login or localStorage data for this mismatch.**
- New `experiments/budil-gpt-phase1/trial-auth.js` creates a separate, localhost-only trial session using the **existing BC Auth project**. Only `http://localhost:8765/budil-gpt-phase1-demo.html` and `http://127.0.0.1:8765/budil-gpt-phase1-demo.html` may use it. The production Budil session is unchanged.
- `js/budil-cloud.js::interpretFixture` uses the trial session only from that exact path/origin; all regular Budil login/backup paths keep their prior behavior.
- The trial login UI accepts credentials in the browser; this project does not inspect or log them. Do not enter a real customer's credentials. No credentials were used during automated verification.
- Only fictional phrases matching a strict allowlist are ever eligible for outbound GPT requests; added prompts, contact information or real customer details are rejected in both browser and Edge.
- GitHub Actions `42002281000`: **24/24 quote, 28/28 workflow, 12/12 localhost trial-auth tests PASS**, plus Chromium mobile width and estimate/invoice real PDF E2E. The GPT-button browser test uses fake server answers, rejects a deliberately hallucinated price, and still requires customer/final approval.
- The Edge gateway remains **undeployed and disabled**. Repo `teruya1229/ai-bantou-app` Actions `42002698340` additionally passed **Deno static type checking** with `npm:@supabase/server@1.3.0` dependency resolution (after fixing 18 TypeScript errors); its 20 intent / 22 mocked security cases PASS.
- No actual Supabase user login, OpenAI API call, iPhone/Android physical device, production Calendar reservation, customer synchronization, paid invoice or bank reconciliation was performed. A draft PR/CI PASS is not product completion.
- The user's next indispensable external step is to approve a dedicated API project/key with a spending ceiling and configure it only as an encrypted Supabase Edge secret. Do not put the secret in GitHub, public JS, chat, or console.


## 2026-11-05: Existing API key reuse and cost-free readiness

- Existing OpenAI key has already been used by a separate BC PDF Cloudflare Worker (verified via prior implementation records). **Cloudflare Worker Secret is isolated from Supabase** and is never readable or auto-copied by this page. Do not make a new key merely to run this test.
- Added `BudilCloud.getFixtureGptReadiness()` and an explicit `GPT接続の準備を確認（API料金なし）` button. This uses the localhost-only Supabase Auth session and sends authenticated `GET /functions/v1/budil-gpt-interpret`, never the paid OpenAI endpoint, never a customer record, and never the key value.
- The unmodified production Budil and backup login are unaffected. A missing Edge deployment, disabled service or missing server-side Secret reports **not ready**, not fake success.
- Node mock auth tests **15/15 PASS**, with external GPT calls set to zero. Browser quote/invoice/390px PDF E2E continues to pass. GitHub Actions Budil run `42012058320`.
- Actual key reuse is **NOT VERIFIED** in the Budil Supabase environment. The existing Cloudflare Worker Secret cannot be moved automatically using available integrations, and live GPT requests were not made. Future setup must bind the existing key as an encrypted server-side Secret without displaying it in GitHub Pages or chat. No production Edge function was deployed.
