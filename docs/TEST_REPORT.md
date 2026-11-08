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
