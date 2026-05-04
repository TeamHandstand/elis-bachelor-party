import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isHostAuthorized } from "@/lib/auth/host";
import HostDashboard from "@/components/host/HostDashboard";
import type { GetEventResponse } from "@/lib/api/contract";

async function fetchEvent(code: string): Promise<GetEventResponse | null> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const cookie = h.get("cookie") ?? "";
  try {
    const res = await fetch(`${proto}://${host}/api/events/${code}`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as GetEventResponse;
  } catch {
    return null;
  }
}

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function HostEventPage({ params }: PageProps) {
  if (!(await isHostAuthorized())) {
    redirect("/host");
  }
  const { code } = await params;
  const data = await fetchEvent(code);

  if (!data) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl mb-3">🤷</div>
        <h1 className="font-display text-2xl font-bold mb-2">
          Event not found
        </h1>
        <p className="opacity-60 mb-4">
          Code <span className="font-mono">{code}</span> didn’t match anything.
        </p>
        <a href="/host" className="underline opacity-80">
          Back to host home
        </a>
      </main>
    );
  }

  return <HostDashboard initial={data} />;
}
