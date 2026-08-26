# Deploy rove ขึ้น AWS — ขั้นตอนเต็ม

Topology: **ECS Fargate + ALB + autoscaling + RDS + ElastiCache** ตั้งแต่วันแรก
ไม่ผ่าน Lightsail — เหตุผลและ trade-off ทุกข้ออยู่ใน
[ADR 0004](../docs/adr/0004-aws-ecs-instead-of-lightsail.md) อ่านก่อนเริ่ม

```
                    rovetravel.site ─┐
                www.rovetravel.site ─┼─→ ALB :443 ─┬─→ web target group → ECS web (1–10 tasks)
                api.rovetravel.site ─┘             └─→ api target group → ECS api (1–10 tasks)
                                                                              │
                                          private subnets ────────────────────┤
                                                                              ├─→ RDS MySQL 8
                                                                              ├─→ ElastiCache Redis
                                                                              └─→ NAT instance → Anthropic / Google / LINE
```

**เวลาที่ใช้จริง:** ~2–3 ชม. ถ้าไม่ติดอะไร โดยมี 2 จุดที่ต้องรอ AWS
— ACM validation (5–30 นาที) และ RDS create (~10 นาที)

**ค่าใช้จ่ายตั้งต้น:** ~$50–70/เดือน ตอนยังไม่มีคนใช้ (ส่วนใหญ่คือ ALB + RDS
ที่คิดขั้นต่ำแม้ traffic เป็นศูนย์) ไม่รวม Anthropic API / Google Maps API

---

## สิ่งที่ต้องมีก่อน

| | ตรวจยังไง |
|---|---|
| AWS account ที่เปิด billing แล้ว | ล็อกอิน console ได้ |
| AWS CLI v2 | `aws --version` |
| Terraform ≥ 1.7 | `terraform -version` |
| Docker (สำหรับ build image รอบแรก) | `docker version` |
| โดเมน `rovetravel.site` | ซื้อแล้ว ✅ |
| สิทธิ์แก้ DNS ของโดเมนนั้น | เข้าหน้า DNS ของ registrar ได้ |

เครื่องนี้ยังไม่มี `terraform` กับ `aws` — ติดตั้งก่อน:

```bash
winget install Hashicorp.Terraform Amazon.AWSCLI
```

จากนั้นตั้งค่า credential (ใช้ IAM user ที่มีสิทธิ์ AdministratorAccess
สำหรับการ provision รอบแรก — ผู้ใช้ที่ deploy ประจำวันไม่ต้องใช้สิทธิ์นี้
เพราะ CI ใช้ role แยกที่แคบกว่ามาก):

```bash
aws configure
```

> `aws configure` จะถาม Access Key / Secret Key — **สร้างและกรอกเอง** ผมไม่กรอก
> credential ให้ ค่าที่กรอกจะไปอยู่ใน `~/.aws/credentials` ซึ่งไม่ได้อยู่ใน repo

ตรวจว่าใช้ได้และดูว่าเป็น account ไหน:

```bash
aws sts get-caller-identity
```

---

## เรื่อง DNS — ตัดสินใจก่อนเริ่ม

ALB **ไม่มี IP คงที่** มีแต่ชื่อ DNS ที่เปลี่ยนได้ แปลว่า apex domain
(`rovetravel.site` เฉย ๆ ไม่มี subdomain) ชี้ตรงด้วย A record ไม่ได้ ต้องใช้
ALIAS หรือ CNAME flattening อย่างใดอย่างหนึ่ง

| ทางเลือก | apex ทำงานไหม | หมายเหตุ |
|---|---|---|
| **Cloudflare DNS (แนะนำ)** | ได้ — CNAME flattening | ฟรี, ตรงกับ DEV_SPEC §2.3, ได้ CDN/DDoS ด้วย |
| Route 53 | ได้ — ALIAS record | ~$0.50/เดือนต่อ hosted zone, integrate กับ AWS ดีสุด |
| DNS ของ registrar เดิม | **มักไม่ได้** | ถ้าไม่มี ALIAS/flattening จะชี้ apex ไม่ได้ ต้องย้าย |

