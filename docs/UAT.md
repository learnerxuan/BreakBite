# BreakBite functional UAT — 11 November 2026

This is the manual acceptance checklist, not a claim that device UAT has passed. Automated evidence is in [TEST_REPORT.md](TEST_REPORT.md). Record Pass/Fail/Blocked, actual result, tester, browser/device and date for each scenario.

## Setup and acceptance

- Use a disposable test installation and test orders. Do not change a real kitchen's stock, policies or sample-review acknowledgement just to make a demo pass.
- Have two student accounts (S1/S2) and two kitchen accounts (K1 Asian Cuisine/K2 Bobanika), in separate browser profiles/devices. Credentials stay in the private judge sheet, not this file or the repository.
- Start with both kitchens open, reviewed test items with stock, and future pickup capacity. All times are Malaysia time. Keep the local JSON server single-process.
- Desktop/local link: `http://localhost:8080`. Phone LAN link depends on current Wi-Fi. Camera testing needs a valid HTTPS URL; plain LAN HTTP is only suitable for manual-code testing.
- Desktop Chrome and a real phone are required. Test Safari separately if it is a submission target. Browser emulation is not physical phone approval.
- Stop and fix any wrong-owner access, duplicate order/collection, partial checkout, price/stock mismatch, silent sibling cancellation or misleading payment confirmation before signing off.
- For release acceptance: all P0 cases must pass in the target environment. P1 failures require an explicit documented decision. Repeat applicable P0 cases after cloud migration.

## Five-minute judge walkthrough

1. S1 browses food, checks the kitchen status and one-portion pickup estimate, then adds food from K1 and a drink from K2.
2. S1 reviews actual pickup windows and confirms once; two kitchen orders and separate codes appear.
3. K1 starts preparing, marks Ready and completes pickup with S1's code plus counter-payment confirmation.
4. K1 opens Order history, filters the table and sees its collected order. K2's order remains independently active.
5. S1 sees the explained food-wait estimate after collection. K2 reports a qualifying delay; S1 sees the update and can cancel only K2.
6. K1 closes/reopens its kitchen; S1 sees food disappear/reappear. Existing order history stays intact.

## P0 scenarios

Each row gives the objective, starting conditions/role, executable actions and expected results. Manual result is initially **Not run**.

