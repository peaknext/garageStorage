# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A centralized file storage service using MinIO (S3-Compatible Object Storage) for multi-tenant web applications. The system provides a REST API for external applications and an admin dashboard for management.

## Tech Stack

- **Backend**: NestJS + TypeScript, PostgreSQL (Prisma ORM), Redis cache, MinIO S3 storage
- **Frontend**: Next.js 14 (App Router), Tailwind CSS + shadcn/ui, TanStack Query, Axios, Zustand (state), Recharts (analytics)
- **Infrastructure**: Docker Compose, MinIO, PostgreSQL (Docker container)
- **Processing**: Sharp (image thumbnails), Bull (background jobs), @nestjs/schedule (cron), EventEmitter (async events)

## 🚨 Critical Development Rules

#### Rule 1: Never Accumulate Type Errors

```bash
# Fix type errors AS YOU WRITE CODE
# Run type-check frequently during development:
cd backend && npm run build        # Backend type check (builds to dist/)
cd frontend && npx tsc --noEmit    # Frontend type check (no output)

# DO NOT let errors pile up - 156 errors = 780 minutes wasted!
# Fix errors immediately when they appear in your editor
```

**Why this matters:**

- Catching errors early = easier to fix (context is fresh)
- Accumulated errors = hard to debug (lost context)
- Dev mode hides errors that WILL fail in production build

#### Rule 2: Test on dev server before building docker image

```bash
# Backend: localhost:9001
cd backend && npm run start:dev

# Frontend: localhost:3000
cd frontend && npm run dev
```

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
2. Initialize MinIO storage:
   - **Windows**: Run `.\scripts\setup-minio.ps1` in PowerShell (as Administrator)
   - **Linux/macOS**: Run `./scripts/setup-minio.sh`
3. Copy the generated `S3_ACCESS_KEY` and `S3_SECRET_KEY` to `.env`
4. Run migrations: `cd backend && npx prisma migrate dev`
5. Seed database: `npx prisma db seed`
6. Start services: `docker compose up -d --build`

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Admin UI      │     │  External Apps  │
│  (Next.js)      │     │                 │
│  Port: 9002     │     │                 │
└────────┬────────┘     └────────┬────────┘
         │ JWT Auth              │ API Key Auth
         ▼                       ▼
┌─────────────────────────────────────────┐
│           Storage API (NestJS)          │
│                Port: 9001               │
└────────┬──────────────────┬─────────────┘
         │                  │
         ▼                  ▼
