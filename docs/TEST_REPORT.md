# Verification report — v0.2, 5 November 2026

## Executed

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm test` | **67 passed, 0 failed** (42 prior + 25 local-product cases). |
| `npm run build` | Passed; browser/server assets compiled. |
| Operator CLI | Created two scoped accounts with masked/fixture-environment password input. |
| Product UI journey | Passed using local rendered code and the real local HTTP backend through the bridge below. |
| Viewports | Desktop 1440px, tablet 768px, phone 390px and 360px; overflow assertions passed. |

## New automated coverage

- Default real-account mode and explicit non-loopback setup requirements.
- Pickup-first quoting without class inputs; combined budget checks.
- Cross-kitchen atomic checkout, two child orders and separate pickup codes.
- Failure in kitchen two rolls back kitchen one, stock and checkout records.
- Twenty concurrent requests contesting the last drink: one complete checkout succeeds.
- Durable idempotency/replay after pickup time and student-scoped status lookup.
- Changed price, changed payload and overlapping counter windows fail safely.
- Per-kitchen cancellation leaves siblings/reservations intact.
- Collection requires payment confirmation, a valid one-time code and the right operator.
- JSON reopen/persistence, previous snapshot, second-writer lock and corrupt-file rejection.
- Salted password storage, no self-assigned operator role, lockout/reset.
- HttpOnly/SameSite cookies, CSRF, revocation, session persistence and hashed token storage.
- Cross-site and cross-kitchen requests fail; legacy single-order bypass is disabled locally.
- Menu creation/editing and approval/consent-based ordinary pickup recovery.

## Browser interaction coverage

- Guest catalogue without the old demo-only login; no mandatory class-time inputs.
- Student signup, food-plus-drink basket from different kitchens and staggered checkout.
- Separate order cards/codes; operator cannot see the student's pickup secret.
- Delay report -> rule-based alternative -> operator approval -> student consent.
- Code rotation; preparation -> ready -> paid-at-counter collection.
- Operator creates a menu item; mobile menu/queue/forms render without overflow.
- A deliberately lost response after server commit is recovered with the original key; no duplicate checkout.
- Cancelling one child does not cancel its siblings.
- No uncaught JavaScript errors in the executed journeys.

## Browser environment limit

Direct Chromium navigation to localhost returned `ERR_BLOCKED_BY_ADMINISTRATOR`. No policy was changed. `tests/browser_product.py --bridge` injected compiled local UI/CSS into a blank document and relayed only this application's local `/api/` requests through a per-page Python cookie jar to the real Node server.

This verifies UI interactions and real backend behavior, but **not actual browser cookie enforcement, production navigation/CORS/CSP/TLS, Android hardware or Safari**. HTTP tests separately assert security headers, cookies and CSRF. Run normal browser tests and actual phone checks on the team's machines before submission.

```bash
# Disposable local DATA_DIR only; first provision the two test operators.
python tests/browser_product.py --bridge --chromium /usr/bin/chromium --base-url http://127.0.0.1:8090
# Normal browser mode on the team's machine:
python tests/browser_product.py --base-url http://127.0.0.1:8080
```

The browser test creates accounts/orders/menu entries and modifies test kitchen state. Use a clean throwaway data directory, not an operational installation. Fixture operator emails are `operator.bowl@example.test` and `operator.noodle@example.test`; set `TEST_OPERATOR_PASSWORD` for its private test credentials.

## Not claimed

- Fresh npm registry installation here (outbound DNS unavailable); installed development dependencies matched the pinned versions.
- Docker build/deployment, public HTTPS hosting, real Firebase/Firestore or Gemini Enterprise execution.
- Real online payments/refunds, externally verified campus menus, independent security/accessibility audit or impact statistics.
- Multi-process file storage, campus-scale throughput or power-loss resilience under all filesystems.

Environment: Node 22.16.0; TypeScript 5.8.3; Node types 25.1.0. The application has no runtime npm dependencies.
