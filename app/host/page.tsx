import { headers } from "next/headers";
import Link from "next/link";
import { isHostAuthorized } from "@/lib/auth/host";
import LoginForm from "@/components/host/LoginForm";
import NewEventButton from "@/components/host/NewEventButton";
import type { ListEventsResponse } from "@/lib/api/contract";

async function fetchEvents(): Promise<ListEventsResponse | null> {
  // SSR-side fetch — we have to pass the host cookie through manually.
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const cookie = h.get("cookie") ?? "";
  try {
    const res = await fetch(`${proto}://${host}/api/host/events`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ListEventsResponse;
  } catch {
    return null;
  }
}

export default async function HostHomePage() {
  if (!(await isHostAuthorized())) {
    return <LoginForm />;
  }

  const data = await fetchEvents();
  const events = data?.events ?? [];

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
          <div>
            <div className="text-5xl mb-2">🍕</div>
            <h1 className="font-display text-4xl font-extrabold tracking-wider">
              HOST PANEL
            </h1>
            <p className="opacity-60 text-sm">Toasty Pizza events</p>
          </div>
          <NewEventButton />
        </div>

        {events.length === 0 ? (
          <div className="bg-bg-card rounded-xl2 p-8 text-center opacity-70">
            <div className="text-5xl mb-2">🌭</div>
            <div className="font-bold mb-1">No events yet</div>
            <div className="text-sm opacity-80">
              Hit “New event” to spin one up.
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {events.map((ev) => (
              <li key={ev.id}>
                <Link
                  href={`/host/${ev.code}`}
                  className="flex items-center justify-between gap-3 bg-bg-card hover:bg-bg-deep rounded-xl2 p-4 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-display text-lg font-bold truncate">
                      {ev.title || "Untitled event"}
                    </div>
                    <div className="text-xs opacity-60">
                      <span className="font-bold tracking-widest text-accent-orange">
                        {ev.code}
                      </span>{" "}
                      · {new Date(ev.createdAt).toLocaleString()} · {ev.status}
                    </div>
                  </div>
                  <span className="opacity-50">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
