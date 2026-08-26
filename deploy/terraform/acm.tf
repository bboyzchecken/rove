# DNS for rovetravel.site is NOT moved into Route53 — it stays wherever it is
# today (Cloudflare, per DEV_SPEC §2.3), so this only asks ACM for a
# certificate and waits for you to paste the validation CNAMEs into that
# existing DNS provider. See README step 3.

resource "aws_acm_certificate" "main" {
  domain_name       = var.domain_name
  validation_method = "DNS"
  subject_alternative_names = [
    "www.${var.domain_name}",
    "${var.api_subdomain}.${var.domain_name}",
  ]

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "main" {
  certificate_arn = aws_acm_certificate.main.arn

  timeouts {
    create = "45m"
  }
}
