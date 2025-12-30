# Garage Storage Service - API Integration Guide

> **Version**: 1.0
> **Base URL**: `http://localhost:4001/api/v1`
> **Swagger Docs**: `http://localhost:4001/api/docs`

This guide provides everything external application development teams need to integrate with the Garage Storage Service.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Authentication](#authentication)
3. [Bucket Operations](#bucket-operations)
4. [File Operations](#file-operations)
5. [Recycle Bin](#recycle-bin)
6. [Tags](#tags)
7. [Folders](#folders)
8. [File Sharing](#file-sharing)
9. [Webhooks](#webhooks)
10. [Analytics](#analytics)
11. [Error Handling](#error-handling)
12. [Storage Limits & Quotas](#storage-limits--quotas)
13. [Code Examples](#code-examples)

---

## Quick Start

### 1. Get Your API Key

Contact the storage service administrator to create an application and receive your API key. The API key is shown only once during creation - store it securely.

### 2. Make Your First Request

```bash
curl -X GET http://localhost:4001/api/v1/buckets \
  -H "X-API-Key: your_api_key_here"
```

### 3. Create a Bucket and Upload a File

```bash
# Create bucket
curl -X POST http://localhost:4001/api/v1/buckets \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-bucket"}'

# Upload file (< 10MB)
curl -X POST http://localhost:4001/api/v1/buckets/{bucketId}/files/upload \
  -H "X-API-Key: your_api_key" \
  -F "file=@document.pdf"
```

---

## Authentication

### API Key Authentication

All external API requests require API key authentication via the `X-API-Key` header.

| Header | Value |
|--------|-------|
| `X-API-Key` | Your application's API key |

```http
GET /api/v1/buckets HTTP/1.1
Host: localhost:4001
X-API-Key: sk_live_abc123def456...
```

### Security Notes

- **Never expose API keys in client-side code** - Use a backend proxy
- API keys are hashed with bcrypt and validated on each request
- Validated credentials are cached in Redis for 5 minutes
- Configure `allowedOrigins` to restrict which domains can access your application

### Origin Restrictions

Your application can be configured with allowed origins for CORS:
- Empty array = all origins allowed (default)
- Non-empty array = only listed origins allowed

### Response Format

All list/search endpoints return a consistent response structure:

```json
{
  "data": [...],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

> **Important for JavaScript/TypeScript clients:** When using axios, the API response is wrapped in axios's `response.data`. So to access the file array:
> ```typescript
> const response = await axios.get('/buckets/{id}/files');
> const files = response.data.data;  // Note: data.data
> const meta = response.data.meta;
> ```

Single resource endpoints (GET by ID, create, update) return the resource object directly without the `data`/`meta` wrapper.

---

## Bucket Operations

Buckets are containers for organizing files within your application.

### List Buckets

```http
GET /buckets?page=1&limit=20
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page |

**Response:**
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "documents",
      "usedBytes": 1048576,
      "quotaBytes": 5368709120,
      "fileCount": 5,
      "isPublic": false,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

### Get Bucket Details

```http
GET /buckets/{bucketId}
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "documents",
  "usedBytes": 1048576,
  "quotaBytes": 5368709120,
  "fileCount": 5,
  "isPublic": false,
  "corsEnabled": true,
  "versioningEnabled": false,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### Create Bucket

```http
POST /buckets
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "my-bucket",
  "quotaBytes": 5368709120,
  "isPublic": false,
  "corsEnabled": true
}
```

**Validation Rules:**
| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `name` | string | Yes | Max 63 chars, pattern: `^[a-z0-9-]+$` |
| `quotaBytes` | number | No | Storage limit in bytes |
| `isPublic` | boolean | No | Default: false |
| `corsEnabled` | boolean | No | Default: true |

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "my-bucket",
  "garageBucketId": "appid-my-bucket-uuid",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### Update Bucket

```http
PATCH /buckets/{bucketId}
Content-Type: application/json
```

**Request Body:**
```json
{
  "quotaBytes": 10737418240,
  "isPublic": true,
  "corsEnabled": true
}
```

### Delete Bucket

```http
DELETE /buckets/{bucketId}?force=false
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `force` | boolean | false | Force delete even if bucket contains files |

**Response:** `204 No Content`

> **Warning:** If `force=true`, all files in the bucket will be permanently deleted.

---

## File Operations

### List Files in Bucket

```http
GET /buckets/{bucketId}/files?page=1&limit=50&prefix=documents/
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 50 | Items per page |
| `prefix` | string | - | Filter by key prefix (e.g., "documents/") |
| `mimeType` | string | - | Filter by MIME type prefix (e.g., "image/") |
| `sort` | string | "createdAt" | Sort field |
| `order` | string | "desc" | Sort order: "asc" or "desc" |

**Response:**
```json
{
  "data": [
    {
      "id": "file-uuid",
      "key": "2024/01/01/uuid.pdf",
      "originalName": "document.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 1048576,
      "isPublic": false,
      "downloadCount": 5,
      "thumbnailStatus": "GENERATED",
      "thumbnailUrl": "https://presigned-url...",
      "tags": [
        { "id": "tag-id", "name": "important", "color": "#ff0000" }
      ],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "url": "https://..."
    }
  ],
  "meta": {
    "total": 10,
    "page": 1,
    "limit": 50,
    "totalPages": 1
  }
}
```

**Thumbnail Status Values (in file listings):** `GENERATED`, `PENDING`, `FAILED`, `NONE`, `NOT_APPLICABLE`

> **Note:** Image files automatically get thumbnails generated. The `thumbnailUrl` is a presigned URL (valid for 5 minutes) included when `thumbnailStatus` is `GENERATED`.

### Get File Details

```http
GET /buckets/{bucketId}/files/{fileId}
```

**Response:**
```json
{
  "id": "file-uuid",
  "key": "2024/01/01/uuid.pdf",
  "originalName": "document.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 1048576,
  "checksum": "md5hash",
  "metadata": {
    "category": "documents"
  },
  "isPublic": false,
  "uploadedBy": "user-id",
  "downloadCount": 5,
  "lastAccessedAt": "2024-01-01T00:00:00.000Z",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### Upload File (Direct - Small Files)

Use this method for files **under 10 MB**.

```http
POST /buckets/{bucketId}/files/upload
Content-Type: multipart/form-data
```

**Form Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file` | binary | Yes | File to upload |
| `key` | string | No | Custom file path/key (max 1024 chars) |
| `metadata` | string | No | JSON string of custom metadata |
| `isPublic` | boolean | No | Make file publicly accessible |

**Response:**
```json
{
  "id": "file-uuid",
  "key": "2024/01/01/uuid.pdf",
  "originalName": "document.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 1048576,
  "isPublic": false,
  "downloadCount": 0,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "url": "https://..."
}
```

### Upload File (Presigned URL - Large Files)

Use this 3-step process for files **up to 5 GB**.

#### Step 1: Get Presigned Upload URL

```http
POST /buckets/{bucketId}/files/presigned-upload
Content-Type: application/json
```

**Request Body:**
```json
{
  "key": "documents/report-2024.pdf",
  "contentType": "application/pdf",
  "contentLength": 536870912,
  "metadata": {
    "originalName": "report.pdf",
    "category": "documents"
  },
  "isPublic": false
}
```

**Validation:**
| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `key` | string | No | Max 1024 chars, auto-generated if not provided |
| `contentType` | string | Yes | MIME type of file |
| `contentLength` | number | Yes | Size in bytes (max 5GB) |
| `metadata` | object | No | Custom metadata |
| `isPublic` | boolean | No | Default: false |

**Response:**
```json
{
  "uploadUrl": "https://garage:3900/bucket/key?X-Amz-Algorithm=AWS4-HMAC-SHA256&...",
  "uploadId": "550e8400-e29b-41d4-a716-446655440000",
  "key": "2024/01/01/uuid.pdf",
  "expiresAt": "2024-01-01T01:00:00.000Z",
  "headers": {
    "Content-Type": "application/pdf"
  }
}
```

#### Step 2: Upload to S3 URL

Upload your file directly to the returned `uploadUrl`:

```bash
curl -X PUT \
  -H "Content-Type: application/pdf" \
  --data-binary @document.pdf \
  "https://garage:3900/bucket/key?X-Amz-Algorithm=..."
```

#### Step 3: Confirm Upload

```http
POST /buckets/{bucketId}/files/confirm-upload
Content-Type: application/json
```

**Request Body:**
```json
{
  "uploadId": "550e8400-e29b-41d4-a716-446655440000",
  "etag": "d41d8cd98f00b204e9800998ecf8427e"
}
```

**Response:** Same as direct upload response

### Get Download URL

```http
GET /buckets/{bucketId}/files/{fileId}/download?expiresIn=3600
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `expiresIn` | number | 3600 | URL expiration in seconds |

**Response:**
```json
{
  "url": "https://garage:3900/bucket/key?X-Amz-Algorithm=AWS4-HMAC-SHA256&...",
  "expiresAt": "2024-01-01T01:00:00.000Z"
}
```

### Update File Metadata

```http
PATCH /buckets/{bucketId}/files/{fileId}
Content-Type: application/json
```

**Request Body:**
```json
{
  "metadata": {
    "category": "reports",
    "version": "2.0"
  },
  "isPublic": true
}
```

### Delete File (Soft Delete)

By default, deleting a file moves it to the recycle bin where it will be automatically purged after 30 days. Use `?permanent=true` to skip the recycle bin and permanently delete immediately.

```http
DELETE /buckets/{bucketId}/files/{fileId}?permanent=false
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `permanent` | boolean | false | If true, permanently delete (skip recycle bin) |

**Response:** `204 No Content`

### Bulk Delete Files

```http
POST /buckets/{bucketId}/files/bulk-delete
Content-Type: application/json
```

**Request Body:**
```json
{
  "fileIds": ["uuid1", "uuid2", "uuid3"],
  "permanent": false
}
```

**Parameters:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `fileIds` | array | Required | List of file IDs to delete |
| `permanent` | boolean | false | If true, permanently delete (skip recycle bin) |

**Response:**
```json
{
  "deleted": 2,
  "failed": ["uuid3"]
}
```

### Copy File

Copy a file to another bucket (or same bucket with different key).

```http
POST /buckets/{bucketId}/files/{fileId}/copy
Content-Type: application/json
```

**Request Body:**
```json
{
  "targetBucketId": "target-bucket-uuid",
  "newKey": "path/to/copied-file.pdf"
}
```

**Response:** Returns the new file object

### Move File

Move a file to another bucket.

```http
POST /buckets/{bucketId}/files/{fileId}/move
Content-Type: application/json
```

**Request Body:**
```json
{
  "targetBucketId": "target-bucket-uuid",
  "newKey": "path/to/moved-file.pdf"
}
```

**Response:** Returns the updated file object

### Search Files

Search across all buckets in your application.

```http
POST /files/search
Content-Type: application/json
```

**Request Body:**
```json
{
  "query": "report",
  "bucketIds": ["bucket-uuid-1", "bucket-uuid-2"],
  "tagIds": ["tag-uuid-1"],
  "mimeTypes": ["image/", "application/pdf"],
  "dateFrom": "2024-01-01T00:00:00.000Z",
  "dateTo": "2024-12-31T23:59:59.999Z",
  "sizeMin": 1024,
  "sizeMax": 10485760,
  "page": 1,
  "limit": 50
}
```

**Response:**
```json
{
  "data": [
    {
      "id": "file-uuid",
      "key": "path/to/file.pdf",
      "originalName": "report.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 1048576,
      "isPublic": false,
      "downloadCount": 5,
      "thumbnailStatus": "GENERATED",
      "thumbnailUrl": "https://presigned-url...",
      "bucket": {
        "id": "bucket-uuid",
        "name": "documents"
      },
      "tags": [
        { "id": "tag-id", "name": "important", "color": "#ff0000" }
      ],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "url": "https://presigned-download-url..."
    }
  ],
  "meta": {
    "total": 10,
    "page": 1,
    "limit": 50,
    "totalPages": 1
  }
}
```

**Thumbnail Status Values:** `GENERATED`, `PENDING`, `FAILED`, `NONE`, `NOT_APPLICABLE`

> **Tip:** Use the `thumbnailUrl` from search/list responses to display thumbnails without making additional API calls. The URL is pre-signed and valid for 5 minutes.

### Get Thumbnail

Get thumbnail URL for an image file.

```http
GET /buckets/{bucketId}/files/{fileId}/thumbnail
```

**Response:**
```json
{
  "status": "available",
  "url": "https://presigned-thumbnail-url...",
  "expiresAt": "2024-01-01T01:00:00.000Z"
}
```

**Status Values (lowercase):** `available`, `pending`, `failed`, `not_available`

> **Note:** This endpoint uses lowercase status values for backward compatibility. File listing/search endpoints use uppercase enum values (`GENERATED`, `PENDING`, `FAILED`, `NONE`). The mapping is:
> - `available` = `GENERATED`
> - `pending` = `PENDING`
> - `failed` = `FAILED`
> - `not_available` = `NONE` or `NOT_APPLICABLE`

### Regenerate Thumbnail

Request thumbnail regeneration for an image file.

```http
POST /buckets/{bucketId}/files/{fileId}/thumbnail/regenerate
```

**Response:**
```json
{
  "status": "queued",
  "fileId": "file-uuid"
}
```

---

## Recycle Bin

Deleted files are moved to the recycle bin for 30 days before being permanently deleted. This allows recovery of accidentally deleted files.

### List Deleted Files

```http
GET /recycle-bin?page=1&limit=50
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 50 | Items per page |
| `bucketId` | string | - | Filter by bucket |

**Response:**
```json
{
  "data": [
    {
      "id": "file-uuid",
      "key": "2024/01/01/uuid.pdf",
      "originalName": "document.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 1048576,
      "deletedAt": "2024-01-15T00:00:00.000Z",
      "deletedBy": "api",
      "daysRemaining": 15,
      "bucket": {
        "id": "bucket-uuid",
        "name": "documents"
      },
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "total": 10,
    "page": 1,
    "limit": 50,
    "totalPages": 1
  }
}
```

### Restore File

Restore a file from the recycle bin. This will check if there's enough quota available before restoring.

```http
POST /recycle-bin/{fileId}/restore
```

**Response:**
```json
{
  "success": true,
  "fileId": "file-uuid"
}
```

**Possible Errors:**
- `403 Forbidden`: Storage quota exceeded, cannot restore

### Permanently Delete File

Remove a file from the recycle bin immediately (cannot be undone).

```http
DELETE /recycle-bin/{fileId}
```

**Response:** `204 No Content`

### Empty Recycle Bin

Permanently delete all files in the recycle bin.

```http
POST /recycle-bin/purge
```

**Response:**
```json
{
  "deletedCount": 15,
  "freedBytes": 15728640,
  "failed": []
}
```

### List Deleted Files in Bucket

```http
GET /buckets/{bucketId}/recycle-bin?page=1&limit=50
```

**Response:** Same format as global recycle bin list.

### Empty Bucket Recycle Bin

```http
POST /buckets/{bucketId}/recycle-bin/purge
```

**Response:** Same format as global purge.

---

## Tags

Organize files with labels.

### List Tags

```http
GET /tags
```

**Response:**
```json
{
  "data": [
    {
      "id": "tag-uuid",
      "name": "important",
      "color": "#ff0000",
      "_count": { "files": 15 }
    }
  ]
}
```

### Create Tag

```http
POST /tags
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "important",
  "color": "#ff0000"
}
```

### Update Tag

```http
PATCH /tags/{tagId}
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "critical",
  "color": "#ff5500"
}
```

### Delete Tag

```http
DELETE /tags/{tagId}
```

**Response:** `204 No Content`

### Get Files by Tag

```http
GET /tags/{tagId}/files?page=1&limit=50
```

### Get File Tags

```http
GET /buckets/{bucketId}/files/{fileId}/tags
```

### Add Tags to File

```http
POST /buckets/{bucketId}/files/{fileId}/tags
Content-Type: application/json
```

**Request Body:**
```json
{
  "tagIds": ["tag-uuid-1", "tag-uuid-2"]
}
```

### Remove Tag from File

```http
DELETE /buckets/{bucketId}/files/{fileId}/tags/{tagId}
```

### Bulk Tag Files

Add tags to multiple files at once.

```http
POST /tags/bulk
Content-Type: application/json
```

**Request Body:**
```json
{
  "fileIds": ["file-uuid-1", "file-uuid-2", "file-uuid-3"],
  "tagIds": ["tag-uuid-1", "tag-uuid-2"]
}
```

**Response:**
```json
{
  "success": true,
  "filesTagged": 3,
  "tagsAdded": 2
}
```

---

## Folders

Organize files into virtual folder hierarchies.

### List Folders

```http
GET /buckets/{bucketId}/folders
```

**Response:** Returns folder tree structure.

### Create Folder

```http
POST /buckets/{bucketId}/folders
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Documents",
  "parentId": "parent-folder-uuid"
}
```

### Update Folder

Rename or move a folder.

```http
PATCH /folders/{folderId}
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "New Name",
  "parentId": "new-parent-folder-uuid"
}
```

### Delete Folder

```http
DELETE /folders/{folderId}
```

> **Warning:** Deleting a folder deletes all subfolders and removes file associations.

### Get Files in Folder

```http
GET /folders/{folderId}/files?page=1&limit=50
```

### Get Folder Breadcrumb

```http
GET /folders/{folderId}/breadcrumb
```

**Response:**
```json
[
  { "id": "root-uuid", "name": "Root", "path": "/Root/" },
  { "id": "parent-uuid", "name": "Parent", "path": "/Root/Parent/" },
  { "id": "current-uuid", "name": "Current", "path": "/Root/Parent/Current/" }
]
```

### Add File to Folder

```http
POST /buckets/{bucketId}/files/{fileId}/folders
Content-Type: application/json
```

**Request Body:**
```json
{
  "folderId": "folder-uuid"
}
```

### Remove File from Folder

```http
DELETE /buckets/{bucketId}/files/{fileId}/folders/{folderId}
```

---

## File Sharing

Create shareable links for files that can be accessed without API authentication.

### Create Share Link

```http
POST /files/{fileId}/shares
Content-Type: application/json
```

**Request Body:**
```json
{
  "expiresIn": 86400,
  "maxDownloads": 10,
  "password": "secret123",
  "allowPreview": true
}
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `expiresIn` | number | No | Expiration time in seconds (min: 60) |
| `maxDownloads` | number | No | Maximum download count (min: 1) |
| `password` | string | No | Password protection |
| `allowPreview` | boolean | No | Allow file preview (default: true) |

**Response:**
```json
{
  "id": "share-uuid",
  "token": "uuid-token",
  "shareUrl": "http://localhost:4001/api/v1/shares/uuid-token/download",
  "expiresAt": "2024-01-02T00:00:00.000Z",
  "maxDownloads": 10,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### List File Shares

```http
GET /files/{fileId}/shares
```

### Revoke Share Link

```http
DELETE /files/{fileId}/shares/{shareId}
```

### Access Shared File (Public - No Auth Required)

**Get Info:**
```http
GET /shares/{token}?password=secret123
```

**Download:**
```http
GET /shares/{token}/download?password=secret123
```

---

## Webhooks

Receive real-time notifications when events occur in your storage.

### Supported Events

| Event | Description | Payload |
|-------|-------------|---------|
| `file.uploaded` | File was uploaded | `{fileId, key, bucket, size}` |
| `file.deleted` | File was soft deleted (moved to recycle bin) | `{fileId, key, bucket, deletedAt}` |
| `file.restored` | File was restored from recycle bin | `{fileId, key, bucket, restoredAt}` |
| `file.purged` | File was permanently deleted | `{fileId, key, bucket, reason}` |
| `file.downloaded` | File download URL was generated | `{fileId, key, bucket, downloadCount}` |
| `file.copied` | File was copied | `{sourceFileId, newFileId, sourceBucket, targetBucket}` |
| `file.moved` | File was moved | `{fileId, fromBucket, toBucket, newKey}` |
| `bucket.created` | Bucket was created | `{bucketId, name, garageBucketId}` |
| `bucket.deleted` | Bucket was deleted | `{bucketId, name}` |
| `share.created` | Share link was created | `{shareId, fileId, fileName, expiresAt, shareUrl}` |
| `share.accessed` | Share link was used | `{shareId, fileId, fileName, downloadCount, accessedAt}` |
| `quota.warning` | Storage warning threshold hit | `{level, usage, threshold, applicationName}` |
| `quota.critical` | Storage critical threshold hit | `{level, usage, threshold, applicationName}` |

> **Note:** The `reason` field in `file.purged` events can be: `manual`, `auto_purge_expired`, or `empty_recycle_bin`.

### Create Webhook

```http
POST /webhooks
Content-Type: application/json
```

**Request Body:**
```json
{
  "url": "https://your-app.com/webhooks/storage",
  "events": ["file.uploaded", "file.deleted"]
}
```

### Webhook Payload

Your endpoint will receive POST requests with this payload:

```json
{
  "event": "file.uploaded",
  "data": {
    "fileId": "file-uuid",
    "key": "2024/01/01/uuid.pdf",
    "bucket": "my-bucket",
    "size": 1048576
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### List Webhooks

```http
GET /webhooks
```

### Update Webhook

```http
PATCH /webhooks/{webhookId}
Content-Type: application/json
```

### Delete Webhook

```http
DELETE /webhooks/{webhookId}
```

---

## Analytics

Monitor your storage usage and file access patterns.

### Get Storage Overview

```http
GET /analytics/overview
```

**Response:**
```json
{
  "totalStorage": 10737418240,
  "usedStorage": 2147483648,
  "availableStorage": 8589934592,
  "bucketCount": 5,
  "fileCount": 150,
  "storagePercentage": 20.0
}
```

### Get Usage Over Time

```http
GET /analytics/usage?from=2024-01-01T00:00:00Z&to=2024-01-31T23:59:59Z&interval=day
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from` | ISO8601 | Yes | Start date |
| `to` | ISO8601 | Yes | End date |
| `interval` | string | No | "hour", "day", "week", "month" (default: "day") |

### Get Top Downloaded Files

```http
GET /analytics/files/top?limit=10&period=month
```

---

## Error Handling

### Error Response Format

```json
{
  "statusCode": 400,
  "message": "Error description",
  "errors": {
    "field": ["Validation error message"]
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| `200 OK` | Request successful |
| `204 No Content` | Successful deletion |
| `400 Bad Request` | Invalid request or validation error |
| `401 Unauthorized` | Missing or invalid API key |
| `403 Forbidden` | Access denied or quota exceeded |
| `404 Not Found` | Resource not found |
| `500 Internal Server Error` | Server error |

### Common Error Messages

| Message | Cause | Solution |
|---------|-------|----------|
| `API key is required` | Missing X-API-Key header | Add the header |
| `Invalid API key` | Wrong API key | Check your API key |
| `Origin not allowed` | Request origin not allowed | Contact admin to whitelist origin |
| `Bucket not found` | Invalid bucket ID | Verify bucket exists |
| `File not found` | Invalid file ID | Verify file exists |
| `Bucket storage quota exceeded` | Bucket quota full | Delete files or increase quota |
| `Application storage quota exceeded` | App quota full | Contact admin |
| `Upload session expired or invalid` | Presigned upload expired | Generate new presigned URL |
| `File too large for direct upload` | File > 10MB | Use presigned upload |

---

## Storage Limits & Quotas

### File Size Limits

| Upload Method | Maximum Size |
|---------------|--------------|
| Direct Upload | 10 MB |
| Presigned Upload | 5 GB |

### Quota Management

- **Application-Level**: Total storage allocated to your application
- **Bucket-Level**: Optional per-bucket limits

When quota is exceeded, uploads return `403 Forbidden`.

### Pagination Limits

- Default: 20-50 items per page (varies by endpoint)
- Recommended maximum: 100 items per page

---

## Code Examples

### JavaScript/TypeScript (Node.js)

```typescript
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const API_BASE = 'http://localhost:4001/api/v1';
const API_KEY = 'your_api_key';

const client = axios.create({
  baseURL: API_BASE,
  headers: { 'X-API-Key': API_KEY }
});

// Create bucket
async function createBucket(name: string) {
  const response = await client.post('/buckets', { name });
  return response.data;
}

// Upload small file (< 10MB)
async function uploadFile(bucketId: string, filePath: string) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));

  const response = await client.post(
    `/buckets/${bucketId}/files/upload`,
    form,
    { headers: form.getHeaders() }
  );
  return response.data;
}

// Upload large file (presigned URL)
async function uploadLargeFile(
  bucketId: string,
  filePath: string,
  contentType: string
) {
  const stats = fs.statSync(filePath);

  // Step 1: Get presigned URL
  const { data: presigned } = await client.post(
    `/buckets/${bucketId}/files/presigned-upload`,
    {
      contentType,
      contentLength: stats.size
    }
  );

  // Step 2: Upload to S3
  await axios.put(presigned.uploadUrl, fs.createReadStream(filePath), {
    headers: { 'Content-Type': contentType }
  });

  // Step 3: Confirm upload
  const { data: file } = await client.post(
    `/buckets/${bucketId}/files/confirm-upload`,
    { uploadId: presigned.uploadId }
  );

  return file;
}

// Get download URL
async function getDownloadUrl(bucketId: string, fileId: string) {
  const response = await client.get(
    `/buckets/${bucketId}/files/${fileId}/download`
  );
  return response.data.url;
}

// List files
async function listFiles(bucketId: string, options = {}) {
  const response = await client.get(`/buckets/${bucketId}/files`, {
    params: options
  });
  return response.data;
}
```

### Python

```python
import requests
import os

API_BASE = 'http://localhost:4001/api/v1'
API_KEY = 'your_api_key'

headers = {'X-API-Key': API_KEY}

def create_bucket(name: str):
    response = requests.post(
        f'{API_BASE}/buckets',
        headers=headers,
        json={'name': name}
    )
    response.raise_for_status()
    return response.json()

def upload_file(bucket_id: str, file_path: str):
    with open(file_path, 'rb') as f:
        files = {'file': f}
        response = requests.post(
            f'{API_BASE}/buckets/{bucket_id}/files/upload',
            headers=headers,
            files=files
        )
    response.raise_for_status()
    return response.json()

def upload_large_file(bucket_id: str, file_path: str, content_type: str):
    file_size = os.path.getsize(file_path)

    # Step 1: Get presigned URL
    presigned = requests.post(
        f'{API_BASE}/buckets/{bucket_id}/files/presigned-upload',
        headers=headers,
        json={
            'contentType': content_type,
            'contentLength': file_size
        }
    ).json()

    # Step 2: Upload to S3
    with open(file_path, 'rb') as f:
        requests.put(
            presigned['uploadUrl'],
            data=f,
            headers={'Content-Type': content_type}
        )

    # Step 3: Confirm upload
    response = requests.post(
        f'{API_BASE}/buckets/{bucket_id}/files/confirm-upload',
        headers=headers,
        json={'uploadId': presigned['uploadId']}
    )
    return response.json()

def get_download_url(bucket_id: str, file_id: str):
    response = requests.get(
        f'{API_BASE}/buckets/{bucket_id}/files/{file_id}/download',
        headers=headers
    )
    return response.json()['url']

def list_files(bucket_id: str, **kwargs):
    response = requests.get(
        f'{API_BASE}/buckets/{bucket_id}/files',
        headers=headers,
        params=kwargs
    )
    return response.json()
```

### cURL

```bash
# Set variables
API_KEY="your_api_key"
BASE_URL="http://localhost:4001/api/v1"

# Create bucket
curl -X POST "$BASE_URL/buckets" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-bucket"}'

# Upload small file
curl -X POST "$BASE_URL/buckets/{bucketId}/files/upload" \
  -H "X-API-Key: $API_KEY" \
  -F "file=@document.pdf"

# List files
curl -X GET "$BASE_URL/buckets/{bucketId}/files?page=1&limit=20" \
  -H "X-API-Key: $API_KEY"

# Get download URL
curl -X GET "$BASE_URL/buckets/{bucketId}/files/{fileId}/download" \
  -H "X-API-Key: $API_KEY"

# Delete file
curl -X DELETE "$BASE_URL/buckets/{bucketId}/files/{fileId}" \
  -H "X-API-Key: $API_KEY"
```

---

## Best Practices

1. **Store API keys securely** - Never commit to version control or expose in client-side code
2. **Use presigned URLs for large files** - More efficient and supports files up to 5GB
3. **Implement retry logic** - Handle transient failures with exponential backoff
4. **Monitor your quota** - Use analytics endpoints to track usage
5. **Set up webhooks** - Get real-time notifications instead of polling
6. **Use custom metadata** - Tag files for easier organization and retrieval
7. **Configure CORS origins** - Restrict access to your known domains

---

## Support

- **API Documentation**: `http://localhost:4001/api/docs`
- **Admin Dashboard**: `http://localhost:4000`

For issues or feature requests, contact your storage service administrator.
