-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "planExpiresAt" TIMESTAMP(3),
ADD COLUMN     "planIsTrial" BOOLEAN NOT NULL DEFAULT false;