เอกสารนี้เขียนบนสมมติฐาน **Cloudflare** ถ้าใช้ Route 53 ขั้นตอนเหมือนกันหมด
ต่างแค่ตอนเพิ่ม record ให้ใช้ ALIAS แทน CNAME

ถ้าจะย้ายมา Cloudflare: สมัคร → Add site `rovetravel.site` → Cloudflare จะให้
nameserver 2 ตัว → เอาไปใส่ที่ registrar ที่ซื้อโดเมนมา → รอ propagate
(ปกติ < 1 ชม.) ทำขั้นนี้ให้เสร็จก่อนไปต่อ เพราะขั้น 3 ต้องแก้ DNS

---

## 1. Bootstrap remote state (ทำครั้งเดียวตลอดชีวิตโปรเจ็ค)

Terraform เก็บ state ว่าสร้างอะไรไปแล้วบ้าง ถ้าเก็บไว้ในเครื่องอย่างเดียว
ไฟล์หายเมื่อไหร่ = Terraform ลืมทุกอย่างที่สร้างไว้ ต้องเก็บบน S3
แต่ Terraform สร้าง bucket ที่ตัวเองจะใช้เก็บ state ไม่ได้ (ไก่กับไข่)
เลยต้องใช้ script แยก:

```bash
cd deploy/terraform && ./backend-bootstrap.sh ap-southeast-1
```

Script จะสร้าง S3 bucket (เปิด versioning + encryption + block public access)
กับ DynamoDB table สำหรับ lock แล้วพิมพ์ค่าที่ต้องเอาไปใส่ `backend.hcl` ออกมา
รันซ้ำได้ปลอดภัย — ทุกขั้นเช็คก่อนว่ามีอยู่แล้วหรือยัง

```bash
cd deploy/terraform
cp backend.hcl.example backend.hcl          # แก้ bucket ตามที่ script พิมพ์
cp terraform.tfvars.example terraform.tfvars
terraform init -backend-config=backend.hcl
```

> `backend.hcl` กับ `terraform.tfvars` อยู่ใน `.gitignore` แล้ว
> ไม่มี secret อยู่ในนั้น แต่เป็นค่าเฉพาะเครื่อง/เฉพาะ account

**ทำไม `ap-southeast-1`:** สิงคโปร์ ใกล้ไทยที่สุดในบรรดา region ที่ AWS มี
latency จาก กทม. ~25–35ms เทียบกับ ~200ms ถ้าไปใช้ us-east-1

---

## 2. สร้าง ECR แล้ว push image รอบแรก

ECS จะไม่ยอมสร้าง service ถ้าดึง image ไม่ได้ เลยต้องมี image อยู่ก่อน
ซึ่งต้องมี ECR ก่อน — apply เฉพาะ 2 resource นี้:

```bash
terraform apply -target=aws_ecr_repository.api -target=aws_ecr_repository.web
```

login แล้ว build/push (คำสั่งนี้รันจาก root ของ repo):

```bash
aws ecr get-login-password --region ap-southeast-1 | docker login --username AWS --password-stdin "$(aws sts get-caller-identity --query Account --output text).dkr.ecr.ap-southeast-1.amazonaws.com"
```

```bash
REG="$(aws sts get-caller-identity --query Account --output text).dkr.ecr.ap-southeast-1.amazonaws.com" && docker build --target prod -t "$REG/rove-api:latest" apps/api && docker push "$REG/rove-api:latest"
```

web ต้องส่ง `NEXT_PUBLIC_*` ตอน build เพราะ Next.js ฝังค่าพวกนี้ลง bundle
ตั้งแต่ build time — ใส่ผิดตอนนี้ = ต้อง build ใหม่ ไม่ใช่แค่ restart:

```bash
REG="$(aws sts get-caller-identity --query Account --output text).dkr.ecr.ap-southeast-1.amazonaws.com" && docker build --target prod --build-arg NEXT_PUBLIC_API_URL=https://api.rovetravel.site --build-arg NEXT_PUBLIC_APP_URL=https://rovetravel.site --build-arg NEXT_PUBLIC_BRAND_NAME=ROVE -t "$REG/rove-web:latest" apps/web && docker push "$REG/rove-web:latest"
```

