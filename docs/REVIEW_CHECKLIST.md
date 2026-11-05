# Five-person review checklist

The implementation is ready for review, not a substitute for your team's ownership.

## A — Technical lead (repository owner proposed)
- Read domain rules and shared contracts.
- Re-run concurrent last-slot, idempotency, cancellation and stale-proposal tests.
- Review pilot storage limits and same-vendor/no-price-increase recovery policy.
- Decide whether to keep native TypeScript UI or migrate to React later; avoid a rewrite before validation.

## B — AI and cloud integration
- Own actual Firebase/Cloud Run resources and live IAM verification.
- Confirm Gemini license, custom connector permissions and private service identity.
- Run the real tool-to-proposal trace; demonstrate no unapproved order mutation.
- Record failures and tenant-specific adjustments, not just screenshots of a chat response.

## C — UI/UX
- Review 1440px desktop, 390px mobile, keyboard use, contrast and error states.
- Check the break planner is understandable without technical explanation.
- Verify users understand estimated times, simulated payments and approval status.
- Replace the original CSS food art only with owned/licensed assets.

## D — Frontend / menu content
- Verify menu content with a participating vendor before calling it real.
- Review basket quantities, time inputs, sold-out displays and mobile pickup screens.
- Check allergen/halal information comes from the vendor, never model inference.
- Do not change shared field names without A/B agreement.

## E — QA / evidence / submission
- Re-run `npm run check` and the normal browser smoke test on your own machine.
- Interview students and a vendor, recording anonymised observations.
- Keep measured results separate from synthetic scenarios.
- Prepare the deck, real Gemini trace, live-demo link and recording backup.
- Confirm the actual event portal requirements before submission.

## Release gate

- No credentials/private data in Git; clean working tree and reviewed diff.
- Correct demo/production separation and safe Cloud Run IAM bindings.
- All five members understand what works, what is simulated and what remains unverified.
- Captain submits the actual final commit and tested URLs, not just a draft.
