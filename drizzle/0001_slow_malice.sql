ALTER TABLE "events" ADD COLUMN "host_player_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "current_round_index" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "current_round_status" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "current_round_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "round_winners" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_host_player_id_players_id_fk" FOREIGN KEY ("host_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;