# Firestore storage

`STORE=firestore` keeps everything that `database.json` holds (accounts, sessions, kitchens, orders, checkout keys, profiles, notices and push queue) in Cloud Firestore. The app, `AUTH_MODE=local` accounts and every business rule are unchanged. `STORE=file` remains the default for development.

**Integration status (11 November 2026):** JSON, in-memory Firestore and the official Firestore emulator have been checked in this workspace. Live Google project credentials, rules, quotas and network access must still be verified using the opt-in checks below; prior branch-author live testing is not a substitute for validating the target deployment. Hosting (Vercel) is a separate, later step: photos and Web Push keys still live in `DATA_DIR`, and the background timers need a running server.

## How it works

```text
ROOT (FIRESTORE_ROOT, default envs/production)   format, schemaVersion, revision, nextSeq, updatedAt
ROOT/accounts|sessions|checkouts|profiles|notices|pushDevices|pushJobs/{id}
ROOT/vendors/{kitchenId}                         kitchen, menu, pickup windows, proposals, audit
ROOT/vendors/{kitchenId}/orders/{orderId}
ROOT/vendors/{kitchenId}/requests/{key}
```

- Each record document is `{ key, seq, payload }`. `payload` is the record's exact JSON, `key` is its original ID and `seq` keeps list order.
- The server loads everything into memory on start, as with the JSON file. Reads come from memory. Each change writes only the documents that changed, plus ROOT, in **one atomic commit**.
- A commit only succeeds if ROOT has not changed since the server last loaded it. If another process wrote first, the server reloads and retries the change, which keeps a multi-kitchen checkout all-or-nothing and stops stock being sold twice. No-op transactions also revalidate ROOT; failed refreshes fail closed until revalidated.
- On first start with an empty ROOT, the server creates the sample kitchens itself. This is a new dataset, not a JSON import. Existing local accounts, judge passwords, orders, sessions and media are not copied automatically; keep the local installation intact until migration/provisioning is separately completed.

## One-time Google Cloud setup

1. In Firestore, **create a database**: Native mode, Standard edition, region `asia-southeast1`, **production (deny-all) rules**. Note its **database ID**.
2. Under **Firestore → Rules**, confirm the deny-all rules in [infra/firestore.rules](../infra/firestore.rules). Browsers never talk to Firestore directly; the server uses its service account, which these rules do not restrict.
3. Under **IAM & Admin → Service Accounts**, create a service account (e.g. `breakbite-server`) with only the role **Cloud Datastore User**. Create a **JSON key**.
4. Keep the key **outside the repository**, for example `~/secrets/`. Never commit it, paste it into chat or put it in a shared drive. If it leaks, delete the key in the console and create a new one.
5. *(Recommended)* Stop Firestore indexing the large `payload` field. The app never queries it, so indexing only adds write cost. [infra/firestore.indexes.json](../infra/firestore.indexes.json) lists the overrides. Apply them with gcloud:
   ```bash
   for g in accounts sessions checkouts profiles notices pushDevices pushJobs vendors orders requests; do
     gcloud firestore indexes fields update payload --collection-group=$g --database=YOUR_DATABASE_ID --disable-indexes
   done
   ```
   Or in the console: **Firestore → Indexes → Single field → Add exemption**, with field `payload`, each collection group above, and every index type turned off.
6. Optional check that the public is locked out. This should return `403 PERMISSION_DENIED`:
   ```bash
   curl "https://firestore.googleapis.com/v1/projects/YOUR_PROJECT/databases/YOUR_DATABASE_ID/documents/envs/production"
   ```

The repository's `firebase.json` belongs to the older Firebase Hosting path and targets `(default)`. Do not use `firebase deploy` for a named database.

## Configure and start

Add to `.env` (see [.env.example](../.env.example)):

```dotenv
AUTH_MODE=local
STORE=firestore
GOOGLE_CLOUD_PROJECT=your-project-id
FIRESTORE_DATABASE=your-database-id
FIRESTORE_ROOT=envs/production
GOOGLE_APPLICATION_CREDENTIALS=~/secrets/your-key-file.json
```

Then run `npm run build` and `npm start`.

