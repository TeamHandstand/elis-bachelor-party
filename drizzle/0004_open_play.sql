-- Open Play game mode.
--   1. events.mode discriminates 'heptathlon' (original) from 'open' (self-paced
--      solo play). Defaulted so existing rows and the existing flow are untouched.
--   2. open_scores holds one single-attempt score per (player, game). The PK
--      enforces play-once. Player-keyed and fully separate from final_progress.

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "mode" text DEFAULT 'heptathlon' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "open_scores" (
	"event_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"score" numeric NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "open_scores_event_id_player_id_game_id_pk" PRIMARY KEY("event_id","player_id","game_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "open_scores" ADD CONSTRAINT "open_scores_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "open_scores" ADD CONSTRAINT "open_scores_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