> Docker บนเครื่อง Windows/Mac ที่เป็น Apple Silicon จะ build เป็น arm64 แต่
> task definition ตั้งไว้เป็น x86_64 (ค่า default) ถ้า push จากเครื่อง arm
> ให้เติม `--platform linux/amd64` ทั้งสองคำสั่ง ไม่งั้น task จะขึ้นแล้วตาย
> ทันทีโดยไม่มี log ที่อ่านรู้เรื่อง GitHub Actions runner เป็น x86_64 อยู่แล้ว
> จึงไม่มีปัญหานี้

---

## 3. ขอ TLS certificate แล้ว validate ผ่าน DNS

```bash
terraform apply -target=aws_acm_certificate.main
terraform output acm_validation_records
```

จะได้ CNAME ออกมา 1–3 record หน้าตาแบบ `_x1y2z3.rovetravel.site` →
`_a4b5c6.xxxx.acm-validations.aws` เอาไปใส่ที่ Cloudflare ทุกอัน

**สำคัญ: record พวกนี้ต้องเป็น DNS only (เมฆสีเทา) ห้าม proxied (เมฆสีส้ม)**
ถ้า proxy ไว้ Cloudflare จะตอบค่าของตัวเองแทนค่าที่ ACM ต้องการเห็น
แล้ว validation จะค้างจนหมดเวลา

ACM จะเปลี่ยนเป็น `ISSUED` ภายใน 5–30 นาที เช็คได้ที่:

```bash
aws acm list-certificates --region ap-southeast-1 --query "CertificateSummaryList[?DomainName=='rovetravel.site']"
```

---

## 4. สร้างของที่เหลือทั้งหมด

```bash
terraform plan -out=tfplan
```

อ่าน plan ก่อน apply — ควรเห็นประมาณ 60 resource และไม่มีบรรทัด `destroy`
ถ้าเห็น destroy ทั้งที่เป็นการ apply รอบแรก แปลว่ามีอะไรผิด หยุดก่อน

```bash
terraform apply tfplan
```

ขั้นนี้ใช้เวลา ~15 นาที ส่วนใหญ่รอ RDS สร้างเสร็จ
`aws_acm_certificate_validation` จะรอจนกว่า cert จะ ISSUED (timeout 45 นาที)
ถ้าค้างตรงนี้แปลว่า CNAME ในขั้น 3 ยังไม่ถูก

เสร็จแล้วเก็บ output ไว้ใช้ต่อ:

```bash
terraform output
```

---

## 5. ชี้โดเมนมาที่ ALB

```bash
terraform output alb_dns_name
```

ที่ Cloudflare เพิ่ม 3 record ทั้งหมดชี้ไปที่ค่าที่ได้:

| type | name | value | proxy |
|---|---|---|---|
| CNAME | `@` | `rove-alb-xxxx.ap-southeast-1.elb.amazonaws.com` | ได้ทั้งสองแบบ |
| CNAME | `www` | เหมือนกัน | ได้ทั้งสองแบบ |
| CNAME | `api` | เหมือนกัน | **DNS only แนะนำ** |

`api` ควรเป็น DNS only เพราะ SSE (การอัปเดตสดในห้องทริป) วิ่งผ่าน Cloudflare
proxy แล้วมีโอกาสโดน buffer/timeout — ALB ตั้ง `idle_timeout = 120` ไว้แล้ว
และ API ส่ง heartbeat ทุก 20 วินาที ซึ่งพอดีกันอยู่ อย่าเพิ่มตัวกลางอีกชั้น

ถ้าเปิด proxy ที่ apex/www ให้ตั้ง SSL/TLS mode เป็น **Full (strict)**
โหมด Flexible จะทำให้เกิด redirect loop เพราะ ALB บังคับ redirect 80→443 อยู่

---

## 6. ใส่ค่า secret จริง

