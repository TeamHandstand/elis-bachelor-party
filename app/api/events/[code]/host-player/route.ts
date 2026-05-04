import { NextResponse } from "next/server";
import { z } from "zod";
import { isHostAuthorized } from "@/lib/auth/host";
import { setHostPlayer } from "@/lib/db/queries";
import { publishFromServer } from "@/lib/pubnub/server";
import { normalizeEventCode } from "@/lib/utils/code";
import type { SetHostPlayerResponse } from "@/lib/api/contract";

const BodySchema = z
  .object({
    playerId: z.string().uuid().nullable(),
  })
  .strict();

export async function PATCH(
  req: Request,
  { params }: { params: { code: string } },
): Promise<NextResponse<SetHostPlayerResponse | { error: string }>> {
  if (!(await isHostAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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

  const result = await setHostPlayer({
    code,
    playerId: parsed.data.playerId,
  });
  if ("error" in result) {
    if (result.error === "not-found") {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    if (result.error === "invalid-player") {
      return NextResponse.json(
        { error: "Player not in this event" },
        { status: 400 },
      );
    }
  } else {
    try {
      await publishFromServer(code, {
        kind: "host-changed",
        hostPlayerId: result.event.hostPlayerId,
        ts: Date.now(),
      });
    } catch (err) {
      console.error("[host-player] PubNub publish failed", err);
    }
    return NextResponse.json({ event: result.event });
  }

  return NextResponse.json({ error: "Unknown error" }, { status: 500 });
}
