# Vercel + Firestore MVP

The repository includes Vercel configuration and a serverless Node 22 entry point. Firestore keeps accounts, sessions, orders and kitchen state. Static pages/assets are served by Vercel; private Vercel Blob storage keeps uploaded menu photos. No laptop or Cloudflare Tunnel is needed after deployment.

**Live MVP (12 November 2026):** [breakbite-ebon.vercel.app](https://breakbite-ebon.vercel.app), project `breakbite`, Node 22, Singapore functions, Firestore `breakbite-514410 / breakbite-67076 / envs/team-dev`. HTTPS/catalogue/accounts/security checks passed. Push keys and the maintenance endpoint are configured privately. The public judge logins in README are demo accounts. Blob is not connected; bundled photos work. Physical-phone delivery and full hosted UAT remain separate.

## Deploy

1. Sign in at [Vercel](https://vercel.com/new) with GitHub. Import `learnerxuan/BreakBite`, selecting the branch containing `vercel.json`.
2. Keep **Framework Preset: Other**, **Root Directory: .** and **Node.js: 22.x**. The repository sets install `npm ci --ignore-scripts`, build `npm run build`, output `dist/public`, and the Singapore function region.
3. Before Deploy, add these environment variables for **Production only**:

| Variable | Value |
| --- | --- |
| `AUTH_MODE` | `local` (cookie accounts; not a local database) |
| `STORE` | `firestore` |
| `GOOGLE_CLOUD_PROJECT` | Your friend's actual Google Cloud project ID |
| `FIRESTORE_DATABASE` | `(default)` or the actual named database ID |
| `FIRESTORE_ROOT` | `envs/production` |
| `FIRESTORE_REFRESH_MS` | `5000` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | The entire service-account key JSON, entered as a sensitive server environment variable |
| `COOKIE_SECURE` | `true` |
| `PUSH_ENABLED` | `false` initially |
| `BREAKBITE_APSPACE` | `false` initially; manual timetable entry and calendar import still work |

The service account needs **Cloud Datastore User** (`roles/datastore.user`) in that project. Keep Firestore browser rules deny-all: all app access goes through the server and IAM. See [Firestore setup](FIRESTORE.md). Do not paste the private key in chat, commit it, or prefix it with `PUBLIC`, `VITE_` or `NEXT_PUBLIC_`.

4. Deploy. Vercel's system deployment/branch/production domains are allowed automatically using exact HTTPS origins. For a custom domain, add `ALLOWED_ORIGINS=https://your-domain.example` and redeploy. No trailing slash. Do **not** copy your laptop `.env`, `DATA_DIR`, `GOOGLE_APPLICATION_CREDENTIALS`, LAN origins or `ALLOW_INSECURE_LAN` to Vercel.
5. Open `https://YOUR-DOMAIN/healthz`: it must report `ok: true`, `mode: local`, `storage: firestore`. Register a disposable student and run the acceptance steps below.
6. In the Vercel project **Storage**, create/connect a **private Blob store** and select the Production environment. This supplies `BLOB_READ_WRITE_TOKEN`; redeploy. The seeded dish photos work without Blob. Uploading a new photo before connecting Blob returns a clear configuration error rather than saving it to a temporary disk. Hobby Blob has a [free usage allowance](https://vercel.com/docs/vercel-blob/usage-and-pricing).

Adding/changing environment variables requires redeploying. Never put production credentials on untrusted preview branches.

## Kitchen accounts and existing local data

A fresh Firestore root starts with nine kitchens and **no accounts or historical orders**. Laptop judge logins are not automatically copied. Existing Firestore data is preserved.

Provision each operator with the existing private CLI, using a separate ignored environment file such as `.env.cloud` on your laptop. It must contain the same project ID, database ID, root and server credential. Do not change the localhost `.env`.

```powershell
npm run build
node --env-file=.env.cloud dist/server/operator-cli.js
```

Repeat for each kitchen. Keep the resulting judge credentials outside Git. Firestore permits the CLI while the hosted site is running; the JSON backend still requires its sole writer to stop. Do not import the whole local database into an occupied Firestore root without a reviewed migration.

## Previews

Configure Preview separately, with a dedicated test Google project/service account and a separate `FIRESTORE_ROOT` such as `envs/vercel-preview`. A preview with a missing root or `envs/production` is refused. Preview deployments sharing a root also share test data. Use a unique root for independent previews. Keep Vercel deployment protection enabled for previews and use only disposable data.

## Maintenance and notifications

Vercel's function imports no listening server and starts no interval timers. API requests await maintenance, coalesced per instance and normally limited to once per 15 seconds: refresh pickup windows, create deduplicated inbox notices, and pump configured push jobs. Kitchen updates also preserve the existing immediate notice generation.

**With no requests and no scheduler, maintenance does not run.** The next API request catches up; this is not continuous background notification delivery. Ordinary ordering and Inbox work for the hackathon MVP. Do not advertise closed-tab alerts until a scheduler and real-device delivery have been tested.

For independent maintenance, generate a random 32-byte `CRON_SECRET` as a sensitive Production variable, redeploy, and configure a trusted scheduler to call once per minute:

```http
GET https://YOUR-DOMAIN/api/internal/maintenance
Authorization: Bearer YOUR_CRON_SECRET
```

This endpoint can only perform maintenance; it cannot provision accounts or accept arbitrary outbound URLs. Do not put the secret in the query string, browser code, repository, or screenshots. `.github/workflows/maintenance.yml` calls the fixed production endpoint about every five minutes, using Actions secret `BREAKBITE_CRON_SECRET` and repository variable `BREAKBITE_MAINTENANCE_ENABLED=true`. This is a best-effort free MVP scheduler, not a guaranteed delivery deadline; GitHub can delay scheduled runs. Set the variable to `false` after judging to stop the calls. No paid scheduler is installed.

Web Push additionally needs `PUSH_ENABLED=true` and stable `WEB_PUSH_KEYS_JSON`, containing the private VAPID key object generated by `npm run push:keys`. Store this as a sensitive environment variable, never in the static output. Keep the same keys across deployments. Follow [Web Push acceptance](WEB_PUSH.md); push-service acceptance is not proof of delivery.

APSpace automatic refresh remains opt-in. On Vercel it is checked during maintenance, with a per-instance six-hour cooldown and the provider's shared cache rules. Manual saved classes and `.ics` import need no automatic integration.

## Hosted acceptance

1. Browse all nine kitchens and load images/modules; check `healthz` says Firestore.
2. Register/login; check the session cookie is Secure/HttpOnly and cross-origin mutations are rejected.
3. Place a two-kitchen order. Reload, sign out/in and redeploy; the same orders must persist. Retry an uncertain checkout without creating duplicates.
4. Log in as two operators separately. Close/reopen a kitchen, check menu visibility, preparation, delays, cancellation, history and sibling independence.
5. Collect with the student's QR/manual code and confirmed counter payment; reuse must fail. Test the actual phone browser over public HTTPS; camera support still varies.
6. Upload an owned photo after Blob connection. Reload and redeploy; it must remain available. Photo removal must clear the menu image.
7. Check Inbox after a due time, and after an idle interval. If a scheduler is connected, verify its authorized calls and reject missing/wrong credentials. Test closed-tab push on a real device separately.

## Verification boundaries

Local checks cover TypeScript, application tests, the official Firestore emulator and the Vercel Node builder's traced package. Self-signed localhost HTTPS tests are not verification of Vercel edge routing, Google project credentials/IAM, Blob service access, public TLS or physical phones. Record those after deployment in [UAT](UAT.md).

Rate limits now use Vercel's overwritten client-address header only on Vercel, and the socket elsewhere. These counters remain per instance; this is not distributed abuse protection. The Firestore shared ROOT still serializes writers and campus-scale load is unverified.
