#!/bin/bash
# Runs *on the backend EC2 instance*, invoked by
# .github/workflows/backend-deploy.yml via `aws ssm send-command`. Not run
# locally, not run in CI — this is the box's own half of a deploy.
#
# Expects two env vars, set by the SSM command that invokes this script
# (see backend-deploy.yml — neither value is a secret, so passing them
# through the command payload is fine; actual secrets never appear there,
# see step 1 below):
#   ECR_IMAGE      e.g. 123456789012.dkr.ecr.us-east-1.amazonaws.com/piggy-tracking-backend:sha-abc1234
#   DEPLOY_BUCKET  the frontend S3 bucket's _deploy/ prefix lives in
set -euo pipefail

: "${ECR_IMAGE:?ECR_IMAGE must be set}"
: "${DEPLOY_BUCKET:?DEPLOY_BUCKET must be set}"

app_dir="/opt/piggy-tracking"
region="us-east-1"

mkdir -p "$app_dir"
cd "$app_dir"

# --- 1. Secrets: fetched fresh every deploy, never passed through the SSM
#        command payload or logged. Written 0600, root-owned (this script
#        itself runs as root under SSM). ---
aws ssm get-parameters-by-path \
  --region "$region" \
  --path /piggy-tracking/prod \
  --with-decryption \
  --query 'Parameters[*].[Name,Value]' \
  --output text \
  | while IFS=$'\t' read -r name value; do
      echo "${name##*/}=${value}"
    done > .env
chmod 600 .env

# --- 2. Deploy-time files (docker-compose.yml, the prod overlay) — fetched
#        from S3, not git; the box never holds a git credential. ---
aws s3 cp "s3://${DEPLOY_BUCKET}/_deploy/docker-compose.yml" ./docker-compose.yml
aws s3 cp "s3://${DEPLOY_BUCKET}/_deploy/docker-compose.prod.yml" ./docker-compose.prod.yml

# --- 3. Pull and run the new image. --no-build is deliberate: the base
#        compose file's `backend.build` directive must never fire here —
#        docker-compose.prod.yml supplies `image:`, and `pull` is what
#        actually updates it. ---
export ECR_IMAGE
aws ecr get-login-password --region "$region" \
  | docker login --username AWS --password-stdin "${ECR_IMAGE%%/*}"

docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build

# No separate migration step: docker-compose.yml's backend.command already
# runs `prisma migrate deploy` before `node dist/index.js` on every
# container start — the same in every environment, not a dev-only override.

echo "Deploy complete: ${ECR_IMAGE}"
