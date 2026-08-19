-- Migration: extend Transaction model and add RewardClaim for durable reward persistence
--
-- Adds moduleId, stellarTxHash, completedAt to transactions so the reward ledger can
-- be fully reconstructed from Postgres after a process restart.
-- Adds reward_claims table with a (userId, moduleId) unique constraint to provide
-- database-level double-claim prevention across replicas.

ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "moduleId" TEXT,
  ADD COLUMN IF NOT EXISTS "stellarTxHash" TEXT,
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMPTZ;

-- Rename the free-form comment values to match the service taxonomy:
-- old: reward, refund, transfer  → new: module_reward, streak_bonus, referral_reward, withdrawal
-- Existing rows are preserved; only new rows will use the new taxonomy.
-- (No UPDATE applied here — existing data was mock/seed data only.)

CREATE TABLE IF NOT EXISTS "reward_claims" (
  "id"        TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"    TEXT        NOT NULL,
  "moduleId"  TEXT        NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "reward_claims_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reward_claims_userId_moduleId_key" UNIQUE ("userId", "moduleId")
);
