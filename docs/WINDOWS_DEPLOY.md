# Windows Server Native Deployment Guide

Step-by-step instructions for deploying SKH Storage Service natively on Windows Server 2022 without Docker.

## Target Architecture

```
┌─── Windows Server 2022 ──────────────────────────────────────┐
│                                                               │
│   ┌─ nginx (reverse proxy) ───────────────────────────────┐  │
│   │  port 80  → redirect to 443                          │  │
│   │  port 443 → SSL/TLS + HTTP/2                         │  │
│   │  /api/*   → proxy to 127.0.0.1:4000 (NestJS)        │  │
│   │  /*       → proxy to 127.0.0.1:3000 (Next.js)       │  │
│   └───────────────────────────────────────────────────────┘  │
│                                                               │
│   ┌─ NestJS API ──────────┐   ┌─ Next.js Frontend ───────┐  │
│   │ PM2 → port 4000       │   │ PM2 → port 3000          │  │
│   │ (storage-api)          │   │ (admin-ui)               │  │
│   └────────┬───────────────┘   └──────────────────────────┘  │
│            │                                                  │
│   ┌─ MinIO S3 ─────────────────┐  ┌─ Memurai (Redis) ────┐  │
│   │ port 9000 (S3 API)         │  │ port 6379             │  │
│   │ port 9001 (Console WebUI)  │  │ Windows Service       │  │
│   │ Windows Service (NSSM)     │  └───────────────────────┘  │
│   └────────────────────────────┘                              │
│                                                               │
│   ┌─ PostgreSQL 16 ───────────────┐                          │
│   │ port 5432 (Windows Service)    │                          │
│   └────────────────────────────────┘                          │
└───────────────────────────────────────────────────────────────┘
```

## Service Ports

| Service           | Port | Bind         | Notes                         |
|-------------------|------|--------------|-------------------------------|
| nginx (HTTP)      | 80   | 0.0.0.0      | Redirects to 443              |
| nginx (HTTPS)     | 443  | 0.0.0.0      | SSL termination, reverse proxy|
| NestJS API        | 4000 | 127.0.0.1    | PM2 managed                   |
| Next.js Frontend  | 3000 | 127.0.0.1    | PM2 managed                   |
| MinIO S3 API      | 9000 | 0.0.0.0      | Object storage                |
| MinIO Console     | 9001 | 127.0.0.1    | Admin web UI (optional)       |
| PostgreSQL        | 5432 | 127.0.0.1    | Database                      |
| Memurai (Redis)   | 6379 | 127.0.0.1    | Cache + job queues            |

---

## Prerequisites

### Required Software

| Software       | Version    | Download |
|----------------|------------|----------|
| Node.js        | 20 LTS     | https://nodejs.org/ |
| PostgreSQL     | 16+        | https://www.postgresql.org/download/windows/ |
| nginx          | latest     | https://nginx.org/en/download.html |
| PM2            | latest     | `npm install -g pm2` |
| NSSM           | latest     | https://nssm.cc/download |
| Git            | latest     | https://git-scm.com/download/win |
| Memurai        | latest     | https://www.memurai.com/get-memurai |

Ensure `node`, `npm`, `git`, `pm2`, and `nssm` are all available in system PATH.

---

## Step 1: Install MinIO

Run PowerShell **as Administrator**:

```powershell
.\scripts\setup-minio.ps1
```

This script will:
- Download `minio.exe` and `mc.exe` to `C:\MinIO\`
- Register MinIO as a Windows Service via NSSM
- Create an application access key
- Display `S3_ACCESS_KEY` and `S3_SECRET_KEY` — save these

**Verify:**
```powershell
# Check service status
Get-Service MinIO

# Health check
curl http://localhost:9000/minio/health/live
# Expected: OK

# Open Console UI in browser (optional)
# http://localhost:9001
```

## Step 2: Install Memurai (Redis)

1. Download and install Memurai from https://www.memurai.com/get-memurai
2. Run the configuration script **as Administrator**:

```powershell
.\scripts\setup-memurai.ps1
```

This script will:
- Configure a Redis password
- Restart the Memurai service
- Display `REDIS_PASSWORD` — save this

**Verify:**
```powershell
Get-Service Memurai

# Test connection (use the password from the script output)
& "C:\Program Files\Memurai\memurai-cli.exe" -a YOUR_REDIS_PASSWORD ping
# Expected: PONG
```

## Step 3: Configure PostgreSQL

If PostgreSQL is already installed and running as a Windows Service, create the database:

```powershell
# Connect with psql (adjust path if needed)
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres

# In the psql prompt:
CREATE DATABASE "garageStorage";
\q
```

**Verify:**
```powershell
Get-Service postgresql*
```

## Step 4: Clone and Configure the Project

```powershell
# Clone the repository
cd C:\Apps
git clone <YOUR_REPO_URL> garageStorage
cd garageStorage

# Create .env from the Windows template
Copy-Item .env.windows.example .env
```

Edit `.env` with the credentials from Steps 1-3:

```env
DATABASE_URL=postgresql://postgres:YOUR_PG_PASSWORD@localhost:5432/garageStorage
DB_PASSWORD=YOUR_PG_PASSWORD

REDIS_URL=redis://:YOUR_REDIS_PASSWORD@localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=YOUR_REDIS_PASSWORD

S3_ENDPOINT=http://localhost:9000
S3_PUBLIC_ENDPOINT=http://YOUR_SERVER_IP:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=<from step 1>
S3_SECRET_KEY=<from step 1>

PORT=4000
JWT_SECRET=<generate a random 32+ char string>
JWT_EXPIRES_IN=24h
API_BASE_URL=https://YOUR_DOMAIN
ADMIN_UI_URL=https://YOUR_DOMAIN
```

**Important:** `S3_PUBLIC_ENDPOINT` must be the URL that browsers can reach. If MinIO is behind nginx with SSL, use `https://s3.yourdomain.com`. If accessing via LAN IP directly, use `http://YOUR_SERVER_IP:9000`.

## Step 5: Install Dependencies and Build

```powershell
# Backend
cd C:\Apps\garageStorage\backend
npm ci
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run build

# Frontend
cd C:\Apps\garageStorage\frontend
npm ci
npm run build
```

**Verify builds:**
```powershell
# Backend: dist/ folder should exist with compiled JS
Test-Path C:\Apps\garageStorage\backend\dist\main.js

# Frontend: .next/ folder should exist
Test-Path C:\Apps\garageStorage\frontend\.next\BUILD_ID
```

## Step 6: Configure PM2

Create `C:\Apps\garageStorage\ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'storage-api',
      cwd: 'C:/Apps/garageStorage/backend',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        // dotenv loads from .env automatically in NestJS,
        // but we set critical vars explicitly as fallback
      },
      env_file: 'C:/Apps/garageStorage/.env',
      max_memory_restart: '512M',
      error_file: 'C:/Apps/garageStorage/logs/api-error.log',
      out_file: 'C:/Apps/garageStorage/logs/api-out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'admin-ui',
      cwd: 'C:/Apps/garageStorage/frontend',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      max_memory_restart: '512M',
      error_file: 'C:/Apps/garageStorage/logs/ui-error.log',
      out_file: 'C:/Apps/garageStorage/logs/ui-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
```

Create the logs directory and start services:

```powershell
New-Item -ItemType Directory -Path C:\Apps\garageStorage\logs -Force

cd C:\Apps\garageStorage
pm2 start ecosystem.config.js
pm2 save
```

**Make PM2 survive reboots** (run as Administrator):
```powershell
# Install pm2-windows-startup
npm install -g pm2-windows-startup
pm2-startup install
pm2 save
```

**Verify:**
```powershell
pm2 list
# Should show storage-api (online) and admin-ui (online)

# Test API directly
curl http://localhost:4000/api/v1/health
# or
curl http://localhost:4000/api/docs
```

## Step 7: Configure nginx

### 7.1 Install nginx

1. Download Windows build from https://nginx.org/en/download.html
2. Extract to `C:\nginx\`
3. Register as a Windows Service:

```powershell
nssm install nginx "C:\nginx\nginx.exe"
nssm set nginx AppDirectory "C:\nginx"
nssm set nginx Start SERVICE_AUTO_START
```

### 7.2 Create nginx configuration

Create `C:\nginx\conf\nginx.conf`:

```nginx
worker_processes auto;
error_log logs/error.log warn;