Terraform สร้าง secret ไว้ให้แล้วแต่ใส่ค่า `CHANGE_ME` ไว้ทุกช่อง
(ตั้งใจ — ไม่มี credential จริงอยู่ใน git หรือใน tfstate)

MySQL password **ไม่ต้องใส่เอง** RDS สร้างและหมุนเวียนให้เอง อ่านได้ที่:

```bash
aws secretsmanager get-secret-value --secret-id "$(terraform output -raw rds_master_secret_arn)" --query SecretString --output text
```

ที่เหลือ ใส่ทีเดียวทั้งก้อน — ดึงของเดิมมาแก้แล้วใส่กลับ:

```bash
aws secretsmanager get-secret-value --secret-id rove/app-secrets --query SecretString --output text > /tmp/rove-secrets.json
```

แก้ `/tmp/rove-secrets.json` ให้ครบ (`.env.example` อธิบายว่าแต่ละตัวคืออะไร)
อย่างน้อยที่สุดต้องมี `JWT_SECRET_KEY` กับ `ANTHROPIC_API_KEY`
สร้าง JWT secret ด้วย `openssl rand -hex 32` แล้วใส่กลับ:

```bash
aws secretsmanager put-secret-value --secret-id rove/app-secrets --secret-string file:///tmp/rove-secrets.json && rm /tmp/rove-secrets.json
```

> ลบไฟล์ทิ้งด้วย — มันคือ credential ทั้งชุดของระบบในไฟล์เดียว

secret ที่แก้แล้วจะยังไม่ถึง container ที่รันอยู่ ต้อง redeploy (ขั้น 8)

**OAuth callback:** ตอนตั้ง Google/LINE app ให้ใส่ redirect URI ตาม
`APP_BASE_URL` คือ `https://api.rovetravel.site/...` (ไม่ใช่โดเมนหลัก)
เพราะ callback วิ่งเข้า API ไม่ใช่เข้า web

---

## 7. ต่อ CI ให้ deploy เองได้

```bash
terraform output github_actions_deploy_role_arn
```

ที่ GitHub → repo settings → Secrets and variables → Actions:

**Secrets** (แท็บ Secrets):

| ชื่อ | ค่า |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | ค่าจาก output ข้างบน |

**Variables** (แท็บ Variables — พวกนี้ไปฝังใน bundle ของ web ตอน build
ไม่ใช่ความลับ):

| ชื่อ | ค่า |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.rovetravel.site` |
| `NEXT_PUBLIC_APP_URL` | `https://rovetravel.site` |
| `NEXT_PUBLIC_BRAND_NAME` | `ROVE` |
| `NEXT_PUBLIC_POSTHOG_KEY` | จาก PostHog (เว้นว่างได้) |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | จาก Google Cloud (เว้นว่างได้) |

ไม่มี AWS access key ที่ไหนเลย — `.github/workflows/release.yml` ใช้ OIDC
แลก token ชั่วคราวกับ role ที่ trust เฉพาะ repo นี้

---

## 8. Deploy จริงครั้งแรก

```bash
git tag v0.1.0 && git push origin v0.1.0
```

workflow จะ build ทั้ง api และ web push ขึ้น ECR แล้ว update ECS service
ทีละตัว (api ก่อน) พร้อมรอจน service stable

ดูสถานะ:

```bash
gh run watch
```

### เข้าใจว่าใครเป็นเจ้าของอะไร

นี่เป็นจุดที่พลาดกันบ่อย:

| แก้อะไร | ทำยังไงให้มีผลจริง |
|---|---|
| โค้ด | push tag → CI ทำให้หมด |
| ค่าใน Secrets Manager | ใส่ค่าแล้ว **force redeploy** (ข้างล่าง) |
| env var ใน `ecs.tf` | `terraform apply` แล้ว **force redeploy** |
| ขนาด/จำนวน task, RDS, network | `terraform apply` พอ มีผลทันที |

`aws_ecs_service` ตั้ง `ignore_changes = [task_definition, desired_count]`
ไว้ เพื่อไม่ให้ Terraform ไปทับสิ่งที่ CI และ autoscaler ทำ ผลข้างเคียงคือ
task definition ที่ Terraform สร้างใหม่จะไม่ถูกนำไปใช้เอง ต้องสั่ง:

