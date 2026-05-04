import { NextResponse } from "next/server";
import { getResults } from "@/lib/db/queries";
import { normalizeEventCode } from "@/lib/utils/code";
import type { ResultsResponse } from "@/lib/api/contract";

export async function GET(
  _req: Request,
  { params }: { params: { code: string } },
): Promise<NextResponse<ResultsResponse | { error: string }>> {
  const code = normalizeEventCode(params.code);
  if (!code) {
    return NextResponse.json({ error: "Invalid event code" }, { status: 400 });
  }
  const result = await getResults(code);
  if (!result) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}