events {
    worker_connections 1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] '
                    '"$request" $status $body_bytes_sent '
                    '"$http_referer" "$http_user_agent" '
                    '$request_time';
    access_log logs/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    client_max_body_size 100M;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml text/javascript image/svg+xml;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=10r/m;
    limit_req_zone $binary_remote_addr zone=upload:10m rate=10r/m;

    # Upstream backends (localhost only)
    upstream storage_api {
        server 127.0.0.1:4000;
    }
    upstream admin_ui {
        server 127.0.0.1:3000;
    }

    # HTTP → HTTPS redirect
    server {
        listen 80;
        server_name _;

        location /nginx-health {
            access_log off;
            return 200 'OK';
            add_header Content-Type text/plain;
        }

        location / {
            return 301 https://$host$request_uri;
        }
    }

    # HTTPS server
    server {
        listen 443 ssl;
        http2 on;
        server_name YOUR_DOMAIN;

        # SSL — update paths to your certificate files
        ssl_certificate      C:/nginx/ssl/fullchain.pem;
        ssl_certificate_key  C:/nginx/ssl/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_prefer_server_ciphers off;
        ssl_session_timeout 1d;
        ssl_session_cache shared:SSL:10m;

        # Security headers
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
        add_header X-Frame-Options DENY always;
        add_header X-Content-Type-Options nosniff always;
        add_header X-XSS-Protection "1; mode=block" always;

        # Auth login (brute force protection)
        location /api/v1/auth/login {
            limit_req zone=login burst=10 nodelay;
            proxy_pass http://storage_api;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # File upload (separate rate limit)
        location ~ /api/v1/(admin/buckets/.*/files/upload|buckets/.*/files$) {
            limit_req zone=upload burst=5 nodelay;
            client_max_body_size 100M;
            proxy_pass http://storage_api;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 600s;
            proxy_send_timeout 600s;
        }

        # API endpoints
        location /api/ {
            limit_req zone=api burst=50 nodelay;
            proxy_pass http://storage_api;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Request-Id $request_id;
            proxy_read_timeout 300s;
        }

        # Health check
        location /health {
            proxy_pass http://storage_api;
            access_log off;
        }

        # Swagger docs (uncomment return 404 to disable in production)
        location /api/docs {
            # return 404;
            proxy_pass http://storage_api;
            proxy_set_header Host $host;
        }

        # Frontend (Next.js)
        location / {
            proxy_pass http://admin_ui;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        # Block hidden files
        location ~ /\. {
            deny all;
        }
    }

    # (Optional) S3 SSL proxy — uncomment if you want presigned URLs over HTTPS
    # Requires DNS: s3.yourdomain.com → this server
    # If enabled, set S3_PUBLIC_ENDPOINT=https://s3.yourdomain.com in .env
    #
    # server {
    #     listen 443 ssl;
    #     http2 on;
    #     server_name s3.YOUR_DOMAIN;
    #
    #     ssl_certificate      C:/nginx/ssl/fullchain.pem;
    #     ssl_certificate_key  C:/nginx/ssl/privkey.pem;
    #     ssl_protocols TLSv1.2 TLSv1.3;
    #
    #     location / {
    #         proxy_pass http://127.0.0.1:9000;
    #         proxy_set_header Host $host;
    #         proxy_set_header X-Real-IP $remote_addr;
    #         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    #         proxy_set_header X-Forwarded-Proto $scheme;
    #         client_max_body_size 100M;
    #         proxy_read_timeout 300s;
    #     }
    # }
}
```

### 7.3 SSL Certificates

Place your SSL certificates:
```
C:\nginx\ssl\fullchain.pem
C:\nginx\ssl\privkey.pem
```

For self-signed (testing only):
```powershell
New-Item -ItemType Directory -Path C:\nginx\ssl -Force

# Generate self-signed cert
openssl req -x509 -nodes -days 365 -newkey rsa:2048 `
  -keyout C:\nginx\ssl\privkey.pem `
  -out C:\nginx\ssl\fullchain.pem `
  -subj "/CN=YOUR_DOMAIN"
```

### 7.4 Start nginx

```powershell
nssm start nginx

# Verify
curl -k https://localhost/nginx-health
# Expected: OK
```

---

## Step 8: Windows Firewall

Open required ports for external access:

```powershell
# HTTPS (nginx)
New-NetFirewallRule -DisplayName "SKH Storage - HTTPS" `
  -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow

# HTTP (redirect to HTTPS)
New-NetFirewallRule -DisplayName "SKH Storage - HTTP" `
  -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow

# MinIO S3 API (for presigned URLs from browser)
New-NetFirewallRule -DisplayName "SKH Storage - MinIO S3" `
  -Direction Inbound -Protocol TCP -LocalPort 9000 -Action Allow

# (Optional) MinIO Console — only if you want remote admin access
# New-NetFirewallRule -DisplayName "SKH Storage - MinIO Console" `
#   -Direction Inbound -Protocol TCP -LocalPort 9001 -Action Allow
```

---

## Step 9: Verify Full Deployment

### 9.1 Service Status

```powershell
# All Windows Services
Get-Service MinIO, Memurai, postgresql*, nginx | Format-Table Name, Status

# PM2 processes
pm2 list
```

Expected:
```
Name         Status
----         ------
MinIO        Running
Memurai      Running
postgresql-* Running
nginx        Running

┌──────────────┬────┬──────┬────────┐
│ name         │ id │ mode │ status │
├──────────────┼────┼──────┼────────┤
│ storage-api  │ 0  │ fork │ online │
│ admin-ui     │ 1  │ fork │ online │
└──────────────┴────┴──────┴────────┘
```

### 9.2 Health Checks

```powershell
# MinIO
curl http://localhost:9000/minio/health/live

# NestJS API
curl http://localhost:4000/api/v1/health

# nginx → API
curl -k https://localhost/api/v1/health

# nginx → Frontend
curl -k https://localhost/ -o /dev/null -w "%{http_code}"
# Expected: 200
```

### 9.3 Functional Tests

Open a browser and navigate to `https://YOUR_DOMAIN`:

| Test | Steps | Expected |
|------|-------|----------|
| Login | Enter `admin@example.com` / `admin123` | Dashboard loads |
| Create App | Applications → Create | New application appears |
| Create Bucket | Buckets → Create | Bucket created in MinIO |
| Upload File | Open bucket → Upload | File stored in MinIO |
| Download File | Click download icon | File downloads via presigned URL |
| Thumbnail | Upload an image | Thumbnail auto-generated |
| Share Link | Select file → Share | Shareable link created |
| Recycle Bin | Delete file → Recycle Bin tab | File appears, can restore |
| MinIO Console | http://localhost:9001 | See buckets and objects |

---

## Data Migration (from existing Garage instance)

If migrating from a Garage deployment with existing data:

```powershell
# Download mc.exe if not already present
# (setup-minio.ps1 already downloads it to C:\MinIO\mc.exe)

# Set up aliases
C:\MinIO\mc.exe alias set garage http://OLD_GARAGE_IP:9004 GARAGE_ACCESS_KEY GARAGE_SECRET_KEY
C:\MinIO\mc.exe alias set minio http://localhost:9000 MINIO_ACCESS_KEY MINIO_SECRET_KEY

# List buckets from old Garage
C:\MinIO\mc.exe ls garage

# For each bucket (use the exact garage_bucket_id values from the database):
C:\MinIO\mc.exe mb minio/BUCKET_NAME
C:\MinIO\mc.exe mirror garage/BUCKET_NAME minio/BUCKET_NAME --preserve

# After migration, verify file counts match
C:\MinIO\mc.exe ls --recursive --summarize garage/BUCKET_NAME
C:\MinIO\mc.exe ls --recursive --summarize minio/BUCKET_NAME
```

After data migration, use the Admin Dashboard:
1. Go to each bucket → click "Sync from S3" to reconcile any differences
2. Go to Orphan Files → Scan to verify no orphans exist

---

## Updating the Application

```powershell
cd C:\Apps\garageStorage

# Pull latest code
git pull origin main

# Backend
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build

# Frontend
cd ..\frontend
npm ci
npm run build

# Restart PM2 processes
cd ..
pm2 restart all
```

---

## Troubleshooting

### PM2 process keeps restarting

```powershell
pm2 logs storage-api --lines 50
pm2 logs admin-ui --lines 50
```

Common causes:
- Missing `.env` file or variables → check `C:\Apps\garageStorage\.env`
- Database not reachable → check PostgreSQL service and `DATABASE_URL`
- Redis not reachable → check Memurai service and `REDIS_*` vars

### Presigned URLs fail (AccessDenied / SignatureDoesNotMatch)

The hostname in `S3_PUBLIC_ENDPOINT` must **exactly match** the URL the browser uses. Presigned URL signatures include the hostname.

```
# Wrong: signed with localhost but browser accesses via IP
S3_PUBLIC_ENDPOINT=http://localhost:9000    ← backend signs with this
Browser opens: http://192.168.1.100:9000   ← signature mismatch!

# Correct: signed with the IP that browsers use
S3_PUBLIC_ENDPOINT=http://192.168.1.100:9000
```

If proxying MinIO through nginx with SSL:
```
S3_PUBLIC_ENDPOINT=https://s3.yourdomain.com
```

### MinIO service won't start

```powershell
# Check NSSM logs
Get-Content C:\MinIO\minio-stderr.log -Tail 30

# Common issue: port already in use
netstat -an | findstr :9000
```

### Database migration fails

```powershell
cd C:\Apps\garageStorage\backend

# Check current migration status
npx prisma migrate status

# Force reset (CAUTION: destroys all data)
# npx prisma migrate reset
```

### nginx returns 502 Bad Gateway

API or frontend is not running:
```powershell
pm2 list
# If offline, restart:
pm2 restart storage-api
pm2 restart admin-ui
```

---

## Backup Strategy

### Database

```powershell
# Scheduled backup (add to Windows Task Scheduler)
& "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" `
  -U postgres -F c -b -v `
  -f "C:\Backups\garageStorage_$(Get-Date -Format 'yyyyMMdd_HHmmss').dump" `
  garageStorage
```

### MinIO Data

```powershell
# Mirror all buckets to a backup location
C:\MinIO\mc.exe mirror minio/ C:\Backups\minio-data\ --preserve
```

### Application Config

```powershell
# Backup .env (contains secrets)
Copy-Item C:\Apps\garageStorage\.env "C:\Backups\.env.$(Get-Date -Format 'yyyyMMdd')"
```

---

## Quick Reference: Service Management

| Action | Command |
|--------|---------|
| Start API | `pm2 start storage-api` |
| Stop API | `pm2 stop storage-api` |
| Restart all | `pm2 restart all` |
| View logs | `pm2 logs` |
| Start MinIO | `nssm start MinIO` |
| Stop MinIO | `nssm stop MinIO` |
| Start nginx | `nssm start nginx` |
| Reload nginx | `C:\nginx\nginx.exe -s reload` |
| Start Memurai | `Start-Service Memurai` |
| Start PostgreSQL | `Start-Service postgresql*` |
| All service status | `Get-Service MinIO, Memurai, postgresql*, nginx` |

---

## Lessons Learned (First Deployment 2026-03-14)

These issues were encountered during the first clean deployment on Windows Server 2022.

### 1. Git Bash Expands Env Vars Starting with `/`

MSYS2 (Git Bash) automatically expands values starting with `/` to Windows paths. This breaks Next.js build when `NEXT_PUBLIC_API_URL=/api/v1` becomes `C:/Program Files/Git/api/v1`.

**Fix:** Prefix with `MSYS_NO_PATHCONV=1` or use full URLs:
```bash
MSYS_NO_PATHCONV=1 NEXT_PUBLIC_API_URL=http://localhost:4001/api/v1 npm run build
```

### 2. PM2 Cannot Run `.bin` Shell Scripts on Windows

`node_modules/.bin/next` is a bash script. PM2 tries to execute it with Node.js and fails with a SyntaxError.

**Fix:** Point PM2 to the actual Node.js entry file:
```javascript
// ecosystem.config.js
script: 'node_modules/next/dist/bin/next',  // NOT 'node_modules/.bin/next'
```

### 3. Prisma 7.x Requires Adapter in Seed Script

When using the `@prisma/adapter-pg` driver adapter pattern, `new PrismaClient()` without an adapter argument fails. The seed script must use the same adapter pattern.

**Fix:**
```typescript
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
```

### 4. Prisma CLI Needs `--config` Flag

`prisma migrate deploy` and `prisma db seed` fail without explicitly pointing to `prisma.config.ts`:
```bash
npx prisma migrate deploy --config ./prisma/prisma.config.ts
```

Also copy `.env` into the `backend/` directory — Prisma CLI loads dotenv from CWD, not from the project root.

### 5. NSSM Environment Changes Require Stop/Start

Setting `AppEnvironmentExtra` via NSSM does not hot-reload. You must stop and restart the service:
```powershell
nssm stop MinIO
nssm set MinIO AppEnvironmentExtra 'KEY=value'
nssm start MinIO
```

### 6. nginx Reload Needs NSSM on Windows

`nginx.exe -s reload` fails with "Access is denied" when nginx runs as a Windows Service via NSSM. Use NSSM instead:
```powershell
nssm restart nginx   # Instead of: nginx.exe -s reload
```

### 7. Port and Name Conflicts on Shared Servers

When other PM2 apps already occupy ports 3000/4000, choose different ports and use unique PM2 app names:
```powershell
# Always scan first
netstat -an | findstr LISTENING
pm2 list

# Use prefixed names to avoid collisions
name: 'garage-storage-api'   # Not just 'storage-api'
```

### 8. Separate nginx Server Blocks for Co-located Apps

Don't modify existing nginx server blocks. Add a new `server` block on a different port:
```nginx
# New app — separate port, independent of existing config
server {
    listen 9002 ssl;
    ...
}
```
