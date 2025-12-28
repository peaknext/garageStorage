# Garage Storage Service

A centralized file storage service using Garage (S3-Compatible) for multi-tenant web applications.

## Quick Start

### Prerequisites
- Docker & Docker Compose
- PostgreSQL running on localhost:5432
- Node.js 20+ (for local development)

### 1. Setup Environment

```bash
# Copy environment file
cp .env.example .env

# Edit .env with your settings (especially DATABASE_URL and JWT_SECRET)
```

### 2. Start Services

```bash
# Start all containers
docker compose up -d

# Wait for services to be healthy
docker compose ps
```

### 3. Initialize Database

```bash
cd backend
npm install
npx prisma migrate deploy
npx prisma generate
```

### 4. Create Admin User

```bash
cd backend
npx ts-node prisma/seed.ts
```

### 5. Access the Application

| Service | URL |
|---------|-----|
| Admin Dashboard | http://localhost:4000 |
| API Documentation | http://localhost:4001/api/docs |
| Garage WebUI | http://localhost:3909 |

**Default Admin Login:**
- Email: `admin@example.com`
- Password: `admin123`

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Admin UI      │     │  External Apps  │
│  (Next.js)      │     │                 │
│  Port: 4000     │     │                 │
└────────┬────────┘     └────────┬────────┘
         │ JWT Auth              │ API Key Auth
         ▼                       ▼
┌─────────────────────────────────────────┐
│           Storage API (NestJS)          │
│                Port: 4001               │
└────────┬──────────────────┬─────────────┘
         │                  │
         ▼                  ▼
┌─────────────┐    ┌─────────────────────┐
│  PostgreSQL │    │  Garage S3 Storage  │
│  Port: 5432 │    │    Port: 3900       │
└─────────────┘    └─────────────────────┘
```

## Development

### Backend
```bash
cd backend
npm install
npm run start:dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Rebuild Containers
```bash
docker compose up -d --build storage-api admin-ui
```

## API Usage

### External Applications

1. Create an application in the admin dashboard
2. Copy the API key (shown only once)
3. Use the API key in requests:

```bash
# Create a bucket
curl -X POST http://localhost:4001/api/v1/buckets \
  -H "X-API-Key: gsk_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-bucket"}'

# Upload a file
curl -X POST http://localhost:4001/api/v1/buckets/{bucketId}/files/upload \
  -H "X-API-Key: gsk_your_api_key" \
  -F "file=@/path/to/file.jpg"
```

## Project Structure

```
├── docker-compose.yml      # Container orchestration
├── .env                    # Environment config
├── garage/                 # Garage S3 config
├── backend/                # NestJS API
│   ├── prisma/             # Database schema
│   └── src/
│       ├── modules/        # Feature modules
│       └── services/       # S3, Cache services
└── frontend/               # Next.js Admin UI
    └── src/
        ├── app/            # Pages
        └── components/     # UI components
```

## Documentation

- [CLAUDE.md](CLAUDE.md) - Detailed technical documentation for AI assistants
- [API Docs](http://localhost:4001/api/docs) - Swagger API documentation
- [garage-storage-specification.md](garage-storage-specification.md) - Original specification

## License

MIT
