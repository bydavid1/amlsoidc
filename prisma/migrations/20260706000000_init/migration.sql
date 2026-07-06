-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('BUYER', 'TRAVELER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('DRAFT', 'OPEN', 'IN_PROGRESS', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_ASSIGNMENT', 'ASSIGNED', 'SOURCING', 'IN_TRANSIT', 'READY_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'DELIVERY_FAILED', 'DISPUTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FulfillmentType" AS ENUM ('BUYER_SHIPS_TO_TRAVELER', 'CUSTOMER_SHIPS_TO_TRAVELER', 'TRAVELER_PURCHASES_PRODUCT', 'WAREHOUSE_FULFILLMENT', 'LOCAL_INVENTORY');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('AWAITING_PURCHASE', 'PURCHASED', 'RECEIVED_BY_TRAVELER');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "roles" "UserRole"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "countries" (
    "id" TEXT NOT NULL,
    "iso2" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enabled_corridors" (
    "id" TEXT NOT NULL,
    "originCountryId" TEXT NOT NULL,
    "destinationCountryId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "enabled_corridors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traveler_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reputationScore" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "reputationCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "traveler_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "travelerProfileId" TEXT NOT NULL,
    "originCountryId" TEXT NOT NULL,
    "destinationCountryId" TEXT NOT NULL,
    "destinationCityId" TEXT,
    "arrivalDate" TIMESTAMP(3) NOT NULL,
    "totalCapacity" INTEGER NOT NULL,
    "remainingCapacity" INTEGER NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "buyer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "buyerProfileId" TEXT NOT NULL,
    "originCountryId" TEXT NOT NULL,
    "destinationCountryId" TEXT NOT NULL,
    "destinationCityId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productUrl" TEXT NOT NULL,
    "estimatedPriceAmount" DECIMAL(12,2) NOT NULL,
    "estimatedPriceCurrency" VARCHAR(3) NOT NULL,
    "requiredCapacity" INTEGER NOT NULL DEFAULT 1,
    "neededBy" TIMESTAMP(3),
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_ASSIGNMENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfillments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "FulfillmentType" NOT NULL,
    "status" "FulfillmentStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fulfillments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfillment_buyer_ships_details" (
    "id" TEXT NOT NULL,
    "fulfillmentId" TEXT NOT NULL,
    "travelerAddressLine" TEXT,
    "purchasedAt" TIMESTAMP(3),
    "receivedByTravelerAt" TIMESTAMP(3),

    CONSTRAINT "fulfillment_buyer_ships_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT NOT NULL,
    "actor" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "travelerProfileId" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'OFFERED',
    "scoreBreakdown" JSONB,
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "raterUserId" TEXT NOT NULL,
    "rateeUserId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "requestId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "countries_iso2_key" ON "countries"("iso2");

-- CreateIndex
CREATE UNIQUE INDEX "cities_countryId_name_key" ON "cities"("countryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "enabled_corridors_originCountryId_destinationCountryId_key" ON "enabled_corridors"("originCountryId", "destinationCountryId");

-- CreateIndex
CREATE UNIQUE INDEX "traveler_profiles_userId_key" ON "traveler_profiles"("userId");

-- CreateIndex
CREATE INDEX "trips_originCountryId_destinationCountryId_arrivalDate_stat_idx" ON "trips"("originCountryId", "destinationCountryId", "arrivalDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "buyer_profiles_userId_key" ON "buyer_profiles"("userId");

-- CreateIndex
CREATE INDEX "orders_status_destinationCountryId_idx" ON "orders"("status", "destinationCountryId");

-- CreateIndex
CREATE INDEX "orders_buyerProfileId_idx" ON "orders"("buyerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "fulfillments_orderId_key" ON "fulfillments"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "fulfillment_buyer_ships_details_fulfillmentId_key" ON "fulfillment_buyer_ships_details"("fulfillmentId");

-- CreateIndex
CREATE INDEX "order_status_history_orderId_occurredAt_idx" ON "order_status_history"("orderId", "occurredAt");

-- CreateIndex
CREATE INDEX "assignments_orderId_idx" ON "assignments"("orderId");

-- CreateIndex
CREATE INDEX "assignments_tripId_idx" ON "assignments"("tripId");

-- CreateIndex
CREATE INDEX "assignments_travelerProfileId_orderId_idx" ON "assignments"("travelerProfileId", "orderId");

-- CreateIndex
CREATE INDEX "ratings_rateeUserId_idx" ON "ratings"("rateeUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_orderId_raterUserId_key" ON "ratings"("orderId", "raterUserId");

-- CreateIndex
CREATE UNIQUE INDEX "disputes_orderId_key" ON "disputes"("orderId");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_createdAt_idx" ON "audit_logs"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traveler_profiles" ADD CONSTRAINT "traveler_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_travelerProfileId_fkey" FOREIGN KEY ("travelerProfileId") REFERENCES "traveler_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_profiles" ADD CONSTRAINT "buyer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyerProfileId_fkey" FOREIGN KEY ("buyerProfileId") REFERENCES "buyer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_buyer_ships_details" ADD CONSTRAINT "fulfillment_buyer_ships_details_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "fulfillments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================================
-- Refuerzos de invariantes de dominio en DB (docs/design/03-base-de-datos.md §6)
-- ============================================================================

-- Un email solo es unico entre usuarios NO borrados (soft delete permite reuso)
CREATE UNIQUE INDEX "users_email_active_unique"
  ON "users"("email") WHERE "deletedAt" IS NULL;

-- Invariante: un pedido NUNCA tiene dos asignaciones activas simultaneas.
-- Aunque la logica de aplicacion fallara, Postgres rechaza la segunda.
CREATE UNIQUE INDEX "assignments_active_per_order_unique"
  ON "assignments"("orderId") WHERE "status" IN ('OFFERED', 'ACCEPTED');

-- Checks como segunda linea de defensa
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_score_range"
  CHECK ("score" BETWEEN 1 AND 5);

ALTER TABLE "orders" ADD CONSTRAINT "orders_estimated_price_positive"
  CHECK ("estimatedPriceAmount" >= 0);

ALTER TABLE "trips" ADD CONSTRAINT "trips_capacity_positive"
  CHECK ("totalCapacity" > 0 AND "remainingCapacity" >= 0 AND "remainingCapacity" <= "totalCapacity");
