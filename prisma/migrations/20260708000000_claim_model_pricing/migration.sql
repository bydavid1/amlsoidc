-- CreateEnum
CREATE TYPE "SizeCategory" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- AlterTable
ALTER TABLE "assignments" ALTER COLUMN "expiresAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "requiredCapacity",
ADD COLUMN     "sizeCategory" "SizeCategory" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "travelerRewardAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "trips" DROP COLUMN "remainingCapacity",
DROP COLUMN "totalCapacity";

