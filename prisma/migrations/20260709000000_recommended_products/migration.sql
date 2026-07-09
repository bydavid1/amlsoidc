-- CreateTable
CREATE TABLE "recommended_products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productUrl" TEXT NOT NULL,
    "imageUrl" TEXT,
    "estimatedPriceAmount" DECIMAL(12,2) NOT NULL,
    "estimatedPriceCurrency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "sizeCategory" "SizeCategory" NOT NULL,
    "originCountryId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommended_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recommended_products_isActive_sortOrder_idx" ON "recommended_products"("isActive", "sortOrder");

