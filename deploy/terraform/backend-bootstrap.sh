#!/usr/bin/env bash
# One-time only, run once per AWS account, BEFORE `terraform init`. Terraform
# can't create the bucket it stores its own state in — chicken and egg — so
# this is a plain aws-cli script, not Terraform. Safe to re-run: every step
# checks whether its resource already exists first.
set -euo pipefail

REGION="${1:-ap-southeast-1}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="rove-terraform-state-${ACCOUNT_ID}"
TABLE="rove-terraform-locks"

echo "==> account: $ACCOUNT_ID   region: $REGION"

if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
	echo "==> bucket $BUCKET already exists"
else
	echo "==> creating bucket $BUCKET"
	aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
		--create-bucket-configuration LocationConstraint="$REGION"
	aws s3api put-bucket-versioning --bucket "$BUCKET" \
		--versioning-configuration Status=Enabled
	aws s3api put-bucket-encryption --bucket "$BUCKET" \
		--server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
	aws s3api put-public-access-block --bucket "$BUCKET" \
		--public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
fi

if aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" >/dev/null 2>&1; then
	echo "==> lock table $TABLE already exists"
else
	echo "==> creating lock table $TABLE"
	aws dynamodb create-table \
		--table-name "$TABLE" \
		--attribute-definitions AttributeName=LockID,AttributeType=S \
		--key-schema AttributeName=LockID,KeyType=HASH \
		--billing-mode PAY_PER_REQUEST \
		--region "$REGION"
fi

cat <<EOF

==> done. Put this in deploy/terraform/backend.hcl (gitignored):

    bucket         = "$BUCKET"
    key            = "rove/production/terraform.tfstate"
    region         = "$REGION"
    dynamodb_table = "$TABLE"
    encrypt        = true

Then:  cd deploy/terraform && terraform init -backend-config=backend.hcl
EOF
