import { NextResponse } from "next/server";
import { z } from "zod";
import { isHostAuthorized, isHostPlayer } from "@/lib/auth/host";
import { endRound } from "@/lib/db/queries";
import { publishFromServer } from "@/lib/pubnub/server";
import { normalizeEventCode } from "@/lib/utils/code";
import type { EndRoundResponse } from "@/lib/api/contract";

const BodySchema = z
  .object({
    mode: z.enum(["auto", "host"]),
    playerId: z.string().uuid().optional(),
    teamId: z.string().uuid().optional(),
  })
  .strict();

export async function POST(
  req: Request,
  { params }: { params: { code: string } },
): Promise<NextResponse<EndRoundResponse | { error: string }>> {
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

  // Auth differs by mode:
  //  - mode='auto': open. Server validates the claim against final_progress.
  //  - mode='host': host-cookie OR matching host-player.
  if (parsed.data.mode === "host") {
    const cookieAuthed = await isHostAuthorized();
    const playerAuthed =
      !cookieAuthed && (await isHostPlayer(code, parsed.data.playerId));
    if (!cookieAuthed && !playerAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (parsed.data.mode === "auto" && !parsed.data.teamId) {
    return NextResponse.json(
      { error: "teamId required for auto mode" },
      { status: 400 },
    );
  }

  const result = await endRound({
    code,
    mode: parsed.data.mode,
    requestedTeamId: parsed.data.teamId,
  });
  if ("error" in result) {
    if (result.error === "not-found") {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    if (result.error === "no-live-round") {
      return NextResponse.json(
        { error: "No live round to end" },
        { status: 409 },
      );
    }
    if (result.error === "not-completed") {
      return NextResponse.json(
        { error: "Team has not completed this challenge" },
        { status: 409 },
      );
    }
    if (result.error === "no-teams") {
      return NextResponse.json(
        { error: "No teams to award" },
        { status: 409 },
      );
    }
  } else {
    if (!result.alreadyDecided) {
      try {
        await publishFromServer(code, {
          kind: "round-end",
          roundIndex: result.event.currentRoundIndex ?? 0,
          challenge: result.challenge,
          winnerTeamId: result.winnerTeamId,
          decidedAt: result.decidedAt,
          ts: Date.now(),
        });
        if (result.eventFinished) {
          await publishFromServer(code, {
            kind: "event-state",
            status: "finished",
            winnerTeamId: result.event.winnerTeamId ?? undefined,
            ts: Date.now(),
          });
        }
      } catch (err) {
        console.error("[round/end] PubNub publish failed", err);
      }
    }
    return NextResponse.json({
      event: result.event,
      winnerTeamId: result.winnerTeamId,
      decidedAt: result.decidedAt,
      eventFinished: result.eventFinished,
      alreadyDecided: result.alreadyDecided,
    });
  }

  return NextResponse.json({ error: "Unknown error" }, { status: 500 });
}
