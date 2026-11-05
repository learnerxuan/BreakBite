# BreakBite
### Order ahead. Pick up when it suits you.

A working campus meal pre-ordering prototype: **browse before arriving, pre-order for collection, and reduce avoidable on-site waiting.** Time-aware planning and consent-based recovery support that core experience.

- Track: Smart Campus & Student Experience.
- Team name proposed: **ByteShift**.
- Status: **local MVP implemented and tested**. Google cloud adapters are implemented but not live-verified. Gemini Enterprise tenant registration is pending the organiser's license.
- All vendors, menus, payments and incidents in the demo are synthetic. No real purchase, refund, campus deployment or impact statistic is claimed.

## Problem statement

Students who rely on walk-up ordering can spend unnecessary time queuing to place orders and waiting for meal preparation after reaching campus food stalls. They need a convenient way to view menus and order before arriving, then collect at a suitable time, whether or not they have a short break.

- **Core problem:** Avoidable on-site ordering and preparation waits, and limited control over when to collect a meal.
- **Main value:** More convenient campus dining through order-ahead pickup; students do not need to be short of time to benefit.
- **Example use case:** A student orders while still in class, when appropriate, and collects after class. Ordering before class or while studying elsewhere are equally valid scenarios.
- **Supporting challenge:** Short breaks make waiting more costly, but are not the only reason to use BreakBite.
- These are problem hypotheses. Actual waiting points, student demand and vendor feasibility still need validation; no campus-wide prevalence or time-saving result is claimed.

## Proposed solution

- Browse campus menus, prices and availability before visiting a stall.
- Pre-order and select an available pickup window so vendors receive the order in advance.
- Validate stock, kitchen workload and pickup capacity before confirming; pre-ordering must not simply create another overloaded queue.
- Track preparation status and collect using a one-time pickup code.
- Use time-aware planning to help students who want to fit a meal around a class or other commitment.
- Handle unexpected delays with reviewable alternatives, never silent meal replacements.
- Reduce unnecessary waiting, not promise zero queues, instant preparation or guaranteed collection times.

## Product positioning versus current UI

- **Target experience:** Normal pre-ordering first, with an optional **Fit my break** helper for students who want time guidance.
- **Current implementation:** The checkout still uses break/class-time inputs and timing checks. A separate pickup-first path without those inputs is a follow-up UX/code change, not an implemented feature of this documentation update.
- Stock, preparation lead time, capacity, permissions and consent checks remain necessary in every ordering path.
- [Product direction, use cases and planned UX](docs/PRODUCT.md).

## Run locally

**Node.js 22.16+ is required. No Google account is needed for the local demo.**

```bash
npm install
npm run check
npm start
```

Open `http://127.0.0.1:8080`. Choose Alex or Sam for students, or either kitchen operator.

- The ready-to-run release also includes compiled `dist/`. For that package, run `npm start` directly without installing build tools.
- Optional: copy `.env.example` to `.env` to change the port or data directory.
- Local data persists in `.data/`; demo sessions expire on server restart. Sign in again.
- In a vendor account, **Open next 3 hours** creates fresh pickup windows without deleting orders.
- **Reset this kitchen's demo data** is destructive and local-only; confirm before using it.
- Do not expose demo mode through a tunnel. It deliberately refuses public binds and Cloud Run.

## Implemented features

| Student | Vendor / operations |
|---|---|
| Responsive menu, search, category/vendor filters | Preparation queue and status transitions |
| Break time, budget, walking/eating/buffer inputs | Stock editing, sold-out control, pause new orders |
| Meal feasibility hints and real pickup-window checks | Separate kitchen workload and pickup limits |
| One-vendor basket, up to five portions | Open fresh pickup windows without overwriting reservations |
| Server-priced checkout and idempotent submission | Menu-specific or kitchen-wide delay reports |
| Order tracking; cancel before preparation | One-time pickup verification and failed-attempt lockout |
| Private pickup code; accept/decline an alternative | Recovery evaluation, proposal review and audit trail |

- Three authenticated MCP tools: `get_vendor_state`, `evaluate_recovery_options`, `create_recovery_proposal`.
- Rules-based preview works now and is explicitly **not labelled as Gemini execution**.
- Proposals require vendor approval, student consent and a fresh atomic stock/capacity check.
- Cloud mode includes Firebase email/password sign-in, verified ID tokens and a Firestore REST adapter.
- Updates poll every five seconds. This build does not use Firestore client listeners.

## Stack and project structure

- TypeScript, native browser modules and CSS; Node.js native HTTP server.
- Zero runtime npm dependencies; TypeScript and Node types are development dependencies.
- This changes the original React/Vite/Express proposal. It keeps the same product and Google integration boundaries, with a small directly runnable build. A React migration is optional, not already implemented.
- Original CSS food illustrations; no external image/font dependency.

```text
src/shared/       Typed contracts
src/server/       Ordering, storage, authentication, HTTP and MCP
src/web/          Student/vendor UI and API client
public/           HTML, icon and manifest
infra/            Cloud environment templates and deny-client-write rules
scripts/          Build and deployment helpers
tests/           Domain, HTTP, auth, Firestore-adapter and browser checks
```

## Verification

- `npm run check`: strict type checking, **42 automated tests**, production build — passed in the development environment.
- Browser smoke: desktop and 390px mobile checkout, recovery approvals, collection and privacy checks passed using a documented local-backend bridge.
- Actual Firebase, Cloud Run, container deployment and Gemini Enterprise execution **have not been tested with a real project/account**.
- [Test report and limitations](docs/TEST_REPORT.md).

## Start here

- [Product direction and problem statement](docs/PRODUCT.md)
- [Actual implementation and design decisions](docs/IMPLEMENTATION.md)
- [Manual Google setup and deployment](docs/MANUAL_SETUP.md)
- [Gemini Enterprise connector and agent prompt](docs/AGENT_SETUP.md)
- [HTTP API](docs/API.md)
- [Five-person review checklist](docs/REVIEW_CHECKLIST.md)
- [Local demo walkthrough](docs/DEMO.md)

`PRODUCT.md` defines the current product direction and labels planned UX separately. Earlier `ARCHITECTURE`, `TEAM` and `DELIVERY` documents remain planning records; `SUBMISSION.md` records submission guidance and its verification limits. This README and `IMPLEMENTATION.md` describe the code actually delivered.

## Boundaries before a real pilot

- Simulated payment only; no refunds, delivery, group orders or timetable import.
- Recovery is same-vendor, before preparation, and no more expensive than the original order.
- Pickup times are estimates, not guarantees. Allergy/certification details are not invented.
- Firestore stores one bounded aggregate per vendor with compare-and-swap writes: suitable for a small prototype, not a campus-scale data architecture.
- No production security certification, payment certification or performance claim. Read the manual checklist before using real student data.
