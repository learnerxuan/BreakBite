# Technical Architecture

**Status:** Proposed design, not an implemented system. Keep the first build small.

## Stack and Responsibilities

| Layer | Tool | Responsibility |
| --- | --- | --- |
| Web application | React, TypeScript, Vite | Shared student and vendor UI. |
| Frontend hosting | Firebase Hosting | Serve the web application. |
| Identity | Firebase Authentication | Authenticate users; backend still checks permissions. |
| Database | Cloud Firestore | Menus, orders, capacity, incidents, proposals, and permitted live reads. |
| Backend | Node.js, TypeScript, Express on Cloud Run | Business rules, scheduling, order writes, and approval APIs. |
| Agent tools | MCP adapter on Cloud Run | Expose a small, authenticated tool set over shared business logic. |
| Agent workspace | Gemini Enterprise Workflow Builder | Vendor-facing Meal Rescue workflow. |

- Firebase Hosting and Cloud Run are complementary deployment choices, not competing requirements. [1][2]
- Do not add BigQuery, a separate forecasting model, or Google Cloud Workflows to the MVP.
- Gemini Enterprise Workflow Builder is distinct from the separate Google Cloud Workflows service.

## Data Flow

```text
Student / vendor web UI -> authenticated API -> business rules -> Firestore
Firestore -> authorised real-time subscriptions -> web UI

Gemini Enterprise -> authenticated MCP tools -> same business rules
                                            -> recovery proposal
Vendor approval -> student decision -> API revalidation -> order update
```

- Students use the website; they do not need Gemini Enterprise accounts.
- Initially, vendors open Gemini Enterprise separately and start recovery manually.
- Do not claim automatic event triggering until it is actually implemented.

## First Integration Check

- Sign in using the organiser-provided Gemini Enterprise account.
- Verify that Workflow Builder is enabled and custom tools can be registered.
- Confirm the GCP project, billing/credits, deployment permissions, and authorised MCP authentication route.
- Demonstrate reading one synthetic order and creating one pending proposal visible in the vendor UI.
- Administrator configuration is required; an account alone does not guarantee tool access. [3][4]
- Use the supported HTTPS/Streamable HTTP setup; follow current connector authentication instructions. [4]
- API and MCP entry points may be separate Cloud Run services if their authentication requirements differ.
- Never expose an unauthenticated order-changing tool as a shortcut.
- If only file uploads are available, label any snapshot demonstration honestly and seek organiser confirmation; it is not live integration.

## Minimal Data Model

| Record | Essential information |
| --- | --- |
| Vendor | ID, opening status, preparation assumptions, permitted operator IDs. |
| Menu item | Vendor ID, name, price in integer MYR sen, stock, preparation weight, image source. |
| Pickup slot | Vendor ID, start/end, preparation capacity/reserved units, pickup capacity/reserved handovers. |
| Order | Student ID, vendor ID, item/price snapshot, quantities, slot, latest pickup, status, version. |
| Incident | Vendor ID, affected items/slots, delay estimate, timestamp, resolution state. |
| Recovery proposal | Order ID/version, alternatives, reason, expiry, vendor approval, student decision. |
| Audit event | Actor, action, affected record, timestamp, and result. |

- Store timestamps consistently; display them in Asia/Kuala_Lumpur.
- Collect a meal-time window rather than the student's full timetable.
- Keep pickup secrets out of public menu/order views; verify them server-side with rate limiting.

## Critical Rules

- Calculate authoritative prices, quantities, feasibility, and permissions on the server.
- Confirm an order with a Firestore transaction: recheck stock and both capacities, reserve them, and create the order atomically. [5]
- Use an idempotency key so retries do not create duplicate orders.
- Start with vendor-configured preparation weights and conservative buffers, not an untrained 'AI prediction'.
- Reserve some capacity for walk-in demand; track kitchen workload separately from counter handovers.
- Model delay risk separately from preparation status.
- Changing an order requires fresh validation, version checks, and atomic release/reservation of relevant resources.
- A proposal is not a reservation; revalidate availability on acceptance and handle unavailable alternatives explicitly.
- Do not automatically restore prepared food to saleable stock after cancellation.
- Keep normal ordering functional when the agent fails.

## Proposed API Contract

| Endpoint | Role |
| --- | --- |
| `GET /menu` | Return permitted vendor/menu information. |
| `POST /availability` | Evaluate meals and slots for a supplied break. |
| `POST /orders` | Validate and atomically create an order. |
| `PATCH /orders/:id/status` | Apply an authorised state transition. |
| `POST /orders/:id/collect` | Verify and consume a one-time pickup code. |
| `POST /incidents` | Record a vendor incident and update affected availability. |
| `POST /proposals/:id/approve` | Record vendor approval. |
| `POST /proposals/:id/respond` | Record student consent and apply a still-valid change. |

## Proposed Agent Tools

- `get_vendor_state`: Read scoped orders, stock, capacity, incidents, and snapshot time.
- `evaluate_recovery_options`: Ask deterministic backend logic to check proposed alternatives.
- `create_recovery_proposal`: Save a pending proposal; never directly place, cancel, or replace an order.
- Bind vendor scope to authenticated identity, not to an arbitrary model-supplied vendor ID.
- Treat model output and free-text menu/incident content as untrusted input.

## Security and Operations

- Deny direct client writes to authoritative orders, prices, stock, and capacity.
- Limit real-time reads with Firestore Security Rules.
- Server SDKs bypass these rules: enforce API authorisation and least-privilege IAM separately. [6]
- Never put service-account keys or other secrets in the frontend or repository.
- Test cross-student and cross-vendor access, malformed requests, duplicate collection, and stale proposals.
- Set budgets, review billing, and choose conservative scaling; budget alerts are not a spending guarantee.

## Official References

1. [Firebase Hosting](https://firebase.google.com/docs/hosting)
2. [Cloud Run](https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run)
3. [Gemini Enterprise Workflow Builder](https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder)
4. [Connect MCP servers](https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/connect-mcp-servers) and [custom MCP setup](https://docs.cloud.google.com/gemini/enterprise/docs/connectors/custom-mcp-server/set-up-custom-mcp-server)
5. [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)
6. [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/rules-conditions)
