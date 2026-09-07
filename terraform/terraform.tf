terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket  = "piggy-tracking-terraform-state"
    key     = "infra/terraform.tfstate"
    region  = "us-east-1"
    encrypt = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = var.additional_tags
  }
}

# This app's whole reason for living at vphatfla.me/app/piggy-tracking/ is
# oppy-marser's existing CloudFront distribution (see main.tf's
# terraform_remote_state read) — that distribution, its ACM cert, and the
# domain's DNS are all owned by oppy-marser's own Terraform, not this one.
