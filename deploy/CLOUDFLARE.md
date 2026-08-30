# Deploy front end ขึ้น Cloudflare — ระหว่างรอ AWS

เอกสารนี้ทำให้ **หน้าเว็บขึ้นได้โดยไม่ต้องมี AWS account** ทั้ง backend, database
และ AI ยังไม่ต้องมี เพราะสิ่งที่ deploy คือหน้า holding page กับตัวแอปในโหมด mock

ไม่ได้มาแทน [AWS_DEPLOY.md](AWS_DEPLOY.md) — อันนั้นยังเป็นปลายทางของ production
อันนี้คือของที่ขึ้นได้วันนี้

```
                    rovetravel.site ─┐
                www.rovetravel.site ─┴─→ Cloudflare Pages ─→ branch `site`   (static, ไม่มี build)

                demo.rovetravel.site ───→ Cloudflare Workers ─→ branch `uat`   (Next 16 + OpenNext)
                                                                apps/web
                                                                DATA_MODE = mock
```

**สองตัวนี้แยกขาดจากกันโดยตั้งใจ** หน้าแรกไม่ต้อง build ไม่ต้องพึ่ง adapter ไม่มี
dependency สักตัว — แปลว่าต่อให้ build ของแอปพังยับ หน้าแรกก็ยังขึ้นอยู่

### เรื่อง branch — ทำไมหน้าแรกถึงเป็น orphan branch

`site` เป็น **orphan branch** ไม่มีบรรพบุรุษร่วมกับ `main` เลย ข้างในมีแค่ไฟล์หน้า
holding page วางไว้ที่ root เท่านั้น ไม่มีโค้ดแอปสักบรรทัด

เหตุผลคือ Cloudflare Pages จะ build ใหม่ทุกครั้งที่ branch ที่มันเกาะขยับ ถ้าหน้าแรก
อยู่บน `main` แปลว่าทุก commit ของแอป — ที่ไม่เกี่ยวกับหน้าแรกเลยแม้แต่นิดเดียว — จะไป
สั่ง redeploy หน้าแรก และกินโควตา build เดือนละ 500 ครั้งไปเรื่อย ๆ

แยกเป็น orphan แล้วได้ผลตรงข้าม: แก้หน้าแรก = commit ที่ `site` อย่างเดียว แอปไม่ขยับ
แก้แอป = `main`/`uat` อย่างเดียว หน้าแรกไม่ขยับ และไม่ต้อง merge ข้ามกันตลอดกาล

`rebrand/doodle-v1` กับ branch เก่าทั้งหมดไม่ถูกแตะ

---

## ทำไมแอปถึงไม่ได้อยู่บน Pages

Cloudflare Pages รับ Next.js เฉพาะที่เป็น **static export** เท่านั้นแล้ว ส่วน Next
ที่มี server จริง ๆ ย้ายไปอยู่บน Workers ผ่าน adapter ของ OpenNext

rove เป็นแบบหลัง — 27 routes เกือบทั้งหมดเป็น `ƒ` (server-rendered on demand) และมี
`proxy.ts` เป็น middleware จริง จะทำเป็น static export ต้องเขียน
`generateStaticParams` ให้ `[tripId]`, `[shareToken]`, `[handle]` ทุกตัว ซึ่งเป็นไปไม่ได้
เพราะ id พวกนี้เกิดใน localStorage ของผู้ใช้ตอน runtime

หน้า holding page บน branch `site` เป็น static ล้วน จึงอยู่บน Pages ได้ตามปกติ

> **ไม่ใช้ `vinext`** ถึงเอกสาร Cloudflare จะเชียร์อยู่ตอนนี้ เพราะยังเป็น
> `1.0.0-beta.8` และเปลี่ยน build ทั้งระบบจาก Next CLI ไปเป็น Vite — เดิมพันสูงเกิน
> สำหรับของที่แค่ต้องขึ้นให้ได้ระหว่างรอ AWS

---

## สิ่งที่ต้องมีก่อน

| | ตรวจยังไง |
|---|---|
| Cloudflare account (free plan พอ) | ล็อกอิน dash.cloudflare.com ได้ |
| สิทธิ์แก้ nameserver ของ `rovetravel.site` ที่ GoDaddy | เข้า GoDaddy → My Products → DNS ได้ |
| repo `bboyzchecken/rove` บน GitHub | มีอยู่แล้ว ✅ |

