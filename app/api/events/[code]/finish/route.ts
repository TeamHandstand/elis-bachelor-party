import { NextResponse } from "next/server";
import { z } from "zod";
import { tryFinishEvent } from "@/lib/db/queries";
import { publishFromServer } from "@/lib/pubnub/server";
import { normalizeEventCode } from "@/lib/utils/code";
import type { FinishEventResponse } from "@/lib/api/contract";

const ChallengeIdSchema = z.enum([
  "distance",
  "steps",
  "taps",
  "scream",
  "shake",
  "spin",
  "north",
]);

const BodySchema = z
  .object({
    teamId: z.string().uuid(),
    finalProgress: z.array(
      z
        .object({
          teamId: z.string().uuid(),
          challenge: ChallengeIdSchema,
          value: z.number().finite(),
          completed: z.boolean(),
          completedAt: z.number().nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export async function POST(
  req: Request,
  { params }: { params: { code: string } },
): Promise<NextResponse<FinishEventResponse | { error: string }>> {
  const code = normalizeEventCode(params.code);
  if (!code) {
    return NextResponse.json({ error: "Invalid event code" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = await tryFinishEvent({
    code,
    teamId: parsed.data.teamId,
    finalProgress: parsed.data.finalProgress,
  });
  if (!result) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (!result.alreadyFinished) {
    try {
      await publishFromServer(code, {
        kind: "event-state",
        status: "finished",
        ts: Date.now(),
        winnerTeamId: result.winnerTeamId,
      });
    } catch (err) {
      console.error("[finish] PubNub publish failed", err);
    }
  }

  return NextResponse.json({
    winnerTeamId: result.winnerTeamId,
    alreadyFinished: result.alreadyFinished,
  });
}
