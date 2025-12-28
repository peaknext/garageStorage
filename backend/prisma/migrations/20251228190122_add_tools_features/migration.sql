-- CreateEnum
CREATE TYPE "ThumbnailStatus" AS ENUM ('NONE', 'PENDING', 'GENERATED', 'FAILED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('ADMIN_USER', 'APPLICATION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateEnum
CREATE TYPE "PolicyScope" AS ENUM ('GLOBAL', 'APPLICATION', 'BUCKET');

-- CreateEnum
CREATE TYPE "PolicyType" AS ENUM ('RETENTION', 'AUTO_DELETE', 'SIZE_LIMIT', 'CLEANUP_TEMP');

-- CreateEnum
CREATE TYPE "AlertLevel" AS ENUM ('NORMAL', 'WARNING', 'CRITICAL');

-- AlterTable
ALTER TABLE "files" ADD COLUMN     "image_height" INTEGER,
ADD COLUMN     "image_width" INTEGER,
ADD COLUMN     "search_vector" TEXT,
ADD COLUMN     "thumbnail_key" TEXT,
ADD COLUMN     "thumbnail_status" "ThumbnailStatus" NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actor_id" TEXT,
    "actor_email" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "resource_name" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "request_method" TEXT,
    "request_path" TEXT,
    "previous_value" JSONB,
    "new_value" JSONB,
    "status" "AuditStatus" NOT NULL DEFAULT 'SUCCESS',
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "admin_user_id" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "PolicyScope" NOT NULL DEFAULT 'GLOBAL',
    "policyType" "PolicyType" NOT NULL,
    "rules" JSONB,
    "retention_days" INTEGER,
    "delete_after_days" INTEGER,
    "schedule" TEXT,
    "last_run_at" TIMESTAMP(3),
    "next_run_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "app_id" TEXT,
    "bucket_id" TEXT,

    CONSTRAINT "storage_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_alerts" (
    "id" TEXT NOT NULL,
    "warning_threshold" INTEGER NOT NULL DEFAULT 75,
    "critical_threshold" INTEGER NOT NULL DEFAULT 90,
    "notify_email" TEXT[],
    "notify_webhook" BOOLEAN NOT NULL DEFAULT true,
    "cooldown_minutes" INTEGER NOT NULL DEFAULT 60,
    "last_warning_at" TIMESTAMP(3),
    "last_critical_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "current_level" "AlertLevel" NOT NULL DEFAULT 'NORMAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "app_id" TEXT NOT NULL,

    CONSTRAINT "quota_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "app_id" TEXT NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_tags" (
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "file_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "file_tags_pkey" PRIMARY KEY ("file_id","tag_id")
);

-- CreateTable
CREATE TABLE "virtual_folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "parent_id" TEXT,
    "bucket_id" TEXT NOT NULL,

    CONSTRAINT "virtual_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_folders" (
    "file_id" TEXT NOT NULL,
    "folder_id" TEXT NOT NULL,

    CONSTRAINT "file_folders_pkey" PRIMARY KEY ("file_id","folder_id")
);

-- CreateIndex
CREATE INDEX "audit_logs_actorType_actor_id_idx" ON "audit_logs"("actorType", "actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "storage_policies_is_active_next_run_at_idx" ON "storage_policies"("is_active", "next_run_at");

-- CreateIndex
CREATE UNIQUE INDEX "quota_alerts_app_id_key" ON "quota_alerts"("app_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_app_id_name_key" ON "tags"("app_id", "name");

-- CreateIndex
CREATE INDEX "virtual_folders_bucket_id_parent_id_idx" ON "virtual_folders"("bucket_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "virtual_folders_bucket_id_path_key" ON "virtual_folders"("bucket_id", "path");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_policies" ADD CONSTRAINT "storage_policies_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_policies" ADD CONSTRAINT "storage_policies_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "buckets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quota_alerts" ADD CONSTRAINT "quota_alerts_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_tags" ADD CONSTRAINT "file_tags_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_tags" ADD CONSTRAINT "file_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "virtual_folders" ADD CONSTRAINT "virtual_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "virtual_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "virtual_folders" ADD CONSTRAINT "virtual_folders_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "buckets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "virtual_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
