# Infrastructure

Provisions piggy-tracking's production hosting: an S3 bucket for the built
frontend, and an EC2 instance (+ dedicated EBS volume for Postgres) running
the backend via the existing `docker-compose.yml` + `docker-compose.prod.yml`.

**Not provisioned here**: the app is never actually deployed onto the box by
this Terraform — `user_data.sh` stops at "Docker is installed and the data
volume is mounted." Building the backend image, pushing it, and telling the
box to pull and run it is `.github/workflows/backend-deploy.yml` (and
`deploy/remote-deploy.sh`, which is what that workflow tells the box to
run) — see the repo root's `.github/workflows/` and `deploy/`.

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

None of this has been applied yet — see the plan this was built from for
what's deliberately still out of scope (deploy automation, `terraform apply`
itself).

## One-time manual setup (not automated — same spirit as the state-bucket bootstrap)

Two things need to exist *before* `terraform apply` on `cicd.tf` and before
CI/CD can run at all. Neither is Terraform's job — secrets shouldn't be
provisioned by the same pipeline that reads them, and the GitHub OIDC
provider is an account-wide singleton oppy-marser's own CD already depends
on existing.

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