ไม่ต้องมี: AWS, Terraform, Docker, บัตรเครดิต

**ทุกอย่างในเอกสารนี้ build บนเครื่องของ Cloudflare (Linux) ไม่ใช่บนเครื่องคุณ** ตั้งใจ
ให้เป็นแบบนั้น — ดูหัวข้อ "build บนเครื่องตัวเอง" ท้ายเอกสารว่าทำไม

---

## ขั้น 1 — ย้าย DNS มา Cloudflare

ตอนนี้ `rovetravel.site` ชี้ไป nameserver ของ **GoDaddy**:

```bash
nslookup -type=NS rovetravel.site
```

จะได้ `ns59.domaincontrol.com` / `ns60.domaincontrol.com` ตราบใดที่ยังเป็นแบบนี้
apex (`rovetravel.site` เปล่า ๆ ไม่มี subdomain) ผูกกับ Cloudflare ไม่ได้ เพราะ apex
ชี้ด้วย CNAME ไม่ได้ตามสเปค DNS และ GoDaddy ไม่มี CNAME flattening ให้

ขั้นตอน:

1. Cloudflare → **Add a site** → `rovetravel.site` → เลือก **Free**
2. Cloudflare จะสแกน record เดิมมาให้ **ตรวจให้ครบก่อนกด Continue** โดยเฉพาะ MX
   ถ้าใช้อีเมล @rovetravel.site อยู่ — record ที่หายตรงนี้คืออีเมลที่หายไปเลย
3. Cloudflare ให้ nameserver มา 2 ตัว
4. GoDaddy → My Products → `rovetravel.site` → DNS → Nameservers → **Change** →
   I'll use my own nameservers → ใส่ 2 ตัวนั้น
5. รอ propagate (ปกติ < 1 ชม. GoDaddy บอก 24-48 ชม. แต่จริง ๆ เร็วกว่านั้นมาก)

ตรวจว่าเสร็จ:

```bash
nslookup -type=NS rovetravel.site
```

ต้องขึ้นเป็น `*.ns.cloudflare.com` แล้ว **ห้ามไปขั้นต่อไปก่อนเห็นอันนี้**

> ขั้นนี้ไม่ได้เสียของถ้าวันหน้าย้ายไป AWS — [AWS_DEPLOY.md](AWS_DEPLOY.md) แนะนำ
> Cloudflare DNS อยู่แล้ว เพราะ ALB ก็ชี้ apex ตรง ๆ ไม่ได้เหมือนกัน

---

## ขั้น 2 — หน้า coming-soon ขึ้น Pages

ยังไม่ต้องรอขั้น 1 เสร็จก็ทำได้ จะได้ URL `*.pages.dev` ไว้ดูก่อน แล้วค่อยผูกโดเมนทีหลัง

Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** →
เลือก repo `bboyzchecken/rove`

ตั้งค่า:

| ช่อง | ค่า |
|---|---|
| Project name | `rove-site` |
| Production branch | **`site`** |
| Framework preset | **None** |
| Build command | *(เว้นว่าง)* |
| Build output directory | *(เว้นว่าง — ไฟล์อยู่ที่ root ของ branch แล้ว)* |
| Root directory | *(เว้นว่าง)* |

ไม่มี build command จริง ๆ — Cloudflare แค่หยิบไฟล์ทั้ง branch ไปวาง กด
**Save and Deploy** แล้วรอไม่เกินนาที จะได้ `rove-site.pages.dev`

> ถ้าเผลอตั้ง Production branch เป็น `main` จะได้หน้าเปล่าหรือ 404 เพราะ `main` ไม่มี
> `index.html` ที่ root — ไฟล์หน้าแรกอยู่บน `site` เท่านั้น

เปิดดูให้ครบก่อนไปต่อ:

- หน้าแรกขึ้น โลโก้เข็มทิศสีดินเผาขึ้น ฟอนต์ไทยไม่กลายเป็นฟอนต์ระบบ
- ลองเข้า `/pricing` หรือ path มั่ว ๆ → ต้องเด้งกลับหน้าแรก (มาจาก `404.html`)
- แชร์ลิงก์ใน LINE แล้วขึ้นรูป OG

