# Verification report — 5 November 2026

## Executed successfully

| Check | Result |
|---|---|
| `npm run typecheck` | Strict TypeScript checking passed. |
| `npm test` | **42 tests passed, 0 failed**. |
| `npm run build` | Browser and server JS + static assets generated. |
| Browser smoke | Desktop + 390px mobile complete journeys passed using the bridge described below. |

## Automated coverage

- Deadline math, both walking legs, eating time and buffer; budget and invalid input.
- Server pricing, stock, separate kitchen/handover capacity and paused vendors.
- Twenty requests contesting one remaining slot: exactly one order accepted.
- Duplicate request retries and changed-payload idempotency rejection.
- Order lifecycle, before-preparation cancellation and reservation restoration.
- Cross-student and cross-vendor access; pickup-code privacy and reuse protection.
- Failed-code lockout, incident impact and resolution.
- Proposal expiry/version checks, permission checks, vendor approval and student consent.
- Revalidation when replacement stock changes; atomic release/reservation and code rotation.
- New pickup windows preserve existing orders and reservations; only operators can add them.
- File persistence/rollback; Firestore REST compare-and-swap retry and seed preservation via a test double.
- RSA signature verification, issuer/audience/time validation, malformed/tampered/unsigned-token rejection.
- Explicit private-Cloud-Run trust-mode configuration and mapped caller claim checks (not a real gateway test).
- HTTP authentication/origins/Host controls and real JSON-RPC MCP read -> evaluate -> pending proposal.

## Browser checks

- Desktop login, menu search/category, break filtering, checkout.
- Vendor delay report, rule-based recovery, approval, student acceptance and new pickup code.
- Cross-student privacy, preparation progress and one-time collection.
- Mobile checkout/order/vendor views; no horizontal overflow at 390px.
- No uncaught JavaScript errors during the scripted journeys.
- The source archive includes UI screenshots; the browser script regenerates them under `docs/screenshots/`. Binary screenshots are not required to run the application.

### Browser environment limitation

The available Chromium has an administrator URL-navigation block. No policy was changed or bypassed.

The test injected locally compiled UI code/styles into a blank page and relayed only this application's local `/api/` calls through a Python binding to the running Node server. This verifies the DOM interactions and real backend together, but **does not verify browser network navigation, production CORS, deployed CSP, Firebase login or Cloud Run IAM**. HTTP tests separately check response headers and origin handling.

Executed command:

```bash
python tests/browser_smoke.py --bridge --chromium /usr/bin/chromium --base-url http://127.0.0.1:8097
```

To repeat with ordinary browser navigation on your machine:

```bash
npm install
npm run check
npm start
# In another terminal, using a disposable LOCAL demo data directory:
pip install playwright
playwright install chromium
python tests/browser_smoke.py --base-url http://127.0.0.1:8080
```

**The browser test resets Bowl Lab's local synthetic demo data. Do not point it at production or important demo history.**

## Not executed / not claimed

- A fresh npm registry installation in the development container: outbound DNS was unavailable. Build tools already installed in the environment were used; versions match `package.json`.
- Actual cloud Firebase sign-in, Firestore database writes, Cloud Run deployment, Docker image build or Firebase Hosting deployment.
- An actual Gemini Enterprise agent run, tenant registration or organizer acceptance.
- Real payments, third-party security audit, screen-reader audit or campus-scale load test.
- Claimed percentage reductions in wait time: none. No measured impact study exists yet.

## Reproducibility

- Node v22.16.0, TypeScript 5.8.3, Node type declarations 25.1.0.
- No runtime npm dependencies; compiled release starts with Node alone.
- Dependency installation, cloud permissions and real data need team validation before submission.
