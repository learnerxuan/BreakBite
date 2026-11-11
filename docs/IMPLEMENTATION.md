# Implemented architecture — v0.3

> v0.3.1 update: Availability has its own tab and opt-in background Web Push is implemented. See [WEB_PUSH.md](WEB_PUSH.md) for setup, security and unverified live-device delivery. Earlier page-only notification limitations below describe v0.3. SMS/email and cloud deployment remain separate.


## Runtime

- Native TypeScript/CSS browser modules and Node HTTP backend.
- `AUTH_MODE=local`, `STORE=file`; cookie-authenticated accounts and persistent JSON.
- A single locked database stores all kitchens. A checkout validates all children and writes one atomic file replacement, or commits nothing.
- Legacy cloud/MCP adapters remain migration code. The product UI deliberately requires local mode until cloud multi-kitchen transactions are implemented and tested.

## Transaction and identity boundaries

- The server owns price, stock, role, identity, capacity and order status.
- Student-scoped idempotency survives restarts and response loss.
- Multi-kitchen child orders fulfil independently. Rescheduling/recovery revalidates the active sibling itinerary.
- Cookie sessions are HttpOnly/SameSite=Strict; secure cookies require HTTPS. Authenticated writes require CSRF tokens.
- Operators are provisioned by a stopped-server CLI, never public role selection.
- JSON uses global serialization, draft rollback, checked schema, flushed temporary file, atomic rename and a process lock. No shared filesystem or multiple writers.
- Database cap is 20 MB. The previous snapshot is only one recovery copy. Back up JSON and media privately.

## Product service

- `product.ts`: favourites, usual baskets, reorder review, private preferences/calendar, QR handover, notices, uncollected handling, earlier capacity and media uploads.
- `features.ts`: shared dietary, timetable, notice and policy contracts.
- v0.3 profiles/notices/order fields are optional additions to schema 2. Existing v0.2 accounts and orders are preserved.
- A repeat order is a current-data basket proposal, not a purchase. Price/ingredient changes and unavailable items produce warnings.
- Student profiles and calendar previews are never included in the public catalogue or another student's view.

## QR handover

- Original local version 5-L QR encoder, byte mode and mask 0, independently compared/decoded in testing.
- Credential: `BB1:<order UUID>:<128-bit random token>`. It contains no student name, email or payment data.
- Only the owner can request a QR. Operators resolve it only within their own kitchen, after Ready.
- The merchant explicitly confirms counter payment and physical handover. Atomic collection consumes both QR and manual code.
- A retry/duplicate/changed credential cannot collect twice. Replacement, rescheduling, cancellation and uncollected closure invalidate old credentials.
- Camera images stay on the device. Native BarcodeDetector needs browser support and HTTPS/permission; manual and USB input remain fallback paths.

## Food metadata and repeat safety

- Vendor-entered ingredients, known/unknown allergen status, contains/may-contain lists, spice and dietary declarations.
- Source/expiry fields are mandatory for halal/gluten-free declarations. No independent certification or AI nutrition inference.
- Saved restrictions fail closed on unknown or conflicting data.
- A content hash, not only a timestamp, identifies reviewed food information.
- Checkout and replacement acceptance reject changed food reviews. Confirmed order lines retain food snapshots; recovery evaluates current saved restrictions.
- Photos are bounded raster uploads with ownership/permission acknowledgement, local hashed filenames and nosniff responses. SVG/HTML and external hotlinked images are not accepted.

## Time, policy and notices

- Normal ordering has no class requirement. Fit my break optionally checks the selected break, food budget and eating time. The UI no longer asks for walking/return/buffer allowances; new plans send zero for those legacy contract fields. Historical plans and pending checkout payloads remain readable.
- Kitchen workload and counter handover capacity are separate online allocations. Walk-in demand must be reserved by merchants.
- New-order cutoff uses pickup start; normal cancellation requires both not preparing and before the snapshotted cancellation cutoff.
- Vendor lateness beyond the agreed allowance enables no-strike cancellation; prepared ingredients are not returned to stock.
- Ready captures actual time. Grace ends at max(actual Ready, booked window end) + agreed hold duration.
- A server timer runs every 15 seconds and creates deduplicated private inbox notices. Late/overdue state does not depend on a student leaving the website open.
- Overdue orders remain collectable until a merchant closes them with a reason. No automatic bans/fees, inventory restoration or retroactive capacity release.
- Opt-in background Web Push uses a durable queue and a push-only service worker. Real closed-tab device delivery remains unverified; email/SMS are not implemented.

## Availability and earlier assistance

- Booking indicators use the larger of kitchen and counter allocation usage. Labels show Available/Filling/Full/Closed and update time.
- They do not measure physical lines or predict historical peaks.
- Earlier-slot selection rechecks free capacity, current price/workload/food review and sibling timings atomically.
- No other customer's reservation is displaced. If no suitable slot exists, preserve the original order.
- Student-requested faster replacements still require merchant approval and final student consent.

## Timetable

- Manual one-off/weekly classes and `.ics` preview/confirm with merge-or-replace imported entries.
- 256 KB input, 1,000 source/expanded events, 90-day horizon, 15-minute private previews.
- UTC/Malaysia/Singapore times; DAILY/WEEKLY recurrence, interval/count/until/weekdays, EXDATE/RDATE and individual changed/cancelled instances.
- Unsupported/all-day/invalid series are warned and skipped as a unit, never guessed.
- An opt-in APSpace pilot uses a fixed public intake feed. The student types their intake code, selects the group and confirms an account-owned preview. A shared server cache checks for changes and stages affected dates for review. The basket uses confirmed gaps from the saved planner.
- An unavailable source or unconfirmed change suppresses affected suggestions. A refresh preserves checkout retry records and accepted orders. The provider uses public timetable rows without requiring APSpace credentials.
- Timetable gaps populate an optional break plan, not a capacity guarantee.

## Estimated preparation wait avoided

- New orders snapshot the longest menu preparation estimate, pickup start and effective ordering time. Accepted replacements refresh the baseline; earlier moves refresh the pickup start.
- `shared/savings.ts` counts only collected, student-owned orders: max(0, min(order-ahead lead, prep estimate minus readiness lateness)), in whole minutes. Each checkout contributes its largest child value.
- Totals are derived on the server from durable orders, so visits, retries and pickup replay cannot increment them. Old records without a baseline remain excluded. Queue/walking/payment savings are not measured.
- Archived legacy kitchens are excluded from the catalogue, menu and availability. Their order records, credentials for outstanding collection and idempotency history remain intact.

## Browser and operational limits

- Five-second polling; active editing and open scanner dialogs are not replaced by polling.
- Structured static modules: student, vendor, personal views, product actions, shared state/controller.
- Ordinary ordering continues without AI, camera or notification permissions.
- Actual Google deployment, Gemini execution, online payments, email verification/reset, real-device camera/TLS and campus-scale security/load tests remain unverified or deferred.
