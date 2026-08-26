# One JSON secret holding every configurable api env var except the DB
# password (RDS manages that one itself — see rds.tf
# `manage_master_user_password`) and the infra endpoints Terraform already
# knows (MYSQL_HOST, REDIS_HOST — set as plain env in ecs.tf). Not every key
# below is confidential (bucket names, OAuth client id) — they live here
# anyway so there is exactly one place to fill in real values after apply,
# the same "one file, everything reads it" shape as the root .env
# (README.md).
#
# Terraform only creates the secret with placeholder values. Fill in the real
# ones with `aws secretsmanager put-secret-value` (README step 6) or the
# console — the whole JSON blob at once, it is easiest to edit as one file
# and paste. `ignore_changes` keeps a later `terraform apply` from
# overwriting whatever you put there by hand.

resource "aws_secretsmanager_secret" "app" {
  name        = "${var.project}/app-secrets"
  description = "Configurable api env vars — see .env.example for what each key means."
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    JWT_SECRET_KEY             = "CHANGE_ME"
    ADMIN_EMAILS               = ""
    ANTHROPIC_API_KEY          = "CHANGE_ME"
    GOOGLE_MAPS_SERVER_KEY     = "CHANGE_ME"
    GOOGLE_OAUTH_CLIENT_ID     = "CHANGE_ME"
    GOOGLE_OAUTH_CLIENT_SECRET = "CHANGE_ME"
    LINE_LOGIN_CHANNEL_ID      = "CHANGE_ME"
    LINE_LOGIN_CHANNEL_SECRET  = "CHANGE_ME"
    LINE_MESSAGING_TOKEN       = "CHANGE_ME"
    FX_API_URL                 = ""
    FX_API_KEY                 = "CHANGE_ME"
    R2_ENDPOINT                = "CHANGE_ME"
    R2_REGION                  = "auto"
    R2_ACCESS_KEY              = "CHANGE_ME"
    R2_SECRET_KEY              = "CHANGE_ME"
    R2_EXPORT_BUCKET           = "rove-exports"
    R2_IMAGE_BUCKET            = "rove-images"
    R2_DOCUMENT_BUCKET         = "rove-documents"
    R2_PHOTO_BUCKET            = "rove-photos"
    AFFILIATE_AGODA_ID         = ""
    AFFILIATE_BOOKING_AID      = ""
    AFFILIATE_KLOOK_AID        = ""
    AFFILIATE_KKDAY_ID         = ""
    AFFILIATE_RENTALCARS_ID    = ""
    AFFILIATE_AIRALO_ID        = ""
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
