# Installation Guide

Complete installation guide for the SKH Storage Service.

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 20.x LTS | Backend and Frontend runtime |
| npm | 10.x+ | Package management |
| Docker | 24.x+ | Container runtime |
| Docker Compose | 2.x+ | Multi-container orchestration |
| PostgreSQL | 16.x | Database (provided via Docker) |
| Git | 2.x+ | Version control |

### System Requirements

- **OS**: Windows 10/11, macOS 12+, or Linux (Ubuntu 22.04+)
- **RAM**: 8GB minimum, 16GB recommended
- **Disk**: 20GB+ free space for Docker volumes and storage

---

## Step 1: Clone the Repository

```bash
git clone <repository-url> garageStorage
cd garageStorage
```

---

## Step 2: Configure Environment Variables

### 2.1 Create Root .env File

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Redis password (used by docker-compose)
REDIS_PASSWORD=your_secure_redis_password

# Garage S3 credentials (will be generated in Step 5)
GARAGE_ACCESS_KEY=
GARAGE_SECRET_KEY=

# JWT secret (minimum 32 characters)
JWT_SECRET=your_jwt_secret_key_at_least_32_characters_long
```

### Generating Secure Values

#### Redis Password

The Redis password secures access to the Redis cache. Generate a strong password using one of these methods:

**Option 1: Using OpenSSL (Linux/macOS/Git Bash)**
```bash
openssl rand -base64 24
```

**Option 2: Using PowerShell (Windows)**
```powershell
[Convert]::ToBase64String((1..24 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

**Option 3: Using Node.js**
```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64'))"
```

Example output: `K8mPqR2sT4vW6xY8zA3bC5dE7fG9hJ1k`

#### JWT Secret

The JWT secret is used to sign authentication tokens. It must be:
- At least 32 characters long
- Kept secret and never committed to version control
- Unique per environment (development, staging, production)

**Option 1: Using OpenSSL (recommended)**
```bash
openssl rand -base64 48
```

**Option 2: Using PowerShell (Windows)**
```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

**Option 3: Using Node.js**
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Example output: `X9kL2mN4pQ6rS8tU0vW2xY4zA6bC8dE0fG2hJ4kL6mN8pQ0rS2tU4vW6xY8z`

> **Important**: Use different secrets for development and production environments. Never use the example values shown in this documentation.

### 2.2 Create Backend .env File

```bash
cp .env.example backend/.env
```

Edit `backend/.env`:

```env
# Database (update password if different)
DATABASE_URL=postgresql://postgres:your_password@localhost:9006/garageStorage

# Redis
REDIS_URL=redis://:your_secure_redis_password@localhost:9005

# Garage S3 (will be updated after Step 5)
GARAGE_ENDPOINT=http://localhost:9004
GARAGE_REGION=garage
GARAGE_ACCESS_KEY=
GARAGE_SECRET_KEY=

# JWT
JWT_SECRET=your_jwt_secret_key_at_least_32_characters_long
JWT_EXPIRES_IN=7d

# App
PORT=9001
NODE_ENV=development
```

---

## Step 3: Setup PostgreSQL Database

PostgreSQL runs as a Docker container — no manual database creation is required. The container automatically creates the `garageStorage` database on first start.

### 3.1 Start Docker Services

From the project root directory:

```bash
docker compose up -d
```

This starts:
- **PostgreSQL** on port 9006
- **Garage** (S3-compatible storage) on ports 9004, 3901, 3902, 3903
- **Garage WebUI** on port 9003
- **Redis** on port 9005
- **Storage API** on port 9001
- **Admin UI** on port 9002

Verify all services are running:

```bash
docker compose ps
```

Wait for all services to be healthy (especially Garage):

```bash
docker logs garage-storage -f
```

### 3.2 Install Backend Dependencies

```bash
cd backend
npm install
```

### 3.3 Run Database Migrations

```bash
npx prisma migrate deploy
```

### 3.4 Generate Prisma Client

```bash
npx prisma generate
```

### 3.5 Seed Admin User

```bash
npx prisma db seed
```

This creates the default admin user:
- **Email**: `admin@example.com`
- **Password**: `admin123`

---

## Step 4: Initialize SKH Storage

### 4.1 Run Setup Script (Linux/macOS)

```bash
chmod +x scripts/setup-garage.sh
./scripts/setup-garage.sh
```

### 4.2 Manual Setup (Windows or if script fails)

```powershell
# Wait for Garage to be healthy
docker exec garage-storage /garage status

# Get node ID
docker exec garage-storage /garage node id

# Assign layout (replace NODE_ID with actual value)
docker exec garage-storage /garage layout assign -z dc1 -c 100G <NODE_ID>

# Apply layout
docker exec garage-storage /garage layout apply --version 1

# Create main bucket
docker exec garage-storage /garage bucket create storage-service

# Create API key
docker exec garage-storage /garage key create storage-api-key

# Grant permissions
docker exec garage-storage /garage bucket allow --read --write --owner storage-service --key storage-api-key
```

### 4.3 Get API Credentials

```bash
docker exec garage-storage /garage key info storage-api-key
```

Copy the **Key ID** and **Secret key** values.

### 4.4 Update Environment Files

Update both `.env` (root) and `backend/.env` with the Garage credentials:

```env
GARAGE_ACCESS_KEY=GKxxxxxxxxxxxxxxxxxxxx
GARAGE_SECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Step 5: Restart Services

After updating credentials:

```bash
docker compose restart storage-api
```

---

## Step 6: Verify Installation

### 6.1 Check All Services

```bash
docker compose ps
```

All services should show "Up" and "healthy" status.

### 6.2 Access the Applications

| Service | URL | Description |
|---------|-----|-------------|
| Admin Dashboard | http://localhost:9002 | Main admin interface |
| Storage API | http://localhost:9001 | Backend REST API |
| Swagger Docs | http://localhost:9001/api/docs | API documentation |
| Garage WebUI | http://localhost:9003 | Garage management UI |

### 6.3 Login to Admin Dashboard

1. Open http://localhost:9002
2. Login with:
   - **Email**: `admin@example.com`
   - **Password**: `admin123`

### 6.4 Test API Health

```bash
curl http://localhost:9001/api/v1/health
```

---

## Development Mode Setup

For local development without Docker for the API and frontend:

### Backend Development

```bash
cd backend
npm install
npm run start:dev
```

### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

Note: You still need Docker running for Garage, Redis, and PostgreSQL:

```bash
docker compose up -d garage redis postgres
```

---

## Service Ports Reference

| Service | Port | Protocol |
|---------|------|----------|
| Admin UI | 9002 | HTTP |
| Storage API | 9001 | HTTP |
| Garage S3 API | 9004 | HTTP |
| Garage RPC | 3901 | TCP |
| Garage Web | 3902 | HTTP |
| Garage Admin | 3903 | HTTP |
| Garage WebUI | 9003 | HTTP |
| Redis | 9005 | TCP |
| PostgreSQL | 9006 | TCP |

---

## Troubleshooting

### Garage "layout is not available" Error

```bash
# Check layout status
docker exec garage-storage /garage layout show

# If no nodes assigned, run setup again
docker exec garage-storage /garage node id
docker exec garage-storage /garage layout assign -z dc1 -c 100G <NODE_ID>
docker exec garage-storage /garage layout apply --version 1
```

### Storage API Keeps Restarting

Check logs for errors:

```bash
docker logs storage-api -f
```

Common issues:
- **Prisma OpenSSL error**: Ensure `node:20-slim` base image is used
- **Database connection failed**: Verify PostgreSQL is running and DATABASE_URL is correct
- **Redis connection failed**: Check REDIS_URL and REDIS_PASSWORD match

### "Invalid signature" on File Downloads

Ensure `GARAGE_PUBLIC_ENDPOINT` in docker-compose.yml matches the URL browsers use:

```yaml
GARAGE_PUBLIC_ENDPOINT=http://localhost:9004
```

### Frontend Can't Connect to API

1. Check API is running: `curl http://localhost:9001/api/v1/health`
2. Verify `NEXT_PUBLIC_API_URL` in docker-compose.yml
3. Check browser console for CORS errors

### Database Migration Errors

```bash
cd backend

# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Or apply pending migrations
npx prisma migrate deploy
```

### View Detailed Logs

```bash
# All services
docker compose logs -f

# Specific service
docker logs storage-api -f
docker logs garage-storage -f
docker logs storage-admin-ui -f
```

---

## Production Deployment

For production deployments, additional steps are recommended:

### Security Checklist

- [ ] Change default admin password after first login
- [ ] Generate strong secrets for JWT_SECRET, REDIS_PASSWORD
- [ ] Use HTTPS with SSL certificates
- [ ] Configure proper CORS origins
- [ ] Set up database backups
- [ ] Configure Garage replication (replication_factor > 1)

### Environment Changes

```env
NODE_ENV=production
```

### Build for Production

```bash
# Backend
cd backend
npm run build

# Frontend
cd frontend
npm run build
```

---

## Uninstallation

To completely remove the installation:

```bash
# Stop and remove containers
docker compose down

# Remove volumes (WARNING: deletes all stored files and the PostgreSQL database)
docker compose down -v
```
