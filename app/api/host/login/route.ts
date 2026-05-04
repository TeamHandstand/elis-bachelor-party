import { NextResponse } from "next/server";
import { z } from "zod";
import { setHostCookie } from "@/lib/auth/host";
import type { HostLoginResponse } from "@/lib/api/contract";

const BodySchema = z.object({
  password: z.string().min(1),
});

export async function POST(req: Request): Promise<NextResponse<HostLoginResponse | { error: string }>> {
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

  const ok = await setHostCookie(parsed.data.password);
  return NextResponse.json({ ok }, { status: ok ? 200 : 401 });
}
