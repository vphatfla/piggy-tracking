# ========================================
# S3 OUTPUTS
# ========================================

output "s3_bucket_name" {
  description = "Name of the frontend S3 bucket"
  value       = aws_s3_bucket.frontend.id
}

output "s3_bucket_regional_domain_name" {
  description = "Regional domain name of the frontend S3 bucket — the origin domain_name oppy-marser's Terraform reads"
  value       = aws_s3_bucket.frontend.bucket_regional_domain_name
}

output "s3_upload_command" {
  description = "AWS CLI command to upload the frontend build to S3"
  value       = "aws s3 sync ./frontend/dist s3://${aws_s3_bucket.frontend.id} --delete"
}

# ========================================
# EC2 OUTPUTS
# ========================================

output "backend_instance_id" {
  description = "Instance id — used for SSM Session Manager access (aws ssm start-session --target <id>)"
  value       = aws_instance.backend.id
}

output "backend_eip_public_dns" {
  description = "Stable public DNS of the backend's Elastic IP — the origin domain_name oppy-marser's Terraform reads"
  value       = aws_eip.backend.public_dns
}

output "backend_eip_public_ip" {
  description = "Stable public IP of the backend"
  value       = aws_eip.backend.public_ip
}

output "data_volume_id" {
  description = "EBS volume id holding Postgres's data"
  value       = aws_ebs_volume.data.id
}