```bash
aws ecs update-service --cluster rove-cluster --service rove-api --task-definition rove-api --force-new-deployment
```

---

## 9. Seed ข้อมูล POI และเรื่อง migration

Migration รันเองทุกครั้งที่ container boot (`migrateOnBoot` ใน `main.go`)
ไม่ต้องสั่งอะไร แต่ **มีข้อควรรู้:**

> ⚠️ ตอนนี้ทุก task รัน migration ตอน boot ซึ่งปลอดภัยตอนมี container เดียว
> พอ autoscale แล้ว หลาย task อาจ boot พร้อมกันและแย่งกันรัน migration เดียวกัน
> Phase 1 ยังไม่เจอปัญหาเพราะเป็น `AutoMigrate` แบบเพิ่มอย่างเดียว แต่ถ้าวันไหน
> เขียน migration ที่ย้ายข้อมูล ให้ scale ลงเหลือ 1 task ก่อน deploy:
> ```bash
> aws ecs update-service --cluster rove-cluster --service rove-api --desired-count 1
> ```
> ทางแก้ถาวรคือใส่ MySQL advisory lock (`SELECT GET_LOCK(...)`) ครอบ
> `core.Migrate` — ยังไม่ได้ทำ บันทึกไว้ใน ADR 0004

Seed POI (`data/poi/jp.csv`) รันเป็น one-off task:

```bash
aws ecs run-task --cluster rove-cluster --task-definition rove-api --launch-type FARGATE --network-configuration "awsvpcConfiguration={subnets=[$(terraform -chdir=deploy/terraform output -json private_subnet_ids | tr -d '[]\" ')],securityGroups=[$(terraform -chdir=deploy/terraform output -raw api_security_group_id)],assignPublicIp=DISABLED}" --overrides '{"containerOverrides":[{"name":"api","command":["seed"]}]}'
```

ถ้าต้องเข้าไปดูอะไรในเครื่องจริง (RDS อยู่ใน private subnet ไม่มี bastion):

```bash
aws ecs execute-command --cluster rove-cluster --task <task-id> --container api --interactive --command "/bin/sh"
```

หา `<task-id>` ด้วย `aws ecs list-tasks --cluster rove-cluster --service-name rove-api`
(ต้องติดตั้ง Session Manager plugin ของ AWS CLI ก่อน)

---

## 10. ตรวจว่าใช้งานได้จริง

```bash
curl -sS https://api.rovetravel.site/healthz && curl -sS https://api.rovetravel.site/readyz
```

`/readyz` ต้องได้ `"ready":true` — ถ้าไม่ แปลว่าต่อ MySQL หรือ Redis ไม่ได้

```bash
curl -sSI https://rovetravel.site
```

ควรได้ `200` และ `http://rovetravel.site` ควร redirect 301 ไป https
ส่วน `https://www.rovetravel.site` ควร redirect 301 ไป apex

ดู log:

```bash
aws logs tail /ecs/rove-api --follow
```

---

## 11. ยืนยันว่า autoscale ทำงาน

อย่ารอให้ traffic จริงมาเป็นบทพิสูจน์ ทดสอบเลย

ดูสถานะปัจจุบัน:

```bash
aws ecs describe-services --cluster rove-cluster --services rove-api --query "services[0].{desired:desiredCount,running:runningCount}"
```

ยิงโหลดใส่ (ใช้ `hey` หรือ `k6` ก็ได้ — ตัวอย่างนี้ใช้ hey ยิง 5 นาที):

```bash
hey -z 5m -c 100 https://api.rovetravel.site/healthz
```

policy ตั้งไว้ที่ 500 req/target/นาที และ CPU 65% อันไหนถึงก่อนก็ scale
scale-out cooldown 60 วินาที เพราะฉะนั้นภายใน ~2–3 นาทีควรเห็น
`desiredCount` ขยับขึ้น แล้วหลังหยุดยิงประมาณ 5 นาที (scale-in cooldown 300s)
จะค่อย ๆ ลดกลับมาที่ 1

