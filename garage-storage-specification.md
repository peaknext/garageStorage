# Garage Storage Service Specification

> ระบบจัดเก็บไฟล์กลางที่ใช้ Garage (S3-Compatible) สำหรับให้เว็บแอพพลิเคชันต่างๆ เรียกใช้งาน

---

## สารบัญ

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Infrastructure Setup](#3-infrastructure-setup)
4. [Database Design](#4-database-design)
5. [Backend API Specification](#5-backend-api-specification)
6. [Frontend Specification](#6-frontend-specification)
7. [Security & Authentication](#7-security--authentication)
8. [SDK & Integration Guide](#8-sdk--integration-guide)
9. [Deployment Guide](#9-deployment-guide)

---

## 1. Overview

### 1.1 วัตถุประสงค์

สร้างระบบจัดเก็บไฟล์แบบรวมศูนย์ (Centralized File Storage) ที่:

- รองรับหลายแอพพลิเคชัน (Multi-tenant)
- ใช้ Garage เป็น S3-Compatible Object Storage
- มี API สำหรับ Upload/Download/Manage ไฟล์
- มีระบบ Authentication & Authorization
- รองรับการ Quota Management
- มี Admin Dashboard สำหรับจัดการระบบ

### 1.2 Tech Stack

| Layer | Technology |
|-------|------------|
| Object Storage | Garage v2.1.0 (S3-Compatible) |
| Database | PostgreSQL 16 |
| Backend API | NestJS + TypeScript |
| Frontend Admin | Next.js 15 + React 19 |
| ORM | Prisma |
| Container | Docker + Docker Compose |
| Authentication | JWT + API Keys |

### 1.3 ความสามารถหลัก

```
┌─────────────────────────────────────────────────────────────────┐
│                    Garage Storage Service                        │
├─────────────────────────────────────────────────────────────────┤
│  ✓ Multi-tenant Application Support                             │
│  ✓ S3-Compatible API (via Garage)                               │
│  ✓ RESTful API for File Management                              │
│  ✓ Presigned URLs for Direct Upload/Download                    │
│  ✓ Quota Management per Application                             │
│  ✓ File Metadata Management                                     │
│  ✓ Access Control & Permissions                                 │
│  ✓ Admin Dashboard                                              │
│  ✓ Usage Analytics & Monitoring                                 │
│  ✓ Webhook Notifications                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              Client Applications                          │
├──────────────┬──────────────┬──────────────┬──────────────┬──────────────┤
│  OrgConnect  │   App B      │    App C     │    App D     │   Admin UI   │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┘
       │              │              │              │              │
       └──────────────┴──────────────┼──────────────┴──────────────┘
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │     API Gateway / Load LB      │
                    │         (Port: 4000)           │
                    └────────────────┬───────────────┘
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │       Storage API Service      │
                    │          (NestJS)              │
                    │         Port: 4001             │
                    └───────┬───────────────┬────────┘
                            │               │
              ┌─────────────┴───┐       ┌───┴─────────────┐
              ▼                 ▼       ▼                 ▼
    ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
    │   PostgreSQL    │   │     Garage      │   │     Redis       │
    │   Port: 5432    │   │   Port: 3900    │   │   Port: 6379    │
    │ DB: garageStorage│   │ (S3 Compatible) │   │   (Cache)       │
    └─────────────────┘   └─────────────────┘   └─────────────────┘
```

### 2.2 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Storage API Service                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │   Auth      │  │   Files     │  │   Buckets   │  │   Apps     │ │
│  │   Module    │  │   Module    │  │   Module    │  │   Module   │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘ │
│         │                │                │                │        │
│         └────────────────┴────────────────┴────────────────┘        │
│                                   │                                  │
│  ┌────────────────────────────────┴─────────────────────────────┐   │
│  │                      Core Services                           │   │
│  ├──────────────┬──────────────┬──────────────┬─────────────────┤   │
│  │ S3 Service   │ Quota Service│ Webhook Svc  │ Analytics Svc   │   │
│  └──────────────┴──────────────┴──────────────┴─────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 Data Flow

#### Upload Flow

```
Client App                API Service              Garage              PostgreSQL
    │                         │                      │                     │
    │  1. Request Upload URL  │                      │                     │
    ├────────────────────────►│                      │                     │
    │                         │  2. Check Quota      │                     │
    │                         ├─────────────────────────────────────────────►
    │                         │                      │                     │
    │                         │  3. Generate         │                     │
    │                         │     Presigned URL    │                     │
    │                         ├─────────────────────►│                     │
    │                         │◄─────────────────────┤                     │
    │  4. Return Presigned URL│                      │                     │
    │◄────────────────────────┤                      │                     │
    │                         │                      │                     │
    │  5. Direct Upload       │                      │                     │
    ├──────────────────────────────────────────────►│                     │
    │                         │                      │                     │
    │  6. Confirm Upload      │                      │                     │
    ├────────────────────────►│  7. Save Metadata    │                     │
    │                         ├─────────────────────────────────────────────►
    │  8. Return File Info    │                      │                     │
    │◄────────────────────────┤                      │                     │
```

#### Download Flow

```
Client App                API Service              Garage              PostgreSQL
    │                         │                      │                     │
    │  1. Request File        │                      │                     │
    ├────────────────────────►│                      │                     │
    │                         │  2. Check Permission │                     │
    │                         ├─────────────────────────────────────────────►
    │                         │                      │                     │
    │                         │  3. Generate         │                     │
    │                         │     Presigned URL    │                     │
    │                         ├─────────────────────►│                     │
    │  4. Return/Redirect     │                      │                     │
    │◄────────────────────────┤                      │                     │
    │                         │                      │                     │
    │  5. Download File       │                      │                     │
    ├──────────────────────────────────────────────►│                     │
```

---

## 3. Infrastructure Setup

### 3.1 Docker Compose Configuration

```yaml
# docker-compose.yml

version: '3.8'

services:
  # ============================================
  # Garage - S3 Compatible Object Storage
  # ============================================
  garage:
    image: dxflrs/garage:v2.1.0
    container_name: garage-storage
    restart: unless-stopped
    command: server
    ports:
      - "3900:3900"  # S3 API
      - "3901:3901"  # RPC (internal)
      - "3902:3902"  # Web serving
      - "3903:3903"  # Admin API
    volumes:
      - ./garage/garage.toml:/etc/garage.toml:ro
      - garage-meta:/var/lib/garage/meta
      - garage-data:/var/lib/garage/data
    environment:
      - RUST_LOG=garage=info
    networks:
      - storage-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3903/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ============================================
  # Garage WebUI (Optional)
  # ============================================
  garage-webui:
    image: khairul169/garage-webui:latest
    container_name: garage-webui
    restart: unless-stopped
    ports:
      - "3909:3909"
    volumes:
      - ./garage/garage.toml:/etc/garage.toml:ro
    environment:
      - API_BASE_URL=http://garage:3903
      - S3_ENDPOINT_URL=http://garage:3900
    depends_on:
      - garage
    networks:
      - storage-network

  # ============================================
  # PostgreSQL Database
  # ============================================
  postgres:
    image: postgres:16-alpine
    container_name: garage-postgres
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: garage_admin
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-your_secure_password}
      POSTGRES_DB: garageStorage
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./init-scripts:/docker-entrypoint-initdb.d:ro
    networks:
      - storage-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U garage_admin -d garageStorage"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ============================================
  # Redis Cache
  # ============================================
  redis:
    image: redis:7-alpine
    container_name: garage-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:-redis_password}
    volumes:
      - redis-data:/data
    networks:
      - storage-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ============================================
  # Storage API Service (NestJS)
  # ============================================
  storage-api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: storage-api
    restart: unless-stopped
    ports:
      - "4001:4001"
    environment:
      - NODE_ENV=production
      - PORT=4001
      - DATABASE_URL=postgresql://garage_admin:${POSTGRES_PASSWORD:-your_secure_password}@postgres:5432/garageStorage
      - REDIS_URL=redis://:${REDIS_PASSWORD:-redis_password}@redis:6379
      - GARAGE_ENDPOINT=http://garage:3900
      - GARAGE_REGION=garage
      - GARAGE_ACCESS_KEY=${GARAGE_ACCESS_KEY}
      - GARAGE_SECRET_KEY=${GARAGE_SECRET_KEY}
      - JWT_SECRET=${JWT_SECRET}
      - JWT_EXPIRES_IN=7d
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      garage:
        condition: service_healthy
    networks:
      - storage-network

  # ============================================
  # Admin Frontend (Next.js)
  # ============================================
  admin-ui:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: storage-admin-ui
    restart: unless-stopped
    ports:
      - "4000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://storage-api:4001
      - NEXT_PUBLIC_GARAGE_ENDPOINT=http://localhost:3900
    depends_on:
      - storage-api
    networks:
      - storage-network

volumes:
  garage-meta:
    driver: local
  garage-data:
    driver: local
  postgres-data:
    driver: local
  redis-data:
    driver: local

networks:
  storage-network:
    driver: bridge
```

### 3.2 Garage Configuration

```toml
# garage/garage.toml

# ===========================================
# Garage Configuration for Storage Service
# ===========================================

# Metadata directory (recommend SSD)
metadata_dir = "/var/lib/garage/meta"

# Data directory (main storage)
data_dir = "/var/lib/garage/data"

# Database engine: sqlite (testing) or lmdb (production)
db_engine = "lmdb"

# Auto snapshot metadata every 6 hours
metadata_auto_snapshot_interval = "6h"

# Replication factor (1 for single node, 3 for cluster)
replication_factor = 1

# Compression level (0-9, 2 is good balance)
compression_level = 2

# Block size for chunking large files
block_size = "1M"

# ===========================================
# RPC Configuration
# ===========================================
rpc_bind_addr = "[::]:3901"
rpc_public_addr = "127.0.0.1:3901"

# RPC secret (generate with: openssl rand -hex 32)
rpc_secret = "YOUR_RPC_SECRET_HERE"

# ===========================================
# S3 API Configuration
# ===========================================
[s3_api]
s3_region = "garage"
api_bind_addr = "[::]:3900"
root_domain = ".s3.storage.local"

# ===========================================
# S3 Web Static Hosting
# ===========================================
[s3_web]
bind_addr = "[::]:3902"
root_domain = ".web.storage.local"
index = "index.html"

# ===========================================
# K2V API (Key-Value Store)
# ===========================================
[k2v_api]
api_bind_addr = "[::]:3904"

# ===========================================
# Admin API Configuration
# ===========================================
[admin]
api_bind_addr = "[::]:3903"

# Admin token (generate with: openssl rand -base64 32)
admin_token = "YOUR_ADMIN_TOKEN_HERE"

# Metrics token for monitoring
metrics_token = "YOUR_METRICS_TOKEN_HERE"
```

### 3.3 Environment Variables

```bash
# .env

# ===========================================
# PostgreSQL Configuration
# ===========================================
POSTGRES_PASSWORD=your_very_secure_password_here
POSTGRES_USER=garage_admin
POSTGRES_DB=garageStorage

# ===========================================
# Redis Configuration
# ===========================================
REDIS_PASSWORD=redis_secure_password

# ===========================================
# Garage S3 Credentials
# (Generate using garage CLI after setup)
# ===========================================
GARAGE_ACCESS_KEY=GK_YOUR_ACCESS_KEY
GARAGE_SECRET_KEY=your_secret_key_here

# ===========================================
# JWT Configuration
# ===========================================
JWT_SECRET=your_jwt_secret_key_at_least_32_chars
JWT_EXPIRES_IN=7d

# ===========================================
# Application Settings
# ===========================================
NODE_ENV=production
API_PORT=4001
ADMIN_UI_PORT=4000

# ===========================================
# Storage Defaults
# ===========================================
DEFAULT_BUCKET_QUOTA_GB=10
MAX_FILE_SIZE_MB=100
PRESIGNED_URL_EXPIRES_SECONDS=3600
```

### 3.4 Garage Initial Setup Script

```bash
#!/bin/bash
# scripts/setup-garage.sh

# Wait for Garage to be ready
echo "Waiting for Garage to start..."
sleep 5

# Get node ID
NODE_ID=$(docker exec garage-storage /garage node id | head -n 1 | tr -d '\r\n' | cut -d'@' -f1)
echo "Node ID: $NODE_ID"

# Assign layout
docker exec garage-storage /garage layout assign -z dc1 -c 100G "$NODE_ID"

# Apply layout
docker exec garage-storage /garage layout apply --version 1

echo "Layout applied successfully!"

# Create main bucket for the service
docker exec garage-storage /garage bucket create storage-service

# Create API key
KEY_OUTPUT=$(docker exec garage-storage /garage key create storage-api-key)
echo "$KEY_OUTPUT"

# Extract credentials
ACCESS_KEY=$(echo "$KEY_OUTPUT" | grep "Key ID:" | awk '{print $NF}')
SECRET_KEY=$(echo "$KEY_OUTPUT" | grep "Secret key:" | awk '{print $NF}')

echo "================================"
echo "Garage Setup Complete!"
echo "================================"
echo "Access Key: $ACCESS_KEY"
echo "Secret Key: $SECRET_KEY"
echo ""
echo "Add these to your .env file:"
echo "GARAGE_ACCESS_KEY=$ACCESS_KEY"
echo "GARAGE_SECRET_KEY=$SECRET_KEY"

# Grant permissions
docker exec garage-storage /garage bucket allow \
  --read --write --owner \
  storage-service \
  --key storage-api-key

echo "Bucket permissions granted!"
```

---

## 4. Database Design

### 4.1 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Database Schema (garageStorage)                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│   applications   │       │     buckets      │       │      files       │
├──────────────────┤       ├──────────────────┤       ├──────────────────┤
│ id (PK)          │───┐   │ id (PK)          │───┐   │ id (PK)          │
│ name             │   │   │ name             │   │   │ key              │
│ slug             │   │   │ app_id (FK)      │◄──┘   │ bucket_id (FK)   │◄──┐
│ description      │   │   │ garage_bucket_id │       │ original_name    │   │
│ api_key_hash     │   └──►│ quota_bytes      │       │ mime_type        │   │
│ webhook_url      │       │ used_bytes       │       │ size_bytes       │   │
│ allowed_origins  │       │ is_public        │       │ checksum         │   │
│ status           │       │ created_at       │       │ metadata         │   │
│ created_at       │       │ updated_at       │       │ uploaded_by      │   │
│ updated_at       │       └──────────────────┘       │ is_public        │   │
└──────────────────┘                                  │ download_count   │   │
        │                                             │ created_at       │   │
        │           ┌──────────────────┐              │ updated_at       │   │
        │           │   admin_users    │              └──────────────────┘   │
        │           ├──────────────────┤                                     │
        │           │ id (PK)          │              ┌──────────────────┐   │
        │           │ email            │              │   file_shares    │   │
        │           │ password_hash    │              ├──────────────────┤   │
        │           │ name             │              │ id (PK)          │   │
        │           │ role             │              │ file_id (FK)     │◄──┘
        │           │ created_at       │              │ token            │
        │           │ updated_at       │              │ expires_at       │
        │           └──────────────────┘              │ max_downloads    │
        │                                             │ download_count   │
        │           ┌──────────────────┐              │ password_hash    │
        │           │   access_logs    │              │ created_at       │
        │           ├──────────────────┤              └──────────────────┘
        └──────────►│ id (PK)          │
                    │ app_id (FK)      │              ┌──────────────────┐
                    │ action           │              │    webhooks      │
                    │ resource_type    │              ├──────────────────┤
                    │ resource_id      │              │ id (PK)          │
                    │ ip_address       │              │ app_id (FK)      │
                    │ user_agent       │              │ url              │
                    │ metadata         │              │ events           │
                    │ created_at       │              │ secret           │
                    └──────────────────┘              │ is_active        │
                                                      │ created_at       │
                                                      └──────────────────┘
```

### 4.2 Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ===========================================
// Application (Tenant) Model
// ===========================================
model Application {
  id             String   @id @default(uuid())
  name           String
  slug           String   @unique
  description    String?
  apiKeyHash     String   @map("api_key_hash")
  webhookUrl     String?  @map("webhook_url")
  allowedOrigins String[] @map("allowed_origins")
  status         AppStatus @default(ACTIVE)
  
  // Quota settings
  maxStorageBytes BigInt  @default(10737418240) @map("max_storage_bytes") // 10GB default
  usedStorageBytes BigInt @default(0) @map("used_storage_bytes")
  
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  // Relations
  buckets        Bucket[]
  accessLogs     AccessLog[]
  webhooks       Webhook[]

  @@map("applications")
}

enum AppStatus {
  ACTIVE
  SUSPENDED
  DELETED
}

// ===========================================
// Bucket Model
// ===========================================
model Bucket {
  id              String   @id @default(uuid())
  name            String
  garageBucketId  String   @unique @map("garage_bucket_id")
  
  // Quota (optional per-bucket limit)
  quotaBytes      BigInt?  @map("quota_bytes")
  usedBytes       BigInt   @default(0) @map("used_bytes")
  
  // Settings
  isPublic        Boolean  @default(false) @map("is_public")
  corsEnabled     Boolean  @default(true) @map("cors_enabled")
  versioningEnabled Boolean @default(false) @map("versioning_enabled")
  
  // Lifecycle rules (JSON)
  lifecycleRules  Json?    @map("lifecycle_rules")
  
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  // Relations
  applicationId   String   @map("app_id")
  application     Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  files           File[]

  @@unique([applicationId, name])
  @@map("buckets")
}

// ===========================================
// File Model
// ===========================================
model File {
  id            String   @id @default(uuid())
  key           String   // S3 object key
  originalName  String   @map("original_name")
  mimeType      String   @map("mime_type")
  sizeBytes     BigInt   @map("size_bytes")
  checksum      String?  // MD5 or SHA256
  etag          String?  // S3 ETag
  
  // Metadata (flexible JSON)
  metadata      Json?
  
  // Access control
  isPublic      Boolean  @default(false) @map("is_public")
  uploadedBy    String?  @map("uploaded_by") // External user ID
  
  // Statistics
  downloadCount Int      @default(0) @map("download_count")
  lastAccessedAt DateTime? @map("last_accessed_at")
  
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  // Relations
  bucketId      String   @map("bucket_id")
  bucket        Bucket   @relation(fields: [bucketId], references: [id], onDelete: Cascade)
  shares        FileShare[]

  @@unique([bucketId, key])
  @@index([bucketId])
  @@index([mimeType])
  @@index([uploadedBy])
  @@map("files")
}

// ===========================================
// File Share Model (Shareable Links)
// ===========================================
model FileShare {
  id            String   @id @default(uuid())
  token         String   @unique @default(uuid())
  
  // Expiration
  expiresAt     DateTime? @map("expires_at")
  
  // Download limits
  maxDownloads  Int?     @map("max_downloads")
  downloadCount Int      @default(0) @map("download_count")
  
  // Optional password protection
  passwordHash  String?  @map("password_hash")
  
  // Settings
  allowPreview  Boolean  @default(true) @map("allow_preview")
  
  createdAt     DateTime @default(now()) @map("created_at")

  // Relations
  fileId        String   @map("file_id")
  file          File     @relation(fields: [fileId], references: [id], onDelete: Cascade)

  @@map("file_shares")
}

// ===========================================
// Admin Users Model
// ===========================================
model AdminUser {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String    @map("password_hash")
  name         String
  role         AdminRole @default(VIEWER)
  
  lastLoginAt  DateTime? @map("last_login_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  @@map("admin_users")
}

enum AdminRole {
  SUPER_ADMIN
  ADMIN
  VIEWER
}

// ===========================================
// Access Logs Model
// ===========================================
model AccessLog {
  id           String   @id @default(uuid())
  action       String   // UPLOAD, DOWNLOAD, DELETE, etc.
  resourceType String   @map("resource_type") // FILE, BUCKET, etc.
  resourceId   String?  @map("resource_id")
  
  // Request info
  ipAddress    String?  @map("ip_address")
  userAgent    String?  @map("user_agent")
  
  // Additional metadata
  metadata     Json?
  
  createdAt    DateTime @default(now()) @map("created_at")

  // Relations
  applicationId String  @map("app_id")
  application  Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@index([applicationId])
  @@index([action])
  @@index([createdAt])
  @@map("access_logs")
}

// ===========================================
// Webhooks Model
// ===========================================
model Webhook {
  id        String   @id @default(uuid())
  url       String
  events    String[] // Array of event types
  secret    String   // For signature verification
  isActive  Boolean  @default(true) @map("is_active")
  
  // Stats
  lastTriggeredAt DateTime? @map("last_triggered_at")
  failureCount    Int       @default(0) @map("failure_count")
  
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  // Relations
  applicationId String @map("app_id")
  application  Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@map("webhooks")
}
```

### 4.3 Database Indexes & Optimization

```sql
-- migrations/add_indexes.sql

-- Performance indexes for common queries
CREATE INDEX CONCURRENTLY idx_files_created_at ON files (created_at DESC);
CREATE INDEX CONCURRENTLY idx_files_size ON files (size_bytes);
CREATE INDEX CONCURRENTLY idx_files_public ON files (bucket_id) WHERE is_public = true;

-- Full-text search on file names
CREATE INDEX CONCURRENTLY idx_files_name_search 
ON files USING gin(to_tsvector('english', original_name));

-- Access logs partitioning (optional for high volume)
CREATE INDEX CONCURRENTLY idx_access_logs_created_at 
ON access_logs (created_at DESC);

-- Composite index for bucket quota calculations
CREATE INDEX CONCURRENTLY idx_files_bucket_size 
ON files (bucket_id, size_bytes);
```

---

## 5. Backend API Specification

### 5.1 Project Structure

```
backend/
├── src/
│   ├── app.module.ts
│   ├── main.ts
│   │
│   ├── common/
│   │   ├── decorators/
│   │   │   ├── api-key.decorator.ts
│   │   │   ├── current-app.decorator.ts
│   │   │   └── public.decorator.ts
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts
│   │   ├── guards/
│   │   │   ├── api-key.guard.ts
│   │   │   ├── jwt-auth.guard.ts
│   │   │   └── admin.guard.ts
│   │   ├── interceptors/
│   │   │   ├── logging.interceptor.ts
│   │   │   └── transform.interceptor.ts
│   │   ├── pipes/
│   │   │   └── validation.pipe.ts
│   │   └── utils/
│   │       ├── hash.util.ts
│   │       └── pagination.util.ts
│   │
│   ├── config/
│   │   ├── configuration.ts
│   │   ├── database.config.ts
│   │   └── s3.config.ts
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── strategies/
│   │   │   │   ├── jwt.strategy.ts
│   │   │   │   └── api-key.strategy.ts
│   │   │   └── dto/
│   │   │       ├── login.dto.ts
│   │   │       └── register.dto.ts
│   │   │
│   │   ├── applications/
│   │   │   ├── applications.module.ts
│   │   │   ├── applications.controller.ts
│   │   │   ├── applications.service.ts
│   │   │   └── dto/
│   │   │       ├── create-application.dto.ts
│   │   │       └── update-application.dto.ts
│   │   │
│   │   ├── buckets/
│   │   │   ├── buckets.module.ts
│   │   │   ├── buckets.controller.ts
│   │   │   ├── buckets.service.ts
│   │   │   └── dto/
│   │   │       ├── create-bucket.dto.ts
│   │   │       └── update-bucket.dto.ts
│   │   │
│   │   ├── files/
│   │   │   ├── files.module.ts
│   │   │   ├── files.controller.ts
│   │   │   ├── files.service.ts
│   │   │   └── dto/
│   │   │       ├── upload-file.dto.ts
│   │   │       ├── file-response.dto.ts
│   │   │       └── presigned-url.dto.ts
│   │   │
│   │   ├── shares/
│   │   │   ├── shares.module.ts
│   │   │   ├── shares.controller.ts
│   │   │   ├── shares.service.ts
│   │   │   └── dto/
│   │   │       └── create-share.dto.ts
│   │   │
│   │   ├── webhooks/
│   │   │   ├── webhooks.module.ts
│   │   │   ├── webhooks.controller.ts
│   │   │   ├── webhooks.service.ts
│   │   │   └── dto/
│   │   │       └── create-webhook.dto.ts
│   │   │
│   │   └── analytics/
│   │       ├── analytics.module.ts
│   │       ├── analytics.controller.ts
│   │       └── analytics.service.ts
│   │
│   ├── services/
│   │   ├── s3/
│   │   │   ├── s3.module.ts
│   │   │   └── s3.service.ts
│   │   ├── cache/
│   │   │   ├── cache.module.ts
│   │   │   └── cache.service.ts
│   │   └── queue/
│   │       ├── queue.module.ts
│   │       └── queue.service.ts
│   │
│   └── prisma/
│       ├── prisma.module.ts
│       └── prisma.service.ts
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── test/
│   ├── e2e/
│   └── unit/
│
├── Dockerfile
├── package.json
├── tsconfig.json
└── nest-cli.json
```

### 5.2 API Endpoints

#### 5.2.1 Authentication APIs

```yaml
# Auth Endpoints (Admin)

POST /api/v1/auth/login:
  description: Admin login
  request:
    body:
      email: string
      password: string
  response:
    200:
      accessToken: string
      refreshToken: string
      user:
        id: string
        email: string
        name: string
        role: string

POST /api/v1/auth/refresh:
  description: Refresh access token
  request:
    body:
      refreshToken: string
  response:
    200:
      accessToken: string

POST /api/v1/auth/logout:
  description: Logout and invalidate tokens
  headers:
    Authorization: Bearer {token}
  response:
    200:
      message: "Logged out successfully"
```

#### 5.2.2 Application Management APIs

```yaml
# Application (Tenant) Endpoints

GET /api/v1/applications:
  description: List all applications (Admin only)
  headers:
    Authorization: Bearer {admin_token}
  query:
    page: number (default: 1)
    limit: number (default: 20)
    status: string (optional)
    search: string (optional)
  response:
    200:
      data: Application[]
      meta:
        total: number
        page: number
        limit: number
        totalPages: number

POST /api/v1/applications:
  description: Create new application
  headers:
    Authorization: Bearer {admin_token}
  request:
    body:
      name: string (required)
      slug: string (required, unique)
      description: string (optional)
      webhookUrl: string (optional)
      allowedOrigins: string[] (optional)
      maxStorageBytes: number (optional, default: 10GB)
  response:
    201:
      id: string
      name: string
      slug: string
      apiKey: string  # Only returned on creation!
      createdAt: string

GET /api/v1/applications/{id}:
  description: Get application details
  headers:
    Authorization: Bearer {admin_token}
  response:
    200:
      id: string
      name: string
      slug: string
      description: string
      status: string
      maxStorageBytes: number
      usedStorageBytes: number
      bucketCount: number
      fileCount: number
      createdAt: string
      updatedAt: string

PATCH /api/v1/applications/{id}:
  description: Update application
  headers:
    Authorization: Bearer {admin_token}
  request:
    body:
      name: string (optional)
      description: string (optional)
      webhookUrl: string (optional)
      allowedOrigins: string[] (optional)
      maxStorageBytes: number (optional)
      status: string (optional)
  response:
    200:
      id: string
      name: string
      updatedAt: string

POST /api/v1/applications/{id}/regenerate-key:
  description: Regenerate API key
  headers:
    Authorization: Bearer {admin_token}
  response:
    200:
      apiKey: string  # New API key

DELETE /api/v1/applications/{id}:
  description: Delete application (soft delete)
  headers:
    Authorization: Bearer {admin_token}
  response:
    204: No Content
```

#### 5.2.3 Bucket Management APIs

```yaml
# Bucket Endpoints (Requires API Key)

GET /api/v1/buckets:
  description: List buckets for current application
  headers:
    X-API-Key: {api_key}
  query:
    page: number
    limit: number
  response:
    200:
      data:
        - id: string
          name: string
          usedBytes: number
          quotaBytes: number
          fileCount: number
          isPublic: boolean
          createdAt: string
      meta:
        total: number

POST /api/v1/buckets:
  description: Create new bucket
  headers:
    X-API-Key: {api_key}
  request:
    body:
      name: string (required, alphanumeric with hyphens)
      quotaBytes: number (optional)
      isPublic: boolean (optional, default: false)
      corsEnabled: boolean (optional, default: true)
  response:
    201:
      id: string
      name: string
      garageBucketId: string
      createdAt: string

GET /api/v1/buckets/{id}:
  description: Get bucket details
  headers:
    X-API-Key: {api_key}
  response:
    200:
      id: string
      name: string
      usedBytes: number
      quotaBytes: number
      fileCount: number
      isPublic: boolean
      corsEnabled: boolean
      versioningEnabled: boolean
      createdAt: string
      updatedAt: string

PATCH /api/v1/buckets/{id}:
  description: Update bucket settings
  headers:
    X-API-Key: {api_key}
  request:
    body:
      quotaBytes: number (optional)
      isPublic: boolean (optional)
      corsEnabled: boolean (optional)
  response:
    200:
      id: string
      updatedAt: string

DELETE /api/v1/buckets/{id}:
  description: Delete bucket (must be empty)
  headers:
    X-API-Key: {api_key}
  query:
    force: boolean (optional, delete with contents)
  response:
    204: No Content
```

#### 5.2.4 File Management APIs

```yaml
# File Endpoints (Requires API Key)

GET /api/v1/buckets/{bucketId}/files:
  description: List files in bucket
  headers:
    X-API-Key: {api_key}
  query:
    page: number (default: 1)
    limit: number (default: 50)
    prefix: string (optional, filter by key prefix)
    mimeType: string (optional, filter by MIME type)
    sort: string (optional: createdAt, size, name)
    order: string (optional: asc, desc)
  response:
    200:
      data:
        - id: string
          key: string
          originalName: string
          mimeType: string
          sizeBytes: number
          isPublic: boolean
          downloadCount: number
          createdAt: string
          url: string  # Presigned URL (short-lived)
      meta:
        total: number
        page: number
        limit: number

POST /api/v1/buckets/{bucketId}/files/presigned-upload:
  description: Get presigned URL for direct upload
  headers:
    X-API-Key: {api_key}
  request:
    body:
      key: string (required, file path/name)
      contentType: string (required, MIME type)
      contentLength: number (required, file size in bytes)
      metadata: object (optional)
      isPublic: boolean (optional)
  response:
    200:
      uploadUrl: string       # Presigned PUT URL
      uploadId: string        # Internal upload ID for confirmation
      expiresAt: string       # URL expiration time
      headers:                # Required headers for upload
        Content-Type: string
        x-amz-meta-*: string

POST /api/v1/buckets/{bucketId}/files/confirm-upload:
  description: Confirm file upload and save metadata
  headers:
    X-API-Key: {api_key}
  request:
    body:
      uploadId: string (required)
      etag: string (optional, from S3 response)
  response:
    201:
      id: string
      key: string
      originalName: string
      mimeType: string
      sizeBytes: number
      url: string
      createdAt: string

POST /api/v1/buckets/{bucketId}/files/upload:
  description: Direct upload (for small files < 10MB)
  headers:
    X-API-Key: {api_key}
    Content-Type: multipart/form-data
  request:
    form:
      file: File (required)
      key: string (optional, auto-generated if not provided)
      metadata: JSON string (optional)
      isPublic: boolean (optional)
  response:
    201:
      id: string
      key: string
      originalName: string
      mimeType: string
      sizeBytes: number
      url: string
      createdAt: string

GET /api/v1/buckets/{bucketId}/files/{fileId}:
  description: Get file details
  headers:
    X-API-Key: {api_key}
  response:
    200:
      id: string
      key: string
      originalName: string
      mimeType: string
      sizeBytes: number
      checksum: string
      metadata: object
      isPublic: boolean
      uploadedBy: string
      downloadCount: number
      lastAccessedAt: string
      createdAt: string
      updatedAt: string

GET /api/v1/buckets/{bucketId}/files/{fileId}/download:
  description: Get download URL or redirect
  headers:
    X-API-Key: {api_key}
  query:
    redirect: boolean (optional, default: false)
    expiresIn: number (optional, seconds, default: 3600)
  response:
    200:
      url: string
      expiresAt: string
    # Or 302 redirect if redirect=true

PATCH /api/v1/buckets/{bucketId}/files/{fileId}:
  description: Update file metadata
  headers:
    X-API-Key: {api_key}
  request:
    body:
      metadata: object (optional)
      isPublic: boolean (optional)
  response:
    200:
      id: string
      updatedAt: string

DELETE /api/v1/buckets/{bucketId}/files/{fileId}:
  description: Delete file
  headers:
    X-API-Key: {api_key}
  response:
    204: No Content

POST /api/v1/buckets/{bucketId}/files/bulk-delete:
  description: Delete multiple files
  headers:
    X-API-Key: {api_key}
  request:
    body:
      fileIds: string[] (required, max 100)
  response:
    200:
      deleted: number
      failed: string[]
```

#### 5.2.5 File Sharing APIs

```yaml
# Share Endpoints

POST /api/v1/files/{fileId}/shares:
  description: Create shareable link
  headers:
    X-API-Key: {api_key}
  request:
    body:
      expiresIn: number (optional, seconds)
      maxDownloads: number (optional)
      password: string (optional)
      allowPreview: boolean (optional)
  response:
    201:
      id: string
      token: string
      shareUrl: string
      expiresAt: string
      maxDownloads: number
      createdAt: string

GET /api/v1/shares/{token}:
  description: Get shared file info (Public)
  query:
    password: string (optional, if protected)
  response:
    200:
      fileName: string
      mimeType: string
      sizeBytes: number
      allowPreview: boolean
      downloadUrl: string  # One-time presigned URL

GET /api/v1/shares/{token}/download:
  description: Download shared file (Public)
  query:
    password: string (optional)
  response:
    302: Redirect to presigned URL
    # Or stream file directly

DELETE /api/v1/files/{fileId}/shares/{shareId}:
  description: Revoke share link
  headers:
    X-API-Key: {api_key}
  response:
    204: No Content
```

#### 5.2.6 Analytics & Stats APIs

```yaml
# Analytics Endpoints

GET /api/v1/analytics/overview:
  description: Get storage overview (Admin or API Key)
  headers:
    X-API-Key: {api_key}  # Or Admin token
  query:
    from: string (optional, ISO date)
    to: string (optional, ISO date)
  response:
    200:
      totalStorage:
        usedBytes: number
        quotaBytes: number
        percentage: number
      files:
        total: number
        uploadedToday: number
        uploadedThisMonth: number
      downloads:
        total: number
        today: number
        thisMonth: number
      topBuckets:
        - name: string
          usedBytes: number
          fileCount: number

GET /api/v1/analytics/usage:
  description: Get usage over time
  headers:
    X-API-Key: {api_key}
  query:
    from: string (required, ISO date)
    to: string (required, ISO date)
    interval: string (optional: hour, day, week, month)
  response:
    200:
      data:
        - timestamp: string
          uploadsCount: number
          uploadBytes: number
          downloadsCount: number
          downloadBytes: number

GET /api/v1/analytics/files/top:
  description: Get top downloaded files
  headers:
    X-API-Key: {api_key}
  query:
    limit: number (default: 10)
    period: string (optional: day, week, month, all)
  response:
    200:
      data:
        - fileId: string
          fileName: string
          downloadCount: number
          sizeBytes: number
```

### 5.3 Core Service Implementation

#### S3 Service

```typescript
// src/services/s3/s3.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
  private readonly s3Client: S3Client;
  private readonly logger = new Logger(S3Service.name);

  constructor(private configService: ConfigService) {
    this.s3Client = new S3Client({
      endpoint: this.configService.get('GARAGE_ENDPOINT'),
      region: this.configService.get('GARAGE_REGION', 'garage'),
      credentials: {
        accessKeyId: this.configService.get('GARAGE_ACCESS_KEY'),
        secretAccessKey: this.configService.get('GARAGE_SECRET_KEY'),
      },
      forcePathStyle: true, // Required for Garage
    });
  }

  /**
   * Create a new bucket in Garage
   */
  async createBucket(bucketName: string): Promise<void> {
    const command = new CreateBucketCommand({ Bucket: bucketName });
    await this.s3Client.send(command);
    this.logger.log(`Bucket created: ${bucketName}`);
  }

  /**
   * Delete a bucket from Garage
   */
  async deleteBucket(bucketName: string): Promise<void> {
    const command = new DeleteBucketCommand({ Bucket: bucketName });
    await this.s3Client.send(command);
    this.logger.log(`Bucket deleted: ${bucketName}`);
  }

  /**
   * Generate presigned URL for upload
   */
  async getPresignedUploadUrl(
    bucket: string,
    key: string,
    contentType: string,
    expiresIn: number = 3600,
    metadata?: Record<string, string>,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      Metadata: metadata,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Generate presigned URL for download
   */
  async getPresignedDownloadUrl(
    bucket: string,
    key: string,
    expiresIn: number = 3600,
    filename?: string,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: filename
        ? `attachment; filename="${encodeURIComponent(filename)}"`
        : undefined,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Upload file directly
   */
  async uploadFile(
    bucket: string,
    key: string,
    body: Buffer | Uint8Array,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<{ etag: string }> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
    });

    const response = await this.s3Client.send(command);
    return { etag: response.ETag || '' };
  }

  /**
   * Delete file
   */
  async deleteFile(bucket: string, key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    await this.s3Client.send(command);
    this.logger.log(`File deleted: ${bucket}/${key}`);
  }

  /**
   * Delete multiple files
   */
  async deleteFiles(
    bucket: string,
    keys: string[],
  ): Promise<{ deleted: string[]; errors: string[] }> {
    const deleted: string[] = [];
    const errors: string[] = [];

    for (const key of keys) {
      try {
        await this.deleteFile(bucket, key);
        deleted.push(key);
      } catch (error) {
        errors.push(key);
        this.logger.error(`Failed to delete ${key}: ${error.message}`);
      }
    }

    return { deleted, errors };
  }

  /**
   * Check if file exists
   */
  async fileExists(bucket: string, key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file metadata from S3
   */
  async getFileMetadata(
    bucket: string,
    key: string,
  ): Promise<{
    contentType: string;
    contentLength: number;
    etag: string;
    lastModified: Date;
    metadata: Record<string, string>;
  }> {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await this.s3Client.send(command);

    return {
      contentType: response.ContentType || 'application/octet-stream',
      contentLength: response.ContentLength || 0,
      etag: response.ETag || '',
      lastModified: response.LastModified || new Date(),
      metadata: response.Metadata || {},
    };
  }

  /**
   * List files in bucket
   */
  async listFiles(
    bucket: string,
    prefix?: string,
    maxKeys: number = 1000,
    continuationToken?: string,
  ): Promise<{
    files: Array<{
      key: string;
      size: number;
      lastModified: Date;
      etag: string;
    }>;
    nextToken?: string;
  }> {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken,
    });

    const response = await this.s3Client.send(command);

    return {
      files: (response.Contents || []).map((obj) => ({
        key: obj.Key || '',
        size: obj.Size || 0,
        lastModified: obj.LastModified || new Date(),
        etag: obj.ETag || '',
      })),
      nextToken: response.NextContinuationToken,
    };
  }
}
```

#### Files Service

```typescript
// src/modules/files/files.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../services/s3/s3.service';
import { CacheService } from '../../services/cache/cache.service';
import { WebhookService } from '../webhooks/webhooks.service';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

@Injectable()
export class FilesService {
  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
    private cache: CacheService,
    private webhook: WebhookService,
  ) {}

  /**
   * Get presigned upload URL
   */
  async getPresignedUploadUrl(
    appId: string,
    bucketId: string,
    dto: PresignedUploadDto,
  ) {
    // Get bucket and verify ownership
    const bucket = await this.getBucketWithQuotaCheck(appId, bucketId, dto.contentLength);

    // Generate unique key if not provided
    const key = dto.key || this.generateFileKey(dto.contentType);

    // Create upload record
    const uploadId = uuidv4();
    await this.cache.set(
      `upload:${uploadId}`,
      JSON.stringify({
        bucketId,
        key,
        contentType: dto.contentType,
        contentLength: dto.contentLength,
        metadata: dto.metadata,
        isPublic: dto.isPublic,
        createdAt: new Date().toISOString(),
      }),
      3600, // 1 hour expiry
    );

    // Generate presigned URL
    const uploadUrl = await this.s3.getPresignedUploadUrl(
      bucket.garageBucketId,
      key,
      dto.contentType,
      3600,
      dto.metadata,
    );

    return {
      uploadUrl,
      uploadId,
      key,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      headers: {
        'Content-Type': dto.contentType,
      },
    };
  }

  /**
   * Confirm upload and create file record
   */
  async confirmUpload(appId: string, bucketId: string, dto: ConfirmUploadDto) {
    // Get upload data from cache
    const uploadData = await this.cache.get(`upload:${dto.uploadId}`);
    if (!uploadData) {
      throw new BadRequestException('Upload session expired or invalid');
    }

    const upload = JSON.parse(uploadData);
    if (upload.bucketId !== bucketId) {
      throw new ForbiddenException('Bucket mismatch');
    }

    // Verify file exists in S3
    const bucket = await this.prisma.bucket.findUnique({
      where: { id: bucketId },
    });

    const exists = await this.s3.fileExists(bucket.garageBucketId, upload.key);
    if (!exists) {
      throw new BadRequestException('File not found in storage');
    }

    // Get actual file metadata from S3
    const s3Metadata = await this.s3.getFileMetadata(
      bucket.garageBucketId,
      upload.key,
    );

    // Create file record
    const file = await this.prisma.file.create({
      data: {
        bucketId,
        key: upload.key,
        originalName: upload.metadata?.originalName || upload.key.split('/').pop(),
        mimeType: upload.contentType,
        sizeBytes: BigInt(s3Metadata.contentLength),
        etag: s3Metadata.etag,
        metadata: upload.metadata,
        isPublic: upload.isPublic || false,
      },
    });

    // Update bucket usage
    await this.prisma.bucket.update({
      where: { id: bucketId },
      data: {
        usedBytes: { increment: BigInt(s3Metadata.contentLength) },
      },
    });

    // Update app usage
    await this.prisma.application.update({
      where: { id: appId },
      data: {
        usedStorageBytes: { increment: BigInt(s3Metadata.contentLength) },
      },
    });

    // Clear cache
    await this.cache.del(`upload:${dto.uploadId}`);

    // Trigger webhook
    await this.webhook.trigger(appId, 'file.uploaded', {
      fileId: file.id,
      key: file.key,
      bucket: bucket.name,
      size: s3Metadata.contentLength,
    });

    return this.formatFileResponse(file, bucket.garageBucketId);
  }

  /**
   * Direct upload for small files
   */
  async uploadFile(
    appId: string,
    bucketId: string,
    file: Express.Multer.File,
    dto: UploadFileDto,
  ) {
    // Validate file size (max 10MB for direct upload)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException(
        'File too large for direct upload. Use presigned URL instead.',
      );
    }

    const bucket = await this.getBucketWithQuotaCheck(appId, bucketId, file.size);

    // Generate key
    const key = dto.key || this.generateFileKey(file.mimetype, file.originalname);

    // Upload to S3
    const { etag } = await this.s3.uploadFile(
      bucket.garageBucketId,
      key,
      file.buffer,
      file.mimetype,
      dto.metadata,
    );

    // Create file record
    const fileRecord = await this.prisma.file.create({
      data: {
        bucketId,
        key,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: BigInt(file.size),
        checksum: this.calculateMd5(file.buffer),
        etag,
        metadata: dto.metadata,
        isPublic: dto.isPublic || false,
      },
    });

    // Update usage stats
    await this.updateUsageStats(appId, bucketId, BigInt(file.size));

    // Trigger webhook
    await this.webhook.trigger(appId, 'file.uploaded', {
      fileId: fileRecord.id,
      key,
      bucket: bucket.name,
      size: file.size,
    });

    return this.formatFileResponse(fileRecord, bucket.garageBucketId);
  }

  /**
   * Get download URL
   */
  async getDownloadUrl(
    appId: string,
    bucketId: string,
    fileId: string,
    expiresIn: number = 3600,
  ) {
    const file = await this.getFileWithBucket(bucketId, fileId);

    const url = await this.s3.getPresignedDownloadUrl(
      file.bucket.garageBucketId,
      file.key,
      expiresIn,
      file.originalName,
    );

    // Update access stats
    await this.prisma.file.update({
      where: { id: fileId },
      data: {
        downloadCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });

    // Log access
    await this.logAccess(appId, 'DOWNLOAD', 'FILE', fileId);

    return {
      url,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  /**
   * Delete file
   */
  async deleteFile(appId: string, bucketId: string, fileId: string) {
    const file = await this.getFileWithBucket(bucketId, fileId);

    // Delete from S3
    await this.s3.deleteFile(file.bucket.garageBucketId, file.key);

    // Delete record
    await this.prisma.file.delete({ where: { id: fileId } });

    // Update usage stats (decrement)
    await this.updateUsageStats(appId, bucketId, -file.sizeBytes);

    // Trigger webhook
    await this.webhook.trigger(appId, 'file.deleted', {
      fileId,
      key: file.key,
      bucket: file.bucket.name,
    });
  }

  /**
   * List files with pagination and filtering
   */
  async listFiles(appId: string, bucketId: string, query: ListFilesQuery) {
    const { page = 1, limit = 50, prefix, mimeType, sort = 'createdAt', order = 'desc' } = query;

    const where: any = { bucketId };
    if (prefix) {
      where.key = { startsWith: prefix };
    }
    if (mimeType) {
      where.mimeType = { startsWith: mimeType };
    }

    const [files, total] = await Promise.all([
      this.prisma.file.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sort]: order },
        include: { bucket: true },
      }),
      this.prisma.file.count({ where }),
    ]);

    const bucket = await this.prisma.bucket.findUnique({
      where: { id: bucketId },
    });

    return {
      data: await Promise.all(
        files.map((f) => this.formatFileResponse(f, bucket.garageBucketId)),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ============================================
  // Private helper methods
  // ============================================

  private async getBucketWithQuotaCheck(
    appId: string,
    bucketId: string,
    fileSize: number,
  ) {
    const bucket = await this.prisma.bucket.findFirst({
      where: {
        id: bucketId,
        applicationId: appId,
      },
      include: { application: true },
    });

    if (!bucket) {
      throw new NotFoundException('Bucket not found');
    }

    // Check app quota
    const newUsage = Number(bucket.application.usedStorageBytes) + fileSize;
    if (newUsage > Number(bucket.application.maxStorageBytes)) {
      throw new ForbiddenException('Application storage quota exceeded');
    }

    // Check bucket quota (if set)
    if (bucket.quotaBytes) {
      const newBucketUsage = Number(bucket.usedBytes) + fileSize;
      if (newBucketUsage > Number(bucket.quotaBytes)) {
        throw new ForbiddenException('Bucket storage quota exceeded');
      }
    }

    return bucket;
  }

  private async getFileWithBucket(bucketId: string, fileId: string) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, bucketId },
      include: { bucket: true },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    return file;
  }

  private generateFileKey(mimeType: string, originalName?: string): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const uuid = uuidv4();
    const ext = this.getExtension(mimeType, originalName);

    return `${year}/${month}/${day}/${uuid}${ext}`;
  }

  private getExtension(mimeType: string, filename?: string): string {
    if (filename) {
      const ext = filename.split('.').pop();
      if (ext) return `.${ext}`;
    }

    const mimeToExt: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
      'text/plain': '.txt',
      'application/json': '.json',
    };

    return mimeToExt[mimeType] || '';
  }

  private calculateMd5(buffer: Buffer): string {
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  private async updateUsageStats(
    appId: string,
    bucketId: string,
    bytes: bigint,
  ) {
    await Promise.all([
      this.prisma.bucket.update({
        where: { id: bucketId },
        data: { usedBytes: { increment: bytes } },
      }),
      this.prisma.application.update({
        where: { id: appId },
        data: { usedStorageBytes: { increment: bytes } },
      }),
    ]);
  }

  private async logAccess(
    appId: string,
    action: string,
    resourceType: string,
    resourceId: string,
  ) {
    await this.prisma.accessLog.create({
      data: {
        applicationId: appId,
        action,
        resourceType,
        resourceId,
      },
    });
  }

  private async formatFileResponse(file: any, garageBucketId: string) {
    // Generate short-lived URL for listing
    const url = await this.s3.getPresignedDownloadUrl(
      garageBucketId,
      file.key,
      300, // 5 minutes
    );

    return {
      id: file.id,
      key: file.key,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: Number(file.sizeBytes),
      isPublic: file.isPublic,
      downloadCount: file.downloadCount,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
      url,
    };
  }
}
```

### 5.4 DTOs and Validation

```typescript
// src/modules/files/dto/presigned-upload.dto.ts

import { IsString, IsNumber, IsOptional, IsBoolean, MaxLength, Min, Max, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PresignedUploadDto {
  @ApiPropertyOptional({
    description: 'File key/path. Auto-generated if not provided.',
    example: 'documents/report-2024.pdf',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  key?: string;

  @ApiProperty({
    description: 'File MIME type',
    example: 'application/pdf',
  })
  @IsString()
  contentType: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 1048576,
  })
  @IsNumber()
  @Min(1)
  @Max(5 * 1024 * 1024 * 1024) // 5GB max
  contentLength: number;

  @ApiPropertyOptional({
    description: 'Custom metadata',
    example: { originalName: 'report.pdf', category: 'documents' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Make file publicly accessible',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

// src/modules/files/dto/file-response.dto.ts

export class FileResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  key: string;

  @ApiProperty()
  originalName: string;

  @ApiProperty()
  mimeType: string;

  @ApiProperty()
  sizeBytes: number;

  @ApiProperty()
  isPublic: boolean;

  @ApiProperty()
  downloadCount: number;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  url: string;
}
```

---

## 6. Frontend Specification

### 6.1 Project Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   │
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   └── layout.tsx
│   │   │
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx              # Overview
│   │   │   │
│   │   │   ├── applications/
│   │   │   │   ├── page.tsx          # List apps
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx      # Create app
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx      # App details
│   │   │   │       └── settings/
│   │   │   │           └── page.tsx
│   │   │   │
│   │   │   ├── buckets/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx      # Files list
│   │   │   │       └── settings/
│   │   │   │           └── page.tsx
│   │   │   │
│   │   │   ├── files/
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx      # File details
│   │   │   │
│   │   │   ├── analytics/
│   │   │   │   └── page.tsx
│   │   │   │
│   │   │   └── settings/
│   │   │       └── page.tsx
│   │   │
│   │   └── api/
│   │       └── [...proxy]/
│   │           └── route.ts
│   │
│   ├── components/
│   │   ├── ui/                       # Base UI components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── input.tsx
│   │   │   ├── table.tsx
│   │   │   ├── toast.tsx
│   │   │   └── ...
│   │   │
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   ├── header.tsx
│   │   │   ├── nav-item.tsx
│   │   │   └── user-menu.tsx
│   │   │
│   │   ├── applications/
│   │   │   ├── app-card.tsx
│   │   │   ├── app-form.tsx
│   │   │   ├── api-key-display.tsx
│   │   │   └── app-stats.tsx
│   │   │
│   │   ├── buckets/
│   │   │   ├── bucket-card.tsx
│   │   │   ├── bucket-form.tsx
│   │   │   └── bucket-settings.tsx
│   │   │
│   │   ├── files/
│   │   │   ├── file-list.tsx
│   │   │   ├── file-card.tsx
│   │   │   ├── file-preview.tsx
│   │   │   ├── file-uploader.tsx
│   │   │   ├── upload-progress.tsx
│   │   │   └── file-actions.tsx
│   │   │
│   │   ├── analytics/
│   │   │   ├── usage-chart.tsx
│   │   │   ├── storage-gauge.tsx
│   │   │   └── top-files-table.tsx
│   │   │
│   │   └── shared/
│   │       ├── data-table.tsx
│   │       ├── pagination.tsx
│   │       ├── search-input.tsx
│   │       ├── file-icon.tsx
│   │       ├── format-bytes.tsx
│   │       └── loading-spinner.tsx
│   │
│   ├── hooks/
│   │   ├── use-auth.ts
│   │   ├── use-applications.ts
│   │   ├── use-buckets.ts
│   │   ├── use-files.ts
│   │   ├── use-upload.ts
│   │   ├── use-analytics.ts
│   │   └── use-debounce.ts
│   │
│   ├── lib/
│   │   ├── api-client.ts
│   │   ├── auth.ts
│   │   ├── utils.ts
│   │   ├── constants.ts
│   │   └── validators.ts
│   │
│   ├── stores/
│   │   ├── auth-store.ts
│   │   ├── upload-store.ts
│   │   └── notification-store.ts
│   │
│   └── types/
│       ├── api.ts
│       ├── application.ts
│       ├── bucket.ts
│       ├── file.ts
│       └── analytics.ts
│
├── public/
│   └── ...
│
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

### 6.2 Key Components

#### File Uploader Component

```tsx
// src/components/files/file-uploader.tsx

'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, CheckCircle, AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/lib/utils';
import { useUpload } from '@/hooks/use-upload';

interface FileUploaderProps {
  bucketId: string;
  onUploadComplete?: (files: UploadedFile[]) => void;
  maxFiles?: number;
  maxSize?: number; // bytes
  accept?: Record<string, string[]>;
}

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
  result?: UploadedFile;
}

export function FileUploader({
  bucketId,
  onUploadComplete,
  maxFiles = 10,
  maxSize = 100 * 1024 * 1024, // 100MB
  accept,
}: FileUploaderProps) {
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const { uploadFile } = useUpload(bucketId);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const newFiles: UploadingFile[] = acceptedFiles.map((file) => ({
        id: crypto.randomUUID(),
        file,
        progress: 0,
        status: 'pending',
      }));

      setFiles((prev) => [...prev, ...newFiles]);

      // Upload files in parallel (max 3 concurrent)
      const uploadQueue = [...newFiles];
      const results: UploadedFile[] = [];

      const uploadNext = async () => {
        const item = uploadQueue.shift();
        if (!item) return;

        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id ? { ...f, status: 'uploading' } : f
          )
        );

        try {
          const result = await uploadFile(item.file, {
            onProgress: (progress) => {
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === item.id ? { ...f, progress } : f
                )
              );
            },
          });

          setFiles((prev) =>
            prev.map((f) =>
              f.id === item.id
                ? { ...f, status: 'completed', progress: 100, result }
                : f
            )
          );

          results.push(result);
        } catch (error) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === item.id
                ? { ...f, status: 'error', error: error.message }
                : f
            )
          );
        }

        await uploadNext();
      };

      // Start 3 parallel uploads
      await Promise.all([uploadNext(), uploadNext(), uploadNext()]);

      if (results.length > 0) {
        onUploadComplete?.(results);
      }
    },
    [bucketId, uploadFile, onUploadComplete]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles,
    maxSize,
    accept,
  });

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearCompleted = () => {
    setFiles((prev) => prev.filter((f) => f.status !== 'completed'));
  };

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors duration-200
          ${isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50'
          }
        `}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          {isDragActive
            ? 'Drop files here...'
            : 'Drag & drop files here, or click to select'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Max {maxFiles} files, up to {formatBytes(maxSize)} each
        </p>
      </div>

      {/* Upload Progress */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-medium">Uploads</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearCompleted}
              className="text-xs"
            >
              Clear completed
            </Button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {files.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 bg-muted rounded-lg"
              >
                {/* Status Icon */}
                <div className="shrink-0">
                  {item.status === 'completed' && (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  )}
                  {item.status === 'error' && (
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  )}
                  {(item.status === 'pending' || item.status === 'uploading') && (
                    <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  )}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {item.file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(item.file.size)}
                  </p>
                  {item.status === 'uploading' && (
                    <Progress value={item.progress} className="mt-1 h-1" />
                  )}
                  {item.error && (
                    <p className="text-xs text-red-500 mt-1">{item.error}</p>
                  )}
                </div>

                {/* Remove Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => removeFile(item.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

#### Upload Hook with Presigned URL

```typescript
// src/hooks/use-upload.ts

import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

interface UploadOptions {
  onProgress?: (progress: number) => void;
  metadata?: Record<string, string>;
  isPublic?: boolean;
}

interface UploadedFile {
  id: string;
  key: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

export function useUpload(bucketId: string) {
  const [isUploading, setIsUploading] = useState(false);

  const uploadFile = useCallback(
    async (file: File, options: UploadOptions = {}): Promise<UploadedFile> => {
      setIsUploading(true);

      try {
        // Step 1: Get presigned URL
        const { data: presigned } = await apiClient.post(
          `/buckets/${bucketId}/files/presigned-upload`,
          {
            contentType: file.type,
            contentLength: file.size,
            metadata: {
              ...options.metadata,
              originalName: file.name,
            },
            isPublic: options.isPublic,
          }
        );

        // Step 2: Upload directly to Garage using presigned URL
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
              const progress = Math.round((event.loaded / event.total) * 100);
              options.onProgress?.(progress);
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed: ${xhr.statusText}`));
            }
          });

          xhr.addEventListener('error', () => {
            reject(new Error('Upload failed'));
          });

          xhr.open('PUT', presigned.uploadUrl);
          xhr.setRequestHeader('Content-Type', file.type);
          xhr.send(file);
        });

        // Step 3: Confirm upload
        const { data: confirmed } = await apiClient.post(
          `/buckets/${bucketId}/files/confirm-upload`,
          {
            uploadId: presigned.uploadId,
          }
        );

        return confirmed;
      } finally {
        setIsUploading(false);
      }
    },
    [bucketId]
  );

  return {
    uploadFile,
    isUploading,
  };
}
```

### 6.3 Dashboard Pages

#### Overview Dashboard

```tsx
// src/app/(dashboard)/page.tsx

import { Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StorageGauge } from '@/components/analytics/storage-gauge';
import { UsageChart } from '@/components/analytics/usage-chart';
import { TopFilesTable } from '@/components/analytics/top-files-table';
import { RecentUploads } from '@/components/files/recent-uploads';
import { HardDrive, Files, Download, FolderOpen } from 'lucide-react';

async function getOverviewStats() {
  // Server-side data fetching
  const res = await fetch(`${process.env.API_URL}/analytics/overview`, {
    headers: { Authorization: `Bearer ${getServerToken()}` },
    next: { revalidate: 60 },
  });
  return res.json();
}

export default async function DashboardPage() {
  const stats = await getOverviewStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your storage service
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Total Storage Used
            </CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatBytes(stats.totalStorage.usedBytes)}
            </div>
            <p className="text-xs text-muted-foreground">
              of {formatBytes(stats.totalStorage.quotaBytes)} (
              {stats.totalStorage.percentage.toFixed(1)}%)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Files</CardTitle>
            <Files className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.files.total.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              +{stats.files.uploadedToday} today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Downloads</CardTitle>
            <Download className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.downloads.thisMonth.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Applications</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.applications}</div>
            <p className="text-xs text-muted-foreground">active apps</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Storage Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <StorageGauge
              used={stats.totalStorage.usedBytes}
              total={stats.totalStorage.quotaBytes}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usage Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div>Loading...</div>}>
              <UsageChart />
            </Suspense>
          </CardContent>
        </Card>
      </div>

      {/* Tables Row */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Buckets</CardTitle>
          </CardHeader>
          <CardContent>
            <TopBucketsTable buckets={stats.topBuckets} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Uploads</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div>Loading...</div>}>
              <RecentUploads />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

### 6.4 API Client Configuration

```typescript
// src/lib/api-client.ts

import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import { getSession, signOut } from 'next-auth/react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api/v1';

class ApiClient {
  private instance: AxiosInstance;

  constructor() {
    this.instance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor - add auth token
    this.instance.interceptors.request.use(
      async (config) => {
        const session = await getSession();
        if (session?.accessToken) {
          config.headers.Authorization = `Bearer ${session.accessToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle errors
    this.instance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expired, sign out
          await signOut({ redirect: true, callbackUrl: '/login' });
        }

        // Transform error for easier handling
        const message =
          (error.response?.data as any)?.message ||
          error.message ||
          'An error occurred';

        return Promise.reject(new Error(message));
      }
    );
  }

  // Convenience methods
  get<T>(url: string, config?: AxiosRequestConfig) {
    return this.instance.get<T>(url, config);
  }

  post<T>(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.instance.post<T>(url, data, config);
  }

  patch<T>(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.instance.patch<T>(url, data, config);
  }

  delete<T>(url: string, config?: AxiosRequestConfig) {
    return this.instance.delete<T>(url, config);
  }

  // For API key based requests (external apps)
  withApiKey(apiKey: string) {
    const instance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
    });
    return instance;
  }
}

export const apiClient = new ApiClient();
```

---

## 7. Security & Authentication

### 7.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Authentication Strategies                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐         ┌─────────────────┐                   │
│  │  Admin Users    │         │  Applications   │                   │
│  │  (Dashboard)    │         │  (External Apps)│                   │
│  └────────┬────────┘         └────────┬────────┘                   │
│           │                           │                             │
│           ▼                           ▼                             │
│  ┌─────────────────┐         ┌─────────────────┐                   │
│  │  JWT Token      │         │  API Key        │                   │
│  │  (Bearer Auth)  │         │  (X-API-Key)    │                   │
│  └────────┬────────┘         └────────┬────────┘                   │
│           │                           │                             │
│           └───────────┬───────────────┘                             │
│                       ▼                                             │
│           ┌─────────────────────┐                                   │
│           │    Auth Guards      │                                   │
│           │    & Middleware     │                                   │
│           └─────────────────────┘                                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 API Key Guard

```typescript
// src/common/guards/api-key.guard.ts

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../services/cache/cache.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('API key is required');
    }

    // Try cache first
    const cacheKey = `apikey:${this.hashKey(apiKey)}`;
    const cachedApp = await this.cache.get(cacheKey);

    if (cachedApp) {
      request.application = JSON.parse(cachedApp);
      return true;
    }

    // Find application by API key
    const applications = await this.prisma.application.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        slug: true,
        apiKeyHash: true,
        allowedOrigins: true,
        maxStorageBytes: true,
        usedStorageBytes: true,
      },
    });

    // Verify API key (bcrypt compare)
    for (const app of applications) {
      const isValid = await bcrypt.compare(apiKey, app.apiKeyHash);
      if (isValid) {
        // Check origin if configured
        const origin = request.headers['origin'];
        if (app.allowedOrigins.length > 0 && origin) {
          if (!app.allowedOrigins.includes(origin)) {
            throw new UnauthorizedException('Origin not allowed');
          }
        }

        // Remove sensitive data and attach to request
        const { apiKeyHash, ...safeApp } = app;
        request.application = safeApp;

        // Cache for 5 minutes
        await this.cache.set(cacheKey, JSON.stringify(safeApp), 300);

        return true;
      }
    }

    throw new UnauthorizedException('Invalid API key');
  }

  private hashKey(key: string): string {
    return require('crypto')
      .createHash('sha256')
      .update(key)
      .digest('hex')
      .substring(0, 16);
  }
}
```

### 7.3 Rate Limiting

```typescript
// src/common/guards/rate-limit.guard.ts

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CacheService } from '../../services/cache/cache.service';

