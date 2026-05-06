-- Reusable trivia question presets the host can apply to any trivia round.
-- Global to the deployment (not scoped to an event) so a question set written
-- once can be reused across multiple bachelor parties / re-runs.

CREATE TABLE IF NOT EXISTS "trivia_presets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "questions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
