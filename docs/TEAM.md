# Five-Person Team Plan

**Working team name:** ByteShift (proposed, not registered or checked for uniqueness).

- Divide ownership by discipline across the product, not one isolated feature per person.
- Members A and B lead core engineering; C, D, and E own substantial design, implementation, and validation work.
- Replace the placeholders with agreed names. The repository owner is proposed for A.
- Confirm the official team captain separately; the captain controls registration and final submission.

## Member A — Technical Lead and Backend

- Own architecture, data model, scheduling rules, and order integrity.
- Implement stock/capacity reservations, API validation, permissions, and state transitions.
- Define shared types and example API responses with B and D before parallel implementation.
- Review sensitive code and make scope decisions with the team.
- **First deliverable:** Data/API contract plus a passing test for two users requesting the last slot.
- **Final deliverable:** Reliable order service, core tests, and an integrated release candidate.

## Member B — AI Integration and Cloud Engineering

- Verify Gemini Enterprise account capabilities immediately.
- Build the MCP adapter and Meal Rescue workflow over A's business logic.
- Configure cloud deployment, service authentication, environment settings, and operational logs.
- Help D connect the frontend to the backend; share integration work with A.
- **First deliverable:** One tool-read and one pending-proposal write from Gemini Enterprise.
- **Final deliverable:** Working agent integration, repeatable deployment, and execution evidence.

## Member C — UI/UX and Visual Design

- Own the student and vendor journeys, visual style, and component specifications.
- Design the break planner, menu cards, checkout, status view, vendor queue, and recovery states.
- Include loading, empty, sold-out, delayed, rejected, and successful states—not just happy-path screenshots.
- Prepare reusable layout, typography, spacing, and responsive rules.
- Support pitch diagrams and perform visual/usability reviews after implementation.
- **First deliverable:** A clickable core flow and a small component/style sheet.
- **Final deliverable:** Consistent mobile-friendly UX and a signed-off interface review.

## Member D — Frontend Implementation and Menu Content

- Turn C's designs into reusable React components across both student and vendor screens.
- Build pages with mock data first, then connect the agreed API with support from A/B.
- Prepare two labelled demo vendors and approximately ten menu items.
- Maintain prices, availability, preparation assumptions, image attribution, and scenario fixtures.
- Use owned/licensed images or clear placeholders; do not invent allergy or certification claims.
- **First deliverable:** A navigable frontend using the shared sample data.
- **Final deliverable:** Working screens, error handling, and a clean menu/data fixture set.

## Member E — Validation, QA, and Submission

- Coordinate student/vendor interviews and keep consent-aware, anonymised findings.
- Build and execute the manual test checklist; log reproducible bugs with evidence.
- Maintain demo scenarios, result tables, screenshots, and the recording backup.
- Assemble the pitch deck with C's visual support and A/B's technical review.
- Track official registration/submission requirements; prepare the final package for the captain.
- **First deliverable:** Interview questions, an initial test matrix, and a submission checklist.
- **Final deliverable:** Evidence-backed pitch, tested demo script, and a checked submission package.

## Collaboration Rules

- Agree field names, status values, and sample responses on day one.
- C provides a usable first design quickly; D must not wait for every screen to be perfect.
- A owns core correctness; B owns deployment/agent connectivity; both review integration risks.
- D owns frontend implementation, not just food pictures. If capacity is limited, cut screens before overloading A/B.
- E tests throughout development, not only the night before submission.
- Use short-lived branches and small pull requests; avoid simultaneous edits to shared configuration.
- Integrate a working slice daily. Every member shows an actual artefact, not a verbal progress claim.
- The captain submits only after all five members review the final package.

## Suggested Demo Responsibilities

- E: Explain the problem and validation evidence.
- C/D: Demonstrate the student's ordering experience.
- B: Demonstrate Gemini Enterprise recovery and tool execution.
- A: Explain capacity safety, consent, and test results.
- Use fewer speakers if the final pitch time is short; everyone still owns their deliverables.
