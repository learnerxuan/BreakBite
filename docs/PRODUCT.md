# Product direction — v0.2

## Fixed problem statement

- Students using walk-up ordering wait to place orders and then wait for preparation after arriving.
- They need a convenient way to browse and pre-order before arrival, regardless of whether their class break is short.
- Example: order when appropriate before class ends, then collect afterwards; ordering from the library is equally valid.
- Waiting-time improvements and campus demand still require real-world validation; no percentage benefit is claimed.

## Implemented solution

- Guest catalogue -> student signup/sign-in -> multi-kitchen basket -> per-kitchen pickup selection -> confirmed child orders.
- Ordinary pre-ordering is the default. Fit my break is an optional helper, not a mandatory timetable gate.
- One checkout can contain a meal from one kitchen and a drink from another.
- All stock/capacity reservations succeed together, or no order is placed.
- After checkout, kitchen orders prepare, cancel, collect and record payment independently.
- Students track each kitchen and collect with its own code.
- Merchants manage queues, prices, menu items, stock, location, availability and delays.
- Local accounts and JSON data are persistent; this is not front-end-only mock state.

## Operational boundaries

- Pay each physical counter; no online payment gateway or refund is simulated as real.
- Starter kitchens/menus are labelled sample data until reviewed/replaced by an operator.
- Five kitchens per checkout/five portions per kitchen; two starter kitchens included.
- Same-kitchen rule-based recovery requires operator approval and student acceptance.
- Mixed-item child orders need manual recovery; no unsafe wholesale substitutions.
- Mobile is the same responsive website, not a separate Android app.

## Not implemented

- Actual Gemini Enterprise runs or Google Cloud/Firebase migration for this release.
- Offline ordering, delivery, group ordering, loyalty or complete timetable import.
- Email verification, automatic email password resets, online payments and campus-wide production certification.

See `LOCAL_MVP.md` for setup and `TEST_REPORT.md` for exact verification boundaries.
