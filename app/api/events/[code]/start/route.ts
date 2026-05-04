import { NextResponse } from "next/server";
import { isHostAuthorized } from "@/lib/auth/host";
import { startRound } from "@/lib/db/queries";
import { publishFromServer } from "@/lib/pubnub/server";
import { normalizeEventCode } from "@/lib/utils/code";
import type { StartEventResponse } from "@/lib/api/contract";

/**
 * Legacy "start event" entry point used by the laptop dashboard's StartButton.
 * Now a thin wrapper over the round/start flow: starts round 0 (or the next
 * undecided round if one exists). Host-cookie protected.
 */
export async function POST(
  _req: Request,
  { params }: { params: { code: string } },
): Promise<NextResponse<StartEventResponse | { error: string }>> {
  if (!(await isHostAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const code = normalizeEventCode(params.code);
  if (!code) {
    return NextResponse.json({ error: "Invalid event code" }, { status: 400 });
  }

  const result = await startRound({ code });
  if ("error" in result) {
    if (result.error === "not-found") {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    if (result.error === "all-decided") {
      return NextResponse.json(
        { error: "All rounds are already decided" },
        { status: 409 },
      );
    }
    if (result.error === "round-live") {
      return NextResponse.json(
        { error: "A round is already live" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }

  try {
    await publishFromServer(code, {
      kind: "round-start",
      roundIndex: result.event.currentRoundIndex ?? 0,
      challenge: result.challenge,
      startsAt: result.startsAt,
      ts: Date.now(),
    });
    await publishFromServer(code, {
      kind: "event-state",
      status: "active",
      ts: Date.now(),
    });
  } catch (err) {
    console.error("[start] PubNub publish failed", err);
  }

  return NextResponse.json({ event: result.event });
}
