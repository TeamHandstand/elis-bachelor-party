import { NextResponse } from "next/server";
import { isHostAuthorized } from "@/lib/auth/host";
import { listEvents } from "@/lib/db/queries";
import type { ListEventsResponse } from "@/lib/api/contract";

export async function GET(): Promise<NextResponse<ListEventsResponse | { error: string }>> {
  if (!(await isHostAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const events = await listEvents();
  return NextResponse.json({ events });
}