ดูประวัติการ scale:

```bash
aws application-autoscaling describe-scaling-activities --service-namespace ecs --resource-id service/rove-cluster/rove-api
```

**ค่าที่ตั้งไว้ 1–10 task** ถ้ารู้ล่วงหน้าว่าจะมี traffic เข้า (อินฟลูฯ จะโพสต์)
ให้ยก min ขึ้นก่อนล่วงหน้า — autoscale ตอบสนองภายในไม่กี่นาที แต่ถ้าโหลดมาเป็น
ก้อนเดียวใน 30 วินาที มันจะตามไม่ทัน:

```bash
aws application-autoscaling register-scalable-target --service-namespace ecs --resource-id service/rove-cluster/rove-api --scalable-dimension ecs:service:DesiredCount --min-capacity 3 --max-capacity 20
```

(อย่าลืมลดกลับ หรือแก้ `api_min_count` / `api_max_count` ใน tfvars ให้ตรงกัน
ไม่งั้น `terraform apply` ครั้งหน้าจะดึงกลับ)

---

## 12. Rollback

ทุก revision ของ task definition ยังอยู่ ย้อนกลับได้ทันที:

```bash
aws ecs describe-services --cluster rove-cluster --services rove-api --query "services[0].taskDefinition"
```

```bash
aws ecs update-service --cluster rove-cluster --service rove-api --task-definition rove-api:<revision ก่อนหน้า>
```

DB rollback เป็นคนละเรื่องและยากกว่ามาก — RDS มี automated backup 7 วัน
กับ point-in-time recovery แต่การ restore สร้าง instance **ใหม่** เสมอ
แล้วต้องแก้ `MYSQL_HOST` ตาม ไม่ใช่การกดปุ่มเดียวจบ

---

## 13. Backup / DR

| สิ่งที่ป้องกัน | มีอะไรอยู่ | ต้องทำเพิ่ม |
|---|---|---|
| DB พัง / ลบผิด | RDS automated backup 7 วัน + PITR | ทดสอบ restore จริงเดือนละครั้ง |
| ลบ RDS ทั้งตัว | `deletion_protection = true` + final snapshot | — |
| Terraform state หาย | S3 versioning | — |
| Region ล่ม | ❌ ไม่มี | ยอมรับความเสี่ยงในระดับนี้ |
| Redis หาย | ❌ ไม่มี (ตั้งใจ) | ไม่ต้อง — เป็น cache ล้วน สร้างใหม่จาก MySQL ได้ |

`deploy/backup.sh` เดิมที่ dump ขึ้น R2 **ไม่จำเป็นแล้ว** RDS ทำให้เอง

---

## 14. ค่าใช้จ่าย — ดูตรงไหน ลดยังไง

ประมาณการตอนไม่มี traffic (ap-southeast-1):

| รายการ | ~USD/เดือน |
|---|---|
| ALB (ขั้นต่ำ + LCU) | 18–22 |
| RDS db.t4g.micro + storage 20GB gp3 | 15–18 |
| ElastiCache cache.t4g.micro | 12–14 |
| Fargate 2 task ขนาดเล็กสุด | 8–12 |
| NAT instance t4g.nano + EIP | 3–4 |
| ECR / CloudWatch / Secrets Manager | 2–4 |
| **รวม** | **~58–74** |

AWS Budgets ตั้งไว้ที่ `monthly_budget_usd` (default 70) จะเตือนทางอีเมล
เมื่อใช้จริงเกิน 80% และเมื่อ**คาดการณ์**ว่าจะเกิน 100% — ตัวหลังมีประโยชน์กว่า
เพราะเตือนล่วงหน้าหลายวัน

> ⚠️ AWS Budgets เตือนได้อย่างเดียว **หยุดค่าใช้จ่ายเองไม่ได้** ถ้าโดนยิงถล่ม
> ค่า Fargate + ALB จะขึ้นตามจริง ตัวจำกัดที่แท้จริงคือ `api_max_count` = 10
> และ `AI_DAILY_COST_CAP_USD` = 5 ที่จำกัดฝั่ง Anthropic

