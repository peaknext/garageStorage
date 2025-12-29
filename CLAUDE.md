# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A centralized file storage service using Garage (S3-Compatible Object Storage) for multi-tenant web applications. The system provides a REST API for external applications and an admin dashboard for management.

## Tech Stack

- **Backend**: NestJS + TypeScript, PostgreSQL (Prisma ORM), Redis cache, Garage S3 storage
- **Frontend**: Next.js 14 (App Router), Tailwind CSS + shadcn/ui, TanStack Query, Axios, Zustand (state), Recharts (analytics)
- **Infrastructure**: Docker Compose, Garage v2.1.0, PostgreSQL (local, not containerized)
- **Processing**: Sharp (image thumbnails), Bull (background jobs), @nestjs/schedule (cron), EventEmitter (async events)

## Common Commands

### Docker
```bash
docker compose up -d                              # Start all services
docker compose up -d --build storage-api admin-ui # Rebuild specific services
docker logs storage-api -f                        # View backend logs
docker logs storage-admin-ui -f                   # View frontend logs
```

### Backend Development
```bash
cd backend
npm run start:dev           # Dev mode with hot reload
npm run build               # Build for production
npm run lint                # ESLint with auto-fix
npm run format              # Prettier format
npm run test                # Run unit tests
npm run test:watch          # Run tests in watch mode
npm run test:cov            # Run tests with coverage
npm run test -- --testPathPattern="files.service"  # Run single test file
npm run test:e2e            # Run e2e tests
```

### Frontend Development
```bash
cd frontend
npm run dev                 # Dev mode
npm run build               # Build for production
npm run lint                # Next.js linting
npx tsc --noEmit            # Type check (run before building Docker)
```

### Prisma Database
```bash
cd backend
npx prisma migrate dev --name <description>   # Create and run migration
npx prisma generate                           # Regenerate Prisma client
npx prisma studio                             # Open database GUI
npx prisma db seed                            # Run seed script
```

## Initial Setup

1. Copy `.env.example` to `.env` and configure values
2. Create Garage API key: `docker exec garage-storage /garage key create storage-api-key`
3. Copy the generated `GARAGE_ACCESS_KEY` and `GARAGE_SECRET_KEY` to `.env`
4. Run migrations: `cd backend && npx prisma migrate dev`
5. Seed database: `npx prisma db seed`
6. Start services: `docker compose up -d --build`

## Architecture

### Multi-Tenancy Model
```
Application (tenant) → Bucket (storage container) → File (stored object)
```

### Dual Authentication System

1. **JWT Auth (Admin Dashboard)**: `JwtAuthGuard` for `/api/v1/admin/*` and `/api/v1/auth/*` endpoints. Token stored in `localStorage.accessToken`.

2. **API Key Auth (External Apps)**: `ApiKeyGuard` for `/api/v1/buckets/*`, `/api/v1/files/*` endpoints. Pass via `X-API-Key` header.

### Controller Pattern
- `{module}.controller.ts` → Uses `ApiKeyGuard` for external application API
- `admin-{module}.controller.ts` → Uses `JwtAuthGuard` for dashboard API

### S3 Dual-Client Architecture

The S3 service uses two clients to handle Docker networking:

```typescript
// Internal client - for server-side operations (uploads, deletes)
// Uses: GARAGE_ENDPOINT (http://garage:3900 - Docker network)
s3Client

// Public client - for generating presigned URLs
// Uses: GARAGE_PUBLIC_ENDPOINT (http://localhost:3900 - browser accessible)
s3PublicClient
```

This is necessary because presigned URL signatures include the hostname. URLs signed with the internal hostname would fail when accessed from browsers.

### Background Processing Architecture

The backend uses Bull queues for async job processing and EventEmitter for decoupled events:

```
User Upload → FilesService → Bull Queue (thumbnail) → ThumbnailProcessor → S3 Upload
                          → EventEmitter (audit.log) → AuditService → Database
```

