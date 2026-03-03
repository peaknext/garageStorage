# SKH Storage API - Quick Reference Card

> **Version**: 1.1 | **Full docs**: [API_INTEGRATION_GUIDE.md](API_INTEGRATION_GUIDE.md)

## Authentication

```
Header: X-API-Key: your_api_key_here
```

---

## Endpoints at a Glance

| Method | Endpoint | Description |
|--------|----------|-------------|
| **Buckets** |||
| GET | `/buckets` | List all buckets |
| GET | `/buckets/{id}` | Get bucket details |
| POST | `/buckets` | Create bucket |
| PATCH | `/buckets/{id}` | Update bucket |
| DELETE | `/buckets/{id}?force=false` | Delete bucket |
| **Files** |||
| GET | `/buckets/{id}/files` | List files in bucket |
| GET | `/buckets/{id}/files/{fileId}` | Get file details |
| POST | `/buckets/{id}/files/upload` | Direct upload (< 10MB) |
| POST | `/buckets/{id}/files/presigned-upload` | Get presigned URL (< 5GB) |
| POST | `/buckets/{id}/files/confirm-upload` | Confirm presigned upload |
| GET | `/buckets/{id}/files/{fileId}/download` | Get download URL |
| PATCH | `/buckets/{id}/files/{fileId}` | Update file metadata |
| DELETE | `/buckets/{id}/files/{fileId}` | Soft delete (add `?permanent=true` for hard delete) |
| POST | `/buckets/{id}/files/bulk-delete` | Bulk delete files |
| POST | `/buckets/{id}/files/{fileId}/copy` | Copy file to another bucket |
| POST | `/buckets/{id}/files/{fileId}/move` | Move file to another bucket |
| POST | `/files/search` | Search files across all buckets |
| **Thumbnails** |||
| GET | `/buckets/{id}/files/{fileId}/thumbnail` | Get thumbnail URL |
| POST | `/buckets/{id}/files/{fileId}/thumbnail/regenerate` | Regenerate thumbnail |
| **Recycle Bin** |||
| GET | `/recycle-bin` | List all deleted files |
| GET | `/recycle-bin/stats` | Get recycle bin statistics |
| POST | `/recycle-bin/{fileId}/restore` | Restore deleted file |
| DELETE | `/recycle-bin/{fileId}` | Permanently delete file |
| POST | `/recycle-bin/purge` | Empty entire recycle bin |
| GET | `/buckets/{id}/recycle-bin` | List deleted files in bucket |
| POST | `/buckets/{id}/recycle-bin/purge` | Empty bucket recycle bin |
| **Tags** |||
| GET | `/tags` | List all tags |
| POST | `/tags` | Create tag |
| PATCH | `/tags/{id}` | Update tag |
| DELETE | `/tags/{id}` | Delete tag |
| GET | `/tags/{id}/files` | Get files by tag |
| POST | `/tags/bulk` | Bulk tag multiple files |
| GET | `/buckets/{id}/files/{fileId}/tags` | Get file's tags |
| POST | `/buckets/{id}/files/{fileId}/tags` | Add tags to file |
| DELETE | `/buckets/{id}/files/{fileId}/tags/{tagId}` | Remove tag from file |
| **Folders** |||
| GET | `/buckets/{id}/folders` | List folders in bucket |
| POST | `/buckets/{id}/folders` | Create folder |
| PATCH | `/folders/{id}` | Update/rename folder |
| DELETE | `/folders/{id}` | Delete folder (and subfolders) |
| GET | `/folders/{id}/files` | List files in folder |
| GET | `/folders/{id}/breadcrumb` | Get folder breadcrumb path |
| POST | `/buckets/{id}/files/{fileId}/folders` | Add file to folder |
| DELETE | `/buckets/{id}/files/{fileId}/folders/{folderId}` | Remove file from folder |
| **Shares** |||
| POST | `/files/{id}/shares` | Create share link |
| GET | `/files/{id}/shares` | List file shares |
| DELETE | `/files/{id}/shares/{shareId}` | Revoke share |
| GET | `/shares/{token}` | Get shared file info (public) |
| GET | `/shares/{token}/download` | Download shared file (public) |
| **Webhooks** |||
| GET | `/webhooks` | List webhooks |
| POST | `/webhooks` | Create webhook |
| PATCH | `/webhooks/{id}` | Update webhook |
| DELETE | `/webhooks/{id}` | Delete webhook |
| **Analytics** |||
| GET | `/analytics/overview` | Storage overview |
| GET | `/analytics/usage` | Usage over time |
| GET | `/analytics/files/top` | Top downloaded files |

---

## Common Request Bodies

### Create Bucket
```json
{ "name": "my-bucket", "quotaBytes": 5368709120, "isPublic": false }
```

### Presigned Upload
```json
{ "contentType": "application/pdf", "contentLength": 536870912, "key": "documents/file.pdf" }
```

