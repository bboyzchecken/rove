terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }

  # Partial config on purpose — bucket/key/region/dynamodb_table come from
  # backend.hcl (gitignored, one per person/CI is fine, they all point at the
  # same bucket+key). See README.md "0. Bootstrap remote state" and
  # backend-bootstrap.sh.
  backend "s3" {}
}
