import { NextResponse } from "next/server";
import { z } from "zod";
import { isHostAuthorized } from "@/lib/auth/host";
import {
  resetEventProgress,
  resetEventToLobby,
} from "@/lib/db/queries";
import { publishFromServer } from "@/lib/pubnub/server";
import { normalizeEventCode } from "@/lib/utils/code";
import type { ResetEventResponse } from "@/lib/api/contract";

const BodySchema = z
  .object({
    mode: z.enum(["progress", "lobby"]),
  })
  .strict();

export async function POST(
  req: Request,
  { params }: { params: { code: string } },
): Promise<NextResponse<ResetEventResponse | { error: string }>> {
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

  const result =
    parsed.data.mode === "lobby"
      ? await resetEventToLobby(code)
      : await resetEventProgress(code);

  if (!result) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  try {
    await publishFromServer(code, {
      kind: "event-state",
      status: parsed.data.mode === "lobby" ? "lobby" : "active",
      ts: Date.now(),
    });
  } catch (err) {
    console.error("[reset] PubNub publish failed", err);
  }

  return NextResponse.json(result);
}
