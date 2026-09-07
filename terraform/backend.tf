# ========================================
# TERRAFORM STATE BACKEND INFRASTRUCTURE
# ========================================
# Creates the S3 bucket this stack's own remote state lives in. Same
# chicken-and-egg as oppy-marser's own backend.tf: deploy this file first
# with local state, then migrate to the "s3" backend declared in
# terraform.tf. No DynamoDB lock table, for the same reason oppy-marser's
# skips one — a single CI/CD process is the only writer.
#
# Bootstrap (once):
#   terraform init                                   # local state
#   terraform apply -target=aws_s3_bucket.terraform_state \
#                    -target=aws_s3_bucket_versioning.terraform_state \
#                    -target=aws_s3_bucket_server_side_encryption_configuration.terraform_state \
#                    -target=aws_s3_bucket_public_access_block.terraform_state
#   terraform init -migrate-state                     # switches to the s3 backend above

resource "aws_s3_bucket" "terraform_state" {
  bucket = "piggy-tracking-terraform-state"

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name        = "Terraform State Bucket"
    Purpose     = "TerraformState"
    Project     = "piggy-tracking"
    Environment = "shared"
    ManagedBy   = "Terraform"
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "terraform_state_bucket" {
  description = "Name of the S3 bucket for Terraform state"
  value       = aws_s3_bucket.terraform_state.id
}
