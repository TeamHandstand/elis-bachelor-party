import { NextResponse } from "next/server";
import { z } from "zod";
import { isHostAuthorized } from "@/lib/auth/host";
import { createEvent } from "@/lib/db/queries";
import type { CreateEventResponse } from "@/lib/api/contract";

const BodySchema = z
  .object({
    title: z.string().max(120).optional(),
    groomName: z.string().max(120).optional(),
    mode: z.enum(["heptathlon", "open"]).optional(),
  })
  .strict();

export async function POST(
  req: Request,
): Promise<NextResponse<CreateEventResponse | { error: string }>> {
  if (!(await isHostAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown = {};
  try {
    // Allow empty body; default to {}.
    const text = await req.text();
    json = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = await createEvent(parsed.data);
  return NextResponse.json(result, { status: 201 });
}
