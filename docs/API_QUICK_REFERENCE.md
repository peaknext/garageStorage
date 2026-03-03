# SKH Storage API - Quick Reference Card

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
| POST | `/buckets/{id}/files/presigned-upload` | Get presigned URL |
| POST | `/buckets/{id}/files/confirm-upload` | Confirm presigned upload |
| GET | `/buckets/{id}/files/{fileId}/download` | Get download URL |
| PATCH | `/buckets/{id}/files/{fileId}` | Update file metadata |
| DELETE | `/buckets/{id}/files/{fileId}` | Delete file |
| POST | `/buckets/{id}/files/bulk-delete` | Bulk delete files |
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
{
  "name": "my-bucket",
  "quotaBytes": 5368709120,
  "isPublic": false
}
```

### Presigned Upload
```json
{
  "contentType": "application/pdf",
  "contentLength": 536870912,
  "key": "documents/file.pdf",
  "metadata": { "category": "docs" }
}
```

### Confirm Upload
```json
{
  "uploadId": "uuid"
}
```

### Create Share
```json
{
  "expiresIn": 86400,
  "maxDownloads": 10,
  "password": "secret"
}
```

### Create Webhook
```json
{
  "url": "https://app.com/webhook",
  "events": ["file.uploaded", "file.deleted"]
}
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
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

### Error
```json
{
  "statusCode": 400,
  "message": "Error message",
  "timestamp": "2024-01-01T00:00:00Z"
}
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
1. POST /buckets/{id}/files/presigned-upload
   → Returns: uploadUrl, uploadId

2. PUT {uploadUrl} with file binary
   → Direct to S3

3. POST /buckets/{id}/files/confirm-upload
   → Body: { "uploadId": "..." }
   → Returns: file object
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
| `file.deleted` | `{ fileId, key, bucket, size }` |

---

## Service Ports

| Service | Port |
|---------|------|
| Storage API | 9001 |
| Swagger Docs | 9001/api/docs |
| Admin UI | 9002 |

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
```
