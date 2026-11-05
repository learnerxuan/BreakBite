# Implemented architecture

## What is actually built

- TypeScript native browser modules and CSS; Node native HTTP API.
- This replaces the initial React/Vite/Express choice, not the product scope.
- Local mode: durable JSON files, per-vendor serialisation, atomic rename.
- Cloud mode: Firebase Authentication REST sign-in, verified Firebase ID tokens, Firestore REST storage.
- Five-second authenticated polling replaces the proposed client Firestore listeners.
- Source code is separated into shared contracts, domain logic, adapters, HTTP/MCP and UI.

```text
Student / vendor browser
  -> authenticated HTTP API
  -> MealService (prices, identity, time, stock, capacity, state machine)
  -> local file store OR Firestore REST compare-and-swap

Gemini Enterprise (license/tenant setup pending)
  -> private Cloud Run /mcp
  -> the same MealService
  -> pending proposal -> vendor approval -> student consent -> revalidation
```

## Product Positioning and UX Boundary

- The core value is **order before arriving and collect conveniently**, not a requirement that students have insufficient break time.
- Ordering before class ends is one use case; ordinary advance ordering is also within the product direction.
- [PRODUCT.md](PRODUCT.md) describes a target pickup-first experience with an optional **Fit my break** helper.
- **Current code still requires the existing break/class-time inputs and checks at checkout.** A separate path without class-time details has not been implemented.
- The 5 November 2026 positioning update changes documentation only; it does not relax validation or add a working UX mode.
- A future pickup-first path must retain preparation lead-time, inventory, capacity, identity and consent checks. Update the UI, API contract and tests together.

## Time and capacity

- Earliest arrival: max(now, break start) + walk to counter.
- Latest pickup: next class - eating - return walk - buffer.
- A slot must fit that interval and allow the item's configured preparation time plus active delays.
- Item quantities consume weighted kitchen units; each order consumes one counter handover.
- Capacity is an **online allocation**; operators must reserve extra capacity for walk-ins.
- New windows cover approximately three hours, every five minutes with a three-minute handover range.
- Operators can add the next three hours; existing windows and reservations are not rewritten.
- Estimates are conservative rules, not a trained model or an attendance guarantee.

## Transaction boundaries

- Create: validate basket/price/permissions, check stock and both capacities, reserve and create together.
- Idempotency keys are scoped to a student and canonical request payload.
- Cancel only before preparation; release exactly the resources that were reserved.
- State machine: confirmed -> preparing -> ready -> collected. Cancellation is a separate terminal state.
- Failed pickup attempts persist a lockout; successful collection consumes the code.
- File storage is single-process only; do not run multiple processes on the same data directory.
- Firestore uses one bounded JSON aggregate document per vendor and an `updateTime` write precondition. Contention retries reread and recompute the complete mutation.
- Aggregate payload cap: 750 KB. Audit retained: 200 events/vendor. This is an intentional small-pilot design, not campus-scale storage.
- Archive/migration, distributed rate limiting and high-traffic load testing are future hardening, not completed features.

## Recovery

- Only confirmed, not-yet-preparing orders are automatically replaceable.
- Alternatives are same-vendor meals, exclude drinks-only substitutions, preserve portion count, and cannot exceed the original price/budget.
- Evaluation does not reserve anything.
- A proposal captures order version, option and expiry. Creation never changes the order.
- Vendor approves first; the owning student accepts or declines.
- Acceptance rechecks version, expiry, stock, capacity, price and deadline atomically.
- Pickup code rotates after replacement. Other old proposals become stale.
- A prepared meal is not silently returned to stock or swapped.
- Resolution of an incident recalculates estimates and invalidates affected old proposals.

## Authentication and data boundaries

- Demo account switching is local-only and disabled in Firebase mode.
- Firebase users are students unless their exact UID is mapped to a vendor in server configuration.
- Identity verifier checks RS256 signature, fixed trusted certificate endpoint, issuer, audience, subject and token times.
- Token revocation checks, enterprise SSO and email-domain eligibility are not implemented; review before a real pilot.
- Students see their orders; vendors see their own kitchen. Pickup codes never appear in operator/MCP output.
- MCP scopes come from authenticated service identity, never a model-provided vendor ID.
- Separate private MCP service supports Cloud Run's IAM-verified, signature-stripped header ONLY behind an explicitly enabled IAM trust boundary. Never make that service public.
- Alternatively, full signed Google ID tokens can be checked directly; local MCP uses an explicit random test token.
- Client Firestore rules deny all access; server REST access is governed by IAM and API checks instead.
- CSP, origin allowlist, local Host validation, payload caps, escaped HTML and in-process rate limits are included.
- In-process rate limiting is not a global production abuse protection system.

## Honest limitations

- All demo menu data is synthetic; allergen details are unknown, not certified.
- Payments are simulated. Cancelling or changing a demo order does not move money.
- Gemini workflow registration, live cloud deployment and their authentication end-to-end need the team's actual account.
- A manifest is included; no offline ordering/service worker is claimed.
- This is a working MVP requiring human review, not a finished commercial food-service platform.
