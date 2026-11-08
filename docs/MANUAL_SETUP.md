# Manual setup — current release

> v0.3.1 update: Availability has its own tab and opt-in background Web Push is implemented. See [WEB_PUSH.md](WEB_PUSH.md) for setup, security and unverified live-device delivery. Earlier page-only notification limitations below describe v0.3. SMS/email and cloud deployment remain separate.


The current product uses real local accounts and a JSON database. It does not need a Gemini license or Google Cloud account.

## Do now

- Follow [LOCAL_MVP.md](LOCAL_MVP.md) to run, create kitchen operators and test on a phone.
- Replace any existing `.env` demo setting with `AUTH_MODE=local`.
- Create your own operator credentials; no shared/default password is shipped.
- Keep `.data/`, `.env`, backups and actual account data out of GitHub.
- Replace and verify starter menus before using a real kitchen.

## Do later

- Google Cloud/Firebase: select an approved project/billing arrangement and implement/verify a cloud transaction covering all kitchens in one checkout. The old per-kitchen Firestore adapter alone is insufficient.
- Identity: map/verify actual student and kitchen accounts, review privacy and transport security, then run the complete current acceptance suite on the deployed application.
- Gemini Enterprise: obtain the license and custom-tool/admin access, then integrate an actual agent with current authentication and multi-kitchen safeguards. The existing MCP adapter is migration groundwork, not a completed tenant integration.
- Payments: the current product records payment at each physical counter. Online processing/refunds are a separate integration.
- Competition: the mandatory Gemini Enterprise requirement remains outstanding even though the JSON website runs independently.

Do not deploy the old Firebase environment templates and assume the v0.3 frontend will work: it intentionally rejects non-local mode until that migration is tested.

## v0.3 external acceptance

- Supply actual vendor-reviewed APU menu data, photo permissions and dietary evidence; the code cannot independently obtain or certify these.
- Test QR on an actual HTTPS phone/browser with native BarcodeDetector. Keep manual-code fallback for unsupported devices.
- In-app reminders are implemented; closed-browser push/email/SMS needs separate delivery infrastructure.
- Imported `.ics` schedules are snapshots, not a direct APSpace API integration.
- Google and Gemini remain deferred. Public release needs HTTPS, private backups and account/permission review; committing code does not publish a running site.
