-- CreateEnum
CREATE TYPE "LoyaltyTier" AS ENUM ('silver', 'gold', 'platinum');

-- CreateEnum
CREATE TYPE "OfferType" AS ENUM ('auto_applied', 'reward', 'wallet_credit');

-- CreateEnum
CREATE TYPE "OfferValueType" AS ENUM ('percentage', 'flat', 'free_item');

-- CreateEnum
CREATE TYPE "OfferTrigger" AS ENUM ('birthday', 'milestone', 'manual_grant', 'signup', 'first_order', 'reorder', 'anniversary');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('active', 'used', 'expired', 'cancelled');

-- CreateTable
CREATE TABLE "customer_loyalty" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "points_balance" INTEGER NOT NULL DEFAULT 0,
    "wallet_balance" INTEGER NOT NULL DEFAULT 0,
    "lifetime_spend" INTEGER NOT NULL DEFAULT 0,
    "lifetime_earned_points" INTEGER NOT NULL DEFAULT 0,
    "lifetime_redeemed_points" INTEGER NOT NULL DEFAULT 0,
    "visits_count" INTEGER NOT NULL DEFAULT 0,
    "orders_count" INTEGER NOT NULL DEFAULT 0,
    "last_visit_at" TIMESTAMP(3),
    "tier" "LoyaltyTier" NOT NULL DEFAULT 'silver',
    "favourite_items" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "staff_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_loyalty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_offers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "type" "OfferType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "value_type" "OfferValueType" NOT NULL,
    "value" INTEGER NOT NULL,
    "free_item_id" TEXT,
    "free_item_name" TEXT,
    "min_order_amount" INTEGER,
    "trigger" "OfferTrigger" NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMP(3),
    "used_at" TIMESTAMP(3),
    "used_on_order_id" TEXT,
    "auto_apply" BOOLEAN NOT NULL DEFAULT false,
    "granted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_visits" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "total_amount" INTEGER NOT NULL,
    "items_count" INTEGER NOT NULL,
    "visited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_config" (
    "tenant_id" TEXT NOT NULL,
    "earn_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "redemption_value" INTEGER NOT NULL DEFAULT 100,
    "min_redemption_points" INTEGER NOT NULL DEFAULT 50,
    "signup_bonus_points" INTEGER NOT NULL DEFAULT 100,
    "birthday_offer_enabled" BOOLEAN NOT NULL DEFAULT true,
    "birthday_discount_pct" INTEGER NOT NULL DEFAULT 50,
    "tier_silver_threshold" INTEGER NOT NULL DEFAULT 0,
    "tier_gold_threshold" INTEGER NOT NULL DEFAULT 100000,
    "tier_platinum_threshold" INTEGER NOT NULL DEFAULT 500000,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_config_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateIndex
CREATE INDEX "customer_loyalty_tenant_id_idx" ON "customer_loyalty"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_loyalty_tenant_id_customer_id_key" ON "customer_loyalty"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "customer_offers_tenant_id_customer_id_status_idx" ON "customer_offers"("tenant_id", "customer_id", "status");

-- CreateIndex
CREATE INDEX "customer_visits_tenant_id_customer_id_idx" ON "customer_visits"("tenant_id", "customer_id");
