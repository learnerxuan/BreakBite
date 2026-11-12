# Allergy panel polish and prep-filter wording — 12 November 2026

- Removed inherited nested padding, replaced the rotated text arrow with an SVG chevron, and added a solid action that changes to “Hide allergens” when expanded. Replaced uneven large pills with aligned, checked-state toggle tiles and a two-column phone layout. Filtering, review guards and saved preferences are unchanged.
- Renamed the prep section “Filter by preparation time”. A selected limit now explains that it shows menu estimates at or below that number and that pickup estimates also include the kitchen's current orders. It remains a browsing filter, not an eight-minute pickup promise or the collected-order time-saved calculation.
- `npm run check`: **218 passed, 1 opt-in live-project skip**, strict TypeScript and production build passed. Focused read-only guest browser checks cover 360–1440px layouts, expanded-panel geometry, 44px options, selected icons, polling/focus and the eight-minute explanation; desktop/phone screenshots were visually inspected. The Wi-Fi URL returned HTTP 200. Existing localhost accounts/orders were untouched.

# Screenshot reference, campus photos and clear filters — 12 November 2026

- Rechecked remote branches and history: the supplied screenshot's photo strip was absent from the pushed `ivan_branch` (`2544f55`). Recreated that reference with existing Asian Cuisine, Nelson and Subway counter photos, current location groups, full-width search, grouped meal/diet controls and a maximum-preparation selector. Used the current nine-kitchen/45-item catalogue rather than copying the screenshot's old eight-item counts. Six initial kitchens are in Cafeteria, one in Atrium, and two above Centre Point.
- Allergy filters now have a warm highlighted background, orange border, bold action, chevron and live selected count. The native disclosure supports keyboard operation, at least 56px height, and retains open state/focus during polling. Area photos are interactive and all three fit together on phones. Current savings, mobile basket, kitchen status and pickup estimates remain present.
- Area/category/search/diet/spice/prep filters intersect in browser state without changing basket lines or saved preferences. Diet/allergy filtering uses the existing fail-closed reviewed-food rules. Prep counts are cumulative, the 12+/All option is unbounded, and the interface explicitly distinguishes menu prep estimates from pickup availability. Closed/retired kitchens do not appear as selectable areas. No backend, shared contract, auth, checkout, recovery, persistence or Vercel logic changed.
- `npm run check`: **219 tests, 218 passed, 1 opt-in live-project test skipped, 0 failures**, including four new photo/filter regressions. Three new checks failed before implementation; existing comparison assertions were updated for the reference's functional maximum-prep control.
- Nine isolated normal-HTTP Chrome suites passed: product, kitchen, mobile basket, campus, savings, notifications, v3, Ivan design and new `browser_campus_photo_filters.py`. The new journey verifies image loading, live area counts, intersecting filters, basket preservation, truthful empty diet results, allergy keyboard access/selected count/polling focus, unchanged saved preferences and 360–1440px layouts. Guest/student desktop and phone screenshots were visually inspected. Physical phones and public hosting remain separate acceptance.

# Ivan design integration with the current product — 12 November 2026

- `ivan_branch` (`2544f55`) was already merged into remote `main` by PR #6 (`1424002`). Compared its changes against the last verified Vercel commit (`e5abf89`): the application changes were in the student view, shared controller and CSS; the backend/shared ordering contracts were preserved. Retained the compact green/orange identity, logo, navigation, meal register and preparation-time comparison.
- Corrected regressions from the older design: removed the restored sample badges as requested, excluded closed/retired kitchens from the filter, made kitchen-name search match its prompt, and replaced the misleading “available now” result count. Multi-kitchen copy now distinguishes one basket from separate pickups. Updated stale product/design documentation to nine kitchens and implemented Firestore/Vercel configuration.
- The optional prep comparison starts collapsed on narrow screens and expanded on fresh desktop views. Its open state survives polling, counts align with their labelled minute columns, and 12+ accurately includes longer estimates. It explicitly describes menu preparation estimates, not live pickup availability. Current per-item kitchen status/ETA and the prominent collected-only food-wait savings panel remain intact. Both the comparison and savings explanation retain their open state and keyboard focus during polling.
- Improved mid-width search/meal layouts beside the basket, retained 44px actions and readable ingredient/allergen/status text, and removed warning truncation. No ordering, QR/payment, cancellation/recovery, authentication, persistence or hosted-runtime logic changed.
- `npm run check`: **215 tests, 214 passed, 1 opt-in live-project test skipped, 0 failures**, with strict TypeScript and build passing. Three new UI regressions first failed against the merged design and passed after fixes. No linter is configured; whitespace and source-diff checks were performed separately.
- Eight normal-HTTP Chrome suites passed, each with isolated disposable JSON data: `browser_product.py`, `browser_kitchen.py`, `browser_mobile_basket.py`, `browser_campus.py`, `browser_savings.py`, `browser_notifications.py`, `browser_v3.py`, and new `browser_ivan_design.py`. These cover checkout/lost-response recovery, independent cancellation and collection, QR/payment reuse, dietary/timetable features, closure/history, collected-only savings, mobile basket focus/drafts/scroll, and the preparation comparison/search. The focused layout check covers 360/390/600/640/768/860/861/900/1024/1440px, verifies count/tick alignment and polling state, and checks search controls stay inside the menu column. Guest/student phone and desktop screenshots were visually inspected.
- Physical-phone use and live Vercel/Firestore/Blob delivery remain separate acceptance. No real user data was used in browser fixtures; the existing localhost accounts/orders remain intact.

