# HTTP API

- Base path: `/api`. JSON bodies only; maximum 32 KB.
- Business endpoints require `Authorization: Bearer <session-or-Firebase-ID-token>`.
- Error shape: `{ "error": { "code": "...", "message": "..." } }`.
- All timestamps are ISO UTC; UI displays Asia/Kuala_Lumpur. Prices are integer MYR sen.
- `v` below means `/api/vendors/:vendorId`; server permissions always check the actor.

| Method / route | Body / purpose |
|---|---|
| GET `/healthz` | Process health, mode and storage; not a dependency connectivity test. |
| GET `/api/config` | Public mode / Firebase web config / local demo identities. |
| POST `/api/demo/login` | `{id}`; local-only fixed demo identity. |
| GET `/api/session` | Current actor. |
| GET `/api/state` | Role-scoped UI snapshot. |
| POST `/api/quote` | `{vendorId, items, plan}` -> prices, valid windows, reasons. |
| POST `/api/orders` | `{vendorId, items, plan, slotId}`; required `Idempotency-Key`. |
| PATCH `v/open` | `{open: boolean}`. |
| PATCH `v/items/:id` | `{stock?: integer, enabled?: boolean}`. |
| POST `v/slots` | `{kitchenCapacity, pickupCapacity}`; open next three hours, preserve existing. |
| POST `v/orders/:id/cancel` | Student-owner, before preparation. |
| POST `v/orders/:id/status` | `{status: "preparing" | "ready"}`; operator-only. |
| POST `v/orders/:id/collect` | `{code}`; operator verifies ready order once. |
| POST `v/incidents` | `{itemIds: [], delayMinutes, reason}`; empty items means whole kitchen. |
| POST `v/incidents/:id/resolve` | Resolve active incident and recompute. |
| POST `v/recovery/evaluate` | `{orderId}` -> deterministic options. |
| POST `v/proposals` | `{orderId, itemId, slotId, reason}` -> pending proposal. |
| POST `v/proposals/:id/approve` | `{approve: boolean}`; scoped operator. |
| POST `v/proposals/:id/respond` | `{accept: boolean}`; owning student. |
| POST `v/reset-demo` | Explicitly destructive, local-only and own-vendor only. |
| POST `/mcp` | Authenticated JSON-RPC; separate identity, not student token. |

## Basket and plan

```json
{
  "vendorId": "bowl-lab",
  "items": [{"itemId": "chicken-rice", "quantity": 1}],
  "plan": {
    "breakStartAt": "<future ISO UTC timestamp>",
    "nextClassAt": "<later ISO UTC timestamp, within 24 hours>",
    "walkToMinutes": 3,
    "eatMinutes": 12,
    "returnMinutes": 5,
    "bufferMinutes": 3,
    "budgetSen": 1500
  }
}
```

- Quote returns `slots[]` with an ID; send that ID to `/orders`.
- One kitchen per order, maximum five portions; no client-supplied price or role is trusted.
- Keep the same idempotency key for retries of the same request. A changed payload needs a new key.
- Price and time hints in the UI are not reservations. The final server transaction can reject a changed slot.
- Inspect `src/shared/model.ts` for complete response types.
