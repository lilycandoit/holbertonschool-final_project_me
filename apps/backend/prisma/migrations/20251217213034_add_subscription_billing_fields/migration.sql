-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE 'PAYMENT_FAILED';

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "failedPaymentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastBillingAttempt" TIMESTAMP(3),
ADD COLUMN     "lastBillingError" TEXT,
ADD COLUMN     "nextRetryDate" TIMESTAMP(3),
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripePaymentMethodId" TEXT;

-- CreateTable
CREATE TABLE "subscription_billing_events" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "amountCents" INTEGER,
    "skippedItems" JSONB,
    "stripePaymentIntentId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_billing_events_stripePaymentIntentId_key" ON "subscription_billing_events"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "subscription_billing_events_subscriptionId_idx" ON "subscription_billing_events"("subscriptionId");

-- AddForeignKey
ALTER TABLE "subscription_billing_events" ADD CONSTRAINT "subscription_billing_events_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
