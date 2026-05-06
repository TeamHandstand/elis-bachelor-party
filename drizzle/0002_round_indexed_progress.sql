-- Switch progress keying from (event, team, challenge) to (event, team, round_index)
-- so the same challenge type can appear in multiple rounds of one event.
--
-- The migration is idempotent at the table-shape level: it adds round_index,
-- backfills it from the event's stored challenge order when possible, and
-- swaps the primary key. The events.challenges jsonb column is migrated from
-- the legacy ChallengeId-keyed record shape into the new RoundConfig[] shape.

ALTER TABLE "final_progress" ADD COLUMN IF NOT EXISTS "round_index" integer;--> statement-breakpoint

-- Backfill round_index for legacy rows. For each progress row, find its
-- challenge's `order` field in the parent event's challenges record and
-- count how many enabled challenges have a smaller order — that count is
-- this row's 0-based round_index.
DO $$
DECLARE
  fp RECORD;
  this_order int;
  computed_idx int;
BEGIN
  FOR fp IN
    SELECT fp.event_id, fp.team_id, fp.challenge
    FROM final_progress fp
    WHERE fp.round_index IS NULL
  LOOP
    -- Resolve this challenge's order (fallback: large number = goes last).
    SELECT COALESCE((value->>'order')::int, 999) INTO this_order
    FROM events e, jsonb_each(e.challenges)
    WHERE e.id = fp.event_id AND key = fp.challenge
    LIMIT 1;

    IF this_order IS NULL THEN this_order := 999; END IF;

    -- Count enabled challenges whose order is strictly less than this one.
    SELECT COUNT(*) INTO computed_idx
    FROM events e, jsonb_each(e.challenges)
    WHERE e.id = fp.event_id
      AND (value->>'enabled')::boolean = true
      AND COALESCE((value->>'order')::int, 999) < this_order;

    UPDATE final_progress
    SET round_index = COALESCE(computed_idx, 0)
    WHERE event_id = fp.event_id
      AND team_id = fp.team_id
      AND challenge = fp.challenge;
  END LOOP;
END $$;--> statement-breakpoint

UPDATE "final_progress" SET "round_index" = 0 WHERE "round_index" IS NULL;--> statement-breakpoint

ALTER TABLE "final_progress" ALTER COLUMN "round_index" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "final_progress" DROP CONSTRAINT IF EXISTS "final_progress_event_id_team_id_challenge_pk";--> statement-breakpoint

ALTER TABLE "final_progress" ALTER COLUMN "challenge" SET DEFAULT '';--> statement-breakpoint

ALTER TABLE "final_progress" ADD CONSTRAINT "final_progress_event_id_team_id_round_index_pk" PRIMARY KEY ("event_id","team_id","round_index");--> statement-breakpoint

-- Convert events.challenges from the legacy record shape to RoundConfig[].
-- Already-array values are left alone. Records are flattened into an array
-- of {challenge, threshold} ordered by the legacy `order` field.
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
