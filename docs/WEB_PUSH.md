# Background web push — v0.3.1

## Hosted MVP

The HTTPS demo has stable private VAPID keys and `PUSH_ENABLED=true`. Inbox explains browser permission, HTTPS and iOS Home Screen requirements without exposing operator environment settings. A failed refresh no longer reports success. HTTP phone testing shows the HTTPS instruction rather than attempting a forbidden authenticated push request. Test notifications attempt delivery within the awaited request.

The protected maintenance endpoint is called by `.github/workflows/maintenance.yml` about every five minutes when `BREAKBITE_MAINTENANCE_ENABLED=true`; its bearer credential is stored only in GitHub Actions/Vercel secrets. Scheduled runs can be delayed, and expired/read notices remain suppressed. Physical-device subscription and closed-tab display still require the acceptance steps below.

## What changed

- **Availability** is a separate student/guest navigation tab. Explore no longer embeds the kitchen timeline. Kitchen operators retain their own capacity view.
- Inbox includes opt-in browser push, disable/remove-device controls, a test notification and delivery-status diagnostics.
- Ready, delay, approaching-deadline, overdue and other order notices feed a persistent push queue. A running server sends without an open student page.
- The push-only service worker displays notifications and opens the authenticated Inbox. It does not cache pages, credentials or API responses and does not enable offline ordering.
- No Firebase, Google Cloud or Gemini account is required. Browsers still use their own external push services, so the server needs outbound HTTPS access.
- This is Web Push, not SMS or email. Source completion is not public hosting or a device-delivery guarantee.

## One-time operator setup

Use a real contact email or HTTPS contact URI. The command writes private keys to the configured DATA_DIR and refuses to overwrite existing keys.

```bash
npm install
npm run check
npm run push:keys -- --subject=mailto:YOUR_CONTACT_EMAIL
```

Add to `.env` and restart:

```dotenv
PUSH_ENABLED=true
```

- Reuse and privately back up `DATA_DIR/web-push-keys.json`. Do not commit or send this file to teammates in a public archive.
- The key pair identifies this installation. Rotating keys requires browsers to opt in again.
- Keep the existing `AUTH_MODE=local` and `STORE=file` for this release.
- Missing/invalid keys with push enabled fail startup rather than pretending delivery works.
- Push defaults to disabled until configured. The website, orders and Inbox continue to work without it.

## Browser setup

1. Open the HTTPS website; computer localhost is a development exception. Plain HTTP on a LAN IP cannot enable push on a phone.
2. Sign in as a student, open **Inbox**, then choose **Enable push notifications** and allow browser permission.
3. Choose **Send test notification**. A test is queued; the server drains its queue every five seconds.
4. Close the BreakBite tab and trigger a new order update from another device/operator account.
5. Check the OS notification and tap it to open Inbox. Login may be required if the session expired.

On iPhone/iPad, add the site to the Home Screen and open it from that icon before enabling push. Browser/OS support, notification permission, Focus/battery policies and connectivity affect display. Fully force-stopping a browser can prevent background delivery. Do not promise immediate or guaranteed alerts.

## Privacy and consent

- Permission is requested only after an explicit click, never on page load.
- Each device subscribes separately. A student can remove other subscribed devices from Inbox.
- Subscriptions expire after 30 days without renewal. Removed devices are not silently revived.
- Signing out removes this session's server subscription and browser subscription. Password reset revokes all of that account's push devices.
- A previously accepted push may still arrive after sign-out; messages are deliberately generic and contain no names, pickup codes, food restrictions, timetable or order IDs.
- Push endpoints and encryption secrets stay in private JSON data. API status exposes only owned device IDs, labels and sanitized delivery results.
- Notification clicks never complete collection, cancel orders or mark them read automatically.

## Delivery behaviour

- New subscriptions do not replay the old inbox. Only new, unread, relevant notices enter the queue.
- Jobs and subscriptions survive restarts. Network errors, 408/429/5xx responses retry with backoff, Retry-After, expiry and a bounded attempt count.
- 404/410 responses remove stale subscriptions. Other permanent errors stop that job and surface a sanitized status in Inbox.
- Provider acceptance means the push service accepted the request, NOT that a phone displayed it.
- Read/obsolete messages and closed orders suppress pending pickup reminders. Delivery TTL is short; stale messages show only a generic instruction to check current status.
- Crash recovery is at-least-once: a crash after remote acceptance can resend. Stable topic/tag values coalesce retries; exactly-once OS display is not claimed.
- Single-process JSON remains the runtime constraint. Queue/device limits and 24-hour delivery-log retention bound storage; this is not campus-scale throughput validation.

## Security

- Subscription/test/removal routes require student authentication and CSRF tokens. Cross-account subscription takeover/removal is rejected.
- HTTPS browser push-service allowlist, default TLS verification, no redirects and an eight-second request timeout prevent arbitrary outbound endpoint access.
- Native Node crypto implements the RFC 8291 single-record encryption format and RFC 8292 ES256 VAPID signing. The test suite verifies the published RFC vector and independently decrypts generated payloads.
- This is not an independent cryptographic/security audit. Review deployment permissions, backups and transport controls before a real pilot.

## Tested vs remaining

- Tested: existing regression suite; RFC encryption vector; VAPID signature/audience/expiry; receiver-side decryption; ownership/CSRF; durable retries; cleanup; logout/reset revocation; service-worker event handling; opt-in/rollback UI logic.
- Browser interaction/layout checks use the documented isolated renderer + real local API bridge.
- Public HTTPS/Firestore, registration/login/session cookies, CSRF rejection and phone-sized layouts have since been verified on Vercel. An actual external browser subscription, remote push-service acceptance and closed-tab physical-phone display remain separate acceptance checks; source tests do not establish device delivery.
- Complete the five-step phone acceptance above before calling the deployment verified. SMS, email, Google migration and Gemini integration remain separate.

## Primary references

- https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- https://www.rfc-editor.org/rfc/rfc8030.html
- https://www.rfc-editor.org/rfc/rfc8291.html
- https://www.rfc-editor.org/rfc/rfc8292.html