┌─────────────┐    ┌─────────────────────┐
│  PostgreSQL │    │  MinIO S3 Storage   │
│  Port: 9006 │    │    Port: 9000       │
└─────────────┘    └─────────────────────┘
```

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
// Uses: S3_ENDPOINT (http://localhost:9000 - S3 API)
s3Client;

// Public client - for generating presigned URLs
// Uses: S3_PUBLIC_ENDPOINT (http://YOUR_SERVER_IP:9000 - browser accessible)
s3PublicClient;
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

| Module         | Purpose                                           |
| -------------- | ------------------------------------------------- |
| `auth`         | JWT authentication, login/logout                  |
| `applications` | Multi-tenant app management                       |
| `buckets`      | Storage container CRUD                            |
| `files`        | File upload/download/delete                       |
| `shares`       | Public share links with expiry                    |
| `webhooks`     | Event notifications to external apps              |
| `audit`        | Operation logging with filters/export             |
| `policies`     | Automated storage rules (retention, cleanup)      |
| `alerts`       | Quota monitoring with email/webhook notifications |
| `tags`         | File tagging system                               |
| `folders`      | Virtual folder hierarchy                          |
| `processing`   | Thumbnail generation, file previews               |
| `analytics`    | Usage statistics and charts data                  |

### External API Endpoints (API Key Auth)

External applications use the `X-API-Key` header for authentication. See [API_INTEGRATION_GUIDE.md](docs/API_INTEGRATION_GUIDE.md) for full documentation.

| Category | Endpoints | Description |
|----------|-----------|-------------|
| Buckets | `GET/POST /buckets`, `GET/PATCH/DELETE /buckets/:id` | Bucket CRUD |
| Files | `GET/POST /buckets/:id/files`, `GET/DELETE /buckets/:id/files/:fileId` | File operations (DELETE is soft delete, add `?permanent=true` for hard delete) |
| File Operations | `POST /buckets/:id/files/:fileId/copy`, `POST .../move` | Copy/move files between buckets |
| Search | `POST /files/search` | Cross-bucket file search |
| Thumbnails | `GET /buckets/:id/files/:fileId/thumbnail`, `POST .../regenerate` | Get/regenerate thumbnails |
| Recycle Bin | `GET /recycle-bin`, `POST /recycle-bin/:fileId/restore`, `DELETE /recycle-bin/:fileId`, `POST /recycle-bin/purge` | List deleted files, restore, permanently delete, empty bin |
| Bucket Recycle Bin | `GET /buckets/:id/recycle-bin`, `POST /buckets/:id/recycle-bin/purge` | Bucket-scoped recycle bin operations |
| Tags | `GET/POST/PATCH/DELETE /tags`, `GET /tags/:id/files` | Tag management |
| File Tags | `GET/POST/DELETE /buckets/:id/files/:fileId/tags` | File-tag associations |
| Folders | `GET/POST /buckets/:id/folders`, `PATCH/DELETE /folders/:id` | Folder management |
| Folder Files | `GET /folders/:id/files`, `POST/DELETE /buckets/:id/files/:fileId/folders` | Folder-file associations |
| Shares | `POST/GET/DELETE /files/:fileId/shares` | Share link management |

### Webhook Events

External apps can subscribe to these events via webhook configuration:

| Event | Trigger | Payload Fields |
|-------|---------|----------------|
| `file.uploaded` | File upload completed | `fileId`, `key`, `bucket`, `mimeType`, `sizeBytes` |
| `file.deleted` | File soft deleted (moved to recycle bin) | `fileId`, `key`, `bucket`, `deletedAt` |
| `file.restored` | File restored from recycle bin | `fileId`, `key`, `bucket`, `restoredAt` |
| `file.purged` | File permanently deleted | `fileId`, `key`, `bucket`, `reason` (manual/auto_purge_expired/empty_recycle_bin) |
| `file.downloaded` | File download URL generated | `fileId`, `key`, `bucket` |
| `file.copied` | File copied to another bucket | `sourceFileId`, `newFileId`, `sourceBucket`, `targetBucket` |
| `file.moved` | File moved to another bucket | `fileId`, `fromBucket`, `toBucket` |
| `bucket.created` | New bucket created | `bucketId`, `name`, `s3BucketId` |
| `bucket.deleted` | Bucket deleted | `bucketId`, `name` |
| `share.created` | Share link created | `shareId`, `fileId`, `fileName`, `expiresAt`, `shareUrl` |
| `share.accessed` | Share link used for download | `shareId`, `fileId`, `fileName`, `downloadCount`, `accessedAt` |
| `quota.warning` | Quota usage reached warning threshold | `applicationId`, `usedBytes`, `quotaBytes`, `percentage` |
| `quota.critical` | Quota usage reached critical threshold | `applicationId`, `usedBytes`, `quotaBytes`, `percentage` |

### Key Prisma Enums (import from `@prisma/client`)

`AppStatus`, `AdminRole`, `ThumbnailStatus`, `ActorType`, `AuditStatus`, `PolicyScope`, `PolicyType`, `AlertLevel`

### Key Files

- [s3.service.ts](backend/src/services/s3/s3.service.ts) - Dual S3 client (MinIO) with presigned URL generation
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

| Variable                 | Description                           | Example                      |
| ------------------------ | ------------------------------------- | ---------------------------- |
| `S3_ENDPOINT`            | S3 endpoint for server operations     | `http://localhost:9000`      |
| `S3_PUBLIC_ENDPOINT`     | Public S3 endpoint (browser access)   | `http://YOUR_SERVER_IP:9000` |
| `API_BASE_URL`           | Public API URL for share links        | `http://localhost:9001`      |

## Service Ports

| Service             | Port          | Notes                    |
| ------------------- | ------------- | ------------------------ |
| Admin UI (Docker)   | 9002          | Production container     |
| Admin UI (Dev)      | 3000          | `npm run dev` in frontend|
| Storage API         | 9001          | Both Docker and dev      |
| Swagger Docs        | 9001/api/docs |                          |
| MinIO S3 API        | 9000          | MinIO S3 API             |
| MinIO Console       | 9001          | MinIO Console            |
| Redis               | 6379 / 9005   | Native / Docker mapped   |
| PostgreSQL          | 9006          | Docker container         |

## Default Credentials

- **Admin Dashboard**: `admin@example.com` / `admin123`
- **PostgreSQL**: `postgres` / `9006` on database `garageStorage`

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
import { createPortal } from "react-dom";