### ผูกโดเมน (ทำหลังขั้น 1 เสร็จ)

ในโปรเจกต์ → **Custom domains** → **Set up a domain**

เพิ่มทีละอัน: `rovetravel.site` แล้วก็ `www.rovetravel.site` Cloudflare สร้าง DNS
record กับออก certificate ให้เองทั้งคู่ ไม่ต้องไปแตะ DNS เอง

---

## ขั้น 3 — สร้าง branch `uat`

`demo.rovetravel.site` เกาะ branch นี้ แยกจาก `main` เพื่อให้กด deploy UAT ได้โดยไม่
ต้องแตะ production

```bash
git checkout main
git pull
git checkout -b uat
git push -u origin uat
```

ต่อไปเวลาจะอัปเดต UAT ก็ merge เข้า `uat` แล้ว push — Cloudflare build ให้เอง

---

## ขั้น 4 — ตัวแอปขึ้น Workers

Cloudflare → **Workers & Pages** → **Create** → **Workers** → **Import a repository**
→ repo เดิม

| ช่อง | ค่า |
|---|---|
| Worker name | `rove-uat` |
| Production branch | **`uat`** |
| Root directory | `apps/web` |
| Build command | `pnpm cf:build` |
| Deploy command | `npx wrangler deploy` |

`apps/web` เป็น pnpm project แยกของตัวเอง (มี `pnpm-lock.yaml` ของตัวเอง ไม่มี
`package.json` ที่ root ของ repo) เลยตั้ง root directory ตรงนั้นได้เลย ไม่ต้องทำอะไรกับ
workspace

ค่าที่เหลือ — worker name, entry point, assets, compatibility flags — อ่านจาก
[`apps/web/wrangler.jsonc`](../apps/web/wrangler.jsonc) ไม่ต้องกรอกซ้ำในหน้าเว็บ

### ตัวแปรตอน build

**ไม่ต้องตั้งอะไรก็ได้** — `lib/data/mode.ts` ถือว่าอะไรที่ไม่ใช่คำว่า `live` เป๊ะ ๆ
คือ mock ดังนั้นไม่ตั้ง = mock build ซึ่งคือสิ่งที่ UAT ต้องการพอดี

แต่ตั้งอันนี้ด้วยจะดีกว่า ที่ Settings → Build → **Variables and Secrets**
(เลือกชนิดเป็น build-time):

| ตัวแปร | ค่า | ทำไม |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://demo.rovetravel.site` | ลิงก์ชวนเพื่อนกับ OG image ต้องเป็น absolute URL ไม่งั้นจะชี้กลับ localhost |
| `NEXT_PUBLIC_BRAND_NAME` | `ROVE` | ตรงกับ DEV_SPEC §15 |

> ⚠️ `NEXT_PUBLIC_*` ถูกฝังตอน `next build` ไม่ใช่ตอนรัน ตั้งใน `vars` ของ
> `wrangler.jsonc` ไม่มีผล ต้องตั้งเป็น **build variable** เท่านั้น

### ผูกโดเมน

Worker → **Settings** → **Domains & Routes** → **Add** → **Custom domain** →
`demo.rovetravel.site`

> ทำไมต้องเป็น Worker คนละตัว ไม่ใช่ preview branch ของตัวเดิม: preview URL ของ
> Workers ถูกล็อกไว้ที่ `*.workers.dev` ผูก custom domain ไม่ได้ Worker แยกตัวที่มี
> production branch เป็น `uat` เลยเป็นทางเดียวที่ `demo.rovetravel.site` จะใช้ได้จริง

---

## ⚠️ Worker ใหญ่เกิน free plan — ต้องจ่าย $5/เดือน

วัดจริงด้วย `wrangler deploy --dry-run` บน Linux:

```
Total Upload: 15106.34 KiB / gzip: 3439.72 KiB
```

| | ขนาด |
|---|---|
| Worker script (gzip) | **3.36 MB** |
| Workers **Free** limit | 3 MB → **ไม่ผ่าน** |
| Workers **Paid** limit | 10 MB → ผ่านสบาย |

