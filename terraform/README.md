# Infrastructure

**Status: applied and live.** `https://vphatfla.me/app/piggy-tracking/` and
`https://vphatfla.me/api/*` are both serving real traffic. Instance id
`i-00be81717170a1650`, bucket `piggy-tracking-prod-741448918679`, ECR repo
`piggy-tracking-backend` — `terraform output` is the source of truth if any
of these are ever recreated.

Provisions piggy-tracking's production hosting: an S3 bucket for the built
frontend, and an EC2 instance (+ dedicated EBS volume for Postgres) running
the backend via the existing `docker-compose.yml` + `docker-compose.prod.yml`.

`user_data.sh` itself stops at "Docker is installed and the data volume is
mounted" — it never deploys the app. That's `.github/workflows/backend-deploy.yml`
+ `.github/workflows/frontend-deploy.yml` (and `deploy/remote-deploy.sh`,
which is what the backend workflow tells the box to run) — see the repo
root's `.github/workflows/` and `deploy/`. The first deploy was done by
hand, running the identical commands the workflows run; **the repo secrets
are wired up now and CI/CD deploys on merge to main** (see step 3 below).

`cicd.tf` (alongside this file) is what those workflows authenticate as and
run against: an ECR repository for the backend image, the extra IAM
permissions the instance role needs to actually deploy (reading its own
secrets, pulling images, reading deploy artifacts), and the GitHub Actions
OIDC role itself.

## The domain: no new CloudFront distribution

piggy-tracking rides on **oppy-marser's existing, live CloudFront
distribution** (`~/workplace/oppy-marser/terraform/main.tf`) rather than
getting its own — both apps stay reachable at `vphatfla.me` at all times,
routed by path: `/app/piggy-tracking/*` → this stack's S3 bucket, `/api/*` →
this stack's EC2 instance, everything else unchanged and still oppy-marser's.

That distribution, its ACM certificate, and the domain's DNS are all owned
and managed by oppy-marser's Terraform — this repo never touches them
directly.

## The cross-repo coupling, and why apply order matters

This stack and oppy-marser's each read the other's Terraform outputs via
`data "terraform_remote_state"` (S3 backend, read-only in both directions —
neither writes to the other's state):

- **oppy-marser's `main.tf`** reads *this* stack's outputs
  (`s3_bucket_regional_domain_name`, `backend_eip_public_dns`) to build its
  two new origins.
- **This stack's `main.tf`** reads oppy-marser's `cloudfront_distribution_arn`
  output, to scope the frontend bucket's policy to that specific
  distribution.

Because of that, **this stack must be applied first** — oppy-marser's edit
reads outputs that only exist once this stack has real state. Apply order:

1. **Bootstrap this stack's Terraform state bucket** (`backend.tf`) — same
   local-state-first process as oppy-marser's own bootstrap:
   ```bash
   cd terraform
   terraform init
   terraform apply -target=aws_s3_bucket.terraform_state \
                    -target=aws_s3_bucket_versioning.terraform_state \
                    -target=aws_s3_bucket_server_side_encryption_configuration.terraform_state \
                    -target=aws_s3_bucket_public_access_block.terraform_state
   terraform init -migrate-state
   ```
2. **Apply this stack's main infrastructure** (`main.tf`) — creates the S3
   bucket, EC2 instance, EBS volume, EIP, etc.:
   ```bash
   terraform apply
   ```
3. **Apply oppy-marser's edit** (`~/workplace/oppy-marser/terraform`) — adds
   the two new origins/cache behaviors to its distribution, now that this
   stack's outputs exist to read.

Applied in this order (matters — see the cross-repo coupling above):
state bucket bootstrap → `main.tf` + `cicd.tf` → oppy-marser's edit → the
CloudFront path-pattern fix below → the manual first deploy. Real bugs
were found and fixed live along the way, not just in review — worth reading
if this ever needs touching again:

- **EC2's `GroupDescription` is ASCII-only** — the em dash this repo's
  comments use everywhere else got rejected outright by the API.
- **AL2023's AMI snapshot requires ≥30GB** root volume — 8GB was rejected.
- **`docker-compose-plugin` isn't a real AL2023 `dnf` package** (that's a
  Docker CE repo package) — `user_data.sh` died under `set -e` before ever
  reaching the EBS mount step. Now installs the Compose CLI plugin as a
  direct binary download.
- **`ssm:GetParametersByPath`'s resource ARN needs the bare path, not just
  the wildcard** — `.../prod/*` alone doesn't cover a call for `.../prod`
  itself; `cicd.tf` now grants both.
- **CloudFront's `/app/piggy-tracking/*` wildcard doesn't match the bare
  path with no trailing slash** — that's a real URL people type/bookmark,
  and it was silently falling through to oppy-marser's own default
  behavior/origin. Fixed with a second, exact-match `ordered_cache_behavior`
  for `/app/piggy-tracking` in oppy-marser's `main.tf`, identical settings
  otherwise.
- **A deploy can reach S3 and still not reach production.** The frontend
  workflow shipped `index.html` under
  `Cache-Control: public,max-age=31536000,immutable`, which is right for the
  content-hashed bundles and wrong for the one unhashed file that names them.
  CloudFront held a three-day-old copy for the full year the header claimed,
  and because the sync also ran `--delete`, the bundle that stale HTML pointed
  at was gone from the bucket — the live page served an HTML shell whose own
  JavaScript 403'd. Found by comparing `aws s3api head-object` (new ETag)
  against `curl -sI` on the live URL (old ETag, `age: 267749`). Now four
  steps: hashed → immutable, unhashed → `no-cache`, invalidate and wait, then
  prune. **Cache headers follow the filename, not a list of exceptions**, and
  the `--delete` happens after the switchover, never before it.
