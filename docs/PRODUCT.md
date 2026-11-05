# Product Plan

**Status:** Proposed MVP. No features or impact results are claimed as implemented.

## Problem Statement

- Students with short breaks must fit walking, ordering, waiting, eating, and returning to class into a limited window.
- Menu availability alone does not tell them whether a meal is realistically suitable for that window.
- Unrestricted pre-orders can overload the kitchen or simply move the queue to the pickup counter.
- Unexpected delays leave little time to choose another meal.
- Validate the frequency and severity through student interviews and vendor observations; do not generalise personal experience to all APU students.

## Proposed Solution

- Build a mobile-friendly campus pre-ordering website.
- Match meals and pickup slots to the student's available break.
- Check inventory, preparation workload, and pickup capacity before confirming an order.
- Give vendors a simple preparation and incident-management screen.
- Use Gemini Enterprise to help vendors assess delays and prepare recovery proposals.
- Keep all order changes subject to backend checks and the relevant human approvals.

## Users and Screens

| User | Screens | Main actions |
| --- | --- | --- |
| Student | Break planner, menu, checkout, order status | Set time and budget; order; accept or reject alternatives; collect. |
| Vendor | Preparation queue, menu availability, incident panel | Mark preparation progress; report delays; approve recovery proposals. |
| Vendor in Gemini Enterprise | Meal Rescue Agent | Request incident analysis and generate actionable proposals. |

## MVP Features

- **Menu and pre-ordering:** Meal cards, prices, availability, and one vendor per order.
- **Break-aware filtering:** Manual break start/end, walking estimates, eating time, and a safety buffer.
- **Capacity-aware slots:** Limit preparation workload and pickup handovers separately; reserve capacity and stock together.
- **Live order updates:** Confirmed, preparing, ready, collected, or cancelled; show delay risk separately.
- **Pickup verification:** A one-time code; QR is optional polish, not a separate requirement.
- **Vendor controls:** Start preparation, mark ready, mark sold out, pause new orders, and report delays.
- **Meal Rescue:** Analyse affected orders, evaluate same-vendor alternatives, and save proposals for approval.

## Time Rule

```text
Latest safe pickup = next class start - return walk - eating time - safety buffer
```

- Also consider when the student can first reach the pickup point.
- Example only: 12:30 next class, 5-minute return, 12-minute meal, and 3-minute buffer gives a 12:10 latest pickup.
- Use conservative ready-time estimates; do not label estimates as guarantees.
- When no meal fits, say so and offer another time or browse-only mode.

## Main Flow

1. Student enters a break and budget, browses suitable meals, and selects a slot.
2. Backend validates stock and capacity, then confirms the order.
3. Vendor prepares the meal and updates its status.
4. Student sees the update and collects with the one-time code.
5. If an unexpected delay occurs, the vendor starts a Meal Rescue run.
6. Agent proposes feasible options; vendor approves; affected student chooses.
7. Backend rechecks conditions before applying any change.

## Scope Boundaries

- Two demo vendors; approximately ten meals; simulated payment.
- Same-vendor meal recovery only; no automatic transfer or settlement between vendors.
- No delivery, group orders, loyalty points, full timetable import, or nutrition chatbot.
- Dietary and allergen information must be vendor-supplied; unknown means unknown.
- Plan for walk-in customers, no-shows, cancellations, and an actual pickup location during a pilot.
- Differentiate through time feasibility, realistic capacity, and recovery evidence—not a claim of being the first pre-order app.
