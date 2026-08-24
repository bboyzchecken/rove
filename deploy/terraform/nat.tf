# Self-managed NAT instance instead of a NAT Gateway (~$3/mo vs ~$32/mo) — the
# cost-optimized-tier trade-off from ADR 0004. It is a single point of failure
# for OUTBOUND internet only (the api task calling Anthropic/Google/LINE);
# inbound traffic through the ALB and everything already inside the VPC keeps
# working if this box is down. Swap this file for a real NAT Gateway later if
# that outbound path needs to be HA too — nothing else in the stack changes.

data "aws_ami" "al2023_arm64" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-arm64"]
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

resource "aws_instance" "nat" {
  ami                         = data.aws_ami.al2023_arm64.id
  instance_type               = var.nat_instance_type
  subnet_id                   = aws_subnet.public[0].id
  vpc_security_group_ids      = [aws_security_group.nat.id]
  source_dest_check           = false
  associate_public_ip_address = true

  user_data = <<-EOF
    #!/bin/bash
    set -euxo pipefail
    sysctl -w net.ipv4.ip_forward=1
    echo "net.ipv4.ip_forward = 1" > /etc/sysctl.d/99-nat.conf
    IFACE=$(ip -o -4 route show to default | awk '{print $5}')
    iptables -t nat -A POSTROUTING -o "$IFACE" -j MASQUERADE
    mkdir -p /etc/iptables
    iptables-save > /etc/iptables/rules.v4
    cat > /etc/systemd/system/iptables-restore.service <<'UNIT'
    [Unit]
    Description=Restore iptables NAT rule on boot
    Before=network-pre.target
    Wants=network-pre.target

    [Service]
    Type=oneshot
    ExecStart=/sbin/iptables-restore /etc/iptables/rules.v4
    RemainAfterExit=yes

    [Install]
    WantedBy=multi-user.target
    UNIT
    systemctl enable iptables-restore.service
  EOF

  tags = { Name = "${var.project}-nat" }
}

resource "aws_eip" "nat" {
  domain   = "vpc"
  instance = aws_instance.nat.id
  tags     = { Name = "${var.project}-nat-eip" }
}
