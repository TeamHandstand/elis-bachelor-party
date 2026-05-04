import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeEventCode } from "@/lib/utils/code";
import {
  getEventByCode,
  getEventProgress,
  upsertProgressSnapshot,
} from "@/lib/db/queries";
import type {
  GetProgressResponse,
  ProgressSnapshotRequest,
  ProgressSnapshotResponse,
} from "@/lib/api/contract";
import type { ChallengeId } from "@/lib/types";

const CHALLENGE_IDS: ChallengeId[] = [
  "distance",
  "steps",
  "taps",
  "scream",
  "shake",
  "spin",
  "north",
];

const challengeIdSchema = z.enum([
  "distance",
  "steps",
  "taps",
  "scream",
  "shake",
  "spin",
  "north",
]);

const snapshotSchema = z
  .object({
    teamId: z.string().uuid(),
    challenges: z.array(
      z
        .object({
          challenge: challengeIdSchema,
          value: z.number().finite().nonnegative(),
          completed: z.boolean(),
          completedAt: z.number().int().positive().nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export async function GET(
  _req: Request,
  { params }: { params: { code: string } },
) {
  const code = normalizeEventCode(params.code);
  const persisted = await getEventProgress(code);
  if (persisted === null) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  // Sanity: discard any rows for unknown challenges (defensive — schema
  // shouldn't allow them, but the JSON->ChallengeId cast is permissive).
  const filtered = persisted.filter((r) =>
    CHALLENGE_IDS.includes(r.challenge as ChallengeId),
  );
  const body: GetProgressResponse = { progress: filtered };
  return NextResponse.json(body);
}

export async function POST(
  req: Request,
  { params }: { params: { code: string } },
) {
  const code = normalizeEventCode(params.code);
  const event = await getEventByCode(code);
  if (!event) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  // Ignore writes once the event is finished — winner is locked.
  if (event.event.status === "finished") {
    const body: ProgressSnapshotResponse = { ok: true };
    return NextResponse.json(body);
  }

  let parsed: ProgressSnapshotRequest;
  try {
    const json = await req.json();
    parsed = snapshotSchema.parse(json);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "invalid body" },
      { status: 400 },
    );
  }

  // Verify the team actually belongs to this event (cheap defense).
  const teamBelongs = event.teams.some((t) => t.id === parsed.teamId);
  if (!teamBelongs) {
    return NextResponse.json({ error: "team not in event" }, { status: 400 });
  }

  await upsertProgressSnapshot({
    eventId: event.event.id,
    teamId: parsed.teamId,
    challenges: parsed.challenges,
  });

  const body: ProgressSnapshotResponse = { ok: true };
  return NextResponse.json(body);
}
