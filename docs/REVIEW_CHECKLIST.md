# Product review checklist — v0.2

Everyone reviews and tests their own changes; no dedicated QA-only member is required.

## Student experience

- Browse before signing in; registration creates only a student account.
- Order food from one kitchen and a drink from another without losing the basket.
- Ordinary pickup is the default; Fit my break is optional.
- Each kitchen's location, window, amount due, status and code are understandable.
- No email, role selector, paid indicator or Gemini claim is fabricated.

## Operator experience

- Provision a private account via the CLI, not public signup.
- Edit menu descriptions, prices, stock and prep assumptions; changes do not rewrite old order prices.
- Use the queue on a phone. Verify payment at the counter before collection.
- Report/resolve an incident, inspect alternatives and approve a proposal.

## Engineering

- Run `npm run check` and repeat browser journeys over normal HTTP on team hardware.
- Test last-stock concurrency, second-kitchen rollback and lost checkout responses.
- Check cancellation affects only its kitchen; replay does not create duplicates.
- Check session logout/reset, CSRF, student isolation and vendor isolation.
- Confirm recovery cannot create an impossible multi-kitchen pickup itinerary.
- Back up JSON; stop before maintenance; do not run multiple writers.

## Mobile and release

- Test 360/390px and actual Android/iPhone browsers: keyboard, forms, cart, scrolling, dialogs, payment and codes.
- Review keyboard focus, contrast, screen-reader labels and connection errors.
- Use only approved menu information and licensed assets. Keep unknown dietary details unknown.
- Never publish the JSON database, password hashes, sessions or account bootstrap credentials.
- Configure HTTPS/secure cookies before public access. Private Wi-Fi testing is a separate explicit mode.
- Record actual results, not assumed passes. Cloud/Gemini migration remains a later acceptance gate.