| ID | Objective and setup / role | Steps | Expected result | Manual result |
|---|---|---|---|---|
| U01 | Guest browsing; open kitchens | Open Explore; search; change category and kitchen filter; open dietary details. | Correct items and prices; sample labels retained; no private orders or credentials exposed. | Not run |
| U02 | Student login/logout; S1/S2 | Register S1; sign out; sign in as S2; return to S1. Try wrong password once. | Wrong password rejected; private orders/preferences/savings stay scoped to each account. | Not run |
| U03 | Kitchen isolation; K1/K2 | Sign in separately; open queue/history; attempt an order URL/API action belonging to the other kitchen with tester assistance. | Only own-kitchen orders visible/actionable; cross-kitchen request rejected. | Not run |
| U04 | Mobile basket; S1, empty basket | At menu top tap Your basket, close, tap Fit my break; edit budget; close/reopen; add and remove a meal. | Controls reachable without scrolling to the menu end; draft/cart retained; no walking/buffer inputs; last-item removal stays usable. | Not run |
| U05 | Anonymous kitchen activity; S1 and K1 | Place one order; K1 moves confirmed → preparing → ready → collected. Observe Availability/menu after each poll. | Scheduled/preparing/ready counts change correctly; collected orders leave all three counts; counts describe online orders, not people ahead. | Not run |
| U06 | Per-meal pickup estimate; S1, two foods with different prep times | Compare cards; add one portion; open checkout; increase quantity and quote again. | Advisory estimate considers that meal's prep/delay and free workload/counter capacity. Actual basket is revalidated; larger basket may need a later window. | Not run |
| U07 | Closure; K1 has an active order | Close K1; reload operator; refresh S1 Explore/favourites; try a stale basket; collect the existing order; reopen. | Closure persists; food hidden; new checkout blocked; existing order still collectable; reopening restores food. | Not run |
| U08 | Full capacity / sold out; K1/S1 | Set a test item's stock to zero, then restore. Fill a test window's online capacity through valid orders; check menu/checkout. | Sold-out item cannot be ordered. No available capacity yields no pickup estimate/slot; no invented time. | Not run |
| U09 | Ordinary checkout; S1 | Leave Fit my break off; add K1 meal; review pickup and confirm. | Successful order without timetable/class information; server price and fresh slot used. | Not run |
| U10 | Multi-kitchen atomicity; S1, K1/K2 | Add both kitchens; quote. In another session exhaust K2 stock/capacity or close K2; submit old quote. | No child order committed and no K1-only reservation. Clear recovery/review path. | Not run |
| U11 | Concurrency; S1/S2, last portion or handover slot | Quote the same remaining stock/capacity in two profiles; submit concurrently. | At most the available quantity/capacity succeeds. No negative stock or overbooking. | Not run |
| U12 | Lost response / duplicate click; S1 with tester-assisted network interception | Submit checkout; drop response after server commit; double-click/retry/reload; recover the original request. | Exactly one checkout with the same child order IDs; unresolved requests prevent basket mutation/duplicate purchase. | Not run |
| U13 | Price and food-review changes; S1/K1 | Quote; operator changes price or reviewed ingredients; submit old quote. | Stale quote fails safely and asks for review; no browser-supplied price accepted. | Not run |
| U14 | Normal cancellation; S1 confirmed order | Before prep and cutoff, cancel K1 in a two-kitchen checkout. | K1 cancelled, credential invalidated, appropriate unused stock/capacity released; K2 unchanged; no online refund claim. | Not run |
| U15 | Cancellation lock; S1/K1 | Start preparation or pass the normal cancellation cutoff without qualifying vendor lateness; try cancellation. | Ordinary cancellation blocked with an explanation. | Not run |
| U16 | Reported delay; K1/S1 | K1 reports item-specific +10 minutes and reason; view S1 order, card and Inbox; resolve incident. | Affected pending estimates update; kitchen marked Delayed; unrelated kitchen unchanged. Resolution recalculates estimates, without silently changing meals/slots. | Not run |
| U17 | Unreported lateness; controlled-clock fixture or wait for deadline | Leave a confirmed/preparing order past promised pickup end + saved lateness allowance, with no ready order and no incident. | Server timer creates one private delay notice; repeated ticks do not duplicate it; eligible cancellation works. | Not run |
| U18 | Vendor-late cancellation; S1/K1 preparing order | Report delay beyond saved allowance (default 5 min beyond promised pickup end); cancel. | Cancellation allowed; no student no-show penalty; prepared food/workload not restored; sibling order unchanged. | Not run |
| U19 | Replacement consent; K1/S1, delayed order with eligible alternative | Kitchen proposes and approves an alternative; student declines, then repeat with acceptance. | Decline retains original. Acceptance occurs only after explicit consent and dietary/price/capacity/sibling timing checks; old pickup credential invalid. | Not run |
| U20 | Manual pickup; ready K1 order | Try wrong code; enter correct code without payment tick; then confirm payment and handover. | Wrong code/payment omission blocked. Valid handover collects once, records counter payment and moves order into history. | Not run |
| U21 | QR on physical phone over HTTPS; ready K1 order | Allow camera, scan QR from another screen; confirm payment/handover. Repeat with permission denied or unsupported detector. | Supported camera decodes correct order. Denial/unsupported browser gives useful fallback. Camera images stay local. HTTPS alone does not prove decoding support. | Not run |
| U22 | Pickup misuse; K1/K2/S1/S2 | Try early (not Ready) and wrong-kitchen collection; as S2 request S1's QR through the student API; replay a credential after collection/cancellation/replacement. | Ownership checks prevent S2 obtaining S1's QR. Early/wrong-kitchen/replayed collection rejected; valid order never collected twice. | Not run |
| U23 | History table; K1 with collected/cancelled records | Open history; search displayed order prefix; filter status and MYT updated date; clear; reload; scroll table on phone. | Own records and accurate amounts/status/payment/times; newest updated first; empty results clear; no whole-page overflow; history persists. | Not run |
| U24 | Food-wait savings; S1/S2 | Browse, order, cancel one order, collect another with adequate order-ahead lead; reload and switch accounts. | Visits/uncollected/cancelled orders add nothing; eligible collection adds explained preparation estimate; private and durable, with no retry/replay credit. | Not run |
| U25 | Parallel-kitchen savings; S1 | Collect both children of one checkout; compare calculation explanation with saved prep baseline, actual Ready and pickup start. | Checkout contributes the largest child estimate, not their sum. Lateness/short lead reduce credit; a replacement resets its effective lead baseline. | Not run |
| U26 | Connectivity and stale estimates; S1 | Disable network for >20 seconds; inspect menu/Availability; try checkout; reconnect. | Live counts/ETA become unavailable rather than appearing current; uncertain submission preserves original request; reconnection refreshes status. | Not run |

