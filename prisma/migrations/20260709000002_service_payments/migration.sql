-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUND_DUE', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('NOT_DUE', 'DUE', 'PAID_OUT');

-- CreateTable
CREATE TABLE "service_payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "paidAt" TIMESTAMP(3),
    "payoutStatus" "PayoutStatus" NOT NULL DEFAULT 'NOT_DUE',
    "payoutAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_payments_orderId_key" ON "service_payments"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "service_payments_providerRef_key" ON "service_payments"("providerRef");

-- CreateIndex
CREATE INDEX "service_payments_status_idx" ON "service_payments"("status");

-- CreateIndex
CREATE INDEX "service_payments_payoutStatus_idx" ON "service_payments"("payoutStatus");

