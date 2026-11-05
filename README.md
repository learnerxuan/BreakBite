# BreakBite
## Order ahead. Enjoy your break.

- **Purpose:** Browse campus menus, pre-order before arriving, and collect at a convenient time.
- **Track:** Smart Campus & Student Experience.
- **Team:** ByteShift (working name).
- **Current release:** v0.2 — working local-account website with persistent JSON storage.
- **No Google or Gemini license is needed for this release.** Their actual integration is deferred, not claimed complete.

## Problem and solution

- Walk-up ordering means waiting to order and then waiting for food preparation.
- Students should be able to order before class ends, while studying, or whenever convenient; they do not need a short break to benefit.
- BreakBite checks stock, preparation lead time and kitchen/counter capacity before confirming.
- **Mix kitchens:** buy a meal from one counter and a drink from another in the same basket.
- **Choose pickup times:** each kitchen gets a separate order, status, amount due and pickup code.
- **Fit my break is optional:** ordinary ordering does not ask for a class timetable.
- This reduces avoidable waiting; it does not guarantee instant preparation or zero queues.

## Run

Requires **Node.js 22.16+**.

```bash
npm install
npm run check
npm start
```

Open `http://127.0.0.1:8080`.

- The first page shows the menu, not demo-account buttons.
- Students register with a name, email and password (10–128 characters).
- Browse without signing in; authentication is required to place orders.
- Sign-in uses HttpOnly cookies. Accounts, sessions and orders survive restarts.
- Copy `.env.example` to `.env` only when changing settings. Old installations must change `AUTH_MODE=demo` to `AUTH_MODE=local`.
- A ready-to-run ZIP includes `dist/`; its first launch only needs `npm start`.

### Create kitchen operators

Stop the server, then run:

```bash
npm run operator
```

- Enter an operator email, name, a kitchen ID (`bowl-lab` or `noodle-co`) and your own password.
- Repeat for the other kitchen, then restart `npm start`.
- Operators sign in through the same website. Students cannot select or grant themselves a vendor role.
- No default or shared operator password is published.
- Administrative password reset: `npm run operator -- --reset --email=user@example.com` (server stopped; password prompted).

## Working features

| Student | Kitchen operator |
| --- | --- |
| Guest browsing, search and category/kitchen filters | Authenticated kitchen-scoped workspace |
| Multi-kitchen basket with per-kitchen pickup windows | Independent order queues and preparation states |
| Optional break/budget planning | Menu creation and editing: name, description, price, stock, preparation |
| One all-or-nothing checkout across kitchens | Availability controls and pause/reopen |
| Separate child orders, codes and amounts | Rolling pickup windows and future capacity settings |
| Order updates every five seconds | Delay reports and rule-checked recovery proposals |
| Cancel an individual order before preparation | Approval before a student is offered a replacement |
| Accept/decline a proposed alternative | Pickup-code verification and counter-payment recording |
| Recover an uncertain checkout without duplicating orders | Editable kitchen profile and operation history |

## Multi-kitchen checkout rules

- One checkout creates one child order per kitchen. This is not a single shared kitchen ticket.
- Every kitchen's stock and capacity are validated in one JSON database transaction.
- If any child order fails, none of the checkout is committed. No hidden partial success.
- Requests have student-scoped idempotency keys, stored durably with their child-order references.
- Each pickup window must allow one minute for handover plus the user's estimated walk between counters.
- After confirmation, kitchens prepare independently. One delayed or cancelled child does not silently cancel the others.
- Up to five kitchens per checkout and five portions per kitchen are currently supported. The starter catalogue has two kitchens.
- **Pay at pickup:** pay each kitchen separately. An operator confirms receipt before completing collection. The app does not process online payments or refunds.

## JSON storage and security boundaries

- `.data/database.json`: kitchens, menus, orders, users, sessions and checkout records.
- `.data/database.previous.json`: previous saved snapshot; this is not a complete backup strategy.
- Global serialisation + flushed temporary file + atomic rename prevent partial multi-kitchen writes in one process.
- A process lock rejects a second server using the same directory. Do not run multiple replicas or use a shared/network filesystem.
- Existing per-kitchen JSON files are imported only if the aggregate database does not yet exist; invalid data is not silently reset.
- Passwords use salted scrypt; stored session tokens are hashed; mutations require CSRF tokens.
- Role and ownership checks remain on the server. Prices and stock are never trusted from the browser.
- Email verification, email password-reset delivery, distributed rate limiting and production security certification are **not** implemented.

## Mobile website

- The same responsive site supports phone, tablet and desktop layouts; no APK is required.
- The mobile basket button, touch-friendly forms and per-kitchen order cards are implemented.
- See [local setup and phone testing](docs/LOCAL_MVP.md). Default localhost is not reachable from a separate phone.
- A manifest is included. Offline ordering and push notifications are not claimed.

## Code map

```text
src/server/accounts.ts           Local credentials, cookie sessions and reset
src/server/local-database.ts     JSON persistence, locking and draft transactions
src/server/checkout.ts           Atomic multi-kitchen checkout and retry lookup
src/server/domain.ts             Stock, capacity, order lifecycle and recovery
src/server/http.ts               HTTP endpoints and security checks
src/web/main.ts                  Application controller and events
src/web/views/student.ts         Student catalogue, basket, checkout and orders
src/web/views/vendor.ts          Kitchen queue, menu, recovery and settings
src/web/product.css              Responsive product layout
src/shared/model.ts              Shared TypeScript contracts
```

- TypeScript/native browser modules, CSS and Node.js; not React.
- No runtime npm dependencies. Development uses pinned TypeScript and Node declarations.
- Starter menus and illustrations are sample content, not verified APU stalls. Operators can replace/review them; sample labels are not removed merely to look deployed.

## Tests and next steps

- `npm run check`: type checking, **67 automated tests**, then build.
- New coverage includes multi-kitchen rollback, concurrent checkout, persistence, cookie/CSRF auth, payment confirmation and recovery.
- UI journeys tested at desktop and 390/360/768px widths using a local renderer/API bridge. Normal browser navigation was blocked in the test environment; real-device/network testing remains necessary.
- [Current test report](docs/TEST_REPORT.md)
- [Local operation, operator setup, phone access and migration notes](docs/LOCAL_MVP.md)
- [Current implementation](docs/IMPLEMENTATION.md)
- [HTTP API](docs/API.md)

**Deferred:** Google Cloud/Firebase deployment, a multi-kitchen cloud transaction adapter, actual Gemini Enterprise registration/calls, online payment processing, and a real campus pilot. Legacy cloud/MCP adapters remain in source, but the v0.2 product UI deliberately requires local mode until that migration is tested. This is a functional local MVP, not a claim that all hackathon requirements or production requirements are already satisfied.
