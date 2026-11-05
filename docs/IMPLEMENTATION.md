# Implemented architecture — v0.2

## Current runtime

- Native TypeScript browser modules + CSS; Node HTTP server.
- Default: `AUTH_MODE=local`, `STORE=file`.
- Cookie-authenticated students/operators with persistent accounts, sessions and orders.
- JSON is the authoritative database, not a frontend mock. No Google/Gemini license required.
- Cloud/MCP adapters remain as legacy migration code; the current UI deliberately requires local mode.

## Ordering

```text
Student catalogue -> multi-kitchen basket -> per-kitchen pickup selection
 -> authenticated POST /api/checkouts
 -> one serialized database transaction
 -> validate every kitchen and the combined budget/itinerary
 -> reserve stock + kitchen workload + counter capacity
 -> flush temporary JSON and rename once
 -> return one checkout containing independent kitchen orders
```

- A normal pickup plan is `{ mode: 'pickup', budgetSen }`; no fake class time is created.
- Fit my break optionally supplies the earlier BreakPlan contract.
- All kitchen writes share one draft. A rejected child discards the whole draft.
- Student-scoped idempotency records survive restarts and map to the original child orders.
- The lookup endpoint recovers a committed checkout after a response is lost.
- Counter handovers are one minute each, plus user-supplied inter-counter walking time. This is a conservative constraint, not route mapping.
- Inventory, price, timing, role and ownership are always revalidated on the server.
- Current limits: five kitchens/checkout, five portions/kitchen, RM500 combined maximum.

## Independent fulfilment

- Each child: confirmed -> preparing -> ready -> collected; cancellation only before preparing.
- Each child has its own pickup code, kitchen queue, amount and payment status.
- Cancel/complete/delay one child without silently mutating siblings.
- Payment is due at its counter. Collection requires the pickup code and explicit operator confirmation of payment received.
- No card processing, settlement, online charge or online refund is implemented.

## Identity and storage

- Salted scrypt (`N=32768, r=8, p=1`, 64-byte key); no plaintext passwords stored.
- Opaque random session cookies, HttpOnly/SameSite=Strict, 12-hour expiry. Secure flag is configurable for HTTPS.
- Only session-token hashes are persisted. CSRF tokens are required on authenticated mutations.
- Roles cannot be selected in registration. Operator provisioning/reset requires server-side CLI access.
- Sign-in request limits and account lockout are included; these are not distributed abuse protection.
- Single-process JSON lock, global serialization, checked schema, a flushed temp file and rename.
- Previous snapshot backup; 20 MB aggregate cap. No multi-replica/shared-filesystem support.
- Invalid database data fails startup. Legacy kitchen files import only if no new database exists.
- Browser/API data omit account password records; operator/MCP responses omit student pickup codes.

## Frontend modules

- `main.ts`: routing, state updates, handlers, checkout retry lifecycle.
- `state.ts`: typed view state and non-sensitive basket cache.
- `client.ts`: same-origin HTTP client and in-memory CSRF token (session cookie is HttpOnly).
- `views/student.ts`: catalogue, optional planner, basket, grouped orders and checkout.
- `views/vendor.ts`: order queue, menu editing, delays, approvals and settings.
- `ui.ts`: escaped output helpers and original CSS illustrations.
- `product.css`: responsive layout. Same site for desktop, tablet and mobile.
- Poll every five seconds while visible; avoid replacing an actively edited form.

## Menu and scheduling

- Operators create/edit items, prices, stock, lead time, workload, category and illustration.
- Confirmed line prices remain snapshots; changed checkout prices require review.
- A running server refreshes a rolling three-hour schedule using operator-configured online capacity.
- Walk-in demand must be reserved outside the online allocation. Existing reservations are not overwritten.
- Starter menus are explicitly sample data until reviewed/replaced by an operator.

## Recovery

- Rule-based alternatives are same kitchen, no more expensive, and require approval plus consent.
- Ordinary pickup can accept a later slot; break plans retain their deadline.
- Single-item meal orders get meal alternatives; drink orders get drink alternatives.
- Mixed-item child orders require manual handling rather than unsafe wholesale substitutions.
- Recheck stock/price/version/expiry/capacity on student acceptance, then rotate the code.
- Gemini execution, actual Google deployment, online payments and production certification are not claimed.
