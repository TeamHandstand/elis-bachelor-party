-- Switch progress keying from (event, team, challenge) to (event, team, round_index)
-- so the same challenge type can appear in multiple rounds of one event.
--
-- Backfill is intentionally trivial (round_index = 0 for any pre-existing rows)
-- because no live event has finished yet; if a host needs accurate per-round
-- history, they can redo the round. The events.challenges jsonb column gets
-- migrated from the legacy ChallengeId-keyed record into the new
-- RoundConfig[] shape.

ALTER TABLE "final_progress" ADD COLUMN IF NOT EXISTS "round_index" integer;--> statement-breakpoint

UPDATE "final_progress" SET "round_index" = 0 WHERE "round_index" IS NULL;--> statement-breakpoint

ALTER TABLE "final_progress" ALTER COLUMN "round_index" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "final_progress" DROP CONSTRAINT IF EXISTS "final_progress_event_id_team_id_challenge_pk";--> statement-breakpoint

ALTER TABLE "final_progress" ALTER COLUMN "challenge" SET DEFAULT '';--> statement-breakpoint

DO $migrate$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'final_progress_event_id_team_id_round_index_pk'
  ) THEN
    ALTER TABLE "final_progress"
    ADD CONSTRAINT "final_progress_event_id_team_id_round_index_pk"
    PRIMARY KEY ("event_id", "team_id", "round_index");
  END IF;
END $migrate$;--> statement-breakpoint

-- Convert events.challenges from the legacy record shape to RoundConfig[].
-- Already-array values are skipped (idempotent).
UPDATE "events"
SET "challenges" = (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'challenge', key,
        'threshold', COALESCE((value->>'threshold')::numeric, 0)
      )
      ORDER BY COALESCE((value->>'order')::int, 999), key
    ),
    '[]'::jsonb
  )
  FROM jsonb_each(events.challenges)
  WHERE (value->>'enabled')::boolean = true
)
WHERE jsonb_typeof(events.challenges) = 'object';
