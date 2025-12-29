-- CreateEnum
CREATE TYPE "DeleteBasedOn" AS ENUM ('CREATED', 'LAST_ACCESSED');

-- AlterTable
ALTER TABLE "storage_policies" ADD COLUMN     "delete_based_on" "DeleteBasedOn" NOT NULL DEFAULT 'CREATED';
