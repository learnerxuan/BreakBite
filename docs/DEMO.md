# Product walkthrough — v0.2

## Prepare

- Follow [LOCAL_MVP.md](LOCAL_MVP.md). Build, stop the server, provision two private operator accounts, then start it.
- Use separate browser profiles for a student and each kitchen. There is no account impersonation selector.
- Starter kitchens and menus are examples, not an agreement with a real campus vendor.

## Order from two kitchens

1. Browse without an account. Add chicken rice from Bowl Lab and sparkling lemon from Noodle & Co.
2. Register a student account, or sign in. No class timetable is required.
3. Review the grouped basket and select a pickup window for each kitchen.
4. Set walking time between counters. Incompatible pickup windows are rejected.
5. Confirm once. Stock and capacity for both kitchens are reserved together or neither order is placed.
6. My orders shows two child orders, separate codes, amounts due and independent preparation states.
7. Each operator sees only their kitchen's order. Start preparation, then mark ready.
8. Receive payment at the counter, check the payment confirmation box and verify that kitchen's code.
9. The student sees collected/paid for that child only. Collect the other order separately.

## Failure and recovery

- Before preparation, report a delay for one ordered item and check alternatives.
- Create a proposal and approve it. The owning student must accept before anything changes.
- Acceptance checks the replacement and the remaining pickup itinerary. Conflicts preserve the original order.
- This helper is rule-based, not a connected Gemini Enterprise agent.
- A student can cancel a confirmed child order without cancelling the other kitchen's order.
- If checkout loses its response, use **Check / retry original checkout** instead of creating another basket.

## Evidence to capture

- Desktop and phone ordering; operators cannot see the student's pickup secrets.
- Two codes and independent order status; one unavailable kitchen causes complete checkout rollback.
- Restart with the same data directory and check accounts, sessions and orders persist.
- Do not claim online payments, actual campus adoption, measured time savings or live Gemini integration.
