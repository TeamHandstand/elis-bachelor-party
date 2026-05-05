"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteEvent, listEvents } from "./_fetch";
import type { ListEventsResponse } from "@/lib/api/contract";

interface Props {
  initial: ListEventsResponse["events"];
}

const POLL_INTERVAL_MS = 4000;

/**
 * Client-side wrapper around the events list that polls /api/host/events
 * every few seconds so LIVE / countdown markers stay fresh without a hard
 * refresh.
 *
 * Tapping a row always opens the host-mode editor (/host/[code]). To open the
 * player view, hit the "↗ Open" button which launches it in a new tab.
 */
export default function HostEventList({ initial }: Props) {
  const router = useRouter();
  const [events, setEvents] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const data = await listEvents();
        if (cancelled) return;
        setEvents(data.events);
      } catch {
        /* ignore — try again next tick */
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [router]);

  async function handleDelete(ev: ListEventsResponse["events"][number]) {
    const label = ev.title || ev.code;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Delete "${label}"? This wipes all teams, players, and progress for this event. This can't be undone.`,
      )
    ) {
      return;
    }
    setBusyId(ev.id);
    setError(null);
    try {
      await deleteEvent(ev.code);
      setEvents((prev) => prev.filter((e) => e.id !== ev.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete event");
    } finally {
      setBusyId(null);
    }
  }

  if (events.length === 0) {
    return (
      <div className="bg-bg-card rounded-xl2 p-8 text-center opacity-70">
        <div className="text-5xl mb-2">🌭</div>
        <div className="font-bold mb-1">No events yet</div>
        <div className="text-sm opacity-80">
          Hit “New event” to spin one up.
        </div>
      </div>
    );
  }

  const now = Date.now();

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-xl bg-accent-pink/15 border border-accent-pink/40 px-3 py-2 text-xs text-accent-pink">
          {error}
        </div>
      ) : null}
      <ul className="space-y-2">
        {events.map((ev) => {
          const isLive = ev.status === "active";
          const inCountdown =
            isLive &&
            ev.currentRoundStatus === "live" &&
            ev.currentRoundStartsAt !== null &&
            ev.currentRoundStartsAt > now;
          const inRound =
            isLive &&
            ev.currentRoundStatus === "live" &&
            ev.currentRoundStartsAt !== null &&
            ev.currentRoundStartsAt <= now;

          const isBusy = busyId === ev.id;

          return (
            <li
              key={ev.id}
              className={`rounded-xl2 p-3 transition-colors ${
                isLive
                  ? "bg-bg-card ring-2 ring-accent-pink/60"
                  : "bg-bg-card"
              } ${isBusy ? "opacity-50" : ""}`}
            >
              <div className="flex items-start gap-3">
                <Link
                  href={`/host/${ev.code}`}
                  className="flex-1 min-w-0 hover:opacity-90"
                  aria-label={`Edit ${ev.title || ev.code} as host`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display text-lg font-bold truncate">
                      {ev.title || "Untitled event"}
                    </span>
                    {inCountdown ? (
                      <span className="px-2 py-0.5 rounded-full bg-accent-orange text-bg text-[10px] uppercase tracking-widest font-extrabold animate-pulse">
                        ⏱ COUNTDOWN
                      </span>
                    ) : inRound ? (
                      <span className="px-2 py-0.5 rounded-full bg-accent-pink text-white text-[10px] uppercase tracking-widest font-extrabold animate-pulse">
                        ● LIVE
                      </span>
                    ) : isLive ? (
                      <span className="px-2 py-0.5 rounded-full bg-accent-green text-bg text-[10px] uppercase tracking-widest font-extrabold">
                        ACTIVE
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs opacity-60 mt-1">
                    <span className="font-bold tracking-widest text-accent-orange">
                      {ev.code}
                    </span>{" "}
                    · {new Date(ev.createdAt).toLocaleString()} · {ev.status}
                  </div>
                </Link>
                <span className="text-lg opacity-50 self-center">→</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <a
                  href={`/e/${ev.code}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-bg-deep border border-white/10 text-xs font-bold hover:border-accent-orange/60"
                >
                  ↗ Open game in new tab
                </a>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleDelete(ev)}
                  className="ml-auto px-3 py-1.5 rounded-xl bg-bg-deep border border-accent-pink/40 text-xs font-bold text-accent-pink hover:bg-accent-pink/10 disabled:opacity-50"
                  aria-label={`Delete ${ev.title || ev.code}`}
                >
                  {isBusy ? "deleting…" : "🗑 Delete"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
