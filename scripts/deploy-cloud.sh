#!/usr/bin/env bash
# Run deliberately from Google Cloud Shell after MANUAL_SETUP.md. May incur charges.
set -euo pipefail
: "${PROJECT_ID:?Set PROJECT_ID}"
: "${RUNTIME_SERVICE_ACCOUNT:?Set the dedicated Firestore-capable runtime service account email}"
REGION="${REGION:-asia-southeast1}"
TARGET="${1:-api}"
[[ "$TARGET" == api || "$TARGET" == mcp ]] || { echo 'Use api or mcp'; exit 1; }
ENV_FILE="infra/${TARGET}.local.yaml"
[[ -f "$ENV_FILE" ]] || { echo "Create $ENV_FILE from its example first."; exit 1; }
! grep -q REPLACE_ "$ENV_FILE" || { echo 'Replace every placeholder before deployment.'; exit 1; }
AUTH_FLAG=--allow-unauthenticated
if [[ "$TARGET" == mcp ]]; then AUTH_FLAG=--no-allow-unauthenticated; fi
# API is reachable publicly, but its business endpoints still verify Firebase ID tokens.
# MCP is protected by Cloud Run IAM AND a fixed service-identity-to-vendor mapping.
gcloud run deploy "breakbite-${TARGET}" --project "$PROJECT_ID" --region "$REGION" \
  --source . --service-account "$RUNTIME_SERVICE_ACCOUNT" --env-vars-file "$ENV_FILE" \
  --min-instances 0 --max-instances 2 --memory 256Mi --cpu 1 --concurrency 8 \
  --timeout 60 "$AUTH_FLAG"
echo 'Deployment command completed. Run the acceptance checks in docs/MANUAL_SETUP.md.'
