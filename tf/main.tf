terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.16"
    }
  }
}

provider "aws" {
  region = "us-east-2"
}

resource "aws_instance" "piggy-ec2" {
  ami           = "ami-085f9c64a9b75eed5"
  instance_type = "t2.micro"

  tags = {
    "Name" : "piggy-ec2"
  }
}



