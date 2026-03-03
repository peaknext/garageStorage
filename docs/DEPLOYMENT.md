# คู่มือการ Deploy ระบบ SKH Storage Service

> เวอร์ชัน 1.0 | อัปเดตล่าสุด: มีนาคม 2569

---

## สารบัญ

1. [สถาปัตยกรรมระบบ](#1-สถาปัตยกรรมระบบ)
2. [ข้อกำหนดเบื้องต้น (Prerequisites)](#2-ข้อกำหนดเบื้องต้น-prerequisites)
3. [การติดตั้ง Docker บน Windows Server](#3-การติดตั้ง-docker-บน-windows-server)
4. [การเตรียมเซิร์ฟเวอร์](#4-การเตรียมเซิร์ฟเวอร์)
5. [วิธีที่ 1: Offline Deployment (แนะนำ)](#5-วิธีที่-1-offline-deployment-แนะนำ)
6. [วิธีที่ 2: Docker Hub / Registry](#6-วิธีที่-2-docker-hub--registry)
7. [วิธีที่ 3: Build จาก Source Code](#7-วิธีที่-3-build-จาก-source-code)
8. [การตั้งค่า Environment](#8-การตั้งค่า-environment)
9. [การตั้งค่า SSL/HTTPS](#9-การตั้งค่า-sslhttps)
10. [Security Hardening](#10-security-hardening)
11. [การย้ายข้อมูลจากระบบเดิม](#11-การย้ายข้อมูลจากระบบเดิม)
12. [การอัปเดตเวอร์ชัน / Rollback](#12-การอัปเดตเวอร์ชัน--rollback)
13. [คำสั่งจัดการระบบ](#13-คำสั่งจัดการระบบ)
14. [การ Backup และ Restore](#14-การ-backup-และ-restore)
15. [การแก้ปัญหา (Troubleshooting)](#15-การแก้ปัญหา-troubleshooting)
16. [Quick Reference Card](#16-quick-reference-card)

---

## 1. สถาปัตยกรรมระบบ

### 1.1 ภาพรวมระบบ

SKH Storage Service เป็นระบบจัดเก็บไฟล์แบบ Multi-tenant ที่ใช้ Garage S3-Compatible Object Storage ประกอบด้วย 6 services หลัก:

```
┌──────────────── Production Architecture ────────────────┐
│                                                         │
│  Internet / Users                                       │
│        │                                                │
│        ▼                                                │
│  ┌────────────────────┐                                 │
│  │   Nginx (80/443)   │  ← SSL Termination              │
│  │   Reverse Proxy    │  ← Security Headers              │
│  │   Rate Limiting    │  ← Gzip Compression              │
│  └────┬──────────┬────┘                                 │
│       │          │                                      │
│       ▼          ▼                                      │
│  ┌─────────┐  ┌──────────┐                              │
│  │ Storage │  │ Admin UI │                              │
│  │ API     │  │ (Next.js)│                              │
│  │ (NestJS)│  │          │                              │
│  │  :9001  │  │  :3000   │                              │
│  └────┬────┘  └──────────┘                              │
│       │                                                 │
│       ├──────────────┬──────────────┐                   │
│       ▼              ▼              ▼                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐          │
│  │PostgreSQL│  │  Redis   │  │  Garage S3   │←(9004)   │
│  │  :5432   │  │  :6379   │  │  Object      │ Browser  │
│  │          │  │          │  │  Storage     │ Access   │
│  └──────────┘  └──────────┘  └──────────────┘          │
│                                                         │
│  ──── Internal Only (Docker Network) ────               │
│  ──── Exposed Ports: 80, 443, 9004     ────             │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Services

| Service | Container | Port (Internal) | Port (Exposed) | คำอธิบาย |
|---------|-----------|----------------|----------------|----------|
| Nginx | skh-nginx | 80, 443 | 80, 443 | Reverse proxy, SSL termination |
| Storage API | skh-storage-api | 9001 | - (ผ่าน nginx) | REST API (NestJS) |
| Admin UI | skh-admin-ui | 3000 | - (ผ่าน nginx) | Dashboard (Next.js) |
| PostgreSQL | skh-postgres | 5432 | - (internal) | ฐานข้อมูลหลัก |
| Redis | skh-redis | 6379 | - (internal) | Cache + Bull Queue |
| Garage S3 | skh-garage | 9004 | 9004 | Object Storage |

### 1.3 Data Flow

```
User Upload:
  Browser → Nginx (443) → Storage API → Garage S3

File Download (Presigned URL):
  Browser → Garage S3 (9004) ← presigned URL จาก Storage API

Admin Dashboard:
  Browser → Nginx (443) → Admin UI (SSR) → Storage API
```

> **หมายเหตุ**: Port 9004 (Garage S3) ต้อง expose เนื่องจาก Presigned URL ที่ backend สร้างขึ้นจะชี้ไปที่ Garage โดยตรง Browser จะดาวน์โหลดไฟล์จาก Garage S3 โดยไม่ผ่าน nginx

---

## 2. ข้อกำหนดเบื้องต้น (Prerequisites)

### 2.1 สำหรับ Linux Server (แนะนำ)

| รายการ | ข้อกำหนด |
|--------|----------|
| OS | Ubuntu 22.04+ / Debian 12+ / CentOS 8+ |
| CPU | 4 cores ขึ้นไป (แนะนำ 8 cores) |
| RAM | 4 GB ขั้นต่ำ (แนะนำ 8 GB) |
| Disk | 50 GB ขั้นต่ำ + พื้นที่สำหรับไฟล์ที่จัดเก็บ |
| Docker | Docker Engine 24+ |
| Docker Compose | V2+ (มาพร้อม Docker Engine) |
| Network | Port 80, 443, 9004 เปิดใช้งาน |

**ตรวจสอบเวอร์ชัน:**
```bash
docker --version          # Docker version 24.0+
docker compose version    # Docker Compose version v2.0+
openssl version          # OpenSSL 1.1.1+
```

### 2.2 สำหรับ Windows Server

| รายการ | ข้อกำหนด |
|--------|----------|
| OS | Windows Server 2019 / 2022 |
| CPU | 4 cores ขึ้นไป |
| RAM | 8 GB ขึ้นไป |
| Disk | 50 GB ขั้นต่ำ |
| Docker | Docker Desktop หรือ Docker CE |
| WSL2 | จำเป็นสำหรับ Docker Desktop |

### 2.3 Resource Allocation

ระบบใช้ resource limits ดังนี้:

| Service | CPU Limit | Memory Limit |
|---------|-----------|-------------|
| Nginx | 0.5 cores | 256 MB |
| Storage API | 2.0 cores | 1 GB |
| Admin UI | 0.5 cores | 512 MB |
| PostgreSQL | 1.0 core | 1 GB |
| Redis | 0.5 cores | 768 MB |
| Garage S3 | 2.0 cores | 2 GB |
| **รวม** | **6.5 cores** | **~5.5 GB** |

---

## 3. การติดตั้ง Docker บน Windows Server

> ข้ามหัวข้อนี้ได้ถ้าใช้ Linux Server หรือมี Docker อยู่แล้ว

### 3.1 ติดตั้ง WSL2

เปิด PowerShell ในฐานะ Administrator:

```powershell
# เปิดใช้งาน WSL
wsl --install

# รีสตาร์ทเครื่อง
Restart-Computer

# หลังรีสตาร์ท ตรวจสอบเวอร์ชัน
wsl --version
```

### 3.2 ติดตั้ง Docker Desktop

1. ดาวน์โหลด Docker Desktop จาก https://www.docker.com/products/docker-desktop/
2. ติดตั้งโดยเลือก "Use WSL 2 instead of Hyper-V"
3. รีสตาร์ทเครื่อง
4. เปิด Docker Desktop และรอให้ engine พร้อมใช้งาน

**ตรวจสอบการติดตั้ง:**
```powershell
docker --version
docker compose version
docker run hello-world
```

### 3.3 ตั้งค่า Docker Desktop

1. เปิด Docker Desktop → Settings → Resources
2. ตั้งค่า Memory: 8 GB (ขั้นต่ำ 6 GB)
3. ตั้งค่า CPUs: 4+
4. ตั้งค่า Disk: 50 GB+
5. กด "Apply & Restart"

---

## 4. การเตรียมเซิร์ฟเวอร์

### 4.1 Linux Server

#### เปิด Firewall

```bash
# Ubuntu/Debian (UFW)
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 9004/tcp  # Garage S3 (Presigned URLs)
sudo ufw enable
sudo ufw status

# CentOS/RHEL (firewalld)
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --permanent --add-port=9004/tcp
sudo firewall-cmd --reload
```

#### สร้าง Directory

```bash
# สร้าง directory สำหรับระบบ
sudo mkdir -p /opt/skh-storage
sudo mkdir -p /opt/skh-storage/backups
sudo chown -R $USER:$USER /opt/skh-storage

cd /opt/skh-storage
```

### 4.2 Windows Server

#### เปิด Firewall

```powershell
# เปิด PowerShell ในฐานะ Administrator
New-NetFirewallRule -DisplayName "SKH Storage HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
New-NetFirewallRule -DisplayName "SKH Storage HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
New-NetFirewallRule -DisplayName "SKH Storage S3" -Direction Inbound -Protocol TCP -LocalPort 9004 -Action Allow
```

#### สร้าง Directory

```powershell
mkdir C:\skh-storage
mkdir C:\skh-storage\backups
cd C:\skh-storage
```

---

## 5. วิธีที่ 1: Offline Deployment (แนะนำ)

> เหมาะสำหรับ: เซิร์ฟเวอร์ที่ไม่มี Internet หรือต้องการควบคุม Docker images

### 5.1 บนเครื่อง Development (Build)

**ขั้นตอน A: Build และ Export**

```bash
# 1. Clone repository (ถ้ายังไม่มี)
git clone <repository-url>
cd garageStorage

# 2. Build และ export ทุก Docker images
./scripts/build-and-export.sh

# Output:
# deploy/skh-storage-YYYYMMDD_HHMMSS.tar.gz
```

สคริปต์จะ:
1. Build Docker images สำหรับ storage-api และ admin-ui
2. Export ทุก images (6 ไฟล์) เป็น tar.gz
3. คัดลอก configuration files ที่จำเป็น
4. สร้าง archive สำหรับ deploy

**ขั้นตอน B: Transfer ไปยัง Production Server**

```bash
# ใช้ scp
scp deploy/skh-storage-YYYYMMDD_HHMMSS.tar.gz user@production-server:/opt/skh-storage/

# หรือใช้ USB drive, shared folder, etc.
```

### 5.2 บน Production Server (Deploy)

```bash
# 1. ไปยัง directory ที่วางไฟล์
cd /opt/skh-storage

# 2. แตกไฟล์ archive
tar -xzf skh-storage-YYYYMMDD_HHMMSS.tar.gz
cd skh-storage-YYYYMMDD_HHMMSS

# 3. รันสคริปต์ import-and-run
bash scripts/import-and-run.sh
```

**สคริปต์ `import-and-run.sh` จะดำเนินการดังนี้:**

| ขั้นตอน | คำอธิบาย |
|---------|----------|
| 1. Load Images | โหลด Docker images จากไฟล์ tar.gz |
| 2. Configure | สร้าง .env.production และ generate secrets |
| 3. Garage Config | สร้าง garage.active.toml จาก template |
| 4. SSL | สร้าง self-signed certificate (ถ้ายังไม่มี) |
| 5. Infrastructure | เริ่ม PostgreSQL, Redis, Garage |
| 6. Garage Setup | สร้าง API key สำหรับ Garage S3 |
| 7. Migrations | รัน database migrations และ seed |

**ระหว่างทำงาน สคริปต์จะหยุดรอให้คุณแก้ไข:**
1. `.env.production` - ตั้งค่า SERVER_DOMAIN, SERVER_IP
2. Garage API Key - คัดลอก access key และ secret key

### 5.3 ตรวจสอบการติดตั้ง

```bash
# ตรวจสอบ status ของทุก services
docker compose -f docker-compose.prod.yml --env-file .env.production ps

# ผลลัพธ์ที่คาดหวัง:
# NAME               STATUS          PORTS
# skh-nginx          Up (healthy)    0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
# skh-storage-api    Up (healthy)
# skh-admin-ui       Up
# skh-postgres       Up (healthy)
# skh-redis          Up (healthy)
# skh-garage         Up (healthy)    0.0.0.0:9004->9004/tcp

# ตรวจสอบ health endpoint
curl -k https://localhost/health

# ตรวจสอบ admin UI
curl -k -I https://localhost/

# ดู logs
docker logs skh-storage-api --tail 50
docker logs skh-nginx --tail 50
```

---

## 6. วิธีที่ 2: Deploy ผ่าน Docker Hub (Online)

เหมาะสำหรับ server ที่ **มีอินเทอร์เน็ต** และต้องการ deploy/อัปเดตได้สะดวก

### ภาพรวมขั้นตอน

```
เครื่อง Dev                  Docker Hub                Server Production
──────────                  ──────────                ──────────────────
1. git tag + push    ──►    2. GitHub Actions
                            build & push image  ──►   3. docker pull
                                                      4. docker compose up
```

### Docker Images ที่ใช้

| Image | Docker Hub URL | สร้างโดย |
|-------|---------------|---------|
| Backend API | `peaknext/skh-storage-api` | GitHub Actions อัตโนมัติ |
| Admin UI | `peaknext/skh-admin-ui` | GitHub Actions อัตโนมัติ |

> แทนที่ `peaknext` ด้วย Docker Hub username ของคุณ

**Tags ที่ใช้ได้:**

| Tag | ความหมาย |
|-----|---------|
| `latest` | build ล่าสุด |
| `v1.0.0` | build จาก git tag ที่ระบุ |

### เตรียมการ (ทำครั้งเดียว)

#### A. สร้าง Docker Hub account + access token

1. ไปที่ https://hub.docker.com → สมัครสมาชิก (ฟรี)
2. ไปที่ **Account Settings** → **Security** → **New Access Token**
3. ตั้งชื่อ token เช่น `skh-storage-github-actions`
4. เลือก permission: **Read, Write, Delete**
5. คัดลอก token เก็บไว้ (จะแสดงเพียงครั้งเดียว)

#### B. ตั้งค่า GitHub Secrets

ไปที่ GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret name | ค่า |
|------------|-----|
| `DOCKERHUB_USERNAME` | username ของ Docker Hub เช่น `peaknext` |
| `DOCKERHUB_TOKEN` | access token ที่สร้างในข้อ A |

#### C. เตรียม Production Server

```bash
# สร้าง directory สำหรับ project
sudo mkdir -p /opt/skh-storage
cd /opt/skh-storage
```

#### D. เตรียม Config Files บน Server

คัดลอกไฟล์ต่อไปนี้จาก repository ไปยัง `/opt/skh-storage/`:

```
/opt/skh-storage/
├── docker-compose.prod.yml
├── .env.production.example
├── deploy/
│   └── pull-and-run.sh      # script deploy อัตโนมัติ
├── nginx/
│   ├── nginx.conf
│   └── ssl/
├── garage/
│   └── garage.prod.toml
└── scripts/
    ├── generate-secrets.sh
    └── ssl-setup.sh
```

```bash
# สร้าง .env.production จากตัวอย่าง
cp .env.production.example .env.production

# สร้าง secrets อัตโนมัติ
chmod +x scripts/*.sh deploy/*.sh
./scripts/generate-secrets.sh --env-file .env.production
```

แก้ไข `.env.production` ตั้งค่าที่สำคัญ:

```ini
# === ตั้งค่าที่ต้องแก้ ===
SERVER_DOMAIN=storage.your-domain.com   # หรือใช้ IP address
SERVER_IP=YOUR_SERVER_IP

# === Docker Image ===
# ใส่ Docker Hub username ตามด้วย / (trailing slash)
IMAGE_REGISTRY=peaknext/
IMAGE_TAG=latest
```

### Deploy

#### วิธี 1: Push tag อัตโนมัติ (แนะนำ)

บนเครื่อง dev:

```bash
cd garageStorage

# สร้าง git tag
git tag v1.0.0

# Push tag ไป GitHub → trigger GitHub Actions อัตโนมัติ
git push origin v1.0.0
```

**GitHub Actions จะทำงานอัตโนมัติ** (~5-8 นาที):
1. Build image `peaknext/skh-storage-api:v1.0.0` + `:latest`
2. Build image `peaknext/skh-admin-ui:v1.0.0` + `:latest`
3. Push ทั้ง 2 image ขึ้น Docker Hub

ตรวจสอบสถานะ: ไปที่ GitHub repo → **Actions** tab → ดู workflow run

เมื่อ build เสร็จแล้ว SSH เข้า server:

```bash
cd /opt/skh-storage

bash deploy/pull-and-run.sh v1.0.0
```

#### วิธี 2: Trigger manual จาก GitHub UI

1. ไปที่ GitHub repo → **Actions** → **Build & Push Docker Images**
2. กด **Run workflow**
3. ใส่ tag เช่น `v1.0.0` → กด **Run workflow**
4. รอ build เสร็จ → SSH เข้า server → `bash deploy/pull-and-run.sh v1.0.0`

### สิ่งที่ `pull-and-run.sh` ทำ

| ขั้นตอน | สิ่งที่เกิดขึ้น |
|---------|---------------|
| Pre-flight | ตรวจ `.env.production`, `IMAGE_REGISTRY`, SSL cert (auto-gen ถ้าไม่มี) |
| 1/4 | `docker compose pull storage-api admin-ui` — ดึง image จาก Docker Hub |
| 2/4 | หยุด services เดิม (ถ้ามี) |
| 3/4 | เริ่ม infrastructure (postgres, redis, garage) → รอ `pg_isready` → Prisma migration → seed |
| 4/4 | เริ่ม services ทั้งหมด |
| Health check | ตรวจ `https://localhost/api/v1/health` |

> ครั้งแรก script จะสร้าง Garage API key ให้อัตโนมัติ และรอให้คุณใส่ key ใน `.env.production` ก่อนดำเนินการต่อ

### อัปเดต Version

```bash
cd /opt/skh-storage

# วิธีสั้น — ใช้ pull-and-run.sh
bash deploy/pull-and-run.sh v1.1.0
```

หรือทำเองทีละขั้นตอน:

```bash
# Pull images ใหม่
IMAGE_TAG=v1.1.0 docker compose -f docker-compose.prod.yml --env-file .env.production pull storage-api admin-ui

# Run migrations (ถ้ามี schema changes)
IMAGE_TAG=v1.1.0 docker compose -f docker-compose.prod.yml --env-file .env.production run --rm storage-api npx prisma migrate deploy

# Restart services ด้วย images ใหม่
IMAGE_TAG=v1.1.0 docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# ตรวจสอบ
docker compose -f docker-compose.prod.yml ps
docker logs skh-storage-api --tail 20
```

### Rollback (ย้อนกลับ version เก่า)

```bash
cd /opt/skh-storage

# Deploy version เก่า (ใช้ tag ที่เคย push)
bash deploy/pull-and-run.sh v1.0.0
```

### ตรวจสอบว่า deploy สำเร็จ

| ขั้นตอน | คำสั่ง | คาดหวัง |
|---------|--------|---------|
| Services ทำงาน | `docker compose -f docker-compose.prod.yml ps` | ทุก service status = `Up` หรือ `healthy` |
| API ตอบ | `curl -k https://localhost/api/v1/health` | `{"status":"ok"}` |
| Frontend โหลด | เปิด `https://SERVER_DOMAIN` ในเบราว์เซอร์ | หน้า Login |
| SSL ทำงาน | `curl -I https://SERVER_DOMAIN` | Status 200 + security headers |
| Logs ปกติ | `docker logs skh-storage-api --tail 20` | ไม่มี error |

---

## 7. วิธีที่ 3: Build จาก Source Code

> เหมาะสำหรับ: เซิร์ฟเวอร์ที่มี Internet และต้องการ build ล่าสุดจาก source

### 7.1 Clone Repository

```bash
cd /opt/skh-storage
git clone <repository-url> .

# หรือถ้ามี repository อยู่แล้ว
git pull origin main
```

### 7.2 Setup Environment

```bash
# สร้าง .env.production
cp .env.production.example .env.production

# Generate secrets
./scripts/generate-secrets.sh --env-file .env.production

# แก้ไข .env.production
nano .env.production
# ตั้งค่า: SERVER_DOMAIN, SERVER_IP, GARAGE_PUBLIC_ENDPOINT, API_BASE_URL

# Generate Garage config
source .env.production
envsubst < garage/garage.prod.toml > garage/garage.active.toml

# Generate SSL certificates
./scripts/ssl-setup.sh
```

### 7.3 Build และ Start

```bash
# Build images และ start ทุก services
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# รอให้ services พร้อม (~30 วินาที)
sleep 30

# Initialize Garage
docker exec skh-garage /garage key create storage-api-key
# Copy access key → GARAGE_ACCESS_KEY ใน .env.production
# Copy secret key → GARAGE_SECRET_KEY ใน .env.production

# Assign Garage node layout
NODE_ID=$(docker exec skh-garage /garage status | grep "this node" | awk '{print $3}' | head -c 16)
docker exec skh-garage /garage layout assign "$NODE_ID" -z dc1 -c 1G
docker exec skh-garage /garage layout apply --version 1

# Run database migrations
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm storage-api npx prisma migrate deploy
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm storage-api npx prisma db seed

# Restart เพื่อใช้ Garage keys
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

---

## 8. การตั้งค่า Environment

### 8.1 ตัวแปรที่จำเป็น (Required)

| ตัวแปร | คำอธิบาย | ตัวอย่าง |
|--------|----------|----------|
| `SERVER_DOMAIN` | Domain name ของเซิร์ฟเวอร์ | `storage.company.com` |
| `SERVER_IP` | IP address ของเซิร์ฟเวอร์ | `192.168.1.100` |
| `DB_PASSWORD` | รหัสผ่าน PostgreSQL | (สร้างโดย generate-secrets.sh) |
| `REDIS_PASSWORD` | รหัสผ่าน Redis | (สร้างโดย generate-secrets.sh) |
| `JWT_SECRET` | Secret key สำหรับ JWT tokens | (สร้างโดย generate-secrets.sh) |
| `GARAGE_ACCESS_KEY` | Garage S3 access key | (จาก setup-garage.sh) |
| `GARAGE_SECRET_KEY` | Garage S3 secret key | (จาก setup-garage.sh) |
| `GARAGE_ADMIN_TOKEN` | Garage admin API token | (สร้างโดย generate-secrets.sh) |
| `GARAGE_RPC_SECRET` | Garage RPC communication secret | (สร้างโดย generate-secrets.sh) |

### 8.2 ตัวแปร URL (สำคัญมาก)

| ตัวแปร | คำอธิบาย | Production Example |
|--------|----------|--------------------|
| `API_BASE_URL` | URL สาธารณะของ API (ใช้ในการสร้าง share link) | `https://storage.company.com` |
| `GARAGE_PUBLIC_ENDPOINT` | URL ที่ browser เข้าถึง Garage S3 ได้ | `http://192.168.1.100:9004` |
| `NEXT_PUBLIC_API_URL` | Frontend API base URL | `/api/v1` (relative path) |
| `ADMIN_UI_URL` | URL ของ Admin Dashboard (ใช้ใน CORS) | `https://storage.company.com` |

> **สำคัญ**: `GARAGE_PUBLIC_ENDPOINT` ต้องเป็น URL ที่ browser ของผู้ใช้สามารถเข้าถึงได้ เพราะ Presigned URL จะชี้ไปที่ Garage โดยตรง

### 8.3 ตัวแปรเสริม (Optional)

| ตัวแปร | Default | คำอธิบาย |
|--------|---------|----------|
| `JWT_EXPIRES_IN` | `24h` | อายุ JWT token |
| `DEFAULT_BUCKET_QUOTA_GB` | `10` | Quota เริ่มต้นของ bucket (GB) |
| `MAX_FILE_SIZE_MB` | `100` | ขนาดไฟล์สูงสุด (MB) |
| `PRESIGNED_URL_EXPIRES_SECONDS` | `3600` | อายุ presigned URL (วินาที) |
| `SMTP_HOST` | - | SMTP server สำหรับส่งอีเมลแจ้งเตือน |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_FROM` | `noreply@skhstorage.local` | อีเมลผู้ส่ง |

### 8.4 การ Generate Secrets

```bash
# วิธีที่ 1: ใช้สคริปต์ (แนะนำ)
./scripts/generate-secrets.sh --env-file .env.production

# วิธีที่ 2: Generate ทีละตัว
openssl rand -base64 48 | tr -d '/+='    # JWT_SECRET
openssl rand -base64 24 | tr -d '/+='    # DB_PASSWORD
openssl rand -base64 24 | tr -d '/+='    # REDIS_PASSWORD
openssl rand -base64 32                   # GARAGE_ADMIN_TOKEN
openssl rand -hex 32                      # GARAGE_RPC_SECRET
openssl rand -base64 32                   # GARAGE_METRICS_TOKEN
```

> **คำเตือน**: อย่าใช้ค่า default ที่มาพร้อม development config เช่น `redis_password`, `postgres` หรือ `YWRtaW50b2tlbjEyMzQ1Njc4OTBhYmNkZWYxMjM0NTY3ODkw`

---

## 9. การตั้งค่า SSL/HTTPS

### 9.1 Self-Signed Certificate (สำหรับทดสอบ)

```bash
./scripts/ssl-setup.sh self-signed
```

สร้างไฟล์:
- `nginx/ssl/fullchain.pem` - Certificate
- `nginx/ssl/privkey.pem` - Private Key

> **หมายเหตุ**: Browser จะแสดง warning สำหรับ self-signed certificate ใช้ได้สำหรับ internal/testing เท่านั้น

### 9.2 Let's Encrypt (สำหรับ Production)

**ข้อกำหนด:**
- Domain name ต้องชี้มาที่ server IP แล้ว
- Port 80 ต้องเปิดจาก internet

```bash
# ติดตั้ง certbot
sudo apt update && sudo apt install -y certbot

# ขอ certificate
./scripts/ssl-setup.sh letsencrypt

# ตั้งค่า auto-renewal (crontab -e)
0 3 * * * certbot renew --post-hook 'cp /etc/letsencrypt/live/YOUR_DOMAIN/*.pem /opt/skh-storage/nginx/ssl/ && docker restart skh-nginx'
```

### 9.3 Custom Certificate

ถ้ามี certificate จาก Certificate Authority (CA):

```bash
# คัดลอก certificate files
cp your-cert.pem nginx/ssl/fullchain.pem
cp your-key.pem nginx/ssl/privkey.pem

# ถ้ามี intermediate certificate ให้ต่อเข้ากับ cert:
cat your-cert.pem intermediate.pem > nginx/ssl/fullchain.pem
```

### 9.4 Garage S3 SSL (Optional)

ตามค่าเริ่มต้น Garage S3 (port 9004) ใช้ HTTP ไม่ใช่ HTTPS เนื่องจาก:
- Presigned URL มีอายุจำกัด (default 1 ชั่วโมง)
- URL มี signature ที่ป้องกันการแก้ไข

ถ้าต้องการ SSL สำหรับ S3:

1. สร้าง DNS record: `s3.yourdomain.com` → server IP
2. แก้ `nginx/nginx.conf` - uncomment block "S3 Proxy" ที่ด้านล่างสุด
3. แก้ `.env.production`:
   ```
   GARAGE_PUBLIC_ENDPOINT=https://s3.yourdomain.com
   ```
4. Restart services:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d
   ```

---

## 10. Security Hardening

### 10.1 เปลี่ยนรหัสผ่าน Admin ทันที

หลังจาก deploy เสร็จ ให้เปลี่ยนรหัสผ่าน admin ทันที:

1. เข้า Admin Dashboard: `https://your-domain`
2. Login ด้วย: `admin@example.com` / `admin123`
3. ไปที่ Settings → เปลี่ยนรหัสผ่าน

### 10.2 ปิด Swagger ใน Production

แก้ไข `nginx/nginx.conf` ใน section `/api/docs`:

```nginx
location /api/docs {
    return 404;  # ← uncomment บรรทัดนี้
    # proxy_pass http://storage_api;
    # proxy_set_header Host $host;
}
```

Restart nginx:
```bash
docker restart skh-nginx
```

### 10.3 ตั้งค่า CORS

ใน `.env.production` ตรวจสอบว่า `ADMIN_UI_URL` ตรงกับ domain ที่ใช้จริง:

```bash
ADMIN_UI_URL=https://storage.company.com
```

### 10.4 Firewall Rules

เปิดเฉพาะ port ที่จำเป็น:

```bash
# อนุญาตเฉพาะ port ที่จำเป็น
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh          # SSH (22)
sudo ufw allow 80/tcp       # HTTP
sudo ufw allow 443/tcp      # HTTPS
sudo ufw allow 9004/tcp     # Garage S3
sudo ufw enable
```

### 10.5 JWT Token Expiry

สำหรับ production แนะนำให้ใช้ JWT expiry สั้น:

```bash
# .env.production
JWT_EXPIRES_IN=24h    # หรือ 8h สำหรับ security สูง
```

### 10.6 ตั้งค่า fail2ban (Optional)

```bash
# ติดตั้ง fail2ban
sudo apt install -y fail2ban

# สร้าง config สำหรับ nginx
sudo cat > /etc/fail2ban/jail.d/nginx.conf << 'EOF'
[nginx-http-auth]
enabled = true
filter = nginx-http-auth
logpath = /var/lib/docker/containers/*/skh-nginx*-json.log
maxretry = 5
bantime = 3600
EOF

sudo systemctl restart fail2ban
```

### 10.7 Checklist ก่อน Go-Live

- [ ] เปลี่ยนรหัสผ่าน admin default
- [ ] Secrets ทั้งหมดถูก generate ใหม่ (ไม่ใช้ค่า default)
- [ ] SSL certificate ติดตั้งแล้ว
- [ ] Firewall เปิดเฉพาะ port ที่จำเป็น
- [ ] CORS ตั้งค่าถูกต้อง
- [ ] Swagger ปิดใน production (optional)
- [ ] JWT expiry เหมาะสม
- [ ] Backup ทำงานได้ (ทดสอบ backup/restore)
- [ ] Log rotation ตั้งค่าแล้ว (docker-compose.prod.yml)
- [ ] DNS record ชี้มาที่ server แล้ว

---

## 11. การย้ายข้อมูลจากระบบเดิม

### 11.1 ย้ายจาก Development Compose

ถ้ามีข้อมูลอยู่ใน development docker-compose.yml:

```bash
# 1. Backup ฐานข้อมูลจาก dev containers
docker exec garage-postgres pg_dump \
  -U postgres \
  -d garageStorage \
  --format=custom \
  --compress=6 \
  > backup_migration.dump

# 2. Start production services (infra only)
docker compose -f docker-compose.prod.yml --env-file .env.production up -d postgres redis garage

# รอ postgres พร้อม
sleep 15

# 3. Run migrations
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm storage-api npx prisma migrate deploy

# 4. Restore data
cat backup_migration.dump | docker exec -i skh-postgres pg_restore \
  -U postgres \
  -d garageStorage \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges

# 5. Migrate Garage S3 data (if different volumes)
# ถ้าใช้ volume เดียวกัน ไม่ต้องทำ
# ถ้าเปลี่ยน volume ให้ copy data:
# docker cp garage-storage:/var/lib/garage/data ./garage-data-backup
# docker cp ./garage-data-backup skh-garage:/var/lib/garage/data

# 6. Start all services
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

### 11.2 ย้ายจาก External System

```bash
# Import SQL dump
cat your_dump.sql.gz | gunzip | docker exec -i skh-postgres psql \
  -U postgres \
  -d garageStorage

# หรือ custom format
cat your_dump.dump | docker exec -i skh-postgres pg_restore \
  -U postgres \
  -d garageStorage \
  --clean \
  --if-exists \
  --no-owner
```

---

## 12. การอัปเดตเวอร์ชัน / Rollback

### 12.1 การอัปเดต (Update)

#### วิธี A: Offline Update

```bash
# บนเครื่อง development
git pull origin main
./scripts/build-and-export.sh

# Transfer ไป production
scp deploy/skh-storage-YYYYMMDD_HHMMSS.tar.gz user@server:/opt/skh-storage/

# บน production server
cd /opt/skh-storage

# 1. Backup ก่อนอัปเดต!
./scripts/backup.sh ./backups

# 2. Load images ใหม่
cd skh-storage-YYYYMMDD_HHMMSS
for img in images/*.tar.gz; do docker load < "$img"; done

# 3. Run migrations
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm storage-api npx prisma migrate deploy

# 4. Restart services
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

#### วิธี B: Build จาก Source Update

```bash
cd /opt/skh-storage

# 1. Backup ก่อนอัปเดต!
./scripts/backup.sh ./backups

# 2. Pull latest code
git pull origin main

# 3. Rebuild และ restart
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# 4. Run migrations
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm storage-api npx prisma migrate deploy
```

### 12.2 Rollback

#### Rollback Code (ถ้า build จาก source)

```bash
# 1. ดู commits ก่อนหน้า
git log --oneline -10

# 2. Checkout เวอร์ชันก่อนหน้า
git checkout <commit-hash>

# 3. Rebuild
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

#### Rollback Database

```bash
# Restore จาก backup
./scripts/restore.sh ./backups/garageStorage_YYYYMMDD_HHMMSS.dump

# Restart API เพื่อ clear cache
docker restart skh-storage-api
```

#### Rollback Docker Images (Offline)

```bash
# Load images เวอร์ชันก่อนหน้า
cd /opt/skh-storage/skh-storage-PREVIOUS
for img in images/*.tar.gz; do docker load < "$img"; done

# Restart
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

### 12.3 Zero-Downtime Update (Advanced)

```bash
# 1. Build images ใหม่ (ไม่กระทบ running containers)
docker compose -f docker-compose.prod.yml --env-file .env.production build

# 2. Run migrations (backward-compatible migrations only)
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm storage-api npx prisma migrate deploy

# 3. Rolling restart (ทีละ service)
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --no-deps storage-api
sleep 10  # รอ health check ผ่าน
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --no-deps admin-ui
sleep 5
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --no-deps nginx
```

---

## 13. คำสั่งจัดการระบบ

### 13.1 จัดการ Services

```bash
# ตัวแปรสำหรับใช้ซ้ำ
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"

# ดูสถานะทั้งหมด
$COMPOSE ps

# เริ่มระบบ
$COMPOSE up -d

# หยุดระบบ
$COMPOSE down

# Restart service เดียว
$COMPOSE restart storage-api
$COMPOSE restart nginx

# Rebuild service เดียว
$COMPOSE up -d --build --no-deps storage-api

# ดู resource usage
docker stats --no-stream
```

### 13.2 ดู Logs

```bash
# ดู logs แบบ real-time
docker logs skh-storage-api -f
docker logs skh-admin-ui -f
docker logs skh-nginx -f
docker logs skh-postgres -f
docker logs skh-redis -f
docker logs skh-garage -f

# ดู logs ย้อนหลัง 100 บรรทัด
docker logs skh-storage-api --tail 100

# ดู logs ตั้งแต่เวลาที่กำหนด
docker logs skh-storage-api --since "2025-01-01T00:00:00"

# ดู logs จาก docker compose (ทุก services)
$COMPOSE logs -f
$COMPOSE logs -f --tail 50 storage-api admin-ui
```

### 13.3 Database Operations

```bash
# เปิด PostgreSQL shell
docker exec -it skh-postgres psql -U postgres -d garageStorage

# ดูขนาดฐานข้อมูล
docker exec skh-postgres psql -U postgres -d garageStorage -c "SELECT pg_size_pretty(pg_database_size('garageStorage'));"

# ดูจำนวน records ในตาราง
docker exec skh-postgres psql -U postgres -d garageStorage -c "
SELECT schemaname, relname, n_live_tup
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;"

# Run migrations
$COMPOSE run --rm storage-api npx prisma migrate deploy

# Open Prisma Studio (development only)
$COMPOSE run --rm -p 5555:5555 storage-api npx prisma studio
```

### 13.4 Garage S3 Operations

```bash
# ดูสถานะ Garage
docker exec skh-garage /garage status

# ดู buckets
docker exec skh-garage /garage bucket list

# ดู keys
docker exec skh-garage /garage key list

# ดูข้อมูลของ bucket
docker exec skh-garage /garage bucket info <bucket-name>

# สร้าง API key ใหม่
docker exec skh-garage /garage key create <key-name>
```

### 13.5 Redis Operations

```bash
# เปิด Redis shell
docker exec -it skh-redis redis-cli -a "$REDIS_PASSWORD"

# ดูจำนวน keys
docker exec skh-redis redis-cli -a "$REDIS_PASSWORD" dbsize

# ดู memory usage
docker exec skh-redis redis-cli -a "$REDIS_PASSWORD" info memory

# Clear cache ทั้งหมด
docker exec skh-redis redis-cli -a "$REDIS_PASSWORD" flushall
```

### 13.6 Health Checks

```bash
# ตรวจสอบ health ของแต่ละ service
curl -k https://localhost/health                    # API health (ผ่าน nginx)
curl -s http://localhost/nginx-health               # Nginx health
docker exec skh-postgres pg_isready -U postgres     # PostgreSQL
docker exec skh-redis redis-cli -a "$REDIS_PASSWORD" ping  # Redis
docker exec skh-garage /garage status               # Garage
```

---

## 14. การ Backup และ Restore

### 14.1 Database Backup

```bash
# Backup อัตโนมัติ
./scripts/backup.sh ./backups

# Output:
# backups/garageStorage_YYYYMMDD_HHMMSS.dump    (custom format)
# backups/garageStorage_YYYYMMDD_HHMMSS.sql.gz  (compressed SQL)
```

> **หมายเหตุ**: สคริปต์จะลบ backup เก่ากว่า 30 วันโดยอัตโนมัติ

### 14.2 ตั้งค่า Automated Backup (Cron)

```bash
# เปิด crontab
crontab -e

# Backup ทุกวัน ตอนตี 2
0 2 * * * cd /opt/skh-storage && ./scripts/backup.sh ./backups >> ./backups/backup.log 2>&1
```

### 14.3 Database Restore

```bash
# Restore จาก custom format (.dump)
./scripts/restore.sh ./backups/garageStorage_YYYYMMDD_HHMMSS.dump

# Restore จาก SQL (.sql.gz)
./scripts/restore.sh ./backups/garageStorage_YYYYMMDD_HHMMSS.sql.gz

# Restart API หลัง restore เพื่อ clear cache
docker restart skh-storage-api
```

> **คำเตือน**: Restore จะ **แทนที่** ข้อมูลทั้งหมดในฐานข้อมูล!

### 14.4 Backup Garage S3 Data

Garage S3 data ถูกเก็บใน Docker volume `garage-data` และ `garage-meta`:

```bash
# Backup Garage data (stop garage ก่อนเพื่อความปลอดภัย)
docker stop skh-garage
docker run --rm -v garageStorage_garage-data:/data -v $(pwd)/backups:/backup alpine \
  tar -czf /backup/garage-data-$(date +%Y%m%d).tar.gz -C /data .
docker run --rm -v garageStorage_garage-meta:/data -v $(pwd)/backups:/backup alpine \
  tar -czf /backup/garage-meta-$(date +%Y%m%d).tar.gz -C /data .
docker start skh-garage
```

### 14.5 Full System Backup

```bash
#!/bin/bash
# Full backup: database + Garage S3 + config
BACKUP_DIR="./backups/full-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# 1. Database
./scripts/backup.sh "$BACKUP_DIR"

# 2. Environment config (SENSITIVE!)
cp .env.production "$BACKUP_DIR/.env.production"

# 3. Garage data
docker stop skh-garage
docker run --rm -v garageStorage_garage-data:/data -v "$(pwd)/$BACKUP_DIR":/backup alpine \
  tar -czf /backup/garage-data.tar.gz -C /data .
docker run --rm -v garageStorage_garage-meta:/data -v "$(pwd)/$BACKUP_DIR":/backup alpine \
  tar -czf /backup/garage-meta.tar.gz -C /data .
docker start skh-garage

echo "Full backup saved to: $BACKUP_DIR"
```

---

## 15. การแก้ปัญหา (Troubleshooting)

### 15.1 Services ไม่ Start

**อาการ**: `docker compose up -d` แล้ว service ไม่ขึ้น

```bash
# ตรวจสอบ status
$COMPOSE ps -a

# ดู logs ของ service ที่มีปัญหา
docker logs skh-storage-api --tail 100
docker logs skh-nginx --tail 100

# ตรวจสอบ health checks
docker inspect --format='{{json .State.Health}}' skh-storage-api | python3 -m json.tool
```

**สาเหตุที่พบบ่อย:**

| อาการ | สาเหตุ | แก้ไข |
|-------|--------|-------|
| storage-api restarts | Database connection failed | ตรวจสอบ DB_PASSWORD ใน .env.production |
| storage-api restarts | NOAUTH Redis | ตรวจสอบ REDIS_PASSWORD ใน .env.production |
| nginx won't start | SSL cert not found | รัน `./scripts/ssl-setup.sh` |
| nginx won't start | Config syntax error | `docker exec skh-nginx nginx -t` |
| garage unhealthy | Bad config | ตรวจสอบ garage.active.toml |
| admin-ui 502 | API not ready | รอ storage-api healthy ก่อน |

### 15.2 ไม่สามารถ Login ได้

```bash
# 1. ตรวจสอบ API ทำงาน
curl -k https://localhost/health

# 2. ทดสอบ login API
curl -k -X POST https://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'

# 3. ตรวจสอบ CORS headers
curl -k -I -X OPTIONS https://localhost/api/v1/auth/login \
  -H "Origin: https://your-domain" \
  -H "Access-Control-Request-Method: POST"

# 4. ดู API logs
docker logs skh-storage-api --tail 50
```

### 15.3 File Upload/Download ไม่ทำงาน

```bash
# 1. ตรวจสอบ Garage S3 ทำงาน
docker exec skh-garage /garage status
docker exec skh-garage /garage bucket list

# 2. ตรวจสอบ GARAGE_ACCESS_KEY ถูกต้อง
docker exec skh-garage /garage key list

# 3. ตรวจสอบ GARAGE_PUBLIC_ENDPOINT เข้าถึงได้
curl http://YOUR_SERVER_IP:9004
# ควรได้ XML response (Access Denied = ปกติ)

# 4. ตรวจสอบ presigned URL generation
docker logs skh-storage-api | grep -i "presigned\|s3\|garage"
```

### 15.4 SSL Certificate Issues

```bash
# ตรวจสอบ certificate
openssl x509 -in nginx/ssl/fullchain.pem -text -noout | head -20

# ตรวจสอบ expiry date
openssl x509 -in nginx/ssl/fullchain.pem -enddate -noout

# ทดสอบ SSL connection
curl -vk https://localhost 2>&1 | grep -A5 "SSL connection"

# Renew Let's Encrypt certificate
certbot renew
cp /etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem nginx/ssl/
cp /etc/letsencrypt/live/YOUR_DOMAIN/privkey.pem nginx/ssl/
docker restart skh-nginx
```

### 15.5 Performance Issues

```bash
# ตรวจสอบ resource usage
docker stats --no-stream

# ตรวจสอบ disk usage
docker system df
df -h /var/lib/docker

# Clean up unused images/containers
docker system prune -f
docker image prune -a -f  # ลบ images ที่ไม่ใช้

# ตรวจสอบ database performance
docker exec skh-postgres psql -U postgres -d garageStorage -c "
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;"
```

### 15.6 Nginx Errors

```bash
# ตรวจสอบ nginx config syntax
docker exec skh-nginx nginx -t

# ดู nginx error log
docker logs skh-nginx --tail 100 | grep error

# 502 Bad Gateway
# = upstream service (storage-api หรือ admin-ui) ไม่พร้อม
docker logs skh-storage-api --tail 50

# 413 Request Entity Too Large
# = ไฟล์ใหญ่เกิน client_max_body_size
# แก้ใน nginx.conf: client_max_body_size 200M;
docker restart skh-nginx

# 429 Too Many Requests
# = rate limit exceeded
# แก้ใน nginx.conf ส่วน limit_req_zone
```

### 15.7 การ Reset ระบบทั้งหมด

> **คำเตือน**: จะลบข้อมูลทั้งหมด!

```bash
# หยุดทุก services
$COMPOSE down

# ลบ volumes ทั้งหมด (DATA LOSS!)
$COMPOSE down -v

# เริ่มต้นใหม่
bash scripts/import-and-run.sh
```

---

## 16. Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│                SKH Storage - Quick Reference                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  COMPOSE="docker compose -f docker-compose.prod.yml         │
│           --env-file .env.production"                        │
│                                                              │
│  เริ่มระบบ:          $COMPOSE up -d                          │
│  หยุดระบบ:           $COMPOSE down                           │
│  ดูสถานะ:            $COMPOSE ps                             │
│  ดู logs:            docker logs <container> -f              │
│  Restart service:    $COMPOSE restart <service>              │
│  Rebuild + restart:  $COMPOSE up -d --build <service>        │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  Container Names                                             │
│  ─────────────                                               │
│  skh-nginx         Nginx reverse proxy                       │
│  skh-storage-api   NestJS backend API                        │
│  skh-admin-ui      Next.js admin dashboard                   │
│  skh-postgres      PostgreSQL database                       │
│  skh-redis         Redis cache                               │
│  skh-garage        Garage S3 object storage                  │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  Ports (Exposed)                                             │
│  ───────────────                                             │
│  80/443  → Nginx (Web UI + API)                              │
│  9004    → Garage S3 (Presigned URL access)                  │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  Backup / Restore                                            │
│  ────────────────                                            │
│  Backup:   ./scripts/backup.sh ./backups                     │
│  Restore:  ./scripts/restore.sh ./backups/<file>.dump        │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  Database Access                                             │
│  ───────────────                                             │
│  docker exec -it skh-postgres psql -U postgres               │
│    -d garageStorage                                          │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  Garage S3                                                   │
│  ─────────                                                   │
│  Status:   docker exec skh-garage /garage status             │
│  Buckets:  docker exec skh-garage /garage bucket list        │
│  Keys:     docker exec skh-garage /garage key list           │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  Health Checks                                               │
│  ─────────────                                               │
│  curl -k https://localhost/health          # API             │
│  curl http://localhost/nginx-health        # Nginx           │
│  docker exec skh-postgres pg_isready       # PostgreSQL      │
│  docker exec skh-redis redis-cli ping      # Redis           │
│  docker exec skh-garage /garage status     # Garage          │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  Deployment Scripts                                          │
│  ──────────────────                                          │
│  ./scripts/generate-secrets.sh    Generate production secrets│
│  ./scripts/ssl-setup.sh           Setup SSL certificates     │
│  ./scripts/build-and-export.sh    Build for offline deploy   │
│  ./scripts/import-and-run.sh      Deploy from offline images │
│  ./scripts/backup.sh              Backup database            │
│  ./scripts/restore.sh             Restore database           │
│  ./scripts/setup-garage.sh        Initialize Garage S3       │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  Default Login                                               │
│  ─────────────                                               │
│  Email:    admin@example.com                                 │
│  Password: admin123                                          │
│  >>> เปลี่ยนรหัสผ่านทันทีหลัง Deploy! <<<                    │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  Key Files                                                   │
│  ─────────                                                   │
│  docker-compose.prod.yml      Production compose             │
│  .env.production              Production secrets (SENSITIVE) │
│  nginx/nginx.conf             Nginx config template          │
│  nginx/ssl/                   SSL certificates               │
│  garage/garage.prod.toml      Garage config template         │
│  garage/garage.active.toml    Active Garage config           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## ภาคผนวก

### A. โครงสร้างไฟล์ Production

```
/opt/skh-storage/
├── docker-compose.prod.yml      # Production compose
├── .env.production              # Production secrets (git-ignored)
├── .env.production.example      # Template
├── nginx/
│   ├── nginx.conf               # Nginx config (template)
│   └── ssl/
│       ├── fullchain.pem        # SSL certificate (git-ignored)
│       └── privkey.pem          # SSL private key (git-ignored)
├── garage/
│   ├── garage.prod.toml         # Garage config template
│   └── garage.active.toml       # Active config (git-ignored)
├── scripts/
│   ├── generate-secrets.sh      # Secret generator
│   ├── ssl-setup.sh             # SSL setup
│   ├── build-and-export.sh      # Build for offline deploy
│   ├── import-and-run.sh        # Offline deployer
│   ├── backup.sh                # Database backup
│   ├── restore.sh               # Database restore
│   └── setup-garage.sh          # Garage initialization
├── backups/                     # Backup files
│   ├── garageStorage_*.dump
│   └── garageStorage_*.sql.gz
├── backend/                     # Backend source
│   ├── Dockerfile
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── src/
├── frontend/                    # Frontend source
│   ├── Dockerfile
│   └── src/
└── docs/
    └── DEPLOYMENT.md            # This file
```

### B. Docker Volume Locations

```bash
# ดูตำแหน่ง volumes
docker volume inspect garageStorage_postgres-data
docker volume inspect garageStorage_redis-data
docker volume inspect garageStorage_garage-data
docker volume inspect garageStorage_garage-meta

# ตำแหน่งปกติบน Linux:
# /var/lib/docker/volumes/garageStorage_postgres-data/_data
# /var/lib/docker/volumes/garageStorage_redis-data/_data
# /var/lib/docker/volumes/garageStorage_garage-data/_data
# /var/lib/docker/volumes/garageStorage_garage-meta/_data
```

### C. Network Diagram

```
┌─────────── Docker Network: storage-network ───────────┐
│                                                        │
│  nginx ←──────→ storage-api ←──────→ postgres          │
│    │                 │                                  │
│    │                 ├──────────────→ redis             │
│    │                 │                                  │
│    │                 └──────────────→ garage            │
│    │                                                    │
│    └──────────→ admin-ui                                │
│                                                        │
└────────────────────────────────────────────────────────┘

Exposed to host:
  - nginx:     80 → 80,  443 → 443
  - garage:    9004 → 9004
  - All others: NO exposed ports
```

---

*คู่มือนี้สร้างขึ้นสำหรับ SKH Storage Service v1.0*
*อัปเดตล่าสุด: มีนาคม 2569*
