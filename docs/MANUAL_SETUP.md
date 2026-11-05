# Manual setup — current release

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

Do not deploy the old Firebase environment templates and assume the v0.2 frontend will work: it intentionally rejects non-local mode until that migration is tested.