เกินอยู่ ~13% ถ้า deploy บน free plan จะโดนปฏิเสธตอน upload ไม่ใช่ตอนรัน

static asset 127 ไฟล์ (3.8 MB) ไม่นับรวม เพราะเสิร์ฟผ่าน ASSETS binding แยกต่างหาก

**ทางออกคือจ่าย Workers Paid $5/เดือน** ได้ 10 MB limit กับ request ไม่จำกัดด้วย
ยังถูกกว่า AWS ที่รออยู่ประมาณ 10 เท่า

### ตัดของออกไม่ช่วย — วัดมาแล้ว

ตัวที่ดูน่าสงสัยที่สุดคือ `@vercel/og` ซึ่ง Next tracing ลากเข้า runtime bundle
(`resvg.wasm` 1.35 MB + `index.node.js` 852 KB + `index.edge.js` 720 KB) ทั้งที่ route
ที่ใช้มันทั้งสองตัว — `app/opengraph-image.tsx` กับ `app/pwa-icon/[size]/route.tsx` —
prerender ไปตั้งแต่ตอน build แล้ว (`○ Static` กับ `● SSG` ในผล build) ไม่มี input
dynamic เลยสักตัว ตอน runtime ไม่มีใครเรียกใช้

ลองถอดออกทั้งคู่แล้ววัดใหม่:

| | gzip |
|---|---|
| ของเดิม | 3,439.72 KiB |
| ถอด `@vercel/og` ออกหมด | 3,179.15 KiB |
| **ประหยัดได้** | **260 KiB (7.6%)** |
| free limit | 3,072 KiB — **ยังเกินอยู่ 107 KiB** |

แปลว่าถึงจะยอมทิ้งการ์ด OG ตอนแชร์ลิงก์ กับ icon ของ PWA ไปทั้งหมด ก็ยังลงไม่ถึง
free tier อยู่ดี — เสียฟีเจอร์ฟรี ๆ แล้วยังต้องจ่าย

(uncompressed ดูเหมือนจะประหยัดได้ 2.9 MB แต่ WASM กับไฟล์พวกนั้นบีบได้ดีมาก ตัวเลข
uncompressed จึงหลอกตา — ต้องดู gzip เท่านั้น เพราะ Cloudflare วัด gzip)

ที่เหลือหลังจากนั้นคือ `capsize-font-metrics.json` ของ `next/font` (4.2 MB
uncompressed) ซึ่งจะเอาออกต้องเลิกใช้ `next/font` ทั้งระบบ ไม่คุ้มกับ 107 KiB

**ข้อสรุป: อย่าไปแตะโค้ดเพื่อเรื่องนี้** ทุกครั้งที่เพิ่ม feature bundle ก็โตกลับไปอีก
เป็นการลงแรงกับ platform ที่ยังไงก็เป็นแค่ที่พักระหว่างรอ AWS

หน้า coming-soon ไม่เกี่ยวกับเรื่องนี้เลย — มันเป็น static บน Pages ฟรีตลอด

## ค่าใช้จ่าย

| | ราคา |
|---|---|
| Pages (หน้า coming-soon) | ฟรี — request ไม่จำกัด |
| Workers Paid (UAT) | $5/เดือน |
| DNS | ฟรี |
| **รวม** | **~$5/เดือน** |

เทียบกับ AWS ที่ ~$50-70/เดือนตั้งแต่ยังไม่มีคนใช้ (ALB กับ RDS คิดขั้นต่ำแม้ traffic
เป็นศูนย์)

---

## ที่ทดสอบไปแล้ว

รัน worker ที่ build เสร็จบน workerd จริง (`wrangler dev` ใน container Linux) แล้วยิงเข้าไป
ไม่ใช่แค่ดูว่า build ผ่าน:

| | ผล |
|---|---|
| `/`, `/pricing`, `/login`, `/explore`, `/terms` | 200 พร้อม HTML เต็ม (24-82 KB) |
| `/trips`, `/home`, `/t/demo`, `/billing`, `/points` | 200 — sign-in wall ถูกข้ามใน mock mode ตามที่ควรเป็น |
| `/manifest.webmanifest`, `/icon.svg` | 200 |
| `/pwa-icon/192`, `/pwa-icon/512` | 200 |
| `/opengraph-image` | 200 `image/png` |
| `public/_headers` | มีผลจริง — ตรวจครบทั้งสามกฎ |

