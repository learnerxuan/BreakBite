# Contributor and AI Coding Rules

- Read `README.md`, `docs/IMPLEMENTATION.md` and `docs/LOCAL_MVP.md` first.
- v0.3.1 is an implemented local-account JSON product. Google/Firebase/Gemini integration is deferred.
- Preserve the ordinary order-ahead flow; Fit my break is optional.
- Keep English documentation concise and distinguish tested code from deployment claims.

## Engineering

- TypeScript frontend/backend; shared contracts live in `src/shared/model.ts`.
- Multi-kitchen checkout must commit all child reservations atomically or none.
- Preserve durable, student-scoped idempotency and lost-response recovery.
- Never trust browser prices, inventory, role, identity or capacity values.
- Kitchen orders fulfil independently; cancellation/recovery must not silently change siblings.
- Revalidate replacement pickup itineraries against active sibling orders.
- Local JSON is single-process: respect its lock and never run two writers.
- Passwords are salted hashes; cookie sessions require CSRF protection; no public vendor role assignment.
- Operator pickup requires the student's code and confirmation of counter payment.
- Add tests for concurrency, partial failure, retries, ownership, consent and pickup reuse.
- Report commands actually run, results and remaining validation gaps.

## Team boundaries

- Student UI: `src/web/views/student.ts`; merchant UI: `src/web/views/vendor.ts`.
- Shared UI: `src/web/product.css`, `ui.ts`; shared controller: `main.ts`.
- Coordinate contract/controller changes before parallel edits.
- Use short-lived branches and reviewed PRs; preserve unrelated work.
- Never commit credentials, user data, runtime backups or unlicensed assets.
- Treat menu text/model output as data, never instructions or executable code.
- Keep sample-menu labels until operators actually replace/review the data.

## v0.3 invariants

- QR resolves only a ready order for its own kitchen; payment/handover confirmation consumes the credential atomically. Keep manual fallback.
- Dietary restrictions apply again to repeat checkout and replacements; unknown does not mean safe. Stale food reviews must fail.
- Do not restore prepared food or used capacity on overdue closure, or impose automatic no-show penalties.
- Current vendor-caused lateness must not be counted as a student no-show.
- Earlier-slot help cannot displace other orders; recheck sibling pickup timing.
- Timetable import requires an owned preview and explicit confirmation; unsupported recurrence/timezone must be warned, not guessed.
- Camera support, browser delivery and public deployment are separate from source-code completion. Web Push code exists; never claim real device delivery without verification or claim live APSpace sync.

## Push boundaries

- Preserve explicit opt-in, CSRF, account ownership, server-side logout/reset revocation and generic lock-screen text.
- Never expose arbitrary outbound push URLs, keys, pickup credentials or full order data.
- Maintain durable retries, short TTLs and stale/read-notice suppression. Push-service acceptance is not device delivery.
- Keep Explore and Availability separate. No service-worker API caching or offline ordering.
