# Project Configuration
variable "project_name" {
  description = "Name of the project - used for resource naming"
  type        = string
  default     = "piggy-tracking"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
}

# AWS Configuration
variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

# Path this app is served under, off oppy-marser's existing distribution.
# No leading/trailing-slash normalization here — it's threaded verbatim into
# the CloudFront path pattern and the frontend's Vite `base`, so both edits
# must be kept in sync with this by hand.
variable "app_path" {
  description = "Path piggy-tracking is served under at vphatfla.me"
  type        = string
  default     = "/app/piggy-tracking"
}

# EC2 Configuration
variable "instance_type" {
  description = "EC2 instance type for the backend + Postgres host"
  type        = string
  # Graviton (ARM64): the backend Dockerfile (node:22-alpine) has no native
  # deps that would need x86, and this box is idle most of the time — t4g
  # is meaningfully cheaper than the t3 equivalent for that shape.
  default = "t4g.micro"
}

variable "data_volume_size_gb" {
  description = "Size (GiB) of the EBS volume Postgres's data lives on"
  type        = number
  default     = 20
}

# --- oppy-marser's remote state -------------------------------------------
# Read-only: this stack never writes to oppy-marser's state, only reads its
# outputs (the CloudFront distribution ARN, for the S3 bucket policy below).
# Defaults match oppy-marser/terraform/terraform.tf's own backend block.
variable "oppy_marser_state_bucket" {
  description = "S3 bucket holding oppy-marser's Terraform state"
  type        = string
  default     = "oppy-marser-terraform-state"
}

variable "oppy_marser_state_key" {
  description = "State file key within oppy_marser_state_bucket"
  type        = string
  default     = "static-website/terraform.tfstate"
}

variable "oppy_marser_state_region" {
  description = "Region oppy_marser_state_bucket lives in"
  type        = string
  default     = "us-east-1"
}

# Tags
variable "additional_tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