export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  max: number; // Max requests per window
}

export const RATE_LIMIT_KEY = 'rate_limit';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private cache: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    ) || { windowMs: 60000, max: 100 }; // Default: 100 req/min

    const request = context.switchToHttp().getRequest();
    const key = this.getKey(request);

    const current = await this.cache.incr(key);
    
    if (current === 1) {
      await this.cache.expire(key, Math.ceil(options.windowMs / 1000));
    }

    if (current > options.max) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests',
          retryAfter: Math.ceil(options.windowMs / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Add headers
    const response = context.switchToHttp().getResponse();
    response.setHeader('X-RateLimit-Limit', options.max);
    response.setHeader('X-RateLimit-Remaining', Math.max(0, options.max - current));

    return true;
  }

  private getKey(request: any): string {
    // Use API key or IP address
    const identifier =
      request.application?.id || request.ip || 'anonymous';
    return `ratelimit:${identifier}`;
  }
}
```

### 7.4 Security Best Practices

```typescript
// Security configurations and middleware

// 1. Helmet for HTTP headers
import helmet from 'helmet';
app.use(helmet());

// 2. CORS configuration
app.enableCors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl)
    if (!origin) return callback(null, true);
    
    // Check against allowed origins from app config
    // This is handled in ApiKeyGuard
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
});

