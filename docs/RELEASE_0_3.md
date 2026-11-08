# v0.3 — Product improvements

> v0.3.1 update: Availability has its own tab and opt-in background Web Push is implemented. See [WEB_PUSH.md](WEB_PUSH.md) for setup, security and unverified live-device delivery. Earlier page-only notification limitations below describe v0.3. SMS/email and cloud deployment remain separate.


## Student walkthrough

- Browse the sample catalogue without signing in. Register to place an order or save preferences.
- Tap a heart to save a meal. **Saved** shows favourites, recent meals and named usual baskets.
- Use **Save basket as a usual order** for a combination from multiple kitchens.
- **Review basket / Order again** rebuilds the basket using current prices and availability. Changed/unavailable items are explained. Always choose new pickup times.
- Open **My planner** to save dietary restrictions or a timetable; neither is required for normal ordering.
- Ingredient details are available from meal cards. Unknown information is clearly labelled; the app is not an allergy-safety authority.
- In **My orders**, use **Show pickup QR**. Show the code to your kitchen operator; do not share its screenshot.
- **Need a faster option?** checks genuinely unused capacity and replacement options. It does not grant queue priority.
- **Inbox** stores ready, approaching-deadline, delay and overdue notices. Mark notices read after reviewing them.

## Merchant walkthrough

- In **Menu & stock**, edit each item, including sauces/ingredients, allergens, cross-contact, dietary declarations and spice level.
- Confirm you checked the information. To state halal or gluten-free, provide evidence and a review/expiry date. This is not independent certification by BreakBite.
- Save an item, reopen it and upload an owned/licensed JPEG, PNG or WebP (up to 2 MB). Give attribution and confirm permission. The browser re-encodes photographs to remove metadata and reduce dimensions.
- In **Kitchen settings**, enter campus/pickup location and a menu review source. Keep sample status until actual data is reviewed.
- Set order cutoff, cancellation cutoff, grace period and vendor-lateness allowance. These rules apply to new orders; existing orders retain their agreed rules.
- **Scan a pickup QR** resolves only this kitchen's ready orders. Confirm payment and physical handover before completing. Manual code entry remains available.
- An overdue ready order is not automatically cancelled. Verify non-collection, enter a reason and close it. Correct an erroneous no-show record when necessary.
- Prepared inventory and historical capacity are never automatically restored. No automated penalty or charge is imposed.

## Suggested acceptance scenarios

- Order a meal and a drink from different kitchens; verify separate codes and independent collection.
- Save and repeat that basket after changing a price or marking an item unavailable; confirm the review shows changes.
- Save an allergen restriction; verify unknown/conflicting meals are blocked, including during a recovery proposal.
- Generate a proposal, change its ingredients, then attempt acceptance: the stale proposal must be rejected.
- Scan the correct QR at the wrong kitchen, before Ready, without payment, then after collection. All invalid attempts must fail.
- Mark an order Ready before its booked time; the grace period must still extend beyond the booked window end.
- Mark an order Ready late without manually adding an incident; do not count the vendor's lateness as a student no-show.
- Move an eligible order earlier; verify no other order changes and the sibling pickup itinerary still works.
- Import an `.ics` file, inspect warnings, confirm selected classes, re-import without duplicates, then delete.

## Compatibility and remaining external work

- Camera: native browser `BarcodeDetector` support is required. HTTPS/permission is required; computer localhost is a development exception. Unsupported devices use manual code or a USB scanner.
- Notifications: server-side inbox generation works while browsers are closed, provided the server is running. Browser notifications require an open site and permission. No background push delivery is configured.
- Calendar: UTC/Malaysia/Singapore timed DAILY/WEEKLY events are supported; unsupported patterns are explicitly skipped. The imported snapshot covers 90 days, not indefinite live sync.
- Real APU menus, photos, food evidence, opening procedures and counter-payment arrangements require the team and vendors to supply/confirm data.
- Public HTTPS hosting, Firebase/Google migration and actual Gemini Enterprise runs remain separate work. A GitHub commit is not a deployed website.

## References used for interoperability

- [iCalendar RFC 5545](https://www.rfc-editor.org/rfc/rfc5545)
- [Camera secure-context requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [BarcodeDetector browser availability](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector)
