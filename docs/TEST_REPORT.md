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