## P1 scenarios

| ID | Objective and setup / role | Steps | Expected result | Manual result |
|---|---|---|---|---|
| U27 | Saved meals and dietary constraints; S1/K1 | Save favourite/usual; change ingredient review, restriction or stock; rebuild saved basket. | Current food review/prices/stock checked again. Unknown allergen data is not treated as safe. | Not run |
| U28 | Optional break/timetable; S1 | Order without planner; then enter break/budget/eating time; try impossible break. Import a valid/invalid .ics and review consent. | Ordinary flow preserved; impossible plan rejected clearly; owned preview/explicit confirmation required; unsupported dates/recurrence warned. | Not run |
| U29 | Earlier-slot help; S1, active sibling order | Request earlier food; accept an available earlier slot or consented replacement. | No other order displaced; sibling itinerary rechecked; original preserved when no valid option. | Not run |
| U30 | Ready overdue/no-show; K1/S1, controlled clock | Mark ready early; pass collection grace; confirm uncollected; correct no-show record in history if appropriate. | Grace starts after later of actual Ready/booked end. No auto closure/restock/penalty; vendor lateness excluded from student no-show. | Not run |
| U31 | Push opt-in; supported HTTPS browser with configured push | Opt in, test foreground/background delivery, mark notice read, sign out and test revocation. | Explicit consent/ownership; generic lock-screen text; stale/read suppression. Record actual physical delivery separately from service acceptance. | Not run |
| U32 | Menu/photo/settings; K1 | Edit stock, item visibility, price, prep, reviewed food, owned image and future capacity. | Inputs validated; existing orders retain snapshots; future capacity does not overwrite reservations; uploads bounded; sample acknowledgement only after actual review. | Not run |
| U33 | Responsive/accessibility; phone + desktop | Test 360/390/768/1440 widths, keyboard-only navigation, modal close/Escape, focus return, 200% zoom and mobile keyboard. | Controls reachable, focus contained/restored, no page overflow, status readable without relying on colour, table scroll labelled. | Not run |
| U34 | Restart durability; operator/admin with private backup | Stop server cleanly; restart; sign in and inspect orders, history, policies, savings and an unresolved checkout. | Durable records retained; no duplicate orders; no two JSON writers; private backup restoration procedure available. | Not run |

## Evidence and sign-off

For each run record: scenario ID, build/commit, environment/URL, tester, device/browser, result, actual observation, evidence location and defect ID. Keep account passwords, student data and live pickup credentials out of public screenshots/reports.

Outstanding acceptance beyond Firestore/Vercel: physical HTTPS phone scanning/fallback; a kitchen's actual menu/prep/capacity review; a small real student/operator pilot; evidence for food-wait savings; operational backup/recovery and judge-access instructions. Email verification/password-reset delivery and measured walk-in queue tracking are not implemented. Push delivery and automatic APSpace source cadence remain separately qualified features.
