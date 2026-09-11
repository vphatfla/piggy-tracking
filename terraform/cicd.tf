# ========================================
# ECR — where CI pushes the backend image
# ========================================

resource "aws_ecr_repository" "backend" {
  name                 = "${var.project_name}-backend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = merge(var.additional_tags, {
    Name        = "${var.project_name}-${var.environment}-backend-ecr"
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

# Unbounded image storage is real cost for a box that redeploys often — keep
# a bounded history instead. Two rules, evaluated by priority: expire
# untagged images fast (they're build leftovers, never what the box runs),
# then cap tagged image count.
resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep only the last 10 tagged images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["latest", "sha-"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = { type = "expire" }
      }
    ]
  })
}

# ========================================
# INSTANCE ROLE — additional deploy-time permissions
# ========================================
# aws_iam_role.backend and its SSM attachment live in main.tf (that's what
# makes Session Manager access work); these are the extra statements
# deploy/remote-deploy.sh needs once it's actually pulling and running the
# app — fetching its own secrets, reading deploy artifacts, pulling images.

data "aws_iam_policy_document" "backend_deploy" {
  statement {
    sid     = "ReadOwnSecrets"
    actions = ["ssm:GetParametersByPath", "ssm:GetParameter", "ssm:GetParameters"]
    # Two patterns, not one: GetParametersByPath checks permission against
    # the bare path itself (".../prod", no trailing slash) - a resource ARN
    # of ".../prod/*" alone doesn't match that and the call is denied.
    # Confirmed the hard way against the real instance role. ".../prod*"
    # covers both the bare path and everything nested under it.
    resources = [
      "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${var.project_name}/${var.environment}",
      "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${var.project_name}/${var.environment}/*",
    ]
  }

  # SSM Parameter Store SecureString values are encrypted under the account's
  # default SSM-managed KMS key (alias/aws/ssm) unless a custom key was used
  # when the parameter was created — see terraform/README.md's put-parameter
  # instructions, which don't pass -key-id, so this is the right key.
  statement {
    sid       = "DecryptSecureStringParameters"
    actions   = ["kms:Decrypt"]
    resources = ["arn:aws:kms:${var.aws_region}:${data.aws_caller_identity.current.account_id}:alias/aws/ssm"]
  }

  # _deploy/* is a non-served prefix in the frontend bucket (CloudFront's
  # path patterns only expose /app/piggy-tracking/* and /api/*, nothing
  # else) — this is where the deploy workflow drops docker-compose.yml,
  # docker-compose.prod.yml, and remote-deploy.sh for the box to fetch.
  statement {
    sid       = "ReadDeployArtifacts"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/_deploy/*"]
  }

  statement {
    sid = "PullBackendImage"
    actions = [
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:BatchCheckLayerAvailability",
    ]
    resources = [aws_ecr_repository.backend.arn]
  }

  # GetAuthorizationToken has no resource-level permissions — it's account-wide.
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "backend_deploy" {
  name   = "${var.project_name}-${var.environment}-backend-deploy"
  role   = aws_iam_role.backend.id
  policy = data.aws_iam_policy_document.backend_deploy.json
}

# ========================================
# GITHUB ACTIONS OIDC ROLE
# ========================================
# Written as code (bootstrapped once with local/manual credentials, same
# local-state-first pattern backend.tf's state bucket uses) rather than
# created by hand in the console — this makes the permission surface
# reviewable and versioned. Trusts the account's *existing* GitHub OIDC
# provider (oppy-marser's own CD already depends on one existing) rather
# than creating a second — an account holds at most one per issuer URL.

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "github_actions_assume_role" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Both push (main) and pull_request events — the terraform-deploy
    # workflow's PR job runs `terraform plan` with real credentials too,
    # matching oppy-marser's own terraform-deploy.yml.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:vphatfla/piggy-tracking:*"]
    }
  }
}

resource "aws_iam_role" "github_actions" {
  name               = "${var.project_name}-${var.environment}-github-actions"
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume_role.json

  tags = merge(var.additional_tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

data "aws_iam_policy_document" "github_actions" {
  # This stack's own Terraform state.
  statement {
    sid       = "OwnStateBucket"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::${var.project_name}-terraform-state"]
  }
  statement {
    sid       = "OwnStateObjects"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["arn:aws:s3:::${var.project_name}-terraform-state/infra/terraform.tfstate"]
  }

  # Read-only on oppy-marser's state — required for `terraform plan` to
  # resolve the terraform_remote_state data source in main.tf. Never write.
  statement {
    sid       = "OppyMarserStateReadOnly"
    actions   = ["s3:GetObject"]
    resources = ["arn:aws:s3:::${var.oppy_marser_state_bucket}/${var.oppy_marser_state_key}"]
  }
  statement {
    sid       = "OppyMarserStateBucketList"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::${var.oppy_marser_state_bucket}"]
  }

  # The frontend bucket — both the CloudFront-served prefix (frontend-deploy
  # workflow's `aws s3 sync`) and _deploy/ (backend-deploy workflow).
  statement {
    sid       = "FrontendBucketReadWrite"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.frontend.arn]
  }
  statement {
    sid       = "FrontendBucketObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]
  }

  # Push the backend image.
  statement {
    sid = "EcrPush"
    actions = [
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:BatchCheckLayerAvailability",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
    ]
    resources = [aws_ecr_repository.backend.arn]
  }
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  # Invalidate the frontend at the edge after a deploy. Scoped to the one
  # distribution, whose ARN main.tf already reads from oppy-marser's state for
  # the bucket policy — this stays a read of their outputs plus a cache
  # operation on the distribution, never a write to their Terraform state.
  #
  # Without this the frontend workflow can only ever reach S3: CloudFront goes
  # on serving whatever it cached until the TTL expires, which is how a merged
  # change sat invisible in production for three days.
  statement {
    sid       = "InvalidateFrontendCache"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = [data.terraform_remote_state.oppy_marser.outputs.cloudfront_distribution_arn]
  }

  # Trigger + observe the remote deploy script.
  statement {
    sid     = "SsmDeploy"
    actions = ["ssm:SendCommand"]
    resources = [
      aws_instance.backend.arn,
      "arn:aws:ssm:${var.aws_region}::document/AWS-RunShellScript",
    ]
  }
  statement {
    sid       = "SsmDeployStatus"
    actions   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
    resources = ["*"] # no resource-level restriction for these two actions
  }

  # Everything else `terraform plan`/`apply` needs to manage main.tf's and
  # this file's resources — EC2, EBS, IAM role/instance-profile, security
  # groups, ECR repo/policy. Broad by Terraform-CI necessity (it must be
  # able to create/update/delete what it manages); scoped to actions rather
  # than left fully wildcard.
  statement {
    sid = "ManageInfrastructure"
    actions = [
      "ec2:*",
      "iam:GetRole", "iam:CreateRole", "iam:DeleteRole", "iam:TagRole",
      "iam:PutRolePolicy", "iam:GetRolePolicy", "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:ListAttachedRolePolicies", "iam:ListRolePolicies",
      "iam:CreateInstanceProfile", "iam:DeleteInstanceProfile", "iam:GetInstanceProfile",
      "iam:AddRoleToInstanceProfile", "iam:RemoveRoleFromInstanceProfile", "iam:TagInstanceProfile",
      "iam:PassRole",
      "ecr:CreateRepository", "ecr:DeleteRepository", "ecr:DescribeRepositories",
      "ecr:PutLifecyclePolicy", "ecr:GetLifecyclePolicy", "ecr:PutImageScanningConfiguration",
      "ecr:TagResource",
      "s3:CreateBucket", "s3:DeleteBucket", "s3:PutBucketPolicy", "s3:GetBucketPolicy",
      "s3:PutEncryptionConfiguration", "s3:GetEncryptionConfiguration",
      "s3:PutBucketVersioning", "s3:GetBucketVersioning",
      "s3:PutBucketPublicAccessBlock", "s3:GetBucketPublicAccessBlock",
      "s3:PutBucketOwnershipControls", "s3:GetBucketOwnershipControls",
      "s3:PutBucketTagging", "s3:GetBucketTagging",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_actions" {
  name   = "${var.project_name}-${var.environment}-github-actions"
  role   = aws_iam_role.github_actions.id
  policy = data.aws_iam_policy_document.github_actions.json
}

output "github_actions_role_arn" {
  description = "Role ARN for AWS_ROLE_ARN in GitHub Actions (secrets.AWS_ROLE_ARN)"
  value       = aws_iam_role.github_actions.arn
}

output "ecr_repository_url" {
  description = "ECR repository URL the backend-deploy workflow pushes to"
  value       = aws_ecr_repository.backend.repository_url
}
