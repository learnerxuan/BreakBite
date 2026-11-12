# BreakBite
## Order ahead. Enjoy your break.

- **Track:** Smart Campus & Student Experience.
- **Current version:** v0.3.1 — deployed on Vercel with Cloud Firestore, cookie accounts and a responsive campus menu. JSON storage remains available for local development.
- **For APU students:** an independent student project, not an official campus service.
- Browse before arriving, order from multiple kitchens, choose realistic pickup windows and collect separately.
- Ordinary ordering works without a timetable. **Fit my break** is optional.
- Google Cloud Firestore and the public HTTPS deployment are connected and verified. Gemini Enterprise is not integrated; meal planning and recovery use explicit rules.

## Live demo and judge access

**[Open BreakBite — https://breakbite-ebon.vercel.app](https://breakbite-ebon.vercel.app)**

Works on a laptop or phone, on any network. No laptop server or Cloudflare tunnel is required. Students can browse without an account, then select **Sign in → New here? Create an account** to order.

Kitchen judges: select **Sign in** and use any account below. Every account has the password **`BreakBiteJudge2026!`**.

| Kitchen | Judge email |
| --- | --- |
| Asian Cuisine | `judge.asian-cuisine@breakbite.demo` |
| Bobanika | `judge.bobanika@breakbite.demo` |
| Chinese Kitchen | `judge.chinese-kitchen@breakbite.demo` |
| Japanese Kitchen | `judge.japanese-kitchen@breakbite.demo` |
| Korean Kitchen | `judge.korean-kitchen@breakbite.demo` |
| Let's Kopitiam | `judge.lets-kopitiam@breakbite.demo` |
| Nelson | `judge.nelson@breakbite.demo` |
| Subway | `judge.subway@breakbite.demo` |
| Western Kitchen | `judge.western-kitchen@breakbite.demo` |

These are intentionally public **hackathon demo accounts**, limited to their assigned kitchen. The demo dataset is shared and editable; use fictional information. Revoke these accounts before a real pilot. Google service-account keys, VAPID keys and ordinary user credentials are never published.

### Five-minute judge walkthrough

1. Register a student account. Browse campus pickup areas, filter meals and add a meal to the basket.
2. Choose pickup times and confirm. Payment is at the counter; no online charge occurs.
3. In a separate browser/private window, sign in to that kitchen. Open **Order queue**, start preparation and mark the order Ready.
4. On the student account, open **My orders** and display the pickup QR or manual code. The kitchen verifies the code, counter payment and handover to collect the order. Reusing the code must fail.
5. Check **Order history** in the kitchen and the student's **estimated preparation wait avoided**. Only collected checkouts contribute; the explanation shows the assumptions.
6. Optional: test independent multi-kitchen fulfilment, delays/cancellation, pause/reopen and **Fit my break**. See the [functional UAT checklist](docs/UAT.md).

### Notifications on your phone

Open the **HTTPS demo link** directly in Chrome/Safari, sign in as a student and open **Inbox → Enable push notifications**. Allow permission, then use **Send test notification**. On iPhone/iPad, first **Add to Home Screen**, then open the app from its icon. Signing out disables that browser's subscription.

Push is enabled with private server keys. Active requests process updates; a GitHub Actions job also requests maintenance about every five minutes while the site is idle. Scheduling and browser/OS delivery can be delayed. Physical-device closed-tab delivery must be confirmed on your phone; Inbox remains the durable record. See [Web Push setup and acceptance](docs/WEB_PUSH.md).

The hosted MVP uses `envs/team-dev` in the shared Firestore database. Automatic APSpace refresh is disabled on hosting; manual timetable entry and `.ics` import work. New photo uploads require a private Blob store; the 45 bundled meal photos work without it.

## Run

Requires **Node.js 22.16+ in the 22.x release line**.

```bash
npm install
npm run check
npm run operator
npm start
```

- Open `http://127.0.0.1:8080`.
- `npm run operator` creates a kitchen account. Stop a JSON-backed server first; Firestore permits provisioning while the server runs. Public demo accounts above exist in the hosted database, not a fresh local JSON installation.
- Students register on the website. Kitchen roles cannot be self-selected.
- Existing installations: keep `AUTH_MODE=local` and `STORE=file`; back up `.data/` before upgrading.
- The ready-to-run archive includes `dist/`, so `npm start` and `npm run operator` work without installing build tools.
- Never share runtime databases, private keys, ordinary user passwords or pickup credentials in the repository. Only the explicitly public judge demo logins above are published.

## Working features

| Area | Implemented behaviour |
| --- | --- |
| Ordering | Guest browsing, multiple kitchens in one basket, independent pickup windows/codes, atomic all-or-nothing checkout, durable retry recovery. |
| QR pickup | Private QR per kitchen order; merchant camera/USB scan or manual-code fallback; ready-state, kitchen, payment and one-use checks. |
| Saved meals | Favourites, recently ordered meals, named usual baskets, rename/remove and repeat ordering with current prices, food information and fresh slots. |
| Food information | Vendor-entered ingredients, spice, dietary declarations, contains/may-contain warnings and evidence references; saved student restrictions and explicit unknown states. |
| Campus content | Editable kitchen campus/location/menu source, permission-confirmed local photograph uploads, responsive APU-focused interface. |
| Availability | Dedicated **Availability** tab, separate from Explore. Online preparing/scheduled/ready counts, kitchen status and meal-specific pickup estimates; no claim to measure physical queues or cooking progress. |
| Collection policies | Configurable ordering/cancellation cutoffs, snapshotted order rules, server-generated ready/due/overdue reminders, merchant-confirmed uncollected closure and corrections. |
| Timetable | Manual classes and `.ics` imports, plus opt-in APSpace import by typed intake code and group. Review classes once, then use saved gaps in the planner or basket. Changes require review. |
| Deadline help | Move a not-yet-preparing order into genuinely free earlier capacity, or request reviewed alternatives. Other students are never pushed back. |
| Time saved | Prominent, private estimate of preparation wait avoided on collected checkouts; snapshotted preparation times, lateness adjustment and no double counting across parallel kitchens. |
| Kitchen operations | Menu/stock editing, preparation queue, pause/reopen, capacity settings, delays, consent-based alternatives, collection and operation history. |

## Important workflow rules

- Each kitchen receives its own child order, amount due and collection credential.
- One unavailable kitchen aborts the entire new checkout; no hidden partial order.
- After confirmation, kitchens fulfil independently. Changes recheck active sibling pickup times.
- **Pay at each counter:** staff confirm payment received before handover. The website does not process APCard, cards, refunds or settlement.
- A repeat order rebuilds a basket for review; it never silently places an order or reuses an old slot.
- Saved dietary restrictions are enforced at checkout and replacement acceptance. Unknown data cannot satisfy an active restriction.
- Halal/gluten-free references are **vendor supplied**, with expiry/review dates; BreakBite does not independently certify them.
- Ingredient changes invalidate stale checkout/replacement reviews. Confirmed orders retain their original ingredient snapshots.
- Pickup grace begins after the **later of actual Ready or the booked window end**. Early preparation does not shorten it.
- Overdue orders remain collectable until the merchant closes them. Prepared food and used kitchen capacity are not automatically restored.
- Vendor-caused delay permits eligible cancellation without a no-show record. No automatic fines, strikes or bans are applied.

## QR, notifications and calendar boundaries

- QR camera scanning needs HTTPS (or computer localhost), permission and a browser with `BarcodeDetector` QR support. USB scanner text and the original manual pickup-code form remain available where camera decoding is unsupported.
- QR generation is local. No credential is sent to an external QR image service; no camera image is uploaded.
- Reminders are generated by the running server every 15 seconds and stored in a private account inbox.
- **Background Web Push is implemented:** opt in from Inbox, test delivery, disable this browser or remove another device. Requires private VAPID keys, HTTPS/browser support, permission and a running server with outbound Internet access.
- Follow [Web Push setup and acceptance](docs/WEB_PUSH.md). Real closed-tab device delivery still needs verification on your deployment; SMS/email are not implemented.
- Calendar import expands up to 90 days and 1,000 occurrences. Supported recurrences: DAILY/WEEKLY, interval/count/until/weekdays, exclusions/additions and individual changes.
- UTC, Malaysia and Singapore zones are supported. Unsupported/all-day/malformed series produce warnings instead of guessed dates.
- Imported calendars are snapshots. Preview and confirm, re-import after changes, and delete at any time.

## Real campus data

- The starter catalogue includes nine supplied-photo APU sample vendors, with five project-purpose items each. Menu cards use AI-generated illustrative dish images, clearly credited as samples; the supplied restaurant photographs are retained separately for future kitchen banners. Menus, ingredients and illustrative images remain sample data until reviewed; visible card badges are hidden at the project owner's request.
- Operators can replace menus, upload owned/licensed photographs, record the review source and confirm their kitchen data.
- Card sample badges are hidden at the project owner's request; seed provenance remains stored. Obtain actual vendor confirmation before claiming menus, dietary information or images are verified.
- No fabricated nutrition, halal certification, allergy guarantees, time-saving percentage or university endorsement.

## Estimated time saved

- Explore and My orders show your estimated preparation wait avoided, counted only after collection. The basket previews the potential estimate.
- Per kitchen: preparation minutes saved at checkout minus readiness lateness after the booked pickup start, capped at the order-ahead lead time and rounded down. A replacement starts its lead time when accepted.
- Each checkout contributes its largest kitchen estimate because kitchens may prepare simultaneously. Cancelled/uncollected orders and older orders without a baseline contribute nothing.
- Queue, walking and counter-payment time are excluded. This is an explained estimate, not measured campus time savings.
- Bowl Lab and Noodle & Co. are retired. Existing accounts/orders and retry records remain usable for history and outstanding collection; new installs have nine kitchens and 45 sample items.

## Storage and security

- `.data/database.json`: accounts, sessions, kitchens, orders, checkout keys, saved meals, preferences, timetables and notices.
- `.data/media/`: uploaded raster photographs; include this directory in private backups.
- Single-process lock, serialized draft transaction, flushed temporary file and atomic rename protect multi-kitchen writes.
- Previous JSON snapshot is retained; it is not a complete backup strategy. No multiple replicas/shared filesystem.
- **Firestore option:** `STORE=firestore` keeps the same data in Cloud Firestore, with one atomic, conflict-checked commit per change, so several server processes can share it. See [Firestore storage](docs/FIRESTORE.md).
- Salted scrypt passwords, hashed opaque sessions, HttpOnly cookies, CSRF protection, server-side role/ownership checks and rate limits.
- The optional v0.3 fields migrate in place; existing accounts/orders remain. Legacy ready orders without a timestamp receive a fresh grace period when first observed.
- Email verification/reset delivery, distributed abuse protection, independent security audit and campus-scale performance are not completed.

## Development

```text
src/server/product.ts       Saved meals, QR, timetable, notifications and deadline helpers
src/server/food.ts          Validated vendor food information and review fingerprints
src/server/timetable.ts     Bounded iCalendar parsing and expansion
src/server/policy.ts        Collection rules and online booking load
src/server/checkout.ts      Atomic multi-kitchen ordering and retry lookup
src/server/domain.ts        Authoritative stock, state transitions and recovery
src/server/local-database.ts JSON transactions, locks and ownership boundaries
src/shared/features.ts     Shared product contracts
src/shared/qr.ts           Original QR encoder (version 5-L)
src/web/views/             Student, kitchen and personal pages
src/web/product-actions.ts  Camera, photo, saved meal and timetable interactions
```

TypeScript/native browser modules + CSS + Node.js; **not React**. Firebase Admin is loaded for Firestore; Vercel Blob is loaded for hosted photo uploads.

## Verification and guides

- `npm run check`: type checking, **221 automated tests** (220 pass; one opt-in live Firestore test is skipped by default), production build.
- `npm run test:firestore-memory` / `test:firestore-suite`: the same suite on an in-memory Firestore stand-in or a real Firestore database. See [Firestore storage](docs/FIRESTORE.md#tests).
- Combined ordering, campus-menu, APSpace, QR and notification-settings browser journeys passed over normal localhost HTTP in Chrome at 360/390/768/1440px. QR screenshot decoded independently with OpenCV.
- Public Vercel HTTPS, real Firestore access, the 9-kitchen/45-meal catalogue, student registration/login/reload/logout, Secure/HttpOnly cookies and CSRF/origin rejection have been verified on the hosted site. Desktop and phone-sized Chrome layouts were checked.
- Physical phone camera and closed-tab notification delivery, full hosted ordering/collection UAT, Blob uploads and campus-scale load still require acceptance. Browser push-service acceptance is not proof that an OS displayed an alert.
- [Firestore storage](docs/FIRESTORE.md)
- [Vercel deployment and hosted acceptance](docs/VERCEL.md)
- [Background Web Push and Availability tab](docs/WEB_PUSH.md)
- [v0.3 features and review guide](docs/RELEASE_0_3.md)
- [Test results and limitations](docs/TEST_REPORT.md)
- [Local setup and phone access](docs/LOCAL_MVP.md)
- [Implemented architecture](docs/IMPLEMENTATION.md)
- [API](docs/API.md)
- [Future Google/Gemini setup](docs/MANUAL_SETUP.md)

- [Functional UAT checklist and sign-off](docs/UAT.md): 34 manual scenarios; physical-device acceptance is recorded separately from automated checks.
