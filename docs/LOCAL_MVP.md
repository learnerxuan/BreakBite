# Local product guide — v0.3

> v0.3.1 update: Availability has its own tab and opt-in background Web Push is implemented. See [WEB_PUSH.md](WEB_PUSH.md) for setup, security and unverified live-device delivery. Earlier page-only notification limitations below describe v0.3. SMS/email and cloud deployment remain separate.


## Start here

- Use Node.js 22.16+.
- Source checkout: `npm install`, `npm run check`, `npm start`.
- Prebuilt package: `npm start`.
- Open `http://127.0.0.1:8080` in a normal browser.
- Default mode is `AUTH_MODE=local`, with JSON storage and real account authentication.
- An old `.env` containing `AUTH_MODE=demo` must be updated. Demo impersonation remains a legacy test harness, not the product UI.

## First usable installation

1. Run the application; browse the starter catalogue and register a student.
2. Stop the server with Ctrl+C.
3. Run `npm run operator`; enter a kitchen operator's name, email, kitchen ID and password.
4. Repeat for `bowl-lab` and `noodle-co` as needed. Do not publish passwords in the repository.
5. Start again. Use separate browser profiles for the student and operators.
6. Operators replace the sample menu information, prices, preparation times and pickup location in their workspace.
7. Operators confirm the menu has been reviewed in Kitchen settings; this removes that kitchen's sample label. This is operator acknowledgement, not independent verification.

Starter allergen information is unknown. Operators can now supply reviewed ingredients, allergens, dietary declarations and evidence. Unknown is not allergen-free; do not invent certification claims. See [v0.3 guide](RELEASE_0_3.md).

## Main flow

- Add food from one kitchen and a drink from another to the same basket.
- Choose a pickup window for each kitchen. The default suggestion staggers windows.
- Set a realistic walking time between counters. One minute per handover is also reserved in the itinerary check.
- Confirm once. All child reservations either succeed together or fail together.
- View the checkout in My orders, with an individual status/code/amount for each kitchen.
- Kitchens prepare independently. The student pays each counter separately; the operator scans the student's QR or enters the fallback code, then confirms payment received and handover.
- Cancel each child independently before preparation and its agreed cancellation cutoff. Qualifying vendor delays allow an exception without a no-show penalty. No online charge/refund is performed.

## Delay and recovery

- A kitchen can report an item-specific or kitchen-wide delay.
- A rule-based evaluator checks same-kitchen replacement options. It is not Gemini execution.
- Operator approval and student acceptance are both required before a replacement is applied.
- Ordinary pre-orders may accept a later pickup; Fit my break orders still respect the supplied deadline.
- Mixed-item child orders require manual coordination. The system does not replace a meal-plus-drink basket with two meals.
- A failed recovery never silently cancels the other kitchen orders.

## Lost network responses

- The checkout request key and payload are kept in the browser tab until the result is known.
- If the response is lost after the server saves the order, use **Check / retry original checkout**.
- The original request key is reused; the backend returns its existing child orders instead of placing another basket.
- Do not clear browser storage or create another checkout while the first result is uncertain. My orders is the durable source of confirmed orders.

## Phone access

**Localhost on your phone means the phone, not your computer.**

For private Wi-Fi testing only, find the computer's actual LAN IPv4 address (for example with `ipconfig` on Windows), then use an `.env` like:

```dotenv
AUTH_MODE=local
STORE=file
HOST=0.0.0.0
PORT=8080
DATA_DIR=.data
ALLOWED_ORIGINS=http://192.168.1.10:8080,http://127.0.0.1:8080
ALLOW_INSECURE_LAN=true
COOKIE_SECURE=false
```

- Replace `192.168.1.10` with the actual computer IP.
- Restart the server; connect the phone to the same trusted Wi-Fi and open that IP with port 8080.
- If needed, allow Node/8080 only on your computer's private network firewall profile.
- Use throwaway test credentials: HTTP LAN traffic is not encrypted. Do not forward the port, expose this configuration publicly, or use real private student data.
- Real Internet access needs an HTTPS reverse proxy, `COOKIE_SECURE=true`, exact HTTPS origins and an additional deployment/security review. Google deployment is intentionally deferred.

## Data, backups and reset

- `.data/database.json` is the current database; `database.previous.json` is the immediately previous snapshot.
- Accounts and orders survive process/browser restarts. Sessions expire after 12 hours or logout/reset.
- The server takes a lock on the data directory; only one process may use it. This is not distributed storage.
- Take a separate backup of the entire data directory (including `media/`) with the server stopped before changing versions or restoring data. Both files contain sensitive account/order data and must stay private.
- Restore only a checked backup while stopped. A malformed current database fails closed; it is never silently replaced with sample data.
- For a clean review installation, use a new `DATA_DIR`, rather than deleting another person's data.
- A dead same-host process lock is recovered at startup; unknown/ambiguous locks require checking the process first. Never delete a live server's lock.
- Earlier per-kitchen JSON files are imported only on the first aggregate-database creation and are left intact.

## Operator accounts and password resets

- The operator CLI requires the server to be stopped so there are never two JSON writers.
- `npm run operator` creates an account scoped to one existing kitchen.
- `npm run operator -- --reset --email=user@example.com` resets an existing account's password and revokes its sessions.
- Passwords are prompted with masking. For local automation only, `BREAKBITE_OPERATOR_PASSWORD` can be supplied via the process environment; clear it afterwards and never commit it.
- There is no public vendor signup, shared demo password, email verification, or email reset delivery.

## Deployment and license boundaries

- Google Cloud/Firebase and Gemini Enterprise are not prerequisites for the JSON product.
- The old Firebase and MCP code is retained for migration, but the current UI rejects non-local mode rather than pretending multi-kitchen cloud checkout is ready.
- Cloud migration must implement one atomic cross-kitchen transaction, adapt authentication, and rerun the complete acceptance tests.
- The published hackathon requirement to use Gemini Enterprise is still a separate deliverable; a JSON-only product does not by itself satisfy it.
- Online payments, refunds, production hardening, campus agreements and measured impact are not claimed.

## Optional container packaging

- The Dockerfile now targets local-account mode and JSON storage, not the deferred Firebase UI. It has not been built in this environment.
- Mount persistent, writable storage at `/app/data`; do not let a container restart discard the database.
- Set `ALLOWED_ORIGINS` explicitly. Public use requires HTTPS at a trusted reverse proxy and secure cookies.
- Do not run multiple container replicas against the same file directory.
- The Node/npm path above is the tested setup, not a claim that container networking has been verified.

## v0.3 operational notes

- Upgrade preserves v0.2 accounts/orders; new profile/notice fields are added as used. Back up before upgrading.
- Camera scanning requires HTTPS and a supported native QR detector. HTTP LAN browsing is not a camera acceptance test. Manual code and USB-scanner text remain usable.
- Reminders are created by the running server every 15 seconds, independently of browser activity. Read the durable Inbox; device notifications only work while the site is open with permission.
- Ready too early does not shorten the booked grace period. Overdue food is not restocked automatically; merchants must confirm an uncollected closure.
- Save preferences, favourites/usual orders and optional timetables through the student pages. Imported calendars are private snapshots, not APSpace live sync.
- Photos are saved locally in `.data/media/`. The source repository must never contain private data or unauthorised photographs.
- Public hosting and closed-browser push delivery are not completed by running the local server.
