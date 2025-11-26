/*
  Warnings:

  - The values [STAFF] on the enum `UserRole` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[sendleOrderId]` on the table `delivery_tracking` will be added. If there are existing duplicate values, this will fail.
  - Made the column `purchaseType` on table `orders` required. This step will fail if there are existing NULL values in that column.
  - Made the column `shippingFirstName` on table `orders` required. This step will fail if there are existing NULL values in that column.
  - Made the column `shippingLastName` on table `orders` required. This step will fail if there are existing NULL values in that column.
  - Made the column `shippingStreet1` on table `orders` required. This step will fail if there are existing NULL values in that column.
  - Made the column `shippingCity` on table `orders` required. This step will fail if there are existing NULL values in that column.
  - Made the column `shippingState` on table `orders` required. This step will fail if there are existing NULL values in that column.
  - Made the column `shippingZipCode` on table `orders` required. This step will fail if there are existing NULL values in that column.
  - Made the column `shippingCountry` on table `orders` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('CUSTOMER', 'ADMIN');
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'CUSTOMER';
COMMIT;

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_shippingAddressId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_userId_fkey";

-- AlterTable
ALTER TABLE "addresses" ALTER COLUMN "country" SET DEFAULT 'US';

-- AlterTable
ALTER TABLE "delivery_tracking" ADD COLUMN     "distanceKm" DOUBLE PRECISION,
ADD COLUMN     "googleDistanceMatrixResponse" JSONB,
ADD COLUMN     "lastWebhookReceivedAt" TIMESTAMP(3),
ADD COLUMN     "sendleOrderId" TEXT,
ADD COLUMN     "sendleQuoteId" TEXT,
ADD COLUMN     "sendleTrackingUrl" TEXT,
ADD COLUMN     "sendleWebhookEvents" JSONB[] DEFAULT ARRAY[]::JSONB[];

-- AlterTable
ALTER TABLE "delivery_zones" ADD COLUMN     "centerLatitude" DOUBLE PRECISION,
ADD COLUMN     "centerLongitude" DOUBLE PRECISION,
ADD COLUMN     "radiusKm" DOUBLE PRECISION DEFAULT 50;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliveryDistanceKm" DOUBLE PRECISION,
ADD COLUMN     "deliveryLatitude" DOUBLE PRECISION,
ADD COLUMN     "deliveryLongitude" DOUBLE PRECISION,
ALTER COLUMN "purchaseType" SET NOT NULL,
ALTER COLUMN "shippingFirstName" SET NOT NULL,
ALTER COLUMN "shippingLastName" SET NOT NULL,
ALTER COLUMN "shippingStreet1" SET NOT NULL,
ALTER COLUMN "shippingCity" SET NOT NULL,
ALTER COLUMN "shippingState" SET NOT NULL,
ALTER COLUMN "shippingZipCode" SET NOT NULL,
ALTER COLUMN "shippingCountry" SET NOT NULL;

-- CreateTable
CREATE TABLE "sendle_quotes" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "quoteId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "etaDays" INTEGER NOT NULL,
    "pickupSuburb" TEXT NOT NULL,
    "deliverySuburb" TEXT NOT NULL,
    "deliveryPostcode" TEXT NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "volumeCm3" DOUBLE PRECISION,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sendle_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "orderId" TEXT,
    "trackingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sendle_quotes_orderId_key" ON "sendle_quotes"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "sendle_quotes_quoteId_key" ON "sendle_quotes"("quoteId");

-- CreateIndex
CREATE INDEX "sendle_quotes_orderId_idx" ON "sendle_quotes"("orderId");

-- CreateIndex
CREATE INDEX "sendle_quotes_expiresAt_idx" ON "sendle_quotes"("expiresAt");

-- CreateIndex
CREATE INDEX "webhook_logs_provider_eventType_idx" ON "webhook_logs"("provider", "eventType");

-- CreateIndex
CREATE INDEX "webhook_logs_createdAt_idx" ON "webhook_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_tracking_sendleOrderId_key" ON "delivery_tracking"("sendleOrderId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shippingAddressId_fkey" FOREIGN KEY ("shippingAddressId") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sendle_quotes" ADD CONSTRAINT "sendle_quotes_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
