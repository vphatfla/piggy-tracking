# ========================================
# CROSS-STACK STATE (read-only)
# ========================================

data "aws_caller_identity" "current" {}

# oppy-marser owns vphatfla.me's CloudFront distribution, ACM cert, and DNS.
# This stack only reads its outputs — never writes to its state. See
# ~/workplace/oppy-marser/terraform/main.tf for the other half of this
# coupling (it reads *this* stack's outputs for the new origins it adds).
data "terraform_remote_state" "oppy_marser" {
  backend = "s3"
  config = {
    bucket = var.oppy_marser_state_bucket
    key    = var.oppy_marser_state_key
    region = var.oppy_marser_state_region
  }
}

# ========================================
# NETWORKING — default VPC, no new one
# ========================================
# One instance doesn't justify a dedicated VPC/subnets/routing; the default
# VPC every AWS account already has is enough.

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# ========================================
# S3 BUCKET FOR THE FRONTEND BUILD
# ========================================
# Named deterministically (account id, not a random suffix like
# oppy-marser's own bucket) so oppy-marser's Terraform can reference it via
# terraform_remote_state without an apply-order dance beyond "this stack
# goes first" — see the plan's cross-repo-coupling note.

resource "aws_s3_bucket" "frontend" {
  bucket = "${var.project_name}-${var.environment}-${data.aws_caller_identity.current.account_id}"

  tags = merge(var.additional_tags, {
    Name        = "${var.project_name}-${var.environment}-frontend-bucket"
    Type        = "StaticWebsiteStorage"
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    Purpose     = "StaticWebsite"
  })
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }

  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

# Only oppy-marser's distribution (via its OAC) may read this bucket — the
# ARN comes from its remote state, not a hardcoded value, so this stays
# correct if that distribution is ever recreated.
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipalReadOnly"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = data.terraform_remote_state.oppy_marser.outputs.cloudfront_distribution_arn
          }
        }
      }
    ]
  })

  depends_on = [aws_s3_bucket_ownership_controls.frontend]
}

# ========================================
# EC2 — backend + Postgres host
# ========================================

data "aws_ami" "al2023_arm64" {
  most_recent = true
  owners      = ["amazon"]

  # "al2023-ami-*-arm64" is too broad - it also matches the ECS-optimized
  # variant ("al2023-ami-ecs-hvm-*-arm64"), and most_recent picked that one
  # over the plain AMI. Confirmed live: the running instance's AMI was
  # "al2023-ami-ecs-hvm-...-arm64", which ships amazon-ecs-init and
  # auto-starts an ecs-agent container this box never wanted - pure waste on
  # a 512MB instance, found while chasing an unrelated outage. Anchoring on
  # "2023." (the plain AMI's version prefix) excludes both that and the
  # "-minimal-" variant. Kernel pinned to 6.1 too - AWS publishes 6.1/6.12/
  # 6.18 kernel variants with identical timestamps, and most_recent doesn't
  # deterministically break that tie.
  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-kernel-6.1-arm64"]
  }
  filter {
    name   = "architecture"
    values = ["arm64"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# CloudFront's own published IP ranges — restricting inbound to this list
# means the API port is reachable only through CloudFront, never directly.
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_security_group" "backend" {
  name = "${var.project_name}-${var.environment}-backend-sg"
  # EC2's GroupDescription field is ASCII-only (rejects the em dash the rest
  # of this repo's comments use freely) - confirmed the hard way, apply failed.
  description = "Backend API - inbound only from CloudFront, no SSH"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "API, from CloudFront only"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.additional_tags, {
    Name        = "${var.project_name}-${var.environment}-backend-sg"
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

# SSM Session Manager only — no key pair, no port 22 open anywhere. AL2023
# ships the SSM agent already, so this needs no extra bootstrapping.
data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backend" {
  name               = "${var.project_name}-${var.environment}-backend-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json

  tags = merge(var.additional_tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.backend.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "backend" {
  name = "${var.project_name}-${var.environment}-backend-profile"
  role = aws_iam_role.backend.name
}

resource "aws_instance" "backend" {
  ami                    = data.aws_ami.al2023_arm64.id
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.backend.id]
  iam_instance_profile   = aws_iam_instance_profile.backend.name

  # Deliberately stops at "docker is running, the data volume is mounted" —
  # no repo clone, no `docker compose up`. See terraform/README.md.
  user_data = templatefile("${path.module}/user_data.sh", {
    device = "/dev/xvdf"
  })

  root_block_device {
    volume_type = "gp3"
    # AL2023's own AMI snapshot requires >=30GB - confirmed the hard way,
    # apply rejected 8GB as smaller than the snapshot it's built from.
    volume_size = 30
    encrypted   = true
  }

  tags = merge(var.additional_tags, {
    Name        = "${var.project_name}-${var.environment}-backend"
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

# Dedicated, durable volume for Postgres's data — see ../docker-compose.prod.yml,
# which is what actually points the db container's volume here.
resource "aws_ebs_volume" "data" {
  availability_zone = aws_instance.backend.availability_zone
  size              = var.data_volume_size_gb
  type              = "gp3"
  encrypted         = true

  tags = merge(var.additional_tags, {
    Name        = "${var.project_name}-${var.environment}-postgres-data"
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    Purpose     = "PostgresData"
  })
}

resource "aws_volume_attachment" "data" {
  device_name = "/dev/xvdf"
  volume_id   = aws_ebs_volume.data.id
  instance_id = aws_instance.backend.id
}

# Stable address across stops/restarts — a raw IP isn't a valid CloudFront
# custom-origin domain_name, and there's no Route53 zone for this domain to
# put a real DNS record in, so the EIP's own AWS-assigned public DNS
# (ec2-<ip>.compute-1.amazonaws.com) is what oppy-marser's new origin uses.
resource "aws_eip" "backend" {
  instance = aws_instance.backend.id
  domain   = "vpc"

  tags = merge(var.additional_tags, {
    Name        = "${var.project_name}-${var.environment}-backend-eip"
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}