- **Bull Queues**: `@InjectQueue('thumbnail')` for image processing jobs
- **Processors**: `@Processor('thumbnail')` with `@Process('generate')` handlers
- **Events**: `@OnEvent('audit.log')` for async audit logging
- **Cron Jobs**: `@Cron()` decorators in PolicyExecutorService, AlertsService for scheduled tasks

### Thumbnail Storage

Thumbnails are stored in S3 with prefix `_thumbnails/{fileId}.{format}`:
- The `thumbnailKey` is stored on the parent File record, not as a separate File entry
- When deleting files, thumbnails are automatically deleted (see `files.service.ts:deleteFile`)
- Orphan detection excludes valid thumbnails by checking `thumbnailKey` references

### Backend Modules

| Module | Purpose |
|--------|---------|
| `auth` | JWT authentication, login/logout |
| `applications` | Multi-tenant app management |
| `buckets` | Storage container CRUD |
| `files` | File upload/download/delete |
| `shares` | Public share links with expiry |
| `webhooks` | Event notifications to external apps |
| `audit` | Operation logging with filters/export |
| `policies` | Automated storage rules (retention, cleanup) |
| `alerts` | Quota monitoring with email/webhook notifications |
| `tags` | File tagging system |
| `folders` | Virtual folder hierarchy |
| `processing` | Thumbnail generation, file previews |
| `analytics` | Usage statistics and charts data |

### Key Prisma Enums (import from `@prisma/client`)
`AppStatus`, `AdminRole`, `ThumbnailStatus`, `ActorType`, `AuditStatus`, `PolicyScope`, `PolicyType`, `AlertLevel`

### Key Files
- [s3.service.ts](backend/src/services/s3/s3.service.ts) - Dual S3 client with presigned URL generation
- [garage-admin.service.ts](backend/src/services/s3/garage-admin.service.ts) - Garage admin API for bucket management
- [api-key.guard.ts](backend/src/common/guards/api-key.guard.ts) - API key validation with Redis caching
- [jwt-auth.guard.ts](backend/src/common/guards/jwt-auth.guard.ts) - JWT token validation
- [api-client.ts](frontend/src/lib/api-client.ts) - Axios instance with auth interceptors
- [schema.prisma](backend/prisma/schema.prisma) - Database schema
- [configuration.ts](backend/src/config/configuration.ts) - Environment config
- [thumbnail.processor.ts](backend/src/modules/processing/processors/thumbnail.processor.ts) - Bull queue processor
- [audit.service.ts](backend/src/modules/audit/audit.service.ts) - Event-driven audit logging
- [orphan.service.ts](backend/src/modules/files/orphan.service.ts) - Orphan file detection and cleanup
- [file-preview-modal.tsx](frontend/src/components/files/file-preview-modal.tsx) - File preview with zoom/pan
- [file-list.tsx](frontend/src/components/files/file-list.tsx) - File table with filters and selection

## Environment Variables

Key variables in docker-compose.yml for `storage-api`:

| Variable | Description | Example |
|----------|-------------|---------|
| `GARAGE_ENDPOINT` | Internal S3 endpoint (Docker network) | `http://garage:3900` |
| `GARAGE_PUBLIC_ENDPOINT` | Public S3 endpoint (browser access) | `http://localhost:3900` |
| `API_BASE_URL` | Public API URL for share links | `http://localhost:4001` |

## Service Ports

| Service | Port |
|---------|------|
| Admin UI | 4000 |
| Storage API | 4001 |
| Swagger Docs | 4001/api/docs |
| Garage S3 | 3900 |
| Garage Admin | 3903 |
| Garage WebUI | 3909 |
| Redis | 6379 |
| PostgreSQL | 5432 |

## Default Credentials

- **Admin Dashboard**: `admin@example.com` / `admin123`
- **PostgreSQL**: `postgres` / `5432` on database `garageStorage`

## Adding Features

