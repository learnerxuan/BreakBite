# Product Direction

**Positioning updated:** 5 November 2026, following the team's clarification.

- The local MVP exists. This document defines the problem, product direction and target experience; it is not a claim that every proposed UX path is implemented.
- See [IMPLEMENTATION.md](IMPLEMENTATION.md) for current code behaviour and [README.md](../README.md) for setup and implementation status.

## One-Sentence Pitch

**BreakBite lets students browse campus menus and order before arriving, then collect at a suitable time, with capacity-aware scheduling and delay support to make pickup more reliable.**

## Problem Statement

Students who rely on walk-up ordering can spend unnecessary time queuing to place orders and waiting for meal preparation after reaching campus food stalls. They need a convenient way to view menus and order before arriving, then collect at a suitable time, whether or not they have a short break.

- **Primary problem:** On-site ordering and preparation waits reduce convenience and make meal collection harder to plan.
- **Primary benefit:** Save unnecessary waiting time by separating order placement from physical collection.
- **Who benefits:** Students who value convenience, not only students with tight schedules.
- **High-value scenario:** Short breaks make time-aware meal selection especially useful.
- **Validation:** Check actual queueing points, student demand, vendor workflow and whether order-ahead pickup improves the experience. Do not assume all students skip meals or arrive late.

## What In-Class Ordering Means

- Ordering while still in class, when appropriate, and collecting afterwards is a use case for pre-ordering.
- Ordering before a class, while studying, or before leaving another location are also valid use cases.
- The problem is not simply that students cannot order during class; the broader problem is unnecessary on-site waiting and inconvenient collection planning.
- Students should not need to prove that their break is too short to use the product.
- This refines the original idea; it does not create a second, competing problem statement.

## Proposed Solution

- Offer a mobile-friendly campus food pre-ordering website.
- Let students check menus, prices and availability before visiting a stall.
- Let students place orders ahead and select an available pickup window.
- Give vendors advance visibility and check stock, kitchen workload and pickup capacity before confirmation.
- Keep students informed about preparation and delays; verify collection with a one-time code.
- Offer time-aware planning as a supporting convenience for students who want to fit a meal around class.
- Use the planned Gemini Enterprise Meal Rescue integration to help vendors evaluate exceptions and create proposals, with vendor approval, student consent and backend revalidation.
- Do not promise instant preparation or queue-free pickup; pre-ordering does not create extra kitchen capacity.

## Feature Priorities

| Priority | Feature | Purpose |
| --- | --- | --- |
| Core | Menu browsing and pre-ordering | Choose and order before reaching the stall. |
| Core | Capacity-checked pickup slots | Coordinate collection with what the vendor can prepare and hand over. |
| Core | Order status and pickup verification | Know when food is ready and collect the correct order once. |
| Core | Vendor controls | Manage preparation, stock, availability and delays. |
| Supporting | Fit my break | Help students who want walking, eating and class-time guidance. |
| Supporting | Meal Rescue | Offer validated alternatives when unexpected delays disrupt a confirmed plan. |

- Keep one vendor per order; do not expand into delivery, loyalty schemes or group ordering.
- Core scheduling and human approval rules apply even when a student is not under time pressure.

## Target Pickup-First Experience — Follow-Up UX Work

1. Browse the menu and choose a meal.
2. Select an available pickup window; use **Fit my break** only when timing advice is helpful.
3. Confirm the order after server-side stock, preparation lead-time and capacity checks.
4. Receive status updates and visit the counter for collection.
5. Review an alternative only if a delay affects the order; no automatic meal replacement.

**Implementation boundary:** The current MVP still asks for break/class-time inputs and uses them in checkout validation. A separate ordinary pickup-first path and optional timing controls are not implemented by this documentation-only change. Update the UI, shared API contract, validation and tests together before claiming that mode is available. Do not bypass existing checks or invent a class deadline as a hidden workaround.

## Illustrative Student Scenario

- A student already knows what they want for lunch and orders before class ends, when appropriate.
- They select an available collection window after class.
- The vendor receives the order ahead of the student's arrival; the student checks the ready status before collecting.
- The student may have a long break or no next class. The value is convenience and less on-site waiting, not only avoiding lateness.
- This is a target user story, not a measured time-saving result or guaranteed ready time.

## Time-Aware Planning

When a student chooses class-time guidance, consider:

```text
Latest safe pickup = next class start - return walk - eating time - safety buffer
```

- Also consider when the student can first reach the pickup point.
- Use conservative preparation estimates and show when a meal does not fit the selected window.
- This calculation supports the core pre-ordering experience; it is not the reason every student must use the app.
- The current implementation's timing requirements remain as documented in IMPLEMENTATION.md until the optional flow is built.

## Scope and Evidence

- Two demo vendors, approximately ten meals and simulated payment.
- Same-vendor recovery before preparation; no automatic transfer or settlement between vendors.
- Local recovery uses a rules-based preview. Live Gemini Enterprise execution remains pending license, tenant setup and verification.
- No full timetable import, nutrition chatbot or guaranteed pickup-time claims.
- Dietary and allergen information must be vendor-supplied; unknown means unknown.
- Plan for walk-in demand, pickup queues, payment handling, no-shows and cancellations in a real pilot.
- Measure on-site waiting, pickup-window adherence and user convenience; class-deadline success is a supporting metric for students who use that guidance.
- Report declined orders, cancellations and vendor workload alongside improvements. Separate real measurements from simulations.
