-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "costPrice" DECIMAL(65,30),
ADD COLUMN     "minStock" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "TransactionItem" ADD COLUMN     "costAtTime" DECIMAL(65,30);