export function MyModal({ onClose }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/90 backdrop-blur-md"
        onClick={onClose}
      />
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

- **AccessDenied: Invalid signature**: Ensure `S3_PUBLIC_ENDPOINT` matches the URL browsers use. Presigned URLs must be signed with the public endpoint.
- **Download URL uses internal hostname**: Check that `s3PublicClient` is used for `getPresignedDownloadUrl`.

### TypeScript Errors

- **Type 'string' is not assignable to 'AppStatus'**: Import enum from `@prisma/client`.
- **'data' is of type 'unknown'**: Add generic type: `apiClient.get<{ data: Type[] }>(...)`.

## Dashboard Pages

| Page               | Route                         | Description                                              |
| ------------------ | ----------------------------- | -------------------------------------------------------- |
| Dashboard          | `/`                           | Overview with stats cards                                |
| Applications       | `/applications`               | List and manage tenant applications                      |
| Application Detail | `/applications/[id]`          | View app details, API key, webhooks preview              |
| Webhooks           | `/applications/[id]/webhooks` | Manage application webhooks                              |
| Buckets            | `/buckets`                    | List and manage storage buckets                          |
| Bucket Detail      | `/buckets/[id]`               | File management, upload, delete, share, folders, preview, recycle bin tab |
| Tags               | `/tags`                       | Tag management across all applications                   |
| Share Links        | `/shares`                     | Global view of all share links                           |
| Orphan Files       | `/orphan-files`               | Detect and clean up orphaned files                       |
| Recycle Bin        | `/recycle-bin`                | View and manage soft-deleted files (30-day retention)    |
| Analytics          | `/analytics`                  | Charts and usage statistics                              |
| Audit Logs         | `/audit`                      | System operation logs with filters/export                |
| Policies           | `/policies`                   | Storage policies (retention, auto-delete, purge-deleted) |
| Alerts             | `/alerts`                     | Quota alert configuration per application                |
| Settings           | `/settings`                   | Profile and password management                          |

## API Response Patterns

### Paginated List Response

```typescript
interface PaginatedResponse<T> {
  data: T[];
  meta: {
    // or 'pagination' in some endpoints
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

| Issue                        | Root Cause                                                                | Fix                                                           |
| ---------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Move-to-folder 500 error     | Frontend sent `{ folderIds: [id] }`, backend expected `{ folderId: id }`  | Check controller `@Body()` decorators match frontend payloads |
| Folder files not showing     | `getFilesInFolder` returned raw DB objects without tags/formatting        | Format response to match main files list structure            |
| Thumbnail generation failing | Bull queue needed `REDIS_HOST/PORT/PASSWORD` but only `REDIS_URL` was set | Add all required Redis env vars to docker-compose             |

### Response Format Consistency

When multiple endpoints return similar data, **ensure consistent formatting**:

```typescript
// BAD: getFilesInFolder returns different format than listFiles
return { data: fileFolders.map((ff) => ff.file) }; // Raw DB object

// GOOD: Format to match other endpoints
return {
  data: fileFolders.map((ff) => ({
    ...ff.file,
    sizeBytes: Number(ff.file.sizeBytes), // BigInt → Number
    tags: ff.file.tags?.map((t) => ({
      id: t.tag.id,
      name: t.tag.name,
      color: t.tag.color,
    })),
  })),
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
  - REDIS_URL=redis://:password@redis:9005 # For general Redis client
  - REDIS_HOST=redis # Required for Bull
  - REDIS_PORT=9005 # Required for Bull
  - REDIS_PASSWORD=${REDIS_PASSWORD} # Required for Bull
```

### File Search API

The files list endpoint (`GET /admin/buckets/:id/files`) supports server-side filtering:

| Param      | Type       | Description                                                     |
| ---------- | ---------- | --------------------------------------------------------------- |
| `search`   | string     | Searches `key` and `originalName` (case-insensitive contains)   |
| `mimeType` | string     | Filters by MIME type prefix (e.g., `image/`, `application/pdf`) |
| `dateFrom` | ISO string | Files created after this date                                   |
| `dateTo`   | ISO string | Files created before this date                                  |
| `sizeMin`  | number     | Minimum file size in bytes                                      |
| `sizeMax`  | number     | Maximum file size in bytes                                      |

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

## Lessons Learned (Session 2025-12-30)

### Docker Cache Issues with Backend Changes

When backend routes return 404 but the code looks correct, **the Docker container may be using cached code**:

```bash
# Force rebuild without cache when routes aren't updating
docker compose build --no-cache storage-api
docker compose up -d storage-api
```

This commonly happens when:
- Adding new controllers or routes
- Modifying module registrations
- Changes to route paths

### Orphan Detection Must Exclude Soft-Deleted Files

When implementing soft delete (recycle bin), **update orphan detection to exclude soft-deleted files**:

```typescript
// In orphan.service.ts - get active files only
const dbFiles = await this.prisma.file.findMany({
  where: { bucketId: bucket.id, deletedAt: null }, // Exclude soft-deleted
});

// Get soft-deleted keys separately to exclude from S3 orphan detection
const softDeletedFiles = await this.prisma.file.findMany({
  where: { bucketId: bucket.id, deletedAt: { not: null } },
  select: { key: true },
});
const softDeletedKeys = new Set(softDeletedFiles.map((f) => f.key));

// When scanning S3, skip soft-deleted file keys
if (softDeletedKeys.has(key)) continue;
```

Without this, soft-deleted files (still in S3 but marked deleted in DB) appear as orphans.

### API Response Structure: Watch for Nested `data.data`

Many endpoints return `{ data: [...], meta: {...} }`. When fetching with Axios:

```typescript
// BAD: Assumes response.data is the array directly
const { data } = await apiClient.get('/admin/applications');
return data; // This is { data: [...], meta: {...} }, not the array!

// GOOD: Extract the nested data property
const { data } = await apiClient.get<{ data: Application[] }>('/admin/applications');
return data.data; // Now we have the array
```

**Symptom**: `TypeError: xxx.map is not a function` - you're trying to map an object, not an array.

### Search Input Focus Loss: Use Local State + Debounce

When a search input triggers re-renders on every keystroke (via parent state update), the input loses focus. Fix with **local state + debounced sync**:

```typescript
// Local state for immediate updates (no re-render)
const [localSearch, setLocalSearch] = useState(filters?.search || '');
const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

// Sync local state when external filters change
useEffect(() => {
  setLocalSearch(filters?.search || '');
}, [filters?.search]);

// Debounce updates to parent
const handleSearchChange = (value: string) => {
  setLocalSearch(value); // Update immediately (no parent re-render)

  if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
  searchTimeoutRef.current = setTimeout(() => {
    onFiltersChange({ ...filters, search: value }); // Update parent after delay
  }, 300);
};

// Use localSearch for input value
<Input value={localSearch} onChange={(e) => handleSearchChange(e.target.value)} />
```

### Display Counts: Use Total, Not Page Length

When displaying counts with pagination, **use the total from API meta, not the array length**:

```typescript
// BAD: Shows items on current page
<CardDescription>{files?.length || 0} files in this bucket</CardDescription>

// GOOD: Shows total across all pages
<CardDescription>{totalFiles || 0} files in this bucket</CardDescription>
```

### Pagination with Many Pages: Ellipsis + Jump-to-Page

For large datasets, show contextual page numbers with ellipsis:

```
Page 1:    [1] [2] [3] [4] [5] ... [100]
Page 50:   [1] ... [48] [49] [50] [51] [52] ... [100]
Page 100:  [1] ... [96] [97] [98] [99] [100]
```

Add a "Go to page" input for direct navigation when `totalPages > 5`:

```typescript
{totalPages > 5 && (
  <div className="flex items-center gap-2">
    <span>Go to</span>
    <Input
      type="number"
      min={1}
      max={totalPages}
      value={jumpToPage}
      onChange={(e) => setJumpToPage(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && handleJump()}
    />
    <Button onClick={handleJump}>Go</Button>
  </div>
)}
```

### Query String Construction: Check for Missing `?`

When building URLs with optional parameters, ensure the query string starts correctly:

```typescript
// BAD: Missing ? when no previous params
`/admin/recycle-bin?${selectedAppId ? `applicationId=${selectedAppId}&` : ''}limit=100`
// Result when no app selected: "/admin/recycle-bin?limit=100" ✓
// BUT if applicationId is set: "/admin/recycle-bin?applicationId=xxx&limit=100" ✓

// This pattern works but be careful with:
const params = new URLSearchParams();
if (selectedAppId) params.append('applicationId', selectedAppId);
params.append('limit', '100');
const url = `/admin/recycle-bin?${params.toString()}`;
```

### Set Iteration: Use Array.from() for Compatibility

TypeScript in production build may fail when iterating Sets directly. Convert to array first:

```typescript
// BAD: May fail with "can only be iterated through when using '--downlevelIteration'"
for (const fileId of selectedFiles) { // selectedFiles is Set<string>
  await restoreMutation.mutateAsync(fileId);
}

// GOOD: Convert Set to Array before iterating
for (const fileId of Array.from(selectedFiles)) {
  await restoreMutation.mutateAsync(fileId);
}
```

This happens because the Docker build uses stricter TypeScript settings than local dev mode.

## Lessons Learned (Session 2026-03-14 — First Windows Native Deployment)

### Git Bash MSYS Path Expansion Breaks Env Vars

On Windows with Git Bash, environment variables starting with `/` get expanded to Windows paths:

```bash
# BAD: Git Bash expands /api/v1 to C:/Program Files/Git/api/v1
NEXT_PUBLIC_API_URL=/api/v1 npm run build

# GOOD: Disable MSYS path conversion
MSYS_NO_PATHCONV=1 NEXT_PUBLIC_API_URL=/api/v1 npm run build

# GOOD: Use full URL instead of relative path
NEXT_PUBLIC_API_URL=http://localhost:4001/api/v1 npm run build
```

**Symptom**: Next.js build fails with `destination does not start with /, http://, or https://` showing a `C:/Program Files/Git/...` path in the rewrite config.

### PM2 on Windows: Use Node Module Path, Not Bin Script

The `node_modules/.bin/next` file is a bash shell script — PM2 on Windows tries to run it with Node and fails:

```javascript
// BAD: .bin/next is a bash script, causes SyntaxError on Windows
script: 'node_modules/.bin/next',

// GOOD: Point directly to the Node.js entry point
script: 'node_modules/next/dist/bin/next',
```

**Symptom**: PM2 process immediately crashes with `SyntaxError: missing ) after argument list` pointing at `basedir=$(dirname...)` in the bin script.

### Prisma 7.x Seed Script Requires Adapter Pattern

When using Prisma 7.x with the driver adapter pattern (no `url` in `datasource` block), the seed script must also use the adapter — `new PrismaClient()` without args will fail:

```typescript
// BAD: Fails with "PrismaClient needs non-empty PrismaClientOptions"
const prisma = new PrismaClient();

// GOOD: Use the same adapter pattern as the main app
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
```

### Prisma 7.x CLI Requires Explicit Config Path

`prisma migrate deploy` and `prisma db seed` need `--config` to find `prisma.config.ts`:

```bash
# BAD: Fails with "datasource.url property is required"
npx prisma migrate deploy

# GOOD: Point to the config file explicitly
npx prisma migrate deploy --config ./prisma/prisma.config.ts
```

Also ensure `.env` exists in the backend directory (not just project root) since `prisma.config.ts` loads dotenv from CWD.

### NSSM Environment Variables Require Service Restart

When setting `AppEnvironmentExtra` via NSSM, changes only take effect after stopping and starting the service:

```powershell
# Environment changes don't apply to a running service
nssm set MinIO AppEnvironmentExtra 'MINIO_ROOT_USER=admin' 'MINIO_ROOT_PASSWORD=secret'

# Must stop and start (not just restart) for env changes
nssm stop MinIO
nssm start MinIO
```

### nginx Reload Requires Admin Privileges or NSSM

On Windows, `nginx -s reload` fails with "Access is denied" when the nginx process is managed by NSSM as a Windows Service. Use NSSM to restart instead:

```powershell
# BAD: Fails with access denied
C:\nginx\nginx.exe -s reload

# GOOD: Use NSSM to restart the service
nssm restart nginx
```

### Port Conflict Awareness: Always Scan Before Deploying

On shared Windows Servers, other applications may already occupy common ports (3000, 4000, etc.). Before deployment:

```powershell
# Check all listening ports
netstat -an | findstr LISTENING

# Check existing PM2 processes
pm2 list

# Use unique PM2 app names to avoid collisions
name: 'garage-storage-api'    # NOT 'storage-api' (too generic)
name: 'garage-admin-ui'       # NOT 'admin-ui' (too generic)
```

### Co-located Services: Separate nginx Server Blocks by Port

When deploying alongside existing apps on the same nginx instance, add a new `server` block on a different port rather than modifying the existing config:

```nginx
# Existing app on port 443 — don't touch
server { listen 443 ssl; ... }

# New app on a separate port with its own upstreams
server { listen 9002 ssl; ... }
```

This avoids breaking existing services and makes it easy to manage independently.