- The start-up line names the storage, for example `Firestore your-project-id/your-database-id at envs/production`. The first start also logs `Created a new Firestore dataset at envs/production`. If you see that unexpectedly, check `FIRESTORE_ROOT` for typos.
- `GET /healthz` reports `"storage": "firestore"`.
- Credentials are taken from `FIREBASE_SERVICE_ACCOUNT_JSON` (key JSON or base64, for hosting), otherwise `GOOGLE_APPLICATION_CREDENTIALS`, otherwise `gcloud auth application-default login`. The key's project must match `GOOGLE_CLOUD_PROJECT`.

## Operators and teammates

- `npm run operator` works against Firestore **while the server runs**. The server picks up the new account within `FIRESTORE_REFRESH_MS` (default 5 s; `0` turns checking off, in which case restart the server).
- Teammates working on the UI or features keep `STORE=file` and need no Google access.
- A teammate who must test Firestore gets **their own** access: grant their Google account *Cloud Datastore User*, they run `gcloud auth application-default login` and omit `GOOGLE_APPLICATION_CREDENTIALS`, and they use their own `FIRESTORE_ROOT=envs/dev-name`. Separate roots are a convention, not a permission boundary; use a separate project for hard separation.
- To reset all data: delete `envs/production` **including subcollections** in the console, then restart. The server refuses to start over leftover subcollections without ROOT (`STALE_DOCUMENTS`).

## Tests

| Command | Backend | Touches Google? |
| --- | --- | --- |
| `npm run check` | JSON file, plus Firestore unit tests on an in-memory stand-in | No |
| `npm run test:firestore-memory` | The **whole suite** on the in-memory Firestore stand-in | No |
| `npm run test:firestore-suite` | The **whole suite** on the real database in `.env`, under throwaway `envs/suite-{runId}-*` roots, deleted afterwards only for that invocation | Yes |
| `npm run test:firestore-live` | Focused real-database check: creation, atomic checkout, two-process conflicts, reload. Needs `BREAKBITE_LIVE_FIRESTORE=1`; uses and deletes `envs/livecheck-*` | Yes |

None of them touch `envs/production`. Four tests include JSON-file behaviour. On Firestore, the file-lock and corrupt-file tests are skipped, and two reopen tests leave out their `database.previous.json` check.

## Known limits

- **Shared ROOT contention.** Every change updates ROOT, serializing writers. Campus-wide throughput and latency have not been load-tested; do not assume burst capacity from local tests.
- **1 MB per document.** A kitchen document keeps every pickup window an order has used, plus recovery proposals and delay incidents, and grows with use. The server refuses the write with `STORE_LIMIT` rather than losing data; archiving is not implemented yet.
- **Whole dataset in memory** per server process, as with the JSON file.
- **Another process's writes** become visible after `FIRESTORE_REFRESH_MS`. Writes are always checked against the latest data.
- **Free tier** normally covers one database per project; check your database page in the console. Outside it, usage is billed per read and write.
- **Rate limits** are per server instance. On Vercel they use the platform's overwritten client IP header; elsewhere they use the connection address. Other proxies such as Cloudflare Tunnel can still share one budget. Distributed abuse protection is not implemented.

## Troubleshooting

| Error code | Meaning |
| --- | --- |
| `CONFIG` | Missing or invalid setting, unreadable key file, or a key from a different project |
| `CLOUD_AUTH` | Credentials missing or invalid |
| `CLOUD_PERMISSION` | Service account lacks *Cloud Datastore User* |
| `CLOUD_STORE` "database not found" | Wrong `GOOGLE_CLOUD_PROJECT` or `FIRESTORE_DATABASE` |
| `NOT_INITIALIZED` | ROOT was deleted while the server ran; restart to recreate |
| `STALE_DOCUMENTS` | Subcollections remain without ROOT; delete the whole path |
| `CONTENTION` | Too many simultaneous writers; the request can be retried |
| `STORE_LIMIT` | A record would exceed Firestore's 1 MB document limit |

## Local emulator acceptance

Set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8185`, `GOOGLE_CLOUD_PROJECT=demo-breakbite-review` and `FIRESTORE_DATABASE=(default)` with the official emulator running on that port. Run `node scripts/test-store.mjs firestore` after compilation. This uses a unique test namespace and never contacts a live Google project when the emulator host is set. The SDK uses credential-free gRPC for the emulator and REST for real Firestore.

The integration pins Firebase Admin 14.5.0 (Node 22+); the runtime dependency audit had no advisories at verification time. Credentials are never sent to the browser or committed.