> ถ้า `/opengraph-image` ขึ้น 500 ตอนทดสอบใน container ให้ดูว่า container มี
> `/etc/ssl/certs/ca-certificates.crt` หรือยัง — `next/og` โหลดฟอนต์ผ่าน HTTPS
> และ image อย่าง `node:*-slim` ไม่ได้ติดตั้ง CA bundle มาให้ เป็นปัญหาของเครื่องทดสอบ
> ไม่ใช่ของแอป บน Cloudflare จริงไม่เจอ

ที่ยังไม่ได้ยืนยัน: **service worker** ลงทะเบียนไม่ผ่านตอนทดสอบผ่าน `wrangler dev`
(`An unknown error occurred when fetching the script`) ตัวไฟล์เสิร์ฟถูกต้องทุกอย่าง —
200, `text/javascript`, cache header ตรง — เลยน่าจะเป็นเรื่องของ dev proxy มากกว่า
ต้องไปเช็คซ้ำบน HTTPS จริงหลัง deploy แอปทำงานได้ปกติถ้าไม่มี SW (มันมีไว้ทำ offline)

## ข้อจำกัดที่ต้องรู้ก่อนให้คนอื่นเข้า

**UAT ไม่เก็บข้อมูลจริงสักอย่าง** mock mode เขียนลง localStorage ของ browser คนนั้น
เท่านั้น — คนละเครื่องเห็นคนละทริป ล้าง browser data คือหายหมด ไม่มีอะไรข้ามไปหาใคร
ทั้งสิ้น ต้องบอกคนที่มาลองใช้ให้ชัด ไม่งั้นจะมีคนกรอกทริปจริงลงไปแล้วเสียใจ

**AI, OAuth, จ่ายเงิน, Google Places, อัปโหลดรูป — ไม่ทำงาน** ทั้งหมดนี้ต้องมี API
`lib/data/mode.ts` ประกาศไว้ครบใน `mockSkips` ว่าอันไหนถูกแทนด้วยของปลอม

**Node.js middleware บน Cloudflare ยังเป็น experimental** OpenNext เตือนตอน build
เลี่ยงไม่ได้เพราะ Next 16 บังคับให้ `proxy.ts` รันบน Node runtime เสมอ (ตั้ง `runtime`
เองจะ error) โชคดีที่ใน mock mode `proxy()` คืน `NextResponse.next()` ทันทีตั้งแต่
บรรทัดแรก sign-in wall ไม่ทำงานอยู่แล้ว ความเสี่ยงจริงจึงต่ำ — แต่ถ้าวันหน้าจะ deploy
`live` mode ขึ้น Workers ต้องเทสต์ทางนี้ให้หนัก

---

## build บนเครื่องตัวเอง (Windows)

`pnpm cf:build` **พังบน Windows** ด้วย `EPERM: operation not permitted, symlink`
เพราะ OpenNext สร้าง symlink ตอนรวม traced dependency ซึ่ง Windows ไม่ให้ทำถ้าไม่ได้
เป็น admin

ไม่กระทบ deploy เลย เพราะ Cloudflare build บน Linux แต่ถ้าอยากลอง build เองก่อน push:

- **Settings → System → For developers → Developer Mode** → เปิด → เปิด terminal ใหม่
- หรือ build ใน container: `docker run --rm -v "...:/src:ro" node:22-alpine sh -c "..."`

---

## วันที่ AWS approve แล้ว

ไม่มีอะไรต้องรื้อ:

- DNS อยู่ที่ Cloudflare อยู่แล้ว ซึ่งเป็นที่ที่ AWS_DEPLOY.md ต้องการพอดี
- apex ย้ายจาก Pages ไป ALB = แก้ record เดียว
- `demo.rovetravel.site` ปล่อยไว้เป็น UAT ต่อได้เลย ไม่ต้องแตะ — มันฟรีและมันไม่ยุ่งกับ
  production
- `apps/web/wrangler.jsonc` กับ `open-next.config.ts` อยู่เฉย ๆ ไม่กวน docker build
  หรือ ECS
