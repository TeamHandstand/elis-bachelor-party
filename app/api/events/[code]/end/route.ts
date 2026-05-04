import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { isHostAuthorized } from "@/lib/auth/host";
import { normalizeEventCode } from "@/lib/utils/code";
import { publishFromServer } from "@/lib/pubnub/server";
import { getEventByCode } from "@/lib/db/queries";

export async function POST(_req: Request, { params }: { params: { code: string } }) {
  if (!(await isHostAuthorized())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const code = normalizeEventCode(params.code);
  const existing = await getEventByCode(code);
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Force-end the event (host-driven, no winner). Different from /finish which
  // is the atomic claim by a winning team.
  await db
    .update(schema.events)
    .set({ status: "finished", finishedAt: new Date() })
    .where(eq(schema.events.code, code));

  try {
    await publishFromServer(code, {
      kind: "event-state",
      status: "finished",
      ts: Date.now(),
    });
  } catch (err) {
    console.warn("[end] PubNub publish failed", err);
  }

  const refreshed = await getEventByCode(code);
  return NextResponse.json({ event: refreshed!.event });
}
