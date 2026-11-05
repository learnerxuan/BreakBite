# Manual setup: what still requires your account

The application and tool endpoints are implemented and committed to this repository. No Google project, resource, license or payment account has been created by this delivery.

## 1. Local review — no cloud account

- Install Node.js 22.16 or later.
- Source: `npm install`, `npm run check`, `npm start`.
- Ready-to-run package: `npm start`; compiled files are already included.
- Visit `http://127.0.0.1:8080`. Demo mode is intentionally loopback-only.
- Port occupied: set `PORT=8097` and update `ALLOWED_ORIGINS` in `.env`.
- Review desktop and mobile screens, synthetic menus, queue flow and recovery consent.
- Local data lives in `.data/`. Keep only one server process per data directory.

## 2. Firebase / Google Cloud project

- Use a project and billing/credits approved by your team/organiser. Review costs first.
- Enable Cloud Run, Cloud Build, Artifact Registry, Firestore and Firebase Authentication as needed.
- Create the `(default)` Firestore database in Native mode. Select a region intentionally.
- Enable Firebase Authentication **Email/Password**, create a web app, and copy its web API key.
- The Firebase web API key is public client configuration, not a service-account secret. Apply appropriate restrictions without blocking Identity Toolkit / Secure Token.
- Create operator accounts, get their UIDs, and map those UIDs to `bowl-lab` / `noodle-co` in server configuration. No client can choose an operator role.
- Use a dedicated runtime service account with only the necessary Firestore permissions (normally `roles/datastore.user` for this prototype).
- Set budget alerts and conservative scaling. Alerts are not a guaranteed spending cap.
- Do not download or commit a service-account private key. Cloud Run uses its runtime identity.

## 3. Deploy the API and initialise demo cloud data

Use Google Cloud Shell from the project directory. The template commands are provided but have not been executed against a live project.

1. Copy `infra/api.env.example.yaml` to `infra/api.local.yaml`.
2. Fill project ID, Firebase web API key, real operator UIDs and exact Hosting origins.
3. Set `PROJECT_ID` and `RUNTIME_SERVICE_ACCOUNT`; keep region consistent with `firebase.json`.
4. Run `bash scripts/deploy-cloud.sh api` after reviewing the command. The API's public transport is intentional; business routes still require a verified Firebase ID token.
5. Initialise synthetic vendors once from an authorised Cloud Shell session:

```bash
export AUTH_MODE=firebase STORE=firestore
export GOOGLE_CLOUD_PROJECT="$PROJECT_ID"
export FIRESTORE_ACCESS_TOKEN="$(gcloud auth print-access-token)"
npm install
npm run build
npm run seed:cloud
unset FIRESTORE_ACCESS_TOKEN
```

- The seed command creates missing documents only; it never overwrites existing cloud orders.
- Supply short-lived tokens only through your environment. Do not paste them into chat, code or documentation.
- The vendor UI can generate fresh pickup windows later without resetting data.

## 4. Firebase Hosting

- `firebase.json` serves only `dist/public`; it does not expose server source or credentials.
- `/api/**` rewrites to `breakbite-api` in `asia-southeast1`; change both values if your deployment differs.
- Deploy through an authenticated Firebase CLI, selecting your project explicitly:

```bash
npm run build
firebase deploy --project "$PROJECT_ID" --only hosting,firestore:rules,firestore:indexes
```

- No Firebase SDK initialisation is needed in the frontend; it uses Firebase Auth REST.
- Test real student signup, operator UID mapping and protected requests from the Hosting origin.
- Restrict demo users/registration appropriately before admitting actual students. The prototype does not enforce APU membership automatically.

## 5. Gemini Enterprise — after the license arrives

- Read `AGENT_SETUP.md` before deployment.
- Ask the organiser/admin to enable agent creation and custom MCP connections/actions.
- Deploy a **separate private MCP-only Cloud Run service** using `infra/mcp.env.example.yaml` and `scripts/deploy-cloud.sh mcp`.
- Bootstrap a private service with its agent endpoint disabled, so its real URL can be obtained:

```bash
gcloud run deploy breakbite-mcp --project "$PROJECT_ID" --region asia-southeast1 \
  --source . --service-account "$RUNTIME_SERVICE_ACCOUNT" \
  --set-env-vars "AUTH_MODE=firebase,STORE=firestore,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,MCP_ONLY=true,MCP_TRUST_CLOUD_RUN_IAM=false" \
  --no-allow-unauthenticated --min-instances 0 --max-instances 2 --memory 256Mi
```

- Copy the returned URL into the MCP environment template, fill the remaining placeholders, then redeploy with `bash scripts/deploy-cloud.sh mcp`. The helper deliberately refuses unresolved placeholders.
- Obtain the service's default `.run.app` URL; put its origin (no `/mcp`) in `MCP_AUDIENCE` and the Gemini service-agent email in `MCP_EMAILS_JSON`.
- Enable `MCP_TRUST_CLOUD_RUN_IAM=true` only with `MCP_ONLY=true` on an IAM-protected Cloud Run service. The setting cannot be used locally or on the public API.
- Grant `roles/run.invoker` on this service only to the intended Gemini Enterprise service agent and necessary administrators. **No `allUsers` or `allAuthenticatedUsers` invoker binding. Never disable the Cloud Run invoker check.**
- In the tenant connector, use the default HTTPS `.run.app/mcp` endpoint, enable only the three supplied tools, and restrict connector access to the intended vendor operators.
- Start with Bowl Lab only. One service identity maps to one kitchen; do not share a Bowl Lab connector with other vendors. Use a separate service/connector for Noodle & Co. if necessary.
- Verify the actual forwarded IAM header and claims in your project without logging token values. If the tenant cannot use this route, stop and configure its supported OAuth route; an OAuth server is not supplied in this prototype.
- An account alone does not prove custom connector/admin permissions are available.

## 6. Live acceptance gates

- Unauthenticated API order requests fail; a student cannot edit another student's order.
- Wrong operator cannot view/mutate another kitchen.
- Client Firestore reads and writes fail; the backend service identity works.
- Two clients competing for the last window produce one reservation.
- Private MCP is rejected by Cloud Run without IAM credentials.
- Actual Gemini run reads current data, evaluates and creates a **pending** proposal.
- Only vendor approval plus student acceptance changes the order; expire/stock-race cases fail safely.
- Capture real tool traces and final order state. Do not call the manual preview Gemini execution.

## Before real money / real students

- Replace fictional menu data with permissioned vendor data and verify allergen information.
- Confirm cancellation/no-show/preparation rules and the physical pickup/payment process.
- Add retention/archival, approved privacy notices, account-revocation handling, global abuse controls and production monitoring.
- Perform independent security and load reviews. Add real payments only as a separately reviewed integration.
- No production cloud or Docker deployment is claimed tested in this delivery.

## Official references (checked 5 November 2026)

- [Firebase Hosting with Cloud Run](https://firebase.google.com/docs/hosting/cloud-run)
- [Firebase ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Cloud Run service identity](https://docs.cloud.google.com/run/docs/authenticating/service-to-service)
- [Gemini Enterprise custom MCP setup](https://docs.cloud.google.com/gemini/enterprise/docs/connectors/custom-mcp-server/set-up-custom-mcp-server)