- **`terraform apply` runs unattended on merge, and the plan was one AMI
  release away from deleting the database.** `data "aws_ami"` is
  `most_recent = true`, so a new AL2023 image forced `aws_instance.backend` to
  be replaced; `aws_ebs_volume.data` takes its `availability_zone` from that
  instance, so the Postgres volume was slated for replacement too — an empty
  disk, no snapshot, no undo. Nothing had changed in `terraform/` since, so it
  sat armed and invisible; the next PR touching this directory for any reason
  would have fired it. Fixed with two `lifecycle` blocks in `main.tf`:
  `ignore_changes = [ami]` on the instance (the AMI supplies the starting
  image and nothing else — upgrading it is now a deliberate detach/rebuild/
  reattach), and `prevent_destroy = true` on the volume, so any future cause
  fails at plan time instead of succeeding quietly.

Also found, **not fixed here, not this repo's to fix**: oppy-marser's own
pre-existing `default_cache_behavior` has a mislabeled policy ID — the hex
value hardcoded as "CachingOptimized" actually resolves to
`Managed-CachingDisabled` (confirmed by comparing it against a real `data
"aws_cloudfront_cache_policy"` lookup by name). Their live site has been
serving with caching disabled, not optimized, the whole time. Worth fixing
in oppy-marser separately, whenever.

## One-time manual setup (not automated — same spirit as the state-bucket bootstrap)

Two things need to exist *before* `terraform apply` on `cicd.tf` and before
CI/CD can run at all. Neither is Terraform's job — secrets shouldn't be
provisioned by the same pipeline that reads them, and the GitHub OIDC
provider is an account-wide singleton oppy-marser's own CD already depends
on existing. **All three steps are done** — the table in step 3 is the
record of what exists, and anything added to it (as
`AWS_CLOUDFRONT_DISTRIBUTION_ID` was) has to be created by hand before the
workflow that reads it merges.

1. **Confirm the account's GitHub OIDC provider exists**:
   ```bash
   aws iam list-open-id-connect-providers
   ```
   It should — oppy-marser's `AWS_ROLE_ARN`-based workflows already
   authenticate this way. `cicd.tf`'s `data "aws_iam_openid_connect_provider"`
   read fails at plan time if it doesn't.

2. **Put production secrets in SSM Parameter Store**, real values (never
   this repo's dev placeholders):
   ```bash
   aws ssm put-parameter --type SecureString --name /piggy-tracking/prod/POSTGRES_PASSWORD --value '...'
   aws ssm put-parameter --type SecureString --name /piggy-tracking/prod/JWT_ACCESS_SECRET --value '...'
   aws ssm put-parameter --type SecureString --name /piggy-tracking/prod/JWT_REFRESH_SECRET --value '...'
   aws ssm put-parameter --type String       --name /piggy-tracking/prod/POSTGRES_USER --value '...'
   aws ssm put-parameter --type String       --name /piggy-tracking/prod/POSTGRES_DB --value '...'
   aws ssm put-parameter --type String       --name /piggy-tracking/prod/GOOGLE_CLIENT_ID --value '...'
   ```
   `deploy/remote-deploy.sh` fetches all six with one
   `get-parameters-by-path` call and writes them to `.env` on the box.
   `GOOGLE_CLIENT_ID` isn't sensitive but lives alongside the rest so that
   one call gets everything.

3. **After `main.tf` and `cicd.tf` are applied**, add these GitHub repo
   secrets — none are long-lived AWS credentials, just identifiers the
   workflows need to know which resources to talk to (the actual
   authentication is IAM role trust + OIDC):

   | Secret | Value |
   |---|---|
   | `AWS_ROLE_ARN` | `terraform output -raw github_actions_role_arn` |
   | `AWS_S3_FRONTEND_BUCKET` | `terraform output -raw s3_bucket_name` |
   | `AWS_ECR_BACKEND_REPOSITORY` | repo *name* only, not the full URL — `terraform output -raw ecr_repository_url` and take everything after the last `/` (e.g. `piggy-tracking-backend`) |
   | `AWS_BACKEND_INSTANCE_ID` | `terraform output -raw backend_instance_id` |
   | `AWS_CLOUDFRONT_DISTRIBUTION_ID` | `terraform output -raw cloudfront_distribution_id` — oppy-marser's distribution, which `frontend-deploy.yml` invalidates after every sync |
   | `VITE_GOOGLE_CLIENT_ID` | same OAuth client id as the backend's `GOOGLE_CLIENT_ID` SSM parameter above — the backend rejects ID tokens minted for any other audience |

   Optionally, a repo **variable** (not secret) `AWS_REGION` if it should
   ever differ from the `us-east-1` default the workflows fall back to.

## Naming conventions (matching oppy-marser's)

`Project`/`Environment`/`ManagedBy`/`Purpose` tags, `${project_name}-${environment}-*`
resource names, one flat config (no modules) — same shape as
`~/workplace/oppy-marser/terraform`, so the two are easy to read side by
side. The frontend bucket's name is deterministic (account id suffix, not a
random one) specifically so oppy-marser's `data` read above doesn't need an
apply-order dance beyond "this stack goes first."
