import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertPlayer } from "@/lib/db/queries";
import { publishFromServer } from "@/lib/pubnub/server";
import { normalizeEventCode } from "@/lib/utils/code";
import type { JoinEventResponse } from "@/lib/api/contract";

const BodySchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    deviceId: z.string().min(1).max(120),
  })
  .strict();

export async function POST(
  req: Request,
  { params }: { params: { code: string } },
): Promise<NextResponse<JoinEventResponse | { error: string }>> {
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

  const result = await upsertPlayer({
    code,
    name: parsed.data.name,
    deviceId: parsed.data.deviceId,
  });
  if (!result) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (result.created) {
    try {
      await publishFromServer(code, {
        kind: "player-joined",
        playerId: result.player.id,
        name: result.player.name,
        ts: Date.now(),
      });
    } catch (err) {
      console.error("[players] PubNub publish failed", err);
    }
  }

  return NextResponse.json({ player: result.player });
}
