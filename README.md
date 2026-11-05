# BreakBite

**Meals that fit your class break.**

- **Project:** A campus food pre-ordering and pickup coordination system.
- **Track:** Smart Campus & Student Experience — APU Cloud Innovation Hackathon 2026.
- **Status:** Planning and documentation only. The features below are the proposed MVP, not completed functionality.
- **Team:** Five members. Proposed team name: **ByteShift**; subject to team agreement.

## The Problem

- Students have limited time between classes to walk, order food, wait, eat, and return.
- Students cannot easily judge whether a meal will fit their available break.
- Pre-ordering alone does not prevent an overloaded kitchen or pickup counter.
- Delays and unavailable meals can leave students without time to find another option.
- These are initial problem hypotheses based on student experience; campus-wide impact still needs validation.

## Our Solution

- Let students browse menus and pre-order food from participating campus vendors.
- Recommend feasible pickup windows using the student's break, estimated preparation time, and vendor capacity.
- Reserve stock and capacity when an order is confirmed.
- Show live order updates and verify collection with a one-time pickup code.
- Use a **Gemini Enterprise Meal Rescue Agent** to help vendors assess unexpected delays and propose alternatives.
- Require vendor approval and student consent before changing an existing meal order.

## Planned MVP Features

| Feature | Purpose |
| --- | --- |
| Menu and pre-ordering | Browse meals, prices, availability, and participating vendors. |
| Break-aware filtering | Consider walking, eating, and return-to-class time. |
| Capacity-aware pickup slots | Avoid accepting more work than the kitchen and counter can handle. |
| Live status and pickup verification | Follow an order from confirmation to collection. |
| Simple vendor dashboard | Manage preparation, stock, delays, and new-order availability. |
| Meal Rescue Agent | Read current operational data, evaluate recovery options, and create approval requests. |

## Google Tools

- **Firebase Hosting:** Publish the React + TypeScript web application.
- **Firebase Authentication:** Sign-in for students and vendors.
- **Cloud Firestore:** Menus, orders, capacity, and real-time updates.
- **Cloud Run:** Order APIs, scheduling rules, and the MCP tool service.
- **Gemini Enterprise:** Vendor-facing Meal Rescue Agent and its workflow.
- **Antigravity:** Optional development tool, not a required runtime component.
- Gemini Enterprise access is expected from the organiser, as reported by the team. Workflow Builder and custom-tool permissions still need a hands-on check.

## Scope

- Two clearly labelled demo vendors and around ten menu items.
- One vendor per order; manual break-time entry; simulated payment.
- One end-to-end ordering flow and one unexpected-delay recovery flow.
- No delivery, group ordering, loyalty scheme, full timetable integration, or real payment processing in the MVP.
- No guaranteed pickup-time claims or invented impact statistics.

## Read Next

- [Product and features](docs/PRODUCT.md)
- [Technical architecture](docs/ARCHITECTURE.md)
- [Five-person team responsibilities](docs/TEAM.md)
- [Build plan, tests, and demo](docs/DELIVERY.md)
- [Submission guide and verification status](docs/SUBMISSION.md)
- [Contributor and AI coding rules](AGENTS.md)

## Development Status

- Application code, deployment, and automated tests have not been added yet.
- There are no working installation commands or live demo links at this stage.
- Add setup instructions only after the corresponding application has been implemented and tested.
- Keep credentials, private student information, and unlicensed food images out of this public repository.
