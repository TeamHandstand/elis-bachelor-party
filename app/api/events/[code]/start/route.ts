import { NextResponse } from "next/server";
import { isHostAuthorized } from "@/lib/auth/host";
import { startEvent } from "@/lib/db/queries";
import { publishFromServer } from "@/lib/pubnub/server";
import { normalizeEventCode } from "@/lib/utils/code";
import type { StartEventResponse } from "@/lib/api/contract";

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

  const event = await startEvent(code);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  try {
    await publishFromServer(code, {
      kind: "event-state",
      status: "active",
      ts: Date.now(),
    });
  } catch (err) {
    console.error("[start] PubNub publish failed", err);
  }

  return NextResponse.json({ event });
}