// 3. Request size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// 4. Security headers for presigned URLs
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'",
};
```

---

## 8. SDK & Integration Guide

### 8.1 JavaScript/TypeScript SDK

```typescript
// @garage-storage/sdk

interface GarageStorageConfig {
  endpoint: string;
  apiKey: string;
}

interface UploadOptions {
  bucket: string;
  key?: string;
  file: File | Blob | Buffer;
  metadata?: Record<string, string>;
  isPublic?: boolean;
  onProgress?: (progress: number) => void;
}

interface DownloadOptions {
  bucket: string;
  fileId: string;
  expiresIn?: number;
}

class GarageStorageClient {
  private endpoint: string;
  private apiKey: string;

  constructor(config: GarageStorageConfig) {
    this.endpoint = config.endpoint.replace(/\/$/, '');
    this.apiKey = config.apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: any,
  ): Promise<T> {
    const response = await fetch(`${this.endpoint}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Request failed');
    }

    return response.json();
  }

  /**
   * Upload a file
   */
  async upload(options: UploadOptions): Promise<UploadedFile> {
    const { bucket, key, file, metadata, isPublic, onProgress } = options;

    // Get file info
    const fileSize = file instanceof File ? file.size : file.length;
    const contentType =
      file instanceof File ? file.type : 'application/octet-stream';

    // Get presigned URL
    const presigned = await this.request<PresignedUploadResponse>(
      'POST',
      `/buckets/${bucket}/files/presigned-upload`,
      {
        key,
        contentType,
        contentLength: fileSize,
        metadata,
        isPublic,
      },
    );

    // Upload to presigned URL
    await this.uploadToPresignedUrl(presigned.uploadUrl, file, onProgress);

    // Confirm upload
    const confirmed = await this.request<UploadedFile>(
      'POST',
      `/buckets/${bucket}/files/confirm-upload`,
      { uploadId: presigned.uploadId },
    );

    return confirmed;
  }

  /**
   * Get download URL
   */
  async getDownloadUrl(options: DownloadOptions): Promise<string> {
    const { bucket, fileId, expiresIn = 3600 } = options;

    const result = await this.request<{ url: string }>(
      'GET',
      `/buckets/${bucket}/files/${fileId}/download?expiresIn=${expiresIn}`,
    );

    return result.url;
  }

  /**
   * Delete a file
   */
  async delete(bucket: string, fileId: string): Promise<void> {
    await this.request('DELETE', `/buckets/${bucket}/files/${fileId}`);
  }

  /**
   * List files in bucket
   */
  async list(
    bucket: string,
    options?: ListFilesOptions,
  ): Promise<PaginatedFiles> {
    const params = new URLSearchParams();
    if (options?.page) params.set('page', String(options.page));
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.prefix) params.set('prefix', options.prefix);

    return this.request('GET', `/buckets/${bucket}/files?${params}`);
  }

  /**
   * Create shareable link
   */
  async createShare(
    fileId: string,
    options?: CreateShareOptions,
  ): Promise<ShareLink> {
    return this.request('POST', `/files/${fileId}/shares`, options);
  }

  // Helper method for upload
  private async uploadToPresignedUrl(
    url: string,
    file: File | Blob | Buffer,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
      }

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Upload failed')));
      xhr.open('PUT', url);
      xhr.send(file);
    });
  }
}

// Export
export { GarageStorageClient };
export type {
  GarageStorageConfig,
  UploadOptions,
  DownloadOptions,
  UploadedFile,
};
```

### 8.2 Usage Example

```typescript
// In OrgConnect or any other app

import { GarageStorageClient } from '@garage-storage/sdk';

// Initialize client
const storage = new GarageStorageClient({
  endpoint: 'https://storage.example.com/api/v1',
  apiKey: 'your-api-key',
});

// Upload a file
async function uploadAvatar(file: File, userId: string) {
  const result = await storage.upload({
    bucket: 'avatars',
    key: `users/${userId}/avatar.jpg`,
    file,
    metadata: {
      userId,
      uploadedAt: new Date().toISOString(),
    },
    isPublic: true,
    onProgress: (progress) => {
      console.log(`Upload progress: ${progress}%`);
    },
  });

  return result.url;
}

// Download a file
async function downloadDocument(fileId: string) {
  const url = await storage.getDownloadUrl({
    bucket: 'documents',
    fileId,
    expiresIn: 3600, // 1 hour
  });

  // Redirect or use the URL
  window.open(url, '_blank');
}

// Create shareable link
async function shareFile(fileId: string) {
  const share = await storage.createShare(fileId, {
    expiresIn: 7 * 24 * 60 * 60, // 7 days
    maxDownloads: 10,
  });

  return share.shareUrl;
}
```

---

## 9. Deployment Guide

### 9.1 Pre-deployment Checklist

```markdown
## Pre-deployment Checklist

### Security
- [ ] Generate strong RPC secret for Garage
- [ ] Generate strong admin token for Garage
- [ ] Generate secure PostgreSQL password
- [ ] Generate secure Redis password
- [ ] Generate JWT secret (min 32 characters)
- [ ] Configure allowed origins for CORS
- [ ] Set up SSL/TLS certificates

### Infrastructure
- [ ] Ensure sufficient disk space for Garage data
- [ ] Configure backup strategy for PostgreSQL
- [ ] Set up monitoring and alerting
- [ ] Configure log aggregation

### Configuration
- [ ] Update all .env variables
- [ ] Configure domain names
- [ ] Set up reverse proxy (nginx/traefik)
- [ ] Configure firewall rules
```

### 9.2 Production Docker Compose

```yaml
# docker-compose.prod.yml

version: '3.8'

services:
  garage:
    image: dxflrs/garage:v2.1.0
    restart: always
    volumes:
      - ./garage/garage.toml:/etc/garage.toml:ro
      - /data/garage/meta:/var/lib/garage/meta
      - /data/garage/data:/var/lib/garage/data
    networks:
      - internal
    deploy:
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 512M

  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: garageStorage
    volumes:
      - /data/postgres:/var/lib/postgresql/data
    networks:
      - internal
    deploy:
      resources:
        limits:
          memory: 1G

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - /data/redis:/data
    networks:
      - internal

  storage-api:
    image: your-registry/storage-api:${VERSION:-latest}
    restart: always
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/garageStorage
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
      - GARAGE_ENDPOINT=http://garage:3900
      - GARAGE_ACCESS_KEY=${GARAGE_ACCESS_KEY}
      - GARAGE_SECRET_KEY=${GARAGE_SECRET_KEY}
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
      - redis
      - garage
    networks:
      - internal
      - web
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.storage-api.rule=Host(`api.storage.example.com`)"
      - "traefik.http.routers.storage-api.tls.certresolver=letsencrypt"

  admin-ui:
    image: your-registry/storage-admin:${VERSION:-latest}
    restart: always
    environment:
      - NEXT_PUBLIC_API_URL=https://api.storage.example.com
    depends_on:
      - storage-api
    networks:
      - web
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.storage-admin.rule=Host(`storage.example.com`)"
      - "traefik.http.routers.storage-admin.tls.certresolver=letsencrypt"

networks:
  internal:
    driver: bridge
  web:
    external: true
```

### 9.3 Nginx Reverse Proxy (Alternative)

```nginx
# /etc/nginx/sites-available/storage

upstream storage_api {
    server 127.0.0.1:4001;
}

upstream storage_admin {
    server 127.0.0.1:4000;
}

upstream garage_s3 {
    server 127.0.0.1:3900;
}

# API Server
server {
    listen 443 ssl http2;
    server_name api.storage.example.com;

    ssl_certificate /etc/letsencrypt/live/storage.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/storage.example.com/privkey.pem;

    client_max_body_size 100M;

    location / {
        proxy_pass http://storage_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Admin Dashboard
server {
    listen 443 ssl http2;
    server_name storage.example.com;

    ssl_certificate /etc/letsencrypt/live/storage.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/storage.example.com/privkey.pem;

    location / {
        proxy_pass http://storage_admin;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# S3 Endpoint (Direct access to Garage)
server {
    listen 443 ssl http2;
    server_name s3.storage.example.com;

    ssl_certificate /etc/letsencrypt/live/storage.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/storage.example.com/privkey.pem;

    client_max_body_size 5G;

    location / {
        proxy_pass http://garage_s3;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Required for large uploads
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

### 9.4 Monitoring & Health Checks

```typescript
// src/health/health.controller.ts

import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HttpHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private prisma: PrismaHealthIndicator,
    private prismaService: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // Database
      () => this.prisma.pingCheck('database', this.prismaService),
      
      // Garage S3
      () =>
        this.http.pingCheck(
          'garage',
          `${process.env.GARAGE_ENDPOINT}/health`,
        ),
      
      // Redis (via custom indicator)
      () => this.checkRedis(),
    ]);
  }

  private async checkRedis() {
    // Custom Redis health check
    try {
      await this.redis.ping();
      return { redis: { status: 'up' } };
    } catch (error) {
      return { redis: { status: 'down', error: error.message } };
    }
  }
}
```

---

## Appendix

### A. Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_001` | 401 | Invalid or missing API key |
| `AUTH_002` | 401 | Invalid or expired JWT token |
| `AUTH_003` | 403 | Origin not allowed |
| `BUCKET_001` | 404 | Bucket not found |
| `BUCKET_002` | 409 | Bucket name already exists |
| `BUCKET_003` | 400 | Bucket not empty |
| `FILE_001` | 404 | File not found |
| `FILE_002` | 400 | Invalid file type |
| `FILE_003` | 413 | File too large |
| `QUOTA_001` | 403 | Storage quota exceeded |
| `QUOTA_002` | 403 | Bucket quota exceeded |
| `SHARE_001` | 404 | Share link not found |
| `SHARE_002` | 410 | Share link expired |
| `SHARE_003` | 403 | Download limit reached |
| `RATE_001` | 429 | Too many requests |

### B. Webhook Events

| Event | Description | Payload |
|-------|-------------|---------|
| `file.uploaded` | File upload completed | `{ fileId, key, bucket, size }` |
| `file.deleted` | File deleted | `{ fileId, key, bucket }` |
| `file.downloaded` | File downloaded | `{ fileId, key, downloadedBy }` |
| `bucket.created` | Bucket created | `{ bucketId, name }` |
| `bucket.deleted` | Bucket deleted | `{ bucketId, name }` |
| `quota.warning` | Quota at 80% | `{ used, limit, percentage }` |
| `quota.exceeded` | Quota exceeded | `{ used, limit }` |

### C. MIME Types Supported

```json
{
  "images": ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"],
  "documents": ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.*"],
  "audio": ["audio/mpeg", "audio/wav", "audio/ogg"],
  "video": ["video/mp4", "video/webm", "video/ogg"],
  "archives": ["application/zip", "application/x-rar-compressed", "application/x-7z-compressed"],
  "data": ["application/json", "text/csv", "application/xml"]
}
```

---

**Version:** 1.0.0  
**Last Updated:** December 2024  
**Author:** Claude (Anthropic)
