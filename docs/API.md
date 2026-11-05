# HTTP API — local product v0.2

- Base: the same origin as the website.
- JSON bodies; prices are integer MYR sen; timestamps are ISO with timezone.
- Session cookie `bb_session` is HttpOnly. Mutation requests need `X-CSRF-Token` returned by login/session.
- All routes enforce origin/host checks. Do not log credentials, cookies or pickup codes.

## Public / identity

| Route | Purpose |
| --- | --- |
| `GET /api/config` | Current runtime mode; no demo identities in local mode. |
| `GET /api/catalog` | Public menus and kitchen profiles, no orders or accounts. |
| `POST /api/auth/register` | `{ name, email, password }`; student role only. |
| `POST /api/auth/login` | `{ email, password }`; sets cookie and returns actor/CSRF token. |
| `GET /api/session` | Current actor and CSRF token; 401 if expired. |
| `POST /api/auth/logout` | Revoke the cookie session; requires CSRF token. |
| `GET /api/state` | Catalogue plus only the caller's orders/proposals/operator data. |

## Multi-kitchen checkout

`POST /api/checkout/quote`:

```json
{
  "groups": [
    { "vendorId": "bowl-lab", "items": [{ "itemId": "chicken-rice", "quantity": 1 }] },
    { "vendorId": "noodle-co", "items": [{ "itemId": "lemon-water", "quantity": 1 }] }
  ],
  "plan": { "mode": "pickup", "budgetSen": 50000 }
}
```

- Response: per-kitchen quotes/slots, combined total, blocking reasons.
- `POST /api/checkouts`: same payload, with a `slotId` inside each group, `transferMinutes`, and `expectedTotalSen`.
- Include a unique `Idempotency-Key` header. Keep it and the exact payload for retries.
- All-or-nothing: an unavailable kitchen, price change, budget failure or conflicting pickup itinerary commits no child orders.
- Response: `{ id, orders, totalSen }`; each child has a vendor, code, status and payment terms.
- `GET /api/checkouts/:key`: `{ checkout: result | null }`, scoped to the authenticated student. Null does not authorize creating a new request while an earlier request is in flight; retry the original key.
- Legacy `POST /api/orders` is rejected in local mode so clients cannot bypass the combined-checkout checks.

Optional `plan` uses the earlier break fields: `breakStartAt`, `nextClassAt`, `walkToMinutes`, `eatMinutes`, `returnMinutes`, `bufferMinutes`, `budgetSen`. Normal pickup requires none of those time fields.

## Kitchen/order actions

All routes below start with `/api/vendors/:vendorId/`.

| Route | Who / body |
| --- | --- |
| `PATCH profile` | Own operator: name, location, description; optional confirmMenu acknowledgement. |
| `PATCH open` | Own operator: `{ open }`. |
| `POST items` | Own operator: complete menu fields. |
| `PATCH items/:id` | Own operator: stock/enabled, or complete menu fields. |
| `POST slots` | Own operator: kitchenCapacity, pickupCapacity for future windows. |
| `POST orders/:id/cancel` | Owning student; before preparation. |
| `POST orders/:id/status` | Own operator: status preparing or ready. |
| `POST orders/:id/collect` | Own operator: `{ code, paymentReceived: true }`. |
| `POST incidents` | Own operator: itemIds (empty = all), reason, delayMinutes. |
| `POST incidents/:id/resolve` | Own operator. |
| `POST recovery/evaluate` | Own operator: orderId. |
| `POST proposals` | Own operator: orderId, itemId, slotId, reason. |
| `POST proposals/:id/approve` | Own operator: `{ approve }`. |
| `POST proposals/:id/respond` | Owning student: `{ accept }`. |

Complete menu fields: name, description, category, art, priceSen, stock, prepMinutes, prepUnits, enabled. Confirmed prices are snapshots, not references to future menu prices.

## Errors

- `{ error: { code, message } }` with appropriate HTTP status.
- 401: sign in again; 403: ownership/role/CSRF/origin rejection.
- 409: stale price, full slot, stock change, conflicting key, overlapping pickup or invalid state.
- 429: rate limit, login or pickup lockout.
- On an uncertain transport outcome, check/retry the original checkout key; never silently submit another basket.