### New Admin Endpoint
1. Create `backend/src/modules/{module}/admin-{module}.controller.ts`
2. Add `@UseGuards(JwtAuthGuard)` and `@ApiBearerAuth()` decorators
3. Register in module's `*.module.ts`

### New Dashboard Page
1. Create `frontend/src/app/(dashboard)/{page}/page.tsx`
2. Use `apiClient.get<Type>('/admin/...')` for API calls
3. Add to sidebar in `frontend/src/components/layout/sidebar.tsx`

### UI Components
Located in `frontend/src/components/ui/`. Radix UI primitives styled for dark theme:
- `Button`, `Input`, `Card`, `Dialog`, `Select`, `Switch`, `Slider`, `Label`, `Textarea`, `Progress`
- Add new Radix components: install package, create component file following existing patterns

### Modal Pattern

For modals that must appear above all content (including portaled dropdowns), use this pattern:

```tsx
import { createPortal } from 'react-dom';

export function MyModal({ onClose }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-[#1a1025] ...">...</div>
    </div>,
    document.body
  );
}
```

Key elements:
- Use `createPortal` to render at document root
- Use `z-[99999]` (dropdowns use z-[9999])
- Prevent body scroll when open
- Handle Escape key to close

### Database Schema Change
1. Edit `backend/prisma/schema.prisma`
2. Run `npx prisma migrate dev --name description`
3. Run `npx prisma generate`
4. Rebuild: `docker compose up -d --build storage-api`

### Adding NPM Packages
When adding packages to `package.json`, run `npm install` locally first to update `package-lock.json` before Docker build (Docker uses `npm ci` which requires lock file sync).

## Troubleshooting

### Container Issues
- **storage-api keeps restarting**: Check `docker logs storage-api`. Common cause: Prisma OpenSSL issue with Alpine. Use `node:20-slim` base image.
- **MODULE_NOT_FOUND for /app/dist/main**: NestJS builds to `dist/src/main.js`. Update Dockerfile CMD to `["node", "dist/src/main"]`.

### Authentication Issues
- **Dashboard redirects to login**: Ensure frontend uses `/admin/*` endpoints and admin controllers use `JwtAuthGuard`.
- **API returns 401**: For dashboard check `localStorage.accessToken`; for external apps check `X-API-Key` header.

### S3/Download Issues
- **AccessDenied: Invalid signature**: Ensure `GARAGE_PUBLIC_ENDPOINT` matches the URL browsers use. Presigned URLs must be signed with the public endpoint.
- **Download URL uses internal hostname**: Check that `s3PublicClient` is used for `getPresignedDownloadUrl`.

### TypeScript Errors
- **Type 'string' is not assignable to 'AppStatus'**: Import enum from `@prisma/client`.
- **'data' is of type 'unknown'**: Add generic type: `apiClient.get<{ data: Type[] }>(...)`.

## Dashboard Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Overview with stats cards |
| Applications | `/applications` | List and manage tenant applications |
| Application Detail | `/applications/[id]` | View app details, API key, webhooks preview |
| Webhooks | `/applications/[id]/webhooks` | Manage application webhooks |
| Buckets | `/buckets` | List and manage storage buckets |
| Bucket Detail | `/buckets/[id]` | File management, upload, delete, share, folders, preview |
| Tags | `/tags` | Tag management across all applications |
| Share Links | `/shares` | Global view of all share links |
| Orphan Files | `/orphan-files` | Detect and clean up orphaned files |
| Analytics | `/analytics` | Charts and usage statistics |
| Audit Logs | `/audit` | System operation logs with filters/export |
| Policies | `/policies` | Storage policies (retention, auto-delete) |
| Alerts | `/alerts` | Quota alert configuration per application |
| Settings | `/settings` | Profile and password management |

## API Response Patterns

### Paginated List Response
```typescript
interface PaginatedResponse<T> {
  data: T[];
  meta: {  // or 'pagination' in some endpoints
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
```

