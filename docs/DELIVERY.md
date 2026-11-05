# Delivery, Testing, and Demo

**Planning date:** 5 November 2026. All dates below use Malaysia time (UTC+8).
**Status:** Proposed milestones, not completed work. See [submission verification](SUBMISSION.md).

## Build Plan

| Date | Goal | Required evidence |
| --- | --- | --- |
| 5 Nov | Verify integration access; agree contracts; begin design and interviews. | Gemini tool proof, sample API data, clickable core flow. |
| 6 Nov | Deploy an end-to-end order flow. | Student orders; vendor prepares; student collects. |
| 7 Nov | Add reliable time/capacity checks and recovery. | No overselling; incident produces a pending proposal; consent flow works. |
| 8 Nov | Integrate, test, and freeze scope; confirm registration. | No new optional features; critical issues assigned. |
| 9 Nov | Finish evidence and submission materials. | Checked deck, demo recording, repository instructions, release candidate. |
| 10 Nov | Final checks and submission. | Working links, final code reference, and submission confirmation. |

- Target an internal submission time earlier than the official deadline.
- If custom-tool access is blocked, escalate immediately and reduce scope; do not disguise static data as live integration.
- If behind schedule, remove QR scanning, extra visuals, and optional filters before cutting correctness or the Gemini Enterprise proof.

## Four-Part Demo

1. **Normal order:** Student enters a short break; system recommends feasible meals and confirms a slot.
2. **Full slot:** Another student cannot reserve already-consumed capacity.
3. **Unexpected disruption:** A previously feasible order becomes at risk after a simulated kitchen delay.
4. **Recovery:** Gemini Enterprise reads current data and creates a feasible proposal; vendor and student approve; backend revalidates and updates the order.

- Show at least one case with no feasible alternative; explain the honest waiting/cancellation choices.
- Do not deliberately overbook first and present the agent's discovery as a successful design.
- Make simulated incidents, synthetic vendors, and demo data visibly identifiable.
- Keep the ordinary vendor controls usable when the agent is unavailable.

## Minimum Test Checklist

- [ ] Two simultaneous requests for the final slot cannot both succeed.
- [ ] Duplicate submissions create only one order.
- [ ] Stock, capacity, and order creation remain consistent after errors.
- [ ] Infeasible time windows return a clear explanation.
- [ ] Students cannot view/change another student's private order.
- [ ] Vendors cannot access another vendor's private records.
- [ ] Reused pickup codes are rejected.
- [ ] Expired or stale recovery proposals cannot change an order.
- [ ] Meal changes require vendor approval and student consent.
- [ ] Agent timeout, sold-out items, and rejected alternatives have usable UI states.
- [ ] Mobile layout, keyboard interaction, and page refresh preserve a usable flow.

## Evidence and Metrics

- Compare the same demand and kitchen resources across walk-in, basic pre-order, and BreakBite scenarios.
- Record pickup waiting time, completion within the student's window, rejected/cancelled orders, and successful recovery.
- Report the sample size and separate real observations from simulation.
- Never invent percentage improvements or hide rejected orders to inflate punctuality.
- Keep interview identities, credentials, and private account details out of public evidence.

## Release Checklist

- [ ] Core tests and build pass; sensitive changes receive A/B review.
- [ ] README setup commands match the actual code.
- [ ] Menu images and external assets have permission/attribution.
- [ ] Deployment works for a reviewer without the developer's existing session.
- [ ] Agent access is arranged safely or demonstrated through approved evidence.
- [ ] Record the submitted commit SHA and align the deck/demo with it.
- [ ] Follow event rules before changing a submitted version.
