-- Migration: add EMPLOYER value to the Role enum
-- This is required so users with the EMPLOYER role can be stored in the database,
-- enabling the employer B2B surface to function correctly.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'EMPLOYER';
