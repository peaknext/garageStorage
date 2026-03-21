# Deploy: Document Thumbnail Generation

Feature ใหม่สำหรับสร้าง thumbnail จากเอกสาร (PDF, Office docs, TXT) แทนที่จะแสดง icon ไฟล์เปล่า

## Overview

ระบบจะ generate ภาพ preview (หน้าแรก) ของเอกสารเป็น `.webp` thumbnail เก็บใน S3 เหมือนกับ image thumbnails ที่มีอยู่แล้ว

### Supported File Types

| File Type | วิธีแปลง | ต้องติดตั้งเพิ่ม |
|-----------|---------|----------------|
| **PDF** (.pdf) | pdfjs-dist render หน้าแรก | ไม่ต้อง (npm dependency) |
| **TXT** (.txt) | Render ข้อความลง canvas | ไม่ต้อง (npm dependency) |
| **DOCX** (.docx) | LibreOffice → PDF → image | LibreOffice |
| **DOC** (.doc) | LibreOffice → PDF → image | LibreOffice |
| **XLSX** (.xlsx) | LibreOffice → PDF → image | LibreOffice |
| **XLS** (.xls) | LibreOffice → PDF → image | LibreOffice |
| **PPTX** (.pptx) | LibreOffice → PDF → image | LibreOffice |
| **PPT** (.ppt) | LibreOffice → PDF → image | LibreOffice |

---

## Prerequisites

### 1. LibreOffice (สำหรับ Office docs)

**Windows Server:**
1. ดาวน์โหลด LibreOffice จาก https://www.libreoffice.org/download/download-libreoffice/
2. ติดตั้งแบบ default → path จะเป็น `C:\Program Files\LibreOffice\program\soffice.exe`
3. ไม่ต้องเปิด LibreOffice ค้างไว้ — ระบบจะเรียก headless mode อัตโนมัติ

**ถ้าไม่ติดตั้ง LibreOffice:**
- PDF และ TXT thumbnails ยังทำงานได้ปกติ
- Office docs (doc/docx/xls/xlsx/ppt/pptx) จะ mark เป็น `FAILED`
- ระบบ log warning ตอน startup: "LibreOffice not found"

### 2. npm Dependencies (ติดตั้งอัตโนมัติ)

```
pdfjs-dist    — PDF rendering (pure JS, no external binary)
@napi-rs/canvas — Canvas API for server-side rendering (prebuilt Windows binary)
```

---

## Deployment Steps

### Step 1: Install LibreOffice on Server

```powershell
# ดาวน์โหลด installer (ใช้ browser หรือ curl)
# https://www.libreoffice.org/download/download-libreoffice/

# ติดตั้งแล้วตรวจสอบ
Test-Path "C:\Program Files\LibreOffice\program\soffice.exe"
# Expected: True

# ทดสอบ headless mode
& "C:\Program Files\LibreOffice\program\soffice.exe" --headless --version
# Expected: LibreOffice 24.x.x.x ...
```

### Step 2: Pull Latest Code

```powershell
cd C:\Apps\garageStorage
git pull origin main
```

### Step 3: Install Dependencies & Build

```powershell
cd backend
npm ci
npm run build

cd ..\frontend
npm ci
npm run build
```

### Step 4: Configure Environment (Optional)

เพิ่มใน `.env` ถ้าต้องการ customize (ค่า default ใช้งานได้เลย):

```env
# LibreOffice path (default: C:\Program Files\LibreOffice\program\soffice.exe)
# LIBREOFFICE_PATH=C:\Program Files\LibreOffice\program\soffice.exe

# Temp directory for document conversion (default: system temp)
# PROCESSING_TEMP_DIR=C:\Apps\garageStorage\tmp

# Disable document thumbnails entirely (default: true)
# DOCUMENT_THUMBNAIL_ENABLED=false
```

### Step 5: Restart Services

```powershell
pm2 restart all
```

### Step 6: Verify

```powershell
# Check PM2 logs for startup messages
pm2 logs storage-api --lines 20

# Should see:
# [ThumbnailProcessor] Thumbnail temp dir: C:\Users\...\AppData\Local\Temp\skh-storage-processing
# [DocumentConverter] LibreOffice found at: C:\Program Files\LibreOffice\program\soffice.exe
```

---

## Verification Checklist

| Test | วิธีทดสอบ | Expected |
|------|----------|----------|
| PDF thumbnail | อัพโหลดไฟล์ PDF ผ่าน Admin UI | thumbnail แสดงหน้าแรกของ PDF |
| TXT thumbnail | อัพโหลดไฟล์ .txt | thumbnail แสดงเนื้อหาข้อความ |
| DOCX thumbnail | อัพโหลดไฟล์ .docx | thumbnail แสดงหน้าแรกของเอกสาร |
| XLSX thumbnail | อัพโหลดไฟล์ .xlsx | thumbnail แสดง spreadsheet |
| PPTX thumbnail | อัพโหลดไฟล์ .pptx | thumbnail แสดง slide แรก |
| Image (เดิม) | อัพโหลดรูป jpg/png | ยังทำงานเหมือนเดิม |
| ZIP (ไม่รองรับ) | อัพโหลด .zip | thumbnailStatus = NONE (ปกติ) |
| No LibreOffice | ลบ/rename soffice.exe แล้วอัพ .docx | thumbnailStatus = FAILED + log warning |

### ตรวจสอบใน Database

```sql
SELECT original_name, mime_type, thumbnail_status, thumbnail_key
FROM files
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

---

## Rollback

ถ้ามีปัญหา สามารถปิด feature ได้ทันทีโดยไม่ต้อง rollback code:

```env
DOCUMENT_THUMBNAIL_ENABLED=false
```

แล้ว `pm2 restart storage-api` — ไฟล์เอกสารจะ mark เป็น `NOT_APPLICABLE` เหมือนเดิม

---

## Architecture Notes

```
Upload file
  ↓
ProcessingService.generateThumbnail()
  ├─ Image? → queue directly (existing path)
  ├─ PDF? → pdfjs-dist → canvas → Sharp → webp
  ├─ TXT? → @napi-rs/canvas → Sharp → webp
  ├─ Office doc? → LibreOffice headless → PDF → pdfjs-dist → Sharp → webp
  └─ Other? → mark NOT_APPLICABLE
  ↓
Bull queue "thumbnail" (Redis)
  ↓
ThumbnailProcessor → S3 upload → DB update (GENERATED)
```

- ทุก conversion ทำงานใน **background** (Bull queue) ไม่ block API response
- ไฟล์ temp ถูกลบทันทีหลัง conversion เสร็จ
- LibreOffice process timeout: 30 วินาที
- Thumbnail output: webp, 300x300 (configurable via env)
