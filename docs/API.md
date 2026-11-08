# HTTP API — v0.3

## Authentication and validation

- Same-origin JSON API. Use local HttpOnly session cookies; authenticated mutations require `X-CSRF-Token`.
- Roles, prices, stock, capacity, order ownership and vendor scope are server-authoritative.
- Errors: `{ "error": { "code": "...", "message": "..." } }` with an appropriate HTTP status.
- `GET /api/catalog` is public. `GET /api/session` returns the current actor and in-memory CSRF token.
- `POST /api/auth/register`, `/api/auth/login`, `/api/auth/logout` manage local accounts/sessions. Vendor provisioning remains a server-side CLI action.

## Existing ordering routes

| Method / route | Purpose |
| --- | --- |
| `GET /api/state` | Scoped orders, menus, slots, incidents, proposals and operation history. |
| `POST /api/checkout/quote` | Current totals, usable slots, dietary reasons and food-review fingerprints. |
| `POST /api/checkouts` | Atomic multi-kitchen checkout; `Idempotency-Key` required. |
| `GET /api/checkouts/:key` | Recover the current student's existing checkout after a lost response. |
| `POST /api/vendors/:vendor/orders/:id/cancel` | Eligible owner cancellation, including qualifying vendor delay. |
| `POST /api/vendors/:vendor/orders/:id/status` | Merchant preparation transition. |
| `POST /api/vendors/:vendor/orders/:id/collect` | Merchant manual-code collection with `paymentReceived:true`. |
| `PATCH /api/vendors/:vendor/profile` | Name, campus, pickup location, source acknowledgement and future-order policies. |
| `POST/PATCH /api/vendors/:vendor/items[/:id]` | Create/edit menu information; reviewed `foodInfo` is optional on partial updates. |
| `POST /api/vendors/:vendor/slots` | Open rolling windows using configured online capacity. |
| `POST /api/vendors/:vendor/incidents` | Report delay. |
| `POST /api/vendors/:vendor/incidents/:id/resolve` | Resolve delay. |
| `POST /api/vendors/:vendor/recovery/evaluate` | Merchant/agent checks valid alternatives. |
| `POST /api/vendors/:vendor/proposals` | Create pending proposal. Students can request only for their own assistance-marked order. |
| `POST /api/vendors/:vendor/proposals/:id/approve` | Merchant approval/rejection. |
| `POST /api/vendors/:vendor/proposals/:id/respond` | Owning student consent/rejection and fresh atomic validation. |

- Quote body: `{groups:[{vendorId,items:[{itemId,quantity}]}],plan}`.
- Checkout adds a `slotId` for every group, `transferMinutes`, `expectedTotalSen` and the `menuVersions` map returned by quote.
- `plan` is `{mode:'pickup',budgetSen}` or the optional break-time contract. No fake class time is required.
- Food changes invalidate old reviews, even when two changes share a timestamp.
- Submissions preserve independent child codes, fulfilment and payment recording; no online payment is processed.

## v0.3 product routes

All below require a session. GET routes do not mutate user settings; all action routes use POST plus CSRF.

| Route after `/api/product/` | Method | Body / response |
| --- | --- | --- |
| `profile` | GET | Own `{profile,notices}`; student only. |
| `loads` | GET | Current online kitchen/counter loads, timestamps and next available windows. |
| `preferences` | POST | `{diets,avoid,hideUnsuitable}`. |
| `favourite` | POST | `{itemId,saved:boolean}`; up to 100. |
| `usual` | POST | Create `{name,lines:[{vendorId,itemId,quantity}]}`, rename `{id,name}`, or remove `{id,remove:true}`; up to 20 baskets. |
| `reorder` | POST | `{usualId}` or `{checkoutId}` -> current `{basket,warnings}`; no order creation. |
| `notices/read` | POST | Mark the current student's notices read. |
| `timetable/manual` | POST | `{title,location,startAt,endAt,weeks}`; ISO timestamps, 1–13 weeks. |
| `timetable/preview` | POST | `{content}` (.ics text, max 256 KB) -> owned, expiring preview. |
| `timetable/confirm` | POST | `{previewId,ids,replaceImported}`; selected preview IDs only. |
| `timetable/delete` | POST | `{id}` or `{all:true}`. |
| `pickup/qr` | POST | `{vendorId,orderId}` -> private owner-only `{payload}`. |
| `pickup/resolve` | POST | Merchant `{payload}` -> own ready order, without pickup secrets. |
| `pickup/collect` | POST | Merchant `{payload,paymentReceived:true}` -> atomic handover. |
| `uncollected` | POST | Merchant `{orderId,reason}` after grace; no restock or automatic penalty. |
| `no-show/correct` | POST | Merchant `{orderId,reason}` clears an incorrect no-show record. |
| `earlier/options` | POST | Owner `{vendorId,orderId}` -> available earlier slots and explanation. |
| `earlier/confirm` | POST | Owner `{vendorId,orderId,slotId}` -> revalidated reservation; no displacement. |
| `assistance` | POST | Owner `{vendorId,orderId}` -> valid faster alternatives; no automatic change. |
| `photo` | POST | Merchant `{itemId,data:base64,credit,permission:true}` or `{itemId,remove:true}`. |

Photos are served by exact hashed raster paths under `/media/`. Input bytes are capped at 2 MB; HTML/SVG and arbitrary filenames/URLs are rejected.

## Food and policy contracts

- `foodInfo`: ingredients, `allergensKnown`, `allergens`, `mayContain`, `diets`, `spice`, optional halal/gluten-free evidence `{reference,expiresOn}`, and `confirmed:true`.
- The server adds `reviewedBy/reviewedAt`. Evidence is vendor-provided, not a certification by the app.
- Enumerations are in `src/shared/features.ts`. Unknown information does not satisfy an active restriction.
- Vendor `policies`: `cutoffMinutes`, `cancellationMinutes`, `holdMinutes`, `delayGraceMinutes`.
- Each new order snapshots its policy and food review. Ready/overdue notices are server-generated and privately stored.
- A historical order, not a current menu entry, is the source of its original sold-item/ingredient snapshot.

## Deferred integrations

Legacy MCP tools are retained, but actual Gemini Enterprise connectivity is unverified. The v0.3 product requires local mode. Google migration must preserve atomic multi-kitchen writes, current permissions and the full acceptance suite.
