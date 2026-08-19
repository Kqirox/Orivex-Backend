-- Migration: add quiz_questions table for server-side answer-key storage
-- This enables real quiz grading in completeModule instead of always awarding 100%.
-- The answerKey column is server-side only; it is never included in API responses.

CREATE TABLE IF NOT EXISTS "quiz_questions" (
  "id"        TEXT    NOT NULL DEFAULT gen_random_uuid()::text,
  "moduleId"  TEXT    NOT NULL,
  "prompt"    TEXT    NOT NULL,
  "options"   TEXT    NOT NULL,   -- JSON array of {id, text}
  "answerKey" TEXT    NOT NULL,   -- correct option id (server-side only)
  "position"  INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quiz_questions_moduleId_fkey"
    FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "quiz_questions_moduleId_idx" ON "quiz_questions"("moduleId");