### File Operations
- **Upload small files (<10MB)**: Direct multipart upload to `/admin/buckets/:id/files/upload`
- **Upload large files**: Get presigned URL, upload directly to S3, confirm with `/admin/buckets/:id/files/confirm-upload`
- **Download**: Get presigned URL from `/admin/buckets/:id/files/:fileId/download`
- **Share links**: Point to `/api/v1/shares/:token/download` for direct file access

## Lessons Learned (Session 2025-12-29)

### Always Audit Against the Spec Before Implementing

When implementing a multi-feature plan, **verify all features against the original spec** before considering work complete. Don't just fix bugs reactively—do a comprehensive audit:

1. Read the plan file thoroughly
2. Check each file that should exist/be modified
3. Verify each feature works end-to-end
4. Create a checklist and mark items complete only after verification

### Backend and Frontend Must Match

When implementing API-connected features, verify **both sides match**:

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Move-to-folder 500 error | Frontend sent `{ folderIds: [id] }`, backend expected `{ folderId: id }` | Check controller `@Body()` decorators match frontend payloads |
| Folder files not showing | `getFilesInFolder` returned raw DB objects without tags/formatting | Format response to match main files list structure |
| Thumbnail generation failing | Bull queue needed `REDIS_HOST/PORT/PASSWORD` but only `REDIS_URL` was set | Add all required Redis env vars to docker-compose |

### Response Format Consistency

When multiple endpoints return similar data, **ensure consistent formatting**:

```typescript
// BAD: getFilesInFolder returns different format than listFiles
return { data: fileFolders.map((ff) => ff.file) };  // Raw DB object

// GOOD: Format to match other endpoints
return {
  data: fileFolders.map((ff) => ({
    ...ff.file,
    sizeBytes: Number(ff.file.sizeBytes),  // BigInt → Number
    tags: ff.file.tags?.map(t => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
  }))
};
```

### Client-Side vs Server-Side Filtering

If the plan says "server-side search", **verify the API is actually being called**:

```typescript
// BAD: Client-side filtering (looks like search but doesn't call API)
const filteredFiles = useMemo(() => files.filter(...), [files, search]);

// GOOD: Server-side filtering (API receives search params)
const { data } = useQuery({
  queryKey: ['files', bucketId, search, filters],
  queryFn: () => apiClient.get(`/files?search=${search}&mimeType=${filter}`)
});
```

### Docker Environment Variables for Bull/Redis

Bull queues require **individual Redis config vars**, not just `REDIS_URL`:

```yaml
# docker-compose.yml - storage-api service
environment:
  - REDIS_URL=redis://:password@redis:6379     # For general Redis client
  - REDIS_HOST=redis                            # Required for Bull
  - REDIS_PORT=6379                             # Required for Bull
  - REDIS_PASSWORD=${REDIS_PASSWORD}            # Required for Bull
```

### File Search API

The files list endpoint (`GET /admin/buckets/:id/files`) supports server-side filtering:

| Param | Type | Description |
|-------|------|-------------|
| `search` | string | Searches `key` and `originalName` (case-insensitive contains) |
| `mimeType` | string | Filters by MIME type prefix (e.g., `image/`, `application/pdf`) |
| `dateFrom` | ISO string | Files created after this date |
| `dateTo` | ISO string | Files created before this date |
| `sizeMin` | number | Minimum file size in bytes |
| `sizeMax` | number | Maximum file size in bytes |

The frontend uses debounced filters (300ms) and passes them to the API via query params.

### Use Todo Lists for Multi-Step Tasks

For complex implementations, **always use TodoWrite** to track progress:

1. Break down into discrete steps
2. Mark each step in_progress before starting
3. Mark completed immediately after finishing (don't batch)
4. This prevents forgetting steps and provides visibility

### Test the Full Flow, Not Just Individual Parts

After implementing, test the complete user flow:

1. Navigate to the feature
2. Perform the action
3. Verify the result appears correctly
4. Check related features still work (e.g., after adding filters, verify folder navigation still shows files)