### Confirm Upload
```json
{ "uploadId": "uuid" }
```

### Copy / Move File
```json
{ "targetBucketId": "target-bucket-uuid", "newKey": "path/to/file.pdf" }
```

### Search Files
```json
{
  "query": "report",
  "bucketIds": ["bucket-uuid"],
  "mimeTypes": ["image/", "application/pdf"],
  "dateFrom": "2024-01-01T00:00:00Z",
  "dateTo": "2024-12-31T23:59:59Z",
  "sizeMin": 1024,
  "sizeMax": 10485760,
  "tagIds": ["tag-uuid"],
  "page": 1, "limit": 50
}
```

### Create Tag
```json
{ "name": "important", "color": "#ff0000" }
```

### Bulk Tag Files
```json
{ "fileIds": ["file-uuid-1", "file-uuid-2"], "tagIds": ["tag-uuid-1"] }
```

### Create Folder
```json
{ "name": "Documents", "parentId": "parent-folder-uuid" }
```

### Add File to Folder
```json
{ "folderId": "folder-uuid" }
```

### Create Share
```json
{ "expiresIn": 86400, "maxDownloads": 10, "password": "secret" }
```

### Create Webhook
```json
{ "url": "https://app.com/webhook", "events": ["file.uploaded", "file.deleted"] }
```

---

## File Size Limits

| Method | Max Size |
|--------|----------|
| Direct Upload | **10 MB** |
| Presigned Upload | **5 GB** |

---

## Response Format

### Success (List)
```json
{
  "data": [...],
  "meta": { "total": 100, "page": 1, "limit": 20, "totalPages": 5 }
}
```

### Error
```json
{ "statusCode": 400, "message": "Error message", "timestamp": "2024-01-01T00:00:00Z" }
```

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 204 | Deleted successfully |
| 400 | Bad request / Validation error |
| 401 | Invalid API key |
| 403 | Forbidden / Quota exceeded |
| 404 | Not found |
| 500 | Server error |

---

## Presigned Upload Flow

```
1. POST /buckets/{id}/files/presigned-upload  →  { uploadUrl, uploadId }
2. PUT {uploadUrl} with file binary            →  Direct to S3
3. POST /buckets/{id}/files/confirm-upload     →  { file object }
```

---

## Query Parameters

### Pagination
```
?page=1&limit=20
```

### File Filtering
```
?prefix=documents/&mimeType=image/&sort=createdAt&order=desc
```

### Analytics
```
?from=2024-01-01T00:00:00Z&to=2024-01-31T23:59:59Z&interval=day
```

---

## Webhook Events

| Event | Payload |
|-------|---------|
| `file.uploaded` | `{ fileId, key, bucket, size }` |
| `file.deleted` | `{ fileId, key, bucket, deletedAt }` |
| `file.restored` | `{ fileId, key, bucket, restoredAt }` |
| `file.purged` | `{ fileId, key, bucket, reason }` |
| `file.downloaded` | `{ fileId, key, bucket, downloadCount }` |
| `file.copied` | `{ sourceFileId, newFileId, sourceBucket, targetBucket }` |
| `file.moved` | `{ fileId, fromBucket, toBucket, newKey }` |
| `bucket.created` | `{ bucketId, name, garageBucketId }` |
| `bucket.deleted` | `{ bucketId, name }` |
| `bucket.reassigned` | `{ bucketId, bucketName, fromApplicationId, toApplicationId, action }` |
| `share.created` | `{ shareId, fileId, fileName, expiresAt, shareUrl }` |
| `share.accessed` | `{ shareId, fileId, fileName, downloadCount, accessedAt }` |
| `quota.warning` | `{ level, usage, threshold, applicationName }` |
| `quota.critical` | `{ level, usage, threshold, applicationName }` |

---

## Service Ports

| Service | Port | Notes |
|---------|------|-------|
| Storage API | 9001 | Direct (dev/internal) |
| Swagger Docs | 9001/api/docs | |
| Admin UI | 3000 (dev) / via nginx (prod) | |
| Nginx HTTP | 8080 (configurable) | Production |
| Nginx HTTPS | 8443 (configurable) | Production |
| Garage S3 | 9004 | Presigned URL access |

---

## Quick Start (cURL)

```bash
# Set API key
export API_KEY="your_key"
export BASE="http://localhost:9001/api/v1"

# Create bucket
curl -X POST "$BASE/buckets" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-bucket"}'

# Upload file
curl -X POST "$BASE/buckets/BUCKET_ID/files/upload" \
  -H "X-API-Key: $API_KEY" \
  -F "file=@photo.jpg"

# Download file
curl "$BASE/buckets/BUCKET_ID/files/FILE_ID/download" \
  -H "X-API-Key: $API_KEY"

# Search files
curl -X POST "$BASE/files/search" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"report","mimeTypes":["application/pdf"]}'
```