ถ้าอยากลดอีกจริง ๆ ในช่วงที่ยังไม่มีคนใช้: ย้าย web ไป Vercel Hobby (ฟรี)
แล้วเหลือ ALB ให้ api อย่างเดียว — แต่ต้องแก้ Terraform พอสมควร ยังไม่ได้ทำ

### ตอนโตขึ้นแล้วอยากได้ความทนทานเพิ่ม

แต่ละข้อคือแก้ตัวแปรตัวเดียวแล้ว `terraform apply` ไม่ต้องรื้อ:

| อยากได้ | แก้ที่ | เพิ่มประมาณ |
|---|---|---|
| DB failover อัตโนมัติ | `db_multi_az = true` | +$15–18/เดือน |
| DB แรงขึ้น | `db_instance_class = "db.t4g.small"` | +$15/เดือน |
| ไม่โดน Spot ดึงคืน | ลบ block `FARGATE_SPOT` ใน `ecs.tf` | +30–40% ของค่า Fargate |
| outbound ไม่มี SPOF | เปลี่ยน `nat.tf` เป็น NAT Gateway | +$30/เดือน |
| Redis มี replica | เปลี่ยนเป็น `aws_elasticache_replication_group` | +$12/เดือน |

---

## 15. ปัญหาที่เจอบ่อย

**Task ขึ้นแล้วตายวนไป** — `aws logs tail /ecs/rove-api --follow` ดูก่อน
ถ้าไม่มี log เลยแปลว่าตายก่อนถึงโค้ด มักเป็น image ผิด architecture (ขั้น 2)
หรือ execution role อ่าน secret ไม่ได้ — ดูที่ `stoppedReason`:

```bash
aws ecs describe-tasks --cluster rove-cluster --tasks $(aws ecs list-tasks --cluster rove-cluster --service-name rove-api --desired-status STOPPED --query 'taskArns[0]' --output text) --query "tasks[0].{reason:stoppedReason,containers:containers[].reason}"
```

**ALB ตอบ 503** — ไม่มี target ที่ healthy: task ยังไม่ขึ้น หรือ health check
ไม่ผ่าน เช็ค:

```bash
aws elbv2 describe-target-health --target-group-arn $(aws elbv2 describe-target-groups --names rove-api --query 'TargetGroups[0].TargetGroupArn' --output text)
```

**`/readyz` ตอบ ready:false** — ต่อ MySQL/Redis ไม่ได้ 90% เป็น security group
หรือ `MYSQL_PASSWORD` ไม่ได้ถูกส่งเข้า task (ดูว่า secret ใน task definition
ชี้ไปที่ `...:password::` ของ RDS secret จริง ๆ)

**ACM ค้างที่ PENDING_VALIDATION** — CNAME ผิด หรือถูก Cloudflare proxy
(ต้องเป็นเมฆเทา)

**`terraform apply` บอกว่า OIDC provider มีอยู่แล้ว** — account นี้เคยมี
GitHub OIDC provider จากโปรเจ็คอื่น ตั้ง `create_github_oidc_provider = false`
แล้วใส่ ARN เดิมใน `github_oidc_provider_arn`

**เว็บโหลดได้แต่เรียก API ไม่ได้** — `NEXT_PUBLIC_API_URL` ฝังตอน build
ถ้าตอน build ใส่ผิด restart ไม่ช่วย ต้อง build ใหม่ (แก้ GitHub Variables
แล้ว push tag ใหม่)

---

## 16. ล้างทิ้งทั้งหมด

```bash
terraform destroy
```

จะติดที่ RDS เพราะ `deletion_protection = true` (ตั้งใจ) ถ้าจะลบจริง ๆ
ตั้ง `db_deletion_protection = false` ใน tfvars → `terraform apply` → ค่อย
`terraform destroy` — จะได้ final snapshot ชื่อ `rove-mysql-final-snapshot`
ติดมือไว้

S3 bucket ของ state กับ DynamoDB table ที่ `backend-bootstrap.sh` สร้าง
ไม่ได้อยู่ใน Terraform ต้องลบเองถ้าต้องการ