# Vercel deployment preparation — 11 November 2026

- Added `vercel.json`, static output/routing/security headers and a lazy serverless entry point. Vercel uses shared Firestore and secure cookies, refuses production data in unconfigured previews, and uses the platform client-address header only in that environment. Local JSON behaviour and its single writer remain intact.
- API requests await coalesced maintenance rather than assuming interval timers survive. A bearer-protected maintenance endpoint supports an external scheduler. Without one, idle deployments do not generate background reminders until the next API request. Stable environment-based VAPID keys and private Blob photo storage remove hosted local-disk dependencies. Bundled sample images need no Blob account; new uploads fail clearly before Blob connection.
- Rechecked scheduled capacity inside the transaction to preserve current kitchen closure/allocations across instances. Failed Firestore startup now releases SDK resources before retries. Added hosting configuration, origin/secret/size validation, pre-parsed Vercel JSON, maintenance retry and media regressions.
- `npm run check`: **212 tests, 211 passed, 1 opt-in live-project test skipped, 0 failures**; strict TypeScript and production build passed. `npm audit --omit=dev --json`: zero findings. Blob 2.4.0 is pinned; the newer version tested introduced vulnerable transitive dependencies. No linter is configured; `git diff --check` passed.
- Official `@vercel/node` builder 30.0.0 built a Node 22 Lambda with **958 traced files**, materialized locally with no `.env`, runtime database or service-account files. `vercel.json` instance validation against the official schema passed (the published schema's own metaschema check rejected an unrelated trigger definition; direct Draft7 instance validation was used).
- Official Firestore emulator 1.22.0: `node scripts/test-store.mjs firestore` completed **210 passed, 2 JSON-only skips, 0 failures**, including the opt-in SDK integration test; its 81 owned roots were removed. No live Google project credentials were used.
- Both `browser_product.py` and `browser_kitchen.py` passed with the traced function through Vercel's actual development request wrapper, over self-signed local HTTPS and separate Firestore-emulator roots. The fixture supplied the platform forwarding headers and static routes. This caught Vercel consuming JSON streams before the application; the handler now supports bounded pre-parsed requests as well as ordinary Node streams. These runs verified Secure-cookie login, checkout/retry recovery, role isolation, payment/one-use pickup, cancellation/recovery, kitchen closure/history, timetable and responsive layouts. `--ignore-https-errors` was used only for the disposable local certificates.
- Actual Vercel edge deployment/routing, real Google credentials/IAM, Blob service access, external scheduler and physical phone/TLS/push delivery remain unverified. The laptop's data/accounts were not migrated or replaced. Follow [Vercel setup and hosted acceptance](VERCEL.md).

# Firestore branch integration and display cleanup — 11 November 2026

- Integrated `ky_branch` (`8e4c1b3`) with the current kitchen history/status, pickup estimates, savings, retirement and mobile UI work. Removed the requested visible cross-contact paragraph, review date, photo-credit paragraph and sample-menu badges; stored provenance, ingredients, allergen information and dietary validation remain intact.
- Independent data/security/compatibility reviews found and fixed stale no-op transactions accepting a reset password, refresh failures bypassing cache revalidation, initialization missing orphaned child documents, and broad cross-run test cleanup. Added regressions for each, concurrent initialization and commit-applied/response-lost recovery. Final data and security reviews found no remaining merge blocker.
- `npm ci --ignore-scripts --no-audit` installed the branch dependency. Runtime audit initially found eight moderate transitive findings with Admin SDK 13.10.0; the integration pins 14.5.0 (Node 22+) and `npm audit --omit=dev --json` then reported zero findings.
- `npm run check`: **202 tests, 201 passed, 1 opt-in live-cloud test skipped, 0 failures**; strict TypeScript and build passed. `node scripts/test-store.mjs firestore-memory`: **199 passed, 3 expected skips**, 0 failures, with the selectable service fixtures on the in-memory Firestore adapter, including savings persistence.
- Downloaded the official Firestore emulator 1.22.0 from the Firebase CLI's published manifest and verified its SHA-256. The standard CLI install failed in its Windows native dependency setup, so the verified emulator JAR was started directly on loopback port 8185, using demo project `demo-breakbite-review` and deny-all rules. No live Google project or credentials were used.
- With `FIRESTORE_EMULATOR_HOST=127.0.0.1:8185`, `GOOGLE_CLOUD_PROJECT=demo-breakbite-review`, `FIRESTORE_DATABASE=(default)` and `BREAKBITE_LIVE_FIRESTORE=1`, the focused SDK integration check passed, and `node scripts/test-store.mjs firestore` completed **200 passed, 2 JSON-file-only skips, 0 failures**. It removed only its 79 owned test roots. Production uses REST; credential-free emulator connections use gRPC. An unauthenticated emulator document read returned HTTP 403.
- `python tests/browser_product.py --base-url http://127.0.0.1:8110 --chromium <Chrome executable>` and `browser_kitchen.py --base-url http://127.0.0.1:8111` passed over normal browser HTTP using the real Admin SDK and separate emulator datasets. Coverage included account/role isolation, atomic checkout/retry recovery, delays/consent, pickup/payment, history filters, status/ETA, offline recovery, dietary/timetable flows and responsive layouts. A separate phone-width browser probe verified all requested wording is absent while ingredient/allergen details remain. The final build passed after documentation/error-message cleanup.
- Live Google credentials/IAM, named-database rules, deployed networking, Vercel execution, persistent photo/push-key storage, scheduler hosting and physical phone delivery/scanning remain unverified. Local `STORE=file` data/accounts are preserved; a new Firestore root seeds new data and does not import them automatically. See [FIRESTORE.md](FIRESTORE.md).

# Kitchen status, pickup estimates, history table and UAT — 11 November 2026

- Order history is now an own-kitchen table with order/checkout search, status and MYT updated-date filters, original amounts, payment state, dated updates and retained no-show correction. Small screens scroll the labelled table region rather than the page. Filters clear when the actor changes.
- Public summaries expose only scheduled/preparing/ready aggregate counts, delay/open state and one-portion per-item pickup estimates. A shared server slot selector applies the actual quote's prep/delay, workload/counter-capacity and cutoff rules; estimates do not reserve capacity or replace full-basket checkout. Student-facing pickup ranges were removed. The browser suppresses live estimates on offline/stale data.
- A failing regression reproduced unreported overdue preparation missing its delay notice when no order was Ready. The timer now checks overdue preparation too; notices remain private and deduplicated. The public Delayed state also reflects overdue active orders.
- `npm run check` passed strict TypeScript, **177 automated tests (0 failures)** and build. New tests cover one-portion quote parity, delay/capacity/cutoff handling, sold-out/closed/full states, no mutation, aggregate privacy and overdue-notice ownership/deduplication. A stale compiled artifact from the deleted pickup-range test was removed before the successful run. The production build passed again after CSS cleanup.
- Four normal-HTTP Chrome browser suites passed with disposable databases: `browser_kitchen.py --base-url http://127.0.0.1:8113`, `browser_product.py --base-url http://127.0.0.1:8111`, `browser_v3.py --base-url http://127.0.0.1:8112`, and `browser_notifications.py --base-url http://127.0.0.1:8110`, each with `--chromium <Chrome executable>`. The new journey covers table filters/isolation/reload, closure, payment-confirmed fulfilment, per-meal status, delay/resolve and offline/reconnect. Other journeys cover retries, QR decode/replay, consent, dietary/timetable flows and responsive layouts. Mobile screenshots were visually inspected.
- The local server was restarted after building; its live catalogue returned nine summaries and 45 item estimates, and the LAN URL returned HTTP 200. [UAT.md](UAT.md) contains 34 manual acceptance cases, initially Not run. Physical phone camera/keyboard/Safari, actual push delivery, real kitchen review/pilot and cloud deployment acceptance remain outstanding.
- A targeted Chrome check reproduced view switching retaining a long menu's scroll position. Navigation now returns a changed view to its top; a phone-width browser probe and the final build passed. Closing the basket on the same view still preserves browsing position.

# Kitchen history, closure and pickup summaries — 11 November 2026

- Removed the requested long sample-menu warning from Menu & stock while retaining concise sample identification and the review controls. Added Order history next to Order queue, showing own-kitchen collected/cancelled/uncollected orders, amounts and dated updates, newest first.
- Close kitchen/Reopen kitchen uses the existing persisted open state. Closed-kitchen food is hidden in Explore, favourites and recent menu shortcuts; stale kitchen filters reset. Existing carts/retry payloads and existing orders are preserved, and backend quote rejection remains authoritative.
- Availability now starts with up to three actual bookable pickup ranges and expandable slot detail. Range grouping preserves full, closed and missing gaps; it does not invent operating hours. Open slot detail survives polling.
- `npm run check` passed TypeScript, **174 automated tests** and the production build. A new range regression covers sorting, continuity/gaps and non-mutation. Updated a stale savings-heading assertion to match the previously requested food-wait wording.
- `python tests/browser_kitchen.py --base-url http://127.0.0.1:8113 --chromium <Chrome executable>` passed over real localhost HTTP with disposable data: closure persists after reload, student menus/favourites update, closed kitchens reject quotes, existing orders can still be collected, histories are isolated and persistent, and layouts work at 360/390/768/1440px. Mobile screenshots were visually inspected.
- `browser_product.py`, `browser_v3.py` and `browser_notifications.py` passed on disposable local servers with the same normal-HTTP/Chrome flags, covering atomic checkout/recovery, independent QR decoding/payment-confirmed handover, dietary/timetable flows and separate Availability. Old expectations for four kitchen tabs and the availability subtitle were updated for the requested UI. Localhost serves the updated assets; the LAN URL returned HTTP 200. Physical-device testing remains unverified.

# Food waiting focus — 11 November 2026

- Removed walking/return/buffer form controls and their deductions from new browser plans; legacy contract fields use zero. Historical plans and uncertain checkout payloads are preserved. The savings heading now says “Estimated food waiting time saved”; its preparation/readiness/lead-time calculation is unchanged.
- `npm run check` passed strict TypeScript, **173 automated tests** and the production build. A new domain regression verifies zero walking/buffer is accepted without hidden time deductions. The build passed again after the wording update.
- Normal-HTTP Chrome mobile basket, savings and full product/recovery journeys passed with disposable data, including absent walking controls, zero-allowance quote payloads, preserved drafts, timetable imports, lost-response recovery, responsive layout and collected-only preparation savings. After user-authorized restart, localhost and the LAN URL returned HTTP 200; a guest browser check confirmed the new controls locally. Physical-phone use remains unverified.

# Mobile basket and break planning — 11 November 2026

- `npm run check` passed strict TypeScript checking, **172 automated tests (0 failures)** and the production build.
- `python tests/browser_mobile_basket.py --base-url http://127.0.0.1:8112 --chromium <Chrome executable>` passed over normal HTTP with disposable data. It reproduced the missing empty-basket shortcut before the fix, then verified direct basket/break access, draft and disclosure preservation, keyboard focus containment/return, menu scroll preservation, quantity edits, empty state, one modal during checkout/sign-in and responsive sidebar/sheet transitions at 360/390/768/1440px.
- All six existing browser suites passed on disposable local servers: `browser_product.py`, `browser_v3.py`, `browser_apspace.py`, `browser_campus.py`, `browser_savings.py` and `browser_notifications.py`. Coverage includes timetable file imports, saved timetable gaps, stale break warnings, lost-response recovery without changing the stored request, QR handover and independent kitchen cancellation. An existing stale-break assertion initially tried to read the closed sheet; opening the sheet before checking the warning fixed the browser journey.
- Mobile screenshots were visually checked. The fixed bar is available even with no items; the sheet keeps its close and checkout controls visible and respects the bottom safe area. Physical phone, virtual keyboard and Safari behavior remain unverified.

# Estimated time saved and kitchen retirement — 11 November 2026

- `npm run check` passed strict TypeScript checking, **172 automated tests (0 failures)** and the production build. Windows used `$env:npm_config_script_shell = (Get-Command pwsh).Source` for nested npm calls.
- New tests cover preparation-baseline snapshots, late Ready, lead-time caps, replacement acceptance timing, collection-only credit, student ownership, retry/replay/restart stability and the largest saving per multi-kitchen checkout. The UI explains that queue/walking/payment time is excluded; this is an estimate, not measured campus impact.
- Fresh installations expose nine kitchens and 45 sample items. Migration archives Bowl Lab/Noodle & Co. while preserving existing accounts, orders, reservations and idempotency records. Historical orders remain collectable; new orders are blocked. Stale cart lines are removed only when no checkout is pending.
- All six Playwright suites passed over normal Chrome localhost HTTP with disposable data: `browser_product.py`, `browser_v3.py`, `browser_apspace.py`, `browser_campus.py`, `browser_notifications.py` and new `browser_savings.py`, using `--base-url <fixture URL> --chromium <Chrome executable>`. Layouts were checked at 360/390/768/1440px.
- The savings journey verified a two-kitchen checkout earning 8 estimated minutes rather than 11 after both pickups, no credit before collection, private totals after reload and clearing on sign-out. Original checkout/recovery, QR decode/handover, timetable, sample-photo and allergy-filter journeys passed with the active campus kitchens.
- A failing regression reproduced static asset requests consuming the API allowance. Static assets now bypass that allowance while the 300-request API/MCP limit and separate sign-in limit remain enforced; the regression checks both behaviors.
- The existing local data was privately backed up with its server stopped before applying migration. The updated local server responds on localhost and the configured LAN address with nine kitchens/45 meals. Physical phone connectivity, phone camera and real push delivery were not verified in this run. Firestore/Vercel migration remains separate.

# Combined branch verification — 11 November 2026

- Integrated `codex/apspace-timetable` (`729a91c`) and `leeminhao-branch` (`f579d43`) from `982d766`. Resolved shared state, basket and CSS conflicts while preserving both workflows.
- `npm run check` passed strict TypeScript checking, **160 tests with zero failures**, and the production build. On this Windows shell, set `$env:npm_config_script_shell = (Get-Command pwsh).Source` first so nested npm calls resolve.
- Added migration regressions for existing child orders and retry records, reviewed operator data, sample dietary restrictions and the combined basket. A failing regression demonstrated that the original migration overwrote reviewed locations/photos; the migration now changes only unreviewed sample placeholders.
- All five Playwright suites passed over normal localhost HTTP in Chrome using disposable data: `browser_product.py`, `browser_v3.py`, `browser_apspace.py`, `browser_notifications.py` and the new `browser_campus.py`. Pass `--base-url <fixture URL> --chromium <Chrome executable>` to each. Use `setup-browser.mjs` for ordinary fixture accounts and `setup-apspace-browser.mjs` for the synthetic APSpace server.
- Coverage includes atomic multi-kitchen checkout, lost-response recovery, independent cancellation, consent-based replacement, QR decoding/handover/replay, saved meals, timetable confirmation/refresh, all 45 bundled dish JPEGs, sample labels, allergy filters, and layouts at 360/390/768/1440px. No uncaught browser JavaScript errors were reported.
- Run browser suites on separate disposable servers or sequentially: an overlapping run hit the existing per-IP request limit. The isolated rerun passed. An obsolete 10-card expectation was updated for the 55-item catalogue.
- A direct `ApspaceTimetableProvider.get()` smoke check successfully fetched and normalized the public source with 1,143 intake options. This verifies current source access, not personal-account linkage, completeness or publication cadence.
- Remaining gaps: physical phone camera, deployed HTTPS, real closed-tab push delivery, full accessibility/security/load audits, public hosting and Google/Gemini integration. Sample menus remain unverified vendor data. No live APSpace account sync is claimed.

# Automatic APSpace import verification — 9 November 2026

- `npm run check` passed strict type checking, all 156 automated tests and the production build. APSpace tests cover source validation, shared caching and retry backoff, session ownership and consent, update review, missing dates, disconnect races and saved gap rendering.
- `python tests/browser_apspace.py --base-url http://127.0.0.1:8101 --chromium <Edge executable>` passed over normal local HTTP using `node tests/setup-apspace-browser.mjs` and a disposable database. It covers manual intake-code entry, group selection, keyboard consent, persistence after reload, visible checkout preferences, atomic two-kitchen checkout recovery across a refresh, obsolete break removal, change review and disconnect. Layouts were checked at 360, 390, 768 and 1440 pixels.
- `python tests/browser_product.py` and `python tests/browser_v3.py` passed on disposable servers over normal HTTP in Edge. The former also verified one real APSpace file in the fallback UI. The latter verified manual classes, the saved file import and independent QR decoding.
- A local API run with `BREAKBITE_APSPACE=true` used the public upstream through options, preview, confirmation, profile and disconnect. A separate comparison matched all 32 start/end pairs in two intake exports for the week of 16 November. The upstream returned HTTP 304 on ETag revalidation.
- Browser change and retry tests use a synthetic provider. Upstream publication cadence, multi-group parity across weeks, shared deployment terms, physical phone use and public deployment remain unverified. The real provider is off by default.

# APSpace Fit my break verification — 9 November 2026

| Check | Result |
| --- | --- |
| `git pull --ff-only`, then `git switch -c codex/apspace-timetable` | Based on `982d766`. Baseline `npm run check` passed with 128 tests. |
| `npm run check` | Strict TypeScript, 138 tests with zero failures, and production build passed. The Windows sandbox denied temporary database renames on one run. The full check passed with normal filesystem access. |
| `npm exec tsc -- -p tsconfig.test.json` and `node --test dist-tests/tests/timetable.test.js` | Six parser and gap tests passed. Repeated with `TZ=America/Los_Angeles` with the same results. |
| `python tests/browser_product.py --base-url http://127.0.0.1:8081 --chromium <Edge executable> --apspace-export <file> --apspace-export <file>` | Passed in Edge 156 over normal localhost HTTP using an isolated JSON fixture. The run used the browser's cookie session, app CSP and file picker. |
| `python tests/browser_v3.py --base-url http://127.0.0.1:8082 --chromium <Edge executable>` | Passed over normal localhost HTTP with a separate fixture, including the saved calendar flow and independent QR decoding. |

- **A1–A2.** Compared two APSpace intake exports for the selected week of 16 November. Each contained 16 entries dated 16–20 November MYT, including two overlapping entries. Both used UTC timestamps and folded lines. Edge preview dates and times matched an independent conversion from each local file. Invalid UTF-8, cancelled previews and late file reads preserved the accepted timetable. Opening Inbox through a notification cancelled a pending read.
- **A3–A5.** Verified inclusion, explicit consent, focus across polling, future-gap restrictions, invalidation after a new selection, manual edits, removal and ordinary order-ahead.
- **A6–A7.** Verified an imported two-kitchen quote and checkout, sold-out rollback, concurrent retries, one-time payment-confirmed pickup and independent cancellation. A different account could quote an ordinary order while the original recovery payload stayed intact. The original student recovered the same child orders using the legacy cache format. Timetables cleared on refresh, sign-out and a simulated session expiry. Quote payloads used the existing plan fields.
- **A8.** Verified normal browser file selection, keyboard activation and focus, and horizontal overflow at 360, 390, 768 and 1440px. Browser tests used synthetic accounts and near-current synthetic class times for ordering. Physical phones and deployed HTTPS remain untested for this change.

---

# v0.3.1 verification — 8 November 2026

- Strict typecheck, **128 automated tests (0 failures)**, production build: passed in this environment.
- The previous 107 checks remain passing; 21 additional checks cover Web Push encryption/signatures, HTTP ownership/CSRF, retries/restart, expired subscriptions, shared-device revocation, service-worker push/click, opt-in UI and rollback.
- RFC 8291 published encryption example matched byte-for-byte. Generated payloads also decrypted with an independent receiver-side test; VAPID ES256 signatures verified independently.
- v0.3 browser regression passed through the existing renderer/local-API bridge, updated to check that kitchen availability moved out of Explore.
- No external push-service or real closed-tab phone test was executed. This environment blocks normal Chromium localhost navigation and external DNS resolution.
- [Setup and deployment acceptance](WEB_PUSH.md). Provider acceptance is not an OS display receipt.

---

# Verification report — v0.3, 8 November 2026

## Executed checks

| Check | Result |
| --- | --- |
| Strict TypeScript checking | Passed. |
| Automated Node tests | **107 passed, 0 failed**. |
| Production build | Passed. |
| Original product browser regression | Passed using the local renderer/API bridge. |
| v0.3 product browser journeys | Passed using the same bridge at 360/390/768/1440px. |
| QR interoperability | Output matrix matched Python qrcode for fixed version 5-L/mask 0; a rendered browser QR screenshot was independently decoded by OpenCV. |

## Added coverage

- Private, scoped QR generation/resolution, wrong kitchen, not-ready, payment requirement, token tampering and concurrent/repeated collection.
- Favourites and saved baskets, persistence, current-price reordering, unavailable-item notices and private ownership.
- Ingredient snapshots, unknown/cross-contact filtering, evidence dates, conflicting claims and stale review fingerprints.
- Current preferences during recovery; changed proposal ingredients cannot be silently accepted.
- Ordering/cancellation cutoff snapshots, idempotent retries, prepared late cancellation without restoring ingredients.
- Early Ready grace, durable/deduplicated notices, overdue closure, no-show correction and late-vendor exemptions.
- Online capacity classification and non-displacing earlier rescheduling, unchanged reservations on rejection.
- Timetable ownership, preview expiry/confirmation, merge deduplication and deletion.
- UTC/quoted timezone handling, folded text, weekly/daily RRULE, EXDATE/RDATE, changed/cancelled instances and warnings for unsupported/invalid series.
- Bounded raster photo uploads, source permission and cross-kitchen rejection.
- HTTP CSRF/session checks for product routes and privacy of calendars/QR credentials.
- Original atomic multi-kitchen checkout, stock races, sibling itinerary, lost-response recovery, login and pickup tests remain passing.

## Browser journeys

- Guest catalogue; registration; save a favourite and named multi-kitchen basket; rebuild it and choose fresh slots.
- Move a confirmed order to unused earlier capacity without queue jumping.
- Show student QR; independently decode screenshot; merchant resolves it and confirms payment/handover; replay fails.
- Private inbox/read status, editable food metadata, photo upload/removal and merchant policies.
- Saved dietary restrictions hide/disable conflicting meals.
- Add a manual class; preview three imported weekly instances; verify nothing is saved before confirmation; confirm and apply an optional break.
- Desktop/mobile pages: no document horizontal overflow or uncaught JavaScript errors in scripted journeys.
- Previous workflow regression: cross-kitchen order, delay/replacement approvals, code rotation, collection, menu creation, lost-response recovery and independent cancellation.

## Browser test boundary

The available Chromium returned `ERR_BLOCKED_BY_ADMINISTRATOR` when navigating to localhost. No browser policy was changed.

Tests injected this build's compiled modules/styles into a blank renderer and relayed only its local `/api/` requests through Python to the running Node server. This validates rendered interactions with the actual backend, but **not browser HTTP navigation, cookie enforcement, deployed CSP/TLS, an actual camera or notification delivery while closed**.

Camera decoding uses native `BarcodeDetector`; it was not tested against a physical phone camera. Browser/HTTPS compatibility and denied-permission paths need real-device verification. Manual/USB credential handling and the QR image itself were verified separately.

## Reproduce

```bash
npm install
npm run check
node tests/setup-browser.mjs /tmp/breakbite-ui-test
# Use this NEW throwaway directory when starting the server:
DATA_DIR=/tmp/breakbite-ui-test npm start
# Separate terminal:
pip install playwright opencv-python
playwright install chromium
python tests/browser_product.py --base-url http://127.0.0.1:8080
python tests/browser_v3.py --base-url http://127.0.0.1:8080
```

- Use a separate new fixture directory for independent baseline runs. The test scripts intentionally create orders and edit the test menus.
- `--bridge --chromium /usr/bin/chromium` selects the disclosed isolated-renderer mode used here, not normal networking.
- Use only disposable accounts/data. Never run this against a real deployment or publish test databases and live pickup credentials.
- Browser screenshots are written to ignored `test-results/`; they are not required by the application.

## Environment and remaining verification

- Node 22.16.0, TypeScript 5.8.3; existing installed build tools were used because outbound DNS prevented a fresh npm registry installation.
- No runtime npm dependencies. A prebuilt package can start with Node alone.
- Not executed: real Android/iPhone camera, normal browser navigation/TLS, Docker/cloud deployment, Google/Firebase/Gemini authentication, email/background push, real payments or campus pilot.
- No production security certification, full accessibility audit, load-test guarantee or measured waiting-time reduction is claimed.
